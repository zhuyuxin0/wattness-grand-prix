import { useState } from "react";
import { BRAIN_PAGES, BRAINS } from "./answers";
import { BrainLive } from "./BrainLive";
import { splitPageKey } from "./logic";
import still from "./brains-still.jpg";

// The brains in the middle of the chat: our three brains in Living Brain, the
// map of how the Grand Prix is built, large in the chat body before a question
// is opened (in full screen, the conversation's backdrop), and smaller beside
// or above an answer, lighting the pages it rests on. The panel places the
// stage (ness.css); the stage is the same element in every mode and view, so
// the brains keep drawing as the panel changes shape.
//
// While the panel is open the brains are drawn live by packages/world's
// mountBrain (BrainLive.tsx). Until the stage's first picture, and wherever
// WebGL is off, the still of that stage (its combined view, Nov 26) stands in,
// and the answer lights the brains that hold its pages.

/** Where each member brain sits in the still, as fractions of its width and height, and its size. */
const SPOTS: Record<string, { x: number; y: number; r: number }> = {
  "grand-prix": { x: 0.167, y: 0.449, r: 0.085 },
  "battery-review": { x: 0.652, y: 0.232, r: 0.06 },
  terminal: { x: 0.757, y: 0.718, r: 0.1 },
};

/** A page's name: its title in Living Brain as a live answer gives it, else as a prepared answer names it, else its slug. */
const nameOf = (k: string, titles?: Readonly<Record<string, string>>) => titles?.[k] ?? BRAIN_PAGES[k] ?? splitPageKey(k)?.slug ?? k;

export function NessBrain({ pages, live, titles }: { pages: readonly string[]; live: boolean; titles?: Readonly<Record<string, string>> }) {
  const [drawn, setDrawn] = useState(false);
  const brains = [...new Set(pages.map((k) => splitPageKey(k)?.brain).filter((b): b is string => !!b && b in SPOTS))];
  return (
    <div className="ness-brains" aria-hidden="true" data-live={(live && drawn) || undefined}>
      <div className="ness-brains__frame">
        <img className="ness-brains__still" src={still} alt="" width={840} height={323} decoding="async" draggable={false} />
        {brains.map((b) => {
          const spot = SPOTS[b]!;
          return (
            <span
              key={`${b}:${pages.join(" ")}`}
              className="ness-brains__lit"
              style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, width: `${spot.r * 200}%` }}
            />
          );
        })}
      </div>
      {live && <BrainLive pages={pages} names={pages.map((k) => nameOf(k, titles))} onReady={setDrawn} />}
    </div>
  );
}

/** The words with the brains: what the picture is, or the page an answer comes from (and how many more it lights). */
export function brainCaption(
  pages: readonly string[],
  titles?: Readonly<Record<string, string>>,
): { lead: string; page: string | null; brain: string | null; more: number } {
  const first = pages[0] ?? null;
  const page = first ? splitPageKey(first) : null;
  if (!page || !first) return { lead: "Living Brain: how the Grand Prix is built", page: null, brain: null, more: 0 };
  return { lead: "From Living Brain", page: nameOf(first, titles), brain: BRAINS[page.brain] ?? page.brain, more: pages.length - 1 };
}
