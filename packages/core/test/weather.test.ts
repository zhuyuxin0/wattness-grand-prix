import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  WEATHER_RULE_V1,
  applyWeatherRule,
  claimIneligibility,
  contractCap,
  equalSharePpm,
  hedgeLimitKwh,
  manifestShapeErrors,
  scenarioWeights,
  stressBucket,
  stressWeightPpm,
  weatherIneligibility,
  type WeatherClaim,
} from "../src/index.js";

const claim = (over: Partial<WeatherClaim> = {}): WeatherClaim => ({
  market_id: "77",
  title: "synthetic",
  station: "CLIDFW",
  measure: "minimum temperature",
  comparator: "<",
  threshold_f: 29,
  date: "2026-11-27",
  ...over,
});

describe("gate-record.weather-stress.v1", () => {
  it("reproduces the 25 Nov review: p 0.30 -> 0.415 and 39.625 MWh, p 0.01 -> 0.2555 and 43.6125 MWh", () => {
    expect(applyWeatherRule(WEATHER_RULE_V1.prior_event_ppm, 1_000, 100)).toEqual({
      stress_weight_ppm: 415_000,
      hedge_limit_kwh: 39_625,
      max_contracts_per_hour: 39,
    });
    // 43.6125 MWh is 43,612.5 kWh, floored to the kWh; the cap is whole contracts.
    expect(applyWeatherRule(10_000, 1_000, 100)).toEqual({ stress_weight_ppm: 255_500, hedge_limit_kwh: 43_612, max_contracts_per_hour: 43 });
  });

  it("is exact in integers and floors", () => {
    expect(stressWeightPpm(0)).toBe(250_000);
    expect(stressWeightPpm(1_000_000)).toBe(800_000);
    // 250000 + 12345 x 0.55 = 256789.75
    expect(stressWeightPpm(12_345)).toBe(256_789);
    expect(hedgeLimitKwh(800_000)).toBe(30_000);
    expect(hedgeLimitKwh(250_000)).toBe(43_750);
    expect(() => stressWeightPpm(1_000_001)).toThrow(RangeError);
    expect(() => stressWeightPpm(0.5)).toThrow(RangeError);
  });

  it("never raises the plan's own contract cap", () => {
    expect(contractCap(43_612, 1_000, 100)).toBe(43);
    expect(contractCap(43_612, 1_000, 10)).toBe(10);
    expect(contractCap(999, 1_000, 100)).toBe(0);
  });

  it("puts the top quarter of history days by winter-peak settlements in the bucket, ties to the later day", () => {
    const days = ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"].map((d, i) => `2026-11-0${i + 1}`);
    // Two basis rows per history day; score = the sum over hour indexes 6..9 and 17..20.
    const score = [10, 50, 30, 50, 20, 5, 40, 1];
    const rows = days.flatMap((_, i) => {
      const row = Array.from({ length: 24 }, (_, h) => (WEATHER_RULE_V1.stress_hours.includes(h) ? score[i]! : 1_000));
      return [row, [...row]];
    });
    const b = stressBucket(days, 2, rows);
    // ceil(8 / 4) = 2 days: the two scoring 50; the earlier 30 is out.
    expect(b.days).toEqual(["2026-11-02", "2026-11-04"]);
    expect(b.scenarios).toBe(4);
    expect(b.flags).toEqual([false, false, true, true, false, false, true, true, false, false, false, false, false, false, false, false]);
    expect(equalSharePpm(b)).toBe(250_000);

    // A tie at the cut goes to the later day.
    const tie = [9, 9, 9, 1, 1, 1, 1, 1];
    const tied = days.flatMap((_, i) => [Array.from({ length: 24 }, (_, h) => (WEATHER_RULE_V1.stress_hours.includes(h) ? tie[i]! : 0))]);
    expect(stressBucket(days, 1, tied).days).toEqual(["2026-11-02", "2026-11-03"]);
  });

  it("refuses a matrix whose rows are not history day by basis day", () => {
    const row = Array.from({ length: 24 }, () => 4);
    expect(() => stressBucket(["2026-11-01", "2026-11-02"], 2, [row, row, row])).toThrow(/3 scenario rows/);
    expect(() => stressBucket(["2026-11-01"], 2, [row, row.map((v) => v + 1)])).toThrow(/different hub settlements/);
  });

  it("weights the bucket w and the rest 1 - w, equally inside each", () => {
    const flags = [true, false, false, false, true, false, false];
    const { weights, total } = scenarioWeights(flags, 255_500);
    expect(weights.reduce((a, b) => a + b, 0)).toBe(total);
    const stress = weights.filter((_, i) => flags[i]).reduce((a, b) => a + b, 0);
    expect(stress * 1_000_000).toBe(255_500 * total);
    expect(new Set(weights.filter((_, i) => flags[i])).size).toBe(1);
    expect(new Set(weights.filter((_, i) => !flags[i])).size).toBe(1);
    expect(() => scenarioWeights([true, true], 255_500)).toThrow(/cannot be weighted/);
    expect(() => scenarioWeights([false, false], 255_500)).toThrow(/cannot be weighted/);
  });

  it("reads a Dallas minimum below a threshold on the operating day or the day before, observed before plan time and the gate", () => {
    const gate = 1_795_708_800; // 2026-11-26 10:00 CT, the gate for 27 Nov
    const plan = gate - 1_800;
    const ok = { claim: claim(), probability_ppm: 10_000, observed_unix: plan - 60 };
    expect(weatherIneligibility(ok, "2026-11-27", plan, gate)).toBeNull();
    expect(weatherIneligibility({ ...ok, claim: claim({ date: "2026-11-26" }) }, "2026-11-27", plan, gate)).toBeNull();
    expect(weatherIneligibility({ ...ok, claim: claim({ date: "2026-11-25" }) }, "2026-11-27", plan, gate)).toMatch(/is for 2026-11-25/);
    expect(weatherIneligibility({ ...ok, claim: claim({ station: "CLIHOU" }) }, "2026-11-27", plan, gate)).toMatch(/station CLIHOU/);
    expect(weatherIneligibility({ ...ok, claim: null }, "2026-11-27", plan, gate)).toMatch(/no Kalshi minimum-temperature market/);
    expect(weatherIneligibility({ ...ok, observed_unix: plan + 1 }, "2026-11-27", plan, gate)).toMatch(/after the plan time/);
    expect(weatherIneligibility({ ...ok, observed_unix: plan - 86_401 }, "2026-11-27", plan, gate)).toMatch(/at most 86400 s old/);
    expect(weatherIneligibility({ ...ok, probability_ppm: null }, "2026-11-27", plan, gate)).toMatch(/no probability/);
    expect(claimIneligibility(claim(), "2026-11-27")).toBeNull();
  });
});

