import { useEffect, useRef, useState } from "react";
import type { BrainHandle } from "@world/stations/brain/mount";
import { liveFocusPages, splitPageKey } from "./logic";

// The chat's live stage: packages/world's mountBrain, our three brains as
// Living Brain holds them, the Memory tab's stage at the size the panel gives
// it. A picture here, not a control: the stage is inert, and its chips, cards
// and lists stay on the Memory tab (ness.css). An answer's pages light: pages
// in one brain bring it to the center with the first pinned, which lights its
// connections; pages in several brains show the combined brain. A ring marks
// each page's place on the stage, following it as the brains turn.
// Mounted while the panel is open and let go when it closes (the mount's
// dispose releases its WebGL context), so the GPU rests with it; the package
// and three.js load here by dynamic import, with the panel.

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** A page's ring stands where its dot is drawn, thinner on the brain's far side. */
function placeRings(h: BrainHandle, box: HTMLElement): void {
  for (const el of box.children as HTMLCollectionOf<HTMLElement>) {
    const p = splitPageKey(el.dataset.page ?? "");
    const at = p ? h.dotOf(p.brain, p.slug) : null;
    if (!at) {
      el.style.visibility = "hidden";
      continue;
    }
    el.style.visibility = "visible";
    el.style.transform = `translate3d(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    // on the brain's far side the ring thins (its name stays legible)
    el.dataset.far = at.facing < -0.15 ? "1" : "0";
    // the page's name stands beside its ring, on the side with room
    el.dataset.side = at.x > box.clientWidth - 170 ? "left" : "right";
  }
}

export function BrainLive({ pages, names, onReady }: { pages: readonly string[]; names: readonly string[]; onReady: (drawn: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const rings = useRef<HTMLDivElement>(null);
  const handle = useRef<BrainHandle | null>(null);
  const [ready, setReady] = useState(false);
  const key = pages.join(" ");
  const live = useRef({ pages, onReady });
  live.current = { pages, onReady };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.inert = true;
    let gone = false;
    let h: BrainHandle | null = null;
    import("@world/stations/brain/mount").then(
      async ({ mountBrain, prepareBrain }) => {
        if (gone) return;
        await prepareBrain(el, { quality: "low" });
        if (gone) return;
        h = mountBrain(el, { theme: "dark", quality: "low", reducedMotion: reducedMotion(), initial: liveFocusPages(live.current.pages) });
        handle.current = h;
        h.ready.then(
          () => {
            if (gone || !h) return;
            // an answer opened while the stage was being made
            const want = liveFocusPages(live.current.pages);
            const now = h.state();
            if (now.brain !== want.brain || now.page !== want.page) h.goTo(want);
            setReady(true);
            live.current.onReady(true);
          },
          () => {
            if (!gone) live.current.onReady(false);
          },
        );
      },
      () => {
        if (!gone) live.current.onReady(false);
      },
    );
    return () => {
      gone = true;
      handle.current = null;
      h?.dispose();
      live.current.onReady(false);
    };
  }, []);

  useEffect(() => {
    const h = handle.current;
    if (!h) return;
    const want = liveFocusPages(pages);
    const now = h.state();
    if (now.brain !== want.brain || now.page !== want.page) h.goTo(want);
    // `key` names the pages; the list itself is a new array at every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The rings follow the pages as the brains turn: every frame while the stage moves; with reduced motion the view
  // holds still, so they are placed as the camera settles and again when the stage is resized.
  useEffect(() => {
    const h = handle.current;
    const box = rings.current;
    const el = host.current;
    if (!ready || !h || !box || !el || pages.length === 0) return;
    const still = reducedMotion();
    let raf = 0;
    let until = 0;
    const tick = () => {
      raf = 0;
      placeRings(h, box);
      if (!still || performance.now() < until) raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      until = performance.now() + 1600;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    wake();
    const ro = new ResizeObserver(wake);
    ro.observe(el);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);

  return (
    <div className="ness-brains__live" aria-hidden="true">
      <div ref={host} className="ness-brains__gl" />
      <div ref={rings} className="ness-brains__rings">
        {pages.map((k, i) => (
          <span key={k} data-page={k} className={i === 0 ? "ness-ring ness-ring--first" : "ness-ring"} style={{ visibility: "hidden" }}>
            <span className="ness-ring__name">{names[i]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
