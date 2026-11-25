import { describe, expect, it } from "vitest";
import { evaluate } from "../src/accounting.js";
import { solveJoint, solveOverlay, solveUnhedged, type ArmProblem } from "../src/arms.js";
import type { Scenario } from "../src/scenarios.js";
import { DEFAULT_ASSUMPTIONS, DEFAULT_RISK } from "../src/types.js";
import { BATTERY } from "./fixtures.js";

// Cheap midday, dear evening; the hub's real-time price spreads around the entry across scenarios.
function scenarios(): Scenario[] {
  return Array.from({ length: 20 }, (_, k) => ({
    historyDay: `h${k}`,
    basisDay: "b",
    nodeCents: Array.from({ length: 24 }, (_, h) => (h >= 18 && h <= 20 ? 8_000 + 600 * (k - 10) : h >= 11 && h <= 13 ? 1_000 : 3_000)),
    hubSum4: Array.from({ length: 24 }, (_, h) => 4 * (h >= 18 && h <= 20 ? 7_500 + 600 * (k - 10) : 3_000)),
  }));
}

const problem: ArmProblem = {
  battery: BATTERY,
  assumptions: DEFAULT_ASSUMPTIONS,
  risk: DEFAULT_RISK,
  entryCents: Array.from({ length: 24 }, (_, h) => (h >= 18 && h <= 20 ? 7_500 : 3_000)),
  scenarios: scenarios(),
};
const score = (s: Awaited<ReturnType<typeof solveUnhedged>>) =>
  evaluate(BATTERY, DEFAULT_ASSUMPTIONS, DEFAULT_RISK, s.schedule, s.hedge, problem.entryCents, problem.scenarios);

describe("arms", () => {
  it("A buys in the cheap hours, sells in the dear ones, and stays inside every limit", async () => {
    const a = await solveUnhedged(problem);
    expect(a.hedge.every((q) => q === 0)).toBe(true);
    for (const h of [11, 12, 13]) expect(a.schedule.dischargeKw[h]).toBe(0);
    for (const h of [18, 19, 20]) expect(a.schedule.chargeKw[h]).toBe(0);
    expect(a.schedule.chargeKw.slice(11, 14).reduce((x, y) => x + y, 0)).toBeGreaterThan(100_000);
    expect(a.schedule.dischargeKw.slice(18, 21).reduce((x, y) => x + y, 0)).toBeGreaterThan(100_000);
    expect(() => score(a)).not.toThrow();
  });

  it("B keeps A's schedule and sells the evening against its risk", async () => {
    const a = await solveUnhedged(problem);
    const b = await solveOverlay(problem, a.schedule);
    expect(b.schedule).toEqual(a.schedule);
    expect(b.hedge.slice(18, 21).reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
    expect(b.hedge.every((q) => q >= 0)).toBe(true);
    expect(score(b).cvarUusd).toBeLessThan(score(a).cvarUusd);
    expect(score(b).objectiveUusd).toBeGreaterThan(score(a).objectiveUusd);
  });

  it("C does at least as well as B on the LP objective", async () => {
    const a = await solveUnhedged(problem);
    const b = await solveOverlay(problem, a.schedule);
    const c = await solveJoint(problem);
    expect(c.lpObjectiveUsd).toBeGreaterThanOrEqual(b.lpObjectiveUsd - 1e-6);
    expect(() => score(c)).not.toThrow();
  });

  it("B buys nothing when the hedge has no risk to take off", async () => {
    const flat = { ...problem, scenarios: problem.scenarios.slice(10, 11) };
    const a = await solveUnhedged(flat);
    const b = await solveOverlay(flat, a.schedule);
    // One scenario: the hedge's edge equals its settlement gap, so a fee-paying position never helps.
    expect(b.hedge.every((q) => q === 0)).toBe(true);
  });
});
