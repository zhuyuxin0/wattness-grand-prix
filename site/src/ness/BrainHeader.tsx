import { useState } from "react";
import { BRAIN_PAGES, BRAINS } from "./answers";
import { BrainLive } from "./BrainLive";
import { splitPageKey } from "./logic";
import still from "./brains-still.jpg";

// The panel's header: our three brains in Living Brain, the map of how the
// Grand Prix is built. An answer drawn from a Living Brain page lights the
// brain that holds it and names the page.
//
// While the panel is open the brains are drawn live by packages/world's
// mountBrain (BrainLive.tsx), the Memory tab's stage at the header's size,
// and an answer's page is pinned there with its connections lit. Until the
// stage's first picture, and wherever WebGL is off, the still of that stage
// (its combined view, Nov 26) stands in, and the answer lights the brain that
// holds its page.

/** Where each member brain sits in the still, as fractions of its width and height, and its size. */
const SPOTS: Record<string, { x: number; y: number; r: number }> = {
  "grand-prix": { x: 0.167, y: 0.449, r: 0.085 },
  "battery-review": { x: 0.652, y: 0.232, r: 0.06 },
  terminal: { x: 0.757, y: 0.718, r: 0.1 },
};

export function BrainHeader({ lit, live }: { lit: string | null; live: boolean }) {
  const [drawn, setDrawn] = useState(false);
  const page = lit ? splitPageKey(lit) : null;
  const spot = page ? SPOTS[page.brain] : undefined;
  return (
    <div className="ness-brains" aria-hidden="true" data-live={(live && drawn) || undefined}>
      <div className="ness-brains__frame">
        <img className="ness-brains__still" src={still} alt="" width={840} height={323} decoding="async" draggable={false} />
        {spot && (
          <span
            key={lit}
            className="ness-brains__lit"
            style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, width: `${spot.r * 200}%` }}
          />
        )}
      </div>
      {live && <BrainLive lit={lit} onReady={setDrawn} />}
    </div>
  );
}

/** The words under the header: what the picture is, or the page an answer comes from. */
export function brainCaption(lit: string | null): { lead: string; page: string | null; brain: string | null } {
  const page = lit ? splitPageKey(lit) : null;
  if (!page || !lit) return { lead: "Living Brain: how the Grand Prix is built", page: null, brain: null };
  return { lead: "From Living Brain", page: BRAIN_PAGES[lit] ?? page.slug, brain: BRAINS[page.brain] ?? page.brain };
}
