import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CATALOG_SCHEMA,
  CURRENT_SCHEMA,
  DISPLAY_ROOT,
  MANIFEST_SCHEMA as DISPLAY_MANIFEST_SCHEMA,
  RELEASE_SCHEMA,
} from "../../data/dist/release.js";
import { INSTRUMENT_SCHEMA } from "../../data/dist/prices.js";
import { ExcludedDayError, sha256Hex } from "@gatelock/data";
import {
  leafHash,
  merkleRoot,
  inclusionProof,
  rootFromProof,
  operatingDayStartTs,
  outcomeShapeErrors,
  type Outcome,
} from "@gatelock/core";
import { describe, expect, it } from "vitest";
import { checkSources, outcomeArm as verifierOutcomeArm } from "../../verifier/dist/index.js";
import {
  buildOutcome,
  hedgeDayAheadMarkUusd,
  outcomeArm,
  outcomeTree,
  provisionalQuarters,
  quarters,
  type Quarter,
} from "../src/outcome.js";
import { assertOwnDay, releasePrices } from "../src/outcome-prices.js";
import { DAY, OD, daCents, fakeRef, fixtureLeaf, rtQuarters } from "./outcome-helpers.js";

const ROOT = `0x${"12".repeat(32)}` as const;
const inputs = { release_id: "r", manifest_sha256: "ab".repeat(32), files: [fakeRef(`/api/prices/DSWL_BES1/${DAY}`)], live: [] };

describe("outcome arithmetic", () => {
  const m = fixtureLeaf("DSWL_ESS_ESR1");

  it("values the physical leg once at the plan's day-ahead node basis and agrees with the verifier", () => {
    for (const stage of [1, 3] as const) {
      const doc = buildOutcome(m, ROOT, stage, { daNodeCents: daCents("DSWL_BES1"), rtHubCents: stage === 1 ? null : rtQuarters("HB_NORTH"), inputs });
      expect(outcomeShapeErrors(doc)).toEqual([]);
      for (const id of ["A", "B", "C"] as const) {
        const arm = m.arms[id]!;
        expect(doc.arms[id]).toEqual(verifierOutcomeArm(m, doc, arm));
        const energy = arm.kw.reduce((a, kw, h) => a + kw * doc.prices.da_node_cents[h]! * 10, 0);
        expect(doc.arms[id]!.energy_uusd).toBe(energy);
      }
    }
  });

  it("leaves a hedged arm's hedge and net open at stage 1 and settles arm A", () => {
    const doc = buildOutcome(m, ROOT, 1, { daNodeCents: daCents("DSWL_BES1"), rtHubCents: null, inputs });
    expect(m.arms.A!.contracts.every((q) => q === 0)).toBe(true);
    expect(doc.arms.A!.hedge_uusd).toBe(0);
    expect(doc.arms.A!.net_uusd).toBe(doc.arms.A!.energy_uusd - doc.arms.A!.wear_uusd);
    expect(doc.arms.C!.hedge_uusd).toBeNull();
    expect(doc.arms.C!.net_uusd).toBeNull();
    expect(doc.prices.rt_hub_cents).toBeNull();
  });

  it("settles the hedge on the clipped mean of the four hub intervals, and keeps the day-ahead mark out of net", () => {
    const rt = rtQuarters("HB_NORTH");
    const doc = buildOutcome(m, ROOT, 3, { daNodeCents: daCents("DSWL_BES1"), rtHubCents: rt, inputs });
    const c = m.arms.C!;
    const [lo, hi] = m.instrument.range_cents;
    let hedge = 0;
    c.contracts.forEach((q, h) => {
      const s4 = Math.min(4 * hi, Math.max(4 * lo, rt[h]!.reduce((a, b) => a + b, 0)));
      hedge += q * (4 * m.instrument.entry_cents[h]! - s4) * 2500;
    });
    const a = doc.arms.C!;
    expect(a.hedge_uusd).toBe(hedge);
    expect(a.net_uusd).toBe(a.energy_uusd - a.wear_uusd + hedge - a.fees_uusd);
    expect(a.fees_uusd).toBe(c.contracts.reduce((s, q) => s + Math.abs(q), 0) * 35 * 10_000);
    const mark = hedgeDayAheadMarkUusd(m, c, daCents("HB_NORTH"));
    expect(mark).not.toBe(hedge);
    expect(Object.values(a)).not.toContain(mark);
  });

  it("refuses prices that do not fit the day or the stage", () => {
    expect(() => buildOutcome(m, ROOT, 1, { daNodeCents: daCents("X").slice(1), rtHubCents: null, inputs })).toThrow(/23 day-ahead prices/);
    expect(() => buildOutcome(m, ROOT, 1, { daNodeCents: daCents("X"), rtHubCents: rtQuarters("X"), inputs })).toThrow(/no real-time/);
    expect(() => buildOutcome(m, ROOT, 2, { daNodeCents: daCents("X"), rtHubCents: null, inputs })).toThrow(/needs 24 hours/);
  });

  it("marks an hour without its four prices as open, which leaves a hedged arm's net open", () => {
    const rt: (Quarter | null)[] = rtQuarters("HB_NORTH");
    const hedgedHour = m.arms.C!.contracts.findIndex((q) => q !== 0);
    rt[hedgedHour] = null;
    const doc = buildOutcome(m, ROOT, 2, { daNodeCents: daCents("DSWL_BES1"), rtHubCents: rt, inputs });
    expect(doc.arms.C!.hedge_uusd).toBeNull();
    expect(doc.arms.A!.net_uusd).not.toBeNull();
    expect(outcomeArm(m, doc.prices, m.arms.C!)).toEqual(verifierOutcomeArm(m, doc, m.arms.C!));
  });
});

