import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PLAN_SCOPE_LABEL, codeHashFromCommit, gateTs, leafHash, operatingDayEndTs, recordKey, scopeId, type Outcome } from "@gatelock/core";
import type { Abi, Address, Hex } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { outcomeArm as verifierOutcomeArm } from "../../verifier/dist/index.js";
import type { ContractsLib } from "../src/contracts-lib.js";
import { runOutcome, type OutcomeRunOptions } from "../src/outcome-run.js";
import { inProcessChain, type InProcessChain } from "./in-process-chain.js";
import { DAY, LOCAL_WALLET, OD, REPO, fakePrices, fixtureLeaf, writePlannedDay } from "./outcome-helpers.js";

// The whole path on Hardhat's in-process network: a plan committed before the gate, then each stage linked
// after the chain is moved past the gate and past the day's end. The chain's clock starts on 24 Nov.
let chain: InProcessChain;
let lib: ContractsLib;
let contract: Address;
let abi: Abi;
let dir: string;
const lines: string[] = [];

const travelTo = (unix: number) => chain.travelTo(unix);

async function outcomeOf(key: Hex, stage: number) {
  return (await chain.reader.readContract({ address: contract, abi, functionName: "outcomeOf", args: [key, stage] })) as { hash: Hex; linkedAt: bigint };
}

function run(stage: 1 | 2 | 3, extra: Partial<OutcomeRunOptions> = {}) {
  lines.length = 0;
  return runOutcome({
    repo: REPO,
    operatingDay: DAY,
    stage,
    network: "local",
    dir,
    contract,
    prices: fakePrices(),
    lib,
    log: (l) => lines.push(l),
    ...extra,
  });
}

beforeAll(async () => {
  chain = await inProcessChain("2026-11-24T00:00:00Z");
  ({ lib, contract, abi } = chain);
  dir = mkdtempSync(join(tmpdir(), "gate-outcome-day-"));
  const index = writePlannedDay(dir);
  const commitTx = await chain.signer.writeContract({
    address: contract,
    abi,
    functionName: "commit",
    args: [scopeId(PLAN_SCOPE_LABEL), OD, index.root, index.leaf_count, codeHashFromCommit(index.code_tree)],
  });
  expect((await chain.reader.waitForTransactionReceipt({ hash: commitTx })).status).toBe("success");
}, 120_000);

afterAll(async () => {
  await chain?.close();
});

describe("pnpm outcome on an in-process Hardhat chain", () => {
  const key = () => recordKey(LOCAL_WALLET, scopeId(PLAN_SCOPE_LABEL), OD);

  it("is refused by the contract before the gate", async () => {
    const r = await run(1);
    expect(r.code).toBe(1);
    expect(lines.join("\n")).toMatch(/refuses this link: StageNotOpen\(1, 1795622400\)/);
    expect((await outcomeOf(key(), 1)).linkedAt).toBe(0n);
  }, 60_000);

  it("reports prices not yet published and writes nothing", async () => {
    await travelTo(gateTs(OD) + 60);
    const r = await run(1, { prices: fakePrices({ notYet: true }), out: join(dir, "not-yet") });
    expect(r.code).toBe(3);
    expect(existsSync(join(dir, "not-yet"))).toBe(false);
  }, 60_000);

  it("simulates stage 1 by default and sends nothing", async () => {
    const r = await run(1);
    expect(r.code).toBe(0);
    expect(lines.join("\n")).toMatch(/dry run {3}simulated linkOutcome; nothing sent/);
    expect((await outcomeOf(key(), 1)).linkedAt).toBe(0n);
    expect(existsSync(join(r.outDir!, "link.localhost.json"))).toBe(false);
  }, 60_000);

  it("links stage 1 after the gate and the documents recompute to what the chain holds", async () => {
    const r = await run(1, { send: true });
    expect(r.code).toBe(0);
    const linked = await outcomeOf(key(), 1);
    expect(linked.hash).toBe(r.root);
    expect(Number(linked.linkedAt)).toBeGreaterThanOrEqual(gateTs(OD));

    const index = JSON.parse(readFileSync(join(r.outDir!, "index.json"), "utf8")) as { root: Hex; leaves: { resource: string; leaf: Hex; document: string }[] };
    expect(index.root).toBe(r.root);
    for (const l of index.leaves) {
      const doc = JSON.parse(readFileSync(join(r.outDir!, l.document), "utf8")) as Outcome;
      expect(leafHash(doc)).toBe(l.leaf);
      expect(doc.stage).toBe(1);
      const m = fixtureLeaf(l.resource);
      for (const id of ["A", "B", "C"] as const) if (m.arms[id]) expect(doc.arms[id]).toEqual(verifierOutcomeArm(m, doc, m.arms[id]!));
    }
    const link = JSON.parse(readFileSync(join(r.outDir!, "link.localhost.json"), "utf8")) as { root: Hex; stage: number };
    expect(link).toMatchObject({ root: r.root, stage: 1 });
  }, 60_000);

  it("reports a linked stage as linked and does not send again", async () => {
    const r = await run(1, { send: true });
    expect(r.code).toBe(0);
    expect(lines.join("\n")).toMatch(/linked {4}already/);
    expect(lines.join("\n")).toMatch(/matches/);
  }, 60_000);

  it("keeps stages 2 and 3 closed until the day ends, then links both", async () => {
    const early = await run(2, { send: true });
    expect(early.code).toBe(1);
    expect(lines.join("\n")).toMatch(/StageNotOpen\(2, 1795759200\)/);
    expect(operatingDayEndTs(OD)).toBe(1795759200);

    await travelTo(operatingDayEndTs(OD) + 60);
    for (const stage of [2, 3] as const) {
      const r = await run(stage, { send: true });
      expect(r.code).toBe(0);
      expect((await outcomeOf(key(), stage)).hash).toBe(r.root);
      const doc = JSON.parse(readFileSync(join(r.outDir!, "leaves", "DSWL_ESS_ESR1.json"), "utf8")) as Outcome;
      expect(doc.arms.C!.net_uusd).not.toBeNull();
    }
  }, 120_000);
});
