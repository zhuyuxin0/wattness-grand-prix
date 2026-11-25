import { describe, expect, it } from "vitest";
import { collateralCents, entryCents, settlementSum4 } from "../src/instrument.js";

describe("bounded future terms", () => {
  it("enters at the scenario mean of the clipped settlement price, rounded half up to the tick", () => {
    const hour = (v: number) => new Array<number>(24).fill(v);
    // Four times the settlement price per hour; two scenarios.
    const a = hour(4 * 2500);
    const b = hour(4 * 2500);
    a[0] = 4 * 2512; b[0] = 4 * 2512; // 2512 -> 2500
    a[1] = 4 * 2513; b[1] = 4 * 2513; // 2513 -> 2525
    a[2] = 4 * 2500; b[2] = 4 * 2525; // mean 2512.5 -> 2525 (half up)
    a[3] = 0; b[3] = 40_000; // mean 5000 of the clipped prices
    a[4] = 4 * 10_000; b[4] = 4 * 10_000;
    expect(entryCents([a, b]).slice(0, 6)).toEqual([2500, 2525, 2525, 5000, 10_000, 2500]);
  });

  it("refuses an empty scenario set", () => {
    expect(() => entryCents([])).toThrow(/no scenarios/);
  });

  it("settles on the clipped sum of four quarter-hours", () => {
    const rt = new Array<number>(96).fill(3000);
    rt.splice(4, 4, -2000, -2000, 1000, 1000);
    rt.splice(8, 4, 20_000, 20_000, 20_000, 20_000);
    expect(settlementSum4(rt, 0)).toBe(12_000);
    expect(settlementSum4(rt, 1)).toBe(0);
    expect(settlementSum4(rt, 2)).toBe(40_000);
  });

  it("charges a seller the distance to the ceiling and a buyer the distance to the floor", () => {
    expect(collateralCents(10, 2500)).toBe(75_000);
    expect(collateralCents(-10, 2500)).toBe(25_000);
  });
});
