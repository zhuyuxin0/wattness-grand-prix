import type { ReactNode } from "react";
import { Glyph } from "../../ui";

/** A section's hashes and addresses, folded: every item one click away, in ONE PLAN's folded panel. */
export function CheckIt({ what, children }: { what: string; children: ReactNode }) {
  return (
    <details className="season-check">
      <summary className="season-check__summary">
        <span>
          <b>Check it</b>
          <span className="muted">: {what}</span>
        </span>
        <Glyph name="caret" className="season-check__caret" />
      </summary>
      <div className="season-check__body">{children}</div>
    </details>
  );
}
