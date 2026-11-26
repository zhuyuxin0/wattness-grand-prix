// The Prices, Agent IDs and Memory tabs' data, held to their sources: the
// budget rule ported from the Atlas and CoinMarketCap adapter against the
// adapter's own test cases and recorded report, every tab of the side panel
// against the build brain's tab map, and the agents' record against itself.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { memoryRelation } from "../src/shell/memory-pages.ts";
import { TABS } from "../src/shell/tabs.ts";
import { decodeAtlasPayload, fundingDecision, RECORDED_ATLAS } from "../scripts/data/prices.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = resolve(site, "..");
const data = (p) => JSON.parse(readFileSync(join(site, "public", "data", p), "utf8"));

const now = 1_795_000_000;
const p = { asset: "BNB", priceUsd: 600, observedAtSeconds: now, source: "test", sourceId: "633" };
const atlas = [p, { ...p, asset: "USDT", priceUsd: 1, sourceId: "649" }];
const cmc = [{ ...p, percentChange24h: -4, volume24hUsd: 10_000 }];
const security = { state: "available", flagged: false, verifiedContract: true, source: "test" };

test("the ported budget rule gives the adapter's own test results", () => {
  const d = fundingDecision({ treasuryBnb: 0.25, atlas, cmc, security, now });
  assert.ok(Math.abs(d.reserveFraction - 0.18) < 1e-12);
  assert.equal(d.evaluationBudgetUsdCents, 12300);
  assert.equal(d.baselineEvaluationBudgetUsdCents, 13500);
  assert.equal(d.evaluationCount, 61);
  assert.equal(fundingDecision({ treasuryBnb: 0.25, atlas, cmc, security: { ...security, state: "unknown" }, now }).evaluationCount, 0);
  const split = fundingDecision({ treasuryBnb: 0.25, atlas: [{ ...p, priceUsd: 700 }, atlas[1]], cmc, security, now });
  assert.equal(split.state, "review");
  assert.ok(split.reasons.includes("BNB source deviation exceeds 5%"));
  const peg = fundingDecision({ treasuryBnb: 0.25, atlas: [p, { ...atlas[1], priceUsd: 0.98 }], cmc, security, now });
  assert.ok(peg.reasons.includes("USDT reference deviation exceeds 1%"));
  const capped = fundingDecision({ treasuryBnb: 0.25, atlas, cmc: [{ ...cmc[0], percentChange24h: 30 }], security, now });
  assert.equal(capped.reserveFraction, 0.5);
  assert.equal(capped.evaluationBudgetUsdCents, 7500);
  assert.equal(capped.evaluationCount, 37);
  assert.throws(() => fundingDecision({ treasuryBnb: 0.25, atlas: [{ ...p, observedAtSeconds: now - 181 }, atlas[1]], cmc, security, now }), /Stale/);
});

test("the recorded Atlas report is the adapter's fixture, and decodes the same", () => {
  const fixture = readFileSync(join(repo, "packages", "adapters", "atlas-cmc", "src", "index.test.ts"), "utf8");
  assert.ok(fixture.includes(`payload: "${RECORDED_ATLAS.payload}"`), "payload as the adapter records it");
  assert.ok(fixture.includes(`signature: "${RECORDED_ATLAS.signature}"`), "signature as the adapter records it");
  assert.ok(fixture.includes(`const recordedAt = ${RECORDED_ATLAS.recordedAt.toLocaleString("en-US").replaceAll(",", "_")};`), "the recorded time");
  const [bnb, usdt] = decodeAtlasPayload(RECORDED_ATLAS.payload);
  assert.equal(bnb.feedId, "633");
  assert.ok(Math.abs(Number(bnb.rawPrice) / 1e18 - 537.46340171) < 1e-8);
  assert.equal(usdt.feedId, "649");
  assert.ok(Math.abs(Number(usdt.rawPrice) / 1e18 - 0.99875512) < 1e-8);
  assert.equal(bnb.timestampSeconds, RECORDED_ATLAS.recordedAt);
});

test("the published prices carry the run's decision", () => {
  const prices = data("prices.json");
  assert.equal(prices.atlas.signer, prices.atlas.publishedSigner);
  assert.equal(prices.decision.after.state, "priced");
  assert.equal(prices.decision.after.evaluationCount, 57);
  assert.ok(prices.onChain.feeds.every((f) => /^0x[0-9a-f]{40}$/i.test(f.address)));
});

test("every tab of the side panel has a page in the build's memory", () => {
  const b = data("memory/build-brain.json");
  const pages = new Set(b.pages.map((x) => `${x.brain}:${x.slug}`));
  for (const t of TABS) {
    const entry = b.tabs[t.id];
    assert.ok(entry, `no page for the ${t.label} tab`);
    assert.ok(pages.has(`grand-prix:${entry.page}`), `the ${t.label} tab points at ${entry.page}, which the brain does not hold`);
    for (const s of entry.also) assert.ok(pages.has(`grand-prix:${s}`), `${t.label}: related page ${s} is not in the brain`);
  }
  for (const c of b.connections) {
    assert.ok(pages.has(`${c.aBrain}:${c.a}`) && pages.has(`${c.bBrain}:${c.b}`), `a connection names a missing page: ${c.a}, ${c.b}`);
  }
});

test("the line at each tab's foot says how the build's memory holds the tab, as its tab map does", () => {
  const b = data("memory/build-brain.json");
  // own page, the nearest page (the brain has none for the tab), or a section of another page
  for (const t of TABS) assert.equal(memoryRelation(t.id), b.tabs[t.id]?.relation, `the ${t.label} tab's cue`);
});

test("the agents' record names seven identities and three jobs, steps in order", () => {
  const f = data("agents.json");
  assert.deepEqual(
    f.agents.map((a) => a.agentId),
    [2922, 2923, 2924, 2925, 2926, 2927, 2928],
  );
  assert.deepEqual(
    f.agents.filter((a) => a.runs.where === "hosted").map((a) => a.agentId),
    [2922],
  );
  assert.deepEqual(
    f.jobs.map((j) => j.jobId),
    [1871, 1872, 1873],
  );
  for (const j of f.jobs) {
    assert.match(j.deliverable, /^0x[0-9a-f]{64}$/);
    const times = j.transactions.map((t) => t.blockTime);
    assert.deepEqual(times, [...times].sort((a, b) => a - b), `job ${j.jobId}'s steps are out of order`);
    assert.equal(j.transactions.at(-1).step, "settle");
  }
});
