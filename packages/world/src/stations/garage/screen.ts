// @ts-nocheck
// The garage's screens: DOM laid exactly onto a world quad (a projective matrix3d from its four projected corners), so
// words and marks stay crisp and keep their hexes, as a live page would. A quad seen from behind, or so edge-on that
// its words would smear, is hidden. Styles are injected once a page and scoped to .gx-*.

/** Lays el (w x h CSS px, top-left at the overlay's origin) onto the world quad tl, tr, br, bl (as seen from the front).
 *  Returns the quad's screen box, or null when it is hidden. minArea: the projected area (px^2) below which the screen
 *  is hidden; minSquash: the smallest ratio of projected height to width (against the CSS box's own) it is shown at;
 *  upright: hide it once it would read turned past 75 degrees, toward upside down (a floor screen seen from beyond its
 *  top edge, as the dive from the garage's roof to the pit wall passes over the plan bay). */
export function onQuad(el, w, h, corners, project, { minArea = 2500, minSquash = 0.18, upright = false } = {}) {
  const p = corners.map(project);
  if (p.some((q) => !q)) { el.style.display = 'none'; return null; }
  const [p0, p1, p2, p3] = p;
  // front-facing: tl to tr runs right and tl to bl runs down on screen (y down), so their cross product is positive
  const cross = (p1.x - p0.x) * (p3.y - p0.y) - (p1.y - p0.y) * (p3.x - p0.x);
  const area = Math.abs(cross);
  const wPx = Math.hypot(p1.x - p0.x, p1.y - p0.y), hPx = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  if (cross <= 0 || area < minArea || (hPx / Math.max(1, wPx)) / (h / w) < minSquash) { el.style.display = 'none'; return null; }
  // the screen's down (tl to bl) more than 75 degrees off the picture's down: it reads sideways or upside down
  if (upright && p3.y - p0.y < Math.cos((75 * Math.PI) / 180) * hPx) { el.style.display = 'none'; return null; }
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det, k = (dx1 * dy3 - dx3 * dy1) / det;
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + k * p3.x, c = p0.x;
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + k * p3.y, f = p0.y;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, c, f, 0, 1];
  Object.assign(el.style, {
    position: 'absolute', left: '0px', top: '0px', width: `${w}px`, height: `${h}px`, transformOrigin: '0 0',
    transform: `matrix3d(${m.map((v) => +v.toFixed(9)).join(',')})`, display: '',
  });
  const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

