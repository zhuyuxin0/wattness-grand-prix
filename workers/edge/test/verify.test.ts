import { beforeEach, describe, expect, it } from "vitest";
import { fileSha256, type Hex } from "../src/bytes.ts";
import { merkleRoot } from "../src/merkle.ts";
import { forgetVerified, type Check } from "../src/record.ts";
import type { Verdict } from "../src/verdict.ts";
import { DAY, call, freshOrigin, text, upstreams, utf8 } from "./fake.ts";
import golden from "./fixtures/verifier.json";
import { changeOneDigit } from "./tamper.ts";

type Golden = Record<"V1" | "V2" | "V3", { status: "PASS" | "FAIL"; details: string[] }>;
type Loose = Record<string, any>;
const pretty = (doc: unknown) => `${JSON.stringify(doc, null, 2)}\n`;
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
    expect(((await res.json()) as { error: string }).error).toBe(
      "the index of 2026-11-26 lists no leaf under the name AMAD_ESS_ESR1 (a verdict finds a battery by the names in the index, which no hash fixes); it lists the battery as excluded: AMAD_ESS_ESR1 census row: p_max_mw",
    );
  });

  it("says a 404 rests on the index's names: relabeled, Desert Willow's own name finds no leaf", async () => {
    // The root fixes the leaf hashes, not the names: relabel Desert Willow's entry, order kept, and the
    // index still verifies, with its plan as leaf 94 under another name.
    const u = upstreams();
    const relabeled = JSON.parse(text.index) as Loose;
    const name = "DSWL_ESS_ESR0";
    Object.assign(relabeled.leaves[93], { resource: name, manifest: `leaves/${name}.json`, scenarios: `leaves/${name}.scenarios.json` });
    relabeled.showcase = name;
    u.objects.set(`${DAY}/manifest.json`, pretty(relabeled));
    const res = await call(freshOrigin(), "/verify/DSWL_ESS_ESR1?od=2026-11-26");
    expect.soft(res.status).toBe(404);
    expect.soft(((await res.json()) as { error: string }).error).toBe(
      "the index of 2026-11-26 lists no leaf under the name DSWL_ESS_ESR1 (a verdict finds a battery by the names in the index, which no hash fixes)",
    );
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

describe("a verdict is given only under an index the /day endpoints would serve", () => {
  const under = async (change: (d: Loose) => void, battery = "DSWL_ESS_ESR1") => {
    const u = upstreams();
    const doc = JSON.parse(text.index) as Loose;
    change(doc);
    u.objects.set(`${DAY}/manifest.json`, pretty(doc));
    return call(freshOrigin(), `/verify/${battery}?od=2026-11-26`);
  };
  const refused = async (res: Response, reason: string, what: string) => {
    expect.soft(res.status, what).toBe(502);
    expect.soft(res.headers.get("x-gate-verified"), what).toBe("fail");
    expect.soft(res.headers.get("cache-control"), what).toBe("no-store");
    expect.soft(String(((await res.json()) as { error?: string }).error).slice(0, 600), what).toContain(reason);
  };

  it("refuses a verdict under an index that swaps two batteries' files, with the objects swapped to match", async () => {
    // Each battery's leaf would still hash to its entry, and each verdict pass, citing the other's URL.
    for (const battery of ["CLO_ESR1", "DSWL_ESS_ESR1"]) {
      forgetVerified();
      const u = upstreams();
      const swapped = JSON.parse(text.index) as Loose;
      const dswl = swapped.leaves.find((l: Loose) => l.resource === "DSWL_ESS_ESR1");
      const clo = swapped.leaves.find((l: Loose) => l.resource === "CLO_ESR1");
      [dswl.manifest, clo.manifest] = [clo.manifest, dswl.manifest];
      [dswl.scenarios, clo.scenarios] = [clo.scenarios, dswl.scenarios];
      u.objects.set(`${DAY}/manifest.json`, pretty(swapped));
      u.objects.set(`${DAY}/leaves/CLO_ESR1.json`, text.dswl);
      u.objects.set(`${DAY}/leaves/DSWL_ESS_ESR1.json`, text.clo);
      await refused(await call(freshOrigin(), `/verify/${battery}?od=2026-11-26`), 'index shape (leaves: CLO_ESR1 names "leaves/DSWL_ESS_ESR1.json" as its manifest', battery);
    }
  });

  it("refuses a verdict under an index with a field beside the planner's", async () => {
    await refused(await under((d) => (d.attested_by = "anything")), 'index shape (index: unknown field "attested_by")', "extra field");
  });

  it("refuses a verdict under an index whose bytes are not its own rendering", async () => {
    const u = upstreams();
    u.objects.set(`${DAY}/manifest.json`, text.index.replace('"schema": ', '"schema":  '));
    await refused(await call(freshOrigin(), "/verify/DSWL_ESS_ESR1?od=2026-11-26"), "byte form (rendering:", "extra space");
  });

  it("refuses, rather than answer 404, under an index that drops the battery", async () => {
    const drop = (d: Loose) => {
      d.leaves = d.leaves.filter((l: Loose) => l.resource !== "DSWL_ESS_ESR1");
    };
    // As left: the root and the leaf count no longer match the leaves, and the showcase is gone.
    await refused(await under(drop), "index shape (leaf_count 316, 315 leaves listed", "dropped");
    // Made self-consistent: only GateRecord's root shows that this is not the record.
    const consistent = (d: Loose) => {
      drop(d);
      d.leaf_count = d.leaves.length;
      d.root = merkleRoot(d.leaves.map((l: Loose) => l.leaf as Hex));
      d.showcase = d.leaves[0].resource;
    };
    forgetVerified();
    await refused(await under(consistent), 'on-chain record (root: on chain "0xf4d4002344fe98be0f64870221e5cc0b5e1d6111c05fe46c0131763d725bbce7", index "0x', "dropped, self-consistent");
    // The same, with the published index verified and remembered by this isolate: the 404 would rest on
    // the copy the verdict read, which is not the one remembered.
    forgetVerified();
    const u = upstreams();
    expect((await call(freshOrigin(), "/day/2026-11-26/index.json")).status).toBe(200);
    const doc = JSON.parse(text.index) as Loose;
    consistent(doc);
    u.objects.set(`${DAY}/manifest.json`, pretty(doc));
    await refused(await call(freshOrigin(), "/verify/DSWL_ESS_ESR1?od=2026-11-26"), "is not served: Greenfield's copy (SHA-256 ", "dropped, self-consistent, published index remembered");
  });

  it("still gives a failing verdict, not a refusal, under a self-consistent index whose root GateRecord does not hold", async () => {
    const res = await under((d) => {
      d.leaves[93].leaf = `0x${fileSha256(utf8("a different plan"))}`;
      d.root = merkleRoot(d.leaves.map((l: Loose) => l.leaf as Hex));
    });
    expect.soft(res.status).toBe(200);
    expect.soft(((await res.json()) as Verdict).verdict).toBe("fail");
    expect.soft(res.headers.get("cache-control")).toBe("no-store");
  });
});
