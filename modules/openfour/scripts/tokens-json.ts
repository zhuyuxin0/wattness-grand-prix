// Writes tokens.json: OpenFour's Workbench token list (developer/workbench/data/tokens.json,
// one row per token with tokenAddress, name, symbol, presetId, presetName, creator, txHash,
// chainId, quoteAsset, createdAt) for every launch in deployments/bsc-testnet.json, each row
// extended with its create, buy, sell and migrate records. Read only: no key, no transaction.
// Every transaction and receipt is read from three public BSC testnet RPCs run by three
// operators: at least two must serve it and all that serve it must agree (PublicNode no
// longer serves 25 Nov receipts). A refused graduation is replayed with eth_call at its
// parent block to name the error.
//
//   node scripts/tokens-json.ts [--out submission/tokens.json]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  BaseError,
  createPublicClient,
  decodeErrorResult,
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  http,
  parseAbi,
  parseEventLogs,
  type Abi,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type Transaction,
  type TransactionReceipt,
} from "viem";
import { evidenceGatedMigrateAbi, explainRevert, PHASES } from "../src/launch-tower.ts";

const RPCS = ["https://bsc-testnet-dataseed.bnbchain.org", "https://api.zan.top/bsc-testnet", "https://bsc-testnet.publicnode.com"] as const;
const GATE_RECORD: Address = "0x2922c68cE15EB3e83B7f43b136e981dDc4262876";
const LP_SINK: Address = "0x000000000000000000000000000000000000dEaD";

const here = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({ options: { out: { type: "string", default: join(here, "../submission/tokens.json") } } });

