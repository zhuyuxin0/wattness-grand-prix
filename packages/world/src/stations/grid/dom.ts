// The grid frames' DOM over the canvas: the walkthrough's key card (top right) built with its own classes, and a
// stylesheet for the plates' liveries. Words only; nothing here is painted into the 3D.
import './grid.css';
import type { FrameContext } from '../types';

export interface KeyRow {
  /** A CSS background for the swatch (a hex or a gradient); 'ramp' draws the wide ramp bar. */
  swatch?: string;
  ramp?: string;
  /** A ring swatch (an outline in this color). */
  ring?: string;
  /** Several swatches side by side. */
  swatches?: string[];
  text: string;
  strong?: boolean;
}

/** The key card, top right, in the walkthrough's skin. Returns its rect in stage px. */
export function keyCard(ctx: FrameContext, rows: readonly KeyRow[], { title = '' } = {}) {
  const host = ctx.plates.root;
  host.querySelector('.gp-key')?.remove();
  const k = document.createElement('div'); k.className = 'hwalk-key gp-key';
  if (title) { const t = document.createElement('div'); t.className = 'gp-key-title'; t.textContent = title; k.appendChild(t); }
  for (const r of rows) {
    const row = document.createElement('div'); row.className = r.strong ? 'gp-key-row gp-strong' : 'gp-key-row';
    if (r.ramp) { const i = document.createElement('i'); i.className = 'gp-ramp'; i.style.background = r.ramp; row.appendChild(i); }
    else if (r.ring) { const i = document.createElement('i'); i.className = 'gp-ring'; i.style.borderColor = r.ring; row.appendChild(i); }
    else if (r.swatch) { const i = document.createElement('i'); i.className = 'gp-sw'; i.style.background = r.swatch; row.appendChild(i); }
    for (const sw of r.swatches ?? []) { const i = document.createElement('i'); i.className = 'gp-sw'; i.style.background = sw; row.appendChild(i); }
    const s = document.createElement('span'); s.textContent = r.text; row.appendChild(s);
    k.appendChild(row);
  }
  host.appendChild(k);
  const a = k.getBoundingClientRect(), b = host.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
}

/** A small plate pinned at stage px (no leader): a chip such as a clock's or a row's. */
export function chip(ctx: FrameContext, text: string, x: number, y: number, { kind = '', align = 'left' as 'left' | 'center' | 'right', sub = '' } = {}) {
  const e = document.createElement('div'); e.className = `intro-plate gp-chip${kind ? ` gp-${kind}` : ''}`;
  e.textContent = text;
  if (sub) { const s = document.createElement('span'); s.className = 'hwalk-plate-sub'; s.textContent = sub; e.appendChild(s); }
  ctx.plates.root.appendChild(e);
  const w = e.offsetWidth, h = e.offsetHeight;
  const px = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  e.style.transform = `translate3d(${px.toFixed(1)}px,${(y - h / 2).toFixed(1)}px,0)`;
  return { x: px, y: y - h / 2, w, h };
}
