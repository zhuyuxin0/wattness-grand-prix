// The Season and Launchpad tabs, held to the repository: every address and
// transaction they show is the one the repo records, the nodes they read are
// the verifier's, and the worked example follows the contracts' arithmetic.
// Run with `pnpm test` (Node 22.18 or later runs the TypeScript modules
// directly).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { keccak256, stringToBytes } from "viem";
import { formatAmount, formatPrice, ratio } from "../src/lib/amounts.ts";
import { OPENFOUR } from "../src/pages/Launchpad/addresses.ts";
import { SCOPE, SEASON, WATTNESS_AGENT } from "../src/pages/Season/addresses.ts";
import { sellInto, workedExample } from "../src/pages/Season/payouts.ts";
import { predictToken } from "../src/pages/Season/token.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const read = (...p) => readFileSync(join(repo, ...p), "utf8");
const readJson = (...p) => JSON.parse(read(...p));
const same = (a, b, what) => assert.equal(String(a).toLowerCase(), String(b).toLowerCase(), what);

const flapSource = read("packages", "adapters", "flap", "src", "season.ts");
const flapReadme = read("modules", "flap", "README.md");
const integrations = readJson("packages", "world", "src", "stations", "stack", "integrations.json");
const deployment = readJson("modules", "openfour", "deployments", "bsc-testnet.json");
const agents = readJson("contracts", "deployments", "agents.bsc-testnet.json");

/** A quoted address after `name:` in the adapter's SEASON_TESTNET. */
function adapterValue(name) {
  const m = new RegExp(`\\b${name}:\\s*'(0x[0-9a-fA-F]{40})'`).exec(flapSource);
  assert.ok(m, `SEASON_TESTNET names ${name}`);
  return m[1];
}

