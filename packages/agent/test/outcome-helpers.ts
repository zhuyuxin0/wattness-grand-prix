import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FLEET_SCHEMA, PLAN_SCOPE_LABEL, fleetRoot, gateTs, leafHash, type FleetIndex, type Manifest } from "@gatelock/core";
import type { Address } from "viem";
import type { Quarter } from "../src/outcome.js";
import type { PriceSource } from "../src/outcome-prices.js";

export const REPO = fileURLToPath(new URL("../../../", import.meta.url));
export const FIXTURE = join(REPO, "fixtures", "od-20261126");
export const DAY = "2026-11-26";
export const OD = 20261126;
/** Hardhat's first public test account. */
export const LOCAL_WALLET: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

export function fixtureLeaf(resource: string): Manifest {
  return JSON.parse(readFileSync(join(FIXTURE, "leaves", `${resource}.json`), "utf8")) as Manifest;
}

/** Deterministic, plausible prices: an evening peak, and a few hub intervals above the hedge's ceiling. */
export function daCents(point: string): number[] {
  const k = [...point].reduce((a, c) => a + c.charCodeAt(0), 0) % 7;
  return Array.from({ length: 24 }, (_, h) => 1500 + 37 * h + 11 * k + (h >= 17 && h <= 20 ? 2400 : 0));
}

export function rtQuarters(hub: string): Quarter[] {
  const base = daCents(hub);
  return base.map((p, h) => {
    if (h === 18) return [p, 250_000, p + 3, -1200] as Quarter;
    return [p - 40, p + 15, p + 80, p - 5] as Quarter;
  });
}

export const fakeRef = (route: string) => ({ route, sha256: [...route].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16).padStart(8, "0").repeat(8) });

/** A price source with fixed prices that cites the routes a release would. */
export function fakePrices(opts: { notYet?: boolean } = {}): PriceSource {
  return async (req) => {
    if (opts.notYet) return { kind: "not-yet", releaseId: "fake-release", reasons: [`no prices for ${req.operatingDay}`] };
    return {
      kind: "ready",
      releaseId: "fake-release",
      manifestSha256: "ab".repeat(32),
      liveDay: null,
      leaf(node, hub) {
        const files = [fakeRef(`/api/prices/${node}/${req.operatingDay}`), ...(req.stage === 1 ? [] : [fakeRef(`/api/prices/${hub}/${req.operatingDay}`)])];
        return {
          daNodeCents: daCents(node),
          rtHubCents: req.stage === 1 ? null : rtQuarters(hub),
          inputs: { release_id: "fake-release", manifest_sha256: "ab".repeat(32), files, live: [] },
        };
      },
      hubDayAhead: (hub) => daCents(hub),
    };
  };
}

/** A planned day from the fixture's two leaves, re-signed to the local wallet as a test record. */
export function writePlannedDay(dir: string, wallet: Address = LOCAL_WALLET): FleetIndex {
  const leaves = ["CLO_ESR1", "DSWL_ESS_ESR1"].map((r) => {
    const m = fixtureLeaf(r);
    m.kind = "test";
    m.agent = { ...m.agent, wallet };
    return { resource: r, manifest: m };
  });
  mkdirSync(join(dir, "leaves"), { recursive: true });
  for (const l of leaves) writeFileSync(join(dir, "leaves", `${l.resource}.json`), `${JSON.stringify(l.manifest, null, 2)}\n`);
  const entries = leaves.map((l) => ({
    resource: l.resource,
    leaf: leafHash(l.manifest),
    manifest: `leaves/${l.resource}.json`,
    scenarios: `leaves/${l.resource}.scenarios.json`,
  }));
  const fixtureIndex = JSON.parse(readFileSync(join(FIXTURE, "manifest.json"), "utf8")) as FleetIndex;
  const index: FleetIndex = {
    schema: FLEET_SCHEMA,
    operating_day: DAY,
    scope_label: PLAN_SCOPE_LABEL,
    gate_unix: gateTs(OD),
    plan_unix: fixtureIndex.plan_unix,
    code_tree: fixtureIndex.code_tree,
    root: fleetRoot(entries),
    leaf_count: entries.length,
    showcase: "DSWL_ESS_ESR1",
    leaves: entries,
    exclusions: [],
  };
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}
