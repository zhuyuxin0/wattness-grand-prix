// @ts-nocheck
// The stack's words, in DOM over the canvas (never painted into the 3D): the pieces' labels (plain meaning first, then
// the name, smaller, or for a sponsor piece its owner's logo chip from the registry, kit/logos), chapter 05's key card
// with its drawn samples (engine.ts legendEl), the zone titles, the "after the seal" ticks, a piece's card (the
// storyboard's key-card skin) with the Terminal's popout and chevron glyphs (ui/glyph.css) and the button to the site's
// tab, and the end card's lockup. Sizes are the storyboard's 1920 cut; the card scales by --stk-k (1 in the stills).
import { glyphSvg } from './glyphs';
import { logoChip } from '../../kit/logos';

const CSS = `
.stk-key { position: absolute; display: grid; gap: 6px; padding: 13px 16px 14px; border-radius: 7px; font: 400 14.5px/18px var(--w-font-sans, system-ui, sans-serif); z-index: 40; }
.stk-key[data-theme="dark"] { color: #d7d9d4; background: rgba(13, 17, 23, 0.86); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08); }
.stk-key[data-theme="light"] { color: #1a1a1a; background: rgba(255, 255, 255, 0.94); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12); }
.stk-key-title { font: 500 12.5px/16px var(--w-font-sans, system-ui, sans-serif); letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.6; margin-bottom: 2px; }
.stk-key-row { display: flex; align-items: center; gap: 12px; white-space: nowrap; opacity: 0.94; }
.stk-key-row svg { flex: none; overflow: visible; }
.stk-zone { position: absolute; left: 0; top: 0; white-space: nowrap; font: 600 13px/16px "Libre Franklin Brand", var(--w-font-sans, system-ui, sans-serif); letter-spacing: 0.14em; color: #8f979f; text-transform: uppercase; pointer-events: none; }
.stk-zone[data-theme="light"] { color: #636a75; }
.intro-tick.stk-after { font: 500 12.5px/15px var(--w-font-sans, system-ui, sans-serif); color: #c6cfd9; background: rgba(13, 17, 23, 0.82); padding: 2px 8px 3px; border-radius: 10px; box-shadow: 0 0 0 1px rgba(198, 207, 217, 0.28); }
/* a piece's label: its plain meaning, then its name, smaller */
.stk-labels { position: absolute; inset: 0; pointer-events: none; z-index: 21; }
.stk-lab { position: absolute; left: 0; top: 0; white-space: nowrap; display: flex; flex-direction: column; gap: 1px; font: 500 14px/17px var(--w-font-sans, system-ui, sans-serif);
  color: #dfe3e7; text-shadow: 0 0 2px #101315, 0 0 4px #101315, 0 0 7px #101315; transition: opacity 0.2s ease; }
.stk-lab span { font-weight: 400; font-size: 12px; line-height: 14px; color: #98a1aa; }
.stk-lab[data-align="right"], .stk-lab[data-align="inside"] { align-items: flex-start; }
.stk-lab[data-align="left"] { align-items: flex-end; text-align: right; }
.stk-lab[data-align="below"], .stk-lab[data-align="above"] { align-items: center; text-align: center; }
.stk-lab.stk-pod { font-size: 14.5px; color: #e6e9ec; }
.stk-lab.stk-ghost { color: #8a929a; }
.stk-lab.stk-ghost span { color: #6f777f; }
/* a sponsor piece's name line is its owner's logo chip (kit/logos/chip.css): a link to the owner in a new tab, so it
   takes the pointer the labels' layer lets through; the label's glow is for words on the stage, not on the white glass */
.stk-lab .lg-chip { --lg-h: 13px; margin-top: 4px; text-shadow: none; transition: opacity 0.2s ease, translate 0.12s ease-out, box-shadow 0.12s ease-out; }
.stk-lab.stk-dim .lg-chip { opacity: 0.6; }
/* on a phone's stage the labels would sit on each other: the owners' chips go in one row of their own, wrapped */
.stk-strip { position: absolute; left: 16px; right: 16px; top: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; z-index: 21; pointer-events: none; }
.stk-strip .lg-chip { --lg-h: 11px; }
/* the plan view's chips, one over each sponsor piece, the logo alone */
.stk-plan { position: absolute; inset: 0; pointer-events: none; z-index: 22; }
.stk-plan .lg-chip { position: absolute; left: 0; top: 0; --lg-h: 14px; }
/* while another piece is open its neighbours step back in color, not opacity, so they still read at 4.5:1 or more on
   the stage (#8f979f on #101315 is about 6:1; #7d858d about 4.9:1) */
.stk-lab.stk-dim { color: #8f979f; }
.stk-lab.stk-dim span { color: #7d858d; }
/* a narrow stage (a phone): at that scale the labels would sit on each other, so a tap's card names each piece */
.stk-root.is-narrow .stk-lab, .stk-root.is-narrow .intro-tick.stk-after { display: none; }
.stk-root.is-narrow .stk-card .stk-mono { white-space: normal; overflow-wrap: anywhere; }
/* a phone's stage is shorter than most cards: the card keeps inside it and scrolls */
.stk-root.is-narrow .stk-card { max-height: calc(100% - 32px); overflow-y: auto; overscroll-behavior: contain; }
.intro-plate.stk-sealed { box-shadow: inset 3px 0 0 #F0B90B, 0 0 0 1px rgba(255, 255, 255, 0.12), 0 6px 16px -10px rgba(0, 0, 0, 0.3); padding-left: 12px; }
.intro-plate.stk-refused { box-shadow: inset 3px 0 0 #e5534b, 0 0 0 1px rgba(255, 255, 255, 0.12), 0 6px 16px -10px rgba(0, 0, 0, 0.3); padding-left: 12px; }
.intro-plate .stk-mono, .stk-card .stk-mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-variant-numeric: tabular-nums; font-size: 0.88em; line-height: 1.5; white-space: nowrap; }
/* a piece's card comes in with chapter 05's entry (a 6 px rise in 160 ms) */
/* a piece's card; an open card sits over the live mount's key card, which it can overlap near the stage's bottom right */
.stk-card { --k: var(--stk-k, 1); position: absolute; left: 0; top: 0; width: calc(470px * var(--k)); max-width: calc(100% - 32px); box-sizing: border-box; padding: calc(16px * var(--k)) calc(18px * var(--k)) calc(17px * var(--k));
  border-radius: 9px; z-index: 41; color: #e6e8ea; background: rgba(13, 17, 23, 0.97); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1), 0 18px 40px -18px rgba(0, 0, 0, 0.8);
  font: 400 calc(14.5px * var(--k))/1.38 var(--w-font-sans, system-ui, sans-serif); pointer-events: auto; }
.stk-card-caps { display: flex; align-items: center; gap: 7px; font: 500 calc(11.5px * var(--k))/15px var(--w-font-sans, system-ui, sans-serif); letter-spacing: 0.12em; text-transform: uppercase; color: #F0B90B; }
.stk-card-head { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
.stk-card-head svg { flex: none; }
.stk-card-name { font: 600 calc(24px * var(--k))/1.15 "Libre Franklin Brand", var(--w-font-sans, system-ui, sans-serif); color: #f6f7f8; letter-spacing: -0.01em; }
.stk-card-role { margin-top: 8px; color: #c9ced3; }
.stk-card dl { margin: 12px 0 0; display: grid; grid-template-columns: calc(108px * var(--k)) 1fr; gap: 7px 12px; }
.stk-card dt { color: #8f979f; font-size: 0.86em; line-height: 1.5; }
.stk-card dd { margin: 0; color: #e6e8ea; overflow-wrap: anywhere; }
.stk-card dd a { color: inherit; text-decoration: underline; text-decoration-color: rgba(46, 199, 166, 0.55); text-underline-offset: 2px; }
.stk-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; }
.stk-card-foot a.out { display: inline-flex; align-items: center; gap: 6px; color: #2ec7a6; text-decoration: none; font-weight: 500; }
.stk-card i.g { display: inline-block; width: 13px; height: 13px; background: currentColor; -webkit-mask: var(--stk-g) center / contain no-repeat; mask: var(--stk-g) center / contain no-repeat; }
.stk-card i.g-popout { --stk-g: var(--stk-popout); }
.stk-card i.g-next { --stk-g: var(--stk-next); }
.stk-go { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px 6px 12px; border-radius: 7px; border: 0; cursor: pointer;
  font: 500 calc(13.5px * var(--k))/1.2 var(--w-font-sans, system-ui, sans-serif); color: #0d1117; background: #2ec7a6; }
.stk-go:focus-visible { outline: 2px solid #f6f7f8; outline-offset: 2px; }
.stk-pop { opacity: 0; visibility: hidden; pointer-events: none; transform: translate3d(var(--x, 0), calc(var(--y, 0) + 6px), 0);
  transition: opacity 0.2s ease, transform 0.2s ease, visibility 0s linear 0.2s; }
.stk-pop.is-in { opacity: 1; visibility: visible; transform: translate3d(var(--x, 0), var(--y, 0), 0); transition: opacity 0.16s ease, transform 0.16s ease, visibility 0s; }
.stk-card.stk-pop.is-in { pointer-events: auto; }
.stk-pop.is-still { transition: none; }
.stk-pointer { position: absolute; left: 0; top: 0; width: 22px; height: 22px; z-index: 42; pointer-events: none; }
.stk-lockup { position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 22px; z-index: 40; }
.stk-lockup .rule { width: 1px; height: 40px; background: rgba(255, 255, 255, 0.4); }
.stk-lockup .line { position: absolute; left: 0; right: 0; top: 58px; text-align: center; font: 500 13px/16px var(--w-font-sans, system-ui, sans-serif); letter-spacing: 0.14em; text-transform: uppercase; color: #c9ced3; white-space: nowrap; }
.stk-word { font: 600 34px/1 "Libre Franklin Brand", var(--w-font-sans, system-ui, sans-serif); letter-spacing: -0.02em; color: #f6f7f8; display: flex; align-items: center; gap: 12px; }
.stk-end-url { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
.stk-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
/* the light cut */
[data-stk-theme="light"] .stk-lab { color: #1f2429; text-shadow: 0 0 2px #fff, 0 0 4px #fff, 0 0 7px #fff; }
[data-stk-theme="light"] .stk-lab span { color: #59606a; }
[data-stk-theme="light"] .stk-lab.stk-dim { color: #59606a; }
[data-stk-theme="light"] .stk-lab.stk-dim span { color: #5f666f; }
[data-stk-theme="light"] .stk-lab.stk-pod { color: #1a1a1a; }
[data-stk-theme="light"] .stk-lab.stk-ghost { color: #8b939c; }
[data-stk-theme="light"] .intro-tick.stk-after { color: #4a515a; background: rgba(255, 255, 255, 0.92); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.16); }
[data-stk-theme="light"] .intro-plate.stk-sealed { box-shadow: inset 3px 0 0 #F0B90B, 0 0 0 1px rgba(0, 0, 0, 0.12), 0 6px 16px -10px rgba(0, 0, 0, 0.2); }
[data-stk-theme="light"] .intro-plate.stk-refused { box-shadow: inset 3px 0 0 #9f1d35, 0 0 0 1px rgba(0, 0, 0, 0.12), 0 6px 16px -10px rgba(0, 0, 0, 0.2); }
[data-stk-theme="light"] .stk-card { color: #1a1a1a; background: rgba(255, 255, 255, 0.98); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12), 0 18px 40px -18px rgba(0, 0, 0, 0.35); }
[data-stk-theme="light"] .stk-card-caps { color: #7f6206; }
[data-stk-theme="light"] .stk-card-name, [data-theme="light"] .stk-card dd { color: #1a1a1a; }
[data-stk-theme="light"] .stk-card-role { color: #2c3138; }
[data-stk-theme="light"] .stk-card dt { color: #636a75; }
[data-stk-theme="light"] .stk-card-foot a.out { color: #0b7f68; }
[data-stk-theme="light"] .stk-go { color: #ffffff; background: #0b7f68; }
.stk-lockup { color: #f6f7f8; }
.stk-lockup[data-theme="light"] { color: #1a1a1a; }
.stk-lockup[data-theme="light"] .rule { background: rgba(0, 0, 0, 0.3); }
.stk-lockup[data-theme="light"] .line { color: #4a515a; }
.stk-lockup[data-theme="light"] .stk-word { color: #1a1a1a; }
`;
const svgUrl = (inner: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'>${inner}</svg>`)}")`;
// ui/glyph.css's popout and next (chev-r), as published there
const POPOUT = svgUrl("<rect x='1.75' y='3.75' width='6.5' height='6.5' rx='1.2' fill='none' stroke='black' stroke-width='1.2'/><path d='M6 6l4.25-4.25M7.25 1.75h3v3' fill='none' stroke='black' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/>");
const NEXT = svgUrl("<path d='M4.5 3l3 3-3 3' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/>");

export function injectCss() {
  if (document.getElementById('stk-css')) return;
  const s = document.createElement('style'); s.id = 'stk-css'; s.textContent = CSS; document.head.appendChild(s);
  document.documentElement.style.setProperty('--stk-popout', POPOUT);
  document.documentElement.style.setProperty('--stk-next', NEXT);
}

const NS = 'http://www.w3.org/2000/svg';
const sv = (n, a) => { const e = document.createElementNS(NS, n); for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v)); return e; };
let gradN = 0;

