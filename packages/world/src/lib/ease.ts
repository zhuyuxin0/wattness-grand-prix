// Motion, as the intro and the walkthrough move: a pose is a pure function of time, each move eased by smoothstep of
// its fraction, beats inside a move as smoothstep over a share of it, a critically damped spring on top, and camera
// blends that take angles the short way and distance, lens and picture scale in log.
import type { CameraPose, Vec2, Vec3 } from './stage';

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpN = <T extends number[]>(a: T, b: T, t: number) => a.map((v, i) => lerp(v, b[i] as number, t)) as T;
/** Degrees, the short way round. */
export const lerpAngle = (a: number, b: number, t: number) => a + ((((b - a) % 360) + 540) % 360 - 180) * t;
export const lerpLog = (a: number, b: number, t: number) => Math.exp(lerp(Math.log(a), Math.log(b), t));

export const smoothstep = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
/** smoothstep over the share [a, b] of a move's fraction e: a beat inside a move. */
export const seg = (e: number, a: number, b: number) => smoothstep((e - a) / (b - a));
export const easeInCubic = (x: number) => { const t = clamp01(x); return t * t * t; };
export const easeOutCubic = (x: number) => { const t = clamp01(x); return 1 - (1 - t) ** 3; };
export const easeInOutCubic = (x: number) => { const t = clamp01(x); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };

/** A CSS cubic-bezier as a function of x (Newton's method, then bisection where it stalls). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t: number) => ((ax * t + bx) * t + cx) * t, Y = (t: number) => ((ay * t + by) * t + cy) * t;
  const dX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    const s = clamp01(x);
    let t = s;
    for (let i = 0; i < 8; i++) { const e = X(t) - s, d = dX(t); if (Math.abs(e) < 1e-7) return Y(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    let lo = 0, hi = 1; t = s;
    for (let i = 0; i < 40; i++) { const e = X(t) - s; if (Math.abs(e) < 1e-7) break; if (e > 0) hi = t; else lo = t; t = (lo + hi) / 2; }
    return Y(t);
  };
}
/** The house ease of the videos, cubic-bezier(0.22, 1, 0.36, 1). */
export const houseEase = cubicBezier(0.22, 1, 0.36, 1);

/** One exact step of a critically damped spring toward target (omega rad/s; settles in about 4 / omega). */
export function springStep(x: number, v: number, target: number, omega: number, dt: number): [number, number] {
  const d = x - target, e = Math.exp(-omega * dt), k = v + omega * d;
  return [target + (d + k * dt) * e, (v - omega * k * dt) * e];
}

/** Between two camera poses: angles the short way, the picture's scale (dist x tan(vfov / 2)) and the lens in log, so
 *  a lens that narrows while the camera climbs reads as one move. */
export function camBlend(A: CameraPose, B: CameraPose, t: number): CameraPose {
  const R = Math.PI / 360, ta = Math.tan(A.vfov * R), tb = Math.tan(B.vfov * R);
  const tv = Math.exp(lerp(Math.log(ta), Math.log(tb), t));
  const scale = Math.exp(lerp(Math.log(A.dist * ta), Math.log(B.dist * tb), t));
  const dist = scale / tv;
  return {
    target: lerpN([...A.target] as Vec3, [...B.target] as Vec3, t), az: lerpAngle(A.az, B.az, t), el: lerp(A.el, B.el, t), dist,
    vfov: Math.atan(tv) / R, shift: lerpN([...(A.shift ?? [0, 0])] as Vec2, [...(B.shift ?? [0, 0])] as Vec2, t),
    near: Math.max(0.1, dist * 0.05), far: Math.max(3000, dist * 3),
  };
}
