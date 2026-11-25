// Hour charts the Battery tab and the agent tabs share. Each one is a single
// job: a fan of price scenarios, columns that go both ways (power, contracts),
// or the state of charge against the battery's limits.

import { scaleLinear, type ScaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import type { ReactNode } from "react";
import type { ArmName } from "../../../data";
import { columnPath, Figure, HOURS, HourFrame, mid, slot, symmetric, useHour, useTween, useWidth, type Margin, MARGIN } from "./chart";
import { axisNum, axisUsd } from "./format";
import { planStyle } from "./ui";

const toUsd = (cents: readonly number[]) => cents.map((c) => c / 100);

export interface FanBands {
  p05: readonly number[];
  p25: readonly number[];
  p75: readonly number[];
  p95: readonly number[];
}

/** Hour-centered line through 24 values. */
function hourLine(x: ScaleLinear<number, number>, y: ScaleLinear<number, number>, vals: readonly number[]) {
  return line<number>()
    .x((_, h) => mid(x, h))
    .y((v) => y(v))(vals as number[]) ?? "";
}

function hourBand(x: ScaleLinear<number, number>, y: ScaleLinear<number, number>, lo: readonly number[], hi: readonly number[]) {
  return (
    area<number>()
      .x((_, h) => mid(x, h))
      .y0((_, h) => y(lo[h]!))
      .y1((v) => y(v))(hi as number[]) ?? ""
  );
}

/** A step line that holds each hour's value across its slot (a price set per hour). */
function stepLine(x: ScaleLinear<number, number>, y: ScaleLinear<number, number>, vals: readonly number[]) {
  return vals.map((v, h) => `${h === 0 ? `M${x(0)},` : "V"}${y(v)}H${x(h + 1)}`).join("");
}

/** The price domain a fan needs: every drawn value, and zero. */
export function fanDomain(...series: (readonly number[] | null | undefined)[]): [number, number] {
  let lo = 0;
  let hi = 0;
  for (const s of series) for (const v of s ?? []) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo / 100, hi / 100];
}

/**
 * Price scenarios as a fan: the 5th–95th and 25th–75th percentile bands, some
 * sample paths, and the forecast the plan used as the one strong line. Prices
 * come in cents per MWh and are drawn in $/MWh.
 */
