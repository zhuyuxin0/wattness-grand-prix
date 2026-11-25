import type { ReactNode } from "react";
import { formatLead } from "../../lib/format";
import { dualTime } from "../../lib/time";
import { Glyph, Hash } from "../../ui";
import { ProofLadder } from "./ProofLadder";
import { LimitsTable } from "./LimitsTable";
import type { Tamper } from "./useStewards";
import { TITLES, type CheckId, type CheckResult, type Comparison, type Status } from "./verify/run";

export function Verdict({ status, size = "md" }: { status: Status | "running"; size?: "sm" | "md" }) {
  const label = status === "pass" ? "Pass" : status === "fail" ? "Fail" : status === "unread" ? "No read" : "Checking";
  return (
    <span className={`st-verdict st-verdict--${status} st-verdict--${size}`}>
      {status === "pass" && <Glyph name="check" size={size === "sm" ? 11 : 13} />}
      {status === "fail" && <Glyph name="cross" size={size === "sm" ? 11 : 13} />}
      <span>{label}</span>
    </span>
  );
}

function Value({ c, which }: { c: Comparison; which: "expected" | "actual" }) {
  const v = which === "expected" ? c.expected : c.actual;
  if (c.kind === "hash" && v.startsWith("0x")) return <Hash value={v} full label={c.label.toLowerCase()} className="st-cmp__hash" />;
  return <span className="st-cmp__text num">{v}</span>;
}

function Comparisons({ items }: { items: Comparison[] }) {
  return (
    <div className="st-cmps">
      {items.map((c) => (
        <div key={c.label} className={`st-cmp${c.ok ? " is-ok" : " is-bad"}`}>
          <div className="st-cmp__head">
            <span className="st-cmp__label">{c.label}</span>
            <span className="st-cmp__mark">
              <Glyph name={c.ok ? "check" : "cross"} size={12} />
              {c.ok ? "match" : "differs"}
            </span>
          </div>
          <dl className="st-cmp__rows">
            <div>
              <dt>Expected</dt>
              <dd>
                <Value c={c} which="expected" />
                <span className="st-cmp__from">{c.expectedFrom}</span>
              </dd>
            </div>
            <div>
              <dt>Checked</dt>
              <dd>
                <Value c={c} which="actual" />
                <span className="st-cmp__from">{c.actualFrom}</span>
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}

interface CheckCardProps {
  id: CheckId;
  result: CheckResult | undefined;
  tamper: Tamper | null;
  onRetry?: () => void;
}

export function CheckCard({ id, result, tamper, onRetry }: CheckCardProps) {
  const meta = TITLES[id];
  const status = result?.status ?? "running";
  let body: ReactNode = <div className="st-check__pending" aria-hidden="true" />;

  if (result) {
    const extra: ReactNode[] = [];
    if (result.id === 1 && result.differences.length > 0) {
      extra.push(
        <div key="diff" className="st-diff" role="group" aria-label="Fields that differ from the sealed plan">
          <div className="st-diff__head">
            {result.differences.length === 1 ? "One field differs from the sealed plan" : `${result.differences.length} fields differ from the sealed plan`}
          </div>
          {result.differences.slice(0, 6).map((d) => (
            <div key={d.path} className="st-diff__row">
              <code className="st-diff__path">{d.path}</code>
              <span className="st-diff__old num"><span className="st-diff__tag">sealed</span>{String(d.sealed)}</span>
              <span className="st-diff__new num"><span className="st-diff__tag">copy</span>{String(d.checked)}</span>
            </div>
          ))}
          {tamper && (
            <p className="st-diff__note">
              {formatKw(tamper.sealedKw)} became {formatKw(tamper.tamperedKw)} in hour {tamper.hour} ({pad(tamper.hour)}:00 to {pad(tamper.hour + 1)}:00 CT) of arm {tamper.arm}. Any change to any byte gives a different leaf.
            </p>
          )}
        </div>,
      );
    }
    if (result.id === 2) extra.push(<ProofLadder key="proof" leaf={result.leaf} steps={result.steps} index={result.index} size={result.size} ok={result.status === "pass"} />);
    if (result.id === 4 && result.committedAt !== null) {
      const t = dualTime(result.committedAt);
      const g = dualTime(result.gate);
      const lead = result.gate - result.committedAt;
      extra.push(
        <div key="gate" className="st-gate">
          <div>
            <span className="eyebrow">Committed</span>
            <span className="st-gate__t num">{t.ct}</span>
            <span className="muted num">{t.bangkok}</span>
          </div>
          <div className="st-gate__lead">
            <span className="st-gate__digits num">{formatLead(lead)}</span>
            <span className="muted">{lead >= 0 ? "before the gate" : "after the gate"}</span>
          </div>
          <div>
            <span className="eyebrow">Gate</span>
            <span className="st-gate__t num">{g.ct}</span>
            <span className="muted num">{g.bangkok}</span>
          </div>
        </div>,
      );
    }
    if (result.id === 5 && result.limits) extra.push(<LimitsTable key="limits" report={result.limits} />);

    body = (
      <>
        {result.comparisons.length > 0 && <Comparisons items={result.comparisons} />}
        {extra}
        {result.status === "unread" && (
          <div className="st-unread">
            <p>{result.error ?? "The chain could not be read."}</p>
            {onRetry && (
              <button type="button" className="st-btn st-btn--ghost" onClick={onRetry}>
                Read again
              </button>
            )}
          </div>
        )}
        {result.notes.length > 0 && (
          <ul className="st-notes">
            {result.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <article className={`st-check st-check--${status}`} aria-busy={!result} aria-labelledby={`st-check-${id}`}>
      <div className="st-check__rail">
        <span className="st-check__num num">{String(id).padStart(2, "0")}</span>
        <Verdict status={status} />
      </div>
      <div className="st-check__main">
        <header className="st-check__head">
          <h3 id={`st-check-${id}`}>{meta.title}</h3>
          <span className="st-claim">{meta.claim}</span>
        </header>
        {body}
      </div>
    </article>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const formatKw = (kw: number) => `${(kw / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 }).replace("-", "−")} MW`;
