// The brain station's data: brain-scene.json (beside this file, made by make-scene-data.py from the site's
// build-brain.json and Living Brain's own node order), read as typed rows, and the lookups the scene and the Memory tab
// need. Every number the station draws comes from here or from the frame data; nothing is typed in.
import scene from './brain-scene.json';
import { seedOf } from '../../lib/random';
import { yours } from '../../lib/yours';

export type BrainId = 'grand-prix' | 'battery-review' | 'terminal';
export type Strength = 'strong' | 'medium' | 'weak';
export interface Stamp { ct: string; bangkok: string; utc?: string }

export interface Brain {
  id: BrainId;
  name: string;
  /** Living Brain's color for the member in its combined view, by member order. */
  color: string;
  pages: number;
  connections: number;
  strong: number;
  medium: number;
  weak: number;
  /** The notes compiled into the brain (the Grand Prix brain: the paced run's 34). */
  notes?: number;
  readAt?: Stamp;
}

export interface Page {
  brain: BrainId;
  slug: string;
  title: string;
  /** Its place in Living Brain's node order inside its own brain (most connected first): the number on its tag. */
  n: number;
  /** Connections inside its brain, and across brains. */
  connections: number;
  across: number;
  /** Living Brain's summary, as it wrote it. */
  summary: string | null;
  /** Where the summary misstates the repository: the check against it. */
  correction?: string;
  /** The site tab this page describes (Grand Prix pages only). */
  tab?: string;
}

export interface Connection {
  brain: BrainId;
  a: string;
  b: string;
  strength: Strength;
  similarity: number;
  reasoning: string | null;
  correction?: string;
}

export interface Across {
  aBrain: BrainId;
  a: string;
  bBrain: BrainId;
  b: string;
  strength: Strength;
  similarity: number;
  /** When Living Brain made it: as the paced run's notes compiled (Nov 25), or by Find links (Nov 26). */
  made: Stamp;
  reasoning: string | null;
  correction?: string;
  conflict?: string;
}

export interface Conflict {
  a: { brain: BrainId; slug: string };
  b: { brain: BrainId; slug: string };
  conflict: string;
  detected: Stamp;
  correction: string;
}

export interface TabRow { label: string; group: string | null; page: string; also: string[]; section?: string }

export interface Scene {
  schema: string;
  note: string;
  source: { file: string; schema: string; sha256: string; read: Stamp; crossChecked: Stamp };
  combined: { name: string; pages: number; across: number; acrossByPair: Record<string, number>; acrossByStrength: Record<Strength, number>; pagesJoined: number };
  brains: Brain[];
  pages: Page[];
  connections: Connection[];
  across: Across[];
  conflicts: Conflict[];
  tabs: Record<string, TabRow>;
}

export const SCENE = scene as unknown as Scene;
/** The members in Living Brain's member order: the Grand Prix brain, the review, the Terminal. */
export const BRAINS: readonly Brain[] = SCENE.brains;
export const BRAIN_IDS = BRAINS.map((b) => b.id) as readonly BrainId[];
export const brainOf = (id: BrainId): Brain => BRAINS.find((b) => b.id === id)!;

/** Plain names, as the film and the site say them (Living Brain's names are its own). */
export const PLAIN: Record<BrainId, string> = {
  'grand-prix': 'Grand Prix brain',
  'battery-review': "Desert Willow's review",
  terminal: 'Terminal brain',
};

/** A page's key, unique across brains (slugs repeat: wattness-terminal is in two). */
export const keyOf = (brain: BrainId, slug: string) => `${brain}/${slug}`;

const byKey = new Map(SCENE.pages.map((p) => [keyOf(p.brain, p.slug), p]));
export const page = (brain: BrainId, slug: string): Page | undefined => byKey.get(keyOf(brain, slug));
export const pageByKey = (key: string): Page | undefined => byKey.get(key);

