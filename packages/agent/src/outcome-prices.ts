import type { FileRef } from "@gatelock/core";
import {
  DataError,
  ProvenanceLog,
  Store,
  assertOpenDay,
  defaultCacheDir,
  httpFetcher,
  openLive,
  openRelease,
  parsePointDay,
  priceRoute,
  publishedCents,
  sha256Hex,
  toCents,
  type Fetcher,
  type PointDay,
  type Provenance,
} from "@gatelock/data";
import { citeFiles, provisionalQuarters, quarters, type LeafPrices, type Quarter, type Stage } from "./outcome.js";

export interface PriceRequest {
  operatingDay: string;
  stage: Stage;
  /** Unix seconds of the operating day's first second (CT midnight). */
  dayStart: number;
  hours: number;
  nodes: readonly string[];
  hubs: readonly string[];
}

export interface PriceSet {
  kind: "ready";
  releaseId: string;
  manifestSha256: string;
  /** Live-tier day index the real-time prices came from, at stage 2. */
  liveDay: FileRef | null;
  leaf(node: string, hub: string): LeafPrices;
  /** The hub's day-ahead prices for the beside-the-result mark, when the release holds them. */
  hubDayAhead(hub: string): number[] | null;
}

export interface NotYet {
  kind: "not-yet";
  releaseId: string | null;
  reasons: string[];
}

export type PriceSource = (request: PriceRequest) => Promise<PriceSet | NotYet>;

export interface ReleaseSourceOptions {
  origin?: string;
  cacheDir?: string;
  fetcher?: Fetcher;
  concurrency?: number;
}

const DAY_IN = /\d{4}-\d{2}-\d{2}/g;

/**
 * Prices from the release release.json selects now (day-ahead at the nodes; at stage 3, published real-time
 * at the hubs) and, at stage 2, the live tier's SCED runs. Only the operating day's own routes are read.
 */