const coreAbi = parseAbi([
  "function createToken(bytes createArgs, bytes signature) payable returns (address)",
  "function buy(address token,uint256 amount,uint256 maxQuotePayAmount,uint256 options,bytes proof) payable",
  "function buyByBudget(address token,uint256 maxPayAmount,uint256 minAmountOut,uint256 options,bytes proof) payable",
  "function sell(address token,uint256 amount,uint256 minQuoteRecvAmount,uint256 options,bytes proof)",
  "function migrate(address token)",
  "function tokens(address) view returns (uint32 version,address creator,uint256 presetId,address token,string name,string symbol,uint256 maxSupply,uint256 saleAmount,uint256 raiseAmount,address quoteAsset,address vault,address curveModule,address tradeModule,address migrateModule,address tokenModule,address customData,uint256 createBlock,bool exists,bool paused,bool antiSniperEnabled)",
  "event TokenCreated(uint256 requestId, uint256 indexed presetId, address indexed creator, address indexed token, string name, string symbol, uint256 maxSupply, uint256 saleAmount, uint256 raiseAmount, uint256 initialPrice, address quoteAsset, address vault, address curveModule, address tradeModule, address migrateModule, address customData, address tokenModule, string tokenMetaUri, uint256 flags, bytes encodedTags)",
  "event TradeExecuted(address indexed token, address indexed trader, uint256 indexed presetId, bool isBuy, address quoteAsset, address vault, uint256 requestedTokenAmount, uint256 tokenAmount, uint256 curveQuoteAmount, uint256 traderQuoteAmount, uint256 lastPrice, uint256 slippageLimit, uint256 protocolFee, uint256 taxFee, uint256 devFee, uint256 antiSniperFee, uint256 totalRaised, uint256 remainingForSale)",
  "event MigrateExecuted(uint256 indexed presetId, address indexed caller, address indexed token, address vault, address migrateModule, bytes8 migrateTagId, uint256 totalRaised, uint256 remainingForSale, bytes32 hookDataHash, uint8 migratedDataVersion, bytes encodedMigratedData)",
  "event PhaseTransition(address indexed token, uint8 from, uint8 to, address operator)",
]);
const erc20Abi = parseAbi([
  "function deposit() payable",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);
const registryAbi = parseAbi([
  "function getModuleImplementation(bytes32 moduleKey) view returns (address)",
  "function getModuleBeacon(bytes32 moduleKey) view returns (address)",
  "function owner() view returns (address)",
]);
const gateRecordAbi = parseAbi([
  "function get(bytes32 key) view returns ((bytes32 root,bytes32 codeHash,bytes32 scope,address committer,uint32 od,uint32 leafCount,uint64 committedAt,uint64 blockNumber))",
  "function gateTs(uint32 od) pure returns (uint256)",
]);
const vaultAbi = parseAbi(["function phase() view returns (uint8)"]);
const pairAbi = parseAbi([
  "function token0() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);
const callAbi: Abi = [...coreAbi, ...erc20Abi, ...evidenceGatedMigrateAbi];
// Core's custom errors, as OpenFour publishes them (contracts/interfaces/IOpenFourErrors.sol).
const coreErrorsAbi = parseAbi([
  "error CoreErrZeroRegistry()",
  "error CoreErrZeroOfficialProxy()",
  "error CoreErrUnauthorizedProxy()",
  "error CoreErrZeroWrappedNative()",
  "error CoreErrZeroFeeRouter()",
  "error CoreErrZeroToken()",
  "error CoreErrTokenNotFound()",
  "error CoreErrBadConfig()",
  "error CoreErrBadToken()",
  "error CoreErrDuplicateToken()",
  "error CoreErrRequestExpired()",
  "error CoreErrRequestAlreadyUsed()",
  "error CoreErrTokenPaused()",
  "error CoreErrPresetInactive()",
  "error CoreErrPresetCreateDisabled()",
  "error CoreErrBadPhase()",
  "error CoreErrQuoteMustBeERC20()",
  "error CoreErrCurveRejected()",
  "error CoreErrTradeRejected()",
  "error CoreErrSlippage()",
  "error CoreErrTradeMax()",
  "error CoreErrTradeMin()",
  "error CoreErrBadTax()",
  "error CoreErrBudgetNotExecutable()",
  "error CoreErrNativeOnlyWrapped()",
  "error CoreErrInsufficientNative()",
  "error CoreErrNativeRefundFailed()",
  "error CoreErrPresetValidatorNotFound()",
  "error CoreErrPresetTokenImplNotFound()",
]);

// The module's or GateRecord's error by name, else Core's, else Error(string), else the bare selector.
function nameRevert(data: Hex): { name: string; args: readonly unknown[] } {
  const known = explainRevert(data);
  if (known) return known;
  try {
    const e = decodeErrorResult({ abi: coreErrorsAbi, data });
    return { name: e.errorName, args: e.args ?? [] };
  } catch {
    return { name: `unknown error ${data.slice(0, 10)}`, args: [] };
  }
}

type Launch = {
  name: string;
  symbol: string;
  token: Address;
  vault: Address;
  migrateModule: Address;
  agent: Address;
  scope: Hex;
  minOd: number;
  minLeafCount: number;
  codeHash: Hex;
  pair: Address;
  txHash: Hash;
  transactions: { label: string; hash: Hash }[];
};
const dep = JSON.parse(readFileSync(join(here, "../deployments/bsc-testnet.json"), "utf8"));
const core = getAddress(dep.openFour.core);
const registry = getAddress(dep.openFour.registry);
const wbnb = getAddress(dep.openFour.wbnb);

const clients: PublicClient[] = RPCS.map((url) => createPublicClient({ transport: http(url, { retryCount: 3, timeout: 30_000 }) }));
const main = clients[0]!;
for (const [i, c] of clients.entries()) {
  const id = await c.getChainId();
  if (id !== 97) throw new Error(`${RPCS[i]} is chain ${id}, not 97`);
}
const readAt = await Promise.all(clients.map((c) => c.getBlockNumber()));
// One block every RPC has, for the state reads.
const block = readAt.reduce((a, b) => (a < b ? a : b));

// The same read on every RPC, three tries each; null where an RPC does not serve it.
async function each<T>(read: (c: PublicClient) => Promise<T>): Promise<(T | null)[]> {
  return Promise.all(
    clients.map(async (c) => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          return await read(c);
        } catch {
          await new Promise((r) => setTimeout(r, 1_500 * attempt));
        }
      }
      return null;
    }),
  );
}
// The served answers, which must number at least two and agree.
function agreed<T>(what: string, answers: (T | null)[], key: (x: T) => string = (x) => json(x)): { value: T; servedBy: string[] } {
  const served = answers.flatMap((x, i) => (x === null ? [] : [{ x, rpc: RPCS[i]! }]));
  if (served.length < 2) throw new Error(`${what}: served by ${served.length} RPC(s), need two`);
  const first = key(served[0]!.x);
  for (const s of served) if (key(s.x) !== first) throw new Error(`${what}: ${s.rpc} disagrees with ${served[0]!.rpc}`);
  return { value: served[0]!.x, servedBy: served.map((s) => s.rpc) };
}
const json = (v: unknown) => JSON.stringify(v, (_, x: unknown) => (typeof x === "bigint" ? x.toString() : x), 2);

