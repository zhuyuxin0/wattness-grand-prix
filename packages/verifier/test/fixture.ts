import {
  assumedEntryCents,
  canonicalJson,
  fileSha256,
  gateTs,
  leafHash,
  MANIFEST_SCHEMA,
  merkleRoot,
  odFromIso,
  operatingDayEndTs,
  planScopeLabel,
  recordKey,
  scopeId,
  socAfter,
  splitKw,
  type Arm,
  type FileRef,
  type Manifest,
  type ScenarioMatrix,
} from "@gatelock/core";
import type { Address, Hex } from "viem";
import type { AnchorTx, ChainReader, OnChainOutcome, OnChainRecord } from "../src/chain.js";
import { armRisk, objectiveUusd } from "../src/evaluate.js";
import type { Fetcher } from "../src/sources.js";
import { armCollateralCents } from "../src/verify.js";

export const WALLET: Address = "0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8";
export const CONTRACT: Address = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
export const SITE = "https://example.test";
export const RELEASE_ID = "terminal-daily-20261124-1120";
export const COMMIT = "0123456789abcdef0123456789abcdef01234567";

const KW = 100_000;
const KWH = 206_438;
const enc = (s: string) => new TextEncoder().encode(s);

/** A small data site: one release (manifest, catalogs, payloads by route) and a live tier. */
export function fakeSite(payloads: Record<string, string>, live: Record<string, string>) {
  const files = new Map<string, Uint8Array>();
  const display = `/data/terminal-display/v1/releases/${RELEASE_ID}`;
  const buckets = new Map<string, { route: string; path: string; sha256: string }[]>();
  const routes: FileRef[] = [];
  for (const [route, body] of Object.entries(payloads)) {
    const sha256 = fileSha256(body);
    const path = `json/${fileSha256(route)}-${sha256}.json`;
    files.set(`${SITE}${display}/${path}`, enc(body));
    const b = fileSha256(route).slice(0, 2);
    buckets.set(b, [...(buckets.get(b) ?? []), { route, path, sha256 }]);
    routes.push({ route, sha256 });
  }
  const trail: FileRef[] = [];
  const catalogs = [...buckets].map(([bucket, entries]) => {
    const body = JSON.stringify({ bucket, files: entries });
    files.set(`${SITE}${display}/catalogs/${bucket}.json`, enc(body));
    trail.push({ route: `${display}/catalogs/${bucket}.json`, sha256: fileSha256(body) });
    return { bucket, path: `catalogs/${bucket}.json`, sha256: fileSha256(body) };
  });
  const manifestBody = JSON.stringify({ release: RELEASE_ID, catalogs });
  files.set(`${SITE}${display}/manifest.json`, enc(manifestBody));
  trail.unshift({ route: `${display}/manifest.json`, sha256: fileSha256(manifestBody) });

  const liveRefs: FileRef[] = [];
  for (const [path, body] of Object.entries(live)) {
    files.set(`${SITE}/live/v1/${path}`, enc(body));
    liveRefs.push({ route: path, sha256: fileSha256(body) });
  }
  const fetcher: Fetcher = async (url) => files.get(url) ?? null;
  return { routes, trail, liveRefs, manifestSha256: fileSha256(manifestBody), fetcher, files };
}

const HUB = Array.from({ length: 24 }, (_, h) => 2_400 + 150 * h - (h > 18 ? 1_200 : 0));
const NODE = HUB.map((p) => p + 100);

function schedule(): number[] {
  const kw = new Array<number>(24).fill(0);
  kw[2] = -40_000;
  kw[3] = -40_000;
  kw[17] = 34_000;
  kw[18] = 34_000;
  return kw;
}

function socPath(kw: number[], open: number, rte: number): number[] {
  let soc = open;
  return kw.map((k) => {
    const { chargeKwh, dischargeKwh } = splitKw(k);
    soc = socAfter(soc, chargeKwh, dischargeKwh, rte);
    return soc;
  });
}

