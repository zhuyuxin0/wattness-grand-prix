import { bytesToHex, concat, hexToBytes, numberToBytes, stringToBytes, type Hex } from "viem";
import { assertOd } from "./gate.js";

// Fallback record when the contract is not available: a zero-value transaction
// from the committer to itself whose calldata is
//   "GATEREC1" (8 bytes) || chainId (uint64) || od (uint32) || root (bytes32).
// Block time still proves when it existed; nothing enforces write-once.

export const ANCHOR_TAG = "GATEREC1";
const TAG = stringToBytes(ANCHOR_TAG);
export const ANCHOR_LENGTH = 8 + 8 + 4 + 32;

export interface Anchor {
  chainId: number;
  od: number;
  root: Hex;
}

export function encodeAnchor({ chainId, od, root }: Anchor): Hex {
  assertOd(od);
  const r = hexToBytes(root);
  if (r.length !== 32) throw new Error("root must be 32 bytes");
  return bytesToHex(concat([TAG, numberToBytes(chainId, { size: 8 }), numberToBytes(od, { size: 4 }), r]));
}

export function decodeAnchor(data: Hex): Anchor | null {
  const b = hexToBytes(data);
  if (b.length !== ANCHOR_LENGTH) return null;
  for (let i = 0; i < TAG.length; i++) if (b[i] !== TAG[i]) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const chainId = Number(view.getBigUint64(8));
  const od = view.getUint32(16);
  try {
    assertOd(od);
  } catch {
    return null;
  }
  return { chainId, od, root: bytesToHex(b.subarray(20)) };
}
