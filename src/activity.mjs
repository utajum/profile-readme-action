// 31-day activity line chart. Port of Ashutosh00710/github-readme-activity-graph (MIT),
// chart layout from Chartist line chart (MIT). Fixed style: area, no border, custom colors.
import { el, esc } from './svg.mjs';

const W = 1200;
const H = 420;
const DAYS = 31;
// Chart rect: padding (top 80, right 50, bottom 20, left 20) plus axis offsets (y 70, x 50)
const X1 = 90;
const X2 = 1150;
const Y1 = 350;
const Y2 = 80;
const COLOR = '7fa1f7';
const LINE = 'f77f7f';
const POINT = 'f7ab7f';
const AREA = '9e4c98';

const STYLE = `
.header { font: 600 20px 'Segoe UI', Ubuntu, Sans-Serif; text-align: center; color: #${COLOR}; margin-top: 20px; }
svg { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; }
.ct-label { fill: #${COLOR}; font-size: .75rem; }
.ct-line { fill: none; stroke-width: 4px; stroke-dasharray: 5000; stroke-dashoffset: 5000; stroke: #${LINE}; animation: dash 5s ease-in-out forwards; }
.ct-label.ct-horizontal.ct-end { text-anchor: start; }
.ct-label.ct-vertical.ct-start { text-anchor: end; }
.ct-grid { stroke: #${COLOR}; stroke-width: 1px; stroke-opacity: 0.3; stroke-dasharray: 2px; }
.ct-point { stroke-width: 10px; stroke-linecap: round; stroke: #${POINT}; animation: blink 1s ease-in-out forwards; }
.ct-area { stroke: none; fill-opacity: 0.1; }
.ct-series-a .ct-area { fill: #${AREA}; }
@keyframes blink { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
@keyframes dash { to { stroke-dashoffset: 0; } }
`;

// Chartist.getBounds with low 0, scaleMinSpace 20, onlyInteger
function yTicks(high, length) {
  if (high <= 0) high = 1;
  const EPS = 2.221e-16;
  const inc = (v, d) => (v === v + d ? v * (1 + (d > 0 ? EPS : -EPS)) : v + d);
  const proj = (len, range) => (len / range) * length;
  const rho = (num) => {
    if (num === 1) return num;
    if (num % 2 === 0) return 2;
    const gcd = (p, q) => (p % q === 0 ? q : gcd(q, p % q));
    let x1 = 2, x2 = 2, d;
    do {
      x1 = (x1 * x1 + 1) % num;
      x2 = (((x2 * x2 + 1) ** 2) + 1) % num;
      d = gcd(Math.abs(x1 - x2), num);
    } while (d === 1);
    return d;
  };
  let step = Math.pow(10, Math.floor(Math.log(high) / Math.LN10));
  let min = 0;
  let max = Math.ceil(high / step) * step;
  const range = max - min;
  const scaleUp = proj(step, range) < 20;
  const smallest = rho(range);
  if (proj(1, range) >= 20) step = 1;
  else if (smallest < step && proj(smallest, range) >= 20) step = smallest;
  else {
    for (;;) {
      if (scaleUp && proj(step, range) <= 20) step *= 2;
      else if (!scaleUp && proj(step / 2, range) >= 20) {
        step /= 2;
        if (step % 1 !== 0) { step *= 2; break; }
      } else break;
    }
  }
  while (min + step <= 0) min = inc(min, step);
  while (max - step >= high) max = inc(max, -step);
  const ticks = [];
  for (let v = min; v <= max; v = inc(v, step)) {
    const r = Math.round(v * 1e8) / 1e8;
    if (r !== ticks[ticks.length - 1]) ticks.push(r);
  }
  return { min, range: max - min, ticks };
}

// Chartist monotone cubic interpolation, rounded to 3 decimals
function linePath(xs, ys) {
  const n = xs.length;
  const r = (v) => Math.round(v * 1000) / 1000;
  if (n < 3) return { start: `${r(xs[0])},${r(ys[0])}`, curve: xs.slice(1).map((x, i) => `L${r(x)},${r(ys[i + 1])}`).join('') };
  const dxs = [], ds = [], ms = [];
  for (let i = 0; i < n - 1; i++) { dxs[i] = xs[i + 1] - xs[i]; ds[i] = (ys[i + 1] - ys[i]) / dxs[i]; }
  ms[0] = ds[0];
  ms[n - 1] = ds[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (ds[i] === 0 || ds[i - 1] === 0 || (ds[i - 1] > 0) !== (ds[i] > 0)) ms[i] = 0;
    else {
      ms[i] = (3 * (dxs[i - 1] + dxs[i])) / ((2 * dxs[i] + dxs[i - 1]) / ds[i - 1] + (dxs[i] + 2 * dxs[i - 1]) / ds[i]);
      if (!isFinite(ms[i])) ms[i] = 0;
    }
  }
  let d = '';
  for (let i = 0; i < n - 1; i++) {
    d += `C${[xs[i] + dxs[i] / 3, ys[i] + (ms[i] * dxs[i]) / 3, xs[i + 1] - dxs[i] / 3, ys[i + 1] - (ms[i + 1] * dxs[i]) / 3, xs[i + 1], ys[i + 1]].map(r).join(',')}`;
  }
  return { start: `${r(xs[0])},${r(ys[0])}`, curve: d };
}

