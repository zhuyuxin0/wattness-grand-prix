import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type Address, getAddress, type Hash, type Hex, keccak256 } from "viem";
import type { Artifact } from "./artifact.ts";
import type { Reader, Signer } from "./clients.ts";

export interface Deployment {
  contract: string;
  chainId: number;
  network: string;
  address: Address;
  txHash: Hash;
  blockNumber: string;
  deployer: Address;
  gasUsed: string;
  deployedAt: number;
  buildInfoId: string;
  compiler: string;
  runtimeCodeHash: Hex;
}

/** Gas for the creation transaction, from the node's estimate. */
export function estimateDeployGas(reader: Reader, artifact: Artifact, from: Address): Promise<bigint> {
  return reader.estimateGas({ account: from, data: artifact.bytecode });
}

export async function deployContract(
  reader: Reader,
  signer: Signer,
  artifact: Artifact,
  network: string,
  compiler: string,
): Promise<Deployment> {
  const gasPrice = await reader.getGasPrice();
  const txHash = await signer.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    type: "legacy",
    gasPrice,
  });
  const receipt = await reader.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error(`deploy ${txHash} failed with status ${receipt.status}`);
  }
  const code = await reader.getCode({ address: receipt.contractAddress });
  if (!code || code === "0x") throw new Error(`no code at ${receipt.contractAddress}`);
  // The artifact's runtime code ends in the same metadata hash, so equality is exact.
  if (code.toLowerCase() !== artifact.deployedBytecode.toLowerCase()) {
    throw new Error(`runtime code at ${receipt.contractAddress} differs from the artifact`);
  }
  const block = await reader.getBlock({ blockNumber: receipt.blockNumber });
  return {
    contract: artifact.contractName,
    chainId: reader.chain.id,
    network,
    address: getAddress(receipt.contractAddress),
    txHash,
    blockNumber: receipt.blockNumber.toString(),
    deployer: getAddress(signer.account.address),
    gasUsed: receipt.gasUsed.toString(),
    deployedAt: Number(block.timestamp),
    buildInfoId: artifact.buildInfoId,
    compiler,
    runtimeCodeHash: keccak256(code),
  };
}

export function readDeployment(path: string): Deployment | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as Deployment;
}

export function writeDeployment(path: string, deployment: Deployment): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(deployment, null, 2)}\n`);
}
