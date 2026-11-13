// README stats section, same layout as waka-readme-stats text mode (GitHub data only).
import { PAGE } from './github.mjs';

const BATCH = 50;
const POOL = 4;
const REPO_FIELDS = 'nameWithOwner isFork primaryLanguage { name }';

export async function statsSection({ raw, gql, paginate }, login, timeZone, log) {
  const user = (await gql('query($login:String!){ user(login:$login) { id } }', { login })).user;
  const year = new Date().getUTCFullYear();

  // Owned repos: counts and storage
  const owned = await paginate(
    `query($login:String!,$after:String){ user(login:$login) { repositories(first:100, after:$after, ownerAffiliations:[OWNER]) { nodes { diskUsage isFork isPrivate } ${PAGE} } } }`,
    { login }, (d) => d.user.repositories,
  );
  const diskKB = owned.filter((r) => !r.isFork).reduce((s, r) => s + (r.diskUsage || 0), 0);
  const publicRepos = owned.filter((r) => !r.isPrivate).length;
  const privateRepos = owned.length - publicRepos;

  const contrib = (await gql(
    'query($login:String!,$from:DateTime!){ user(login:$login) { contributionsCollection(from:$from) { contributionCalendar { totalContributions } } } }',
    { login, from: `${year}-01-01T00:00:00Z` },
  )).user.contributionsCollection.contributionCalendar.totalContributions;

  // Repo set: own + collaborator + contributed, no forks
  const mine = await paginate(
    `query($login:String!,$after:String){ user(login:$login) { repositories(first:100, after:$after, affiliations:[OWNER, COLLABORATOR], isFork:false) { nodes { ${REPO_FIELDS} } ${PAGE} } } }`,
    { login }, (d) => d.user.repositories,
  );
  const contributed = await paginate(
    `query($login:String!,$after:String){ user(login:$login) { repositoriesContributedTo(first:100, after:$after, includeUserRepositories:true) { nodes { ${REPO_FIELDS} } ${PAGE} } } }`,
    { login }, (d) => d.user.repositoriesContributedTo,
  );
  const repos = new Map();
  for (const r of [...mine, ...contributed]) if (r && !r.isFork && !repos.has(r.nameWithOwner)) repos.set(r.nameWithOwner, r);
  const commits = await commitDates({ raw, gql }, user.id, [...repos.keys()], log);
  return render({ commits, repos, diskKB, publicRepos, privateRepos, contrib, year, timeZone, log });
}

