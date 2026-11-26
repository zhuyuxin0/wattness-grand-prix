// The story as the player plays it (storyboard v2, STORY.md sections 2, 4, 5 and 7): its keys, each a station frame at
// its rest, and the two films' timings over them. A key is a stop the visitor rests at on the site, or a waypoint a
// move passes through (the lock, the drive down A7). Into each key runs a leg: the camera's path from the key before,
// the cross-fade where the frames change, and the frame's own clock. Names lead with the plain meaning; the race
// weekend's word comes second, as a small line (Jo, 26 Nov, about 02:20 Bangkok). The films' words are films.json's,
// copied from the storyboard's index.json; the figures in them are the storyboard's, read from frame-data.json.
import films from './films.json';
import brainFilm from '../stations/brain/film.json';
import { BRAIN_KEYS, BRAIN_CUT, brainMaster, brainCut90, brainSite } from '../stations/brain/film';

/** The Grand Prix site's tab ids (gatelock site/src/shell/tabs.ts). */
export type TabId = 'intro' | 'overview' | 'fleet' | 'battery' | 'forecast' | 'state' | 'hedge' | 'risk' | 'memory' | 'seal' | 'verify' | 'files'
  | 'season' | 'launchpad' | 'one-plan' | 'about' | 'add-agent';
/** The tabs' labels as the site's panel prints them. */
export const TAB_LABEL: Record<TabId, string> = {
  intro: 'Intro', overview: 'Overview', fleet: 'Fleet', battery: 'Battery', forecast: 'Forecast', state: 'State of Charge', hedge: 'Hedge',
  risk: 'Risk', memory: 'Memory', seal: 'Seal', verify: 'Verify', files: 'Files', season: 'Season', launchpad: 'Launchpad', 'one-plan': 'ONE PLAN',
  about: 'How It Works', 'add-agent': 'Add Your Agent',
};

export type Part = 'I' | 'II' | 'III' | 'IV';
export const PARTS: Record<Part, string> = { I: 'The battery', II: 'Every battery', III: 'One operating day', IV: 'The whole stack' };

export interface KeyDef {
  /** The station frame shown (stations/<dir>/index.ts). */
  frame: string;
  /** The frame's local time at the rest; the frame's own (its handle's time) when left out. */
  local?: number;
  /** A stop the visitor rests at (default), or a waypoint a move passes through. */
  stop?: boolean;
  part: Part;
  /** The plain name, and the race weekend's word for it (null where the story has none). */
  name: string;
  term: string | null;
  /** The site tab this beat links to (STORY.md section 7.2), or null where none exists yet. */
  tab: TabId | null;
}

