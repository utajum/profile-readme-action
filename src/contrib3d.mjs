// 3D contribution calendar, night-rainbow theme. Port of yoshi389111/github-profile-3d-contrib (MIT).
import { el, esc } from './svg.mjs';
import { PAGE } from './github.mjs';

const BG = '#00000f';
const FG = '#eeeeff';
const STRONG = 'rgb(255,200,55)';
const WEAK = '#aaaaaa';
const LIGHTNESS = [0.2, 0.3, 0.35, 0.4, 0.5];
const LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const WIDTH = 1280;
const HEIGHT = 850;
const ANGLE = 30;

const toFixed = (v) => +v.toFixed(2);
const fade = '3s';

// hsl(h, 50%, l) darkened like d3.rgb(...).darker(k)
function hslRgb(h, l, darker) {
  h = (h % 360) + (h < 0) * 360;
  const s = 0.5;
  const m2 = l + (l < 0.5 ? l : 1 - l) * s;
  const m1 = 2 * l - m2;
  const f = (x) => (x < 60 ? m1 + ((m2 - m1) * x) / 60 : x < 180 ? m2 : x < 240 ? m1 + ((m2 - m1) * (240 - x)) / 60 : m1) * 255;
  const k = Math.pow(0.7, darker);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k) || 0));
  return `rgb(${c(f(h >= 240 ? h - 240 : h + 120))}, ${c(f(h))}, ${c(f(h < 120 ? h + 240 : h - 120))})`;
}

const rainbow = (level, darker, week) => el('animate', {
  attributeName: 'fill',
  values: [0, 1, 2, 3, 4, 5, 6].map((i) => hslRgb((i * 60 + week * -7) % 360, LIGHTNESS[level], darker)).join(';'),
  dur: '10s',
  repeatCount: 'indefinite',
});

function calendar3d(days) {
  const startTime = days[0].date.getTime();
  const dx = WIDTH / 64;
  const dy = dx * Math.tan(ANGLE * ((2 * Math.PI) / 360));
  const weekcount = Math.ceil(days.length / 7.0);
  const dxx = dx * 0.9;
  const dyy = dy * 0.9;
  const offsetX = dx * 7;
  const offsetY = HEIGHT - (weekcount + 7) * dy;
  const skewX = toFixed((Math.atan(dxx / 2 / dyy) * 360) / 2 / Math.PI);
  const scaleSide = Math.sqrt(dxx ** 2 + dyy ** 2) / dxx;

  return el('g', {}, ...days.map((cal) => {
    const dayOfWeek = cal.date.getUTCDay();
    const week = Math.floor(Math.floor((cal.date.getTime() - startTime) / 86400000) / 7);
    const baseX = offsetX + (week - dayOfWeek) * dx;
    const baseY = offsetY + (week + dayOfWeek) * dy;
    const calHeight = Math.log10(cal.contributionCount / 20 + 1) * 144 + 3;
    const level = cal.contributionLevel;
    const grow = level !== 0;
    const sideHeight = calHeight / scaleSide;
    const growSide = grow ? el('animate', { attributeName: 'height', values: `${toFixed(3 / scaleSide)};${toFixed(sideHeight)}`, dur: fade, repeatCount: '1' }) : '';
    const side = (transform, darker) => el('rect', {
      stroke: 'none', x: 0, y: 0, width: toFixed(dxx), height: toFixed(sideHeight),
      transform: `${transform}scale(${toFixed(1)} ${toFixed(scaleSide)})`,
    }, rainbow(level, darker, week), growSide);

    return el('g', { transform: `translate(${toFixed(baseX)} ${toFixed(baseY - calHeight)})` },
      grow ? el('animateTransform', {
        attributeName: 'transform', type: 'translate',
        values: `${toFixed(baseX)} ${toFixed(baseY - 3)};${toFixed(baseX)} ${toFixed(baseY - calHeight)}`,
        dur: fade, repeatCount: '1',
      }) : '',
      el('rect', {
        stroke: 'none', x: 0, y: 0, width: toFixed(dxx), height: toFixed(dxx),
        transform: `skewY(${-ANGLE}) skewX(${skewX}) scale(${toFixed(1)} ${toFixed((2 * dyy) / dxx)})`,
      }, rainbow(level, 0, week)),
      side(`skewY(${ANGLE}) `, 0.5),
      side(`translate(${toFixed(dxx)} ${toFixed(dyy)}) skewY(${-ANGLE}) `, 1),
    );
  }));
}

