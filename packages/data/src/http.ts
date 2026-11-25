import { DataError } from "./errors.js";

/** Returns the body of a 200 response, or throws. */
export type Fetcher = (url: string) => Promise<Uint8Array>;

export const ORIGIN = "https://wattness.tech";

export interface HttpOptions {
  timeoutMs?: number;
  retries?: number;
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

/**
 * The gateway answers any query string on data paths with 400, so URLs with
 * one are refused here rather than sent.
 */
export function httpFetcher({ timeoutMs = 20_000, retries = 3 }: HttpOptions = {}): Fetcher {
  return async (url) => {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.search || u.hash) {
      throw new DataError("route", `refusing to fetch ${url}: https only, no query or fragment`);
    }
    let last: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { accept: "application/json", "user-agent": "gatelock-data/0.1" },
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        last = e;
        continue;
      }
      if (res.status === 200) return new Uint8Array(await res.arrayBuffer());
      await res.body?.cancel();
      last = new DataError(res.status === 404 ? "missing" : "network", `GET ${url}: HTTP ${res.status}`);
      if (!RETRYABLE.has(res.status)) break;
    }
    if (last instanceof DataError) throw last;
    throw new DataError("network", `GET ${url}: ${last instanceof Error ? last.message : String(last)}`);
  };
}

/** For offline runs: every fetch fails, so only cached, hash-pinned bytes can be read. */
export const offlineFetcher: Fetcher = async (url) => {
  throw new DataError("offline", `offline: ${url} is not in the cache`);
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Runs `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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
