// A planned day, committed to an in-process chain and verified end to end:
//   GATE_DRY_RUN=out/local/od-20261127 pnpm --filter @gatelock/contracts test
// It deploys GateRecord on Hardhat's in-process network at the plan time,
// commits the day's root as its committer, then runs the verifier on every
// leaf against that chain, the release files from the local cache (by the
// URLs each sync recorded) and the Cournot response beside the record. A copy
// with a changed probability and a tampered response must both be rejected.
// Skipped unless GATE_DRY_RUN names a planned day.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { codeHashFromCommit, fileSha256, leafHash, leafOf, scopeId, type FleetIndex } from "@gatelock/core";
import { GATE_RECORD_ABI, verify, type ChainReader, type CheckResult, type NetworkInfo } from "@gatelock/verifier";
import { network } from "hardhat";
import { zeroAddress, type Address, type Hex } from "viem";

const dirArg = process.env.GATE_DRY_RUN;
const repo = resolve(import.meta.dirname, "..", "..");
const dir = dirArg ? resolve(process.env.INIT_CWD ?? repo, dirArg) : "";
const cacheDir = resolve(process.env.GATE_CACHE_DIR ?? join(repo, "cache"));

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

/** The release and live files the plan read, served from the cache by the URL each sync recorded. */
function cacheFetcher(day: string) {
  const urls = new Map<string, string>();
  for (const f of readdirSync(join(day, "sync")).filter((n) => n.endsWith(".json"))) {
    const s = readJson<{ files: { url: string; sha256: string }[] }>(join(day, "sync", f));
    for (const p of s.files) urls.set(p.url, p.sha256);
  }
  const bySha = (sha: string): Uint8Array | null => {
    const p = join(cacheDir, "sha256", sha.slice(0, 2), sha);
    return existsSync(p) ? new Uint8Array(readFileSync(p)) : null;
  };
  return { fetcher: async (url: string) => (urls.has(url) ? bySha(urls.get(url) as string) : null), mirror: bySha };
}

const statuses = (rs: CheckResult[]) => Object.fromEntries(rs.map((r) => [r.id, r.status]));
const text = (rs: CheckResult[], id: string) => rs.find((r) => r.id === id)?.details.join("\n") ?? "";

