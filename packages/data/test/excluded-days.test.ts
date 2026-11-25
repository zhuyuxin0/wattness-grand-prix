import { describe, expect, it } from "vitest";
import { HISTORY_START, EXCLUDED_DAYS, ExcludedDayError, assertOpenDay, assertOpenRoute, assertOpenWindow, isExcludedDay } from "../src/excluded-days.js";

describe("excluded-days guard", () => {
  it("excludes 2026-07-30 through 2026-09-29 inclusive", () => {
    expect(EXCLUDED_DAYS).toEqual({ from: "2026-07-30", to: "2026-09-29" });
    expect(isExcludedDay("2026-07-29")).toBe(false);
    expect(isExcludedDay("2026-07-30")).toBe(true);
    expect(isExcludedDay("2026-08-15")).toBe(true);
    expect(isExcludedDay("2026-09-29")).toBe(true);
    expect(isExcludedDay("2026-09-30")).toBe(false);
  });

  it("starts history on the first open day", () => {
    expect(HISTORY_START).toBe("2026-09-30");
    expect(isExcludedDay(HISTORY_START)).toBe(false);
  });

  it("refuses an excluded day with the day named", () => {
    expect(() => assertOpenDay("2026-09-29")).toThrow(ExcludedDayError);
    expect(() => assertOpenDay("2026-09-29")).toThrow(/2026-09-29/);
  });

  it("refuses any window that touches the excluded range", () => {
    expect(() => assertOpenWindow("2026-07-01", "2026-07-29")).not.toThrow();
    expect(() => assertOpenWindow("2026-09-30", "2026-11-24")).not.toThrow();
    expect(() => assertOpenWindow("2026-07-01", "2026-07-30")).toThrow(ExcludedDayError);
    expect(() => assertOpenWindow("2026-09-29", "2026-10-05")).toThrow(ExcludedDayError);
    expect(() => assertOpenWindow("2026-07-01", "2026-10-31")).toThrow(ExcludedDayError);
  });

  it("checks every day in a route, including one in a query", () => {
    expect(() => assertOpenRoute("/api/prices/HB_HOUSTON/2026-10-01")).not.toThrow();
    expect(() => assertOpenRoute("/api/prices/HB_HOUSTON/2026-08-05")).toThrow(ExcludedDayError);
    expect(() => assertOpenRoute("/api/fleet-board?from=2026-06-01&to=2026-09-01")).toThrow(ExcludedDayError);
  });

  it("rejects strings that are not calendar days", () => {
    expect(() => assertOpenDay("2026-02-30")).toThrow(TypeError);
    expect(() => assertOpenDay("20260930")).toThrow(TypeError);
  });
});
