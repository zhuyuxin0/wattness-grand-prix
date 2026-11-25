import { PPM } from "./int.js";

// The risk officer's weather rule, gate-record.weather-stress.v1.
//
// Before the gate the planner may read Cournot's probability that a Texas dawn
// turns cold on Kalshi's minimum-temperature market. This rule turns that one
// number into two plan settings, in exact integers:
//
//   stress weight  w = p x 0.80 + (1 - p) x 0.25            (ppm, floored)
//   hedge limit    L = 50 MWh x (1 - 0.50 x w)              (kWh, floored)
//   contract cap     = min(the plan's own cap, floor(L / contract size))
//
// p = 0.01 gives w 0.2555 and L 43.6125 MWh (43 contracts an hour); the rule's
// prior p = 0.30 gives 0.415 and 39.625 MWh. The two conditional
// probabilities (stress follows a cold dawn 80% of the time, and 25% of the
// time otherwise), the 50 MWh base and the 50% cut are declared assumptions,
// not estimates.
//
// The stress bucket comes from the plan's own scenario matrix, so it uses only
// prices published before plan time: every history day is scored by the sum
// of its hub settlement prices over ERCOT's two winter peaks (hour ending 7
// to 10 and 18 to 21, Central), the price a short hedge pays when a cold
// morning lifts heating load. The top quarter of history days (rounded up,
// ties to the later day) are the stress days; every scenario built on one is
// in the bucket. Those scenarios share the weight w equally, the others share
// 1 - w equally. The same weights set the fair-value entry, the mean and the
// CVaR, so the three arms stay comparable.

export const WEATHER_RULE_ID = "gate-record.weather-stress.v1";

/** The rule's parameters, written into every manifest that reads Cournot. */
export interface WeatherRule {
  id: typeof WEATHER_RULE_ID;
  /** P(stress | the cold event happens). */
  stress_if_event_ppm: number;
  /** P(stress | it does not). */
  stress_if_no_event_ppm: number;
  /** The event probability the rule assumes with no reading; for comparison only, never applied. */
  prior_event_ppm: number;
  /** The hourly hedge limit before the stress cut. */
  base_hedge_limit_kwh: number;
  /** The share of the stress weight cut from the hedge limit. */
  hedge_cut_ppm: number;
  /** Hour indexes (0 is hour ending 1, Central) whose hub settlements score a history day. */
  stress_hours: number[];
  /** The share of history days that are stress days, as [numerator, denominator], rounded up. */
  stress_share: [number, number];
  /** A reading older than this at plan time is not applied. */
  max_age_seconds: number;
  /** Kalshi settlement stations the rule reads (CLIDFW: Dallas-Fort Worth). */
  stations: string[];
  measure: "minimum temperature";
  comparator: "<";
  /** The market's date, as days from the operating day: the day itself, or the day before it. */
  event_day_offsets: number[];
}

export const WEATHER_RULE_V1: WeatherRule = {
  id: WEATHER_RULE_ID,
  stress_if_event_ppm: 800_000,
  stress_if_no_event_ppm: 250_000,
  prior_event_ppm: 300_000,
  base_hedge_limit_kwh: 50_000,
  hedge_cut_ppm: 500_000,
  stress_hours: [6, 7, 8, 9, 17, 18, 19, 20],
  stress_share: [1, 4],
  max_age_seconds: 86_400,
  stations: ["CLIDFW"],
  measure: "minimum temperature",
  comparator: "<",
  event_day_offsets: [0, -1],
};

export const WEIGHTING_EQUAL = "equal";
/** The scenarios of outside_inputs.cournot.stress.days share after.stress_weight_ppm equally, the rest the remainder. */
export const WEIGHTING_STRESS = "stress-weighted";
export const OBJECTIVE_EQUAL = "mean revenue - lambda * CVaR_alpha(loss), over the equally weighted scenarios";
export const OBJECTIVE_STRESS = "mean revenue - lambda * CVaR_alpha(loss), over the stress-weighted scenarios";

