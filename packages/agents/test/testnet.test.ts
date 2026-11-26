// Replays what BSC testnet and Greenfield testnet answered for the forecaster
// (agent 2925) and job 1872 after it completed, so the read client is checked
// against the deployed contracts' real encodings without a network.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { checkDeliverable, readCard, readIdentity, readJob, readJobs, type AgentsDeployment, type EthCall } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const recorded = JSON.parse(readFileSync(join(HERE, "fixtures", "bsc-testnet-job-1872.json"), "utf8")) as {
  answers: Record<string, Hex>;
  card: { url: string; text: string; sha256: string };
};
const deployment = JSON.parse(readFileSync(join(REPO, "contracts", "deployments", "agents.bsc-testnet.json"), "utf8")) as AgentsDeployment;
const scenarios = readFileSync(join(REPO, "fixtures", "od-20261126", "leaves", "DSWL_ESS_ESR1.scenarios.json"), "utf8");

const replay: EthCall = async (to: Address, data: Hex) => {
  const hit = recorded.answers[`${to.toLowerCase()}:${data}`];
  if (!hit) throw new Error(`not recorded: ${to} ${data.slice(0, 10)}`);
  return hit;
};
const served = (async () => new Response(recorded.card.text)) as unknown as typeof fetch;
const forecaster = deployment.agents.find((a) => a.role === "forecaster")!;
const job = deployment.jobs.find((j) => j.jobId === 1872)!;

describe("the forecaster on BSC testnet", () => {
  it("is agent 2925, owned by its own wallet, tagged with its role and pointing at its card", async () => {
    const id = await readIdentity(replay, 2925, deployment.registry);
    expect(id.owner).toBe(getAddress(forecaster.owner));
    expect(id.agentWallet).toBe(getAddress(forecaster.owner));
    expect(id.uri).toBe(forecaster.uri);
    expect(id.role).toBe("forecaster");
    expect(id.builtWith).toBe("https://github.com/bnb-chain/bnbagent-sdk#v0.6.1");
  });

  it("has a card whose stored bytes hash to the record's SHA-256", async () => {
    const card = await readCard(forecaster.uri!, { agentId: 2925, role: "forecaster", wallet: forecaster.owner, chainId: 97, registry: deployment.registry }, served);
    expect(card.errors).toEqual([]);
    expect(card.canonical).toBe(true);
    expect(card.sha256).toBe(forecaster.cardSha256);
    expect(card.card?.registrations[0]?.agentId).toBe(2925);
  });
});

describe("job 1872", () => {
  it("was completed: the planner paid the forecaster for Desert Willow's sealed 26 Nov scenarios", async () => {
    const got = await readJob(replay, 1872, deployment.erc8183);
    expect(got.status).toBe("Completed");
    expect(got.client).toBe(getAddress(job.client.address));
    expect(got.provider).toBe(getAddress(job.provider.address));
    expect(got.evaluator).toBe(getAddress(deployment.erc8183.router));
    expect(got.budget).toBe(BigInt(job.budget));
    expect(got.request).toMatchObject({ task: "price-scenarios", resource: "DSWL_ESS_ESR1", operating_day: "2026-11-26", timing: "sealed" });
    expect(got.deliverable).toBe(job.deliverable);
  });

  it("agrees with the deployment record", async () => {
    const [view] = await readJobs(replay, { ...deployment, jobs: [job] });
    expect(view?.checks).toEqual({ parties: true, deliverable: true, status: true });
  });

  it("delivered exactly the scenarios the sealed leaf commits", async () => {
    const got = await readJob(replay, 1872, deployment.erc8183);
    const leaf = JSON.parse(readFileSync(join(REPO, "fixtures", "od-20261126", "leaves", "DSWL_ESS_ESR1.json"), "utf8")) as { scenarios: { digest_sha256: string } };
    expect(got.deliverable).toBe(`0x${leaf.scenarios.digest_sha256}`);
    expect(checkDeliverable(got, scenarios).matches).toBe(true);
  });
});
