// Runs a season launch on BSC testnet, one step per call:
//   node scripts/season.ts <step> --evidence <dir> [--label season|refund]
// Steps, in order: deploy, whitelist, mint, create, back, contribute, launch,
// claim, earn, trade, sync, dispatch, try-launch, refund, read. Each transaction is simulated first; its
// hash is written before the receipt is awaited. Addresses carry over in
// <dir>/season-state.json and every step is appended to <dir>/season-run.json.
// The signer is FLAP_TESTNET_PRIVATE_KEY, and only chain 97 is accepted.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadSecrets } from "@gatelock/core/secrets";
import { scopeId } from "@gatelock/core";
import {
  encodeSeasonConfig, GATE_RECORD, LAUNCHER_HELPER, mineSalt, PORTAL, readSeason, saltSeed,
  SEASON_LAUNCHER_ABI, SEASON_TOKEN, SEASON_VAULT_ABI, TEST_USD, type SeasonConfig,
} from "@gatelock/flap";
import {
  type Abi, type Address, BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient,
  formatEther, type Hash, type Hex, http, parseAbi, parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";

const RPC = "https://bsc-testnet-rpc.publicnode.com";
const CHECK_RPC = "https://bsc-testnet-dataseed.bnbchain.org";
const KEY = "FLAP_TESTNET_PRIVATE_KEY";
const AGENT: Address = "0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8";
const SCOPE_LABEL = "gate-record/ercot-da-energy";
const V2_ROUTER: Address = "0xc9D63ddCB9549578057EAB6A83a543DdFEE2b8c3";

const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function mint(address to, uint256 amount)",
]);
const PORTAL_ABI = parseAbi([
  "function SALT_LOCK_FEE() view returns (uint256)",
  "function newLauncher(address launcherFactory, bytes data) payable returns (address launcher)",
  "function launcherFactoryMultiplier(address factory) view returns (bool enabled, uint16 multiplierBps)",
  "function getLauncher(address launcher) view returns ((address launcherFactory) record)",
  "function getLaunchVault(address token) view returns (address vault, address vaultFactory)",
]);
const HELPER_ABI = parseAbi(["function whitelist(address factory)"]);
const ROUTER_ABI = parseAbi([
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
]);
const TAX_ABI = parseAbi([
  "function taxProcessor() view returns (address)",
  "function dispatch()",
  "function feeQuoteBalance() view returns (uint256)",
  "function marketQuoteBalance() view returns (uint256)",
  "function lpQuoteBalance() view returns (uint256)",
]);

const here = dirname(fileURLToPath(import.meta.url));
const artifact = (name: string) =>
  JSON.parse(readFileSync(join(here, `../artifacts/contracts/${name}.sol/${name}.json`), "utf8")) as { abi: Abi; bytecode: Hex };

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { evidence: { type: "string" }, label: { type: "string", default: "season" } },
});
const step = positionals[0];
if (!step || !values.evidence) throw new Error("usage: season.ts <step> --evidence <dir> [--label season|refund]");
const dir = resolve(values.evidence);
mkdirSync(dir, { recursive: true });
const statePath = join(dir, "season-state.json");
const runPath = join(dir, "season-run.json");

type Launch = { address?: Address; salt?: Hex; predictedToken?: Address; config?: Record<string, unknown> };
interface State {
  wallet?: Address;
  launcherFactory?: Address;
  vaultFactory?: Address;
  launchers: Record<string, Launch>;
}
const state: State = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { launchers: {} };
const run = existsSync(runPath)
  ? JSON.parse(readFileSync(runPath, "utf8"))
  : { network: { name: "BSC testnet", chainId: 97, rpc: RPC, checkRpc: CHECK_RPC }, steps: [] as unknown[] };
const json = (v: unknown) => JSON.stringify(v, (_k, x: unknown) => (typeof x === "bigint" ? x.toString() : x), 2);
const save = () => {
  writeFileSync(statePath, `${json(state)}\n`);
  writeFileSync(runPath, `${json(run)}\n`);
};

const stamp = (unix: bigint | number) => {
  const at = new Date(Number(unix) * 1000);
  const fmt = (timeZone: string) => at.toLocaleString("sv-SE", { timeZone, hourCycle: "h23" });
  return { unix: Number(unix), ct: `${fmt("America/Chicago")} CT`, bangkok: `${fmt("Asia/Bangkok")} Bangkok` };
};

