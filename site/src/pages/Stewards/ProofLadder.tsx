import { middle } from "../../ui";
import type { ProofStep } from "./verify/core";

interface ProofLadderProps {
  leaf: string;
  steps: ProofStep[];
  index: number;
  size: number;
  ok: boolean;
}

function Sib({ step, side }: { step: ProofStep; side: "left" | "right" }) {
  if (step.side !== side) return <span className={`st-ladder__side st-ladder__side--${side}`} />;
  return (
    <span className={`st-ladder__side st-ladder__side--${side} has-sib`}>
      <span className="st-ladder__sib mono" title={step.sibling}>
        {middle(step.sibling, 6, 4)}
      </span>
    </span>
  );
}

/**
 * The audit path as a climb: the battery's leaf at the bottom, one sibling
 * per level joining from the left or the right, the root at the top.
 */
export function ProofLadder({ leaf, steps, index, size, ok }: ProofLadderProps) {
  const levels = steps.map((s, i) => ({ s, level: i + 1 })).reverse();
  return (
    <figure className={`st-ladder${ok ? "" : " is-bad"}`} aria-label={`Merkle audit path, ${steps.length} levels`}>
      <ol className="st-ladder__rows">
        {levels.map(({ s, level }) => {
          const root = level === steps.length;
          return (
            <li key={level} className={`st-ladder__row${root ? " st-ladder__row--root" : ""}`}>
              <span className="st-ladder__level num">{root ? "Root" : `L${level}`}</span>
              <Sib step={s} side="left" />
              <span className={`st-ladder__node mono${root ? " st-ladder__node--root" : ""}`} title={s.result}>
                {root ? middle(s.result, 10, 8) : middle(s.result, 6, 4)}
              </span>
              <Sib step={s} side="right" />
            </li>
          );
        })}
        <li className="st-ladder__row st-ladder__row--leaf">
          <span className="st-ladder__level num">Leaf</span>
          <span className="st-ladder__side" />
          <span className="st-ladder__node st-ladder__node--leaf mono" title={leaf}>
            {middle(leaf, 6, 4)}
          </span>
          <span className="st-ladder__side st-ladder__side--note num">
            {index + 1} of {size}
          </span>
        </li>
      </ol>
      <figcaption className="st-ladder__cap">
        Each level is SHA-256(0x01 ‖ left ‖ right), RFC 6962. The siblings come from the day's index of leaf hashes.
      </figcaption>
    </figure>
  );
}
