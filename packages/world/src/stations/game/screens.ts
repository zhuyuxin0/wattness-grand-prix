// The cabinet's screens: DOM laid exactly onto their quads in the picture (a projective matrix3d from the four
// projected corners), so text and marks stay crisp and keep their hexes, as a live page would. The backbox's risk and
// return plane, the marquee's neon mark, the seal feed's ticker and the best-plan banner.
import type { Vec3 } from '../../lib/stage';

export type Project = (p: Vec3) => { x: number; y: number } | null;

/** Lays el (w x h CSS px, its top-left at the overlay's origin) onto the world quad tl, tr, br, bl. */
export function onQuad(el: HTMLElement, w: number, h: number, corners: readonly [Vec3, Vec3, Vec3, Vec3], project: Project): boolean {
  const p = corners.map(project);
  if (p.some((q) => !q)) { el.style.display = 'none'; return false; }
  const [p0, p1, p2, p3] = p as { x: number; y: number }[];
  // the unit square to the quad (Heckbert), then pixels to the unit square
  const dx1 = p1!.x - p2!.x, dx2 = p3!.x - p2!.x, dx3 = p0!.x - p1!.x + p2!.x - p3!.x;
  const dy1 = p1!.y - p2!.y, dy2 = p3!.y - p2!.y, dy3 = p0!.y - p1!.y + p2!.y - p3!.y;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det, k = (dx1 * dy3 - dx3 * dy1) / det;
  const a = p1!.x - p0!.x + g * p1!.x, b = p3!.x - p0!.x + k * p3!.x, c = p0!.x;
  const d = p1!.y - p0!.y + g * p1!.y, e = p3!.y - p0!.y + k * p3!.y, f = p0!.y;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, c, f, 0, 1];
  Object.assign(el.style, { position: 'absolute', left: '0px', top: '0px', width: `${w}px`, height: `${h}px`, transformOrigin: '0 0',
    transform: `matrix3d(${m.map((v) => +v.toFixed(9)).join(',')})`, display: '' });
  return true;
}

