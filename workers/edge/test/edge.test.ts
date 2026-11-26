import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { gateTs } from "../../../packages/core/src/gate.ts";
import { fileSha256, type Hex } from "../src/bytes.ts";
import { merkleRoot } from "../src/merkle.ts";
import { forgetVerified } from "../src/record.ts";
import { VERIFIED_CACHE } from "../src/respond.ts";
import { DAY, bytesOf, call, freshOrigin, text, upstreams, utf8 } from "./fake.ts";
import { changeOneDigit } from "./tamper.ts";

const ROOT = "0xf4d4002344fe98be0f64870221e5cc0b5e1d6111c05fe46c0131763d725bbce7";
const KEY = "0xafee502d7b63d89f48434a1e9c1b73c949ca08f7189f68be54e30f2d81fdedf9";
const LEAF = `/day/2026-11-26/leaves/DSWL_ESS_ESR1.json`;

beforeEach(() => forgetVerified());

const gate = (res: Response) => Object.fromEntries([...res.headers].filter(([k]) => k.startsWith("x-gate-")));

describe("a good file passes", () => {
  it("serves the index byte for byte once its root is the one GateRecord holds on BSC mainnet", async () => {
    upstreams();
    const res = await call(freshOrigin(), "/day/2026-11-26/index.json");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(text.index);
    expect(gate(res)).toMatchObject({
      "x-gate-verified": "pass",
      "x-gate-network": "bsc-mainnet",
      "x-gate-root": ROOT,
      "x-gate-record-key": KEY,
      "x-gate-block": "135677078",
      "x-gate-sha256": "690ae05bf4d238858cbb88f2479ee6426bd9a907d9f747a00671434387332581",
      "x-gate-source": `https://gnfd-testnet-sp3.nodereal.io/view/wattness-grand-prix-records/${DAY}/manifest.json`,
      "x-gate-not-covered": "exclusions, showcase, plan_unix, leaves[].manifest, leaves[].scenarios",
      "x-gate-cache": "miss",
    });
    expect(res.headers.get("x-gate-checks")).toBe("byte form, index shape, root recomputes, RPC chain, record key, on-chain record, gate");
    expect(res.headers.get("cache-control")).toBe(VERIFIED_CACHE);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-expose-headers")).toContain("x-gate-root");
  });

  it("checks the index on BSC testnet, or on both chains, when asked", async () => {
    upstreams();
    const testnet = await call(freshOrigin(), "/day/20261126/index.json?network=bsc-testnet");
    expect(testnet.status).toBe(200);
    expect(gate(testnet)).toMatchObject({ "x-gate-network": "bsc-testnet", "x-gate-root": ROOT, "x-gate-block": "144810495" });
    const both = await call(freshOrigin(), "/day/2026-11-26/manifest.json?network=bsc-testnet,bsc-mainnet");
    expect(both.status).toBe(200);
    expect(gate(both)).toMatchObject({ "x-gate-network": "bsc-mainnet, bsc-testnet", "x-gate-block": "135677078, 144810495", "x-gate-root": ROOT });
  });

  it("wraps the index in a JSON envelope with every check and the values it compared", async () => {
    upstreams();
    const res = await call(freshOrigin(), "/day/2026-11-26/index.json?envelope=1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.verified).toBe(true);
    expect(body.records).toEqual([{ key: KEY, root: ROOT, leaf_count: 316, code_hash: `0xb83af42225f0ac312b05c5dd269f6c35502ec6b4${"0".repeat(24)}`, committed_at: 1795619717, block: 135677078, confirmations: expect.any(Number) }]);
    expect(body.document.root).toBe(ROOT);
    const gateCheck = body.checks.find((c: { name: string }) => c.name === "gate");
    expect(gateCheck.result).toBe("pass");
    expect(gateCheck.compared).toContainEqual({ name: "committed before the gate", "committed at": 1795619717, gate: 1795622400, "seconds before": 2683, ok: true });
    expect(body.not_covered).toContain("exclusions");
  });

  it("serves a leaf whose hash is the index's entry, and its scenario set by the digest the leaf names", async () => {
    upstreams();
    const origin = freshOrigin();
    const leaf = await call(origin, LEAF);
    expect(leaf.status).toBe(200);
    expect(await bytesOf(leaf)).toEqual(utf8(text.dswl));
    expect(leaf.headers.get("x-gate-checks")).toBe("byte form, leaf hash, battery, index sealed");
    expect(leaf.headers.get("x-gate-basis")).toContain("leaf 94 of 316");
    expect(leaf.headers.get("x-gate-sha256")).toBe("08997a73347eb8c24dc9321649f6d667a5972e33caa53a982402826fa1968578");
    const scenarios = await call(origin, "/day/2026-11-26/leaves/DSWL_ESS_ESR1.scenarios.json");
    expect(scenarios.status).toBe(200);
    expect(await scenarios.text()).toBe(text.dswlScenarios);
    expect(scenarios.headers.get("x-gate-basis")).toContain("db892cae095c9bbee80fce8431307db49691786e9bcac101a69fa78fc3c022f2");
  });

  it("serves both receipts once every field and the commit transaction match the chain they name", async () => {
    upstreams();
    for (const network of ["bsc-mainnet", "bsc-testnet"]) {
      const res = await call(freshOrigin(), `/day/2026-11-26/record.${network}.json`);
      expect(res.status, network).toBe(200);
      expect(await res.text()).toBe(network === "bsc-mainnet" ? text.receiptMainnet : text.receiptTestnet);
      expect(res.headers.get("x-gate-checks")).toBe("byte form, receipt fields, commit transaction");
      expect(res.headers.get("x-gate-network")).toBe(network);
    }
  });

  it("serves root.hex and salt.txt", async () => {
    upstreams();
    const origin = freshOrigin();
    const root = await call(origin, "/day/2026-11-26/root.hex");
    expect(root.status).toBe(200);
    expect(await root.text()).toBe(`${ROOT}\n`);
    const salt = await call(origin, "/day/2026-11-26/salt.txt");
    expect(salt.status).toBe(200);
    expect((await salt.text()).trim()).toBe((JSON.parse(text.dswl) as { salt: string }).salt);
    expect(salt.headers.get("x-gate-basis")).toContain("DSWL_ESS_ESR1");
  });
});

describe("a changed byte is refused", () => {
  it("refuses a leaf with one changed digit, with a 502 and the reason, never the bytes", async () => {
    const u = upstreams();
    u.objects.set(`${DAY}/leaves/DSWL_ESS_ESR1.json`, changeOneDigit(text.dswl));
    const res = await call(freshOrigin(), LEAF);
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toMatch(/^502: leaves\/DSWL_ESS_ESR1\.json is not served: leaf hash \(leaf: computed 0x[0-9a-f]{64}, index, leaf 94 of 316 0x067e4a61/);
    expect(body).not.toContain("energy_kwh");
    expect(res.headers.get("x-gate-verified")).toBe("fail");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a copy that parses to the same document but is not its rendering", async () => {
    const u = upstreams();
    const origin = freshOrigin();
    // One extra space: same document, same leaf hash, different bytes.
    u.objects.set(`${DAY}/leaves/DSWL_ESS_ESR1.json`, text.dswl.replace('"schema": ', '"schema":  '));
    const spaced = await call(origin, LEAF);
    expect(spaced.status).toBe(502);
    expect(await spaced.text()).toContain("byte form");
    // A duplicate key that JSON.parse resolves to the true value and a first-wins parser would not.
    forgetVerified();
    u.objects.set(`${DAY}/leaves/DSWL_ESS_ESR1.json`, text.dswl.replace('{\n  "schema"', '{\n  "salt": "0x00",\n  "schema"'));
    const doubled = await call(freshOrigin(), LEAF);
    expect(doubled.status).toBe(502);
    expect(await doubled.text()).toContain("byte form");
  });

  it("refuses a scenario set with one changed number", async () => {
    const u = upstreams();
    // The last digit of the first price in the matrix, plus one.
    const changed = text.dswlScenarios.replace(/(\n {6}-?\d*)(\d)(,?\n)/, (_m, head: string, d: string, tail: string) => `${head}${(Number(d) + 1) % 10}${tail}`);
    expect(changed).not.toBe(text.dswlScenarios);
    u.objects.set(`${DAY}/leaves/DSWL_ESS_ESR1.scenarios.json`, changed);
    const res = await call(freshOrigin(), "/day/2026-11-26/leaves/DSWL_ESS_ESR1.scenarios.json");
    expect(res.status).toBe(502);
    expect(await res.text()).toContain("scenario digest (digest: computed");
  });

  it("refuses a receipt with a changed field or an extra one", async () => {
    const u = upstreams();
    u.objects.set(`${DAY}/record.bsc-mainnet.json`, text.receiptMainnet.replace('"committedAt": 1795619717', '"committedAt": 1795619716'));
    const changed = await call(freshOrigin(), "/day/2026-11-26/record.bsc-mainnet.json");
    expect(changed.status).toBe(502);
    expect(await changed.text()).toContain("committed at: receipt 1795619716, on chain 1795619717");
    u.objects.set(`${DAY}/record.bsc-mainnet.json`, text.receiptMainnet.replace('{\n  "mode"', '{\n  "note": "unchecked",\n  "mode"'));
    const extra = await call(freshOrigin(), "/day/2026-11-26/record.bsc-mainnet.json");
    expect(extra.status).toBe(502);
    expect(await extra.text()).toContain("receipt fields (fields:");
  });
});

describe("a wrong root is refused", () => {
  it("refuses an index whose root is not the one its leaves give", async () => {
    const u = upstreams();
    u.objects.set(`${DAY}/manifest.json`, text.index.replace(ROOT, `0x${"ab".repeat(32)}`));
    const res = await call(freshOrigin(), "/day/2026-11-26/index.json");
    expect(res.status).toBe(502);
    expect(await res.text()).toContain("leaves give 0xf4d40023");
  });

  it("refuses a self-consistent index whose root GateRecord does not hold, and every file under it", async () => {
    const u = upstreams();
    const forged = JSON.parse(text.index) as { root: Hex; leaves: { resource: string; leaf: Hex }[] };
    const at = forged.leaves.findIndex((l) => l.resource === "DSWL_ESS_ESR1");
    (forged.leaves[at] as { leaf: Hex }).leaf = `0x${fileSha256(utf8("a different plan"))}`;
    forged.root = merkleRoot(forged.leaves.map((l) => l.leaf));
    u.objects.set(`${DAY}/manifest.json`, `${JSON.stringify(forged, null, 2)}\n`);
    const origin = freshOrigin();
    const index = await call(origin, "/day/2026-11-26/index.json");
    expect(index.status).toBe(502);
    expect(await index.text()).toContain(`on-chain record (root: on chain ${ROOT}, index ${forged.root}`);
    const leaf = await call(origin, "/day/2026-11-26/leaves/CLO_ESR1.json");
    expect(leaf.status).toBe(502);
  });

  it("refuses a sealed leaf served under another battery's name, which the root alone would allow", async () => {
    // The root covers the leaf hashes in order, not the names beside them: relabel Desert Willow's entry,
    // keep the order, and the index still verifies. The leaf's own resource field is what refuses it.
    const u = upstreams();
    const relabeled = JSON.parse(text.index) as { showcase: string; leaves: { resource: string; manifest: string; scenarios: string }[] };
    const at = relabeled.leaves.findIndex((l) => l.resource === "DSWL_ESS_ESR1");
    const name = "DSWL_ESS_ESR0";
    expect(relabeled.leaves[at - 1]!.resource < name && name < relabeled.leaves[at + 1]!.resource).toBe(true);
    Object.assign(relabeled.leaves[at]!, { resource: name, manifest: `leaves/${name}.json`, scenarios: `leaves/${name}.scenarios.json` });
    relabeled.showcase = name;
    u.objects.set(`${DAY}/manifest.json`, `${JSON.stringify(relabeled, null, 2)}\n`);
    u.objects.set(`${DAY}/leaves/${name}.json`, text.dswl);
    const origin = freshOrigin();
    expect((await call(origin, "/day/2026-11-26/index.json")).status).toBe(200);
    const leaf = await call(origin, `/day/2026-11-26/leaves/${name}.json`);
    expect(leaf.status).toBe(502);
    expect(await leaf.text()).toContain("resource: document DSWL_ESS_ESR1, index DSWL_ESS_ESR0");
    const v = (await (await call(origin, `/verify/${name}?od=2026-11-26`)).json()) as { verdict: string; checks: { name: string; result: string }[] };
    expect(v.verdict).toBe("fail");
    expect(v.checks.find((c) => c.name === "leaf hash")?.result).toBe("fail");
  });

  it("refuses the index when the chain answers with another root", async () => {
    upstreams((network, c, recorded) =>
      c.method === "eth_call" && String((c.params[0] as { data: string }).data).startsWith("0x8eaa6ac0") ? `0x${"cd".repeat(32)}${String(recorded).slice(66)}` : undefined,
    );
    const res = await call(freshOrigin(), "/day/2026-11-26/index.json");
    expect(res.status).toBe(502);
    expect(await res.text()).toContain(`root: on chain 0x${"cd".repeat(32)}, index ${ROOT}`);
  });
});

describe("an unknown day is a 404", () => {
  it("answers 404 for a day Greenfield holds no index for", async () => {
    const u = upstreams();
    const res = await call(freshOrigin(), "/day/2026-12-01/index.json");
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("404: no record is published for 2026-12-01: Greenfield has no od-20261201/manifest.json\n");
    expect(u.log).toEqual(["greenfield od-20261201/manifest.json"]);
    const leaf = await call(freshOrigin(), "/day/2026-12-01/leaves/DSWL_ESS_ESR1.json");
    expect(leaf.status).toBe(404);
  });

  it("answers 404 for a published index GateRecord holds no record of", async () => {
    // 20 Nov's gate passed before GateRecord was deployed, so no record of it can exist.
    const u = upstreams();
    const doc = JSON.parse(text.index) as Record<string, unknown>;
    Object.assign(doc, { operating_day: "2026-11-20", gate_unix: gateTs(20261120), plan_unix: gateTs(20261120) - 600 });
    u.objects.set("od-20261120/manifest.json", `${JSON.stringify(doc, null, 2)}\n`);
    const res = await call(freshOrigin(), "/day/2026-11-20/index.json");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("GateRecord on bsc-mainnet holds no record of 0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8 for 2026-11-20");
  });

  it("answers 404, with the file's Greenfield URL, for a file the record does not cover", async () => {
    upstreams();
    const res = await call(freshOrigin(), "/day/2026-11-26/sync/DSWL_ESS_ESR1.json");
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain("sync/DSWL_ESS_ESR1.json is not covered by the record of 2026-11-26");
    expect(body).toContain(`wattness-grand-prix-records/${DAY}/sync/DSWL_ESS_ESR1.json`);
  });
});

describe("edge caching", () => {
  it("caches a verified file and answers the next request from the edge", async () => {
    const u = upstreams();
    const origin = freshOrigin();
    const first = await call(origin, LEAF);
    expect(first.headers.get("x-gate-cache")).toBe("miss");
    const fetched = u.log.length;
    const second = await call(origin, LEAF);
    expect(second.status).toBe(200);
    expect(second.headers.get("x-gate-cache")).toBe("hit");
    expect(await second.text()).toBe(text.dswl);
    expect(u.log.length).toBe(fetched);
  });

  it("keeps each deployed version's cached responses to itself", async () => {
    upstreams();
    const origin = freshOrigin();
    const version = (id: string) => ({ ...env, CF_VERSION_METADATA: { id } });
    expect((await call(origin, LEAF, undefined, version("a"))).headers.get("x-gate-cache")).toBe("miss");
    expect((await call(origin, LEAF, undefined, version("a"))).headers.get("x-gate-cache")).toBe("hit");
    expect((await call(origin, LEAF, undefined, version("b"))).headers.get("x-gate-cache")).toBe("miss");
  });

  it("caches nothing it refused", async () => {
    const u = upstreams();
    u.objects.set(`${DAY}/leaves/DSWL_ESS_ESR1.json`, changeOneDigit(text.dswl));
    const origin = freshOrigin();
    expect((await call(origin, LEAF)).status).toBe(502);
    forgetVerified();
    u.objects.set(`${DAY}/leaves/DSWL_ESS_ESR1.json`, text.dswl);
    const again = await call(origin, LEAF);
    expect(again.status).toBe(200);
    expect(again.headers.get("x-gate-cache")).toBe("miss");
  });

  it("serves a record only a few blocks deep without caching it", async () => {
    const u = upstreams((network, c) => (c.method === "eth_blockNumber" ? `0x${(135677078 + 3).toString(16)}` : undefined));
    const origin = freshOrigin();
    const first = await call(origin, "/day/2026-11-26/index.json");
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(gate(first)).toMatchObject({ "x-gate-cache": "no-store", "x-gate-confirmations": "3" });
    const before = u.log.filter((l) => l.startsWith("greenfield")).length;
    expect((await call(origin, "/day/2026-11-26/index.json")).headers.get("x-gate-cache")).toBe("no-store");
    expect(u.log.filter((l) => l.startsWith("greenfield")).length).toBe(before + 1);
  });
});

describe("requests", () => {
  it("lists the endpoints and what each checks at /", async () => {
    upstreams();
    const res = await call(freshOrigin(), "/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const body = await res.text();
    for (const line of ["GET /day/<day>/index.json", "GET /day/<day>/<path>", "GET /verify/<battery>?od=<day>&network=bsc-mainnet"]) expect(body).toContain(line);
  });

  it("answers HEAD with the headers alone and a CORS preflight with 204", async () => {
    upstreams();
    const head = await call(freshOrigin(), LEAF, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("x-gate-verified")).toBe("pass");
    expect((await head.arrayBuffer()).byteLength).toBe(0);
    const preflight = await call(freshOrigin(), LEAF, { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toBe("GET, HEAD, OPTIONS");
  });

  it("refuses writes, bad days, unknown networks and paths that are not plain", async () => {
    upstreams();
    const origin = freshOrigin();
    expect((await call(origin, LEAF, { method: "POST", body: "{}" })).status).toBe(405);
    expect((await call(origin, "/day/2026-02-30/index.json")).status).toBe(400);
    expect((await call(origin, "/day/tomorrow/index.json")).status).toBe(400);
    expect((await call(origin, "/day/2026-11-26/index.json?network=eth-mainnet")).status).toBe(400);
    expect((await call(origin, "/day/2026-11-26/leaves/a%20b.json")).status).toBe(400);
    expect((await call(origin, "/nothing")).status).toBe(404);
  });
});
