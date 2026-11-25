import { loadSecrets } from "@gatelock/core/secrets";
import { getAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const KEY_VAR = "GATE_PRIVATE_KEY";

/** Hardhat's first public test account; the local node funds it. */
export const LOCAL_ACCOUNT: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

export type NetworkName = "local" | "bsc-testnet" | "bsc-mainnet";

export function parseNetwork(name: string): NetworkName {
  if (name === "localhost") return "local";
  if (name === "local" || name === "bsc-testnet" || name === "bsc-mainnet") return name;
  throw new Error(`unknown network ${name}; expected local, bsc-testnet or bsc-mainnet`);
}

/** The committer's address. Only the address leaves this function; the key is dropped. */
export function committerAddress(network: NetworkName): Address {
  if (network === "local") return LOCAL_ACCOUNT;
  const { [KEY_VAR]: raw } = loadSecrets([KEY_VAR]);
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`${KEY_VAR} is not a 32-byte hex key`);
  return getAddress(privateKeyToAccount(key as `0x${string}`).address);
}
