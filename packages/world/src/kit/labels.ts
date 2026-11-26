// The intro's screen-space marks, ported from the draft's chrome.js and made cheap enough to run every frame:
// plates keep their elements and measured sizes, so a frame only moves them.
//
//   LeaderLabels  dark plates on thin teal leaders from a teal dot (Battalion's method, our code): greedy in priority
//                 order, the first candidate offset that fits, keeping last frame's candidate while it still fits so
//                 plates do not hop as the camera moves.
//   TickLayer     marks without leaders (a chart's axis numbers, its titles) and a key plate; a scene uses it in its
//                 own layer.
import type { IntroLabel } from './scene-types';
import type { Rect } from './scene-extras';

const SVG = 'http://www.w3.org/2000/svg';
const hit = (a: Rect, b: Rect, pad: number) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
/** Whether the segment (x0, y0) to (x1, y1) crosses the rect grown by pad (Liang-Barsky): a leader through a piece of
 *  page chrome is a plate over it by other means (the Hedging walkthrough's stepper at 789 px, Nov 21: the lid plate's
 *  leader ran across the key card's corner while its box kept off it). */
const cross = (x0: number, y0: number, x1: number, y1: number, r: Rect, pad: number) => {
  const xa = r.x - pad, ya = r.y - pad, xb = r.x + r.w + pad, yb = r.y + r.h + pad, dx = x1 - x0, dy = y1 - y0;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, x0 - xa], [dx, xb - x0], [-dy, y0 - ya], [dy, yb - y0]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
};
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e;
};

interface Plate { el: HTMLDivElement; text: string; node: HTMLElement | null; w: number; h: number; cand: number;
  /** When the plate last took a new candidate (performance.now()): holdPlace holds only a plate settled HOLD_MS. */
  at: number;
  path: SVGPathElement; halo: SVGCircleElement; dot: SVGCircleElement; seen: boolean }
/** How long a plate keeps one candidate before holdPlace holds it there: the plates at a rest (the outgoing stop's,
 *  settled for as long as the reader stayed) are held as a move leaves them, and a plate that came in during the move
 *  is laid out as before (held at once, the follow's plate, coming in through the night's slide, kept a stale place
 *  and then jumped 80 px at 20% as it faded, where it had crept 7 and 15 px: the probe of Nov 23). */
const HOLD_MS = 500;

/** Candidate offsets: rise or fall by dy, to the right (1) or the left (-1). */
const CANDS: readonly [number, number][] = [-35, 35, -70, 70, -105, 105, -140, 140, -175, 175].flatMap((dy) => [[1, dy], [-1, dy]] as [number, number][]);

export class LeaderLabels {
  readonly root: HTMLDivElement;
  private svg: SVGSVGElement;
  private plates = new Map<string, Plate>();
  private hoverEl: HTMLDivElement;
  /** Whether a candidate's leader (its two legs) must keep off the chrome as its box does (keepOut): the Hedging
   *  walkthrough's (its scroller and its stepper pass legsOffChrome); off for the landing intro, whose layout is as on
   *  main (the rules review of Nov 22: the test had changed it unasked). */
  private legs: boolean;
  /** Whether a settled plate (one candidate for HOLD_MS) keeps its place while that place still keeps off the chrome
   *  and the other plates, though the scene's avoid set has moved under it: the Hedging walkthrough's scroller passes
   *  holdPlace; off for the landing intro and the stepper, whose layouts are as on main. As a move left the night, the
   *  next hours' bars rose under the "9 to 10 pm CT" plate, the strict pass refused its place, and it hopped 335 px at
   *  full opacity 0.02 into the move before fading where it landed (the release's flow low of Nov 22; the probe of
   *  Nov 23). */
  private hold: boolean;

  constructor(parent: HTMLElement, { legsOffChrome = false, holdPlace = false }: { legsOffChrome?: boolean; holdPlace?: boolean } = {}) {
    this.legs = legsOffChrome;
    this.hold = holdPlace;
    this.root = el('div', 'intro-labels');
    this.svg = document.createElementNS(SVG, 'svg');
    this.root.appendChild(this.svg);
    this.hoverEl = el('div', 'intro-plate intro-hover');
    parent.appendChild(this.root);
  }

  private plate(it: IntroLabel): Plate {
    let p = this.plates.get(it.id);
    if (!p) {
      const e = el('div', 'intro-plate');
      const path = document.createElementNS(SVG, 'path'), halo = document.createElementNS(SVG, 'circle'), dot = document.createElementNS(SVG, 'circle');
      path.setAttribute('class', 'intro-leader'); halo.setAttribute('class', 'intro-halo'); dot.setAttribute('class', 'intro-dot');
      halo.setAttribute('r', '4.5'); dot.setAttribute('r', '2.5');
      this.svg.append(path, halo, dot); this.root.appendChild(e);
      p = { el: e, text: '', node: null, w: 0, h: 0, cand: -1, at: 0, path, halo, dot, seen: false };
      this.plates.set(it.id, p);
    }
    if (p.text !== it.text || p.node !== (it.node ?? null)) {
      p.el.textContent = it.text; p.text = it.text; p.node = it.node ?? null;
      if (it.node) p.el.appendChild(it.node);
      p.el.style.transform = 'translate3d(-9999px,0,0)';
      p.w = p.el.offsetWidth; p.h = p.el.offsetHeight; p.cand = -1;
    }
    return p;
  }

