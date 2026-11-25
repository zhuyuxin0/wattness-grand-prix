// Deploys GateRecord and writes deployments/<network>.json.
// --dry-run estimates the deploy without signing anything.
import { parseArgs } from "node:util";
import { loadAccount } from "./lib/account.ts";
import { contractsPath, loadArtifact, loadBuildInfo } from "./lib/artifact.ts";
import { fail, NETWORK_OPTIONS, networkFrom } from "./lib/args.ts";
import { assertChain, formatNative, formatStamp, readerFor, signerFor } from "./lib/clients.ts";
import { deployContract, estimateDeployGas, readDeployment, writeDeployment } from "./lib/deploy.ts";

try {
  const { values } = parseArgs({
    options: {
      ...NETWORK_OPTIONS,
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
    },
  });
  const network = networkFrom(values);
  const outPath = contractsPath(`deployments/${network.name}.json`);
  const reader = readerFor(network);
  await assertChain(reader);

  const previous = readDeployment(outPath);
  if (previous && !values.force) {
    const code = await reader.getCode({ address: previous.address });
    if (code && code !== "0x") {
      throw new Error(`already deployed at ${previous.address} (${outPath}); pass --force to deploy again`);
    }
  }

  const artifact = loadArtifact();
  const compiler = loadBuildInfo(artifact.buildInfoId).solcLongVersion;
  const account = loadAccount(network);
  const [gas, gasPrice, balance] = await Promise.all([
    estimateDeployGas(reader, artifact, account.address),
    reader.getGasPrice(),
    reader.getBalance({ address: account.address }),
  ]);
  console.log(`deployer  ${account.address} on ${network.name} (chain ${reader.chain.id})`);
  console.log(`estimate  ${gas} gas at ${gasPrice} wei = ${formatNative(gas * gasPrice, reader.chain)}`);
  console.log(`balance   ${formatNative(balance, reader.chain)}`);
  if (values["dry-run"]) process.exit(0);
  if (balance < gas * gasPrice) throw new Error("balance does not cover the deploy");

  const deployment = await deployContract(reader, signerFor(network, account), artifact, network.name, compiler);
  writeDeployment(outPath, deployment);
  console.log(`address   ${deployment.address}`);
  console.log(`tx        ${deployment.txHash}`);
  console.log(`block     ${deployment.blockNumber} at ${formatStamp(deployment.deployedAt)}`);
  console.log(`gas used  ${deployment.gasUsed}`);
  console.log(`wrote     ${outPath}`);
} catch (err) {
  fail(err);
}
