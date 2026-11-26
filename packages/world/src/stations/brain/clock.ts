// The brain station's one clock (SPEC 4.1): its named moments, and the world's pose and its words at any second of the
// Living Brain sequence, as stations/opening/gather.ts does for the opening. Every frame of the station is this world
// at some moment of this clock; the story's films run it through their holds (beats.ts run).
import * as THREE from 'three';
import { BrainWorld, ORBIT, REST, type CloudPose, type WorldPose } from './world';
import { BRAIN_IDS, SCENE, brainOf, type BrainId } from './data';

export { T, T_SHARED, ROWS, type Moments } from './moments';
import { T as T_FULL, type Moments } from './moments';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const calm = (x: number) => { const t = clamp01(x); return t * t * t * (t * (6 * t - 15) + 10); };
const outCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const DEG = Math.PI / 180;

/** Living Brain's auto-rotate: one turn in 160 s. */
export const SPIN = (2 * Math.PI) / 160;

/** The integral of a smoothstep ramp over [a, b], from a to t. */
function rampInt(t: number, a: number, b: number) {
  if (t <= a) return 0;
  const w = b - a;
  if (t >= b) return w * 0.5 + (t - b);
  const x = (t - a) / w;
  return w * (x * x * x - (x * x * x * x) / 2);
}
/** Seconds the spin has stood still by t: it eases to a stop over the turn and holds through LB5, then eases back. */
function paused(T: Moments, t: number) {
  return rampInt(t, T.turn[0], T.turn[1]) - rampInt(t, T.pull[0], T.pull[0] + 1.0) + rampInt(t, T.fly[0], T.fly[1]);
}

/** The world, posed for one second of the sequence. */
export class FilmClock {
  /** The turn that brings Battery Tab to face the camera (radians, added to the spin from LB5 on), and the review's one
   *  page in the fly (LB7). */
  readonly turn: number;
  readonly turn2: number;
  /** The orbits' common phase, and the shift the review and the Terminal take in the dive (they take the Grand Prix
   *  brain's orbit, 180 degrees apart, so LB6 has the review left of Battery Tab and the Terminal right of it). */
  readonly phase: number;
  readonly shift: number;

  readonly T: Moments;

  constructor(readonly w: BrainWorld, moments: Moments = T_FULL) {
    this.T = moments;
    const T = moments;
    // the horizontal angle (atan2(x, z)) of Battery Tab in the Grand Prix cloud, and the camera's
    const s = w.members['grand-prix'].spots, i = w.batteryIndex;
    const phi = Math.atan2(s[i * 3]!, s[i * 3 + 2]!);
    const camAng = Math.atan2(Math.sin(REST.az * DEG), -Math.cos(REST.az * DEG));
    const base = SPIN * (T.turn[1] - paused(T, T.turn[1]));
    // yaw psi maps the page's angle phi to phi + psi: face the camera, by the short way
    this.turn = wrap(camAng - phi - base);
    // the review's one page faces the camera as the fly lands (the spin has stopped by then)
    const rs = w.members['battery-review'].spots;
    const phiR = Math.atan2(rs[0]!, rs[2]!);
    this.turn2 = 0;
    this.turn2 = wrap(camAng - phiR - this.spin(T.fly[1]));
    // the orbits' phase: chosen by a search over LB2 and LB3 for the least cover of the combined brain by its members,
    // with the Grand Prix member left of center at LB3's rest
    this.phase = T.phase * DEG;
    // LB6: the review screen-left, the Terminal (180 degrees on) screen-right, at the middle of the across links' shot
    const mid = (T.across[0] + T.lb6) / 2;
    const reviewAt = this.phase + (2 * Math.PI) / 3 - 30 * DEG + (2 * Math.PI * mid) / ORBIT.period;
    this.shift = wrap(this.thetaFor(camAng - 90 * DEG, mid) - reviewAt);
  }

  /** The orbit angle that puts a member at compass angle kappa at t (orbitAt's angle runs the other way round, and the
   *  spin carries the system). */
  thetaFor(kappa: number, t: number) { return Math.PI / 2 - kappa + this.spin(t); }

  /** The spin about the vertical at t (radians): Living Brain's 2.25 degrees a second, stopped through LB5, plus the
   *  turn to Battery Tab. */
  spin(t: number) {
    const T = this.T;
    return SPIN * (t - paused(T, t)) + (this.turn ?? 0) * calm(seg(t, T.turn[0], T.turn[1])) + (this.turn2 ?? 0) * calm(seg(t, T.fly[0], T.fly[1]));
  }

  /** Member m's orbit angle in the spinning frame at t (radians): 46 s a turn, its phase 2 pi m / 3; in the dive the
   *  review and the Terminal spread to 180 degrees apart and move to their LB6 places (unseen: they fade with the zoom). */
  orbitAngle(m: number, t: number) {
    const T = this.T;
    const spread = calm(seg(t, T.dive[0], T.dive[1] + 2));
    const take = m === 1 ? -30 * DEG : m === 2 ? 30 * DEG : 0;
    return this.phase + (2 * Math.PI * m) / 3 + (2 * Math.PI * t) / ORBIT.period + (take + (m ? this.shift : 0)) * spread;
  }

