// Figures the Battery tab and the agent tabs derive from one battery's sealed
// plan. Everything here is arithmetic on the published plan's own numbers;
// nothing is estimated.

import type { ArmName } from "../../data";
import type { Desk, DeskArm, DeskCommon } from "../../data/plan";
import { count, HOURS, hourStart, money, moneyWords, mw1, num2, pct1, PLANS } from "./kit";

export { HOURS, PLANS as ARM_ORDER };

export interface ArmFigures {
  name: ArmName;
  arm: DeskArm;
  mw: number[];
  socMwh: number[];
  dischargeMwh: number;
  chargeMwh: number;
  contracts: number;
  sold: number;
  bought: number;
  hedgedHours: number;
  feesUsd: number;
  /** Mean revenue over the worst (1 − α) share of scenarios: −CVaR. */
  tailUsd: number;
  endSocMwh: number;
  endSocShare: number;
  minSocMwh: number;
  maxSocMwh: number;
  /** Discharged energy over the battery's energy: full cycles. */
  cycles: number;
}

export function figures(desk: Desk, common: DeskCommon, name: ArmName): ArmFigures | null {
  const arm = desk.arms[name];
  if (!arm) return null;
  let discharge = 0;
  let charge = 0;
  let sold = 0;
  let bought = 0;
  let hedgedHours = 0;
  for (let h = 0; h < HOURS; h++) {
    const kw = arm.kw[h] ?? 0;
    if (kw > 0) discharge += kw;
    else charge -= kw;
    const q = arm.contracts[h] ?? 0;
    if (q > 0) sold += q;
    if (q < 0) bought -= q;
    if (q !== 0) hedgedHours++;
  }
  const contracts = sold + bought;
  const end = arm.socKwh[HOURS - 1] ?? 0;
  const soc = arm.socKwh.map((v) => v / 1000);
  return {
    name,
    arm,
    mw: arm.kw.map((v) => v / 1000),
    socMwh: soc,
    dischargeMwh: discharge / 1000,
    chargeMwh: charge / 1000,
    contracts,
    sold,
    bought,
    hedgedHours,
    feesUsd: arm.split ? -arm.split.feesUsd : (contracts * common.instrument.fee_cents_per_contract) / 100,
    tailUsd: -arm.cvarUsd,
    endSocMwh: end / 1000,
    endSocShare: end / desk.energyKwh,
    minSocMwh: Math.min(...soc),
    maxSocMwh: Math.max(...soc),
    cycles: discharge / desk.energyKwh,
  };
}

export function allFigures(desk: Desk, common: DeskCommon): Partial<Record<ArmName, ArmFigures>> {
  const out: Partial<Record<ArmName, ArmFigures>> = {};
  for (const a of PLANS) {
    const f = figures(desk, common, a);
    if (f) out[a] = f;
  }
  return out;
}

/** The share of scenarios the tail covers, e.g. 10 for α = 90%. */
export const tailPercent = (common: DeskCommon) => Math.round((1_000_000 - common.risk.alpha_ppm) / 10_000);
export const lambda = (common: DeskCommon) => common.risk.lambda_ppm / 1_000_000;

export function startSocMwh(desk: Desk, common: DeskCommon) {
  return (desk.energyKwh * common.assumptions.soc_open_ppm) / 1e9;
}

export function sameSchedule(a: DeskArm, b: DeskArm) {
  return a.kw.every((v, h) => v === b.kw[h]);
}

/** The hours where C's schedule departs from A's, and the energy it moves. */
export function scheduleShift(a: DeskArm, c: DeskArm) {
  const hours: number[] = [];
  let kw = 0;
  for (let h = 0; h < HOURS; h++) {
    const d = (c.kw[h] ?? 0) - (a.kw[h] ?? 0);
    if (d !== 0) {
      hours.push(h);
      kw += Math.abs(d);
    }
  }
  return { hours, mwh: kw / 1000 };
}