/** The pieces' labels: items { id, x, y, plain, name?, logo?, caption?, align, cls? }; a logo (the registry's id, or
 *  ids for one glass) stands in the name line's place as the owner's chip. Returns { root, els: Map(id -> el), set, clear }. */
export function labelLayer(host) {
  const box = document.createElement('div'); box.className = 'stk-labels'; host.appendChild(box);
  const els = new Map();
  const place = (el, x, y, align, W) => {
    const w = el.offsetWidth, h = el.offsetHeight;
    let px, py;
    if (align === 'left') { px = x - w - 6; py = y - h / 2; }
    else if (align === 'right') { px = x + 6; py = y - h / 2; }
    else if (align === 'above') { px = x - w / 2; py = y - h - 4; }
    else if (align === 'inside') { px = x + 4; py = y + 4; }
    else { px = x - w / 2; py = y + 6; }
    px = Math.max(8, Math.min(W - 8 - w, px));
    el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
    return { x: px, y: py, w, h };
  };
  return {
    root: box, els,
    set(items, W) {
      const rects = new Map();
      for (const it of items) {
        let el = els.get(it.id);
        if (!el) {
          el = document.createElement('div'); el.className = `stk-lab${it.cls ? ` ${it.cls}` : ''}`; el.dataset.piece = it.id; el.dataset.align = it.align ?? 'below';
          const b = document.createElement('b'); b.style.fontWeight = 'inherit'; b.textContent = it.plain; el.appendChild(b);
          if (it.logo) { el.classList.add('has-logo'); el.appendChild(logoChip(it.logo, { caption: it.caption })); }
          else if (it.name) { const s = document.createElement('span'); s.textContent = it.name; el.appendChild(s); }
          box.appendChild(el); els.set(it.id, el);
        }
        rects.set(it.id, place(el, it.x, it.y, it.align ?? 'below', W));
      }
      for (const [id, el] of els) if (!items.some((i) => i.id === id)) { el.remove(); els.delete(id); }
      return rects;
    },
    clear() { box.replaceChildren(); els.clear(); },
  };
}

