import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ARM_IDS,
  OUTCOME_INDEX_SCHEMA,
  OUTCOME_SCHEMA,
  leafHash,
  outcomeDocumentPath,
  outcomeRoot,
  type FleetIndex,
  type Manifest,
  type Outcome,
  type OutcomeIndex,
  type ScenarioMatrix,
} from "@gatelock/core";
import type { Address, Hex } from "viem";
import type { RecordFile } from "../src/verify.js";
import { outcomeArm } from "../src/verify.js";

// The record sealed for operating day 2026-11-26 (fixtures/od-20261126): its 316-leaf index, two of its
// leaves with their scenarios, and the receipts of the commits on BSC mainnet and testnet.
const SEALED = fileURLToPath(new URL("../../../fixtures/od-20261126/", import.meta.url));
const json = <T>(rel: string): T => JSON.parse(readFileSync(`${SEALED}${rel}`, "utf8")) as T;

export const sealedIndex = (): FleetIndex => json<FleetIndex>("manifest.json");
export const sealedLeaf = (resource: string): Manifest => json<Manifest>(`leaves/${resource}.json`);
export const sealedScenarios = (resource: string): ScenarioMatrix => json<ScenarioMatrix>(`leaves/${resource}.scenarios.json`);
export const sealedRecord = (network: "bsc-mainnet" | "bsc-testnet"): RecordFile & { committedAt: number; blockNumber: number; committer?: Address } =>
  json(`record.${network}.json`);

/** Deterministic test prices, cents per MWh; not market data. An evening peak, and one hub hour past the hedge's ceiling. */
export function testDaCents(point: string, hours = 24): number[] {
  const k = [...point].reduce((a, c) => a + c.charCodeAt(0), 0) % 7;
  return Array.from({ length: hours }, (_, h) => 1500 + 37 * h + 11 * k + (h >= 17 && h <= 20 ? 2400 : 0));
}

export function testRt15Cents(point: string, hours = 24): number[] {
  return testDaCents(point, hours).flatMap((p, h) => (h === 18 ? [p, 250_000, p + 3, -1200] : [p - 40, p + 15, p + 80, p - 5]));
}

/** A release price file (wattness.instrument.v1) for one point and day, every value graded published. */
export function instrumentFile(point: string, day: string, da: readonly number[], rt15: readonly number[] | null): string {
  const hours = da.length;
  const usd = (c: number) => c / 100;
  return JSON.stringify({
    schema: "wattness.instrument.v1",
    key: { settlement_point: point, operating_day: day },
    mode: "record",
    calendar: {
      hour_starts: Array.from({ length: hours }, (_, h) => `${day}T${String(h).padStart(2, "0")}:00:00-06:00`),
      interval_starts: Array.from({ length: hours * 4 }, (_, i) => `${day}T${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}:00-06:00`),
    },
    da: { final: true, hours: da.map((c) => ({ dam_spp: usd(c), grade: "published" })) },
    rt: {
      final: rt15 !== null,
      hours: da.map((_, h) => ({ settled: rt15 ? { value: usd(rt15.slice(4 * h, 4 * h + 4).reduce((a, b) => a + b, 0) / 4), grade: "published" } : { value: null, grade: "absent" } })),
      intervals: Array.from({ length: hours * 4 }, (_, i) => ({ rtspp: rt15 ? { value: usd(rt15[i]!), grade: "published" } : { value: null, grade: "absent" } })),
    },
  });
}

export const quartersOf = (rt15: readonly number[]): [number, number, number, number][] =>
  Array.from({ length: rt15.length / 4 }, (_, h) => rt15.slice(4 * h, 4 * h + 4) as [number, number, number, number]);

/** One leaf's gate-record.outcome.v1, each arm valued by V10's formula. */
export function outcomeDoc(m: Manifest, recordRoot: Hex, stage: 1 | 2 | 3, prices: Outcome["prices"], inputs?: Outcome["inputs"]): Outcome {
  const doc: Outcome = {
    schema: OUTCOME_SCHEMA,
    stage,
    operating_day: m.operating_day,
    manifest_root: recordRoot,
    inputs: inputs ?? { release_id: null, manifest_sha256: null, files: [], live: [] },
    prices,
    arms: { A: null, B: null, C: null },
  };
  doc.arms = Object.fromEntries(ARM_IDS.map((id) => [id, m.arms[id] ? outcomeArm(m, doc, m.arms[id]!) : null])) as Outcome["arms"];
  return doc;
}

/**
 * A stage's outcome index over every leaf of the plan. Batteries without a document here stand in with a
 * placeholder leaf: V10 checks one battery's document and its audit path, so the others need only be leaves.
 */
export function outcomeIndexFor(plan: FleetIndex, stage: 1 | 2 | 3, docs: ReadonlyMap<string, Outcome>, extra: Partial<OutcomeIndex> = {}): OutcomeIndex {
  const leaves = plan.leaves.map((l) => {
    const doc = docs.get(l.resource);
    return { resource: l.resource, leaf: doc ? leafHash(doc) : leafHash({ placeholder: l.resource, stage }), plan_leaf: l.leaf, document: outcomeDocumentPath(l.resource) };
  });
  return {
    schema: OUTCOME_INDEX_SCHEMA,
    operating_day: plan.operating_day,
    stage,
    stage_name: ({ 1: "day-ahead settled", 2: "real-time provisional", 3: "real-time settled" } as const)[stage],
    record_root: plan.root,
    root: outcomeRoot(leaves),
    leaf_count: leaves.length,
    release_id: null,
    manifest_sha256: null,
    live_day: null,
    physical_basis: "the schedule's energy at the settlement point's day-ahead SPP, the plan's own basis",
    hedge_settlement: null,
    rt_rule: null,
    leaves,
    ...extra,
  };
}
