import { getAddress, parseAbi, parseEventLogs, zeroAddress, type Address, type Hex, type Log, type PublicClient } from "viem";
import { readMined, type ReadAt } from "../../lib/testnet";
import { OPENFOUR, type StepId } from "./addresses";
import { LAUNCHES, ZERO, type LaunchReplay } from "./replay";

// Reads the PLNR launch at one block, as the launch tower in
// modules/openfour/src/launch-tower.ts does: Core's record of the token, the
// evidence-gated migrate module's status and parameters, the vault, the bound
// record from GateRecord itself, and the PancakeSwap V2 pair. Then each of the
// launch's transactions from its receipt.

const CORE_ABI = parseAbi([
  "function tokens(address) view returns (uint32 version,address creator,uint256 presetId,address token,string name,string symbol,uint256 maxSupply,uint256 saleAmount,uint256 raiseAmount,address quoteAsset,address vault,address curveModule,address tradeModule,address migrateModule,address tokenModule,address customData,uint256 createBlock,bool exists,bool paused,bool antiSniperEnabled)",
]);

const EVIDENCE = "(bytes32 key,uint32 od,bytes32 root,address boundBy,uint64 boundAt)";
const PARAMS =
  "(address agent,bytes32 scope,uint32 minOd,uint32 minLeafCount,bytes32 codeHash,uint8 outcomeStage,uint8 liquidityPredicate,uint256 minQuoteRaised)";
const STATUS = `(address token,address vault,address agent,bytes32 scope,uint8 phase,uint8 liquidityPredicate,bool liquidityReady,bool evidenceBound,bool evidenceHolds,${EVIDENCE} evidence,address pair)`;

const MODULE_ABI = parseAbi([
  `function status() view returns (${STATUS})`,
  `function params() view returns (${PARAMS})`,
  "function gateRecord() view returns (address)",
  "function pairFactory() view returns (address)",
  "function descriptor() view returns (bytes8 tagId, string tag, string version)",
  "event EvidenceBound(address indexed token, address indexed agent, bytes32 indexed key, uint32 od, bytes32 root, address boundBy)",
  "event Graduated(address indexed token, address indexed pair, bytes32 indexed evidenceKey, uint256 tokenAmount, uint256 quoteAmount, uint256 liquidity)",
]);

const VAULT_ABI = parseAbi(["function totalRaised() view returns (uint256)", "function remainingForSale() view returns (uint256)"]);

const GATE_RECORD_ABI = parseAbi([
  "function get(bytes32 key) view returns ((bytes32 root,bytes32 codeHash,bytes32 scope,address committer,uint32 od,uint32 leafCount,uint64 committedAt,uint64 blockNumber))",
  "function gateTs(uint32 od) pure returns (uint256)",
]);

const ERC20_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

const TRANSFER_ABI = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

const PAIR_ABI = parseAbi([
  "function token0() view returns (address)",
  "function factory() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
]);

export const LP_SINK: Address = "0x000000000000000000000000000000000000dEaD";

/** OpenFour's vault phases, in the module's order (launch-tower.ts PHASES). */
const PHASES = ["Created", "Trading", "MigratePending", "Migrated", "Terminal", "SoldOut"] as const;

export interface StepView {
  id: StepId;
  hash: Hex;
  ok: boolean;
  blockNumber: bigint;
  time: number;
  from: Address;
  to: Address | null;
  /** The contract a creation made. */
  created: Address | null;
  /** The module's own events in the receipt: what the binding stored, what the graduation moved. */
  bound: { key: Hex; od: number; root: Hex; boundBy: Address } | null;
  graduated: { pair: Address; evidenceKey: Hex; tokenAmount: bigint; quoteAmount: bigint; liquidity: bigint } | null;
}

export interface LaunchRead {
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
    quoteSymbol: string;
    totalSupply: bigint;
    createBlock: bigint;
  };
  vault: { address: Address; phase: string; totalRaised: bigint; remainingForSale: bigint };
  gate: {
    module: Address;
    tag: string;
    version: string;
    gateRecord: Address;
    pairFactory: Address;
    agent: Address;
    scope: Hex;
    minOd: number;
    minLeafCount: number;
    codeHash: Hex | null;
    outcomeStage: number;
    liquidity: "soldOut" | "raised";
    minQuoteRaised: bigint;
    liquidityReady: boolean;
    evidenceBound: boolean;
    evidenceHolds: boolean;
    evidence: { key: Hex; od: number; root: Hex; boundBy: Address; boundAt: number } | null;
  };
  /** The bound record, read from GateRecord, with its day's gate. */
  record: { root: Hex; codeHash: Hex; committer: Address; od: number; leafCount: number; committedAt: number; blockNumber: number; gate: number } | null;
  pool: { pair: Address; name: string; symbol: string; factory: Address; reserveToken: bigint; reserveQuote: bigint; lpTotal: bigint; lpAtSink: bigint; lpAtZero: bigint } | null;
  graduated: boolean;
  steps: StepView[];
  /** Each replayed launch, its frames held to their receipts. */
  replays: ReplayCheck[];
}