export const KEYS = {
  'desert-willow': { frame: 'opening.pad', part: 'I', name: 'One real battery: Desert Willow', term: null, tab: 'battery' },
  'one-column': { frame: 'opening.column', part: 'I', name: 'Its plan for tomorrow, as one column', term: null, tab: 'battery' },
  lock: { frame: 'opening.lock-venue', stop: false, part: 'II', name: 'The lock', term: null, tab: null },
  'on-the-map': { frame: 'world.W01-texas', part: 'II', name: 'Every ERCOT battery, on the map', term: 'the field', tab: 'fleet' },
  'starting-grid': { frame: 'grid.R01', part: 'II', name: 'Every battery planned for tomorrow', term: 'the starting grid', tab: 'fleet' },
  'the-map': { frame: 'venue.hub', part: 'II', name: 'How each day runs', term: 'the paddock', tab: 'about' },
  garage: { frame: 'garage.hangar', part: 'III', name: 'The agents that plan', term: 'the garage', tab: 'add-agent' },
  'pit-wall': { frame: 'garage.pit-lane', part: 'III', name: 'Three plans per battery', term: 'the pit wall', tab: 'battery' },
  'no-hedge': { frame: 'game.X01', part: 'III', name: 'Plan A: no hedge', term: 'ONE PLAN, the arcade', tab: 'risk' },
  'fixed-hedge': { frame: 'game.X02', part: 'III', name: 'Plan B: a hedge on a fixed schedule', term: 'ONE PLAN, the arcade', tab: 'hedge' },
  meet: { frame: 'game.X03', part: 'III', name: 'Plan C: the schedule meets the hedge', term: 'ONE PLAN, the arcade', tab: 'hedge' },
  'chosen-together': { frame: 'game.X04', part: 'III', name: 'Dispatch and hedge, chosen together', term: 'ONE PLAN, the arcade', tab: 'battery' },
  'your-turn': { frame: 'game.X05', part: 'III', name: 'Your turn: the same day', term: 'ONE PLAN, the arcade', tab: 'one-plan' },
  // the site rests on the seal (09:15:17 CT on Parc fermé's clock, r02.ts LAPSE); the films run the time-lapse
  sealed: { frame: 'grid.R02', local: 4.0, part: 'III', name: 'Plans sealed before the market closes', term: 'parc fermé', tab: 'seal' },
  odds: { frame: 'world.W02-radar', part: 'III', name: 'Weather odds, read after the seal', term: 'the weather radar', tab: 'forecast' },
  'late-seal': { frame: 'grid.R02', part: 'III', name: 'A late seal, refused by the contract', term: 'parc fermé', tab: 'seal' },
  'operating-day': { frame: 'world.W03-race-day', part: 'III', name: 'The operating day runs', term: 'race day', tab: 'overview' },
  // the sealed copy, every check passing ("All five checks pass"); the tamper that follows shows the changed copy failing
  check: { frame: 'grid.R03-pass', part: 'III', name: 'Anyone can check any plan', term: 'the stewards', tab: 'verify' },
  tamper: { frame: 'venue.stewards', part: 'III', name: 'A changed number fails the check', term: 'the stewards', tab: 'verify' },
  // the site's tamper: the check's own bay in its changed copy, on the check's camera, so the step from the check is a
  // state flip and the failure plays in on the frame's clock (stations/grid/r03.ts REVEAL); the films keep the venue's
  // split-screen stewards
  'tamper-site': { frame: 'grid.R03', part: 'III', name: 'A changed number fails the check', term: 'the stewards', tab: 'verify' },
  drive: { frame: 'venue.drive', stop: false, part: 'III', name: 'Past the timing screens', term: null, tab: null },
  ranked: { frame: 'grid.R04', part: 'III', name: 'Every sealed plan, ranked', term: 'the standings', tab: 'fleet' },
  season: { frame: 'towers.T02-season', part: 'III', name: 'Paid for days sealed before the gate', term: 'the season purse', tab: 'season' },
  refused: { frame: 'towers.T03-launch-blocked', part: 'III', name: 'No sealed record, no launch', term: 'license to launch', tab: 'launchpad' },
  graduated: { frame: 'towers.T04-launch-graduate', part: 'III', name: 'Launched once the record is bound', term: 'license to launch', tab: 'launchpad' },
  'every-gate': { frame: 'venue.closing', part: 'IV', name: 'Every gate, every battery', term: null, tab: 'overview' },
  stack: { frame: 'stack.rest', part: 'IV', name: 'What it is built from', term: null, tab: 'about' },
  witness: { frame: 'stack.seal', part: 'IV', name: 'Sealed on BNB Chain, checked by anyone', term: null, tab: 'seal' },
  'late-stops': { frame: 'stack.seal-late', part: 'IV', name: 'A late seal stops at the gate', term: null, tab: 'seal' },
  end: { frame: 'stack.close', part: 'IV', name: 'Wattness Grand Prix', term: null, tab: 'about' },
  // Living Brain: our three brains on one clock (stations/brain/film.ts)
  ...BRAIN_KEYS,
} satisfies Record<string, KeyDef>;
export type KeyId = keyof typeof KEYS;

/** How a leg moves the camera.
 *  own: each frame's own camera at its own clock (the opening, built on one clock).
 *  glide: from the last key's rest to this one's, angles the short way, picture scale and lens in log (lib/ease.ts
 *         camBlend), on a calm ease.
 *  hop: between stations far apart, out of the first along its line of sight and into the second the same way, the two
 *       cross-fading (the venue's 2.4 s glide, V01's plinth click, without the empty ground between).
 *  dolly: the camera and its target each in a straight line (along the back straight, inside the hall). */
export type CamMode = 'own' | 'glide' | 'hop' | 'dolly';

export interface Leg {
  cam?: CamMode;
  /** The outgoing frame's clock over the leg (default: held at its rest). */
  clockA?: [number, number];
  /** The incoming frame's clock over the leg (default: its own motion into its rest, as long as the leg allows). */
  clockB?: [number, number];
  /** The cross-fade, as fractions of the leg (default the middle third). */
  fade?: [number, number];
  /** The field rises out of the map as the camera pulls back (W01's columns, pole first): fractions of the leg. */
  rise?: [number, number];
  /** A hop's back-off on each side, as a share of the full one (default [1, 1]). A side inside a hall (the pit wall)
   *  backs off a little, so its camera never leaves through the roof and draws the hall's frame across the picture. */
  back?: [number, number];
  /** 'both': each frame's own screens through the leg, whichever picture shows (two frames of one world that show
   *  different screens: the garage's floors from above, the pit wall's boards), the first's going as the camera passes
   *  them and the second's coming as it nears them (player.ts dress). Default: each frame's screens at its share of
   *  the cross-fade. */
  screens?: 'both';
}

