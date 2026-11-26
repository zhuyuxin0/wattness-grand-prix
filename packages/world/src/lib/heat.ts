// The walkthrough's scales (kit/hedge/fields.ts): an hour's dollars as a height, 1.4 asinh($ / 1,500), and as a
// color on the heat ramp, blue earned, red paid, gray near zero, always read against zero.
import { HEAT, heatAt, hOf, vOf } from '../kit/hedge/fields';
import type { Theme } from './stage';

export { HEAT, heatAt, hOf, vOf };

const V0 = 1500, SAT = 12000;

/** Where an hour's dollars sit on the ramp: -1 most paid, 0 zero, 1 most earned (saturating at $12,000). */
export function heatT(usd: number): number {
  return Math.max(-1, Math.min(1, Math.asinh(usd / V0) / Math.asinh(SAT / V0)));
}

const hexRgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** The same ramp point as a CSS color, for DOM keys and swatches: the two stops' hexes mixed at heatAt's step (64
 *  steps a stop). heatAt's linear color lands on the same stops on screen; between stops the two agree to within the
 *  tone curve's bend. */
export function heatCss(theme: Theme, usd: number): string {
  const stops = HEAT[theme];
  const f = 4 + heatT(usd) * 4, i = Math.max(0, Math.min(7, Math.floor(f))), k = Math.round((f - i) * 64) / 64;
  const a = hexRgb(stops[i]), b = hexRgb(stops[i + 1]);
  return '#' + a.map((x, j) => Math.round(x + (b[j] - x) * k).toString(16).padStart(2, '0')).join('');
}

/** The ramp as a CSS gradient, most paid to most earned (the key card's bar). */
export function heatGradient(theme: Theme): string {
  return `linear-gradient(90deg, ${HEAT[theme].join(', ')})`;
}
