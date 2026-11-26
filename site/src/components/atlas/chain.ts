import { decodeFunctionResult, encodeFunctionData, type Address, type Hex } from "viem";

// Keyless reads from BNB Smart Chain's public nodes: Atlas's push feeds and a
// transaction's receipt. JSON-RPC over fetch with viem's ABI coder, the way the
// Verify tab reads GateRecord, so a page carries no client library. One read
// goes to one node and one block, and a feed's age is judged against that
// block's timestamp. Callers pass the addresses (atlas.ts holds them), so this
// file imports only viem and Node can run it directly.
//
// The read surface is Atlas's published interfaces (push-oracle-interfaces,
// MIT): IMultiFeed.fetchBatch and ISingleFeed's Chainlink-style
// latestRoundData. The BNB/USD SingleFeed's implementation is verified on
// Sourcify as SingularAggregatorUpgradeable; it predates contractType(), so
// only the Chainlink surface is called.

/**
 * BNB Smart Chain's public nodes, in the order the verifier tries them
 * (packages/verifier/src/chain.ts); each answers a browser's CORS preflight.
 */
export const BSC_RPCS = [
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc-dataseed1.bnbchain.org",
  "https://bsc-dataseed2.bnbchain.org",
  "https://bsc-dataseed3.bnbchain.org",
  "https://bsc-dataseed4.bnbchain.org",
] as const;

/** One node's JSON-RPC: a request's result, or an error. */
export type Rpc = (method: string, params: readonly unknown[]) => Promise<unknown>;

export interface NodeFailure {
  host: string;
  message: string;
}

/** Every node was asked and none gave the read; `failures` says how each failed. */
export class NodesUnavailable extends Error {
  override name = "NodesUnavailable";
  readonly failures: readonly NodeFailure[];
  constructor(failures: readonly NodeFailure[]) {
    super(`no public node gave the read (${failures.map((f) => `${f.host}: ${f.message}`).join("; ")})`);
    this.failures = failures;
  }
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** One public node's JSON-RPC over fetch. */
export function nodeRpc(url: string, timeoutMs = 8_000): Rpc {
  return async (method, params) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (body.error) throw new Error(body.error.message ?? "JSON-RPC error");
    if (!("result" in body)) throw new Error("no result");
    return body.result;
  };
}

/** One Rpc per node, so what a node has read once (see once below) stays read. */
const nodes = new Map<string, Rpc>();
function nodeFor(url: string, timeoutMs: number): Rpc {
  const key = `${timeoutMs} ${url}`;
  let rpc = nodes.get(key);
  if (!rpc) nodes.set(key, (rpc = nodeRpc(url, timeoutMs)));
  return rpc;
}

/** A read and the node that gave it. */
export interface NodeRead<T> {
  data: T;
  /** The node every call of the read went to. */
  rpc: string;
}

/**
 * Runs a whole read on one public node, the first that answers every call of
 * it. A node that fails any call hands the whole read to the next, as the
 * verifier and the site's testnet reads do, so one read never mixes two nodes'
 * views of the chain. It fails only when every node has failed.
 */
export async function onPublicNode<T>(read: (rpc: Rpc) => Promise<T>, urls: readonly string[] = BSC_RPCS, timeoutMs = 8_000): Promise<NodeRead<T>> {
  const failures: NodeFailure[] = [];
  for (const url of urls) {
    try {
      return { data: await read(nodeFor(url, timeoutMs)), rpc: url };
    } catch (e) {
      failures.push({ host: hostOf(url), message: e instanceof Error ? e.message : String(e) });
    }
  }
  throw new NodesUnavailable(failures);
}

