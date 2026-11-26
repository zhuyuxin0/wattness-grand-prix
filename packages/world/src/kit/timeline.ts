// THE INTRO'S TIMELINE: scroll -> one global time -> each scene's local time and opacity.
//
// Global time G runs 0..LAST. Every integer is a rest, in REST_ORDER (0 = '1a' ... 11 = 'us'), and END_INDEX (12) is
// the stop back over Texas ("We start with ERCOT."); from there to LAST the overlay fades out over the landing.
// Scroll maps to G linearly between rests, with a hold round every rest (the page scrolls, the picture stays). The
// scroller then runs G through a critically damped spring, so the camera glides and settles softly, as on
// battalion.energy. Each move is eased (smoothstep) before it reaches a scene, so a scene interpolates linearly
// between its own rests and still starts and stops softly.
//
// THE CHAPTER LENGTHS LIVE IN PACE, below, and nowhere else.
import type { IntroScene } from './scene-types';

export const PACE: Pace = {
  /** Screens of scrolling from one rest to the next (Jo's decision: about 1.6). */
  screensPerMove: 1.6,
  /** Moves that carry more than one rest's worth of motion, as a multiple of screensPerMove, by the stop they
   *  arrive at: 3c -> r1 (the climb away from the site into the grid) and r3 -> column (the layer lifts away, the
   *  site lands on the map and gathers into its column). The column's move is long so the gather and the rise read
   *  as one idea, the site becoming its column (Jo, 28 Oct: it took about a quarter of a second): with the hand-off
   *  early in it (handAt), the region keeps the 1 screen it had and the formation has about 2, twice what it had. */
  longer: { r1: 1.4, column: 2.4 } as Partial<Record<string, number>>,
  /** Share of a standard move held still round its two rests (half after the first, half before the second); the
   *  hold is the same length of scroll in a longer move. */
  hold: 0.3,
  /** Screens of scrolling over which a scene cross-fades into the next at a hand-off. */
  fadeScreens: 1 / 3,
  /** Where in a hand-off move the cross-fade is centred (0..1 of the move), by the stop the move arrives at; the
   *  outgoing scene's camera has locked onto the incoming scene's by then (site-scene.ts, region/engine.ts). */
  handAt: { r1: 0.6, column: 0.28 } as Partial<Record<string, number>>,
  /** After the last stop, the overlay fades out over this many moves. */
  endFade: 0.5,
  /** The spring's natural frequency (rad/s). Critically damped: it settles in about 4 / omega seconds. */
  springOmega: 6,
  /** A slower spring for a key or a rail click across these moves (by the stop the move arrives at, either way): one
   *  press otherwise ran the column's formation in half a second; at 2.4 the gather takes about half a second and the
   *  rise 0.9 s, and the camera is at rest about 4 s after the press (measured headless, 28 Oct). The wheel and the
   *  trackpad keep springOmega: the scroll itself sets their pace. */
  glide: { column: 2.4 } as Partial<Record<string, number>>,
};

export const REST_ORDER = ['1a', '1b', '2', '3a', '3b', '3c', 'r1', 'r2', 'r3', 'column', 'fleet', 'us'] as const;
export type RestId = typeof REST_ORDER[number];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const smoothstep = (a: number, b: number, x: number) => smooth((x - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A timeline's pacing (PACE's shape): the landing intro's is PACE; another overlay on the engine (the Hedging
 *  walkthrough, tabs/hedge/walkthrough/) brings its own. */
export interface Pace {
  screensPerMove: number;
  longer: Partial<Record<string, number>>;
  hold: number;
  fadeScreens: number;
  handAt: Partial<Record<string, number>>;
  endFade: number;
  springOmega: number;
  glide: Partial<Record<string, number>>;
}

/** A registered scene and the global stops it covers. The last scene also covers the end. */
export interface SceneSlot { scene: IntroScene; first: number; last: number; host: HTMLElement }
export interface SceneState { t: number; opacity: number }

/** One overlay's timeline over its rests: the functions below, bound to a rest order and a pace (read at each call, so
 *  a tuning of the pace object applies at once). The engine (engine.ts) takes one; the landing intro's is LANDING. */
