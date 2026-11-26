import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PLAN_SCOPE_LABEL,
  codeHashFromCommit,
  gateTs,
  leafHash,
  leafOf,
  outcomeIndexErrors,
  recordKey,
  scopeId,
  type FleetIndex,
  type Manifest,
  type Outcome,
  type OutcomeIndex,
} from "@gatelock/core";
import type { Hex } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clientReader, readStageOutcomes, verify, type CheckResult, type OutcomeFile, type RecordFile, type VerifyInput } from "../../verifier/dist/index.js";
import { runOutcome } from "../src/outcome-run.js";
import { releasePrices } from "../src/outcome-prices.js";
import { inProcessChain, type InProcessChain } from "./in-process-chain.js";
import { DAY, LOCAL_WALLET, OD, REPO, daCents, fixtureLeaf, instrumentFile, publishTestRelease, rtQuarters, sealedIndex, writePlannedDay, type FakeRelease } from "./outcome-helpers.js";

// Three leaves of the record sealed for 26 Nov, re-signed to Hardhat's test wallet as a test record, on
// Hardhat's in-process network: plan, commit before the gate, the stage-1 outcome from a release that holds
// the day's day-ahead prices (test values, not market data), the link after the gate, then V10 for every
// battery, and tampered copies.
const FLEET = ["ABINDUST_ESR1", "CLO_ESR1", "DSWL_ESS_ESR1"];

let chain: InProcessChain;
let dir: string;
let plan: FleetIndex;
let record: RecordFile;
let release: FakeRelease;
let cacheDir: string;
let linkedRoot: Hex;

const byId = (rs: CheckResult[]) => Object.fromEntries(rs.map((r) => [r.id, r])) as Record<string, CheckResult>;
const text = (r: CheckResult) => r.details.join("\n");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const stageDir = () => join(dir, "outcomes", "stage-1");

/** What `pnpm verify <dir>/manifest.json --battery R` assembles, with the in-process chain as its reader. */
function verifyInput(resource: string, outcomes: OutcomeFile[], fetch = true): VerifyInput {
  const { position, entry, proof } = leafOf(plan, resource);
  const scenarios = join(dir, entry.scenarios);
  return {
    manifest: readJson<Manifest>(join(dir, entry.manifest)),
    ...(existsSync(scenarios) ? { scenarios: readJson(scenarios) } : {}),
    record,
    scopeLabel: plan.scope_label,
    inclusion: { index: position, size: plan.leaf_count, proof },
    fleet: plan,
    outcomes,
    chain: { reader: clientReader(chain.reader), network: { name: "localhost", chainId: 31337, rpcUrls: [] }, contract: chain.contract },
    sources: fetch ? { fetcher: release.verifierFetcher, site: release.origin } : null,
  };
}

beforeAll(async () => {
  chain = await inProcessChain("2026-11-24T00:00:00Z");
  dir = mkdtempSync(join(tmpdir(), "gate-outcome-fleet-"));
  cacheDir = mkdtempSync(join(tmpdir(), "gate-outcome-cache-"));
  plan = writePlannedDay(dir, LOCAL_WALLET, FLEET);
  for (const r of ["CLO_ESR1", "DSWL_ESS_ESR1"]) {
    writeFileSync(join(dir, "leaves", `${r}.scenarios.json`), readFileSync(join(REPO, "fixtures", "od-20261126", "leaves", `${r}.scenarios.json`)));
  }

  const scope = scopeId(PLAN_SCOPE_LABEL);
  const txHash = await chain.signer.writeContract({
    address: chain.contract,
    abi: chain.abi,
    functionName: "commit",
    args: [scope, OD, plan.root, plan.leaf_count, codeHashFromCommit(plan.code_tree)],
  });
  const receipt = await chain.reader.waitForTransactionReceipt({ hash: txHash });
  expect(receipt.status).toBe("success");
  // As the commit script writes it beside the plan.
  record = {
    mode: "contract",
    chainId: 31337,
    contract: chain.contract,
    key: recordKey(LOCAL_WALLET, scope, OD),
    scope,
    scopeLabel: PLAN_SCOPE_LABEL,
    txHash,
    root: plan.root,
    leafCount: plan.leaf_count,
  };
  writeFileSync(join(dir, "record.json"), `${JSON.stringify(record, null, 2)}\n`);

  // The release the Terminal publishes on 26 Nov: the day's day-ahead prices at every node and hub.
  const payloads: Record<string, unknown> = {};
  for (const r of FLEET) {
    const { settlement_point: node, hub } = fixtureLeaf(r).battery;
    payloads[`/api/prices/${node}/${DAY}`] = instrumentFile(node, DAY, daCents(node), null);
    payloads[`/api/prices/${hub}/${DAY}`] = instrumentFile(hub, DAY, daCents(hub), rtQuarters(hub).flat());
  }
  release = publishTestRelease(payloads);
}, 120_000);

