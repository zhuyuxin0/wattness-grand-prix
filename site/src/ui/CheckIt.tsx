import { useState, type ReactNode } from "react";
import { Glyph } from "./Glyph";
import { Hash } from "./Hash";
import { CHECK_WORDS as WORDS, countLine, type CheckKind } from "./check-count";
import "./check-it.css";

// One "Check it" per section: the files, transactions, addresses and hashes behind the section's figures, folded into
// one compact line ("Verified · 3 files · 2 transactions") that opens the full list. Every item stays in the list
// whole, copyable and, where it has one, a link to the place it can be checked. The line says Verified only when the
// page itself has checked the items (a live read, a recomputed hash); otherwise it counts them.

export { countLine, type CheckKind };

export interface CheckItem {
  kind: CheckKind;
  /** What the value is, in words: "PLNR's vault", "plans/DSWL_ESS_ESR1.json". */
  label: ReactNode;
  value: string;
  /** Where it can be checked: an explorer page, the file's public address. */
  href?: string | null;
  /** One short line under the value. */
  note?: ReactNode;
  /** The copy button's object, "Copy the <copy>"; the label when it is a string, else the kind. */
  copy?: string;
}

/** "Verified": the page checked every item itself; "checking": a check is running; "failed": one did not match. */
export type CheckStatus = "verified" | "checking" | "failed";

export interface CheckItProps {
  items: readonly CheckItem[];
  status?: CheckStatus | null;
  /** How the items were checked, or where to check them: one line at the top of the open list. */
  how?: ReactNode;
  /** Open on first draw (an address's #id that names it, a test). */
  open?: boolean;
  id?: string;
  className?: string;
}

const STATUS: Record<CheckStatus, { word: string; glyph: "check" | "refresh" | "close" }> = {
  verified: { word: "Verified", glyph: "check" },
  checking: { word: "Checking", glyph: "refresh" },
  failed: { word: "Did not match", glyph: "close" },
};

export function CheckIt({ items, status, how, open, id, className }: CheckItProps) {
  // the list is drawn once opened, so a section with a thousand files keeps a light page
  const [drawn, setDrawn] = useState(!!open);
  if (!items.length) return null;
  const s = status ? STATUS[status] : null;
  return (
    <details
      className={`checkit${s ? ` checkit--${status}` : ""}${className ? ` ${className}` : ""}`}
      id={id}
      open={open || undefined}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) setDrawn(true);
      }}
    >
      <summary className="checkit__line">
        {s && (
          <span className="checkit__status">
            <Glyph name={s.glyph} />
            {s.word}
          </span>
        )}
        <span className="checkit__count num">{countLine(items)}</span>
        <span className="checkit__open">
          Check it
          <Glyph name="fold" className="checkit__closed" />
          <Glyph name="fold-open" className="checkit__opened" />
        </span>
      </summary>
      {drawn && (
        <div className="checkit__body">
          {how && <p className="checkit__how">{how}</p>}
          <dl className="checkit__list">
            {items.map((it, i) => (
              <div key={`${it.kind}:${it.value}:${i}`} className="checkit__row">
                <dt>
                  <span className="checkit__kind">{WORDS[it.kind][0]}</span>
                  <span className="checkit__label">{it.label}</span>
                </dt>
                <dd>
                  <Hash value={it.value} full href={it.href ?? undefined} label={it.copy ?? (typeof it.label === "string" ? it.label : WORDS[it.kind][0])} />
                  {it.note && <p className="checkit__note">{it.note}</p>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </details>
  );
}
