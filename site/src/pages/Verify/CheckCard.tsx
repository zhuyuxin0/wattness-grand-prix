import type { ReactNode } from "react";
import { dualTime } from "../../lib/time";
import { Glyph, Hash } from "../../ui";
import { LimitsTable } from "./LimitsTable";
import { ProofLadder } from "./ProofLadder";
import type { Tamper } from "./useStewards";
import { TITLES, type CheckId, type CheckResult, type Comparison, type Status } from "./verify/run";

export type CheckState = Status | "running";

const WORD: Record<CheckState, string> = { pass: "Pass", fail: "Fail", unread: "Not read", running: "Checking" };

/** A check's state as a word with its glyph, in the Terminal's state colors (never the accent). */
export function Verdict({ status, label }: { status: CheckState; label?: string }) {
  return (
    <span className={`vf-state vf-state--${status}`}>
      {status === "pass" && <Glyph name="check" />}
      {status === "fail" && <Glyph name="close" />}
      <span>{label ?? WORD[status]}</span>
    </span>
  );
}

/** A hash in full where the row has room; shortened in the middle on a phone. Either way the copy holds all of it. */
function Value({ c, which }: { c: Comparison; which: "expected" | "actual" }) {
  const v = which === "expected" ? c.expected : c.actual;
  if (c.kind === "hash" && v.startsWith("0x")) {
    return (
      <>
        <Hash value={v} full label={c.label.toLowerCase()} className="vf-hash vf-hash--full" />
        <Hash value={v} head={8} tail={6} label={c.label.toLowerCase()} className="vf-hash vf-hash--short" />
      </>
    );
  }
  return <span className="vf-text num">{v}</span>;
}

function Comparisons({ items }: { items: Comparison[] }) {
  return (
    <div className="vf-cmps">
      {items.map((c) => (
        <div key={c.label} className={`vf-cmp${c.ok ? "" : " is-bad"}`}>
          <div className="vf-cmp__label">
            <span>{c.label}</span>
            <span className="vf-cmp__mark">
              <Glyph name={c.ok ? "check" : "close"} />
              {c.ok ? "Match" : "Differs"}
            </span>
          </div>
          <dl className="vf-cmp__rows">
            <div>
              <dt>Expected</dt>
              <dd>
                <Value c={c} which="expected" />
                <span className="vf-from">{c.expectedFrom}</span>
              </dd>
            </div>
            <div>
              <dt>Checked</dt>
              <dd>
                <Value c={c} which="actual" />
                <span className="vf-from">{c.actualFrom}</span>
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
/** A changed value as a figure: thousands grouped, a true minus. */
const shown = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-US").replace("-", "−") : String(v));
const formatKw = (kw: number) => `${(kw / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 }).replace("-", "−")} MW`;

/** "44 min 43 s": the lead to the second. */
export function leadText(seconds: number): string {
  const s = Math.abs(Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return [h ? `${h} h` : "", m || h ? `${m} min` : "", `${r} s`].filter(Boolean).join(" ");
}

interface CheckProps {
  id: CheckId;
  result: CheckResult | undefined;
  tamper: Tamper | null;
  onRetry?: () => void;
}

/** One numbered check: what it claims, its state, and every value it compared with where each came from. */
export function Check({ id, result, tamper, onRetry }: CheckProps) {
  const meta = TITLES[id];
  const status: CheckState = result?.status ?? "running";
  let body: ReactNode = <div className="vf-pending" aria-hidden="true" />;

  if (result) {
    const extra: ReactNode[] = [];
    if (result.id === 1 && result.differences.length > 0) {
      extra.push(
        <div key="diff" className="vf-diff" role="group" aria-label="Fields that differ from the sealed plan">
          <div className="vf-diff__head">
            <Glyph name="close" />
            {result.differences.length === 1 ? "One field differs from the sealed plan" : `${result.differences.length} fields differ from the sealed plan`}
          </div>
          <table className="vf-diff__rows">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col" className="r">
                  Sealed
                </th>
                <th scope="col" className="r">
                  This copy
                </th>
              </tr>
            </thead>
            <tbody>
              {result.differences.slice(0, 6).map((d) => (
                <tr key={d.path}>
                  <td>
                    <code>{d.path}</code>
                  </td>
                  <td className="r num">{shown(d.sealed)}</td>
                  <td className="r num vf-diff__new">{shown(d.checked)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {tamper && (
            <p className="vf-diff__note">
              {formatKw(tamper.sealedKw)} became {formatKw(tamper.tamperedKw)} in hour {tamper.hour} ({pad(tamper.hour)}:00 to {pad(tamper.hour + 1)}:00 CT) of plan {tamper.arm}. A change to any
              byte gives a different leaf.
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
        <dl key="gate" className="vf-gate">
          <div>
            <dt>Committed, block time</dt>
            <dd className="num">{t.ct}</dd>
            {t.yours && <dd className="vf-gate__yours num">{t.yours}</dd>}
          </div>
          <div className="vf-gate__lead">
            <dt>{lead >= 0 ? "Sealed before the gate" : "After the gate"}</dt>
            <dd className="num">
              {lead >= 0 && <i className="seal-mark" aria-hidden="true" />}
              {leadText(lead)}
            </dd>
          </div>
          <div>
            <dt>The gate</dt>
            <dd className="num">{g.ct}</dd>
            {g.yours && <dd className="vf-gate__yours num">{g.yours}</dd>}
          </div>
        </dl>,
      );
    }
    if (result.id === 5 && result.limits) extra.push(<LimitsTable key="limits" report={result.limits} />);

    body = (
      <>
        {result.comparisons.length > 0 && <Comparisons items={result.comparisons} />}
        {extra}
        {result.status === "unread" && (
          <div className="vf-unread">
            <p>{result.error ? `No public BSC node answered: ${result.error.replace(/^no public node answered \(|\)$/g, "")}.` : "The chain could not be read."}</p>
            {onRetry && (
              <button type="button" className="btn" onClick={onRetry}>
                Read again
              </button>
            )}
          </div>
        )}
        {result.notes.length > 0 && (
          <ul className={`vf-notes${result.id === 5 && result.status === "fail" ? " is-problems" : ""}`}>
            {result.notes.map((n) => (
              <li key={n}>{n.replace(/^arm ([A-Z]):/, "Plan $1:")}</li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <li className={`vf-check vf-check--${status}`} aria-busy={!result} aria-labelledby={`vf-check-${id}`}>
      <div className="vf-check__head">
        <span className="vf-check__n num">{id}</span>
        <div className="vf-check__titles">
          <h3 id={`vf-check-${id}`}>{meta.title}</h3>
          <span className="vf-check__claim">{meta.claim}</span>
        </div>
        <Verdict status={status} />
      </div>
      <div className="vf-check__body">{body}</div>
    </li>
  );
}