describe("outcome tree", () => {
  const docs = ["CLO_ESR1", "DSWL_ESS_ESR1"].map((r) => {
    const m = fixtureLeaf(r);
    return { resource: r, doc: buildOutcome(m, ROOT, 1, { daNodeCents: daCents(m.battery.settlement_point), rtHubCents: null, inputs }) };
  });

  it("hashes each document like a plan leaf and roots them in resource order", () => {
    const tree = outcomeTree(docs);
    expect(tree.root).toBe(merkleRoot(docs.map((d) => leafHash(d.doc))));
    const proof = inclusionProof(tree.leaves.map((l) => l.leaf), 1);
    expect(rootFromProof(leafHash(docs[1]!.doc), 1, 2, proof)).toBe(tree.root);
  });

  it("refuses documents out of the plan's order", () => {
    expect(() => outcomeTree([...docs].reverse())).toThrow(/out of resource order/);
  });
});

describe("provisional real-time prices from SCED runs", () => {
  const start = operatingDayStartTs(OD);
  const run = (offset: number, usd: number | null, complete = true) => ({ unix: start + offset, usdPerMwh: usd, complete });

  it("time-weights the runs in effect, using only the day's own runs", () => {
    const runs = [run(21, 20), run(321, 30), run(621, 40)];
    for (let t = 921; t < 86_400; t += 300) runs.push(run(t, 50));
    const q = provisionalQuarters(runs, start, 24);
    // 0..21 s has no run of this day, so the first interval weights 879 s: 300 at 20, 300 at 30, 279 at 40.
    expect(q[0]![0]).toBe(Math.floor(((300 * 20 + 300 * 30 + 279 * 40) / 879) * 100 + 0.5));
    // 900..921 s still carries the 40 run, then 50.
    expect(q[0]![1]).toBe(Math.floor(((21 * 40 + 879 * 50) / 900) * 100 + 0.5));
    expect(q[23]).toEqual([5000, 5000, 5000, 5000]);
  });

  it("leaves an interval unpriced when a run in effect is incomplete or unpriced", () => {
    const runs = [run(0, 20), run(300, null), run(900, 25, false), run(1800, 25)];
    const q = provisionalQuarters(runs, start, 24);
    expect(q[0]).toBeNull();
    expect(q[1]).toEqual([2500, 2500, 2500, 2500]);
  });

  it("refuses a run from before the operating day", () => {
    expect(() => provisionalQuarters([run(-5, 20)], start, 24)).toThrow(/before the operating day/);
  });

  it("groups intervals into hours", () => {
    expect(quarters([1, 2, 3, 4, 5, null, 7, 8], 2)).toEqual([[1, 2, 3, 4], null]);
  });
});