  /** Lays the plates out for this frame. keepOut: page chrome no plate may cover; avoid: things on the scene a plate
   *  should not cover unless nothing else fits. */
  layout(items: readonly IntroLabel[], { width: W, height: H, keepOut, avoid = [], max = 6 }: { width: number; height: number; keepOut: readonly Rect[]; avoid?: readonly Rect[]; max?: number }) {
    for (const p of this.plates.values()) p.seen = false;
    const pt = (x: number, y: number): Rect => ({ x, y, w: 0, h: 0 });
    const visible = [...items].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      .filter((it) => it.x >= 6 && it.x <= W - 6 && it.y >= 6 && it.y <= H - 6 && !keepOut.some((k) => hit(pt(it.x, it.y), k, 2)));
    const placed: Rect[] = [];
    const now = this.hold ? performance.now() : 0;
    let n = 0;
    for (const it of visible) {
      if (n >= max) break;
      const p = this.plate(it);
      const tryCand = (ci: number, strict: boolean) => {
        const [sx, dy] = CANDS[ci];
        const run = Math.abs(dy) / Math.tan(Math.PI / 3), near = Math.max(24, run + 4);
        const ax = it.x + sx * (it.gap ?? 0);
        const px = sx > 0 ? ax + near : ax - near - p.w, py = it.y + dy - p.h / 2;
        const r = { x: px, y: py, w: p.w, h: p.h };
        if (px < 10 || py < 10 || px + p.w > W - 10 || py + p.h > H - 10) return null;
        // the plate's box off the chrome, and with legsOffChrome its leader's two legs (the dot to the knee, the knee to
        // the plate's edge) too
        const kx = ax + sx * run, ky = it.y + dy, ex = sx > 0 ? px : px + p.w;
        if (keepOut.some((k) => hit(r, k, 8) || (this.legs && (cross(ax, it.y, kx, ky, k, 2) || cross(kx, ky, ex, ky, k, 2)))) || placed.some((q) => hit(r, q, 8))) return null;
        if (visible.some((o) => o !== it && hit(r, pt(o.x, o.y), 4))) return null;
        if (strict && avoid.some((a) => hit(r, a, 2))) return null;
        return { r, ax, sx, dy, run };
      };
      let ok: ReturnType<typeof tryCand> = null, ci = -1;
      const held = this.hold && p.cand >= 0 && now - p.at >= HOLD_MS;
      for (const strict of avoid.length ? [true, false] : [false]) {
        if (p.cand >= 0) { ok = tryCand(p.cand, strict && !held); if (ok) { ci = p.cand; break; } }
        for (let c = 0; c < CANDS.length && !ok; c++) { ok = tryCand(c, strict); if (ok) ci = c; }
        if (ok) break;
      }
      if (!ok) continue;
      if (ci !== p.cand) p.at = now;
      p.seen = true; p.cand = ci; n++;
      placed.push(ok.r);
      p.el.style.transform = `translate3d(${ok.r.x.toFixed(1)}px,${ok.r.y.toFixed(1)}px,0)`;
      const knee = [ok.ax + ok.sx * ok.run, it.y + ok.dy], end = [ok.sx > 0 ? ok.r.x : ok.r.x + ok.r.w, it.y + ok.dy];
      p.path.setAttribute('d', `M${ok.ax.toFixed(1)},${it.y.toFixed(1)} L${knee[0].toFixed(1)},${knee[1].toFixed(1)} L${end[0].toFixed(1)},${end[1].toFixed(1)}`);
      for (const c of [p.halo, p.dot]) { c.setAttribute('cx', ok.ax.toFixed(1)); c.setAttribute('cy', it.y.toFixed(1)); }
    }
    for (const [id, p] of this.plates) {
      if (p.seen) { p.el.style.display = ''; p.path.style.display = p.halo.style.display = p.dot.style.display = ''; continue; }
      // a plate unused this frame is hidden, and dropped if its label is gone from the scene
      if (!items.some((it) => it.id === id)) { p.el.remove(); p.path.remove(); p.halo.remove(); p.dot.remove(); this.plates.delete(id); continue; }
      p.el.style.display = 'none'; p.path.style.display = p.halo.style.display = p.dot.style.display = 'none';
    }
    return placed;
  }

  clear() { this.layout([], { width: 0, height: 0, keepOut: [] }); }