/** One replayed launch held to the chain: every frame's receipt read again, its status, block, time and token moves. */
export interface ReplayCheck {
  id: string;
  /** Receipts read: the frames and the setup transactions. */
  checked: number;
  /** What did not match, in words; empty when every frame matches. */
  mismatches: string[];
}

const key = (from: string, to: string, amount: bigint | string) => `${from.toLowerCase()}>${to.toLowerCase()}:${String(amount)}`;

/** Reads every frame's receipt again (once per page: readMined keeps them) and compares it with the replay. */
export async function checkReplay(client: PublicClient, l: LaunchReplay): Promise<ReplayCheck> {
  const mismatches: string[] = [];
  const frames = await Promise.all(l.frames.map((f) => readMined(client, f.hash)));
  frames.forEach((m, i) => {
    const f = l.frames[i]!;
    const what = `${l.symbol} ${f.kind}`;
    if (m.ok !== f.ok) mismatches.push(`${what}: status ${m.ok ? "success" : "reverted"}`);
    if (Number(m.blockNumber) !== f.block) mismatches.push(`${what}: block ${m.blockNumber}`);
    if (m.time !== f.time) mismatches.push(`${what}: time ${m.time}`);
    const logs = m.logs.filter((x) => getAddress(x.address) === getAddress(l.token)) as Log[];
    const moves = parseEventLogs({ abi: TRANSFER_ABI, logs, eventName: "Transfer" }).map((e) => key(e.args.from, e.args.to, e.args.value));
    const want = f.moves.map((x) => key(x.from === ZERO ? zeroAddress : x.from, x.to, x.amount));
    if (moves.sort().join() !== want.sort().join()) mismatches.push(`${what}: ${l.symbol} moves differ`);
  });
  const setup = await Promise.all(l.setup.map((s) => readMined(client, s.hash)));
  setup.forEach((m, i) => {
    const s = l.setup[i]!;
    if (!m.ok || Number(m.blockNumber) !== s.block) mismatches.push(`${s.label}: block ${m.blockNumber}, ${m.ok ? "success" : "reverted"}`);
  });
  return { id: l.id, checked: frames.length + setup.length, mismatches };
}

async function readStep(client: PublicClient, s: { id: StepId; hash: string }): Promise<StepView> {
  const m = await readMined(client, s.hash as Hex);
  const logs = m.logs.filter((l) => getAddress(l.address) === getAddress(OPENFOUR.launch.migrateModule)) as Log[];
  const bound = parseEventLogs({ abi: MODULE_ABI, logs, eventName: "EvidenceBound" })[0]?.args;
  const graduated = parseEventLogs({ abi: MODULE_ABI, logs, eventName: "Graduated" })[0]?.args;
  return {
    id: s.id,
    hash: m.hash,
    ok: m.ok,
    blockNumber: m.blockNumber,
    time: m.time,
    from: m.from,
    to: m.to,
    created: m.created,
    bound: bound ? { key: bound.key, od: Number(bound.od), root: bound.root, boundBy: bound.boundBy } : null,
    graduated: graduated
      ? { pair: graduated.pair, evidenceKey: graduated.evidenceKey, tokenAmount: graduated.tokenAmount, quoteAmount: graduated.quoteAmount, liquidity: graduated.liquidity }
      : null,
  };
}

