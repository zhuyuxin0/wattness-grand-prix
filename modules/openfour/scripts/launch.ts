// Runs one step of the evidence-gated PLNR launch on a developer-owned OpenFour
// deployment, on BSC testnet (97) or a local fork of it (31337), and writes
// what it sent and observed to the evidence directory.
//
//   node scripts/launch.ts <step> --fork <fork-deployment.json> --evidence <dir> [--rpc <url>]
//
// Steps, in order: deploy, create, buy, graduate [--expect-revert], bind --od --root,
// graduate, status, verify. The fork file is the fork toolkit's output; the
// evidence directory also keeps the launch state between steps.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { scopeId } from "@gatelock/core";
import { loadSecrets } from "@gatelock/core/secrets";
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
  parseEther,
  parseEventLogs,
  stringToBytes,
  type Abi,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { encodeModuleParams, type ModuleEncodeSchema } from "../src/schema.ts";
import { EVIDENCE_GATED_TAG, evidenceGatedMigrateAbi, explainRevert, readLaunchTower } from "../src/launch-tower.ts";

// Placeholders, one constant each.
const TOKEN_NAME = "Grand Prix Planner";
const TOKEN_SYMBOL = "PLNR";

const TESTNET_RPC = "https://bsc-testnet.publicnode.com";
const SECOND_RPC = "https://bsc-testnet-dataseed.bnbchain.org";
const GATE_RECORD: Address = "0x2922c68cE15EB3e83B7f43b136e981dDc4262876";
const PANCAKE_V2_FACTORY: Address = "0x6725F303b657a9451d8BA641348b6761A6CC7a17";
const MIGRATE_KIND = 4;
const TESTNET_GAS_PRICE = 100_000_000n; // 0.1 gwei, the testnet RPC's quote
const LAUNCH = {
  maxSupply: parseEther("10000000000"),
  saleAmount: parseEther("8000000000"),
  raiseAmount: parseEther("0.1"),
  buyBudget: parseEther("0.12"),
};
const PHASES = ["Created", "Trading", "MigratePending", "Migrated", "Terminal", "SoldOut"];
const ZERO32 = `0x${"0".repeat(64)}` as Hex;

const PRESET_T =
  "(uint256 id,string name,string description,string version,bool active,bool createEnabled,address validator,bytes32 tokenModuleId,bytes32 vaultModuleId,bytes32 curveModuleId,bytes32 tradeModuleId,bytes32 migrateModuleId,bytes32 tokenImplId,bytes32 customDataId,address author)";
const SCHEMA_T =
  "(string kind,uint8 version,(string name,string abiType,uint8 decimals,bool optional,string title,string defaultValue,string hint,string minValue,string maxValue)[] params)";
const ESTIMATE_T = "(uint256 curveQuote,uint256 totalFee,uint256 userPays,uint256 userReceives,uint256 tokenAmount,uint256 executionPrice)";
const CREATE_T =
  "(uint256 requestId,uint256 presetId,uint256 validTimestamp,uint256 createFee,uint256 presaleQuote,bool antiSniperEnabled,address partner,(string name,string symbol,string tokenUri,uint256 maxSupply,uint256 saleAmount,uint256 raiseAmount,address quoteAsset,bytes32 tokenSalt,bytes tokenParams,bytes vaultParams,bytes curveParams,bytes tradeParams,bytes migrateParams,bytes customDataParams) initParams)";

