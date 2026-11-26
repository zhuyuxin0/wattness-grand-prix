// Our brain shape: a signed distance field of our own, sampled on its surface. Two cerebral hemispheres (egg-shaped,
// smooth-unioned across the midline, the longitudinal fissure cut down the top), the temporal lobes below and forward,
// a flattened base, the cerebellum under the back with fine horizontal folia, and a brainstem stub. Cracks along the
// zero set of a gradient noise fold the cerebrum, so a shell sampled on it shows the gyri as denser streaks. No mesh
// file: every point comes from this field and a seed (lib/random.ts), so the film, the lab and the site draw the same
// brain. Units are Living Brain's: centered, the longest half-extent 0.62; +y up, the front toward +z, its left -x.
import { rng, seedOf, type Rng } from '../../lib/random';

// ── gradient noise (improved Perlin) on a permutation from a fixed seed ─────────────────────────────────────────────
const PERM = new Uint8Array(512);
{
  const order = rng(seedOf('brain-folds')).shuffle(Array.from({ length: 256 }, (_, i) => i));
  for (let i = 0; i < 512; i++) PERM[i] = order[i & 255]!;
}
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
function grad(h: number, x: number, y: number, z: number) {
  const k = h & 15, u = k < 8 ? x : y, v = k < 4 ? y : k === 12 || k === 14 ? x : z;
  return ((k & 1) === 0 ? u : -u) + ((k & 2) === 0 ? v : -v);
}
/** Gradient noise, about -1 to 1. */
export function noise3(x: number, y: number, z: number): number {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const X = fx & 255, Y = fy & 255, Z = fz & 255;
  x -= fx; y -= fy; z -= fz;
  const u = fade(x), v = fade(y), w = fade(z);
  const P = PERM;
  const A = P[X]! + Y, AA = P[A]! + Z, AB = P[A + 1]! + Z, B = P[X + 1]! + Y, BA = P[B]! + Z, BB = P[B + 1]! + Z;
  const x1 = x - 1, y1 = y - 1, z1 = z - 1;
  const a0 = grad(P[AA]!, x, y, z), a1 = grad(P[BA]!, x1, y, z), a2 = grad(P[AB]!, x, y1, z), a3 = grad(P[BB]!, x1, y1, z);
  const b0 = grad(P[AA + 1]!, x, y, z1), b1 = grad(P[BA + 1]!, x1, y, z1), b2 = grad(P[AB + 1]!, x, y1, z1), b3 = grad(P[BB + 1]!, x1, y1, z1);
  const c0 = a0 + u * (a1 - a0), c1 = a2 + u * (a3 - a2), c2 = b0 + u * (b1 - b0), c3 = b2 + u * (b3 - b2);
  const d0 = c0 + v * (c1 - c0), d1 = c2 + v * (c3 - c2);
  return d0 + w * (d1 - d0);
}

