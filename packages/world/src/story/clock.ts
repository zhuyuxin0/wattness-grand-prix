// One seekable time for the whole story. A film (beats.ts CUTS) is its keys on a line of seconds: each key holds from
// `at` to `until`, and the leg into it runs from the key before's `until` to its own `at`. locate(t) says where t falls;
// the site's position (stops, a float) maps onto the same seconds, its holds left out (the visitor holds by resting).
import { CUTS, KEYS, type CutId, type FilmKey, type FilmRow, type KeyDef, type KeyId, type Leg } from './beats';

export const keyDef = (id: KeyId): KeyDef => KEYS[id] as KeyDef;

export type Where =
  | { kind: 'hold'; i: number; since: number; left: number }
  | { kind: 'leg'; i: number; e: number; dur: number; from: number };

export interface Film {
  cut: CutId;
  seconds: number;
  keys: FilmKey[];
  rows: FilmRow[];
  /** Indices into keys of the site's stops. */
  stops: number[];
  locate(t: number): Where;
  /** The row (its line) at t, or null past the end. */
  rowAt(t: number): { i: number; row: FilmRow } | null;
  /** The stop at or before key i. */
  stopOf(i: number): number;
  /** The film seconds for a site position (stop units: 0 is the first stop). */
  timeAt(p: number): number;
  /** Seconds the leg (or legs) between stop s and s + 1 take in the film. */
  span(s: number): number;
  leg(i: number): Leg;
}

export function film(cut: CutId): Film {
  const C = CUTS[cut];
  const keys = C.keys;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!, b = keys[i]!;
    if (!(a.until <= b.at) || !(b.at <= b.until)) throw new Error(`story: the ${cut} film's key ${b.key} (${b.at} to ${b.until}) does not follow ${a.key} (until ${a.until})`);
  }
  const stops = keys.map((k, i) => (keyDef(k.key).stop === false ? -1 : i)).filter((i) => i >= 0);
  const locate = (t: number): Where => {
    const x = Math.max(0, Math.min(C.seconds, t));
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]!;
      if (x < k.at && i > 0) {
        const from = keys[i - 1]!.until, dur = k.at - from;
        return { kind: 'leg', i, e: dur > 0 ? (x - from) / dur : 1, dur, from };
      }
      if (x <= k.until || i === keys.length - 1) return { kind: 'hold', i, since: x - k.at, left: k.until - x };
    }
    return { kind: 'hold', i: keys.length - 1, since: 0, left: 0 };
  };
  const rowAt = (t: number) => {
    const i = C.rows.findIndex((r) => t >= r.start_s && t < r.end_s);
    if (i >= 0) return { i, row: C.rows[i]! };
    return t >= C.seconds && C.rows.length ? { i: C.rows.length - 1, row: C.rows[C.rows.length - 1]! } : null;
  };
  const stopOf = (i: number) => { let s = 0; for (let j = 0; j < stops.length; j++) if (stops[j]! <= i) s = j; return s; };
  const timeAt = (p: number) => {
    const n = stops.length;
    const q = Math.max(0, Math.min(n - 1, p));
    const s = Math.min(n - 2, Math.floor(q)), f = q - s;
    if (n < 2) return keys[stops[0]!]!.at;
    if (f <= 0) return keys[stops[s]!]!.at;
    const a = keys[stops[s]!]!, b = keys[stops[s + 1]!]!;
    return a.until + f * (b.at - a.until);
  };
  const span = (s: number) => { const a = keys[stops[s]!], b = keys[stops[s + 1]!]; return a && b ? b.at - a.until : 0; };
  return { cut, seconds: C.seconds, keys, rows: C.rows, stops, locate, rowAt, stopOf, timeAt, span, leg: (i) => keys[i]?.leg ?? {} };
}
