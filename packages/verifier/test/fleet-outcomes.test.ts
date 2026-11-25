import { gateTs, leafHash, leafOf, operatingDayEndTs, outcomeRoot, type FleetIndex, type Manifest, type Outcome } from "@gatelock/core";
import { getAddress, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { NETWORKS } from "../src/chain.js";
import type { CheckResult } from "../src/report.js";
import { verify, type OutcomeFile, type VerifyInput } from "../src/verify.js";
import { clone, fakeSite, FakeChain } from "./fixture.js";
import {
  instrumentFile,
  outcomeDoc,
  outcomeIndexFor,
  quartersOf,
  sealedIndex,
  sealedLeaf,
  sealedRecord,
  sealedScenarios,
  testDaCents,
  testRt15Cents,
} from "./fleet-fixture.js";

const OD = 20261126;
const DAY = "2026-11-26";
const SHOWCASE = "DSWL_ESS_ESR1";
const OUTCOME_RELEASE = "terminal-daily-20261126-1221";

const byId = (rs: CheckResult[]) => Object.fromEntries(rs.map((r) => [r.id, r])) as Record<string, CheckResult>;
const statuses = (rs: CheckResult[]) => Object.fromEntries(rs.map((r) => [r.id, r.status]));
const text = (r: CheckResult) => r.details.join("\n");

/** The sealed day on a chain that holds its record exactly as BSC mainnet does. */
function sealedDay() {
  const index = sealedIndex();
  const receipt = sealedRecord("bsc-mainnet");
  const chain = new FakeChain(56);
  const wallet = getAddress(sealedLeaf(SHOWCASE).agent.wallet);
  const key = chain.commitFleet(index, wallet, receipt.committedAt, receipt.blockNumber);
  const input = (resource: string, extra: Partial<VerifyInput> = {}): VerifyInput => {
    const { position, proof } = leafOf(index, resource);
    return {
      manifest: sealedLeaf(resource),
      scenarios: sealedScenarios(resource),
      record: receipt,
      inclusion: { index: position, size: index.leaf_count, proof },
      fleet: index,
      chain: { reader: chain, network: NETWORKS["bsc-mainnet"]!, contract: receipt.contract! },
      sources: null,
      ...extra,
    };
  };
  return { index, receipt, chain, key, input };
}

/** Stage 1 for the two sealed leaves on file, at deterministic test prices; every other leaf a placeholder. */
function stageOne(index: FleetIndex, inputsFor: (m: Manifest) => Outcome["inputs"] | undefined = () => undefined) {
  const docs = new Map<string, Outcome>();
  for (const r of ["CLO_ESR1", SHOWCASE]) {
    const m = sealedLeaf(r);
    docs.set(r, outcomeDoc(m, index.root, 1, { da_node_cents: testDaCents(m.battery.settlement_point), rt_hub_cents: null }, inputsFor(m)));
  }
  return { docs, outcomeIndex: outcomeIndexFor(index, 1, docs) };
}

const fileFor = (stage: number, docs: ReadonlyMap<string, Outcome>, outcomeIndex: unknown, resource: string): OutcomeFile => ({
  stage,
  doc: docs.get(resource) ?? null,
  index: outcomeIndex,
});

describe("the sealed record of operating day 2026-11-26", () => {
  it("passes V1 to V9 for both leaves on file, with V7 left to a fetch", async () => {
    const { input } = sealedDay();
    for (const r of [SHOWCASE, "CLO_ESR1"]) {
      const rs = await verify(input(r));
      expect(statuses(rs)).toEqual({ V1: "PASS", V2: "PASS", V3: "PASS", V4: "PASS", V5: "PASS", V6: "PASS", V7: "SKIP", V8: "PASS", V9: "PASS", V10: "SKIP" });
      expect(text(byId(rs).V1!)).toContain("0xf4d4002344fe98be0f64870221e5cc0b5e1d6111c05fe46c0131763d725bbce7");
      expect(text(byId(rs).V3!)).toMatch(/before the gate/);
    }
  });
});

describe("V10 over a fleet", () => {
  it("walks a battery's recomputed outcome up its audit path to the root GateRecord links", async () => {
    const { index, chain, key, input } = sealedDay();
    const { docs, outcomeIndex } = stageOne(index);
    chain.link(key, 1, outcomeIndex.root, gateTs(OD) + 26 * 3_600);
    for (const r of [SHOWCASE, "CLO_ESR1"]) {
      const rs = byId(await verify(input(r, { outcomes: [fileFor(1, docs, outcomeIndex, r)] })));
      expect(rs.V10!.status).toBe("PASS");
      expect(text(rs.V10!)).toMatch(/is leaf \d+ of 316; the recomputed leaf 0x[0-9a-f]{64} walks an audit path of 9 hashes to 0x/);
      expect(text(rs.V10!)).toContain(`GateRecord links ${outcomeIndex.root}`);
      expect(rs.V6!.status).toBe("PASS");
    }
  });

  it("fails a tampered value and names the field", async () => {
    const { index, chain, key, input } = sealedDay();
    const { docs, outcomeIndex } = stageOne(index);
    chain.link(key, 1, outcomeIndex.root, gateTs(OD) + 26 * 3_600);
    const bad = new Map(docs);
    const doc = clone(docs.get(SHOWCASE)!);
    const honest = doc.arms.C!.energy_uusd;
    doc.arms.C!.energy_uusd = honest + 1_000_000;
    // At stage 1 the hedge waits for real-time prices, so a net where there should be none is a tamper too.
    doc.arms.B!.net_uusd = 0;
    bad.set(SHOWCASE, doc);
    const v10 = byId(await verify(input(SHOWCASE, { outcomes: [fileFor(1, bad, outcomeIndex, SHOWCASE)] }))).V10!;
    expect(v10.status).toBe("FAIL");
    expect(text(v10)).toContain(`outcome 1: arm C: energy_uusd ${honest + 1_000_000}, recomputed ${honest}`);
    expect(text(v10)).toContain("outcome 1: arm B: net_uusd 0, recomputed null");
    expect(text(v10)).toContain(`${SHOWCASE}'s document hashes to ${leafHash(doc)}, the index lists ${leafHash(docs.get(SHOWCASE)!)}`);
    // The linked root is the honest one: the recomputation reaches it, the tampered file does not.
    expect(text(v10)).not.toContain("on-chain hash");
  });

  it("fails an index rebuilt around another battery's changed leaf, since the chain holds the old root", async () => {
    const { index, chain, key, input } = sealedDay();
    const { docs, outcomeIndex } = stageOne(index);
    chain.link(key, 1, outcomeIndex.root, gateTs(OD) + 26 * 3_600);
    const forged = clone(outcomeIndex);
    forged.leaves[0]!.leaf = leafHash({ forged: true });
    forged.root = outcomeRoot(forged.leaves);
    const v10 = byId(await verify(input(SHOWCASE, { outcomes: [fileFor(1, docs, forged, SHOWCASE)] }))).V10!;
    expect(v10.status).toBe("FAIL");
    expect(text(v10)).toContain(`on-chain hash ${outcomeIndex.root}, recomputed ${forged.root}`);

    const inconsistent = clone(outcomeIndex);
    inconsistent.leaves[0]!.leaf = leafHash({ forged: true });
    expect(text(byId(await verify(input(SHOWCASE, { outcomes: [fileFor(1, docs, inconsistent, SHOWCASE)] }))).V10!)).toMatch(/outcome 1: index: root 0x[0-9a-f]{64}, leaves give 0x/);
  });

  it("refuses an index that settles another plan, misses the battery or is missing", async () => {
    const { index, chain, key, input } = sealedDay();
    const { docs, outcomeIndex } = stageOne(index);
    chain.link(key, 1, outcomeIndex.root, gateTs(OD) + 26 * 3_600);

    const other = clone(outcomeIndex);
    other.record_root = `0x${"11".repeat(32)}`;
    expect(text(byId(await verify(input(SHOWCASE, { outcomes: [fileFor(1, docs, other, SHOWCASE)] }))).V10!)).toMatch(/record_root 0x1{64}, the plan's root is 0xf4d4/);

    const noFleet = byId(await verify(input(SHOWCASE, { fleet: undefined, outcomes: [fileFor(1, docs, other, SHOWCASE)] }))).V10!;
    expect(text(noFleet)).toMatch(/index settles 0x1{64}, this record's root is 0xf4d4/);

    const v10 = byId(await verify(input(SHOWCASE, { outcomes: [{ stage: 1, doc: docs.get(SHOWCASE)! }] }))).V10!;
    expect(v10.status).toBe("FAIL");
    expect(text(v10)).toContain("the record holds 316 leaves; DSWL_ESS_ESR1's outcome needs the stage's index.json for its audit path");

    const gone = byId(await verify(input(SHOWCASE))).V10!;
    expect(gone.status).toBe("FAIL");
    expect(text(gone)).toContain(`stage 1 is linked on chain (${outcomeIndex.root}) but no outcomes/stage-1/index.json was given`);
  });

  it("fails a document for a battery the index does not list at its plan position", async () => {
    const { index, chain, key, input } = sealedDay();
    const { docs, outcomeIndex } = stageOne(index);
    chain.link(key, 1, outcomeIndex.root, gateTs(OD) + 26 * 3_600);
    const swapped = clone(outcomeIndex);
    const at = swapped.leaves.findIndex((l) => l.resource === SHOWCASE);
    swapped.leaves[at]!.plan_leaf = swapped.leaves[at - 1]!.plan_leaf;
    const v10 = text(byId(await verify(input(SHOWCASE, { fleet: undefined, outcomes: [fileFor(1, docs, swapped, SHOWCASE)] }))).V10!);
    expect(v10).toMatch(/the index says DSWL_ESS_ESR1 settles plan leaf 0x[0-9a-f]{64}, this manifest is 0x/);
  });

  it("refuses a stage-1 link made before the gate", async () => {
    const { index, chain, key, input } = sealedDay();
    const { docs, outcomeIndex } = stageOne(index);
    chain.link(key, 1, outcomeIndex.root, gateTs(OD) - 1);
    expect(text(byId(await verify(input(SHOWCASE, { outcomes: [fileFor(1, docs, outcomeIndex, SHOWCASE)] }))).V10!)).toContain(
      `linked at ${gateTs(OD) - 1}, before the stage opened at ${gateTs(OD)}`,
    );
  });
});

describe("V10 re-reads the published prices the outcome cites", () => {
  function published(stage: 1 | 3) {
    const day = sealedDay();
    const m = sealedLeaf(SHOWCASE);
    const node = m.battery.settlement_point;
    const hub = m.battery.hub;
    const payloads: Record<string, string> = { [`/api/prices/${node}/${DAY}`]: instrumentFile(node, DAY, testDaCents(node), null) };
    if (stage === 3) payloads[`/api/prices/${hub}/${DAY}`] = instrumentFile(hub, DAY, testDaCents(hub), testRt15Cents(hub));
    const site = fakeSite(payloads, {}, OUTCOME_RELEASE);
    const inputs: Outcome["inputs"] = { release_id: OUTCOME_RELEASE, manifest_sha256: site.manifestSha256, files: [...site.trail, ...site.routes], live: [] };
    const prices: Outcome["prices"] = { da_node_cents: testDaCents(node), rt_hub_cents: stage === 3 ? quartersOf(testRt15Cents(hub)) : null };
    return { ...day, m, site, inputs, prices, sources: { fetcher: site.fetcher, site: "https://example.test" } };
  }

  it("passes stage 1 and stage 3 rebuilt from the release files, and V7 hashes the outcome's citations", async () => {
    for (const stage of [1, 3] as const) {
      const { index, chain, key, input, m, inputs, prices, sources } = published(stage);
      const doc = outcomeDoc(m, index.root, stage, prices, inputs);
      const outcomeIndex = outcomeIndexFor(index, stage, new Map([[SHOWCASE, doc]]));
      chain.link(key, stage, outcomeIndex.root, stage === 1 ? gateTs(OD) + 60 : operatingDayEndTs(OD) + 60);
      const rs = byId(await verify(input(SHOWCASE, { sources, outcomes: [{ stage, doc, index: outcomeIndex }] })));
      expect(rs.V10!.status).toBe("PASS");
      expect(text(rs.V10!)).toContain(`prices re-read from release ${OUTCOME_RELEASE}: /api/prices/DSWL_BES1/${DAY}${stage === 3 ? `, /api/prices/HB_NORTH/${DAY}` : ""}`);
      // The plan's own release is not on this test site, so V7 cannot finish; it must not fail the outcome's files.
      expect(rs.V7!.status).toBe("SKIP");
      if (stage === 3) expect(doc.arms.C!.hedge_uusd).not.toBeNull();
    }
  });

  it("names the hour when an outcome is valued at a price the release does not hold, even when its own sums agree", async () => {
    const { index, chain, key, input, m, inputs, prices, sources } = published(3);
    const off = clone(prices);
    off.da_node_cents[18] = off.da_node_cents[18]! + 500;
    off.rt_hub_cents![17] = [1, 2, 3, 4];
    // A committer's own consistent document at the wrong prices, linked on chain.
    const doc = outcomeDoc(m, index.root, 3, off, inputs);
    const outcomeIndex = outcomeIndexFor(index, 3, new Map([[SHOWCASE, doc]]));
    chain.link(key, 3, outcomeIndex.root, operatingDayEndTs(OD) + 60);
    const v10 = text(byId(await verify(input(SHOWCASE, { sources, outcomes: [{ stage: 3, doc, index: outcomeIndex }] }))).V10!);
    expect(v10).toContain(`outcome 3: prices.da_node_cents[18] ${off.da_node_cents[18]}, published ${prices.da_node_cents[18]}`);
    expect(v10).toContain(`outcome 3: prices.rt_hub_cents[17] [1,2,3,4], published ${JSON.stringify(prices.rt_hub_cents![17])}`);
    expect(v10).toMatch(/outcome 3: on-chain hash 0x[0-9a-f]{64}, recomputed 0x/);
  });

  it("fails a cited price file whose bytes differ from the citation", async () => {
    const { index, chain, key, input, m, inputs, prices, sources, site } = published(1);
    const cited = clone(inputs);
    const payload = cited.files.find((f) => f.route.startsWith("/api/prices/"))!;
    payload.sha256 = "0".repeat(64);
    const doc = outcomeDoc(m, index.root, 1, prices, cited);
    const outcomeIndex = outcomeIndexFor(index, 1, new Map([[SHOWCASE, doc]]));
    chain.link(key, 1, outcomeIndex.root, gateTs(OD) + 60);
    const v10 = text(byId(await verify(input(SHOWCASE, { sources, outcomes: [{ stage: 1, doc, index: outcomeIndex }] }))).V10!);
    expect(v10).toMatch(/outcome 1: published prices: \/api\/prices\/DSWL_BES1\/2026-11-26: release has [0-9a-f]{64}, cited 0{64}/);
    expect(site.routes.length).toBe(1);
  });
});
