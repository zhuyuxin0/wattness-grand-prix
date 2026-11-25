import { fetchJson, loadTerminalStructure } from "../data/load";
import type { TerminalStructure } from "../data/types";

/** public/data/memory-graph.json, written by scripts/data/scenes.mjs. */
export interface MemoryGraph {
  schema: "grand-prix.memory-graph.v1";
  brain: string;
  counts: { pages: number; connections: number; parts: number; links: number };
  pages: {
    slug: string;
    title: string;
    summary: string;
    /** The Terminal part the page describes; null for the page about the whole Terminal. */
    describes: string | null;
    scope: "part" | "terminal" | "unplaced";
  }[];
  connections: { a: string; b: string; strength: string | null; similarity: number | null }[];
}

export interface BrainMapData {
  structure: TerminalStructure;
  memory: MemoryGraph | null;
}

export async function loadBrainMap(): Promise<BrainMapData> {
  const [structure, memory] = await Promise.all([
    loadTerminalStructure(),
    fetchJson<MemoryGraph>("memory-graph.json").catch(() => null),
  ]);
  if (!structure) throw new Error("terminal-structure.json is not published");
  return { structure, memory };
}