/** Chapter 05's key card (engine.ts legendEl), at the 1920 cut's size: each row a drawn sample of the scene's line. */
export function keyCard(host, spec, theme) {
  const box = document.createElement('div'); box.className = 'stk-key'; box.dataset.theme = theme;
  const tt = document.createElement('div'); tt.className = 'stk-key-title'; tt.textContent = spec.title; box.appendChild(tt);
  const head = (d, c) => sv('path', { d, fill: 'none', stroke: c, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'miter' });
  for (const r of spec.rows) {
    const row = document.createElement('div'); row.className = 'stk-key-row';
    const s = sv('svg', { width: 40, height: 16, viewBox: '0 0 30 12' });
    const c = r.color, w = r.width ?? 1.5;
    if (r.kind === 'comets') {
      const defs = sv('defs', {}); s.append(defs);
      for (const [x1, x2] of [[1.5, 13], [15.5, 27]]) {
        const id = `stk-cm-${++gradN}`;
        const gr = sv('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: x1 - 1, y1: 6, x2, y2: 6 });
        gr.append(sv('stop', { offset: 0, 'stop-color': c, 'stop-opacity': 0 }), sv('stop', { offset: 1, 'stop-color': c, 'stop-opacity': 1 }));
        defs.append(gr);
        s.append(sv('line', { x1, y1: 6, x2, y2: 6, stroke: `url(#${id})`, 'stroke-width': 5.5, 'stroke-opacity': 0.3, 'stroke-linecap': 'round' }));
        s.append(sv('line', { x1, y1: 6, x2, y2: 6, stroke: `url(#${id})`, 'stroke-width': w, 'stroke-linecap': 'round' }));
      }
    } else if (r.kind === 'pair') {
      for (const y of [3.6, 8.4]) s.appendChild(sv('line', { x1: 2, y1: y, x2: 28, y2: y, stroke: c, 'stroke-width': 1.3, 'stroke-linecap': 'round' }));
      s.appendChild(head('M24.4,1 L27,3.6 L24.4,6.2', c)); s.appendChild(head('M5.6,5.8 L3,8.4 L5.6,11', c));
    } else if (r.kind === 'designed') {
      const ln = sv('line', { x1: 2, y1: 6, x2: 21, y2: 6, stroke: c, 'stroke-width': 1.3, 'stroke-linecap': 'round', 'stroke-dasharray': '0.1 3.4', 'stroke-opacity': 0.75 });
      s.appendChild(ln); s.appendChild(sv('circle', { cx: 25.4, cy: 6, r: 2.8, fill: 'none', stroke: c, 'stroke-width': 1.2, 'stroke-opacity': 0.8 }));
    } else {
      if (r.glow) s.appendChild(sv('line', { x1: 2, y1: 6, x2: 28, y2: 6, stroke: c, 'stroke-width': r.glow, 'stroke-opacity': 0.22, 'stroke-linecap': 'round' }));
      const ln = sv('line', { x1: r.dash ? 3 : 2, y1: 6, x2: r.dash ? 27 : 28, y2: 6, stroke: c, 'stroke-width': w, 'stroke-linecap': 'round' });
      if (r.dash) ln.setAttribute('stroke-dasharray', r.dash);
      s.appendChild(ln);
      if (r.arrow) s.appendChild(head('M23.8,2.8 L27,6 L23.8,9.2', c));
    }
    const sp = document.createElement('span'); sp.textContent = r.text; row.append(s, sp); box.appendChild(row);
  }
  host.appendChild(box);
  return box;
}

/** Zone titles at stage px (the diagram's capitals). */
export function zoneTitles(host, items, theme) {
  return items.map((it) => {
    const e = document.createElement('div'); e.className = 'stk-zone'; e.dataset.theme = theme; e.textContent = it.text;
    e.style.transform = `translate3d(${it.x.toFixed(1)}px, ${(it.y - 8).toFixed(1)}px, 0)`; host.appendChild(e);
    return e;
  });
}

/** The owners' logo chips in one wrapped row (a phone's stage, where labels would collide): logos, each the registry's
 *  id or ids for one glass, in the order given; its top at y. Returns the row. */
export function logoStrip(host, logos, y) {
  const row = document.createElement('div'); row.className = 'stk-strip';
  for (const l of logos) row.appendChild(logoChip(l.logo, { caption: l.caption }));
  row.style.top = `${Math.round(y)}px`;
  host.appendChild(row);
  return row;
}

/** Keeps a code's letters and number together across a line end (SHA-256, ERC-8004): a non-breaking hyphen. */
const nb = (t) => t.replace(/([A-Z])-(\d)/g, '$1\u2011$2');

/** A piece's card (pieces.ts Card): caps, the role's glyph and the name, the role, label and value rows (monospace for
 *  hashes and figures, linked out where a value has a page), the link out with the popout glyph, and the button to the
 *  site's tab with the next glyph. onRoute(tab) runs on the button; without it the button is left out. */
export function pieceCard(host, c, { glyphColor = null, onRoute = null } = {}) {
  const el = document.createElement('div'); el.className = 'stk-card stk-pop'; el.dataset.piece = c.id; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', c.name);
  const caps = document.createElement('div'); caps.className = 'stk-card-caps'; caps.textContent = c.caps;
  const head = document.createElement('div'); head.className = 'stk-card-head';
  if (c.glyph) head.appendChild(glyphSvg(c.glyph, { size: 22, color: glyphColor ?? 'currentColor', width: 1.4 }));
  const name = document.createElement('div'); name.className = 'stk-card-name'; name.textContent = c.name; head.appendChild(name);
  const role = document.createElement('div'); role.className = 'stk-card-role'; role.textContent = nb(c.role);
  el.append(caps, head, role);
  const dl = document.createElement('dl');
  for (const [k, parts] of c.rows) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd');
    for (const p of parts) {
      const sp = document.createElement(p.href ? 'a' : 'span');
      if (p.href) { sp.href = p.href; sp.target = '_blank'; sp.rel = 'noopener'; }
      if (p.mono) sp.className = 'stk-mono';
      if (p.block) sp.style.display = 'block';
      sp.textContent = nb(p.t); dd.appendChild(sp);
    }
    dl.append(dt, dd);
  }
  el.appendChild(dl);
  const foot = document.createElement('div'); foot.className = 'stk-card-foot';
  if (c.link) {
    const a = document.createElement('a'); a.className = 'out'; a.href = c.link.href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = c.link.text;
    const i = document.createElement('i'); i.className = 'g g-popout'; a.appendChild(i); foot.appendChild(a);
  }
  if (onRoute) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'stk-go'; b.dataset.route = c.route;
    b.textContent = `Open ${c.routeLabel}`; const i = document.createElement('i'); i.className = 'g g-next'; b.appendChild(i);
    b.addEventListener('click', (e) => { e.stopPropagation(); onRoute(c.route); });
    foot.appendChild(b);
  }
  if (foot.childNodes.length) el.appendChild(foot);
  host.appendChild(el);
  return el;
}

