import { describe, expect, it } from "vitest";
import { MANIFEST_SCHEMA, plan, PlanInputError, ExcludedDayError } from "../src/index.js";
import { GATE, hubDay, planInput } from "./fixtures.js";

function walk(x: unknown, path: string, out: string[]): void {
  if (typeof x === "number" && !Number.isSafeInteger(x)) out.push(path);
  else if (Array.isArray(x)) x.forEach((v, i) => walk(v, `${path}[${i}]`, out));
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) walk(v, `${path}.${k}`, out);
}

describe("plan", () => {
  it("builds a manifest of integers, strings, booleans and nulls", async () => {
    const { manifest } = await plan(planInput());
    expect(manifest.schema).toBe(MANIFEST_SCHEMA);
    const bad: string[] = [];
    walk(manifest, "$", bad);
    expect(bad).toEqual([]);
  });

  it("is reproducible from the same inputs and salt", async () => {
    const one = JSON.stringify((await plan(planInput())).manifest);
    const two = JSON.stringify((await plan(planInput())).manifest);
    expect(one).toBe(two);
  });

  it("records the gate, the reference days and the history it used", async () => {
    const { manifest, scenarios } = await plan(planInput());
    expect(manifest.gate).toEqual({ unix: GATE, local: "2026-11-25T10:00:00-06:00" });
    const f = manifest.forecast as { lag_days: number; reference_days: { day: string }[] };
    expect(f.lag_days).toBe(2);
    expect(f.reference_days.map((r) => r.day)).toEqual(["2026-11-22", "2026-11-21", "2026-11-15", "2026-11-14"]);
    expect(scenarios.basisDays).toEqual(["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24"]);
    expect(scenarios.historyDays.at(-1)).toBe("2026-11-23");
    expect(scenarios.historyDays.every((d) => d >= "2026-09-30")).toBe(true);
    expect(scenarios.scenarios.length).toBe(scenarios.historyDays.length * 7);
  });

  it("solves all three arms and selects by objective", async () => {
    const { manifest, arms } = await plan(planInput());
    const a = manifest.arms as Record<string, { kw: number[]; objective_uusd: number } | null>;
    expect(a.B!.kw).toEqual(a.A!.kw);
    expect(a.C).not.toBeNull();
    const best = (["A", "B", "C"] as const).reduce((x, y) => (arms[y]!.evaluation.objectiveUusd > arms[x]!.evaluation.objectiveUusd ? y : x));
    expect(manifest.selected_arm).toBe(best);
  });

  it("leaves C out when asked, without touching A and B", async () => {
    const full = (await plan(planInput())).manifest.arms as Record<string, unknown>;
    const { manifest } = await plan(planInput({ arms: ["A", "B"] }));
    const arms = manifest.arms as Record<string, unknown>;
    expect(arms.C).toBeNull();
    expect(arms.A).toEqual(full.A);
    expect(arms.B).toEqual(full.B);
  });

  it("refuses an excluded day before reading any price", async () => {
    const input = planInput();
    await expect(plan({ ...input, hub: [hubDay("2026-09-15", true), ...input.hub] })).rejects.toThrow(ExcludedDayError);
  });

  it("refuses a plan at or after the gate", async () => {
    await expect(plan(planInput({ planUnix: GATE }))).rejects.toThrow(PlanInputError);
  });

  it("refuses prices for the operating day itself", async () => {
    const input = planInput();
    await expect(plan({ ...input, hub: [...input.hub, hubDay("2026-11-26", false)] })).rejects.toThrow(/not before the operating day/);
  });

  it("refuses prices for another point", async () => {
    const input = planInput();
    await expect(plan({ ...input, hub: [{ ...input.hub[0]!, point: "HB_NORTH" }] })).rejects.toThrow(/battery's hub/);
  });

  it("refuses a salt that is not 32 bytes", async () => {
    await expect(plan(planInput({ salt: "0x1234" }))).rejects.toThrow(/salt/);
  });
});
