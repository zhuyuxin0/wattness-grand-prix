import { createPublicClient, fallback, http, zeroAddress, type Address, type Hex, type PublicClient } from "viem";

// Read-only access to GateRecord. Only eth_call and transaction lookups:
// the public BSC testnet RPC refuses eth_getLogs, and nothing here signs.

export const GATE_RECORD_ABI = [
  {
    type: "function",
    name: "get",
    stateMutability: "view",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "root", type: "bytes32" },
          { name: "codeHash", type: "bytes32" },
          { name: "scope", type: "bytes32" },
          { name: "committer", type: "address" },
          { name: "od", type: "uint32" },
          { name: "leafCount", type: "uint32" },
          { name: "committedAt", type: "uint64" },
          { name: "blockNumber", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "outcomeOf",
    stateMutability: "view",
    inputs: [
      { name: "key", type: "bytes32" },
      { name: "stage", type: "uint8" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "hash", type: "bytes32" },
          { name: "linkedAt", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "keyOf",
    stateMutability: "pure",
    inputs: [
      { name: "committer", type: "address" },
      { name: "scope", type: "bytes32" },
      { name: "od", type: "uint32" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "gateTs",
    stateMutability: "pure",
    inputs: [{ name: "od", type: "uint32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "dayEndTs",
    stateMutability: "pure",
    inputs: [{ name: "od", type: "uint32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface NetworkInfo {
  name: string;
  chainId: number;
  rpcUrls: readonly string[];
}

export const NETWORKS: Record<string, NetworkInfo> = {
  "bsc-testnet": {
    name: "bsc-testnet",
    chainId: 97,
    rpcUrls: [
      "https://bsc-testnet-dataseed.bnbchain.org",
      "https://bsc-testnet.bnbchain.org",
      "https://bsc-prebsc-dataseed.bnbchain.org",
    ],
  },
  "bsc-mainnet": {
    name: "bsc-mainnet",
    chainId: 56,
    rpcUrls: [
      "https://bsc-dataseed.bnbchain.org",
      "https://bsc-dataseed1.bnbchain.org",
      "https://bsc-dataseed2.bnbchain.org",
      "https://bsc-dataseed3.bnbchain.org",
      "https://bsc-dataseed4.bnbchain.org",
    ],
  },
  localhost: { name: "localhost", chainId: 31337, rpcUrls: ["http://127.0.0.1:15191"] },
};

export function resolveNetwork(name: string, rpc?: string): NetworkInfo {
  const net = NETWORKS[name === "local" ? "localhost" : name];
  if (!net) throw new Error(`unknown network ${name}; expected local, bsc-testnet or bsc-mainnet`);
  return rpc ? { ...net, rpcUrls: [rpc, ...net.rpcUrls] } : net;
}

export interface OnChainRecord {
  root: Hex;
  codeHash: Hex;
  scope: Hex;
  committer: Address;
  od: number;
  leafCount: number;
  committedAt: number;
  blockNumber: number;
}

export interface OnChainOutcome {
  hash: Hex;
  linkedAt: number;
}

export interface AnchorTx {
  from: Address;
  to: Address | null;
  value: bigint;
  input: Hex;
  success: boolean;
  blockNumber: number;
  blockTimestamp: number;
}

/** What the checks need from a chain; tests substitute a fake. */
export interface ChainReader {
  chainId(): Promise<number>;
  record(contract: Address, key: Hex): Promise<OnChainRecord | null>;
  outcome(contract: Address, key: Hex, stage: number): Promise<OnChainOutcome | null>;
  keyOf(contract: Address, committer: Address, scope: Hex, od: number): Promise<Hex>;
  gateTs(contract: Address, od: number): Promise<number>;
  dayEndTs(contract: Address, od: number): Promise<number>;
  transaction(hash: Hex): Promise<AnchorTx>;
}

export function rpcReader(network: NetworkInfo): ChainReader {
  const transports = network.rpcUrls.map((url) => http(url, { timeout: 15_000, retryCount: 1 }));
  const client: PublicClient = createPublicClient({
    transport: transports.length === 1 ? (transports[0] as ReturnType<typeof http>) : fallback(transports),
  });
  return clientReader(client);
}

/** The same reads over any viem public client: an in-process chain in tests, a wallet's provider in a page. */
export function clientReader(client: Pick<PublicClient, "getChainId" | "readContract" | "getTransaction" | "getTransactionReceipt" | "getBlock">): ChainReader {
  const call = <F extends "get" | "outcomeOf" | "keyOf" | "gateTs" | "dayEndTs">(
    address: Address,
    functionName: F,
    args: readonly unknown[],
  ) => client.readContract({ address, abi: GATE_RECORD_ABI, functionName, args } as never) as Promise<unknown>;

  return {
    chainId: () => client.getChainId(),
    async record(contract, key) {
      const r = (await call(contract, "get", [key])) as {
        root: Hex;
        codeHash: Hex;
        scope: Hex;
        committer: Address;
        od: number;
        leafCount: number;
        committedAt: bigint;
        blockNumber: bigint;
      };
      if (r.committer === zeroAddress) return null;
      return { ...r, committedAt: Number(r.committedAt), blockNumber: Number(r.blockNumber) };
    },
    async outcome(contract, key, stage) {
      const o = (await call(contract, "outcomeOf", [key, stage])) as { hash: Hex; linkedAt: bigint };
      return o.linkedAt === 0n ? null : { hash: o.hash, linkedAt: Number(o.linkedAt) };
    },
    keyOf: async (contract, committer, scope, od) => (await call(contract, "keyOf", [committer, scope, od])) as Hex,
    gateTs: async (contract, od) => Number((await call(contract, "gateTs", [od])) as bigint),
    dayEndTs: async (contract, od) => Number((await call(contract, "dayEndTs", [od])) as bigint),
    async transaction(hash) {
      const [tx, receipt] = await Promise.all([
        client.getTransaction({ hash }),
        client.getTransactionReceipt({ hash }),
      ]);
      const block = await client.getBlock({ blockNumber: receipt.blockNumber });
      return {
        from: tx.from,
        to: tx.to,
        value: tx.value,
        input: tx.input,
        success: receipt.status === "success",
        blockNumber: Number(receipt.blockNumber),
        blockTimestamp: Number(block.timestamp),
      };
    },
  };
}