function chart(labels, values) {
  const step = (X2 - X1) / (labels.length - 1);
  const y = yTicks(Math.max(...values), Y1 - Y2);
  const projY = (v) => ((Y1 - Y2) * (v - y.min)) / y.range;
  const xs = labels.map((_, i) => X1 + step * i);
  const ys = values.map((v) => Y1 - projY(v));
  const r = (v) => Math.round(v * 1000) / 1000;
  const base = r(Y1 - projY(0));
  const { start, curve } = linePath(xs, ys);
  const len = (ps, i, total) => (i < ps.length - 1 ? ps[i + 1] - ps[i] : Math.max(total - ps[i], 30));
  const px = labels.map((_, i) => step * i);
  const py = y.ticks.map(projY);

  return el('svg', { 'xmlns:ct': 'http://gionkunz.github.com/chartist-js/ct', width: W, height: H, class: 'ct-chart-line' },
    el('g', { class: 'ct-grids' },
      ...px.map((p) => el('line', { x1: X1 + p, x2: X1 + p, y1: Y2, y2: Y1, class: 'ct-grid ct-horizontal' })),
      ...py.map((p) => el('line', { y1: Y1 - p, y2: Y1 - p, x1: X1, x2: X2, class: 'ct-grid ct-vertical' })),
    ),
    el('g', {}, el('g', { class: 'ct-series ct-series-a' },
      el('path', { d: `M${r(xs[0])},${base}L${start}${curve}L${r(xs[xs.length - 1])},${base}Z`, class: 'ct-area' }),
      el('path', { d: `M${start}${curve}`, class: 'ct-line' }),
      ...xs.map((x, i) => el('line', { x1: x, y1: ys[i], x2: x + 0.01, y2: ys[i], class: 'ct-point', 'ct:value': values[i] })),
    )),
    el('g', { class: 'ct-labels' },
      ...labels.map((t, i) => el('text', { x: X1 + px[i] - 4.5, y: Y1 + 20, width: len(px, i, X2 - X1), height: 40, class: 'ct-label ct-horizontal ct-end' }, esc(t))),
      ...y.ticks.map((t, i) => el('text', { y: Y1 - py[i] + 4.5, x: X1 - 10, height: len(py, i, Y1 - Y2), width: 60, class: 'ct-label ct-vertical ct-start' }, t)),
    ),
    el('text', { class: 'ct-axis-title ct-label', x: (X1 + X2) / 2, y: H - 20, 'dominant-baseline': 'text-after-edge', 'text-anchor': 'middle' }, 'Days'),
    el('text', { class: 'ct-axis-title ct-label', x: 20, y: (Y1 + Y2) / 2, transform: `rotate(-90, 20, ${(Y1 + Y2) / 2})`, 'dominant-baseline': 'hanging', 'text-anchor': 'middle' }, 'Contributions'),
  );
}

export async function activitySvg({ gql }, login) {
  const now = Date.now();
  const user = (await gql(
    'query($login:String!,$from:DateTime!,$to:DateTime!){ user(login:$login) { name contributionsCollection(from:$from, to:$to) { contributionCalendar { weeks { contributionDays { contributionCount date } } } } } }',
    { login, from: new Date(now - DAYS * 86400000).toISOString(), to: new Date(now + 86400000).toISOString() },
  )).user;
  const days = user.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  // Drop today if it has no contributions yet
  if (days.length && days[days.length - 1].contributionCount === 0) days.pop();
  days.splice(0, days.length - DAYS);

  const title = `${user.name ?? login}'s Contribution Graph`;
  return el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, fill: 'none', xmlns: 'http://www.w3.org/2000/svg' },
    el('style', {}, STYLE),
    el('foreignObject', { x: 0, y: 0, width: W, height: 50 }, el('h1', { xmlns: 'http://www.w3.org/1999/xhtml', class: 'header' }, esc(title))),
    chart(days.map((d) => String(Number(d.date.slice(8, 10)))), days.map((d) => d.contributionCount)),
  );
}
