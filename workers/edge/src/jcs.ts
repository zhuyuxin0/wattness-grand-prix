// RFC 8785 canonical JSON for hashed documents, as packages/core/src/jcs.ts defines them: plain JSON
// trees whose numbers are safe integers. Core serializes with the canonicalize package; this gives the
// same string (test/jcs.test.ts compares the two) but hands arrays of integers to the runtime's
// JSON.stringify, which is what keeps a cold request inside the free plan's CPU time.

export class DocumentError extends Error {
  override name = "DocumentError";
}

const NOT_HASHABLE = Symbol("not hashable");

const isNegativeZero = (n: number) => n === 0 && 1 / n < 0;

function string(s: string): string {
  if (!s.isWellFormed()) throw new DocumentError("a string holds a lone surrogate");
  return JSON.stringify(s);
}

function canon(v: unknown): string {
  if (v === null) return "null";
  switch (typeof v) {
    case "boolean":
      return v ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(v) || isNegativeZero(v)) throw NOT_HASHABLE;
      return JSON.stringify(v);
    case "string":
      return string(v);
    case "object":
      break;
    default:
      throw NOT_HASHABLE;
  }
  if (Array.isArray(v)) {
    let ints = true;
    for (let i = 0; i < v.length; i++) {
      const x: unknown = v[i];
      if (typeof x !== "number" || !Number.isSafeInteger(x) || isNegativeZero(x)) {
        ints = false;
        break;
      }
    }
    // For safe integers JSON.stringify prints exactly the digits JCS requires.
    if (ints) return JSON.stringify(v);
    let s = "[";
    for (let i = 0; i < v.length; i++) {
      if (i > 0) s += ",";
      s += canon(v[i]);
    }
    return s + "]";
  }
  const proto: unknown = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) throw NOT_HASHABLE;
  const o = v as Record<string, unknown>;
  // The default sort compares UTF-16 code units, the order RFC 8785 requires.
  const keys = Object.keys(o).sort();
  let s = "{";
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i] as string;
    const x = o[k];
    if (x === undefined) throw NOT_HASHABLE;
    if (i > 0) s += ",";
    s += string(k) + ":" + canon(x);
  }
  return s + "}";
}

/** Core's assertHashable, run only to name the offending path once the fast pass has refused a document. */
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
    const proto: unknown = Object.getPrototypeOf(value);
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
  try {
    return canon(doc);
  } catch (err) {
    if (err !== NOT_HASHABLE) throw err;
    assertHashable(doc);
    throw new DocumentError("document is not hashable");
  }
}
