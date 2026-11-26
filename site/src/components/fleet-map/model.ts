// The fleet map's model: the day's sealed plans joined to the points wattness.tech's Fleet Map publishes, the counts
// the map prints, its color scale, the hour's totals, the default hour and the projection. Pure (no DOM, no React), so
// test/fleet-map.test.mjs runs it under Node.

/** How exact a published point is, in the Terminal's fleet-geo.v1 words. */
export type Precision = "site" | "substation" | "third-party" | "co-located-plant" | "sibling" | "county";

/**
 * The Terminal's coverage words for a point: its own EIA-860 plant (exact), a node point (a substation, a co-located
 * plant, a sibling or a third party: approximate), or its county's interior point. Drawn with a solid, a dashed and a
 * dotted ring, as the Terminal's map draws them.
 */
export type PlaceKind = "exact" | "approximate" | "county";

export const PLACE_KINDS: readonly PlaceKind[] = ["exact", "approximate", "county"];

export const PLACE_WORDS: Record<PlaceKind, { label: string; card: string }> = {
  exact: { label: "Its own site", card: "At its own site (EIA-860)" },
  approximate: { label: "Its node's point", card: "Approximate: drawn at its node's point" },
  county: { label: "Its county's point", card: "Approximate: drawn at its county's interior point" },
};

export function placeKind(p: Precision): PlaceKind {
  if (p === "site") return "exact";
  if (p === "county") return "county";
  return "approximate";
}

/** One battery's published point. */
export interface GeoPoint {
  lat: number;
  lon: number;
  precision: Precision;
}

/** The published points (public/geo/fleet-points.json), cut from the Terminal's fleet-geo.v1 route. */
export interface FleetPoints {
  schema: "grand-prix.fleet-points.v1";
  what: string;
  license: string;
  receipt: GeoReceipt;
  /** Every battery in the release's census with a published point. */
  points: Record<string, GeoPoint>;
  /** Census batteries the release publishes without a point, with the route's reason (or null). */
  unmapped: Record<string, string | null>;
}

/** Texas's counties, ERCOT's load zones and the towns the map names (public/geo/texas.json), cut from the Terminal's geo
 *  layers. The map draws the state as the union of its counties. */
export interface TexasGeo {
  schema: "grand-prix.texas-geo.v1";
  what: string;
  license: string;
  receipt: GeoReceipt;
  /** One list of [lon, lat] rings per county. */
  counties: [number, number][][][];
  /** Load-zone outlines, traced from the counties by the Terminal and labeled approximate there. */
  zones: { zone: string; label: string; at: [number, number] | null; paths: [number, number][][] }[];
  zoneNote: string;
  /** [name, lon, lat] of the towns the map names. */
  places: [string, number, number][];
}

export interface GeoReceipt {
  release: string;
  releaseUrl: string;
  releasePointer?: { releaseId: string | null; generatedAt: string | null; sha256: string };
  manifest: { url: string; sha256: string; checked?: string };
  files: {
    route: string;
    url: string;
    bytes: number;
    sha256: string;
    schema?: string;
    catalog?: { path: string; sha256: string } | null;
    license: string;
    attribution: string | null;
    source: string;
  }[];
  fetched: { ct: string; bangkok: string };
  cut: string;
}

/** What the map needs of a sealed plan (a BatterySummary has it). */
export interface PlanRow {
  resource: string;
  powerMw: number;
  scheduleMw: readonly number[];
}

export interface Placed<B extends PlanRow> {
  b: B;
  lat: number;
  lon: number;
  precision: Precision;
  kind: PlaceKind;
}

export interface Joined<B extends PlanRow> {
  placed: Placed<B>[];
  /** Plans with no published point, in the day's order: listed under the map, never placed by guess. */
  unplaced: { b: B; reason: string | null }[];
  counts: Record<PlaceKind, number> & { unplaced: number; total: number };
}

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Each plan at its published point, by its ERCOT resource name; a plan without a usable point is left unplaced. */
export function joinFleet<B extends PlanRow>(plans: readonly B[], geo: Pick<FleetPoints, "points" | "unmapped">): Joined<B> {
  const placed: Placed<B>[] = [];
  const unplaced: { b: B; reason: string | null }[] = [];
  const counts = { exact: 0, approximate: 0, county: 0, unplaced: 0, total: plans.length };
  for (const b of plans) {
    const p = Object.prototype.hasOwnProperty.call(geo.points, b.resource) ? geo.points[b.resource] : undefined;
    if (p && finite(p.lat) && finite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && p.precision) {
      const kind = placeKind(p.precision);
      placed.push({ b, lat: p.lat, lon: p.lon, precision: p.precision, kind });
      counts[kind] += 1;
    } else {
      const reason = p
        ? "its published point is not usable"
        : Object.prototype.hasOwnProperty.call(geo.unmapped, b.resource)
          ? (geo.unmapped[b.resource] ?? null)
          : "no point on file for it";
      unplaced.push({ b, reason });
      counts.unplaced += 1;
    }
  }
  return { placed, unplaced, counts };
}

