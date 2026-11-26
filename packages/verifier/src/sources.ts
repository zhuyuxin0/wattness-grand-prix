import { fileSha256, type FileRef } from "@gatelock/core";
import { daysIn, isExcludedDay } from "./excluded-days.js";

// Re-derives every input digest from the data site, starting from the release
// id and manifest digest the record names; release.json and the live
// current.json are pointers that move, so neither is trusted here. Paths never
// carry a query string (the gateway answers those with HTTP 400).

export const SITE = "https://wattness.tech";
const DISPLAY = "/data/terminal-display/v1/releases/";
const LIVE = "/live/v1/";

export type Fetcher = (url: string) => Promise<Uint8Array | null>;

const RETRIES = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET returning the body, null on 404/410; 429 and 5xx are retried with backoff, anything else throws. */
export const httpFetcher: Fetcher = async (url) => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": "gate-record-verifier" }, redirect: "error" });
    if (res.status === 404 || res.status === 410) return null;
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
    if ((res.status !== 429 && res.status < 500) || attempt >= RETRIES) throw new Error(`${url}: HTTP ${res.status}`);
    const after = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 30) * 1000 : 500 * 2 ** attempt);
  }
};

export interface SourceOptions {
  fetcher: Fetcher;
  /** Local copies by SHA-256, used only for files the site no longer serves (the live tier keeps two days). */
  mirror?: (sha256: string) => Uint8Array | null;
  site?: string;
  concurrency?: number;
}

export interface SourceCheck {
  checked: number;
  /** Files whose bytes came from the mirror because the site no longer serves them. */
  mirrored: number;
  problems: string[];
  /** Files that could be neither fetched nor found in the mirror. */
  missing: string[];
}

export interface SourceList {
  releaseId: string | null;
  manifestSha256: string | null;
  files: readonly FileRef[];
  /** Live day indexes, relative to /live/v1/. */
  live: readonly FileRef[];
}

interface CatalogEntry {
  route: string;
  path: string;
  sha256: string;
}

const json = (bytes: Uint8Array): unknown => JSON.parse(new TextDecoder().decode(bytes));
const PLAIN_PATH = /^\/[A-Za-z0-9._\-/]+$/;
const POINTER = /\/(?:current|release)\.json$/;

async function mapLimit<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++] as T);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function checkSources(list: SourceList, options: SourceOptions): Promise<SourceCheck> {
  const { fetcher, mirror, site = SITE, concurrency = 6 } = options;
  const out: SourceCheck = { checked: 0, mirrored: 0, problems: [], missing: [] };
  const routes: FileRef[] = [...list.files, ...list.live.map((f) => ({ route: `${LIVE}${f.route}`, sha256: f.sha256 }))];

  const bad = routes.filter((f) => !PLAIN_PATH.test(f.route) || f.route.split("/").includes(".."));
  for (const f of bad) out.problems.push(`${JSON.stringify(f.route)} is not a plain path`);
  // Refused here, before any fetch, whatever V6 concluded.
  const excluded = routes.filter((f) => !bad.includes(f) && daysIn(f.route).some(isExcludedDay));
  for (const f of excluded) out.problems.push(`${f.route}: names an excluded day; not fetched`);
  const ok = routes.filter((f) => !bad.includes(f) && !excluded.includes(f));

  const releaseRoutes = ok.filter((f) => f.route.startsWith("/api/"));
  const direct = ok.filter((f) => f.route.startsWith(DISPLAY) || f.route.startsWith(LIVE));
  for (const f of ok) {
    if (!releaseRoutes.includes(f) && !direct.includes(f)) out.problems.push(`${f.route}: not a release or live-tier path`);
  }

  const base = list.releaseId ? `${site}${DISPLAY}${list.releaseId}` : null;
  for (const f of direct) {
    if (f.route.startsWith(DISPLAY) && !f.route.startsWith(`${DISPLAY}${list.releaseId}/`)) {
      out.problems.push(`${f.route}: belongs to another release than ${list.releaseId}`);
    }
  }

  const hashBody = async (f: FileRef, url: string) => {
    let bytes = await fetcher(url);
    if (!bytes) {
      bytes = mirror?.(f.sha256) ?? null;
      if (!bytes) return void out.missing.push(`${f.route}: not served and not mirrored`);
      out.mirrored++;
    }
    out.checked++;
    const got = fileSha256(bytes);
    if (got === f.sha256) return;
    // A pointer is rewritten as the live tier moves on; the copy taken at plan time is what the record cites.
    const kept = POINTER.test(f.route) ? (mirror?.(f.sha256) ?? null) : null;
    if (kept && fileSha256(kept) === f.sha256) return void out.mirrored++;
    out.problems.push(
      POINTER.test(f.route)
        ? `${f.route}: the pointer has moved (now ${got}) and no copy of ${f.sha256} is mirrored`
        : `${f.route}: bytes hash to ${got}, record says ${f.sha256}`,
    );
  };

  if (releaseRoutes.length > 0) {
    if (!base || !list.manifestSha256) out.problems.push("release routes cited without a release");
    else {
      const catalog = await loadCatalogs(base, list.manifestSha256, releaseRoutes, fetcher, out);
      if (catalog) {
        await mapLimit(releaseRoutes, concurrency, async (f) => {
          const entry = catalog.entries.get(f.route);
          // A route in a catalog that could not be read is already reported under that catalog.
          if (!entry && catalog.failed.has(fileSha256(f.route).slice(0, 2))) return;
          if (!entry) return void out.problems.push(`${f.route}: not in release ${list.releaseId}`);
          if (entry.sha256 !== f.sha256) {
            return void out.problems.push(`${f.route}: release has ${entry.sha256}, record says ${f.sha256}`);
          }
          if (daysIn(entry.path).some(isExcludedDay)) return void out.problems.push(`${f.route}: stored under an excluded day; not fetched`);
          await hashBody(f, `${base}/${entry.path}`);
        });
      }
    }
  }
  await mapLimit(direct, concurrency, (f) => hashBody(f, `${site}${f.route}`));
  return out;
}