const registryAbi = parseAbi([
  `function getPreset(uint256 presetId) view returns (${PRESET_T})`,
  `function upsertPreset(${PRESET_T} preset)`,
  "function upsertModule(bytes32 moduleKey, address implementation, uint8 kind, (bytes32 moduleId, string version, string name, string description, address author, uint16 feeShareBps) metadata, bool active)",
  "function getModuleImplementation(bytes32 moduleKey) view returns (address)",
  "function getModuleBeacon(bytes32 moduleKey) view returns (address)",
  "function owner() view returns (address)",
]);
const coreAbi = parseAbi([
  "function createToken(bytes createArgs, bytes signature) payable returns (address)",
  "function buyByBudget(address token,uint256 maxPayAmount,uint256 minAmountOut,uint256 options,bytes proof) payable",
  "function signer() view returns (address)",
  "function registry() view returns (address)",
  "function tokens(address) view returns (uint32 version,address creator,uint256 presetId,address token,string name,string symbol,uint256 maxSupply,uint256 saleAmount,uint256 raiseAmount,address quoteAsset,address vault,address curveModule,address tradeModule,address migrateModule,address tokenModule,address customData,uint256 createBlock,bool exists,bool paused,bool antiSniperEnabled)",
  "event TokenCreated(uint256 requestId, uint256 indexed presetId, address indexed creator, address indexed token, string name, string symbol, uint256 maxSupply, uint256 saleAmount, uint256 raiseAmount, uint256 initialPrice, address quoteAsset, address vault, address curveModule, address tradeModule, address migrateModule, address customData, address tokenModule, string tokenMetaUri, uint256 flags, bytes encodedTags)",
  "event TradeExecuted(address indexed token, address indexed trader, uint256 indexed presetId, bool isBuy, address quoteAsset, address vault, uint256 requestedTokenAmount, uint256 tokenAmount, uint256 curveQuoteAmount, uint256 traderQuoteAmount, uint256 lastPrice, uint256 slippageLimit, uint256 protocolFee, uint256 taxFee, uint256 devFee, uint256 antiSniperFee, uint256 totalRaised, uint256 remainingForSale)",
  "event MigrateExecuted(uint256 indexed presetId, address indexed caller, address indexed token, address vault, address migrateModule, bytes8 migrateTagId, uint256 totalRaised, uint256 remainingForSale, bytes32 hookDataHash, uint8 migratedDataVersion, bytes encodedMigratedData)",
  "event PhaseTransition(address indexed token, uint8 from, uint8 to, address operator)",
]);
// Typed as a plain Abi: six nested schema tuples are past what the checker can infer.
const toolsAbi: Abi = parseAbi([
  `function getPresetEncodeSchemas(uint256 presetId) view returns (${SCHEMA_T},${SCHEMA_T},${SCHEMA_T},${SCHEMA_T},${SCHEMA_T},${SCHEMA_T})`,
] as string[]);
// Not a view in the ABI (it may quote through external routers); run it with eth_call only.
const estimateAbi = parseAbi([
  `function estimateBuyByBudget(address token,address trader,uint256 maxQuotePayAmount,uint256 options,bytes proof) returns (${ESTIMATE_T})`,
]);
const vaultAbi = parseAbi([
  "function phase() view returns (uint8)",
  "function isSoldOut() view returns (bool)",
  "function remainingForSale() view returns (uint256)",
  "function totalRaised() view returns (uint256)",
  "function soldAmount() view returns (uint256)",
]);
const erc20Abi = parseAbi([
  "function deposit() payable",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);
const pairAbi = parseAbi([
  "function token0() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "event Mint(address indexed sender, uint256 amount0, uint256 amount1)",
  "event Sync(uint112 reserve0, uint112 reserve1)",
]);
const gateRecordAbi = parseAbi([
  "function get(bytes32 key) view returns ((bytes32 root,bytes32 codeHash,bytes32 scope,address committer,uint32 od,uint32 leafCount,uint64 committedAt,uint64 blockNumber))",
  "function gateTs(uint32 od) pure returns (uint256)",
]);

const here = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = join(here, "../artifacts/contracts/EvidenceGatedMigrateModule.sol/EvidenceGatedMigrateModule.json");

const { positionals, values: args } = parseArgs({
  allowPositionals: true,
  options: {
    fork: { type: "string" },
    evidence: { type: "string" },
    rpc: { type: "string" },
    agent: { type: "string" },
    "scope-label": { type: "string", default: "gate-record/ercot-da-energy" },
    "min-od": { type: "string" },
    "min-leaves": { type: "string", default: "1" },
    "code-hash": { type: "string" },
    od: { type: "string" },
    root: { type: "string" },
    "expect-revert": { type: "boolean", default: false },
  },
});
const step = positionals[0];
if (!step || !args.fork || !args.evidence) {
  throw new Error("usage: node scripts/launch.ts <deploy|create|buy|graduate|bind|status|verify> --fork <file> --evidence <dir>");
}

// ---- evidence ----

const stamp = (d: Date) => ({
  utc: d.toISOString(),
  ct: `${d.toLocaleString("en-US", { timeZone: "America/Chicago", hour12: false })} CT`,
  bangkok: `${d.toLocaleString("en-US", { timeZone: "Asia/Bangkok", hour12: false })} Bangkok`,
});
const json = (v: unknown) => JSON.stringify(v, (_, x: unknown) => (typeof x === "bigint" ? x.toString() : x), 2);
const evidenceDir = resolve(args.evidence);
mkdirSync(join(evidenceDir, "steps"), { recursive: true });
const statePath = join(evidenceDir, "launch-state.json");
const state: Record<string, any> = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
const fork = JSON.parse(readFileSync(resolve(args.fork), "utf8"));
const A = fork.addresses as { registry: Address; core: Address; tools: Address; feeRouter: Address; wbnb: Address };

const requests: unknown[] = [];
const REQUEST_ID_HEADERS = ["cf-ray", "x-request-id", "x-amzn-requestid", "x-amz-cf-id"];
const loggedFetch: typeof fetch = async (input, init) => {
  const at = new Date().toISOString();
  const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
  const res = await fetch(input, init);
  const payload = (await res
    .clone()
    .json()
    .catch(() => null)) as unknown;
  const ids = Object.fromEntries(REQUEST_ID_HEADERS.flatMap((h) => (res.headers.get(h) ? [[h, res.headers.get(h)]] : [])));
  requests.push({ at, endpoint: String(input), request: body, httpStatus: res.status, requestIds: ids, response: payload });
  return res;
};

const rpc = args.rpc ?? TESTNET_RPC;
const probeChain = await (
  await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' })
).json();
const chainId = Number.parseInt((probeChain as { result: string }).result, 16);
if (chainId !== 97 && chainId !== 31337) throw new Error(`refusing chain ${chainId}: only 97 and 31337`);
if (state.chainId !== undefined && state.chainId !== chainId) throw new Error(`state is for chain ${state.chainId}, RPC is ${chainId}`);
const chain: Chain = {
  id: chainId,
  name: chainId === 97 ? "BSC testnet" : "local fork",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
};
const transport = http(rpc, { fetchFn: loggedFetch, retryCount: 2, timeout: 30_000 });
const reader = createPublicClient({ chain, transport, pollingInterval: 1_000 });

const secrets = loadSecrets(["OPENFOUR_TESTNET_PRIVATE_KEY", "OPENFOUR_TESTNET_ADDRESS"]);
const rawKey = secrets.OPENFOUR_TESTNET_PRIVATE_KEY.startsWith("0x")
  ? secrets.OPENFOUR_TESTNET_PRIVATE_KEY
  : `0x${secrets.OPENFOUR_TESTNET_PRIVATE_KEY}`;
const account = privateKeyToAccount(rawKey as Hex);
if (getAddress(account.address) !== getAddress(secrets.OPENFOUR_TESTNET_ADDRESS)) throw new Error("key does not match OPENFOUR_TESTNET_ADDRESS");
const wallet = createWalletClient({ chain, transport, account });
const fees = chainId === 97 ? { gasPrice: TESTNET_GAS_PRICE, type: "legacy" as const } : {};

const startedAt = new Date();
const transactions: unknown[] = [];

// Requests are checked against their ABIs by viem at run time; the union of every
// step's call shapes is too wide for its static types.
async function sendTx(label: string, request: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint }): Promise<TransactionReceipt> {
  const hash = await wallet.writeContract({ ...request, ...fees } as never);
  return record(label, hash);
}

