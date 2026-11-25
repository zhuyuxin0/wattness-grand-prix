import { decodeFunctionResult, encodeAbiParameters, encodeFunctionData, getAddress, keccak256, stringToBytes, type Address, type Hex } from "viem";

// Reads a GateRecord record straight from a public BSC node: one eth_call to
// get(key), with the key derived here from the plan's own committer, scope
// label and operating day, the way the contract derives it.

export interface Network {
  chainId: 56 | 97;
  name: string;
  short: string;
  rpcs: string[];
  explorer: string;
}

export const NETWORKS: Record<"mainnet" | "testnet", Network> = {
  mainnet: {
    chainId: 56,
    name: "BNB Smart Chain",
    short: "BSC mainnet",
    rpcs: [
      "https://bsc-dataseed.bnbchain.org",
      "https://bsc-dataseed1.bnbchain.org",
      "https://bsc-dataseed2.bnbchain.org",
      "https://bsc-dataseed3.bnbchain.org",
      "https://bsc-dataseed4.bnbchain.org",
    ],
    explorer: "https://bscscan.com",
  },
  testnet: {
    chainId: 97,
    name: "BNB Smart Chain Testnet",
    short: "BSC testnet",
    rpcs: ["https://bsc-testnet-dataseed.bnbchain.org", "https://bsc-testnet.bnbchain.org"],
    explorer: "https://testnet.bscscan.com",
  },
};

const ABI = [
  {
    type: "function",
    name: "get",
    stateMutability: "view",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "root", type: "bytes32" },
          { name: "codeHash", type: "bytes32" },
          { name: "scope", type: "bytes32" },
          { name: "committer", type: "address" },
          { name: "od", type: "uint32" },
          { name: "leafCount", type: "uint32" },
          { name: "committedAt", type: "uint64" },
          { name: "blockNumber", type: "uint64" },
        ],
      },
    ],
  },
] as const;

export function scopeId(label: string): Hex {
  return keccak256(stringToBytes(label));
}

/** keccak256(abi.encode(committer, scope, od)), as GateRecord.keyOf computes it. */
export function recordKey(committer: string, scope: Hex, od: number): Hex {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }, { type: "uint32" }], [getAddress(committer), scope, od]));
}

export interface ChainRecord {
  root: Hex;
  codeHash: Hex;
  scope: Hex;
  committer: Address;
  od: number;
  leafCount: number;
  committedAt: number;
  blockNumber: number;
}

export interface ChainRead {
  record: ChainRecord;
  rpc: string;
  /** The chain head when the record was read. */
  headBlock: number;
  callData: Hex;
}

async function rpc<T>(url: string, method: string, params: unknown[], timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { result?: T; error?: { message: string } };
    if (body.error) throw new Error(body.error.message);
    if (body.result === undefined) throw new Error("no result");
    return body.result;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Tries each public node in turn; the first full answer wins. */
export async function readRecord(network: Network, contract: string, key: Hex, timeoutMs = 8000): Promise<ChainRead> {
  const callData = encodeFunctionData({ abi: ABI, functionName: "get", args: [key] });
  const errors: string[] = [];
  for (const url of network.rpcs) {
    try {
      const [raw, head] = await Promise.all([
        rpc<Hex>(url, "eth_call", [{ to: contract, data: callData }, "latest"], timeoutMs),
        rpc<Hex>(url, "eth_blockNumber", [], timeoutMs),
      ]);
      const r = decodeFunctionResult({ abi: ABI, functionName: "get", data: raw });
      return {
        record: {
          root: r.root,
          codeHash: r.codeHash,
          scope: r.scope,
          committer: r.committer,
          od: r.od,
          leafCount: r.leafCount,
          committedAt: Number(r.committedAt),
          blockNumber: Number(r.blockNumber),
        },
        rpc: url,
        headBlock: Number(BigInt(head)),
        callData,
      };
    } catch (e) {
      errors.push(`${new URL(url).host}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`no public node answered (${errors.join("; ")})`);
}
