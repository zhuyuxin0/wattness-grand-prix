import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { TabIcon } from "../ui/TabIcon";
import { chapterHref, paneChapter, type Chapter } from "./map";
import "./chapter-pane.css";

// A tab's chapter of the introduction, in the top right of its header: the chapter's loop on the Terminal's liquid
// glass, its number, name and racing term, and a click that opens the introduction at that chapter (the Intro reads
// /?chapter=<beat>; see link.ts). The loop's files load only once the pane is near the view, play only while it is in
// view, and stay a poster with reduced motion or Save-Data. On a phone the pane is one small row under the header.

const BASE = import.meta.env.BASE_URL;
/** A loop's file in public/chapters/ (scripts/render-chapters.mjs writes them, each with its receipt). */
export const chapterFile = (loop: string, suffix: string): string => `${BASE}chapters/${loop}${suffix}`;

/** What a click carries to the Intro: where the visitor was, for Close to go back there. */
export interface ChapterFrom {
  chapterFrom: string;
}

function stillOnly(): boolean {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  } catch {
    // no matchMedia: play the loop
  }
  try {
    return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  } catch {
    return false;
  }
}

/** The pane for the tab at `tabId`, or nothing for a tab without one (the Intro is chapter 01 itself). */
export function ChapterPane({ tabId }: { tabId: string | undefined }) {
  const chapter = paneChapter(tabId);
  if (!chapter) return null;
  return <Pane chapter={chapter} />;
}

function Pane({ chapter }: { chapter: Chapter }) {
  const { pathname, search, hash } = useLocation();
  const media = useRef<HTMLSpanElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [still] = useState(stillOnly);
  // near: the files are asked for; size: which of the two the pane's drawn width needs
  const [near, setNear] = useState(false);
  const [size, setSize] = useState<640 | 960>(640);
  const number = String(chapter.chapter).padStart(2, "0");
  const poster = chapterFile(chapter.loop, ".webp");
  const label = `Open the introduction at chapter ${number}: ${chapter.name}${chapter.term ? ` (${chapter.term})` : ""}`;

  useEffect(() => {
    const el = media.current;
    if (still || !el) return;
    const wide = () => setSize(el.getBoundingClientRect().width * Math.min(3, window.devicePixelRatio || 1) > 700 ? 960 : 640);
    wide();
    if (typeof IntersectionObserver !== "function") {
      setNear(true);
      return;
    }
    // near the view (a screen ahead): load; in it: play; out of it: pause
    const ahead = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        wide();
        setNear(true);
        ahead.disconnect();
      }
    }, { rootMargin: "100% 0px" });
    const seen = new IntersectionObserver((entries) => {
      const v = video.current;
      if (!v) return;
      const on = entries[entries.length - 1]?.isIntersecting ?? false;
      if (on) v.play().catch(() => undefined);
      else v.pause();
    });
    ahead.observe(el);
    seen.observe(el);
    return () => {
      ahead.disconnect();
      seen.disconnect();
    };
  }, [still]);

  // once the sources are in, the element loads them; play starts when the pane is in view (above)
  useEffect(() => {
    const v = video.current;
    if (!near || !v) return;
    v.load();
    const r = v.getBoundingClientRect();
    if (r.bottom > 0 && r.top < window.innerHeight) v.play().catch(() => undefined);
  }, [near, size]);

  const from: ChapterFrom = { chapterFrom: `${pathname}${search}${hash}` };
  return (
    <Link className="chapter-pane" to={chapterHref(chapter.beat)} state={from} aria-label={label} title={label}>
      <span className="chapter-pane__glass">
        <span ref={media} className="chapter-pane__media">
          {still ? (
            <img src={poster} alt="" width={960} height={540} decoding="async" loading="lazy" />
          ) : (
            <video ref={video} poster={poster} muted loop playsInline preload="none" disablePictureInPicture disableRemotePlayback aria-hidden="true" tabIndex={-1}>
              {near && <source src={chapterFile(chapter.loop, `-${size}.webm`)} type='video/webm; codecs="vp9"' />}
              {near && <source src={chapterFile(chapter.loop, `-${size}.mp4`)} type="video/mp4" />}
            </video>
          )}
        </span>
        <span className="chapter-pane__text">
          <span className="chapter-pane__kicker">
            <TabIcon name="play" size={13} className="chapter-pane__icon" />
            <span>
              Introduction · Chapter <span className="num">{number}</span>
            </span>
          </span>
          <span className="chapter-pane__name">{chapter.name}</span>
          {chapter.term && <span className="chapter-pane__term">{chapter.term}</span>}
        </span>
      </span>
    </Link>
  );
}
