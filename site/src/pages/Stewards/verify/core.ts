// The stewards' checks, written apart from packages/core so the page is a
// second implementation rather than the sealer's code run again. It must
// agree with packages/core/src/jcs.ts and hash.ts bit for bit;
// test/stewards.test.mjs holds it to the sealed leaves.
//
// No imports: Node runs this file directly in that test.

export type Hex = `0x${string}`;

// ---------------------------------------------------------------- RFC 8785

export class DocumentError extends Error {
  override name = "DocumentError";
}

/**
 * Sealed documents are JSON trees whose numbers are safe integers, so the
 * RFC 8785 number rule reduces to the integer's decimal form.
 */
export function assertHashable(value: unknown, path = "$"): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new DocumentError(`${path}: ${value} is not a safe integer`);
    if (Object.is(value, -0)) throw new DocumentError(`${path}: negative zero`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertHashable(v, `${path}[${i}]`));
    return;
  }
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new DocumentError(`${path}: not a plain object`);
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) throw new DocumentError(`${path}.${k}: undefined`);
      assertHashable(v, `${path}.${k}`);
    }
    return;
  }
  throw new DocumentError(`${path}: ${typeof value} is not JSON`);
}

function serialize(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  // RFC 8785 section 3.2.2.2 defines string escaping as ECMAScript's JSON.stringify.
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(serialize).join(",")}]`;
  const o = v as Record<string, unknown>;
  // Default sort compares UTF-16 code units, the order RFC 8785 section 3.2.3 asks for.
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${serialize(o[k])}`).join(",")}}`;
}

export function canonicalJson(doc: unknown): string {
  assertHashable(doc);
  return serialize(doc);
}

// ---------------------------------------------------------------- SHA-256 and RFC 6962

const LEAF_PREFIX = 0x00;
const NODE_PREFIX = 0x01;

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("WebCrypto is unavailable here (it needs a secure origin: https or localhost)");
  return s;
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().digest("SHA-256", data as BufferSource));
}

export function toHex(bytes: Uint8Array): Hex {
  let s = "0x";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s as Hex;
}

export function fromHex(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || /[^0-9a-f]/i.test(h)) throw new Error(`${hex} is not hex`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function prefixed(prefix: number, ...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(1 + parts.reduce((n, p) => n + p.length, 0));
  out[0] = prefix;
  let at = 1;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export interface LeafComputation {
  canonical: string;
  bytes: number;
  leaf: Hex;
}

/** SHA-256(0x00 || JCS(doc)): the RFC 6962 leaf hash of a canonical document. */
export async function computeLeaf(doc: unknown): Promise<LeafComputation> {
  const canonical = canonicalJson(doc);
  const utf8 = new TextEncoder().encode(canonical);
  return { canonical, bytes: utf8.length, leaf: toHex(await sha256(prefixed(LEAF_PREFIX, utf8))) };
}

export async function leafHash(doc: unknown): Promise<Hex> {
  return (await computeLeaf(doc)).leaf;
}

async function nodeHash(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  return sha256(prefixed(NODE_PREFIX, left, right));
}

// Largest power of two strictly less than n (n >= 2).
function splitPoint(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

function leafBytes(leaf: string): Uint8Array {
  const b = fromHex(leaf);
  if (b.length !== 32) throw new Error(`leaf ${leaf} is not 32 bytes`);
  return b;
}

async function mth(leaves: readonly Uint8Array[]): Promise<Uint8Array> {
  if (leaves.length === 1) return leaves[0] as Uint8Array;
  const k = splitPoint(leaves.length);
  const [l, r] = await Promise.all([mth(leaves.slice(0, k)), mth(leaves.slice(k))]);
  return nodeHash(l, r);
}

/** RFC 6962 Merkle tree hash over leaf hashes. */
export async function merkleRoot(leaves: readonly string[]): Promise<Hex> {
  if (leaves.length === 0) return toHex(await sha256(new Uint8Array()));
  return toHex(await mth(leaves.map(leafBytes)));
}

/** RFC 6962 audit path for leaf m, from the leaf upward. */
export async function inclusionProof(leaves: readonly string[], m: number): Promise<Hex[]> {
  if (!Number.isInteger(m) || m < 0 || m >= leaves.length) throw new RangeError(`leaf index ${m} out of range`);
  const path: Uint8Array[] = [];
  const walk = async (d: readonly Uint8Array[], i: number): Promise<void> => {
    if (d.length === 1) return;
    const k = splitPoint(d.length);
    if (i < k) {
      await walk(d.slice(0, k), i);
      path.push(await mth(d.slice(k)));
    } else {
      await walk(d.slice(k), i - k);
      path.push(await mth(d.slice(0, k)));
    }
  };
  await walk(leaves.map(leafBytes), m);
  return path.map(toHex);
}

export interface ProofStep {
  /** Which side the sibling sits on at this level. */
  side: "left" | "right";
  sibling: Hex;
  result: Hex;
}

/** Walks an audit path to the root (RFC 9162, section 2.1.3.2), keeping each step. */
export async function walkProof(leaf: string, m: number, size: number, proof: readonly string[]): Promise<{ root: Hex; steps: ProofStep[] }> {
  if (!Number.isInteger(m) || m < 0 || m >= size) throw new RangeError(`leaf index ${m} out of range`);
  let fn = m;
  let sn = size - 1;
  let r = leafBytes(leaf);
  const steps: ProofStep[] = [];
  for (const p of proof) {
    if (sn === 0) throw new Error("proof is too long");
    const pb = leafBytes(p);
    if ((fn & 1) === 1 || fn === sn) {
      r = await nodeHash(pb, r);
      steps.push({ side: "left", sibling: p as Hex, result: toHex(r) });
      while ((fn & 1) === 0 && fn !== 0) {
        fn >>= 1;
        sn >>= 1;
      }
    } else {
      r = await nodeHash(r, pb);
      steps.push({ side: "right", sibling: p as Hex, result: toHex(r) });
    }
    fn >>= 1;
    sn >>= 1;
  }
  if (sn !== 0) throw new Error("proof is too short");
  return { root: toHex(r), steps };
}

// ---------------------------------------------------------------- the published pack

export interface StewardsPack {
  schema: "grand-prix.stewards-pack.v1";
  operatingDay: string;
  root: Hex;
  leafCount: number;
  resources: string[];
  filesPath: string[];
  template: Record<string, unknown>;
  routes: [string, string][];
}

export interface StewardsLeaf {
  schema: "grand-prix.stewards-leaf.v1";
  resource: string;
  index: number;
  leaf: Hex;
  overlay: Record<string, unknown>;
  /** A bitmap over pack.routes (base64), or the list itself when it is not in table order. */
  files: string | [string, string][];
}

const isPlain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

function merge(template: unknown, overlay: unknown): unknown {
  if (overlay === undefined) return structuredClone(template);
  if (!isPlain(template) || !isPlain(overlay)) return structuredClone(overlay);
  const out = structuredClone(template);
  for (const [k, v] of Object.entries(overlay)) out[k] = merge(out[k], v);
  return out;
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The manifest exactly as it was hashed: the shared values, the battery's own, its input list. */
export function rebuildManifest(pack: StewardsPack, leaf: StewardsLeaf): Record<string, unknown> {
  const doc = merge(pack.template, leaf.overlay) as Record<string, unknown>;
  let files: { route: string; sha256: string }[];
  if (typeof leaf.files === "string") {
    const bits = decodeBase64(leaf.files);
    files = [];
    for (let p = 0; p < pack.routes.length; p++) {
      if ((bits[p >> 3] ?? 0) & (0x80 >> (p & 7))) {
        const [route, sha256] = pack.routes[p] as [string, string];
        files.push({ route, sha256 });
      }
    }
  } else {
    files = leaf.files.map(([route, sha256]) => ({ route, sha256 }));
  }
  const parentPath = pack.filesPath.slice(0, -1);
  const last = pack.filesPath[pack.filesPath.length - 1] as string;
  const parent = parentPath.reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, doc);
  parent[last] = files;
  return doc;
}

// ---------------------------------------------------------------- differences

export interface Difference {
  path: string;
  sealed: unknown;
  checked: unknown;
}

/** Every leaf value that differs between two documents, by path. */
export function diff(a: unknown, b: unknown, path = "$", out: Difference[] = []): Difference[] {
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) diff(a[i], b[i], `${path}[${i}]`, out);
    return out;
  }
  if (isPlain(a) && isPlain(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of [...keys].sort()) diff(a[k], b[k], path === "$" ? k : `${path}.${k}`, out);
    return out;
  }
  if (a !== b) out.push({ path, sealed: a, checked: b });
  return out;
}

// ---------------------------------------------------------------- battery limits

const PPM = 1_000_000;

function checked(n: number, what: string): number {
  if (!Number.isSafeInteger(n)) throw new Error(`${what} is not a safe integer: ${n}`);
  return n;
}
const mul = (a: number, b: number) => checked(checked(a, "factor") * checked(b, "factor"), "product");

export interface LimitArm {
  method: string;
  kw: number[];
  soc_ukwh: number[];
  contracts: number[];
}

export interface LimitManifest {
  battery: { max_power_kw: number; energy_kwh: number };
  assumptions: Record<string, string | number>;
  instrument: { size_kwh: number };
  arms: Record<string, LimitArm | undefined>;
}

export interface ArmLimits {
  arm: string;
  hours: number;
  /** Largest |kW| in any hour, against the battery's rating. */
  peakKw: number;
  /** SOC extremes over the day (micro-kWh), and the day's closing SOC. */
  socMin: number;
  socMax: number;
  socClose: number;
  /** Hours whose stated SOC differs from the energy balance. */
  balanceMismatches: number[];
  dischargedKwh: number;
  peakContracts: number;
  problems: string[];
}

export interface LimitsReport {
  maxKw: number;
  energyKwh: number;
  socLo: number;
  socHi: number;
  socOpen: number;
  socEndMin: number;
  cycleCapKwh: number;
  maxContracts: number;
  arms: ArmLimits[];
  problems: string[];
}

const num = (v: string | number | undefined, name: string): number => {
  if (typeof v !== "number") throw new Error(`assumption ${name} is missing`);
  return v;
};

/**
 * Battery limits, hour by hour, for every solved arm: power, the SOC path
 * against the energy balance and its bounds, the closing SOC, the daily
 * discharge cap, and the hedge's contract limits. Integer arithmetic in the
 * manifest's own units, as packages/verifier does it.
 */
export function checkLimits(m: LimitManifest, hours: number): LimitsReport {
  const maxKw = m.battery.max_power_kw;
  const kwh = m.battery.energy_kwh;
  const a = m.assumptions;
  const socLo = mul(kwh, num(a.soc_min_ppm, "soc_min_ppm"));
  const socHi = mul(kwh, num(a.soc_max_ppm, "soc_max_ppm"));
  const socOpen = mul(kwh, num(a.soc_open_ppm, "soc_open_ppm"));
  const socEndMin = mul(kwh, num(a.soc_end_min_ppm, "soc_end_min_ppm"));
  const cycleCapKwh = mul(kwh, num(a.max_cycles_ppm, "max_cycles_ppm")) / PPM;
  const rte = num(a.round_trip_ppm, "round_trip_ppm");
  const maxContracts = num(a.max_contracts_per_hour, "max_contracts_per_hour");
  const size = m.instrument.size_kwh;
  const problems: string[] = [];
  if (!(num(a.soc_min_ppm, "") <= num(a.soc_open_ppm, "") && num(a.soc_open_ppm, "") <= num(a.soc_max_ppm, "") && num(a.soc_max_ppm, "") <= PPM)) {
    problems.push("SOC assumptions are not ordered min <= open <= max <= 100%");
  }
  if (rte > PPM) problems.push("round-trip efficiency above 100%");

  const arms: ArmLimits[] = [];
  for (const id of ["A", "B", "C"]) {
    const arm = m.arms[id];
    if (!arm) continue;
    const ap: string[] = [];
    if (arm.kw.length !== hours) ap.push(`${arm.kw.length} hourly values, the day has ${hours} hours`);
    if (arm.soc_ukwh.length !== arm.kw.length) ap.push(`SOC path has ${arm.soc_ukwh.length} points for ${arm.kw.length} hours`);
    if (arm.contracts.length !== arm.kw.length) ap.push(`${arm.contracts.length} contract values for ${arm.kw.length} hours`);
    let soc = socOpen;
    let socMin = Infinity;
    let socMax = -Infinity;
    let peakKw = 0;
    let peakContracts = 0;
    let discharged = 0;
    const balanceMismatches: number[] = [];
    arm.kw.forEach((kw, h) => {
      checked(kw, `hour ${h} kW`);
      peakKw = Math.max(peakKw, Math.abs(kw));
      if (Math.abs(kw) > maxKw) ap.push(`hour ${h}: ${kw} kW exceeds ${maxKw} kW`);
      const charge = kw < 0 ? -kw : 0;
      const discharge = kw > 0 ? kw : 0;
      discharged += discharge;
      soc = checked(soc + mul(charge, rte) - mul(discharge, PPM), "SOC");
      if (arm.soc_ukwh[h] !== soc) {
        balanceMismatches.push(h);
        ap.push(`hour ${h}: stated SOC ${arm.soc_ukwh[h]} µkWh, the energy balance gives ${soc}`);
      }
      socMin = Math.min(socMin, soc);
      socMax = Math.max(socMax, soc);
      if (soc < socLo || soc > socHi) ap.push(`hour ${h}: SOC ${soc} µkWh outside ${socLo}..${socHi}`);
      const q = arm.contracts[h] ?? 0;
      peakContracts = Math.max(peakContracts, Math.abs(q));
      if (Math.abs(q) > maxContracts) ap.push(`hour ${h}: ${q} contracts exceeds ${maxContracts}`);
      if (a.hedge_cap === "schedule") {
        const covered = q >= 0 ? discharge : charge;
        if (mul(Math.abs(q), size) > covered) ap.push(`hour ${h}: ${q} contracts cover more than the ${covered} kWh scheduled`);
      }
    });
    if (soc < socEndMin) ap.push(`closing SOC ${soc} µkWh below ${socEndMin}`);
    if (discharged > cycleCapKwh) ap.push(`discharges ${discharged} kWh, the cap is ${cycleCapKwh} kWh`);
    arms.push({ arm: id, hours: arm.kw.length, peakKw, socMin, socMax, socClose: soc, balanceMismatches, dischargedKwh: discharged, peakContracts, problems: ap });
    problems.push(...ap.map((p) => `arm ${id}: ${p}`));
  }
  return { maxKw, energyKwh: kwh, socLo, socHi, socOpen, socEndMin, cycleCapKwh, maxContracts, arms, problems };
}