const readSchemas = async (presetId: bigint) =>
  (await reader.readContract({ address: A.tools, abi: toolsAbi, functionName: "getPresetEncodeSchemas", args: [presetId] })) as readonly ModuleEncodeSchema[];

async function record(label: string, hash: Hash, expect: "success" | "reverted" = "success"): Promise<TransactionReceipt> {
  const receipt = await reader.waitForTransactionReceipt({ hash, timeout: 180_000 });
  const block = await reader.getBlock({ blockNumber: receipt.blockNumber });
  transactions.push({
    label,
    hash,
    status: receipt.status,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    blockTime: stamp(new Date(Number(block.timestamp) * 1000)),
    from: receipt.from,
    to: receipt.to,
    contractAddress: receipt.contractAddress ?? null,
    gasUsed: receipt.gasUsed,
    effectiveGasPrice: receipt.effectiveGasPrice,
  });
  if (receipt.status !== expect) throw new Error(`${label} ${hash}: ${receipt.status}, expected ${expect}`);
  return receipt;
}

function revertData(err: unknown): Hex | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const carrier = err.walk((e) => {
    const x = e as { raw?: unknown; data?: unknown };
    return (typeof x.raw === "string" && x.raw.startsWith("0x")) || (typeof x.data === "string" && x.data.startsWith("0x"));
  }) as { raw?: Hex; data?: Hex } | null;
  return carrier?.raw ?? carrier?.data;
}

