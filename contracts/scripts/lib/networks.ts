import { type Chain, defineChain, fallback, http, type Transport } from "viem";
import { bsc, bscTestnet } from "viem/chains";

export interface Network {
  name: string;
  chain: Chain;
  rpcUrls: readonly string[];
}

// Public BNB Chain endpoints, in failover order. The first refuses eth_getLogs,
// so readers use eth_call against the contract's mappings instead.
export const BSC_TESTNET_RPCS = [
  "https://bsc-testnet-dataseed.bnbchain.org",
  "https://bsc-testnet.bnbchain.org",
  "https://bsc-prebsc-dataseed.bnbchain.org",
] as const;

// Mainnet holds real BNB: scripts reach it only with --network bsc-mainnet and --mainnet (see assertNetworkAllowed).
export const BSC_MAINNET_RPCS = [
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc-dataseed1.bnbchain.org",
  "https://bsc-dataseed2.bnbchain.org",
  "https://bsc-dataseed3.bnbchain.org",
  "https://bsc-dataseed4.bnbchain.org",
] as const;

/** Chains a script may talk to. 56 also needs the explicit --mainnet flag. */
export const ALLOWED_CHAIN_IDS = [31337, 97, 56] as const;

export const LOCAL_RPC = "http://127.0.0.1:15191";

const localhost = defineChain({
  id: 31337,
  name: "Hardhat",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [LOCAL_RPC] } },
});

export function resolveNetwork(name: string, rpcOverride?: string): Network {
  const extra = rpcOverride ? [rpcOverride] : [];
  switch (name) {
    case "bsc-testnet":
      return { name, chain: bscTestnet, rpcUrls: [...extra, ...BSC_TESTNET_RPCS] };
    case "bsc-mainnet":
      return { name, chain: bsc, rpcUrls: [...extra, ...BSC_MAINNET_RPCS] };
    case "local":
    case "localhost":
      return { name: "localhost", chain: localhost, rpcUrls: extra.length > 0 ? extra : [LOCAL_RPC] };
    default:
      throw new Error(`unknown network ${name}; expected local, bsc-testnet or bsc-mainnet`);
  }
}

export function transportFor(network: Network): Transport {
  const transports = network.rpcUrls.map((url) => http(url, { timeout: 15_000, retryCount: 1 }));
  const [only] = transports;
  if (transports.length === 1 && only) return only;
  return fallback(transports, { retryCount: 1 });
}

/**
 * Refuses any chain but 31337 and 97, and 56 unless the caller passed --mainnet.
 * Runs before a key is loaded, so a mistyped network never reaches a signer.
 */
export function assertNetworkAllowed(network: Network, mainnet: boolean): void {
  const id = network.chain.id;
  if (!(ALLOWED_CHAIN_IDS as readonly number[]).includes(id)) throw new Error(`chain ${id} is not allowed`);
  if (id === 56 && !mainnet) throw new Error("bsc-mainnet spends real BNB; pass --mainnet as well to confirm");
  if (id !== 56 && mainnet) throw new Error("--mainnet is only for --network bsc-mainnet");
}
