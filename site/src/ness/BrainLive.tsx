import { useEffect, useRef } from "react";
import type { BrainHandle } from "@world/stations/brain/mount";
import { liveFocus } from "./logic";

// The header's live stage: packages/world's mountBrain, our three brains as
// Living Brain holds them, the Memory tab's stage at the header's size. A
// picture here, not a control: the stage is inert, and its chips, cards and
// lists stay on the Memory tab (ness.css). An answer drawn from a page brings
// its brain to the center and pins the page, which lights its connections.
// Mounted while the panel is open and let go when it closes, so the GPU rests
// with it; the package and three.js load here by dynamic import, with the panel.

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function BrainLive({ lit, onReady }: { lit: string | null; onReady: (drawn: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<BrainHandle | null>(null);
  const live = useRef({ lit, onReady });
  live.current = { lit, onReady };

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
        h = mountBrain(el, { theme: "dark", quality: "low", reducedMotion: reducedMotion(), initial: liveFocus(live.current.lit) });
        handle.current = h;
        h.ready.then(
          () => {
            if (gone || !h) return;
            // an answer opened while the stage was being made
            const want = liveFocus(live.current.lit);
            const now = h.state();
            if (now.brain !== want.brain || now.page !== want.page) h.goTo(want);
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
    const want = liveFocus(lit);
    const now = h.state();
    if (now.brain !== want.brain || now.page !== want.page) h.goTo(want);
  }, [lit]);

  return <div ref={host} className="ness-brains__live" aria-hidden="true" />;
}
