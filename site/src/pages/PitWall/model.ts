// Figures the pit wall derives from one battery's sealed plan. Everything here
// is arithmetic on the manifest's own numbers; nothing is estimated.

import type { ArmName } from "../../data";
import type { Desk, DeskArm, DeskCommon } from "./data";

export const ARM_ORDER: ArmName[] = ["A", "B", "C"];
export const HOURS = 24;

const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dec1 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const minus = (s: string) => s.replace("-", "−");

/** $1,234.56 with a typographic minus. */
export const money = (usd: number) => minus(usd2.format(usd));
/** +$12.34 / −$12.34: a change. */
export const delta = (usd: number) => (usd > 0 ? `+${usd2.format(usd)}` : minus(usd2.format(usd)));
export const mw1 = (mw: number) => minus(dec1.format(mw));
export const num2 = (n: number) => minus(dec2.format(n));
export const count = (n: number) => minus(int.format(n));
export const pct1 = (x: number) => `${minus(dec1.format(x * 100))}%`;
/** cents per MWh as $/MWh digits. */
export const perMwh = (cents: number) => minus(dec2.format(cents / 100));
/** cents per MWh as $13.48 or −$5.90, the sign ahead of the dollar. */
export const usdMwh = (cents: number) => (cents < 0 ? `−$${dec2.format(-cents / 100)}` : `$${dec2.format(cents / 100)}`);

const pad = (n: number) => String(n).padStart(2, "0");
/** "17:00–18:00 CT" for hour 17 of the operating day. */
export const hourRange = (h: number) => `${pad(h)}:00–${pad(h + 1)}:00 CT`;
/** ERCOT's hour-ending label, HE18 for 17:00–18:00. */
export const hourEnding = (h: number) => `HE${pad(h + 1)}`;
export const hourStart = (h: number) => `${pad(h)}:00`;

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
  return {
    name,
    arm,
    mw: arm.kw.map((v) => v / 1000),
    socMwh: arm.socKwh.map((v) => v / 1000),
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
  };
}

export function allFigures(desk: Desk, common: DeskCommon): Partial<Record<ArmName, ArmFigures>> {
  const out: Partial<Record<ArmName, ArmFigures>> = {};
  for (const a of ARM_ORDER) {
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

function sameSchedule(a: DeskArm, b: DeskArm) {
  return a.kw.every((v, h) => v === b.kw[h]);
}

function listHours(hours: number[]): string {
  const names = hours.map((h) => hourStart(h));
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function describeKw(kw: number): string {
  if (kw > 0) return `discharges ${mw1(kw / 1000)} MW`;
  if (kw < 0) return `charges ${mw1(-kw / 1000)} MW`;
  return "sits idle";
}

/**
 * The race engineer's brief: what differs between the arms, in plain words,
 * built by fixed rules from the plan's figures. Each line is one claim.
 */
export function brief(desk: Desk, common: DeskCommon, figs: Partial<Record<ArmName, ArmFigures>>, active: ArmName): string[] {
  const lines: string[] = [];
  const tail = tailPercent(common);
  const lam = lambda(common);
  const sel = desk.selectedArm;
  const solved = ARM_ORDER.filter((a) => figs[a]);
  const ranked = [...solved].sort((x, y) => figs[y]!.arm.objectiveUsd - figs[x]!.arm.objectiveUsd);

  lines.push(
    `${sel} was sealed. The rule takes the arm with the highest objective, expected revenue minus ${num2(lam)} × the average loss in the worst ${tail}% of scenarios: ${ranked
      .map((a) => `${a} ${money(figs[a]!.arm.objectiveUsd)}`)
      .join(", ")}.`,
  );

  const A = figs.A;
  const B = figs.B;
  const C = figs.C;

  if (A && B) {
    if (B.contracts === 0) {
      lines.push(`B adds no contracts: at the assumed entry no hedge raised the objective, so B ends where A does.`);
    } else {
      const parts = [B.sold ? `sells ${count(B.sold)} while discharging` : "", B.bought ? `buys ${count(B.bought)} while charging` : ""].filter(Boolean);
      const hedgePart = B.arm.split ? `, of which fees are ${delta(-B.feesUsd)} and settlement against the assumed entry ${delta(B.arm.split.hedgeUsd)}` : "";
      lines.push(
        `B keeps A's schedule and trades ${count(B.contracts)} contracts in ${B.hedgedHours} ${B.hedgedHours === 1 ? "hour" : "hours"}: it ${parts.join(" and ")}. Expected revenue moves ${delta(B.arm.expectedUsd - A.arm.expectedUsd)}${hedgePart}. The worst-${tail}% average moves from ${money(A.tailUsd)} to ${money(B.tailUsd)}.`,
      );
    }
  }

  if (A && C) {
    if (sameSchedule(A.arm, C.arm)) {
      lines.push(`C settles on A's schedule too; it differs from B only in the hedge.`);
    } else {
      const changed: { h: number; d: number }[] = [];
      for (let h = 0; h < HOURS; h++) {
        const d = (C.arm.kw[h] ?? 0) - (A.arm.kw[h] ?? 0);
        if (d !== 0) changed.push({ h, d });
      }
      const top = [...changed].sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 3).sort((x, y) => x.h - y.h);
      const moves = top.map(({ h }) => `at ${hourStart(h)} it ${describeKw(C.arm.kw[h] ?? 0)} where A ${describeKw(A.arm.kw[h] ?? 0)}`);
      const shifted = changed.reduce((s, x) => s + Math.abs(x.d), 0) / 1000;
      lines.push(
        `C chooses the schedule with the hedge, moving ${mw1(shifted)} MWh across ${changed.length} ${changed.length === 1 ? "hour" : "hours"} (${listHours(changed.map((x) => x.h))}). The largest: ${moves.join("; ")}.`,
      );
    }
    const base = B ?? A;
    const vs = B ? "B" : "A";
    lines.push(
      `Against ${vs}, C's expected revenue moves ${delta(C.arm.expectedUsd - base.arm.expectedUsd)} and its worst-${tail}% average ${delta(C.tailUsd - base.tailUsd)}, so its objective is ${delta(C.arm.objectiveUsd - base.arm.objectiveUsd)} ${C.arm.objectiveUsd >= base.arm.objectiveUsd ? "higher" : "lower"}.`,
    );
  }

  const f = figs[active];
  if (f) {
    const budget = common.assumptions.collateral_budget_cents / 100;
    const floor = common.assumptions.soc_end_min_ppm / 1e6;
    const coll =
      f.arm.collateralUsd > 0 ? `posts ${money(f.arm.collateralUsd)} of collateral (${pct1(f.arm.collateralUsd / budget)} of the ${money(budget)} budget) and ` : "posts no collateral and ";
    lines.push(`${active} ${coll}ends the day at ${mw1(f.endSocMwh)} MWh, ${pct1(f.endSocShare)} of energy, against a ${pct1(floor)} floor.`);
  }
  return lines;
}
