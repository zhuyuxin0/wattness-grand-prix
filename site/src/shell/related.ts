import { TABS, type PanelTab } from "./tabs";

// Where each page leads: two to four tabs, by the side panel's ids (tabs.ts), shown in the page's head as its Related
// strip (RelatedStrip.tsx). A click opens one as a floating pane over the page; the pane's Open goes to it. Each set
// follows a reader's next question: from a plan to what it rests on and how to check it, from the chain's record to its
// proof and files, from a market to the ones beside it. test/related.test.mjs holds every set to the tab list.

export const RELATED = {
  intro: ["overview", "fleet", "seal", "about"],
  overview: ["fleet", "battery", "seal", "verify"],
  fleet: ["battery", "seal", "verify", "files"],
  battery: ["fleet", "hedge", "risk", "verify"],
  "agent-ids": ["forecast", "memory", "add-agent", "stack"],
  forecast: ["risk", "battery", "state", "hedge"],
  state: ["battery", "forecast", "risk"],
  hedge: ["battery", "risk", "forecast"],
  risk: ["battery", "forecast", "hedge", "one-plan"],
  memory: ["agent-ids", "stack", "about"],
  seal: ["verify", "files", "agent-ids"],
  verify: ["seal", "files", "fleet"],
  files: ["seal", "verify", "fleet"],
  season: ["launchpad", "prices", "seal"],
  launchpad: ["season", "prices", "seal"],
  prices: ["season", "launchpad", "forecast"],
  "one-plan": ["battery", "risk", "forecast"],
  about: ["stack", "add-agent", "overview"],
  stack: ["about", "agent-ids", "seal"],
  "add-agent": ["agent-ids", "seal", "verify"],
} as const satisfies Record<string, readonly string[]>;

/** The tabs a page leads to, in its set's order; none for a page outside the list (the not-found page). */
export function relatedTabs(tabId: string | undefined): PanelTab[] {
  if (!tabId || !Object.hasOwn(RELATED, tabId)) return [];
  const ids: readonly string[] = RELATED[tabId as keyof typeof RELATED];
  return ids.map((id) => TABS.find((t) => t.id === id)).filter((t): t is PanelTab => t !== undefined);
}

/** The parts of a click that decide what it does. */
export interface Press {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

/** A press that opens a preview: the main button, nothing held. Any other keeps the link's own meaning (a new tab). */
export function isPreviewClick(e: Press): boolean {
  return !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
