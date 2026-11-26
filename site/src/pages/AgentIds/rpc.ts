import { decodeFunctionResult, encodeFunctionData, type Abi, type Address, type Hex } from "viem";
import { TESTNET_RPCS } from "../../lib/testnet";

// Read-only BSC calls from the visitor's browser to public nodes: eth_call
// and block reads only, no key, no wallet, no transaction. One node answers a
// whole read, every call at the same block, so a page states one block and one
// time for everything it shows. The Agent IDs and Prices tabs share it.

export const TESTNET = {
  chainId: 97,
  name: "BSC testnet",
  explorer: "https://testnet.bscscan.com",
  /** The verifier's public nodes, in its order (src/lib/testnet.ts), the same Season and Launchpad read. */
  rpcs: TESTNET_RPCS,
} as const;

const TIMEOUT_MS = 10_000;

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { result?: T; error?: { message?: string } };
    if (body.error) throw new Error(body.error.message ?? `${method} failed`);
    if (body.result === undefined) throw new Error("no result");
    return body.result;
  } finally {
    window.clearTimeout(timer);
  }
}

type EncodeArgs = Parameters<typeof encodeFunctionData>[0];
type DecodeArgs = Parameters<typeof decodeFunctionResult>[0];

/** One node, pinned to the block it reported when the read began. */
export class ChainRead {
  constructor(
    readonly rpc: string,
    readonly chainId: number,
    readonly block: number,
    /** The block's own time, unix seconds. */
    readonly blockTime: number,
  ) {}

  /** eth_call at the pinned block, decoded with the given ABI. */
  async call<T>(to: Address, abi: Abi, functionName: string, args: readonly unknown[] = []): Promise<T> {
    const data = encodeFunctionData({ abi, functionName, args } as unknown as EncodeArgs);
    const raw = await rpc<Hex>(this.rpc, "eth_call", [{ to, data }, `0x${this.block.toString(16)}`]);
    return decodeFunctionResult({ abi, functionName, data: raw } as unknown as DecodeArgs) as T;
  }
}

/** The first public node that answers for the chain, at its latest block. */
export async function openRead(urls: readonly string[], chainId: number): Promise<ChainRead> {
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const [id, head] = await Promise.all([rpc<Hex>(url, "eth_chainId", []), rpc<{ number: Hex; timestamp: Hex }>(url, "eth_getBlockByNumber", ["latest", false])]);
      if (Number(id) !== chainId) throw new Error(`answers for chain ${Number(id)}`);
      return new ChainRead(url, chainId, Number(head.number), Number(head.timestamp));
    } catch (e) {
      errors.push(`${new URL(url).host}: ${(e as Error).message}`);
    }
  }
  throw new Error(`No public node answered (${errors.join("; ")})`);
}

/** "12 s", "4 min 10 s", "5 h 2 min", "2 d 3 h". */
export function age(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  return `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h`;
}

export const txUrl = (hash: string) => `${TESTNET.explorer}/tx/${hash}`;
export const addressUrl = (address: string) => `${TESTNET.explorer}/address/${address}`;
