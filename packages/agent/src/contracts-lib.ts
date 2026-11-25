import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Account, Address, Chain, PrivateKeyAccount, PublicClient, Transport, WalletClient } from "viem";

// The contract scripts' network, wallet and client helpers, loaded from contracts/scripts/lib at run time
// so the outcome CLI reaches a chain through the same allow-list (31337, 97, and 56 only with --mainnet),
// the same RPC failover and the same key loading as the commit script.

export interface Network {
  name: string;
  chain: Chain;
  rpcUrls: readonly string[];
}

export type Reader = PublicClient<Transport, Chain>;
export type Signer = WalletClient<Transport, Chain, Account>;

export interface ContractsLib {
  networkFrom(values: { network: string; rpc?: string | undefined; mainnet?: boolean | undefined }): Network;
  readerFor(network: Network): Reader;
  signerFor(network: Network, account: Account): Signer;
  assertChain(reader: Reader): Promise<void>;
  formatStamp(unix: bigint | number): string;
  formatNative(wei: bigint, chain: Chain): string;
  /** Hardhat's public test key on 31337; otherwise GATE_PRIVATE_KEY from the secrets file. */
  loadAccount(network: Network): PrivateKeyAccount;
  contractsPath(rel: string): string;
  readDeployment(path: string): { address: Address } | undefined;
}

export async function loadContractsLib(repo: string): Promise<ContractsLib> {
  const lib = join(repo, "contracts", "scripts", "lib");
  if (!existsSync(join(lib, "networks.ts"))) throw new Error(`${lib} not found; run from the gatelock workspace`);
  const load = (name: string) => import(pathToFileURL(join(lib, name)).href) as Promise<Record<string, unknown>>;
  const [args, clients, account, artifact, deploy] = await Promise.all(
    ["args.ts", "clients.ts", "account.ts", "artifact.ts", "deploy.ts"].map(load),
  );
  const pick = <T>(mod: Record<string, unknown> | undefined, name: string): T => {
    const fn = mod?.[name];
    if (typeof fn !== "function") throw new Error(`contracts/scripts/lib exports no ${name}`);
    return fn as T;
  };
  return {
    networkFrom: pick(args, "networkFrom"),
    readerFor: pick(clients, "readerFor"),
    signerFor: pick(clients, "signerFor"),
    assertChain: pick(clients, "assertChain"),
    formatStamp: pick(clients, "formatStamp"),
    formatNative: pick(clients, "formatNative"),
    loadAccount: pick(account, "loadAccount"),
    contractsPath: pick(artifact, "contractsPath"),
    readDeployment: pick(deploy, "readDeployment"),
  };
}