const isPpm = (x: number) => Number.isSafeInteger(x) && x >= 0 && x <= PPM;

/** w = floor((p x s1 + (1 - p) x s0) / 10^6), all in ppm. */
export function stressWeightPpm(pPpm: number, rule: WeatherRule = WEATHER_RULE_V1): number {
  if (!isPpm(pPpm)) throw new RangeError(`probability ${pPpm} ppm is outside 0..${PPM}`);
  const num = BigInt(pPpm) * BigInt(rule.stress_if_event_ppm) + BigInt(PPM - pPpm) * BigInt(rule.stress_if_no_event_ppm);
  return Number(num / BigInt(PPM));
}

/** L = floor(base x (1 - cut x w)), in kWh. */
export function hedgeLimitKwh(stressPpm: number, rule: WeatherRule = WEATHER_RULE_V1): number {
  if (!isPpm(stressPpm)) throw new RangeError(`stress weight ${stressPpm} ppm is outside 0..${PPM}`);
  const p2 = BigInt(PPM) * BigInt(PPM);
  const kept = p2 - BigInt(rule.hedge_cut_ppm) * BigInt(stressPpm);
  return Number((BigInt(rule.base_hedge_limit_kwh) * kept) / p2);
}

/** The hourly contract cap the plan obeys: never above the plan's own cap. */
export function contractCap(limitKwh: number, sizeKwh: number, planCap: number): number {
  if (!(Number.isSafeInteger(sizeKwh) && sizeKwh > 0)) throw new RangeError("contract size must be a positive integer");
  return Math.min(planCap, Math.floor(limitKwh / sizeKwh));
}

export interface StressBucket {
  /** Stress days in history order. */
  days: string[];
  /** One flag per scenario row. */
  flags: boolean[];
  /** Scenario rows in the bucket. */
  scenarios: number;
}

/**
 * The stress bucket of a scenario matrix whose rows run history day by history
 * day, `basisCount` rows each (the engine's order). Every row of a history day
 * carries the same hub settlements; the score is their sum over the stress hours.
 */
