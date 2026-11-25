// Exact accounting of a rounded schedule and hedge. kW over one hour is kWh.
import { assertInt, floorDiv, PPM, toSafe } from "./ints.js";
import { BOUNDED_FUTURE, collateralCents } from "./instrument.js";
import type { Scenario } from "./scenarios.js";
import { HOURS, type Assumptions, type BatteryRecord, type Risk } from "./types.js";

export interface Schedule {
  chargeKw: number[];
  dischargeKw: number[];
}

/** Signed contracts per hour: positive sells. */
export type Hedge = number[];

export class LimitError extends Error {
  override name = "LimitError";
}

export interface Limits {
  powerKw: number;
  socMinUkwh: bigint;
  socMaxUkwh: bigint;
  socOpenUkwh: bigint;
  socEndMinUkwh: bigint;
  dischargeCapUkwh: bigint;
}

export function limits(battery: BatteryRecord, a: Assumptions): Limits {
  assertInt(battery.maxPowerKw, "max power kW");
  assertInt(battery.energyKwh, "energy kWh");
  if (battery.maxPowerKw <= 0 || battery.energyKwh <= 0) throw new Error("battery power and energy must be positive");
  const e = BigInt(battery.energyKwh);
  return {
    powerKw: battery.maxPowerKw,
    socMinUkwh: e * BigInt(a.socMinPpm),
    socMaxUkwh: e * BigInt(a.socMaxPpm),
    socOpenUkwh: e * BigInt(a.socOpenPpm),
    socEndMinUkwh: e * BigInt(a.socEndMinPpm),
    dischargeCapUkwh: e * BigInt(a.maxCyclesPpm),
  };
}

/** State of charge at the end of each hour in micro-kWh; losses are taken on charging. */
export function socPath(battery: BatteryRecord, a: Assumptions, s: Schedule): bigint[] {
  let soc = limits(battery, a).socOpenUkwh;
  return s.chargeKw.map((c, h) => {
    soc += BigInt(c) * BigInt(a.roundTripPpm) - BigInt(s.dischargeKw[h]!) * BigInt(PPM);
    return soc;
  });
}

/** Throws a LimitError naming the first broken limit. */
export function checkLimits(battery: BatteryRecord, a: Assumptions, s: Schedule, hedge: Hedge, entry: readonly number[]): void {
  const lim = limits(battery, a);
  if (s.chargeKw.length !== HOURS || s.dischargeKw.length !== HOURS || hedge.length !== HOURS) {
    throw new LimitError("schedule and hedge need 24 hours");
  }
  let discharged = 0n;
  const soc = socPath(battery, a, s);
  for (let h = 0; h < HOURS; h++) {
    const c = s.chargeKw[h]!;
    const d = s.dischargeKw[h]!;
    assertInt(c, `charge kW hour ${h}`);
    assertInt(d, `discharge kW hour ${h}`);
    assertInt(hedge[h]!, `contracts hour ${h}`);
    if (c < 0 || d < 0 || c > lim.powerKw || d > lim.powerKw) throw new LimitError(`hour ${h}: power outside 0..${lim.powerKw} kW`);
    if (c > 0 && d > 0) throw new LimitError(`hour ${h}: charges and discharges at once`);
    if (soc[h]! < lim.socMinUkwh || soc[h]! > lim.socMaxUkwh) throw new LimitError(`hour ${h}: state of charge outside its limits`);
    if (Math.abs(hedge[h]!) > a.maxContractsPerHour) throw new LimitError(`hour ${h}: more than ${a.maxContractsPerHour} contracts`);
    if (a.hedgeCap === "schedule") {
      const covered = hedge[h]! >= 0 ? d : c;
      if (Math.abs(hedge[h]!) * BOUNDED_FUTURE.sizeKwh > covered) throw new LimitError(`hour ${h}: hedge larger than the scheduled energy`);
    }
    discharged += BigInt(d) * BigInt(PPM);
  }
  if (soc[HOURS - 1]! < lim.socEndMinUkwh) throw new LimitError("closing state of charge below its floor");
  if (discharged > lim.dischargeCapUkwh) throw new LimitError("discharged energy above the cycle cap");
  if (hedgeCollateralCents(hedge, entry) > a.collateralBudgetCents) throw new LimitError("collateral above the budget");
}

export function hedgeCollateralCents(hedge: Hedge, entry: readonly number[]): number {
  return hedge.reduce((acc, q, h) => acc + collateralCents(q, entry[h]!), 0);
}

const UUSD_PER_KWH_CENT_PER_MWH = 10n;
const UUSD_PER_CENT = 10_000n;

/** Revenue in micro-USD under one scenario. */
export function revenueUusd(a: Assumptions, s: Schedule, hedge: Hedge, entry: readonly number[], sc: Scenario): bigint {
  let r = 0n;
  for (let h = 0; h < HOURS; h++) {
    const c = BigInt(s.chargeKw[h]!);
    const d = BigInt(s.dischargeKw[h]!);
    r += (d - c) * BigInt(sc.nodeCents[h]!) * UUSD_PER_KWH_CENT_PER_MWH;
    r -= d * BigInt(a.wearCentsPerMwh) * UUSD_PER_KWH_CENT_PER_MWH;
    const q = BigInt(hedge[h]!);
    // q contracts of 1 MWh earn q x (entry - S); S is hubSum4 / 4.
    r += q * (4n * BigInt(entry[h]!) - BigInt(sc.hubSum4[h]!)) * (UUSD_PER_CENT / 4n);
    r -= (q < 0n ? -q : q) * BigInt(BOUNDED_FUTURE.feeCentsPerContract) * UUSD_PER_CENT;
  }
  return r;
}

/** Mean of the worst (1 − α) share of losses, the boundary scenario taken fractionally. Floored. */
export function cvarLoss(revenues: readonly bigint[], alphaPpm: number): bigint {
  const losses = revenues.map((r) => -r).sort((x, y) => (x > y ? -1 : x < y ? 1 : 0));
  const tail = BigInt(losses.length) * BigInt(PPM - alphaPpm);
  if (tail <= 0n) throw new Error("cvar: alpha leaves no tail");
  let left = tail;
  let acc = 0n;
  for (const l of losses) {
    if (left === 0n) break;
    const w = left < BigInt(PPM) ? left : BigInt(PPM);
    acc += w * l;
    left -= w;
  }
  return floorDiv(acc, tail);
}

export interface Evaluation {
  socUkwh: number[];
  collateralCents: number;
  expectedUusd: number;
  cvarUusd: number;
  objectiveUusd: number;
}

export function evaluate(
  battery: BatteryRecord,
  a: Assumptions,
  risk: Risk,
  s: Schedule,
  hedge: Hedge,
  entry: readonly number[],
  scenarios: readonly Scenario[],
): Evaluation {
  checkLimits(battery, a, s, hedge, entry);
  const revenues = scenarios.map((sc) => revenueUusd(a, s, hedge, entry, sc));
  const mean = floorDiv(revenues.reduce((x, y) => x + y, 0n), BigInt(revenues.length));
  const cvar = cvarLoss(revenues, risk.alphaPpm);
  const objective = floorDiv(mean * BigInt(PPM) - BigInt(risk.lambdaPpm) * cvar, BigInt(PPM));
  return {
    socUkwh: socPath(battery, a, s).map((x, h) => toSafe(x, `SOC hour ${h}`)),
    collateralCents: hedgeCollateralCents(hedge, entry),
    expectedUusd: toSafe(mean, "expected value"),
    cvarUusd: toSafe(cvar, "CVaR"),
    objectiveUusd: toSafe(objective, "objective"),
  };
}
