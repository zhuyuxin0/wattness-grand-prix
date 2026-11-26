// The Stewards page's report board, built in the lab's DOM from the frame data with the page's own markup and rules
// (board.css), and set on the bay's screen with a perspective transform: the screen shows exactly the hexes and type
// the page does. The check results are the page's verifier's for its tamper rule (one more MW in the selected arm's
// busiest hour), as the site's preview showed them on capture.
import './board.css';
import type { FrameData } from '../types';
import type { CheckState } from './stewards';

const formatDec1 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** The page's tamper rule (site/src/pages/Stewards/useStewards.ts tamperPlan): one more MW in the selected arm's
 *  busiest hour, the first hour of the largest magnitude. */
export function tamperOf(d: FrameData) {
  const arm = d.showcase.selected_arm as string, kw = d.showcase.arms[arm].kw as number[];
  let hour = 0;
  kw.forEach((v, h) => { if (Math.abs(v) > Math.abs(kw[hour]!)) hour = h; });
  return { arm, hour, path: `arms.${arm}.kw[${hour}]`, sealedKw: kw[hour]!, tamperedKw: kw[hour]! + 1000 };
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e;
};
const svgGlyph = (d: string, size: number) => {
  const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) s.setAttribute(k, String(v));
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.appendChild(p);
  return s;
};

export function buildBoard(d: FrameData, checks: CheckState[], tampered: boolean, width = 896) {
  const s = d.showcase;
  const root = el('div', 'v-board'); root.style.width = `${width}px`;
  const board = el('section', `st-board${tampered ? ' is-tampered' : ''}`);
  const bat = el('div', 'st-board__battery');
  bat.append(el('div', 'eyebrow', tampered ? 'Changed copy of the sealed plan' : 'Sealed plan'), el('h2', 'st-board__name', s.name));
  const facts = el('dl', 'st-board__facts');
  const fact = (dt: string, dd: string, num = false) => { const w = el('div'); w.append(el('dt', undefined, dt), el('dd', num ? 'num' : undefined, dd)); facts.appendChild(w); };
  fact('Resource', s.resource); fact('Node', s.settlement_point); fact('Hub', s.hub);
  fact('Rating', `${formatDec1(s.power_mw)} MW · ${formatDec1(s.energy_mwh)} MWh`, true);
  // the leaf's place in the tree, counted from one as the page counts it (showcase.leaf_position is zero-based)
  fact('Leaf', `${s.leaf_position + 1} of ${d.sealed_day.leaf_count}`, true);
  bat.appendChild(facts);
  const pass = checks.filter((c) => c === 'pass').length, fail = checks.length - pass, overall = fail ? 'fail' : 'pass';
  const score = el('div', 'st-board__score');
  const digits = el('div', 'st-board__digits num');
  digits.append(el('span', overall === 'fail' ? 'is-bad' : 'is-ok', String(pass)), el('span', 'st-board__of', `/${checks.length}`));
  const verdict = el('div', 'st-board__verdict');
  const badge = el('span', `st-verdict st-verdict--${overall} st-verdict--md`);
  badge.append(svgGlyph(overall === 'fail' ? 'M4 4l8 8M12 4l-8 8' : 'M3 8.5 6.5 12 13 4.5', 13), el('span', undefined, overall === 'fail' ? 'Fail' : 'Pass'));
  verdict.append(badge, el('span', 'muted', `checks pass${fail ? `, ${fail} fail` : ''}`));
  score.append(digits, verdict);
  const strip = el('ol', 'st-board__strip');
  checks.forEach((c, i) => { const li = el('li', `is-${c}`); li.appendChild(el('span', 'num', String(i + 1).padStart(2, '0'))); strip.appendChild(li); });
  board.append(bat, score, strip);
  root.appendChild(board);
  return root;
}

/** The 3 x 3 homography taking the rect (0, 0)-(w, h) to four points (top left, top right, bottom right, bottom left),
 *  as a CSS matrix3d. */
export function quadMatrix(w: number, h: number, q: { x: number; y: number }[]) {
  const src = [[0, 0], [w, 0], [w, h], [0, h]];
  const A: number[][] = [], B: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]!, X = q[i]!.x, Y = q[i]!.y;
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); B.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); B.push(Y);
  }
  // Gaussian elimination with partial pivoting
  const n = 8, M = A.map((r, i) => [...r, B[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    const pr = M[c]!;
    for (let r = 0; r < n; r++) if (r !== c) { const row = M[r]!, f = row[c]! / pr[c]!; for (let k = c; k <= n; k++) row[k] = row[k]! - f * pr[k]!; }
  }
  const h8 = M.map((r, i) => r[n]! / r[i]!);
  const [a, b, c, dd, e, f, g, hh] = h8 as [number, number, number, number, number, number, number, number];
  // rows: X = (a x + b y + c) / (g x + hh y + 1), Y = (dd x + e y + f) / (...)
  return `matrix3d(${a}, ${dd}, 0, ${g}, ${b}, ${e}, 0, ${hh}, 0, 0, 1, 0, ${c}, ${f}, 0, 1)`;
}
