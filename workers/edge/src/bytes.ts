import { createHash } from "node:crypto";
import { keccak_256 } from "@noble/hashes/sha3.js";

export type Hex = `0x${string}`;

const encoder = new TextEncoder();
// Fatal: a byte sequence that is not UTF-8 is refused, not repaired. ignoreBOM keeps a BOM in the text,
// so it fails the parse instead of riding along unchecked.
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export const utf8 = (s: string): Uint8Array => encoder.encode(s);
export const fromUtf8 = (b: Uint8Array): string => decoder.decode(b);

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

export function toHex(b: Uint8Array): Hex {
  let s = "0x";
  for (let i = 0; i < b.length; i++) s += HEX[b[i] as number];
  return s as Hex;
}

// Digit values by char code, -1 for anything that is not a hex digit. A table, not parseInt: a day's
// index holds hundreds of leaf hashes, and decoding them is a cold request's largest cost after hashing.
const DIGIT = new Int8Array(128).fill(-1);
for (let i = 0; i < 10; i++) DIGIT[48 + i] = i;
for (let i = 0; i < 6; i++) DIGIT[65 + i] = DIGIT[97 + i] = 10 + i;

export function fromHex(h: string, bytes?: number): Uint8Array {
  if (!h.startsWith("0x") || h.length % 2 !== 0) throw new Error(`not hex: ${h.slice(0, 80)}`);
  const out = new Uint8Array((h.length - 2) / 2);
  for (let i = 0; i < out.length; i++) {
    const hi = DIGIT[h.charCodeAt(2 + 2 * i)] ?? -1;
    const lo = DIGIT[h.charCodeAt(3 + 2 * i)] ?? -1;
    if (hi < 0 || lo < 0) throw new Error(`not hex: ${h.slice(0, 80)}`);
    out[i] = (hi << 4) | lo;
  }
  if (bytes !== undefined && out.length !== bytes) throw new Error(`expected ${bytes} bytes, got ${out.length}`);
  return out;
}

export const isBytes32 = (h: unknown): h is Hex => typeof h === "string" && /^0x[0-9a-f]{64}$/.test(h);

/** The runtime's native SHA-256 over the parts in order. */
export function sha256(...parts: Uint8Array[]): Uint8Array {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return new Uint8Array(h.digest());
}

/** Lowercase hex without 0x, the form the Wattness release and the publisher use for file digests. */
export const fileSha256 = (b: Uint8Array): string => toHex(sha256(b)).slice(2);

export const keccak256 = (b: Uint8Array): Uint8Array => keccak_256(b);

/** EIP-55 mixed-case form, the way the repository's verifier prints addresses. */
export function checksumAddress(address: string): Hex {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error(`not an address: ${address}`);
  const lower = address.slice(2).toLowerCase();
  const hash = toHex(keccak256(utf8(lower))).slice(2);
  let out = "0x";
  for (let i = 0; i < 40; i++) out += parseInt(hash[i] as string, 16) >= 8 ? (lower[i] as string).toUpperCase() : lower[i];
  return out as Hex;
}
