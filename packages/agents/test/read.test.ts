import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scopeId } from "@gatelock/core";
import { decodeFunctionData, encodeFunctionResult, getAddress, stringToHex, type Abi, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import {
  BSC_TESTNET,
  buildCard,
  cardBytes,
  cardSha256,
  checkDeliverable,
  commerceAbi,
  DEPLOYMENT_SCHEMA,
  identityRegistryAbi,
  jobDescription,
  jsonRpcCaller,
  policyAbi,
  readAgents,
  readCard,
  readIdentity,
  readJob,
  routerAbi,
  scenariosDeliverable,
  scenariosJobRequest,
  type AgentsDeployment,
  type EthCall,
} from "../src/index.js";

const SEALED = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "fixtures", "od-20261126");
const scenariosText = readFileSync(join(SEALED, "leaves", "DSWL_ESS_ESR1.scenarios.json"), "utf8");

const forecasterWallet: Address = getAddress("0x00000000000000000000000000000000000f0ca5");
const plannerWallet: Address = getAddress("0x0000000000000000000000000000000000001a2b");
const CARD_URL = "https://cards.example.invalid/agents/forecaster.json";

type Answer = (args: readonly unknown[]) => unknown;

/** A chain that answers eth_call from per-contract, per-function handlers, encoding results with the real ABI. */
function fakeChain(handlers: Record<string, { abi: Abi; fns: Record<string, Answer> }>): EthCall & { calls: string[] } {
  const calls: string[] = [];
  const call = async (to: Address, data: Hex): Promise<Hex> => {
    const h = handlers[getAddress(to)];
    if (!h) throw new Error(`no contract at ${to}`);
    const { functionName, args } = decodeFunctionData({ abi: h.abi, data });
    calls.push(`${functionName}`);
    const fn = h.fns[functionName];
    if (!fn) throw new Error(`${functionName} not answered`);
    return encodeFunctionResult({ abi: h.abi, functionName, result: fn(args ?? []) } as never);
  };
  return Object.assign(call, { calls });
}

const seal = {
  contract: "GateRecord" as const,
  address: BSC_TESTNET.gateRecord,
  chain_ids: [56, 97],
  scope_label: "gate-record/ercot-da-energy",
  scope_id: scopeId("gate-record/ercot-da-energy"),
  committer: getAddress("0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8"),
  gate: "10:00 Central on the day before the operating day, computed by the contract",
};
const card = buildCard("forecaster", { agentId: 2930, chainId: 97, registry: BSC_TESTNET.registry, wallet: forecasterWallet, seal });

const registry = {
  abi: identityRegistryAbi as Abi,
  fns: {
    ownerOf: () => forecasterWallet,
    getAgentWallet: () => forecasterWallet,
    tokenURI: () => CARD_URL,
    getMetadata: ([, key]: readonly unknown[]) => (key === "role" ? stringToHex("forecaster") : "0x"),
  },
};

const request = scenariosJobRequest({ operatingDay: "2026-11-26", resource: "DSWL_ESS_ESR1", clientId: 2935, providerId: 2930, timing: "sealed" });
const deliverable = scenariosDeliverable(JSON.parse(scenariosText));
const job = {
  id: 1872n,
  client: plannerWallet,
  provider: forecasterWallet,
  evaluator: BSC_TESTNET.router,
  description: jobDescription(request),
  budget: 10n ** 17n,
  expiredAt: 1_795_700_000n,
  status: 3,
  hook: BSC_TESTNET.router,
  submittedAt: 1_795_690_000n,
  deliverable,
};

const chain = () =>
  fakeChain({
    [getAddress(BSC_TESTNET.registry)]: registry,
    [getAddress(BSC_TESTNET.commerce)]: { abi: commerceAbi as Abi, fns: { getJob: () => job } },
    [getAddress(BSC_TESTNET.router)]: { abi: routerAbi as Abi, fns: { jobPolicy: () => "0x0000000000000000000000000000000000000000" } },
    [getAddress(BSC_TESTNET.policy)]: { abi: policyAbi as Abi, fns: { disputeWindow: () => 900n } },
  });

const serve = (body: Uint8Array | string, status = 200) =>
  (async () => new Response(typeof body === "string" ? body : Buffer.from(body), { status })) as unknown as typeof fetch;

describe("readIdentity", () => {
  it("reads owner, wallet, URI and the role tag", async () => {
    const id = await readIdentity(chain(), 2930);
    expect(id).toEqual({ agentId: 2930, owner: forecasterWallet, agentWallet: forecasterWallet, uri: CARD_URL, role: "forecaster", builtWith: null });
  });
});

