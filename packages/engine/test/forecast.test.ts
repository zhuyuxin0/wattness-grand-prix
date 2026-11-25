import { describe, expect, it } from "vitest";
import { forecastHub } from "../src/forecast.js";
import { daMap } from "../src/scenarios.js";
import { history, OD } from "./fixtures.js";

describe("forecastHub", () => {
  const hubDa = daMap(history().hub);

  it("forecasts Thanksgiving from the newest weekend days on file", () => {
    const f = forecastHub(OD, hubDa, 2)!;
    expect(f.dayType).toBe("offpeak");
    expect(f.references).toEqual([
      { day: "2026-11-22", weight: 4 },
      { day: "2026-11-21", weight: 3 },
      { day: "2026-11-15", weight: 2 },
      { day: "2026-11-14", weight: 1 },
    ]);
  });

  it("is the weighted mean, rounded half away from zero", () => {
    const f = forecastHub(OD, hubDa, 2)!;
    const h = 18;
    const exact = f.references.reduce((acc, r) => acc + r.weight * hubDa.get(r.day)![h]!, 0) / 10;
    expect(f.cents[h]).toBe(Math.sign(exact) * Math.round(Math.abs(exact)));
  });

  it("ignores days closer to the target than the lag", () => {
    const f = forecastHub("2026-11-23", hubDa, 2)!;
    expect(f.references.every((r) => r.day <= "2026-11-21")).toBe(true);
    expect(f.references[0]!.day).toBe("2026-11-20");
  });

  it("returns null when too few days of the type are on file", () => {
    expect(forecastHub("2026-10-03", hubDa, 2)).toBeNull();
  });
});