export function releasePrices(options: ReleaseSourceOptions = {}): PriceSource {
  return async (req) => {
    assertOpenDay(req.operatingDay);
    const od = req.operatingDay;
    const store = new Store(options.cacheDir ?? defaultCacheDir());
    const log = new ProvenanceLog();
    const fetcher = options.fetcher ?? httpFetcher();
    const common = { fetcher, store, log, ...(options.origin ? { origin: options.origin } : {}) };
    const limit = options.concurrency ?? 8;
    const release = await openRelease(common);
    const releaseId = release.dataRelease;
    const notYet = (reasons: string[]): NotYet => ({ kind: "not-yet", releaseId, reasons });

    const read = async (point: string): Promise<{ day: PointDay; ref: FileRef } | null> => {
      const route = priceRoute(point, od);
      if (!(await release.has(route))) return null;
      const file = await release.read(route);
      return { day: parsePointDay(file.json, point, od), ref: { route, sha256: file.provenance.sha256 } };
    };

    const nodes = [...new Set(req.nodes)];
    const nodeDays = await mapLimit(nodes, limit, read);
    const missing = nodes.filter((_, i) => nodeDays[i] === null);
    if (missing.length > 0) {
      return notYet([`release ${releaseId} holds no prices for ${od} at ${listSome(missing)}; the day-ahead prices are not yet published`]);
    }
    const daNode = new Map<string, { cents: number[]; ref: FileRef }>();
    const unpublished: string[] = [];
    nodes.forEach((node, i) => {
      const got = nodeDays[i]!;
      const cents = publishedCents(got.day.da);
      if (!cents || cents.length !== req.hours) unpublished.push(node);
      else daNode.set(node, { cents, ref: got.ref });
    });
    if (unpublished.length > 0) {
      return notYet([`release ${releaseId} does not hold every published day-ahead hour for ${od} at ${listSome(unpublished)}`]);
    }

    const hubs = [...new Set(req.hubs)];
    const hubDays = new Map<string, { day: PointDay; ref: FileRef } | null>();
    (await mapLimit(hubs, limit, read)).forEach((d, i) => hubDays.set(hubs[i]!, d));

    const rtHub = new Map<string, { quarters: Quarter[]; refs: FileRef[] }>();
    let liveDay: FileRef | null = null;
    if (req.stage === 3) {
      const reasons: string[] = [];
      for (const hub of hubs) {
        const d = hubDays.get(hub);
        if (!d) {
          reasons.push(`release ${releaseId} holds no prices for ${od} at ${hub}`);
          continue;
        }
        const intervals = d.day.rt15.map((v) => (v.grade === "published" && v.usdPerMwh !== null ? toCents(v.usdPerMwh) : null));
        const open = intervals.filter((v) => v === null).length;
        const q = quarters(intervals, req.hours);
        if (open > 0) reasons.push(`${hub}: ${open} of ${intervals.length} real-time intervals are not yet published (NP6-905-CD)`);
        else rtHub.set(hub, { quarters: q as Quarter[], refs: [d.ref] });
      }
      if (reasons.length > 0) return notYet(reasons);
    } else if (req.stage === 2) {
      const live = await openLive({ ...common, concurrency: limit });
      const pin = live.pins.find((p) => p.day === od);
      if (!pin) return notYet([`the live tier holds ${live.days.join(", ") || "no day"}, not ${od}`]);
      liveDay = { route: pin.path, sha256: pin.sha256 };
      const points = await live.pointDays(od, hubs);
      const refs = log
        .entries()
        .filter((p) => [`/live/v1/days/${od}/`, `/live/v1/runs/${od}/`, "/live/v1/points/"].some((prefix) => p.route.startsWith(prefix)))
        .map(ref);
      const reasons: string[] = [];
      for (const p of points) {
        const runs = p.runs.map((r) => ({ unix: unixOf(r.run), usdPerMwh: r.price, complete: r.complete }));
        const q = provisionalQuarters(runs, req.dayStart, req.hours);
        const open = q.filter((x) => x === null).length;
        if (open > 0) reasons.push(`${p.point}: ${open} of ${req.hours} hours lack provisional prices from the SCED runs (through ${p.through ?? "no run"})`);
        else rtHub.set(p.point, { quarters: q as Quarter[], refs });
      }
      if (reasons.length > 0) return notYet(reasons);
    }

    const trail = log.entries().filter((p) => !p.route.startsWith("/api/") && !p.route.startsWith("/live/"));
    const manifestRef = trail.find((p) => p.route.endsWith(`/releases/${releaseId}/manifest.json`));
    if (!manifestRef) throw new Error(`the release manifest of ${releaseId} was not logged`);
    const catalogs = new Map<string, FileRef>();
    for (const p of trail) {
      const m = /\/catalogs\/([0-9a-f]{2})\.json$/.exec(p.route);
      if (m) catalogs.set(m[1] as string, ref(p));
    }

    return {
      kind: "ready",
      releaseId,
      manifestSha256: release.pin.dataManifestSha256,
      liveDay,
      leaf(node, hub) {
        const da = daNode.get(node);
        if (!da) throw new Error(`no day-ahead prices loaded for ${node}`);
        const rt = req.stage === 1 ? null : rtHub.get(hub);
        if (rt === undefined) throw new Error(`no real-time prices loaded for ${hub}`);
        const payloads = [da.ref, ...(rt?.refs ?? [])];
        const buckets = new Set(payloads.filter((f) => f.route.startsWith("/api/")).map((f) => sha256Hex(f.route).slice(0, 2)));
        const leafTrail = [ref(manifestRef), ...[...buckets].flatMap((b) => (catalogs.has(b) ? [catalogs.get(b)!] : []))];
        const files = citeFiles(leafTrail, payloads);
        assertOwnDay(od, [...files, ...(liveDay ? [liveDay] : [])]);
        return {
          daNodeCents: da.cents,
          rtHubCents: rt ? rt.quarters : null,
          inputs: { release_id: releaseId, manifest_sha256: release.pin.dataManifestSha256, files, live: liveDay ? [liveDay] : [] },
        };
      },
      hubDayAhead(hub) {
        const d = hubDays.get(hub);
        return d ? publishedCents(d.day.da) : null;
      },
    };
  };
}

/** An outcome may cite prices for its own operating day and nothing later or earlier. */
export function assertOwnDay(od: string, refs: readonly FileRef[]): void {
  for (const f of refs) {
    for (const m of f.route.matchAll(DAY_IN)) {
      if (m[0] !== od) throw new DataError("route", `${f.route} names ${m[0]}; an outcome for ${od} uses only that day's prices`);
    }
  }
}

function ref(p: Provenance): FileRef {
  return { route: p.route, sha256: p.sha256 };
}

function unixOf(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new DataError("shape", `SCED run time ${iso} is not a time`);
  return Math.floor(ms / 1000);
}

function listSome(xs: readonly string[]): string {
  return xs.length <= 3 ? xs.join(", ") : `${xs.slice(0, 3).join(", ")} and ${xs.length - 3} more`;
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