// ---------------------------------------------------------------- the color scale

/**
 * The Terminal's diverging "heat" ramp (wattness-site chart-tokens.css, --ch-heat-0..8), in its direction: below the
 * reference red, at it a warm gray, above it blue. Here the reference is idle: charging is below it, discharging above.
 */
export const RAMP = {
  light: ["#931b00", "#b54a35", "#d07865", "#e8a596", "#dfdedb", "#93b8ee", "#6190d5", "#3169ba", "#004395"],
  dark: ["#ffa383", "#e27d59", "#b36549", "#854f3c", "#414344", "#3c618b", "#4c80ba", "#5ea1ea", "#8cc2ff"],
} as const;

export const IDLE_STEP = 4;

/** Below this the plan's hour is idle (the schedule is in whole kW). */
export const IDLE_MW = 0.0005;

/** The hour's planned MW over the battery's rated MW, held to −1..1. */
export function shareOfRated(mw: number, powerMw: number): number {
  if (!finite(mw) || Math.abs(mw) < IDLE_MW) return 0;
  if (!finite(powerMw) || powerMw <= 0) return mw > 0 ? 1 : -1;
  return Math.max(-1, Math.min(1, mw / powerMw));
}

/**
 * The ramp's step for a planned MW: 4 idle; charging 3 (up to a quarter of rated power), 2, 1, 0 (over three
 * quarters); discharging 5, 6, 7, 8 the same way.
 */
export function rampStep(mw: number, powerMw: number): number {
  const s = shareOfRated(mw, powerMw);
  if (s === 0) return IDLE_STEP;
  const k = Math.min(4, Math.max(1, Math.ceil(Math.abs(s) * 4 - 1e-9)));
  return s < 0 ? IDLE_STEP - k : IDLE_STEP + k;
}

/** The legend's nine steps, charging strongest first. */
export const STEP_WORDS: string[] = [
  "Charging, over 75% of rated power",
  "Charging, 50 to 75%",
  "Charging, 25 to 50%",
  "Charging, up to 25%",
  "Idle",
  "Discharging, up to 25%",
  "Discharging, 25 to 50%",
  "Discharging, 50 to 75%",
  "Discharging, over 75% of rated power",
];

// ---------------------------------------------------------------- the hour

export type Mode = "discharge" | "charge" | "idle";

export function modeOf(mw: number): Mode {
  if (!finite(mw) || Math.abs(mw) < IDLE_MW) return "idle";
  return mw > 0 ? "discharge" : "charge";
}

export interface HourTotals {
  hour: number;
  discharging: number;
  dischargeMw: number;
  charging: number;
  chargeMw: number;
  idle: number;
}

/** The plans' count and MW each way at one hour (CT hour start, 0 to 23). */
export function hourTotals(plans: readonly PlanRow[], hour: number): HourTotals {
  const t: HourTotals = { hour, discharging: 0, dischargeMw: 0, charging: 0, chargeMw: 0, idle: 0 };
  for (const b of plans) {
    const mw = b.scheduleMw[hour] ?? 0;
    const m = modeOf(mw);
    if (m === "discharge") {
      t.discharging += 1;
      t.dischargeMw += mw;
    } else if (m === "charge") {
      t.charging += 1;
      t.chargeMw += -mw;
    } else t.idle += 1;
  }
  return t;
}

/** The day's 24 hours of totals. */
export function dayTotals(plans: readonly PlanRow[]): HourTotals[] {
  return Array.from({ length: 24 }, (_, h) => hourTotals(plans, h));
}

/** The evening hours the map may open on (CT hour starts). */
export const EVENING_HOURS = [16, 17, 18, 19, 20, 21] as const;

