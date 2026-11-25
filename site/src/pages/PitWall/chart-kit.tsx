// The pieces every pit wall chart shares: one hour scale across the operating
// day so the charts line up column for column, one hovered hour for all of
// them, a responsive width and a short tween when an arm or battery changes.

import { scaleLinear, type ScaleLinear } from "d3-scale";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { HOURS, hourStart } from "./model";

export const MARGIN = { top: 12, right: 44, bottom: 26, left: 48 };

interface HourState {
  hour: number | null;
  setHour: (h: number | null) => void;
}

export const HourContext = createContext<HourState>({ hour: null, setHour: () => {} });
export const useHour = () => useContext(HourContext);

export function useWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Eases from the values on screen to the new ones; a change of length jumps. */
export function useTween(target: readonly number[], ms = 420): number[] {
  const [shown, setShown] = useState<number[]>(() => [...target]);
  const from = useRef<number[]>([...target]);
  const key = target.join(",");
  useEffect(() => {
    const start = from.current;
    if (start.length !== target.length || reduced()) {
      from.current = [...target];
      setShown([...target]);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      const next = target.map((v, i) => start[i]! + (v - start[i]!) * e);
      from.current = next;
      setShown(next);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // The joined key is the target's identity.
  }, [key, ms]);
  return shown;
}

export function hourScale(width: number): ScaleLinear<number, number> {
  return scaleLinear()
    .domain([0, HOURS])
    .range([MARGIN.left, Math.max(MARGIN.left + 1, width - MARGIN.right)]);
}

/** A column from the baseline, its data end rounded 4 px and its base square. */
export function columnPath(x: number, w: number, y0: number, y1: number): string {
  const h = Math.abs(y1 - y0);
  if (h < 0.5 || w <= 0) return "";
  const r = Math.min(4, h, w / 2);
  if (y1 < y0) {
    return `M${x},${y0}V${y1 + r}A${r},${r} 0 0 1 ${x + r},${y1}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y1 + r}V${y0}Z`;
  }
  return `M${x},${y0}V${y1 - r}A${r},${r} 0 0 0 ${x + r},${y1}H${x + w - r}A${r},${r} 0 0 0 ${x + w},${y1 - r}V${y0}Z`;
}

interface FrameProps {
  width: number;
  height: number;
  y: ScaleLinear<number, number>;
  yTicks: number[];
  formatY: (v: number) => string;
  /** Accessible name: what the chart shows and for whom. */
  label: string;
  /** id of the table that holds the same values. */
  describedBy?: string;
  /** The line at zero is the baseline columns grow from. */
  baseline?: number;
  children: (x: ScaleLinear<number, number>) => ReactNode;
  overlay?: (x: ScaleLinear<number, number>) => ReactNode;
}

/** Axes, gridlines, the hovered-hour band and the pointer layer. */
export function HourFrame({ width, height, y, yTicks, formatY, label, describedBy, baseline, children, overlay }: FrameProps) {
  const { hour, setHour } = useHour();
  const x = hourScale(width);
  const plotTop = MARGIN.top;
  const plotBottom = height - MARGIN.bottom;
  const every = width < 520 ? 6 : 3;
  const ticks = Array.from({ length: HOURS / every + 1 }, (_, i) => i * every);

  const pick = (clientX: number, el: SVGSVGElement) => {
    const box = el.getBoundingClientRect();
    const h = Math.floor(x.invert(clientX - box.left));
    setHour(h >= 0 && h < HOURS ? h : null);
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      setHour(hour === null ? (step > 0 ? 0 : HOURS - 1) : Math.min(HOURS - 1, Math.max(0, hour + step)));
    } else if (e.key === "Escape") {
      setHour(null);
    }
  };

  if (width <= 0) return <svg className="pw-chart" height={height} aria-hidden="true" />;

  return (
    <svg
      className="pw-chart"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      aria-describedby={describedBy}
      tabIndex={0}
      onKeyDown={onKey}
      onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
      onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHour(null)}
      onBlur={() => setHour(null)}
    >
      <g className="pw-gridlines">
        {yTicks.map((t) => (
          <g key={t} transform={`translate(0,${y(t)})`}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} className={t === baseline ? "pw-gridlines__base" : undefined} />
            <text x={MARGIN.left - 8} dy="0.32em" textAnchor="end">
              {formatY(t)}
            </text>
          </g>
        ))}
      </g>
      {hour !== null && <rect className="pw-hour-band" x={x(hour)} y={plotTop} width={x(hour + 1) - x(hour)} height={plotBottom - plotTop} />}
      {children(x)}
      <g className="pw-axis" transform={`translate(0,${plotBottom})`}>
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={18} textAnchor={t === 0 ? "start" : t === HOURS ? "end" : "middle"}>
            {t === HOURS ? "24:00" : hourStart(t)}
          </text>
        ))}
      </g>
      {overlay?.(x)}
    </svg>
  );
}

export function LegendLine({ color, label, weight = 2 }: { color: string; label: string; weight?: number }) {
  return (
    <span className="pw-legend__item">
      <svg width="16" height="8" aria-hidden="true">
        <line x1="1" x2="15" y1="4" y2="4" stroke={color} strokeWidth={weight} strokeLinecap="round" />
      </svg>
      {label}
    </span>
  );
}

export function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="pw-legend__item">
      <span className="pw-legend__swatch" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}
