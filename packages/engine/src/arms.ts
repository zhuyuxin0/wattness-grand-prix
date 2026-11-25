// The three arms share one formulation. Units inside the LP: MW, MWh and dollars.
import { hedgeCollateralCents, type Hedge, type Schedule } from "./accounting.js";
import { PPM } from "./ints.js";
import { BOUNDED_FUTURE } from "./instrument.js";
import { LpModel, solve } from "./lp.js";
import type { Scenario } from "./scenarios.js";
import { HOURS, type ArmId, type Assumptions, type BatteryRecord, type Risk } from "./types.js";

export interface ArmProblem {
  battery: BatteryRecord;
  assumptions: Assumptions;
  risk: Risk;
  entryCents: readonly number[];
  scenarios: readonly Scenario[];
}

export interface ArmSolution {
  arm: ArmId;
  schedule: Schedule;
  hedge: Hedge;
  /** The LP's own objective in dollars, before rounding to whole kW and contracts. */
  lpObjectiveUsd: number;
}

export const ARM_METHODS: Record<ArmId, string> = {
  A: "unhedged: schedule maximizing expected revenue (MILP, one binary per hour keeps charge and discharge apart)",
  B: "overlay: arm A's schedule kept; hedge chosen to maximize mean - lambda * CVaR (LP)",
  C: "joint: schedule and hedge chosen together to maximize mean - lambda * CVaR (MILP)",
};

const c = (h: number) => `c${h}`;
const d = (h: number) => `d${h}`;
const s = (h: number) => `s${h}`;
const y = (h: number) => `y${h}`;
const qs = (h: number) => `qs${h}`;
const qb = (h: number) => `qb${h}`;
const u = (k: number) => `u${k}`;

interface Shape {
  /** Fixed schedule (arm B), or null to optimize it. */
  schedule: Schedule | null;
  hedge: boolean;
  cvar: boolean;
}

function build(p: ArmProblem, shape: Shape): LpModel {
  const a = p.assumptions;
  const n = p.scenarios.length;
  const P = p.battery.maxPowerKw / 1000;
  const E = p.battery.energyKwh / 1000;
  const margin = a.socMarginKwh / 1000;
  const eta = a.roundTripPpm / PPM;
  const wear = a.wearCentsPerMwh / 100;
  const fee = BOUNDED_FUTURE.feeCentsPerContract / 100;
  const entry = p.entryCents.map((x) => x / 100);
  const m = new LpModel("max");

  // Per-scenario revenue as variable terms plus a constant, so the same pieces build the mean and the CVaR rows.
  const terms: [string, number][][] = p.scenarios.map(() => []);
  const constant = new Array<number>(n).fill(0);

  if (shape.schedule === null) {
    for (let h = 0; h < HOURS; h++) {
      m.bound(c(h), 0, P);
      m.bound(d(h), 0, P);
      m.bound(s(h), E * (a.socMinPpm / PPM) + margin, E * (a.socMaxPpm / PPM) - margin);
      m.binary(y(h));
      m.row(`soc${h}`, h === 0 ? [[s(0), 1], [c(0), -eta], [d(0), 1]] : [[s(h), 1], [s(h - 1), -1], [c(h), -eta], [d(h), 1]], "=",
        h === 0 ? E * (a.socOpenPpm / PPM) : 0);
      m.row(`chg${h}`, [[c(h), 1], [y(h), -P]], "<=", 0);
      m.row(`dis${h}`, [[d(h), 1], [y(h), P]], "<=", P);
    }
    m.row("close", [[s(HOURS - 1), 1]], ">=", E * (a.socEndMinPpm / PPM) + margin);
    m.row("cycle", Array.from({ length: HOURS }, (_, h) => [d(h), 1] as const), "<=", E * (a.maxCyclesPpm / PPM) - margin);
    p.scenarios.forEach((sc, k) => {
      for (let h = 0; h < HOURS; h++) {
        const price = sc.nodeCents[h]! / 100;
        terms[k]!.push([d(h), price - wear], [c(h), -price]);
      }
    });
  } else {
    const fixed = shape.schedule;
    p.scenarios.forEach((sc, k) => {
      for (let h = 0; h < HOURS; h++) {
        const mwh = (fixed.dischargeKw[h]! - fixed.chargeKw[h]!) / 1000;
        constant[k]! += mwh * (sc.nodeCents[h]! / 100) - (fixed.dischargeKw[h]! / 1000) * wear;
      }
    });
  }

  if (shape.hedge) {
    const collateral: [string, number][] = [];
    const capped = a.hedgeCap === "schedule";
    const size = BOUNDED_FUTURE.sizeKwh;
    for (let h = 0; h < HOURS; h++) {
      const fixed = shape.schedule;
      const sellCap = capped && fixed ? Math.floor(fixed.dischargeKw[h]! / size) : a.maxContractsPerHour;
      const buyCap = capped && fixed ? Math.floor(fixed.chargeKw[h]! / size) : a.maxContractsPerHour;
      m.bound(qs(h), 0, Math.min(a.maxContractsPerHour, sellCap));
      m.bound(qb(h), 0, Math.min(a.maxContractsPerHour, buyCap));
      if (capped && !fixed) {
        m.row(`cover_s${h}`, [[qs(h), 1], [d(h), -1000 / size]], "<=", 0);
        m.row(`cover_b${h}`, [[qb(h), 1], [c(h), -1000 / size]], "<=", 0);
      }
      m.row(`size${h}`, [[qs(h), 1], [qb(h), 1]], "<=", a.maxContractsPerHour);
      collateral.push([qs(h), BOUNDED_FUTURE.ceilingCents / 100 - entry[h]!], [qb(h), entry[h]! - BOUNDED_FUTURE.floorCents / 100]);
    }
    m.row("collateral", collateral, "<=", a.collateralBudgetCents / 100);
    p.scenarios.forEach((sc, k) => {
      for (let h = 0; h < HOURS; h++) {
        const edge = entry[h]! - sc.hubSum4[h]! / 400;
        terms[k]!.push([qs(h), edge - fee], [qb(h), -edge - fee]);
      }
    });
  }

  for (let k = 0; k < n; k++) for (const [v, coef] of terms[k]!) m.objectiveTerm(v, coef / n);

  if (shape.cvar) {
    const lambda = p.risk.lambdaPpm / PPM;
    const tailWeight = lambda / ((1 - p.risk.alphaPpm / PPM) * n);
    m.bound("t", -Infinity, Infinity);
    m.objectiveTerm("t", -lambda);
    for (let k = 0; k < n; k++) {
      // u_k >= loss_k - t, with loss_k = -(revenue terms + constant).
      m.row(`tail${k}`, [[u(k), 1], ["t", 1], ...terms[k]!], ">=", -constant[k]!);
      m.objectiveTerm(u(k), -tailWeight);
    }
  }
  return m;
}

