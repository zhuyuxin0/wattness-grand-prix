import type { BrainGraph, DayIndex, FilesIndex, LateSeal, Manifest, Receipts, ScenarioDigest, TerminalStructure } from "./types";

// Static files under public/data/, fetched once per page load and shared.
const cache = new Map<string, Promise<unknown>>();

export class DataMissing extends Error {
  override name = "DataMissing";
}

export function dataUrl(path: string): string {
  return `${import.meta.env.BASE_URL}data/${path}`;
}

export function fetchJson<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetch(dataUrl(path)).then(async (res) => {
      if (res.status === 404) throw new DataMissing(`${path} is not published`);
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      return (await res.json()) as T;
    });
    // A failed fetch is not cached, so a retry can succeed.
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

/** The raw text of a published file, for hashing it as it was published. */
export async function fetchText(path: string): Promise<string> {
  const res = await fetch(dataUrl(path));
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

async function optional<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof DataMissing) return null;
    throw e;
  }
}

export const loadDay = () => fetchJson<DayIndex>("day.json");
export const loadReceipts = () => fetchJson<Receipts>("receipts.json");
export const loadLateSeal = () => fetchJson<LateSeal>("late-seal.json");
export const loadFiles = () => fetchJson<FilesIndex>("files.json");
export const loadShowcaseManifest = (resource: string) => fetchJson<Manifest>(`showcase/${resource}.manifest.json`);
export const loadScenarios = (resource: string) => optional(fetchJson<ScenarioDigest>(`showcase/${resource}.scenarios.json`));
export const loadTerminalStructure = () => optional(fetchJson<TerminalStructure>("terminal-structure.json"));
export const loadBrain = () => optional(fetchJson<BrainGraph>("brain.json"));