export interface CitedFiles {
  /** Bytes by route, each matching the release catalog and the SHA-256 the document cites. */
  bytes: Map<string, Uint8Array>;
  problems: string[];
  /** Files that could be neither fetched nor found in the mirror. */
  missing: string[];
}

/**
 * The bytes of release files a document cites, read the way V7 checks them: the release manifest by its
 * pinned digest, the route's catalog, then the payload, whose SHA-256 must be the one cited.
 */
export async function readCited(list: SourceList, routes: readonly string[], options: SourceOptions): Promise<CitedFiles> {
  const { fetcher, mirror, site = SITE } = options;
  const out: CitedFiles = { bytes: new Map(), problems: [], missing: [] };
  const wanted: FileRef[] = [];
  for (const route of new Set(routes)) {
    const f = list.files.find((x) => x.route === route);
    if (!f) out.problems.push(`${route}: not cited`);
    else if (!f.route.startsWith("/api/") || !PLAIN_PATH.test(f.route) || f.route.split("/").includes("..")) out.problems.push(`${route}: not a release route`);
    else if (daysIn(f.route).some(isExcludedDay)) out.problems.push(`${route}: names an excluded day; not fetched`);
    else wanted.push(f);
  }
  if (wanted.length === 0) return out;
  if (!list.releaseId || !list.manifestSha256) {
    out.problems.push("release routes cited without a release");
    return out;
  }
  const base = `${site}${DISPLAY}${list.releaseId}`;
  const sink: SourceCheck = { checked: 0, mirrored: 0, problems: out.problems, missing: out.missing };
  const catalog = await loadCatalogs(base, list.manifestSha256, wanted, fetcher, sink);
  if (!catalog) return out;
  for (const f of wanted) {
    const entry = catalog.entries.get(f.route);
    if (!entry) {
      if (!catalog.failed.has(fileSha256(f.route).slice(0, 2))) out.problems.push(`${f.route}: not in release ${list.releaseId}`);
      continue;
    }
    if (entry.sha256 !== f.sha256) {
      out.problems.push(`${f.route}: release has ${entry.sha256}, cited ${f.sha256}`);
      continue;
    }
    if (daysIn(entry.path).some(isExcludedDay)) {
      out.problems.push(`${f.route}: stored under an excluded day; not fetched`);
      continue;
    }
    const bytes = (await fetcher(`${base}/${entry.path}`)) ?? mirror?.(f.sha256) ?? null;
    if (!bytes) {
      out.missing.push(`${f.route}: not served and not mirrored`);
      continue;
    }
    const got = fileSha256(bytes);
    if (got !== f.sha256) {
      out.problems.push(`${f.route}: bytes hash to ${got}, cited ${f.sha256}`);
      continue;
    }
    out.bytes.set(f.route, bytes);
  }
  return out;
}

/** Fetches the release manifest by its pinned digest and every catalog the routes fall in. */
async function loadCatalogs(
  base: string,
  manifestSha256: string,
  routes: readonly FileRef[],
  fetcher: Fetcher,
  out: SourceCheck,
): Promise<{ entries: Map<string, CatalogEntry>; failed: Set<string> } | null> {
  const manifestBytes = await fetcher(`${base}/manifest.json`);
  if (!manifestBytes) {
    out.missing.push(`${base}/manifest.json: not served`);
    return null;
  }
  const got = fileSha256(manifestBytes);
  if (got !== manifestSha256) {
    out.problems.push(`release manifest hashes to ${got}, record says ${manifestSha256}`);
    return null;
  }
  const manifest = json(manifestBytes) as { catalogs?: { bucket: string; path: string; sha256: string }[] };
  const refs = new Map((manifest.catalogs ?? []).map((c) => [c.bucket, c]));
  const buckets = [...new Set(routes.map((f) => fileSha256(f.route).slice(0, 2)))];
  const entries = new Map<string, CatalogEntry>();
  const failed = new Set<string>();
  await mapLimit(buckets, 16, async (bucket) => {
    const ref = refs.get(bucket);
    if (!ref) return void out.problems.push(`release manifest lists no catalog ${bucket}`);
    const bytes = await fetcher(`${base}/${ref.path}`);
    if (!bytes) {
      failed.add(bucket);
      return void out.missing.push(`catalog ${bucket}: not served`);
    }
    if (fileSha256(bytes) !== ref.sha256) {
      failed.add(bucket);
      return void out.problems.push(`catalog ${bucket}: bytes differ from the release manifest`);
    }
    for (const e of (json(bytes) as { files?: CatalogEntry[] }).files ?? []) entries.set(e.route, e);
  });
  return { entries, failed };
}
