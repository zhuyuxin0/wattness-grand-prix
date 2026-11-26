import {
  WEATHER_RULE_V1,
  applyWeatherRule,
  equalSharePpm,
  scenarioWeights,
  stressBucket,
  weatherIneligibility,
  type CournotBasis,
  type CournotInput,
  type StressBucket,
  type WeatherClaim,
} from "@gatelock/core";
import { evaluate, type Evaluation, type ScenarioWeights } from "./accounting.js";
import { solveJoint, solveOverlay, solveUnhedged, type ArmProblem, type ArmSolution } from "./arms.js";
import { assertReadable, centralClock, daysBetween, gateUnix, type Day } from "./calendar.js";
import { DEFAULT_WEIGHTS, forecastHub, type HubForecast } from "./forecast.js";
import { BOUNDED_FUTURE, entryCents, weightedEntryCents } from "./instrument.js";
import { SolveError } from "./lp.js";
import { buildManifest, type Manifest } from "./manifest.js";
import { buildScenarios, daMap, scenarioDigest, type ScenarioSet } from "./scenarios.js";
import {
  DEFAULT_ASSUMPTIONS,
  DEFAULT_RISK,
  type ArmId,
  type Assumptions,
  type BatteryRecord,
  type PriceDay,
  type Provenance,
  type Risk,
  type SourceFile,
} from "./types.js";

export type RecordKind = "prospective" | "replay" | "test";

/**
 * Cournot's probability as the planner read it before the gate. The engine
 * applies gate-record.weather-stress.v1 to it, or records why it could not.
 */
export interface CournotReading {
  claim: WeatherClaim | null;
  probabilityPpm: number | null;
  basis: CournotBasis[];
  /** The response's receipt time, rounded up to the second. */
  observedUnix: number | null;
  /** The saved response, relative to the record's directory. */
  response: SourceFile | null;
  /** Set when the call failed or its response could not be read; the plan then runs without it. */
  failure: string | null;
}

export interface PlanInput {
  kind: RecordKind;
  operatingDay: Day;
  planUnix: number;
  battery: BatteryRecord;
  /** Prices at the battery's hub. */
  hub: readonly PriceDay[];
  /** Prices at the battery's settlement point. */
  node: readonly PriceDay[];
  provenance: Provenance;
  /** 32 bytes as 0x-prefixed lowercase hex. */
  salt: string;
  /** commit: HEAD of the source repo; tree: the git tree hash of the source that ran, committed as codeHash. */
  engine: { repo: string; commit: string; tree: string };
  agent: { wallet: string; erc8004Id: string | null };
  assumptions?: Assumptions;
  risk?: Risk;
  forecastWeights?: readonly number[];
  /** Arms to solve; A is always solved because B overlays it. */
  arms?: readonly ArmId[];
  /** Seconds HiGHS may spend on arm C before C is recorded as unsolved. */
  jointTimeLimitSeconds?: number;
  /** Absent: no outside input, and outside_inputs is null, exactly as before the risk officer. */
  cournot?: CournotReading;
}

export interface ArmResult {
  solution: ArmSolution;
  evaluation: Evaluation;
}

export interface Plan {
  manifest: Manifest;
  forecast: HubForecast;
  nodeForecastCents: number[];
  scenarios: ScenarioSet;
  arms: Partial<Record<ArmId, ArmResult>>;
  unsolved: { arm: ArmId; reason: string }[];
  /** The scenario weights the plan used; absent for equal weights. */
  weights?: ScenarioWeights;
  cournot: CournotInput | null;
}

/** What the weather rule does to one battery's plan: the record it writes, and the settings it changes. */
export function applyCournot(
  reading: CournotReading,
  od: Day,
  planUnix: number,
  gate: number,
  set: ScenarioSet,
  a: Assumptions,
): { record: CournotInput; weights?: ScenarioWeights; assumptions: Assumptions } {
  const rule = WEATHER_RULE_V1;
  let bucket: StressBucket | null = null;
  try {
    bucket = stressBucket(set.historyDays, set.basisDays.length, set.scenarios.map((s) => s.hubSum4), rule);
  } catch {
    bucket = null;
  }
  const observedUnix = reading.observedUnix;
  const common = {
    rule,
    claim: reading.claim,
    probability_ppm: reading.probabilityPpm,
    basis: reading.basis,
    observed: observedUnix === null ? null : { unix: observedUnix, local: centralClock(observedUnix) },
    response: reading.response ? { route: reading.response.route, sha256: reading.response.sha256 } : null,
    before: { stress_weight_ppm: bucket ? equalSharePpm(bucket) : null, max_contracts_per_hour: a.maxContractsPerHour },
  };
  const split = bucket !== null && bucket.scenarios > 0 && bucket.scenarios < bucket.flags.length;
  const reason =
    reading.failure ??
    weatherIneligibility({ claim: reading.claim, probability_ppm: reading.probabilityPpm, observed_unix: observedUnix }, od, planUnix, gate, rule) ??
    (split ? null : "the history window is too short to split into stress days and the rest");
  if (reason !== null || !bucket) {
    return { record: { status: "not_applied", reason: reason ?? "no stress bucket", ...common, stress: null, after: null }, assumptions: a };
  }
  const after = applyWeatherRule(reading.probabilityPpm as number, BOUNDED_FUTURE.sizeKwh, a.maxContractsPerHour, rule);
  return {
    record: { status: "applied", reason: null, ...common, stress: { days: bucket.days, scenarios: bucket.scenarios }, after },
    weights: scenarioWeights(bucket.flags, after.stress_weight_ppm),
    assumptions: { ...a, maxContractsPerHour: after.max_contracts_per_hour },
  };
}

