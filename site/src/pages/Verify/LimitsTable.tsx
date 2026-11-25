import type { ReactNode } from "react";
import { arm as armMeta, type ArmName } from "../../design/tokens";
import { Glyph } from "../../ui";
import type { ArmLimits, LimitsReport } from "./verify/core";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 3 });
const mw = (kw: number) => fmt(kw / 1000);
const mwh = (ukwh: number) => fmt(ukwh / 1e9);
const mwhKwh = (kwh: number) => fmt(kwh / 1000);

interface Measure {
  key: string;
  label: string;
  unit: string;
  value: (a: ArmLimits) => string;
  limit: (r: LimitsReport) => string | null;
  ok: (a: ArmLimits, r: LimitsReport) => boolean;
}

const MEASURES: Measure[] = [
  { key: "peak", label: "Peak power", unit: "MW", value: (a) => mw(a.peakKw), limit: (r) => `≤ ${mw(r.maxKw)}`, ok: (a, r) => a.peakKw <= r.maxKw },
  { key: "low", label: "Lowest SOC", unit: "MWh", value: (a) => mwh(a.socMin), limit: (r) => `≥ ${mwh(r.socLo)}`, ok: (a, r) => a.socMin >= r.socLo },
  { key: "high", label: "Highest SOC", unit: "MWh", value: (a) => mwh(a.socMax), limit: (r) => `≤ ${mwh(r.socHi)}`, ok: (a, r) => a.socMax <= r.socHi },
  { key: "close", label: "Closing SOC", unit: "MWh", value: (a) => mwh(a.socClose), limit: (r) => `≥ ${mwh(r.socEndMin)}`, ok: (a, r) => a.socClose >= r.socEndMin },
  { key: "dis", label: "Discharged", unit: "MWh", value: (a) => mwhKwh(a.dischargedKwh), limit: (r) => `≤ ${mwhKwh(r.cycleCapKwh)}`, ok: (a, r) => a.dischargedKwh <= r.cycleCapKwh },
  {
    key: "bal",
    label: "Energy balance",
    unit: "hours",
    value: (a) => `${a.hours - a.balanceMismatches.length} of ${a.hours}`,
    limit: () => null,
    ok: (a) => a.balanceMismatches.length === 0,
  },
  { key: "con", label: "Peak contracts", unit: "", value: (a) => a.peakContracts.toLocaleString("en-US"), limit: (r) => `≤ ${r.maxContracts}`, ok: (a, r) => a.peakContracts <= r.maxContracts },
];

function Mark({ ok }: { ok: boolean }) {
  return (
    <span className={`vf-lim__mark${ok ? "" : " is-bad"}`} title={ok ? "Within the limit" : "Outside the limit"}>
      <Glyph name={ok ? "check" : "close"} />
    </span>
  );
}

function PlanName({ a }: { a: string }) {
  const meta = armMeta[a as ArmName];
  return (
    <span className="vf-plan">
      <i className="vf-swatch" style={{ background: meta?.color }} aria-hidden="true" />
      <b>{a}</b>
      <span className="muted">{meta?.label}</span>
    </span>
  );
}

/** Per plan: the value it reaches, the limit it must keep, and whether it does. A table on a desk, one list per plan on a phone. */
export function LimitsTable({ report: r }: { report: LimitsReport }) {
  const limits: [string, ReactNode][] = [
    ["Rating", `${mw(r.maxKw)} MW`],
    ["Energy", `${mwhKwh(r.energyKwh)} MWh`],
    ["State of charge (SOC) window", `${mwh(r.socLo)}–${mwh(r.socHi)} MWh`],
    ["Opens at", `${mwh(r.socOpen)} MWh`],
    ["Daily discharge cap", `${mwhKwh(r.cycleCapKwh)} MWh`],
  ];
  return (
    <div className="vf-lim">
      <dl className="vf-lim__limits">
        {limits.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="num">{v}</dd>
          </div>
        ))}
      </dl>

      <table className="vf-lim__table">
        <thead>
          <tr>
            <th scope="col">Plan</th>
            {MEASURES.map((m) => (
              <th key={m.key} scope="col" className="r">
                {m.label} {m.unit && m.unit !== "hours" && <span className="muted">{m.unit}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.arms.map((a) => (
            <tr key={a.arm}>
              <th scope="row">
                <PlanName a={a.arm} />
              </th>
              {MEASURES.map((m) => {
                const limit = m.limit(r);
                return (
                  <td key={m.key} className="r num">
                    <span className="vf-lim__v">
                      {m.value(a)}
                      <Mark ok={m.ok(a, r)} />
                    </span>
                    {limit && <span className="vf-lim__of">{limit}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="vf-lim__plans">
        {r.arms.map((a) => (
          <section key={a.arm} className="vf-lim__plan" aria-label={`Plan ${a.arm}`}>
            <PlanName a={a.arm} />
            <dl>
              {MEASURES.map((m) => {
                const limit = m.limit(r);
                return (
                  <div key={m.key}>
                    <dt>{m.label}</dt>
                    <dd className="num">
                      {m.value(a)} {m.unit && m.unit !== "hours" ? m.unit : m.unit === "hours" ? "hours" : ""}
                      {limit && <span className="vf-lim__of"> {limit}</span>}
                      <Mark ok={m.ok(a, r)} />
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>

      <p className="vf-caption">
        MW and MWh from the plan's integer kW and µkWh. The energy balance replays every hour: charging stores the charge times the round-trip efficiency,
        discharging draws the full amount, and the result must equal the plan's stated state of charge exactly.
      </p>
    </div>
  );
}
