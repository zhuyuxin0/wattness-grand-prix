import { type Hash, type Hex, concat, hexToBigInt, hexToNumber, size, slice, stringToHex, toHex } from "viem";
import type { Reader, Signer } from "./clients.ts";

// Calldata anchor, used only if GateRecord is not deployed in time. Layout,
// 52 bytes: tag "GATEREC1" (8) | chain id uint64 (8) | od uint32 (4) | root (32).
// It proves the root existed at the block's time but is not write-once.
export const ANCHOR_TAG = stringToHex("GATEREC1", { size: 8 });
export const ANCHOR_BYTES = 52;

export interface Anchor {
  chainId: number;
  od: number;
  root: Hex;
}

export function encodeAnchor({ chainId, od, root }: Anchor): Hex {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error(`bad chain id ${chainId}`);
  if (!Number.isInteger(od) || od < 0 || od > 0xffffffff) throw new Error(`bad od ${od}`);
  if (size(root) !== 32) throw new Error("root must be 32 bytes");
  return concat([ANCHOR_TAG, toHex(chainId, { size: 8 }), toHex(od, { size: 4 }), root]);
}

export function decodeAnchor(data: Hex): Anchor {
  if (size(data) !== ANCHOR_BYTES) throw new Error(`anchor must be ${ANCHOR_BYTES} bytes, got ${size(data)}`);
  if (slice(data, 0, 8) !== ANCHOR_TAG) throw new Error("not a GATEREC1 anchor");
  const chainId = hexToBigInt(slice(data, 8, 16));
  if (chainId > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("chain id out of range");
  return { chainId: Number(chainId), od: hexToNumber(slice(data, 16, 20)), root: slice(data, 20, 52) };
}

export interface AnchorReceipt {
  txHash: Hash;
  blockNumber: bigint;
  blockTimestamp: bigint;
  data: Hex;
}

/** Sends a zero-value transaction to the signer's own address carrying the anchor. */
export async function sendAnchor(reader: Reader, signer: Signer, od: number, root: Hex): Promise<AnchorReceipt> {
  const data = encodeAnchor({ chainId: reader.chain.id, od, root });
  const self = signer.account.address;
  const gasPrice = await reader.getGasPrice();
  const txHash = await signer.sendTransaction({ to: self, value: 0n, data, type: "legacy", gasPrice });
  const receipt = await reader.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`anchor ${txHash} failed`);
  const block = await reader.getBlock({ blockNumber: receipt.blockNumber });
  return { txHash, blockNumber: receipt.blockNumber, blockTimestamp: block.timestamp, data };
}

/** Reads an anchor back from its transaction and checks that it was sent to self. */
export async function readAnchor(reader: Reader, txHash: Hash): Promise<Anchor & { from: Hex; blockTimestamp: bigint }> {
  const tx = await reader.getTransaction({ hash: txHash });
  if (!tx.to || tx.to.toLowerCase() !== tx.from.toLowerCase()) throw new Error("anchor not sent to self");
  if (tx.value !== 0n) throw new Error("anchor carries value");
  const receipt = await reader.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error("anchor transaction reverted");
  const block = await reader.getBlock({ blockNumber: receipt.blockNumber });
  return { ...decodeAnchor(tx.input), from: tx.from, blockTimestamp: block.timestamp };
}