const SALT = /^0x[0-9a-f]{64}$/;

export class PlanInputError extends Error {
  override name = "PlanInputError";
}

function validate(input: PlanInput): number {
  const od = input.operatingDay;
  // The excluded-days check runs before anything else reads a price.
  for (const p of [...input.hub, ...input.node]) assertReadable(p.day);
  if (!SALT.test(input.salt)) throw new PlanInputError("salt must be 32 bytes of lowercase hex with a 0x prefix");
  const gate = gateUnix(od);
  if (!Number.isSafeInteger(input.planUnix) || input.planUnix >= gate) {
    throw new PlanInputError(`plan time ${input.planUnix} is not before the gate ${gate}`);
  }
  if (input.provenance.releaseGeneratedUnix > input.planUnix) {
    throw new PlanInputError("the release was generated after plan time");
  }
  const { battery } = input;
  for (const p of input.hub) {
    if (p.point !== battery.hub) throw new PlanInputError(`hub prices for ${p.point}, battery's hub is ${battery.hub}`);
  }
  for (const p of input.node) {
    if (p.point !== battery.settlementPoint) {
      throw new PlanInputError(`node prices for ${p.point}, battery settles at ${battery.settlementPoint}`);
    }
  }
  for (const p of [...input.hub, ...input.node]) {
    if (p.day >= od) throw new PlanInputError(`${p.point} ${p.day} is not before the operating day ${od}`);
    for (const v of [...(p.da ?? []), ...(p.rt15 ?? [])]) {
      if (!Number.isSafeInteger(v)) throw new PlanInputError(`${p.point} ${p.day}: prices must be whole cents`);
    }
  }
  return gate;
}

export async function plan(input: PlanInput): Promise<Plan> {
  const gate = validate(input);
  const od = input.operatingDay;
  const assumptions = input.assumptions ?? DEFAULT_ASSUMPTIONS;
  const risk = input.risk ?? DEFAULT_RISK;
  const weights = input.forecastWeights ?? DEFAULT_WEIGHTS;
  const wanted = new Set<ArmId>(input.arms ?? ["A", "B", "C"]);

  const hubDa = daMap(input.hub);
  const lastDa = [...hubDa.keys()].sort().at(-1);
  if (!lastDa) throw new PlanInputError("no day-ahead hub prices on file");
  // The rule faces the same gap between the newest day-ahead day and the target in history as it does tonight.
  const lagDays = daysBetween(lastDa, od);
  const forecast = forecastHub(od, hubDa, lagDays, weights);
  if (!forecast) throw new PlanInputError(`fewer than ${weights.length} ${od} day-type days on file`);

  const scenarios = buildScenarios(od, forecast.cents, input.hub, input.node, lagDays, weights);
  const nodeForecastCents = forecast.cents.map((p, h) => p + scenarios.meanBasisCents[h]!);
  // The risk officer's reading, when there is one, re-weights the scenarios and may lower the contract cap.
  const officer = input.cournot ? applyCournot(input.cournot, od, input.planUnix, gate, scenarios, assumptions) : null;
  const used = officer?.assumptions ?? assumptions;
  const sw = officer?.weights;
  const hubSum4 = scenarios.scenarios.map((s) => s.hubSum4);
  const entry = sw ? weightedEntryCents(hubSum4, sw.weights, sw.total) : entryCents(hubSum4);
  const problem: ArmProblem = {
    battery: input.battery,
    assumptions: used,
    risk,
    entryCents: entry,
    scenarios: scenarios.scenarios,
    ...(sw ? { weights: sw } : {}),
  };
  const score = (solution: ArmSolution): ArmResult => ({
    solution,
    evaluation: evaluate(input.battery, used, risk, solution.schedule, solution.hedge, entry, scenarios.scenarios, sw),
  });

  const arms: Partial<Record<ArmId, ArmResult>> = {};
  const unsolved: { arm: ArmId; reason: string }[] = [];
  arms.A = score(await solveUnhedged(problem));
  if (wanted.has("B")) arms.B = score(await solveOverlay(problem, arms.A.solution.schedule));
  if (wanted.has("C")) {
    try {
      arms.C = score(await solveJoint(problem, input.jointTimeLimitSeconds));
    } catch (err) {
      // Arm C is the newest formulation; a failure there must not hold back A and B.
      if (!(err instanceof SolveError)) throw err;
      unsolved.push({ arm: "C", reason: err.status });
    }
  }

  const manifest = buildManifest({
    input,
    gateUnix: gate,
    assumptions: used,
    risk,
    lagDays,
    forecast,
    nodeForecastCents,
    scenarios,
    scenarioDigest: await scenarioDigest(scenarios),
    entryCents: entry,
    arms,
    unsolved,
    cournot: officer?.record ?? null,
    weighted: sw !== undefined,
  });
  return { manifest, forecast, nodeForecastCents, scenarios, arms, unsolved, ...(sw ? { weights: sw } : {}), cournot: officer?.record ?? null };
}
