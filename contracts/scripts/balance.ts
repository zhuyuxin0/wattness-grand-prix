// Prints the wallet's balance and what the deploy and a commit would cost now.
// Read-only: estimates use eth_estimateGas, nothing is signed.
import { parseArgs } from "node:util";
import { type Address, getAddress, isAddress } from "viem";
import { loadAccount } from "./lib/account.ts";
import { loadArtifact } from "./lib/artifact.ts";
import { fail, NETWORK_OPTIONS, networkFrom } from "./lib/args.ts";
import { assertChain, formatNative, readerFor } from "./lib/clients.ts";
import { estimateDeployGas } from "./lib/deploy.ts";

// Measured locally: 189,271 gas for a wallet's first commit, 172,171 after.
const COMMIT_GAS = 200_000n;

try {
  const { values } = parseArgs({ options: { ...NETWORK_OPTIONS, address: { type: "string" } } });
  const network = networkFrom(values);
  const raw = values.address;
  if (raw !== undefined && !isAddress(raw)) throw new Error(`not an address: ${raw}`);
  const address: Address = raw ? getAddress(raw) : loadAccount(network).address;

  const reader = readerFor(network);
  await assertChain(reader);
  const [balance, nonce, gasPrice, deployGas] = await Promise.all([
    reader.getBalance({ address }),
    reader.getTransactionCount({ address }),
    reader.getGasPrice(),
    estimateDeployGas(reader, loadArtifact(), address),
  ]);
  const deployCost = deployGas * gasPrice;
  const commitCost = COMMIT_GAS * gasPrice;
  const commits = balance > deployCost ? (balance - deployCost) / commitCost : 0n;

  console.log(`network   ${network.name} (chain ${reader.chain.id})`);
  console.log(`address   ${address}`);
  console.log(`balance   ${formatNative(balance, reader.chain)}  nonce ${nonce}`);
  console.log(`gas price ${gasPrice} wei`);
  console.log(`deploy    ${deployGas} gas = ${formatNative(deployCost, reader.chain)}`);
  console.log(`commit    ~${COMMIT_GAS} gas = ${formatNative(commitCost, reader.chain)}`);
  console.log(balance > deployCost ? `funded: deploy plus ${commits} commits` : "NOT FUNDED for the deploy");
  if (balance <= deployCost) process.exitCode = 2;
} catch (err) {
  fail(err);
}
