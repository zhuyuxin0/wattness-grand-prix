// How the build's brain in Living Brain holds a tab where it keeps no page of its own for it, as build-brain.json's
// tab map says (tabs[id].relation): the nearest page it has, or a section of another page. Every other tab has its own
// page. Kept here so the line at each tab's foot (MemoryCue.tsx) says which without loading the brain; the site's
// tests hold it to build-brain.json.

export type MemoryRelation = "own" | "nearest" | "related";

const NOT_OWN: Readonly<Record<string, Exclude<MemoryRelation, "own">>> = {
  "agent-ids": "nearest",
  stack: "nearest",
  about: "related",
};

/** The way the build's brain holds a tab: its own page, the nearest page, or a section of another page. */
export const memoryRelation = (tabId: string): MemoryRelation => NOT_OWN[tabId] ?? "own";
