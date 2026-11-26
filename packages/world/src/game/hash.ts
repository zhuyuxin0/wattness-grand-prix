// The hashes a sealed plan needs, synchronous and without dependencies, so the page hashes the same bytes in any
// context: RFC 8785 canonical JSON under packages/core's integer rule (jcs.ts), SHA-256 (FIPS 180-4) for the RFC 6962
// leaf, and Keccak-256 (the Ethereum variant, padding 0x01) for scope ids, record keys and ABI selectors.
// hash.test.ts checks each against packages/core and viem.

export type Hex = `0x${string}`;

export class DocumentError extends Error {
  override name = 'DocumentError';
}

/** RFC 8785 canonical form of a document of safe integers, strings, booleans, null, arrays and plain objects. */
export function canonicalJson(value: unknown, path = '$'): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value); // RFC 8785 strings are ECMAScript's JSON.stringify
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new DocumentError(`${path}: ${value} is not a safe integer`);
    if (Object.is(value, -0)) throw new DocumentError(`${path}: negative zero`);
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map((v, i) => canonicalJson(v, `${path}[${i}]`)).join(',')}]`;
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new DocumentError(`${path}: not a plain object`);
    // property names sorted by their UTF-16 code units, which is what Array.prototype.sort compares
    const keys = Object.keys(value as object).sort();
    return `{${keys.map((k) => {
      const v = (value as Record<string, unknown>)[k];
      if (v === undefined) throw new DocumentError(`${path}.${k}: undefined`);
      return `${JSON.stringify(k)}:${canonicalJson(v, `${path}.${k}`)}`;
    }).join(',')}}`;
  }
  throw new DocumentError(`${path}: ${typeof value} is not JSON`);
}

export const utf8 = (s: string) => new TextEncoder().encode(s);

export function toHex(b: Uint8Array): Hex {
  let s = '0x';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s as Hex;
}

export function fromHex(h: string): Uint8Array {
  const s = h.startsWith('0x') ? h.slice(2) : h;
  if (s.length % 2 || /[^0-9a-fA-F]/.test(s)) throw new Error(`not hex: ${h.slice(0, 20)}`);
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// ── SHA-256 ───────────────────────────────────────────────────────────────────────────────────────────────────────
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(data: Uint8Array): Uint8Array {
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const len = data.length, total = Math.ceil((len + 9) / 64) * 64;
  const m = new Uint8Array(total);
  m.set(data); m[len] = 0x80;
  const bits = len * 8, view = new DataView(m.buffer);
  view.setUint32(total - 8, Math.floor(bits / 0x100000000)); view.setUint32(total - 4, bits >>> 0);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!, b = w[i - 2]!;
      w[i] = (w[i - 16]! + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[i - 7]! + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) >>> 0;
    }
    let a = H[0]!, b = H[1]!, c = H[2]!, d = H[3]!, e = H[4]!, f = H[5]!, g = H[6]!, h = H[7]!;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i]! + w[i]!) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0]! + a) >>> 0; H[1] = (H[1]! + b) >>> 0; H[2] = (H[2]! + c) >>> 0; H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0; H[5] = (H[5]! + f) >>> 0; H[6] = (H[6]! + g) >>> 0; H[7] = (H[7]! + h) >>> 0;
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i]!);
  return out;
}

/** SHA-256(0x00 || JCS(doc)): the RFC 6962 leaf hash of a canonical document, as packages/core's leafHash. */
export function leafHash(doc: unknown): Hex {
  const body = utf8(canonicalJson(doc)), buf = new Uint8Array(body.length + 1);
  buf.set(body, 1);
  return toHex(sha256(buf));
}

/** SHA-256 of a document's canonical bytes, lowercase hex without 0x (the form file digests take). */
export const docSha256 = (doc: unknown) => toHex(sha256(utf8(canonicalJson(doc)))).slice(2);

// ── Keccak-256 ────────────────────────────────────────────────────────────────────────────────────────────────────
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const M64 = (1n << 64n) - 1n;
const rotl = (x: bigint, n: number) => (n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M64);

function keccakF(s: bigint[]) {
  const c = new Array<bigint>(5), b = new Array<bigint>(25);
  for (let r = 0; r < 24; r++) {
    for (let x = 0; x < 5; x++) c[x] = s[x]! ^ s[x + 5]! ^ s[x + 10]! ^ s[x + 15]! ^ s[x + 20]!;
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5]! ^ rotl(c[(x + 1) % 5]!, 1);
      for (let y = 0; y < 25; y += 5) s[y + x] = s[y + x]! ^ d;
    }
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) b[y + ((2 * x + 3 * y) % 5) * 5] = rotl(s[x + y * 5]!, ROT[x + y * 5]!);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 25; y += 5) s[y + x] = b[y + x]! ^ (~b[y + ((x + 1) % 5)]! & M64 & b[y + ((x + 2) % 5)]!);
    s[0] = s[0]! ^ RC[r]!;
  }
}

/** Keccak-256 (rate 136 bytes, the original 0x01 padding Ethereum uses). Its inputs here are short: a lane is a BigInt. */
export function keccak256(data: Uint8Array): Hex {
  const rate = 136, s = new Array<bigint>(25).fill(0n);
  const padded = new Uint8Array(Math.ceil((data.length + 1) / rate) * rate);
  padded.set(data); padded[data.length] ^= 0x01; padded[padded.length - 1]! |= 0x80;
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let j = 7; j >= 0; j--) lane = (lane << 8n) | BigInt(padded[off + i * 8 + j]!);
      s[i] = s[i]! ^ lane;
    }
    keccakF(s);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) { let lane = s[i]!; for (let j = 0; j < 8; j++) { out[i * 8 + j] = Number(lane & 0xffn); lane >>= 8n; } }
  return toHex(out);
}