/** Why a read failed, short: identical failures across the nodes are said once. */
export function failureDetail(error: Error): string {
  if (error instanceof NodesUnavailable) {
    const byMessage = new Map<string, string[]>();
    for (const f of error.failures) byMessage.set(f.message, [...(byMessage.get(f.message) ?? []), f.host]);
    const n = error.failures.length;
    return [...byMessage]
      .map(([message, on]) => (on.length === n && n > 1 ? `${message}, from all ${n} public nodes` : `${message} (${on.join(", ")})`))
      .join("; ");
  }
  return error.message.split("\n")[0]!.replace(/\.$/, "");
}

const MULTIFEED_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "precision", type: "uint8" }] },
  {
    type: "function",
    name: "fetchBatch",
    stateMutability: "view",
    inputs: [{ name: "feedIds", type: "bytes4[]" }],
    outputs: [
      {
        name: "priceSnapshots",
        type: "tuple[]",
        components: [
          { name: "price", type: "uint80" },
          { name: "aggregatedTs", type: "uint48" },
          { name: "onchainTs", type: "uint48" },
        ],
      },
    ],
  },
] as const;

const SINGLEFEED_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "precision", type: "uint8" }] },
  { type: "function", name: "description", stateMutability: "view", inputs: [], outputs: [{ name: "desc", type: "string" }] },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

export interface ReadBlock {
  number: bigint;
  /** Unix seconds. */
  timestamp: number;
}

export interface FeedSnapshot {
  key: Hex;
  /** Fixed point, at the registry's decimals. */
  price: bigint;
  /** Off-chain aggregation time, unix seconds. */
  aggregatedTs: number;
  /** When the value was written on chain, unix seconds; 0 if never. */
  onchainTs: number;
}

export interface MultiFeedRead {
  block: ReadBlock;
  decimals: number;
  /** Index-aligned with the keys asked for. */
  snapshots: FeedSnapshot[];
}

export interface SingleFeedRead {
  block: ReadBlock;
  decimals: number;
  description: string;
  answer: bigint;
  /** Off-chain aggregation time, unix seconds. */
  startedAt: number;
  /** When the value was written on chain, unix seconds; 0 if never. */
  updatedAt: number;
}

export interface GasReceipt {
  hash: Hex;
  status: "success" | "reverted";
  blockNumber: bigint;
  from: Address;
  to: Address | null;
  gasUsed: bigint;
  /** Wei per gas actually paid. */
  effectiveGasPrice: bigint;
}

function quantity(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) throw new Error(`${field} is not a hex quantity`);
  return BigInt(value);
}

async function latestBlock(rpc: Rpc): Promise<ReadBlock> {
  const block = (await rpc("eth_getBlockByNumber", ["latest", false])) as { number?: unknown; timestamp?: unknown } | null;
  if (!block) throw new Error("the node returned no latest block");
  return { number: quantity(block.number, "block number"), timestamp: Number(quantity(block.timestamp, "block timestamp")) };
}

async function ethCall(rpc: Rpc, to: Address, data: Hex, block: bigint | "latest"): Promise<Hex> {
  const result = await rpc("eth_call", [{ to, data }, block === "latest" ? block : `0x${block.toString(16)}`]);
  if (typeof result !== "string" || !result.startsWith("0x")) throw new Error(`eth_call to ${to} returned no data`);
  return result as Hex;
}

/** What never changes (a feed's decimals and description, a mined receipt) is read once per node. */
const fixedFacts = new WeakMap<Rpc, Map<string, Promise<unknown>>>();
function once<T>(rpc: Rpc, key: string, read: () => Promise<T>): Promise<T> {
  const facts = fixedFacts.get(rpc) ?? new Map<string, Promise<unknown>>();
  fixedFacts.set(rpc, facts);
  let p = facts.get(key) as Promise<T> | undefined;
  if (!p) {
    p = read();
    // A failed read is not kept, so the next one can succeed.
    p.catch(() => facts.delete(key));
    facts.set(key, p);
  }
  return p;
}

/** decimals() has one selector on both kinds of feed. */
const DECIMALS = encodeFunctionData({ abi: MULTIFEED_ABI, functionName: "decimals" });

