import canonicalize from "canonicalize";

export class DocumentError extends Error {
  override name = "DocumentError";
}

/**
 * Hashed documents are plain JSON trees whose numbers are safe integers. The
 * integer rule keeps every amount exact and keeps the encoding trivial to
 * reproduce outside JavaScript (tools/verify_hash.py relies on it).
 */
export function assertHashable(value: unknown, path = "$"): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new DocumentError(`${path}: ${value} is not a safe integer`);
    if (Object.is(value, -0)) throw new DocumentError(`${path}: negative zero`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertHashable(v, `${path}[${i}]`));
    return;
  }
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new DocumentError(`${path}: not a plain object`);
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) throw new DocumentError(`${path}.${k}: undefined`);
      assertHashable(v, `${path}.${k}`);
    }
    return;
  }
  throw new DocumentError(`${path}: ${typeof value} is not JSON`);
}

/** RFC 8785 canonical form of a hashable document. */
export function canonicalJson(doc: unknown): string {
  assertHashable(doc);
  const out = canonicalize(doc);
  if (out === undefined) throw new DocumentError("document has no JSON form");
  return out;
}

export function canonicalBytes(doc: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(doc));
}
