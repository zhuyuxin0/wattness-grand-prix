import { describe, expect, it } from "vitest";
import { leafHash, rootFromProof } from "../src/hash.js";
import {
  OUTCOME_INDEX_SCHEMA,
  outcomeDocumentPath,
  outcomeIndexErrors,
  outcomeLeafOf,
  outcomeRoot,
  type OutcomeIndex,
  type PlanLeaves,
} from "../src/outcome-index.js";

const NAMES = ["ABINDUST_ESR1", "B2_ESR1", "CLO_ESR1", "DSWL_ESS_ESR1", "ZZ_ESR1"];

function plan(names: string[] = NAMES): PlanLeaves {
  const leaves = names.map((resource) => ({ resource, leaf: leafHash({ plan: resource }) }));
  return { root: outcomeRoot(leaves), operating_day: "2026-11-26", leaves };
}

function index(p: PlanLeaves = plan(), patch: Partial<OutcomeIndex> = {}): OutcomeIndex {
  const leaves = p.leaves.map((l) => ({ resource: l.resource, leaf: leafHash({ outcome: l.resource }), plan_leaf: l.leaf, document: outcomeDocumentPath(l.resource) }));
  return {
    schema: OUTCOME_INDEX_SCHEMA,
    operating_day: p.operating_day,
    stage: 1,
    stage_name: "day-ahead settled",
    record_root: p.root,
    root: outcomeRoot(leaves),
    leaf_count: leaves.length,
    release_id: "terminal-daily-20261126-1221",
    manifest_sha256: "ab".repeat(32),
    live_day: null,
    physical_basis: "the schedule's energy at the settlement point's day-ahead SPP",
    hedge_settlement: null,
    rt_rule: null,
    leaves,
    ...patch,
  };
}

describe("outcome index", () => {
  it("accepts a stage that settles every plan leaf in order", () => {
    expect(outcomeIndexErrors(index())).toEqual([]);
    expect(outcomeIndexErrors(index(), plan())).toEqual([]);
  });

  it("proves every outcome leaf against the root", () => {
    const ix = index();
    for (const { resource } of ix.leaves) {
      const { position, entry, proof } = outcomeLeafOf(ix, resource);
      expect(rootFromProof(entry.leaf, position, ix.leaf_count, proof)).toBe(ix.root);
    }
    expect(() => outcomeLeafOf(ix, "NOPE_ESR1")).toThrow(/no outcome in stage 1/);
  });

  it("refuses a root its leaves do not give, a bad count and leaves out of order", () => {
    const ix = index();
    expect(outcomeIndexErrors({ ...ix, root: `0x${"00".repeat(32)}` })).toEqual([expect.stringMatching(/^root 0x0+, leaves give 0x/)]);
    expect(outcomeIndexErrors({ ...ix, leaf_count: 4 })).toContain("leaf_count 4, 5 leaves listed");
    const swapped = [ix.leaves[1]!, ix.leaves[0]!, ...ix.leaves.slice(2)];
    expect(outcomeIndexErrors({ ...ix, leaves: swapped, root: outcomeRoot(swapped) }).join("\n")).toMatch(/ABINDUST_ESR1 is out of order or repeated/);
  });

  it("refuses a document path other than leaves/<resource>.json", () => {
    const ix = index();
    ix.leaves[2] = { ...ix.leaves[2]!, document: "../../record.json" };
    expect(outcomeIndexErrors(ix)).toEqual(['leaves[2].document: expected leaves/CLO_ESR1.json, got "../../record.json"']);
  });

  it("refuses outcomes for another plan, a missing battery or a moved plan leaf", () => {
    expect(outcomeIndexErrors(index(), { ...plan(), root: `0x${"11".repeat(32)}` }).join("\n")).toMatch(/record_root 0x[0-9a-f]{64}, the plan's root is 0x1{64}/);
    const short = plan(NAMES.filter((n) => n !== "CLO_ESR1"));
    expect(outcomeIndexErrors(index(short), plan()).join("\n")).toMatch(/4 outcome leaves for 5 plan leaves[\s\S]*leaves\[2\] settles DSWL_ESS_ESR1, plan leaf 2 is CLO_ESR1/);
    const ix = index();
    const moved = { ...plan(), leaves: plan().leaves.map((l, i) => (i === 3 ? { ...l, leaf: leafHash({ other: 3 }) } : l)) };
    expect(outcomeIndexErrors(ix, moved).join("\n")).toMatch(/leaves\[3\] \(DSWL_ESS_ESR1\) settles plan leaf 0x[0-9a-f]{64}, the plan's is 0x/);
  });

  it("names a bad stage, schema and record root", () => {
    const errs = outcomeIndexErrors({ ...index(), schema: "x", stage: 4, record_root: "0x12" });
    expect(errs).toEqual([
      `schema: expected ${OUTCOME_INDEX_SCHEMA}`,
      "stage: expected 1, 2 or 3, got 4",
      "record_root: expected 0x-prefixed 32 bytes, lowercase",
    ]);
    expect(outcomeIndexErrors(null)).toEqual(["outcome index: expected object"]);
    expect(outcomeIndexErrors({ ...index(), leaves: [] })).toContain("leaves: expected a non-empty array");
  });
});