describe("the manifest schema across the transition", () => {
  const leaf = JSON.parse(readFileSync(new URL("../../../fixtures/od-20261126/leaves/DSWL_ESS_ESR1.json", import.meta.url), "utf8"));

  it("still accepts the sealed 26 Nov leaves, whose outside_inputs is null", () => {
    expect(leaf.outside_inputs).toBeNull();
    expect(manifestShapeErrors(leaf)).toEqual([]);
  });

  it("accepts a Cournot input and names a malformed one's field", () => {
    const cournot = {
      status: "not_applied",
      reason: "the call failed: rate_limited",
      rule: WEATHER_RULE_V1,
      claim: claim(),
      probability_ppm: null,
      basis: [],
      observed: null,
      response: null,
      stress: null,
      before: { stress_weight_ppm: 255_813, max_contracts_per_hour: 100 },
      after: null,
    };
    expect(manifestShapeErrors({ ...leaf, outside_inputs: { cournot } })).toEqual([]);
    const bad = { ...cournot, probability_ppm: 0.01, claim: { ...claim(), date: "27 Nov" } };
    expect(manifestShapeErrors({ ...leaf, outside_inputs: { cournot: bad } })).toEqual([
      "$.outside_inputs.cournot.claim.date: expected YYYY-MM-DD",
      "$.outside_inputs.cournot.probability_ppm: expected non-negative integer",
    ]);
    expect(manifestShapeErrors({ ...leaf, outside_inputs: { other: 1 } })).toContain("$.outside_inputs.cournot: missing");
  });
});
