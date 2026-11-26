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
import { candles, marketAt, pairPrice, percent, priceRange, ticks, tinyPrice, tinyText } from "../src/pages/Launchpad/market.ts";
import { LAUNCHES, PLNR, PLNR27, stateAt } from "../src/pages/Launchpad/replay.ts";
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
const sealedNov26 = readJson("fixtures", "od-20261126", "record.bsc-testnet.json");
const tokensJson = readJson("modules", "openfour", "submission", "tokens.json");
const siteReceipts = readJson("site", "public", "data", "receipts.json");

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

test("the launch card replays PLNR's recorded transactions", () => {
  const launch = deployment.launches[0];
  const o = integrations.openfour;
  assert.deepEqual(LAUNCHES.map((x) => x.symbol), ["PLNR27", "PLNR"], "the newest launch opens the card");
  for (const k of ["token", "vault", "migrateModule", "agent", "pair"]) same(PLNR[k], OPENFOUR.launch[k], k);
  for (const k of ["name", "symbol"]) assert.equal(PLNR[k], OPENFOUR.launch[k]);
  same(PLNR.creator, deployment.openFour.owner, "the creator is the deployment's own wallet");
  same(PLNR.quote.address, OPENFOUR.wbnb, "quoted in WBNB");
  same(keccak256(stringToBytes(PLNR.scopeLabel)), launch.scope, "scope");
  assert.equal(PLNR.minOd, launch.minOd);

  const f = Object.fromEntries(PLNR.frames.map((x) => [x.kind, x]));
  assert.deepEqual(PLNR.frames.map((x) => x.kind), ["create", "buy", "refused", "bind", "graduated"]);
  same(f.create.hash, launch.txHash, "create");
  assert.equal(f.create.block, Number(launch.blockNumber));
  same(f.refused.hash, o.refused.tx, "refused graduation");
  assert.equal(f.refused.block, o.refused.block);
  assert.equal(f.refused.ok, false);
  assert.equal(f.refused.refused.error, o.refused.error);
  same(f.bind.hash, o.evidence.tx, "binding");
  assert.equal(f.bind.block, o.evidence.block);
  same(f.graduated.hash, o.graduated.tx, "graduation");
  assert.equal(f.graduated.block, o.graduated.block);
  same(f.graduated.graduated.pair, o.graduated.pair, "pair");
  // its create's and its buy's prices, and the buy's amounts, as tokens.json records them from the receipts
  const t = tokensJson.tokens.find((x) => x.symbol === "PLNR");
  const rec = (action) => t.records.find((r) => r.action === action);
  assert.equal(f.create.price, rec("create").initialPrice);
  assert.equal(f.buy.price, rec("buy").lastPrice);
  same(f.buy.hash, rec("buy").txHash, "buy");
  assert.equal(f.buy.trade.traderQuote, rec("buy").traderQuoteAmount);
  assert.equal(f.buy.trade.curve, rec("buy").curveQuoteAmount);
  // the frames run in block order, each later than the one before
  for (let i = 1; i < PLNR.frames.length; i++) assert.ok(PLNR.frames[i].block > PLNR.frames[i - 1].block && PLNR.frames[i].time >= PLNR.frames[i - 1].time);

  // the refusal names the agent and the scope; its revert data is EvidenceMissing(agent, scope)
  same(f.refused.refused.agent, PLNR.agent, "refused for the agent");
  same(f.refused.refused.scope, launch.scope, "refused for the scope");
  assert.equal(f.refused.refused.data.slice(0, 10), keccak256(stringToBytes("EvidenceMissing(address,bytes32)")).slice(0, 10));
  assert.ok(f.refused.refused.data.toLowerCase().endsWith(PLNR.agent.slice(2).toLowerCase() + launch.scope.slice(2).toLowerCase()));

  // the bound record is the sealed plan for Nov 26 as GateRecord holds it
  const b = f.bind.bound;
  same(b.key, o.evidence.record_key, "record key");
  assert.equal(b.od, o.evidence.operating_day);
  same(b.key, sealedNov26.key, "the fixture's key");
  same(b.root, sealedNov26.root, "root");
  same(b.codeHash, sealedNov26.codeHash, "code hash");
  assert.equal(b.leafCount, sealedNov26.leafCount);
  assert.equal(b.committedAt, sealedNov26.committedAt);
  assert.equal(b.recordBlock, sealedNov26.blockNumber);
  assert.equal(b.gate, Date.UTC(2026, 10, 25, 16, 0, 0) / 1000, "10:00 CT on Nov 25, the gate for Nov 26");
  assert.ok(b.committedAt < b.gate);
});