  /** The hover plate beside the pointer; null hides it. */
  hover(p: { x: number; y: number; text: string } | null, W: number) {
    if (!p) { this.hoverEl.remove(); return; }
    if (!this.hoverEl.isConnected) this.root.appendChild(this.hoverEl);
    if (this.hoverEl.textContent !== p.text) this.hoverEl.textContent = p.text;
    const w = this.hoverEl.offsetWidth, h = this.hoverEl.offsetHeight;
    let x = p.x + 14, y = p.y - h - 10;
    if (x + w > W - 10) x = p.x - w - 14;
    if (y < 10) y = p.y + 16;
    this.hoverEl.style.transform = `translate3d(${x}px,${y}px,0)`;
  }
}

export interface Tick { x: number; y: number; text: string; align?: 'below' | 'left' | 'right' | 'above' | 'inside' }
export interface KeyItem { kind?: 'box' | 'line' | 'thick' | 'hatch' | 'outline' | 'dash'; color: string; color2?: string; text: string }
export interface KeySpec { title?: string; rows: { label?: string; items: KeyItem[] }[] }

/** Marks without leaders, in named groups, and one key plate: for a scene's own layer. */
export class TickLayer {
  readonly root: HTMLDivElement;
  private groups = new Map<string, { els: { el: HTMLDivElement; text: string; w: number; h: number }[] }>();
  private keyEl: HTMLDivElement | null = null;
  private keySig = '';

  constructor(parent: HTMLElement) { this.root = el('div', 'intro-ticks'); parent.appendChild(this.root); }

  /** Sets one group's marks (replacing the last call's); returns their rects. */
  set(group: string, items: readonly Tick[], cls: string, W: number): Rect[] {
    let g = this.groups.get(group);
    if (!g) { g = { els: [] }; this.groups.set(group, g); }
    while (g.els.length > items.length) g.els.pop()!.el.remove();
    const out: Rect[] = [];
    items.forEach((it, i) => {
      let m = g!.els[i];
      if (!m) { const e = el('div', `intro-tick ${cls}`); this.root.appendChild(e); m = { el: e, text: '', w: 0, h: 0 }; g!.els[i] = m; }
      if (m.text !== it.text) { m.el.textContent = it.text; m.text = it.text; m.w = m.el.offsetWidth; m.h = m.el.offsetHeight; }
      const { w, h } = m;
      let x: number, y: number;
      if (it.align === 'left') { x = it.x - w - 6; y = it.y - h / 2; }
      else if (it.align === 'right') { x = it.x + 6; y = it.y - h / 2; }
      else if (it.align === 'above') { x = it.x; y = it.y - h - 4; }
      else if (it.align === 'inside') { x = it.x + 4; y = it.y + 4; }
      else { x = it.x - w / 2; y = it.y + 6; }
      x = Math.max(8, Math.min(W - 8 - w, x));
      m.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      out.push({ x, y, w, h });
    });
    return out;
  }

  /** The key plate at (x, y), its top-left, clamped into the stage; null removes it. Returns its rect. */
  key(spec: KeySpec | null, x: number, y: number, W: number, H: number): Rect | null {
    if (!spec) { this.keyEl?.remove(); this.keyEl = null; this.keySig = ''; return null; }
    const sig = JSON.stringify(spec);
    if (!this.keyEl || sig !== this.keySig) {
      this.keyEl?.remove();
      const k = el('div', 'intro-key');
      if (spec.title) k.appendChild(el('div', 'intro-key-title', spec.title));
      for (const r of spec.rows) {
        const row = el('div', 'intro-key-row');
        if (r.label) row.appendChild(el('span', 'intro-key-label', r.label));
        for (const s of r.items) {
          const it = el('span', 'intro-key-item'), sw = el('i'), kind = s.kind ?? 'box';
          sw.className = `intro-sw intro-sw-${kind}`;
          if (kind === 'box') sw.style.background = s.color;
          else if (kind === 'line' || kind === 'thick') sw.style.setProperty('--c', s.color);
          else if (kind === 'hatch') sw.style.background = `repeating-linear-gradient(135deg, ${s.color} 0 2px, ${s.color2 ?? 'transparent'} 2px 4px)`;
          else sw.style.borderColor = s.color;
          it.append(sw, document.createTextNode(s.text)); row.appendChild(it);
        }
        k.appendChild(row);
      }
      this.root.appendChild(k); this.keyEl = k; this.keySig = sig;
    }
    const w = this.keyEl.offsetWidth, h = this.keyEl.offsetHeight;
    const cx = Math.max(10, Math.min(W - 10 - w, x)), cy = Math.max(10, Math.min(H - 10 - h, y));
    this.keyEl.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0)`;
    return { x: cx, y: cy, w, h };
  }

  clear() { for (const g of this.groups.values()) g.els.forEach((m) => m.el.remove()); this.groups.clear(); this.key(null, 0, 0, 0, 0); }
}
