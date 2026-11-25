import { DataError } from "./errors.js";
import { expect, fetchPinned, fetchUnpinned, isRecord, parseJson } from "./fetch-verified.js";
import { assertOpenRoute } from "./excluded-days.js";
import { SHA256, sha256Hex } from "./hash.js";
import { ORIGIN, type Fetcher } from "./http.js";
import type { Provenance, ProvenanceLog } from "./provenance.js";
import type { Store } from "./store.js";

export const RELEASE_SCHEMA = "wattness.terminal-content-release.v1";
export const CURRENT_SCHEMA = "wattness.terminal-display-current.v1";
export const MANIFEST_SCHEMA = "wattness.terminal-display-manifest.v1";
export const CATALOG_SCHEMA = "wattness.terminal-display-catalog.v1";
export const DISPLAY_ROOT = "/data/terminal-display/v1";

/**
 * The only release routes this package reads: one day of prices at one point,
 * the census-and-geography reference and the hedging walkthrough. Fleet revenue routes are refused,
 * since their windows reach the excluded days.
 */
const ALLOWED_ROUTES: readonly RegExp[] = [
  /^\/api\/prices\/[A-Z0-9_]{1,64}\/\d{4}-\d{2}-\d{2}$/,
  /^\/api\/fleet-geo\/v2\/native$/,
  // The showcase battery's identity and limits; the other hedging routes stay closed.
  /^\/api\/hedging\/v1\/walkthrough$/,
];

export function assertAllowedRoute(route: string): void {
  if (!ALLOWED_ROUTES.some((re) => re.test(route))) {
    throw new DataError("route", `route ${route} is not one this reader may fetch`);
  }
  assertOpenRoute(route);
}

/** Identifies one data release by its manifest's hash. */
export interface ReleasePin {
  /** The site+data pair release.json selected, when the pin came from it. */
  releaseId: string | null;
  generatedAt: string | null;
  dataRelease: string;
  dataManifestSha256: string;
}

export interface FileDescriptor {
  route: string;
  path: string;
  schema: string;
  media_type: string;
  sha256: string;
  bytes: number;
  source_ids: string[];
  clocks: Record<string, unknown>;
}

interface CatalogRef {
  bucket: string;
  path: string;
  sha256: string;
  bytes: number;
}

interface Manifest {
  release: string;
  generated_at: string;
  files: FileDescriptor[];
  catalogs: Map<string, CatalogRef>;
}

export interface ReleaseOptions {
  fetcher: Fetcher;
  store: Store;
  log: ProvenanceLog;
  origin?: string;
  /** Read this release instead of the one release.json selects now. */
  pin?: ReleasePin;
}

const RELEASE_ID = /^[a-z0-9][a-z0-9-]{0,95}$/;
const SAFE_PATH = /^(?:[A-Za-z0-9][A-Za-z0-9_.-]{0,191})(?:\/[A-Za-z0-9][A-Za-z0-9_.-]{0,191})*$/;

/**
 * Selects the release, then follows release.json -> current.json -> manifest
 * -> catalog -> payload, checking each file's SHA-256 against its parent.
 */
export async function openRelease(options: ReleaseOptions): Promise<Release> {
  const origin = options.origin ?? ORIGIN;
  const { fetcher, store, log } = options;
  let pin = options.pin;
  if (!pin) {
    const url = `${origin}/release.json`;
    const { bytes } = await fetchUnpinned(fetcher, store, url);
    pin = parseReleaseJson(parseJson(bytes, url));
    const currentUrl = `${origin}${DISPLAY_ROOT}/releases/${pin.dataRelease}/current.json`;
    const current = await fetchUnpinned(fetcher, store, currentUrl);
    checkCurrent(parseJson(current.bytes, currentUrl), pin);
  }
  if (!RELEASE_ID.test(pin.dataRelease)) throw new DataError("shape", `bad data release id ${pin.dataRelease}`);
  const base = `${origin}${DISPLAY_ROOT}/releases/${pin.dataRelease}`;
  const manifestUrl = `${base}/manifest.json`;
  const bytes = await fetchPinned(fetcher, store, manifestUrl, pin.dataManifestSha256);
  const manifest = parseManifest(parseJson(bytes, manifestUrl), pin.dataRelease);
  log.add({ route: new URL(manifestUrl).pathname, sha256: pin.dataManifestSha256, url: manifestUrl });
  return new Release(pin, manifest, base, options);
}

export function parseReleaseJson(raw: unknown): ReleasePin {
  expect(isRecord(raw) && raw.schema === RELEASE_SCHEMA, `release.json: expected ${RELEASE_SCHEMA}`);
  const { releaseId, generatedAt, dataRelease, dataManifestSha256 } = raw;
  expect(typeof releaseId === "string" && typeof generatedAt === "string", "release.json: releaseId, generatedAt");
  expect(typeof dataRelease === "string" && RELEASE_ID.test(dataRelease), "release.json: dataRelease");
  expect(typeof dataManifestSha256 === "string" && SHA256.test(dataManifestSha256), "release.json: dataManifestSha256");
  return { releaseId, generatedAt, dataRelease, dataManifestSha256 };
}

function checkCurrent(raw: unknown, pin: ReleasePin): void {
  expect(isRecord(raw) && raw.schema === CURRENT_SCHEMA, `current.json: expected ${CURRENT_SCHEMA}`);
  expect(raw.release === pin.dataRelease, "current.json: release differs from release.json");
  expect(raw.manifest === `releases/${pin.dataRelease}/manifest.json`, "current.json: manifest path");
  if (raw.manifest_sha256 !== pin.dataManifestSha256) {
    throw new DataError("integrity", "current.json: manifest_sha256 differs from release.json's dataManifestSha256");
  }
}

