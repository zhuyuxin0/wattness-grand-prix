// The verifier across the manifest transition: the sealed 26 Nov leaves (no
// outside input) still pass, and a plan the engine wrote under a Cournot
// reading passes too, while a tampered response or a changed probability
// fails and names the field. The call below is synthetic, shaped like a
// recorded one; prices come from a deterministic generator, not market data.
import { readFileSync } from "node:fs";
import { fileSha256, leafHash, leafOf, type FleetIndex, type Manifest } from "@gatelock/core";
import { readingFromEvidence, savedCallBytes, type CallEvidence, type Json } from "@gatelock/cournot";
import { addDays, dayType, plan, type CournotReading, type PlanInput, type PriceDay } from "@gatelock/engine";
import { describe, expect, it } from "vitest";
import { verify, type VerifyInput } from "../src/verify.js";

const fixtures = new URL("../../../fixtures/od-20261126/", import.meta.url);
const readFixture = (p: string): unknown => JSON.parse(readFileSync(new URL(p, fixtures), "utf8"));

type Results = Record<string, { status: string; details: string[] }>;
const run = async (input: VerifyInput): Promise<Results> => Object.fromEntries((await verify(input)).map((r) => [r.id, r]));
const text = (r: { details: string[] }) => r.details.join("\n");

describe("the sealed 26 Nov record, with the verifier left behind", () => {
  const index = readFixture("manifest.json") as FleetIndex;
  for (const resource of ["DSWL_ESS_ESR1", "CLO_ESR1"]) {
    it(`passes ${resource} offline, its proof reaching the sealed root`, async () => {
      const manifest = readFixture(`leaves/${resource}.json`);
      const scenarios = readFixture(`leaves/${resource}.scenarios.json`);
      const { position, proof, entry } = leafOf(index, resource);
      expect(leafHash(manifest)).toBe(entry.leaf);
      const rs = await run({ manifest, scenarios, chain: null, sources: null, inclusion: { index: position, size: index.leaf_count, proof } });
      for (const id of ["V1", "V4", "V5", "V6", "V8", "V9"]) expect(rs[id]!.status, `${id}: ${text(rs[id]!)}`).toBe("PASS");
      expect(text(rs.V1!)).toContain(index.root);
      expect(rs.V7!.details).toEqual(["inputs not fetched (--offline or --no-fetch)"]);
      expect(text(rs.V5!)).toContain("re-derived over 301 scenarios");
    });
  }
});

// A deterministic fall-shaped history at one hub and node, enough for the forecast and the scenarios.
function noise(day: string, i: number): number {
  let x = (Number(day.replaceAll("-", "")) * 2654435761 + i * 40503) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) % 2001) - 1000;
}
const shape = (h: number, off: boolean) => (off ? 2200 : 2800) + (h >= 17 && h <= 20 ? 3500 : 0) + (h >= 6 && h <= 8 ? 900 : 0) - (h >= 10 && h <= 15 ? 800 : 0);
function hubDay(day: string, rt: boolean): PriceDay {
  const da = Array.from({ length: 24 }, (_, h) => shape(h, dayType(day) === "offpeak") + noise(day, h));
  return { point: "HB_NORTH", day, da, rt15: rt ? Array.from({ length: 96 }, (_, i) => da[Math.floor(i / 4)]! + 2 * noise(day, 100 + i)) : null };
}

const GATE = 1_795_622_400;
const PLAN_UNIX = GATE - 1_800;
const ROUTE = "cournot/probability.json";

