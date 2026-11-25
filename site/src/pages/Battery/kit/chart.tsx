// The pieces every hour chart on the Battery and agent tabs shares: one hour
// scale across the operating day so stacked charts line up column for column,
// one hovered hour for all of them (the page's readout is the tooltip), a
// responsive width and a short tween when a plan or battery changes.
//
// Marks follow the chart rules: hairline solid grid, columns at most 24 px with
// a 4 px rounded data end and a square base, 2 px lines, markers of r 4 with a
// 2 px ring in the pane's color. Colors are CSS tokens, so every chart follows
// the theme without re-rendering.

import { scaleLinear, type ScaleLinear } from "d3-scale";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from "react";

export const HOURS = 24;

const pad = (n: number) => String(n).padStart(2, "0");
export const hourStart = (h: number) => `${pad(h)}:00`;

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const MARGIN: Margin = { top: 10, right: 16, bottom: 24, left: 44 };

interface HourState {
  hour: number | null;
  setHour: (h: number | null) => void;
}

export const HourContext = createContext<HourState>({ hour: null, setHour: () => {} });
export const useHour = () => useContext(HourContext);

/** The page's hovered hour, shared by its charts and its readout. */
export function useHourState(pinned: number | null = null): HourState {
  const [hover, setHover] = useState<number | null>(null);
  return { hour: hover ?? pinned, setHour: setHover };
}

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
const capturing = () => typeof document !== "undefined" && document.documentElement.dataset.capture === "1";

/** Eases from the values on screen to the new ones; a change of length jumps. */
export function useTween(target: readonly number[], ms = 420): number[] {
  const [shown, setShown] = useState<number[]>(() => [...target]);
  const from = useRef<number[]>([...target]);
  const key = target.join(",");
  useEffect(() => {
    const start = from.current;
    if (start.length !== target.length || reduced() || capturing()) {
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

/** True below the given width: phones drop columns and labels, never the page's width. */
export function useNarrow(px = 600): boolean {
  const query = `(max-width: ${px}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return narrow;
}

export function hourScale(width: number, m: Margin = MARGIN): ScaleLinear<number, number> {
  return scaleLinear()
    .domain([0, HOURS])
    .range([m.left, Math.max(m.left + 1, width - m.right)]);
}

/** A symmetric scale around zero, for values that go both ways. */
export function symmetric(maxAbs: number, count = 4) {
  const m = Math.max(maxAbs, 1e-9);
  return scaleLinear().domain([-m, m]).nice(count);
}

/** Column geometry for hour h: centered in its slot, at most 24 px wide, the rest left as air. */
export function slot(x: (v: number) => number, h: number) {
  const x0 = x(h);
  const w = x(h + 1) - x0;
  const bw = Math.max(2, Math.min(24, w - Math.max(2, w * 0.28)));
  return { x: x0 + (w - bw) / 2, w: bw };
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

/** Hour-centered points: the value of hour h sits at the middle of its slot. */
export const mid = (x: ScaleLinear<number, number>, h: number) => x(h + 0.5);

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
  /** The line at this value is the baseline columns grow from. */
  baseline?: number;
  margin?: Margin;
  children: (x: ScaleLinear<number, number>) => ReactNode;
  overlay?: (x: ScaleLinear<number, number>) => ReactNode;
}

/** Axes, gridlines, the hovered hour's band and the pointer layer. */
export function HourFrame({ width, height, y, yTicks, formatY, label, describedBy, baseline, margin = MARGIN, children, overlay }: FrameProps) {
  const { hour, setHour } = useHour();
  const x = hourScale(width, margin);
  const plotTop = margin.top;
  const plotBottom = height - margin.bottom;
  const every = width < 440 ? 6 : 3;
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

  if (width <= 0) return <svg className="pk-chart" height={height} aria-hidden="true" />;

  return (
    <svg
      className="pk-chart"
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
      <g className="pk-grid">
        {yTicks.map((t) => (
          <g key={t} transform={`translate(0,${Math.round(y(t)) + 0.5})`}>
            <line x1={margin.left} x2={width - margin.right} className={t === baseline ? "pk-grid__base" : undefined} />
            <text x={margin.left - 8} dy="0.32em" textAnchor="end">
              {formatY(t)}
            </text>
          </g>
        ))}
      </g>
      {hour !== null && <rect className="pk-hour" x={x(hour)} y={plotTop} width={x(hour + 1) - x(hour)} height={plotBottom - plotTop} />}
      {children(x)}
      <g className="pk-axis" transform={`translate(0,${plotBottom})`}>
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={16} textAnchor={t === 0 ? "start" : t === HOURS ? "end" : "middle"}>
            {t === HOURS ? "24:00" : hourStart(t)}
          </text>
        ))}
      </g>
      {overlay?.(x)}
    </svg>
  );
}

/** A legend key that mirrors its mark: a line for lines, a block for bars and bands. */
export function Key({ kind, label, plan, className }: { kind: "line" | "ghost" | "bar" | "band" | "band-inner" | "path" | "dot" | "ring" | "tick"; label: ReactNode; plan?: string; className?: string }) {
  return (
    <span className={`pk-key pk-key--${kind}${className ? ` ${className}` : ""}`} style={plan ? ({ "--plan": plan } as CSSProperties) : undefined}>
      <span className="pk-key__mark" aria-hidden="true" />
      <span className="pk-key__label">{label}</span>
    </span>
  );
}

export function Legend({ children }: { children: ReactNode }) {
  return <div className="pk-legend">{children}</div>;
}

/** A chart with its title, unit and legend above the plot. */
export function Figure({ title, unit, legend, children, plotRef }: { title: ReactNode; unit?: ReactNode; legend?: ReactNode; children: ReactNode; plotRef: RefObject<HTMLDivElement> }) {
  return (
    <figure className="pk-figure">
      <figcaption className="pk-figure__head">
        <h3 className="pk-figure__title">{title}</h3>
        {unit && <span className="pk-figure__unit">{unit}</span>}
      </figcaption>
      {legend}
      <div ref={plotRef} className="pk-figure__plot">
        {children}
      </div>
    </figure>
  );
}
