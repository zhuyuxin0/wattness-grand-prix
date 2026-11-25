import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createPublicClient, createWalletClient, custom, getAddress, type Abi, type Address, type EIP1193Provider, type Hex } from "viem";
import { loadContractsLib, type ContractsLib, type Reader, type Signer } from "../src/contracts-lib.js";
import { REPO } from "./outcome-helpers.js";

// GateRecord on Hardhat's in-process network (EDR): no node, no port. The contract scripts' own helpers
// (network allow-list, stamps, the local test key) are kept; only the transport is the in-process provider.

interface HardhatRuntime {
  network: { create(): Promise<{ provider: EIP1193Provider; close(): Promise<void> }> };
}

export interface InProcessChain {
  lib: ContractsLib;
  reader: Reader;
  signer: Signer;
  abi: Abi;
  contract: Address;
  /** Mines the next block at `unix`. */
  travelTo(unix: number): Promise<void>;
  close(): Promise<void>;
}

export async function inProcessChain(initialDate: string): Promise<InProcessChain> {
  const contracts = join(REPO, "contracts");
  // Hardhat is the contracts package's dependency; resolve it from there.
  const hrePath = createRequire(join(contracts, "package.json")).resolve("hardhat/hre");
  const { createHardhatRuntimeEnvironment } = (await import(pathToFileURL(hrePath).href)) as {
    createHardhatRuntimeEnvironment(config: object, options?: object, root?: string): Promise<HardhatRuntime>;
  };
  const hre = await createHardhatRuntimeEnvironment(
    { networks: { default: { type: "edr-simulated", chainType: "l1", initialDate } } },
    {},
    contracts,
  );
  const connection = await hre.network.create();
  const transport = custom(connection.provider);

  const real = await loadContractsLib(REPO);
  const network = real.networkFrom({ network: "local" });
  const reader = createPublicClient({ chain: network.chain, transport }) as Reader;
  const account = real.loadAccount(network);
  const signer = createWalletClient({ chain: network.chain, transport, account }) as Signer;
  const lib: ContractsLib = {
    ...real,
    readerFor: () => reader,
    signerFor: (_n, acct) => createWalletClient({ chain: network.chain, transport, account: acct }) as Signer,
  };

  const artifactPath = real.contractsPath("artifacts/contracts/GateRecord.sol/GateRecord.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as { abi: Abi; bytecode: Hex };
  const abi = JSON.parse(readFileSync(real.contractsPath("abi/GateRecord.json"), "utf8")) as Abi;
  const deployTx = await signer.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, account, chain: network.chain });
  const deployed = await reader.waitForTransactionReceipt({ hash: deployTx });
  if (!deployed.contractAddress) throw new Error("GateRecord did not deploy");

  const rpc = (method: string, params: unknown[]) => connection.provider.request({ method, params } as never);
  return {
    lib,
    reader,
    signer,
    abi,
    contract: getAddress(deployed.contractAddress),
    async travelTo(unix) {
      await rpc("evm_setNextBlockTimestamp", [unix]);
      await rpc("evm_mine", []);
    },
    close: () => connection.close(),
  };
}
