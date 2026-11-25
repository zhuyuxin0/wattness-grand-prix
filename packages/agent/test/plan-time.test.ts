// The plan-time stamp against a reading taken just before it: the reading's
// second is rounded up, the stamp's down, so the stamp waits that second out.
import { weatherIneligibility } from "@gatelock/core";
import { describe, expect, it } from "vitest";
import { STAMP_WAIT_MS, stampPlanTime } from "../src/plan-day.js";

const clock = (startMs: number) => {
  let t = startMs;
  const slept: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      slept.push(ms);
      t += ms;
    },
    slept,
  };
};

describe("the plan-time stamp", () => {
  it("waits out the second a reading arrived in, so the reading is never after the plan", async () => {
    // Received at 14:59:00.400Z: observed 14:59:01, rounded up. Inputs loaded by 14:59:00.700Z.
    const received = Date.parse("2026-11-26T14:59:00.400Z");
    const observed = Math.ceil(received / 1000);
    const c = clock(received + 300);
    const plan = await stampPlanTime(c.now, observed, c.sleep);
    expect(c.slept).toEqual([300]);
    expect(plan).toBe(observed);
    const gate = Date.parse("2026-11-26T16:00:00Z") / 1000;
    const claim = { market_id: "77", title: "t", station: "CLIDFW", measure: "minimum temperature" as const, comparator: "<" as const, threshold_f: 33, date: "2026-11-27" };
    expect(weatherIneligibility({ claim, probability_ppm: 200_000, observed_unix: observed }, "2026-11-27", plan, gate)).toBeNull();
    // Without the wait the stamp would be a second early and the rule would refuse the reading.
    expect(weatherIneligibility({ claim, probability_ppm: 200_000, observed_unix: observed }, "2026-11-27", Math.floor((received + 300) / 1000), gate)).toMatch(/after the plan time/);
  });

  it("does not wait for a reading already in the past, or with none", async () => {
    const c = clock(Date.parse("2026-11-26T15:00:00.250Z"));
    expect(await stampPlanTime(c.now, Date.parse("2026-11-26T14:00:00Z") / 1000, c.sleep)).toBe(Date.parse("2026-11-26T15:00:00Z") / 1000);
    expect(await stampPlanTime(c.now, null, c.sleep)).toBe(Date.parse("2026-11-26T15:00:00Z") / 1000);
    expect(c.slept).toEqual([]);
  });

  it("never waits longer than its limit for a reading timed ahead of the clock", async () => {
    const start = Date.parse("2026-11-26T15:00:00Z");
    const c = clock(start);
    const plan = await stampPlanTime(c.now, start / 1000 + 60, c.sleep);
    expect(c.slept).toEqual([]);
    expect(plan).toBe(start / 1000);
    expect(STAMP_WAIT_MS).toBeLessThanOrEqual(2_000);
  });
});