// ── the field ───────────────────────────────────────────────────────────────────────────────────────────────────
/** An ellipsoid's distance, the usual bound (exact on the surface, good near it). */
function ell(px: number, py: number, pz: number, rx: number, ry: number, rz: number) {
  const ax = px / rx, ay = py / ry, az = pz / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / rx, by = ay / ry, bz = az / rz;
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}
function smin(a: number, b: number, k: number) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function smax(a: number, b: number, k: number) { return -smin(-a, -b, k); }
const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a: number, b: number, x: number) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function capsule(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number) {
  const pax = px - ax, pay = py - ay, paz = pz - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = sat((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz));
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

/** One hemisphere as an egg, narrower and lower toward the front (frontal), fuller at the back (parietal, occipital),
 *  with its medial face flat against the midline. ax is the distance from the midline. In the upper part the two
 *  medial faces stand in the longitudinal fissure, 0.012 apart, as in an anatomical model: a sheet down the middle that
 *  the core lights. The cut fades out below the fissure's floor, so the hemispheres fuse in the lower half and the
 *  brain from the front is a dome, not two capsules. */
function hemisphere(ax: number, y: number, z: number) {
  const front = sstep(0.0, 0.62, z), back = sstep(0.0, -0.62, z);
  const rx = 0.265 * (1 - 0.15 * front) * (1 - 0.04 * back);
  const ry = 0.46 * (1 - 0.02 * front) * (1 - 0.04 * back);
  const cy = 0.06;
  // its top leans in toward the midline, so the two read from the front as one dome split at the top
  const egg = ell(ax - 0.185 + 0.05 * sstep(0.0, 0.45, y), y - cy, z + 0.01, rx, ry, 0.585);
  return smax(egg, 0.006 - ax - 0.25 * sstep(0.12, -0.12, y), 0.035);
}

/** The cerebrum without its folds: the two hemispheres, the temporal lobes with the lateral fissure above them, a
 *  rounded base. */
function cerebrum(x: number, y: number, z: number) {
  const ax = Math.abs(x);
  let d = hemisphere(ax, y, z);
  // the temporal lobes, below and forward of the hemispheres' middle, wide enough that the outline from the front is
  // widest in its lower third
  d = smin(d, ell(ax - 0.31, y + 0.17, z - 0.02, 0.15, 0.14, 0.27), 0.07);
  // the lateral fissure: a groove from the temporal pole back and up, over the temporal lobe
  d = smax(d, -capsule(ax, y, z, 0.47, -0.08, 0.25, 0.47, 0.02, -0.18, 0.014), 0.016);
  // a rounded base under the frontal and temporal lobes, rising toward the sides so the lower corners round off
  d = smax(d, -0.33 + 0.55 * ax * ax - y + 0.035 * sstep(-0.05, -0.5, z), 0.09);
  return d;
}

/** The cerebellum tucked under the occipital lobes, its folia as fine horizontal ridges; and a short brainstem, tucked
 *  back under it. */
function hindbrain(x: number, y: number, z: number) {
  let c = ell(x, y + 0.28, z + 0.33, 0.31, 0.16, 0.2);
  c += 0.004 * Math.sin(y * 150 + 0.8 * Math.sin(x * 9));
  const s = capsule(x, y, z, 0, -0.24, -0.13, 0, -0.44, -0.16, 0.062);
  return smin(c, s, 0.05);
}

/** The shape before its folds (cheap; the sampler tests this first). */
export function base(x: number, y: number, z: number): number {
  return smin(cerebrum(x, y, z), hindbrain(x, y, z), 0.04);
}

const FOLD = { amp: 0.055, freq: 8.5, width: 0.14, amp2: 0.018, freq2: 19, width2: 0.16 };
/** The folds: narrow cracks along the zero set of the noise (sulci), deep enough that their walls hold much of the
 *  surface, the cerebrum between them left round (gyri). */
function folds(x: number, y: number, z: number) {
  const n = noise3(x * FOLD.freq + 11.3, y * FOLD.freq * 1.15 + 3.1, z * FOLD.freq - 7.7) / FOLD.width;
  const n2 = noise3(x * FOLD.freq2 - 5.2, y * FOLD.freq2 + 9.4, z * FOLD.freq2 + 2.6) / FOLD.width2;
  return FOLD.amp * Math.exp(-n * n) + FOLD.amp2 * Math.exp(-n2 * n2);
}

/** The whole field: negative inside. */
export function field(x: number, y: number, z: number): number {
  const cb = cerebrum(x, y, z);
  // folds on the cerebrum's outer surface: off on the medial faces (they keep a few) and where it meets the hindbrain
  const ax = Math.abs(x);
  const outer = 0.35 + 0.65 * sstep(0.02, 0.08, ax);
  const onCerebrum = sat(sstep(-0.3, -0.2, y) + sstep(-0.2, 0.0, z) * (1 - sstep(-0.3, -0.2, y)));
  const folded = cb + folds(x, y, z) * onCerebrum * outer;
  return smin(folded, hindbrain(x, y, z), 0.04);
}

// ── sampling ────────────────────────────────────────────────────────────────────────────────────────────────────
const BOX = { x0: -0.58, x1: 0.58, y0: -0.66, y1: 0.48, z0: -0.66, z1: 0.66 };
const H = 0.0015;
function gradient(x: number, y: number, z: number, out: Float64Array) {
  // tetrahedral differences: four evaluations
  const a = field(x + H, y - H, z - H), b = field(x - H, y - H, z + H), c = field(x - H, y + H, z - H), d = field(x + H, y + H, z + H);
  const k = 1 / (4 * H);
  out[0] = (a - b - c + d) * k; out[1] = (-a - b + c + d) * k; out[2] = (-a + b - c + d) * k;
}

export interface SurfacePool {
  /** Points on the surface (x, y, z), area-weighted, centered and scaled to the longest half-extent 0.62. */
  pos: Float32Array;
  /** Their outward unit normals. */
  nrm: Float32Array;
  count: number;
  /** The scale and center applied to the field's units. */
  scale: number;
  center: [number, number, number];
}

let pool: SurfacePool | null = null;
/** Takes a pool made elsewhere by this same code (prepare.ts: the module worker's), so surfacePool() returns it. */
export function primePool(p: SurfacePool) { pool ??= p; }
export const hasPool = () => !!pool;
export const POOL_SIZE = 90_000;
/** The share of the medial faces' samples kept. */
const MEDIAL = 0.45;

/** The shared surface sample: points spread evenly by area over the field's zero level (uniform in a thin band round
 *  it, then pulled onto it by Newton steps), made once per page. Each brain draws its own subset by its seed. */
export function surfacePool(): SurfacePool {
  if (pool) return pool;
  const r = rng(seedOf('brain-surface'));
  const n = POOL_SIZE, band = 0.012, reach = band * 6 + FOLD.amp + FOLD.amp2;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  const g = new Float64Array(3);
  let k = 0, guard = 0;
  while (k < n && guard++ < n * 400) {
    let x = r.range(BOX.x0, BOX.x1), y = r.range(BOX.y0, BOX.y1), z = r.range(BOX.z0, BOX.z1);
    if (Math.abs(base(x, y, z)) > reach) continue;
    let d = field(x, y, z);
    if (Math.abs(d) > band * 6) continue;
    // the band in true distance (the field's value over its slope), so steep fold walls are sampled by their area
    gradient(x, y, z, g);
    const g0 = Math.hypot(g[0]!, g[1]!, g[2]!);
    if (g0 < 1e-7 || Math.abs(d) / g0 > band) continue;
    // Newton steps onto the zero level (one is usually enough); the normal is the last step's gradient
    let ok = false;
    for (let s = 0; s < 3; s++) {
      if (s > 0) gradient(x, y, z, g);
      const gg = g[0]! * g[0]! + g[1]! * g[1]! + g[2]! * g[2]!;
      if (gg < 1e-14) break;
      const f = d / gg;
      x -= g[0]! * f; y -= g[1]! * f; z -= g[2]! * f;
      d = field(x, y, z);
      if (Math.abs(d) / Math.sqrt(gg) < 0.002) { ok = true; break; }
    }
    if (!ok) continue;
    // the medial faces (flat, facing the midline) keep fewer of their points: a sheet down the middle, not a wall
    if (Math.abs(x) < 0.03 && Math.abs(g[0]!) > 0.8 * Math.hypot(g[0]!, g[1]!, g[2]!) && r.next() > MEDIAL) continue;
    const gl = Math.hypot(g[0]!, g[1]!, g[2]!) || 1;
    // the cerebellum and the stem twice as dense as the rest (in Living Brain's mesh their fine folds hold far more
    // surface than a smooth field gives them, so they read as solid as the cerebrum)
    const copies = y < -0.2 && z < -0.05 && hindbrain(x, y, z) < cerebrum(x, y, z) ? 2 : 1;
    for (let c = 0; c < copies && k < n; c++) {
      P[k * 3] = x; P[k * 3 + 1] = y; P[k * 3 + 2] = z;
      N[k * 3] = g[0]! / gl; N[k * 3 + 1] = g[1]! / gl; N[k * 3 + 2] = g[2]! / gl;
      k++;
    }
  }
  // center the bounding box and scale its longest half-extent to 0.62, as Living Brain fits its mesh
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < k; i++) for (let j = 0; j < 3; j++) { const v = P[i * 3 + j]!; if (v < lo[j]!) lo[j] = v; if (v > hi[j]!) hi[j] = v; }
  const center: [number, number, number] = [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2];
  const half = Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) / 2;
  const scale = 0.62 / half;
  for (let i = 0; i < k; i++) for (let j = 0; j < 3; j++) P[i * 3 + j] = (P[i * 3 + j]! - center[j]!) * scale;
  pool = { pos: k === n ? P : P.slice(0, k * 3), nrm: k === n ? N : N.slice(0, k * 3), count: k, scale, center };
  return pool;
}

