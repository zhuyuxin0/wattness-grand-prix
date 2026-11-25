import type { Day } from "./calendar.js";

export const HOURS = 24;
export const INTERVALS = 96;

/**
 * One operating day of prices at one settlement point, in whole cents per MWh.
 * `da` is the day-ahead SPP by hour (24 values); `rt15` the first-published
 * real-time 15-minute SPPs (96 values). Either is null when not on file.
 */
export interface PriceDay {
  point: string;
  day: Day;
  da: readonly number[] | null;
  rt15: readonly number[] | null;
}

export interface SourceFile {
  route: string;
  sha256: string;
}

/** The battery's row in the public storage census. */
export interface BatteryRecord {
  resource: string;
  settlementPoint: string;
  hub: string;
  zone: string;
  county: string | null;
  maxPowerKw: number;
  energyKwh: number;
  source: SourceFile;
}

/** Everything the plan read, as the data lane records it. */
export interface Provenance {
  releaseId: string;
  releaseGeneratedUnix: number;
  manifestSha256: string;
  files: readonly SourceFile[];
  live: readonly SourceFile[];
}

/** Values the plan assumes rather than reads. All integers; ppm is parts per million. */
export interface Assumptions {
  roundTripPpm: number;
  socMinPpm: number;
  socMaxPpm: number;
  socOpenPpm: number;
  socEndMinPpm: number;
  /** Kept between the LP's SOC limits and the declared ones so rounding to whole kW cannot cross them. */
  socMarginKwh: number;
  /** Discharged energy over the day, as a fraction of nameplate energy. */
  maxCyclesPpm: number;
  wearCentsPerMwh: number;
  maxContractsPerHour: number;
  collateralBudgetCents: number;
  /**
   * "schedule": an hour's hedge sells no more MWh than the schedule discharges and buys no more than it charges.
   * "size": only the per-hour contract limit applies. With entry assumed at the plan's own forecast, the
   * hedge's expected gain is that forecast's historical error, so "size" lets the optimizer trade it.
   */
  hedgeCap: "schedule" | "size";
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  roundTripPpm: 850_000,
  socMinPpm: 50_000,
  socMaxPpm: 950_000,
  socOpenPpm: 500_000,
  socEndMinPpm: 500_000,
  socMarginKwh: 100,
  maxCyclesPpm: 1_000_000,
  wearCentsPerMwh: 200,
  maxContractsPerHour: 100,
  collateralBudgetCents: 10_000_000,
  hedgeCap: "schedule",
};

export interface Risk {
  /** CVaR confidence level. */
  alphaPpm: number;
  /** Weight on CVaR in mean − λ·CVaR. */
  lambdaPpm: number;
}

export const DEFAULT_RISK: Risk = { alphaPpm: 900_000, lambdaPpm: 500_000 };

export type ArmId = "A" | "B" | "C";
