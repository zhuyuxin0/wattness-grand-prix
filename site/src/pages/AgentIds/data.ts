import { useCallback, useEffect, useState } from "react";
import { getAddress, hexToString, parseAbi, sha256, type Address, type Hex } from "viem";
import { fetchJson, useLoad } from "../../data";
import { openRead, TESTNET } from "./rpc";

/** public/data/agents.json, written by scripts/data/agents.mjs. */
export interface Tx {
  hash: Hex;
  blockNumber: number;
  blockTime: number;
  from: string;
  to: string;
}

export interface Agent {
  agentId: number;
  role: string;
  title: string;
  wallet: Address;
  /** The six roles: the card on BNB Greenfield. The evaluator: its hosted agent card. */
  card: string;
  cardSha256?: string;
  cardStore?: string;
  priceUsd?: number | null;
  runs: { where: "planner"; record: string } | { where: "hosted"; record: string; backend: string; since: number; until: number };
  registered: Tx;
  uriSet: Tx;
}

export interface Party {
  address: string;
  agentId: number | null;
  role: string | null;
  title: string | null;
}

export interface Job {
  jobId: number;
  task: "price-scenarios" | "evaluation";
  served: "planner" | "local" | "hosted";
  client: Party;
  provider: Party;
  token: Address;
  amountWei: string;
  deliverable: Hex;
  fingerprint: "sha256" | "keccak256";
  deliverableUrl: string | null;
  resource: string;
  operatingDay: string;
  timing: string;
  status: string;
  transactions: (Tx & { step: string })[];
}

export interface AgentsFile {
  schema: "grand-prix.agents-tab.v1";
  chainId: number;
  network: string;
  explorer: string;
  registry: Address;
  erc8183: { commerce: Address; router: Address; policy: Address; paymentToken: Address };
  paymentToken: { address: Address; symbol: string; decimals: number };
  cards: { store: string; bucket: string; baseUrl: string };
  seal: { contract: string; address: Address; chainIds: number[]; scopeLabel: string; committer: Address };
  agents: Agent[];
  jobs: Job[];
}

export const useAgents = () => useLoad(() => fetchJson<AgentsFile>("agents.json"), "agents-tab");

// ---------------------------------------------------------------- live reads

const REGISTRY_ABI = parseAbi([
  "function ownerOf(uint256 agentId) view returns (address)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "function tokenURI(uint256 agentId) view returns (string)",
  "function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)",
]);
const JOB = "(uint256 id, address client, address provider, address evaluator, string description, uint256 budget, uint256 expiredAt, uint8 status, address hook, uint256 submittedAt, bytes32 deliverable)";
const COMMERCE_ABI = parseAbi([`function getJob(uint256 jobId) view returns (${JOB})`]);
/** ERC-8183 job states, by their on-chain index. */
const JOB_STATUS = ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired"] as const;

export interface IdentityRead {
  owner: Address;
  wallet: Address;
  uri: string;
  role: string | null;
  /** The record and the chain agree on the owner, the wallet, the card's address and the role. */
  matches: { owner: boolean; wallet: boolean; uri: boolean; role: boolean };
  /** For a data: URI, the registration file it holds. */
  registration: { name?: string; services?: { name?: string; endpoint?: string; version?: string }[] } | null;
}

export interface JobRead {
  client: Address;
  provider: Address;
  budget: bigint;
  status: string;
  submittedAt: number;
  deliverable: Hex;
  description: string;
  matches: { parties: boolean; amount: boolean; deliverable: boolean; status: boolean };
}

export interface ChainState {
  rpc: string;
  block: number;
  blockTime: number;
  identities: Record<number, IdentityRead | { error: string }>;
  jobs: Record<number, JobRead | { error: string }>;
}

export type LiveState = { status: "loading" } | { status: "ready"; read: ChainState } | { status: "error"; error: string };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function registrationOf(uri: string): IdentityRead["registration"] {
  const m = /^data:application\/json;base64,(.+)$/.exec(uri);
  if (!m) return null;
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0)))) as IdentityRead["registration"];
  } catch {
    return null;
  }
}

