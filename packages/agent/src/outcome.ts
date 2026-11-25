import {
  ARM_IDS,
  MICRO_USD_PER_CENT,
  OUTCOME_SCHEMA,
  boundedFuturePnlMicroUsd,
  energyMicroUsd,
  fleetRoot,
  leafHash,
  mul,
  outcomeShapeErrors,
  splitKw,
  sum,
  type Arm,
  type FileRef,
  type Manifest,
  type Outcome,
  type OutcomeArm,
} from "@gatelock/core";
import type { Hex } from "viem";

// Outcomes value each arm on the plan's own basis, so nothing is counted twice:
// the physical leg once, as a day-ahead schedule at the settlement point's
// day-ahead SPP (the price the scenarios' node_cents carry); the hedge leg on
// the clipped mean of the hour's four first-published real-time 15-minute hub
// SPPs (the price hub_sum4 carries). A day-ahead mark of the hedge is reported
// beside the result and never added to it.

export type Stage = 1 | 2 | 3;
export const STAGES: readonly Stage[] = [1, 2, 3];

export const STAGE_NAMES: Record<Stage, string> = {
  1: "day-ahead settled",
  2: "real-time provisional",
  3: "real-time settled",
};

export type Quarter = [number, number, number, number];

/** The prices and files one leaf's outcome uses. */
export interface LeafPrices {
  daNodeCents: number[];
  /** null at stage 1; otherwise one entry per hour, null for an hour without all four prices. */
  rtHubCents: (Quarter | null)[] | null;
  inputs: Outcome["inputs"];
}

export function parseStage(raw: string | undefined): Stage {
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3) return n;
  throw new Error(`--stage must be 1, 2 or 3, got ${raw ?? "nothing"}`);
}

/** The verifier's V10 recomputes exactly this, so the two must not drift. */
export function outcomeArm(m: Manifest, prices: Outcome["prices"], arm: Arm): OutcomeArm {
  const energy = sum(arm.kw.map((kw, h) => energyMicroUsd(kw, at(prices.da_node_cents, h, "day-ahead price"))));
  const wear = energyMicroUsd(sum(arm.kw.map((kw) => splitKw(kw).dischargeKwh)), m.assumptions.wear_cents_per_mwh);
  const fees = mul(sum(arm.contracts.map(Math.abs)), m.instrument.fee_cents_per_contract, MICRO_USD_PER_CENT);
  let hedge: number | null = 0;
  for (let h = 0; h < arm.contracts.length && hedge !== null; h++) {
    const q = arm.contracts[h] ?? 0;
    if (q === 0) continue;
    const rt = prices.rt_hub_cents?.[h];
    hedge = rt ? hedge + boundedFuturePnlMicroUsd(q, at(m.instrument.entry_cents, h, "entry"), rt, m.instrument.range_cents) : null;
  }
  return {
    energy_uusd: energy,
    wear_uusd: wear,
    hedge_uusd: hedge,
    fees_uusd: fees,
    net_uusd: hedge === null ? null : sum([energy, -wear, hedge, -fees]),
  };
}

/**
 * The hedge marked at the day-ahead hub price instead of its real-time settlement, in micro-USD.
 * Shown beside an outcome for context; it is not a settlement and is never added to net_uusd.
 */
export function hedgeDayAheadMarkUusd(m: Manifest, arm: Arm, hubDaCents: readonly number[]): number {
  let mark = 0;
  arm.contracts.forEach((q, h) => {
    if (q === 0) return;
    const p = at(hubDaCents, h, "hub day-ahead price");
    mark += boundedFuturePnlMicroUsd(q, at(m.instrument.entry_cents, h, "entry"), [p, p, p, p], m.instrument.range_cents);
  });
  return mark;
}

/** One leaf's gate-record.outcome.v1. */
export function buildOutcome(m: Manifest, recordRoot: Hex, stage: Stage, p: LeafPrices): Outcome {
  const hours = m.forecast.hub_da_cents.length;
  const who = m.battery.resource;
  if (p.daNodeCents.length !== hours) throw new Error(`${who}: ${p.daNodeCents.length} day-ahead prices for a ${hours}-hour day`);
  if (stage === 1 && p.rtHubCents !== null) throw new Error(`${who}: a day-ahead outcome carries no real-time prices`);
  if (stage !== 1 && (p.rtHubCents === null || p.rtHubCents.length !== hours)) {
    throw new Error(`${who}: stage ${stage} needs ${hours} hours of real-time hub prices`);
  }
  const prices: Outcome["prices"] = { da_node_cents: [...p.daNodeCents], rt_hub_cents: p.rtHubCents?.map((q) => (q ? [...q] : null)) ?? null };
  const arms = Object.fromEntries(
    ARM_IDS.map((id) => {
      const arm = m.arms[id];
      return [id, arm ? outcomeArm(m, prices, arm) : null];
    }),
  ) as Outcome["arms"];
  const doc: Outcome = {
    schema: OUTCOME_SCHEMA,
    stage,
    operating_day: m.operating_day,
    manifest_root: recordRoot,
    inputs: { ...p.inputs, files: [...p.inputs.files], live: [...p.inputs.live] },
    prices,
    arms,
  };
  const shape = outcomeShapeErrors(doc);
  if (shape.length > 0) throw new Error(`${who}: outcome does not match ${OUTCOME_SCHEMA}: ${shape.slice(0, 5).join("; ")}`);
  return doc;
}

