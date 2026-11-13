// README stats section, same layout as waka-readme-stats text mode (GitHub data only).
import { PAGE } from './github.mjs';

const POOL = 4;
const REPO_FIELDS = 'nameWithOwner isFork isPrivate primaryLanguage { name }';

export async function statsSection({ gql, paginate }, login, timeZone, log) {
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
  const commits = await commitDates(gql, user.id, [...repos.values()], log);
  return render({ commits, repos, diskKB, publicRepos, privateRepos, contrib, year, timeZone, log });
}

// Commits by the user on each default branch: oid -> committedDate
async function commitDates(gql, userId, repos, log) {
  const commits = new Map();
  async function scanRepo(repo) {
    const [owner, name] = repo.nameWithOwner.split('/');
    try {
      let after = null;
      do {
        const d = await gql(
          `query($owner:String!,$name:String!,$id:ID!,$after:String){ repository(owner:$owner,name:$name){ defaultBranchRef { target { ... on Commit { history(first:100, after:$after, author:{id:$id}) { nodes { oid committedDate } ${PAGE} } } } } } }`,
          { owner, name, id: userId, after },
        );
        const h = d.repository.defaultBranchRef?.target?.history;
        if (!h) break;
        for (const c of h.nodes) commits.set(c.oid, c.committedDate);
        after = h.pageInfo.hasNextPage ? h.pageInfo.endCursor : null;
      } while (after);
    } catch (e) {
      // Logs are public: hide private repo names
      log(repo.isPrivate ? 'skip [private]' : `skip ${repo.nameWithOwner}: ${e.message.slice(0, 160)}`);
    }
  }

  const queue = [...repos];
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
  const topLangs = [...langs].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

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
