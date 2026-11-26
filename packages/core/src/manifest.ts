import type { Address, Hex } from "viem";
import type { WeatherClaim, WeatherRule } from "./weather.js";

// The documents that get hashed, field for field as packages/engine writes
// them. Units are in the names: kw and kwh, cents (per MWh for prices), uusd
// (micro-USD), ppm (parts per million), ukwh (micro-kWh). Hourly arrays run
// from hour ending 1 to the day's last hour.

export const MANIFEST_SCHEMA = "gate-record.manifest.v1";
export const OUTCOME_SCHEMA = "gate-record.outcome.v1";

export const ARM_IDS = ["A", "B", "C"] as const;
export type ArmId = (typeof ARM_IDS)[number];

export interface FileRef {
  /** A path on the data site: a release route (/api/...), a release file or a live-tier file. */
  route: string;
  sha256: string;
}

export interface Stamp {
  unix: number;
  /** ISO 8601 in Central time with its offset; display only. */
  local: string;
}

export interface Manifest {
  schema: typeof MANIFEST_SCHEMA;
  kind: "prospective" | "replay" | "test";
  market: "ERCOT";
  regime: "RTC+B";
  operating_day: string;
  gate: Stamp;
  plan_time: Stamp;
  battery: {
    resource: string;
    settlement_point: string;
    hub: string;
    zone: string | null;
    county: string | null;
    max_power_kw: number;
    energy_kwh: number;
    source: FileRef;
  };
  physical_scope: string;
  assumptions: {
    basis: "assumed";
    round_trip_ppm: number;
    soc_min_ppm: number;
    soc_max_ppm: number;
    soc_open_ppm: number;
    soc_end_min_ppm: number;
    soc_margin_kwh: number;
    max_cycles_ppm: number;
    wear_cents_per_mwh: number;
    max_contracts_per_hour: number;
    collateral_budget_cents: number;
    /** "schedule": an hour's hedge covers no more MWh than the schedule moves in that direction. */
    hedge_cap: "schedule" | "size";
    losses: string;
  };
  inputs: {
    release_id: string;
    release_generated_unix: number;
    manifest_sha256: string;
    files: FileRef[];
    /** Live-tier day indexes, relative to /live/v1/. */
    live: FileRef[];
  };
  forecast: {
    method: string;
    day_type: string;
    lag_days: number;
    reference_days: { day: string; weight: number }[];
    hub_da_cents: number[];
    node_da_cents: number[];
    node_rule: string;
  };
  scenarios: {
    method: string;
    history_days: string[];
    basis_days: string[];
    count: number;
    weighting: string;
    /** SHA-256 of the scenario matrix (see ScenarioMatrix). */
    digest_sha256: string;
  };
  instrument: {
    venue: string;
    product: string;
    location: string;
    range_cents: [number, number];
    tick_cents: number;
    size_kwh: number;
    fee_cents_per_contract: number;
    settlement: string;
    collateral: string;
    source_urls: string[];
    entry_rule: string;
    entry_assumed: true;
    entry_cents: number[];
  };
  risk: { alpha_ppm: number; lambda_ppm: number; objective: string };
  arms: Record<ArmId, Arm | null>;
  unsolved: { arm: ArmId; reason: string }[];
  selected_arm: ArmId;
  selection_rule: string;
  /** tree: the git tree hash of the source that produced the record; its codeHash on chain. */
  engine: { repo: string; commit: string; tree: string; solver: string; solver_package: string };
  agent: { wallet: Address; erc8004_id: string | null };
  /** null, or readings from outside the data release the plan took before the gate. */
  outside_inputs: OutsideInputs | null;
  salt: Hex;
}

/**
 * Added after the 26 Nov record, which carries null here: a manifest without
 * outside inputs keeps null, so every earlier manifest still validates.
 */
export interface OutsideInputs {
  cournot: CournotInput;
}

/** Cournot's probability as the risk officer read it, and what the weather rule did with it. */
export interface CournotInput {
  /** "not_applied": the plan ran without the reading, for the reason given. */
  status: "applied" | "not_applied";
  reason: string | null;
  rule: WeatherRule;
  claim: WeatherClaim | null;
  /** The returned probability, rounded to the nearest part per million. */
  probability_ppm: number | null;
  basis: CournotBasis[];
  /** When the response was received, rounded up to the second. */
  observed: Stamp | null;
  /** The saved response, published beside the record; route is relative to the record's directory. */
  response: FileRef | null;
  /** The stress bucket of this battery's scenarios; null when not applied. */
  stress: { days: string[]; scenarios: number } | null;
  /** The plan without the reading: equal weights and the plan's own contract cap. */
  before: { stress_weight_ppm: number | null; max_contracts_per_hour: number };
  /** The plan with it; null when not applied. */
  after: { stress_weight_ppm: number; hedge_limit_kwh: number; max_contracts_per_hour: number } | null;
}

export interface CournotBasis {
  source: string;
  time: string | null;
  summary: string;
  url: string | null;
}

export interface Arm {
  method: string;
  /** Signed kW per hour: positive discharges, negative charges. One hour at k kW moves k kWh. */
  kw: number[];
  /** State of charge at the end of each hour; the day opens at energy_kwh x soc_open_ppm. */
  soc_ukwh: number[];
  /** Signed bounded futures per hour: positive sells. */
  contracts: number[];
  collateral_cents: number;
  /** Mean revenue over the scenarios, floored. */
  expected_uusd: number;
  /** CVaR of loss at alpha, floored. */
  cvar_uusd: number;
  /** floor((mean x 10^6 - lambda x CVaR) / 10^6). */
  objective_uusd: number;
  /** The solver's own objective, before rounding to whole kW and contracts. */
  lp_objective_uusd: number;
}

/**
 * The scenario set the manifest's digest covers. Its digest is SHA-256 over
 * the JCS form of exactly these four fields.
 */
export interface ScenarioMatrix {
  basis_days: string[];
  history_days: string[];
  /** Per scenario, per hour: four times the hedge's settlement price, clipped to the range. */
  hub_sum4: number[][];
  /** Per scenario, per hour: day-ahead price at the settlement point. */
  node_cents: number[][];
}

export interface Outcome {
  schema: typeof OUTCOME_SCHEMA;
  /** 1 day-ahead settled, 2 real-time provisional, 3 real-time settled. */
  stage: 1 | 2 | 3;
  operating_day: string;
  /** Root of the record this outcome settles. */
  manifest_root: Hex;
  inputs: {
    release_id: string | null;
    manifest_sha256: string | null;
    files: FileRef[];
    live: FileRef[];
  };
  prices: {
    da_node_cents: number[];
    /** Four 15-minute hub prices per hour; null for an hour not yet published, or entirely at stage 1. */
    rt_hub_cents: ([number, number, number, number] | null)[] | null;
  };
  arms: Record<ArmId, OutcomeArm | null>;
}

export interface OutcomeArm {
  energy_uusd: number;
  wear_uusd: number;
  /** Null while any hour holding contracts lacks its four real-time prices. */
  hedge_uusd: number | null;
  fees_uusd: number;
  net_uusd: number | null;
}
