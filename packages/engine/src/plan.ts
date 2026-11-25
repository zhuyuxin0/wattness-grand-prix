import { evaluate, type Evaluation } from "./accounting.js";
import { solveJoint, solveOverlay, solveUnhedged, type ArmProblem, type ArmSolution } from "./arms.js";
import { assertReadable, daysBetween, gateUnix, type Day } from "./calendar.js";
import { DEFAULT_WEIGHTS, forecastHub, type HubForecast } from "./forecast.js";
import { entryCents } from "./instrument.js";
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
} from "./types.js";

export type RecordKind = "prospective" | "replay" | "test";

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
  const entry = entryCents(scenarios.scenarios.map((s) => s.hubSum4));
  const problem: ArmProblem = { battery: input.battery, assumptions, risk, entryCents: entry, scenarios: scenarios.scenarios };
  const score = (solution: ArmSolution): ArmResult => ({
    solution,
    evaluation: evaluate(input.battery, assumptions, risk, solution.schedule, solution.hedge, entry, scenarios.scenarios),
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
    assumptions,
    risk,
    lagDays,
    forecast,
    nodeForecastCents,
    scenarios,
    scenarioDigest: await scenarioDigest(scenarios),
    entryCents: entry,
    arms,
    unsolved,
  });
  return { manifest, forecast, nodeForecastCents, scenarios, arms, unsolved };
}
