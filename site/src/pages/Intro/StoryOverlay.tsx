import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StoryHandle } from "@world/story/mount";
import { Glyph, useTheme } from "../../ui";
import { SoundToggle } from "./SoundToggle";
import { HERO_STILL, STORY_MARK, markStory, storyPath } from "./story";
import "./story.css";

// The story, titled "Introduction" for the visitor (as wattness.tech's "Replay
// the Intro"): packages/world's mountStory in site mode, over the whole viewport
// in a modal dialog, dark in either site theme. The world's code (the player,
// its stations and the frame data) is fetched on an idle moment after the
// Intro's still has loaded, or when the pointer reaches Play, and at the latest
// when the dialog opens; never on first paint. Until the story draws its first
// beat, the dialog shows the Intro's still of that beat, already in the cache.
// The bar's Sound switch is off until the visitor turns it on (SoundToggle).

const NAV_KEYS = new Set(["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "PageDown", "PageUp", "Home", "End"]);
const TABBABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function tabbables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => !el.hidden && el.getClientRects().length > 0);
}

/** Whether this browser can make a WebGL context at all (the context is let go at once). */
function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    const g = c.getContext("webgl2") ?? c.getContext("webgl");
    g?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!g;
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

type Phase = "loading" | "live" | "failed";

interface Props {
  /** Esc or the close button: the dialog goes, and the page puts focus back on the button that opened it. */
  onClose: () => void;
  /** A beat's "Open <tab>", or a way on from the failed state: the dialog goes and the site opens that path. */
  onRoute: (to: string) => void;
}