const reader = createPublicClient({ chain: bscTestnet, transport: http(RPC, { timeout: 30_000 }) });
const checker = createPublicClient({ chain: bscTestnet, transport: http(CHECK_RPC, { timeout: 30_000 }) });

// The chain is checked before the key is read.
for (const c of [reader, checker]) {
  const id = await c.getChainId();
  if (id !== 97) throw new Error(`RPC reports chain ${id}; this runner only uses BSC testnet (97)`);
}
const { [KEY]: raw } = loadSecrets([KEY]);
const account = privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as Hex);
const wallet = createWalletClient({ chain: bscTestnet, transport: http(RPC, { timeout: 30_000 }), account });
const me = account.address;
state.wallet = me;

const launch = (label = values.label as string): Launch => (state.launchers[label] ??= {});
const need = <T>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new Error(`run the step that creates ${what} first`);
  return v;
};

function revertText(err: unknown): string {
  if (err instanceof BaseError) {
    const r = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) {
      return `${r.data?.errorName ?? "revert"}(${(r.data?.args ?? []).map(String).join(", ")}) ${r.reason ?? ""}`.trim();
    }
    return err.shortMessage;
  }
  return String(err);
}

interface Tx {
  label: string;
  address?: Address;
  abi: Abi;
  functionName?: string;
  args?: readonly unknown[];
  value?: bigint;
  bytecode?: Hex;
  decision?: { before: string; after: string };
}

async function send(tx: Tx) {
  const entry: Record<string, unknown> = {
    step, label: tx.label, observedAt: stamp(Math.floor(Date.now() / 1000)), from: me,
    to: tx.address ?? null, function: tx.functionName ?? "constructor", args: tx.args ?? [], value: tx.value ?? 0n,
  };
  run.steps.push(entry);
  const gasPrice = await reader.getGasPrice();
  let hash: Hash;
  try {
    if (tx.bytecode) {
      hash = await wallet.deployContract({ abi: tx.abi, bytecode: tx.bytecode, args: tx.args ?? [], gasPrice } as never);
    } else {
      const { request, result } = await reader.simulateContract({
        account, address: need(tx.address, "the target"), abi: tx.abi, functionName: tx.functionName as never,
        args: (tx.args ?? []) as never, value: tx.value,
      } as never);
      entry.simulated = result ?? null;
      hash = await wallet.writeContract({ ...(request as object), gasPrice } as never);
    }
  } catch (err) {
    entry.refused = revertText(err);
    save();
    throw new Error(`${tx.label}: ${entry.refused}`);
  }
  entry.hash = hash;
  save();
  const receipt = await reader.waitForTransactionReceipt({ hash, timeout: 180_000 });
  const block = await reader.getBlock({ blockNumber: receipt.blockNumber });
  const check = await checker.getTransactionReceipt({ hash });
  entry.receipt = {
    status: receipt.status, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, blockTime: stamp(block.timestamp),
    gasUsed: receipt.gasUsed, effectiveGasPriceWei: receipt.effectiveGasPrice,
    feeTbnb: formatEther(receipt.gasUsed * receipt.effectiveGasPrice), contractAddress: receipt.contractAddress ?? null,
    logCount: receipt.logs.length, secondRpc: { endpoint: CHECK_RPC, status: check.status, blockNumber: check.blockNumber },
  };
  if (tx.decision) entry.decision = tx.decision;
  save();
  if (receipt.status !== "success") throw new Error(`${tx.label} reverted on chain: ${hash}`);
  console.log(`${tx.label}: ${hash} block ${receipt.blockNumber}`);
  return { hash, receipt, entry };
}

const note = (label: string, data: Record<string, unknown>) => {
  run.steps.push({ step, label, observedAt: stamp(Math.floor(Date.now() / 1000)), ...data });
  save();
};
const read = <T>(address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []) =>
  reader.readContract({ address, abi, functionName, args } as never) as Promise<T>;

const L = (label?: string) => need(launch(label).address, `the ${label ?? values.label} Launcher`);

