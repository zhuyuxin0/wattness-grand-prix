// The storyboard's layout of the venue (src/data/layout.json), typed for the venue's frames, and the polyline helpers
// the track, the lanes and the feeders are built with. One diagram unit is one meter: world x = X - 500, z = Y - 300.
export type XZ = [number, number];

export interface Footprint { x0: number; z0: number; x1: number; z1: number; corner_m: number; center: XZ; size_m: XZ }
export interface Station {
  id: string; name: string; code: string; zone: string; box: string; faces_deg: number; gold?: boolean;
  rest: { s_m: number; point: XZ; heading_deg: number }; hero: string; pages: string[]; frames: string[];
  footprint: Footprint; svg_box: [number, number, number, number];
}
export interface Lane { id: string; from: string; to: string; svg_path: string; carries: 'main' | 'feeder'; world_points: XZ[] }
export interface Zone { title: string; svg_title_at: XZ; title_world: XZ; bounds: { x0: number; z0: number; x1: number; z1: number } }
export interface Layout {
  zones: Zone[];
  stations: Station[];
  track: { width_m: number; surface_y: number; main_world: XZ[]; length_m: number; segments: { name: string; starts_at_m: number }[] };
  feeders: Record<string, { width_m: number; world: XZ[]; note: string }>;
  lanes: Lane[];
  texas: { center_lon: number; center_lat: number; m_per_deg_lon: number; m_per_deg_lat: number; origin_world: XZ };
  grid: { front_row_x: number; track_z: number; abreast: number; lane_z_offsets: number[]; row_pitch_m: number; stagger_m: number };
  arena: any;
}

export function needLayout(layout: unknown): Layout {
  const L = layout as Layout | null;
  if (!L || !Array.isArray(L.stations) || !L.track) throw new Error('src/data/layout.json is missing: run scripts/sync-data.sh');
  return L;
}

export const station = (L: Layout, id: string) => {
  const s = L.stations.find((x) => x.id === id);
  if (!s) throw new Error(`layout has no station ${id}`);
  return s;
};

/** A diagram point (section 01's SVG) in world meters. */
export const fromSvg = (X: number, Y: number): XZ => [X - 500, Y - 300];

/** Cumulative lengths of a polyline. */
export function cumulative(P: readonly XZ[]): number[] {
  const c = [0];
  for (let i = 1; i < P.length; i++) c.push(c[i - 1]! + Math.hypot(P[i]![0] - P[i - 1]![0], P[i]![1] - P[i - 1]![1]));
  return c;
}

/** The point and unit direction at distance s along a polyline. */
export function pointAt(P: readonly XZ[], cum: readonly number[], s: number): { p: XZ; d: XZ } {
  const n = P.length, total = cum[n - 1]!;
  const t = Math.max(0, Math.min(total, s));
  let i = 1;
  while (i < n - 1 && cum[i]! < t) i++;
  const a = P[i - 1]!, b = P[i]!, L = Math.max(1e-6, cum[i]! - cum[i - 1]!), k = (t - cum[i - 1]!) / L;
  const dx = b[0] - a[0], dz = b[1] - a[1], dl = Math.hypot(dx, dz) || 1;
  return { p: [a[0] + dx * k, a[1] + dz * k], d: [dx / dl, dz / dl] };
}

/** The stretch of a polyline from s0 to s1, with its end points cut exactly there. */
export function slice(P: readonly XZ[], cum: readonly number[], s0: number, s1: number): XZ[] {
  const out: XZ[] = [pointAt(P, cum, s0).p];
  for (let i = 0; i < P.length; i++) if (cum[i]! > s0 && cum[i]! < s1) out.push(P[i]!);
  out.push(pointAt(P, cum, s1).p);
  return out;
}

/** Offset a polyline sideways by d (positive to the left of travel, seen from above with z south: left is the
 *  direction (dz, -dx)), mitred. */
export function offset(P: readonly XZ[], d: number, closed = false): XZ[] {
  const n = P.length;
  return P.map((p, i) => {
    const a = P[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]!, b = P[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
    const prev = i === 0 && !closed ? p : a, next = i === n - 1 && !closed ? p : b;
    let t1x = p[0] - prev[0], t1z = p[1] - prev[1], t2x = next[0] - p[0], t2z = next[1] - p[1];
    const l1 = Math.hypot(t1x, t1z), l2 = Math.hypot(t2x, t2z);
    if (l1 < 1e-6) { t1x = t2x; t1z = t2z; } else { t1x /= l1; t1z /= l1; }
    if (l2 < 1e-6) { t2x = t1x; t2z = t1z; } else { t2x /= l2; t2z /= l2; }
    const n1x = t1z, n1z = -t1x, n2x = t2z, n2z = -t2x;
    let mx = n1x + n2x, mz = n1z + n2z; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const k = Math.max(0.35, mx * n1x + mz * n1z);
    return [p[0] + (mx * d) / k, p[1] + (mz * d) / k];
  });
}

/** Resample a polyline every step meters (its end kept). */
export function resample(P: readonly XZ[], step: number): XZ[] {
  const cum = cumulative(P), total = cum[cum.length - 1]!;
  const n = Math.max(1, Math.round(total / step)), out: XZ[] = [];
  for (let i = 0; i <= n; i++) out.push(pointAt(P, cum, (i / n) * total).p);
  return out;
}

/** The track's distance s nearest a point (a coarse scan, then the segment's projection). */
export function nearestS(P: readonly XZ[], cum: readonly number[], q: XZ): number {
  let best = 0, bd = Infinity;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1]!, b = P[i]!, dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const k = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2));
    const x = a[0] + dx * k, z = a[1] + dz * k, d = Math.hypot(q[0] - x, q[1] - z);
    if (d < bd) { bd = d; best = cum[i - 1]! + k * Math.sqrt(L2); }
  }
  return best;
}