function parseManifest(raw: unknown, release: string): Manifest {
  expect(isRecord(raw) && raw.schema === MANIFEST_SCHEMA, `manifest: expected ${MANIFEST_SCHEMA}`);
  expect(raw.release === release, "manifest: release differs from its pin");
  expect(typeof raw.generated_at === "string", "manifest: generated_at");
  expect(Array.isArray(raw.files) && Array.isArray(raw.catalogs), "manifest: files, catalogs");
  const catalogs = new Map<string, CatalogRef>();
  for (const c of raw.catalogs as unknown[]) {
    expect(isRecord(c), "manifest: catalog reference");
    const { bucket, path, sha256, bytes } = c;
    expect(typeof bucket === "string" && /^[a-f0-9]{2}$/.test(bucket) && !catalogs.has(bucket), "manifest: catalog bucket");
    expect(path === `catalogs/${bucket}.json`, "manifest: catalog path");
    expect(typeof sha256 === "string" && SHA256.test(sha256), "manifest: catalog sha256");
    expect(Number.isSafeInteger(bytes) && (bytes as number) > 0, "manifest: catalog bytes");
    catalogs.set(bucket, { bucket, path, sha256, bytes: bytes as number });
  }
  return {
    release,
    generated_at: raw.generated_at,
    files: (raw.files as unknown[]).map((f) => parseDescriptor(f, "manifest")),
    catalogs,
  };
}

function parseDescriptor(raw: unknown, label: string): FileDescriptor {
  expect(isRecord(raw), `${label}: file descriptor`);
  const { route, path, schema, media_type, sha256, bytes, source_ids, clocks } = raw;
  expect(typeof route === "string" && route.startsWith("/api/"), `${label}: route`);
  expect(typeof path === "string" && SAFE_PATH.test(path) && !path.split("/").includes(".."), `${label}: path of ${route}`);
  expect(typeof schema === "string" && typeof media_type === "string", `${label}: schema of ${route}`);
  expect(typeof sha256 === "string" && SHA256.test(sha256), `${label}: sha256 of ${route}`);
  expect(Number.isSafeInteger(bytes) && (bytes as number) > 0, `${label}: bytes of ${route}`);
  expect(Array.isArray(source_ids) && source_ids.every((s) => typeof s === "string"), `${label}: source_ids of ${route}`);
  expect(isRecord(clocks), `${label}: clocks of ${route}`);
  return { route, path, schema, media_type, sha256, bytes: bytes as number, source_ids: source_ids as string[], clocks };
}

export interface ReleaseFile {
  descriptor: FileDescriptor;
  provenance: Provenance;
  json: unknown;
}

export class Release {
  private readonly catalogs = new Map<string, Promise<Map<string, FileDescriptor>>>();

  constructor(
    readonly pin: ReleasePin,
    private readonly manifest: Manifest,
    private readonly base: string,
    private readonly options: ReleaseOptions,
  ) {}

  get dataRelease(): string {
    return this.pin.dataRelease;
  }

  get generatedAt(): string {
    return this.manifest.generated_at;
  }

  /** The route's descriptor, or null if the release does not hold it. Guarded like a read. */
  async descriptor(route: string): Promise<FileDescriptor | null> {
    assertAllowedRoute(route);
    const root = this.manifest.files.find((f) => f.route === route);
    if (root) return root;
    const bucket = sha256Hex(route).slice(0, 2);
    const ref = this.manifest.catalogs.get(bucket);
    if (!ref) return null;
    let catalog = this.catalogs.get(bucket);
    if (!catalog) {
      catalog = this.loadCatalog(ref);
      this.catalogs.set(bucket, catalog);
      catalog.catch(() => this.catalogs.delete(bucket));
    }
    return (await catalog).get(route) ?? null;
  }

  async has(route: string): Promise<boolean> {
    return (await this.descriptor(route)) !== null;
  }

  async read(route: string): Promise<ReleaseFile> {
    const descriptor = await this.descriptor(route);
    if (!descriptor) throw new DataError("missing", `release ${this.dataRelease} holds no ${route}`);
    const url = `${this.base}/${descriptor.path}`;
    const { fetcher, store, log } = this.options;
    const bytes = await fetchPinned(fetcher, store, url, descriptor.sha256, descriptor.bytes);
    const provenance: Provenance = { route, sha256: descriptor.sha256, url };
    log.add(provenance);
    return { descriptor, provenance, json: parseJson(bytes, route) };
  }

  private async loadCatalog(ref: CatalogRef): Promise<Map<string, FileDescriptor>> {
    const url = `${this.base}/${ref.path}`;
    const { fetcher, store, log } = this.options;
    const raw = parseJson(await fetchPinned(fetcher, store, url, ref.sha256, ref.bytes), url);
    expect(isRecord(raw) && raw.schema === CATALOG_SCHEMA, `${ref.path}: expected ${CATALOG_SCHEMA}`);
    expect(raw.release === this.dataRelease && raw.bucket === ref.bucket, `${ref.path}: identity differs from the manifest`);
    expect(Array.isArray(raw.files), `${ref.path}: files`);
    const out = new Map<string, FileDescriptor>();
    for (const f of raw.files as unknown[]) {
      const d = parseDescriptor(f, ref.path);
      expect(sha256Hex(d.route).slice(0, 2) === ref.bucket, `${ref.path}: ${d.route} is in the wrong bucket`);
      out.set(d.route, d);
    }
    log.add({ route: new URL(url).pathname, sha256: ref.sha256, url });
    return out;
  }
}
