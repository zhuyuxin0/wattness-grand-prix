import { DataError } from "./errors.js";
import { expect, isRecord } from "./fetch-verified.js";
import type { Provenance } from "./provenance.js";
import type { Release } from "./release.js";

/** Storage census (NP3-988-ER) rows with their nodes, zones and counties; holds no revenue. */
export const CENSUS_ROUTE = "/api/fleet-geo/v2/native";
export const CENSUS_SCHEMA = "fleet-geo.v1";

/** ERCOT's trading hub for each load zone that has its own. */
const ZONE_HUB: Readonly<Record<string, string>> = {
  LZ_HOUSTON: "HB_HOUSTON",
  LZ_NORTH: "HB_NORTH",
  LZ_SOUTH: "HB_SOUTH",
  LZ_WEST: "HB_WEST",
};

export interface BatteryRecord {
  resource: string;
  settlementPoint: string;
  zone: string;
  /** Derived from the zone; ERCOT's census does not name a hub. */
  hub: string;
  /** Null where the census row names none; the plan does not use it. */
  county: string | null;
  maxPowerKw: number;
  energyKwh: number;
  census: { report: string; posted: string };
  /** Where the row's size and node came from, as the file declares (for CLO_ESR1, "released-fleet"). */
  sizeSource: string | null;
  nodeSource: string | null;
  source: Provenance;
}

function kilo(mega: number, label: string): number {
  const k = Math.round(mega * 1000);
  if (Math.abs(mega * 1000 - k) > 1e-6) throw new DataError("shape", `${label}: ${mega} is not a whole number of k-units`);
  return k;
}

export function parseBatteryRecord(raw: unknown, resource: string, source: Provenance): BatteryRecord {
  expect(isRecord(raw) && raw.schema === CENSUS_SCHEMA, `${CENSUS_ROUTE}: expected ${CENSUS_SCHEMA}`);
  const census = raw.census;
  expect(isRecord(census) && typeof census.source === "string" && typeof census.posted === "string", `${CENSUS_ROUTE}: census`);
  expect(Array.isArray(raw.rows), `${CENSUS_ROUTE}: rows`);
  const rows = raw.rows.filter((r): r is Record<string, unknown> => isRecord(r) && r.esr === resource);
  if (rows.length !== 1) {
    throw new DataError("missing", `${resource}: ${rows.length} census rows in ${CENSUS_ROUTE}; expected exactly one`);
  }
  const row = rows[0] as Record<string, unknown>;
  const label = `${resource} census row`;
  expect(row.in_census === true, `${label}: not in the census`);
  const { settlement_point, load_zone, county, p_max_mw, e_max_mwh } = row;
  expect(typeof settlement_point === "string" && settlement_point, `${label}: settlement_point`);
  expect(typeof load_zone === "string" && load_zone, `${label}: load_zone`);
  expect(county === undefined || county === null || typeof county === "string", `${label}: county`);
  expect(typeof p_max_mw === "number" && p_max_mw > 0, `${label}: p_max_mw`);
  expect(typeof e_max_mwh === "number" && e_max_mwh > 0, `${label}: e_max_mwh`);
  const hub = ZONE_HUB[load_zone];
  if (!hub) throw new DataError("missing", `${label}: no hub for load zone ${load_zone}`);
  return {
    resource,
    settlementPoint: settlement_point,
    zone: load_zone,
    hub,
    county: typeof county === "string" && county ? county : null,
    maxPowerKw: kilo(p_max_mw, `${label}: p_max_mw`),
    energyKwh: kilo(e_max_mwh, `${label}: e_max_mwh`),
    census: { report: census.source, posted: census.posted },
    sizeSource: typeof row.size_source === "string" ? row.size_source : null,
    nodeSource: typeof row.node_source === "string" ? row.node_source : null,
    source,
  };
}

export async function readBatteryRecord(release: Release, resource: string): Promise<BatteryRecord> {
  const file = await release.read(CENSUS_ROUTE);
  return parseBatteryRecord(file.json, resource, file.provenance);
}

/** The hedging walkthrough's named battery: its identity and limits for the showcase leaf. */
export const WALKTHROUGH_ROUTE = "/api/hedging/v1/walkthrough";

/**
 * The walkthrough names one battery with its power, declared energy and hub. It does not carry the
 * settlement point, so that one field comes from the census row, which must name the same resource.
 */
export function parseWalkthroughBattery(raw: unknown, census: BatteryRecord, source: Provenance): BatteryRecord {
  expect(isRecord(raw) && isRecord(raw.named), `${WALKTHROUGH_ROUTE}: named battery`);
  const named = raw.named as Record<string, unknown>;
  const { esr, mw, default_hub, energy } = named;
  expect(esr === census.resource, `${WALKTHROUGH_ROUTE}: names ${String(esr)}, not ${census.resource}`);
  expect(typeof mw === "number" && mw > 0, `${WALKTHROUGH_ROUTE}: mw`);
  expect(isRecord(energy) && typeof energy.mwh === "number" && energy.mwh > 0, `${WALKTHROUGH_ROUTE}: energy.mwh`);
  expect(typeof default_hub === "string" && /^HB_[A-Z]+$/.test(default_hub), `${WALKTHROUGH_ROUTE}: default_hub`);
  const label = `${census.resource} walkthrough`;
  return {
    ...census,
    hub: default_hub,
    maxPowerKw: kilo(mw, `${label}: mw`),
    energyKwh: kilo(energy.mwh as number, `${label}: energy.mwh`),
    sizeSource: `walkthrough: ${typeof energy.rule === "string" ? energy.rule : "stated"} energy`,
    source,
  };
}

/**
 * Every resource in the census, by name. Rows without a settlement point or a hubbed zone are listed
 * too, so the fleet records them as exclusions instead of leaving them out unseen.
 */
export function listCensusResources(raw: unknown): { resource: string; settlementPoint: string | null }[] {
  expect(isRecord(raw) && raw.schema === CENSUS_SCHEMA && Array.isArray(raw.rows), `${CENSUS_ROUTE}: expected ${CENSUS_SCHEMA}`);
  const out = new Map<string, string | null>();
  for (const r of raw.rows as unknown[]) {
    if (!isRecord(r) || r.in_census !== true || typeof r.esr !== "string" || !r.esr) continue;
    out.set(r.esr, typeof r.settlement_point === "string" && r.settlement_point ? r.settlement_point : null);
  }
  return [...out].map(([resource, settlementPoint]) => ({ resource, settlementPoint })).sort((a, b) => (a.resource < b.resource ? -1 : 1));
}

export async function readCensusResources(release: Release): Promise<{ resource: string; settlementPoint: string | null }[]> {
  return listCensusResources((await release.read(CENSUS_ROUTE)).json);
}

export async function readWalkthroughBattery(release: Release, resource: string): Promise<BatteryRecord> {
  const census = await readBatteryRecord(release, resource);
  const file = await release.read(WALKTHROUGH_ROUTE);
  return parseWalkthroughBattery(file.json, census, file.provenance);
}