/** A key in a film: it arrives at `at` and holds until `until` (seconds), after the leg that brings it there. */
export interface FilmKey { key: KeyId; at: number; until: number; leg?: Leg; run?: Run }

/** The frame's own clock through a hold, in the films (the site rests at the key's `local`): [seconds after `at`, the
 *  frame's local time] pairs, linear between them and held past either end. The leg in lands on its first local time
 *  and the leg out leaves from its last. Parc fermé's time-lapse (stations/grid/r02.ts LAPSE) plays this way, timed to
 *  each film's line. */
export type Run = readonly (readonly [number, number])[];

/** The opening's clock (stations/opening/gather.ts T): the pad at 1, the gather 2 to 6, the column at 9.8, the lock at 12.6. */
const O = { pad: 1, gatherEnd: 6, column: 9.8, climbEnd: 12.4, lock: 12.6 };
const gatherLeg = (): Leg => ({ cam: 'own', clockA: [O.pad, O.column], clockB: [O.pad, O.column],
  // the pad's look hands to the column's as the gather ends (the frames differ only in their ambient occlusion and fade)
  fade: [(O.gatherEnd - 0.4 - O.pad) / (O.column - O.pad), (O.gatherEnd + 0.4 - O.pad) / (O.column - O.pad)] });
// the climb on the column's clock, then the lock: the real column and W01's fill the same box on screen
const climbLeg = (): Leg => ({ cam: 'own', clockA: [O.column, O.lock], fade: [(O.climbEnd - O.column) / (O.lock - O.column), 1] });
const pullBack = (): Leg => ({ cam: 'glide', fade: [0, 0.1], rise: [0.08, 0.86] });

/** The master, 3:00 (STORY.md section 4): the rows' boundaries kept, each key arriving after its leg. */
export const MASTER: FilmKey[] = [
  { key: 'desert-willow', at: 0, until: 5 },
  { key: 'one-column', at: 10.6, until: 12, leg: gatherLeg() },
  { key: 'lock', at: 14.1, until: 14.1, leg: climbLeg() },
  { key: 'on-the-map', at: 16.8, until: 18, leg: pullBack() },
  { key: 'starting-grid', at: 21.2, until: 25, leg: { fade: [0.32, 0.68] } },
  { key: 'the-map', at: 28.4, until: 30, leg: { fade: [0.1, 0.34] } },
  { key: 'garage', at: 33.4, until: 35, leg: { fade: [0.62, 0.86] } },
  // the dive: the hangar's frame (its roof lifted) carries the camera down until it is under the pit wall's roof (18 m),
  // then the pit wall's frame takes over; the bays' screens and the boards ride the whole way (one world)
  { key: 'pit-wall', at: 38.6, until: 41, leg: { cam: 'dolly', fade: [0.88, 0.98], screens: 'both' } },
  // out of the pit wall's hall: its side backs off a little, so the camera never leaves through the roof
  // Living Brain (0:41 to 0:49): retrieve, connect, then its own interface (brain/film.ts brainMaster). Its 8 s come
  // from X05 "Your turn" (5 s; the cabinet plays on the site), X01's hold and the legs into X02 and X03 (1 s each), so
  // the leg into Parc fermé still starts at 1:15
  ...brainMaster(41),
  { key: 'no-hedge', at: 51.6, until: 54, leg: { cam: 'hop' } },
  { key: 'fixed-hedge', at: 56, until: 60, leg: { fade: [0.15, 0.85] } },
  { key: 'meet', at: 62, until: 66, leg: { fade: [0.15, 0.85] } },
  { key: 'chosen-together', at: 69, until: 75, leg: { fade: [0.15, 0.85] } },
  // Parc fermé's clock under its two lines: the plans made at 09:12:46 CT, sealed at 09:15:17 (1:20.1) and held on the
  // seal, the clock ticking on at half pace, then running on to 09:51:43 (local 9.08) as the line turns to the weather
  // odds' "09:51 CT" and the picture hops to the radar (STORY.md row 14); after them, 09:59:56 running in real time to
  // the gate (1:36.0) and the refusal at 10:00:22 (1:38.8), held on the refusal
  { key: 'sealed', at: 78, until: 87, leg: { cam: 'hop' }, run: [[0, 0], [3.3, 3.3], [7.4, 6.0], [9, 9.08]] },
  { key: 'odds', at: 89.4, until: 93, leg: { cam: 'hop' } },
  { key: 'late-seal', at: 95.4, until: 105, leg: { cam: 'hop' }, run: [[0, 10.8], [9.6, 20.4]] },
  { key: 'operating-day', at: 108, until: 115, leg: { cam: 'hop' } },
  { key: 'check', at: 118, until: 125, leg: { cam: 'hop' } },
  { key: 'tamper', at: 127.2, until: 142, leg: { fade: [0.25, 0.75] } },
  { key: 'drive', at: 144.4, until: 144.6, leg: { cam: 'hop' } },
  { key: 'ranked', at: 145.9, until: 147, leg: { fade: [0.3, 0.7] } },
  { key: 'season', at: 149.2, until: 151, leg: { cam: 'hop' } },
  { key: 'refused', at: 153.2, until: 154.4, leg: { cam: 'hop' } },
  { key: 'graduated', at: 155.2, until: 157, leg: { fade: [0.1, 0.9] } },
  { key: 'every-gate', at: 159.6, until: 160, leg: { fade: [0.2, 0.55] } },
  { key: 'stack', at: 164.6, until: 167, leg: { fade: [0.05, 0.4] } },
  // the stack's rest and its witness are one model at one place: a glide, so the two draw on one camera and only the
  // dimming crosses (a hop drew the stack twice, at two sizes, through the fade)
  { key: 'witness', at: 169.6, until: 171.6, leg: { cam: 'glide', fade: [0.25, 0.6] } },
  { key: 'late-stops', at: 172.4, until: 175, leg: { fade: [0, 0.5] } },
  { key: 'end', at: 177.6, until: 180, leg: { fade: [0.2, 0.6] } },
];

