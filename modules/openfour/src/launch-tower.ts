// Read-only client for an evidence-gated OpenFour launch: one consistent block,
// eth_call only, no Node APIs, so the site can run it in the browser.
import {
  decodeErrorResult,
  getAddress,
  parseAbi,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

export const EVIDENCE_GATED_TAG = "module.migrate.evidence_gated";
export const LP_SINK: Address = "0x000000000000000000000000000000000000dEaD";

export const PHASES = ["Created", "Trading", "MigratePending", "Migrated", "Terminal", "SoldOut"] as const;
export type PhaseName = (typeof PHASES)[number];

export type LiquidityPredicate = "soldOut" | "raised";

const EVIDENCE = "(bytes32 key,uint32 od,bytes32 root,address boundBy,uint64 boundAt)";
const PARAMS =
  "(address agent,bytes32 scope,uint32 minOd,uint32 minLeafCount,bytes32 codeHash,uint8 outcomeStage,uint8 liquidityPredicate,uint256 minQuoteRaised)";
const STATUS = `(address token,address vault,address agent,bytes32 scope,uint8 phase,uint8 liquidityPredicate,bool liquidityReady,bool evidenceBound,bool evidenceHolds,${EVIDENCE} evidence,address pair)`;

export const evidenceGatedMigrateAbi = parseAbi([
  `function status() view returns (${STATUS})`,
  `function params() view returns (${PARAMS})`,
  `function evidence() view returns (${EVIDENCE})`,
  "function verifyEvidence(uint32 od, bytes32 root) view returns (bytes32 key)",
  "function bindEvidence(uint32 od, bytes32 root) returns (bytes32 key)",
  "function graduate()",
  "function gateRecord() view returns (address)",
  "function pairFactory() view returns (address)",
  "function token() view returns (address)",
  "function fourCore() view returns (address)",
  "function pair() view returns (address)",
  "function getInitParams() view returns (bytes)",
  "function descriptor() view returns (bytes8 tagId, string tag, string version)",
  "event EvidenceBound(address indexed token, address indexed agent, bytes32 indexed key, uint32 od, bytes32 root, address boundBy)",
  "event Graduated(address indexed token, address indexed pair, bytes32 indexed evidenceKey, uint256 tokenAmount, uint256 quoteAmount, uint256 liquidity)",
  "error AlreadyInitialized()",
  "error ZeroAddress()",
  "error InvalidParams(string field)",
  "error OnlyCore(address caller)",
  "error WrongToken(address token)",
  "error WrongVault(address vault)",
  "error NotBinder(address caller)",
  "error AlreadyGraduated(address pair)",
  "error GraduationInProgress()",
  "error NotGraduated(uint8 phase)",
  "error LiquidityNotReady(uint8 predicate)",
  "error EvidenceMissing(address agent, bytes32 scope)",
  "error EvidenceNotOnRecord(bytes32 key)",
  "error EvidenceRootMismatch(bytes32 key, bytes32 recorded, bytes32 claimed)",
  "error EvidenceBeforeMinimumDay(uint32 od, uint32 minOd)",
  "error EvidenceTooSmall(uint32 leafCount, uint32 minLeafCount)",
  "error EvidenceCodeMismatch(bytes32 recorded, bytes32 required)",
  "error EvidenceAfterGate(uint64 committedAt, uint256 gate)",
  "error EvidenceOutcomeMissing(bytes32 key, uint8 stage)",
  "error PoolNotEmpty(address pair)",
  "error NothingToMigrate()",
  "error ZeroLiquidity()",
]);

const gateRecordAbi = parseAbi([
  "function get(bytes32 key) view returns ((bytes32 root,bytes32 codeHash,bytes32 scope,address committer,uint32 od,uint32 leafCount,uint64 committedAt,uint64 blockNumber))",
  "error InvalidDay(uint32 od)",
]);

export const openFourCoreReadAbi = parseAbi([
  "function tokens(address) view returns (uint32 version,address creator,uint256 presetId,address token,string name,string symbol,uint256 maxSupply,uint256 saleAmount,uint256 raiseAmount,address quoteAsset,address vault,address curveModule,address tradeModule,address migrateModule,address tokenModule,address customData,uint256 createBlock,bool exists,bool paused,bool antiSniperEnabled)",
]);

const vaultAbi = parseAbi(["function totalRaised() view returns (uint256)", "function remainingForSale() view returns (uint256)"]);
const pairAbi = parseAbi([
  "function token0() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

export interface GateRecordRecord {
  root: Hex;
  codeHash: Hex;
  scope: Hex;
  committer: Address;
  od: number;
  leafCount: number;
  committedAt: bigint;
  blockNumber: bigint;
}

export interface LaunchTowerState {
  chainId: number;
  blockNumber: bigint;
  blockTimestamp: bigint;
  token: {
    address: Address;
    name: string;
    symbol: string;
    creator: Address;
    presetId: bigint;
    maxSupply: bigint;
    saleAmount: bigint;
    raiseAmount: bigint;
    quoteAsset: Address;
  };
  vault: { address: Address; phase: PhaseName; totalRaised: bigint; remainingForSale: bigint };
  gate: {
    module: Address;
    gateRecord: Address;
    agent: Address;
    scope: Hex;
    minOd: number;
    minLeafCount: number;
    codeHash: Hex | null;
    outcomeStage: number;
    liquidityPredicate: LiquidityPredicate;
    minQuoteRaised: bigint;
    liquidityReady: boolean;
    evidenceBound: boolean;
    evidenceHolds: boolean;
    evidence: { key: Hex; od: number; root: Hex; boundBy: Address; boundAt: bigint } | null;
  };
  /** The GateRecord record under the bound key, read from GateRecord itself. */
  record: GateRecordRecord | null;
  pool: { pair: Address; reserveToken: bigint; reserveQuote: bigint; lpTotalSupply: bigint; lpAtSink: bigint } | null;
  graduated: boolean;
  /** What still stands between this launch and graduation, in the order the module checks. */
  blockers: ("liquidity" | "evidence")[];
}

export interface ReadLaunchTowerOptions {
  core: Address;
  token: Address;
  blockNumber?: bigint;
}

export async function readLaunchTower(client: PublicClient, options: ReadLaunchTowerOptions): Promise<LaunchTowerState> {
  const blockNumber = options.blockNumber ?? (await client.getBlockNumber());
  const at = { blockNumber } as const;
  const [chainId, block, runtime] = await Promise.all([
    client.getChainId(),
    client.getBlock(at),
    client.readContract({ address: options.core, abi: openFourCoreReadAbi, functionName: "tokens", args: [options.token], ...at }),
  ]);
  const [, creator, presetId, token, name, symbol, maxSupply, saleAmount, raiseAmount, quoteAsset, vault, , , module, , , , exists] = runtime;
  if (!exists || getAddress(token) !== getAddress(options.token)) throw new Error(`${options.token} is not a token of Core ${options.core}`);

  const read = <F extends "status" | "params" | "gateRecord">(functionName: F) =>
    client.readContract({ address: module, abi: evidenceGatedMigrateAbi, functionName, ...at });
  const [status, params, gateRecord, totalRaised, remainingForSale] = await Promise.all([
    read("status"),
    read("params"),
    read("gateRecord"),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "totalRaised", ...at }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "remainingForSale", ...at }),
  ]);

  const bound = status.evidenceBound;
  const record = bound
    ? await client.readContract({ address: gateRecord, abi: gateRecordAbi, functionName: "get", args: [status.evidence.key], ...at })
    : null;

  let pool: LaunchTowerState["pool"] = null;
  if (status.pair !== zeroAddress) {
    const [token0, reserves, lpTotalSupply, lpAtSink] = await Promise.all([
      client.readContract({ address: status.pair, abi: pairAbi, functionName: "token0", ...at }),
      client.readContract({ address: status.pair, abi: pairAbi, functionName: "getReserves", ...at }),
      client.readContract({ address: status.pair, abi: pairAbi, functionName: "totalSupply", ...at }),
      client.readContract({ address: status.pair, abi: pairAbi, functionName: "balanceOf", args: [LP_SINK], ...at }),
    ]);
    const tokenIs0 = getAddress(token0) === getAddress(token);
    pool = {
      pair: status.pair,
      reserveToken: BigInt(tokenIs0 ? reserves[0] : reserves[1]),
      reserveQuote: BigInt(tokenIs0 ? reserves[1] : reserves[0]),
      lpTotalSupply,
      lpAtSink,
    };
  }

  const phase = PHASES[status.phase] ?? "Terminal";
  const graduated = phase === "Migrated" && status.pair !== zeroAddress;
  const blockers: LaunchTowerState["blockers"] = [];
  if (!graduated) {
    if (!status.liquidityReady) blockers.push("liquidity");
    if (!bound || !status.evidenceHolds) blockers.push("evidence");
  }

  return {
    chainId,
    blockNumber,
    blockTimestamp: block.timestamp,
    token: { address: getAddress(token), name, symbol, creator, presetId, maxSupply, saleAmount, raiseAmount, quoteAsset },
    vault: { address: vault, phase, totalRaised, remainingForSale },
    gate: {
      module,
      gateRecord,
      agent: params.agent,
      scope: params.scope,
      minOd: params.minOd,
      minLeafCount: params.minLeafCount,
      codeHash: params.codeHash === zeroHash ? null : params.codeHash,
      outcomeStage: params.outcomeStage,
      liquidityPredicate: params.liquidityPredicate === 0 ? "soldOut" : "raised",
      minQuoteRaised: params.minQuoteRaised,
      liquidityReady: status.liquidityReady,
      evidenceBound: bound,
      evidenceHolds: status.evidenceHolds,
      evidence: bound ? { ...status.evidence } : null,
    },
    record: record ? { ...record } : null,
    pool,
    graduated,
    blockers,
  };
}

/** Names a graduation or binding revert: the module's errors and GateRecord's InvalidDay. */
export function explainRevert(data: Hex): { name: string; args: readonly unknown[] } | null {
  for (const abi of [evidenceGatedMigrateAbi, gateRecordAbi]) {
    try {
      const decoded = decodeErrorResult({ abi, data });
      return { name: decoded.errorName, args: decoded.args ?? [] };
    } catch {
      // not this ABI's error
    }
  }
  return null;
}