export function FanChart({
  title,
  unit,
  legend,
  forecast,
  bands,
  paths,
  step,
  domain,
  height = 220,
  label,
  tableId,
  margin = MARGIN,
}: {
  title: ReactNode;
  unit?: ReactNode;
  legend?: ReactNode;
  forecast: readonly number[];
  bands?: FanBands | null;
  paths?: readonly (readonly number[])[] | null;
  /** A second line held flat across each hour, e.g. an assumed entry. */
  step?: readonly number[] | null;
  domain?: [number, number];
  height?: number;
  label: string;
  tableId?: string;
  margin?: Margin;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { hour } = useHour();
  const fc = toUsd(forecast);
  const [d0, d1] = domain ?? fanDomain(forecast, bands?.p05, bands?.p95, step, ...(paths ?? []));
  const y = scaleLinear().domain([d0, d1]).nice(4).range([height - margin.bottom, margin.top]);
  const ticks = y.ticks(4);
  const b = bands ? { p05: toUsd(bands.p05), p25: toUsd(bands.p25), p75: toUsd(bands.p75), p95: toUsd(bands.p95) } : null;
  const st = step ? toUsd(step) : null;

  return (
    <Figure title={title} unit={unit} legend={legend} plotRef={ref}>
      <HourFrame width={width} height={height} y={y} yTicks={ticks} baseline={0} formatY={axisUsd} label={label} describedBy={tableId} margin={margin}>
        {(x) => (
          <g>
            {b && <path className="pk-band-90" d={hourBand(x, y, b.p05, b.p95)} />}
            {b && <path className="pk-band-50" d={hourBand(x, y, b.p25, b.p75)} />}
            {paths?.map((p, i) => <path key={i} className="pk-path" d={hourLine(x, y, toUsd(p))} />)}
            {st && <path className="pk-ink pk-ink--muted" d={stepLine(x, y, st)} />}
            <path className="pk-ink" d={hourLine(x, y, fc)} />
            {hour !== null && (
              <g>
                {st && <circle className="pk-dot pk-dot--muted" cx={mid(x, hour)} cy={y(st[hour]!)} r={4} />}
                <circle className="pk-dot pk-dot--ink" cx={mid(x, hour)} cy={y(fc[hour]!)} r={4} />
              </g>
            )}
          </g>
        )}
      </HourFrame>
    </Figure>
  );
}

/**
 * Columns that go both ways from zero, one plan's: power (discharge up, charge
 * down) or contracts (sold up, bought down). Labels name the two directions.
 */
export function ColumnsChart({
  title,
  unit,
  legend,
  values,
  plan,
  maxAbs,
  limit,
  up,
  down,
  empty,
  height = 180,
  label,
  tableId,
}: {
  title: ReactNode;
  unit?: ReactNode;
  legend?: ReactNode;
  values: readonly number[];
  plan: ArmName;
  /** The scale's reach either way, so charts of several plans share one. */
  maxAbs: number;
  /** A physical limit drawn either way (the battery's power). */
  limit?: number;
  up: string;
  down: string;
  /** Shown when every value is zero. */
  empty?: string;
  height?: number;
  label: string;
  tableId?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { hour } = useHour();
  const shown = useTween(values);
  const y = symmetric(maxAbs, 4).range([height - MARGIN.bottom, MARGIN.top]);
  const ticks = y.ticks(4);
  const none = values.every((v) => v === 0);

  return (
    <Figure title={title} unit={unit} legend={legend} plotRef={ref}>
      <div style={planStyle(plan)}>
        <HourFrame
          width={width}
          height={height}
          y={y}
          yTicks={ticks}
          baseline={0}
          formatY={axisNum}
          label={label}
          describedBy={tableId}
          overlay={() => (
            <g className="pk-note">
              {/* Just inside the frame's top and bottom lines, clear of them and of a limit drawn there. */}
              <text x={MARGIN.left + 4} y={MARGIN.top + 12}>
                {up}
              </text>
              <text x={MARGIN.left + 4} y={height - MARGIN.bottom - 5}>
                {down}
              </text>
              {none && empty && (
                <text className="pk-empty" x={(width + MARGIN.left - MARGIN.right) / 2} y={y(0) - 10} textAnchor="middle">
                  {empty}
                </text>
              )}
            </g>
          )}
        >
          {(x) => (
            <g>
              {limit !== undefined &&
                [limit, -limit].map((p) => <line key={p} className="pk-limit" x1={MARGIN.left} x2={width - MARGIN.right} y1={Math.round(y(p)) + 0.5} y2={Math.round(y(p)) + 0.5} />)}
              {shown.map((v, h) => {
                const s = slot(x, h);
                return <path key={h} className={`pk-bar${hour === null || hour === h ? "" : " is-dim"}`} d={columnPath(s.x, s.w, y(0), y(v))} />;
              })}
            </g>
          )}
        </HourFrame>
      </div>
    </Figure>
  );
}

export interface SocLimits {
  energyMwh: number;
  openMwh: number;
  minMwh: number;
  maxMwh: number;
  endFloorMwh: number;
}

/**
 * The state of charge through the day: the plan's path from the opening level
 * to the end of each hour, inside the operating range, with the closing floor
 * where it binds. Other plans are drawn in gray behind it.
 */
export function SocChart({
  title,
  unit,
  legend,
  plan,
  soc,
  ghosts = [],
  limits,
  height = 200,
  label,
  tableId,
  endLabel = true,
}: {
  title: ReactNode;
  unit?: ReactNode;
  legend?: ReactNode;
  plan: ArmName;
  /** MWh at the end of each hour. */
  soc: readonly number[];
  ghosts?: (readonly number[])[];
  limits: SocLimits;
  height?: number;
  label: string;
  tableId?: string;
  endLabel?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { hour } = useHour();
  const path = useTween([limits.openMwh, ...soc]);
  const margin = { ...MARGIN, right: endLabel ? 52 : MARGIN.right };
  const y = scaleLinear().domain([0, limits.energyMwh]).range([height - margin.bottom, margin.top]);
  const ticks = y.ticks(4).filter((t) => t <= limits.energyMwh);
  const end = soc[HOURS - 1] ?? 0;

  return (
    <Figure title={title} unit={unit} legend={legend} plotRef={ref}>
      <div style={planStyle(plan)}>
        <HourFrame
          width={width}
          height={height}
          y={y}
          yTicks={ticks}
          formatY={axisNum}
          label={label}
          describedBy={tableId}
          margin={margin}
          overlay={(x) =>
            endLabel ? (
              <g className="pk-note">
                <text className="is-strong" x={x(HOURS) + 8} y={y(end)} dy="0.32em">
                  {Math.round(end).toLocaleString("en-US")}
                </text>
              </g>
            ) : null
          }
        >
          {(x) => {
            const at = (i: number) => x(i);
            const pathOf = (vals: readonly number[]) =>
              line<number>()
                .x((_, i) => at(i))
                .y((v) => y(v))(vals as number[]) ?? "";
            return (
              <g>
                <rect className="pk-range" x={margin.left} width={x(HOURS) - margin.left} y={y(limits.maxMwh)} height={y(limits.minMwh) - y(limits.maxMwh)} />
                <line className="pk-limit" x1={margin.left} x2={x(HOURS)} y1={Math.round(y(limits.maxMwh)) + 0.5} y2={Math.round(y(limits.maxMwh)) + 0.5} />
                <line className="pk-limit" x1={margin.left} x2={x(HOURS)} y1={Math.round(y(limits.minMwh)) + 0.5} y2={Math.round(y(limits.minMwh)) + 0.5} />
                {/* The closing floor binds only at the end of the day. */}
                <line className="pk-ink pk-ink--muted" x1={x(HOURS - 1)} x2={x(HOURS)} y1={y(limits.endFloorMwh)} y2={y(limits.endFloorMwh)} />
                {ghosts.map((g, i) => (
                  <path key={i} className="pk-ghost" d={pathOf([limits.openMwh, ...g])} />
                ))}
                {path.length === HOURS + 1 && (
                  <>
                    <path
                      className="pk-area"
                      d={
                        area<number>()
                          .x((_, i) => at(i))
                          .y0(y(0))
                          .y1((v) => y(v))(path) ?? ""
                      }
                    />
                    <path className="pk-line" d={pathOf(path)} />
                    <circle className="pk-dot pk-dot--muted" cx={at(0)} cy={y(limits.openMwh)} r={4} />
                    <circle className="pk-dot" cx={at(HOURS)} cy={y(path[HOURS]!)} r={4} />
                    {hour !== null && <circle className="pk-dot" cx={at(hour + 1)} cy={y(path[hour + 1]!)} r={4.5} />}
                  </>
                )}
              </g>
            );
          }}
        </HourFrame>
      </div>
    </Figure>
  );
}