export function scenarioMatrix(): ScenarioMatrix {
  const n = 10;
  return {
    basis_days: ["2026-11-23", "2026-11-24"],
    history_days: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"],
    node_cents: Array.from({ length: n }, (_, i) => NODE.map((p, h) => p + (i - 5) * 30 * (h % 3))),
    hub_sum4: Array.from({ length: n }, (_, i) => HUB.map((p, h) => Math.min(40_000, Math.max(0, 4 * p + (2 * i - 9) * 20 * ((h % 4) + 1))))),
  };
}

/** Fills each arm's collateral, expected value, CVaR and objective from the matrix, then selects by objective. */
export function settle(m: Manifest, matrix: ScenarioMatrix): Manifest {
  for (const arm of [m.arms.A, m.arms.B, m.arms.C]) {
    if (!arm) continue;
    const { expected, cvar } = armRisk(m, arm, matrix);
    arm.collateral_cents = armCollateralCents(m, arm);
    arm.expected_uusd = Number(expected);
    arm.cvar_uusd = Number(cvar);
    arm.objective_uusd = Number(objectiveUusd(expected, cvar, m.risk.lambda_ppm));
    arm.lp_objective_uusd = arm.objective_uusd + 1_234;
  }
  const a = m.arms.A as Arm;
  const b = m.arms.B as Arm;
  m.selected_arm = b.objective_uusd > a.objective_uusd ? "B" : "A";
  return m;
}

export function buildManifest(site: ReturnType<typeof fakeSite>, matrix: ScenarioMatrix): Manifest {
  const od = odFromIso("2026-11-26");
  const [battery, ...payloads] = site.routes as [FileRef, ...FileRef[]];
  const open = KWH * 500_000;
  const kw = schedule();
  const entry = HUB.map((_, h) => assumedEntryCents(matrix.hub_sum4.map((row) => row[h] ?? 0), [0, 10_000], 25));
  const armA: Arm = {
    method: "unhedged",
    kw,
    soc_ukwh: socPath(kw, open, 850_000),
    contracts: new Array<number>(24).fill(0),
    collateral_cents: 0,
    expected_uusd: 0,
    cvar_uusd: 0,
    objective_uusd: 0,
    lp_objective_uusd: 0,
  };
  const armB: Arm = { ...structuredClone(armA), method: "overlay", contracts: kw.map((_, h) => (h === 17 || h === 18 ? 34 : 0)) };
  const m: Manifest = {
    schema: MANIFEST_SCHEMA,
    kind: "test",
    market: "ERCOT",
    regime: "RTC+B",
    operating_day: "2026-11-26",
    gate: { unix: gateTs(od), local: "2026-11-25T10:00:00-06:00" },
    plan_time: { unix: gateTs(od) - 7_200, local: "2026-11-25T08:00:00-06:00" },
    battery: {
      resource: "CLO_ESR1",
      settlement_point: "CLO_RN",
      hub: "HB_HOUSTON",
      zone: "LZ_HOUSTON",
      county: "Harris",
      max_power_kw: KW,
      energy_kwh: KWH,
      source: battery,
    },
    physical_scope: "price-taking day-ahead energy schedule",
    assumptions: {
      basis: "assumed",
      round_trip_ppm: 850_000,
      soc_min_ppm: 50_000,
      soc_max_ppm: 950_000,
      soc_open_ppm: 500_000,
      soc_end_min_ppm: 500_000,
      soc_margin_kwh: 100,
      max_cycles_ppm: 1_000_000,
      wear_cents_per_mwh: 200,
      max_contracts_per_hour: 100,
      collateral_budget_cents: 10_000_000,
      hedge_cap: "schedule",
      losses: "taken on charging",
    },
    inputs: {
      release_id: RELEASE_ID,
      release_generated_unix: gateTs(od) - 60_000,
      manifest_sha256: site.manifestSha256,
      files: [...site.trail, ...payloads, ...site.liveRefs.map((f) => ({ route: `/live/v1/${f.route}`, sha256: f.sha256 }))],
      live: site.liveRefs.filter((f) => f.route.startsWith("days/")),
    },
    forecast: {
      method: "day-type persistence",
      day_type: "offpeak",
      lag_days: 2,
      reference_days: [{ day: "2026-11-22", weight: 1 }],
      hub_da_cents: HUB,
      node_da_cents: NODE,
      node_rule: "hub plus mean basis",
    },
    scenarios: {
      method: "history errors crossed with basis days",
      history_days: matrix.history_days,
      basis_days: matrix.basis_days,
      count: matrix.node_cents.length,
      weighting: "equal",
      digest_sha256: fileSha256(canonicalJson(matrix)),
    },
    instrument: {
      venue: "ElectronX",
      product: "hourly bounded future",
      location: "HB_HOUSTON",
      range_cents: [0, 10_000],
      tick_cents: 25,
      size_kwh: 1_000,
      fee_cents_per_contract: 35,
      settlement: "clip(mean of the four first-published real-time 15-minute hub SPPs, floor, ceiling)",
      collateral: "seller: (ceiling - entry) x contracts; buyer: (entry - floor) x contracts",
      source_urls: ["https://example.test/spec.pdf"],
      entry_rule: "forecast hub price, clipped and rounded to the tick",
      entry_assumed: true,
      entry_cents: entry,
    },
    risk: { alpha_ppm: 900_000, lambda_ppm: 500_000, objective: "mean - lambda x CVaR" },
    arms: { A: armA, B: armB, C: null },
    unsolved: [{ arm: "C", reason: "Time limit reached" }],
    selected_arm: "A",
    selection_rule: "highest objective; ties to the earlier arm",
    engine: { repo: "https://github.com/zhuyuxin0/gatelock", commit: COMMIT, tree: COMMIT, solver: "HiGHS", solver_package: "highs@1.15.4" },
    agent: { wallet: WALLET, erc8004_id: null },
    outside_inputs: null,
    salt: `0x${"ab".repeat(32)}`,
  };
  return settle(m, matrix);
}