function radarChart(info) {
  const width = 400 * 1.3;
  const height = (width * 3) / 4;
  const x = WIDTH - width - 40;
  const y = 70;
  const labels = ['1', '10', '100', '1K', '10K'];
  const levels = labels.length;
  const radius = (height / 2) * 0.8;
  const data = [
    ['Commit', info.totalCommitContributions],
    ['Issue', info.totalIssueContributions],
    ['PullReq', info.totalPullRequestContributions],
    ['Review', info.totalPullRequestReviewContributions],
    ['Repo', info.totalRepositoryContributions],
  ];
  const n = data.length;
  const rad = 2 * Math.PI;
  const posX = (level, i) => toFixed(radius * (level / levels) * Math.sin((i / n) * rad));
  const posY = (level, i) => toFixed(radius * (level / levels) * -Math.cos((i / n) * rad));
  const toLevel = (v) => (v < 1 ? 0.8 : Math.min(Math.log10(v), 5) + 1);
  const dash = `stroke: ${WEAK}; stroke-dasharray: 4 4; stroke-width: 1px;`;
  const poly = (lv) => data.map((d, i) => `${posX(lv(d[1]), i)},${posY(lv(d[1]), i)}`).join(' ');
  const points = poly(toLevel);

  const grid = [];
  for (let j = 1; j <= levels; j++) {
    for (let i = 0; i < n; i++) grid.push(el('line', { x1: posX(j, i), y1: posY(j, i), x2: posX(j, i + 1), y2: posY(j, i + 1), style: dash }));
  }
  return el('g', { transform: `translate(${toFixed(x + width / 2)}, ${toFixed(y + (height / 2) * 1.1)})` },
    ...grid,
    ...labels.map((t, i) => el('text', {
      style: `font-size: ${toFixed(radius / 12)}px;`, 'text-anchor': 'start', 'dominant-baseline': 'auto',
      x: toFixed(radius / 50), y: toFixed(-radius * ((i + 1) / levels)), fill: WEAK,
    }, t)),
    ...data.map(([name, value], i) => el('g', { class: 'axis' },
      el('line', { x1: posX(1, i), y1: posY(1, i), x2: posX(levels, i), y2: posY(levels, i), style: dash }),
      el('text', {
        style: `font-size: ${toFixed(radius / 7.5)}px;`, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        x: posX(1.25 * levels, i), y: posY(1.17 * levels, i), fill: FG,
      }, name, el('title', {}, value)),
    )),
    el('polygon', { style: `stroke-width: 4px; stroke: ${STRONG}; fill: ${STRONG}; fill-opacity: 0.5;`, points },
      el('animate', { attributeName: 'points', values: `${poly(() => toLevel(0))};${points}`, dur: fade, repeatCount: '1' })),
  );
}

// d3.arc() annulus sector, angles clockwise from 12 o'clock
function arc(r1, r0, start, end) {
  const a0 = start - Math.PI / 2;
  const a1 = end - Math.PI / 2;
  const da = Math.abs(a1 - a0);
  const p = (r, a) => `${r * Math.cos(a)},${r * Math.sin(a)}`;
  if (da > 2 * Math.PI - 1e-12) {
    const full = (r, from, sweep) => `M${p(r, from)}A${r},${r},0,1,${sweep},${p(r, from + Math.PI)}A${r},${r},0,1,${sweep},${p(r, from)}`;
    return `${full(r1, a0, 1)}${full(r0, a1, 0)}Z`;
  }
  const large = da >= Math.PI ? 1 : 0;
  return `M${p(r1, a0)}A${r1},${r1},0,${large},1,${p(r1, a1)}L${p(r0, a1)}A${r0},${r0},0,${large},0,${p(r0, a0)}Z`;
}

function pieChart(info) {
  const height = 200 * 1.3;
  const langs = info.languages.slice(0, 5);
  const other = info.totalCommitContributions - langs.reduce((s, l) => s + l.contributions, 0);
  if (other > 0) langs.push({ language: 'other', color: '#444444', contributions: other });

  const steps = 5;
  const opacity = (num) => Array.from({ length: langs.length + steps }, (_, i) => (i < num ? 0 : Math.min((i - num) / steps, 1))).join(';');
  const appear = (i) => el('animate', { attributeName: 'fill-opacity', values: opacity(i), dur: fade, repeatCount: '1' });
  const radius = height / 2;
  const row = 8;
  const offset = (row - langs.length) / 2 + 0.5;
  const fontSize = height / row / 1.5;
  const sum = langs.reduce((s, l) => s + (l.contributions > 0 ? l.contributions : 0), 0);
  const k = sum ? (2 * Math.PI) / sum : 0;
  let a0 = 0;
  const arcs = langs.map((l) => {
    const a1 = a0 + (l.contributions > 0 ? l.contributions * k : 0);
    const d = arc(radius - radius / 10, radius / 2, a0, a1);
    a0 = a1;
    return d;
  });

  return el('g', { transform: `translate(40, ${HEIGHT - height - 70})` },
    el('g', { transform: `translate(${radius * 2.1}, 0)` },
      ...langs.map((l, i) => el('rect', {
        x: 0, y: (i + offset) * (height / row) - fontSize / 2, width: fontSize, height: fontSize,
        fill: l.color, stroke: BG, 'stroke-width': '1px',
      }, appear(i))),
      ...langs.map((l, i) => el('text', {
        'dominant-baseline': 'middle', x: fontSize * 1.2, y: (i + offset) * (height / row), fill: FG, 'font-size': `${fontSize}px`,
      }, esc(l.language), appear(i))),
    ),
    el('g', { transform: `translate(${radius}, ${radius})` },
      ...langs.map((l, i) => el('path', { d: arcs[i], style: `fill: ${l.color};`, stroke: BG, 'stroke-width': '2px' },
        el('title', {}, esc(`${l.language} ${l.contributions}`)), appear(i))),
    ),
  );
}

