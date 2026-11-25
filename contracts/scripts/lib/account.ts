import { loadSecrets } from "@gatelock/core/secrets";
import type { PrivateKeyAccount } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Network } from "./networks.ts";

export const KEY_VAR = "GATE_PRIVATE_KEY";

// Hardhat's first public test account. It is in every Hardhat install and holds
// value only on a local node, so the local network never reads the secrets file.
const LOCAL_TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

export function loadAccount(network?: Network): PrivateKeyAccount {
  if (network?.chain.id === 31337) return privateKeyToAccount(LOCAL_TEST_KEY);
  const { [KEY_VAR]: raw } = loadSecrets([KEY_VAR]);
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`${KEY_VAR} is not a 32-byte hex key`);
  return privateKeyToAccount(key as `0x${string}`);
}
