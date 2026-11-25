import { describe, expect, it } from "vitest";
import {
  assumedEntryCents,
  boundedFutureCollateralCents,
  boundedFuturePnlMicroUsd,
  energyMicroUsd,
  floorDiv,
  IntegerError,
  roundToTick,
  socAfter,
  splitKw,
  sum,
} from "../src/int.js";

describe("integer accounting", () => {
  it("values energy exactly", () => {
    // 100 MWh at $35.27/MWh = $3,527.00
    expect(energyMicroUsd(100_000, 3527)).toBe(3_527_000_000);
    expect(energyMicroUsd(-1, 1)).toBe(-10);
  });

  it("takes losses on charging", () => {
    const half = 103_219_000_000; // 103,219 kWh in micro-kWh
    expect(socAfter(half, 1000, 0, 850_000)).toBe(half + 850_000_000);
    expect(socAfter(half, 0, 1000, 850_000)).toBe(half - 1_000_000_000);
    expect(() => socAfter(half, -1, 0, 850_000)).toThrow(IntegerError);
  });

  it("splits signed kW", () => {
    expect(splitKw(-250)).toEqual({ chargeKwh: 250, dischargeKwh: 0 });
    expect(splitKw(250)).toEqual({ chargeKwh: 0, dischargeKwh: 250 });
  });

  it("settles a bounded future on the clipped mean of four intervals", () => {
    // Sold 10 at $40.00; intervals average $35.0625: seller earns 10 x $4.9375
    expect(boundedFuturePnlMicroUsd(10, 4000, [3500, 3500, 3525, 3500], [0, 10_000])).toBe(49_375_000);
    // A $250 spike settles at the $100 cap
    expect(boundedFuturePnlMicroUsd(1, 4000, [25_000, 25_000, 25_000, 25_000], [0, 10_000])).toBe(-60_000_000);
    // Negative prices settle at the $0 floor
    expect(boundedFuturePnlMicroUsd(1, 4000, [-500, -500, -500, -500], [0, 10_000])).toBe(40_000_000);
    // Clipping applies to the mean, not each interval
    expect(boundedFuturePnlMicroUsd(1, 0, [-400, 400, 0, 0], [0, 10_000])).toBe(0);
  });

  it("pays a buyer the mirror of the seller", () => {
    expect(boundedFuturePnlMicroUsd(-10, 4000, [3500, 3500, 3525, 3500], [0, 10_000])).toBe(-49_375_000);
  });

  it("posts collateral to the ceiling when selling and to the floor when buying", () => {
    expect(boundedFutureCollateralCents(10, 4000, [0, 10_000])).toBe(60_000);
    expect(boundedFutureCollateralCents(-10, 4000, [0, 10_000])).toBe(40_000);
    expect(boundedFutureCollateralCents(0, 4000, [0, 10_000])).toBe(0);
  });

  it("assumes entry at the scenario mean of the clipped settlement price, half up on the tick", () => {
    expect(assumedEntryCents([4 * 2387, 4 * 2387], [0, 10_000], 25)).toBe(2375);
    expect(assumedEntryCents([4 * 2388], [0, 10_000], 25)).toBe(2400);
    expect(assumedEntryCents([4 * 2500, 4 * 2525], [0, 10_000], 25)).toBe(2525);
    expect(assumedEntryCents([-4 * 1500, 4 * 2000], [0, 10_000], 25)).toBe(1000);
    expect(assumedEntryCents([4 * 25_000], [0, 10_000], 25)).toBe(10_000);
    expect(() => assumedEntryCents([], [0, 10_000], 25)).toThrow(/no scenarios/);
  });

  it("rounds to the tick, halves up", () => {
    expect(roundToTick(3512, 25)).toBe(3500);
    expect(roundToTick(3513, 25)).toBe(3525);
    expect(roundToTick(-12, 25)).toBe(0);
    expect(roundToTick(-13, 25)).toBe(-25);
  });

  it("refuses inexact arithmetic", () => {
    expect(() => sum([Number.MAX_SAFE_INTEGER, 1])).toThrow(IntegerError);
    expect(() => energyMicroUsd(0.5, 100)).toThrow(IntegerError);
    expect(floorDiv(-7, 2)).toBe(-4);
  });
});