test("the launch card replays PLNR27 from tokens.json, every create, buy, sell and migrate", () => {
  const t = tokensJson.tokens.find((x) => x.symbol === "PLNR27");
  const launch = deployment.launches.find((x) => x.symbol === "PLNR27");
  assert.ok(t && launch, "tokens.json and the deployment record hold PLNR27");
  same(PLNR27.token, t.tokenAddress, "token");
  for (const k of ["vault", "migrateModule", "creator"]) same(PLNR27[k], t[k], k);
  for (const k of ["token", "vault", "migrateModule", "agent", "pair"]) same(PLNR27[k], launch[k], k);
  assert.equal(PLNR27.name, t.name);
  for (const k of ["maxSupply", "saleAmount", "raiseAmount"]) assert.equal(PLNR27[k], t[k], k);
  assert.equal(PLNR27.minOd, t.gate.minOd);
  assert.equal(PLNR27.minLeafCount, t.gate.minLeafCount);
  assert.equal(PLNR27.scopeLabel, t.gate.scopeLabel);
  same(PLNR27.pair, t.pool.pair, "pair");

  // the frames are the records that move the token or the gate, in order; the rest are the setup
  const kinds = { create: "create", buy: "buy", sell: "sell", bind: "bind" };
  const frameRecords = t.records.filter((r) => r.action in kinds || r.action === "migrate");
  assert.deepEqual(
    PLNR27.frames.map((f) => f.hash.toLowerCase()),
    frameRecords.map((r) => r.txHash.toLowerCase()),
  );
  assert.deepEqual(
    PLNR27.setup.map((x) => x.hash.toLowerCase()),
    t.records.filter((r) => !(r.action in kinds) && r.action !== "migrate").map((r) => r.txHash.toLowerCase()),
  );
  PLNR27.frames.forEach((f, i) => {
    const r = frameRecords[i];
    assert.equal(f.block, Number(r.blockNumber), `${f.kind} block`);
    assert.equal(f.time, r.time.unix, `${f.kind} time`);
    assert.equal(f.ok, r.status === "success", `${f.kind} status`);
    if (f.kind === "create") assert.equal(f.price, r.initialPrice, "the curve's first price, TokenCreated's initialPrice");
    if (f.kind === "buy" || f.kind === "sell") {
      assert.equal(f.price, r.lastPrice, `${f.kind}: the price after it, TradeExecuted's lastPrice`);
      assert.equal(f.trade.tokens, r.tokenAmount);
      assert.equal(f.trade.curve, r.curveQuoteAmount);
      assert.equal(f.trade.traderQuote, r.traderQuoteAmount);
      assert.equal(BigInt(f.trade.fees), BigInt(r.protocolFee) + BigInt(r.devFee) + BigInt(r.taxFee) + BigInt(r.antiSniperFee));
      assert.equal(f.raised, r.totalRaisedAfter);
      assert.equal(BigInt(f.sold), BigInt(t.saleAmount) - BigInt(r.remainingForSaleAfter));
      same(f.trade.trader, r.from, "trader");
    }
    if (!["create", "buy", "sell"].includes(f.kind)) assert.equal(f.price, undefined, `${f.kind} does not move the curve`);
    if (f.kind === "refused") {
      assert.equal(r.result, "refused");
      const replay = r.replayAtParentBlock.find((x) => x.reverted);
      assert.equal(f.refused.data, replay.data);
      assert.equal(f.refused.error, replay.error.name);
    }
    if (f.kind === "bind") {
      same(f.bound.key, r.evidenceKey, "key");
      assert.equal(f.bound.od, r.od);
      same(f.bound.root, r.root, "root");
    }
    if (f.kind === "graduated") {
      assert.equal(r.result, "migrated");
      same(f.graduated.pair, r.pair, "pair");
      assert.equal(f.graduated.tokens, r.tokenToPool);
      assert.equal(f.graduated.quote, r.quoteToPool);
      assert.equal(f.graduated.lpBurned, r.liquidityToDead);
      assert.equal(BigInt(f.graduated.lpBurned) + BigInt(f.graduated.lpMinimum), BigInt(t.pool.lpTotalSupply));
    }
  });

  // the bound record is the Nov 27 seal on BSC testnet, as the site's receipts hold it
  const b = PLNR27.frames.find((f) => f.bound).bound;
  same(b.key, t.evidence.key, "evidence key");
  const sealed = siteReceipts.receipts.find((r) => r.chainId === 97 && r.key.toLowerCase() === b.key.toLowerCase());
  assert.ok(sealed, "the site's receipts hold the Nov 27 testnet record");
  same(b.root, sealed.root, "root");
  same(b.codeHash, sealed.codeHash, "code hash");
  same(b.codeHash, t.gate.codeHash, "the code hash the launch requires");
  assert.equal(b.leafCount, sealed.leafCount);
  assert.equal(b.recordBlock, sealed.blockNumber);
  assert.equal(b.committedAt, sealed.blockTime);
  assert.equal(b.gate - b.committedAt, sealed.secondsBeforeGate);
  assert.equal(b.gate, Date.UTC(2026, 10, 26, 16, 0, 0) / 1000, "10:00 CT on Nov 26, the gate for Nov 27");
});