function listHours(hours: number[]): string {
  const names = hours.map((h) => hourStart(h));
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * What differs between the plans, in plain sentences built by fixed rules from
 * the plan's figures: which plan was sealed and why, what the hedge on A's
 * schedule does, and what choosing the schedule with the hedge changes.
 */
export function differences(desk: Desk, common: DeskCommon, figs: Partial<Record<ArmName, ArmFigures>>): string[] {
  const lines: string[] = [];
  const tail = tailPercent(common);
  const sel = desk.selectedArm;
  const solved = PLANS.filter((a) => figs[a]);
  const others = solved.filter((a) => a !== sel);
  const S = figs[sel];
  if (S) {
    const tied = others.filter((a) => figs[a]!.arm.objectiveUsd === S.arm.objectiveUsd);
    const rest = others.filter((a) => !tied.includes(a));
    const restText = rest.map((a) => `${money(figs[a]!.arm.objectiveUsd)} for ${a}`).join(" and ");
    lines.push(
      tied.length
        ? `Plan ${sel} was sealed: its score, ${money(S.arm.objectiveUsd)}, ties ${tied.map((a) => `plan ${a}'s`).join(" and ")}, and a tie goes to the earlier plan${restText ? `; ${restText}` : ""}.`
        : `Plan ${sel} was sealed because it has the highest score, ${money(S.arm.objectiveUsd)}${restText ? `, against ${restText}` : ""}.`,
    );
  }

  const A = figs.A;
  const B = figs.B;
  const C = figs.C;
  if (A && B) {
    if (B.contracts === 0) {
      lines.push(`Plan B adds no contracts: at the assumed entry no hedge raised the score, so B ends where A does.`);
    } else {
      const cost = A.arm.expectedUsd - B.arm.expectedUsd;
      lines.push(
        `Plan B keeps A's schedule and trades ${count(B.contracts)} contracts over ${B.hedgedHours} ${B.hedgedHours === 1 ? "hour" : "hours"}. Its expected revenue is ${cost >= 0 ? `${money(cost)} lower` : `${money(-cost)} higher`}, and its worst-${tail}% average rises from ${moneyWords(A.tailUsd)} to ${moneyWords(B.tailUsd)}.`,
      );
    }
  }
  if (A && C) {
    const base = B ?? A;
    const vs = B ? "B" : "A";
    const sameSched = sameSchedule(A.arm, C.arm);
    const sameHedge = C.arm.contracts.every((q, h) => q === (base.arm.contracts[h] ?? 0));
    if (sameSched && sameHedge) {
      lines.push(`Plan C, choosing schedule and hedge together, lands on plan ${vs}'s choices: the same schedule and the same contracts.`);
    } else {
      const dMean = C.arm.expectedUsd - base.arm.expectedUsd;
      const dTail = C.tailUsd - base.tailUsd;
      const lead = sameSched
        ? `Plan C keeps A's schedule too and differs from ${vs} only in its hedge.`
        : (() => {
            const { hours, mwh } = scheduleShift(A.arm, C.arm);
            return `Plan C chooses its schedule with its hedge, moving ${mw1(mwh)} MWh across ${hours.length} ${hours.length === 1 ? "hour" : "hours"} (${listHours(hours)}).`;
          })();
      lines.push(
        `${lead} Against ${vs} its expected revenue is ${dMean >= 0 ? `${money(dMean)} higher` : `${money(-dMean)} lower`} and its worst-${tail}% average ${dTail >= 0 ? `${money(dTail)} higher` : `${money(-dTail)} lower`}.`,
      );
    }
  }

  if (S) {
    const budget = common.assumptions.collateral_budget_cents / 100;
    const floor = common.assumptions.soc_end_min_ppm / 1e6;
    lines.push(
      `Plan ${sel} ${S.arm.collateralUsd > 0 ? `posts ${money(S.arm.collateralUsd)} of collateral, ${pct1(S.arm.collateralUsd / budget)} of the ${money(budget)} budget, and ` : ""}ends the day at ${mw1(S.endSocMwh)} MWh, ${pct1(S.endSocShare)} of its energy, against a floor of ${pct1(floor)}.`,
    );
  }
  return lines;
}

/** "mean − 0.50 × CVaR" as the score's formula reads in a label. */
export const scoreFormula = (common: DeskCommon) => `mean − ${num2(lambda(common))} × CVaR`;
