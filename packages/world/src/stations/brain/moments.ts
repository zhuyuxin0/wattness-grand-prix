// The brain station's moments (SPEC 4.1), in seconds of the Living Brain sequence: the clock every brain frame and every
// film's Living Brain beats run on. Kept apart from clock.ts (which builds poses with three.js) so the story's beats can
// read them without loading the scene.
/** The moments, in sequence seconds. landing: the across links' clock runs this many times real time. */
export const T = {
  form: [0, 3.2], lb1: 7.0,
  combine: [8.0, 12.0], lb2: 13.0,
  first: [14.0, 17.0], find: [17.5, 21.0], conflict: 19.4, lb3: 23.0,
  dive: [24.0, 26.4], tags: [26.4, 28.6], lb4: 31.0,
  turn: [32.0, 33.2], wipe: [33.2, 35.2], card: 35.4, lb5: 39.0,
  pull: [40.0, 41.6], across: [41.6, 43.6], lb6: 48.0,
  fly: [49.0, 51.0], remember: 51.0, retrieve: 55.0, cutoff: 59.0, lb7: 60.5, end: 61.0,
  landing: 1, phase: 218, el: 14, yawM: [74, 98.5, 96.5],
} as const;

export interface Moments {
  form: readonly [number, number]; lb1: number; combine: readonly [number, number]; lb2: number;
  first: readonly [number, number]; find: readonly [number, number]; conflict: number; lb3: number;
  dive: readonly [number, number]; tags: readonly [number, number]; lb4: number;
  turn: readonly [number, number]; wipe: readonly [number, number]; card: number; lb5: number;
  pull: readonly [number, number]; across: readonly [number, number]; lb6: number;
  fly: readonly [number, number]; remember: number; retrieve: number; cutoff: number; lb7: number; end: number;
  /** The across links' landing clock, times real time. */
  landing: number;
  /** The orbits' phase (degrees) and each member's yaw from the system's spin (degrees, in member order: the Grand
   *  Prix brain, the review, the Terminal's), found together by a search (scratch search, Nov 26): at the combined
   *  view's rests every member within 20 degrees of side-on, as Living Brain's members show their profiles, and the
   *  members at least 1.2 member radii apart on screen, with no member in front of the combined brain while the links
   *  draw (one may stand behind it, as Living Brain's Grand Prix member does). The sequence's clock at 13.0 and 23.0 s
   *  (phase 218: at most 17 degrees off side-on, 2.6 radii apart); the short clock over its hold, 1.0 to 4.6 s, and at
   *  5.0 (phase 96: at most 7 degrees, 2.6 radii, the Grand Prix member left). A member at the center turns back to
   *  the spin's yaw (clock.ts). */
  phase: number;
  yawM: readonly [number, number, number];
  /** The combined view's camera elevation (degrees): a little above Living Brain's 7.1, so members passing in front of
   *  the combined brain pass below it and those behind pass above it. */
  el: number;
}

const NEVER = 1e6;
/** The short clock of the master's and the 90-second cut's Living Brain beat (SPEC 4.2: "a short clock of its own"):
 *  the combined brain already formed, its members on their orbits at Living Brain's own speed, and the 55 links drawn at
 *  three times their sequence's pace (the first 17 over a second, Find links' 38 over the next 1.2 s), the conflict
 *  flagged at 3.2 s, inside Find links' burst, where its 00:20:22 CT falls in the run's 00:20:17 to 00:20:25 (19.4 s on
 *  the sequence's clock). Nothing after LB3 happens on it. */
export const T_SHARED: Moments = {
  form: [-40, -36.8], lb1: -33, combine: [-30, -26], lb2: -25,
  first: [1.4, 2.4], find: [2.57, 3.6], conflict: 3.2, lb3: 5.0,
  dive: [NEVER, NEVER + 2.4], tags: [NEVER + 2.4, NEVER + 4.6], lb4: NEVER + 7,
  turn: [NEVER + 8, NEVER + 9.2], wipe: [NEVER + 9.2, NEVER + 11.2], card: NEVER + 11.4, lb5: NEVER + 15,
  pull: [NEVER + 16, NEVER + 17.6], across: [NEVER + 17.6, NEVER + 19.6], lb6: NEVER + 24,
  fly: [NEVER + 25, NEVER + 27], remember: NEVER + 27, retrieve: NEVER + 31, cutoff: NEVER + 35, lb7: NEVER + 36.5, end: NEVER + 37,
  landing: 3, phase: 96, el: 18, yawM: [141, 123.5, 106],
};


/** The rows of the sequence (LB1 to LB7; LB8 is Living Brain's own interface, its own frame). */
export const ROWS: { id: string; from: number; to: number; rest: number }[] = [
  { id: 'LB1', from: 0, to: 8, rest: T.lb1 },
  { id: 'LB2', from: 8, to: 14, rest: T.lb2 },
  { id: 'LB3', from: 14, to: 24, rest: T.lb3 },
  { id: 'LB4', from: 24, to: 32, rest: T.lb4 },
  { id: 'LB5', from: 32, to: 40, rest: T.lb5 },
  { id: 'LB6', from: 40, to: 49, rest: T.lb6 },
  { id: 'LB7', from: 49, to: 61, rest: T.lb7 },
];

