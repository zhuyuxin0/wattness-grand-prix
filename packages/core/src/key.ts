import { encodeAbiParameters, getAddress, keccak256, stringToBytes, type Address, type Hex } from "viem";
import { assertOd } from "./gate.js";

/** The bytes32 scope stored on chain for a human-readable scope label. */
export function scopeId(label: string): Hex {
  if (label.length === 0) throw new Error("empty scope label");
  return keccak256(stringToBytes(label));
}

/** keccak256(abi.encode(committer, scope, od)), as GateRecord computes it. */
export function recordKey(committer: Address, scope: Hex, od: number): Hex {
  assertOd(od);
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }, { type: "uint32" }],
      [getAddress(committer), scope, od],
    ),
  );
}

/**
 * A per-battery scope label. Day plans are not committed under it: they go
 * under PLAN_SCOPE_LABEL (fleet.ts), which the day's index carries.
 */
export function planScopeLabel(resource: string): string {
  if (!/^[A-Z0-9_]+$/.test(resource)) throw new Error(`bad resource name ${JSON.stringify(resource)}`);
  return `${resource}/da-energy`;
}

/** codeHash for a record: a 20-byte git object id (the source tree's), left-aligned in 32 bytes. */
export function codeHashFromCommit(commit: string): Hex {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`commit must be 40 lowercase hex digits, got ${JSON.stringify(commit)}`);
  return `0x${commit}${"0".repeat(24)}`;
}
