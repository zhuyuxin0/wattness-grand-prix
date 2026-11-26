// Read-only client for the Agents tabs: each agent's identity on the ERC-8004
// registry, its card, and the ERC-8183 jobs between agents. eth_call and
// fetch only, no Node APIs, so a page can run it in the browser.
import { canonicalJson } from "@gatelock/core";
import { decodeFunctionResult, encodeFunctionData, getAddress, hexToString, sha256, type Abi, type Address, type Hex } from "viem";
import { BSC_TESTNET, commerceAbi, identityRegistryAbi, JOB_STATUS, policyAbi, routerAbi, type JobStatus } from "./abi.js";
import { cardErrors, type AgentCard, type CardExpectation } from "./card.js";
import type { AgentsDeployment } from "./deployment.js";
import { parseJobRequest, scenariosDeliverable, type ScenariosJobRequest } from "./job.js";
import type { RoleId } from "./roles.js";

/** One eth_call at the latest block. */
export type EthCall = (to: Address, data: Hex) => Promise<Hex>;

export class RpcError extends Error {
  override name = "RpcError";
}

/** eth_call over JSON-RPC, trying each endpoint in turn until one answers. */
export function jsonRpcCaller(urls: readonly string[], fetchImpl: typeof fetch = globalThis.fetch, timeoutMs = 15_000): EthCall {
  if (urls.length === 0) throw new RpcError("no RPC endpoints");
  return async (to, data) => {
    const errors: string[] = [];
    for (const url of urls) {
      try {
        const res = await fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) throw new RpcError(`HTTP ${res.status}`);
        const body = (await res.json()) as { result?: Hex; error?: { message?: string; data?: Hex } };
        // A revert is an answer, not an outage: report it rather than trying the next endpoint.
        if (body.error) throw Object.assign(new RpcError(body.error.message ?? "eth_call failed"), { revert: true, data: body.error.data });
        if (typeof body.result !== "string") throw new RpcError("no result");
        return body.result;
      } catch (e) {
        if ((e as { revert?: boolean }).revert) throw e;
        errors.push(`${new URL(url).host}: ${(e as Error).message}`);
      }
    }
    throw new RpcError(`every RPC endpoint failed (${errors.join("; ")})`);
  };
}

export const TESTNET_RPCS = ["https://bsc-testnet-dataseed.bnbchain.org", "https://bsc-testnet.bnbchain.org", "https://bsc-testnet-rpc.publicnode.com"] as const;

type EncodeArgs = Parameters<typeof encodeFunctionData>[0];
type DecodeArgs = Parameters<typeof decodeFunctionResult>[0];

async function callFn(call: EthCall, to: Address, abi: Abi, functionName: string, args: readonly unknown[]): Promise<unknown> {
  const data = encodeFunctionData({ abi, functionName, args } as unknown as EncodeArgs);
  const raw = await call(to, data);
  return decodeFunctionResult({ abi, functionName, data: raw } as unknown as DecodeArgs);
}

export interface AgentIdentity {
  agentId: number;
  owner: Address;
  /** The address the registry lists as the agent's wallet (the owner unless changed). */
  agentWallet: Address;
  uri: string;
  /** The `role` metadata set at registration, if any. */
  role: string | null;
  builtWith: string | null;
}

async function metadata(call: EthCall, registry: Address, agentId: bigint, key: string): Promise<string | null> {
  const raw = (await callFn(call, registry, identityRegistryAbi, "getMetadata", [agentId, key])) as Hex;
  return raw === "0x" ? null : hexToString(raw);
}

export async function readIdentity(call: EthCall, agentId: number, registry: Address = BSC_TESTNET.registry): Promise<AgentIdentity> {
  const id = BigInt(agentId);
  const [owner, agentWallet, uri, roleTag, builtWith] = await Promise.all([
    callFn(call, registry, identityRegistryAbi, "ownerOf", [id]) as Promise<Address>,
    callFn(call, registry, identityRegistryAbi, "getAgentWallet", [id]) as Promise<Address>,
    callFn(call, registry, identityRegistryAbi, "tokenURI", [id]) as Promise<string>,
    metadata(call, registry, id, "role"),
    metadata(call, registry, id, "built_with"),
  ]);
  return { agentId, owner: getAddress(owner), agentWallet: getAddress(agentWallet), uri, role: roleTag, builtWith };
}

export interface CardRead {
  url: string;
  bytes: number;
  /** SHA-256 of the bytes served, lowercase hex without 0x. */
  sha256: string;
  /** The bytes are the parsed card's RFC 8785 canonical form. */
  canonical: boolean;
  card: AgentCard | null;
  errors: string[];
}

export async function readCard(url: string, expect: CardExpectation = {}, fetchImpl: typeof fetch = globalThis.fetch): Promise<CardRead> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new RpcError(`card ${url}: HTTP ${res.status}`);
  const body = new Uint8Array(await res.arrayBuffer());
  const digest = sha256(body).slice(2);
  let doc: unknown;
  try {
    doc = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return { url, bytes: body.length, sha256: digest, canonical: false, card: null, errors: ["card is not JSON"] };
  }
  const errors = cardErrors(doc, expect);
  let canonical = false;
  try {
    canonical = canonicalJson(doc) === new TextDecoder().decode(body);
  } catch {
    canonical = false;
  }
  return { url, bytes: body.length, sha256: digest, canonical, card: errors.length === 0 ? (doc as AgentCard) : null, errors };
}

