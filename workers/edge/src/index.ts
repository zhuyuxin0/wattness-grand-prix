import { assertOd, isoFromOd } from "../../../packages/core/src/gate.ts";
import { configFrom, NETWORKS, isNetwork, type Config, type Env, type NetworkName } from "./config.ts";
import { EdgeError, cut } from "./errors.ts";
import { isPlainPath } from "./greenfield.ts";
import { homePage } from "./page.ts";
import {
  dayOf,
  leafEntryAt,
  notCovered,
  sealedIndexes,
  sealedLeaf,
  sealedOutsideFile,
  sealedReceipt,
  sealedRootFile,
  sealedSalt,
  sealedScenarios,
  serveIndex,
  type Served,
} from "./record.ts";
import { CORS, VERIFIED_CACHE, errorResponse, servedResponse, textResponse, verdictResponse } from "./respond.ts";
import { cacheableVerdict, verdictFor } from "./verdict.ts";

export type { Env } from "./config.ts";

/** A request value as a reason quotes it: as JSON, and at most 200 characters of it. */
const quoted = (v: string): string => JSON.stringify(cut(v, 200));

/** YYYY-MM-DD or YYYYMMDD to the uint32 the contract takes. */
export function parseDay(raw: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (!m) throw new EdgeError(400, `${quoted(raw)} is not a day; use YYYY-MM-DD`);
  const od = Number(m[1]) * 10_000 + Number(m[2]) * 100 + Number(m[3]);
  try {
    assertOd(od);
  } catch {
    throw new EdgeError(400, `${raw} is not a calendar day from 2007 on`);
  }
  return od;
}

const ORDER = Object.keys(NETWORKS) as NetworkName[];

function networksOf(url: URL, single: boolean): NetworkName[] {
  const raw = url.searchParams.get("network") ?? "bsc-mainnet";
  const asked = raw.split(",").map((s) => s.trim());
  const bad = asked.filter((n) => !isNetwork(n));
  if (bad.length > 0 || asked.length === 0) throw new EdgeError(400, `network ${quoted(raw)}: use bsc-mainnet, bsc-testnet${single ? "" : " or both, comma-separated"}`);
  const networks = ORDER.filter((n) => asked.includes(n));
  if (single && networks.length !== 1) throw new EdgeError(400, "a verdict is for one network: network=bsc-mainnet or network=bsc-testnet");
  return networks;
}

function flag(url: URL, name: string): boolean {
  const v = url.searchParams.get(name);
  if (v === null || v === "0" || v === "false") return false;
  if (v === "" || v === "1" || v === "true") return true;
  throw new EdgeError(400, `${name}=${quoted(v)}: use ${name}=1`);
}

const headOnly = (request: Request, res: Response): Response => (request.method === "HEAD" ? new Response(null, res) : res);

/**
 * The edge cache, keyed by the request in its canonical form and the Worker's version. A verified file stays
 * verified (GateRecord is write-once), though more than one byte form of it can verify; the edge keeps the first
 * it served for a day. A verdict, an envelope or a header can change from one version to the next.
 * Only a 200 whose Cache-Control says it was verified on a record deep enough to stay is put; a refusal,
 * a 404 or a fresh record never is.
 */
async function edgeCached(request: Request, env: Env, ctx: ExecutionContext, key: string, produce: () => Promise<Response>): Promise<Response> {
  const cache = caches.default;
  const version = env.CF_VERSION_METADATA?.id ?? "unversioned";
  const cacheKey = new Request(`${key}${key.includes("?") ? "&" : "?"}version=${encodeURIComponent(version)}`, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) {
    const res = new Response(request.method === "HEAD" ? null : hit.body, hit);
    res.headers.set("x-gate-cache", "hit");
    return res;
  }
  const res = await produce();
  if (res.status === 200 && res.headers.get("cache-control") === VERIFIED_CACHE) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return headOnly(request, res);
}

async function dayFile(cfg: Config, od: number, path: string, networks: readonly NetworkName[]): Promise<Served> {
  const day = dayOf(cfg, od);
  // A receipt names its own chain and is checked against it.
  const receipt = /^record\.(bsc-mainnet|bsc-testnet)\.json$/.exec(path);
  if (receipt) return sealedReceipt(day, receipt[1] as NetworkName);
  const sealed = await sealedIndexes(day, networks);
  if (path === "index.json") return serveIndex(sealed);
  const index = sealed[0]?.index;
  const at = index ? leafEntryAt(index, path) : null;
  if (at?.kind === "leaf") return (await sealedLeaf(day, sealed, at.position)).served;
  if (at?.kind === "scenarios") return sealedScenarios(day, sealed, at.position);
  if (path === "root.hex") return sealedRootFile(day, sealed);
  if (path === "salt.txt") return sealedSalt(day, sealed);
  const outside = await sealedOutsideFile(day, sealed, path);
  if (outside) return outside;
  throw notCovered(day, path);
}

async function route(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(`405: ${request.method} is not served; this Worker only reads\n`, {
      status: 405,
      headers: { ...CORS, allow: "GET, HEAD, OPTIONS", "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const cfg = configFrom(env);
  if (url.pathname === "/") return headOnly(request, textResponse(homePage(cfg), 200, "public, max-age=300"));

  const parts = url.pathname.split("/");
  if (parts[1] === "day" && parts.length >= 4) {
    const od = parseDay(parts[2] ?? "");
    const asked = parts.slice(3).join("/");
    if (!isPlainPath(asked)) throw new EdgeError(400, `${quoted(asked)} is not a plain relative path`);
    const path = asked === "manifest.json" ? "index.json" : asked;
    const networks = networksOf(url, false);
    const envelope = flag(url, "envelope");
    const key = `${url.origin}/day/${isoFromOd(od)}/${path}?network=${networks.join(",")}${envelope ? "&envelope=1" : ""}`;
    return edgeCached(request, env, ctx, key, async () => servedResponse(await dayFile(cfg, od, path, networks), envelope));
  }
  if (parts[1] === "verify" && parts.length === 3) {
    const battery = parts[2] ?? "";
    if (!/^[A-Z0-9_]{1,64}$/.test(battery)) throw new EdgeError(400, `${quoted(battery)} is not an ERCOT resource name`);
    const raw = url.searchParams.get("od");
    if (!raw) throw new EdgeError(400, `od is required: /verify/${battery}?od=YYYY-MM-DD`);
    const od = parseDay(raw);
    const [network] = networksOf(url, true) as [NetworkName];
    const key = `${url.origin}/verify/${battery}?od=${isoFromOd(od)}&network=${network}`;
    return edgeCached(request, env, ctx, key, async () => {
      const v = await verdictFor(dayOf(cfg, od), network, battery);
      return verdictResponse(v, cacheableVerdict(v));
    });
  }
  throw new EdgeError(404, `no endpoint at ${quoted(url.pathname)}; GET / lists them`);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const json = url.pathname.startsWith("/verify/") || flagSafe(url, "envelope");
    try {
      return await route(request, url, env, ctx);
    } catch (err) {
      return headOnly(request, errorResponse(err, json));
    }
  },
} satisfies ExportedHandler<Env>;

function flagSafe(url: URL, name: string): boolean {
  try {
    return flag(url, name);
  } catch {
    return false;
  }
}
