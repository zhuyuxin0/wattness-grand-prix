// @ts-nocheck
// Ported from landing-3d/live/kit/tone.js (27 Oct 2026). Plain JS under a type pass: three.js has no types here.
// Colour helpers. The page renders through Khronos PBR Neutral tone mapping (exposure 1), which darkens
// low values (its toe subtracts an offset). Flat, unlit surfaces that must land on an exact hex on screen
// (the map ground, the stage, data bars) are fed the input that tone-maps back to that hex.

const START = 0.8 - 0.04;
const DESAT = 0.15;

function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

export function hexToLinear(hex) {
  const n = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex;
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

export function neutral(c, exposure = 1) {
  let [r, g, b] = c.map((v) => v * exposure);
  const x = Math.min(r, g, b);
  const off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  r -= off; g -= off; b -= off;
  const peak = Math.max(r, g, b);
  if (peak < START) return [r, g, b];
  const d = 1 - START;
  const np = 1 - (d * d) / (peak + d - START);
  r *= np / peak; g *= np / peak; b *= np / peak;
  const k = 1 - 1 / (DESAT * (peak - np) + 1);
  return [r + (np - r) * k, g + (np - g) * k, b + (np - b) * k];
}

/** Linear input that Neutral maps to the given sRGB hex (fixed-point iteration; exact to < 1/1000). */
export function preNeutral(hex, exposure = 1) {
  const target = hexToLinear(hex);
  let c = target.slice();
  for (let i = 0; i < 80; i++) {
    const f = neutral(c, exposure);
    c = c.map((v, k) => Math.max(0, v + (target[k] - f[k]) * 0.9));
  }
  return c;
}

/** A THREE.Color (linear working space) that renders as `hex` through Neutral tone mapping. */
export function exactColor(THREE, hex, exposure = 1) {
  const [r, g, b] = preNeutral(hex, exposure);
  return new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
}
