// The parts of the BSC testnet contracts the agents use: the ERC-8004 identity
// registry, and ERC-8183's commerce kernel with the router (the job's evaluator
// and hook) and the optimistic policy behind it. Signatures follow the
// deployed contracts as the BNB agent SDK 0.6.1 calls them.
import { parseAbi, type Address } from "viem";

export const BSC_TESTNET = {
  chainId: 97,
  /** ERC-8004 identity registry (AgentIdentity, version 2.0.0). */
  registry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  /** ERC-8183 commerce kernel (proxy). */
  commerce: "0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE",
  /** Evaluator router: every job's evaluator and hook. */
  router: "0xD7d36D66d2F1B608A0F943f722D27e3744f66F25",
  /** Optimistic policy: a submission completes after its dispute window unless disputed. */
  policy: "0xd6a4217588F6B1F5657a92A3e94E6422aD771cEA",
  /** The commerce kernel's payment token, U (18 decimals). */
  paymentToken: "0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565",
  /** GateRecord, where each day's fleet root is sealed. */
  gateRecord: "0x2922c68cE15EB3e83B7f43b136e981dDc4262876",
} as const satisfies Record<string, Address | number>;

export const identityRegistryAbi = parseAbi([
  "struct MetadataEntry { string metadataKey; bytes metadataValue; }",
  "function register() returns (uint256 agentId)",
  "function register(string agentURI) returns (uint256 agentId)",
  "function register(string agentURI, MetadataEntry[] metadata) returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newURI)",
  "function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue)",
  "function tokenURI(uint256 agentId) view returns (string)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)",
  "function balanceOf(address owner) view returns (uint256)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  "event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)",
  "event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "error ERC721NonexistentToken(uint256 tokenId)",
]);

const JOB = "(uint256 id, address client, address provider, address evaluator, string description, uint256 budget, uint256 expiredAt, uint8 status, address hook, uint256 submittedAt, bytes32 deliverable)";

export const commerceAbi = parseAbi([
  "function createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256 jobId)",
  "function setBudget(uint256 jobId, uint256 amount, bytes optParams)",
  "function fund(uint256 jobId, uint256 expectedBudget, bytes optParams)",
  "function submit(uint256 jobId, bytes32 deliverable, bytes optParams)",
  "function claimRefund(uint256 jobId)",
  `function getJob(uint256 jobId) view returns (${JOB})`,
  "function jobCounter() view returns (uint256)",
  "function paymentToken() view returns (address)",
  "function jobPaymentToken(uint256 jobId) view returns (address)",
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
  "event BudgetSet(uint256 indexed jobId, uint256 amount)",
  "event JobFunded(uint256 indexed jobId, address indexed client, address indexed provider, uint256 amount)",
  "event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)",
  "event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason)",
  "event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount)",
]);

export const routerAbi = parseAbi([
  "function registerJob(uint256 jobId, address policy)",
  "function settle(uint256 jobId, bytes evidence)",
  "function jobPolicy(uint256 jobId) view returns (address)",
  "function policyWhitelist(address policy) view returns (bool)",
  "event JobRegistered(uint256 indexed jobId, address indexed policy, address indexed client)",
  "event JobSettled(uint256 indexed jobId, address indexed policy, uint8 indexed verdict, bytes32 reason)",
]);

export const policyAbi = parseAbi([
  "function disputeWindow() view returns (uint64)",
  "function submittedAt(uint256 jobId) view returns (uint64)",
  "function disputed(uint256 jobId) view returns (bool)",
  "function check(uint256 jobId, bytes evidence) view returns (uint8 verdict, bytes32 reason)",
  "event JobInitialised(uint256 indexed jobId, bytes32 deliverable, uint64 submittedAt, bytes optParams)",
]);

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
]);

/** ERC-8183 job states, by their on-chain index. */
export const JOB_STATUS = ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired"] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

/** The optimistic policy's verdicts. */
export const VERDICT = ["Pending", "Approve", "Reject"] as const;
export type Verdict = (typeof VERDICT)[number];