export interface OutcomeLeaf {
  resource: string;
  leaf: Hex;
}

/**
 * Outcome leaves are hashed like the plan's (SHA-256 of 0x00 and the JCS form) and kept in the plan's
 * resource order, so outcome leaf i settles plan leaf i and one audit path shape serves both trees.
 */
export function outcomeTree(docs: readonly { resource: string; doc: Outcome }[]): { leaves: OutcomeLeaf[]; root: Hex } {
  for (let i = 1; i < docs.length; i++) {
    if (!((docs[i - 1]!.resource) < docs[i]!.resource)) throw new Error(`outcomes out of resource order at ${docs[i]!.resource}`);
  }
  const leaves = docs.map((d) => ({ resource: d.resource, leaf: leafHash(d.doc) }));
  return { leaves, root: fleetRoot(leaves) };
}

/** Release trail first, then payloads, each sorted by route and without repeats: the plan's citation order. */
export function citeFiles(trail: readonly FileRef[], payloads: readonly FileRef[]): FileRef[] {
  const byRoute = (a: FileRef, b: FileRef) => (a.route < b.route ? -1 : a.route > b.route ? 1 : 0);
  const seen = new Set<string>();
  return [...[...trail].sort(byRoute), ...[...payloads].sort(byRoute)].filter((f) => {
    const k = `${f.route} ${f.sha256}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export interface TimedPrice {
  /** Unix seconds the SCED run took effect. */
  unix: number;
  /** $/MWh at the point, or null when the run did not price it. */
  usdPerMwh: number | null;
  complete: boolean;
}

export const PROVISIONAL_RT_METHOD =
  "each 15-minute interval: the time-weighted mean of the SCED run prices in effect during it, a run in effect " +
  "from its timestamp to the next run's; only the operating day's own runs, weighted over the seconds they cover; " +
  "rounded to the nearest cent (halves up); an interval with no run, or a run that is incomplete or unpriced, is not priced";

/**
 * Provisional 15-minute prices from the operating day's SCED runs, grouped by hour. The first seconds of
 * the day, before its first run, are left out rather than priced from the previous day's last run.
 */
export function provisionalQuarters(runs: readonly TimedPrice[], dayStart: number, hours: number): (Quarter | null)[] {
  const end = dayStart + hours * 3600;
  const sorted = [...runs].filter((r) => r.unix < end).sort((a, b) => a.unix - b.unix);
  if (sorted.some((r) => r.unix < dayStart)) throw new Error("a SCED run before the operating day was offered");
  const intervals = Array.from({ length: hours * 4 }, (_, k): number | null => {
    const lo = dayStart + k * 900;
    const hi = lo + 900;
    let weight = 0;
    let acc = 0;
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i]!;
      const from = Math.max(r.unix, lo);
      const to = Math.min(sorted[i + 1]?.unix ?? end, hi);
      if (to <= from) continue;
      if (!r.complete || r.usdPerMwh === null) return null;
      weight += to - from;
      acc += (to - from) * r.usdPerMwh;
    }
    return weight === 0 ? null : Math.floor((acc / weight) * 100 + 0.5);
  });
  return quarters(intervals, hours);
}

/** Groups 15-minute values into hours; an hour missing any of its four is null. */
export function quarters(intervals: readonly (number | null)[], hours: number): (Quarter | null)[] {
  if (intervals.length !== hours * 4) throw new Error(`${intervals.length} intervals for a ${hours}-hour day`);
  return Array.from({ length: hours }, (_, h) => {
    const q = intervals.slice(4 * h, 4 * h + 4);
    return q.every((v): v is number => v !== null) ? (q as Quarter) : null;
  });
}

function at(xs: readonly number[], h: number, what: string): number {
  const v = xs[h];
  if (v === undefined) throw new Error(`no ${what} for hour ${h}`);
  return v;
}
