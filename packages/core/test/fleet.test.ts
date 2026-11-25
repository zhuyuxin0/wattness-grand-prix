import { describe, expect, it } from "vitest";
import { FLEET_SCHEMA, fleetIndexErrors, fleetRoot, leafOf, PLAN_SCOPE_LABEL, sortLeaves, type FleetIndex } from "../src/fleet.js";
import { leafHash, rootFromProof } from "../src/hash.js";

function index(names: string[], patch: Partial<FleetIndex> = {}): FleetIndex {
  const leaves = sortLeaves(
    names.map((resource) => ({ resource, leaf: leafHash({ resource }), manifest: `leaves/${resource}.json`, scenarios: `leaves/${resource}.scenarios.json` })),
  );
  return {
    schema: FLEET_SCHEMA,
    operating_day: "2026-11-26",
    scope_label: PLAN_SCOPE_LABEL,
    gate_unix: 1795622400,
    plan_unix: 1795616971,
    code_tree: "0344b2e79e9c72ce9e5d454f5329c538124db235",
    root: fleetRoot(leaves),
    leaf_count: leaves.length,
    showcase: "DSWL_ESS_ESR1",
    leaves,
    exclusions: [{ resource: "NOSIZE_ESR1", reason: "census row has no p_max_mw" }],
    ...patch,
  };
}

const NAMES = ["DSWL_ESS_ESR1", "CLO_ESR1", "ABINDUST_ESR1", "ZZ_ESR1", "B2_ESR1"];

describe("fleet index", () => {
  it("accepts a well-formed day", () => {
    expect(fleetIndexErrors(index(NAMES))).toEqual([]);
  });

  it("gives the same root whatever order the leaves were planned in", () => {
    expect(index([...NAMES].reverse()).root).toBe(index(NAMES).root);
  });

  it("proves every leaf against the root", () => {
    const ix = index(NAMES);
    for (const { resource } of ix.leaves) {
      const { position, entry, proof } = leafOf(ix, resource);
      expect(rootFromProof(entry.leaf, position, ix.leaf_count, proof)).toBe(ix.root);
    }
    expect(() => leafOf(ix, "NOSIZE_ESR1")).toThrow(/excluded: census row has no p_max_mw/);
  });

  it("refuses any scope but the plan scope, so a day has one record to read", () => {
    expect(fleetIndexErrors(index(NAMES, { scope_label: "gate-record/ercot-da-energy-2" })).join()).toMatch(/scope_label/);
    expect(fleetIndexErrors(index(NAMES, { scope_label: "DSWL_ESS_ESR1/da-energy" })).join()).toMatch(/scope_label/);
  });

  it("refuses a gate that is not the operating day's, and a plan time at or after it", () => {
    expect(fleetIndexErrors(index(NAMES, { gate_unix: 1795622400 + 3600 })).join()).toMatch(/gate_unix/);
    expect(fleetIndexErrors(index(NAMES, { plan_unix: 1795622400 })).join()).toMatch(/plan_unix/);
    expect(fleetIndexErrors(index(NAMES, { operating_day: "2026-11-31" })).join()).toMatch(/operating_day/);
  });

  it("refuses leaves out of order, repeated, or a stale count or root", () => {
    const ix = index(NAMES);
    const swapped = { ...ix, leaves: [ix.leaves[1]!, ix.leaves[0]!, ...ix.leaves.slice(2)] };
    expect(fleetIndexErrors(swapped).join()).toMatch(/out of order/);
    const repeated = { ...ix, leaves: [ix.leaves[0]!, ...ix.leaves], leaf_count: ix.leaf_count + 1 };
    expect(fleetIndexErrors(repeated).join()).toMatch(/out of order or repeated/);
    expect(fleetIndexErrors({ ...ix, leaf_count: ix.leaf_count - 1 }).join()).toMatch(/leaf_count/);
    expect(fleetIndexErrors({ ...ix, root: index(["CLO_ESR1"]).root }).join()).toMatch(/root/);
  });
});