function clock(seconds: bigint) {
  const d = new Date(Number(seconds) * 1000);
  const at = (timeZone: string) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
        .formatToParts(d)
        .map((x) => [x.type, x.value]),
    );
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
  };
  return { unix: Number(seconds), utc: d.toISOString().replace(".000Z", "Z"), ct: `${at("America/Chicago")} CT`, bangkok: `${at("Asia/Bangkok")} Bangkok` };
}

function revertData(err: unknown): Hex | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const carrier = err.walk((e) => {
    const x = e as { raw?: unknown; data?: unknown };
    return (typeof x.raw === "string" && x.raw.startsWith("0x")) || (typeof x.data === "string" && x.data.startsWith("0x"));
  }) as { raw?: Hex; data?: Hex } | null;
  return carrier?.raw ?? carrier?.data;
}

// The transaction, its receipt and its block from every RPC that serves them, all agreeing.
async function readTx(hash: Hash): Promise<{ tx: Transaction; receipt: TransactionReceipt; time: ReturnType<typeof clock>; servedBy: string[] }> {
  const tx = agreed(`${hash} transaction`, await each((c) => c.getTransaction({ hash })), (t) => json([t.from, t.to, t.input, t.value, t.nonce, t.blockHash]));
  const receipt = agreed(
    `${hash} receipt`,
    await each((c) => c.getTransactionReceipt({ hash })),
    (r) => json([r.status, r.blockNumber, r.blockHash, r.from, r.to, r.gasUsed, r.contractAddress, r.logs.map((l) => [l.address, l.topics, l.data])]),
  );
  const blk = agreed(`${hash} block`, await each((c) => c.getBlock({ blockNumber: receipt.value.blockNumber })), (b) => json([b.hash, b.timestamp]));
  if (blk.value.hash !== receipt.value.blockHash) throw new Error(`${hash}: block hash differs from the receipt's`);
  return { tx: tx.value, receipt: receipt.value, time: clock(blk.value.timestamp), servedBy: receipt.servedBy };
}

// Replays a refused call at its parent block on each RPC that still serves that state.
async function replay(tx: Transaction, blockNumber: bigint) {
  return Promise.all(
    clients.map(async (c, i) => {
      try {
        await c.call({ account: tx.from, to: tx.to!, data: tx.input, blockNumber: blockNumber - 1n });
        return { rpc: RPCS[i], reverted: false };
      } catch (err) {
        const data = revertData(err);
        if (!data) return { rpc: RPCS[i], reverted: null, note: "no revert data (the endpoint may not serve state this old)" };
        return { rpc: RPCS[i], reverted: true, data, error: nameRevert(data) };
      }
    }),
  );
}

function actionOf(to: Address | null, input: Hex): { action: string; call: string } {
  const { functionName } = decodeFunctionData({ abi: callAbi, data: input });
  if (to && getAddress(to) === core) {
    if (functionName === "createToken") return { action: "create", call: "Core.createToken" };
    if (functionName === "buy" || functionName === "buyByBudget") return { action: "buy", call: `Core.${functionName}` };
    if (functionName === "sell") return { action: "sell", call: "Core.sell" };
    if (functionName === "migrate") return { action: "migrate", call: "Core.migrate" };
  }
  if (functionName === "graduate") return { action: "migrate", call: "EvidenceGatedMigrateModule.graduate" };
  if (functionName === "bindEvidence") return { action: "bind", call: "EvidenceGatedMigrateModule.bindEvidence" };
  if (functionName === "deposit") return { action: "wrap", call: "WBNB.deposit" };
  if (functionName === "approve") return { action: "approve", call: to && getAddress(to) === wbnb ? "WBNB.approve" : "token.approve" };
  throw new Error(`unclassified call ${functionName} to ${to}`);
}