describe("own-day guard", () => {
  it("refuses any cited route that names another day", () => {
    expect(() => assertOwnDay(DAY, [fakeRef(`/api/prices/HB_NORTH/${DAY}`)])).not.toThrow();
    expect(() => assertOwnDay(DAY, [fakeRef("/api/prices/HB_NORTH/2026-11-27")])).toThrow(/uses only that day's prices/);
  });
});

// A miniature data site with the release's hash chain: release.json -> current.json -> manifest -> catalog -> payload.
function fakeSite(day: string, payloads: Record<string, unknown>) {
  const files = new Map<string, Uint8Array>();
  const enc = (x: unknown) => new TextEncoder().encode(JSON.stringify(x));
  const origin = "https://data.test";
  const rel = "fake-daily-1";
  const base = `${origin}${DISPLAY_ROOT}/releases/${rel}`;
  const buckets = new Map<string, unknown[]>();
  for (const [route, body] of Object.entries(payloads)) {
    const bytes = enc(body);
    const sha = sha256Hex(bytes);
    const path = `json/${sha}.json`;
    files.set(`${base}/${path}`, bytes);
    const b = sha256Hex(route).slice(0, 2);
    buckets.set(b, [...(buckets.get(b) ?? []), { route, path, schema: INSTRUMENT_SCHEMA, media_type: "application/json", sha256: sha, bytes: bytes.byteLength, source_ids: [], clocks: {} }]);
  }
  const catalogs = [...buckets].map(([bucket, list]) => {
    const bytes = enc({ schema: CATALOG_SCHEMA, release: rel, bucket, files: list });
    files.set(`${base}/catalogs/${bucket}.json`, bytes);
    return { bucket, path: `catalogs/${bucket}.json`, sha256: sha256Hex(bytes), bytes: bytes.byteLength };
  });
  const manifest = enc({ schema: DISPLAY_MANIFEST_SCHEMA, release: rel, generated_at: `${day}T20:00:00Z`, files: [], catalogs });
  const manifestSha = sha256Hex(manifest);
  files.set(`${base}/manifest.json`, manifest);
  files.set(`${base}/current.json`, enc({ schema: CURRENT_SCHEMA, release: rel, manifest: `releases/${rel}/manifest.json`, manifest_sha256: manifestSha }));
  files.set(`${origin}/release.json`, enc({ schema: RELEASE_SCHEMA, releaseId: "site-1", generatedAt: `${day}T20:00:00Z`, dataRelease: rel, dataManifestSha256: manifestSha }));
  const fetcher = async (url: string) => {
    const b = files.get(url);
    if (!b) throw new Error(`404 ${url}`);
    return b;
  };
  // The verifier fetches by path on the site; give it the same bytes.
  const siteFetcher = async (url: string) => files.get(url) ?? null;
  return { origin, rel, manifestSha, fetcher, siteFetcher };
}

function pointDay(point: string, day: string, da: number[], rt15: (number | null)[]) {
  const hours = Array.from({ length: 24 }, (_, h) => `${day}T${String(h).padStart(2, "0")}:00:00-06:00`);
  return {
    schema: INSTRUMENT_SCHEMA,
    mode: "record",
    key: { operating_day: day, settlement_point: point },
    calendar: { hour_starts: hours, interval_starts: hours.flatMap((s) => [s, s, s, s]) },
    da: { final: false, hours: da.map((c) => ({ dam_spp: c / 100, grade: "published" })) },
    rt: {
      final: false,
      hours: hours.map(() => ({ settled: { value: null, grade: "absent" } })),
      intervals: rt15.map((c) => ({ rtspp: c === null ? { value: null, grade: "absent" } : { value: c / 100, grade: "published", source: "NP6-905-CD" } })),
    },
  };
}

describe("release prices", () => {
  const cacheDir = () => mkdtempSync(join(tmpdir(), "gate-outcome-cache-"));
  const req = (stage: 1 | 3) => ({ operatingDay: DAY, stage, dayStart: operatingDayStartTs(OD), hours: 24, nodes: ["DSWL_BES1"], hubs: ["HB_NORTH"] });

  it("reports the day-ahead prices as not yet published when the release lacks the day", async () => {
    const site = fakeSite(DAY, { "/api/prices/DSWL_BES1/2026-11-25": pointDay("DSWL_BES1", "2026-11-25", daCents("x"), Array(96).fill(1)) });
    const got = await releasePrices({ origin: site.origin, fetcher: site.fetcher, cacheDir: cacheDir() })(req(1));
    expect(got.kind).toBe("not-yet");
    if (got.kind === "not-yet") expect(got.reasons[0]).toMatch(/holds no prices for 2026-11-26 at DSWL_BES1/);
  });

  it("cites the manifest, the catalog and the payload, and the verifier re-derives every digest", async () => {
    const rt = rtQuarters("HB_NORTH").flat();
    const site = fakeSite(DAY, {
      "/api/prices/DSWL_BES1/2026-11-26": pointDay("DSWL_BES1", DAY, daCents("DSWL_BES1"), Array(96).fill(null)),
      "/api/prices/HB_NORTH/2026-11-26": pointDay("HB_NORTH", DAY, daCents("HB_NORTH"), rt),
    });
    const got = await releasePrices({ origin: site.origin, fetcher: site.fetcher, cacheDir: cacheDir() })(req(3));
    expect(got.kind).toBe("ready");
    if (got.kind !== "ready") return;
    const p = got.leaf("DSWL_BES1", "HB_NORTH");
    expect(p.daNodeCents).toEqual(daCents("DSWL_BES1"));
    expect(p.rtHubCents).toEqual(rtQuarters("HB_NORTH"));
    expect(p.inputs.release_id).toBe(site.rel);
    expect(p.inputs.manifest_sha256).toBe(site.manifestSha);
    expect(p.inputs.files.map((f) => f.route)).toEqual(
      expect.arrayContaining([`${DISPLAY_ROOT}/releases/${site.rel}/manifest.json`, "/api/prices/DSWL_BES1/2026-11-26", "/api/prices/HB_NORTH/2026-11-26"]),
    );
    const checked = await checkSources(
      { releaseId: p.inputs.release_id, manifestSha256: p.inputs.manifest_sha256, files: p.inputs.files, live: p.inputs.live },
      { fetcher: site.siteFetcher, site: site.origin },
    );
    expect(checked.problems).toEqual([]);
    expect(checked.missing).toEqual([]);
    const m = fixtureLeaf("DSWL_ESS_ESR1");
    const doc: Outcome = buildOutcome(m, ROOT, 3, p);
    expect(doc.arms.C!.net_uusd).not.toBeNull();
  });

  it("does not settle stage 3 while any hub interval is unpublished", async () => {
    const rt: (number | null)[] = rtQuarters("HB_NORTH").flat();
    rt[95] = null;
    const site = fakeSite(DAY, {
      "/api/prices/DSWL_BES1/2026-11-26": pointDay("DSWL_BES1", DAY, daCents("DSWL_BES1"), Array(96).fill(null)),
      "/api/prices/HB_NORTH/2026-11-26": pointDay("HB_NORTH", DAY, daCents("HB_NORTH"), rt),
    });
    const got = await releasePrices({ origin: site.origin, fetcher: site.fetcher, cacheDir: cacheDir() })(req(3));
    expect(got.kind).toBe("not-yet");
    if (got.kind === "not-yet") expect(got.reasons[0]).toMatch(/HB_NORTH: 1 of 96 real-time intervals/);
  });

  it("refuses an excluded operating day before any fetch", async () => {
    let fetched = 0;
    const source = releasePrices({ fetcher: async () => (fetched++, new Uint8Array()), cacheDir: cacheDir() });
    await expect(source({ ...req(1), operatingDay: "2026-08-10" })).rejects.toBeInstanceOf(ExcludedDayError);
    expect(fetched).toBe(0);
  });
});
