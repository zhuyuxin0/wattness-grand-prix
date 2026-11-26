import { useCallback, useEffect, useRef, useState } from "react";
import { createPublicClient, getAddress, http, type PublicClient } from "viem";
import { bscTestnet } from "viem/chains";
import { isCapture } from "./capture";

// Live reads from BSC testnet, in the browser, over public RPC only: no wallet,
// no key, eth_call and receipts. One read pins the chain head once and asks
// every call at that block, so a page shows one consistent state and can say
// which block and time it shows. A node that fails hands the whole read to the
// next one in the verifier's list.

export const TESTNET_CHAIN_ID = 97;

/** BSC testnet's public nodes, in the order the verifier tries them (packages/verifier/src/chain.ts). */
export const TESTNET_RPCS: readonly string[] = [
  "https://bsc-testnet-dataseed.bnbchain.org",
  "https://bsc-testnet.bnbchain.org",
  "https://bsc-prebsc-dataseed.bnbchain.org",
];

export const TESTNET_EXPLORER = "https://testnet.bscscan.com";

export const txUrl = (hash: string) => `${TESTNET_EXPLORER}/tx/${hash}`;
export const addressUrl = (address: string) => `${TESTNET_EXPLORER}/address/${address}`;
export const blockUrl = (block: bigint | number) => `${TESTNET_EXPLORER}/block/${block}`;

/** The block a read was taken at. */
export interface ReadAt {
  number: bigint;
  /** Unix seconds. */
  time: number;
}

export interface TestnetRead<T> {
  data: T;
  at: ReadAt;
  /** The node that answered. */
  rpc: string;
}

const clients = new Map<string, PublicClient>();

function clientFor(url: string): PublicClient {
  let c = clients.get(url);
  if (!c) {
    // Calls made together at one block go out as one Multicall3 eth_call.
    c = createPublicClient({
      chain: bscTestnet,
      transport: http(url, { timeout: 12_000, retryCount: 1 }),
      batch: { multicall: true },
    }) as PublicClient;
    clients.set(url, c);
  }
  return c;
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

function reason(e: unknown): string {
  const m = e as { shortMessage?: unknown; message?: unknown };
  const text = typeof m?.shortMessage === "string" ? m.shortMessage : typeof m?.message === "string" ? m.message : String(e);
  return text.split("\n")[0]!.slice(0, 160).replace(/\.+$/, "");
}

/** Nodes that have answered eth_chainId with 97 in this page's life. */
const checked = new Set<string>();

/** Runs `read` at the head of the first public node that answers for chain 97. */
export async function readTestnet<T>(read: (client: PublicClient, at: ReadAt) => Promise<T>): Promise<TestnetRead<T>> {
  const errors: string[] = [];
  for (const rpc of TESTNET_RPCS) {
    const client = clientFor(rpc);
    try {
      const [chainId, block] = await Promise.all([
        checked.has(rpc) ? Promise.resolve(TESTNET_CHAIN_ID) : client.getChainId(),
        client.getBlock({ blockTag: "latest" }),
      ]);
      if (chainId !== TESTNET_CHAIN_ID) throw new Error(`the node answered for chain ${chainId}`);
      checked.add(rpc);
      const at: ReadAt = { number: block.number, time: Number(block.timestamp) };
      return { data: await read(client, at), at, rpc };
    } catch (e) {
      errors.push(`${hostOf(rpc)}: ${reason(e)}`);
    }
  }
  throw new Error(`No public BSC testnet node answered (${errors.join("; ")}). Read again in a moment.`);
}

export interface MinedTx {
  hash: `0x${string}`;
  ok: boolean;
  blockNumber: bigint;
  /** Unix seconds of its block. */
  time: number;
  from: `0x${string}`;
  to: `0x${string}` | null;
  /** The contract a creation made, checksummed. */
  created: `0x${string}` | null;
  logs: readonly { address: `0x${string}`; topics: readonly `0x${string}`[]; data: `0x${string}` }[];
}

const mined = new Map<string, MinedTx>();

/**
 * A mined transaction from its receipt and its block. Old transactions do not
 * change, so a page reads each one once and later reads reuse it.
 */
export async function readMined(client: PublicClient, hash: `0x${string}`): Promise<MinedTx> {
  const known = mined.get(hash);
  if (known) return known;
  const [tx, receipt] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash })]);
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const out: MinedTx = {
    hash,
    ok: receipt.status === "success",
    blockNumber: receipt.blockNumber,
    time: Number(block.timestamp),
    from: tx.from,
    to: tx.to ?? null,
    created: receipt.contractAddress ? getAddress(receipt.contractAddress) : null,
    logs: receipt.logs.map((l) => ({ address: l.address, topics: l.topics as readonly `0x${string}`[], data: l.data })),
  };
  mined.set(hash, out);
  return out;
}

export interface Live<T> {
  read: TestnetRead<T> | null;
  /** The last attempt's failure; a later success clears it. */
  error: Error | null;
  busy: boolean;
  refresh: () => void;
}

/**
 * Reads on mount, on `refresh()`, and again every `everyMs` while the page is
 * visible (never while recording). A failed refresh keeps the last good read.
 */
export function useTestnet<T>(key: string, read: (client: PublicClient, at: ReadAt) => Promise<T>, everyMs = 60_000): Live<T> {
  const [state, setState] = useState<{ read: TestnetRead<T> | null; error: Error | null; busy: boolean }>({ read: null, error: null, busy: true });
  const seq = useRef(0);
  const fn = useRef(read);
  fn.current = read;

  const run = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, busy: true }));
    readTestnet((c, at) => fn.current(c, at)).then(
      (r) => id === seq.current && setState({ read: r, error: null, busy: false }),
      (e: unknown) => id === seq.current && setState((s) => ({ read: s.read, error: e instanceof Error ? e : new Error(String(e)), busy: false })),
    );
  }, []);

  useEffect(() => {
    run();
    if (isCapture() || everyMs <= 0) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, everyMs);
    return () => {
      window.clearInterval(timer);
      seq.current++;
    };
    // `key` names the read; the function itself changes every render.
  }, [key, everyMs, run]);

  return { ...state, refresh: run };
}