async function recordOf(hash: Hash, launch: Launch) {
  const { tx, receipt, time, servedBy } = await readTx(hash);
  const { action, call } = actionOf(tx.to, tx.input);
  const base = {
    action,
    call,
    txHash: hash,
    status: receipt.status,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    time,
    from: getAddress(receipt.from),
    to: receipt.to ? getAddress(receipt.to) : null,
    gasUsed: receipt.gasUsed,
    effectiveGasPrice: receipt.effectiveGasPrice,
    value: tx.value,
    readFrom: servedBy,
  };
  const core$ = parseEventLogs({ abi: coreAbi, logs: receipt.logs });
  const module$ = parseEventLogs({ abi: evidenceGatedMigrateAbi, logs: receipt.logs });
  const phases = core$
    .filter((e) => e.eventName === "PhaseTransition")
    .map((e) => {
      const a = e.args as { from: number; to: number; operator: Address };
      return { from: PHASES[a.from], to: PHASES[a.to], operator: a.operator };
    });
  if (receipt.status === "reverted") {
    if (action !== "migrate") throw new Error(`${hash}: reverted ${call}`);
    return { ...base, result: "refused", replayAtParentBlock: await replay(tx, receipt.blockNumber) };
  }
  if (action === "create") {
    const e = core$.find((x) => x.eventName === "TokenCreated");
    if (!e) throw new Error(`${hash}: no TokenCreated`);
    const a = e.args as Record<string, unknown>;
    return { ...base, result: "created", token: a.token, vault: a.vault, migrateModule: a.migrateModule, requestId: a.requestId, presetId: a.presetId, maxSupply: a.maxSupply, saleAmount: a.saleAmount, raiseAmount: a.raiseAmount, initialPrice: a.initialPrice, quoteAsset: a.quoteAsset, phaseTransitions: phases };
  }
  if (action === "buy" || action === "sell") {
    const e = core$.find((x) => x.eventName === "TradeExecuted");
    if (!e) throw new Error(`${hash}: no TradeExecuted`);
    const a = e.args as Record<string, bigint | boolean | Address>;
    if (a.isBuy !== (action === "buy") || getAddress(a.token as Address) !== getAddress(launch.token)) throw new Error(`${hash}: trade does not match`);
    return {
      ...base,
      result: action === "buy" ? "bought" : "sold",
      tokenAmount: a.tokenAmount,
      requestedTokenAmount: a.requestedTokenAmount,
      // What the trader paid (buy) or received (sell), fees included.
      traderQuoteAmount: a.traderQuoteAmount,
      curveQuoteAmount: a.curveQuoteAmount,
      protocolFee: a.protocolFee,
      devFee: a.devFee,
      taxFee: a.taxFee,
      antiSniperFee: a.antiSniperFee,
      lastPrice: a.lastPrice,
      totalRaisedAfter: a.totalRaised,
      remainingForSaleAfter: a.remainingForSale,
      phaseTransitions: phases,
    };
  }
  if (action === "bind") {
    const e = module$.find((x) => x.eventName === "EvidenceBound");
    if (!e) throw new Error(`${hash}: no EvidenceBound`);
    const a = e.args as { key: Hex; od: number; root: Hex; boundBy: Address; agent: Address };
    return { ...base, result: "bound", evidenceKey: a.key, od: a.od, root: a.root, agent: a.agent, boundBy: a.boundBy };
  }
  if (action === "migrate") {
    const m = core$.find((x) => x.eventName === "MigrateExecuted");
    const g = module$.find((x) => x.eventName === "Graduated");
    if (!m || !g) throw new Error(`${hash}: no MigrateExecuted and Graduated`);
    const ma = m.args as { migrateTagId: Hex; migratedDataVersion: number; encodedMigratedData: Hex; totalRaised: bigint; remainingForSale: bigint; caller: Address };
    const ga = g.args as { pair: Address; evidenceKey: Hex; tokenAmount: bigint; quoteAmount: bigint; liquidity: bigint };
    return {
      ...base,
      result: "migrated",
      caller: ma.caller,
      migrateTagId: ma.migrateTagId,
      migratedDataVersion: ma.migratedDataVersion,
      encodedMigratedData: ma.encodedMigratedData,
      pair: ga.pair,
      evidenceKey: ga.evidenceKey,
      tokenToPool: ga.tokenAmount,
      quoteToPool: ga.quoteAmount,
      liquidityToDead: ga.liquidity,
      phaseTransitions: phases,
    };
  }
  return { ...base, result: "ok" };
}