function save(result: unknown, decision: { before: string; after: string }) {
  const seq = String(readdirSync(join(evidenceDir, "steps")).length + 1).padStart(2, "0");
  const file = join(evidenceDir, "steps", `${seq}-${step}${args["expect-revert"] ? "-expect-revert" : ""}.json`);
  writeFileSync(
    file,
    `${json({
      step,
      network: { chainId, name: chain.name, rpc },
      account: account.address,
      startedAt: stamp(startedAt),
      finishedAt: stamp(new Date()),
      contracts: { ...A, gateRecord: GATE_RECORD, pancakeV2Factory: PANCAKE_V2_FACTORY, module: state.module ?? null, token: state.token ?? null },
      decision,
      transactions,
      result,
      requests,
    })}\n`,
  );
  writeFileSync(statePath, `${json({ ...state, chainId })}\n`);
  console.log(json({ step, file, decision, transactions }));
}

const vaultState = async (vault: Address) => ({
  phase: PHASES[await reader.readContract({ address: vault, abi: vaultAbi, functionName: "phase" })],
  soldOut: await reader.readContract({ address: vault, abi: vaultAbi, functionName: "isSoldOut" }),
  remainingForSale: await reader.readContract({ address: vault, abi: vaultAbi, functionName: "remainingForSale" }),
  totalRaised: await reader.readContract({ address: vault, abi: vaultAbi, functionName: "totalRaised" }),
});

// ---- steps ----

