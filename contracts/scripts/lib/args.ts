import { assertNetworkAllowed, type Network, resolveNetwork } from "./networks.ts";

export const NETWORK_OPTIONS = {
  network: { type: "string", default: "bsc-testnet" },
  rpc: { type: "string" },
  mainnet: { type: "boolean", default: false },
} as const;

export function networkFrom(values: { network: string; rpc?: string | undefined; mainnet?: boolean | undefined }): Network {
  const network = resolveNetwork(values.network, values.rpc);
  assertNetworkAllowed(network, values.mainnet ?? false);
  return network;
}

export function fail(err: unknown): never {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
