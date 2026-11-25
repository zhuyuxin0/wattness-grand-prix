// An agent's card: the ERC-8004 registration file its agentURI points to, with
// one extra object, `role`, saying what the agent reads and writes, where its
// code is and the scope its output is sealed under. Stored as RFC 8785
// canonical JSON, so the SHA-256 of the stored bytes is also the SHA-256 of
// the parsed card's canonical form.
import { canonicalJson, fileSha256 } from "@gatelock/core";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { isRoleId, ROLE_IDS, role, type RoleId } from "./roles.js";

export const REGISTRATION_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
export const CARD_SCHEMA = "grand-prix.agent-card.v1";

export const PRODUCT = "Wattness Grand Prix";
export const REPO = "https://github.com/zhuyuxin0/wattness-grand-prix";
export const SITE = "https://gp.wattness.tech";

/** Where every role's output ends up: inside each battery's leaf, under one fleet root per day. */
export interface SealScope {
  contract: "GateRecord";
  address: Address;
  chain_ids: number[];
  scope_label: string;
  scope_id: Hex;
  /** The wallet that commits each day's root; the role identities do not commit. */
  committer: Address;
  gate: string;
}

export interface CardService {
  name: string;
  endpoint: string;
}

export interface AgentCard {
  type: typeof REGISTRATION_TYPE;
  name: string;
  description: string;
  image: string;
  services: CardService[];
  x402Support: boolean;
  active: boolean;
  registrations: { agentId: number; agentRegistry: string }[];
  role: {
    schema: typeof CARD_SCHEMA;
    id: RoleId;
    title: string;
    summary: string;
    method: string;
    reads: string[];
    writes: string[];
    code: { repo: string; paths: string[] };
    takes_from: RoleId[];
    hands_to: RoleId[];
    wallet: Address;
    seals_under: SealScope;
    runs: string;
  };
}

export interface CardContext {
  agentId: number;
  chainId: number;
  registry: Address;
  /** The role's wallet, which owns the identity. */
  wallet: Address;
  seal: SealScope;
}

export const RUNS =
  "Deterministic code, no language model. All six roles run in one process before each day-ahead gate; " +
  "a handoff made between two agents is an ERC-8183 job on BSC testnet.";

export function agentRegistryId(chainId: number, registry: Address): string {
  return `eip155:${chainId}:${getAddress(registry)}`;
}

export function buildCard(id: RoleId, ctx: CardContext): AgentCard {
  const r = role(id);
  if (!Number.isSafeInteger(ctx.agentId) || ctx.agentId <= 0) throw new Error(`agent id must be a positive integer, got ${ctx.agentId}`);
  return {
    type: REGISTRATION_TYPE,
    name: `${PRODUCT} ${r.title}`,
    description:
      `${r.summary} One of six roles in the ${PRODUCT} day plan for every real ERCOT battery, ` +
      "sealed on BNB Chain before ERCOT's 10:00 CT day-ahead gate.",
    image: "",
    services: [{ name: "web", endpoint: SITE }],
    x402Support: false,
    active: true,
    registrations: [{ agentId: ctx.agentId, agentRegistry: agentRegistryId(ctx.chainId, ctx.registry) }],
    role: {
      schema: CARD_SCHEMA,
      id: r.id,
      title: r.title,
      summary: r.summary,
      method: r.method,
      reads: [...r.reads],
      writes: [...r.writes],
      code: { repo: REPO, paths: [...r.code] },
      takes_from: [...r.takesFrom],
      hands_to: [...r.handsTo],
      wallet: getAddress(ctx.wallet),
      seals_under: { ...ctx.seal, address: getAddress(ctx.seal.address), committer: getAddress(ctx.seal.committer) },
      runs: RUNS,
    },
  };
}

/** The bytes stored for a card: its RFC 8785 canonical JSON. */
export function cardBytes(card: AgentCard): Uint8Array {
  return new TextEncoder().encode(canonicalJson(card));
}

export function cardSha256(card: AgentCard): string {
  return fileSha256(cardBytes(card));
}

export interface CardExpectation {
  agentId?: number;
  role?: RoleId;
  wallet?: Address;
  chainId?: number;
  registry?: Address;
}

const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every(str);

/** Problems with a parsed card, empty when it is well formed and matches what the chain says. */
export function cardErrors(doc: unknown, expect: CardExpectation = {}): string[] {
  const out: string[] = [];
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return ["card is not a JSON object"];
  const c = doc as Partial<AgentCard>;
  if (c.type !== REGISTRATION_TYPE) out.push(`type is ${JSON.stringify(c.type)}, expected ${REGISTRATION_TYPE}`);
  if (!str(c.name)) out.push("name is missing");
  if (!str(c.description)) out.push("description is missing");
  if (!Array.isArray(c.services) || c.services.some((s) => !str(s?.name) || !str(s?.endpoint))) out.push("services is malformed");
  const regs = Array.isArray(c.registrations) ? c.registrations : [];
  if (regs.length === 0) out.push("registrations is empty");
  if (expect.agentId !== undefined) {
    const wanted = expect.chainId !== undefined && expect.registry ? agentRegistryId(expect.chainId, expect.registry) : null;
    const hit = regs.some((g) => g?.agentId === expect.agentId && (wanted === null || g?.agentRegistry === wanted));
    if (!hit) out.push(`registrations does not name agent ${expect.agentId}${wanted ? ` on ${wanted}` : ""}`);
  }
  const r = c.role;
  if (!r || typeof r !== "object") return [...out, "role is missing"];
  if (r.schema !== CARD_SCHEMA) out.push(`role.schema is ${JSON.stringify(r.schema)}, expected ${CARD_SCHEMA}`);
  if (!str(r.id) || !isRoleId(r.id)) out.push(`role.id ${JSON.stringify(r.id)} is not one of ${ROLE_IDS.join(", ")}`);
  else if (expect.role && r.id !== expect.role) out.push(`role.id is ${r.id}, expected ${expect.role}`);
  for (const k of ["title", "summary", "method", "runs"] as const) if (!str(r[k])) out.push(`role.${k} is missing`);
  if (!strs(r.reads)) out.push("role.reads is malformed");
  if (!strs(r.writes) || r.writes.length === 0) out.push("role.writes is malformed");
  if (!r.code || !str(r.code.repo) || !strs(r.code.paths) || r.code.paths.length === 0) out.push("role.code is malformed");
  if (!strs(r.takes_from) || !r.takes_from.every(isRoleId)) out.push("role.takes_from is malformed");
  if (!strs(r.hands_to) || !r.hands_to.every(isRoleId)) out.push("role.hands_to is malformed");
  if (!str(r.wallet) || !isAddress(r.wallet)) out.push("role.wallet is not an address");
  else if (expect.wallet && getAddress(r.wallet) !== getAddress(expect.wallet)) out.push(`role.wallet is ${r.wallet}, expected ${expect.wallet}`);
  const s = r.seals_under;
  if (!s || s.contract !== "GateRecord" || !isAddress(s.address) || !isAddress(s.committer) || !str(s.scope_label) || !/^0x[0-9a-f]{64}$/.test(s.scope_id ?? "")) {
    out.push("role.seals_under is malformed");
  }
  return out;
}
