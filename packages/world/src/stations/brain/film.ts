// The Living Brain beats in the story's films (SPEC 4): the keys, the master's and the 90-second cut's Living Brain
// segment, and the Living Brain cut (LB1 to LB8, 69 s, SPEC 4.1). beats.ts spreads the keys into KEYS and these
// segments into its films; the films' lines for the Living Brain cut are in film.json beside this file (the master's
// and the 90-second cut's are in story/films.json with their other rows).
//
// Every brain key rests on brain.sequence, one world on one clock: through a film its holds run the clock (beats.ts
// run) and the legs between its keys carry it on (clockB), so the dive, the turn and the flight are the clock running,
// never a cross-fade. The brain frames never move the stage's camera (the world moves round it), so one rest camera
// serves every hold. brain.interface is Living Brain's own interface, a recording on its own clock.
import type { FilmKey, KeyDef, Leg } from '../../story/beats';
import { T, T_SHARED } from './moments';

export const BRAIN_KEYS = {
  'three-brains': { frame: 'brain.sequence', local: T.lb1, part: 'III', name: 'Our three brains in Living Brain', term: null, tab: 'memory' },
  'team-brain': { frame: 'brain.sequence', local: T.lb2, part: 'III', name: 'Combined into one team brain', term: null, tab: 'memory' },
  'across-brains': { frame: 'brain.sequence', local: T.lb3, part: 'III', name: 'Linked across brains by Living Brain', term: null, tab: 'memory' },
  // the master's and the 90-second cut's beat: the combined brain on its own short clock (moments.ts T_SHARED)
  'shared-memory': { frame: 'brain.shared', local: T_SHARED.lb3, part: 'III', name: 'Memory: our three brains in Living Brain', term: 'team data', tab: 'memory' },
  'grand-prix-brain': { frame: 'brain.sequence', local: T.lb4, part: 'III', name: 'Inside the Grand Prix brain', term: null, tab: 'memory' },
  'one-page': { frame: 'brain.sequence', local: T.lb5, part: 'III', name: 'One page and its connections', term: null, tab: 'memory' },
  'page-across': { frame: 'brain.sequence', local: T.lb6, part: 'III', name: 'The same page across brains', term: null, tab: 'memory' },
  'remember-retrieve': { frame: 'brain.sequence', local: T.lb7, part: 'III', name: 'Remember and retrieve', term: null, tab: 'memory' },
  'own-interface': { frame: 'brain.interface', part: 'III', name: "Living Brain's own interface", term: null, tab: 'memory' },
} satisfies Record<string, KeyDef>;
type BrainKeyId = keyof typeof BRAIN_KEYS;

/** A hold that runs the brain clock from `from` at real speed (or `rate`), arriving `at` and holding until `until`. */
const runFrom = (from: number, span: number, rate = 1) => [[0, from], [span, from + span * rate]] as const;

/** The Living Brain cut (SPEC 4.1): LB1 to LB7 on the brain's clock at real time (the film's seconds are the
 *  clock's), the rows' rests as the keys' holds; then LB8, Living Brain's own interface, cross-fading in over 0.6 s. */
function brainCut(): FilmKey[] {
  // [key, hold from, hold until] in sequence seconds; the legs between them carry the clock on
  const holds: [BrainKeyId, number, number][] = [
    ['three-brains', 0, 8], ['team-brain', 8.6, 14], ['across-brains', 14.6, 24], ['grand-prix-brain', 26.6, 32],
    ['one-page', 33.4, 40], ['page-across', 41.8, 49], ['remember-retrieve', 51.2, 61],
  ];
  const keys: FilmKey[] = holds.map(([key, at, until], i) => ({
    key, at, until, run: runFrom(at, until - at),
    ...(i ? { leg: { cam: 'own', clockA: [holds[i - 1]![2], at], clockB: [holds[i - 1]![2], at] } as Leg } : {}),
  }));
  // LB8: the recording's own turning view, then Battery Tab hovered: its connections light and its card shows
  keys.push({ key: 'own-interface', at: 61.6, until: 69, leg: { fade: [0, 1], clockB: [1.4, 2.0] }, run: runFrom(2.0, 7.4) });
  return keys;
}
export const BRAIN_CUT: FilmKey[] = brainCut();

/** The master's Living Brain segment, after the pit wall (0:41 to 0:49): the track's verbs in turn. Remember and
 *  retrieve, 3 s: Desert Willow's review at the center, its remember plate up and the retrieval's beam landing, its
 *  retrieve plate in (LB7's clock, 54.8 to 57.8). Connect, 3 s: the combined brain on its short clock (its members at
 *  Living Brain's own speed), the 55 links across brains drawing at 1.3 times the clock and the conflict flagged. Then
 *  Living Brain's own interface, 2 s, Battery Tab's connections lighting (the recording from 5.2 s). */
export function brainMaster(from: number): FilmKey[] {
  return [
    { key: 'remember-retrieve', at: from + 1.0, until: from + 3.0, leg: { cam: 'hop', back: [0.12, 1], clockB: [T.retrieve - 0.2, T.retrieve + 0.8] }, run: runFrom(T.retrieve + 0.8, 2.0) },
    { key: 'shared-memory', at: from + 3.6, until: from + 6.0, leg: { fade: [0, 1], clockB: [0.8, 1.6] }, run: runFrom(1.6, 2.4, 1.3) },
    { key: 'own-interface', at: from + 6.6, until: from + 8.0, leg: { fade: [0, 1], clockB: [4.6, 5.2] }, run: runFrom(5.2, 1.4, 1.1) },
  ];
}

/** The site's Living Brain stop, after the pit wall (beats.ts SITE_KEYS): the combined brain at the short clock's rest,
 *  every link across brains drawn and the conflict flagged, the hop in playing Find links' burst. The site never shows
 *  Living Brain's own interface: its recording is not in a site's checkout. */
export function brainSite(from: number): FilmKey[] {
  return [{ key: 'shared-memory', at: from + 2.6, until: from + 4.0, leg: { cam: 'hop', back: [0.12, 1], clockB: [1.2, T_SHARED.lb3] } }];
}

/** The 90-second cut's Living Brain segment, after the pit wall (0:25 to 0:31): the same beat at one and a half times
 *  its pace (the links' burst and the conflict in 3 s), then Living Brain's own interface. */
export function brainCut90(from: number): FilmKey[] {
  return [
    { key: 'shared-memory', at: from + 1.2, until: from + 3.0, leg: { cam: 'hop', back: [0.12, 1], clockB: [0.6, 2.4] }, run: runFrom(2.4, 1.8, 1.5) },
    { key: 'own-interface', at: from + 3.6, until: from + 6.0, leg: { fade: [0, 1], clockB: [4.8, 5.4] }, run: runFrom(5.4, 2.4, 1.1) },
  ];
}
