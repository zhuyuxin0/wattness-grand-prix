import { describe, expect, it } from "vitest";
import {
  assertOd,
  formatInZone,
  gateTs,
  gateTsFromTimeZone,
  hoursInOperatingDay,
  isoFromOd,
  odFromIso,
  operatingDayEndTs,
  operatingDayStartTs,
} from "../src/gate.js";

// Shared with contracts/test: the contract must return the same values.
const VECTORS: [number, number][] = [
  [20261126, 1795622400],
  [20261127, 1795708800],
  [20260309, 1772982000], // gate on the spring-forward Sunday, CDT by 10:00
  [20260308, 1772899200],
  [20261102, 1793548800], // gate on the fall-back Sunday, CST by 10:00
  [20261101, 1793458800],
];

describe("gateTs", () => {
  it.each(VECTORS)("od %i -> %i", (od, ts) => {
    expect(gateTs(od)).toBe(ts);
  });

  it.each(VECTORS)("agrees with the IANA zone for od %i", (od, ts) => {
    expect(gateTsFromTimeZone(od)).toBe(ts);
  });

  it("agrees with the IANA zone every day from 2025 through 2030", () => {
    const start = Date.UTC(2025, 0, 1);
    for (let d = 0; d < 6 * 366; d++) {
      const date = new Date(start + d * 86_400_000);
      const od = date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
      expect(gateTs(od), String(od)).toBe(gateTsFromTimeZone(od));
    }
  });

  it("reads 10:00 Central", () => {
    expect(formatInZone(gateTs(20261126))).toBe("2026-11-25 10:00:00 CST");
    expect(formatInZone(gateTs(20261101))).toBe("2026-10-31 10:00:00 CDT");
    expect(formatInZone(gateTs(20261126), "Asia/Bangkok")).toBe("2026-11-25 23:00:00 GMT+7");
  });

  it("agrees with the IANA zone on every transition Sunday and year end from 2007 through 2100", () => {
    for (let year = 2007; year <= 2100; year++) {
      const days: number[] = [];
      for (const month of [3, 11]) {
        // Every day from the 1st to the 15th covers both the second Sunday of March and the first of November, and the day after.
        for (let day = 1; day <= 15; day++) days.push(year * 10_000 + month * 100 + day);
      }
      days.push(year * 10_000 + 101, year * 10_000 + 1231, year * 10_000 + 301);
      for (const od of days) expect(gateTs(od), String(od)).toBe(gateTsFromTimeZone(od));
    }
  });

  it("puts the gate on the second, not the minute: the second before reads 09:59:59", () => {
    for (const od of [20261126, 20260309, 20261102, 20270101]) {
      expect(formatInZone(gateTs(od) - 1).slice(11, 19), String(od)).toBe("09:59:59");
      expect(formatInZone(gateTs(od)).slice(11, 19), String(od)).toBe("10:00:00");
    }
  });

  it("rolls back across month and year ends", () => {
    expect(formatInZone(gateTs(20270101))).toBe("2026-12-31 10:00:00 CST");
    expect(formatInZone(gateTs(20260701))).toBe("2026-06-30 10:00:00 CDT");
  });
});

describe("operating day", () => {
  it("has 23 and 25 hours on the DST days", () => {
    expect(hoursInOperatingDay(20260308)).toBe(23);
    expect(hoursInOperatingDay(20261101)).toBe(25);
    expect(hoursInOperatingDay(20261126)).toBe(24);
  });

  it("ends where GateRecord.dayEndTs does", () => {
    expect(operatingDayEndTs(20260308)).toBe(1773032400); // 2026-03-09 00:00 CDT
    expect(operatingDayEndTs(20261101)).toBe(1793599200); // 2026-11-02 00:00 CST
  });

  it("starts and ends at local midnight", () => {
    expect(formatInZone(operatingDayStartTs(20261126))).toBe("2026-11-26 00:00:00 CST");
    expect(operatingDayEndTs(20261126)).toBe(operatingDayStartTs(20261127));
  });

  it("rejects dates that do not exist", () => {
    for (const od of [20261131, 20260229, 20261300, 20261100, 2026112, 20261126.5, 20061231]) {
      expect(() => assertOd(od), String(od)).toThrow(RangeError);
    }
    expect(() => assertOd(20280229)).not.toThrow();
    expect(() => assertOd(24000229)).not.toThrow(); // divisible by 400
    expect(() => assertOd(21000229)).toThrow(RangeError); // a century, not a leap year
    expect(() => assertOd(20270229)).toThrow(RangeError);
    expect(() => assertOd(20070101)).not.toThrow();
  });

  it("converts ISO dates", () => {
    expect(odFromIso("2026-11-26")).toBe(20261126);
    expect(isoFromOd(20261126)).toBe("2026-11-26");
    expect(() => odFromIso("2026-11-31")).toThrow(RangeError);
  });
});