// Commits by the user on all branches, deduped by oid: oid -> committedDate.
// Default branch: author-filtered history. Other branches: commits ahead of default.
export async function commitDates({ raw, gql }, userId, names, log) {
  const commits = new Map();
  const add = (nodes) => { for (const c of nodes) commits.set(c.oid, c.committedDate); };
  const byUser = (nodes) => nodes.filter((c) => c.author?.user?.id === userId);
  const COMMIT = 'oid committedDate author { user { id } }';

  async function history(owner, name, branch) {
    let after = null;
    do {
      const d = await gql(
        `query($owner:String!,$name:String!,$q:String!,$id:ID!,$after:String){ repository(owner:$owner,name:$name){ ref(qualifiedName:$q){ target { ... on Commit { history(first:100, after:$after, author:{id:$id}) { nodes { oid committedDate } ${PAGE} } } } } } }`,
        { owner, name, q: `refs/heads/${branch}`, id: userId, after },
      );
      const h = d.repository.ref?.target?.history;
      if (!h) return;
      add(h.nodes);
      after = h.pageInfo.hasNextPage ? h.pageInfo.endCursor : null;
    } while (after);
  }

  async function ahead(owner, name, base, branch, cmp) {
    let { nodes, pageInfo } = cmp.commits;
    let seen = nodes.length;
    add(byUser(nodes));
    while (pageInfo.hasNextPage) {
      const d = await gql(
        `query($owner:String!,$name:String!,$base:String!,$head:String!,$after:String){ repository(owner:$owner,name:$name){ ref(qualifiedName:$base){ compare(headRef:$head) { commits(first:100, after:$after) { nodes { ${COMMIT} } ${PAGE} } } } } }`,
        { owner, name, base: `refs/heads/${base}`, head: `refs/heads/${branch}`, after: pageInfo.endCursor },
      );
      ({ nodes, pageInfo } = d.repository.ref.compare.commits);
      seen += nodes.length;
      add(byUser(nodes));
    }
    if (seen < cmp.aheadBy) await history(owner, name, branch);
  }

  async function compareBatch(owner, name, base, branches) {
    const defs = branches.map((_, i) => `$h${i}:String!`).join(',');
    const body = branches.map((_, i) => `c${i}: compare(headRef:$h${i}) { aheadBy commits(first:100) { nodes { ${COMMIT} } ${PAGE} } }`).join(' ');
    const vars = { owner, name, base: `refs/heads/${base}` };
    branches.forEach((b, i) => { vars[`h${i}`] = `refs/heads/${b}`; });
    let res;
    try {
      res = await raw(`query($owner:String!,$name:String!,$base:String!,${defs}){ repository(owner:$owner,name:$name){ ref(qualifiedName:$base){ ${body} } } }`, vars, 2);
    } catch (e) {
      if (branches.length > 1) {
        const mid = Math.ceil(branches.length / 2);
        await compareBatch(owner, name, base, branches.slice(0, mid));
        return compareBatch(owner, name, base, branches.slice(mid));
      }
      res = { data: null };
    }
    for (let i = 0; i < branches.length; i++) {
      const cmp = res.data?.repository?.ref?.[`c${i}`];
      try {
        // No merge base or failed compare: scan the branch history
        if (cmp) await ahead(owner, name, base, branches[i], cmp);
        else await history(owner, name, branches[i]);
      } catch (e) { log(`skip ${owner}/${name}@${branches[i]}: ${e.message.slice(0, 120)}`); }
    }
  }

  let done = 0;
  async function scanRepo(full) {
    const [owner, name] = full.split('/');
    try {
      let def = null;
      const refs = [];
      let after = null;
      do {
        const d = await gql(
          `query($owner:String!,$name:String!,$after:String){ repository(owner:$owner,name:$name){ defaultBranchRef { name target { oid } } refs(refPrefix:"refs/heads/", first:100, after:$after) { nodes { name target { oid } } ${PAGE} } } }`,
          { owner, name, after },
        );
        def = d.repository.defaultBranchRef;
        refs.push(...d.repository.refs.nodes);
        after = d.repository.refs.pageInfo.hasNextPage ? d.repository.refs.pageInfo.endCursor : null;
      } while (after);
      if (!def) return;
      await history(owner, name, def.name);
      // Branches with the same tip have the same commits
      const seen = new Set([def.target.oid]);
      const branches = refs.filter((r) => !seen.has(r.target.oid) && seen.add(r.target.oid)).map((r) => r.name);
      for (let i = 0; i < branches.length; i += BATCH) await compareBatch(owner, name, def.name, branches.slice(i, i + BATCH));
      log(`${++done}/${names.length} ${full} (${branches.length + 1} branches) commits: ${commits.size}`);
    } catch (e) { log(`skip ${full}: ${e.message.slice(0, 160)}`); }
  }

  const queue = [...names];
  await Promise.all(Array.from({ length: POOL }, async () => { while (queue.length) await scanRepo(queue.shift()); }));
  return commits;
}

