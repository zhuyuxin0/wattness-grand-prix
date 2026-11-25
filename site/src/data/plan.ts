// One battery's published plan (scripts/data/pit-wall.mjs writes
// public/data/pit-wall/): the Battery tab and the agent tabs read it. Also the
// optional files other lanes publish when they land.

import type { ArmName } from "../design/tokens";
import { useLoad } from "./hooks";
import { dataUrl, fetchJson } from "./load";

export interface ArmSplit {
  /** Expected energy revenue at the node over the scenarios. */
  energyUsd: number;
  /** Wear charge on discharged energy (negative). */
  wearUsd: number;
  /** Expected settlement of the hedge against the assumed entry. */
  hedgeUsd: number;
  /** Exchange fees (negative). */
  feesUsd: number;
}

export interface DeskArm {
  /** Signed kW per hour; positive is discharge. */
  kw: number[];
  /** State of charge at the end of each hour, kWh. */
  socKwh: number[];
  /** Signed contracts per hour; positive sells. */
  contracts: number[];
  collateralUsd: number;
  expectedUsd: number;
  /** CVaR of loss: the mean loss over the worst (1 − α) share of scenarios. */
  cvarUsd: number;
  objectiveUsd: number;
  split: ArmSplit | null;
}

export interface Bands {
  p05: number[];
  p25: number[];
  p75: number[];
  p95: number[];
}

export interface Desk {
  schema: "grand-prix.pit-wall.v1";
  resource: string;
  settlementPoint: string;
  hub: string;
  zone: string | null;
  county: string | null;
  maxPowerKw: number;
  energyKwh: number;
  leaf: `0x${string}`;
  selectedArm: ArmName;
  unsolved: unknown[];
  /** cents per MWh, hours 0..23 CT */
  nodeForecastCents: number[];
  nodeScenarioCents: Bands | null;
  arms: Partial<Record<ArmName, DeskArm>>;
}

export interface DeskCommon {
  schema: "grand-prix.pit-wall-common.v1";
  operatingDay: string;
  batteries: number;
  gate: { unix: number; local: string };
  planTime: { unix: number; local: string };
  market: string;
  regime: string;
  physicalScope: string;
  assumptions: {
    basis: string;
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
    hedge_cap: string;
    losses: string;
  };
  risk: { alpha_ppm: number; lambda_ppm: number; objective: string };
  instrument: {
    venue: string;
    product: string;
    range_cents: [number, number];
    tick_cents: number;
    size_kwh: number;
    fee_cents_per_contract: number;
    settlement: string;
    collateral: string;
    source_urls: string[];
    entry_rule: string;
    entry_assumed: boolean;
  };
  selectionRule: string;
  armMethods: Record<ArmName, string | null>;
  forecast: { method: string; nodeRule: string; dayType: string; lagDays: number };
  scenarios: { method: string; count: number; weighting: string };
  inputsRelease: string;
  engine: { commit: string; solver: string; solverPackage: string };
  entryCents: Record<string, number[]>;
  hubForecastCents: Record<string, number[]>;
}

type PublishedArm = Omit<DeskArm, "kw" | "socKwh"> & { kw: number[] | null; socKwh: number[] | null };
type PublishedDesk = Omit<Desk, "arms"> & { arms: Partial<Record<ArmName, PublishedArm>> };

/** An arm that keeps A's schedule is published with null kw and socKwh; fill them from A. */
async function loadDesk(resource: string): Promise<Desk> {
  const raw = await fetchJson<PublishedDesk>(`pit-wall/${resource}.json`);
  const a = raw.arms.A;
  const arms: Partial<Record<ArmName, DeskArm>> = {};
  for (const [name, arm] of Object.entries(raw.arms) as [ArmName, PublishedArm][]) {
    const kw = arm.kw ?? a?.kw;
    const socKwh = arm.socKwh ?? a?.socKwh;
    if (!kw || !socKwh) throw new Error(`${resource}: arm ${name} has no schedule`);
    arms[name] = { ...arm, kw, socKwh };
  }
  return { ...raw, arms };
}

export const useDesk = (resource: string) => useLoad(() => loadDesk(resource), `pit-wall:${resource}`);
export const useDeskCommon = () => useLoad(() => fetchJson<DeskCommon>("pit-wall/common.json"), "pit-wall:common");

/**
 * A file another lane publishes when it lands. Absent, unreadable or not JSON
 * (a dev server answers unknown paths with the app's HTML) all mean "nothing
 * to show", never an error on the page.
 */
async function optionalJson(path: string): Promise<unknown | null> {
  try {
    const res = await fetch(dataUrl(path));
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("json")) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

export const useOptional = (path: string) => useLoad(() => optionalJson(path), `optional:${path}`);
