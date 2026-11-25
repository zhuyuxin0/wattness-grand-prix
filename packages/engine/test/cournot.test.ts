// The risk officer's reading in the engine. Without one, the sealed 26 Nov
// plans come back exactly from their own scenario matrices; with one, the
// weights and the contract cap move and every arm is re-solved under them.
import { readFileSync } from "node:fs";
import { WEATHER_RULE_V1, type WeatherClaim } from "@gatelock/core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASSUMPTIONS,
  DEFAULT_RISK,
  applyCournot,
  cvarLoss,
  cvarLossWeighted,
  entryCents,
  evaluate,
  plan,
  solveJoint,
  solveOverlay,
  solveUnhedged,
  weightedEntryCents,
  type ArmProblem,
  type ArmSolution,
  type BatteryRecord,
  type CournotReading,
  type Scenario,
  type ScenarioSet,
} from "../src/index.js";
import { GATE, PLAN_UNIX, planInput } from "./fixtures.js";

interface Leaf {
  plan_time: { unix: number };
  gate: { unix: number };
  battery: { resource: string; settlement_point: string; hub: string; zone: string | null; county: string | null; max_power_kw: number; energy_kwh: number; source: { route: string; sha256: string } };
  instrument: { entry_cents: number[] };
  arms: Record<"A" | "B" | "C", { kw: number[]; contracts: number[]; expected_uusd: number; cvar_uusd: number; objective_uusd: number; lp_objective_uusd: number }>;
}
interface Matrix { basis_days: string[]; history_days: string[]; hub_sum4: number[][]; node_cents: number[][] }

const dir = new URL("../../../fixtures/od-20261126/leaves/", import.meta.url);
function sealed(resource: string) {
  const leaf = JSON.parse(readFileSync(new URL(`${resource}.json`, dir), "utf8")) as Leaf;
  const x = JSON.parse(readFileSync(new URL(`${resource}.scenarios.json`, dir), "utf8")) as Matrix;
  const B = x.basis_days.length;
  const scenarios: Scenario[] = x.node_cents.map((node, i) => ({
    historyDay: x.history_days[Math.floor(i / B)]!,
    basisDay: x.basis_days[i % B]!,
    nodeCents: node,
    hubSum4: x.hub_sum4[i]!,
  }));
  const b = leaf.battery;
  const battery: BatteryRecord = {
    resource: b.resource, settlementPoint: b.settlement_point, hub: b.hub, zone: b.zone ?? "", county: b.county,
    maxPowerKw: b.max_power_kw, energyKwh: b.energy_kwh, source: b.source,
  };
  const set: ScenarioSet = { historyDays: x.history_days, basisDays: x.basis_days, meanBasisCents: [], scenarios };
  return { leaf, x, scenarios, battery, set };
}

async function solveAll(p: ArmProblem, jointSeconds?: number): Promise<Record<"A" | "B" | "C", ArmSolution>> {
  const A = await solveUnhedged(p);
  return { A, B: await solveOverlay(p, A.schedule), C: await solveJoint(p, jointSeconds) };
}

const claim = (date: string): WeatherClaim => ({
  market_id: "77", title: "synthetic", station: "CLIDFW", measure: "minimum temperature", comparator: "<", threshold_f: 29, date,
});
const reading = (over: Partial<CournotReading> = {}): CournotReading => ({
  claim: claim("2026-11-26"),
  probabilityPpm: 10_000,
  basis: [],
  observedUnix: 0,
  response: { route: "cournot/probability.json", sha256: "0".repeat(64) },
  failure: null,
  ...over,
});

describe("no Cournot input", () => {
  for (const resource of ["DSWL_ESS_ESR1", "CLO_ESR1"]) {
    it(`re-solves ${resource}'s sealed 26 Nov plan exactly from its scenario matrix`, async () => {
      const { leaf, x, scenarios, battery } = sealed(resource);
      const entry = entryCents(x.hub_sum4);
      expect(entry).toEqual(leaf.instrument.entry_cents);
      const p: ArmProblem = { battery, assumptions: DEFAULT_ASSUMPTIONS, risk: DEFAULT_RISK, entryCents: entry, scenarios };
      const arms = await solveAll(p, resource === "DSWL_ESS_ESR1" ? undefined : 5);
      for (const id of ["A", "B", "C"] as const) {
        const s = arms[id];
        const e = evaluate(battery, DEFAULT_ASSUMPTIONS, DEFAULT_RISK, s.schedule, s.hedge, entry, scenarios);
        const want = leaf.arms[id];
        expect(s.schedule.dischargeKw.map((d, h) => d - s.schedule.chargeKw[h]!), `${id} kw`).toEqual(want.kw);
        expect(s.hedge, `${id} contracts`).toEqual(want.contracts);
        expect([e.expectedUusd, e.cvarUusd, e.objectiveUusd, Math.round(s.lpObjectiveUsd * 1e6)], id).toEqual([
          want.expected_uusd, want.cvar_uusd, want.objective_uusd, want.lp_objective_uusd,
        ]);
      }
    });
  }

  it("unit weights give the equal-weight entry and CVaR exactly", () => {
    const { x } = sealed("CLO_ESR1");
    const ones = x.hub_sum4.map(() => 1);
    expect(weightedEntryCents(x.hub_sum4, ones, ones.length)).toEqual(entryCents(x.hub_sum4));
    const revenues = x.node_cents.map((row) => BigInt(row.reduce((a, b) => a + b, 0)) * 1_000n - 300_000_000n);
    expect(cvarLossWeighted(revenues, { weights: ones, total: ones.length }, 900_000)).toBe(cvarLoss(revenues, 900_000));
  });

  it("keeps outside_inputs null and every other field as before", async () => {
    const { manifest } = await plan(planInput());
    expect(manifest.outside_inputs).toBeNull();
    expect((manifest.scenarios as { weighting: string }).weighting).toBe("equal");
    expect((manifest.risk as { objective: string }).objective).toBe("mean revenue - lambda * CVaR_alpha(loss), over the equally weighted scenarios");
  });
});

