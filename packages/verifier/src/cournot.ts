// The risk officer's outside input, checked from the manifest's own fields:
// the rule recomputed from the probability (V8), the weights from the
// scenario matrix (V5), and the saved response against the record (V7).
import {
  OBJECTIVE_EQUAL,
  OBJECTIVE_STRESS,
  WEATHER_RULE_V1,
  WEIGHTING_EQUAL,
  WEIGHTING_STRESS,
  applyWeatherRule,
  canonicalJson,
  equalSharePpm,
  fileSha256,
  scenarioShapeErrors,
  scenarioWeights,
  stressBucket,
  weatherIneligibility,
  type CournotInput,
  type Manifest,
  type ScenarioMatrix,
  type StressBucket,
} from "@gatelock/core";
import { callEvidenceOf, readingFromEvidence, type Reading } from "@gatelock/cournot";

const F = "outside_inputs.cournot";

export function cournotOf(m: Manifest): CournotInput | null {
  return m.outside_inputs?.cournot ?? null;
}

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

function bucketOf(m: Manifest, matrix: ScenarioMatrix): StressBucket {
  return stressBucket(matrix.history_days, matrix.basis_days.length, matrix.hub_sum4, WEATHER_RULE_V1);
}

/**
 * V8: the input is one this verifier knows, its fields agree with each other and
 * with the plan, and the rule gives the weights and limits recorded. With the
 * scenario matrix, the stress bucket is recomputed too.
 */
export function checkCournotRule(m: Manifest, scenarios: unknown): { problems: string[]; notes: string[] } {
  const c = cournotOf(m);
  const problems: string[] = [];
  const notes: string[] = [];
  const weighted = m.scenarios.weighting !== WEIGHTING_EQUAL;
  if (!c) {
    // Every manifest before the risk officer: equal weights, whatever its objective's wording.
    if (weighted) problems.push(`scenarios.weighting ${JSON.stringify(m.scenarios.weighting)} without an outside input`);
    return { problems, notes };
  }
  if (!same(c.rule, WEATHER_RULE_V1)) problems.push(`${F}.rule: not ${WEATHER_RULE_V1.id} as this verifier knows it`);
  const size = m.instrument.size_kwh;
  if (c.status === "not_applied") {
    if (!c.reason) problems.push(`${F}.reason: a reading that was not applied must say why`);
    if (c.after !== null || c.stress !== null) problems.push(`${F}: not applied, yet after or stress is set`);
    if (m.assumptions.max_contracts_per_hour !== c.before.max_contracts_per_hour) {
      problems.push(`assumptions.max_contracts_per_hour ${m.assumptions.max_contracts_per_hour}, ${F}.before says ${c.before.max_contracts_per_hour}`);
    }
    if (weighted) problems.push(`scenarios.weighting ${JSON.stringify(m.scenarios.weighting)}, but the reading was not applied`);
    if (m.risk.objective !== OBJECTIVE_EQUAL) problems.push(`risk.objective ${JSON.stringify(m.risk.objective)}, but the reading was not applied`);
    notes.push(`Cournot reading not applied: ${c.reason}`);
  } else {
    if (c.reason !== null) problems.push(`${F}.reason: set on an applied reading`);
    if (!c.claim || c.probability_ppm === null || !c.observed || !c.response || !c.after || !c.stress) {
      problems.push(`${F}: an applied reading needs claim, probability_ppm, observed, response, stress and after`);
      return { problems, notes };
    }
    const why = weatherIneligibility(
      { claim: c.claim, probability_ppm: c.probability_ppm, observed_unix: c.observed.unix },
      m.operating_day,
      m.plan_time.unix,
      m.gate.unix,
      WEATHER_RULE_V1,
    );
    if (why) problems.push(`${F}: applied, but the rule refuses it: ${why}`);
    if (c.probability_ppm > 1_000_000) return { problems: [...problems, `${F}.probability_ppm ${c.probability_ppm} is above 10^6`], notes };
    const want = applyWeatherRule(c.probability_ppm, size, c.before.max_contracts_per_hour, WEATHER_RULE_V1);
    for (const k of ["stress_weight_ppm", "hedge_limit_kwh", "max_contracts_per_hour"] as const) {
      if (c.after[k] !== want[k]) {
        problems.push(`${F}.after.${k} ${c.after[k]}: the rule gives ${want[k]} for probability_ppm ${c.probability_ppm}`);
      }
    }
    if (m.assumptions.max_contracts_per_hour !== c.after.max_contracts_per_hour) {
      problems.push(`assumptions.max_contracts_per_hour ${m.assumptions.max_contracts_per_hour}, ${F}.after says ${c.after.max_contracts_per_hour}`);
    }
    if (m.scenarios.weighting !== WEIGHTING_STRESS) problems.push(`scenarios.weighting ${JSON.stringify(m.scenarios.weighting)} on an applied reading`);
    if (m.risk.objective !== OBJECTIVE_STRESS) problems.push(`risk.objective ${JSON.stringify(m.risk.objective)} on an applied reading`);
    const gap = m.plan_time.unix - c.observed.unix;
    notes.push(
      `Cournot: market ${c.claim.market_id} (${c.claim.station} ${c.claim.measure} < ${c.claim.threshold_f}°F on ${c.claim.date}), ` +
        `p ${c.probability_ppm} ppm, observed ${gap} s before plan time and ${m.gate.unix - c.observed.unix} s before the gate`,
      `rule ${WEATHER_RULE_V1.id}: stress weight ${c.after.stress_weight_ppm} ppm, hedge limit ${c.after.hedge_limit_kwh} kWh, ` +
        `${c.after.max_contracts_per_hour} contracts an hour (without it ${c.before.stress_weight_ppm ?? "?"} ppm, ${c.before.max_contracts_per_hour})`,
    );
  }
  if (scenarios === undefined || scenarioShapeErrors(scenarios).length > 0) {
    notes.push("stress bucket not recomputed: no scenarios.json beside the manifest");
    return { problems, notes };
  }
  let bucket: StressBucket;
  try {
    bucket = bucketOf(m, scenarios as ScenarioMatrix);
  } catch (err) {
    problems.push(`scenarios.json: no stress bucket: ${(err as Error).message}`);
    return { problems, notes };
  }
  const share = equalSharePpm(bucket);
  if (c.before.stress_weight_ppm !== null && c.before.stress_weight_ppm !== share) {
    problems.push(`${F}.before.stress_weight_ppm ${c.before.stress_weight_ppm}: equal weights give the bucket ${share}`);
  }
  if (c.stress) {
    if (!same(c.stress.days, bucket.days)) problems.push(`${F}.stress.days: the scenarios give ${bucket.days.join(", ")}`);
    if (c.stress.scenarios !== bucket.scenarios) problems.push(`${F}.stress.scenarios ${c.stress.scenarios}: the scenarios give ${bucket.scenarios}`);
    if (problems.length === 0) notes.push(`stress bucket recomputed: ${bucket.days.length} days, ${bucket.scenarios} of ${bucket.flags.length} scenarios`);
  }
  return { problems, notes };
}

