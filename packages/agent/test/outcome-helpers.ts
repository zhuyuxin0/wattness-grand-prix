import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FLEET_SCHEMA, PLAN_SCOPE_LABEL, fileSha256, fleetRoot, gateTs, leafHash, type FleetIndex, type Manifest } from "@gatelock/core";
import type { Address } from "viem";
import type { Quarter } from "../src/outcome.js";
import type { PriceSource } from "../src/outcome-prices.js";

export const REPO = fileURLToPath(new URL("../../../", import.meta.url));
export const FIXTURE = join(REPO, "fixtures", "od-20261126");
/** More leaves of the same sealed record, byte for byte as published, for tests that need a larger fleet. */
export const MORE_LEAVES = join(REPO, "packages", "agent", "test", "fixtures", "od-20261126");
export const DAY = "2026-11-26";
export const OD = 20261126;
/** Hardhat's first public test account. */
export const LOCAL_WALLET: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

export function fixtureLeaf(resource: string): Manifest {
  const sealed = join(FIXTURE, "leaves", `${resource}.json`);
  return JSON.parse(readFileSync(existsSync(sealed) ? sealed : join(MORE_LEAVES, `${resource}.json`), "utf8")) as Manifest;
}

/** The sealed record's own index, whose leaf hashes prove a fixture leaf is the one committed. */
export function sealedIndex(): FleetIndex {
  return JSON.parse(readFileSync(join(FIXTURE, "manifest.json"), "utf8")) as FleetIndex;
}

/** Deterministic, plausible prices: an evening peak, and a few hub intervals above the hedge's ceiling. */
export function daCents(point: string): number[] {
  const k = [...point].reduce((a, c) => a + c.charCodeAt(0), 0) % 7;
  return Array.from({ length: 24 }, (_, h) => 1500 + 37 * h + 11 * k + (h >= 17 && h <= 20 ? 2400 : 0));
}

export function rtQuarters(hub: string): Quarter[] {
  const base = daCents(hub);
  return base.map((p, h) => {
    if (h === 18) return [p, 250_000, p + 3, -1200] as Quarter;
    return [p - 40, p + 15, p + 80, p - 5] as Quarter;
  });
}

export const fakeRef = (route: string) => ({ route, sha256: [...route].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16).padStart(8, "0").repeat(8) });

/** A price source with fixed prices that cites the routes a release would. */
export function fakePrices(opts: { notYet?: boolean } = {}): PriceSource {
  return async (req) => {
    if (opts.notYet) return { kind: "not-yet", releaseId: "fake-release", reasons: [`no prices for ${req.operatingDay}`] };
    return {
      kind: "ready",
      releaseId: "fake-release",
      manifestSha256: "ab".repeat(32),
      liveDay: null,
      leaf(node, hub) {
        const files = [fakeRef(`/api/prices/${node}/${req.operatingDay}`), ...(req.stage === 1 ? [] : [fakeRef(`/api/prices/${hub}/${req.operatingDay}`)])];
        return {
          daNodeCents: daCents(node),
          rtHubCents: req.stage === 1 ? null : rtQuarters(hub),
          inputs: { release_id: "fake-release", manifest_sha256: "ab".repeat(32), files, live: [] },
        };
      },
      hubDayAhead: (hub) => daCents(hub),
    };
  };
}