/** A brain's particles (Living Brain's body, 1.3a): `shell` on the surface pushed off it by up to 0.006 along the
 *  normal, the rest inside, pushed in by 0.22 r1 r2 so they crowd under the surface, a share of those deep round the
 *  core instead (the deep structures, where the hemispheres meet: the core lights them, as Living Brain's anatomical
 *  mesh gives its core particles all round it); each with its sprite size, brightness, twinkle phase, color mix (top
 *  #5B8DFF to bottom #9B4DFF) and the start of its flight home. */
export interface BrainPoints {
  count: number;
  shell: number;
  /** Home positions. */
  pos: Float32Array;
  /** Where each starts its formation: a random direction at 1.5 to 2.6. */
  start: Float32Array;
  size: Float32Array;
  bright: Float32Array;
  phase: Float32Array;
  /** 0 at the top color, 1 at the bottom's. */
  mix: Float32Array;
}

const points = new Map<string, BrainPoints>();
const pointsKey = (seed: number, count: number, shellShare: number) => `${seed}:${count}:${shellShare}`;
/** Takes a brain's particles made elsewhere by this same code (prepare.ts), so brainPoints() returns them. */
export function primePoints(seed: number, count: number, shellShare: number, p: BrainPoints) { const k = pointsKey(seed, count, shellShare); if (!points.has(k)) points.set(k, p); }
export const hasPoints = (seed: number, count: number, shellShare = 0.7) => points.has(pointsKey(seed, count, shellShare));
/** The shell's clumps: points per clump (one plus an exponential of this mean, at most max) and their radius. */
export const CLUMP = { mean: 3.2, max: 10, radius: 0.02 };
/** The inside's share placed deep round the core, the radius they reach (the pool's units), how they thin outward (a
 *  radius of radius x u^falloff), and their brightness: few, and spread wide, so the core's light falls on a sparse
 *  field round it rather than a bright swarm. */