/** The 90-second cut (STORY.md section 5). */
export const CUT_90: FilmKey[] = [
  { key: 'desert-willow', at: 0, until: 4 },
  { key: 'one-column', at: 8.8, until: 10, leg: gatherLeg() },
  { key: 'lock', at: 11.6, until: 11.6, leg: climbLeg() },
  { key: 'on-the-map', at: 13.4, until: 13.6, leg: pullBack() },
  { key: 'starting-grid', at: 15.2, until: 16, leg: { fade: [0.32, 0.68] } },
  // row 4, "G02 from the back straight to the pit wall's boards": the hop lands over the garage (G01, its six bays'
  // screens under the line about the six crews) and the dolly carries on along the back straight to the boards
  { key: 'garage', at: 18.3, until: 18.8, leg: { cam: 'hop' } },
  { key: 'pit-wall', at: 22.2, until: 25, leg: { cam: 'dolly', fade: [0.88, 0.98], screens: 'both' } },
  // Living Brain (0:25 to 0:31): our three brains linked across, then its own interface. Its 6 s come from X02 and X03
  // (1 s holds whose plans the row's line does not name), so the arcade runs no hedge (A) to chosen together (C)
  ...brainCut90(25),
  { key: 'no-hedge', at: 33.4, until: 34, leg: { cam: 'hop' } },
  { key: 'chosen-together', at: 36, until: 40, leg: { fade: [0.15, 0.85] } },
  // the whole time-lapse under one line: sealed at 09:15:17 (0:44.7) and held while the line names it, the clock run on
  // to 09:59:56 (0:47.0), the gate (0:47.5), the late plan refused at 10:00:22 (0:49.8) and held to the line's end
  { key: 'sealed', at: 42.6, until: 52, leg: { cam: 'hop' }, run: [[0, 0], [3.0, 3.0], [4.4, 10.8], [8.15, 15.3], [9.4, 16.5]] },
  { key: 'check', at: 54.6, until: 58.5, leg: { cam: 'hop' } },
  { key: 'tamper', at: 60, until: 65, leg: { fade: [0.25, 0.75] } },
  { key: 'every-gate', at: 67.6, until: 68, leg: { cam: 'hop' } },
  { key: 'stack', at: 72.4, until: 76, leg: { fade: [0.05, 0.4] } },
  { key: 'witness', at: 78.4, until: 80, leg: { cam: 'glide', fade: [0.25, 0.6] } },
  { key: 'late-stops', at: 80.8, until: 83, leg: { fade: [0, 0.5] } },
  { key: 'end', at: 85.6, until: 90, leg: { fade: [0.2, 0.6] } },
];

export interface FilmRow { start_s: number; end_s: number; beats: number[]; frames: string[]; line: string | null }
/** Keys the site's story leaves out. The season and launch towers (T02 to T04) still draw the season and the launch as
 *  they stood before both ran on BSC testnet on Nov 25 (the Season and Launchpad tabs read them live); 'late-seal'
 *  rests on the same Parc fermé as 'sealed', and the stack's 'late-stops' shows the refusal. */