if (step === "deploy") {
  const owner = await reader.readContract({ address: A.registry, abi: registryAbi, functionName: "owner" });
  if (getAddress(owner) !== getAddress(account.address)) throw new Error(`Registry owner is ${owner}, not this key`);
  const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8")) as { abi: Abi; bytecode: Hex };
  const key = keccak256(stringToBytes(EVIDENCE_GATED_TAG));
  const before = await reader.readContract({ address: A.registry, abi: registryAbi, functionName: "getModuleImplementation", args: [key] }).catch(() => null);

  const deployHash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args: [GATE_RECORD, PANCAKE_V2_FACTORY], ...fees });
  const implementation = getAddress((await record("deploy EvidenceGatedMigrateModule", deployHash)).contractAddress!);
  await sendTx("registry.upsertModule module.migrate.evidence_gated", {
    address: A.registry,
    abi: registryAbi,
    functionName: "upsertModule",
    args: [
      key,
      implementation,
      MIGRATE_KIND,
      {
        moduleId: key,
        version: "1.0.0",
        name: "MIGRATE_EVIDENCE_GATED",
        description: "Graduates when the vault's liquidity predicate holds and the agent's sealed GateRecord record is bound",
        author: account.address,
        feeShareBps: 0,
      },
      true,
    ],
  });
  const bonding = await reader.readContract({ address: A.registry, abi: registryAbi, functionName: "getPreset", args: [BigInt(fork.presets.bondingV1)] });
  const presetId = BigInt(Date.now());
  await sendTx("registry.upsertPreset evidence-gated Bonding V1", {
    address: A.registry,
    abi: registryAbi,
    functionName: "upsertPreset",
    args: [
      {
        ...bonding,
        id: presetId,
        name: "Evidence-gated Bonding V1",
        description: "Bonding V1 token, vault, curve and trade; graduation needs the agent's sealed GateRecord record",
        version: "1.0.0",
        migrateModuleId: key,
        author: account.address,
      },
    ],
  });
  const [beacon, registered, preset, schemas] = await Promise.all([
    reader.readContract({ address: A.registry, abi: registryAbi, functionName: "getModuleBeacon", args: [key] }),
    reader.readContract({ address: A.registry, abi: registryAbi, functionName: "getModuleImplementation", args: [key] }),
    reader.readContract({ address: A.registry, abi: registryAbi, functionName: "getPreset", args: [presetId] }),
    readSchemas(presetId),
  ]);
  if (getAddress(registered) !== implementation) throw new Error("Registry does not resolve the module to the new implementation");
  state.module = { implementation, key, beacon, tag: EVIDENCE_GATED_TAG };
  state.presetId = presetId.toString();
  save(
    { moduleKey: key, implementation, beacon, presetId, preset, migrateSchemaFromTools: schemas[4], reusedFromBondingV1: { tokenModuleId: bonding.tokenModuleId, vaultModuleId: bonding.vaultModuleId, curveModuleId: bonding.curveModuleId, tradeModuleId: bonding.tradeModuleId, tokenImplId: bonding.tokenImplId, validator: bonding.validator } },
    {
      before: `Developer-owned Registry ${A.registry} resolves ${EVIDENCE_GATED_TAG} to ${before ?? "nothing"}; only Bonding V1 is a preset.`,
      after: `Registry resolves ${EVIDENCE_GATED_TAG} to ${implementation} (beacon ${beacon}); preset ${presetId} keeps Bonding V1's Token, Vault, Curve and Trade and replaces Migrate.`,
    },
  );
}