function input(cournot?: CournotReading): PlanInput {
  const hub: PriceDay[] = [];
  for (let d = "2026-09-30"; d <= "2026-11-24"; d = addDays(d, 1)) hub.push(hubDay(d, d <= "2026-11-23"));
  const node: PriceDay[] = [];
  for (let d = "2026-11-18"; d <= "2026-11-24"; d = addDays(d, 1)) {
    node.push({ point: "DSWL_BES1", day: d, da: hubDay(d, false).da!.map((p, h) => p - 150 + (noise(d, 200 + h) >> 3)), rt15: null });
  }
  return {
    kind: "test",
    operatingDay: "2026-11-26",
    planUnix: PLAN_UNIX,
    battery: {
      resource: "DSWL_ESS_ESR1", settlementPoint: "DSWL_BES1", hub: "HB_NORTH", zone: "LZ_NORTH", county: "Ellis",
      maxPowerKw: 150_000, energyKwh: 338_307, source: { route: "/api/hedging/v1/walkthrough", sha256: "0".repeat(64) },
    },
    hub,
    node,
    provenance: { releaseId: "terminal-daily-20261124-1120", releaseGeneratedUnix: GATE - 86_400, manifestSha256: "1".repeat(64), files: [], live: [] },
    salt: `0x${"cd".repeat(32)}`,
    engine: { repo: "https://example.invalid/engine", commit: "0".repeat(40), tree: "1".repeat(40) },
    agent: { wallet: "0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8", erc8004Id: "2922" },
    ...(cournot ? { cournot } : {}),
  };
}

const call: CallEvidence = {
  endpoint: "https://interface.cournot.ai/intelligence/v1/probability",
  request: { message: "synthetic: Dallas minimum below 33F on 26 Nov", market_ids: [77] },
  requestedAt: new Date((PLAN_UNIX - 61) * 1000).toISOString(),
  receivedAt: new Date((PLAN_UNIX - 60) * 1000 + 250).toISOString(),
  httpStatus: 200,
  requestId: null,
  response: {
    code: 0,
    msg: "Success",
    data: {
      probability: 0.42,
      markets: [
        {
          market_info: {
            id: 77,
            title: "Will the minimum temperature be <33° on Nov 26, 2026? (Yes: 32° or below)",
            description: "If the minimum temperature recorded at Dallas (CLIDFW) for Nov 26, 2026, is less than 33° fahrenheit according to The Weather Company, then the market resolves to Yes.",
          } as Json,
          matching_confidence: 0.9,
        },
      ],
      basis: [{ source: "kalshi", summary: "latest YES price 0.42", time: new Date((PLAN_UNIX - 120) * 1000).toISOString() }],
    },
  },
  transactionHashes: [],
};

async function applied() {
  const bytes = new TextEncoder().encode(savedCallBytes(call));
  const r = readingFromEvidence(call);
  const reading: CournotReading = {
    claim: r.claim, probabilityPpm: r.probabilityPpm, basis: r.basis, observedUnix: r.observedUnix,
    response: { route: ROUTE, sha256: fileSha256(bytes) }, failure: null,
  };
  const p = await plan(input(reading));
  const s = p.scenarios;
  const scenarios = { basis_days: s.basisDays, history_days: s.historyDays, hub_sum4: s.scenarios.map((x) => x.hubSum4), node_cents: s.scenarios.map((x) => x.nodeCents) };
  const files = new Map<string, Uint8Array>([[ROUTE, bytes]]);
  const offline = (manifest: unknown, extra: Partial<VerifyInput> = {}): VerifyInput => ({
    manifest, scenarios, chain: null, sources: null, outsideFile: (route) => files.get(route) ?? null, ...extra,
  });
  return { manifest: p.manifest as unknown as Manifest, scenarios, files, offline };
}