export const PAYLOADS = {
  "/api/fleet-geo/v2/native": '{"batteries":[{"resource":"CLO_ESR1"}]}',
  "/api/prices/CLO_RN/2026-11-22": '{"da":[1,2,3]}',
  "/api/prices/HB_HOUSTON/2026-11-23": '{"da":[4,5,6]}',
};
export const LIVE = {
  "days/2026-11-25/aa.json": '{"day":"2026-11-25"}',
  "runs/2026-11-25/bb.json": '{"runs":[]}',
};

export function fixture() {
  const site = fakeSite(PAYLOADS, LIVE);
  const scenarios = scenarioMatrix();
  const manifest = buildManifest(site, scenarios);
  return { manifest, scenarios, site };
}

export const clone = <T>(v: T): T => structuredClone(v);

/** In-memory GateRecord with the same key and gate rules. */
export class FakeChain implements ChainReader {
  records = new Map<Hex, OnChainRecord>();
  outcomes = new Map<string, OnChainOutcome>();
  txs = new Map<Hex, AnchorTx>();
  constructor(readonly id = 97) {}

  commit(m: Manifest, at: number, root = merkleRoot([leafHash(m)])): Hex {
    const od = odFromIso(m.operating_day);
    const scope = scopeId(planScopeLabel(m.battery.resource));
    const key = recordKey(m.agent.wallet, scope, od);
    const codeHash: Hex = `0x${COMMIT}${"0".repeat(24)}`;
    this.records.set(key, { root, codeHash, scope, committer: m.agent.wallet, od, leafCount: 1, committedAt: at, blockNumber: 1234 });
    return key;
  }

  link(key: Hex, stage: number, hash: Hex, at: number): void {
    this.outcomes.set(`${key}/${stage}`, { hash, linkedAt: at });
  }

  async chainId() {
    return this.id;
  }
  async record(_c: Address, key: Hex) {
    return this.records.get(key) ?? null;
  }
  async outcome(_c: Address, key: Hex, stage: number) {
    return this.outcomes.get(`${key}/${stage}`) ?? null;
  }
  async keyOf(_c: Address, committer: Address, scope: Hex, od: number) {
    return recordKey(committer, scope, od);
  }
  async gateTs(_c: Address, od: number) {
    return gateTs(od);
  }
  async dayEndTs(_c: Address, od: number) {
    return operatingDayEndTs(od);
  }
  async transaction(hash: Hex) {
    const tx = this.txs.get(hash);
    if (!tx) throw new Error(`no transaction ${hash}`);
    return tx;
  }
}
