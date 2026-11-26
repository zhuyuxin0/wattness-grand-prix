// The parts of GateRecord's ABI the Worker reads: three view calls and the Committed event. Every
// argument and every field of Record is a static type, so calls and results are plain 32-byte words.
import { checksumAddress, fromHex, keccak256, toHex, utf8, type Hex } from "./bytes.ts";

const selector = (signature: string): string => toHex(keccak256(utf8(signature))).slice(2, 10);

const GET = selector("get(bytes32)");
const KEY_OF = selector("keyOf(address,bytes32,uint32)");
const GATE_TS = selector("gateTs(uint32)");

/** topic0 of Committed(bytes32 indexed key, address indexed committer, bytes32 indexed scope, uint32 od, bytes32 root, uint32 leafCount, bytes32 codeHash). */
export const COMMITTED_TOPIC = toHex(keccak256(utf8("Committed(bytes32,address,bytes32,uint32,bytes32,uint32,bytes32)")));

const word = (hexDigits: string): string => {
  if (hexDigits.length > 64) throw new Error("value does not fit a word");
  return hexDigits.padStart(64, "0");
};
const addressWord = (address: string): string => {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error(`not an address: ${address}`);
  return word(address.slice(2).toLowerCase());
};
const uintWord = (n: number): string => {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`not a uint: ${n}`);
  return word(n.toString(16));
};
const bytes32Word = (h: string): string => {
  if (!/^0x[0-9a-fA-F]{64}$/.test(h)) throw new Error(`not bytes32: ${h}`);
  return h.slice(2).toLowerCase();
};

export const callGet = (key: Hex): Hex => `0x${GET}${bytes32Word(key)}`;
export const callKeyOf = (committer: string, scope: Hex, od: number): Hex => `0x${KEY_OF}${addressWord(committer)}${bytes32Word(scope)}${uintWord(od)}`;
export const callGateTs = (od: number): Hex => `0x${GATE_TS}${uintWord(od)}`;

/** keccak256(bytes(label)): the bytes32 scope stored on chain for a scope label. */
export function scopeId(label: string): Hex {
  if (label.length === 0) throw new Error("empty scope label");
  return toHex(keccak256(utf8(label)));
}

/** keccak256(abi.encode(committer, scope, od)), as GateRecord.keyOf computes it. */
export const recordKey = (committer: string, scope: Hex, od: number): Hex =>
  toHex(keccak256(fromHex(`0x${addressWord(committer)}${bytes32Word(scope)}${uintWord(od)}`)));

/** codeHash for a record: the 20-byte git tree id, left-aligned in 32 bytes (core's codeHashFromCommit). */
export function codeHashFromTree(tree: string): Hex {
  if (!/^[0-9a-f]{40}$/.test(tree)) throw new Error(`tree must be 40 lowercase hex digits, got ${JSON.stringify(tree)}`);
  return `0x${tree}${"0".repeat(24)}`;
}

function words(data: string, count: number): string[] {
  if (!new RegExp(`^0x[0-9a-fA-F]{${64 * count}}$`).test(data)) throw new Error(`expected ${count} ABI words, got ${data.length > 2 ? (data.length - 2) / 2 : 0} bytes`);
  return Array.from({ length: count }, (_, i) => data.slice(2 + 64 * i, 66 + 64 * i).toLowerCase());
}

function uintOf(w: string, bits: number): number {
  const v = BigInt(`0x${w}`);
  if (v >> BigInt(bits) !== 0n) throw new Error(`word ${w} is not a uint${bits}`);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`word ${w} exceeds 2^53`);
  return Number(v);
}

function addressOf(w: string): Hex {
  if (!w.startsWith("0".repeat(24))) throw new Error(`word ${w} is not an address`);
  return checksumAddress(`0x${w.slice(24)}`);
}

export const decodeUint = (data: string): number => uintOf(words(data, 1)[0] as string, 256);
export const decodeBytes32 = (data: string): Hex => `0x${words(data, 1)[0] as string}`;

export interface ChainRecord {
  root: Hex;
  codeHash: Hex;
  scope: Hex;
  committer: Hex;
  od: number;
  leafCount: number;
  committedAt: number;
  blockNumber: number;
}

/** GateRecord.get's Record, or null for the zeroed record it returns when no record exists. */
export function decodeRecord(data: string): ChainRecord | null {
  const w = words(data, 8) as [string, string, string, string, string, string, string, string];
  const committer = addressOf(w[3]);
  const record: ChainRecord = {
    root: `0x${w[0]}`,
    codeHash: `0x${w[1]}`,
    scope: `0x${w[2]}`,
    committer,
    od: uintOf(w[4], 32),
    leafCount: uintOf(w[5], 32),
    committedAt: uintOf(w[6], 64),
    blockNumber: uintOf(w[7], 64),
  };
  return /^0x0{40}$/.test(committer) ? null : record;
}

export interface CommittedEvent {
  key: Hex;
  committer: Hex;
  scope: Hex;
  od: number;
  root: Hex;
  leafCount: number;
  codeHash: Hex;
}

/** A Committed log's topics and data, or null if the log is not a Committed event. */
export function decodeCommitted(topics: readonly string[], data: string): CommittedEvent | null {
  if (topics.length !== 4 || topics[0]?.toLowerCase() !== COMMITTED_TOPIC) return null;
  const [key, committer, scope] = topics.slice(1).map((t) => words(t, 1)[0] as string) as [string, string, string];
  const d = words(data, 4) as [string, string, string, string];
  return {
    key: `0x${key}`,
    committer: addressOf(committer),
    scope: `0x${scope}`,
    od: uintOf(d[0], 32),
    root: `0x${d[1]}`,
    leafCount: uintOf(d[2], 32),
    codeHash: `0x${d[3]}`,
  };
}
