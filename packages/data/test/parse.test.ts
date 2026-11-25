import { describe, expect, it } from "vitest";
import { listCensusResources, parseBatteryRecord, parseWalkthroughBattery } from "../src/census.js";
import { DataError } from "../src/errors.js";
import { centsDay, parsePointDay, publishedCents, toCents } from "../src/prices.js";
import { BATTERY_ROW, census, instrument } from "./fixtures.js";

const SOURCE = { route: "/api/fleet-geo/v2/native", sha256: "a".repeat(64), url: "https://origin.test/x" };

describe("parsePointDay", () => {
  it("reads DA by hour, RT by interval and RT by hour", () => {
    const d = parsePointDay(instrument("HB_HOUSTON", "2026-11-20"), "HB_HOUSTON", "2026-11-20");
    expect(d.da).toHaveLength(24);
    expect(d.rt15).toHaveLength(96);
    expect(d.rtHourly).toHaveLength(24);
    expect(d.da[3]).toEqual({ usdPerMwh: 33, grade: "published" });
    expect(d.rt15[13]).toEqual({ usdPerMwh: 34.25, grade: "published" });
    expect(d.daFinal).toBe(true);
  });

  it("keeps a DST day's 25 hours", () => {
    const d = parsePointDay(instrument("HB_HOUSTON", "2026-11-01", { hours: 25 }), "HB_HOUSTON", "2026-11-01");
    expect(d.hourStarts).toHaveLength(25);
    expect(d.rt15).toHaveLength(100);
  });

  it("refuses a payload whose key differs from the route", () => {
    expect(() => parsePointDay(instrument("HB_NORTH", "2026-11-20"), "HB_HOUSTON", "2026-11-20")).toThrow(DataError);
    expect(() => parsePointDay(instrument("HB_HOUSTON", "2026-11-21"), "HB_HOUSTON", "2026-11-20")).toThrow(DataError);
  });
});

describe("cents", () => {
  it("converts published SPPs exactly", () => {
    expect(toCents(30.67)).toBe(3067);
    expect(toCents(-1.1)).toBe(-110);
    expect(toCents(0.29)).toBe(29);
  });

  it("refuses a value finer than a cent", () => {
    expect(() => toCents(27.8286)).toThrow(DataError);
  });

  it("gives cents only when every value is published", () => {
    const d = parsePointDay(instrument("HB_HOUSTON", "2026-11-20"), "HB_HOUSTON", "2026-11-20");
    expect(publishedCents(d.da)?.slice(0, 2)).toEqual([3000, 3100]);
    const live = parsePointDay(instrument("HB_HOUSTON", "2026-11-24", { rtGrade: "reconstructed" }), "HB_HOUSTON", "2026-11-24");
    expect(publishedCents(live.rt15)).toBeNull();
    expect(centsDay(live)).toMatchObject({ point: "HB_HOUSTON", day: "2026-11-24", rt15: null });
    expect(centsDay(live).da).toHaveLength(24);
  });
});

describe("parseBatteryRecord", () => {
  it("reads one census row in whole kW and kWh, with the zone's hub", () => {
    const b = parseBatteryRecord(census([BATTERY_ROW]), "TEST_ESR1", SOURCE);
    expect(b).toMatchObject({
      resource: "TEST_ESR1",
      settlementPoint: "TEST_RN",
      zone: "LZ_HOUSTON",
      hub: "HB_HOUSTON",
      county: "Harris",
      maxPowerKw: 100_000,
      energyKwh: 206_438,
      census: { report: "NP3-988-ER" },
    });
    expect(b.source).toBe(SOURCE);
  });

  it("stops when the resource is absent or listed twice", () => {
    expect(() => parseBatteryRecord(census([BATTERY_ROW]), "OTHER_ESR1", SOURCE)).toThrow(/0 census rows/);
    expect(() => parseBatteryRecord(census([BATTERY_ROW, BATTERY_ROW]), "TEST_ESR1", SOURCE)).toThrow(/2 census rows/);
  });

  it("refuses a row with no size rather than inventing one", () => {
    expect(() => parseBatteryRecord(census([{ ...BATTERY_ROW, e_max_mwh: null }]), "TEST_ESR1", SOURCE)).toThrow(/e_max_mwh/);
  });

  it("names no hub for a zone without one", () => {
    expect(() => parseBatteryRecord(census([{ ...BATTERY_ROW, load_zone: "LZ_CPS" }]), "TEST_ESR1", SOURCE)).toThrow(/no hub/);
  });
});

describe("census lists and the walkthrough battery", () => {
  it("keeps a row without a county, with the county null", () => {
    expect(parseBatteryRecord(census([{ ...BATTERY_ROW, county: null }]), "TEST_ESR1", SOURCE).county).toBeNull();
  });

  it("lists every census resource by name, including rows the fleet will exclude", () => {
    const rows = [
      { ...BATTERY_ROW, esr: "ZED_ESR1" },
      { ...BATTERY_ROW, esr: "ALPHA_ESR1" },
      { ...BATTERY_ROW, esr: "NOSP_ESR1", settlement_point: null },
      { ...BATTERY_ROW, esr: "CPS_ESR1", load_zone: "LZ_CPS" },
      { ...BATTERY_ROW, esr: "OUT_ESR1", in_census: false },
    ];
    expect(listCensusResources(census(rows))).toEqual([
      { resource: "ALPHA_ESR1", settlementPoint: "TEST_RN" },
      { resource: "CPS_ESR1", settlementPoint: "TEST_RN" },
      { resource: "NOSP_ESR1", settlementPoint: null },
      { resource: "ZED_ESR1", settlementPoint: "TEST_RN" },
    ]);
    expect(() => parseBatteryRecord(census([{ ...BATTERY_ROW, settlement_point: null }]), "TEST_ESR1", SOURCE)).toThrow(/settlement_point/);
    expect(() => parseBatteryRecord(census([{ ...BATTERY_ROW, load_zone: "LZ_CPS" }]), "TEST_ESR1", SOURCE)).toThrow(/no hub/);
  });

  const walkthrough = (named: Record<string, unknown>) => ({
    schema: "hedging-walkthrough.v2",
    named: { esr: "TEST_ESR1", mw: 150, default_hub: "HB_NORTH", energy: { mwh: 338.307, rule: "declared" }, ...named },
  });
  const WT = { route: "/api/hedging/v1/walkthrough", sha256: "b".repeat(64), url: "https://wattness.tech/w" };

  it("takes power, declared energy and hub from the walkthrough and the settlement point from the census", () => {
    const row = parseBatteryRecord(census([BATTERY_ROW]), "TEST_ESR1", SOURCE);
    const b = parseWalkthroughBattery(walkthrough({}), row, WT);
    expect(b).toMatchObject({
      resource: "TEST_ESR1",
      settlementPoint: "TEST_RN",
      hub: "HB_NORTH",
      maxPowerKw: 150_000,
      energyKwh: 338_307,
      sizeSource: "walkthrough: declared energy",
    });
    expect(b.source).toBe(WT);
  });

  it("refuses a walkthrough that names another battery or has no energy", () => {
    const row = parseBatteryRecord(census([BATTERY_ROW]), "TEST_ESR1", SOURCE);
    expect(() => parseWalkthroughBattery(walkthrough({ esr: "OTHER_ESR1" }), row, WT)).toThrow(/names OTHER_ESR1/);
    expect(() => parseWalkthroughBattery(walkthrough({ energy: {} }), row, WT)).toThrow(/energy\.mwh/);
  });
});
