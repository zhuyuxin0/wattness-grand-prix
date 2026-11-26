import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import { CENTRAL_TZ, SOURCE_LINE } from "../../config";
import { useDay, useLoad, type BatterySummary, type DayIndex, type Loaded } from "../../data";
import { arm as armMeta } from "../../design/tokens";
import { now } from "../../lib/capture";
import { formatDec1, formatInt } from "../../lib/format";
import { hourEndingLabel } from "../../lib/hours";
import { formatInZone, formatOperatingDay, READER_TZ, zonedInstant } from "../../lib/time";
import { BATTERY_NAMES, Glyph, Ready } from "../../ui";
import { useTheme } from "../../ui/useTheme";
import { loadPoints, loadTexas } from "./load";
import {
  IDLE_STEP,
  PLACE_KINDS,
  PLACE_WORDS,
  RAMP,
  STEP_WORDS,
  dayTotals,
  dayWord,
  eveningPeakHour,
  frameFor,
  joinFleet,
  modeOf,
  pathOf,
  radiusOf,
  rampStep,
  sizeReference,
  type FleetPoints,
  type Frame,
  type PlaceKind,
  type Placed,
  type TexasGeo,
} from "./model";
import "./fleet-map.css";

// THE FLEET MAP ("Tomorrow's plans across Texas"). Every sealed plan of the day at the point wattness.tech's Fleet
// Map publishes for its battery, its dot's area in proportion to the battery's rated MW and its color the plan's
// charge or discharge in the chosen hour, as a share of rated power, on the Terminal's diverging ramp. A point's
// precision is drawn the Terminal's way: a solid ring for its own EIA-860 site, a dashed one for a node point, a
// dotted one for a county point. Plans without a published point are counted and listed under the map, never placed.
//
// An SVG over the Census's Texas, its counties and the load zones the Terminal traces from them: no tiles, no WebGL,
// no key. The module loads by dynamic import (index.tsx), so only the Fleet tab, or a pane that opens it, fetches it.

export interface FleetMapProps {
  /** "lead": the Fleet tab's section, with its title and the unplaced list. "pane": the body of a pane on a home. */
  variant?: "lead" | "pane";
  /** The hour to open on (CT hour start, 0 to 23); the evening peak when absent. */
  hour?: number;
  className?: string;
}

