import { Link } from "react-router-dom";
import type { BatterySummary } from "../../data";
import { arm as armMeta, type ArmName } from "../../design/tokens";
import { formatDec1, formatUsd } from "../../lib/format";
import { Glyph, Hash } from "../../ui";

const ARMS: ArmName[] = ["A", "B", "C"];

/** The hourly plan, drawn large: discharge up, charge down, against the rating. */
function DayChart({ b }: { b: BatterySummary }) {
  const w = 480;
  const h = 132;
  const padL = 34;
  const padB = 18;
  const plotH = h - padB - 6;
  const mid = 6 + plotH / 2;
  const n = b.scheduleMw.length;
  const bw = (w - padL) / n;
  const scale = b.powerMw > 0 ? plotH / 2 / b.powerMw : 0;
  return (
    <svg className="sd-day" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${b.resource}: hourly schedule of the selected arm, MW`}>
      <line x1={padL} x2={w} y1={6} y2={6} className="sd-day__grid" />
      <line x1={padL} x2={w} y1={6 + plotH} y2={6 + plotH} className="sd-day__grid" />
      <line x1={padL} x2={w} y1={mid} y2={mid} className="sd-day__axis" />
      <text x={padL - 6} y={10} className="sd-day__tick" textAnchor="end">
        {formatDec1(b.powerMw)}
      </text>
      <text x={padL - 6} y={mid + 3} className="sd-day__tick" textAnchor="end">
        0
      </text>
      <text x={padL - 6} y={6 + plotH} className="sd-day__tick" textAnchor="end">
        −{formatDec1(b.powerMw)}
      </text>
      {b.scheduleMw.map((mw, i) => {
        const len = Math.abs(mw) * scale;
        return mw === 0 ? null : (
          <rect key={i} x={padL + i * bw + 1} y={mw > 0 ? mid - len : mid} width={bw - 2} height={Math.max(1, len)} className={mw > 0 ? "sd-strip__dis" : "sd-strip__chg"}>
            <title>{`${String(i).padStart(2, "0")}:00 CT  ${mw > 0 ? "discharge" : "charge"} ${formatDec1(Math.abs(mw))} MW`}</title>
          </rect>
        );
      })}
      {[0, 6, 12, 18, 23].map((hr) => (
        <text key={hr} x={padL + hr * bw + bw / 2} y={h - 4} className="sd-day__tick" textAnchor="middle">
          {String(hr).padStart(2, "0")}
        </text>
      ))}
    </svg>
  );
}

export function Detail({ b, onClose }: { b: BatterySummary; onClose: () => void }) {
  return (
    <div className="sd-detail">
      <div className="sd-detail__chart">
        <div className="sd-detail__head">
          <span className="eyebrow">Selected arm {b.selectedArm} · hourly schedule, MW, CT</span>
          <span className="sd-detail__legend">
            <i className="is-dis" /> discharge <i className="is-chg" /> charge
          </span>
        </div>
        <DayChart b={b} />
      </div>
      <div className="sd-detail__arms">
        <table className="sd-arms">
          <thead>
            <tr>
              <th scope="col">Arm</th>
              <th scope="col" className="r">
                Expected
              </th>
              <th scope="col" className="r">
                Objective
              </th>
              <th scope="col" className="r">
                Contracts
              </th>
              <th scope="col" className="r">
                Collateral
              </th>
            </tr>
          </thead>
          <tbody>
            {ARMS.map((a) => {
              const s = b.arms[a];
              if (!s) return null;
              const on = a === b.selectedArm;
              return (
                <tr key={a} className={on ? "is-selected" : undefined}>
                  <th scope="row">
                    <span className="sd-arm" style={{ color: armMeta[a].color }}>
                      {a}
                    </span>
                    <span className="sd-arms__name">{armMeta[a].label}</span>
                  </th>
                  <td className="r num">{formatUsd(s.expectedUsd, { whole: true })}</td>
                  <td className="r num">{formatUsd(s.objectiveUsd, { whole: true })}</td>
                  <td className="r num">{s.contracts}</td>
                  <td className="r num">{formatUsd(s.collateralUsd, { whole: true })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="sd-detail__note">
          Objective is the expected value minus half the CVaR (90%) of the day's loss over the plan's own price scenarios; the arm with the highest objective is selected. Contracts are hourly bounded futures at an assumed fair-value entry.
        </p>
        <div className="sd-detail__foot">
          <span className="sd-detail__leaf">
            <span className="eyebrow">Leaf</span> <Hash value={b.leaf} head={10} tail={8} label="leaf hash" />
          </span>
          <span className="sd-detail__links">
            <Link className="sd-link" to={`/battery/${b.resource}`}>
              Open the plan <Glyph name="next" />
            </Link>
            <Link className="sd-link" to={`/verify/${b.resource}`}>
              Verify it <Glyph name="next" />
            </Link>
            <button type="button" className="sd-link sd-link--quiet" onClick={onClose}>
              Close
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
