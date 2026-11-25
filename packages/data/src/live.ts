import { type Day, isDay } from "./days.js";
import { DataError } from "./errors.js";
import { expect, fetchPinned, fetchUnpinned, isRecord, parseJson } from "./fetch-verified.js";
import { assertOpenDay } from "./excluded-days.js";
import { SHA256 } from "./hash.js";
import { ORIGIN, type Fetcher, mapLimit } from "./http.js";
import type { Provenance, ProvenanceLog } from "./provenance.js";
import type { Store } from "./store.js";

export const LIVE_ROOT = "/live/v1";
export const LIVE_CURRENT_SCHEMA = "wattness.terminal-live-current.v1";
export const LIVE_DAY_SCHEMA = "wattness.terminal-live-day.v1";
export const LIVE_RUN_SCHEMA = "wattness.terminal-live-run.v1";
export const LIVE_POINTS_SCHEMA = "wattness.terminal-live-points.v1";

/** A day index as the pointer named it. The free tier keeps only yesterday and today, so pins go stale fast. */
export interface LiveDayPin {
  day: Day;
  path: string;
  sha256: string;
  bytes: number;
}

export interface LiveRun {
  /** The SCED run's timestamp (CT). */
  run: string;
  seenAt: string | null;
  complete: boolean;
  /** $/MWh at the point in this run; null if the run did not price it. */
  lmp: number | null;
  price: number | null;
}

export interface LivePointDay {
  point: string;
  day: Day;
  through: string | null;
  runs: LiveRun[];
  runGaps: unknown[];
  pointGaps: unknown[];
}

export interface LiveOptions {
  fetcher: Fetcher;
  store: Store;
  log: ProvenanceLog;
  origin?: string;
  /** Read these day indexes instead of the pointer's current ones. */
  pins?: LiveDayPin[];
  concurrency?: number;
}

const NAMED = (dir: string) => new RegExp(`^${dir}/([a-f0-9]{64})\\.json$`);

function parsePin(raw: unknown): LiveDayPin {
  expect(isRecord(raw) && isDay(raw.operating_day) && isRecord(raw.index), "live current.json: day entry");
  const day = raw.operating_day as Day;
  const { path, sha256, bytes } = raw.index;
  expect(typeof path === "string" && NAMED(`days/${day}`).exec(path)?.[1] === sha256, `live current.json: index path for ${day}`);
  expect(typeof sha256 === "string" && SHA256.test(sha256) && Number.isSafeInteger(bytes), `live current.json: index pin for ${day}`);
  return { day, path, sha256, bytes: bytes as number };
}

export async function openLive(options: LiveOptions): Promise<LiveTier> {
  const origin = options.origin ?? ORIGIN;
  let pins = options.pins;
  if (!pins) {
    const url = `${origin}${LIVE_ROOT}/current.json`;
    const { bytes, sha256 } = await fetchUnpinned(options.fetcher, options.store, url);
    const raw = parseJson(bytes, url);
    expect(isRecord(raw) && raw.schema === LIVE_CURRENT_SCHEMA, `live current.json: expected ${LIVE_CURRENT_SCHEMA}`);
    expect(Array.isArray(raw.days), "live current.json: days");
    options.log.add({ route: `${LIVE_ROOT}/current.json`, sha256, url });
    pins = raw.days.map(parsePin);
  }
  for (const p of pins) assertOpenDay(p.day);
  return new LiveTier(pins, `${origin}${LIVE_ROOT}`, options);
}

export class LiveTier {
  private readonly pointLists = new Map<string, Promise<string[]>>();

  constructor(
    readonly pins: readonly LiveDayPin[],
    private readonly base: string,
    private readonly options: LiveOptions,
  ) {}

  get days(): Day[] {
    return this.pins.map((p) => p.day);
  }