let styled = false;
export function screenStyles() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
.gx-screen { box-sizing: border-box; overflow: hidden; color: #eef1f4; font-family: var(--w-font-sans); -webkit-font-smoothing: antialiased;
  will-change: transform; backface-visibility: hidden; border-radius: 14px;
  background: radial-gradient(130% 150% at 18% 0%, #1a242c 0%, #10171c 46%, #0b1014 100%);
  box-shadow: inset 0 0 0 3px #2c363f, inset 0 7px 0 0 var(--gx-accent, #2ec7a6); }
.gx-screen.gold { --gx-accent: #F0B90B; box-shadow: inset 0 0 0 4px #F0B90B, inset 0 0 40px rgba(240, 185, 11, 0.16); }
.gx-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 30px 40px 0 44px; }
.gx-name { font: 600 76px/1 var(--t-font-display); letter-spacing: -0.01em; color: #f6f8fa; white-space: nowrap; }
.gx-flavor { margin-top: 12px; font: 500 32px/1 var(--w-font-sans); color: #a7b0b8; white-space: nowrap; }
.gx-flavor i { font-style: normal; color: #6f7a84; }
.gx-badge { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; padding-top: 6px; white-space: nowrap; }
.gx-badge b { display: inline-flex; align-items: center; gap: 12px; font: 600 34px/1 var(--t-font-code); font-variant-numeric: tabular-nums;
  color: #101315; background: #F0B90B; padding: 10px 16px 9px 14px; border-radius: 8px; }
.gx-badge b::before { content: ''; width: 16px; height: 16px; background: #101315; transform: rotate(45deg); border-radius: 2px; }
.gx-badge span { font: 500 25px/1 var(--w-font-sans); color: #a7b0b8; }
.gx-badge.none b { background: transparent; color: #a7b0b8; box-shadow: inset 0 0 0 2px #59636c; }
.gx-badge.none b::before { background: #59636c; }
.gx-body { position: absolute; left: 44px; right: 40px; top: 168px; bottom: 30px; display: flex; gap: 36px; }
.gx-chart { position: relative; flex: 1 1 auto; min-width: 0; }
.gx-chart svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.gx-side { flex: none; width: 390px; display: flex; flex-direction: column; gap: 12px; }
.gx-terms { font: 500 26px/1.22 var(--w-font-sans); color: #dfe4e8; white-space: nowrap; }
.gx-fig span { display: block; font: 500 27px/1.15 var(--w-font-sans); color: #a7b0b8; }
.gx-fig b { display: block; margin-top: 4px; font: 600 50px/1 var(--t-font-code); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; color: #f4f6f8; white-space: nowrap; }
.gx-fig b.sm { font-size: 38px; }
.gx-fig b.gain { color: #8cc2ff; } .gx-fig b.loss { color: #ffa383; } .gx-fig b.gold { color: #F0B90B; }
.gx-note { font: 500 24px/1.25 var(--w-font-sans); color: #8d969f; }
.gx-chip { display: inline-block; font: 700 22px/1 var(--w-font-sans); letter-spacing: 0.06em; color: #101315; background: #F0B90B; padding: 7px 10px 6px; border-radius: 5px; vertical-align: 6px; margin-left: 10px; }
.gx-chip.after { background: transparent; color: #e9edf1; box-shadow: inset 0 0 0 2px #8d969f; letter-spacing: 0.02em; font-weight: 600; }
.gx-svg .num { font: 500 24px/1 var(--t-font-code); font-variant-numeric: tabular-nums; fill: #a7b0b8; }
.gx-svg .lab { font: 600 26px/1 var(--w-font-sans); fill: #dfe4e8; }
.gx-svg .lab.mute { fill: #a7b0b8; font-weight: 500; }
.gx-list { display: flex; flex-direction: column; gap: 14px; }
.gx-row { display: grid; grid-template-columns: 22px 1fr auto; align-items: baseline; column-gap: 14px; }
.gx-row i { width: 20px; height: 20px; border-radius: 4px; align-self: center; }
.gx-row span { font: 500 29px/1.1 var(--w-font-sans); color: #dfe4e8; white-space: nowrap; }
.gx-row span em { font-style: normal; color: #8d969f; font-size: 25px; margin-left: 10px; }
.gx-row b { font: 600 36px/1 var(--t-font-code); font-variant-numeric: tabular-nums; color: #f4f6f8; }
.gx-plans { display: flex; flex-direction: column; gap: 16px; }
.gx-plan { display: grid; grid-template-columns: 60px 1fr 260px; align-items: center; column-gap: 20px; padding: 12px 18px; border-radius: 10px; background: rgba(255, 255, 255, 0.03); }
.gx-plan.sel { background: rgba(240, 185, 11, 0.10); box-shadow: inset 0 0 0 3px #F0B90B; }
.gx-plan .let { font: 700 46px/1 var(--t-font-display); color: #f6f8fa; }
.gx-plan.sel .let { color: #F0B90B; }
.gx-plan .what { font: 500 30px/1.1 var(--w-font-sans); color: #dfe4e8; white-space: nowrap; }
.gx-plan .bar { position: relative; height: 16px; margin-top: 12px; border-radius: 3px; background: #1d252c; }
.gx-plan .bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; background: #969ca3; }
.gx-plan.sel .bar i { background: #F0B90B; }
.gx-plan .score { text-align: right; font: 600 46px/1 var(--t-font-code); font-variant-numeric: tabular-nums; color: #f4f6f8; }
.gx-plan.sel .score { color: #F0B90B; }
.gx-board { display: flex; flex-direction: column; padding: 30px 44px 26px; gap: 16px; height: 100%; box-sizing: border-box; }
.gx-board .t { display: flex; align-items: center; gap: 22px; white-space: nowrap; }
.gx-board .t .let { font: 700 84px/0.9 var(--t-font-display); color: #f6f8fa; }
.gx-board.gold .t .let { color: #F0B90B; }
.gx-board .t .what { font: 600 44px/1.05 var(--t-font-display); color: #f6f8fa; }
.gx-board .t .what span { display: block; margin-top: 8px; font: 500 30px/1 var(--w-font-sans); color: #a7b0b8; }
.gx-board .cells { display: grid; grid-template-columns: 1fr auto; row-gap: 12px; column-gap: 24px; align-items: baseline; }
.gx-board .cells span { font: 500 36px/1 var(--w-font-sans); color: #b5bdc4; }
.gx-board .cells b { font: 600 52px/1 var(--t-font-code); font-variant-numeric: tabular-nums; color: #eef1f4; text-align: right; letter-spacing: -0.02em; }
.gx-board .cells b.loss { color: #ffa383; } .gx-board .cells b.gain { color: #8cc2ff; }
.gx-board .cells .score span { color: #f6f8fa; font-weight: 600; }
.gx-board .cells .score b { font-size: 64px; color: #f6f8fa; }
.gx-board.gold .cells .score b { color: #F0B90B; }
.gx-board .foot { margin-top: auto; font: 500 28px/1.25 var(--w-font-sans); color: #a7b0b8; }
.gx-board .hist { position: relative; height: 84px; flex: none; }
.gx-board .hist svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
`;
  document.head.appendChild(s);
}