if (step === "create") {
  if (!state.presetId || !args.agent || !args["min-od"]) throw new Error("create needs a deployed preset, --agent and --min-od");
  const coreSigner = await reader.readContract({ address: A.core, abi: coreAbi, functionName: "signer" });
  if (getAddress(coreSigner) !== getAddress(account.address)) throw new Error(`Core signer is ${coreSigner}, not this key`);
  const presetId = BigInt(state.presetId);
  const schemas = await readSchemas(presetId);
  for (const [i, s] of schemas.entries()) if (i !== 4 && s.params.length > 0) throw new Error(`schema ${i} expects parameters`);
  const agent = getAddress(args.agent);
  const scope = scopeId(args["scope-label"]!);
  const values = [agent, scope, Number(args["min-od"]), Number(args["min-leaves"]), (args["code-hash"] as Hex | undefined) ?? ZERO32, 0, 0, 0n];
  const migrateParams = encodeModuleParams(schemas[4]!, values);
  const now = (await reader.getBlock()).timestamp;
  const requestId = BigInt(Date.now());
  const createArgs = encodeAbiParameters(parseAbiParameters(CREATE_T), [
    {
      requestId,
      presetId,
      validTimestamp: now + 3600n,
      createFee: 0n,
      presaleQuote: 0n,
      antiSniperEnabled: false,
      partner: "0x0000000000000000000000000000000000000000",
      initParams: {
        name: TOKEN_NAME,
        symbol: TOKEN_SYMBOL,
        tokenUri: "",
        maxSupply: LAUNCH.maxSupply,
        saleAmount: LAUNCH.saleAmount,
        raiseAmount: LAUNCH.raiseAmount,
        quoteAsset: A.wbnb,
        tokenSalt: ZERO32,
        tokenParams: "0x",
        vaultParams: "0x",
        curveParams: "0x",
        tradeParams: "0x",
        migrateParams,
        customDataParams: "0x",
      },
    },
  ]);
  // Core recovers its signer from this digest (the toolkit's scheme for a developer-owned fork).
  const digest = keccak256(encodePacked(["string", "uint256", "address", "bytes32"], ["createOpenFourToken", BigInt(chainId), account.address, keccak256(createArgs)]));
  const signature = await account.signMessage({ message: { raw: digest } });
  await reader.simulateContract({ account, address: A.core, abi: coreAbi, functionName: "createToken", args: [createArgs, signature] });
  const receipt = await sendTx("core.createToken PLNR", { address: A.core, abi: coreAbi, functionName: "createToken", args: [createArgs, signature] });
  const [created] = parseEventLogs({ abi: coreAbi, logs: receipt.logs, eventName: "TokenCreated" });
  if (!created) throw new Error("no TokenCreated");
  const { token, vault, migrateModule } = created.args;
  const params = await reader.readContract({ address: migrateModule, abi: evidenceGatedMigrateAbi, functionName: "params" });
  const descriptor = await reader.readContract({ address: migrateModule, abi: evidenceGatedMigrateAbi, functionName: "descriptor" });
  state.token = { address: token, vault, migrateModule, requestId: requestId.toString(), agent, scope, minOd: Number(args["min-od"]) };
  save(
    { requestId, presetId, token, vault, migrateModule, tokenCreated: created.args, migrateParams, decodedParams: params, descriptor, vault0: await vaultState(vault) },
    {
      before: "No PLNR launch on the developer-owned Core.",
      after: `PLNR ${token} launched; it graduates only when the vault sells out and agent ${agent}'s sealed record for scope ${scope}, day ${args["min-od"]} or later, is bound.`,
    },
  );
}