describe("a Cournot reading before the gate", () => {
  it("re-weights the stress bucket, lowers the contract cap and re-solves every arm under both (DSWL_ESS_ESR1, p 0.01)", async () => {
    const { leaf, x, scenarios, battery, set } = sealed("DSWL_ESS_ESR1");
    const r = reading({ observedUnix: leaf.plan_time.unix - 60 });
    const o = applyCournot(r, "2026-11-26", leaf.plan_time.unix, leaf.gate.unix, set, DEFAULT_ASSUMPTIONS);
    expect(o.record.status).toBe("applied");
    expect(o.record.after).toEqual({ stress_weight_ppm: 255_500, hedge_limit_kwh: 43_612, max_contracts_per_hour: 43 });
    expect(o.record.before).toEqual({ stress_weight_ppm: 255_813, max_contracts_per_hour: 100 });
    // ceil(43 / 4) = 11 history days, 7 basis days each.
    expect(o.record.stress).toEqual({
      days: ["2026-10-07", "2026-10-08", "2026-10-26", "2026-10-30", "2026-10-31", "2026-11-03", "2026-11-07", "2026-11-08", "2026-11-10", "2026-11-11", "2026-11-12"],
      scenarios: 77,
    });
    expect(o.assumptions.maxContractsPerHour).toBe(43);
    const w = o.weights!;
    const stressMass = w.weights.reduce((acc, v, i) => (o.record.stress!.days.includes(scenarios[i]!.historyDay) ? acc + v : acc), 0);
    expect(stressMass * 1_000_000).toBe(255_500 * w.total);

    const entry = weightedEntryCents(x.hub_sum4, w.weights, w.total);
    const arms = await solveAll({ battery, assumptions: o.assumptions, risk: DEFAULT_RISK, entryCents: entry, scenarios, weights: w });
    const objective: Record<string, number> = {};
    for (const id of ["A", "B", "C"] as const) {
      const s = arms[id];
      expect(Math.max(...s.hedge.map(Math.abs)), id).toBeLessThanOrEqual(43);
      const e = evaluate(battery, o.assumptions, DEFAULT_RISK, s.schedule, s.hedge, entry, scenarios, w);
      objective[id] = e.objectiveUusd;
    }
    // The sealed plan held 100 contracts in some hours; under the cap the hedged arms give up objective, and C still leads.
    expect(Math.max(...leaf.arms.B.contracts.map(Math.abs))).toBe(100);
    expect(objective.B).toBeLessThan(leaf.arms.B.objective_uusd);
    expect(objective.C).toBeLessThan(leaf.arms.C.objective_uusd);
    expect(objective.C).toBeGreaterThan(objective.B!);
    expect(objective.B).toBeGreaterThan(objective.A!);
  });

  it("moves with the probability: the rule's prior 0.30 weights stress at 0.415 and caps 39 contracts", () => {
    const { leaf, set } = sealed("DSWL_ESS_ESR1");
    const o = applyCournot(reading({ probabilityPpm: 300_000, observedUnix: leaf.plan_time.unix }), "2026-11-26", leaf.plan_time.unix, leaf.gate.unix, set, DEFAULT_ASSUMPTIONS);
    expect(o.record.after).toEqual({ stress_weight_ppm: 415_000, hedge_limit_kwh: 39_625, max_contracts_per_hour: 39 });
  });

  it("records why it was not applied and leaves the plan as without it", async () => {
    const base = await plan(planInput());
    const late = await plan({ ...planInput(), cournot: reading({ observedUnix: PLAN_UNIX + 1 }) });
    const wrongDay = await plan({ ...planInput(), cournot: reading({ claim: claim("2026-11-24"), observedUnix: PLAN_UNIX - 5 }) });
    const failed = await plan({ ...planInput(), cournot: reading({ claim: null, probabilityPpm: null, observedUnix: null, response: null, failure: "the call failed: rate_limited: no retry" }) });
    for (const [p, reason] of [
      [late, /after the plan time/],
      [wrongDay, /is for 2026-11-24; the rule reads 2026-11-26 or 2026-11-25/],
      [failed, /^the call failed: rate_limited/],
    ] as const) {
      const c = p.manifest.outside_inputs as { cournot: { status: string; reason: string; after: unknown; rule: unknown } };
      expect(c.cournot.status).toBe("not_applied");
      expect(c.cournot.reason).toMatch(reason);
      expect(c.cournot.after).toBeNull();
      expect(c.cournot.rule).toEqual(WEATHER_RULE_V1);
      expect({ ...p.manifest, outside_inputs: null }).toEqual(base.manifest);
    }
  });

  it("re-solves a full plan under the reading", async () => {
    const applied = await plan({ ...planInput(), cournot: reading({ observedUnix: PLAN_UNIX - 30 }) });
    const c = (applied.manifest.outside_inputs as { cournot: { status: string } }).cournot;
    expect(c.status).toBe("applied");
    expect(applied.weights).toBeDefined();
    expect((applied.manifest.assumptions as { max_contracts_per_hour: number }).max_contracts_per_hour).toBe(43);
    expect((applied.manifest.scenarios as { weighting: string }).weighting).toMatch(/^stress-weighted/);
    expect(applied.manifest.gate).toEqual({ unix: GATE, local: "2026-11-25T10:00:00-06:00" });
  });
});
