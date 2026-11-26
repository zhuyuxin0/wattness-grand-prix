import { DataMissing, fetchJson } from "../../data";

/** public/data/memory/build-brain.json, written by scripts/data/memory.mjs. */
export interface BuildPage {
  brain: string;
  slug: string;
  title: string;
  /** Living Brain's own text. */
  summary: string;
  /** Beside the summary when it misstates the repository or the chain record. */
  correction?: string;
  /** Connections within the page's own brain. */
  connections: number;
}

export interface BuildConnection {
  a: string;
  aBrain: string;
  b: string;
  bBrain: string;
  strength: "strong" | "medium" | "weak" | string;
  similarity: number;
  reasoning: string;
  correction?: string;
  conflict?: string;
  /** When Living Brain linked the two pages across brains, CT. */
  made?: string;
}

export interface BuildTab {
  page: string;
  also: string[];
  describedBy: string;
  relation: "own" | "related" | "nearest";
  section?: string;
}

export interface BuildBrain {
  schema: "grand-prix.build-brain.v1";
  brain: {
    id: string;
    name: string;
    description: string;
    readAt: string;
    readAtUnix: number;
    pages: number;
    connections: number;
    byStrength: Record<string, number>;
    notes: { total: number; compiled: number };
    source: string;
  };
  brains: { id: string; name: string; pages: number; connections: number }[];
  combined: { name: string; pages: number; crossBrainConnections: number; checkedAt: string; checkedAtUnix: number };
  tabs: Record<string, BuildTab>;
  pages: BuildPage[];
  connections: BuildConnection[];
  conflicts: { a: { brain: string; slug: string }; b: { brain: string; slug: string }; conflict: string; correction: string; detected: string }[];
}

export async function loadBuild(): Promise<BuildBrain | null> {
  try {
    return await fetchJson<BuildBrain>("memory/build-brain.json");
  } catch (e) {
    if (e instanceof DataMissing) return null;
    throw e;
  }
}

export const pageKey = (brain: string, slug: string) => `${brain}:${slug}`;
