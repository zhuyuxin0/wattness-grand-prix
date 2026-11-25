import { describe, expect, it } from "vitest";
import { checkLimits, cvarLoss, LimitError, revenueUusd, socPath } from "../src/accounting.js";
import { DEFAULT_ASSUMPTIONS as A } from "../src/types.js";
import { BATTERY } from "./fixtures.js";

const zeros = () => new Array<number>(24).fill(0);
const flat = (x: number) => new Array<number>(24).fill(x);

describe("revenueUusd", () => {
  it("prices energy, wear, the hedge and its fee exactly", () => {
    const s = { chargeKw: zeros(), dischargeKw: zeros() };
    s.dischargeKw[18] = 1_000;
    const hedge = zeros();
    hedge[18] = 3;
    const sc = { historyDay: "x", basisDay: "y", nodeCents: flat(5_000), hubSum4: flat(4 * 4_000 + 1) };
    // 1 MWh at $50 = 50e6; wear $2/MWh = 2e6; 3 x ($45 - $40.0025) = 14.9925e6; fee 3 x $0.35 = 1.05e6.
    expect(revenueUusd(A, s, hedge, flat(4_500), sc)).toBe(50_000_000n - 2_000_000n + 14_992_500n - 1_050_000n);
  });
});

describe("cvarLoss", () => {
  it("averages the worst tenth", () => {
    const revenues = Array.from({ length: 20 }, (_, i) => BigInt(i * 100 - 500));
    expect(cvarLoss(revenues, 900_000)).toBe(450n);
  });
  it("weights the boundary scenario fractionally", () => {
    // Tail of 1.5 scenarios: (1 x 300 + 0.5 x 200) / 1.5 = 266.67, floored.
    const revenues = [-300n, -200n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
    expect(cvarLoss(revenues, 900_000)).toBe(266n);
  });
});

describe("checkLimits", () => {
  const entry = flat(2_500);

  it("takes losses on charging", () => {
    const s = { chargeKw: zeros(), dischargeKw: zeros() };
    s.chargeKw[0] = 1_000;
    s.dischargeKw[1] = 850;
    const soc = socPath(BATTERY, A, s);
    expect(soc[0]! - soc[1]!).toBe(850_000_000n);
    expect(soc[1]).toBe(103_219n * 1_000_000n);
  });

  it("refuses simultaneous charge and discharge", () => {
    const s = { chargeKw: zeros(), dischargeKw: zeros() };
    s.chargeKw[3] = 10;
    s.dischargeKw[3] = 10;
    expect(() => checkLimits(BATTERY, A, s, zeros(), entry)).toThrow(/at once/);
  });

  it("refuses a closing state of charge below the floor", () => {
    const s = { chargeKw: zeros(), dischargeKw: zeros() };
    s.dischargeKw[20] = 1;
    expect(() => checkLimits(BATTERY, A, s, zeros(), entry)).toThrow(LimitError);
  });

  it("refuses collateral over the budget", () => {
    const s = { chargeKw: zeros(), dischargeKw: zeros() };
    expect(() => checkLimits(BATTERY, { ...A, hedgeCap: "size" }, s, flat(100), flat(0))).toThrow(/collateral/);
  });

  it("refuses a hedge larger than the hour's scheduled energy", () => {
    const s = { chargeKw: zeros(), dischargeKw: zeros() };
    s.dischargeKw[18] = 40_500;
    s.chargeKw[12] = 50_000;
    const ok = zeros();
    ok[18] = 40;
    ok[12] = -50;
    expect(() => checkLimits(BATTERY, A, s, ok, entry)).not.toThrow();
    const sells = [...ok];
    sells[18] = 41;
    expect(() => checkLimits(BATTERY, A, s, sells, entry)).toThrow(/scheduled energy/);
    const wrongSide = [...ok];
    wrongSide[12] = 1;
    expect(() => checkLimits(BATTERY, A, s, wrongSide, entry)).toThrow(/scheduled energy/);
  });
});
