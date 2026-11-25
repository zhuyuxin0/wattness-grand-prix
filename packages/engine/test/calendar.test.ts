import { describe, expect, it } from "vitest";
import { assertReadable, centralClock, dayType, gateUnix, ExcludedDayError } from "../src/calendar.js";

describe("gateUnix", () => {
  it.each([
    ["2026-11-26", 1795622400],
    ["2026-11-27", 1795708800],
    ["2026-03-09", 1772982000],
    ["2026-03-08", 1772899200],
    ["2026-11-02", 1793548800],
    ["2026-11-01", 1793458800],
  ])("%s closes at %i", (od, ts) => {
    expect(gateUnix(od)).toBe(ts);
  });

  it("formats the gate in Central time", () => {
    expect(centralClock(1795622400)).toBe("2026-11-25T10:00:00-06:00");
    expect(centralClock(1793458800)).toBe("2026-10-31T10:00:00-05:00");
  });
});

describe("dayType", () => {
  it("treats Thanksgiving and weekends as off-peak", () => {
    expect(dayType("2026-11-26")).toBe("offpeak");
    expect(dayType("2026-11-22")).toBe("offpeak");
    expect(dayType("2026-11-21")).toBe("offpeak");
    expect(dayType("2026-11-27")).toBe("weekday");
  });
});

describe("assertReadable", () => {
  it.each(["2026-07-30", "2026-08-15", "2026-09-29"])("refuses excluded day %s", (d) => {
    expect(() => assertReadable(d)).toThrow(ExcludedDayError);
  });
  it("refuses days before history starts", () => {
    expect(() => assertReadable("2026-07-29")).toThrow(ExcludedDayError);
  });
  it("accepts the first history day", () => {
    expect(() => assertReadable("2026-09-30")).not.toThrow();
  });
});
