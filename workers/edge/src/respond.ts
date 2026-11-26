import { toHex, sha256 } from "./bytes.ts";
import { MIN_CONFIRMATIONS } from "./config.ts";
import { EdgeError } from "./errors.ts";
import type { Served } from "./record.ts";
import type { Verdict } from "./verdict.ts";

const EXPOSED = [
  "x-gate-verified",
  "x-gate-network",
  "x-gate-root",
  "x-gate-record-key",
  "x-gate-block",
  "x-gate-confirmations",
  "x-gate-checks",
  "x-gate-basis",
  "x-gate-not-covered",
  "x-gate-sha256",
  "x-gate-source",
  "x-gate-cache",
];

export const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": EXPOSED.join(", "),
  "access-control-max-age": "86400",
};

/** Verified and deep enough to stay: browsers keep it five minutes, the edge a day. GateRecord is write-once. */
export const VERIFIED_CACHE = "public, max-age=300, s-maxage=86400";
export const NO_STORE = "no-store";

// Header values are one line of printable ASCII.
const headerValue = (s: string) => s.replace(/[^\x20-\x7e]/g, "?").slice(0, 4000);

function finalFor(served: Served): boolean {
  const depths = served.sealed.map((s) => s.confirmations);
  if (served.chain?.record) depths.push(served.chain.head - served.chain.record.blockNumber);
  return depths.length > 0 && depths.every((d) => d >= MIN_CONFIRMATIONS);
}

export function servedResponse(served: Served, envelope: boolean): Response {
  const final = finalFor(served);
  const networks = served.sealed.length > 0 ? served.sealed.map((s) => s.network) : served.chain ? [served.chain.network] : [];
  const records = served.sealed.length > 0 ? served.sealed.map((s) => ({ key: s.chain.key, ...s.record, confirmations: s.confirmations })) : [];
  if (served.chain?.record) records.push({ key: served.chain.key, ...served.chain.record, confirmations: served.chain.head - served.chain.record.blockNumber });
  const digest = toHex(sha256(served.bytes)).slice(2);
  const headers = new Headers({
    ...CORS,
    "cache-control": final ? VERIFIED_CACHE : NO_STORE,
    "x-gate-verified": "pass",
    "x-gate-network": networks.join(", "),
    "x-gate-root": [...new Set(records.map((r) => r.root))].join(", "),
    "x-gate-record-key": [...new Set(records.map((r) => r.key))].join(", "),
    "x-gate-block": records.map((r) => String(r.blockNumber)).join(", "),
    "x-gate-confirmations": records.map((r) => String(r.confirmations)).join(", "),
    "x-gate-checks": served.checks.map((c) => c.name).join(", "),
    "x-gate-basis": headerValue(served.basis),
    "x-gate-sha256": digest,
    "x-gate-source": served.source,
    "x-gate-cache": final ? "miss" : "no-store",
  });
  if (served.notCovered) headers.set("x-gate-not-covered", served.notCovered.join(", "));
  if (!envelope) {
    headers.set("content-type", served.contentType);
    return new Response(served.bytes, { status: 200, headers });
  }
  headers.set("content-type", "application/json; charset=utf-8");
  const body = {
    schema: "gate-record.edge-envelope.v1",
    verified: true,
    path: served.path,
    networks,
    records: records.map((r) => ({
      key: r.key,
      root: r.root,
      leaf_count: r.leafCount,
      code_hash: r.codeHash,
      committed_at: r.committedAt,
      block: r.blockNumber,
      confirmations: r.confirmations,
    })),
    basis: served.basis,
    checks: served.checks,
    ...(served.notCovered ? { not_covered: served.notCovered } : {}),
    source: served.source,
    sha256: digest,
    bytes: served.bytes.length,
    document: served.document,
  };
  return new Response(`${JSON.stringify(body, null, 2)}\n`, { status: 200, headers });
}

export function verdictResponse(v: Verdict, cacheable: boolean): Response {
  return new Response(`${JSON.stringify(v, null, 2)}\n`, {
    status: 200,
    headers: {
      ...CORS,
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheable ? VERIFIED_CACHE : NO_STORE,
      "x-gate-verified": v.verdict,
      "x-gate-network": v.network,
      ...(v.record ? { "x-gate-root": v.record.root, "x-gate-record-key": v.record.key, "x-gate-block": String(v.record.block), "x-gate-confirmations": String(v.record.confirmations) } : {}),
      "x-gate-checks": v.checks.map((c) => `${c.name}=${c.result}`).join(", "),
      "x-gate-cache": cacheable ? "miss" : "no-store",
    },
  });
}

export function textResponse(text: string, status = 200, cache = NO_STORE): Response {
  return new Response(text, { status, headers: { ...CORS, "content-type": "text/plain; charset=utf-8", "cache-control": cache } });
}

/** Errors carry a plain reason and never a byte of the file; nothing about them is cached. */
export function errorResponse(err: unknown, json: boolean): Response {
  const status = err instanceof EdgeError ? err.status : err instanceof RangeError ? 400 : 500;
  const reason = err instanceof Error ? err.message : String(err);
  // "fail" only when a check failed; a missing file or an unreachable upstream verified nothing either way.
  const headers = { ...CORS, "cache-control": NO_STORE, "x-gate-verified": status === 502 ? "fail" : "none" };
  if (json) {
    return new Response(`${JSON.stringify({ status, error: reason }, null, 2)}\n`, { status, headers: { ...headers, "content-type": "application/json; charset=utf-8" } });
  }
  return new Response(`${status}: ${reason}\n`, { status, headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
}
