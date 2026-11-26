import type { BrainOptions, BrainState } from "@world/stations/brain/mount";

// The Intro's band on how the Grand Prix is built (BuildMemory.tsx): the parts that are not React, kept apart so
// test/build-memory.test.mjs runs them as written.

/** The Memory tab's path (src/shell/tabs.ts). */
export const MEMORY_PATH = "/agents/memory";

/** The band's own tab: its page's card opens no tab, since "Open Intro" would reload the page the visitor is on. */
export const HERE = "intro";

/**
 * The tabs a page's card on the band may open, by the 3D package's tab ids with the side panel's labels ("Open
 * Seal", "Part of: Verify"): every id the site maps (shell/tabs.ts WORLD_TABS, through worldTab) but the Intro's own.
 */
export function bandTabs(ids: readonly string[], tabOf: (id: string) => { label: string } | undefined): { id: string; label: string }[] {
  return ids.flatMap((id) => {
    const tab = id === HERE ? undefined : tabOf(id);
    return tab ? [{ id, label: tab.label }] : [];
  });
}

/**
 * The Memory tab at the band's view, in the address the Memory tab reads (Memory/select.ts): ?brain=<brain>, with
 * &page=<slug> for a pinned page; the bare path for all brains.
 */
export function memoryHref(view: BrainState | null): string {
  const q = new URLSearchParams();
  if (view && (view.brain !== "all" || view.page)) q.set("brain", view.brain);
  if (view?.page) q.set("page", view.page);
  const search = q.toString();
  return search ? `${MEMORY_PATH}?${search}` : MEMORY_PATH;
}

/** What the band reads from public/data/memory/build-brain.json (Memory/data.ts BuildBrain). */
export interface BuildCorrections {
  pages: readonly { brain: string; slug: string; correction?: string }[];
  connections: readonly { a: string; aBrain: string; b: string; bBrain: string; correction?: string }[];
}

/**
 * The corrections the site's build brain carries beside Living Brain's text, keyed as the mount reads them (a page
 * "brain/slug", a connection "brainA/a>brainB/b"), as the Memory tab passes them; none without the file.
 */
export function correctionsOf(b: BuildCorrections | null): BrainOptions["corrections"] {
  if (!b) return undefined;
  const pages: Record<string, string> = {};
  for (const p of b.pages) if (p.correction) pages[`${p.brain}/${p.slug}`] = p.correction;
  const connections: Record<string, string> = {};
  for (const c of b.connections) if (c.correction) connections[`${c.aBrain}/${c.a}>${c.bBrain}/${c.b}`] = c.correction;
  return { pages, connections };
}