function readSchedule(sol: { value(v: string): number }): Schedule {
  const kw = (v: string) => Math.max(0, Math.round(sol.value(v) * 1000));
  return {
    chargeKw: Array.from({ length: HOURS }, (_, h) => kw(c(h))),
    dischargeKw: Array.from({ length: HOURS }, (_, h) => kw(d(h))),
  };
}

// Whole contracts toward zero, so the size limit and the collateral budget still hold after rounding.
function readHedge(sol: { value(v: string): number }, p: ArmProblem): Hedge {
  const hedge = Array.from({ length: HOURS }, (_, h) => {
    const q = sol.value(qs(h)) - sol.value(qb(h));
    return Math.trunc(q + Math.sign(q) * 1e-6) || 0;
  });
  while (hedgeCollateralCents(hedge, p.entryCents) > p.assumptions.collateralBudgetCents) {
    let worst = -1;
    hedge.forEach((q, h) => {
      if (q !== 0 && (worst < 0 || Math.abs(q) > Math.abs(hedge[worst]!))) worst = h;
    });
    hedge[worst]! -= Math.sign(hedge[worst]!);
  }
  return hedge;
}

const zeroHedge = (): Hedge => new Array<number>(HOURS).fill(0);

export async function solveUnhedged(p: ArmProblem): Promise<ArmSolution> {
  const sol = await solve(build(p, { schedule: null, hedge: false, cvar: false }));
  return { arm: "A", schedule: readSchedule(sol), hedge: zeroHedge(), lpObjectiveUsd: sol.objective };
}

export async function solveOverlay(p: ArmProblem, schedule: Schedule): Promise<ArmSolution> {
  const sol = await solve(build(p, { schedule, hedge: true, cvar: true }));
  // The fixed schedule's expected revenue is a constant the LP leaves out of its objective.
  const physical = p.scenarios.reduce((acc, sc) => {
    let r = 0;
    for (let h = 0; h < HOURS; h++) {
      r += ((schedule.dischargeKw[h]! - schedule.chargeKw[h]!) / 1000) * (sc.nodeCents[h]! / 100);
      r -= (schedule.dischargeKw[h]! / 1000) * (p.assumptions.wearCentsPerMwh / 100);
    }
    return acc + r;
  }, 0) / p.scenarios.length;
  return { arm: "B", schedule, hedge: readHedge(sol, p), lpObjectiveUsd: sol.objective + physical };
}

export async function solveJoint(p: ArmProblem, timeLimitSeconds?: number): Promise<ArmSolution> {
  const sol = await solve(build(p, { schedule: null, hedge: true, cvar: true }), timeLimitSeconds);
  return { arm: "C", schedule: readSchedule(sol), hedge: readHedge(sol, p), lpObjectiveUsd: sol.objective };
}
