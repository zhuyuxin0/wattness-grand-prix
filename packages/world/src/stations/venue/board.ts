// The Verify page's board on the stewards' wall, built in the frame's DOM from the frame data and set on the bay's
// screen with a perspective transform. One board for both bays: R03 (chapter 16, and the changed copy) and the venue's
// stewards half (the films' split screen beside the page). It is the page's result in the site's type (board.css):
// the battery's name and the score in the display face, the five checks as the page's rows with a Pass or Fail state,
// the codes in mono. The states are the caller's: the page's verifier's on the sealed plan (all five pass), or on the
// copy its tamper rule changes (one more MW in the selected arm's busiest hour: 01, 02 and 05 fail), as the site's
// preview showed them on capture.
import './board.css';
import type { FrameData } from '../types';
import type { CheckState } from './stewards';

/** The board's box in CSS px: the venue's screen aspect (stewards.ts SCREEN, 30 x 30 / 3.584 m). A screen of another
 *  aspect passes its own height, and the rows share it. */
export const BOARD = { width: 896, height: 250 } as const;

/** The page's five checks, in its order (site/src/pages/Verify/verify/run.ts TITLES). */
export const CHECK_TITLES = [
  'The leaf recomputes from the plan',
  "The proof reaches the day's root",
  'The chain holds the same record',
  'Sealed before the gate',
  'Battery limits hold every hour',
] as const;

/** The page's tamper rule (site/src/pages/Verify/useStewards.ts tamperPlan): one more MW in the selected arm's
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

/** The board for a copy of Desert Willow's plan: `checks` in the page's order, `tampered` for the changed copy. */
export function buildBoard(d: FrameData, checks: readonly CheckState[], tampered: boolean, width: number = BOARD.width, height = Math.round((width * BOARD.height) / BOARD.width)) {
  const s = d.showcase, sd = d.sealed_day;
  const root = el('div', 'v-board');
  root.style.width = `${width}px`; root.style.height = `${height}px`;
  // the score's and the rows' type follows the board's height, so a taller screen reads larger (250 px is the venue's)
  root.style.setProperty('--k', String(Math.min(1.5, height / BOARD.height)));
  const pass = checks.filter((c) => c === 'pass').length, fail = checks.length - pass;
  const board = el('section', `st-board${tampered ? ' is-tampered' : ''}`);

  const who = el('div', 'st-board__who');
  who.append(el('p', 'st-board__eyebrow', 'Checked in your browser · BSC mainnet'), el('h2', 'st-board__name', s.name));
  // the codes in mono: the resource and its hub
  const codes = el('p', 'st-board__codes');
  [s.resource, s.hub].forEach((c: string, i) => { if (i) codes.appendChild(el('span', 'st-board__sep', ' · ')); codes.appendChild(el('span', undefined, c)); });
  // the copy checked, and the leaf's place in the tree counted from one as the page counts it (showcase.leaf_position
  // is zero-based)
  const copy = el('p', 'st-board__copy num');
  copy.append(el('span', 'st-board__state', tampered ? 'Changed copy' : 'Sealed plan'), document.createTextNode(` · leaf ${s.leaf_position + 1} of ${sd.leaf_count}`));
  who.append(codes, copy);

  const score = el('div', 'st-board__score');
  const digits = el('div', 'st-board__digits num');
  digits.append(el('span', fail ? 'is-bad' : 'is-ok', String(pass)), el('span', 'st-board__of', `/${checks.length}`));
  score.append(digits, el('p', 'st-board__verdict', fail ? `checks pass, ${fail} fail` : 'checks pass'));

  const rows = el('ol', 'st-board__rows');
  checks.forEach((c, i) => {
    const li = el('li', `is-${c}`);
    const pill = el('span', `st-pill st-pill--${c}`);
    pill.append(el('i'), document.createTextNode(c === 'pass' ? 'Pass' : 'Fail'));
    li.append(el('span', 'st-row__n num', String(i + 1).padStart(2, '0')), el('span', 'st-row__t', CHECK_TITLES[i] ?? ''), pill);
    rows.appendChild(li);
  });

  board.append(who, score, rows);
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
