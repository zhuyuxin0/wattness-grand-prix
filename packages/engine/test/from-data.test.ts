import { sha256Hex, type PlanInputs } from "@gatelock/data";
import { describe, expect, it } from "vitest";
import { fromData } from "../src/from-data.js";

const priced = (usd: number[]) => usd.map((usdPerMwh) => ({ usdPerMwh, grade: "published" }));

const REL = "/data/terminal-display/v1/releases/terminal-daily-20261124-1120";
const bucket = sha256Hex("/api/prices/HB_HOUSTON/2026-11-24").slice(0, 2);

describe("fromData", () => {
  it("maps a sync to whole-cent days, the census row and the files read", () => {
    const file = { route: "/api/prices/HB_HOUSTON/2026-11-24", sha256: "a".repeat(64), url: "https://wattness.tech/x" };
    const inputs = {
      release: {
        releaseId: "terminal-visitor-x",
        generatedAt: null,
        dataRelease: "terminal-daily-20261124-1120",
        dataManifestSha256: "b".repeat(64),
        manifestGeneratedAt: "2026-11-24T17:20:05Z",
      },
      battery: {
        resource: "CLO_ESR1",
        settlementPoint: "CLO_RN",
        zone: "LZ_HOUSTON",
        hub: "HB_HOUSTON",
        county: "Harris",
        maxPowerKw: 100_000,
        energyKwh: 206_438,
        census: { report: "NP3-988-ER", posted: "2026-11-01" },
        sizeSource: null,
        nodeSource: null,
        source: { route: "/api/fleet-geo/v2/native", sha256: "c".repeat(64), url: "https://wattness.tech/y" },
      },
      hub: [{ point: "HB_HOUSTON", day: "2026-11-24", da: priced(new Array(24).fill(25.5)), rt15: priced([1.01]), rtHourly: [] }],
      node: [],
      live: { pins: [{ day: "2026-11-25", path: "/live/v1/days/2026-11-25/d.json", sha256: "d".repeat(64), bytes: 10 }], hub: [], node: [] },
      files: [file],
      trail: [
        { route: `${REL}/manifest.json`, sha256: "e".repeat(64), url: "https://wattness.tech/z" },
        // Opened only to learn a day was absent: not cited.
        { route: `${REL}/catalogs/00.json`, sha256: "f".repeat(64), url: "https://wattness.tech/z0" },
        { route: `${REL}/catalogs/${bucket}.json`, sha256: "9".repeat(64), url: "https://wattness.tech/z1" },
      ],
    } as unknown as PlanInputs;

    const out = fromData(inputs);
    expect(out.hub[0]!.da![0]).toBe(2550);
    expect(out.hub[0]!.rt15).toEqual([101]);
    expect(out.battery.source).toEqual({ route: "/api/fleet-geo/v2/native", sha256: "c".repeat(64) });
    expect(out.provenance).toEqual({
      releaseId: "terminal-daily-20261124-1120",
      releaseGeneratedUnix: Date.UTC(2026, 10, 24, 17, 20, 5) / 1000,
      manifestSha256: "b".repeat(64),
      files: [
        { route: `${REL}/catalogs/${bucket}.json`, sha256: "9".repeat(64) },
        { route: `${REL}/manifest.json`, sha256: "e".repeat(64) },
        { route: file.route, sha256: file.sha256 },
      ],
      live: [{ route: "/live/v1/days/2026-11-25/d.json", sha256: "d".repeat(64) }],
    });
  });
});
