// The sections menu's tree (Outline.tsx), as wattness.tech's pane contents
// build theirs (apps/mms/src/ui/outline.tsx): the page's headings in page
// order, each under the nearest heading above it that sits higher, at levels
// 1 to 3; a filter that keeps a match and every section around it; and "Show
// levels", which folds the tree to a depth. Pure, so the tests can hold it.

/** A heading as the page draws it: its depth is 1 for a Section's title (h2), more for what sits inside. */
export interface OutlineHeading {
  id: number;
  title: string;
  depth: number;
}

export interface OutlineEntry {
  id: number;
  title: string;
  /** 1, 2 or 3. */
  level: number;
  parent: number | null;
}

export interface OutlineNode extends OutlineEntry {
  kids: OutlineNode[];
}

/** The menu lists sections and subsections to the third level. */
export const MAX_LEVEL = 3;

/**
 * The headings as entries: each under the nearest earlier heading of a smaller depth, one level below it, so a page
 * that starts at an h3 starts at level 1 and a skipped rank does not leave a gap. Deeper than the third level is left
 * out, with what is under it.
 */
export function entriesOf(heads: readonly OutlineHeading[]): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  const stack: { depth: number; entry: OutlineEntry }[] = [];
  for (const h of heads) {
    while (stack.length && stack[stack.length - 1]!.depth >= h.depth) stack.pop();
    const up = stack[stack.length - 1];
    const level = up ? up.entry.level + 1 : 1;
    if (level > MAX_LEVEL) continue;
    const entry: OutlineEntry = { id: h.id, title: h.title, level, parent: up ? up.entry.id : null };
    out.push(entry);
    stack.push({ depth: h.depth, entry });
  }
  return out;
}

export function treeOf(list: readonly OutlineEntry[]): OutlineNode[] {
  const byId = new Map(list.map((e) => [e.id, { ...e, kids: [] as OutlineNode[] }]));
  const roots: OutlineNode[] = [];
  for (const e of list) {
    const n = byId.get(e.id)!;
    const p = e.parent != null ? byId.get(e.parent) : undefined;
    (p ? p.kids : roots).push(n);
  }
  return roots;
}

/** How many sections a branch holds, at every depth: the count a folded row shows. */
export const under = (n: OutlineNode): number => n.kids.reduce((s, k) => s + 1 + under(k), 0);

/** The entry and the sections around it, outermost first. */
export function pathTo(id: number | null, list: readonly OutlineEntry[]): OutlineEntry[] {
  const byId = new Map(list.map((e) => [e.id, e]));
  const path: OutlineEntry[] = [];
  for (let x = id != null ? byId.get(id) : undefined; x; x = x.parent != null ? byId.get(x.parent) : undefined) path.unshift(x);
  return path;
}

/** What a filter keeps: every section whose title holds the words, and the sections around each. Null for no words. */
export function keepFor(list: readonly OutlineEntry[], q: string): Set<number> | null {
  const needle = q.replace(/\s+/g, " ").trim().toLowerCase();
  if (!needle) return null;
  const byId = new Map(list.map((e) => [e.id, e]));
  const keep = new Set<number>();
  for (const e of list) {
    if (!e.title.toLowerCase().includes(needle)) continue;
    for (let x: OutlineEntry | undefined = e; x; x = x.parent != null ? byId.get(x.parent) : undefined) keep.add(x.id);
  }
  return keep;
}

/** The first section a filter's words find, in page order: where Enter goes. */
export function firstMatch(list: readonly OutlineEntry[], q: string): OutlineEntry | undefined {
  const needle = q.replace(/\s+/g, " ").trim().toLowerCase();
  return needle ? list.find((e) => e.title.toLowerCase().includes(needle)) : undefined;
}

export const LEVELS: readonly { n: number; word: string; what: string }[] = [
  { n: 1, word: "1", what: "fold every section: the first level only" },
  { n: 2, word: "2", what: "the first level open, the second folded" },
  { n: 3, word: "3", what: "two levels open, the third folded" },
  { n: Infinity, word: "All", what: "open every section" },
];

/** "Show levels n": the branches folded, every entry at level n or deeper. */
export function foldedAt(list: readonly OutlineEntry[], n: number): Set<number> {
  return new Set(list.filter((e) => e.level >= n).map((e) => e.id));
}

/** The tree opens on the first level's branches, the second folded; what holds the place you are in is open. */
export const foldedFirst = (list: readonly OutlineEntry[]): Set<number> => foldedAt(list, 2);

/** The pill's words: where you are, its last two places when deeper. */
export function crumbsOf(path: readonly OutlineEntry[]): string[] {
  return path.length > 2 ? ["…", ...path.slice(-2).map((e) => e.title)] : path.map((e) => e.title);
}

export const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A section's id from its title, where the page gives it none: "The Gate, Computed on Chain" is the-gate-computed-on-chain. */
export function sectionSlug(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