export function stressBucket(
  historyDays: readonly string[],
  basisCount: number,
  hubSum4: readonly (readonly number[])[],
  rule: WeatherRule = WEATHER_RULE_V1,
): StressBucket {
  const n = historyDays.length;
  if (!(Number.isSafeInteger(basisCount) && basisCount > 0)) throw new RangeError("basis count must be a positive integer");
  if (hubSum4.length !== n * basisCount) {
    throw new RangeError(`${hubSum4.length} scenario rows, ${n} history days x ${basisCount} basis days expected`);
  }
  const scores = historyDays.map((day, i) => {
    const first = hubSum4[i * basisCount] as readonly number[];
    for (let b = 1; b < basisCount; b++) {
      const row = hubSum4[i * basisCount + b] as readonly number[];
      if (row.length !== first.length || row.some((v, h) => v !== first[h])) {
        throw new RangeError(`history day ${day}: its scenario rows carry different hub settlements`);
      }
    }
    let score = 0;
    for (const h of rule.stress_hours) {
      const v = first[h];
      if (!Number.isSafeInteger(v)) throw new RangeError(`history day ${day}: no hub settlement at hour index ${h}`);
      score += v as number;
    }
    return { day, i, score };
  });
  const [num, den] = rule.stress_share;
  const k = Math.ceil((n * num) / den);
  const ranked = [...scores].sort((a, b) => b.score - a.score || (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const chosen = new Set(ranked.slice(0, k).map((s) => s.i));
  const flags = hubSum4.map((_, row) => chosen.has(Math.floor(row / basisCount)));
  return {
    days: historyDays.filter((_, i) => chosen.has(i)),
    flags,
    scenarios: flags.filter(Boolean).length,
  };
}

export interface ScenarioWeights {
  /** One positive integer per scenario row. */
  weights: number[];
  total: number;
}

/**
 * Integer weights that give the bucket w and the rest 1 - w, each shared equally:
 * w x (n - k) for a stress row and (10^6 - w) x k for any other, summing to k (n - k) 10^6.
 */
export function scenarioWeights(flags: readonly boolean[], stressPpm: number): ScenarioWeights {
  const n = flags.length;
  const k = flags.filter(Boolean).length;
  if (k === 0 || k === n) throw new RangeError(`a bucket of ${k} of ${n} scenarios cannot be weighted`);
  if (!(isPpm(stressPpm) && stressPpm > 0 && stressPpm < PPM)) throw new RangeError(`stress weight ${stressPpm} ppm must be strictly inside 0..${PPM}`);
  const stress = stressPpm * (n - k);
  const rest = (PPM - stressPpm) * k;
  const weights = flags.map((f) => (f ? stress : rest));
  return { weights, total: k * (n - k) * PPM };
}

/** The bucket's share under equal weights, floored to ppm. */
export function equalSharePpm(bucket: StressBucket): number {
  return Math.floor((bucket.scenarios * PPM) / bucket.flags.length);
}

export interface WeatherClaim {
  market_id: string;
  title: string;
  station: string;
  measure: "minimum temperature";
  comparator: "<";
  threshold_f: number;
  /** The market's date, YYYY-MM-DD. */
  date: string;
}

/** Why the rule does not read this market for this operating day, or null when it does. */
export function claimIneligibility(claim: WeatherClaim | null, operatingDay: string, rule: WeatherRule = WEATHER_RULE_V1): string | null {
  if (!claim) return "no Kalshi minimum-temperature market the rule reads";
  if (!rule.stations.includes(claim.station)) return `station ${claim.station} is not one the rule reads (${rule.stations.join(", ")})`;
  if (claim.measure !== rule.measure || claim.comparator !== rule.comparator) return `market ${claim.market_id} is not a ${rule.measure} ${rule.comparator} market`;
  const days = rule.event_day_offsets.map((d) => addDaysIso(operatingDay, d));
  if (!days.includes(claim.date)) return `market ${claim.market_id} is for ${claim.date}; the rule reads ${days.join(" or ")}`;
  return null;
}

/** Why a reading cannot be applied to this plan, or null when it can. */
export function weatherIneligibility(
  reading: { claim: WeatherClaim | null; probability_ppm: number | null; observed_unix: number | null },
  operatingDay: string,
  planUnix: number,
  gateUnix: number,
  rule: WeatherRule = WEATHER_RULE_V1,
): string | null {
  const claimed = claimIneligibility(reading.claim, operatingDay, rule);
  if (claimed) return claimed;
  if (reading.probability_ppm === null || !isPpm(reading.probability_ppm)) return "no probability in 0..1";
  if (reading.observed_unix === null) return "no observation time";
  if (reading.observed_unix > planUnix) return `observed at ${reading.observed_unix}, after the plan time ${planUnix}`;
  if (reading.observed_unix >= gateUnix) return `observed at ${reading.observed_unix}, at or after the gate ${gateUnix}`;
  if (planUnix - reading.observed_unix > rule.max_age_seconds) {
    return `observed ${planUnix - reading.observed_unix} s before the plan time; the rule reads at most ${rule.max_age_seconds} s old`;
  }
  return null;
}

function addDaysIso(day: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new RangeError(`not a day: ${day}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n)).toISOString().slice(0, 10);
}

/** What the rule gives for one probability. */
export function applyWeatherRule(pPpm: number, sizeKwh: number, planCap: number, rule: WeatherRule = WEATHER_RULE_V1) {
  const stress_weight_ppm = stressWeightPpm(pPpm, rule);
  const hedge_limit_kwh = hedgeLimitKwh(stress_weight_ppm, rule);
  return { stress_weight_ppm, hedge_limit_kwh, max_contracts_per_hour: contractCap(hedge_limit_kwh, sizeKwh, planCap) };
}