/** V5's weights: one integer per scenario, or undefined for equal weights. Throws when they cannot be built. */
export function scenarioWeightsFor(m: Manifest, matrix: ScenarioMatrix): number[] | undefined {
  const c = cournotOf(m);
  if (!c || c.status !== "applied" || !c.after) return undefined;
  return scenarioWeights(bucketOf(m, matrix).flags, c.after.stress_weight_ppm).weights;
}

export interface ResponseCheck {
  problems: string[];
  missing: string[];
  notes: string[];
}

/** V7: the saved response hashes to the record's digest and says what the manifest says. */
export function checkCournotResponse(m: Manifest, read: ((route: string) => Uint8Array | null) | undefined): ResponseCheck {
  const out: ResponseCheck = { problems: [], missing: [], notes: [] };
  const c = cournotOf(m);
  if (!c) return out;
  if (!c.response) {
    if (c.status === "applied") out.problems.push(`${F}.response: an applied reading needs its saved response`);
    return out;
  }
  const route = c.response.route;
  if (!/^[A-Za-z0-9._\-/]+$/.test(route) || route.startsWith("/") || route.split("/").includes("..")) {
    out.problems.push(`${F}.response.route ${JSON.stringify(route)} is not a plain relative path`);
    return out;
  }
  const bytes = read?.(route) ?? null;
  if (!bytes) {
    out.missing.push(`${F}.response: ${route} is not beside the record`);
    return out;
  }
  const got = fileSha256(bytes);
  if (got !== c.response.sha256) {
    out.problems.push(`${F}.response: ${route} hashes to ${got}, the record says ${c.response.sha256}`);
    return out;
  }
  if (c.status !== "applied") {
    out.notes.push(`Cournot response ${route} matches its digest (not applied)`);
    return out;
  }
  let r: Reading;
  try {
    r = readingFromEvidence(callEvidenceOf(JSON.parse(new TextDecoder().decode(bytes))));
  } catch (err) {
    out.problems.push(`${F}.response: ${route} cannot be read: ${(err as Error).message}`);
    return out;
  }
  const name = (field: string, recorded: unknown, given: unknown) => {
    if (!same(recorded, given)) out.problems.push(`${F}.${field}: the record says ${JSON.stringify(recorded)}, the response gives ${JSON.stringify(given)}`);
  };
  name("probability_ppm", c.probability_ppm, r.probabilityPpm);
  name("claim", c.claim, r.claim);
  name("basis", c.basis, r.basis);
  name("observed.unix", c.observed?.unix ?? null, r.observedUnix);
  if (out.problems.length === 0) out.notes.push(`Cournot response ${route} matches its digest and the record's claim, probability and time`);
  return out;
}
