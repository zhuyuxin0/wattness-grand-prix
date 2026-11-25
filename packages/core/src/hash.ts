import { bytesToHex, concat, hexToBytes, sha256 as viemSha256, type Hex } from "viem";
import { canonicalBytes } from "./jcs.js";

const LEAF_PREFIX = new Uint8Array([0x00]);
const NODE_PREFIX = new Uint8Array([0x01]);

export function sha256(data: Uint8Array): Uint8Array {
  return viemSha256(data, "bytes");
}

/** Lowercase hex without 0x, the form the Wattness release uses for file digests. */
export function fileSha256(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return bytesToHex(sha256(bytes)).slice(2);
}

/** SHA-256(0x00 || JCS(doc)): the RFC 6962 leaf hash of a canonical document. */
export function leafHash(doc: unknown): Hex {
  return bytesToHex(sha256(concat([LEAF_PREFIX, canonicalBytes(doc)])));
}

function nodeHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256(concat([NODE_PREFIX, left, right]));
}

// Largest power of two strictly less than n (n >= 2).
function split(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

function mth(leaves: readonly Uint8Array[]): Uint8Array {
  if (leaves.length === 1) return leaves[0] as Uint8Array;
  const k = split(leaves.length);
  return nodeHash(mth(leaves.slice(0, k)), mth(leaves.slice(k)));
}

function toBytes32(leaf: Hex): Uint8Array {
  const b = hexToBytes(leaf);
  if (b.length !== 32) throw new Error(`leaf ${leaf} is not 32 bytes`);
  return b;
}

/**
 * RFC 6962 Merkle tree hash over leaf hashes (already prefixed with 0x00).
 * The empty tree is SHA-256 of the empty string, as the RFC defines it.
 */
export function merkleRoot(leaves: readonly Hex[]): Hex {
  if (leaves.length === 0) return bytesToHex(sha256(new Uint8Array()));
  return bytesToHex(mth(leaves.map(toBytes32)));
}

/** RFC 6962 audit path for leaf m, ordered from the leaf upward. */
export function inclusionProof(leaves: readonly Hex[], m: number): Hex[] {
  if (!Number.isInteger(m) || m < 0 || m >= leaves.length) throw new RangeError(`leaf index ${m} out of range`);
  const path: Uint8Array[] = [];
  const walk = (d: readonly Uint8Array[], i: number): void => {
    if (d.length === 1) return;
    const k = split(d.length);
    if (i < k) {
      walk(d.slice(0, k), i);
      path.push(mth(d.slice(k)));
    } else {
      walk(d.slice(k), i - k);
      path.push(mth(d.slice(0, k)));
    }
  };
  walk(leaves.map(toBytes32), m);
  return path.map((p) => bytesToHex(p));
}

/** Recomputes the root from one leaf and its audit path (RFC 9162, section 2.1.3.2). */
export function rootFromProof(leaf: Hex, m: number, size: number, proof: readonly Hex[]): Hex {
  if (!Number.isInteger(m) || m < 0 || m >= size) throw new RangeError(`leaf index ${m} out of range`);
  let fn = m;
  let sn = size - 1;
  let r = toBytes32(leaf);
  for (const p of proof) {
    if (sn === 0) throw new Error("proof is too long");
    const pb = toBytes32(p);
    if ((fn & 1) === 1 || fn === sn) {
      r = nodeHash(pb, r);
      while ((fn & 1) === 0 && fn !== 0) {
        fn >>= 1;
        sn >>= 1;
      }
    } else {
      r = nodeHash(r, pb);
    }
    fn >>= 1;
    sn >>= 1;
  }
  if (sn !== 0) throw new Error("proof is too short");
  return bytesToHex(r);
}
