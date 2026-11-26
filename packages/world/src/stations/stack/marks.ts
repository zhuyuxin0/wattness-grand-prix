// @ts-nocheck
// The owners' marks, as they publish them (copied into marks/ from the storyboard's logos/, sources and hashes in
// its SOURCES.md), made into textures for the 3D: an SVG drawn at the size it is shown (vector, so crisp), one path of
// a lockup cropped to its own bounds (Living Brain's brain, AWS's smile), and BNB Chain's symbol split into its frame
// and its inner block for GateRecord's cube. Words stay DOM: only symbols go into the scene.
import * as THREE from 'three';
import bnbRaw from './marks/bnbchain.svg?raw';
import brainRaw from './marks/livingbrain.svg?raw';
import awsRaw from './marks/aws.svg?raw';
import cournotRaw from './marks/cournot-mark.svg?raw';
import flapRaw from './marks/flap-mark.svg?raw';
import atlasUrl from './marks/atlas-mark.svg?url';
import cmcUrl from './marks/cmc-mark.png?url';
import fourUrl from './marks/openfour-mark.png?url';

export const MARK_URLS = {
  bnbLogoYellow: new URL('./marks/bnbchain-logo-yellow.svg', import.meta.url).href,
  bnbLogoWhite: new URL('./marks/bnbchain-logo.svg', import.meta.url).href,
  cournotInk: new URL('./marks/cournot-ink.svg', import.meta.url).href,
  electronx: new URL('./marks/electronx-dark.png', import.meta.url).href,
  awsInk: new URL('./marks/aws-ink.svg', import.meta.url).href,
  brainInk: new URL('./marks/livingbrain-ink.svg', import.meta.url).href,
  greenfield: new URL('./marks/greenfield.svg', import.meta.url).href,
  atlas: new URL('./marks/atlas.svg', import.meta.url).href,
  cmcInk: new URL('./marks/cmc-ink.svg', import.meta.url).href,
  flapPixel: new URL('./marks/flap-pixel.png', import.meta.url).href,
  four: new URL('./marks/openfour.svg', import.meta.url).href,
  ercot: new URL('./marks/ercot.svg', import.meta.url).href,
};

const canvasTex = (c) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
};
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const viewBox = (raw) => (attr(raw.match(/<svg[^>]*>/)[0], 'viewBox') ?? '0 0 100 100').split(/[\s,]+/).map(Number);
const paths = (raw) => [...raw.matchAll(/<path\b[^>]*>/g)].map((m) => ({ d: attr(m[0], 'd'), fill: attr(m[0], 'fill'), rule: attr(m[0], 'fill-rule') }));

/** BNB Chain's symbol in a square canvas over its own 96-unit viewBox: red is the frame (every piece but one), green
 *  the inner block (the second subpath, the Y-shaped block at the center). */
export function bnbMarkTexture(size = 2048) {
  const d = paths(bnbRaw)[0].d;
  const subs = d.split(/(?=M)/).map((s) => s.trim()).filter(Boolean);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.scale(size / 96, size / 96);
  subs.forEach((s, i) => { g.fillStyle = i === 1 ? '#00ff00' : '#ff0000'; g.fill(new Path2D(s)); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  return { texture: t, subpaths: subs.length, hex: { x0: 7, x1: 89.2857, y0: 0, y1: 96 } };
}

/** One path of an SVG (index i) drawn alone, cropped to its own bounds plus pad, at px across; color overrides fill. */
export function pathTexture(raw, i, { px = 1024, color = null, pad = 0.04 } = {}) {
  const p = paths(raw)[i], [vx, vy, vw, vh] = viewBox(raw);
  // its bounds, from a coarse raster
  const probe = document.createElement('canvas'), ps = 1200 / Math.max(vw, vh);
  probe.width = Math.ceil(vw * ps); probe.height = Math.ceil(vh * ps);
  const pg = probe.getContext('2d');
  pg.setTransform(ps, 0, 0, ps, -vx * ps, -vy * ps); pg.fill(new Path2D(p.d), p.rule === 'evenodd' ? 'evenodd' : 'nonzero');
  const img = pg.getImageData(0, 0, probe.width, probe.height).data;
  let x0 = probe.width, y0 = probe.height, x1 = 0, y1 = 0;
  for (let y = 0; y < probe.height; y++) for (let x = 0; x < probe.width; x++) if (img[(y * probe.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const bw = (x1 - x0 + 1) / ps, bh = (y1 - y0 + 1) / ps, bx = vx + x0 / ps, by = vy + y0 / ps;
  const padU = Math.max(bw, bh) * pad, w = bw + 2 * padU, h = bh + 2 * padU;
  const c = document.createElement('canvas'), s = px / w;
  c.width = px; c.height = Math.ceil(h * s);
  const g = c.getContext('2d');
  g.setTransform(s, 0, 0, s, (-bx + padU) * s, (-by + padU) * s);
  g.fillStyle = color ?? p.fill ?? '#ffffff';
  g.fill(new Path2D(p.d), p.rule === 'evenodd' ? 'evenodd' : 'nonzero');
  return { texture: canvasTex(c), aspect: c.width / c.height };
}

/** Living Brain's brain (the lockup's second path, #FF4D20). */
export const brainTexture = (color = null) => pathTexture(brainRaw, 1, { color });
/** AWS's smile (the lockup's smile part). */
export const smileTexture = (color = null) => pathTexture(awsRaw, 1, { color, px: 1600 });
/** Flap's mark (both halves, lime). */
export function flapTexture(px = 1024) {
  const ps = paths(flapRaw), c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d'); g.scale(px / 32, px / 32); g.translate(2.4, 4);
  for (const p of ps) { g.fillStyle = p.fill; g.fill(new Path2D(p.d)); }
  return { texture: canvasTex(c), aspect: 1 };
}
/** Cournot's nine dots, as their centers in the mark's own 100-unit box (the dark disc behind them left out). */
export function cournotDots() {
  return [...cournotRaw.matchAll(/<circle\b[^>]*>/g)].map((m) => ({ cx: +attr(m[0], 'cx'), cy: +attr(m[0], 'cy'), r: +attr(m[0], 'r'), fill: attr(m[0], 'fill') }))
    .filter((c) => c.fill !== '#282826');
}

/** An image (SVG or PNG) drawn into a canvas px wide (an SVG rasterizes at the drawn size); resolves to a texture. */
export function imageTexture(url, px = 1024) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const a = (img.naturalWidth || 1) / (img.naturalHeight || 1);
      const c = document.createElement('canvas'); c.width = px; c.height = Math.max(1, Math.round(px / a));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      ok({ texture: canvasTex(c), aspect: a });
    };
    img.onerror = () => fail(new Error(`mark did not load: ${url}`));
    img.src = url;
  });
}
export const atlasTexture = () => imageTexture(atlasUrl, 1024);
export const cmcTexture = () => imageTexture(cmcUrl, 512);
export const fourTexture = () => imageTexture(fourUrl, 512);