export interface Timeline {
  readonly order: readonly string[];
  /** The stop after the last rest. */
  readonly END_INDEX: number;
  /** Global time at which the overlay is over (it has faded out). */
  readonly LAST: number;
  readonly PACE: Pace;
  /** The first stop from which the engine offers its still moments (engine.ts `still`); none before it. */
  readonly stillFrom: number;
  stopId(k: number): string;
  moveScreens(k: number): number;
  screensAt(k: number): number;
  totalScreens(): number;
  globalAt(screens: number): number;
  screensFor(G: number): number;
  placeScenes(scenes: readonly IntroScene[]): { first: number; last: number }[];
  handIn(f: number, k: number): number;
  handWindow(k: number): { from: number; at: number; to: number };
  sceneStates(slots: readonly { scene: IntroScene; first: number; last: number }[], G: number): SceneState[];
  nearestStop(G: number): { k: number; d: number };
}

export function makeTimeline(order: readonly string[], pace: Pace, stillFrom = 0): Timeline {
  const END = order.length, LASTG = END + pace.endFade;
  /** The id of stop k (the end is 'end'). */
  const stopId = (k: number): string => (k >= END ? 'end' : order[Math.max(0, k)]);
  /** Screens of scrolling in the move that arrives at stop k (k >= 1; past the end, a standard move). */
  const moveScreens = (k: number): number => pace.screensPerMove * (k >= 1 && k <= END ? pace.longer[stopId(k)] ?? 1 : 1);
  /** Screens of each hold round a rest (the same in every move). */
  const holdScreens = () => pace.hold * pace.screensPerMove;
  /** The scroll position (screens) of stop k: the middle of its hold. */
  const screensAt = (k: number): number => {
    let x = 0;
    for (let j = 1; j <= Math.min(k, END); j++) x += moveScreens(j);
    return x;
  };
  /** Total scroll length of the timeline, in screens (the spacer adds one screen so the end can be reached). */
  const totalScreens = (): number => screensAt(END) + pace.endFade * pace.screensPerMove;
  /** Scroll (screens from the top) to global time. */
  const globalAt = (screens: number): number => {
    const x = Math.max(0, screens);
    let k = 0;
    while (k < END && x >= screensAt(k + 1)) k++;
    const L = moveScreens(k + 1), hs = holdScreens();
    return Math.min(LASTG, k + clamp01((x - screensAt(k) - hs / 2) / (L - hs)));
  };
  /** Global time to scroll (screens): the inverse of globalAt, inside the moves (for checks and frames). */
  const screensFor = (G: number): number => {
    const g = Math.max(0, Math.min(LASTG, G)), k = Math.min(END, Math.floor(g)), f = g - k;
    const L = moveScreens(k + 1), hs = holdScreens();
    return screensAt(k) + (f > 0 ? hs / 2 + f * (L - hs) : 0);
  };
  /** Places scenes, in order, over the rests: each takes as many stops as it has rests. */
  const placeScenes = (scenes: readonly IntroScene[]): { first: number; last: number }[] => {
    let k = 0;
    const out = scenes.map((s) => { const first = k; k += s.rests.length; return { first, last: k - 1 }; });
    if (k !== order.length) throw new Error(`intro: the scenes have ${k} rests; the timeline has ${order.length}`);
    scenes.forEach((s, i) => s.rests.forEach((r, j) => {
      if (r.id !== order[out[i].first + j]) throw new Error(`intro: scene ${s.id} rest ${j} is ${r.id}, expected ${order[out[i].first + j]}`);
    }));
    return out;
  };
  /** Half the hand-off's cross-fade in the move arriving at stop k, as a fraction of that move. */
  const fadeHalf = (k: number): number => (pace.fadeScreens / 2) / (moveScreens(k) - holdScreens());
  /** The incoming scene's opacity during the hand-off move arriving at stop k (f: the move's linear fraction). */
  const handIn = (f: number, k: number): number => {
    const w = fadeHalf(k), c = pace.handAt[stopId(k)] ?? 0.5;
    return smoothstep(c - w, c + w, f);
  };
  /** The eased move fraction at which the hand-off arriving at stop k is half done, and where it starts and ends. */
  const handWindow = (k: number): { from: number; at: number; to: number } => {
    const w = fadeHalf(k), c = pace.handAt[stopId(k)] ?? 0.5;
    return { from: smooth(c - w), at: smooth(c), to: smooth(c + w) };
  };
  /** Each scene's local time and opacity at global time G. At a hand-off the incoming scene, stacked above,
   *  fades in over fadeScreens while the outgoing one keeps drawing at full opacity beneath it, then stops. */
  const sceneStates = (slots: readonly { scene: IntroScene; first: number; last: number }[], G: number): SceneState[] => {
    const g = Math.min(Math.max(G, 0), END);
    const k = Math.min(Math.floor(g), END), f = g - k, e = smooth(f);
    return slots.map(({ scene, first, last }, i) => {
      const R = scene.rests, isLast = i === slots.length - 1;
      if (k >= first && k < last) return { t: lerp(R[k - first].t, R[k - first + 1].t, e), opacity: 1 };
      if (k === last) {
        if (isLast) return { t: lerp(R[R.length - 1].t, 1, e), opacity: 1 };
        return { t: lerp(R[R.length - 1].t, 1, e), opacity: handIn(f, k + 1) < 1 ? 1 : 0 };
      }
      if (k === first - 1 && f > 0) return { t: lerp(0, R[0].t, e), opacity: handIn(f, first) };
      if (isLast && k >= END) return { t: 1, opacity: 1 };
      return { t: k < first ? 0 : 1, opacity: 0 };
    });
  };
  /** The nearest stop to G (0..END) and how far G is from it (0 at the stop, 0.5 halfway). */
  const nearestStop = (G: number): { k: number; d: number } => {
    const k = Math.min(END, Math.max(0, Math.round(G)));
    return { k, d: Math.abs(G - k) };
  };
  return { order, END_INDEX: END, LAST: LASTG, PACE: pace, stillFrom, stopId, moveScreens, screensAt, totalScreens, globalAt,
    screensFor, placeScenes, handIn, handWindow, sceneStates, nearestStop };
}

