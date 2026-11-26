import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ChapterFrom } from "./ChapterPane";
import { CHAPTERS } from "./map";

// The introduction's deep link: /?chapter=<beat> opens the Intro's story at that beat (packages/world's mountStory
// takes a beat id as its startBeat; an id it does not know opens chapter 01). A chapter pane's click sends the tab it
// was on with the link; Close then goes back to that tab, or, for a link from anywhere else, stays on the Intro and
// drops the link. The story's own "Open <tab>" is the way from a chapter to its tab.

const BASE = import.meta.env.BASE_URL;

/** The loop that shows a beat whole (not one part of it), for the dialog's still until the story draws. */
function loopOf(beat: string): string | undefined {
  return Object.values(CHAPTERS).find((c) => c.beat === beat && !c.part)?.loop;
}

export interface ChapterLink {
  /** The beat the address names, or null. */
  beat: string | null;
  /** That beat's still while the story loads (the loop's poster), or undefined for chapter 01's. */
  still: { src: string; width: number; height: number } | undefined;
  /** For Close: back to the tab the pane was on (true), or the Intro without the link (false). */
  leave(): boolean;
}

/** Opens the story (open) once for each visit to an address with ?chapter=; null where the build cannot play it. */
export function useChapterLink(open: (() => void) | null): ChapterLink {
  const location = useLocation();
  const navigate = useNavigate();
  const beat = new URLSearchParams(location.search).get("chapter") || null;
  const from = (location.state ?? null) as Partial<ChapterFrom> | null;
  const opened = useRef<string | null>(null);

  useEffect(() => {
    if (!beat || !open) {
      opened.current = null;
      return;
    }
    if (opened.current === location.key) return;
    opened.current = location.key;
    open();
  }, [beat, open, location.key]);

  const leave = useCallback((): boolean => {
    if (!beat) return false;
    if (from?.chapterFrom) {
      navigate(-1);
      return true;
    }
    const params = new URLSearchParams(location.search);
    params.delete("chapter");
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash }, { replace: true });
    return false;
  }, [beat, from, location.pathname, location.search, location.hash, navigate]);

  const loop = beat ? loopOf(beat) : undefined;
  return { beat, still: loop ? { src: `${BASE}chapters/${loop}.webp`, width: 960, height: 540 } : undefined, leave };
}
