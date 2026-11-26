// Each tab's chapter of the introduction: the story's beat that shows the tab's object best (packages/world's
// src/story/beats.ts KEYS, each with the tab it links to), or for a tab no beat names, the nearest one. A tab's header
// plays that chapter as a short loop (ChapterPane.tsx), and a click opens the introduction at the beat
// (/?chapter=<beat>); the beat's own "Open <tab>" is the way back. The numbers are the site's stops as the
// introduction's rail counts them (beats.ts SITE_KEYS), and the names and terms are the beats' own:
// test/chapters.test.mjs holds all three to the package, and every loop to its receipt in public/chapters/.
//
// Nothing here is imported at runtime by anything but the panes, and it imports nothing, so Node's tests and the
// loop renderer (scripts/render-chapters.mjs) read it as it is.

export interface Chapter {
  /** The beat the pane plays and the introduction opens at. */
  beat: string;
  /** Its number among the site's stops, from 1. */
  chapter: number;
  /** The beat's plain name, and the race weekend's word for it (null where the story has none). */
  name: string;
  term: string | null;
  /** The loop's files in public/chapters/: <loop>-960.webm and .mp4, <loop>-640.webm and .mp4, <loop>.webp, <loop>.json. */
  loop: string;
  /** Where the loop shows one part of the beat's picture (the stack's Atlas and CoinMarketCap, say): that part. */
  part?: string;
}

const desertWillow = { beat: "desert-willow", chapter: 1, name: "One real battery: Desert Willow", term: null, loop: "desert-willow" } as const;
const startingGrid = { beat: "starting-grid", chapter: 4, name: "Every battery planned for tomorrow", term: "the starting grid", loop: "starting-grid" } as const;
const theMap = { beat: "the-map", chapter: 5, name: "How each day runs", term: "the paddock", loop: "the-map" } as const;
const garage = { beat: "garage", chapter: 6, name: "The agents that plan", term: "the garage", loop: "garage" } as const;
const pitWall = { beat: "pit-wall", chapter: 7, name: "Three plans per battery", term: "the pit wall", loop: "pit-wall" } as const;
const noHedge = { beat: "no-hedge", chapter: 8, name: "Plan A: no hedge", term: "ONE PLAN, the arcade", loop: "no-hedge" } as const;
const meet = { beat: "meet", chapter: 10, name: "Plan C: the schedule meets the hedge", term: "ONE PLAN, the arcade", loop: "meet" } as const;
const yourTurn = { beat: "your-turn", chapter: 12, name: "Your turn: the same day", term: "ONE PLAN, the arcade", loop: "your-turn" } as const;
const sealed = { beat: "sealed", chapter: 13, name: "Plans sealed before the market closes", term: "parc fermé", loop: "sealed" } as const;
const odds = { beat: "odds", chapter: 14, name: "Weather odds, read after the seal", term: "the weather radar", loop: "odds" } as const;
const memory = { beat: "shared-memory", chapter: 15, name: "Memory: our three brains in Living Brain", term: "team data", loop: "shared-memory" } as const;
const operatingDay = { beat: "operating-day", chapter: 16, name: "The operating day runs", term: "race day", loop: "operating-day" } as const;
const check = { beat: "check", chapter: 17, name: "Anyone can check any plan", term: "the stewards", loop: "check" } as const;
const stack = { beat: "stack", chapter: 21, name: "What it is built from", term: null } as const;
const witness = { beat: "witness", chapter: 22, name: "Sealed on BNB Chain, checked by anyone", term: null, loop: "witness" } as const;

/** By the side panel's tab ids (src/shell/tabs.ts). The Intro is chapter 01 itself and draws no pane. */
export const CHAPTERS: Readonly<Record<string, Chapter>> = {
  intro: desertWillow,
  overview: operatingDay,
  fleet: startingGrid,
  battery: desertWillow,
  // the agents' identities: the garage, where the agents that plan are built
  "agent-ids": garage,
  forecast: odds,
  // the state of charge under each plan: the pit wall's three plans
  state: pitWall,
  hedge: meet,
  risk: noHedge,
  memory,
  seal: sealed,
  verify: check,
  // the sealed day's files: the stack's seal path, the record on BNB Chain beside its files on Greenfield
  files: witness,
  // the season, the launches and the prices are parts of the stack's markets row; the season and launch towers are not
  // stops of the site's story (beats.ts SITE_LEFT_OUT), so each loop is the stack at that part, and opens the stack
  season: { ...stack, loop: "stack-flap", part: "Flap's season coin and vault" },
  launchpad: { ...stack, loop: "stack-openfour", part: "OpenFour's launch tower" },
  prices: { ...stack, loop: "stack-prices", part: "Atlas and CoinMarketCap" },
  "one-plan": yourTurn,
  about: theMap,
  stack: { ...stack, loop: "stack" },
  "add-agent": garage,
};

/** Every loop the map names, once each, in the panel's order. */
export const CHAPTER_LOOPS: readonly string[] = [...new Set(Object.values(CHAPTERS).map((c) => c.loop))];

/** The beat each loop is drawn from. */
export const LOOP_BEAT: Readonly<Record<string, string>> = Object.fromEntries(Object.values(CHAPTERS).map((c) => [c.loop, c.beat]));

/** The chapter a tab's head shows, or none: the Intro is chapter 01 itself and draws no pane. */
export const paneChapter = (tabId: string | undefined): Chapter | undefined =>
  tabId && tabId !== "intro" && Object.hasOwn(CHAPTERS, tabId) ? CHAPTERS[tabId] : undefined;

/** The introduction's address at a beat: the Intro opens it there. */
export const chapterHref = (beat: string): string => `/?chapter=${encodeURIComponent(beat)}`;
