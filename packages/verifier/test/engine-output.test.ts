// The verifier against a manifest packages/engine actually wrote: plan() for
// CLO_ESR1 on 2026-11-26 from the 25 Nov data sync, run offline, with a fixed
// plan time and salt. It pins the two lanes to one schema and checks the
// scenario statistics against an implementation that shares no code with the
// engine's.
import { readFileSync } from "node:fs";
import { leafHash, manifestShapeErrors, type Manifest } from "@gatelock/core";
import { describe, expect, it } from "vitest";
import { verify } from "../src/verify.js";

const dir = new URL("./fixtures/engine-2026-11-26/", import.meta.url);
const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, dir), "utf8"));
const manifest = read("manifest.json") as Manifest;
const scenarios = read("scenarios.json");

const run = async (m: unknown, s: unknown = scenarios) =>
  Object.fromEntries((await verify({ manifest: m, scenarios: s, chain: null, sources: null })).map((r) => [r.id, r]));

describe("an engine manifest", () => {
  it("has the schema core declares", () => {
    expect(manifestShapeErrors(manifest)).toEqual([]);
    expect(leafHash(manifest)).toBe("0x003cb405cc6eb5c7b0498eb0caf7ee514c7a10c57434b876f2faf92086f30b18");
  });

  it("passes every offline check, with expected value and CVaR re-derived", async () => {
    const rs = await run(manifest);
    for (const id of ["V1", "V4", "V5", "V6", "V8", "V9"]) expect(rs[id]!.status, `${id}: ${rs[id]!.details.join("; ")}`).toBe("PASS");
    expect(rs.V5!.details.join("\n")).toContain(`re-derived over ${manifest.scenarios.count} scenarios`);
  });

  it("fails limits and accounting when one hour of the selected arm moves", async () => {
    const m = structuredClone(manifest);
    const arm = m.arms[m.selected_arm]!;
    const h = arm.kw.findIndex((kw) => kw > 0);
    arm.kw[h]! += 1;
    const rs = await run(m);
    expect(rs.V4!.status).toBe("FAIL");
    expect(rs.V5!.status).toBe("FAIL");
  });
});