/** Several feeds of one MultiFeed in one call, at the node's latest block. */
export async function readMultiFeed(address: Address, keys: readonly Hex[], rpc: Rpc): Promise<MultiFeedRead> {
  const block = await latestBlock(rpc);
  const [decimals, raw] = await Promise.all([
    once(rpc, `decimals:${address}`, async () =>
      decodeFunctionResult({ abi: MULTIFEED_ABI, functionName: "decimals", data: await ethCall(rpc, address, DECIMALS, "latest") }),
    ),
    ethCall(rpc, address, encodeFunctionData({ abi: MULTIFEED_ABI, functionName: "fetchBatch", args: [keys] }), block.number),
  ]);
  const snaps = decodeFunctionResult({ abi: MULTIFEED_ABI, functionName: "fetchBatch", data: raw });
  if (snaps.length !== keys.length) throw new Error(`the MultiFeed returned ${snaps.length} snapshots for ${keys.length} feeds`);
  return {
    block,
    decimals,
    snapshots: snaps.map((s, i) => ({ key: keys[i]!, price: s.price, aggregatedTs: s.aggregatedTs, onchainTs: s.onchainTs })),
  };
}

/**
 * A SingleFeed's latest round, at the node's latest block. `expect` must match
 * the feed's own description, so a moved or reassigned address cannot pass for
 * the pair.
 */
export async function readSingleFeed(address: Address, expect: RegExp, rpc: Rpc): Promise<SingleFeedRead> {
  const block = await latestBlock(rpc);
  const [decimals, description, raw] = await Promise.all([
    once(rpc, `decimals:${address}`, async () =>
      decodeFunctionResult({ abi: SINGLEFEED_ABI, functionName: "decimals", data: await ethCall(rpc, address, DECIMALS, "latest") }),
    ),
    once(rpc, `description:${address}`, async () =>
      decodeFunctionResult({
        abi: SINGLEFEED_ABI,
        functionName: "description",
        data: await ethCall(rpc, address, encodeFunctionData({ abi: SINGLEFEED_ABI, functionName: "description" }), "latest"),
      }),
    ),
    ethCall(rpc, address, encodeFunctionData({ abi: SINGLEFEED_ABI, functionName: "latestRoundData" }), block.number),
  ]);
  if (!expect.test(description)) throw new Error(`the feed at ${address} describes itself as "${description}"`);
  const [, answer, startedAt, updatedAt] = decodeFunctionResult({ abi: SINGLEFEED_ABI, functionName: "latestRoundData", data: raw });
  return { block, decimals, description, answer, startedAt: Number(startedAt), updatedAt: Number(updatedAt) };
}

/** A mined transaction's receipt, by hash. A receipt never changes, so each node is asked for it once. */
export function readReceipt(hash: Hex, rpc: Rpc): Promise<GasReceipt> {
  return once(rpc, `receipt:${hash.toLowerCase()}`, async () => {
    const r = (await rpc("eth_getTransactionReceipt", [hash])) as Record<string, unknown> | null;
    if (!r) throw new Error(`no receipt for ${hash}: not mined, or not on this chain`);
    const status = r.status === "0x1" ? "success" : r.status === "0x0" ? "reverted" : null;
    if (!status) throw new Error(`the receipt's status is ${String(r.status)}`);
    if (typeof r.transactionHash !== "string" || r.transactionHash.toLowerCase() !== hash.toLowerCase()) throw new Error("the node answered for another transaction");
    return {
      hash: r.transactionHash as Hex,
      status,
      blockNumber: quantity(r.blockNumber, "block number"),
      from: r.from as Address,
      to: typeof r.to === "string" ? (r.to as Address) : null,
      gasUsed: quantity(r.gasUsed, "gas used"),
      effectiveGasPrice: quantity(r.effectiveGasPrice, "effective gas price"),
    };
  });
}