/** Places a card beside a screen box (bx: { x0, y0, x1, y1 } in stage px): of the places beside it (right, left, under,
 *  over, each at the box's start, middle or end), inside the stage with a 16 px margin, the one that covers least of the
 *  other pieces (others: their boxes) and sits nearest; never over the piece itself or the point (px, py). */
export function placeCard(el, bx, W, H, px = null, py = null, others = []) {
  const w = el.offsetWidth, h = el.offsetHeight, m = 16, gap = 24;
  const cx = (bx.x0 + bx.x1) / 2, cy = (bx.y0 + bx.y1) / 2;
  const clampX = (x) => Math.max(m, Math.min(W - m - w, x)), clampY = (y) => Math.max(m, Math.min(H - m - h, y));
  const cand = [];
  for (const y of [bx.y0, cy - h / 2, bx.y1 - h]) { cand.push([bx.x1 + gap, y], [bx.x0 - gap - w, y]); }
  for (const x of [bx.x0, cx - w / 2, bx.x1 - w]) { cand.push([x, bx.y1 + gap], [x, bx.y0 - gap - h]); }
  const area = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  let best = null;
  for (const [x0, y0] of cand) {
    const x = clampX(x0), y = clampY(y0), r = { x0: x, y0: y, x1: x + w, y1: y + h };
    const own = area(r, bx), ptr = px != null && px >= x - 8 && px <= x + w + 8 && py >= y - 8 && py <= y + h + 8;
    const cover = others.reduce((s, o) => s + (o ? area(r, o) : 0), 0);
    const dist = Math.hypot(x + w / 2 - cx, y + h / 2 - cy);
    const score = own * 50 + (ptr ? 1e9 : 0) + cover + dist * 40;
    if (!best || score < best.score) best = { x, y, score };
  }
  el.style.setProperty('--x', `${best.x.toFixed(1)}px`); el.style.setProperty('--y', `${best.y.toFixed(1)}px`);
  return { x: best.x, y: best.y, w, h };
}

/** The pointer, drawn (the system arrow's shape) for a hover still. */
export function pointer(host, x, y) {
  const s = sv('svg', { class: 'stk-pointer', viewBox: '0 0 22 22', width: 22, height: 22 });
  s.appendChild(sv('path', { d: 'M3 2 L3 17.5 L7.2 13.6 L10 20 L12.6 18.9 L9.9 12.6 L15.6 12.6 Z', fill: '#ffffff', stroke: '#101315', 'stroke-width': 1.3, 'stroke-linejoin': 'round' }));
  s.style.transform = `translate3d(${x - 3}px, ${y - 2}px, 0)`;
  host.appendChild(s);
  return s;
}
