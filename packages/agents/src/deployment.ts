// The shape of contracts/deployments/agents.<network>.json: who the six agents
// are on chain, where their cards are stored, and the jobs between them.
import type { Address, Hex } from "viem";
import type { JobStatus } from "./abi.js";
import type { JobTiming } from "./job.js";
import type { RoleId } from "./roles.js";

export const DEPLOYMENT_SCHEMA = "grand-prix.agents.v1";

export interface SentTx {
  hash: Hex;
  blockNumber: number;
  /** Unix seconds of the block. */
  blockTime: number;
  from: Address;
  to: Address;
  /** 0 when MegaFuel sponsored the gas. */
  gasPriceWei: string;
  sponsored: boolean;
}

export interface AgentRecord {
  role: RoleId;
  agentId: number | null;
  owner: Address;
  uri: string | null;
  cardSha256: string | null;
  transactions: { register?: SentTx; setAgentURI?: SentTx; funding?: SentTx };
}

export interface JobStep extends SentTx {
  /** "gas": tBNB from the record wallet for a call the relay would not sponsor; "faucet": test U for the budget. */
  step: "gas" | "faucet" | "createJob" | "registerJob" | "setBudget" | "approve" | "fund" | "submit" | "settle";
}

export interface JobRecord {
  jobId: number;
  task: "price-scenarios";
  operatingDay: string;
  resource: string;
  timing: JobTiming;
  client: { role: RoleId; agentId: number; address: Address };
  provider: { role: RoleId; agentId: number; address: Address };
  token: Address;
  budget: string;
  expiredAt: number;
  /** bytes32 on chain: the scenarios file's canonical SHA-256. */
  deliverable: Hex | null;
  deliverableUrl: string | null;
  status: JobStatus;
  transactions: JobStep[];
}

export interface AgentsDeployment {
  schema: typeof DEPLOYMENT_SCHEMA;
  network: string;
  chainId: number;
  registry: Address;
  erc8183: { commerce: Address; router: Address; policy: Address; paymentToken: Address };
  cards: { store: string; bucket: string; baseUrl: string };
  seal: {
    contract: "GateRecord";
    address: Address;
    chainIds: number[];
    scopeLabel: string;
    scopeId: Hex;
    committer: Address;
  };
  agents: AgentRecord[];
  jobs: JobRecord[];
}
