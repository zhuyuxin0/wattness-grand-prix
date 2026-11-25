import { describe, expect, it } from "vitest";
import { network } from "hardhat";
import {
  BaseError,
  decodeErrorResult,
  getAddress,
  keccak256,
  parseEther,
  parseEventLogs,
  stringToBytes,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { encodeModuleParams } from "../src/schema.js";
import { evidenceGatedMigrateAbi, explainRevert, readLaunchTower } from "../src/launch-tower.js";

// 2026-11-20 00:00 UTC: the 26 Nov gate (25 Nov 16:00 UTC) is still ahead.
const GENESIS = "2026-11-20T00:00:00Z";
const OD = 20261126;
const GATE_26 = 1795622400n;
const SCOPE = keccak256(stringToBytes("gate-record/ercot-da-energy"));
const ROOT = keccak256(stringToBytes("fleet root"));
const CODE = `0x${"b83af42225f0ac312b05c5dd269f6c35502ec6b4"}${"0".repeat(24)}` as Hex;
const MAX_SUPPLY = parseEther("10000000000");
const SALE = parseEther("8000000000");
const DEAD = getAddress("0x000000000000000000000000000000000000dEaD");
const PHASE = { TRADING: 1, MIGRATE_PENDING: 2, MIGRATED: 3, SOLD_OUT: 5 } as const;

type ParamValues = {
  agent: Address;
  scope?: Hex;
  minOd?: number;
  minLeafCount?: number;
  codeHash?: Hex;
  outcomeStage?: number;
  liquidityPredicate?: number;
  minQuoteRaised?: bigint;
};

async function setup() {
  const { viem } = await network.create({ override: { initialDate: GENESIS } });
  const [launcher, agent, stranger] = await viem.getWalletClients();
  if (!launcher || !agent || !stranger) throw new Error("need three accounts");
  const reader = await viem.getPublicClient();
  const clock = await viem.getTestClient();

  const gateRecord = await viem.deployContract("GateRecord");
  const factory = await viem.deployContract("MockPancakeFactory");
  const implementation = await viem.deployContract("EvidenceGatedMigrateModule", [gateRecord.address, factory.address]);
  const core = await viem.deployContract("MockOpenFourCore");
  const quote = await viem.deployContract("MockERC20", ["Wrapped BNB", "WBNB"]);
  const schema = await implementation.read.moduleEncodeSchema();

  await gateRecord.write.commit([SCOPE, OD, ROOT, 316, CODE], { account: agent.account });
  for (const w of [launcher, stranger]) {
    await quote.write.mint([w.account.address, parseEther("10")]);
    await quote.write.approve([core.address, 2n ** 256n - 1n], { account: w.account });
  }

  const encode = (v: ParamValues) =>
    encodeModuleParams(schema, [
      v.agent,
      v.scope ?? SCOPE,
      v.minOd ?? OD,
      v.minLeafCount ?? 1,
      v.codeHash ?? `0x${"0".repeat(64)}`,
      v.outcomeStage ?? 0,
      v.liquidityPredicate ?? 0,
      v.minQuoteRaised ?? 0n,
    ]);

  async function launch(v: Partial<ParamValues> = {}) {
    const raw = encode({ agent: agent!.account.address, ...v });
    const hash = await core.write.createToken([implementation.address, raw, MAX_SUPPLY, SALE, quote.address], {
      account: launcher!.account,
    });
    const receipt = await reader.waitForTransactionReceipt({ hash });
    const [created] = parseEventLogs({ abi: core.abi, logs: receipt.logs, eventName: "TokenCreated" });
    if (!created) throw new Error("no TokenCreated");
    const { token, vault, migrateModule } = created.args;
    const as = (w: typeof launcher) =>
      viem.getContractAt("EvidenceGatedMigrateModule", migrateModule, { client: { wallet: w! } });
    return {
      raw,
      token: await viem.getContractAt("MockOpenFourToken", token),
      vault: await viem.getContractAt("MockVault", vault),
      module: await as(launcher),
      asAgent: await as(agent),
      asStranger: await as(stranger),
    };
  }

  // Buys all but `leave` tokens, then optionally the rest.
  const buy = (token: Address, amount: bigint, paid: bigint, from = launcher) =>
    core.write.buy([token, amount, paid], { account: from!.account });

  return { viem, reader, clock, gateRecord, factory, implementation, core, quote, launcher, agent, stranger, launch, buy, encode };
}

const errorAbi = [...evidenceGatedMigrateAbi] as Abi;

/** The custom error a call reverted with, decoded against the module's and GateRecord's errors. */
async function revertOf(promise: Promise<unknown>, extraAbi: Abi = []) {
  try {
    await promise;
  } catch (err) {
    if (!(err instanceof BaseError)) throw err;
    const named = err.walk((e) => (e as { data?: { errorName?: string } }).data?.errorName !== undefined) as
      | { data: { errorName: string; args?: readonly unknown[] } }
      | null;
    if (named) return { name: named.data.errorName, args: named.data.args ?? [] };
    const carrier = err.walk((e) => {
      const x = e as { raw?: unknown; data?: unknown };
      return typeof x.raw === "string" || typeof x.data === "string";
    }) as { raw?: Hex; data?: Hex } | null;
    const data = carrier?.raw ?? carrier?.data;
    if (data) {
      const explained = explainRevert(data);
      if (explained) return explained;
      const decoded = decodeErrorResult({ abi: [...errorAbi, ...extraAbi], data });
      return { name: decoded.errorName, args: decoded.args ?? [] };
    }
    throw err;
  }
  throw new Error("expected a revert");
}

describe("EvidenceGatedMigrateModule", () => {
  it("keeps its implementation uninitializable and decodes params as one tuple", async () => {
    const { implementation, launch, agent } = await setup();
    const l = await launch();
    expect((await revertOf(implementation.write.init([l.token.address, l.token.address, zeroAddress, l.raw, "1.0.0"]))).name).toBe(
      "AlreadyInitialized",
    );
    expect(await l.module.read.getInitParams()).toBe(l.raw);
    const p = await l.module.read.params();
    expect(getAddress(p.agent)).toBe(getAddress(agent.account.address));
    expect([p.scope, p.minOd, p.minLeafCount, p.outcomeStage, p.liquidityPredicate, p.minQuoteRaised]).toEqual([SCOPE, OD, 1, 0, 0, 0n]);
    expect(await l.module.read.descriptor()).toEqual([
      keccak256(stringToBytes("module.migrate.evidence_gated")).slice(0, 18),
      "module.migrate.evidence_gated",
      "1.0.0",
    ]);
    expect((await revertOf(l.module.write.init([l.token.address, l.token.address, zeroAddress, l.raw, "1.0.0"]))).name).toBe(
      "AlreadyInitialized",
    );
  });

  it("publishes its schema in Params order", async () => {
    const { implementation } = await setup();
    const schema = await implementation.read.moduleEncodeSchema();
    expect(schema.kind).toBe("migrate");
    expect(schema.params.map((p) => `${p.name}:${p.abiType}`)).toEqual([
      "agent:address",
      "scope:bytes32",
      "minOd:uint32",
      "minLeafCount:uint32",
      "codeHash:bytes32",
      "outcomeStage:uint8",
      "liquidityPredicate:uint8",
      "minQuoteRaised:uint256",
    ]);
  });

  it("refuses parameters it could not enforce", async () => {
    const { launch, gateRecord } = await setup();
    const invalid = async (v: Partial<ParamValues>) => revertOf(launch(v), gateRecord.abi as Abi);
    expect(await invalid({ agent: zeroAddress })).toMatchObject({ name: "InvalidParams", args: ["agent"] });
    expect(await invalid({ scope: `0x${"0".repeat(64)}` })).toMatchObject({ name: "InvalidParams", args: ["scope"] });
    expect(await invalid({ outcomeStage: 4 })).toMatchObject({ name: "InvalidParams", args: ["outcomeStage"] });
    expect(await invalid({ liquidityPredicate: 2 })).toMatchObject({ name: "InvalidParams", args: ["liquidityPredicate"] });
    expect(await invalid({ minQuoteRaised: 1n })).toMatchObject({ name: "InvalidParams", args: ["minQuoteRaised"] });
    expect(await invalid({ liquidityPredicate: 1 })).toMatchObject({ name: "InvalidParams", args: ["minQuoteRaised"] });
    expect(await invalid({ minOd: 20261131 })).toMatchObject({ name: "InvalidDay", args: [20261131] });
  });

  it("lets a sold-out sale close without evidence, then refuses graduation with EvidenceMissing", async () => {
    const { launch, buy, core, agent } = await setup();
    const l = await launch();
    await buy(l.token.address, SALE - parseEther("2"), parseEther("0.09"));
    await buy(l.token.address, parseEther("2"), parseEther("0.01"));
    expect(await l.vault.read.phase()).toBe(PHASE.SOLD_OUT);

    const verdict = await l.module.read.evaluate([
      { token: l.token.address, totalRaised: 0n, remainingForSale: 0n, soldOut: true, timestamp: 0n },
    ]);
    expect(verdict).toMatchObject({ canMigrate: false, reason: "evaluation evidence not bound" });

    await core.write.migrate([l.token.address]);
    expect(await l.vault.read.phase()).toBe(PHASE.SOLD_OUT);

    expect(await revertOf(l.module.write.graduate())).toEqual({
      name: "EvidenceMissing",
      args: [getAddress(agent.account.address), SCOPE],
    });
  });

  it("binds only the agent's own record under the agent, scope and day; a root alone is refused", async () => {
    const { launch, gateRecord, stranger, agent } = await setup();
    const l = await launch();
    const key = await gateRecord.read.keyOf([agent.account.address, SCOPE, OD]);

    expect(await revertOf(l.asStranger.write.bindEvidence([OD, ROOT]))).toMatchObject({ name: "NotBinder" });
    const wrong = keccak256(stringToBytes("another root"));
    expect(await revertOf(l.module.write.bindEvidence([OD, wrong]))).toEqual({
      name: "EvidenceRootMismatch",
      args: [key, ROOT, wrong],
    });

    // The same root sealed by another wallet for 27 Nov is not the agent's record.
    await gateRecord.write.commit([SCOPE, 20261127, ROOT, 316, CODE], { account: stranger.account });
    const key27 = await gateRecord.read.keyOf([agent.account.address, SCOPE, 20261127]);
    expect(await revertOf(l.module.write.bindEvidence([20261127, ROOT]))).toEqual({ name: "EvidenceNotOnRecord", args: [key27] });
    expect(await revertOf(l.module.write.bindEvidence([20261125, ROOT]))).toEqual({
      name: "EvidenceBeforeMinimumDay",
      args: [20261125, OD],
    });

    expect(await l.module.read.verifyEvidence([OD, ROOT])).toBe(key);
    await l.asAgent.write.bindEvidence([OD, ROOT]);
    expect(await l.module.read.evidence()).toMatchObject({ key, od: OD, root: ROOT });
  });

  it("graduates once the record is bound: both sides go into the pair and the LP goes to 0xdEaD", async () => {
    const { launch, buy, reader, quote, core, factory, viem } = await setup();
    const l = await launch();
    await buy(l.token.address, SALE, parseEther("0.1"));
    await l.module.write.bindEvidence([OD, ROOT]);

    const hash = await l.module.write.graduate();
    const receipt = await reader.waitForTransactionReceipt({ hash });
    expect(await l.vault.read.phase()).toBe(PHASE.MIGRATED);

    const pairAddress = await l.module.read.pair();
    expect(pairAddress).toBe(await factory.read.getPair([l.token.address, quote.address]));
    const pair = await viem.getContractAt("MockPancakePair", pairAddress);
    const liquidity = MAX_SUPPLY - SALE;
    const [r0, r1] = await pair.read.getReserves();
    const tokenIs0 = getAddress(await pair.read.token0()) === getAddress(l.token.address);
    expect(tokenIs0 ? [r0, r1] : [r1, r0]).toEqual([liquidity, parseEther("0.1")]);
    expect(await pair.read.balanceOf([DEAD])).toBeGreaterThan(0n);
    expect(await l.token.read.migratedPools([pairAddress])).toBe(true);
    expect(await l.token.read.balanceOf([l.vault.address])).toBe(0n);
    expect(await quote.read.balanceOf([l.vault.address])).toBe(0n);

    const [graduated] = parseEventLogs({ abi: l.module.abi, logs: receipt.logs, eventName: "Graduated" });
    expect(graduated?.args).toMatchObject({ pair: pairAddress, tokenAmount: liquidity, quoteAmount: parseEther("0.1") });
    const [migrated] = parseEventLogs({ abi: core.abi, logs: receipt.logs, eventName: "MigrateExecuted" });
    expect(migrated?.args.migratedDataVersion).toBe(1);
    expect(getAddress(migrated!.args.caller)).toBe(getAddress(l.module.address));

    expect((await revertOf(l.module.write.bindEvidence([OD, ROOT]))).name).toBe("AlreadyGraduated");
  });

  it("migrates in the sell-out buy itself when the record is bound first", async () => {
    const { launch, buy } = await setup();
    const l = await launch();
    await l.asAgent.write.bindEvidence([OD, ROOT]);
    await buy(l.token.address, SALE - parseEther("2"), parseEther("0.09"));
    expect(await l.vault.read.phase()).toBe(PHASE.TRADING);
    await buy(l.token.address, parseEther("2"), parseEther("0.01"));
    expect(await l.vault.read.phase()).toBe(PHASE.MIGRATED);
  });

  it("rechecks liquidity at execution and never trusts the soldOut hint", async () => {
    const { launch, buy } = await setup();
    const l = await launch();
    await l.module.write.bindEvidence([OD, ROOT]);
    await buy(l.token.address, SALE / 2n, parseEther("0.05"));

    const hinted = await l.module.read.evaluate([
      { token: l.token.address, totalRaised: parseEther("0.1"), remainingForSale: 0n, soldOut: true, timestamp: 0n },
    ]);
    expect(hinted).toMatchObject({ canMigrate: false, reason: "liquidity predicate not met" });
    expect(await revertOf(l.module.write.graduate())).toEqual({ name: "LiquidityNotReady", args: [0] });
  });

  it("runs the migration only for Core and only with the token's own vault", async () => {
    const { launch, buy, core, stranger } = await setup();
    const l = await launch();
    await buy(l.token.address, SALE, parseEther("0.1"));
    await l.module.write.bindEvidence([OD, ROOT]);
    const ctx = {
      vault: l.vault.address,
      token: l.token.address,
      quoteAsset: zeroAddress,
      creator: zeroAddress,
      totalRaised: 0n,
      remainingForSale: 0n,
      timestamp: 0n,
    };
    expect(await revertOf(l.asStranger.write.executeMigration([ctx, "0x"]))).toEqual({
      name: "OnlyCore",
      args: [getAddress(stranger.account.address)],
    });
    expect(
      await revertOf(core.write.executeWith([l.token.address, { ...ctx, vault: stranger.account.address }, "0x"])),
    ).toEqual({ name: "WrongVault", args: [getAddress(stranger.account.address)] });
  });

  it("can select the raised-at-least predicate, which graduates before the sale sells out", async () => {
    const { launch, buy } = await setup();
    const l = await launch({ liquidityPredicate: 1, minQuoteRaised: parseEther("0.05") });
    await buy(l.token.address, SALE / 4n, parseEther("0.025"));
    await l.module.write.bindEvidence([OD, ROOT]);
    expect(await revertOf(l.module.write.graduate())).toEqual({ name: "LiquidityNotReady", args: [1] });
    await buy(l.token.address, SALE / 4n, parseEther("0.025"));
    expect(await l.vault.read.phase()).toBe(PHASE.MIGRATED);
  });

  it("enforces the code hash, the coverage and a linked settlement stage", async () => {
    const { launch, gateRecord, clock, agent } = await setup();
    const other = keccak256(stringToBytes("other code"));
    expect(await revertOf((await launch({ codeHash: other })).module.write.bindEvidence([OD, ROOT]))).toEqual({
      name: "EvidenceCodeMismatch",
      args: [CODE, other],
    });
    expect(await revertOf((await launch({ minLeafCount: 400 })).module.write.bindEvidence([OD, ROOT]))).toEqual({
      name: "EvidenceTooSmall",
      args: [316, 400],
    });
    const staged = await launch({ outcomeStage: 1, codeHash: CODE, minLeafCount: 300 });
    const key = await gateRecord.read.keyOf([agent.account.address, SCOPE, OD]);
    expect(await revertOf(staged.module.write.bindEvidence([OD, ROOT]))).toEqual({
      name: "EvidenceOutcomeMissing",
      args: [key, 1],
    });
    await clock.setNextBlockTimestamp({ timestamp: GATE_26 + 3600n });
    await gateRecord.write.linkOutcome([key, 1, keccak256(stringToBytes("day-ahead outcome"))], {
      account: agent.account,
    });
    await staged.module.write.bindEvidence([OD, ROOT]);
    expect((await staged.module.read.status()).evidenceHolds).toBe(true);
  });

  it("refuses a pair that already holds liquidity", async () => {
    const { launch, buy, factory, quote, viem, launcher } = await setup();
    const l = await launch();
    await buy(l.token.address, SALE, parseEther("0.1"));
    await factory.write.createPair([l.token.address, quote.address]);
    const pairAddress = await factory.read.getPair([l.token.address, quote.address]);
    await l.token.write.transfer([pairAddress, parseEther("1000")]);
    await quote.write.transfer([pairAddress, parseEther("0.001")]);
    await (await viem.getContractAt("MockPancakePair", pairAddress)).write.mint([launcher.account.address]);
    await l.module.write.bindEvidence([OD, ROOT]);
    expect(await revertOf(l.module.write.graduate())).toEqual({ name: "PoolNotEmpty", args: [pairAddress] });
  });
});

describe("readLaunchTower", () => {
  it("reports the blockers, the bound record and the pool from one block", async () => {
    const { launch, buy, core, reader, agent } = await setup();
    const l = await launch();
    const read = () => readLaunchTower(reader, { core: core.address, token: l.token.address });

    const fresh = await read();
    expect(fresh.token).toMatchObject({ name: "Grand Prix Planner", symbol: "PLNR", maxSupply: MAX_SUPPLY });
    expect(fresh.vault.phase).toBe("Trading");
    expect(fresh.gate).toMatchObject({ agent: getAddress(agent.account.address), scope: SCOPE, minOd: OD, liquidityPredicate: "soldOut" });
    expect(fresh.blockers).toEqual(["liquidity", "evidence"]);
    expect(fresh.record).toBeNull();

    await buy(l.token.address, SALE, parseEther("0.1"));
    expect((await read()).blockers).toEqual(["evidence"]);

    await l.module.write.bindEvidence([OD, ROOT]);
    const bound = await read();
    expect(bound.blockers).toEqual([]);
    expect(bound.record).toMatchObject({ committer: getAddress(agent.account.address), od: OD, root: ROOT, leafCount: 316 });

    await l.module.write.graduate();
    const done = await read();
    expect(done.graduated).toBe(true);
    expect(done.vault.phase).toBe("Migrated");
    expect(done.pool).toMatchObject({ reserveToken: MAX_SUPPLY - SALE, reserveQuote: parseEther("0.1") });
    expect(done.pool!.lpAtSink).toBe(done.pool!.lpTotalSupply - 1000n);
  });

  it("matches the compiled module's ABI for every entry it declares", async () => {
    const { implementation } = await setup();
    const compiled = new Set(
      (implementation.abi as Abi)
        .filter((x) => x.type === "function" || x.type === "event" || x.type === "error")
        .map((x) => `${x.type}:${x.name}(${x.inputs.map((i) => i.type).join(",")})`),
    );
    for (const x of evidenceGatedMigrateAbi) {
      expect(compiled.has(`${x.type}:${x.name}(${x.inputs.map((i) => i.type).join(",")})`), `${x.type} ${x.name}`).toBe(true);
    }
  });
});
