import { SHOWCASE } from "../../config";
import { worldTab } from "../../shell/tabs";
import { worldPath } from "../../shell/world";
import firstBeat from "./story-first-beat.webp";

// The story's small pieces that the Intro needs before the dialog opens.

/**
 * Whether this build can play the story. Its frame data is synced into
 * packages/world before a build and is not committed (packages/world/README.md),
 * and the player finds it with the same lookup; a build without it would open a
 * story that cannot start, so the Intro offers the story only when the build
 * holds the data. Nothing is loaded here: the glob only names the file.
 */
export const STORY_PLAYABLE = Object.keys(import.meta.glob("../../../../packages/world/src/data/frame-data.json")).length > 0;

/** The first beat's still: packages/world/storyboard/web/O01.webp (git blob cd4e5a17), copied into this folder so the dev server serves it. */
export const FIRST_BEAT_STILL = firstBeat;

/**
 * User Timing marks for the story's first beat: the click, the story's code in
 * hand, its ready promise, and the first beat drawn. Read them with
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

let prefetched = false;

/** Warms the cache for the first beat's still as the pointer or focus reaches the button. */
export function prefetchStoryStill(): void {
  if (prefetched) return;
  prefetched = true;
  const img = new Image();
  img.decoding = "async";
  img.src = FIRST_BEAT_STILL;
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
