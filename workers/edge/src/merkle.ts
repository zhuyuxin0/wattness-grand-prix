// The leaf hash and RFC 6962 tree of packages/core/src/hash.ts, over the runtime's SHA-256.
import { fromHex, sha256, toHex, utf8, type Hex } from "./bytes.ts";
import { canonicalJson } from "./jcs.ts";

const LEAF_PREFIX = new Uint8Array([0x00]);
const NODE_PREFIX = new Uint8Array([0x01]);

/** SHA-256(0x00 || JCS(doc)): the RFC 6962 leaf hash of a canonical document. */
export const leafHash = (doc: unknown): Hex => toHex(sha256(LEAF_PREFIX, utf8(canonicalJson(doc))));

const nodeHash = (left: Uint8Array, right: Uint8Array): Uint8Array => sha256(NODE_PREFIX, left, right);

// Largest power of two strictly less than n (n >= 2).
function split(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

const toBytes32 = (leaf: Hex): Uint8Array => fromHex(leaf, 32);

/**
 * The RFC 6962 root over leaf hashes and, for leaf m, its audit path from the leaf upward: core's
 * merkleRoot and inclusionProof in one pass, n - 1 node hashes in all.
 */
export function rootAndProof(leaves: readonly Hex[], m = -1): { root: Hex; proof: Hex[] } {
  if (leaves.length === 0) return { root: toHex(sha256(new Uint8Array())), proof: [] };
  if (m !== -1 && !(Number.isInteger(m) && m >= 0 && m < leaves.length)) throw new RangeError(`leaf index ${m} out of range`);
  const d = leaves.map(toBytes32);
  const path: Uint8Array[] = [];
  const walk = (lo: number, hi: number, i: number): Uint8Array => {
    if (hi - lo === 1) return d[lo] as Uint8Array;
    const k = split(hi - lo);
    if (i < 0) return nodeHash(walk(lo, lo + k, -1), walk(lo + k, hi, -1));
    if (i < k) {
      const left = walk(lo, lo + k, i);
      const right = walk(lo + k, hi, -1);
      path.push(right);
      return nodeHash(left, right);
    }
    const right = walk(lo + k, hi, i - k);
    const left = walk(lo, lo + k, -1);
    path.push(left);
    return nodeHash(left, right);
  };
  const root = walk(0, d.length, m);
  return { root: toHex(root), proof: path.map(toHex) };
}

export const merkleRoot = (leaves: readonly Hex[]): Hex => rootAndProof(leaves).root;

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
  return toHex(r);
}