export interface JobRead {
  jobId: number;
  client: Address;
  provider: Address;
  evaluator: Address;
  hook: Address;
  description: string;
  /** The request, when the description is one of ours. */
  request: ScenariosJobRequest | null;
  budget: bigint;
  expiredAt: number;
  status: JobStatus;
  submittedAt: number;
  deliverable: Hex;
  /** The router's policy for the job while it is in flight; zero once settled. */
  policy: Address;
  disputeWindow: number;
  /** The earliest time settle can pass, once submitted. */
  settleAfter: number | null;
}

type JobTuple = {
  id: bigint;
  client: Address;
  provider: Address;
  evaluator: Address;
  description: string;
  budget: bigint;
  expiredAt: bigint;
  status: number;
  hook: Address;
  submittedAt: bigint;
  deliverable: Hex;
};

export async function readJob(
  call: EthCall,
  jobId: number,
  addrs: { commerce: Address; router: Address; policy: Address } = BSC_TESTNET,
): Promise<JobRead> {
  const id = BigInt(jobId);
  const [job, policy, window] = await Promise.all([
    callFn(call, addrs.commerce, commerceAbi, "getJob", [id]) as Promise<JobTuple>,
    callFn(call, addrs.router, routerAbi, "jobPolicy", [id]) as Promise<Address>,
    callFn(call, addrs.policy, policyAbi, "disputeWindow", []) as Promise<bigint>,
  ]);
  if (job.id !== id) throw new RpcError(`job ${jobId} does not exist`);
  const status = JOB_STATUS[job.status];
  if (!status) throw new RpcError(`job ${jobId} has unknown status ${job.status}`);
  const submittedAt = Number(job.submittedAt);
  return {
    jobId,
    client: getAddress(job.client),
    provider: getAddress(job.provider),
    evaluator: getAddress(job.evaluator),
    hook: getAddress(job.hook),
    description: job.description,
    request: parseJobRequest(job.description),
    budget: job.budget,
    expiredAt: Number(job.expiredAt),
    status,
    submittedAt,
    deliverable: job.deliverable,
    policy: getAddress(policy),
    disputeWindow: Number(window),
    settleAfter: submittedAt > 0 ? submittedAt + Number(window) : null,
  };
}

/** Whether a scenarios file is what the job delivered: its canonical SHA-256 against the on-chain deliverable. */
export function checkDeliverable(job: Pick<JobRead, "deliverable">, scenariosText: string): { digest: Hex; matches: boolean } {
  const digest = scenariosDeliverable(JSON.parse(scenariosText));
  return { digest, matches: digest.toLowerCase() === job.deliverable.toLowerCase() };
}

export interface AgentView {
  role: RoleId;
  identity: AgentIdentity | null;
  card: CardRead | null;
  /** Each holds when the chain, the card and the deployment record agree. */
  checks: { owner: boolean; uri: boolean; roleTag: boolean; card: boolean; cardSha256: boolean };
  error: string | null;
}

/** Every agent in a deployment record, read back from the chain and the card store. */
export async function readAgents(call: EthCall, d: AgentsDeployment, fetchImpl: typeof fetch = globalThis.fetch): Promise<AgentView[]> {
  return Promise.all(
    d.agents.map(async (a): Promise<AgentView> => {
      const none = { owner: false, uri: false, roleTag: false, card: false, cardSha256: false };
      if (a.agentId === null) return { role: a.role, identity: null, card: null, checks: none, error: "not registered" };
      try {
        const identity = await readIdentity(call, a.agentId, d.registry);
        const card = identity.uri
          ? await readCard(identity.uri, { agentId: a.agentId, role: a.role, wallet: a.owner, chainId: d.chainId, registry: d.registry }, fetchImpl)
          : null;
        return {
          role: a.role,
          identity,
          card,
          checks: {
            owner: identity.owner === getAddress(a.owner),
            uri: a.uri !== null && identity.uri === a.uri,
            roleTag: identity.role === a.role,
            card: card !== null && card.errors.length === 0,
            cardSha256: card !== null && a.cardSha256 !== null && card.sha256 === a.cardSha256,
          },
          error: null,
        };
      } catch (e) {
        return { role: a.role, identity: null, card: null, checks: none, error: (e as Error).message };
      }
    }),
  );
}

export interface JobView {
  jobId: number;
  job: JobRead | null;
  /** The chain agrees with the deployment record on the parties, the deliverable and the status. */
  checks: { parties: boolean; deliverable: boolean; status: boolean };
  error: string | null;
}

/** Every job in a deployment record, read back from the chain. */
export async function readJobs(call: EthCall, d: AgentsDeployment): Promise<JobView[]> {
  return Promise.all(
    d.jobs.map(async (r): Promise<JobView> => {
      try {
        const job = await readJob(call, r.jobId, d.erc8183);
        return {
          jobId: r.jobId,
          job,
          checks: {
            parties: job.client === getAddress(r.client.address) && job.provider === getAddress(r.provider.address),
            deliverable: r.deliverable !== null && job.deliverable.toLowerCase() === r.deliverable.toLowerCase(),
            status: job.status === r.status,
          },
          error: null,
        };
      } catch (e) {
        return { jobId: r.jobId, job: null, checks: { parties: false, deliverable: false, status: false }, error: (e as Error).message };
      }
    }),
  );
}