const W = 1000;
const PAD = 14;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const pad2 = (n: number) => String(n).padStart(2, "0");
const ctDate = new Intl.DateTimeFormat("en-CA", { timeZone: CENTRAL_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** "West" for LZ_WEST. */
function zoneName(zone: string): string {
  const s = zone.replace(/^LZ_/, "").toLowerCase();
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

/** "West (LZ_WEST)": the zone's plain name, the code in brackets. */
export function zoneWords(zone: string | null | undefined): string {
  if (!zone) return "zone unknown";
  return `${zoneName(zone)} (${zone})`;
}

function hourParam(): number | null {
  try {
    const raw = new URLSearchParams(window.location.search).get("hour");
    if (raw == null || !/^\d{1,2}$/.test(raw)) return null;
    const h = Number(raw);
    return h >= 0 && h <= 23 ? h : null;
  } catch {
    return null;
  }
}

export default function FleetMap(props: FleetMapProps) {
  const day = useDay();
  const points = useLoad(loadPoints, "fleet-points");
  const texas = useLoad(loadTexas, "texas-geo");
  let both: Loaded<{ day: DayIndex; points: FleetPoints; texas: TexasGeo }> = { status: "loading" };
  if (day.status === "ready" && points.status === "ready" && texas.status === "ready") both = { status: "ready", data: { day: day.data, points: points.data, texas: texas.data } };
  else if (day.status === "error") both = day;
  else if (points.status === "error") both = points;
  else if (texas.status === "error") both = texas;
  return (
    <div className={`fmap fmap--${props.variant ?? "lead"}${props.className ? ` ${props.className}` : ""}`}>
      <Ready state={both} label="Loading the map">
        {(d) => <MapBody {...props} day={d.day} points={d.points} texas={d.texas} />}
      </Ready>
    </div>
  );
}

interface Dot {
  p: Placed<BatterySummary>;
  x: number;
  y: number;
  /** Radius in screen px. */
  r: number;
}

function MapBody({ day, points, texas, variant = "lead", hour: initialHour }: FleetMapProps & { day: DayIndex; points: FleetPoints; texas: TexasGeo }) {
  const theme = useTheme();
  const ramp = RAMP[theme];
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const plans = day.batteries;
  const joined = useMemo(() => joinFleet(plans, points), [plans, points]);
  const totals = useMemo(() => dayTotals(plans), [plans]);
  const peak = useMemo(() => eveningPeakHour(plans), [plans]);
  const [hour, setHour] = useState<number>(() => initialHour ?? hourParam() ?? peak);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  // ---- the frame and the ground, made once per geometry
  const rings = useMemo(() => texas.counties.flat(), [texas]);
  const frame: Frame = useMemo(() => frameFor(rings, W, PAD), [rings]);
  const ground = useMemo(
    () => ({
      // Texas is its counties' union: drawn three times from one path (an edge stroke under, the land over it, the
      // county lines on top), so the state's outline is the counties' own outer edge.
      land: pathOf(rings, frame),
      zones: texas.zones.map((z) => ({ zone: z.zone, label: z.label, d: pathOf(z.paths, frame, false), at: z.at ? frame.at(z.at[0], z.at[1]) : null })),
      places: texas.places.map(([name, lon, lat]) => {
        const [x, y] = frame.at(lon, lat);
        return { name, x, y };
      }),
    }),
    [texas, rings, frame],
  );

  // ---- the map's width on screen, so dots keep their size in px at any width
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [px, setPx] = useState(720);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const read = () => setPx(Math.max(240, el.getBoundingClientRect().width));
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const unit = W / px; // viewBox units per screen px

  // Town names, the Terminal's way: right of the dot, else left of it, else left out; never over a zone's name or an
  // earlier town's, and a zone's name stands for the town it is named after.
  const towns = useMemo(() => {
    type Box = [number, number, number, number];
    const boxes: Box[] = ground.zones.flatMap((z) => {
      if (!z.at) return [];
      const half = ((zoneName(z.zone).length * 8.4 + 8) * unit) / 2;
      return [[z.at[0] - half, z.at[1] - 11 * unit, z.at[0] + half, z.at[1] + 4 * unit] as Box];
    });
    const hits = (b: Box) => boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    const zoneNamed = new Set(ground.zones.map((z) => zoneName(z.zone).toLowerCase()));
    const out: { name: string; x: number; y: number; left: boolean }[] = [];
    // The towns come largest first; a small map names fewer of them.
    const room = px < 520 ? 10 : ground.places.length;
    const inside = (b: Box) => b[0] >= 2 * unit && b[2] <= W - 2 * unit;
    for (const t of ground.places) {
      if (out.length >= room) break;
      if (zoneNamed.has(t.name.toLowerCase())) continue;
      const w = (8 + t.name.length * 6.3) * unit;
      const h = 8 * unit;
      const right: Box = [t.x - 3 * unit, t.y - h, t.x + w, t.y + h];
      const left: Box = [t.x - w, t.y - h, t.x + 3 * unit, t.y + h];
      if (inside(right) && !hits(right)) {
        boxes.push(right);
        out.push({ ...t, left: false });
      } else if (inside(left) && !hits(left)) {
        boxes.push(left);
        out.push({ ...t, left: true });
      }
    }
    return out;
  }, [ground, unit, px]);
  const mwRef = useMemo(() => sizeReference(plans), [plans]);
  const rRef = Math.max(9, Math.min(16, px * 0.021));

  const dots: Dot[] = useMemo(() => {
    const list = joined.placed.map((p) => {
      const [x, y] = frame.at(p.lon, p.lat);
      return { p, x, y, r: radiusOf(p.b.powerMw, mwRef, rRef) };
    });
    // The largest first, so a small battery at a shared point stays on top and in reach.
    list.sort((a, b) => b.r - a.r || a.p.b.index - b.p.b.index);
    return list;
  }, [joined, frame, mwRef, rRef]);

  // Batteries at one point (a shared site), for the card's "also here".
  const atPoint = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of dots) {
      const k = `${d.p.lat.toFixed(5)},${d.p.lon.toFixed(5)}`;
      m.set(k, [...(m.get(k) ?? []), d.p.b.resource]);
    }
    return m;
  }, [dots]);

  // ---- playing the day: an hour a step, to 23:00, never by itself
  const live = useRef({ hour });
  live.current = { hour };
  useEffect(() => {
    if (!playing) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = window.setInterval(
      () => {
        const next = live.current.hour + 1;
        if (next > 23) {
          setPlaying(false);
          return;
        }
        setHour(next);
      },
      reduce ? 1600 : 900,
    );
    return () => window.clearInterval(t);
  }, [playing]);
  const play = () => {
    if (!playing && hour >= 23) setHour(0);
    setPlaying((x) => !x);
  };
  const step = (d: number) => {
    setPlaying(false);
    setHour((h) => Math.max(0, Math.min(23, h + d)));
  };

  // ---- pointing: the nearest dot within reach, the smallest on a tie (it is drawn on top)
  const hit = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>, slackPx: number): string | null => {
      const svg = svgRef.current;
      const ctm = svg?.getScreenCTM();
      if (!svg || !ctm) return null;
      const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      let best: Dot | null = null;
      let bestScore = Infinity;
      for (const d of dots) {
        const distPx = Math.hypot(d.x - pt.x, d.y - pt.y) / unit;
        if (distPx > d.r + slackPx) continue;
        // Inside a dot beats near one, and the smallest dot holding the point wins (it is drawn on top);
        // otherwise the nearest edge.
        const score = distPx <= d.r ? d.r - 1e6 : distPx - d.r;
        if (score < bestScore) {
          best = d;
          bestScore = score;
        }
      }
      return best ? best.p.b.resource : null;
    },
    [dots, unit],
  );
  const down = useRef<{ x: number; y: number; id: number } | null>(null);
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== "mouse") return;
    setHover(hit(e, 4));
  };
  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    down.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = down.current;
    down.current = null;
    if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;
    const r = hit(e, e.pointerType === "mouse" ? 4 : 12);
    setPinned((cur) => (r && r !== cur ? r : null));
  };
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned]);

  const shown = pinned ?? hover;
  const shownDot = shown ? dots.find((d) => d.p.b.resource === shown) ?? null : null;

  // ---- words
  const t = totals[hour]!;
  const [y, m, dd] = day.operatingDay.split("-").map(Number) as [number, number, number];
  const startMs = zonedInstant(CENTRAL_TZ, y, m, dd, hour);
  const yoursStart = formatInZone(startMs / 1000, READER_TZ, { seconds: false });
  const yoursEnd = formatInZone(startMs / 1000 + 3600, READER_TZ, { date: false, seconds: false });
  const ctStart = formatInZone(startMs / 1000, CENTRAL_TZ, { seconds: false });
  const yours = yoursStart === ctStart || READER_TZ === CENTRAL_TZ ? null : `${yoursStart}–${yoursEnd} yours`;
  const hourCt = `${pad2(hour)}:00–${pad2(hour + 1 === 24 ? 24 : hour + 1)}:00 CT`;
  const opDay = formatOperatingDay(day.operatingDay);
  const word = dayWord(day.operatingDay, ctDate.format(now()));
  const title = word ? `${word} Plans Across Texas` : "The Plans Across Texas";
  const chargePeak = totals.reduce((best, x) => (x.chargeMw > (totals[best]?.chargeMw ?? 0) + 1e-9 ? x.hour : best), 0);
  const counts = joined.counts;

  const summary = `${hourCt}, ${opDay}: ${formatInt(t.discharging)} plans discharging ${formatInt(Math.round(t.dischargeMw))} MW, ${formatInt(t.charging)} charging ${formatInt(Math.round(t.chargeMw))} MW, ${formatInt(t.idle)} idle.`;

  const map = (
    <div className="fmap-stage">
      <div className="fmap-box" ref={boxRef} style={{ maxWidth: `min(100%, ${variant === "pane" ? 640 : 780}px, ${((variant === "pane" ? 58 : 74) * (W / frame.height)).toFixed(2)}vh)` }}>
        <svg
          ref={svgRef}
          className="fmap-svg"
          viewBox={`0 0 ${W} ${frame.height.toFixed(0)}`}
          role="img"
          aria-label={`Map of Texas with ${formatInt(counts.total - counts.unplaced)} of the ${formatInt(counts.total)} sealed plans at their batteries' published points. ${summary}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onPointerDown={onDown}
          onPointerUp={onUp}
        >
          <defs>
            {ramp.map((c, i) => (
              <radialGradient key={i} id={`${uid}-heat-${i}`}>
                <stop offset="0%" stopColor={c} stopOpacity={theme === "dark" ? 0.5 : 0.42} />
                <stop offset="100%" stopColor={c} stopOpacity={0} />
              </radialGradient>
            ))}
          </defs>
          <path className="fmap-edge" d={ground.land} />
          <path className="fmap-land" d={ground.land} />
          <path className="fmap-counties" d={ground.land} />
          {ground.zones.map((z) => (
            <path key={z.zone} className="fmap-zone" d={z.d} />
          ))}
          <g className="fmap-heat" aria-hidden="true">
            {dots.map((d) => {
              const s = rampStep(d.p.b.scheduleMw[hour] ?? 0, d.p.b.powerMw);
              if (s === IDLE_STEP) return null;
              return <circle key={d.p.b.resource} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={((d.r * 2.3 + 6) * unit).toFixed(2)} fill={`url(#${uid}-heat-${s})`} />;
            })}
          </g>
          <g className="fmap-dots">
            {dots.map((d) => {
              const mw = d.p.b.scheduleMw[hour] ?? 0;
              const s = rampStep(mw, d.p.b.powerMw);
              const r = d.r * unit;
              return (
                <g key={d.p.b.resource} className={`fmap-dot fmap-dot--${d.p.kind}${s === IDLE_STEP ? " is-idle" : ""}`}>
                  <circle cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={r.toFixed(2)} fill={ramp[s]} className="fmap-dot__fill" />
                  {d.p.kind !== "exact" && <circle cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={(r + 2.4 * unit).toFixed(2)} className="fmap-dot__ring" />}
                </g>
              );
            })}
          </g>
          <g className="fmap-zone-labels" aria-hidden="true">
            {ground.zones.map((z) =>
              z.at ? (
                <text key={z.zone} x={z.at[0].toFixed(1)} y={z.at[1].toFixed(1)} textAnchor="middle" style={{ fontSize: `${11 * unit}px` }} className="fmap-zone-label">
                  {zoneName(z.zone)}
                </text>
              ) : null,
            )}
          </g>
          <g className="fmap-places" aria-hidden="true">
            {towns.map((p) => (
              <g key={p.name} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
                <circle r={2.2 * unit} className="fmap-place__dot" />
                <text x={(p.left ? -5 : 5) * unit} y={3.5 * unit} textAnchor={p.left ? "end" : "start"} style={{ fontSize: `${11 * unit}px` }} className="fmap-place__name">
                  {p.name}
                </text>
              </g>
            ))}
          </g>
          {shownDot && (
            <circle
              className="fmap-halo"
              cx={shownDot.x.toFixed(1)}
              cy={shownDot.y.toFixed(1)}
              r={((shownDot.r + (shownDot.p.kind === "exact" ? 2.5 : 4.5)) * unit).toFixed(2)}
              aria-hidden="true"
            />
          )}
        </svg>
        {shownDot && (
          <Card
            dot={shownDot}
            hour={hour}
            hourCt={hourCt}
            opDay={opDay}
            ramp={ramp}
            px={px}
            unit={unit}
            frameH={frame.height}
            pinned={pinned === shownDot.p.b.resource}
            also={(atPoint.get(`${shownDot.p.lat.toFixed(5)},${shownDot.p.lon.toFixed(5)}`) ?? []).filter((r) => r !== shownDot.p.b.resource)}
            onClose={() => setPinned(null)}
          />
        )}
      </div>
      <p className="fmap-hint">
        {pinned ? "Click or tap the map again, or press Escape, to close the card." : "Point at a battery, or tap it, for its plan in this hour."}
      </p>
    </div>
  );

  const scrubber = (
    <div className="fmap-scrub" role="group" aria-label="Hour of the operating day, Central time">
      <div className="fmap-scrub__buttons">
        <button type="button" className="btn fmap-play" onClick={play} title={playing ? "Stop at this hour" : "Step through the day an hour at a time, to 23:00 CT (from 00:00 when at the end)"}>
          {playing ? "Pause" : "Play the day"}
        </button>
        <button type="button" className="btn fmap-step" onClick={() => step(-1)} disabled={hour <= 0} aria-label="The hour before">
          <Glyph name="prev" />
        </button>
        <button type="button" className="btn fmap-step" onClick={() => step(1)} disabled={hour >= 23} aria-label="The hour after">
          <Glyph name="next" />
        </button>
        <button type="button" className="btn fmap-peak" onClick={() => { setPlaying(false); setHour(peak); }} aria-pressed={hour === peak} title="The evening hour in which the plans discharge the most">
          Evening peak, {pad2(peak)}:00
        </button>
      </div>
      <div className="fmap-scrub__track">
        <Curve totals={totals} hour={hour} ramp={ramp} onHour={(h) => { setPlaying(false); setHour(h); }} />
        <input
          type="range"
          className="fmap-range"
          min={0}
          max={23}
          step={1}
          value={hour}
          aria-label="Hour, Central time"
          aria-valuetext={`${hourCt} (${hourEndingLabel(hour)})`}
          style={{ ["--range-at" as string]: `${(hour / 23) * 100}%` }}
          onChange={(e) => {
            setPlaying(false);
            setHour(Number(e.currentTarget.value));
          }}
        />
        <div className="fmap-ticks num" aria-hidden="true">
          {HOURS.filter((h) => h % 3 === 0).map((h) => (
            <span key={h} style={{ left: `${(h / 23) * 100}%` }}>
              {pad2(h)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  const readout = (
    <div className="fmap-read">
      <div className="fmap-hour" aria-live={playing ? "off" : "polite"}>
        <div className="fmap-hour__ct num">
          {hourCt} <span className="muted">({hourEndingLabel(hour)})</span>
        </div>
        {yours && <div className="fmap-hour__yours num">{yours}</div>}
        <div className="fmap-hour__day">Operating day {opDay}</div>
      </div>
      <dl className="fmap-totals">
        <div>
          <dt>
            <i className="fmap-sw" style={{ background: ramp[8] }} aria-hidden="true" />
            Discharging
          </dt>
          <dd className="num">
            {formatInt(t.discharging)} <span className="muted">{t.discharging === 1 ? "plan" : "plans"}</span> · {formatInt(Math.round(t.dischargeMw))} <span className="muted">MW</span>
          </dd>
        </div>
        <div>
          <dt>
            <i className="fmap-sw" style={{ background: ramp[0] }} aria-hidden="true" />
            Charging
          </dt>
          <dd className="num">
            {formatInt(t.charging)} <span className="muted">{t.charging === 1 ? "plan" : "plans"}</span> · {formatInt(Math.round(t.chargeMw))} <span className="muted">MW</span>
          </dd>
        </div>
        <div>
          <dt>
            <i className="fmap-sw fmap-sw--idle" style={{ background: ramp[IDLE_STEP] }} aria-hidden="true" />
            Idle
          </dt>
          <dd className="num">
            {formatInt(t.idle)} <span className="muted">{t.idle === 1 ? "plan" : "plans"}</span>
          </dd>
        </div>
      </dl>
      <p className="fmap-totals__note">
        All {formatInt(counts.total)} sealed plans in the hour{counts.unplaced > 0 ? `, the ${formatInt(counts.unplaced)} off the map included` : ""}.
      </p>
    </div>
  );

  const legend = <Legend ramp={ramp} mwRef={mwRef} rRef={rRef} counts={counts} compact={variant === "pane"} />;

  const where = (
    <p className="fmap-source">
      {SOURCE_LINE} Locations: wattness.tech's Fleet Map, release <code>{points.receipt.release}</code>, from EIA-860, ERCOT and the US Census Bureau, with
      node points placed using OpenStreetMap data (© OpenStreetMap contributors, ODbL 1.0). Map: US Census Bureau counties and towns (public domain);
      load zones traced from the counties, approximate.
    </p>
  );

  if (variant === "pane") {
    return (
      <>
        <div className="fmap-pane-head">
          <span className="fmap-pane-title">{title}</span>
          <span className="fmap-pane-day">{opDay}</span>
        </div>
        <div className="fmap-grid">
          {map}
          {readout}
          {legend}
          {scrubber}
        </div>
        <p className="fmap-shadow">{shadowLine}</p>
        <p className="fmap-unplaced-n">
          {counts.unplaced === 0 ? (
            `Every one of the ${formatInt(counts.total)} has a published location.`
          ) : (
            <>
              {formatInt(counts.unplaced)} of {formatInt(counts.total)} have no published location. <Link to="/fleet#fleet-map-unplaced">See them on Fleet</Link>
            </>
          )}
        </p>
        {where}
      </>
    );
  }

  return (
    <section className="fmap-section" id="fleet-map" aria-labelledby="fleet-map-title">
      <header className="fmap-head">
        <div>
          <h2 className="fmap-title" id="fleet-map-title">
            {title}
          </h2>
          <p className="fmap-lede">
            The sealed plans for {opDay}, each at its battery's published point, its dot sized by the battery's rated power and colored by what the plan
            does in the hour.
            {(totals[chargePeak]?.chargeMw ?? 0) > 0 && (totals[peak]?.dischargeMw ?? 0) > 0
              ? ` Play the day: the plans charge most in the ${pad2(chargePeak)}:00 CT hour and discharge most in the ${pad2(peak)}:00 CT hour of the evening.`
              : " Play the day to see each hour."}
          </p>
        </div>
      </header>
      <div className="fmap-grid">
        {map}
        {readout}
        {legend}
        {scrubber}
      </div>
      <p className="fmap-shadow">{shadowLine}</p>
      <div className="fmap-unplaced" id="fleet-map-unplaced">
        {counts.unplaced === 0 ? (
          <p>Every one of the {formatInt(counts.total)} has a published location.</p>
        ) : (
          <>
            <p className="fmap-unplaced__n">
              <strong className="num">
                {formatInt(counts.unplaced)} of {formatInt(counts.total)}
              </strong>{" "}
              have no published location, so the map leaves them off rather than guess a place. Their plans are in the hour's totals and in the board below.
            </p>
            <ul className="fmap-unplaced__list">
              {joined.unplaced.map(({ b }) => (
                <li key={b.resource}>
                  <Link to={`/battery/${b.resource}`} className="fmap-code" title={`${zoneWords(b.zone)}: open its plan`}>
                    {BATTERY_NAMES[b.resource] ? `${BATTERY_NAMES[b.resource]} (${b.resource})` : b.resource}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {where}
    </section>
  );
}

const shadowLine = "Wattness's shadow plans, made from public data: never the operators' own dispatch.";

// ---------------------------------------------------------------- the day's curve under the scrubber

function Curve({ totals, hour, ramp, onHour }: { totals: ReturnType<typeof dayTotals>; hour: number; ramp: readonly string[]; onHour: (h: number) => void }) {
  // Each hour's bar stands over the slider's stop for it: hour h at h/23 of the track, which the CSS insets by the
  // thumb's half width, as the tick labels are.
  const w = 460;
  const h = 44;
  const mid = h / 2;
  const top = Math.max(1, ...totals.map((t) => Math.max(t.dischargeMw, t.chargeMw)));
  const slot = w / 23;
  const bar = slot * 0.6;
  const cx = (i: number) => (i / 23) * w;
  return (
    <svg className="fmap-curve" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <rect x={cx(hour) - slot / 2} y={0} width={slot} height={h} rx={2} className="fmap-curve__now" />
      <line x1={-slot / 2} x2={w + slot / 2} y1={mid} y2={mid} className="fmap-curve__axis" />
      {totals.map((t, i) => {
        const up = (t.dischargeMw / top) * (mid - 2);
        const dn = (t.chargeMw / top) * (mid - 2);
        const x = cx(i) - bar / 2;
        return (
          <g key={i} onClick={() => onHour(i)} className="fmap-curve__hour">
            <rect x={cx(i) - slot / 2} y={0} width={slot} height={h} fill="transparent" />
            {up > 0.2 && <rect x={x} y={mid - up} width={bar} height={up} fill={ramp[7]} />}
            {dn > 0.2 && <rect x={x} y={mid} width={bar} height={dn} fill={ramp[1]} />}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- the legend

function Legend({
  ramp,
  mwRef,
  rRef,
  counts,
  compact = false,
}: {
  ramp: readonly string[];
  mwRef: number;
  rRef: number;
  counts: ReturnType<typeof joinFleet>["counts"];
  compact?: boolean;
}) {
  const sizes = [10, 50, mwRef].filter((v, i, a) => a.indexOf(v) === i && v <= mwRef);
  return (
    <div className="fmap-legend">
      <div className="fmap-legend__block">
        <div className="fmap-legend__title">The plan in the hour, share of rated power</div>
        <div className="fmap-ramp" role="img" aria-label="Nine colors from charging at full power, through idle, to discharging at full power">
          {ramp.map((c, i) => (
            <i key={i} style={{ background: c }} title={STEP_WORDS[i]} className={i === IDLE_STEP ? "is-idle" : undefined} />
          ))}
        </div>
        <div className="fmap-ramp__words">
          <span>Charging</span>
          <span>Idle</span>
          <span>Discharging</span>
        </div>
        <div className="fmap-ramp__ticks num" aria-hidden="true">
          <span>100%</span>
          <span>50%</span>
          <span>0</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>
      <div className="fmap-legend__block">
        <div className="fmap-legend__title">Rated power, the dot's area</div>
        <div className="fmap-sizes">
          {sizes.map((mw) => {
            const r = radiusOf(mw, mwRef, rRef);
            const box = 2 * r + 2;
            return (
              <span key={mw} className="fmap-size">
                <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
                  <circle cx={box / 2} cy={box / 2} r={r} className="fmap-sizes__dot" />
                </svg>
                <span className="num">{formatInt(mw)} MW</span>
              </span>
            );
          })}
        </div>
      </div>
      {compact ? (
        <p className="fmap-legend__note">
          A dashed or dotted ring marks an approximate point: {formatInt(counts.approximate)} at their node's point, {formatInt(counts.county)} at their county's.
        </p>
      ) : (
        <div className="fmap-legend__block">
          <div className="fmap-legend__title">Where a dot stands</div>
          <ul className="fmap-kinds">
            {PLACE_KINDS.map((k) => (
              <li key={k}>
                <Ring kind={k} />
                <span>{PLACE_WORDS[k].label}</span>
                <span className="fmap-kinds__n num">{formatInt(counts[k])}</span>
              </li>
            ))}
            <li>
              <span className="fmap-ring fmap-ring--none" aria-hidden="true" />
              <span>No published point, off the map</span>
              <span className="fmap-kinds__n num">{formatInt(counts.unplaced)}</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

function Ring({ kind }: { kind: PlaceKind }) {
  return (
    <svg className="fmap-ring" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx={7} cy={7} r={3.4} className="fmap-ring__fill" />
      {kind === "exact" ? (
        <circle cx={7} cy={7} r={3.4} className="fmap-ring__edge" />
      ) : (
        <circle cx={7} cy={7} r={5.6} className={`fmap-ring__edge fmap-ring__edge--${kind}`} />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------- the card

function Card({
  dot,
  hour,
  hourCt,
  opDay,
  ramp,
  px,
  unit,
  frameH,
  pinned,
  also,
  onClose,
}: {
  dot: Dot;
  hour: number;
  hourCt: string;
  opDay: string;
  ramp: readonly string[];
  px: number;
  unit: number;
  frameH: number;
  pinned: boolean;
  also: string[];
  onClose: () => void;
}) {
  const b = dot.p.b;
  const mw = b.scheduleMw[hour] ?? 0;
  const mode = modeOf(mw);
  const s = rampStep(mw, b.powerMw);
  const share = b.powerMw > 0 ? Math.round((Math.abs(mw) / b.powerMw) * 100) : null;
  const name = BATTERY_NAMES[b.resource];
  // Beside the dot on a wide map, docked under it on a narrow one.
  const docked = px < 560;
  const x = dot.x / unit;
  const y = dot.y / unit;
  const right = x < px - 300;
  const style = docked
    ? undefined
    : {
        left: right ? `${x + dot.r + 14}px` : undefined,
        right: right ? undefined : `${px - x + dot.r + 14}px`,
        top: `${Math.max(8, Math.min(frameH / unit - 190, y - 40))}px`,
      };
  return (
    <div className={`fmap-card${docked ? " fmap-card--docked" : ""}${pinned ? " is-pinned" : ""}`} style={style} role={pinned ? "dialog" : undefined} aria-label={pinned ? `${name ?? b.resource}'s plan` : undefined}>
      <div className="fmap-card__head">
        <div className="fmap-card__name">
          {name ? (
            <>
              {name} <span className="fmap-code">({b.resource})</span>
            </>
          ) : (
            <span className="fmap-code fmap-code--strong">{b.resource}</span>
          )}
        </div>
        {pinned && (
          <button type="button" className="fmap-card__close" onClick={onClose} aria-label="Close the card">
            <Glyph name="close" />
          </button>
        )}
      </div>
      <div className="fmap-card__where">
        {zoneWords(b.zone)}
        {b.county ? ` · ${b.county} County` : ""}
      </div>
      <div className="fmap-card__mw num">
        <i className={`fmap-sw${s === IDLE_STEP ? " fmap-sw--idle" : ""}`} style={{ background: ramp[s] }} aria-hidden="true" />
        <span>
          {mode === "idle" ? (
            "Idle"
          ) : (
            <>
              {mode === "discharge" ? "Discharging" : "Charging"} {formatDec1(Math.abs(mw))} MW
              {share != null && <span className="muted fmap-card__share"> · {share}% of rated power</span>}
            </>
          )}
        </span>
      </div>
      <div className="fmap-card__when num">
        {hourCt}, {opDay}
      </div>
      <div className="fmap-card__rated num">
        Rated {formatDec1(b.powerMw)} MW · {formatDec1(b.energyMwh)} MWh · plan {b.selectedArm} <span className="muted">({armMeta[b.selectedArm].label.toLowerCase()})</span>
      </div>
      <div className="fmap-card__point">
        <Ring kind={dot.p.kind} />
        {PLACE_WORDS[dot.p.kind].card}
      </div>
      {also.length > 0 && (
        <div className="fmap-card__also">
          Also at this point: {also.slice(0, 4).join(", ")}
          {also.length > 4 ? ` and ${also.length - 4} more` : ""}
        </div>
      )}
      <div className="fmap-card__go">
        {pinned || docked ? (
          <Link className="btn" to={`/battery/${b.resource}`}>
            Open on Battery
            <Glyph name="next" />
          </Link>
        ) : (
          <span className="muted">Click for the link to its plan</span>
        )}
      </div>
    </div>
  );
}

