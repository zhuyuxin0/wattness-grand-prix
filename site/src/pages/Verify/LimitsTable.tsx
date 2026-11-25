import { arm as armMeta, type ArmName } from "../../design/tokens";
import { Glyph } from "../../ui";
import type { LimitsReport } from "./verify/core";

const mw = (kw: number) => (kw / 1000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 3 });
const mwh = (ukwh: number) => (ukwh / 1e9).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 3 });
const mwhKwh = (kwh: number) => (kwh / 1000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 3 });

function Mark({ ok }: { ok: boolean }) {
  return (
    <span className={`st-lim__mark${ok ? " is-ok" : " is-bad"}`}>
      <Glyph name={ok ? "check" : "cross"} size={11} />
    </span>
  );
}

/** Per arm: the value the plan reaches, the limit it must keep, and whether it does. */
export function LimitsTable({ report: r }: { report: LimitsReport }) {
  return (
    <div className="st-lim">
      <div className="st-lim__limits">
        <span>
          Rating <b className="num">{mw(r.maxKw)} MW</b>
        </span>
        <span>
          Energy <b className="num">{mwhKwh(r.energyKwh)} MWh</b>
        </span>
        <span>
          SOC window <b className="num">{mwh(r.socLo)}–{mwh(r.socHi)} MWh</b>
        </span>
        <span>
          Opens at <b className="num">{mwh(r.socOpen)} MWh</b>
        </span>
        <span>
          Daily discharge cap <b className="num">{mwhKwh(r.cycleCapKwh)} MWh</b>
        </span>
      </div>
      <div className="st-lim__scroll">
        <table className="st-lim__table">
          <thead>
            <tr>
              <th scope="col">Arm</th>
              <th scope="col" className="r">
                Peak power
              </th>
              <th scope="col" className="r">
                Lowest SOC
              </th>
              <th scope="col" className="r">
                Highest SOC
              </th>
              <th scope="col" className="r">
                Closing SOC
              </th>
              <th scope="col" className="r">
                Discharged
              </th>
              <th scope="col" className="r">
                Energy balance
              </th>
              <th scope="col" className="r">
                Peak contracts
              </th>
            </tr>
          </thead>
          <tbody>
            {r.arms.map((a) => {
              const meta = armMeta[a.arm as ArmName];
              const balanced = a.hours - a.balanceMismatches.length;
              return (
                <tr key={a.arm}>
                  <th scope="row">
                    <span className="st-lim__arm" style={{ color: meta?.color }}>
                      {a.arm}
                    </span>
                    <span className="st-lim__armname">{meta?.label}</span>
                  </th>
                  <td className="r num">
                    {mw(a.peakKw)}
                    <Mark ok={a.peakKw <= r.maxKw} />
                    <span className="st-lim__of">≤ {mw(r.maxKw)}</span>
                  </td>
                  <td className="r num">
                    {mwh(a.socMin)}
                    <Mark ok={a.socMin >= r.socLo} />
                    <span className="st-lim__of">≥ {mwh(r.socLo)}</span>
                  </td>
                  <td className="r num">
                    {mwh(a.socMax)}
                    <Mark ok={a.socMax <= r.socHi} />
                    <span className="st-lim__of">≤ {mwh(r.socHi)}</span>
                  </td>
                  <td className="r num">
                    {mwh(a.socClose)}
                    <Mark ok={a.socClose >= r.socEndMin} />
                    <span className="st-lim__of">≥ {mwh(r.socEndMin)}</span>
                  </td>
                  <td className="r num">
                    {mwhKwh(a.dischargedKwh)}
                    <Mark ok={a.dischargedKwh <= r.cycleCapKwh} />
                    <span className="st-lim__of">≤ {mwhKwh(r.cycleCapKwh)}</span>
                  </td>
                  <td className="r num">
                    {balanced}/{a.hours} h
                    <Mark ok={a.balanceMismatches.length === 0} />
                  </td>
                  <td className="r num">
                    {a.peakContracts}
                    <Mark ok={a.peakContracts <= r.maxContracts} />
                    <span className="st-lim__of">≤ {r.maxContracts}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="st-lim__cap">
        MW and MWh from the plan's integer kW and µkWh. The energy balance replays every hour: charging stores the charge times the round-trip efficiency, discharging draws the full amount, and the result must equal the plan's stated SOC exactly.
      </p>
    </div>
  );
}
