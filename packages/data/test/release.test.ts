import { describe, expect, it } from "vitest";
import { DataError } from "../src/errors.js";
import { ExcludedDayError } from "../src/excluded-days.js";
import { httpFetcher } from "../src/http.js";
import { priceRoute } from "../src/prices.js";
import { ProvenanceLog } from "../src/provenance.js";
import { assertAllowedRoute, openRelease } from "../src/release.js";
import { Store } from "../src/store.js";
import { FakeOrigin, ORIGIN, RELEASE, instrument, publishRelease, tempCache } from "./fixtures.js";

const ROUTE = "/api/prices/HB_HOUSTON/2026-11-20";

function setup() {
  const origin = new FakeOrigin();
  const published = publishRelease(origin, { [ROUTE]: instrument("HB_HOUSTON", "2026-11-20") });
  const log = new ProvenanceLog();
  const store = new Store(tempCache());
  const open = (extra = {}) => openRelease({ fetcher: origin.fetcher, store, log, origin: ORIGIN, ...extra });
  return { origin, published, log, store, open };
}

async function rejection(p: Promise<unknown>): Promise<DataError> {
  try {
    await p;
  } catch (e) {
    return e as DataError;
  }
  throw new Error("expected a rejection");
}

describe("release reader", () => {
  it("follows release.json to the payload and records its provenance", async () => {
    const { open, log, published } = setup();
    const release = await open();
    expect(release.pin).toMatchObject({ dataRelease: RELEASE, dataManifestSha256: published.manifestSha256 });
    const file = await release.read(ROUTE);
    expect((file.json as { key: unknown }).key).toEqual({ operating_day: "2026-11-20", settlement_point: "HB_HOUSTON" });
    expect(file.provenance.route).toBe(ROUTE);
    expect(file.provenance.url).toBe(`${ORIGIN}${published.base}/${file.descriptor.path}`);
    expect(log.entries().map((e) => e.route)).toContain(ROUTE);
  });

  it("refuses a payload whose bytes differ from the catalog", async () => {
    const { open, origin } = setup();
    const release = await open();
    const d = await release.descriptor(ROUTE);
    origin.put(`/data/terminal-display/v1/releases/${RELEASE}/${d?.path}`, { tampered: true });
    const err = await rejection(release.read(ROUTE));
    expect(err).toBeInstanceOf(DataError);
    expect(err.code).toBe("integrity");
  });

  it("refuses a current.json that disagrees with release.json", async () => {
    const { open, origin } = setup();
    origin.put(`/data/terminal-display/v1/releases/${RELEASE}/current.json`, {
      schema: "wattness.terminal-display-current.v1",
      release: RELEASE,
      manifest: `releases/${RELEASE}/manifest.json`,
      manifest_sha256: "f".repeat(64),
      manifest_bytes: 1,
    });
    expect((await rejection(open())).code).toBe("integrity");
  });

  it("refuses a manifest that does not match its pin", async () => {
    const { open } = setup();
    const pin = { releaseId: null, generatedAt: null, dataRelease: RELEASE, dataManifestSha256: "e".repeat(64) };
    expect((await rejection(open({ pin }))).code).toBe("integrity");
  });

  it("reports a route the release does not hold as missing", async () => {
    const release = await setup().open();
    expect(await release.has("/api/prices/HB_HOUSTON/2026-11-21")).toBe(false);
    expect((await rejection(release.read("/api/prices/HB_HOUSTON/2026-11-21"))).code).toBe("missing");
  });

  it("serves a second read from the cache without fetching", async () => {
    const { open, origin, log, store } = setup();
    await (await open()).read(ROUTE);
    const before = origin.requests.length;
    const pinned = await openRelease({ fetcher: origin.fetcher, store, log, origin: ORIGIN, pin: (await open()).pin });
    const after = origin.requests.length;
    await pinned.read(ROUTE);
    expect(origin.requests.length).toBe(after);
    expect(after - before).toBe(2); // release.json and current.json, which are mutable
  });

  it("refuses fleet revenue routes and excluded days before any fetch", async () => {
    const { open, origin } = setup();
    const release = await open();
    const before = origin.requests.length;
    for (const route of ["/api/fleet", "/api/fleet-board?from=2026-10-01&to=2026-10-31", "/api/hedging/v1/battery/TEST_ESR1"]) {
      expect(() => assertAllowedRoute(route)).toThrow(DataError);
      await expect(release.read(route)).rejects.toThrow(DataError);
    }
    await expect(release.read("/api/prices/HB_HOUSTON/2026-09-15")).rejects.toThrow(ExcludedDayError);
    expect(() => priceRoute("HB_HOUSTON", "2026-08-01")).toThrow(ExcludedDayError);
    expect(origin.requests.length).toBe(before);
  });
});

describe("httpFetcher", () => {
  it("refuses a query string before sending, since the gateway answers it with 400", async () => {
    await expect(httpFetcher()("https://wattness.tech/release.json?t=1")).rejects.toThrow(/no query/);
    await expect(httpFetcher()("http://wattness.tech/release.json")).rejects.toThrow(/https only/);
  });
});

describe("hedging routes", () => {
  it("opens the walkthrough and nothing else under /api/hedging", () => {
    expect(() => assertAllowedRoute("/api/hedging/v1/walkthrough")).not.toThrow();
    for (const r of ["/api/hedging/v1/index", "/api/hedging/v1/hubs", "/api/hedging/v1/battery/DSWL_ESS_ESR1", "/api/hedging/v1/walkthrough/x"]) {
      expect(() => assertAllowedRoute(r)).toThrow(/not one this reader may fetch/);
    }
  });
});
