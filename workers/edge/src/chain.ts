// Reads GateRecord over public JSON-RPC: eth_call and receipt lookups only, nothing that signs or sends.
import {
  callGateTs,
  callGet,
  callKeyOf,
  decodeBytes32,
  decodeCommitted,
  decodeRecord,
  decodeUint,
  recordKey,
  scopeId,
  type ChainRecord,
  type CommittedEvent,
} from "./abi.ts";
import { checksumAddress, type Hex } from "./bytes.ts";
import { PLAN_SCOPE_LABEL, type Config, type NetworkName } from "./config.ts";
import { EdgeError } from "./errors.ts";

const READ_ONLY = new Set(["eth_chainId", "eth_blockNumber", "eth_call", "eth_getTransactionReceipt"]);
const TIMEOUT_MS = 8_000;

export interface RpcCall {
  method: string;
  params: unknown[];
}

interface RpcAnswer {
  id?: unknown;
  result?: unknown;
  error?: { message?: unknown };
}

/** The calls as one JSON-RPC batch, sent to each URL in turn until one answers all of them. */
export async function rpcBatch(urls: readonly string[], calls: readonly RpcCall[]): Promise<{ url: string; results: unknown[] }> {
  for (const c of calls) if (!READ_ONLY.has(c.method)) throw new Error(`${c.method} is not a read`);
  const body = JSON.stringify(calls.map((c, i) => ({ jsonrpc: "2.0", id: i + 1, method: c.method, params: c.params })));
  const problems: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const answers: unknown = await res.json();
      if (!Array.isArray(answers)) throw new Error("the answer is not a batch");
      const byId = new Map((answers as RpcAnswer[]).map((a) => [a?.id, a]));
      const results = calls.map((c, i) => {
        const a = byId.get(i + 1);
        if (!a) throw new Error(`no answer to ${c.method}`);
        if (a.error) throw new Error(`${c.method}: ${String(a.error.message ?? JSON.stringify(a.error))}`);
        if (!("result" in a)) throw new Error(`${c.method}: no result`);
        return a.result;
      });
      return { url, results };
    } catch (err) {
      problems.push(`${new URL(url).host}: ${(err as Error).message}`);
    }
  }
  throw new EdgeError(503, `no RPC answered (${problems.join("; ")})`);
}

function quantity(v: unknown, what: string): number {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]{1,14}$/.test(v)) throw new Error(`${what}: ${JSON.stringify(v)} is not a quantity`);
  return Number(BigInt(v));
}

/** What GateRecord says about one committer's plan record for an operating day. */
export interface DayRecord {
  network: NetworkName;
  /** As the RPC reports it. */
  chainId: number;
  rpc: string;
  contract: Hex;
  committer: Hex;
  scopeLabel: string;
  scope: Hex;
  /** keccak256(abi.encode(committer, scope, od)), computed here. */
  key: Hex;
  /** The contract's keyOf for the same arguments. */
  keyOf: Hex;
  /** get(key); null when the contract returns its zeroed record. */
  record: ChainRecord | null;
  /** The contract's gateTs(od). */
  contractGate: number;
  head: number;
}

export async function readDayRecord(cfg: Config, network: NetworkName, od: number): Promise<DayRecord> {
  const scope = scopeId(PLAN_SCOPE_LABEL);
  const key = recordKey(cfg.committer, scope, od);
  const call = (data: Hex): RpcCall => ({ method: "eth_call", params: [{ to: cfg.contract, data }, "latest"] });
  const { url, results } = await rpcBatch(cfg.rpc[network], [
    { method: "eth_chainId", params: [] },
    { method: "eth_blockNumber", params: [] },
    call(callKeyOf(cfg.committer, scope, od)),
    call(callGet(key)),
    call(callGateTs(od)),
  ]);
  const [chainId, head, keyOf, record, gate] = results;
  try {
    return {
      network,
      chainId: quantity(chainId, "eth_chainId"),
      rpc: url,
      contract: cfg.contract,
      committer: cfg.committer,
      scopeLabel: PLAN_SCOPE_LABEL,
      scope,
      key,
      keyOf: decodeBytes32(String(keyOf)),
      record: decodeRecord(String(record)),
      contractGate: decodeUint(String(gate)),
      head: quantity(head, "eth_blockNumber"),
    };
  } catch (err) {
    throw new EdgeError(502, `${network} RPC ${new URL(url).host} gave an answer GateRecord cannot have given: ${(err as Error).message}`);
  }
}

export interface CommitTx {
  rpc: string;
  status: "success" | "reverted";
  to: Hex | null;
  blockNumber: number;
  /** Committed events logged by the contract. */
  committed: CommittedEvent[];
}

interface ReceiptJson {
  status?: unknown;
  to?: unknown;
  blockNumber?: unknown;
  logs?: { address?: unknown; topics?: unknown; data?: unknown }[];
}

export async function readCommitTx(cfg: Config, network: NetworkName, txHash: Hex): Promise<CommitTx | null> {
  const { url, results } = await rpcBatch(cfg.rpc[network], [{ method: "eth_getTransactionReceipt", params: [txHash] }]);
  const r = results[0] as ReceiptJson | null;
  if (r === null) return null;
  try {
    const committed: CommittedEvent[] = [];
    for (const log of r.logs ?? []) {
      if (typeof log.address !== "string" || log.address.toLowerCase() !== cfg.contract.toLowerCase()) continue;
      const topics = Array.isArray(log.topics) ? log.topics.map(String) : [];
      const event = decodeCommitted(topics, String(log.data));
      if (event) committed.push(event);
    }
    return {
      rpc: url,
      status: quantity(r.status, "status") === 1 ? "success" : "reverted",
      to: typeof r.to === "string" ? checksumAddress(r.to) : null,
      blockNumber: quantity(r.blockNumber, "blockNumber"),
      committed,
    };
  } catch (err) {
    throw new EdgeError(502, `${network} RPC ${new URL(url).host} gave a malformed receipt for ${txHash}: ${(err as Error).message}`);
  }
}
