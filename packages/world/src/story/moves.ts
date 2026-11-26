// The camera between two rests. A glide blends the two poses as the intro's hand-offs do (lib/ease.ts camBlend:
// angles the short way, the picture's scale and the lens in log, so a rise that narrows the lens reads as one move),
// on a calm ease: smootherstep, at rest at both ends in speed and in acceleration. A hop joins two stations that stand
// far apart in the venue: the camera eases back out of the first along its own line of sight while the second fades
// in over it, already easing in to its rest, so neither picture ever empties into the ground between them.
import { camBlend, clamp01, lerp, lerpLog } from '../lib/ease';
import type { CameraPose } from '../lib/stage';

/** 6x^5 - 15x^4 + 10x^3. */
export const calm = (x: number) => { const t = clamp01(x); return t * t * t * (t * (6 * t - 15) + 10); };
export const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/** The near and far planes setCamera would give a pose (kit/stage.ts: near 2% of the distance, far 3,000 m). */
const nearOf = (p: CameraPose) => p.near ?? Math.max(0.1, p.dist * 0.02);
const farOf = (p: CameraPose) => p.far ?? 3000;

/** One side of a hop: the rest's pose drawn back along its line of sight by `back` (0 at the rest), a little higher. */
export function backOff(P: CameraPose, back: number): CameraPose {
  const k = 1 + 0.85 * back;
  return { ...P, dist: P.dist * k, el: Math.min(80, P.el + 6 * back), near: (P.near ?? Math.max(0.1, P.dist * 0.02)) * k, far: Math.max(P.far ?? 3000, P.dist * k * 4) };
}

const RAD = Math.PI / 180;
/** A pose's camera position (kit/stage.ts setCamera's spherical rule). */
function eye(P: CameraPose): [number, number, number] {
  const a = P.az * RAD, e = P.el * RAD, t = P.target;
  return [t[0] + Math.sin(a) * Math.cos(e) * P.dist, t[1] + Math.sin(e) * P.dist, t[2] - Math.cos(a) * Math.cos(e) * P.dist];
}

/** A dolly: the camera and the point it looks at each travel in a straight line (a move along a straight, inside a
 *  hall, where a blend of angles would swing the camera out through the roof); the lens in log. */
export function dolly(A: CameraPose, B: CameraPose, e: number): CameraPose {
  const k = calm(e);
  const ea = eye(A), eb = eye(B);
  const p = ea.map((v, i) => lerp(v, eb[i]!, k)) as [number, number, number];
  const t = A.target.map((v, i) => lerp(v, B.target[i]!, k)) as [number, number, number];
  const dx = p[0] - t[0], dy = p[1] - t[1], dz = p[2] - t[2], dist = Math.hypot(dx, dy, dz);
  const el = Math.asin(Math.max(-1, Math.min(1, dy / Math.max(1e-6, dist)))) / RAD;
  const az = Math.atan2(dx, -dz) / RAD;
  const sa = A.shift ?? [0, 0], sb = B.shift ?? [0, 0];
  return { target: t, az, el, dist, vfov: lerpLog(A.vfov, B.vfov, k), shift: [lerp(sa[0], sb[0], k), lerp(sa[1], sb[1], k)],
    near: lerpLog(nearOf(A), nearOf(B), k), far: Math.max(lerpLog(farOf(A), farOf(B), k), dist * 4) };
}

export function glide(A: CameraPose, B: CameraPose, e: number, hop = false): CameraPose {
  const k = calm(e);
  const c = camBlend(A, B, k);
  let near = lerpLog(nearOf(A), nearOf(B), k), far = lerpLog(farOf(A), farOf(B), k);
  if (hop) {
    // the lift: up to the height that keeps both stations in the picture (0.8 of the ground between them), a bump
    // that is zero with zero slope at both ends
    const dx = B.target[0] - A.target[0], dz = B.target[2] - A.target[2], D = Math.hypot(dx, dz);
    const bump = Math.sin(Math.PI * k) ** 2;
    const lift = Math.max(1, (0.8 * D) / Math.max(1, c.dist));
    c.dist *= lift ** bump;
    c.el = lerp(c.el, Math.max(c.el, 52), bump);
    near *= lift ** bump; far = Math.max(far, c.dist * 4);
  }
  c.near = near; c.far = Math.max(far, near * 50);
  return c;
}
