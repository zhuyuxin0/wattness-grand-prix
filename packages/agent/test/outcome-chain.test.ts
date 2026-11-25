import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PLAN_SCOPE_LABEL, codeHashFromCommit, gateTs, leafHash, operatingDayEndTs, recordKey, scopeId, type Outcome } from "@gatelock/core";
import { createPublicClient, getAddress, http, type Abi, type Address, type Hex } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { outcomeArm as verifierOutcomeArm } from "../../verifier/dist/index.js";
import { loadContractsLib, type ContractsLib } from "../src/contracts-lib.js";
import { runOutcome, type OutcomeRunOptions } from "../src/outcome-run.js";
import { DAY, LOCAL_WALLET, OD, REPO, fakePrices, fixtureLeaf, writePlannedDay } from "./outcome-helpers.js";

// The whole path on a throwaway Hardhat node: a plan committed before the gate, then each stage linked
// after the chain is moved past the gate and past the day's end. The node's clock starts on 24 Nov.
const PORT = Number(process.env.GATE_TEST_RPC_PORT ?? 15198);
const RPC = `http://127.0.0.1:${PORT}`;

let node: ChildProcess | undefined;
let lib: ContractsLib;
let contract: Address;
let abi: Abi;
let dir: string;
const lines: string[] = [];

async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

async function travelTo(unix: number): Promise<void> {
  await rpc("evm_setNextBlockTimestamp", [unix]);
  await rpc("evm_mine");
}

const reader = () => createPublicClient({ transport: http(RPC) });

async function outcomeOf(key: Hex, stage: number) {
  return (await reader().readContract({ address: contract, abi, functionName: "outcomeOf", args: [key, stage] })) as { hash: Hex; linkedAt: bigint };
}

function run(stage: 1 | 2 | 3, extra: Partial<OutcomeRunOptions> = {}) {
  lines.length = 0;
  return runOutcome({
    repo: REPO,
    operatingDay: DAY,
    stage,
    network: "local",
    rpc: RPC,
    dir,
    contract,
    prices: fakePrices(),
    lib,
    log: (l) => lines.push(l),
    ...extra,
  });
}

beforeAll(async () => {
  const listening = await fetch(RPC).then(
    () => true,
    () => false,
  );
  if (listening) throw new Error(`something already listens on ${RPC}; set GATE_TEST_RPC_PORT to a free spare port`);
  const cfg = mkdtempSync(join(tmpdir(), "gate-hh-"));
  writeFileSync(join(cfg, "package.json"), '{"type":"module","private":true}\n');
  writeFileSync(
    join(cfg, "hardhat.config.js"),
    'const sim = { type: "edr-simulated", chainType: "l1", initialDate: "2026-11-24T00:00:00Z" };\nexport default { networks: { default: sim, node: sim } };\n',
  );
  const contracts = join(REPO, "contracts");
  node = spawn(join(contracts, "node_modules", ".bin", "hardhat"), ["--config", join(cfg, "hardhat.config.js"), "node", "--port", String(PORT)], {
    cwd: contracts,
    stdio: "ignore",
    detached: true,
  });
  for (let i = 0; ; i++) {
    try {
      await rpc("eth_chainId");
      break;
    } catch {
      if (i > 120) throw new Error("the Hardhat node did not start");
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  lib = await loadContractsLib(REPO);
  const artifactPath = lib.contractsPath("artifacts/contracts/GateRecord.sol/GateRecord.json");
  if (!existsSync(artifactPath)) throw new Error("run `pnpm build` in contracts/ first");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as { abi: Abi; bytecode: Hex };
  abi = JSON.parse(readFileSync(lib.contractsPath("abi/GateRecord.json"), "utf8")) as Abi;
  const network = lib.networkFrom({ network: "local", rpc: RPC });
  const wallet = lib.signerFor(network, lib.loadAccount(network));
  const deployTx = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode });
  const deployed = await reader().waitForTransactionReceipt({ hash: deployTx });
  contract = getAddress(deployed.contractAddress!);

  dir = mkdtempSync(join(tmpdir(), "gate-outcome-day-"));
  const index = writePlannedDay(dir);
  const commitTx = await wallet.writeContract({
    address: contract,
    abi,
    functionName: "commit",
    args: [scopeId(PLAN_SCOPE_LABEL), OD, index.root, index.leaf_count, codeHashFromCommit(index.code_tree)],
  });
  expect((await reader().waitForTransactionReceipt({ hash: commitTx })).status).toBe("success");
}, 120_000);

afterAll(() => {
  if (node?.pid) {
    try {
      process.kill(-node.pid, "SIGTERM");
    } catch {
      node.kill("SIGTERM");
    }
  }
});

describe("pnpm outcome on a local Hardhat node", () => {
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
