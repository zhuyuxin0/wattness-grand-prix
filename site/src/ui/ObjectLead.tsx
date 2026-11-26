import type { ReactNode } from "react";
import { ObjectStill } from "./ObjectStill";

// A tab's first view: the object the 3D world already models for it (ObjectStill), with a few plain lines beside it.
// The still comes first in reading order, so on a phone it stands above the words.

export interface ObjectLeadProps {
  /** The still's name in public/renders/. */
  still: string;
  alt: string;
  /** Whose figures the still draws, and their day, in the frame's corner. */
  caption?: ReactNode;
  /** A small line over the words: where in the 3D the object comes from. */
  from?: ReactNode;
  /** An accessible name for the block. */
  label: string;
  children: ReactNode;
  className?: string;
}

export function ObjectLead({ still, alt, caption, from, label, children, className }: ObjectLeadProps) {
  return (
    <section className={`object-lead${className ? ` ${className}` : ""}`} aria-label={label}>
      <ObjectStill className="object-lead__still" name={still} alt={alt} caption={caption} eager sizes="(max-width: 899px) calc(100vw - 32px), 50vw" />
      <div className="object-lead__text">
        {from && <p className="object-lead__from">{from}</p>}
        {children}
      </div>
    </section>
  );
}