  /** Member m's position in the world at t, on its orbit (the spin carries the whole system). */
  orbitPos(m: number, t: number, out = new THREE.Vector3()) {
    BrainWorld.orbitAt(m, this.orbitAngle(m, t), out);
    return out.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.spin(t));
  }

  /** LB1's row: the review at -1.6, the Grand Prix brain at 0, the Terminal at +1.6, along the camera's right. */
  rowPos(m: number, out = new THREE.Vector3()) {
    const x = m === 0 ? 0 : m === 1 ? -1.6 : 1.6;
    const a = REST.az * DEG;
    return out.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(-x);
  }

  pose(t: number): WorldPose {
    const T = this.T;
    const w = this.w, yaw = this.spin(t);
    const tint = (b: BrainId) => new THREE.Color(brainOf(b).color);
    const member = (b: BrainId, m: number): CloudPose => {
      // placement: the row, then the orbit; the Grand Prix brain comes to the center in the dive; the review in the fly
      const row = this.rowPos(m), orb = this.orbitPos(m, t);
      const toOrbit = calm(seg(t, T.combine[0], T.combine[0] + 1.6));
      const pos = row.clone().lerp(orb, toOrbit);
      let scale = lerp(0.7, 0.42 * (m === 0 ? 1.0 : m === 1 ? 0.92 : 1.08), toOrbit), tintK = 0.72, core = 0, breath = 0;
      if (b === 'grand-prix') {
        const k = calm(seg(t, T.dive[0], T.dive[1])), back = calm(seg(t, T.fly[0], T.fly[1]));
        pos.lerp(new THREE.Vector3(0, 0, 0), k);
        scale = lerp(scale, 1, k); tintK = lerp(0.72, 0, k); core = smooth(seg(t, T.dive[0] + 0.6, T.dive[1] + 0.6)); breath = 0.06 * k;
        if (back > 0) {
          // in the fly it leaves the center for the review's place on the orbit
          pos.lerp(this.orbitPos(1, t), back); scale = lerp(scale, 0.42, back); tintK = lerp(tintK, 0.72, back); core *= 1 - back; breath *= 1 - back;
        }
      }
      if (b === 'battery-review') {
        const k = calm(seg(t, T.fly[0], T.fly[1]));
        pos.lerp(new THREE.Vector3(0, 0, 0), k);
        scale = lerp(scale, 1, k); tintK = lerp(0.72, 0, k); core = 0.75 * smooth(seg(t, T.fly[0] + 0.6, T.fly[1] + 0.6)); breath = 0.06 * k;
      }
      // the main brain is the one at the center; the others fade with the zoom as Living Brain's do
      const mainK = b === 'grand-prix' ? calm(seg(t, T.dive[0], T.dive[1])) * (1 - calm(seg(t, T.fly[0], T.fly[1])))
        : b === 'battery-review' ? calm(seg(t, T.fly[0], T.fly[1])) : 0;
      // on its orbit a member turns to show its profile (moments.ts yawM), as it leaves LB1's row; at the center it
      // turns back to the spin's yaw, as the main brain
      const memberYaw = yaw + T.yawM[m]! * DEG * toOrbit * (1 - mainK);
      const zoom = smooth(seg(this.camDist(t), 2.15, 3.1));
      // members out of the dive's and the flight's way: the others fade as the camera starts in (and come back with the
      // pull back for LB6), so none sweeps past the lens
      const awayDive = b !== 'grand-prix' ? smooth(seg(t, T.dive[0], T.dive[0] + 0.8)) * (1 - smooth(seg(t, T.pull[0], T.pull[1]))) : 0;
      const awayFly = b !== 'battery-review' ? smooth(seg(t, T.fly[0], T.fly[0] + 0.8)) : 0;
      const fade = lerp(zoom, 1, mainK) * (1 - Math.max(awayDive, awayFly));
      const form = seg(t, T.form[0], T.form[1]);
      const pf = smooth(seg(t, T.form[0] + 1.8, T.form[0] + 2.9));
      // selection: Battery Tab in LB5 and LB6
      const gpSel = b === 'grand-prix' && t >= T.wipe[0] && t < T.fly[0] + 0.6;
      return {
        pos, scale, yaw: memberYaw,
        st: {
          time: t, form, coreForm: core > 0 ? 1 : 0, breath, tint: tint(b), tintK, bright: fade, coreK: core,
          pageFade: pf * fade, sel: gpSel ? w.batteryIndex : -1, selT: gpSel ? ((t - T.wipe[0]) / 2) * 1.1 : 0,
          hi: b === 'battery-review' ? reviewHi(T, t) : null,
        },
      };
    };
    const members = {} as Record<BrainId, CloudPose>;
    BRAIN_IDS.forEach((b, m) => { members[b] = member(b, m); });
    // the combined brain: forms at the center in the combine, fades out in the dive
    const c0 = T.combine[0];
    const cFade = 1 - smooth(seg(t, T.dive[0], T.dive[0] + 0.6 * (T.dive[1] - T.dive[0])));
    const center: CloudPose = {
      pos: new THREE.Vector3(0, 0, 0), scale: 1, yaw,
      st: {
        time: t, form: seg(t, c0, c0 + 3.2), coreForm: outCubic(seg(t, c0 + 0.6, c0 + 3.0)), breath: 0.06, tint: new THREE.Color(1, 1, 1), tintK: 0,
        bright: t < c0 ? 0 : cFade * (1 - 0.28 * smooth(seg(t, T.first[0] - 0.6, T.first[0] + 0.4)) * (1 - smooth(seg(t, T.lb3, T.dive[0])))), coreK: t < c0 ? 0 : cFade, pageFade: smooth(seg(t, c0 + 1.8, c0 + 2.9)) * cFade, sel: -1, selT: 0,
        // the links across brains at full while they draw, settling to 0.6 after LB3's rest, so the combined brain
        // reads as a brain under them
        extraTime: (t - T.first[0]) * T.landing, extraFade: t < T.first[0] ? 0 : cFade * lerp(1, 0.6, smooth(seg(t, T.lb3, T.lb3 + 1.0))),
      },
    };
    const dist = this.camDist(t);
    const target = new THREE.Vector3();
    // the camera follows the brain coming to the center: the Grand Prix brain in the dive, the review in the fly
    if (t >= T.dive[0] && t < T.dive[1]) target.copy(members['grand-prix'].pos).multiplyScalar(1 - calm(seg(t, T.dive[0] + 0.8, T.dive[1])));
    if (t >= T.fly[0] && t < T.fly[1]) target.copy(members['battery-review'].pos).multiplyScalar(1 - calm(seg(t, T.fly[0] + 0.8, T.fly[1])));
    return {
      time: t,
      cam: { target, az: REST.az, el: this.camEl(t), dist },
      center, members,
      filaments: smooth(seg(t, c0 + 1.8, c0 + 2.9)) * cFade,
      orbs: smooth(seg(t, c0 + 2.9, c0 + 3.6)),
      motes: 1,
      sparks: t >= c0 && t < c0 + 2.6 ? t - c0 : null,
      landing: t >= T.first[0] && t < T.dive[0] ? (t - T.first[0]) * T.landing : null,
      links: t >= T.across[0] && t < T.fly[0] + 0.6 ? { t: t - T.across[0], fade: 1 - smooth(seg(t, T.fly[0], T.fly[0] + 0.6)) } : null,
      review: t >= T.remember ? t - T.remember : null,
      conflict: smooth(seg(t, T.conflict, T.conflict + 0.6)) * cFade,
    };
  }

  /** The virtual camera's elevation at t (degrees): Living Brain's 7.1 for one brain, a little higher for the combined
   *  view (moments.ts el), easing up in the combine and back down in the dive. */
  camEl(t: number) {
    const T = this.T;
    const up = calm(seg(t, T.combine[0], T.combine[0] + 2)) * (1 - calm(seg(t, T.dive[0], T.dive[1])));
    return lerp(REST.el, T.el, up);
  }

  /** The virtual camera's distance at t. */
  camDist(t: number) {
    const T = this.T;
    let d = 4.2;
    d = lerp(d, 4.6, calm(seg(t, T.combine[0], T.combine[0] + 2)));
    d = lerp(d, REST.dist, calm(seg(t, T.dive[0], T.dive[1])));
    d = lerp(d, 1.85, calm(seg(t, T.turn[0], T.turn[1])));
    d = lerp(d, 3.4, calm(seg(t, T.pull[0], T.pull[1])));
    d = lerp(d, 2.3, calm(seg(t, T.fly[0], T.fly[1])));
    return d;
  }
}

/** The review's one page: lit as the capture lands (remember), held through the retrieval, dimmed as the cutoff ring
 *  closes on it. */
function reviewHi(T: Moments, t: number): Float32Array {
  const lit = smooth(seg(t, T.remember + 0.75, T.remember + 1.1));
  const dim = smooth(seg(t, T.cutoff + 0.9, T.cutoff + 1.4));
  return new Float32Array([lerp(lerp(1, 2.4, lit), 0.55, dim)]);
}

const wrap = (a: number) => { let x = (a + Math.PI) % (2 * Math.PI); if (x < 0) x += 2 * Math.PI; return x - Math.PI; };

/** The across links' counts as they land: the number drawn by t on the landing clock. */
export function acrossLanded(w: BrainWorld, landing: number): number {
  const ex = w.center.spec.extra ?? [];
  return ex.filter((e) => (e.drawAt ?? 0) + 0.45 <= landing).length;
}

/** The counts the HUD and lines use, read from the data. */
export const COUNTS = {
  pages: SCENE.combined.pages,
  across: SCENE.combined.across,
  pairs: SCENE.combined.acrossByPair,
  conflicts: SCENE.conflicts.length,
};