afterAll(async () => {
  await chain?.close();
});

describe("a three-leaf fleet on the in-process chain", () => {
  it("plans three sealed leaves under one root and commits it before the gate", async () => {
    const sealed = sealedIndex();
    for (const r of FLEET) expect(leafHash(fixtureLeaf(r))).toBe(sealed.leaves.find((l) => l.resource === r)!.leaf);
    expect(plan.leaves.map((l) => l.resource)).toEqual(FLEET);
    const onChain = (await chain.reader.readContract({ address: chain.contract, abi: chain.abi, functionName: "get", args: [record.key!] })) as {
      root: Hex;
      leafCount: number;
      committedAt: bigint;
    };
    expect(onChain.root).toBe(plan.root);
    expect(Number(onChain.leafCount)).toBe(3);
    expect(Number(onChain.committedAt)).toBeLessThan(gateTs(OD));
  });

  it("writes stage 1 beside the record, every leaf in plan order, and links the reviewed root after the gate", async () => {
    await chain.travelTo(gateTs(OD) + 26 * 3_600);
    const lines: string[] = [];
    const run = (extra: { send?: boolean; expectRoot?: Hex }) =>
      runOutcome({
        repo: REPO,
        operatingDay: DAY,
        stage: 1,
        network: "local",
        dir,
        prices: releasePrices({ origin: release.origin, fetcher: release.fetcher, cacheDir }),
        lib: chain.lib,
        log: (l) => lines.push(l),
        ...extra,
      });
    const dry = await run({});
    expect(dry.code, lines.join("\n")).toBe(0);
    expect(lines.join("\n")).toMatch(/dry run {3}simulated linkOutcome; nothing sent/);

    // A send whose documents give another root than the one reviewed writes and sends nothing.
    const before = readFileSync(join(stageDir(), "index.json"), "utf8");
    const other = await run({ send: true, expectRoot: `0x${"77".repeat(32)}` });
    expect(other.code).toBe(1);
    expect(lines.join("\n")).toContain(`root      ${dry.root} from release ${release.releaseId} is not the reviewed 0x${"77".repeat(32)}`);
    expect(readFileSync(join(stageDir(), "index.json"), "utf8")).toBe(before);
    const unlinked = (await chain.reader.readContract({ address: chain.contract, abi: chain.abi, functionName: "outcomeOf", args: [record.key!, 1] })) as { linkedAt: bigint };
    expect(unlinked.linkedAt).toBe(0n);

    const r = await run({ send: true, expectRoot: dry.root! });
    expect(r.code, lines.join("\n")).toBe(0);
    expect(r.root).toBe(dry.root);
    expect(r.outDir).toBe(stageDir());
    expect(existsSync(join(dir, "record.json"))).toBe(true);
    const index = readJson<OutcomeIndex>(join(stageDir(), "index.json"));
    expect(outcomeIndexErrors(index, plan)).toEqual([]);
    expect(index).toMatchObject({ stage: 1, root: r.root, record_root: plan.root, leaf_count: 3, release_id: release.releaseId });
    expect(index.leaves.map((l) => [l.resource, l.plan_leaf])).toEqual(plan.leaves.map((l) => [l.resource, l.leaf]));
    for (const l of index.leaves) expect(leafHash(readJson<Outcome>(join(stageDir(), l.document)))).toBe(l.leaf);

    const linked = (await chain.reader.readContract({ address: chain.contract, abi: chain.abi, functionName: "outcomeOf", args: [record.key!, 1] })) as { hash: Hex };
    expect(linked.hash).toBe(r.root);
    linkedRoot = r.root!;
  }, 60_000);

  it("passes V10 for every battery: the outcome rebuilt from the published prices walks its audit path to the linked root", async () => {
    for (const r of FLEET) {
      const rs = byId(await verify(verifyInput(r, readStageOutcomes(join(dir, "outcomes"), r))));
      expect(rs.V10!.status, text(rs.V10!)).toBe("PASS");
      expect(text(rs.V10!)).toContain(`prices re-read from release ${release.releaseId}: /api/prices/${fixtureLeaf(r).battery.settlement_point}/${DAY}`);
      expect(text(rs.V10!)).toMatch(new RegExp(`${r} is leaf ${FLEET.indexOf(r) + 1} of 3; the recomputed leaf 0x[0-9a-f]{64} walks an audit path of \\d hash`));
      expect(text(rs.V10!)).toContain(`GateRecord links ${linkedRoot}`);
      for (const id of ["V1", "V2", "V3", "V4", "V5", "V6", "V8", "V9"]) expect(rs[id]!.status, `${r} ${id}: ${text(rs[id]!)}`).toBe("PASS");
      // The plan's own inputs are in the real 24 Nov release, which this test origin does not serve.
      expect(rs.V7!.status).toBe("SKIP");
    }
  }, 60_000);

  it("fails a tampered arm value and names the field, with or without a fetch", async () => {
    for (const fetch of [true, false]) {
      const files = readStageOutcomes(join(dir, "outcomes"), "CLO_ESR1");
      const doc = files[0]!.doc as Outcome;
      const honest = doc.arms.A!.energy_uusd;
      doc.arms.A!.energy_uusd = honest - 250_000;
      const v10 = byId(await verify(verifyInput("CLO_ESR1", files, fetch))).V10!;
      expect(v10.status).toBe("FAIL");
      expect(text(v10)).toContain(`outcome 1: arm A: energy_uusd ${honest - 250_000}, recomputed ${honest}`);
      expect(text(v10)).toMatch(/outcome 1: CLO_ESR1's document hashes to 0x[0-9a-f]{64}, the index lists 0x/);
    }
  });

  it("fails a tampered price and names the hour, against the price the release publishes", async () => {
    const files = readStageOutcomes(join(dir, "outcomes"), "DSWL_ESS_ESR1");
    const doc = files[0]!.doc as Outcome;
    const published = doc.prices.da_node_cents[18]!;
    doc.prices.da_node_cents[18] = published + 9_900;
    const v10 = byId(await verify(verifyInput("DSWL_ESS_ESR1", files))).V10!;
    expect(v10.status).toBe("FAIL");
    expect(text(v10)).toContain(`outcome 1: prices.da_node_cents[18] ${published + 9_900}, published ${published}`);
  });

  it("fails an outcome index whose leaves are not the ones GateRecord links", async () => {
    const files = readStageOutcomes(join(dir, "outcomes"), "ABINDUST_ESR1");
    const index = files[0]!.index as OutcomeIndex;
    index.leaves[2]!.leaf = leafHash({ forged: "DSWL_ESS_ESR1" });
    const v10 = byId(await verify(verifyInput("ABINDUST_ESR1", files))).V10!;
    expect(v10.status).toBe("FAIL");
    expect(text(v10)).toMatch(/outcome 1: index: root 0x[0-9a-f]{64}, leaves give 0x/);
  });

  it("refuses a second link for the stage, and the outcome CLI says the chain already holds this root", async () => {
    const lines: string[] = [];
    const r = await runOutcome({
      repo: REPO,
      operatingDay: DAY,
      stage: 1,
      network: "local",
      dir,
      send: true,
      prices: releasePrices({ origin: release.origin, fetcher: release.fetcher, cacheDir }),
      lib: chain.lib,
      log: (l) => lines.push(l),
    });
    expect(r.code).toBe(0);
    expect(lines.join("\n")).toMatch(/linked {4}already/);
    await expect(
      chain.signer.writeContract({ address: chain.contract, abi: chain.abi, functionName: "linkOutcome", args: [record.key!, 1, `0x${"77".repeat(32)}`] }),
    ).rejects.toThrow(/StageAlreadyLinked/);
  }, 60_000);
});
