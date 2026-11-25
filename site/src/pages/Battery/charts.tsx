import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import type { ArmName } from "../../data";
import { arm as armTokens, color } from "../../design/tokens";
import { columnPath, HourFrame, LegendLine, LegendSwatch, MARGIN, useHour, useTween, useWidth } from "./chart-kit";
import type { Desk, DeskCommon } from "../../data/plan";
import { ARM_ORDER, HOURS, type ArmFigures } from "./model";

const GRAY_LINE = "#5d646b";

function niceSym(maxAbs: number, count = 4) {
  const s = scaleLinear().domain([-Math.max(maxAbs, 1e-9), Math.max(maxAbs, 1e-9)]).nice(count);
  return s;
}

/** Column geometry for hour h: centered in its slot, never wider than 24 px, the rest left as air. */
function slot(x: (v: number) => number, h: number) {
  const x0 = x(h);
  const w = x(h + 1) - x0;
  const bw = Math.max(2, Math.min(24, w - Math.max(4, w * 0.3)));
  return { x: x0 + (w - bw) / 2, w: bw };
}

// ---------------------------------------------------------------- prices

export function PriceChart({ desk, common, tableId }: { desk: Desk; common: DeskCommon; tableId: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { hour } = useHour();
  const height = 200;
  const fc = desk.nodeForecastCents.map((c) => c / 100);
  const entry = (common.entryCents[desk.hub] ?? []).map((c) => c / 100);
  const bands = desk.nodeScenarioCents;
  const lo = bands ? bands.p05.map((c) => c / 100) : fc;
  const hi = bands ? bands.p95.map((c) => c / 100) : fc;
  const all = [...fc, ...entry, ...lo, ...hi];
  const y = scaleLinear()
    .domain([Math.min(0, ...all), Math.max(...all)])
    .nice(4)
    .range([height - MARGIN.bottom, MARGIN.top]);
  const ticks = y.ticks(4);

  return (
    <div className="pw-figure">
      <div className="pw-legend" aria-hidden="true">
        <LegendLine color={color.textStrong} label={`Node forecast, ${desk.settlementPoint}`} />
        <LegendLine color={color.muted} label={`Hub entry by hour, ${desk.hub} (assumed)`} weight={1.5} />
        {bands && <LegendSwatch color="rgba(230,232,234,0.16)" label="Node scenarios, 5th–95th and 25th–75th percentiles" />}
      </div>
      <div ref={ref} className="pw-figure__plot">
        <HourFrame
          width={width}
          height={height}
          y={y}
          yTicks={ticks}
          formatY={(v) => (v < 0 ? `−$${-v}` : `$${v}`)}
          label={`Day-ahead price outlook at ${desk.settlementPoint}, dollars per MWh by hour, with the assumed hub entry`}
          describedBy={tableId}
        >
          {(x) => {
            const cx = (h: number) => x(h + 0.5);
            const mk = (vals: number[]) => line<number>().x((_, h) => cx(h)).y((v) => y(v))(vals) ?? "";
            const band = (a: number[], b: number[]) =>
              area<number>()
                .x((_, h) => cx(h))
                .y0((_, h) => y(a[h]!))
                .y1((v) => y(v))(b) ?? "";
            return (
              <g>
                {bands && <path d={band(bands.p05.map((c) => c / 100), bands.p95.map((c) => c / 100))} fill="rgba(230,232,234,0.07)" />}
                {bands && <path d={band(bands.p25.map((c) => c / 100), bands.p75.map((c) => c / 100))} fill="rgba(230,232,234,0.10)" />}
                {entry.length === HOURS && (
                  <path
                    d={entry.map((v, h) => `${h === 0 ? `M${x(0)},` : "V"}${y(v)}H${x(h + 1)}`).join("")}
                    fill="none"
                    stroke={color.muted}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                )}
                <path d={mk(fc)} fill="none" stroke={color.textStrong} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {hour !== null && (
                  <g>
                    <circle cx={cx(hour)} cy={y(fc[hour]!)} r={4} fill={color.textStrong} stroke={color.raised} strokeWidth={2} />
                    {entry[hour] !== undefined && <circle cx={cx(hour)} cy={y(entry[hour]!)} r={4} fill={color.muted} stroke={color.raised} strokeWidth={2} />}
                  </g>
                )}
              </g>
            );
          }}
        </HourFrame>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- schedule

export function ScheduleChart({ desk, fig, tableId }: { desk: Desk; fig: ArmFigures; tableId: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { hour } = useHour();
  const height = 220;
  const mw = useTween(fig.mw);
  const pmax = desk.maxPowerKw / 1000;
  const y = niceSym(pmax).range([height - MARGIN.bottom, MARGIN.top]);
  const ticks = y.ticks(4);
  const c = armTokens[fig.name].color;

  return (
    <div className="pw-figure">
      <div ref={ref} className="pw-figure__plot">
        <HourFrame
          width={width}
          height={height}
          y={y}
          yTicks={ticks}
          baseline={0}
          formatY={(v) => String(v).replace("-", "−")}
          label={`Arm ${fig.name} schedule, MW by hour: discharge above zero, charge below`}
          describedBy={tableId}
          overlay={() => (
            <g className="pw-chart__notes">
              <text x={MARGIN.left + 6} y={MARGIN.top + 10}>
                Discharge
              </text>
              <text x={MARGIN.left + 6} y={height - MARGIN.bottom - 6}>
                Charge
              </text>
              <text className="pw-chart__unit" x={width - MARGIN.right + 6} y={y(0)} dy="0.32em">
                MW
              </text>
            </g>
          )}
        >
          {(x) => (
            <g>
              {[pmax, -pmax].map((p) => (
                <line key={p} className="pw-limit" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(p)} y2={y(p)} />
              ))}
              {mw.map((v, h) => {
                const s = slot(x, h);
                return <path key={h} d={columnPath(s.x, s.w, y(0), y(v))} fill={c} opacity={hour === null || hour === h ? 1 : 0.55} className="pw-col" />;
              })}
            </g>
          )}
        </HourFrame>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- state of charge

export function SocChart({
  desk,
  common,
  figs,
  active,
  tableId,
}: {
  desk: Desk;
  common: DeskCommon;
  figs: Partial<Record<ArmName, ArmFigures>>;
  active: ArmName;
  tableId: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { hour } = useHour();
  const height = 200;
  const e = desk.energyKwh / 1000;
  const open = (desk.energyKwh * common.assumptions.soc_open_ppm) / 1e9;
  const lo = (e * common.assumptions.soc_min_ppm) / 1e6;
  const hi = (e * common.assumptions.soc_max_ppm) / 1e6;
  const endFloor = (e * common.assumptions.soc_end_min_ppm) / 1e6;
  const y = scaleLinear().domain([0, e]).range([height - MARGIN.bottom, MARGIN.top]);
  const ticks = y.ticks(4).filter((t) => t <= e);
  const fig = figs[active];
  const activeSoc = useTween(fig ? [open, ...fig.socMwh] : []);

  // Arms that end within 1.5% of energy of each other share one end label.
  const ends = ARM_ORDER.filter((a) => figs[a]).map((a) => ({ a, v: figs[a]!.endSocMwh }));
  const groups: { arms: ArmName[]; v: number }[] = [];
  for (const it of [...ends].sort((p, q) => q.v - p.v)) {
    const g = groups.find((x) => Math.abs(x.v - it.v) < e * 0.015);
    if (g) g.arms.push(it.a);
    else groups.push({ arms: [it.a], v: it.v });
  }
  for (const g of groups) g.arms.sort();
  // Labels that would overlap on screen step apart by one line.
  const labelY: number[] = [];
  for (const g of groups) {
    let ly = y(g.v);
    const prev = labelY[labelY.length - 1];
    if (prev !== undefined && ly - prev < 12) ly = prev + 12;
    labelY.push(ly);
  }

  return (
    <div className="pw-figure">
      <div className="pw-legend" aria-hidden="true">
        <LegendLine color={armTokens[active].color} label={`Arm ${active}`} />
        <LegendLine color={GRAY_LINE} label="The other arms" weight={1.5} />
        <LegendSwatch color="rgba(230,232,234,0.05)" label={`Operating range, ${Math.round(common.assumptions.soc_min_ppm / 1e4)}–${Math.round(common.assumptions.soc_max_ppm / 1e4)}%`} />
      </div>
      <div ref={ref} className="pw-figure__plot">
        <HourFrame
          width={width}
          height={height}
          y={y}
          yTicks={ticks}
          formatY={(v) => String(v)}
          label={`State of charge in MWh at the end of each hour, arm ${active} highlighted, other arms in gray`}
          describedBy={tableId}
          overlay={(x) => (
            <g className="pw-chart__notes">
              {groups.map((g, i) => (
                <text key={g.arms.join("")} x={x(HOURS) + 8} y={labelY[i]} dy="0.32em" className={g.arms.includes(active) ? "is-active" : undefined}>
                  {g.arms.join(" ")}
                </text>
              ))}
            </g>
          )}
        >
          {(x) => {
            const path = (vals: number[]) =>
              line<number>()
                .x((_, i) => x(i))
                .y((v) => y(v))(vals) ?? "";
            return (
              <g>
                <rect x={MARGIN.left} width={x(HOURS) - MARGIN.left} y={y(hi)} height={y(lo) - y(hi)} fill="rgba(230,232,234,0.035)" />
                <line className="pw-limit" x1={MARGIN.left} x2={x(HOURS)} y1={y(hi)} y2={y(hi)} />
                <line className="pw-limit" x1={MARGIN.left} x2={x(HOURS)} y1={y(lo)} y2={y(lo)} />
                {/* The closing floor binds only at the end of the day. */}
                <line className="pw-floor" x1={x(HOURS - 1.5)} x2={x(HOURS)} y1={y(endFloor)} y2={y(endFloor)} />
                {ARM_ORDER.filter((a) => a !== active && figs[a]).map((a) => (
                  <path key={a} d={path([open, ...figs[a]!.socMwh])} fill="none" stroke={GRAY_LINE} strokeWidth={1.5} strokeLinejoin="round" />
                ))}
                {fig && activeSoc.length === HOURS + 1 && (
                  <>
                    <path
                      d={
                        area<number>()
                          .x((_, i) => x(i))
                          .y0(y(0))
                          .y1((v) => y(v))(activeSoc) ?? ""
                      }
                      fill={armTokens[active].color}
                      opacity={0.1}
                    />
                    <path d={path(activeSoc)} fill="none" stroke={armTokens[active].color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    <circle cx={x(0)} cy={y(open)} r={4} fill={color.muted} stroke={color.raised} strokeWidth={2} />
                    {hour !== null && (
                      <circle cx={x(hour + 1)} cy={y(activeSoc[hour + 1]!)} r={4.5} fill={armTokens[active].color} stroke={color.raised} strokeWidth={2} />
                    )}
                  </>
                )}
              </g>
            );
          }}
        </HourFrame>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- contracts

export function ContractsChart({ fig, figs, tableId }: { fig: ArmFigures; figs: Partial<Record<ArmName, ArmFigures>>; tableId: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { hour } = useHour();
  const height = 160;
  const q = useTween(fig.arm.contracts);
  let maxAbs = 1;
  for (const a of ARM_ORDER) for (const v of figs[a]?.arm.contracts ?? []) maxAbs = Math.max(maxAbs, Math.abs(v));
  const y = niceSym(maxAbs, 2).range([height - MARGIN.bottom, MARGIN.top]);
  const ticks = y.ticks(2);
  const c = armTokens[fig.name].color;

  return (
    <div className="pw-figure">
      <div ref={ref} className="pw-figure__plot">
        <HourFrame
          width={width}
          height={height}
          y={y}
          yTicks={ticks}
          baseline={0}
          formatY={(v) => String(v).replace("-", "−")}
          label={`Arm ${fig.name} hedge, contracts by hour: sold above zero, bought below`}
          describedBy={tableId}
          overlay={() => (
            <g className="pw-chart__notes">
              <text x={MARGIN.left + 6} y={MARGIN.top + 10}>
                Sell
              </text>
              <text x={MARGIN.left + 6} y={height - MARGIN.bottom - 6}>
                Buy
              </text>
              {fig.contracts === 0 && (
                <text className="pw-chart__empty" x={(width + MARGIN.left - MARGIN.right) / 2} y={y(0) - 10} textAnchor="middle">
                  Arm {fig.name} carries no hedge
                </text>
              )}
            </g>
          )}
        >
          {(x) => (
            <g>
              {q.map((v, h) => {
                const s = slot(x, h);
                return <path key={h} d={columnPath(s.x, s.w, y(0), y(v))} fill={c} opacity={hour === null || hour === h ? 1 : 0.55} />;
              })}
            </g>
          )}
        </HourFrame>
      </div>
    </div>
  );
}