const STAR = 'M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25zm0 2.445L6.615 5.5a.75.75 0 01-.564.41l-3.097.45 2.24 2.184a.75.75 0 01.216.664l-.528 3.084 2.769-1.456a.75.75 0 01.698 0l2.77 1.456-.53-3.084a.75.75 0 01.216-.664l2.24-2.183-3.096-.45a.75.75 0 01-.564-.41L8 2.694v.001z';
const FORK = 'M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 100-1.5.75.75 0 000 1.5z';

const scale = (v) => (v <= 9999 ? v.toFixed(0) : v <= 999999 ? `${Math.floor(v / 1000).toFixed(0)}K` : '1M+');
const thousands = (v) => (v <= 9999 ? v.toFixed(0) : v.toFixed(0).replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1 '));

function footer(info, days) {
  const y = HEIGHT - 20;
  const big = 'font-size: 32px; font-weight: bold;';
  const icon = (x, d) => el('g', { transform: `translate(${x - 32}, ${y - 28}), scale(2)` }, el('path', { 'fill-rule': 'evenodd', d, fill: FG }));
  const iso = (d) => d.toISOString().substring(0, 10);
  return el('g', {},
    el('text', { style: big, x: (WIDTH * 3) / 10, y, 'text-anchor': 'end', fill: STRONG }, thousands(info.totalContributions)),
    el('text', { style: 'font-size: 24px;', x: (WIDTH * 3) / 10 + 10, y, 'text-anchor': 'start', fill: FG }, 'contributions'),
    icon((WIDTH * 5) / 10, STAR),
    el('text', { style: big, x: (WIDTH * 5) / 10 + 10, y, 'text-anchor': 'start', fill: FG }, scale(info.stars), el('title', {}, info.stars)),
    icon((WIDTH * 6) / 10, FORK),
    el('text', { style: big, x: (WIDTH * 6) / 10 + 4, y, 'text-anchor': 'start', fill: FG }, scale(info.forks), el('title', {}, info.forks)),
    el('text', { style: 'font-size: 16px;', x: WIDTH - 20, y: 20, 'dominant-baseline': 'hanging', 'text-anchor': 'end', fill: WEAK },
      `${iso(days[0].date)} / ${iso(days[days.length - 1].date)}`),
  );
}

export async function contrib3dSvg({ gql, paginate }, login) {
  const c = (await gql(
    `query($login:String!){ user(login:$login) { contributionsCollection {
      contributionCalendar { totalContributions weeks { contributionDays { contributionCount contributionLevel date } } }
      commitContributionsByRepository(maxRepositories:100) { repository { primaryLanguage { name color } } contributions { totalCount } }
      totalCommitContributions totalIssueContributions totalPullRequestContributions totalPullRequestReviewContributions totalRepositoryContributions
    } } }`,
    { login },
  )).user.contributionsCollection;
  const repos = await paginate(
    `query($login:String!,$after:String){ user(login:$login) { repositories(first:100, after:$after, ownerAffiliations:OWNER) { nodes { forkCount stargazerCount } ${PAGE} } } }`,
    { login }, (d) => d.user.repositories,
  );

  const days = c.contributionCalendar.weeks.flatMap((w) => w.contributionDays).map((d) => ({
    contributionCount: d.contributionCount,
    contributionLevel: LEVELS[d.contributionLevel],
    date: new Date(d.date),
  }));
  const byLang = new Map();
  for (const r of c.commitContributionsByRepository) {
    const lang = r.repository.primaryLanguage;
    if (!lang) continue;
    const info = byLang.get(lang.name) || { language: lang.name, color: lang.color || '#444444', contributions: 0 };
    info.contributions += r.contributions.totalCount;
    byLang.set(lang.name, info);
  }
  const info = {
    ...c,
    totalContributions: c.contributionCalendar.totalContributions,
    languages: [...byLang.values()].sort((a, b) => b.contributions - a.contributions),
    stars: repos.reduce((s, r) => s + r.stargazerCount, 0),
    forks: repos.reduce((s, r) => s + r.forkCount, 0),
  };

  return el('svg', { xmlns: 'http://www.w3.org/2000/svg', width: WIDTH, height: HEIGHT, viewBox: `0 0 ${WIDTH} ${HEIGHT}` },
    el('style', {}, '* { font-family: "Ubuntu", "Helvetica", "Arial", sans-serif; }'),
    el('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, fill: BG }),
    days.length ? calendar3d(days) : '',
    radarChart(info),
    info.totalContributions ? pieChart(info) : '',
    days.length ? footer(info, days) : '',
  );
}