export async function readLaunch(client: PublicClient, at: ReadAt): Promise<LaunchRead> {
  const r = <T>(address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[] = []) =>
    client.readContract({ address, abi, functionName, args, blockNumber: at.number } as never) as Promise<T>;

  const runtime = await r<readonly unknown[]>(OPENFOUR.core, CORE_ABI, "tokens", [OPENFOUR.launch.token]);
  const creator = runtime[1] as Address;
  const presetId = runtime[2] as bigint;
  const token = runtime[3] as Address;
  const name = runtime[4] as string;
  const symbol = runtime[5] as string;
  const maxSupply = runtime[6] as bigint;
  const saleAmount = runtime[7] as bigint;
  const raiseAmount = runtime[8] as bigint;
  const quoteAsset = runtime[9] as Address;
  const vault = runtime[10] as Address;
  const module = runtime[13] as Address;
  const createBlock = runtime[16] as bigint;
  const exists = runtime[17] as boolean;
  if (!exists || getAddress(token) !== getAddress(OPENFOUR.launch.token)) throw new Error(`${OPENFOUR.launch.token} is not a token of OpenFour Core ${OPENFOUR.core}.`);

  type Status = {
    phase: number;
    liquidityPredicate: number;
    liquidityReady: boolean;
    evidenceBound: boolean;
    evidenceHolds: boolean;
    evidence: { key: Hex; od: number; root: Hex; boundBy: Address; boundAt: bigint };
    pair: Address;
  };
  type Params = { agent: Address; scope: Hex; minOd: number; minLeafCount: number; codeHash: Hex; outcomeStage: number; liquidityPredicate: number; minQuoteRaised: bigint };

  const [status, params, descriptor, gateRecord, pairFactory, totalRaised, remainingForSale, totalSupply, quoteSymbol] = await Promise.all([
    r<Status>(module, MODULE_ABI, "status"),
    r<Params>(module, MODULE_ABI, "params"),
    r<readonly [Hex, string, string]>(module, MODULE_ABI, "descriptor"),
    r<Address>(module, MODULE_ABI, "gateRecord"),
    r<Address>(module, MODULE_ABI, "pairFactory"),
    r<bigint>(vault, VAULT_ABI, "totalRaised"),
    r<bigint>(vault, VAULT_ABI, "remainingForSale"),
    r<bigint>(token, ERC20_ABI, "totalSupply"),
    r<string>(quoteAsset, ERC20_ABI, "symbol"),
  ]);

  const bound = status.evidenceBound;
  const pairAddress = status.pair.toLowerCase() === zeroAddress ? null : status.pair;

  const [record, pool, steps, replays] = await Promise.all([
    bound
      ? Promise.all([
          r<{ root: Hex; codeHash: Hex; committer: Address; od: number; leafCount: number; committedAt: bigint; blockNumber: bigint }>(gateRecord, GATE_RECORD_ABI, "get", [status.evidence.key]),
          r<bigint>(gateRecord, GATE_RECORD_ABI, "gateTs", [status.evidence.od]),
        ]).then(([rec, gate]) =>
          rec.committer.toLowerCase() === zeroAddress
            ? null
            : {
                root: rec.root,
                codeHash: rec.codeHash,
                committer: rec.committer,
                od: Number(rec.od),
                leafCount: Number(rec.leafCount),
                committedAt: Number(rec.committedAt),
                blockNumber: Number(rec.blockNumber),
                gate: Number(gate),
              },
        )
      : Promise.resolve(null),
    pairAddress
      ? Promise.all([
          r<Address>(pairAddress, PAIR_ABI, "token0"),
          r<Address>(pairAddress, PAIR_ABI, "factory"),
          r<readonly [bigint, bigint, number]>(pairAddress, PAIR_ABI, "getReserves"),
          r<string>(pairAddress, ERC20_ABI, "name"),
          r<string>(pairAddress, ERC20_ABI, "symbol"),
          r<bigint>(pairAddress, ERC20_ABI, "totalSupply"),
          r<bigint>(pairAddress, ERC20_ABI, "balanceOf", [LP_SINK]),
          r<bigint>(pairAddress, ERC20_ABI, "balanceOf", [zeroAddress]),
        ]).then(([token0, factory, reserves, lpName, lpSymbol, lpTotal, lpAtSink, lpAtZero]) => {
          const tokenIs0 = getAddress(token0) === getAddress(token);
          return {
            pair: pairAddress,
            name: lpName,
            symbol: lpSymbol,
            factory,
            reserveToken: BigInt(tokenIs0 ? reserves[0] : reserves[1]),
            reserveQuote: BigInt(tokenIs0 ? reserves[1] : reserves[0]),
            lpTotal,
            lpAtSink,
            lpAtZero,
          };
        })
      : Promise.resolve(null),
    Promise.all(OPENFOUR.steps.map((s) => readStep(client, s))),
    Promise.all(LAUNCHES.map((l) => checkReplay(client, l))),
  ]);

  const phase = PHASES[status.phase] ?? "Terminal";
  return {
    token: { address: getAddress(token), name, symbol, creator, presetId, maxSupply, saleAmount, raiseAmount, quoteAsset, quoteSymbol, totalSupply, createBlock },
    vault: { address: vault, phase, totalRaised, remainingForSale },
    gate: {
      module,
      tag: descriptor[1],
      version: descriptor[2],
      gateRecord,
      pairFactory,
      agent: params.agent,
      scope: params.scope,
      minOd: Number(params.minOd),
      minLeafCount: Number(params.minLeafCount),
      codeHash: /^0x0+$/.test(params.codeHash) ? null : params.codeHash,
      outcomeStage: Number(params.outcomeStage),
      liquidity: params.liquidityPredicate === 0 ? "soldOut" : "raised",
      minQuoteRaised: params.minQuoteRaised,
      liquidityReady: status.liquidityReady,
      evidenceBound: bound,
      evidenceHolds: status.evidenceHolds,
      evidence: bound
        ? { key: status.evidence.key, od: Number(status.evidence.od), root: status.evidence.root, boundBy: status.evidence.boundBy, boundAt: Number(status.evidence.boundAt) }
        : null,
    },
    record,
    pool,
    graduated: phase === "Migrated" && pairAddress !== null,
    steps,
    replays,
  };
}
