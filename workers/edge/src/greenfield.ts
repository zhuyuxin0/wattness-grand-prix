// Reads a sealed day's objects from the public-read Greenfield bucket. Nothing here is trusted: every
// byte goes through a check before the Worker serves or caches it.
import type { Config } from "./config.ts";
import { EdgeError, cut } from "./errors.ts";

/** The day's files are a few hundred KB each; anything far larger is not one of them. */
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

/** A relative path of plain names, the only form an index or a leaf may use to name a file. */
export function isPlainPath(p: string): boolean {
  if (p.length === 0 || p.length > 200 || !/^[A-Za-z0-9._\-/]+$/.test(p)) return false;
  return p.split("/").every((seg) => seg.length > 0 && seg !== "." && seg !== "..");
}

export const objectUrl = (cfg: Config, od: number, path: string): string => `${cfg.greenfieldBase}od-${od}/${path}`;

export interface StoredObject {
  url: string;
  bytes: Uint8Array;
}

/** The object's bytes, or null when the bucket has no such object. */
export async function fetchObject(cfg: Config, od: number, path: string): Promise<StoredObject | null> {
  if (!isPlainPath(path)) throw new EdgeError(400, `${JSON.stringify(cut(path, 200))} is not a plain relative path`);
  const url = objectUrl(cfg, od, path);
  let res: Response;
  try {
    // no-store: Cloudflare keeps no copy of an upstream answer that has not been checked yet.
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new EdgeError(503, `Greenfield could not be reached for od-${od}/${path}: ${(err as Error).message}`);
  }
  if (res.status === 404) {
    await res.body?.cancel();
    return null;
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new EdgeError(res.status >= 500 ? 503 : 502, `Greenfield answered ${res.status} for od-${od}/${path}`);
  }
  const length = Number(res.headers.get("content-length") ?? "0");
  if (length > MAX_BYTES) {
    await res.body?.cancel();
    throw new EdgeError(502, `od-${od}/${path} is ${length} bytes, more than any sealed file`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new EdgeError(502, `od-${od}/${path} is ${bytes.length} bytes, more than any sealed file`);
  return { url, bytes };
}