test("the tabs read the nodes the verifier reads, in its order", () => {
  const verifier = /"bsc-testnet":\s*\{[\s\S]*?rpcUrls:\s*\[([\s\S]*?)\]/.exec(read("packages", "verifier", "src", "chain.ts"));
  assert.ok(verifier, "the verifier lists bsc-testnet nodes");
  const ours = /export const TESTNET_RPCS: readonly string\[\] = \[([\s\S]*?)\];/.exec(read("site", "src", "lib", "testnet.ts"));
  assert.ok(ours, "site/src/lib/testnet.ts lists its nodes");
  const urls = (m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.ok(urls(verifier).length >= 2);
  assert.deepEqual(urls(ours), urls(verifier));
});

test("the season's addresses are the adapter's SEASON_TESTNET", () => {
  same(SEASON.launcherFactory, adapterValue("launcherFactory"), "launcher factory");
  same(SEASON.vaultFactory, adapterValue("vaultFactory"), "vault factory");
  same(SEASON.launched.launcher, adapterValue("launcher"), "launched round");
  same(SEASON.launched.token, adapterValue("token"), "PRIX");
  same(SEASON.launched.pool, adapterValue("pool"), "pool");
  same(SEASON.launched.vault, adapterValue("vault"), "vault");
  const constant = (name) => new RegExp(`export const ${name}: Address = '(0x[0-9a-fA-F]{40})'`).exec(flapSource)?.[1];
  same(SEASON.quoteToken, constant("TEST_USD"), "quote token");
  same(SEASON.gateRecord, constant("GATE_RECORD"), "GateRecord");
  same(SEASON.tokenImpl, constant("TOKEN_IMPL"), "token implementation");
  const portal = /PORTAL: Address = '(0x[0-9a-fA-F]{40})'/.exec(read("packages", "adapters", "flap", "src", "constants.ts"))?.[1];
  same(SEASON.portal, portal, "Portal");
});

test("the season's addresses are in modules/flap's table", () => {
  for (const a of [SEASON.portal, SEASON.gateRecord, SEASON.quoteToken, SEASON.launcherFactory, SEASON.vaultFactory, ...Object.values(SEASON.launched).filter((v) => typeof v === "string")]) {
    assert.ok(flapReadme.includes(`\`${a}\``), `modules/flap/README.md lists ${a}`);
  }
});

test("the launched round's transactions are the recorded ones", () => {
  const [launch, claim] = SEASON.launched.transactions;
  same(launch.hash, integrations.flap.launch.tx, "launch");
  same(claim.hash, integrations.flap.vault_claim.tx, "vault claim");
  same(SEASON.launched.launcher, integrations.flap.launcher, "launcher");
  same(SEASON.launched.vault, integrations.flap.vault, "vault");
});

test("the Wattness agent and the scope are the record's own", () => {
  same(WATTNESS_AGENT, agents.seal.committer, "committer");
  same(SCOPE.id, agents.seal.scopeId, "scope id");
  assert.equal(SCOPE.label, agents.seal.scopeLabel);
  same(keccak256(stringToBytes(SCOPE.label)), SCOPE.id, "scope id is keccak256 of the label");
});

test("a round's token address follows from its salt, as the adapter's test vector says", () => {
  const salt = /predicts the token the Portal created[\s\S]*?const salt: Hex = '(0x[0-9a-f]{64})'/.exec(read("packages", "adapters", "flap", "test", "season.test.ts"))?.[1];
  assert.ok(salt, "the adapter's test holds the launched round's salt");
  same(predictToken(salt, SEASON.portal, SEASON.tokenImpl), SEASON.launched.token, "predicted PRIX");
});

test("OpenFour's addresses and transactions are the deployment record's", () => {
  const o = deployment.openFour;
  same(OPENFOUR.registry, o.registry, "registry");
  same(OPENFOUR.core, o.core, "core");
  same(OPENFOUR.tools, o.tools, "tools");
  same(OPENFOUR.wbnb, o.wbnb, "wbnb");
  same(OPENFOUR.module.implementation, deployment.module.implementation, "implementation");
  same(OPENFOUR.module.beacon, deployment.module.beacon, "beacon");
  same(OPENFOUR.module.pairFactory, deployment.module.pairFactory, "pair factory");
  same(OPENFOUR.gateRecord, deployment.module.gateRecord, "GateRecord");
  assert.equal(OPENFOUR.module.tag, deployment.module.tag);
  assert.equal(OPENFOUR.preset.id, deployment.preset.id);
  assert.equal(OPENFOUR.preset.name, deployment.preset.name);
  const launch = deployment.launches[0];
  for (const k of ["name", "symbol"]) assert.equal(OPENFOUR.launch[k], launch[k]);
  for (const k of ["token", "vault", "migrateModule", "agent", "pair"]) same(OPENFOUR.launch[k], launch[k], k);

  const step = Object.fromEntries(OPENFOUR.steps.map((s) => [s.id, s.hash]));
  same(step.module, deployment.module.txHash, "module transaction");
  same(step.preset, deployment.preset.txHash, "preset transaction");
  same(step.create, launch.txHash, "create transaction");
  same(step.refused, integrations.openfour.refused.tx, "refused graduation");
  assert.equal(integrations.openfour.refused.error, "EvidenceMissing");
  same(step.bind, integrations.openfour.evidence.tx, "binding");
  same(step.graduated, integrations.openfour.graduated.tx, "graduation");
  same(OPENFOUR.launch.pair, integrations.openfour.graduated.pair, "pair");
  same(OPENFOUR.launch.agent, WATTNESS_AGENT, "the launch's agent is the Wattness agent");
});

const E18 = 10n ** 18n;
// A round set up as round 3 is: SeasonLauncher's supply halves, a 2,000 USD cap,
// a 20% earned share, a 100 USD tax cap and two season days. The page takes the
// same numbers from the round's Launcher at the block it reads.
const ROUND = {
  raiseCap: 2000n * E18,
  poolToken: 500_000_000n * E18,
  reserve: 500_000_000n * E18,
  earnedBps: 2000,
  rewardCap: 100n * E18,
  seasonDays: 2,
};

test("the worked example follows the contracts' arithmetic", () => {
  const ex = workedExample(ROUND);
  const [alice, bob, carol] = ex.rows;
  assert.equal(ex.raised, 2000n * E18);
  assert.equal(ex.earnedTokens, 100_000_000n * E18);
  assert.equal(ex.contributorTokens, 400_000_000n * E18);

  assert.deepEqual([alice.deposit, bob.deposit, carol.deposit], [1000n * E18, 600n * E18, 400n * E18]);
  assert.deepEqual([alice.launcher, bob.launcher, carol.launcher], [200_000_000n * E18, 120_000_000n * E18, 80_000_000n * E18]);
  assert.deepEqual([alice.sealed, bob.sealed, carol.sealed], [2, 1, 0]);
  assert.deepEqual([alice.vaultTokens, bob.vaultTokens, carol.vaultTokens], [50_000_000n * E18, 15_000_000n * E18, 0n]);
  assert.deepEqual([alice.vaultTaxAtCap, bob.vaultTaxAtCap, carol.vaultTaxAtCap], [50n * E18, 15n * E18, 0n]);
  // Every season day sealed: deposit / raised * 500M tokens, worth the deposit at the opening price.
  assert.equal(alice.tokens, 250_000_000n * E18);
  assert.equal(alice.atOpening, 1000n * E18);
  assert.equal(bob.atOpening, 540n * E18);
  assert.equal(carol.atOpening, 320n * E18);
  assert.equal(formatAmount(alice.exitAlone), "666.67");
  assert.equal(formatAmount(bob.exitAlone), "425.20");
  assert.equal(formatAmount(carol.exitAlone), "275.86");
  assert.equal(ex.unearnedTokens, 35_000_000n * E18);
  assert.equal(ex.unearnedTaxAtCap, 35n * E18);
  assert.equal(ex.tokensAll, 465_000_000n * E18);
  assert.equal(formatAmount(ex.exitAll), "963.73");
  assert.equal(formatPrice(ratio(ex.raised, ROUND.poolToken)), "0.000004");
});

test("a sale into a constant-product pool returns less than its opening value", () => {
  assert.equal(sellInto(2000n * E18, 500_000_000n * E18, 0n), 0n);
  const out = sellInto(2000n * E18, 500_000_000n * E18, 250_000_000n * E18);
  assert.ok(out < 1000n * E18);
  assert.equal(formatAmount(out, 18, 0), "667");
});

test("amounts format with grouping, rounding and a typographic minus", () => {
  assert.equal(formatAmount(1311950516943174325617n), "1,311.95");
  assert.equal(formatAmount(8684469002359787036n), "8.68");
  assert.equal(formatAmount(400_000_000n * E18, 18, 0), "400,000,000");
  assert.equal(formatAmount(99999999999999998n, 18, 4), "0.1000");
  assert.equal(formatAmount(-5n * E18, 18, 0), "−5");
  assert.equal(formatPrice(ratio(1311950516943174325617n, 610951097802607501844694160n)), "0.00000215");
  assert.equal(formatPrice(ratio(99999999999999998n, 2_000_000_000n * E18)), "0.00000000005");
});