describe("a plan under a Cournot reading", () => {
  it("passes: the response matches its digest and the rule's recomputation gives the weights and the cap", async () => {
    const { manifest, offline } = await applied();
    const c = manifest.outside_inputs!.cournot;
    expect(c.status).toBe("applied");
    expect(c.after).toEqual({ stress_weight_ppm: 481_000, hedge_limit_kwh: 37_975, max_contracts_per_hour: 37 });
    expect(manifest.agent.erc8004_id).toBe("2922");
    const rs = await run(offline(manifest));
    for (const id of ["V1", "V4", "V5", "V6", "V8", "V9"]) expect(rs[id]!.status, `${id}: ${text(rs[id]!)}`).toBe("PASS");
    expect(rs.V7!.status).toBe("SKIP");
    expect(text(rs.V7!)).toContain("matches its digest and the record's claim, probability and time");
    expect(text(rs.V8!)).toContain("stress bucket recomputed");
    // Received 59.75 s before plan time, rounded up to the second.
    expect(text(rs.V8!)).toContain("observed 59 s before plan time");
    expect(text(rs.V5!)).toContain("stress-weighted scenarios");
  });

  it("fails a tampered response, naming the field", async () => {
    const { manifest, files, offline } = await applied();
    files.set(ROUTE, new TextEncoder().encode(new TextDecoder().decode(files.get(ROUTE)).replace('"probability": 0.42', '"probability": 0.02')));
    const rs = await run(offline(manifest));
    expect(rs.V7!.status).toBe("FAIL");
    expect(text(rs.V7!)).toMatch(/outside_inputs\.cournot\.response: cournot\/probability\.json hashes to [0-9a-f]{64}, the record says/);
  });

  it("fails a changed probability, naming the field in the rule, the response and the root", async () => {
    const { manifest, offline } = await applied();
    const bad = structuredClone(manifest);
    bad.outside_inputs!.cournot.probability_ppm = 10_000;
    const rs = await run(offline(bad, { reference: manifest }));
    expect(rs.V1!.status).toBe("FAIL");
    expect(text(rs.V1!)).toContain("$.outside_inputs.cournot.probability_ppm: 420000 -> 10000");
    expect(rs.V7!.status).toBe("FAIL");
    expect(text(rs.V7!)).toContain("outside_inputs.cournot.probability_ppm: the record says 10000, the response gives 420000");
    expect(rs.V8!.status).toBe("FAIL");
    expect(text(rs.V8!)).toContain("outside_inputs.cournot.after.stress_weight_ppm 481000: the rule gives 255500 for probability_ppm 10000");
  });

  it("fails a stress bucket or weights the matrix does not give", async () => {
    const { manifest, offline } = await applied();
    const days = structuredClone(manifest);
    days.outside_inputs!.cournot.stress!.days[0] = "2026-10-01";
    expect(text((await run(offline(days))).V8!)).toContain("outside_inputs.cournot.stress.days: the scenarios give");
    const equal = structuredClone(manifest);
    equal.arms.B!.expected_uusd += 1;
    const rs = await run(offline(equal));
    expect(rs.V5!.status).toBe("FAIL");
    expect(text(rs.V5!)).toContain("arm B: expected_uusd");
    const cap = structuredClone(manifest);
    cap.assumptions.max_contracts_per_hour = 100;
    expect(text((await run(offline(cap))).V8!)).toContain("assumptions.max_contracts_per_hour 100, outside_inputs.cournot.after says 37");
  });

  it("fails an observation after the plan time", async () => {
    const { manifest, offline } = await applied();
    const late = structuredClone(manifest);
    late.outside_inputs!.cournot.observed!.unix = late.plan_time.unix + 10;
    const rs = await run(offline(late));
    expect(text(rs.V8!)).toContain("applied, but the rule refuses it: observed at");
    expect(text(rs.V7!)).toContain("outside_inputs.cournot.observed.unix");
  });

  it("cannot check a response that is not beside the record", async () => {
    const { manifest, offline } = await applied();
    const rs = await run(offline(manifest, { outsideFile: () => null }));
    expect(rs.V7!.status).toBe("SKIP");
    expect(text(rs.V7!)).toContain("cournot/probability.json is not beside the record");
  });

  it("passes a reading that was not applied, with the reason it gives", async () => {
    const p = await plan(input({ claim: null, probabilityPpm: null, basis: [], observedUnix: null, response: null, failure: "the call failed: rate_limited: no retry" }));
    const s = p.scenarios;
    const scenarios = { basis_days: s.basisDays, history_days: s.historyDays, hub_sum4: s.scenarios.map((x) => x.hubSum4), node_cents: s.scenarios.map((x) => x.nodeCents) };
    const rs = await run({ manifest: p.manifest, scenarios, chain: null, sources: null });
    for (const id of ["V1", "V4", "V5", "V6", "V8", "V9"]) expect(rs[id]!.status, `${id}: ${text(rs[id]!)}`).toBe("PASS");
    expect(text(rs.V8!)).toContain("Cournot reading not applied: the call failed: rate_limited");
  });
});
