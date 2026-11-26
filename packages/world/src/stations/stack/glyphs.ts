// @ts-nocheck
// The six agents' role glyphs, drawn in the Terminal's glyph style (ui/glyph.css's workspace icons: a 16-unit box,
// 1.3 strokes, round caps and joins). Three are the Terminal's own: the market's candles (ws-market) for the Market
// reader, the battery (ws-battery) for the State keeper, the bounded band (ws-hedging) for the Hedger. Three are new
// in the same hand: the Forecaster's fan of scenarios off a history line, the Risk officer's distribution with its
// tail cut, the Planner's three arms with the chosen one checked. Symbols, not words, so they may go into the 3D: each
// pod wears its glyph on its glass, and the card repeats it beside the name.
import * as THREE from 'three';

export const GLYPHS = {
  market: 'M4.75 1.75v12.5M3.25 4.75h3v5.5h-3zM11.25 1.75v12.5M9.75 6.25h3v4.5h-3z',
  state: 'M3.25 4.75h9a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-4.5a1 1 0 0 1 1-1zM15 6.75v2.5M5 7v2M7.25 7v2',
  forecaster: 'M1.75 10.75l2.5-2.5 2.25 1.5M6.5 9.75L14.25 3.75M6.5 9.75h7.75M6.5 9.75l7.75 4',
  hedger: 'M2 3.25h12M2 12.75h12M2.75 10l2.5-3.5 2.5 2.75 2.75-4.25 2.75 3',
  risk: 'M1.75 13.25h12.5M2.25 13c2.5 0 3.25-9.25 5.75-9.25S11.25 13 13.75 13M5 13.25V8.5',
  planner: 'M2 3.75h9M2 8h9M2 12.25h5.25M9.25 12.25l1.75 1.75 3.25-3.5',
};

/** The color each role's glyph wears: the flow that feeds it (prices into the Market reader and the Forecaster, the
 *  battery's physical limits teal, the hedge's orange, odds in the files' gray, the Planner in the seal's yellow). */
export const GLYPH_COLOR = {
  dark: { market: '#b481f0', forecaster: '#b481f0', state: '#2ec7a6', hedger: '#eb6834', risk: '#c6cfd9', planner: '#F0B90B' },
  light: { market: '#6345b1', forecaster: '#6345b1', state: '#1fae8f', hedger: '#e35f2a', risk: '#636a75', planner: '#b08405' },
};

/** The glyph as an inline SVG element for the DOM (currentColor, so it takes its text's color unless given one). */
export function glyphSvg(id, { size = 16, color = 'currentColor', width = 1.3 } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('width', String(size)); s.setAttribute('height', String(size)); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', GLYPHS[id]); p.setAttribute('fill', 'none'); p.setAttribute('stroke', color); p.setAttribute('stroke-width', String(width));
  p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
  s.appendChild(p);
  return s;
}

/** The glyph drawn into a square canvas for the 3D: a soft glow under a crisp stroke, on clear. */
export function glyphTexture(id, color, { px = 512, theme = 'dark' } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d'), k = px / 16, path = new Path2D(GLYPHS[id]);
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = color;
  g.setTransform(k * 0.86, 0, 0, k * 0.86, px * 0.07, px * 0.07);
  // the glow: the same stroke, wide and faint, blurred (a tint on the light theme, light on the night one)
  g.save(); g.filter = `blur(${(px / 90).toFixed(1)}px)`; g.globalAlpha = theme === 'light' ? 0.28 : 0.3; g.lineWidth = 2.6; g.stroke(path); g.restore();
  g.lineWidth = 1.3; g.globalAlpha = 1; g.stroke(path);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