test("every replay's curve, holders and pool add up", () => {
  for (const l of LAUNCHES) {
    const max = BigInt(l.maxSupply);
    l.frames.forEach((f, i) => {
      const s = stateAt(l, i);
      assert.equal(s.holders.reduce((a, h) => a + h.amount, 0n), max, `${l.symbol} frame ${i}: every token is held`);
      // the curve holds what it has not sold, and the sale's share of the supply until graduation
      const curve = s.holders.find((h) => h.role === "curve")?.amount ?? 0n;
      if (!s.graduated) assert.equal(curve, max - s.sold, `${l.symbol} frame ${i}: the vault holds the unsold tokens`);
      if (f.trade) assert.equal(BigInt(f.trade.traderQuote) - BigInt(f.trade.curve), (f.kind === "buy" ? 1n : -1n) * BigInt(f.trade.fees), `${l.symbol} ${f.kind}: fees`);
    });
    const end = stateAt(l, l.frames.length - 1);
    assert.equal(end.phase, "Graduated");
    const k = BigInt(end.graduated.quote) * BigInt(end.graduated.tokens);
    const lp = BigInt(end.graduated.lpBurned) + BigInt(end.graduated.lpMinimum);
    assert.ok(lp * lp <= k && (lp + 1n) * (lp + 1n) > k, `${l.symbol}: the pair's first mint`);
  }
  const p = (i) => stateAt(PLNR27, i).progress;
  assert.deepEqual([0, 1, 2, 3].map(p), [0, 0.125, 0.0125, 1], "PLNR27's curve fills, gives back on the sale, then sells out");
});

test("the token page's market figures follow from the receipts", () => {
  const t = tokensJson.tokens.find((x) => x.symbol === "PLNR27");
  const trades = t.records.filter((r) => r.action === "buy" || r.action === "sell");
  // the trades are the buys and sells, each from the price the last one left to its own
  const ts = ticks(PLNR27);
  assert.deepEqual(ts.map((x) => x.hash.toLowerCase()), trades.map((r) => r.txHash.toLowerCase()));
  assert.deepEqual(ts.map((x) => [x.kind, x.before, x.after]), [
    ["buy", 3188775n, 3877188n],
    ["sell", 3877188n, 3248998n],
    ["buy", 3248998n, 48999999n],
  ]);
  ts.forEach((x, i) => {
    assert.equal(x.quote, BigInt(trades[i].traderQuoteAmount));
    assert.equal(x.tokens, BigInt(trades[i].tokenAmount));
  });

  // price, change, market cap, liquidity and volume at each frame
  const m = PLNR27.frames.map((_, i) => marketAt(PLNR27, i));
  assert.deepEqual(m.map((x) => x.price), [3188775n, 3877188n, 3248998n, 48999999n, 48999999n, 48999999n, 49999999n]);
  assert.deepEqual(m.map((x) => x.priceSource), ["create", "trade", "trade", "trade", "trade", "trade", "pair"]);
  assert.deepEqual(m.map((x) => percent(x.change)), ["0.00%", "+21.59%", "+1.89%", "+1,436.64%", "+1,436.64%", "+1,436.64%", "+1,468.00%"]);
  // the market cap is the price times the whole supply: 0.48999999 WBNB once the sale sold out
  assert.equal(m[3].marketCap, 48999999n * 10_000_000_000n);
  assert.equal(m[0].marketCap, (3188775n * BigInt(PLNR27.maxSupply)) / 10n ** 18n);
  // the curve holds what it raised; once graduated, the pair holds it with the tokens kept back
  assert.deepEqual(m.slice(0, 6).map((x) => [x.liquidity.where, x.liquidity.quote]), PLNR27.frames.slice(0, 6).map((f) => ["curve", BigInt(f.raised)]));
  assert.deepEqual([m[6].liquidity.where, m[6].liquidity.quote, m[6].liquidity.tokens], ["pair", BigInt(t.pool.reserveQuote), BigInt(t.pool.reserveToken)]);
  assert.equal(m[6].price, pairPrice(BigInt(t.pool.reserveQuote), BigInt(t.pool.reserveToken)), "the pair's first price is its reserves'");
  // the volume is what the traders paid and got, fees included
  const paid = trades.reduce((a, r) => a + BigInt(r.traderQuoteAmount), 0n);
  assert.equal(m[6].volume, paid);
  assert.equal(m[6].trades, 3);
  assert.equal(m[0].created, t.records[0].time.unix);

  // candles: a trade moves its candle from the last price to its own; a minute holds all three
  const c15 = candles(PLNR27, PLNR27.frames.length - 1, 15);
  assert.equal(c15.length, 3);
  assert.deepEqual(c15.map((c) => c.close >= c.open), [true, false, true], "buy, sell, buy");
  const [minute] = candles(PLNR27, PLNR27.frames.length - 1, 60);
  assert.equal(minute.trades.length, 3);
  assert.deepEqual([minute.open, minute.high, minute.low, minute.close], [3188775e-18, 48999999e-18, 3188775e-18, 48999999e-18]);
  assert.equal(minute.volume, paid);
  assert.equal(candles(PLNR27, 0, 15).length, 0, "no candle before the first trade");
  assert.equal(candles(PLNR27, 2, 15).length, 2, "the replay draws the trades so far");
  assert.deepEqual(priceRange(PLNR27), [3188775e-18, 49999999e-18]);

  // PLNR sold out in one buy
  assert.deepEqual(ticks(PLNR).map((x) => [x.kind, x.before, x.after]), [["buy", 3188775n, 48999999n]]);
  assert.equal(marketAt(PLNR, PLNR.frames.length - 1).volume, BigInt(PLNR.frames[1].trade.traderQuote));
});

