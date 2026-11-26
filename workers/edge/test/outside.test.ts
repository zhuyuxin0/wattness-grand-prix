// The route for a file a leaf names (an outside input's saved response, such as cournot/probability.json), on
// a synthetic 26 Nov: Desert Willow's leaf, the showcase, names an outside input, and the record, answered
// here as only the committer could write it, holds the root over that leaf. No leaf published for 26 Nov names
// an outside input; the 27 Nov dry run's leaves name the Cournot file in this form.
import { describe, expect, it } from "vitest";
import { fileSha256, type Hex } from "../src/bytes.ts";
import { leafHash, merkleRoot } from "../src/merkle.ts";
import { forgetVerified } from "../src/record.ts";
import { DAY, call, freshOrigin, text, upstreams, utf8, type Upstreams } from "./fake.ts";

type Loose = Record<string, any>;
const pretty = (d: unknown) => `${JSON.stringify(d, null, 2)}\n`;
const GET = "0x8eaa6ac0"; // GateRecord.get(bytes32)
const ROUTE = "cournot/probability.json";
const FILE = `/day/2026-11-26/${ROUTE}`;
const probability = pretty({ claim: "a synthetic Cournot answer", probability_ppm: 420000 });
const AT = (JSON.parse(text.index) as Loose).leaves.findIndex((l: Loose) => l.resource === "DSWL_ESS_ESR1") as number;

/** The leaf naming the file by its SHA-256, and the index over it with its root recomputed. */
function world(file: string): { leafText: string; index: Loose } {
  const leaf = JSON.parse(text.dswl) as Loose;
  leaf.outside_inputs = {
    cournot: { response: { route: ROUTE, sha256: fileSha256(utf8(file)) } },
    // A route that is not a plain path is never taken.
    odd: { response: { route: "../escape.json", sha256: fileSha256(utf8("x")) } },
  };
  const index = JSON.parse(text.index) as Loose;
  index.leaves[AT].leaf = leafHash(leaf);
  index.root = merkleRoot(index.leaves.map((l: Loose) => l.leaf as Hex));
  return { leafText: pretty(leaf), index };
}

/** The bucket and the chain of that world: GateRecord.get's answer for 26 Nov with the root word replaced. */
function synthetic(file = probability): { u: Upstreams; leafText: string; index: Loose } {
  const w = world(file);
  forgetVerified();
  const u = upstreams((network, c, recorded) =>
    c.method === "eth_call" && String((c.params[0] as { data: string }).data).startsWith(GET) && typeof recorded === "string" && recorded.length === 2 + 64 * 8 && !/^0x0{512}$/.test(recorded)
      ? `0x${String(w.index.root).slice(2)}${recorded.slice(66)}`
      : undefined,
  );
  u.objects.set(`${DAY}/manifest.json`, pretty(w.index));
  u.objects.set(`${DAY}/leaves/DSWL_ESS_ESR1.json`, w.leafText);
  u.objects.set(`${DAY}/${ROUTE}`, file);
  u.objects.set(`${DAY}/escape.json`, "x");
  return { u, ...w };
}

const refusal = async (res: Response, reason: string, what = "") => {
  expect.soft(res.status, what).toBe(502);
  expect.soft(res.headers.get("x-gate-verified"), what).toBe("fail");
  expect.soft(res.headers.get("cache-control"), what).toBe("no-store");
  expect.soft((await res.text()).slice(0, 600), what).toContain(reason);
};

describe("a file a leaf names", () => {
  it("is served once its SHA-256 is the one the verified leaf records", async () => {
    synthetic();
    const res = await call(freshOrigin(), FILE);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(probability);
    expect(res.headers.get("x-gate-verified")).toBe("pass");
    expect(res.headers.get("x-gate-checks")).toBe("file digest, index sealed");
    expect(res.headers.get("x-gate-basis")).toContain("DSWL_ESS_ESR1's verified leaf");
    expect(res.headers.get("x-gate-basis")).toContain("outside_inputs.cournot");
    expect(res.headers.get("x-gate-sha256")).toBe(fileSha256(utf8(probability)));
  });

  it("comes in an envelope with its document, and the leaf that names it is served too", async () => {
    synthetic();
    const res = await call(freshOrigin(), `${FILE}?envelope=1`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Loose;
    expect(body.document).toEqual(JSON.parse(probability));
    expect(body.sha256).toBe(fileSha256(utf8(probability)));
    expect((await call(freshOrigin(), "/day/2026-11-26/leaves/DSWL_ESS_ESR1.json")).status).toBe(200);
  });

  it("is refused with one changed digit", async () => {
    const { u } = synthetic();
    u.objects.set(`${DAY}/${ROUTE}`, probability.replace("420000", "420001"));
    await refusal(await call(freshOrigin(), FILE), "file digest (sha256: computed");
  });

  it("is refused with a 502 when the leaf names it and the bucket has no such object", async () => {
    const { u } = synthetic();
    u.objects.delete(`${DAY}/${ROUTE}`);
    await refusal(await call(freshOrigin(), FILE), `DSWL_ESS_ESR1's leaf names ${ROUTE}, and Greenfield has no such object`);
  });

  it("is never one a route that is not a plain path names", async () => {
    synthetic();
    const res = await call(freshOrigin(), "/day/2026-11-26/escape.json");
    expect.soft(res.status).toBe(404);
    expect.soft(await res.text()).toContain("escape.json is not covered by the record of 2026-11-26");
  });

  it("is read from the showcase leaf, and refused under a relabeled showcase, the leaf verified in the isolate or not", async () => {
    for (const warm of [false, true]) {
      const { u, leafText, index } = synthetic();
      if (warm) expect((await call(freshOrigin(), "/day/2026-11-26/leaves/DSWL_ESS_ESR1.json?network=bsc-testnet")).status).toBe(200);
      const relabeled = structuredClone(index);
      Object.assign(relabeled.leaves[AT], { resource: "DSWL_ESS_ESR0", manifest: "leaves/DSWL_ESS_ESR0.json", scenarios: "leaves/DSWL_ESS_ESR0.scenarios.json" });
      relabeled.showcase = "DSWL_ESS_ESR0";
      u.objects.set(`${DAY}/manifest.json`, pretty(relabeled));
      u.objects.set(`${DAY}/leaves/DSWL_ESS_ESR0.json`, leafText);
      await refusal(await call(freshOrigin(), FILE), 'resource: document "DSWL_ESS_ESR1", index "DSWL_ESS_ESR0"', warm ? "leaf verified on testnet first" : "cold");
    }
  });

  it("is served as it is when it nests deeper than 64 levels, with null as the envelope's document", async () => {
    // Only the committer could put such a file under its record; the envelope must still be printable.
    const deep = `{"a": ${"[".repeat(200_000)}${"]".repeat(200_000)}}\n`;
    synthetic(deep);
    const raw = await call(freshOrigin(), FILE);
    expect.soft(raw.status).toBe(200);
    expect.soft(await raw.text()).toBe(deep);
    const wrapped = await call(freshOrigin(), `${FILE}?envelope=1`);
    expect.soft(wrapped.status).toBe(200);
    expect.soft(((await wrapped.json()) as Loose).document).toBe(null);
  });
});
