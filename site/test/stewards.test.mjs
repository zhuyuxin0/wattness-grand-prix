// The Verify tab's leaf hash, proof walk and limits check against the
// sealed record of 2026-11-26. Run with `pnpm test` (Node 22.18 or later runs
// the TypeScript module directly).

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  checkLimits,
  computeLeaf,
  diff,
  inclusionProof,
  merkleRoot,
  rebuildManifest,
  walkProof,
} from "../src/pages/Verify/verify/core.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const fixture = join(repo, "fixtures", "od-20261126");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const index = readJson(join(fixture, "manifest.json"));
const sealed = index.leaves.filter((l) => existsSync(join(fixture, l.manifest)));
const leaves = index.leaves.map((l) => l.leaf);

test("the fixture holds both sealed leaves", () => {
  assert.deepEqual(
    sealed.map((l) => l.resource),
    ["CLO_ESR1", "DSWL_ESS_ESR1"],
  );
});

for (const entry of sealed) {
  test(`browser leaf hash of ${entry.resource} equals the sealed index`, async () => {
    const doc = readJson(join(fixture, entry.manifest));
    const { leaf } = await computeLeaf(doc);
    assert.equal(leaf, entry.leaf);
  });

  test(`${entry.resource}'s proof walks to the sealed root`, async () => {
    const m = index.leaves.indexOf(entry);
    const proof = await inclusionProof(leaves, m);
    const { leaf } = await computeLeaf(readJson(join(fixture, entry.manifest)));
    const { root, steps } = await walkProof(leaf, m, leaves.length, proof);
    assert.equal(steps.length, proof.length);
    assert.equal(root, index.root);
  });

  test(`${entry.resource}'s battery limits hold every hour`, () => {
    const doc = readJson(join(fixture, entry.manifest));
    const report = checkLimits(doc, 24);
    assert.deepEqual(report.problems, []);
    assert.equal(report.arms.length, 3);
  });

  test(`changing one hourly value in ${entry.resource} breaks its leaf and names the field`, async () => {
    const doc = readJson(join(fixture, entry.manifest));
    const copy = structuredClone(doc);
    const arm = copy.arms[copy.selected_arm];
    arm.kw[17] += 1000;
    const { leaf } = await computeLeaf(copy);
    assert.notEqual(leaf, entry.leaf);
    assert.deepEqual(diff(doc, copy), [{ path: `arms.${doc.selected_arm}.kw[17]`, sealed: doc.arms[doc.selected_arm].kw[17], checked: arm.kw[17] }]);
    assert.notDeepEqual(checkLimits(copy, 24).problems, []);
  });
}

test("the index's 316 leaf hashes give the sealed root", async () => {
  assert.equal(leaves.length, index.leaf_count);
  assert.equal(await merkleRoot(leaves), index.root);
});

test("the root agrees with both chain receipts", () => {
  for (const name of ["record.bsc-mainnet.json", "record.bsc-testnet.json"]) {
    const r = readJson(join(fixture, name));
    assert.equal(r.root, index.root);
    assert.equal(r.leafCount, index.leaf_count);
  }
});

test("the leaf hash agrees with packages/core", async (t) => {
  const built = join(repo, "packages", "core", "dist", "hash.js");
  if (!existsSync(built)) {
    t.skip("packages/core is not built (pnpm -r build)");
    return;
  }
  const core = await import(pathToFileURL(built).href);
  for (const entry of sealed) {
    const doc = readJson(join(fixture, entry.manifest));
    assert.equal((await computeLeaf(doc)).leaf, core.leafHash(doc));
  }
});

test("the published pack rebuilds the fixture's leaves exactly", async (t) => {
  const dir = join(here, "..", "public", "data", "stewards");
  if (!existsSync(join(dir, "pack.json"))) {
    t.skip("public/data/stewards is not built (pnpm data)");
    return;
  }
  const pack = readJson(join(dir, "pack.json"));
  assert.equal(pack.root, index.root);
  for (const entry of sealed) {
    const packed = readJson(join(dir, "leaves", `${entry.resource}.json`));
    const doc = rebuildManifest(pack, packed);
    assert.deepEqual(diff(readJson(join(fixture, entry.manifest)), doc), []);
    assert.equal((await computeLeaf(doc)).leaf, entry.leaf);
  }
});
