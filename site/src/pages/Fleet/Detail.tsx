import { useState } from "react";
import { Link } from "react-router-dom";
import type { BatterySummary } from "../../data";
import { arm as armMeta, type ArmName } from "../../design/tokens";
import { formatDec1, formatUsd } from "../../lib/format";
import { Glyph, Hash } from "../../ui";
import { hubLabel, plainName } from "./names";

const PLANS: ArmName[] = ["A", "B", "C"];
const pad = (h: number) => String(h).padStart(2, "0");

/**
 * The chosen plan's hourly MW, drawn large: discharge up, charge down, against
 * the battery's rating, in the plan's one hue. Hovering or focusing an hour
 * reads it out in the line above, which keeps its height either way.
 */
function DayChart({ b }: { b: BatterySummary }) {
  const [hour, setHour] = useState<number | null>(null);
  const w = 560;
  const h = 150;
  const padL = 40;
  const padR = 4;
  const top = 8;
  const padB = 20;
  const plotH = h - top - padB;
  const mid = top + plotH / 2;
  const n = b.scheduleMw.length;
  const slot = (w - padL - padR) / n;
  const gap = 2;
  const scale = b.powerMw > 0 ? plotH / 2 / b.powerMw : 0;
  const mw = hour === null ? null : b.scheduleMw[hour] ?? null;

  return (
    <figure className="fl-chart">
      <figcaption className="fl-chart__head">
        <span className="fl-chart__title">Hourly Schedule</span>
        <span className="fl-chart__read num" aria-live="polite">
          {hour === null || mw === null ? (
            <>
              Discharge {formatDec1(b.dischargeMwh)} MWh · charge {formatDec1(b.chargeMwh)} MWh over the day
            </>
          ) : (
            <>
              {pad(hour)}:00–{pad(hour + 1)}:00 CT · {mw > 0 ? `discharge ${formatDec1(mw)} MW` : mw < 0 ? `charge ${formatDec1(-mw)} MW` : "idle"}
            </>
          )}
        </span>
      </figcaption>
      <svg className="fl-day" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Plan ${b.selectedArm}, MW by hour, Central time: discharge above the line, charge below`} onPointerLeave={() => setHour(null)}>
        <line x1={padL} x2={w - padR} y1={top} y2={top} className="fl-day__grid" />
        <line x1={padL} x2={w - padR} y1={top + plotH} y2={top + plotH} className="fl-day__grid" />
        <text x={padL - 6} y={top + 3.5} className="fl-day__tick" textAnchor="end">
          {formatDec1(b.powerMw)}
        </text>
        <text x={padL - 6} y={mid + 3.5} className="fl-day__tick" textAnchor="end">
          0
        </text>
        <text x={padL - 6} y={top + plotH + 3.5} className="fl-day__tick" textAnchor="end">
          −{formatDec1(b.powerMw)}
        </text>
        {b.scheduleMw.map((v, i) => {
          const len = Math.abs(v) * scale;
          const x = padL + i * slot;
          return (
            <g key={i} className={`fl-day__hour${hour === i ? " is-on" : ""}`} onPointerEnter={() => setHour(i)}>
              <rect x={x} y={top} width={slot} height={plotH} className="fl-day__hit" />
              {v !== 0 && <rect x={x + gap / 2} y={v > 0 ? mid - len : mid} width={slot - gap} height={Math.max(1, len)} rx={1.5} className="fl-day__bar" />}
            </g>
          );
        })}
        <line x1={padL} x2={w - padR} y1={mid} y2={mid} className="fl-day__axis" />
        {[0, 6, 12, 18, 23].map((hr) => (
          <text key={hr} x={padL + hr * slot + slot / 2} y={h - 5} className="fl-day__tick" textAnchor="middle">
            {pad(hr)}
          </text>
        ))}
      </svg>
      <p className="fl-chart__axis">MW by hour starting, CT. Above the line the battery discharges; below it, it charges. Scaled to its rating, {formatDec1(b.powerMw)} MW.</p>
    </figure>
  );
}

export function Detail({ b, onClose }: { b: BatterySummary; onClose: () => void }) {
  const name = plainName(b.resource);
  return (
    <div className="fl-detail">
      <div className="fl-detail__main">
        <dl className="fl-facts">
          <div>
            <dt>Battery</dt>
            <dd>
              {name ? (
                <>
                  {name} <span className="muted">({b.resource})</span>
                </>
              ) : (
                <span className="mono">{b.resource}</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Settlement point</dt>
            <dd className="mono">{b.settlementPoint}</dd>
          </div>
          <div>
            <dt>Hub</dt>
            <dd>
              {hubLabel(b.hub)} <span className="muted">({b.hub})</span>
            </dd>
          </div>
          <div>
            <dt>County</dt>
            <dd>{b.county ?? <span className="muted">not on file</span>}</dd>
          </div>
          <div>
            <dt>Rating</dt>
            <dd className="num">
              {formatDec1(b.powerMw)} MW · {formatDec1(b.energyMwh)} MWh
            </dd>
          </div>
        </dl>
        <DayChart b={b} />
      </div>

      <div className="fl-detail__side">
        <table className="fl-plans">
          <caption>The Three Plans</caption>
          <thead>
            <tr>
              <th scope="col">Plan</th>
              <th scope="col" className="r">
                Expected
              </th>
              <th scope="col" className="r">
                Objective
              </th>
              <th scope="col" className="r fl-plans__wide">
                Contracts
              </th>
              <th scope="col" className="r fl-plans__wide">
                Collateral
              </th>
            </tr>
          </thead>
          <tbody>
            {PLANS.map((a) => {
              const s = b.arms[a];
              if (!s) return null;
              const chosen = a === b.selectedArm;
              return (
                <tr key={a} className={chosen ? "is-chosen" : undefined}>
                  <th scope="row">
                    <span className="fl-plan">
                      <i className="fl-swatch" style={{ background: armMeta[a].color }} aria-hidden="true" />
                      <b>{a}</b>
                      <span className="fl-plans__name">{armMeta[a].label}</span>
                    </span>
                    {chosen && (
                      <span className="fl-sealed" title="The plan with the highest objective, sealed in the day's root">
                        <i className="seal-mark" aria-hidden="true" />
                        Sealed
                      </span>
                    )}
                  </th>
                  <td className="r num">{formatUsd(s.expectedUsd, { whole: true })}</td>
                  <td className="r num">{formatUsd(s.objectiveUsd, { whole: true })}</td>
                  <td className="r num fl-plans__wide">{s.contracts.toLocaleString("en-US")}</td>
                  <td className="r num fl-plans__wide">{formatUsd(s.collateralUsd, { whole: true })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="fl-note">
          Expected is the plan's mean over its own price scenarios. Objective is expected minus half the conditional value at risk (CVaR, 90%) of the
          day's loss; the plan with the highest objective is sealed. Contracts are hourly bounded futures on ElectronX at an assumed fair-value entry.
        </p>
        <div className="fl-detail__leaf">
          <span className="fl-detail__label">Leaf</span>
          <Hash value={b.leaf} head={8} tail={6} label={`leaf hash of ${b.resource}`} />
        </div>
        <div className="fl-detail__actions">
          <Link className="btn" to={`/battery/${b.resource}`}>
            Open on Battery
            <Glyph name="next" />
          </Link>
          <Link className="btn" to={`/verify/${b.resource}`}>
            Verify this plan
            <Glyph name="next" />
          </Link>
          <button type="button" className="btn fl-detail__close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
