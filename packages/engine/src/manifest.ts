import type { Evaluation } from "./accounting.js";
import { ARM_METHODS, type ArmSolution } from "./arms.js";
import { centralClock } from "./calendar.js";
import { FORECAST_METHOD, type HubForecast } from "./forecast.js";
import { BOUNDED_FUTURE } from "./instrument.js";
import { SOLVER } from "./lp.js";
import type { PlanInput } from "./plan.js";
import { SCENARIO_METHOD, type ScenarioSet } from "./scenarios.js";
import { HOURS, type ArmId, type Assumptions, type Risk } from "./types.js";

export const MANIFEST_SCHEMA = "gate-record.manifest.v1";
export const ARM_ORDER: readonly ArmId[] = ["A", "B", "C"];
export const SELECTION_RULE = "the solved arm with the highest objective_uusd; a tie goes to the earlier arm (A, B, C)";

/** The manifest is plain JSON: strings, integers, booleans, null. */
export type Manifest = Record<string, unknown>;

export interface ManifestParts {
  input: PlanInput;
  gateUnix: number;
  assumptions: Assumptions;
  risk: Risk;
  lagDays: number;
  forecast: HubForecast;
  nodeForecastCents: number[];
  scenarios: ScenarioSet;
  scenarioDigest: string;
  entryCents: number[];
  arms: Partial<Record<ArmId, { solution: ArmSolution; evaluation: Evaluation }>>;
  unsolved: { arm: ArmId; reason: string }[];
}

function arm(id: ArmId, r: { solution: ArmSolution; evaluation: Evaluation }) {
  const { schedule, hedge, lpObjectiveUsd } = r.solution;
  const e = r.evaluation;
  return {
    method: ARM_METHODS[id],
    // Positive discharges, negative charges; each hour is one hour long, so kW is also kWh.
    kw: Array.from({ length: HOURS }, (_, h) => schedule.dischargeKw[h]! - schedule.chargeKw[h]!),
    soc_ukwh: e.socUkwh,
    contracts: hedge,
    collateral_cents: e.collateralCents,
    expected_uusd: e.expectedUusd,
    cvar_uusd: e.cvarUusd,
    objective_uusd: e.objectiveUusd,
    lp_objective_uusd: Math.round(lpObjectiveUsd * 1e6),
  };
}

export function selectArm(arms: ManifestParts["arms"]): ArmId {
  let best: ArmId | undefined;
  for (const id of ARM_ORDER) {
    const r = arms[id];
    if (r && (best === undefined || r.evaluation.objectiveUusd > arms[best]!.evaluation.objectiveUusd)) best = id;
  }
  if (!best) throw new Error("no arm was solved");
  return best;
}

export function buildManifest(p: ManifestParts): Manifest {
  const { input, assumptions: a, risk, forecast, scenarios } = p;
  const b = input.battery;
  return {
    schema: MANIFEST_SCHEMA,
    kind: input.kind,
    market: "ERCOT",
    regime: "RTC+B",
    operating_day: input.operatingDay,
    gate: { unix: p.gateUnix, local: centralClock(p.gateUnix) },
    plan_time: { unix: input.planUnix, local: centralClock(input.planUnix) },
    battery: {
      resource: b.resource,
      settlement_point: b.settlementPoint,
      hub: b.hub,
      zone: b.zone,
      county: b.county,
      max_power_kw: b.maxPowerKw,
      energy_kwh: b.energyKwh,
      source: { route: b.source.route, sha256: b.source.sha256 },
    },
    physical_scope: "price-taking day-ahead energy schedule at the settlement point; energy only, no ancillary services",
    assumptions: {
      basis: "assumed",
      round_trip_ppm: a.roundTripPpm,
      soc_min_ppm: a.socMinPpm,
      soc_max_ppm: a.socMaxPpm,
      soc_open_ppm: a.socOpenPpm,
      soc_end_min_ppm: a.socEndMinPpm,
      soc_margin_kwh: a.socMarginKwh,
      max_cycles_ppm: a.maxCyclesPpm,
      wear_cents_per_mwh: a.wearCentsPerMwh,
      max_contracts_per_hour: a.maxContractsPerHour,
      collateral_budget_cents: a.collateralBudgetCents,
      hedge_cap: a.hedgeCap,
      losses: "taken on charging",
    },
    inputs: {
      release_id: input.provenance.releaseId,
      release_generated_unix: input.provenance.releaseGeneratedUnix,
      manifest_sha256: input.provenance.manifestSha256,
      files: input.provenance.files.map((f) => ({ route: f.route, sha256: f.sha256 })),
      live: input.provenance.live.map((f) => ({ route: f.route, sha256: f.sha256 })),
    },
    forecast: {
      method: FORECAST_METHOD,
      day_type: forecast.dayType,
      lag_days: p.lagDays,
      reference_days: forecast.references.map((r) => ({ day: r.day, weight: r.weight })),
      hub_da_cents: forecast.cents,
      node_da_cents: p.nodeForecastCents,
      node_rule: "hub forecast plus the hourly node-minus-hub day-ahead basis averaged over the basis days",
    },
    scenarios: {
      method: SCENARIO_METHOD,
      history_days: scenarios.historyDays,
      basis_days: scenarios.basisDays,
      count: scenarios.scenarios.length,
      weighting: "equal",
      digest_sha256: p.scenarioDigest,
    },
    instrument: {
      venue: BOUNDED_FUTURE.venue,
      product: BOUNDED_FUTURE.product,
      location: b.hub,
      range_cents: [BOUNDED_FUTURE.floorCents, BOUNDED_FUTURE.ceilingCents],
      tick_cents: BOUNDED_FUTURE.tickCents,
      size_kwh: BOUNDED_FUTURE.sizeKwh,
      fee_cents_per_contract: BOUNDED_FUTURE.feeCentsPerContract,
      settlement: BOUNDED_FUTURE.settlement,
      collateral: BOUNDED_FUTURE.collateral,
      source_urls: [...BOUNDED_FUTURE.sourceUrls],
      entry_rule: BOUNDED_FUTURE.entryRule,
      entry_assumed: true,
      entry_cents: p.entryCents,
    },
    risk: {
      alpha_ppm: risk.alphaPpm,
      lambda_ppm: risk.lambdaPpm,
      objective: "mean revenue - lambda * CVaR_alpha(loss), over the equally weighted scenarios",
    },
    arms: Object.fromEntries(ARM_ORDER.map((id) => [id, p.arms[id] ? arm(id, p.arms[id]) : null])),
    unsolved: p.unsolved.map((u) => ({ arm: u.arm, reason: u.reason })),
    selected_arm: selectArm(p.arms),
    selection_rule: SELECTION_RULE,
    engine: {
      repo: input.engine.repo,
      commit: input.engine.commit,
      tree: input.engine.tree,
      solver: SOLVER.name,
      solver_package: `${SOLVER.package}@${SOLVER.version}`,
    },
    agent: { wallet: input.agent.wallet, erc8004_id: input.agent.erc8004Id },
    outside_inputs: null,
    salt: input.salt,
  };
}