// Failure paths of a graduated launch, by eth_call at the read block (no transaction).
async function spotChecks(launch: Launch, creator: Address, otherDay: { od: number; root: Hex }, boundRoot: Hex) {
  const c = main;
  const outsider: Address = "0x000000000000000000000000000000000000bEEF";
  const cases: { name: string; account: Address; to: Address; data: Hex }[] = [
    { name: `verifyEvidence with the other launch's bound record (day ${otherDay.od})`, account: outsider, to: launch.migrateModule, data: encodeFunctionData({ abi: evidenceGatedMigrateAbi, functionName: "verifyEvidence", args: [otherDay.od, otherDay.root] }) },
    { name: `verifyEvidence with this launch's day (${launch.minOd}) and the other day's root`, account: outsider, to: launch.migrateModule, data: encodeFunctionData({ abi: evidenceGatedMigrateAbi, functionName: "verifyEvidence", args: [launch.minOd, otherDay.root] }) },
    { name: "bindEvidence from a wallet that is neither the agent nor the creator", account: outsider, to: launch.migrateModule, data: encodeFunctionData({ abi: evidenceGatedMigrateAbi, functionName: "bindEvidence", args: [launch.minOd, boundRoot] }) },
    { name: "Core.buyByBudget by the creator after graduation", account: creator, to: core, data: encodeFunctionData({ abi: coreAbi, functionName: "buyByBudget", args: [launch.token, 10n ** 15n, 0n, 0n, "0x"] }) },
    { name: "Core.sell by the creator after graduation", account: creator, to: core, data: encodeFunctionData({ abi: coreAbi, functionName: "sell", args: [launch.token, 10n ** 18n, 0n, 1n, "0x"] }) },
    { name: "graduate() again after graduation", account: outsider, to: launch.migrateModule, data: encodeFunctionData({ abi: evidenceGatedMigrateAbi, functionName: "graduate" }) },
  ];
  return Promise.all(
    cases.map(async (k) => {
      try {
        await c.call({ account: k.account, to: k.to, data: k.data, blockNumber: block });
        return { case: k.name, reverted: false };
      } catch (err) {
        const data = revertData(err);
        return { case: k.name, reverted: true, data: data ?? null, error: data ? nameRevert(data) : null };
      }
    }),
  );
}

// Core.tokens(token) returns its fields as one flat list; named here in its order.
function runtimeOf(t: readonly unknown[]) {
  const [version, creator, presetId, token, name, symbol, maxSupply, saleAmount, raiseAmount, quoteAsset, vault, curveModule, tradeModule, migrateModule, tokenModule, customData, createBlock, exists, paused, antiSniperEnabled] = t as [
    number, Address, bigint, Address, string, string, bigint, bigint, bigint, Address, Address, Address, Address, Address, Address, Address, bigint, boolean, boolean, boolean,
  ];
  return { version, creator, presetId, token, name, symbol, maxSupply, saleAmount, raiseAmount, quoteAsset, vault, curveModule, tradeModule, migrateModule, tokenModule, customData, createBlock, exists, paused, antiSniperEnabled };
}

