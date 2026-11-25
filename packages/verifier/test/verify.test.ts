import { encodeAnchor, fileSha256, gateTs, leafHash, merkleRoot, OUTCOME_SCHEMA, operatingDayEndTs, type Manifest, type Outcome } from "@gatelock/core";
import { describe, expect, it } from "vitest";
import { NETWORKS } from "../src/chain.js";
import { formatReport, type CheckResult } from "../src/report.js";
import { objectiveUusd } from "../src/evaluate.js";
import { outcomeArm, verify, type VerifyInput } from "../src/verify.js";
import { clone, CONTRACT, FakeChain, fixture, SITE, WALLET } from "./fixture.js";

const GATE = gateTs(20261126);
const network = NETWORKS["bsc-testnet"]!;

function setup() {
  const { manifest, scenarios, site } = fixture();
  const chain = new FakeChain();
  const key = chain.commit(manifest, GATE - 3_600);
  const input = (m: unknown, extra: Partial<VerifyInput> = {}): VerifyInput => ({
    manifest: m,
    scenarios,
    chain: { reader: chain, network, contract: CONTRACT },
    sources: { fetcher: site.fetcher, site: SITE },
    ...extra,
  });
  return { manifest, scenarios, site, chain, key, input };
}

const byId = (rs: CheckResult[]) => Object.fromEntries(rs.map((r) => [r.id, r])) as Record<string, CheckResult>;
const statuses = (rs: CheckResult[]) => Object.fromEntries(rs.map((r) => [r.id, r.status]));
const text = (r: CheckResult) => r.details.join("\n");