/** The screen-space box of a world quad (for keeping plates off it). */
export function quadRect(corners: readonly Vec3[], project: Project) {
  const p = corners.map(project).filter(Boolean) as { x: number; y: number }[];
  const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

let styled = false;
/** The screens' own styles, once per page. */
export function screenStyles() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
.dfx-screen { box-sizing: border-box; overflow: hidden; color: #e6e8ea; font-family: var(--w-font-sans); -webkit-font-smoothing: antialiased;
  will-change: transform; backface-visibility: hidden; }
.dfx-plane { display: flex; background: radial-gradient(120% 140% at 30% 20%, #121a20 0%, #0b0f12 60%, #090c0e 100%); border-radius: 10px; }
.dfx-plane .board { position: relative; flex: none; width: 540px; box-sizing: border-box; padding: 26px 8px 22px 34px; display: flex; flex-direction: column; gap: 11px;
  border-right: 2px solid #1d2329; }
.dfx-plane .chart { position: relative; flex: 1 1 auto; height: 100%; }
.dfx-plane .title { display: flex; align-items: center; gap: 12px; font: 600 26px/1.12 var(--t-font-display); color: #f6f7f8; margin-bottom: 6px; white-space: nowrap; }
.dfx-plane .title i { width: 18px; height: 18px; border-radius: 4px; flex: none; }
.dfx-plane .cell span em { display: inline-block; vertical-align: 3px; margin-left: 8px; font: 700 15px/1 var(--w-font-sans); font-style: normal; color: #101315; background: #F0B90B; padding: 5px 7px 4px; border-radius: 4px; letter-spacing: 0.05em; }
.dfx-plane .title em { font: 700 18px/1 var(--w-font-sans); font-style: normal; color: #101315; background: #F0B90B; padding: 6px 9px 5px; border-radius: 5px; letter-spacing: 0.04em; }
.dfx-plane .cell { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding-right: 30px; white-space: nowrap; }
.dfx-plane .cell span { font: 500 24px/1 var(--w-font-sans); color: #a3a9b0; }
.dfx-plane .cell b { font: 600 44px/1 var(--t-font-code); font-variant-numeric: tabular-nums; color: #e6e8ea; letter-spacing: -0.02em; }
.dfx-plane .cell b.neg { color: #ffa383; }
.dfx-plane .cell.score b { font-size: 54px; color: #f6f7f8; }
.dfx-plane .cell.score b.sealed { color: #F0B90B; }
.dfx-plane .cell b.none { color: #3a4148; }
.dfx-plane .foot { margin-top: auto; font: 500 22px/1.3 var(--w-font-sans); color: #d7dbe0; padding-right: 22px; }
.dfx-plane svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.dfx-plane .num { font: 500 23px/1 var(--t-font-code); font-variant-numeric: tabular-nums; fill: #a3a9b0; }
.dfx-plane .axis { font: 600 26px/1 var(--t-font-display); fill: #d7dbe0; letter-spacing: 0.01em; }
.dfx-plane .let { font: 600 34px/1 var(--t-font-display); fill: #f6f7f8; }
.dfx-plane .fig { font: 500 22px/1 var(--t-font-code); font-variant-numeric: tabular-nums; fill: #c9ced3; }
.dfx-neon { display: flex; align-items: center; justify-content: center; }
.dfx-neon span { font: 600 168px/1 var(--t-font-display); letter-spacing: 0.16em; padding-left: 0.16em; color: rgba(255, 236, 205, 0.10);
  -webkit-text-stroke: 7px #fff1da; text-shadow: 0 0 4px #ffd59c, 0 0 12px #ffbf73, 0 0 26px rgba(255, 170, 80, 0.85), 0 0 52px rgba(255, 150, 60, 0.55); }
.dfx-ticker { display: flex; align-items: center; justify-content: center; gap: 30px; white-space: nowrap; padding: 0 20px; background: linear-gradient(#07090b, #0b0f12);
  font: 600 27px/1 var(--t-font-code); font-variant-numeric: tabular-nums; color: #c9ced3; }
.dfx-ticker b { font-weight: 600; color: #2ec7a6; } .dfx-ticker .bad { color: #e5534b; } .dfx-ticker .dot { color: #4a5158; }
.dfx-banner { display: flex; align-items: center; justify-content: center; gap: 26px; background: linear-gradient(#141a1f, #0d1115); border-radius: 8px;
  box-shadow: inset 0 0 0 4px #F0B90B, inset 0 0 26px rgba(240, 185, 11, 0.25); font: 600 64px/1 var(--t-font-display); color: #F0B90B; }
.dfx-banner .lead { font: 600 56px/1 var(--t-font-display); color: #f6f7f8; white-space: nowrap; }
.dfx-banner .p1 { align-self: center; font: 700 34px/1 var(--t-font-display); letter-spacing: 0.04em; color: #101315; background: #F0B90B; padding: 7px 12px 5px; border-radius: 6px; }
.dfx-banner .sub { font: 500 40px/1.2 var(--w-font-sans); color: #e6e8ea; white-space: nowrap; }
.dfx-banner .col { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.dfx-banner .row { display: flex; align-items: baseline; gap: 22px; white-space: nowrap; }
.dfx-banner .col .lead { font-size: 46px; }
.dfx-banner .col .num { font-size: 64px; }
.dfx-banner .col .sub { font-size: 36px; color: #c9ced3; }
.dfx-banner .num { font: 600 78px/1 var(--t-font-code); font-variant-numeric: tabular-nums; }
`;
  document.head.appendChild(s);
}

export interface Board { title: string; swatch: string | null; sealed: boolean; mean: number | null; worst: number | null; score: number | null; foot: string }

const fmt = (usd: number) => { const c = Math.round(usd * 100), a = Math.abs(c); return `${c < 0 ? '\u2212' : ''}$${Math.floor(a / 100).toLocaleString('en-US')}.${String(a % 100).padStart(2, '0')}`; };
/** The backbox's scoreboard: the plan's title, its mean, the worst tenth's average day and the score, and a foot line;
 *  values in dollars to the cent, a loss in the ramp's paid color; dashes where nothing is printed. */
export function boardHtml(b: Board): string {
  const v = (x: number | null, extra = '') => x == null ? `<b class="none">\u2014</b>` : `<b class="${x < 0 ? 'neg' : ''} ${extra}">${fmt(x)}</b>`;
  // a sealed board's badge sits by its score, so a long title keeps to one line
  return `<div class="board"><div class="title">${b.swatch ? `<i style="background:${b.swatch}"></i>` : ''}<span>${b.title}</span></div>`
    + `<div class="cell"><span>Mean</span>${v(b.mean)}</div><div class="cell"><span>Worst tenth</span>${v(b.worst)}</div>`
    + `<div class="cell score"><span>Score${b.sealed ? ' <em>SEALED</em>' : ''}</span>${v(b.score, b.sealed ? 'sealed' : '')}</div><div class="foot">${b.foot}</div></div>`;
}

export interface PlaneMark { arm: 'A' | 'B' | 'C'; wt: number; mean: number; score: number; state: 'lit' | 'ghost' | 'sealed' }
// the site's arm colors at their dark values (the stage holds dark); the deck's plane takes the page theme's (--op-a ...)
const SW = { A: '#2c60de', B: '#d95926', C: '#9085e9' } as const;

/** The risk and return plane: across, the worst tenth's average day; up, the mean; equal-score diagonals through the
 *  lit marks; an inset round B and C once both are shown; the player's dot (held at the frame's edge, with an arrow,
 *  when the plan is off the scale). W x H CSS px; ids prefixes the SVG's ids, one per plane on a page. look 'stage' is
 *  the cabinet's dark screen; 'deck' draws the same plane for the deck under the stage, in the page's theme: every
 *  color is a class that game.css sets from the deck's tokens, the labels are the system face, and the axes'
 *  directions are drawn, never typed. */
export function planeSvg(W: number, H: number, marks: readonly PlaneMark[], player: { wt: number; mean: number } | null, inset: boolean, ids = 'dfx', look: 'stage' | 'deck' = 'stage'): string {
  const deck = look === 'deck';
  const X0 = -2000, X1 = 650, Y0 = 3500, Y1 = 3700;
  const L = 108, R = W - 34, T = 64, B = H - 62;
  const x = (v: number) => L + ((v - X0) / (X1 - X0)) * (R - L), y = (v: number) => B - ((v - Y0) / (Y1 - Y0)) * (B - T);
  const out: string[] = [];
  // a color as an attribute on the stage, a class on the deck (game.css .op-plane--deck)
  const paint = (attr: 'fill' | 'stroke', stage: string, cls: string) => (deck ? `class="${cls}"` : `${attr}="${stage}"`);
  out.push(`<defs><clipPath id="${ids}c"><rect x="${L}" y="${T}" width="${R - L}" height="${B - T}"/></clipPath>
    <radialGradient id="${ids}g"><stop offset="0" stop-color="#f6f7f8" stop-opacity="0.55"/><stop offset="1" stop-color="#f6f7f8" stop-opacity="0"/></radialGradient></defs>`);
  // grid and ticks
  for (const v of [-2000, -1000, 0, 500]) {
    out.push(`<line x1="${x(v)}" y1="${T}" x2="${x(v)}" y2="${B}" ${paint('stroke', v === 0 ? '#3a4148' : '#1d2329', v === 0 ? 'pl-zero' : 'pl-grid')} stroke-width="${v === 0 ? 2 : 1.5}"/>`);
    out.push(`<text class="num" x="${x(v)}" y="${B + 32}" text-anchor="middle">${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US')}</text>`);
  }
  for (const v of [3500, 3550, 3600, 3650, 3700]) {
    out.push(`<line x1="${L}" y1="${y(v)}" x2="${R}" y2="${y(v)}" ${paint('stroke', '#1d2329', 'pl-grid')} stroke-width="1.5"/>`);
    out.push(`<text class="num" x="${L - 14}" y="${y(v) + 7}" text-anchor="end">$${v.toLocaleString('en-US')}</text>`);
  }
  if (deck) {
    // the axes' names, and their directions as drawn arrows
    out.push(`<text class="axis" x="${R - 30}" y="${T - 22}" text-anchor="end">Worst tenth</text>`);
    out.push(`<path class="pl-arrow" d="M ${R - 24} ${T - 28} H ${R - 4} M ${R - 10} ${T - 34} L ${R - 3} ${T - 28} L ${R - 10} ${T - 22}"/>`);
    out.push(`<path class="pl-arrow" d="M ${L - 90} ${T - 20} V ${T - 40} M ${L - 96} ${T - 33} L ${L - 90} ${T - 41} L ${L - 84} ${T - 33}"/>`);
    out.push(`<text class="axis" x="${L - 78}" y="${T - 22}">Mean</text>`);
  } else {
    out.push(`<text class="axis" x="${R}" y="${T - 22}" text-anchor="end">Worst tenth →</text>`);
    out.push(`<text class="axis" x="${L - 96}" y="${T - 22}">↑ Mean</text>`);
  }
  // equal-score diagonals: mean = score - 0.5 x worst tenth
  const diag = (score: number, sealed: boolean, op: number) => {
    const xa = X0, xb = X1;
    out.push(`<line clip-path="url(#${ids}c)" x1="${x(xa)}" y1="${y(score - 0.5 * xa)}" x2="${x(xb)}" y2="${y(score - 0.5 * xb)}" ${paint('stroke', sealed ? '#F0B90B' : '#969ca3', sealed ? 'pl-diag pl-diag--sealed' : 'pl-diag')} stroke-opacity="${op}" stroke-width="2" stroke-dasharray="10 8"/>`);
  };
  for (const m of marks) if (m.state !== 'ghost') diag(m.score, m.state === 'sealed', m.state === 'sealed' ? 0.75 : 0.6);
  const mark = (m: PlaneMark) => {
    const cx = x(m.wt), cy = y(m.mean), r = 13;
    if (m.state === 'ghost') { out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" ${paint('stroke', '#6b737b', 'pl-ghost')} stroke-width="2.5"/>`); }
    else {
      if (!deck) out.push(`<circle cx="${cx}" cy="${cy}" r="${r * 2.6}" fill="url(#${ids}g)" opacity="0.5"/>`);
      out.push(deck
        ? `<circle cx="${cx}" cy="${cy}" r="${r}" class="${m.state === 'sealed' ? 'pl-mark pl-mark--sealed' : 'pl-mark'}" stroke-width="3"/>`
        : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${m.state === 'sealed' ? '#F0B90B' : '#f6f7f8'}" stroke="#0b0f12" stroke-width="3"/>`);
    }
    const lx = m.arm === 'A' ? cx + 26 : cx - 26, anchor = m.arm === 'A' ? 'start' : 'end';
    const ly = m.arm === 'C' ? cy + 40 : cy - 18;
    out.push(`<text class="let" x="${lx + (anchor === 'start' ? 22 : -22)}" y="${ly}" text-anchor="${anchor}" opacity="${m.state === 'ghost' ? 0.5 : 1}">${m.arm}</text>`);
    out.push(`<rect x="${anchor === 'start' ? lx : lx - 14}" y="${ly - 22}" width="14" height="14" rx="3" ${deck ? `class="pl-sw pl-sw--${m.arm.toLowerCase()}"` : `fill="${SW[m.arm]}"`} opacity="${m.state === 'ghost' ? 0.5 : 1}"/>`);
  };
  for (const m of marks) mark(m);
  if (player) {
    const px = Math.max(L, Math.min(R, x(player.wt))), py = Math.max(T, Math.min(B, y(player.mean)));
    if (!deck) out.push(`<circle cx="${px}" cy="${py}" r="30" fill="url(#${ids}g)"/>`);
    out.push(deck ? `<circle cx="${px}" cy="${py}" r="9" class="pl-you" stroke-width="4"/>` : `<circle cx="${px}" cy="${py}" r="9" fill="#f6f7f8" stroke="#2ec7a6" stroke-width="4"/>`);
    // off the scale: an arrow at the edge, pointing where the plan lies
    const ox = x(player.wt) < L ? -1 : x(player.wt) > R ? 1 : 0, oy = y(player.mean) < T ? -1 : y(player.mean) > B ? 1 : 0;
    if (ox || oy) {
      const a = Math.atan2(oy, ox), tip = [px + Math.cos(a) * 30, py + Math.sin(a) * 30], l = [px + Math.cos(a + 2.6) * 14 + Math.cos(a) * 16, py + Math.sin(a + 2.6) * 14 + Math.sin(a) * 16], r = [px + Math.cos(a - 2.6) * 14 + Math.cos(a) * 16, py + Math.sin(a - 2.6) * 14 + Math.sin(a) * 16];
      out.push(`<path d="M ${tip[0]} ${tip[1]} L ${l[0]} ${l[1]} L ${r[0]} ${r[1]} Z" ${paint('fill', '#2ec7a6', 'pl-you-arrow')}/>`);
    }
  }
  if (inset) {
    // the inset: B and C (and the player) at four times the scale
    const bw = Math.round((R - L) * 0.46), bh = Math.round((B - T) * 0.5), bx = L + Math.round((R - L) * 0.4), by = T + 6;
    const IX0 = 180, IX1 = 460, IY0 = 3525, IY1 = 3590;
    const ix = (v: number) => bx + ((v - IX0) / (IX1 - IX0)) * bw, iy = (v: number) => by + bh - ((v - IY0) / (IY1 - IY0)) * bh;
    out.push(`<path d="M ${x(IX0)} ${y(IY1)} L ${bx} ${by + bh} M ${x(IX1)} ${y(IY1)} L ${bx + bw} ${by + bh}" ${paint('stroke', '#3a4148', 'pl-zero')} stroke-width="1.5" fill="none"/>`);
    out.push(`<rect x="${x(IX0)}" y="${y(IY1)}" width="${x(IX1) - x(IX0)}" height="${y(IY0) - y(IY1)}" fill="none" ${paint('stroke', '#3a4148', 'pl-zero')} stroke-width="1.5"/>`);
    out.push(deck ? `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="8" class="pl-inset" stroke-width="2"/>` : `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="8" fill="#0d1216" stroke="#3a4148" stroke-width="2"/>`);
    out.push(`<clipPath id="${ids}i"><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="8"/></clipPath>`);
    for (const m of marks) if (m.arm !== 'A' && m.state !== 'ghost') {
      out.push(`<line clip-path="url(#${ids}i)" x1="${ix(IX0)}" y1="${iy(m.score - 0.5 * IX0)}" x2="${ix(IX1)}" y2="${iy(m.score - 0.5 * IX1)}" ${paint('stroke', m.state === 'sealed' ? '#F0B90B' : '#969ca3', m.state === 'sealed' ? 'pl-diag pl-diag--sealed' : 'pl-diag')} stroke-opacity="0.7" stroke-width="2" stroke-dasharray="8 6"/>`);
    }
    for (const m of marks) if (m.arm !== 'A') {
      const cx = ix(m.wt), cy = iy(m.mean);
      out.push(deck
        ? `<circle cx="${cx}" cy="${cy}" r="10" class="${m.state === 'ghost' ? 'pl-ghost' : m.state === 'sealed' ? 'pl-mark pl-mark--sealed' : 'pl-mark'}" ${m.state === 'ghost' ? 'fill="none" ' : ''}stroke-width="2.5"/>`
        : `<circle cx="${cx}" cy="${cy}" r="10" fill="${m.state === 'ghost' ? 'none' : m.state === 'sealed' ? '#F0B90B' : '#f6f7f8'}" stroke="${m.state === 'ghost' ? '#6b737b' : '#0b0f12'}" stroke-width="2.5"/>`);
      out.push(`<text class="fig" x="${cx - 16}" y="${cy - 14}" text-anchor="end">${m.arm}</text>`);
    }
    if (player && player.wt >= IX0 && player.wt <= IX1 && player.mean >= IY0 && player.mean <= IY1) out.push(deck ? `<circle cx="${ix(player.wt)}" cy="${iy(player.mean)}" r="7" class="pl-you" stroke-width="3"/>` : `<circle cx="${ix(player.wt)}" cy="${iy(player.mean)}" r="7" fill="#f6f7f8" stroke="#2ec7a6" stroke-width="3"/>`);
  }
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"${deck ? ' class="op-plane--deck"' : ''}>${out.join('')}</svg>`;
}