describe("dry run: a planned day committed in process and verified", { skip: !dirArg && "GATE_DRY_RUN is not set" }, () => {
  it("commits before the gate and verifies every leaf, V1 to V9; a changed probability or response is rejected", async () => {
    const index = readJson<FleetIndex>(join(dir, "manifest.json"));
    const od = Number(index.operating_day.replaceAll("-", ""));
    const { viem } = await network.create({ override: { initialDate: new Date((index.plan_unix + 120) * 1000).toISOString() } });
    const [wallet] = await viem.getWalletClients();
    assert.ok(wallet);
    const client = await viem.getPublicClient();
    const gr = await viem.deployContract("GateRecord");

    const leaves = index.leaves.map((l) => ({ entry: l, doc: readJson<{ agent: { wallet: string } }>(join(dir, l.manifest)) }));
    for (const { entry, doc } of leaves) {
      assert.equal(leafHash(doc), entry.leaf, `${entry.resource}: leaf file`);
      assert.equal(doc.agent.wallet.toLowerCase(), wallet.account.address.toLowerCase(), "the in-process committer signs the plan's wallet");
    }
    const scope = scopeId(index.scope_label);
    const tx = await gr.write.commit([scope, od, index.root, index.leaf_count, codeHashFromCommit(index.code_tree)]);
    const receipt = await client.waitForTransactionReceipt({ hash: tx });
    assert.equal(receipt.status, "success");
    // Write-once: a second record for the same day and scope is refused.
    await assert.rejects(gr.write.commit([scope, od, index.root, index.leaf_count, codeHashFromCommit(index.code_tree)]), /AlreadyCommitted/);

    const call = <T>(functionName: string, args: readonly unknown[]) =>
      client.readContract({ address: gr.address, abi: GATE_RECORD_ABI, functionName, args } as never) as Promise<T>;
    const reader: ChainReader = {
      chainId: () => client.getChainId(),
      async record(_c, key) {
        const r = await call<{ root: Hex; codeHash: Hex; scope: Hex; committer: Address; od: number; leafCount: number; committedAt: bigint; blockNumber: bigint }>("get", [key]);
        return r.committer === zeroAddress ? null : { ...r, committedAt: Number(r.committedAt), blockNumber: Number(r.blockNumber) };
      },
      async outcome(_c, key, stage) {
        const o = await call<{ hash: Hex; linkedAt: bigint }>("outcomeOf", [key, stage]);
        return o.linkedAt === 0n ? null : { hash: o.hash, linkedAt: Number(o.linkedAt) };
      },
      keyOf: (_c, committer, s, d) => call<Hex>("keyOf", [committer, s, d]),
      gateTs: async (_c, d) => Number(await call<bigint>("gateTs", [d])),
      dayEndTs: async (_c, d) => Number(await call<bigint>("dayEndTs", [d])),
      transaction: () => Promise.reject(new Error("not an anchor record")),
    };
    const net: NetworkInfo = { name: "hardhat-in-process", chainId: 31337, rpcUrls: [] };
    const { fetcher, mirror } = cacheFetcher(dir);
    const outsideFile = (route: string) => (existsSync(join(dir, route)) ? new Uint8Array(readFileSync(join(dir, route))) : null);

    const check = async (resource: string, manifest: unknown, files = outsideFile, reference?: unknown) => {
      const { position, proof, entry } = leafOf(index, resource);
      return verify({
        manifest,
        scenarios: readJson(join(dir, entry.scenarios)),
        ...(reference ? { reference } : {}),
        record: { mode: "contract", chainId: 31337, contract: gr.address },
        chain: { reader, network: net, contract: gr.address },
        scopeLabel: index.scope_label,
        inclusion: { index: position, size: index.leaf_count, proof },
        sources: { fetcher, mirror },
        outsideFile: files,
      });
    };

    for (const { entry } of leaves) {
      const rs = await check(entry.resource, readJson(join(dir, entry.manifest)));
      const want = { V1: "PASS", V2: "PASS", V3: "PASS", V4: "PASS", V5: "PASS", V6: "PASS", V7: "PASS", V8: "PASS", V9: "PASS", V10: "SKIP" };
      assert.deepEqual(statuses(rs), want, `${entry.resource}:\n${rs.map((r) => `${r.id} ${r.status} ${r.details.join(" | ")}`).join("\n")}`);
      console.log(`  ${entry.resource}: V1-V9 PASS; ${text(rs, "V8").split("\n")[0]}`);
    }

    const showcase = index.showcase ?? index.leaves[0]!.resource;
    const original = readJson<{ outside_inputs: { cournot: { probability_ppm: number; response: { route: string } } } | null }>(join(dir, `leaves/${showcase}.json`));
    if (original.outside_inputs) {
      const changed = structuredClone(original);
      changed.outside_inputs!.cournot.probability_ppm += 10_000;
      const rs = await check(showcase, changed, outsideFile, original);
      for (const id of ["V1", "V2", "V7", "V8"]) assert.equal(statuses(rs)[id], "FAIL", `${id} on a changed probability`);
      assert.match(text(rs, "V1"), /\$\.outside_inputs\.cournot\.probability_ppm/);
      assert.match(text(rs, "V7"), /outside_inputs\.cournot\.probability_ppm: the record says/);

      const route = original.outside_inputs.cournot.response.route;
      const bytes = readFileSync(join(dir, route), "utf8");
      const tampered = new TextEncoder().encode(bytes.replace(/"probability": [0-9.]+/, '"probability": 0.5'));
      assert.notEqual(fileSha256(tampered), fileSha256(bytes));
      const rt = await check(showcase, original, (r) => (r === route ? tampered : outsideFile(r)));
      assert.equal(statuses(rt).V7, "FAIL");
      assert.match(text(rt, "V7"), /outside_inputs\.cournot\.response: .* hashes to/);
      console.log(`  ${showcase}: a changed probability fails V1, V2, V7, V8; a tampered response fails V7`);
    }

    // After the gate the contract refuses any further record for the day.
    await (await network.create({ override: { initialDate: new Date((index.gate_unix + 60) * 1000).toISOString() } })).viem
      .deployContract("GateRecord")
      .then((late) => assert.rejects(late.write.commit([scope, od, index.root, index.leaf_count, codeHashFromCommit(index.code_tree)]), /AfterGate/));
  });
});