export const SITE_LEFT_OUT: ReadonlySet<KeyId> = new Set<KeyId>(['late-seal', 'season', 'refused', 'graduated']);

/** The site's stops (mountStory's site mode): a list of its own, not the master film's. The master's keys as they were
 *  before Living Brain's beat, X05 "Your turn" kept (the cabinet plays on the site), with Living Brain's one stop after
 *  the weather odds (brain/film.ts brainSite): the brains were written after the seal, by the build and Desert Willow's
 *  review, and no plan reads them, so the stop stands with what the day read after the seal, never among the plans.
 *  Never Living Brain's own interface, a recording kept out of git that a site's checkout does not hold; and less
 *  SITE_LEFT_OUT. The site rests at each key's local time and leaves the holds out, so only the keys and their legs
 *  count: the keys after the brain's stop are the master's, moved on by its legs, and the key after a run left out keeps
 *  its own leg's length, every key from it on coming forward by the time the run took, so a step never plays a long
 *  leg. A key met twice, as Parc fermé is, is two stops only where its words differ ('sealed' and 'late-seal' are two
 *  keys on one frame). */
export const SITE_KEYS: FilmKey[] = (() => {
  const at = (key: KeyId) => MASTER.findIndex((k) => k.key === key);
  const before = MASTER.slice(0, at('pit-wall') + 1);
  // the arcade as the master ran it before the beat, out of the pit wall's hall (its side backs off a little, so the
  // camera never leaves through the roof)
  const arcade: FilmKey[] = [
    { key: 'no-hedge', at: 43.6, until: 47, leg: { cam: 'hop', back: [0.12, 1] } },
    { key: 'fixed-hedge', at: 50, until: 54, leg: { fade: [0.15, 0.85] } },
    { key: 'meet', at: 57, until: 61, leg: { fade: [0.15, 0.85] } },
    { key: 'chosen-together', at: 64, until: 70, leg: { fade: [0.15, 0.85] } },
    { key: 'your-turn', at: 72.6, until: 75, leg: { fade: [0.3, 0.7] } },
  ];
  // the seal and the weather odds read after it, then Living Brain's stop
  const sealed = MASTER.slice(at('sealed'), at('odds') + 1);
  const from = sealed[sealed.length - 1]!.until;
  const brain = brainSite(from);
  const d = brain[brain.length - 1]!.until - from;
  const later = (k: FilmKey): FilmKey => ({ ...k, at: k.at + d, until: k.until + d });
  const all = [...before, ...arcade, ...sealed, ...brain, ...MASTER.slice(at('odds') + 1).map(later)];
  // the tamper is the check's bay in its changed copy ('tamper-site'): one camera, the cross-fade over before the
  // frame's failure starts (r03.ts REVEAL.card, 0.6 s of its 2.0), and a leg 0.8 s longer, so the failure plays at a
  // pace that reads
  const siteKey = (k: FilmKey): FilmKey => (k.key === 'tamper' ? { ...k, key: 'tamper-site', at: k.at + 0.8, leg: { fade: [0.05, 0.25] } } : k);
  const out: FilmKey[] = [];
  let shift = 0;
  all.forEach((k, i) => {
    if (SITE_LEFT_OUT.has(k.key)) return;
    const prior = all[i - 1], prev = out[out.length - 1];
    // after a run left out: this key's own leg (from the last key left out), from the last key kept
    if (prior && prev && SITE_LEFT_OUT.has(prior.key)) shift = k.at - (prev.until + (k.at - prior.until));
    out.push(siteKey(shift ? { ...k, at: k.at - shift, until: k.until - shift } : k));
  });
  return out;
})();

export type CutId = 'master' | '90s' | 'brain' | 'site';
export const CUTS: Record<CutId, { keys: FilmKey[]; rows: FilmRow[]; seconds: number }> = {
  master: { keys: MASTER, rows: films.master as FilmRow[], seconds: 180 },
  '90s': { keys: CUT_90, rows: films.cut_90s as FilmRow[], seconds: 90 },
  // the Living Brain cut (SPEC 4.1): LB1 to LB8 on the brain's clock, 69 s
  brain: { keys: BRAIN_CUT, rows: brainFilm.brain as FilmRow[], seconds: 69 },
  // the site's stops: no film lines (the site shows each frame's own caption, and the master's rows would not line up
  // with its stops)
  site: { keys: SITE_KEYS, rows: [], seconds: SITE_KEYS[SITE_KEYS.length - 1]!.until },
};