// State first, at one block (a full node keeps only recent state), then the transactions.
const launches = [...(dep.launches as Launch[])].reverse(); // newest first, as the Workbench lists them
const rows = [];
for (const launch of launches) {
  const runtime = runtimeOf(agreed(`${launch.symbol} Core.tokens`, await each((c) => c.readContract({ address: core, abi: coreAbi, functionName: "tokens", args: [launch.token], blockNumber: block }))).value);
  if (!runtime.exists) throw new Error(`${launch.symbol}: Core.tokens(token).exists is false`);
  const params = await main.readContract({ address: launch.migrateModule, abi: evidenceGatedMigrateAbi, functionName: "params", blockNumber: block });
  const expected: [string, unknown, unknown][] = [
    ["migrateModule", getAddress(runtime.migrateModule), getAddress(launch.migrateModule)],
    ["vault", getAddress(runtime.vault), getAddress(launch.vault)],
    ["presetId", runtime.presetId.toString(), String(dep.preset.id)],
    ["agent", getAddress(params.agent), getAddress(launch.agent)],
    ["scope", params.scope, launch.scope],
    ["minOd", params.minOd, launch.minOd],
    ["minLeafCount", params.minLeafCount, launch.minLeafCount],
    ["codeHash", params.codeHash, launch.codeHash],
  ];
  for (const [name, x, y] of expected) if (x !== y) throw new Error(`${launch.symbol}: chain ${name} ${String(x)}, deployments file ${String(y)}`);
  const evidence = await main.readContract({ address: launch.migrateModule, abi: evidenceGatedMigrateAbi, functionName: "evidence", blockNumber: block });
  const record = await main.readContract({ address: GATE_RECORD, abi: gateRecordAbi, functionName: "get", args: [evidence.key], blockNumber: block });
  const gate = await main.readContract({ address: GATE_RECORD, abi: gateRecordAbi, functionName: "gateTs", args: [evidence.od], blockNumber: block });
  const phase = await main.readContract({ address: launch.vault, abi: vaultAbi, functionName: "phase", blockNumber: block });
  const [token0, reserves, lpTotal, lpAtSink] = await Promise.all([
    main.readContract({ address: launch.pair, abi: pairAbi, functionName: "token0", blockNumber: block }),
    main.readContract({ address: launch.pair, abi: pairAbi, functionName: "getReserves", blockNumber: block }),
    main.readContract({ address: launch.pair, abi: pairAbi, functionName: "totalSupply", blockNumber: block }),
    main.readContract({ address: launch.pair, abi: pairAbi, functionName: "balanceOf", args: [LP_SINK], blockNumber: block }),
  ]);
  const tokenIs0 = getAddress(token0) === getAddress(launch.token);
  const other = (dep.launches as Launch[]).find((l) => l.token !== launch.token)!;
  const otherEvidence = await main.readContract({ address: other.migrateModule, abi: evidenceGatedMigrateAbi, functionName: "evidence", blockNumber: block });
  rows.push({
    // The Workbench's own fields (create-and-trade.js, create-test-preset.js).
    tokenAddress: getAddress(launch.token),
    name: runtime.name,
    symbol: runtime.symbol,
    presetId: runtime.presetId.toString(),
    presetName: dep.preset.name,
    creator: getAddress(runtime.creator),
    txHash: launch.txHash,
    chainId: 97,
    quoteAsset: getAddress(runtime.quoteAsset),
    createdAt: "", // the create block's time, below
    // This launch's composition, gate and outcome, as the chain holds them at readAtBlock.
    vault: getAddress(runtime.vault),
    migrateModule: getAddress(runtime.migrateModule),
    curveModule: getAddress(runtime.curveModule),
    tradeModule: getAddress(runtime.tradeModule),
    tokenModule: getAddress(runtime.tokenModule),
    maxSupply: runtime.maxSupply,
    saleAmount: runtime.saleAmount,
    raiseAmount: runtime.raiseAmount,
    antiSniperEnabled: runtime.antiSniperEnabled,
    gate: { agent: params.agent, scope: params.scope, scopeLabel: "gate-record/ercot-da-energy", minOd: params.minOd, minLeafCount: params.minLeafCount, codeHash: params.codeHash, outcomeStage: params.outcomeStage, liquidityPredicate: params.liquidityPredicate === 0 ? "soldOut" : "raised" },
    evidence: {
      gateRecord: GATE_RECORD,
      key: evidence.key,
      od: evidence.od,
      root: evidence.root,
      boundBy: evidence.boundBy,
      boundAt: clock(evidence.boundAt),
      record: { committer: record.committer, leafCount: record.leafCount, codeHash: record.codeHash, committedAt: clock(record.committedAt), blockNumber: record.blockNumber },
      gate: clock(gate),
      committedBeforeGateSeconds: gate - record.committedAt,
    },
    phase: PHASES[phase],
    pool: {
      pair: getAddress(launch.pair),
      reserveToken: tokenIs0 ? reserves[0] : reserves[1],
      reserveQuote: tokenIs0 ? reserves[1] : reserves[0],
      lpTotalSupply: lpTotal,
      lpAtDead: lpAtSink,
    },
    records: [] as Awaited<ReturnType<typeof recordOf>>[],
    failurePaths: { readAtBlock: block, by: "eth_call, no transaction", cases: await spotChecks(launch, getAddress(runtime.creator), { od: otherEvidence.od, root: otherEvidence.root }, evidence.root) },
  });
}