export default function StoryOverlay({ onClose, onRoute }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [drawn, setDrawn] = useState(false);
  const [noWebgl, setNoWebgl] = useState(false);
  // At the story's last stop the dialog offers the way into the Terminal (the Overview's control room), beside the
  // story's bar, or under it where the bar leaves no room; measured from the stage, so it never covers the bar.
  const [atEnd, setAtEnd] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const [endAt, setEndAt] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!atEnd) return setEndAt(null);
    const place = () => {
      const offer = endRef.current;
      const stage = offer?.parentElement;
      const bar = host.current?.querySelector<HTMLElement>(".gp-bar");
      if (!offer || !stage || !bar) return;
      const s = stage.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      const w = offer.offsetWidth;
      const h = offer.offsetHeight;
      const beside = b.right - s.left + 10 + w <= s.width - 12;
      setEndAt(beside ? { left: b.right - s.left + 10, top: b.top - s.top + (b.height - h) / 2 } : { left: (s.width - w) / 2, top: b.bottom - s.top + 8 });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [atEnd]);
  // The story records the site's theme on its root; the 3D holds dark in either.
  const siteTheme = useTheme();
  const theme = useRef(siteTheme);
  const live = useRef({ onClose, onRoute });
  live.current = { onClose, onRoute };

  // A modal dialog: the top layer over the masthead and the panel, the page
  // behind it inert, and the page's own scroll held while it is open. It opens
  // with focus on Close, not on the Sound switch before it.
  useLayoutEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const html = document.documentElement;
    const prior = html.style.overflow;
    html.style.overflow = "hidden";
    if (!d.open) d.showModal();
    close.current?.focus();
    return () => {
      if (d.open) d.close();
      html.style.overflow = prior;
    };
  }, []);

  // Esc leaves; Tab stays inside; the story's keys and the wheel work from
  // anywhere in the dialog, and never reach the page behind it.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const storyRoot = () => host.current?.querySelector<HTMLElement>(".gp-story") ?? null;
    const onCancel = (e: Event) => {
      e.preventDefault();
      live.current.onClose();
    };
    const onWheel = (e: WheelEvent) => {
      // ctrl with the wheel is the browser's zoom (a trackpad's pinch): left to it
      if (e.ctrlKey) return;
      const root = storyRoot();
      if (root?.contains(e.target as Node)) return;
      e.preventDefault();
      root?.dispatchEvent(new WheelEvent("wheel", { deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode, cancelable: true }));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        const items = tabbables(d);
        const first = items[0];
        const last = items[items.length - 1];
        const at = document.activeElement;
        if (!first || !last) {
          e.preventDefault();
        } else if (e.shiftKey && (at === first || !d.contains(at))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (at === last || !d.contains(at))) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      // The story takes its keys while it has focus: from the dialog's own
      // controls, focus moves into it and the same key steps it.
      const root = storyRoot();
      if (root && NAV_KEYS.has(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey && !root.contains(document.activeElement)) {
        root.focus({ preventScroll: true });
      }
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("keydown", onKey);
    d.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("keydown", onKey);
      d.removeEventListener("wheel", onWheel);
    };
  }, []);

  // The story itself: loaded and mounted once the dialog is open, disposed with it.
  useEffect(() => {
    let gone = false;
    let handle: StoryHandle | null = null;
    const offs: (() => void)[] = [];
    const fail = () => {
      if (gone) return;
      setNoWebgl(!webglAvailable());
      setPhase("failed");
    };
    import("@world/story/mount").then(({ mountStory }) => {
      const el = host.current;
      if (gone || !el) return;
      markStory(STORY_MARK.code);
      const story = mountStory(el, {
        mode: "site",
        theme: theme.current,
        reducedMotion: prefersReducedMotion(),
        onRoute: (id) => {
          const to = storyPath(id);
          if (to) live.current.onRoute(to);
        },
      });
      handle = story;
      let first = true;
      offs.push(
        story.on("beat", () => {
          if (!first || gone) return;
          first = false;
          markStory(STORY_MARK.firstBeat);
          setDrawn(true);
        }),
        story.on("beat", (b) => {
          if (!gone) setAtEnd((b as { index?: number } | undefined)?.index === story.beats.length - 1);
        }),
      );
      story.ready.then(() => {
        if (gone) return;
        markStory(STORY_MARK.ready);
        setPhase("live");
        // Focus moves into the story so its keys work at once, unless the
        // visitor has already moved it within the dialog.
        const at = document.activeElement;
        const root = el.querySelector<HTMLElement>(".gp-story");
        if (root && (at === dialog.current || at === document.body || (at instanceof HTMLElement && at.dataset.storyStart !== undefined))) {
          root.focus({ preventScroll: true });
        }
      }, fail);
    }, fail);
    return () => {
      gone = true;
      for (const off of offs) off();
      handle?.dispose();
    };
  }, []);

  const failed = phase === "failed";
  const shown = phase === "live" && drawn;

  return createPortal(
    <dialog ref={dialog} className="story-dialog" data-atmosphere="dark" aria-labelledby="story-dialog-title" aria-describedby="story-dialog-length">
      <div className="story-dialog__bar">
        <p className="story-dialog__title">
          <b id="story-dialog-title">Introduction</b>
          <span id="story-dialog-length">3 min, from one battery to the whole stack</span>
        </p>
        <div className="story-dialog__actions">
          <SoundToggle className="story-dialog__sound" />
          {/* The dialog opens with focus here; it moves into the story once that is ready. */}
          <button ref={close} type="button" className="btn story-dialog__close" onClick={() => live.current.onClose()} title="Close the introduction (Esc)" data-story-start="">
            <Glyph name="close" />
            <span className="story-dialog__close-label">Close</span>
          </button>
        </div>
      </div>
      <div className="story-dialog__stage" aria-busy={!shown && !failed ? true : undefined}>
        <div ref={host} className="story-dialog__host" />
        <figure className="story-dialog__still" data-gone={shown || undefined} aria-hidden="true">
          <img src={HERO_STILL.src} srcSet={HERO_STILL.srcSet} sizes="100vw" width={HERO_STILL.width} height={HERO_STILL.height} alt="" decoding="async" />
        </figure>
        {!shown && !failed && (
          <p className="story-dialog__status" role="status">
            Loading the introduction
          </p>
        )}
        {failed && (
          <div className="story-dialog__failed" role="alert">
            <p className="story-dialog__failed-head">
              {noWebgl ? "The story is drawn in 3D with WebGL, which this browser has turned off." : "The story could not start in this browser."}
            </p>
            <p className="story-dialog__failed-line">Every step of it is in the tabs.</p>
            <div className="story-dialog__failed-actions">
              <button type="button" className="btn" onClick={() => live.current.onRoute("/overview")}>
                Enter the Terminal
                <Glyph name="next" />
              </button>
              <button type="button" className="btn" onClick={() => live.current.onRoute("/about")}>
                How It Works
                <Glyph name="next" />
              </button>
            </div>
          </div>
        )}
        {atEnd && shown && !failed && (
          <div ref={endRef} className="story-dialog__end" style={endAt ? { left: endAt.left, top: endAt.top } : { visibility: "hidden" }}>
            <button type="button" className="btn btn--primary story-dialog__enter" onClick={() => live.current.onRoute("/overview")}>
              Enter the Terminal
              <Glyph name="next" />
            </button>
          </div>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