if (step === "buy") {
  const { address: token, vault } = state.token as { address: Address; vault: Address };
  const before = await vaultState(vault);
  const wbnbBalance = await reader.readContract({ address: A.wbnb, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  if (wbnbBalance < LAUNCH.buyBudget) {
    await sendTx("wbnb.deposit", { address: A.wbnb, abi: erc20Abi, functionName: "deposit", value: LAUNCH.buyBudget - wbnbBalance });
  }
  const allowance = await reader.readContract({ address: A.wbnb, abi: erc20Abi, functionName: "allowance", args: [account.address, A.core] });
  if (allowance < LAUNCH.buyBudget) {
    await sendTx("wbnb.approve core", { address: A.wbnb, abi: erc20Abi, functionName: "approve", args: [A.core, LAUNCH.buyBudget] });
  }
  const trades: unknown[] = [];
  for (let round = 0; round < 4 && !(await reader.readContract({ address: vault, abi: vaultAbi, functionName: "isSoldOut" })); round++) {
    const { result: estimate } = await reader.simulateContract({ account, address: A.tools, abi: estimateAbi, functionName: "estimateBuyByBudget", args: [token, account.address, LAUNCH.buyBudget, 0n, "0x"] });
    if (estimate.tokenAmount === 0n) break;
    const receipt = await sendTx(`core.buyByBudget round ${round + 1}`, {
      address: A.core,
      abi: coreAbi,
      functionName: "buyByBudget",
      args: [token, LAUNCH.buyBudget, (estimate.tokenAmount * 99n) / 100n, 0n, "0x"],
    });
    trades.push({ estimate, events: parseEventLogs({ abi: coreAbi, logs: receipt.logs }).map((e) => ({ event: e.eventName, args: e.args })) });
  }
  const after = await vaultState(vault);
  const status = await reader.readContract({ address: state.token.migrateModule, abi: evidenceGatedMigrateAbi, functionName: "status" });
  save(
    { before, after, trades, moduleStatus: status },
    {
      before: `Sale open: phase ${before.phase}, ${before.remainingForSale} token wei unsold.`,
      after: `Phase ${after.phase}, sold out ${after.soldOut}, raised ${after.totalRaised} wei; evidence bound ${status.evidenceBound}, so the buy closed the sale without migrating.`,
    },
  );
}

if (step === "graduate") {
  const module = state.token.migrateModule as Address;
  const data = encodeFunctionData({ abi: evidenceGatedMigrateAbi, functionName: "graduate" });
  const before = { vault: await vaultState(state.token.vault), status: await reader.readContract({ address: module, abi: evidenceGatedMigrateAbi, functionName: "status" }) };
  let simulated: { reverted: boolean; data?: Hex; error?: ReturnType<typeof explainRevert> } = { reverted: false };
  try {
    await reader.call({ account, to: module, data });
  } catch (err) {
    const raw = revertData(err);
    simulated = { reverted: true, ...(raw ? { data: raw, error: explainRevert(raw) } : {}) };
  }
  if (args["expect-revert"]) {
    if (!simulated.reverted || !simulated.error) throw new Error("graduate() did not revert with a module error in simulation; not sending");
    // A fixed gas limit lets the reverting call be mined, so the refusal is on chain.
    const hash = await wallet.sendTransaction({ to: module, data, gas: 1_000_000n, ...fees });
    const receipt = await record("module.graduate (evidence missing)", hash, "reverted");
    let replay: { data?: Hex; error?: ReturnType<typeof explainRevert> } = {};
    try {
      await reader.call({ account, to: module, data, blockNumber: receipt.blockNumber - 1n });
    } catch (err) {
      const raw = revertData(err);
      replay = raw ? { data: raw, error: explainRevert(raw) } : {};
    }
    const after = await vaultState(state.token.vault);
    state.graduateRevert = { hash, blockNumber: receipt.blockNumber.toString(), error: simulated.error };
    save(
      { before, simulated, receipt: { status: receipt.status, gasUsed: receipt.gasUsed, logs: receipt.logs.length }, replayAtParentBlock: replay, after },
      {
        before: `Sold out ${before.vault.soldOut} (phase ${before.vault.phase}); evidence bound ${before.status.evidenceBound}.`,
        after: `graduate() reverted on chain with ${simulated.error.name}(${simulated.error.args.join(", ")}); phase stays ${after.phase}.`,
      },
    );
  } else {
    if (simulated.reverted) throw new Error(`graduate() reverts in simulation: ${json(simulated)}`);
    const receipt = await sendTx("module.graduate", { address: module, abi: evidenceGatedMigrateAbi, functionName: "graduate" });
    const events = [
      ...parseEventLogs({ abi: coreAbi, logs: receipt.logs }),
      ...parseEventLogs({ abi: evidenceGatedMigrateAbi, logs: receipt.logs }),
      ...parseEventLogs({ abi: pairAbi, logs: receipt.logs }),
    ].map((e) => ({ address: e.address, event: e.eventName, args: e.args }));
    const pair = await reader.readContract({ address: module, abi: evidenceGatedMigrateAbi, functionName: "pair" });
    const [token0, reserves, lpTotal, lpAtSink] = await Promise.all([
      reader.readContract({ address: pair, abi: pairAbi, functionName: "token0" }),
      reader.readContract({ address: pair, abi: pairAbi, functionName: "getReserves" }),
      reader.readContract({ address: pair, abi: pairAbi, functionName: "totalSupply" }),
      reader.readContract({ address: pair, abi: pairAbi, functionName: "balanceOf", args: ["0x000000000000000000000000000000000000dEaD"] }),
    ]);
    const after = await vaultState(state.token.vault);
    state.graduation = { hash: receipt.transactionHash, blockNumber: receipt.blockNumber.toString(), pair };
    save(
      { before, events, pair, token0, reserves, lpTotalSupply: lpTotal, lpAtSink, after },
      {
        before: `Sold out ${before.vault.soldOut}; evidence bound ${before.status.evidenceBound} (key ${before.status.evidence.key}).`,
        after: `Migrated: phase ${after.phase}; pair ${pair} holds reserves ${reserves[0]} / ${reserves[1]}; ${lpAtSink} LP at 0xdEaD.`,
      },
    );
  }
}

if (step === "bind") {
  if (!args.od || !args.root) throw new Error("bind needs --od and --root");
  const module = state.token.migrateModule as Address;
  const od = Number(args.od);
  const root = args.root as Hex;
  const before = await reader.readContract({ address: module, abi: evidenceGatedMigrateAbi, functionName: "evidence" });
  const key = await reader.readContract({ address: module, abi: evidenceGatedMigrateAbi, functionName: "verifyEvidence", args: [od, root] });
  const onRecord = await reader.readContract({ address: GATE_RECORD, abi: gateRecordAbi, functionName: "get", args: [key] });
  const gate = await reader.readContract({ address: GATE_RECORD, abi: gateRecordAbi, functionName: "gateTs", args: [od] });
  const receipt = await sendTx("module.bindEvidence", { address: module, abi: evidenceGatedMigrateAbi, functionName: "bindEvidence", args: [od, root] });
  const [bound] = parseEventLogs({ abi: evidenceGatedMigrateAbi, logs: receipt.logs, eventName: "EvidenceBound" });
  const status = await reader.readContract({ address: module, abi: evidenceGatedMigrateAbi, functionName: "status" });
  state.evidence = { key, od, root, hash: receipt.transactionHash };
  save(
    { verifyEvidenceKey: key, gateRecord: GATE_RECORD, recordOnChain: onRecord, gateTs: gate, committedBeforeGateBySeconds: gate - onRecord.committedAt, event: bound?.args, statusAfter: status },
    {
      before: `Evidence bound: ${before.key !== ZERO32}.`,
      after: `Bound GateRecord key ${key}: committer ${onRecord.committer}, od ${onRecord.od}, root ${onRecord.root}, ${onRecord.leafCount} leaves, committed ${gate - onRecord.committedAt} s before its gate.`,
    },
  );
}

if (step === "status" || step === "verify") {
  const reads = step === "verify" ? createPublicClient({ chain: { ...chain, rpcUrls: { default: { http: [SECOND_RPC] } } }, transport: http(SECOND_RPC, { fetchFn: loggedFetch }) }) : reader;
  if (step === "verify" && chainId !== 97) throw new Error("verify re-reads BSC testnet from a second RPC");
  const tower = await readLaunchTower(reads, { core: A.core, token: state.token.address });
  const receipts =
    step === "verify"
      ? await Promise.all(
          [state.graduateRevert?.hash, state.evidence?.hash, state.graduation?.hash].filter(Boolean).map(async (hash: Hash) => {
            const r = await reads.getTransactionReceipt({ hash });
            return { hash, status: r.status, blockNumber: r.blockNumber, gasUsed: r.gasUsed };
          }),
        )
      : [];
  save(
    { endpoint: step === "verify" ? SECOND_RPC : rpc, tower, receipts },
    { before: "Read only.", after: `Phase ${tower.vault.phase}; graduated ${tower.graduated}; blockers ${tower.blockers.join(", ") || "none"}.` },
  );
}
