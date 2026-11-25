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
  if (step.side !== side) return <span className={`vf-ladder__side vf-ladder__side--${side}`} />;
  return (
    <span className={`vf-ladder__side vf-ladder__side--${side} has-sib`}>
      <span className="vf-ladder__sib mono" title={step.sibling}>
        {middle(step.sibling, 6, 4)}
      </span>
    </span>
  );
}

/**
 * The audit path drawn as a climb, in lines and text: the plan's leaf at the
 * foot, one sibling per level joining from its side, the day's root at the top.
 */
export function ProofLadder({ leaf, steps, index, size, ok }: ProofLadderProps) {
  const levels = steps.map((s, i) => ({ s, level: i + 1 })).reverse();
  return (
    <figure className={`vf-ladder${ok ? "" : " is-bad"}`}>
      <figcaption className="vf-ladder__title">
        The Proof, Level by Level <span className="muted">{steps.length} levels from the leaf to the root</span>
      </figcaption>
      <ol className="vf-ladder__rows" aria-label={`Merkle audit path, ${steps.length} levels`}>
        {levels.map(({ s, level }) => {
          const root = level === steps.length;
          return (
            <li key={level} className={`vf-ladder__row${root ? " vf-ladder__row--root" : ""}`}>
              <span className="vf-ladder__level num">{root ? "Root" : `Level ${level}`}</span>
              <Sib step={s} side="left" />
              <span className="vf-ladder__node">
                <span className="mono" title={s.result}>
                  {root && ok && <i className="seal-mark" aria-hidden="true" />}
                  {middle(s.result, 6, 4)}
                </span>
              </span>
              <Sib step={s} side="right" />
            </li>
          );
        })}
        <li className="vf-ladder__row vf-ladder__row--leaf">
          <span className="vf-ladder__level num">Leaf</span>
          <span className="vf-ladder__side" />
          <span className="vf-ladder__node">
            <span className="mono" title={leaf}>
              {middle(leaf, 6, 4)}
            </span>
          </span>
          <span className="vf-ladder__side vf-ladder__side--note num">
            {index + 1} of {size}
          </span>
        </li>
      </ol>
      <p className="vf-caption">Each level is SHA-256(0x01 ‖ left ‖ right), as RFC 6962 sets it. The siblings come from the day's index of leaf hashes.</p>
    </figure>
  );
}