function render({ commits, repos, diskKB, publicRepos, privateRepos, contrib, year, timeZone, log }) {
  // Bucket by local time
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23', weekday: 'short' });
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayTimes = [0, 0, 0, 0]; // 0-6, 6-12, 12-18, 18-24
  const weekDays = [0, 0, 0, 0, 0, 0, 0];
  for (const date of commits.values()) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(date)).map((x) => [x.type, x.value]));
    dayTimes[Math.floor(Number(p.hour) / 6)]++;
    weekDays[WD.indexOf(p.weekday)]++;
  }
  const dt = [...dayTimes.slice(1), dayTimes[0]]; // Morning, Daytime, Evening, Night

  // Languages: primary language per repo
  const langs = new Map();
  let withLang = 0;
  for (const r of repos.values()) {
    if (!r.primaryLanguage) continue;
    withLang++;
    langs.set(r.primaryLanguage.name, (langs.get(r.primaryLanguage.name) || 0) + 1);
  }
  const topLangs = [...langs].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const len = (s) => [...s].length;
  const pct = (n, total) => (total ? Math.round((n / total) * 10000) / 100 : 0);
  const bar = (p) => { const n = Math.round(Math.max(0, Math.min(100, p)) / 4); return '\u2588'.repeat(n) + '\u2591'.repeat(25 - n); };
  const row = (n, t, p) => `${n}${' '.repeat(Math.max(0, 25 - len(n)))}${t}${' '.repeat(Math.max(0, 20 - len(t)))}${bar(p)}   ${p.toFixed(2).padStart(5, '0')} % `;
  const list = (rows) => rows.map((r) => row(...r)).join('\n');
  const size = (bytes) => { const u = ['Bytes', 'kB', 'MB', 'GB', 'TB']; let i = 0; while (bytes >= 1000 && i < u.length - 1) { bytes /= 1000; i++; } return `${bytes.toFixed(1)} ${u[i]}`; };

  const sumDay = dt.reduce((a, b) => a + b, 0);
  const sumWeek = weekDays.reduce((a, b) => a + b, 0);
  const dtNames = ['\u{1F31E} Morning', '\u{1F306} Daytime', '\u{1F303} Evening', '\u{1F319} Night'];
  const wdNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const wdPct = weekDays.map((n) => pct(n, sumWeek));
  const early = dt[0] + dt[1] >= dt[2] + dt[3];
  const now = new Date().toISOString();
  const stamp = `${now.slice(8, 10)}/${now.slice(5, 7)}/${now.slice(0, 4)} ${now.slice(11, 19)}`;

  log(`stats: repos ${repos.size}, commits ${commits.size}, storage KB ${diskKB}, public ${publicRepos}, private ${privateRepos}, contributions ${year}: ${contrib}`);
  return [
    '<!--START_SECTION:waka-->',
    '',
    '**\u{1F431} My GitHub Data** ',
    '',
    `> \u{1F4E6} ${size(diskKB * 1024)} Used in GitHub's Storage `,
    ' > ',
    `> \u{1F3C6} ${contrib.toLocaleString('en-US')} Contributions in the Year ${year}`,
    ' > ',
    `> \u{1F4DC} ${publicRepos} Public Repositor${publicRepos === 1 ? 'y' : 'ies'} `,
    ' > ',
    `> \u{1F511} ${privateRepos} Private Repositor${privateRepos === 1 ? 'y' : 'ies'} `,
    ' > ',
    `**${early ? "I'm an Early \u{1F424}" : "I'm a Night \u{1F989}"}** `,
    '',
    '```text',
    list(dt.map((n, i) => [dtNames[i], `${n} commits`, pct(n, sumDay)])),
    '```',
    `\u{1F4C5} **I'm Most Productive on ${wdNames[wdPct.indexOf(Math.max(...wdPct))]}** `,
    '',
    '```text',
    list(weekDays.map((n, i) => [wdNames[i], `${n} commits`, wdPct[i]])),
    '```',
    '',
    '',
    `**I Mostly Code in ${topLangs[0]?.[0]}** `,
    '',
    '```text',
    list(topLangs.map(([l, n]) => [l, `${n} ${n === 1 ? 'repo' : 'repos'}`, pct(n, withLang)])),
    '```',
    '',
    '',
    '',
    '',
    ` Last Updated on ${stamp} UTC`,
    '<!--END_SECTION:waka-->',
  ].join('\n');
}
