import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BatteryRecord, readBatteryRecord, readWalkthroughBattery } from "./census.js";
import { type Day, assertDay, dayRange } from "./days.js";
import { DataError } from "./errors.js";
import { expect, isRecord } from "./fetch-verified.js";
import { HISTORY_START, EXCLUDED_DAYS, assertOpenWindow } from "./excluded-days.js";
import { sha256Hex } from "./hash.js";
import { type Fetcher, httpFetcher, mapLimit, offlineFetcher } from "./http.js";
import { type LiveDayPin, type LivePointDay, openLive } from "./live.js";
import { type PointDay, parsePointDay, priceRoute } from "./prices.js";
import { type Provenance, ProvenanceLog } from "./provenance.js";
import { type Release, type ReleasePin, openRelease } from "./release.js";
import { Store, defaultCacheDir } from "./store.js";

export const SNAPSHOT_SCHEMA = "gate-record.sync.v1";

/** What one sync read: enough to read the same bytes again from the cache alone. */
export interface Snapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  resource: string;
  /** Absent means the census row. */
  identity?: "census" | "walkthrough";
  release: ReleasePin;
  live: LiveDayPin[];
  hubDays: Day[];
  nodeDays: Day[];
  files: Provenance[];
}

export interface PlanInputs {
  release: ReleasePin & { manifestGeneratedAt: string };
  battery: BatteryRecord;
  /** Hourly DA and RT at the battery's hub, every day the release holds from `historyFrom`. */
  hub: PointDay[];
  /** The same at the battery's settlement point. */
  node: PointDay[];
  live: { pins: LiveDayPin[]; hub: LivePointDay[]; node: LivePointDay[] };
  /** Payloads and live files the plan may cite, in read order. */
  files: Provenance[];
  /** Manifest and catalogs that pin the payloads. */
  trail: Provenance[];
}

export interface LoadOptions {
  resource: string;
  historyFrom?: Day;
  cacheDir?: string;
  /** Re-read a previous sync from the cache; with `offline`, nothing is fetched. */
  snapshot?: Snapshot;
  /** Fix the release and live days without fixing the price days, so several batteries read one release. */
  pins?: { release: ReleasePin; live: LiveDayPin[] };
  /** Where the battery's identity and limits come from: the census row, or the hedging walkthrough. */
  identity?: "census" | "walkthrough";
  offline?: boolean;
  fetcher?: Fetcher;
  origin?: string;
  concurrency?: number;
}

export async function loadPlanInputs(options: LoadOptions): Promise<{ inputs: PlanInputs; snapshot: Snapshot }> {
  const historyFrom = options.historyFrom ?? HISTORY_START;
  assertDay(historyFrom, "historyFrom");
  // History runs to the release's newest day, which is after the excluded days, so it must also start after them.
  if (historyFrom <= EXCLUDED_DAYS.to) assertOpenWindow(historyFrom, EXCLUDED_DAYS.to);
  if (options.offline && !options.snapshot) throw new DataError("offline", "an offline load needs a snapshot");
  if (options.snapshot && options.snapshot.resource !== options.resource) {
    throw new DataError("shape", `snapshot is for ${options.snapshot.resource}, not ${options.resource}`);
  }
  const store = new Store(options.cacheDir ?? defaultCacheDir());
  const fetcher = options.fetcher ?? (options.offline ? offlineFetcher : httpFetcher());
  const log = new ProvenanceLog();
  const common = { fetcher, store, log, ...(options.origin ? { origin: options.origin } : {}) };
  const limit = options.concurrency ?? 8;

  const pins = options.snapshot ?? options.pins;
  const release = await openRelease({ ...common, ...(pins ? { pin: pins.release } : {}) });
  const battery =
    (options.snapshot?.identity ?? options.identity) === "walkthrough"
      ? await readWalkthroughBattery(release, options.resource)
      : await readBatteryRecord(release, options.resource);
  const newest = release.generatedAt.slice(0, 10);
  assertDay(newest, "release day");

  const heldDays = async (point: string, pinned: Day[] | undefined) => {
    if (pinned) return pinned;
    const days = dayRange(historyFrom, newest);
    assertOpenWindow(days[0] as Day, newest);
    const held = await mapLimit(days, limit, (d) => release.has(priceRoute(point, d)));
    return days.filter((_, i) => held[i]);
  };
  const hubDays = await heldDays(battery.hub, options.snapshot?.hubDays);
  const nodeDays = await heldDays(battery.settlementPoint, options.snapshot?.nodeDays);
  const hub = await readPointDays(release, battery.hub, hubDays, limit);
  const node = await readPointDays(release, battery.settlementPoint, nodeDays, limit);

  const live = await openLive({ ...common, ...(pins ? { pins: pins.live } : {}), concurrency: limit });
  const liveHub: LivePointDay[] = [];
  const liveNode: LivePointDay[] = [];
  for (const day of live.days) {
    const [n, h] = await live.pointDays(day, [battery.settlementPoint, battery.hub]);
    liveNode.push(n as LivePointDay);
    liveHub.push(h as LivePointDay);
  }

  const all = log.entries();
  const isTrail = (p: Provenance) => !p.route.startsWith("/api/") && !p.route.startsWith("/live/");
  const inputs: PlanInputs = {
    release: { ...release.pin, manifestGeneratedAt: release.generatedAt },
    battery,
    hub,
    node,
    live: { pins: [...live.pins], hub: liveHub, node: liveNode },
    files: all.filter((p) => !isTrail(p)),
    trail: all.filter(isTrail),
  };
  // A replay returns the snapshot it was given: it pins the same bytes, though it reads fewer files to reach them.
  const snapshot: Snapshot = options.snapshot ?? {
    schema: SNAPSHOT_SCHEMA,
    resource: options.resource,
    ...(options.identity === "walkthrough" ? { identity: "walkthrough" as const } : {}),
    release: release.pin,
    live: [...live.pins],
    hubDays,
    nodeDays,
    files: all,
  };
  return { inputs, snapshot };
}

async function readPointDays(release: Release, point: string, days: Day[], limit: number): Promise<PointDay[]> {
  return mapLimit(days, limit, async (day) => {
    const file = await release.read(priceRoute(point, day));
    return parsePointDay(file.json, point, day);
  });
}

/** Writes `<cache>/sync/<sha256>.json` and points `latest.json` at the same bytes. Returns the hash. */
export function writeSnapshot(snapshot: Snapshot, cacheDir = defaultCacheDir()): { sha256: string; path: string } {
  const dir = join(cacheDir, "sync");
  mkdirSync(dir, { recursive: true });
  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  const sha256 = sha256Hex(text);
  const path = join(dir, `${sha256}.json`);
  writeFileSync(path, text);
  const tmp = join(dir, `latest.json.${process.pid}.tmp`);
  writeFileSync(tmp, text);
  renameSync(tmp, join(dir, "latest.json"));
  return { sha256, path };
}

export function readSnapshot(path: string): Snapshot {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  expect(isRecord(raw) && raw.schema === SNAPSHOT_SCHEMA, `${path}: expected ${SNAPSHOT_SCHEMA}`);
  expect(typeof raw.resource === "string" && isRecord(raw.release), `${path}: resource, release`);
  expect(Array.isArray(raw.live) && Array.isArray(raw.hubDays) && Array.isArray(raw.nodeDays), `${path}: days`);
  for (const d of [...(raw.hubDays as unknown[]), ...(raw.nodeDays as unknown[])]) assertDay(d);
  return raw as unknown as Snapshot;
}

export function latestSnapshotPath(cacheDir = defaultCacheDir()): string {
  return join(cacheDir, "sync", "latest.json");
}
