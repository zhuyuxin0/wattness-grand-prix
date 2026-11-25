import { describe, expect, it } from "vitest";
import { ExcludedDayError } from "../src/excluded-days.js";
import { offlineFetcher } from "../src/http.js";
import { loadPlanInputs, readSnapshot, writeSnapshot } from "../src/inputs.js";
import { BATTERY_ROW, FakeOrigin, ORIGIN, census, instrument, publishLive, publishRelease, tempCache } from "./fixtures.js";

function world() {
  const origin = new FakeOrigin();
  const routes: Record<string, unknown> = { "/api/fleet-geo/v2/native": census([BATTERY_ROW]) };
  for (const day of ["2026-09-30", "2026-10-01", "2026-11-23", "2026-11-24"]) {
    routes[`/api/prices/HB_HOUSTON/${day}`] = instrument("HB_HOUSTON", day);
  }
  for (const day of ["2026-11-23", "2026-11-24"]) routes[`/api/prices/TEST_RN/${day}`] = instrument("TEST_RN", day, { da: 25 });
  // A excluded day the release holds must never be read.
  routes["/api/prices/HB_HOUSTON/2026-09-29"] = instrument("HB_HOUSTON", "2026-09-29");
  publishRelease(origin, routes);
  publishLive(origin, ["2026-11-24", "2026-11-25"], ["HB_HOUSTON", "TEST_RN"], 2);
  return origin;
}

describe("loadPlanInputs", () => {
  it("reads the battery, both points' held days and the live runs", async () => {
    const origin = world();
    const { inputs } = await loadPlanInputs({ resource: "TEST_ESR1", cacheDir: tempCache(), fetcher: origin.fetcher, origin: ORIGIN });
    expect(inputs.battery).toMatchObject({ settlementPoint: "TEST_RN", hub: "HB_HOUSTON", maxPowerKw: 100_000 });
    expect(inputs.hub.map((d) => d.day)).toEqual(["2026-09-30", "2026-10-01", "2026-11-23", "2026-11-24"]);
    expect(inputs.node.map((d) => d.day)).toEqual(["2026-11-23", "2026-11-24"]);
    expect(inputs.live.node.map((d) => d.runs.length)).toEqual([2, 2]);
    expect(origin.requests.some((u) => u.includes("2026-09-29"))).toBe(false);
    for (const f of inputs.files) expect(f.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(inputs.files.map((f) => f.route)).toContain("/api/prices/TEST_RN/2026-11-24");
  });

  it("replays a written snapshot offline to the same inputs", async () => {
    const origin = world();
    const cacheDir = tempCache();
    const online = await loadPlanInputs({ resource: "TEST_ESR1", cacheDir, fetcher: origin.fetcher, origin: ORIGIN });
    const { path } = writeSnapshot(online.snapshot, cacheDir);
    const replay = await loadPlanInputs({
      resource: "TEST_ESR1",
      cacheDir,
      origin: ORIGIN,
      offline: true,
      fetcher: offlineFetcher,
      snapshot: readSnapshot(path),
    });
    expect(replay.inputs.hub).toEqual(online.inputs.hub);
    expect(replay.inputs.node).toEqual(online.inputs.node);
    expect(replay.inputs.live).toEqual(online.inputs.live);
    expect(replay.inputs.battery).toEqual(online.inputs.battery);
    expect(replay.snapshot).toEqual(online.snapshot);
  });

  it("refuses a history window that reaches the excluded days before any fetch", async () => {
    const origin = world();
    for (const historyFrom of ["2026-09-01", "2026-07-01", "2026-09-29"]) {
      await expect(
        loadPlanInputs({ resource: "TEST_ESR1", cacheDir: tempCache(), fetcher: origin.fetcher, origin: ORIGIN, historyFrom }),
      ).rejects.toThrow(ExcludedDayError);
    }
    expect(origin.requests).toEqual([]);
  });
});