describe("verify", () => {
  it("passes a consistent record", async () => {
    const { manifest, input } = setup();
    const rs = await verify(input(manifest));
    expect(statuses(rs)).toEqual({
      V1: "PASS", V2: "PASS", V3: "PASS", V4: "PASS", V5: "PASS",
      V6: "PASS", V7: "PASS", V8: "PASS", V9: "PASS", V10: "SKIP",
    });
    const r = byId(rs);
    expect(formatReport(rs)).toMatch(/VERIFIED \(1 skipped\)$/);
    expect(text(r.V3!)).toContain("2026-11-25 10:00:00 CST = 2026-11-25 23:00:00 GMT+7");
    expect(text(r.V3!)).toContain("3600 s before the gate");
    expect(text(r.V2!)).toContain('scope "CLO_ESR1/da-energy"');
    expect(text(r.V2!)).toContain("codeHash is source tree");
    expect(text(r.V5!)).toContain("re-derived over 10 scenarios");
    expect(text(r.V7!)).toContain("10 files hashed");
  });

  it("names the field a tampered copy changed", async () => {
    const { manifest, input } = setup();
    const bad = clone(manifest);
    bad.arms.B!.contracts[17] = 30;
    const rs = byId(await verify(input(bad, { reference: manifest })));
    expect(rs.V1!.status).toBe("FAIL");
    expect(text(rs.V1!)).toContain("$.arms.B.contracts[17]: 34 -> 30");
    expect(rs.V2!.status).toBe("FAIL");
    expect(text(rs.V2!)).toContain("on-chain root");
    expect(rs.V5!.status).toBe("FAIL");
  });

  it("rejects a copy whose root differs even when its own sums agree", async () => {
    const { manifest, input } = setup();
    const bad = clone(manifest);
    bad.salt = `0x${"cd".repeat(32)}`;
    const rs = byId(await verify(input(bad)));
    expect(rs.V2!.status).toBe("FAIL");
    expect(rs.V4!.status).toBe("PASS");
    expect(rs.V5!.status).toBe("PASS");
  });

  it("fails a record committed at or after the gate", async () => {
    const { manifest, chain, input } = setup();
    chain.commit(manifest, GATE);
    const rs = byId(await verify(input(manifest)));
    expect(rs.V3!.status).toBe("FAIL");
    expect(rs.V3!.details[0]).toContain("0 s after the gate");
  });

  it("fails a manifest whose gate or plan time is wrong", async () => {
    const { manifest, input } = setup();
    const gate = clone(manifest);
    gate.gate.unix += 3_600;
    expect(byId(await verify(input(gate))).V3!.status).toBe("FAIL");
    const late = clone(manifest);
    late.plan_time.unix = GATE;
    expect(byId(await verify(input(late))).V3!.details[0]).toContain("plan time");
  });

  it("fails when no record exists or another wallet holds it", async () => {
    const { manifest, chain, key, input } = setup();
    const other = clone(manifest);
    other.agent.wallet = "0x0000000000000000000000000000000000000001";
    expect(byId(await verify(input(other))).V2!.status).toBe("FAIL");
    chain.records.delete(key);
    expect(byId(await verify(input(manifest))).V2!.details[0]).toMatch(/^no record at/);
  });

  it("reads the record under the scope record.json names", async () => {
    const { manifest, input } = setup();
    const rs = byId(await verify(input(manifest, { record: { scopeLabel: "CLO_ESR1/other" } })));
    expect(rs.V2!.details[0]).toMatch(/^no record at/);
  });

  it("checks power, SOC bounds and energy balance hour by hour", async () => {
    const { manifest, input } = setup();
    const over = clone(manifest);
    over.arms.A!.kw[5] = 100_001;
    expect(byId(await verify(input(over))).V4!.details).toContain("arm A: hour 5: 100001 kW exceeds 100000 kW");

    const leak = clone(manifest);
    leak.arms.A!.soc_ukwh[9]! += 1;
    expect(text(byId(await verify(input(leak))).V4!)).toContain("arm A: hour 9: SOC 171219000001 µkWh, energy balance gives 171219000000");

    const deep = clone(manifest);
    deep.assumptions.soc_min_ppm = 600_000;
    deep.assumptions.soc_open_ppm = 600_000;
    expect(byId(await verify(input(deep))).V4!.status).toBe("FAIL");

    const overHedged = clone(manifest);
    overHedged.arms.B!.contracts[17] = 35;
    expect(text(byId(await verify(input(overHedged))).V4!)).toContain("arm B: hour 17: 35 contracts cover more than the 34000 kWh scheduled");
  });

  it("recomputes entry, collateral, objective and the scenario statistics", async () => {
    const { manifest, input } = setup();
    // 34 sold at $49.50 and 34 at $51.00, each posting the distance to the $100 ceiling
    expect(manifest.instrument.entry_cents.slice(17, 19)).toEqual([4_950, 5_100]);
    expect(manifest.arms.B!.collateral_cents).toBe(34 * 5_050 + 34 * 4_900);

    const entry = clone(manifest);
    entry.instrument.entry_cents[17] = 5_000;
    expect(text(byId(await verify(input(entry))).V5!)).toContain("hour 17: entry 5000, the scenario mean gives 4950");

    const ev = clone(manifest);
    const a = ev.arms.A!;
    a.expected_uusd += 2;
    a.objective_uusd = Number(objectiveUusd(BigInt(a.expected_uusd), BigInt(a.cvar_uusd), ev.risk.lambda_ppm));
    const v5 = byId(await verify(input(ev))).V5!;
    expect(v5.details[0]).toMatch(/^arm A: expected_uusd -?\d+, scenarios give -?\d+$/);
    expect(v5.details.filter((d) => d.startsWith("arm "))).toHaveLength(1);

    const objective = clone(manifest);
    objective.arms.B!.objective_uusd += 1;
    expect(text(byId(await verify(input(objective))).V5!)).toContain("arm B: objective_uusd");
  });

  it("checks the scenario matrix against its digest", async () => {
    const { manifest, scenarios, input } = setup();
    const altered = clone(scenarios);
    altered.hub_sum4[3]![7]! += 4;
    expect(text(byId(await verify(input(manifest, { scenarios: altered }))).V5!)).toContain("scenarios.json hashes to");

    const without = byId(await verify(input(manifest, { scenarios: undefined })));
    expect(without.V5!.status).toBe("PASS");
    expect(text(without.V5!)).toContain("not re-derived");
  });

  it("refuses any input day in the excluded days", async () => {
    const { manifest, input } = setup();
    const bad = clone(manifest);
    bad.scenarios.history_days.push("2026-09-29");
    const v6 = byId(await verify(input(bad))).V6!;
    expect(v6.status).toBe("FAIL");
    expect(v6.details[0]).toBe("2026-09-29 is inside 2026-07-30..2026-09-29");

    const route = clone(manifest);
    route.inputs.files.push({ route: "/api/prices/CLO_RN/2026-08-15", sha256: "0".repeat(64) });
    expect(byId(await verify(input(route))).V6!.status).toBe("FAIL");
  });

  it("checks every input against the published release and live tier", async () => {
    const { manifest, site, input } = setup();
    const bad = clone(manifest);
    bad.inputs.files[3]!.sha256 = "0".repeat(64);
    expect(byId(await verify(input(bad))).V7!.status).toBe("FAIL");

    const wrongRelease = clone(manifest);
    wrongRelease.inputs.manifest_sha256 = "1".repeat(64);
    expect(byId(await verify(input(wrongRelease))).V7!.details[0]).toContain("release manifest hashes to");

    const foreign = clone(manifest);
    foreign.inputs.files.push({ route: "/somewhere/else.json", sha256: "2".repeat(64) });
    expect(text(byId(await verify(input(foreign))).V7!)).toContain("not a release or live-tier path");

    const [url] = [...site.files.keys()].filter((u) => u.includes("/json/"));
    site.files.set(url!, new TextEncoder().encode("{}"));
    expect(byId(await verify(input(manifest))).V7!.details[0]).toContain("bytes hash to");
  });

  it("verifies live files from the mirror once they age out", async () => {
    const { manifest, site, input } = setup();
    const live = [...site.files.keys()].filter((u) => u.includes("/live/v1/"));
    const saved = new Map(live.map((u) => [fileSha256(site.files.get(u)!), site.files.get(u)!]));
    for (const u of live) site.files.delete(u);
    const without = byId(await verify(input(manifest)));
    expect(without.V7!.status).toBe("SKIP");
    const mirror = (sha: string) => saved.get(sha) ?? null;
    const withMirror = byId(await verify(input(manifest, { sources: { fetcher: site.fetcher, site: SITE, mirror } })));
    expect(withMirror.V7!.status).toBe("PASS");
    expect(text(withMirror.V7!)).toContain("3 of them from the mirror");
  });

  it("requires the selected arm to exist and to win by the declared rule", async () => {
    const { manifest, input } = setup();
    const unsolved = clone(manifest);
    unsolved.selected_arm = "C";
    expect(byId(await verify(input(unsolved))).V9!.details[0]).toBe("selected arm C was not solved");

    const loser = clone(manifest);
    loser.selected_arm = manifest.selected_arm === "A" ? "B" : "A";
    expect(byId(await verify(input(loser))).V9!.details[0]).toMatch(/has the higher objective/);

    const unlisted = clone(manifest);
    unlisted.unsolved = [];
    expect(byId(await verify(input(unlisted))).V9!.details[0]).toBe("arm C is null but not listed as unsolved");
  });

  it("stops at the schema when fields are missing or extra", async () => {
    const { manifest, input } = setup();
    const bad = clone(manifest) as Manifest & { extra?: number };
    bad.extra = 1;
    const rs = byId(await verify(input(bad)));
    expect(rs.V8!.details).toContain("$.extra: unexpected field");
    expect(rs.V4!.status).toBe("SKIP");

    const float = clone(manifest);
    float.battery.max_power_kw = 100_000.5;
    expect(byId(await verify(input(float))).V8!.status).toBe("FAIL");
  });

  it("skips chain and fetch checks offline but still checks the rest", async () => {
    const { manifest, input } = setup();
    const rs = statuses(await verify(input(manifest, { chain: null, sources: null })));
    expect(rs).toMatchObject({ V1: "PASS", V2: "SKIP", V3: "SKIP", V4: "PASS", V5: "PASS", V7: "SKIP", V9: "PASS" });
  });

  it("accepts a calldata anchor and says it is not write-once", async () => {
    const { manifest, chain, input } = setup();
    const root = merkleRoot([leafHash(manifest)]);
    const txHash = `0x${"11".repeat(32)}` as const;
    chain.txs.set(txHash, {
      from: WALLET, to: WALLET, value: 0n, success: true, blockNumber: 99, blockTimestamp: GATE - 60,
      input: encodeAnchor({ chainId: 97, od: 20261126, root }),
    });
    const rs = byId(await verify(input(manifest, { record: { mode: "anchor", txHash } })));
    expect(rs.V2!.status).toBe("PASS");
    expect(text(rs.V2!)).toContain("not write-once");
    expect(rs.V3!.status).toBe("PASS");

    chain.txs.set(txHash, { ...chain.txs.get(txHash)!, input: encodeAnchor({ chainId: 56, od: 20261126, root }) });
    expect(byId(await verify(input(manifest, { record: { mode: "anchor", txHash } }))).V2!.status).toBe("FAIL");
  });

  describe("outcomes", () => {
    function outcome(m: Manifest, stage: 1 | 2 | 3): Outcome {
      const da = m.forecast.node_da_cents.map((p) => p + 75);
      const rt = stage === 1 ? null : m.forecast.hub_da_cents.map((p) => [p - 75, p - 150, p - 75, p - 100] as [number, number, number, number]);
      const doc: Outcome = {
        schema: OUTCOME_SCHEMA,
        stage,
        operating_day: m.operating_day,
        manifest_root: merkleRoot([leafHash(m)]),
        inputs: { release_id: null, manifest_sha256: null, files: [], live: [] },
        prices: { da_node_cents: da, rt_hub_cents: rt },
        arms: { A: null, B: null, C: null },
      };
      doc.arms = { A: outcomeArm(m, doc, m.arms.A!), B: outcomeArm(m, doc, m.arms.B!), C: null };
      return doc;
    }

    it("links a day-ahead outcome after the gate", async () => {
      const { manifest, chain, key, input } = setup();
      const o = outcome(manifest, 1);
      expect(o.arms.B!.hedge_uusd).toBeNull();
      expect(o.arms.A!.hedge_uusd).toBe(0);
      chain.link(key, 1, merkleRoot([leafHash(o)]), GATE + 18 * 3_600);
      const rs = byId(await verify(input(manifest, { outcomes: [{ stage: 1, doc: o }] })));
      expect(rs.V10!.status).toBe("PASS");
    });

    it("recomputes the hedge once real-time prices exist", async () => {
      const { manifest, chain, key, input } = setup();
      const o = outcome(manifest, 3);
      // Each hour settles $1.00 below entry, so 68 sold contracts earn $68; fees 68 x $0.35
      expect(o.arms.B!.fees_uusd).toBe(23_800_000);
      expect(o.arms.B!.hedge_uusd).toBe(68_000_000);
      chain.link(key, 3, merkleRoot([leafHash(o)]), operatingDayEndTs(20261126) + 3_600);
      expect(byId(await verify(input(manifest, { outcomes: [{ stage: 3, doc: o }] }))).V10!.status).toBe("PASS");

      const bad = clone(o);
      bad.arms.B!.net_uusd! += 1;
      const v10 = text(byId(await verify(input(manifest, { outcomes: [{ stage: 3, doc: bad }] }))).V10!);
      expect(v10).toContain("arm B: net_uusd");
      expect(v10).toContain("on-chain hash");
    });

    it("fails an outcome linked on chain with no document", async () => {
      const { manifest, chain, key, input } = setup();
      chain.link(key, 2, `0x${"22".repeat(32)}`, operatingDayEndTs(20261126) + 60);
      expect(byId(await verify(input(manifest))).V10!.status).toBe("FAIL");
    });
  });
});
