import { DataError } from "./errors.js";
import type { Fetcher } from "./http.js";
import { SHA256, sha256Hex } from "./hash.js";
import type { Store } from "./store.js";

/**
 * Bytes whose SHA-256 is known in advance: from the cache when present,
 * else fetched, checked, and cached. Nothing unchecked is returned or stored.
 */
export async function fetchPinned(
  fetcher: Fetcher,
  store: Store,
  url: string,
  sha256: string,
  bytes?: number,
): Promise<Uint8Array> {
  if (!SHA256.test(sha256)) throw new DataError("shape", `bad pin for ${url}`);
  const cached = store.get(sha256);
  if (cached) return cached;
  const body = await fetcher(url);
  const got = sha256Hex(body);
  if (got !== sha256) throw new DataError("integrity", `${url}: sha256 ${got}, pinned ${sha256}`);
  if (bytes !== undefined && body.byteLength !== bytes) {
    throw new DataError("integrity", `${url}: ${body.byteLength} bytes, pinned ${bytes}`);
  }
  store.put(body);
  return body;
}

/** Mutable documents (pointers): fetched, cached under their hash, and returned with it. */
export async function fetchUnpinned(fetcher: Fetcher, store: Store, url: string): Promise<{ bytes: Uint8Array; sha256: string }> {
  const bytes = await fetcher(url);
  return { bytes, sha256: store.put(bytes) };
}

export function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (e) {
    throw new DataError("shape", `${label}: not JSON (${e instanceof Error ? e.message : String(e)})`);
  }
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function expect(cond: unknown, label: string): asserts cond {
  if (!cond) throw new DataError("shape", label);
}
