import {
  type Account,
  type Chain,
  createPublicClient,
  createWalletClient,
  formatEther,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { type Network, transportFor } from "./networks.ts";

export type Reader = PublicClient<Transport, Chain>;
export type Signer = WalletClient<Transport, Chain, Account>;

export function readerFor(network: Network): Reader {
  return createPublicClient({ chain: network.chain, transport: transportFor(network) });
}

export function signerFor(network: Network, account: Account): Signer {
  return createWalletClient({ chain: network.chain, transport: transportFor(network), account });
}

/** Refuses to continue if the endpoint answers for a different chain. */
export async function assertChain(reader: Reader): Promise<void> {
  const id = await reader.getChainId();
  if (id !== reader.chain.id) throw new Error(`RPC reports chain ${id}, expected ${reader.chain.id}`);
}

export function formatNative(wei: bigint, chain: Chain): string {
  return `${formatEther(wei)} ${chain.nativeCurrency.symbol}`;
}

const STAMP_ZONES = [
  ["CT", "America/Chicago"],
  ["Bangkok", "Asia/Bangkok"],
] as const;

/** A block time in market time (CT) with the build team's local time beside it. */
export function formatStamp(unix: bigint | number): string {
  const at = new Date(Number(unix) * 1000);
  const parts = STAMP_ZONES.map(([label, timeZone]) => {
    const local = at.toLocaleString("sv-SE", { timeZone, hourCycle: "h23" });
    return `${local} ${label}`;
  });
  return `${unix} (${parts.join(" / ")})`;
}