switch (step) {
  case "deploy": {
    const a = artifact("SeasonLauncherFactory");
    const { receipt } = await send({
      label: "deploy SeasonLauncherFactory", abi: a.abi, bytecode: a.bytecode, args: [PORTAL, TEST_USD, GATE_RECORD],
      decision: { before: "No Wattness Launcher factory on chain 97.", after: "Factory and its paired vault factory deployed." },
    });
    state.launcherFactory = need(receipt.contractAddress ?? undefined, "a contract address");
    state.vaultFactory = await read<Address>(state.launcherFactory, a.abi, "vaultFactory");
    note("deployment", { launcherFactory: state.launcherFactory, vaultFactory: state.vaultFactory, deployer: await read<Address>(state.launcherFactory, a.abi, "deployer") });
    break;
  }
  case "whitelist": {
    const factory = need(state.launcherFactory, "the factory");
    const before = await read<readonly [boolean, number]>(PORTAL, PORTAL_ABI, "launcherFactoryMultiplier", [factory]);
    await send({
      label: "enable the Launcher factory through the testnet helper", address: LAUNCHER_HELPER, abi: HELPER_ABI,
      functionName: "whitelist", args: [factory],
      decision: { before: `launcherFactoryMultiplier = (${before.join(", ")})`, after: "read back below" },
    });
    const after = await read<readonly [boolean, number]>(PORTAL, PORTAL_ABI, "launcherFactoryMultiplier", [factory]);
    note("multiplier read back", { factory, before, after });
    if (!after[0]) throw new Error("factory still disabled");
    break;
  }
  case "mint": {
    // The faucet page calls mint(to, 1000e18) on the test USD contract; so does this step.
    const before = await read<bigint>(TEST_USD, ERC20, "balanceOf", [me]);
    await send({ label: "mint 1,000 test USD, as the faucet does", address: TEST_USD, abi: ERC20, functionName: "mint", args: [me, parseEther("1000")] });
    note("test USD balance", { before: formatEther(before), after: formatEther(await read<bigint>(TEST_USD, ERC20, "balanceOf", [me])) });
    break;
  }
  case "create": {
    const factory = need(state.launcherFactory, "the factory");
    const label = values.label as string;
    const now = BigInt(Math.floor(Date.now() / 1000));
    const mined = mineSalt(saltSeed(`wattness-grand-prix/${label}/${factory}/${now}`));
    const refund = label === "refund";
    const config: SeasonConfig = {
      name: refund ? `${SEASON_TOKEN.name} Refund Test` : SEASON_TOKEN.name,
      symbol: SEASON_TOKEN.symbol,
      meta: "",
      salt: mined.salt,
      minRaise: parseEther(refund ? "10" : "1500"),
      raiseCap: parseEther("2000"),
      walletCap: parseEther("2000"),
      // A refund round closes in four minutes, with a milestone that will not be sealed by then.
      deadline: refund ? now + 240n : now + 2n * 86_400n,
      milestoneCommitter: AGENT,
      milestoneOd: refund ? 20261231 : 20261126,
      milestoneStage: 0,
      scope: scopeId(SCOPE_LABEL),
      seasonDays: [20261126, 20261127],
      earnedBps: 2_000,
      rewardCap: parseEther("100"),
      taxRoute: 0,
    };
    const fee = await read<bigint>(PORTAL, PORTAL_ABI, "SALT_LOCK_FEE");
    const { entry } = await send({
      label: `create the ${label} Launcher through Portal.newLauncher`, address: PORTAL, abi: PORTAL_ABI,
      functionName: "newLauncher", args: [factory, encodeSeasonConfig(config)], value: fee,
      decision: refund
        ? { before: "No refund-path Launcher.", after: "A Launcher whose milestone (OD 20261231) cannot be sealed before its four-minute deadline." }
        : { before: "No season Launcher.", after: "A Launcher gated on the agent's sealed OD 20261126 record." },
    });
    const address = entry.simulated as Address;
    const record = await read<{ launcherFactory: Address }>(PORTAL, PORTAL_ABI, "getLauncher", [address]);
    state.launchers[label] = { address, salt: mined.salt, predictedToken: mined.token, config: { ...config, saltTries: mined.tries } };
    note("Launcher recorded by the Portal", {
      launcher: address, portalRecord: record, predictedToken: mined.token, saltTries: mined.tries,
      description: await read<string>(address, SEASON_LAUNCHER_ABI as Abi, "description"),
    });
    break;
  }
  case "back": {
    await send({
      label: "back the Wattness agent with this wallet's deposit", address: L(), abi: SEASON_LAUNCHER_ABI as Abi, functionName: "back", args: [AGENT],
      decision: { before: "Deposit weighted by this wallet's own GateRecord days (none).", after: "Deposit weighted by the agent's sealed-before-gate days." },
    });
    break;
  }
  case "contribute": {
    const launcher = L();
    const amount = parseEther(values.label === "refund" ? "20" : "1600");
    await send({ label: "approve the Launcher for the contribution", address: TEST_USD, abi: ERC20, functionName: "approve", args: [launcher, amount] });
    await send({ label: `contributeQuote(${formatEther(amount)} USD)`, address: launcher, abi: SEASON_LAUNCHER_ABI as Abi, functionName: "contributeQuote", args: [amount] });
    break;
  }
  case "launch": {
    const launcher = L();
    const { entry } = await send({
      label: "launch the season token through the Portal", address: launcher, abi: SEASON_LAUNCHER_ABI as Abi, functionName: "launch",
      decision: { before: "Milestone met on chain and the raise at or above minRaise: the round may launch.", after: "Token, pool and vault read back below." },
    });
    const view = await readSeason(reader, launcher);
    const token = need(view.token.address ?? undefined, "the token");
    note("launch read back", {
      simulated: entry.simulated, predictedToken: launch().predictedToken, token, pool: view.token.pool, vault: view.vault?.address,
      portalLaunchVault: await read<readonly [Address, Address]>(PORTAL, PORTAL_ABI, "getLaunchVault", [token]),
      launcherReserve: formatEther(await read<bigint>(token, ERC20, "balanceOf", [launcher])),
      vaultTokens: view.vault ? formatEther(view.vault.tokenBalance) : null,
    });
    break;
  }
  case "claim": {
    const launcher = L();
    const token = await read<Address>(launcher, SEASON_LAUNCHER_ABI as Abi, "snapshot").then((s) => (s as unknown as { token: Address }).token);
    const before = await read<bigint>(token, ERC20, "balanceOf", [me]);
    await send({ label: "claim the contributor part of the reserve", address: launcher, abi: SEASON_LAUNCHER_ABI as Abi, functionName: "claim" });
    note("token balance", { before: formatEther(before), after: formatEther(await read<bigint>(token, ERC20, "balanceOf", [me])) });
    break;
  }
  case "earn": {
    const view = await readSeason(reader, L());
    const vault = need(view.vault?.address, "the vault");
    const token = need(view.token.address ?? undefined, "the token");
    const skill = await read<readonly [bigint, bigint]>(vault, SEASON_VAULT_ABI as Abi, "skillOf", [AGENT]);
    const claimable = await read<readonly [bigint, bigint]>(vault, SEASON_VAULT_ABI as Abi, "claimable", [me]);
    const before = { prix: await read<bigint>(token, ERC20, "balanceOf", [me]), usd: await read<bigint>(TEST_USD, ERC20, "balanceOf", [me]) };
    await send({
      label: "claim the earned share from the SeasonVault", address: vault, abi: SEASON_VAULT_ABI as Abi, functionName: "claim",
      decision: { before: `agent skill ${skill[0]}/${skill[1]} season days, read from GateRecord by the vault`, after: `claimable quote ${formatEther(claimable[0])}, tokens ${formatEther(claimable[1])}` },
    });
    note("earned claim read back", {
      skill, claimable, before: { prix: formatEther(before.prix), usd: formatEther(before.usd) },
      after: { prix: formatEther(await read<bigint>(token, ERC20, "balanceOf", [me])), usd: formatEther(await read<bigint>(TEST_USD, ERC20, "balanceOf", [me])) },
    });
    break;
  }
  case "trade": {
    const view = await readSeason(reader, L());
    const token = need(view.token.address ?? undefined, "the token");
    const amount = parseEther("200");
    await send({ label: "approve the V2 router for test USD", address: TEST_USD, abi: ERC20, functionName: "approve", args: [V2_ROUTER, amount] });
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    await send({ label: "buy PRIX with 200 test USD", address: V2_ROUTER, abi: ROUTER_ABI, functionName: "swapExactTokensForTokensSupportingFeeOnTransferTokens", args: [amount, 0n, [TEST_USD, token], me, deadline] });
    const held = await read<bigint>(token, ERC20, "balanceOf", [me]);
    const sell = held / 4n;
    await send({ label: "approve the V2 router for PRIX", address: token, abi: ERC20, functionName: "approve", args: [V2_ROUTER, sell] });
    await send({ label: "sell a quarter of the PRIX held", address: V2_ROUTER, abi: ROUTER_ABI, functionName: "swapExactTokensForTokensSupportingFeeOnTransferTokens", args: [sell, 0n, [token, TEST_USD], me, deadline] });
    const processor = await read<Address>(token, TAX_ABI, "taxProcessor");
    const balances = {
      feeQuote: await read<bigint>(processor, TAX_ABI, "feeQuoteBalance").catch(() => null),
      marketQuote: await read<bigint>(processor, TAX_ABI, "marketQuoteBalance").catch(() => null),
      lpQuote: await read<bigint>(processor, TAX_ABI, "lpQuoteBalance").catch(() => null),
      processorTokens: await read<bigint>(token, ERC20, "balanceOf", [processor]),
      tokenContractTokens: await read<bigint>(token, ERC20, "balanceOf", [token]),
    };
    note("tax processor after trades", { processor, balances });
    break;
  }
  case "dispatch": {
    const view = await readSeason(reader, L());
    const token = need(view.token.address ?? undefined, "the token");
    const vault = need(view.vault?.address, "the vault");
    const processor = await read<Address>(token, TAX_ABI, "taxProcessor");
    const before = await read<bigint>(TEST_USD, ERC20, "balanceOf", [vault]);
    await send({ label: "dispatch the liquidated tax to the fee slots", address: processor, abi: TAX_ABI, functionName: "dispatch" });
    await send({ label: "credit the vault by balance delta", address: vault, abi: SEASON_VAULT_ABI as Abi, functionName: "sync" });
    const after = await readSeason(reader, L());
    note("vault after dispatch", { vaultQuoteBefore: formatEther(before), vault: after.vault });
    break;
  }
  case "sync": {
    const before = await readSeason(reader, L());
    const vault = need(before.vault?.address, "the vault");
    await send({
      label: "credit the vault's tax receipts by balance delta", address: vault, abi: SEASON_VAULT_ABI as Abi, functionName: "sync",
      decision: { before: `pooled ${formatEther(before.vault?.pooled ?? 0n)} of cap ${formatEther(before.vault?.rewardCap ?? 0n)}, balance ${formatEther(before.vault?.quoteBalance ?? 0n)}`, after: "read back below" },
    });
    const after = await readSeason(reader, L());
    note("vault after sync", { before: before.vault, after: after.vault });
    break;
  }
  case "try-launch": {
    // A simulation only: records why the round may not launch yet.
    try {
      await reader.simulateContract({ account, address: L(), abi: SEASON_LAUNCHER_ABI as Abi, functionName: "launch" } as never);
      note("launch simulation", { launcher: L(), result: "would launch" });
    } catch (err) {
      note("launch simulation", { launcher: L(), refused: revertText(err), milestoneMet: (await readSeason(reader, L())).milestone.met });
    }
    break;
  }
  case "refund": {
    const launcher = L("refund");
    const before = await read<bigint>(TEST_USD, ERC20, "balanceOf", [me]);
    await send({
      label: "refund the contribution after the deadline", address: launcher, abi: SEASON_LAUNCHER_ABI as Abi, functionName: "refund",
      decision: { before: "Deadline passed and the milestone record (OD 20261231) does not exist: the round cannot launch.", after: "Contribution returned." },
    });
    note("test USD balance", { before: formatEther(before), after: formatEther(await read<bigint>(TEST_USD, ERC20, "balanceOf", [me])) });
    break;
  }
  case "read": {
    const label = values.label as string;
    const block = await reader.getBlockNumber();
    const view = await readSeason(reader, L(label), block);
    writeFileSync(join(dir, `season-read.${label}.json`), `${json({ observedAt: stamp(Math.floor(Date.now() / 1000)), view })}\n`);
    console.log(json(view));
    break;
  }
  default:
    throw new Error(`unknown step ${step}`);
}
save();