export const DEEP = { share: 0.06, radius: 0.42, falloff: 0.8, bright: [0.65, 0.45] as const };

/** The particles of one brain, by its seed (the same seed gives the same cloud on every load and machine). */
export function brainPoints(seed: number, count = 60_000, shellShare = 0.7): BrainPoints {
  const key = pointsKey(seed, count, shellShare);
  const hit = points.get(key);
  if (hit) return hit;
  const S = surfacePool(), r = rng(seed);
  const shell = Math.round(count * shellShare);
  const pos = new Float32Array(count * 3), start = new Float32Array(count * 3);
  const size = new Float32Array(count), bright = new Float32Array(count), phase = new Float32Array(count), mix = new Float32Array(count);
  const pick = subset(r, S.count, Math.min(S.count, count));
  // the shell in small clumps (one to eight points within 0.014 of a surface sample, in its tangent plane): the
  // clustered speckle with dark gaps between that Living Brain's folded anatomical mesh gives its cloud
  let left = 0, cx = 0, cy = 0, cz = 0, nx = 0, ny = 0, nz = 0, t1x = 0, t1y = 0, t1z = 0, t2x = 0, t2y = 0, t2z = 0, next = 0;
  for (let i = 0; i < count; i++) {
    const inShell = i < shell;
    if (!inShell || left <= 0) {
      const j = pick[next++ % pick.length]!;
      cx = S.pos[j * 3]!; cy = S.pos[j * 3 + 1]!; cz = S.pos[j * 3 + 2]!;
      nx = S.nrm[j * 3]!; ny = S.nrm[j * 3 + 1]!; nz = S.nrm[j * 3 + 2]!;
      // a tangent basis
      const ax = Math.abs(ny) < 0.9 ? 0 : 1, ay = Math.abs(ny) < 0.9 ? 1 : 0;
      t1x = ny * 0 - nz * ay; t1y = nz * ax - nx * 0; t1z = nx * ay - ny * ax;
      const l1 = Math.hypot(t1x, t1y, t1z) || 1; t1x /= l1; t1y /= l1; t1z /= l1;
      t2x = ny * t1z - nz * t1y; t2y = nz * t1x - nx * t1z; t2z = nx * t1y - ny * t1x;
      left = inShell ? Math.min(CLUMP.max, 1 + Math.floor(-Math.log(1 - r.next()) * CLUMP.mean)) : 1;
    }
    left--;
    const rho = inShell ? CLUMP.radius * Math.sqrt(r.next()) : 0, ang = r.next() * Math.PI * 2;
    const ox = (t1x * Math.cos(ang) + t2x * Math.sin(ang)) * rho, oy = (t1y * Math.cos(ang) + t2y * Math.sin(ang)) * rho, oz = (t1z * Math.cos(ang) + t2z * Math.sin(ang)) * rho;
    const off = inShell ? (r.next() * 2 - 1) * 0.006 : -0.22 * r.next() * r.next();
    let x = cx + ox + nx * off, y = cy + oy + ny * off, z = cz + oz + nz * off;
    let deep = false;
    if (!inShell && r.next() < DEEP.share) {
      // deep round the core, thinning outward (no edge to the cluster), kept inside the shape (back in the field's
      // units to test it); drawn as the shell's are, so the core lights them as it lit the fissure's faces
      for (let tries = 0; tries < 8 && !deep; tries++) {
        let a = 0, b = 0, c = 0, q = 0;
        do { a = r.next() * 2 - 1; b = r.next() * 2 - 1; c = r.next() * 2 - 1; q = a * a + b * b + c * c; } while (q > 1 || q === 0);
        const k = (DEEP.radius * Math.pow(r.next(), DEEP.falloff)) / Math.sqrt(q);
        const px = a * k, py = b * k, pz = c * k;
        if (field(px / S.scale + S.center[0], py / S.scale + S.center[1], pz / S.scale + S.center[2]) < -0.015) { x = px; y = py; z = pz; deep = true; }
      }
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    size[i] = inShell || deep ? 0.012 + 0.014 * r.next() : 0.008 + 0.009 * r.next();
    bright[i] = inShell ? 0.65 + 0.45 * r.next() : deep ? DEEP.bright[0] + DEEP.bright[1] * r.next() : 0.22 + 0.28 * r.next();
    phase[i] = r.next() * Math.PI * 2;
    mix[i] = sat(0.5 - y / 1.1 + (r.next() - 0.5) * 0.22);
    // a random direction (uniform in the ball, then put on the sphere) at radius 1.5 to 2.6
    let a = 0, b = 0, c = 0, q = 0;
    do { a = r.next() * 2 - 1; b = r.next() * 2 - 1; c = r.next() * 2 - 1; q = a * a + b * b + c * c; } while (q > 1 || q === 0);
    const w = (1.5 + 1.1 * r.next()) / Math.sqrt(q);
    start[i * 3] = a * w; start[i * 3 + 1] = b * w; start[i * 3 + 2] = c * w;
  }
  // the shell and the inside interleaved evenly (made in that order, so the points are the same), so any first n of
  // them is the cloud at fewer particles: a member brain draws its first 24,000 (mount.ts, a draw range)
  const order = new Uint32Array(count);
  for (let i = 0, si = 0, vi = shell; i < count; i++) {
    const wantShell = si < shell && (vi >= count || Math.floor(((i + 1) * shell) / count) > si);
    order[i] = wantShell ? si++ : vi++;
  }
  const re = (a: Float32Array, k: number) => { const b = new Float32Array(a.length); for (let i = 0; i < count; i++) for (let j = 0; j < k; j++) b[i * k + j] = a[order[i]! * k + j]!; return b; };
  const out: BrainPoints = { count, shell, pos: re(pos, 3), start: re(start, 3), size: re(size, 1), bright: re(bright, 1), phase: re(phase, 1), mix: re(mix, 1) };
  points.set(key, out);
  return out;
}

/** k distinct indices of n, in a seeded order (a partial Fisher-Yates). */
function subset(r: Rng, n: number, k: number): Uint32Array {
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  for (let i = 0; i < k; i++) { const j = i + Math.floor(r.next() * (n - i)); const t = idx[i]!; idx[i] = idx[j]!; idx[j] = t; }
  return idx.subarray(0, k);
}

/** The page dots' surface: none below this height (the stem, the cerebellum's and the base's undersides) nor nearer the
 *  midline than this (the medial faces), in the pool's units. */
export const PAGE_FLOOR = -0.3;
export const PAGE_MEDIAL = 0.03;

/** Where a brain's pages sit (Living Brain's placement, 1.3c): 4,000 shell samples in a seeded order, taken greedily at
 *  a minimum spacing of 0.1, each pass starting again at 0.72 of the last spacing (8 passes at most) until every page
 *  has a place, each lifted 0.018 outward from the center. Positions in page order (the heaviest page takes the first).
 *  Only the outer surface takes pages, as Living Brain keeps its busiest node on it: none on the stem or under the
 *  cerebellum and the base (y under -0.30), none on the medial faces in the fissure (|x| under 0.03). */
const spotsMade = new Map<string, { pos: Float32Array; nrm: Float32Array }>();
/** Takes a brain's page places made elsewhere by this same code (prepare.ts), so pageSpots() returns them. */
export function primeSpots(seed: number, n: number, s: { pos: Float32Array; nrm: Float32Array }) { const k = `${seed}:${n}`; if (!spotsMade.has(k)) spotsMade.set(k, s); }
export const hasSpots = (seed: number, n: number) => spotsMade.has(`${seed}:${n}`);
export function pageSpots(seed: number, n: number): { pos: Float32Array; nrm: Float32Array } {
  const hit = spotsMade.get(`${seed}:${n}`);
  if (hit) return hit;
  const made = placeSpots(seed, n);
  spotsMade.set(`${seed}:${n}`, made);
  return made;
}
function placeSpots(seed: number, n: number): { pos: Float32Array; nrm: Float32Array } {
  const S = surfacePool(), r = rng(seed ^ 0x5bd1e995);
  const cand = subset(r, S.count, Math.min(4000, S.count));
  const cx = new Float32Array(cand.length * 3);
  cand.forEach((j, c) => {
    const off = (r.next() * 2 - 1) * 0.006;
    for (let a = 0; a < 3; a++) cx[c * 3 + a] = S.pos[j * 3 + a]! + S.nrm[j * 3 + a]! * off;
  });
  const outer: number[] = [];
  for (let c = 0; c < cand.length; c++) if (cx[c * 3 + 1]! >= PAGE_FLOOR && Math.abs(cx[c * 3]!) >= PAGE_MEDIAL) outer.push(c);
  let taken: number[] = [];
  let spacing = 0.1;
  for (let pass = 0; pass < 8 && taken.length < n; pass++, spacing *= 0.72) {
    taken = [];
    const s2 = spacing * spacing;
    for (const c of outer) {
      if (taken.length >= n) break;
      const x = cx[c * 3]!, y = cx[c * 3 + 1]!, z = cx[c * 3 + 2]!;
      let ok = true;
      for (const t of taken) {
        const dx = cx[t * 3]! - x, dy = cx[t * 3 + 1]! - y, dz = cx[t * 3 + 2]! - z;
        if (dx * dx + dy * dy + dz * dz < s2) { ok = false; break; }
      }
      if (ok) taken.push(c);
    }
  }
  for (const c of [...outer, ...cand.keys()]) { if (taken.length >= n) break; if (!taken.includes(c)) taken.push(c); }
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = taken[i]!, j = cand[c]!;
    const x = cx[c * 3]!, y = cx[c * 3 + 1]!, z = cx[c * 3 + 2]!, l = Math.hypot(x, y, z) || 1;
    pos[i * 3] = x + (x / l) * 0.018; pos[i * 3 + 1] = y + (y / l) * 0.018; pos[i * 3 + 2] = z + (z / l) * 0.018;
    for (let a = 0; a < 3; a++) nrm[i * 3 + a] = S.nrm[j * 3 + a]!;
  }
  return { pos, nrm };
}