const [implementation, beacon, owner] = await Promise.all([
  main.readContract({ address: registry, abi: registryAbi, functionName: "getModuleImplementation", args: [dep.module.key], blockNumber: block }),
  main.readContract({ address: registry, abi: registryAbi, functionName: "getModuleBeacon", args: [dep.module.key], blockNumber: block }),
  main.readContract({ address: registry, abi: registryAbi, functionName: "owner", blockNumber: block }),
]);
if (getAddress(implementation) !== getAddress(dep.module.implementation) || getAddress(beacon) !== getAddress(dep.module.beacon)) {
  throw new Error("the Registry no longer resolves the module to the recorded implementation and beacon");
}
const readBlock = await main.getBlock({ blockNumber: block });

for (const [i, launch] of launches.entries()) {
  const row = rows[i]!;
  for (const t of launch.transactions) row.records.push(await recordOf(t.hash, launch));
  const created = row.records.find((r) => r.action === "create");
  if (!created || created.txHash !== launch.txHash) throw new Error(`${launch.symbol}: create transaction is not ${launch.txHash}`);
  row.createdAt = created.time.utc;
}
const registration = [];
for (const t of dep.module.registration as { label: string; hash: Hash }[]) {
  const { receipt, time, servedBy } = await readTx(t.hash);
  registration.push({ label: t.label, txHash: t.hash, status: receipt.status, blockNumber: receipt.blockNumber, time, contractAddress: receipt.contractAddress ?? null, gasUsed: receipt.gasUsed, readFrom: servedBy });
}

const all = rows.flatMap((r) => r.records);
const count = (action: string, result?: string) => all.filter((r) => r.action === action && (!result || r.result === result)).length;
const out = {
  // Top-level fields beside `tokens` are ignored by the Workbench, which reads only `tokens`.
  kind: "openfour-workbench-tokens",
  description: "Every create, buy, sell and migrate of the evidence-gated launches on the developer-owned OpenFour Registry on BSC testnet, each transaction, receipt and block read from at least two of three public RPCs run by different operators, all agreeing.",
  network: "bsc-testnet",
  chainId: 97,
  forkRegistry: registry,
  registryOwner: getAddress(owner),
  core,
  tools: getAddress(dep.openFour.tools),
  forkedWith: dep.openFour.forkedWith,
  module: { tag: dep.module.tag, moduleKey: dep.module.key, implementation: getAddress(implementation), beacon: getAddress(beacon), kind: 4, registration },
  preset: { id: String(dep.preset.id), name: dep.preset.name },
  rpcs: RPCS,
  readAtBlock: { number: block, time: clock(readBlock.timestamp), latestSeen: Object.fromEntries(RPCS.map((r, i) => [r, readAt[i]])) },
  summary: { tokens: rows.length, create: count("create"), buy: count("buy"), sell: count("sell"), migrate: count("migrate", "migrated"), migrateRefused: count("migrate", "refused"), bind: count("bind") },
  tokens: rows,
};
const outPath = resolve(args.out!);
writeFileSync(outPath, `${json(out)}\n`);
console.log(json({ written: outPath, readAtBlock: block, summary: out.summary }));
