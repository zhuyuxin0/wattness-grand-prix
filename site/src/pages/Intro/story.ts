import { SHOWCASE } from "../../config";
import { worldTab } from "../../shell/tabs";
import { worldPath } from "../../shell/world";

// The introduction's small pieces that the Intro needs before the dialog opens.

/**
 * Whether this build can play the introduction. Its frame data is synced into
 * packages/world before a build and is not committed (packages/world/README.md),
 * and the player finds it with the same lookup; a build without it would open a
 * story that cannot start, so the Intro offers it only when the build holds the
 * data. Nothing is loaded here: the glob only names the file.
 */
export const STORY_PLAYABLE = Object.keys(import.meta.glob("../../../../packages/world/src/data/frame-data.json")).length > 0;

/**
 * Chapter 01 at night, without its caption or plates: the landing's first view,
 * and what the dialog shows until the introduction draws that chapter itself.
 * public/hero/desert-willow-night.json is its receipt (the frame, the code's
 * commit, the render command and each file's SHA-256); re-render it when
 * chapter 01 changes. Stable names, so index.html can preload it for the Intro.
 */
const hero = (w: number) => `${import.meta.env.BASE_URL}hero/desert-willow-night-${w}.webp`;
export const HERO_STILL = {
  src: hero(1920),
  srcSet: `${hero(1920)} 1920w, ${hero(2880)} 2880w`,
  width: 1920,
  height: 1080,
  alt: `${SHOWCASE.name}'s battery site at night: rows of battery enclosures and inverter skids on a lit pad, with the substation and the line to the grid on the right.`,
} as const;

/**
 * User Timing marks for the introduction's first beat: the click, the story's
 * code in hand, its ready promise, and the first beat drawn. Read them with
 * performance.getEntriesByName("gp-story:ready") and the like.
 */
export const STORY_MARK = {
  open: "gp-story:open",
  code: "gp-story:code",
  ready: "gp-story:ready",
  firstBeat: "gp-story:first-beat",
} as const;

export function markStory(name: string): void {
  try {
    performance.mark(name);
  } catch {
    // Timing is a convenience; a browser without it plays the story the same.
  }
}

let warming: Promise<unknown> | null = null;

/**
 * Starts fetching the introduction's code once (the player, its first
 * stations, the frame data and three.js), so a click on Play finds it in hand.
 * The pointer or focus reaching Play calls it at once; otherwise the Intro
 * calls it on an idle moment after its still has loaded (warmWhenIdle), never
 * on first paint.
 */
export function warmStory(): void {
  if (warming || !STORY_PLAYABLE) return;
  warming = import("@world/story/mount").catch(() => {
    // Let the dialog's own import try again, and report its failure there.
    warming = null;
  });
}

function saveData(): boolean {
  try {
    return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  } catch {
    return false;
  }
}

/** warmStory on the browser's next idle moment (a short wait where there is no idle callback), unless the visitor saves data. */
export function warmWhenIdle(): () => void {
  if (!STORY_PLAYABLE || warming || saveData()) return () => {};
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(warmStory, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(warmStory, 1200);
  return () => window.clearTimeout(id);
}

/**
 * Where a beat's "Open <tab>" goes: the base's tab mapping (worldPath). Every
 * beat that names a battery tab shows Desert Willow, so those tabs open on it.
 */
export function storyPath(id: string): string | undefined {
  const tab = worldTab(id);
  const to = worldPath(id, SHOWCASE.resource);
  if (!tab || !to) return undefined;
  return tab.battery && to === tab.path ? `${to}?battery=${SHOWCASE.resource}` : to;
}
