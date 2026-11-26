import { useEffect, useRef, useState, type RefObject } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { BrainHandle, BrainState } from "@world/stations/brain/mount";
import { isCapture } from "../../lib/capture";
import still from "../../ness/brains-still.jpg";
import { WORLD_TABS, worldTab } from "../../shell/tabs";
import { worldPath } from "../../shell/world";
import { Glyph, Section } from "../../ui";
import { loadBuild } from "../Memory/data";
import { sponsors, useLogoRegistry } from "../TechStack/sponsors";
import { bandTabs, correctionsOf, memoryHref } from "./build-memory";
import "./build-memory.css";

// The Intro's band on how the Grand Prix is built, after Step by Step and
// before the closing band: the build's memory in Living Brain, our three
// brains in 3D (packages/world's mountBrain, the Memory tab's stage), as the
// map of the Grand Prix. A page clicked pins its card, and a page that is a
// tab's own opens that tab from it ("Open Seal"); Open Memory takes the view
// shown here to the Memory tab. Dark in either theme, as the hero and the
// close are. The package and three.js load by dynamic import once the band
// comes within half a screen of the frame, and not before the page's first
// picture is in; the brains' particles are made in a worker before the mount,
// and the stage draws only while it is on screen (the mount stops its loop
// off screen and while the introduction covers the page). Until its first
// picture, and with Save-Data or without WebGL, the still of the same stage
// stands in. Leaving the page disposes it, which releases its WebGL context.

/** The tabs a page's card here may open: every tab the 3D names, but the Intro's own. */
const TABS = bandTabs(Object.keys(WORLD_TABS), worldTab);

/** Whether the reader has asked the browser to save data. */
function saveData(): boolean {
  try {
    return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  } catch {
    return false;
  }
}

/** True from when the element comes within half a screen of the frame (it never goes back), and not before `armed`. */
function useNear(ref: RefObject<HTMLElement>, armed: boolean): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near || !armed) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setNear(true);
        io.disconnect();
      }
    }, { rootMargin: "50% 0px 50% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, near, armed]);
  return near;
}

interface BuildMemoryProps {
  /** The page's first picture is in: the band may load its code as it nears the screen. */
  armed: boolean;
  /** The introduction is open over the page: the stage hides in its box and stops drawing until it closes. */
  paused?: boolean;
}

export function BuildMemory({ armed, paused = false }: BuildMemoryProps) {
  const stage = useRef<HTMLDivElement>(null);
  const space = useRef<HTMLDivElement>(null);
  const near = useNear(stage, armed);
  const registry = useLogoRegistry();
  const navigate = useNavigate();
  const go = useRef(navigate);
  go.current = navigate;
  const [failed, setFailed] = useState(false);
  const [drawn, setDrawn] = useState(false);
  // The view the visitor has made on the stage, which Open Memory carries to the tab.
  const [view, setView] = useState<BrainState | null>(null);
  const live = near && !failed && !saveData();

  useEffect(() => {
    const el = space.current;
    if (!live || !el) return;
    let gone = false;
    let h: BrainHandle | null = null;
    const fail = (error: unknown) => {
      if (gone) return;
      console.warn("The brains could not start:", error);
      h?.dispose();
      h = null;
      setFailed(true);
    };
    // The build brain's corrections stand beside Living Brain's text on the cards, as on the Memory tab.
    Promise.all([import("@world/stations/brain/mount"), loadBuild().catch(() => null)])
      .then(async ([{ mountBrain, prepareBrain }, build]) => {
        if (gone) return;
        await prepareBrain(el);
        if (gone) return;
        const handle = mountBrain(el, {
          theme: "dark",
          tabs: TABS,
          corrections: correctionsOf(build),
          // A recording holds the view still; otherwise the visitor's reduced-motion setting decides.
          reducedMotion: isCapture() ? true : undefined,
          onRoute: (id) => {
            const to = id === "memory" ? memoryHref(handle.state()) : worldPath(id);
            if (to) go.current(to);
          },
          onState: (s) => setView(s),
        });
        h = handle;
        // Without WebGL the mount lists every page: here the still stays, and the Memory tab keeps the list.
        if (el.querySelector(".lbm-root.is-flat")) {
          fail(new Error("no WebGL2"));
          return;
        }
        // ready settles as the first picture is asked for: the still gives way after it is drawn
        handle.ready.then(() => {
          if (!gone) requestAnimationFrame(() => requestAnimationFrame(() => !gone && setDrawn(true)));
        }, fail);
      })
      .catch(fail);
    return () => {
      gone = true;
      h?.dispose();
    };
  }, [live]);

  return (
    <div className="intro-brain" data-atmosphere="dark">
      <Section
        id="build-memory"
        variant="flush"
        className="intro-brain__section"
        builtWith={sponsors(registry, "livingbrain")}
        title="How the Grand Prix Is Built"
        lede="The build remembers itself in Living Brain: a page for each part, from this site's tabs to GateRecord, and how they connect."
        actions={
          <Link to={memoryHref(view)} className="btn intro-brain__open">
            Open Memory
            <Glyph name="next" />
          </Link>
        }
      >
        {/* The 3D's own cards and lists are not the page's sections (src/outline/scan.ts). */}
        <div ref={stage} className={`intro-brain__stage${drawn ? " is-live" : ""}`} data-paused={paused || undefined} data-outline-skip="">
          <img className="intro-brain__still" src={still} alt="" width={840} height={323} loading="lazy" decoding="async" draggable={false} />
          <div ref={space} className="intro-brain__space" />
        </div>
      </Section>
    </div>
  );
}