/** A brain's pages in Living Brain's order (its tag numbers, 1 first). */
export function pagesOf(brain: BrainId): Page[] {
  return SCENE.pages.filter((p) => p.brain === brain).sort((a, b) => a.n - b.n);
}

export function connectionsOf(brain: BrainId): Connection[] {
  return SCENE.connections.filter((c) => c.brain === brain);
}

/** The connections of one page inside its brain, by match (similarity), strongest first. */
export function linksOf(brain: BrainId, slug: string): { other: Page; c: Connection }[] {
  return connectionsOf(brain)
    .filter((c) => c.a === slug || c.b === slug)
    .map((c) => ({ other: page(brain, c.a === slug ? c.b : c.a)!, c }))
    .sort((x, y) => y.c.similarity - x.c.similarity);
}

/** The connections across brains that touch one page, by match. */
export function acrossOf(brain: BrainId, slug: string): { other: Page; x: Across }[] {
  return SCENE.across
    .filter((x) => (x.aBrain === brain && x.a === slug) || (x.bBrain === brain && x.b === slug))
    .map((x) => ({ other: x.aBrain === brain && x.a === slug ? page(x.bBrain, x.b)! : page(x.aBrain, x.a)!, x }))
    .sort((p, q) => q.x.similarity - p.x.similarity);
}

/** The across connections in the order Living Brain made them (the paced run's first, then Find links'). */
export function acrossByMade(): Across[] {
  return [...SCENE.across].sort((a, b) => a.made.ct.localeCompare(b.made.ct) || b.similarity - a.similarity);
}

/** The conflict a page is in, if any. */
export function conflictOf(brain: BrainId, slug: string): Conflict | undefined {
  return SCENE.conflicts.find((c) => (c.a.brain === brain && c.a.slug === slug) || (c.b.brain === brain && c.b.slug === slug));
}

/** The tab whose own page this is (Grand Prix pages), and the tabs that list it among their related pages. */
export function tabsOf(brain: BrainId, slug: string): { own: string | null; partOf: string[] } {
  if (brain !== 'grand-prix') return { own: null, partOf: [] };
  const own = Object.entries(SCENE.tabs).find(([, t]) => t.page === slug)?.[0] ?? null;
  const partOf = Object.entries(SCENE.tabs).filter(([, t]) => t.page !== slug && t.also.includes(slug)).map(([id]) => id);
  return { own, partOf };
}

/** One seed per brain (FNV-1a of its id), so the film, the lab and the site place everything the same way. */
export const seedFor = (id: BrainId | 'combined') => seedOf(`living-brain:${id}`);

/** Living Brain's tags: the heaviest pages of a brain, 28 by default (its view) and more where a beat needs them. */
export const TAGGED = 28;

/** "Nov 26, 00:29 CT" from a stamp's "2026-11-26 00:29:11 CT". */
export function ctShort(s: Stamp, seconds = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s.ct);
  if (!m) return s.ct;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[4]}:${m[5]}${seconds ? `:${m[6]}` : ''} CT`;
}

/** Thousands with commas. */
export const fmt = (n: number) => n.toLocaleString('en-US');

/** The scope line on every frame of our scene and on the Memory tab's stage. Its time is the read of the combined
 *  graph (the links across brains and the conflict), not the pages' own read the Memory tab's summary gives. */
export const SCOPE = `Living Brain: our three brains, drawn from its API · links across brains read ${ctShort(SCENE.source.crossChecked)}`;
/** The scope line as shown: CT, and on the site the reader's own clock beside it with its date, as the site's dualTime
 *  prints it (a reader west of Central reads that time on the day before); a film prints CT alone, as lib/yours.ts has
 *  every station do, and a reader on Central time sees CT alone too. */
export function scopeLine(film: boolean): string {
  const at = Date.parse(SCENE.source.crossChecked.utc ?? '');
  const own = Number.isFinite(at) ? yours(Math.floor(at / 1000), { film, date: true }) : null;
  return own ? `${SCOPE} (${own})` : SCOPE;
}
