import { describe, expect, it } from "vitest";
import { DataError } from "../src/errors.js";
import { ExcludedDayError } from "../src/excluded-days.js";
import { openLive } from "../src/live.js";
import { ProvenanceLog } from "../src/provenance.js";
import { Store } from "../src/store.js";
import { FakeOrigin, ORIGIN, publishLive, tempCache } from "./fixtures.js";

function setup() {
  const origin = new FakeOrigin();
  publishLive(origin, ["2026-11-24", "2026-11-25"], ["AAA_RN", "HB_HOUSTON", "TEST_RN"], 3);
  const log = new ProvenanceLog();
  const store = new Store(tempCache());
  return { origin, log, store, open: (extra = {}) => openLive({ fetcher: origin.fetcher, store, log, origin: ORIGIN, ...extra }) };
}

describe("live tier", () => {
  it("selects each run's price at the named points", async () => {
    const { open, log } = setup();
    const live = await open();
    expect(live.days).toEqual(["2026-11-24", "2026-11-25"]);
    const [node, hub, absent] = await live.pointDays("2026-11-25", ["TEST_RN", "HB_HOUSTON", "NOT_LISTED"]);
    expect(node?.runs.map((r) => r.lmp)).toEqual([22, 23, 24]);
    expect(hub?.runs.map((r) => r.lmp)).toEqual([21, 22, 23]);
    expect(absent?.runs.every((r) => r.lmp === null)).toBe(true);
    const routes = log.entries().map((e) => e.route);
    expect(routes[0]).toBe("/live/v1/current.json");
    expect(routes.filter((r) => r.startsWith("/live/v1/runs/2026-11-25/"))).toHaveLength(3);
  });

  it("refuses a run file whose bytes differ from the day index", async () => {
    const { open, origin } = setup();
    const live = await open();
    const url = [...origin.files.keys()].find((u) => u.includes("/runs/2026-11-24/")) as string;
    origin.files.set(url, new TextEncoder().encode("{}"));
    await expect(live.pointDays("2026-11-24", ["TEST_RN"])).rejects.toMatchObject({ code: "integrity" });
  });

  it("replays pinned day indexes from the cache without the pointer", async () => {
    const { open, origin, store, log } = setup();
    const first = await open();
    await first.pointDays("2026-11-24", ["TEST_RN"]);
    const before = origin.requests.length;
    const replay = await openLive({ fetcher: origin.fetcher, store, log, origin: ORIGIN, pins: [...first.pins] });
    await replay.pointDays("2026-11-24", ["TEST_RN"]);
    expect(origin.requests.length).toBe(before);
  });

  it("refuses a day it does not hold, and an excluded day before any fetch", async () => {
    const { open, origin } = setup();
    const live = await open();
    await expect(live.pointDays("2026-11-23", ["TEST_RN"])).rejects.toThrow(DataError);
    const before = origin.requests.length;
    await expect(live.pointDays("2026-09-01", ["TEST_RN"])).rejects.toThrow(ExcludedDayError);
    const pins = [{ day: "2026-08-10", path: `days/2026-08-10/${"a".repeat(64)}.json`, sha256: "a".repeat(64), bytes: 1 }];
    await expect(open({ pins })).rejects.toThrow(ExcludedDayError);
    expect(origin.requests.length).toBe(before);
  });
});