  /** Every run of the day, verified file by file, reduced to the named points. */
  async pointDays(day: Day, points: readonly string[]): Promise<LivePointDay[]> {
    assertOpenDay(day);
    const pin = this.pins.find((p) => p.day === day);
    if (!pin) throw new DataError("missing", `live tier holds no day ${day} (has ${this.days.join(", ")})`);
    const index = await this.readJson(pin.path, pin.sha256, pin.bytes);
    expect(isRecord(index) && index.schema === LIVE_DAY_SCHEMA && index.operating_day === day, `live day ${day}: expected ${LIVE_DAY_SCHEMA}`);
    expect(Array.isArray(index.runs), `live day ${day}: runs`);
    const runRefs = index.runs.map((r) => {
      expect(isRecord(r) && typeof r.run === "string" && typeof r.path === "string", `live day ${day}: run entry`);
      expect(NAMED(`runs/${day}`).exec(r.path)?.[1] === r.sha256 && Number.isSafeInteger(r.bytes), `live day ${day}: run pin ${r.run}`);
      return { run: r.run, path: r.path, sha256: r.sha256 as string, bytes: r.bytes as number };
    });
    const runs = await mapLimit(runRefs, this.options.concurrency ?? 8, async (ref) => {
      const raw = await this.readJson(ref.path, ref.sha256, ref.bytes);
      expect(isRecord(raw) && raw.schema === LIVE_RUN_SCHEMA && raw.operating_day === day && raw.run === ref.run, `live run ${ref.run}: identity`);
      expect(isRecord(raw.points), `live run ${ref.run}: points`);
      const list = await this.pointList(raw.points);
      const { lmp, price } = raw;
      expect(Array.isArray(lmp) && Array.isArray(price) && lmp.length === list.length && price.length === list.length, `live run ${ref.run}: arrays`);
      return { ref, raw, list, lmp: lmp as unknown[], price: price as unknown[] };
    });
    const pointGaps = isRecord(index.point_gaps) ? index.point_gaps : {};
    return points.map((point) => ({
      point,
      day,
      through: typeof index.through === "string" ? index.through : null,
      runGaps: Array.isArray(index.run_gaps) ? index.run_gaps : [],
      pointGaps: Array.isArray(pointGaps[point]) ? (pointGaps[point] as unknown[]) : [],
      runs: runs.map(({ ref, raw, list, lmp, price }) => {
        const i = list.indexOf(point);
        return {
          run: ref.run,
          seenAt: typeof raw.seen_at === "string" ? raw.seen_at : null,
          complete: raw.complete === true,
          lmp: i < 0 ? null : num(lmp[i], `live run ${ref.run} lmp`),
          price: i < 0 ? null : num(price[i], `live run ${ref.run} price`),
        };
      }),
    }));
  }

  private pointList(ref: Record<string, unknown>): Promise<string[]> {
    const { path, sha256 } = ref;
    expect(typeof path === "string" && typeof sha256 === "string" && NAMED("points").exec(path)?.[1] === sha256, "live points pin");
    let list = this.pointLists.get(sha256);
    if (!list) {
      list = this.readJson(path, sha256).then((raw) => {
        expect(isRecord(raw) && raw.schema === LIVE_POINTS_SCHEMA && Array.isArray(raw.points), `live points ${sha256}`);
        expect(raw.points.every((p) => typeof p === "string"), `live points ${sha256}: names`);
        return raw.points as string[];
      });
      this.pointLists.set(sha256, list);
    }
    return list;
  }

  private async readJson(path: string, sha256: string, bytes?: number): Promise<unknown> {
    const url = `${this.base}/${path}`;
    const body = await fetchPinned(this.options.fetcher, this.options.store, url, sha256, bytes);
    const entry: Provenance = { route: `${LIVE_ROOT}/${path}`, sha256, url };
    this.options.log.add(entry);
    return parseJson(body, url);
  }
}

function num(v: unknown, label: string): number | null {
  if (v === null) return null;
  expect(typeof v === "number" && Number.isFinite(v), label);
  return v;
}
