// An in-memory origin laid out like the public release and live tier, built
// from test values. Every pointer names its child by SHA-256, as the real one does.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex } from "../src/hash.js";
import type { Fetcher } from "../src/http.js";

export const ORIGIN = "https://origin.test";
export const RELEASE = "terminal-daily-20261124-1120";

const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

export function tempCache(): string {
  return mkdtempSync(join(tmpdir(), "gatelock-data-"));
}

export class FakeOrigin {
  readonly files = new Map<string, Uint8Array>();
  readonly requests: string[] = [];

  readonly fetcher: Fetcher = async (url) => {
    this.requests.push(url);
    const body = this.files.get(url);
    if (!body) throw Object.assign(new Error(`404 ${url}`), { name: "DataError", code: "missing" });
    return body;
  };

  put(path: string, value: unknown): { sha256: string; bytes: number } {
    const body = value instanceof Uint8Array ? value : enc(value);
    this.files.set(`${ORIGIN}${path}`, body);
    return { sha256: sha256Hex(body), bytes: body.byteLength };
  }
}

export function instrument(point: string, day: string, opts: { hours?: number; da?: number; rt?: number; rtGrade?: string } = {}) {
  const n = opts.hours ?? 24;
  const da = opts.da ?? 30;
  const rt = opts.rt ?? 31.25;
  const grade = opts.rtGrade ?? "published";
  const hourStarts = Array.from({ length: n }, (_, h) => `${day}T${String(h).padStart(2, "0")}:00:00-06:00`);
  return {
    schema: "wattness.instrument.v1",
    key: { operating_day: day, settlement_point: point },
    mode: "record",
    calendar: {
      hour_starts: hourStarts,
      interval_starts: hourStarts.flatMap((s) => [0, 15, 30, 45].map((m) => s.replace(":00:00", `:${String(m).padStart(2, "0")}:00`))),
    },
    da: { final: true, hours: hourStarts.map((_, h) => ({ dam_spp: da + h, grade: "published" })) },
    rt: {
      final: false,
      hours: hourStarts.map((_, h) => ({ settled: { grade, value: rt + h, n_published: 4 } })),
      intervals: Array.from({ length: n * 4 }, (_, i) => ({ rtspp: { grade, value: rt + Math.floor(i / 4) } })),
    },
  };
}

export function census(rows: Record<string, unknown>[]) {
  return {
    schema: "fleet-geo.v1",
    census: { source: "NP3-988-ER", posted: "2026-09-19T05:09:48.000-05:00", storage: rows.length },
    rows,
  };
}

export const BATTERY_ROW = {
  esr: "TEST_ESR1",
  in_census: true,
  settlement_point: "TEST_RN",
  load_zone: "LZ_HOUSTON",
  county: "Harris",
  p_max_mw: 100,
  e_max_mwh: 206.438,
};

/**
 * Publishes a release: release.json -> current.json -> manifest -> catalogs -> payloads.
 * `routes` maps each route to its payload.
 */
export function publishRelease(origin: FakeOrigin, routes: Record<string, unknown>, generatedAt = "2026-11-24T11:20:07-06:00") {
  const base = `/data/terminal-display/v1/releases/${RELEASE}`;
  const buckets = new Map<string, unknown[]>();
  for (const [route, payload] of Object.entries(routes)) {
    const routeHash = sha256Hex(route);
    const body = enc(payload);
    const sha256 = sha256Hex(body);
    const path = `json/${routeHash}-${sha256}.json`;
    origin.put(`${base}/${path}`, body);
    const bucket = routeHash.slice(0, 2);
    const list = buckets.get(bucket) ?? [];
    list.push({ route, path, schema: "test", media_type: "application/json", sha256, bytes: body.byteLength, source_ids: ["t"], clocks: {} });
    buckets.set(bucket, list);
  }
  const catalogs = [...buckets].map(([bucket, files]) => {
    const pin = origin.put(`${base}/catalogs/${bucket}.json`, { schema: "wattness.terminal-display-catalog.v1", release: RELEASE, bucket, files });
    return { bucket, path: `catalogs/${bucket}.json`, ...pin };
  });
  const manifest = origin.put(`${base}/manifest.json`, {
    schema: "wattness.terminal-display-manifest.v1",
    audience: "visitor",
    release: RELEASE,
    generated_at: generatedAt,
    sources: [],
    files: [],
    catalogs,
  });
  origin.put(`${base}/current.json`, {
    schema: "wattness.terminal-display-current.v1",
    release: RELEASE,
    manifest: `releases/${RELEASE}/manifest.json`,
    manifest_sha256: manifest.sha256,
    manifest_bytes: manifest.bytes,
  });
  origin.put("/release.json", {
    schema: "wattness.terminal-content-release.v1",
    releaseId: `terminal-visitor-test-${RELEASE}`,
    generatedAt: "2026-11-24T21:00:45.110Z",
    build: "0".repeat(40),
    siteRelease: "terminal-visitor-test",
    siteManifestSha256: "0".repeat(64),
    dataRelease: RELEASE,
    dataManifestSha256: manifest.sha256,
  });
  return { base, manifestSha256: manifest.sha256 };
}

/** Publishes a live tier with `runs` SCED runs per day over `points`. */
export function publishLive(origin: FakeOrigin, days: string[], points: string[], runs = 3) {
  const list = enc({ schema: "wattness.terminal-live-points.v1", tier: "free", day_first: days[0], points });
  const pointsRef = { path: `points/${sha256Hex(list)}.json`, sha256: sha256Hex(list), count: points.length };
  origin.put(`/live/v1/${pointsRef.path}`, list);
  const dayEntries = days.map((day) => {
    const runRefs = Array.from({ length: runs }, (_, r) => {
      const run = `${day}T00:${String(5 * r).padStart(2, "0")}:00-06:00`;
      const body = enc({
        schema: "wattness.terminal-live-run.v1",
        tier: "free",
        operating_day: day,
        run,
        points: pointsRef,
        lmp: points.map((_, i) => 20 + i + r),
        price: points.map((_, i) => 20 + i + r),
        seen_at: run,
        complete: true,
      });
      const sha256 = sha256Hex(body);
      const path = `runs/${day}/${sha256}.json`;
      origin.put(`/live/v1/${path}`, body);
      return { run, path, sha256, bytes: body.byteLength, complete: true };
    });
    const index = enc({
      schema: "wattness.terminal-live-day.v1",
      tier: "free",
      operating_day: day,
      points: pointsRef,
      runs: runRefs,
      run_gaps: [],
      point_gaps: {},
      dam: null,
      through: runRefs.at(-1)?.run ?? null,
    });
    const sha256 = sha256Hex(index);
    const path = `days/${day}/${sha256}.json`;
    origin.put(`/live/v1/${path}`, index);
    return { operating_day: day, index: { path, sha256, bytes: index.byteLength } };
  });
  origin.put("/live/v1/current.json", { schema: "wattness.terminal-live-current.v1", tier: "free", days: dayEntries });
}