/**
 * The evening peak: the evening hour in which the plans discharge the most MW (the earliest on a tie). With no
 * evening discharge, the day's largest-discharge hour; with none at all, 18:00.
 */
export function eveningPeakHour(plans: readonly PlanRow[]): number {
  const totals = dayTotals(plans);
  const best = (hours: readonly number[]) => {
    let h = -1;
    let mw = 0;
    for (const x of hours) {
      const v = totals[x]?.dischargeMw ?? 0;
      if (v > mw + 1e-9) {
        mw = v;
        h = x;
      }
    }
    return h;
  };
  const evening = best(EVENING_HOURS);
  if (evening >= 0) return evening;
  const any = best(Array.from({ length: 24 }, (_, i) => i));
  return any >= 0 ? any : 18;
}

/** A battery's dot: its area in proportion to its rated MW, never under `rMin`. */
export function radiusOf(powerMw: number, mwRef: number, rRef: number, rMin = 1.6): number {
  if (!finite(powerMw) || powerMw <= 0 || mwRef <= 0) return rMin;
  return Math.max(rMin, rRef * Math.sqrt(powerMw / mwRef));
}

/** The size legend's reference: the fleet's largest rating, rounded up to 50 MW. */
export function sizeReference(plans: readonly PlanRow[]): number {
  let max = 0;
  for (const b of plans) if (finite(b.powerMw) && b.powerMw > max) max = b.powerMw;
  return Math.max(50, Math.ceil(max / 50) * 50);
}

// ---------------------------------------------------------------- the projection

// Texas Centric Albers equal area (EPSG:3083's parameters on the sphere): standard parallels 27.5 and 35 N, origin
// 18 N, 100 W. Equal area, so the dots' crowding reads true from the Panhandle to the Valley.
const D = Math.PI / 180;
const PHI1 = 27.5 * D;
const PHI2 = 35 * D;
const PHI0 = 18 * D;
const LAM0 = -100 * D;
const N = (Math.sin(PHI1) + Math.sin(PHI2)) / 2;
const C = Math.cos(PHI1) ** 2 + 2 * N * Math.sin(PHI1);
const RHO0 = Math.sqrt(C - 2 * N * Math.sin(PHI0)) / N;

/** [x, y] on the unit sphere's Albers plane, y down (screen order). */
export function albers(lon: number, lat: number): [number, number] {
  const rho = Math.sqrt(C - 2 * N * Math.sin(lat * D)) / N;
  const theta = N * (lon * D - LAM0);
  return [rho * Math.sin(theta), -(RHO0 - rho * Math.cos(theta))];
}

export interface Frame {
  width: number;
  height: number;
  /** [lon, lat] to the frame's [x, y]. */
  at: (lon: number, lat: number) => [number, number];
}

/** A frame `width` wide that holds the rings with `pad` around them. */
export function frameFor(rings: readonly (readonly [number, number])[][], width: number, pad: number): Frame {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const ring of rings)
    for (const [lon, lat] of ring) {
      const [x, y] = albers(lon, lat);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  if (!(x1 > x0 && y1 > y0)) return { width, height: width, at: () => [width / 2, width / 2] };
  const k = (width - 2 * pad) / (x1 - x0);
  const height = (y1 - y0) * k + 2 * pad;
  return {
    width,
    height,
    at: (lon, lat) => {
      const [x, y] = albers(lon, lat);
      return [(x - x0) * k + pad, (y - y0) * k + pad];
    },
  };
}

/** An SVG path for rings in a frame, one decimal place. */
export function pathOf(rings: readonly (readonly [number, number])[][], frame: Frame, close = true): string {
  let d = "";
  for (const ring of rings) {
    if (ring.length < 2) continue;
    ring.forEach(([lon, lat], i) => {
      const [x, y] = frame.at(lon, lat);
      d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    if (close) d += "Z";
  }
  return d;
}

// ---------------------------------------------------------------- the title

/** "Tomorrow's" or "Today's" for an operating day, against the market's calendar day (YYYY-MM-DD in CT); null otherwise. */
export function dayWord(operatingDay: string, ctToday: string): "Tomorrow's" | "Today's" | null {
  if (operatingDay === ctToday) return "Today's";
  const [y, m, d] = ctToday.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return operatingDay === next ? "Tomorrow's" : null;
}
