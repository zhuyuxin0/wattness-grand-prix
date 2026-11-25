// Each plan as one row on a dollar axis: its worst-10% average (a ring) joined
// to its mean revenue (a dot), with its score as a tick. The gap between the
// two ends is the downside the score charges for; the tick shows where the
// charge leaves each plan.

import { scaleLinear } from "d3-scale";
import { type CSSProperties } from "react";
import type { ArmName } from "../../data";
import { axisUsd, money, planColor, useWidth } from "../Battery/kit";

export interface Bell {
  plan: ArmName;
  sealed: boolean;
  tail: number;
  mean: number;
  score: number;
}

const ROW = 46;
const M = { top: 8, right: 84, bottom: 26, left: 76 };

export function Dumbbell({ rows, active, onActive, label }: { rows: Bell[]; active: ArmName | null; onActive: (p: ArmName | null) => void; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = M.top + rows.length * ROW + M.bottom;
  let lo = 0;
  let hi = 0;
  for (const r of rows) {
    lo = Math.min(lo, r.tail, r.mean, r.score);
    hi = Math.max(hi, r.tail, r.mean, r.score);
  }
  const narrow = width < 520;
  const m = narrow ? { ...M, left: 58, right: 16 } : M;
  const x = scaleLinear()
    .domain([lo, hi])
    .nice(narrow ? 4 : 6)
    .range([m.left, Math.max(m.left + 1, width - m.right)]);
  const ticks = x.ticks(narrow ? 4 : 6);

  return (
    <div ref={ref} className="rk-bell">
      {width > 0 && (
        <svg className="pk-chart rk-bell__svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} onPointerLeave={() => onActive(null)}>
          <g className="pk-grid">
            {ticks.map((t) => (
              <g key={t} transform={`translate(${Math.round(x(t)) + 0.5},0)`}>
                <line y1={m.top} y2={height - m.bottom} className={t === 0 ? "pk-grid__base" : undefined} />
                <text y={height - m.bottom + 16} textAnchor="middle">
                  {axisUsd(t)}
                </text>
              </g>
            ))}
          </g>
          {rows.map((r, i) => {
            const cy = m.top + i * ROW + ROW / 2;
            const on = active === r.plan;
            return (
              <g
                key={r.plan}
                className={`rk-bell__row${on ? " is-on" : ""}`}
                style={{ "--plan": planColor(r.plan) } as CSSProperties}
                tabIndex={0}
                role="button"
                aria-label={`Plan ${r.plan}${r.sealed ? ", sealed" : ""}: worst 10% ${money(r.tail)}, mean ${money(r.mean)}, score ${money(r.score)}`}
                onPointerEnter={() => onActive(r.plan)}
                onFocus={() => onActive(r.plan)}
                onBlur={() => onActive(null)}
              >
                <rect className="rk-bell__hit" x={0} y={cy - ROW / 2} width={width} height={ROW} />
                <text className="rk-bell__label" x={m.left - 12} y={cy} dy="0.32em" textAnchor="end">
                  Plan {r.plan}
                </text>
                <line className="pk-line" x1={x(r.tail)} x2={x(r.mean)} y1={cy} y2={cy} />
                <circle className="rk-bell__ring" cx={x(r.tail)} cy={cy} r={5} />
                <circle className="pk-dot" cx={x(r.mean)} cy={cy} r={5} />
                <line className="rk-bell__tick" x1={x(r.score)} x2={x(r.score)} y1={cy - 9} y2={cy + 9} />
                {!narrow && (
                  <text className={`rk-bell__score${r.sealed ? " is-sealed" : ""}`} x={(x.range()[1] ?? 0) + 10} y={cy} dy="0.32em">
                    {money(r.score)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