describe("readCard", () => {
  it("hashes the bytes served and checks the card against the chain", async () => {
    const got = await readCard(CARD_URL, { agentId: 2930, role: "forecaster", wallet: forecasterWallet, chainId: 97, registry: BSC_TESTNET.registry }, serve(cardBytes(card)));
    expect(got.errors).toEqual([]);
    expect(got.sha256).toBe(cardSha256(card));
    expect(got.canonical).toBe(true);
    expect(got.card?.role.id).toBe("forecaster");
  });

  it("reports a card for another agent, and pretty-printed bytes as not canonical", async () => {
    const got = await readCard(CARD_URL, { agentId: 9999 }, serve(JSON.stringify(card, null, 2)));
    expect(got.card).toBeNull();
    expect(got.canonical).toBe(false);
    expect(got.errors[0]).toMatch(/does not name agent 9999/);
  });

  it("throws on a missing card", async () => {
    await expect(readCard(CARD_URL, {}, serve("", 404))).rejects.toThrow(/HTTP 404/);
  });
});

describe("readJob", () => {
  it("decodes the job, its request and when it can settle", async () => {
    const got = await readJob(chain(), 1872);
    expect(got.status).toBe("Completed");
    expect(got.client).toBe(plannerWallet);
    expect(got.provider).toBe(forecasterWallet);
    expect(got.request?.resource).toBe("DSWL_ESS_ESR1");
    expect(got.request?.timing).toBe("sealed");
    expect(got.settleAfter).toBe(1_795_690_900);
    expect(checkDeliverable(got, scenariosText).matches).toBe(true);
  });

  it("finds a changed scenarios file", async () => {
    const got = await readJob(chain(), 1872);
    const m = JSON.parse(scenariosText) as { hub_sum4: number[][] };
    m.hub_sum4[3]![7]! -= 1;
    expect(checkDeliverable(got, JSON.stringify(m)).matches).toBe(false);
  });

  it("refuses a job id the kernel has not issued", async () => {
    const c = fakeChain({
      [getAddress(BSC_TESTNET.commerce)]: { abi: commerceAbi as Abi, fns: { getJob: () => ({ ...job, id: 0n }) } },
      [getAddress(BSC_TESTNET.router)]: { abi: routerAbi as Abi, fns: { jobPolicy: () => "0x0000000000000000000000000000000000000000" } },
      [getAddress(BSC_TESTNET.policy)]: { abi: policyAbi as Abi, fns: { disputeWindow: () => 900n } },
    });
    await expect(readJob(c, 99999)).rejects.toThrow(/does not exist/);
  });
});

describe("readAgents", () => {
  it("checks each agent against its deployment record", async () => {
    const d: AgentsDeployment = {
      schema: DEPLOYMENT_SCHEMA,
      network: "bsc-testnet",
      chainId: 97,
      registry: BSC_TESTNET.registry,
      erc8183: { commerce: BSC_TESTNET.commerce, router: BSC_TESTNET.router, policy: BSC_TESTNET.policy, paymentToken: BSC_TESTNET.paymentToken },
      cards: { store: "test", bucket: "test", baseUrl: "https://cards.example.invalid/agents/" },
      seal: { contract: "GateRecord", address: seal.address, chainIds: [56, 97], scopeLabel: seal.scope_label, scopeId: seal.scope_id, committer: seal.committer },
      agents: [
        { role: "forecaster", agentId: 2930, owner: forecasterWallet, uri: CARD_URL, cardSha256: cardSha256(card), transactions: {} },
        { role: "planner", agentId: null, owner: plannerWallet, uri: null, cardSha256: null, transactions: {} },
      ],
      jobs: [],
    };
    const [f, p] = await readAgents(chain(), d, serve(cardBytes(card)));
    expect(f?.checks).toEqual({ owner: true, uri: true, roleTag: true, card: true, cardSha256: true });
    expect(p?.error).toBe("not registered");
  });
});

describe("jsonRpcCaller", () => {
  it("fails over to the next endpoint and reports a revert at once", async () => {
    const seen: string[] = [];
    const f = (async (url: string) => {
      seen.push(new URL(url).host);
      if (url.includes("down")) return new Response("", { status: 502 });
      if (url.includes("revert")) return Response.json({ jsonrpc: "2.0", id: 1, error: { message: "execution reverted" } });
      return Response.json({ jsonrpc: "2.0", id: 1, result: "0x01" });
    }) as unknown as typeof fetch;
    expect(await jsonRpcCaller(["https://down.invalid", "https://up.invalid"], f)(BSC_TESTNET.registry, "0x")).toBe("0x01");
    await expect(jsonRpcCaller(["https://revert.invalid", "https://up.invalid"], f)(BSC_TESTNET.registry, "0x")).rejects.toThrow(/reverted/);
    expect(seen).toEqual(["down.invalid", "up.invalid", "revert.invalid"]);
  });
});