async function readChain(f: AgentsFile): Promise<ChainState> {
  const chain = await openRead(TESTNET.rpcs, f.chainId);
  const identities: ChainState["identities"] = {};
  const jobs: ChainState["jobs"] = {};
  await Promise.all([
    ...f.agents.map(async (a) => {
      try {
        const id = BigInt(a.agentId);
        const [owner, wallet, uri, role] = await Promise.all([
          chain.call<Address>(f.registry, REGISTRY_ABI, "ownerOf", [id]),
          chain.call<Address>(f.registry, REGISTRY_ABI, "getAgentWallet", [id]),
          chain.call<string>(f.registry, REGISTRY_ABI, "tokenURI", [id]),
          chain.call<Hex>(f.registry, REGISTRY_ABI, "getMetadata", [id, "role"]),
        ]);
        const roleTag = role === "0x" ? null : hexToString(role);
        const registration = registrationOf(uri);
        const uriMatches = a.runs.where === "hosted" ? (registration?.services ?? []).some((s) => s.endpoint === a.card) : uri === a.card;
        identities[a.agentId] = {
          owner: getAddress(owner),
          wallet: getAddress(wallet),
          uri,
          role: roleTag,
          registration,
          matches: { owner: same(owner, a.wallet), wallet: same(wallet, a.wallet), uri: uriMatches, role: a.runs.where === "hosted" ? true : roleTag === a.role },
        };
      } catch (e) {
        identities[a.agentId] = { error: (e as Error).message };
      }
    }),
    ...f.jobs.map(async (j) => {
      try {
        const r = await chain.call<{ id: bigint; client: Address; provider: Address; description: string; budget: bigint; status: number; submittedAt: bigint; deliverable: Hex }>(
          f.erc8183.commerce,
          COMMERCE_ABI,
          "getJob",
          [BigInt(j.jobId)],
        );
        if (r.id !== BigInt(j.jobId)) throw new Error(`job ${j.jobId} does not exist`);
        const status = JOB_STATUS[r.status] ?? `state ${r.status}`;
        jobs[j.jobId] = {
          client: getAddress(r.client),
          provider: getAddress(r.provider),
          budget: r.budget,
          status,
          submittedAt: Number(r.submittedAt),
          deliverable: r.deliverable,
          description: r.description,
          matches: {
            parties: same(r.client, j.client.address) && same(r.provider, j.provider.address),
            amount: r.budget === BigInt(j.amountWei),
            deliverable: same(r.deliverable, j.deliverable),
            status: status === j.status,
          },
        };
      } catch (e) {
        jobs[j.jobId] = { error: (e as Error).message };
      }
    }),
  ]);
  return { rpc: chain.rpc, block: chain.block, blockTime: chain.blockTime, identities, jobs };
}

/**
 * The registry and the jobs read live. A read again keeps the last good read on
 * screen while it runs (busy) and if it fails (failed), as the site's LiveRead
 * stamps every live read.
 */
export function useChain(f: AgentsFile): { state: LiveState; busy: boolean; failed: boolean; again: () => void } {
  const [n, setN] = useState(0);
  const [state, setState] = useState<LiveState>({ status: "loading" });
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setBusy(true);
    readChain(f).then(
      (read) => {
        if (!live) return;
        setState({ status: "ready", read });
        setFailed(false);
        setBusy(false);
      },
      (e: unknown) => {
        if (!live) return;
        const error = e instanceof Error ? e.message : String(e);
        setState((s) => (s.status === "ready" ? s : { status: "error", error }));
        setFailed(true);
        setBusy(false);
      },
    );
    return () => {
      live = false;
    };
    // f is the published file's, fixed for the page's life.
  }, [n]);
  return { state, busy, failed, again: useCallback(() => setN((x) => x + 1), []) };
}

export interface CardRead {
  sha256: string;
  matches: boolean;
  title: string | null;
  runs: string | null;
  name: string | null;
}

/** A role's card from BNB Greenfield, hashed here and held to the record's SHA-256. */
export function useCards(agents: Agent[]): Record<number, CardRead | { error: string } | undefined> {
  const [cards, setCards] = useState<Record<number, CardRead | { error: string } | undefined>>({});
  useEffect(() => {
    let live = true;
    for (const a of agents) {
      if (a.runs.where !== "planner" || !a.cardSha256) continue;
      fetch(a.card, { signal: AbortSignal.timeout(15_000) })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const bytes = new Uint8Array(await res.arrayBuffer());
          const digest = sha256(bytes).slice(2);
          let doc: { name?: string; role?: { title?: string; runs?: string } } = {};
          try {
            doc = JSON.parse(new TextDecoder().decode(bytes)) as typeof doc;
          } catch {
            doc = {};
          }
          return { sha256: digest, matches: digest === a.cardSha256, title: doc.role?.title ?? null, runs: doc.role?.runs ?? null, name: doc.name ?? null } satisfies CardRead;
        })
        .then(
          (c) => live && setCards((m) => ({ ...m, [a.agentId]: c })),
          (e: unknown) => live && setCards((m) => ({ ...m, [a.agentId]: { error: e instanceof Error ? e.message : String(e) } })),
        );
    }
    return () => {
      live = false;
    };
  }, [agents]);
  return cards;
}

export interface HostedCard {
  name: string | null;
  url: string | null;
  protocolVersion: string | null;
  skills: string[];
}

/** The evaluator's public agent card, while its hosting runs. */
export function useHostedCard(url: string, hosted: boolean): HostedCard | { error: string } | null {
  const [card, setCard] = useState<HostedCard | { error: string } | null>(null);
  useEffect(() => {
    if (!hosted) return;
    let live = true;
    fetch(url, { signal: AbortSignal.timeout(15_000) })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const doc = (await res.json()) as { name?: string; url?: string; protocolVersion?: string; skills?: { id?: string; name?: string }[] };
        return { name: doc.name ?? null, url: doc.url ?? null, protocolVersion: doc.protocolVersion ?? null, skills: (doc.skills ?? []).map((s) => s.id ?? s.name ?? "").filter(Boolean) } satisfies HostedCard;
      })
      .then(
        (c) => live && setCard(c),
        (e: unknown) => live && setCard({ error: e instanceof Error ? e.message : String(e) }),
      );
    return () => {
      live = false;
    };
  }, [url, hosted]);
  return card;
}
