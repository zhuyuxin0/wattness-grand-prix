// Verifies the deployment in deployments/<network>.json on Sourcify.
import { parseArgs } from "node:util";
import { contractsPath, loadArtifact, loadBuildInfo } from "./lib/artifact.ts";
import { fail, NETWORK_OPTIONS, networkFrom } from "./lib/args.ts";
import { readDeployment } from "./lib/deploy.ts";
import { SOURCIFY_API, verifyOnSourcify, verifyRequest } from "./lib/sourcify.ts";

try {
  const { values } = parseArgs({ options: { ...NETWORK_OPTIONS, api: { type: "string", default: SOURCIFY_API } } });
  const network = networkFrom(values);
  const path = contractsPath(`deployments/${network.name}.json`);
  const deployment = readDeployment(path);
  if (!deployment) throw new Error(`no deployment at ${path}`);

  const artifact = loadArtifact(deployment.contract);
  if (artifact.buildInfoId !== deployment.buildInfoId) {
    throw new Error(`artifact build ${artifact.buildInfoId} is not the deployed build ${deployment.buildInfoId}`);
  }
  const request = verifyRequest(artifact, loadBuildInfo(deployment.buildInfoId), deployment.txHash);
  const result = await verifyOnSourcify(deployment.chainId, deployment.address, request, {
    api: values.api,
  });
  const note = result.alreadyVerified ? " (already verified)" : "";
  console.log(`${deployment.address} on chain ${deployment.chainId}: ${result.match}${note}`);
  console.log(`https://repo.sourcify.dev/${deployment.chainId}/${deployment.address}`);
} catch (err) {
  fail(err);
}