test("a tiny price is written with its zeros counted", () => {
  assert.deepEqual(tinyPrice(48999999e-18), { head: "0.0", zeros: 10, tail: "49", plain: "0.000000000049" });
  assert.equal(tinyText(48999999e-18), "0.0₁₀49");
  assert.equal(tinyText(3188775e-18), "0.0₁₁3189");
  assert.equal(tinyText(49999999e-18), "0.0₁₀5");
  assert.equal(tinyText(9.99996e-12), "0.0₁₀1", "a rounding that carries adds a figure's place");
  assert.equal(tinyText(0.5), "0.5");
  assert.equal(tinyText(0), "0");
  assert.equal(percent(-0.162), "−16.20%");
});

test("the replay's curve, holders and pool add up", () => {
  const max = BigInt(PLNR.maxSupply);
  const sale = BigInt(PLNR.saleAmount);
  PLNR.frames.forEach((_, i) => {
    const s = stateAt(PLNR, i);
    assert.equal(s.holders.reduce((a, h) => a + h.amount, 0n), max, `frame ${i}: every token is held`);
    assert.ok(s.sold <= sale && s.progress >= 0 && s.progress <= 1);
  });
  const start = stateAt(PLNR, 0);
  assert.equal(start.progress, 0);
  assert.deepEqual(start.holders.map((h) => h.role), ["curve"]);
  const buy = PLNR.frames[1].trade;
  assert.equal(BigInt(buy.traderQuote) - BigInt(buy.curve), BigInt(buy.fees), "the trader paid the curve and the fees");
  const sold = stateAt(PLNR, 1);
  assert.equal(sold.progress, 1);
  assert.equal(sold.raised, BigInt(buy.curve));
  const refused = stateAt(PLNR, 2);
  assert.equal(refused.phase, "Sold out");
  assert.equal(refused.bound, null);
  assert.ok(refused.refusedBefore);
  assert.ok(stateAt(PLNR, 3).bound);
  const end = stateAt(PLNR, PLNR.frames.length - 1);
  assert.equal(end.phase, "Graduated");
  assert.deepEqual(end.holders.map((h) => [h.role, h.amount]), [
    ["creator", 8_000_000_000n * E18],
    ["pair", 2_000_000_000n * E18],
  ]);
  // what went into the pair is what the curve raised and the tokens the vault kept
  assert.equal(BigInt(end.graduated.quote), end.raised);
  assert.equal(BigInt(end.graduated.tokens), max - sale);
  // the burned LP tokens and the minimum liquidity are the square root of the reserves' product (Uniswap V2's first mint)
  const k = BigInt(end.graduated.quote) * BigInt(end.graduated.tokens);
  const lp = BigInt(end.graduated.lpBurned) + BigInt(end.graduated.lpMinimum);
  assert.ok(lp * lp <= k && (lp + 1n) * (lp + 1n) > k);
});

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
