// Controls and panes the Battery and agent tabs share, in the Terminal's
// grammar: the plan selector is the segmented control, facts are a definition
// grid with hairline rules, the readout is the charts' tooltip (every series at
// the hovered hour, values first), and the flow line says where a tab sits in
// the pipeline.

import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ArmName } from "../../../data";
import { arm as armTokens } from "../../../design/tokens";
import { Glyph } from "../../../ui";

export const PLANS: ArmName[] = ["A", "B", "C"];

/** "No hedge", "Hedge on a fixed schedule", "Schedule and hedge together". */
export const planLabel = (p: ArmName) => armTokens[p].label;
export const planColor = (p: ArmName) => armTokens[p].color;
export const planStyle = (p: ArmName) => ({ "--plan": armTokens[p].color }) as CSSProperties;

/** A plan's name with its swatch: identity rides the mark beside the words, never the words' color. */
export function PlanName({ plan, sealed, long = true, className }: { plan: ArmName; sealed?: boolean; long?: boolean; className?: string }) {
  // Short form (a phone's table): the seal's mark without its word.
  return (
    <span className={`pk-plan${className ? ` ${className}` : ""}`} style={planStyle(plan)}>
      <span className="pk-plan__swatch" aria-hidden="true" />
      <span className="pk-plan__name">Plan {plan}</span>
      {long && <span className="pk-plan__label">{planLabel(plan)}</span>}
      {sealed && (
        <span className="pk-plan__sealed" title={`Plan ${plan} was sealed on BNB Chain`}>
          <Glyph name="seal" />
          {long ? "Sealed" : <span className="visually-hidden">sealed</span>}
        </span>
      )}
    </span>
  );
}

/** The plan selector: the Terminal's segmented control, one button per plan. */
export function PlanSeg({ value, sealed, available, onChange }: { value: ArmName; sealed: ArmName; available: ArmName[]; onChange: (p: ArmName) => void }) {
  return (
    <div className="seg pk-seg" role="group" aria-label="Plan">
      {PLANS.map((p) => (
        <button key={p} type="button" aria-pressed={p === value} disabled={!available.includes(p)} onClick={() => onChange(p)} style={planStyle(p)}>
          <span className="pk-plan__swatch" aria-hidden="true" />
          <span className="pk-seg__name">Plan {p}</span>
          <span className="pk-seg__label">{planLabel(p)}</span>
          {p === sealed && (
            <>
              <Glyph name="seal" />
              <span className="visually-hidden">, sealed</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}

export interface ReadoutValue {
  key: string;
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  /** A plan's or a series' mark beside the label. */
  mark?: { kind: "line" | "bar" | "band" | "band-inner" | "ghost" | "dot" | "ring" | "tick"; plan?: string };
}

/**
 * The charts' tooltip, pinned above them: the hovered hour and every series at
 * it, values leading. Its height never changes, so a hover never moves the page.
 */
export function Readout({ when, hint, values, className }: { when: ReactNode; hint?: ReactNode; values: ReadoutValue[]; className?: string }) {
  return (
    <div className={`pk-readout${className ? ` ${className}` : ""}`} aria-live="polite">
      <div className="pk-readout__when">
        <span className="pk-readout__time num">{when}</span>
        {hint && <span className="pk-readout__hint">{hint}</span>}
      </div>
      <dl className="pk-readout__vals">
        {values.map((v) => (
          <div key={v.key} className="pk-readout__val">
            <dt>
              {v.mark && <span className={`pk-key pk-key--${v.mark.kind}`} style={v.mark.plan ? ({ "--plan": v.mark.plan } as CSSProperties) : undefined}><span className="pk-key__mark" aria-hidden="true" /></span>}
              {v.label}
            </dt>
            <dd>
              <span className="pk-readout__num num">{v.value}</span>
              {v.unit && <span className="pk-readout__unit">{v.unit}</span>}
              <span className="pk-readout__sub num">{v.sub ?? " "}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Facts as a definition grid: label over value, a hairline between rows. */
export function Facts({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={`pk-facts${className ? ` ${className}` : ""}`}>{children}</dl>;
}

export function Fact({ label, children, assumed, note, wide }: { label: ReactNode; children: ReactNode; assumed?: boolean; note?: ReactNode; wide?: boolean }) {
  return (
    <div className={`pk-fact${wide ? " pk-fact--wide" : ""}`}>
      <dt>
        {label}
        {assumed && (
          <span className="pk-tag" title="An assumption the plan states, not a measured value">
            assumed
          </span>
        )}
      </dt>
      <dd>
        {children}
        {note && <span className="pk-fact__note">{note}</span>}
      </dd>
    </div>
  );
}

/** Ratios against one limit each, one row per plan: name, bar, figure. */
export function Meters({ rows, label }: { rows: { key: string; name: ReactNode; share: number; figure: ReactNode; plan?: string }[]; label: string }) {
  return (
    <ul className="pk-meters" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} className="pk-meter" style={r.plan ? ({ "--plan": r.plan } as CSSProperties) : undefined}>
          <span className="pk-meter__name">{r.name}</span>
          <span className="pk-meter__track" aria-hidden="true">
            <span className="pk-meter__fill" style={{ width: `${Math.max(0, Math.min(1, r.share)) * 100}%` }} />
          </span>
          <span className="pk-meter__figure num">{r.figure}</span>
        </li>
      ))}
    </ul>
  );
}

/** A link to another tab, by its path. */
export function TabLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="pk-tablink" to={to}>
      {children}
    </Link>
  );
}

/** Where the tab sits in the pipeline, in one line under the lede. */
export function Flow({ children }: { children: ReactNode }) {
  return <span className="pk-flow">{children}</span>;
}