/** A planned day from sealed leaves (default: the fixture's two), re-signed to the local wallet as a test record. */
export function writePlannedDay(dir: string, wallet: Address = LOCAL_WALLET, resources: readonly string[] = ["CLO_ESR1", "DSWL_ESS_ESR1"]): FleetIndex {
  const leaves = [...resources].sort().map((r) => {
    const m = fixtureLeaf(r);
    m.kind = "test";
    m.agent = { ...m.agent, wallet };
    return { resource: r, manifest: m };
  });
  mkdirSync(join(dir, "leaves"), { recursive: true });
  for (const l of leaves) writeFileSync(join(dir, "leaves", `${l.resource}.json`), `${JSON.stringify(l.manifest, null, 2)}\n`);
  const entries = leaves.map((l) => ({
    resource: l.resource,
    leaf: leafHash(l.manifest),
    manifest: `leaves/${l.resource}.json`,
    scenarios: `leaves/${l.resource}.scenarios.json`,
  }));
  const fixtureIndex = JSON.parse(readFileSync(join(FIXTURE, "manifest.json"), "utf8")) as FleetIndex;
  const index: FleetIndex = {
    schema: FLEET_SCHEMA,
    operating_day: DAY,
    scope_label: PLAN_SCOPE_LABEL,
    gate_unix: gateTs(OD),
    plan_unix: fixtureIndex.plan_unix,
    code_tree: fixtureIndex.code_tree,
    root: fleetRoot(entries),
    leaf_count: entries.length,
    showcase: "DSWL_ESS_ESR1",
    leaves: entries,
    exclusions: [],
  };
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

/** Test prices in a release laid out like the public one: release.json -> current.json -> manifest -> catalogs -> payloads. */
export interface FakeRelease {
  origin: string;
  releaseId: string;
  manifestSha256: string;
  /** The data package's fetcher: throws on a missing file. */
  fetcher: (url: string) => Promise<Uint8Array>;
  /** The verifier's fetcher: null on a missing file. */
  verifierFetcher: (url: string) => Promise<Uint8Array | null>;
}

const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

/** A wattness.instrument.v1 file for one point and day; every value graded published unless rt15 is null. */
export function instrumentFile(point: string, day: string, da: readonly number[], rt15: readonly number[] | null) {
  const hourStarts = da.map((_, h) => `${day}T${String(h).padStart(2, "0")}:00:00-06:00`);
  return {
    schema: "wattness.instrument.v1",
    key: { operating_day: day, settlement_point: point },
    mode: "record",
    calendar: {
      hour_starts: hourStarts,
      interval_starts: hourStarts.flatMap((s) => [0, 15, 30, 45].map((m) => s.replace(":00:00", `:${String(m).padStart(2, "0")}:00`))),
    },
    da: { final: true, hours: da.map((c) => ({ dam_spp: c / 100, grade: "published" })) },
    rt: {
      final: rt15 !== null,
      hours: da.map((_, h) => ({ settled: rt15 ? { grade: "published", value: rt15.slice(4 * h, 4 * h + 4).reduce((a, b) => a + b, 0) / 400 } : { grade: "absent", value: null } })),
      intervals: Array.from({ length: da.length * 4 }, (_, i) => ({ rtspp: rt15 ? { grade: "published", value: rt15[i]! / 100 } : { grade: "absent", value: null } })),
    },
  };
}

export function publishTestRelease(payloads: Record<string, unknown>, releaseId = "terminal-daily-20261126-1221", origin = "https://origin.test"): FakeRelease {
  const files = new Map<string, Uint8Array>();
  const put = (path: string, value: unknown) => {
    const body = enc(value);
    files.set(`${origin}${path}`, body);
    return { sha256: fileSha256(body), bytes: body.byteLength };
  };
  const base = `/data/terminal-display/v1/releases/${releaseId}`;
  const buckets = new Map<string, unknown[]>();
  for (const [route, payload] of Object.entries(payloads)) {
    const routeHash = fileSha256(route);
    const body = enc(payload);
    const sha256 = fileSha256(body);
    const path = `json/${routeHash}-${sha256}.json`;
    files.set(`${origin}${base}/${path}`, body);
    const bucket = routeHash.slice(0, 2);
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), { route, path, schema: "wattness.instrument.v1", media_type: "application/json", sha256, bytes: body.byteLength, source_ids: ["test"], clocks: {} }]);
  }
  const catalogs = [...buckets].map(([bucket, list]) => ({
    bucket,
    path: `catalogs/${bucket}.json`,
    ...put(`${base}/catalogs/${bucket}.json`, { schema: "wattness.terminal-display-catalog.v1", release: releaseId, bucket, files: list }),
  }));
  const manifest = put(`${base}/manifest.json`, {
    schema: "wattness.terminal-display-manifest.v1",
    audience: "visitor",
    release: releaseId,
    generated_at: "2026-11-26T12:21:00-06:00",
    sources: [],
    files: [],
    catalogs,
  });
  put(`${base}/current.json`, {
    schema: "wattness.terminal-display-current.v1",
    release: releaseId,
    manifest: `releases/${releaseId}/manifest.json`,
    manifest_sha256: manifest.sha256,
    manifest_bytes: manifest.bytes,
  });
  put("/release.json", {
    schema: "wattness.terminal-content-release.v1",
    releaseId: `terminal-visitor-test-${releaseId}`,
    generatedAt: "2026-11-26T18:21:00.000Z",
    build: "0".repeat(40),
    siteRelease: "terminal-visitor-test",
    siteManifestSha256: "0".repeat(64),
    dataRelease: releaseId,
    dataManifestSha256: manifest.sha256,
  });
  return {
    origin,
    releaseId,
    manifestSha256: manifest.sha256,
    fetcher: async (url) => {
      const body = files.get(url);
      if (!body) throw Object.assign(new Error(`404 ${url}`), { name: "DataError", code: "missing" });
      return body;
    },
    verifierFetcher: async (url) => files.get(url) ?? null,
  };
}