/** The landing intro's timeline (its still moments from r3, chapter 5, on: engine.ts). */
export const LANDING: Timeline = makeTimeline(REST_ORDER, PACE, REST_ORDER.indexOf('r3'));
/** The stop after the last rest: back into Texas, where the landing takes over. */
export const END_INDEX = LANDING.END_INDEX;
/** Global time at which the intro is over (the overlay has faded out). */
export const LAST = LANDING.LAST;
/** The id of stop k (the end is 'end'). */
export const stopId = LANDING.stopId;
/** Screens of scrolling in the move that arrives at stop k (k >= 1; past the end, a standard move). */
export const moveScreens = LANDING.moveScreens;
/** The scroll position (screens) of stop k: the middle of its hold. */
export const screensAt = LANDING.screensAt;
/** Total scroll length of the timeline, in screens (the spacer adds one screen so the end can be reached). */
export const totalScreens = LANDING.totalScreens;
/** Scroll (screens from the top) to global time. */
export const globalAt = LANDING.globalAt;
/** Global time to scroll (screens): the inverse of globalAt, inside the moves (for checks and frames). */
export const screensFor = LANDING.screensFor;

/** A critically damped spring on one number (exact step, stable for any dt). */
export class Spring {
  v = 0;
  constructor(public x: number) {}
  step(target: number, dt: number, omega: number = PACE.springOmega): number {
    const d = this.x - target, w = omega, e = Math.exp(-w * dt), c = this.v + w * d;
    this.x = target + (d + c * dt) * e;
    this.v = (this.v - w * c * dt) * e;
    if (Math.abs(this.x - target) < 1e-4 && Math.abs(this.v) < 1e-3) { this.x = target; this.v = 0; }
    return this.x;
  }
  /** Jump (a rail click far away): land `lead` short of the target, so the last stretch still glides. */
  jump(target: number, lead: number) {
    if (Math.abs(target - this.x) > lead) { this.x = target - Math.sign(target - this.x) * lead; this.v = 0; }
  }
  settled(target: number): boolean { return this.x === target && this.v === 0; }
}

/** Places scenes, in order, over the rests: each takes as many stops as it has rests. */
export const placeScenes = LANDING.placeScenes;
/** The incoming scene's opacity during the hand-off move arriving at stop k (f: the move's linear fraction). */
export const handIn = LANDING.handIn;
/** The eased move fraction at which the hand-off arriving at stop k is half done, and where it starts and ends. */
export const handWindow = LANDING.handWindow;
/** Each scene's local time and opacity at global time G. At a hand-off the incoming scene, stacked above,
 *  fades in over fadeScreens while the outgoing one keeps drawing at full opacity beneath it, then stops. */
export const sceneStates = LANDING.sceneStates;
/** The nearest stop to G (0..END_INDEX) and how far G is from it (0 at the stop, 0.5 halfway). */
export const nearestStop = LANDING.nearestStop;
