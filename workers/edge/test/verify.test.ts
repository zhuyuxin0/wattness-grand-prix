import { beforeEach, describe, expect, it } from "vitest";
import { forgetVerified, type Check } from "../src/record.ts";
import type { Verdict } from "../src/verdict.ts";
import { DAY, call, freshOrigin, text, upstreams } from "./fake.ts";
import golden from "./fixtures/verifier.json";
import { changeOneDigit } from "./tamper.ts";

type Golden = Record<"V1" | "V2" | "V3", { status: "PASS" | "FAIL"; details: string[] }>;
const cases = golden.cases as Record<string, { results: Golden }>;

beforeEach(() => forgetVerified());

/** The Worker's checks grouped by the verifier check each follows: PASS only if every one passes. */
function asVerifier(checks: readonly Check[]): Golden {
  const group = (id: "V1" | "V2" | "V3") => {
    const mine = checks.filter((c) => c.verifier === id);
    return { status: mine.every((c) => c.result === "pass") ? ("PASS" as const) : ("FAIL" as const), details: mine.flatMap((c) => c.details) };
  };
  return { V1: group("V1"), V2: group("V2"), V3: group("V3") };
}

async function verdict(path: string): Promise<{ res: Response; v: Verdict }> {
  const res = await call(freshOrigin(), path);
  return { res, v: (await res.clone().json()) as Verdict };
}

describe("the verdict for Desert Willow on 26 Nov matches the repository verifier", () => {
  for (const network of ["bsc-mainnet", "bsc-testnet"] as const) {
    it(`on ${network}: V1, V2 and V3 pass with the same lines`, async () => {
      upstreams();
      const { res, v } = await verdict(`/verify/DSWL_ESS_ESR1?od=2026-11-26&network=${network}`);
      expect(res.status).toBe(200);
      expect(v.verdict).toBe("pass");
      expect(asVerifier(v.checks)).toEqual(cases[`sealed on ${network}`]?.results);
      expect(v.leaf).toMatchObject({ index: 93, number: 94, of: 316, listed: "0x067e4a612ccfd5976b66d561a40bd26256590c57eab24763fd5f9f48b76db2b1" });
      expect(v.leaf.proof).toHaveLength(9);
      expect(res.headers.get("x-gate-checks")).toBe("leaf hash=pass, Merkle proof=pass, record key=pass, on-chain record=pass, gate=pass");
    });
  }

  it("names each check with the values it compared", async () => {
    upstreams();
    const { v } = await verdict("/verify/DSWL_ESS_ESR1?od=20261126");
    const by = Object.fromEntries(v.checks.map((c) => [c.name, c]));
    expect(by["leaf hash"]?.compared[0]).toEqual({
      name: "leaf",
      computed: "0x067e4a612ccfd5976b66d561a40bd26256590c57eab24763fd5f9f48b76db2b1",
      "index, leaf 94 of 316": "0x067e4a612ccfd5976b66d561a40bd26256590c57eab24763fd5f9f48b76db2b1",
      ok: true,
    });
    expect(by["Merkle proof"]?.compared[0]).toMatchObject({ name: "root", walked: v.record?.root, "on chain": v.record?.root, ok: true });
    expect(by["record key"]?.compared[0]).toMatchObject({ name: "key", computed: v.record?.key, "GateRecord.keyOf": v.record?.key, ok: true });
    expect(by.gate?.compared).toContainEqual({ name: "gate", "computed as the contract does": 1795622400, "GateRecord.gateTs": 1795622400, "IANA America/Chicago": 1795622400, ok: true });
    expect(by.gate?.compared).toContainEqual({ name: "committed before the gate", "committed at": 1795619717, gate: 1795622400, "seconds before": 2683, ok: true });
    expect(v.rendering).toBe("pretty-printed");
  });

  it("fails one changed digit where the verifier does: V1 and V2, not V3", async () => {
    const u = upstreams();
    u.objects.set(`${DAY}/leaves/DSWL_ESS_ESR1.json`, changeOneDigit(text.dswl));
    const { res, v } = await verdict("/verify/DSWL_ESS_ESR1?od=2026-11-26&network=bsc-mainnet");
    expect(res.status).toBe(200);
    expect(v.verdict).toBe("fail");
    const want = cases["one changed digit on bsc-mainnet"]?.results as Golden;
    const got = asVerifier(v.checks);
    expect({ V1: got.V1.status, V2: got.V2.status, V3: got.V3.status }).toEqual({ V1: want.V1.status, V2: want.V2.status, V3: want.V3.status });
    // Both walk the changed leaf up the same audit path to the same wrong root.
    expect(got.V1.details.at(-1)).toBe(want.V1.details.at(-1));
    expect(got.V3).toEqual(want.V3);
    expect(res.headers.get("cache-control")).toBe("no-store");
    // The two places the lines differ, as the README says: V1's first line is worded for the chain, not
    // record.json, and V2 has no "on-chain root ..., recomputed ..." line; V2's other lines are the same.
    expect(got.V1.details).toEqual(want.V1.details.map((l) => l.replace(/^record\.json says /, "GateRecord holds ")));
    expect(got.V2.details).toEqual(want.V2.details.filter((l) => !l.startsWith("on-chain root ")));
    expect(want.V1.details.length + want.V2.details.length - got.V1.details.length - got.V2.details.length).toBe(1);
  });
});

describe("a verdict prints the leaf's values bounded", () => {
  it("fails a leaf carrying the plan in operating_day without printing the plan", async () => {
    upstreams();
    const plain = await (await call(freshOrigin(), "/verify/DSWL_ESS_ESR1?od=2026-11-26")).text();
    forgetVerified();
    const u = upstreams();
    const plan = JSON.parse(text.dswl) as Record<string, unknown>;
    u.objects.set(`${DAY}/leaves/DSWL_ESS_ESR1.json`, `${JSON.stringify({ ...plan, operating_day: { ...plan } }, null, 2)}\n`);
    const { res, v } = await verdict("/verify/DSWL_ESS_ESR1?od=2026-11-26");
    const body = await res.text();
    expect.soft(v.verdict).toBe("fail");
    expect.soft(body.length, "the changed leaf's verdict, against the published leaf's").toBeLessThan(plain.length + 1024);
    expect.soft(body).not.toContain("energy_kwh");
  });
});

describe("what a verdict cannot be given for", () => {
  it("answers 404 for a battery the day's index left out, with the index's reason", async () => {
    upstreams();
    const res = await call(freshOrigin(), "/verify/AMAD_ESS_ESR1?od=2026-11-26");
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("AMAD_ESS_ESR1 has no plan in the record of 2026-11-26; the index lists it as excluded: AMAD_ESS_ESR1 census row: p_max_mw");
  });

  it("answers 404 for an unknown battery or day, and 400 without a day or with two networks", async () => {
    upstreams();
    expect((await call(freshOrigin(), "/verify/NOT_A_BATTERY?od=2026-11-26")).status).toBe(404);
    expect((await call(freshOrigin(), "/verify/DSWL_ESS_ESR1?od=2026-12-01")).status).toBe(404);
    expect((await call(freshOrigin(), "/verify/DSWL_ESS_ESR1")).status).toBe(400);
    expect((await call(freshOrigin(), "/verify/DSWL_ESS_ESR1?od=2026-11-26&network=bsc-mainnet,bsc-testnet")).status).toBe(400);
    expect((await call(freshOrigin(), "/verify/dswl?od=2026-11-26")).status).toBe(400);
  });
});
