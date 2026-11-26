// The Atlas components' arithmetic and reads: feed keys, the late check, the
// seal's cost, the market-day note, and the chain reads decoded from responses
// recorded from BNB Smart Chain's public node on 26 Nov 2026. Runs offline.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  BNB_USD_FEED,
  LATE_MARGIN_S,
  STOCK_MULTIFEED,
  TEXAS_FEEDS,
  US_MARKET_HOLIDAYS,
  ctDay,
  feedKey,
  feedPage,
  fixedToNumber,
  fixedToString,
  formatAge,
  formatBnb,
  formatGwei,
  formatSmallUsd,
  freshness,
  marketNote,
  receiptMismatch,
  sealCost,
  usMarketClosure,
} from "../src/components/atlas/atlas.ts";
import { NodesUnavailable, failureDetail, onPublicNode, readMultiFeed, readReceipt, readSingleFeed } from "../src/components/atlas/chain.ts";

const unix = (iso) => Date.parse(iso) / 1000;

// ---------------------------------------------------------------- feeds

test("each stock feed's on-chain key is its catalog id as four bytes", () => {
  assert.deepEqual(
    TEXAS_FEEDS.map((f) => [f.symbol, feedKey(f.id)]),
    [
      ["VSTB", "0x0000044e"],
      ["FLNCB", "0x000003d8"],
      ["GEVB", "0x00000467"],
      ["IRENB", "0x000003e3"],
    ],
  );
  for (const bad of [-1, 2 ** 32, 1.5, Number.NaN]) assert.throws(() => feedKey(bad), RangeError);
});

test("the board lists four companies, each with one short line, its logo and its feed page", () => {
  assert.deepEqual(
    TEXAS_FEEDS.map((f) => f.company),
    ["Vistra", "Fluence", "GE Vernova", "IREN"],
  );
  const sources = readFileSync(new URL("../public/logos/SOURCES.md", import.meta.url), "utf8");
  assert.match(sources, /Logos are trademarks of their owners, shown only to identify each company\./);
  for (const f of TEXAS_FEEDS) {
    assert.equal(f.pair, `${f.symbol}/USD`);
    assert.ok(f.role.length > 0 && f.role.length <= 60 && !f.role.includes("\n"), f.role);
    assert.equal(feedPage(f.id), `https://atlasoracle.io/feeds/${f.id}`);
    // Each logo is published and listed with its source; an SVG one is plain: no script, no handler, nothing fetched.
    const file = readFileSync(new URL(`../public/logos/${f.logo}`, import.meta.url));
    if (f.logo.endsWith(".svg")) {
      const svg = file.toString("utf8");
      assert.match(svg, /<svg[\s>]/, f.logo);
      assert.doesNotMatch(svg, /<script|<foreignObject|\son[a-z]+\s*=|(?:xlink:)?href\s*=\s*["'](?!#|data:)/i, f.logo);
    } else {
      assert.ok(f.logo.endsWith(".png") && file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), f.logo);
    }
    assert.ok(sources.includes(`\`${f.logo}\``), `${f.logo} is not listed in SOURCES.md`);
  }
  assert.match(STOCK_MULTIFEED.address, /^0x[0-9a-f]{40}$/);
  assert.match(BNB_USD_FEED.address, /^0x[0-9a-f]{40}$/);
});

// ---------------------------------------------------------------- fixed point

test("fixed-point values keep every digit as text and come close as numbers", () => {
  assert.equal(fixedToString(9465450000000n, 18), "0.00000946545");
  assert.equal(fixedToString(50000000n, 9), "0.05");
  assert.equal(fixedToString(10n ** 18n, 18), "1");
  assert.equal(fixedToString(0n, 18), "0");
  assert.equal(fixedToString(122639726864273891730n, 18), "122.63972686427389173");
  assert.equal(fixedToString(-5n, 1), "−0.5");
  assert.ok(Math.abs(fixedToNumber(554049771936238131510n, 18) - 554.04977193623813151) < 1e-12);
  assert.equal(fixedToNumber(4764024954529376721n, 18).toFixed(6), "4.764025");
  assert.throws(() => fixedToString(1n, -1), RangeError);
});

// ---------------------------------------------------------------- the late check

test("a value is late only past its heartbeat plus the margin, at the block it was read in", () => {
  const hb = STOCK_MULTIFEED.heartbeatS;
  assert.equal(LATE_MARGIN_S, 30);
  assert.deepEqual(freshness(1795681340, 1795681354, hb), { state: "fresh", ageS: 14, limitS: 90 });
  assert.equal(freshness(1000, 1000 + hb + LATE_MARGIN_S, hb).state, "fresh");
  assert.deepEqual(freshness(1000, 1000 + hb + LATE_MARGIN_S + 1, hb), { state: "late", ageS: 91, limitS: 90 });
  // Eight minutes without a push on a 60 s feed.
  assert.deepEqual(freshness(1795680000, 1795680493, hb), { state: "late", ageS: 493, limitS: 90 });
  assert.equal(freshness(1000, 1100, hb, 0).state, "late");
});

test("a feed never written reads as no value, and a time past the block is not negative", () => {
  assert.deepEqual(freshness(0, 1795681354, 60), { state: "empty", ageS: 0, limitS: 90 });
  assert.deepEqual(freshness(1795681360, 1795681354, 60), { state: "fresh", ageS: 0, limitS: 90 });
  for (const args of [
    [Number.NaN, 1, 60],
    [1, Number.POSITIVE_INFINITY, 60],
    [1, 2, 0],
    [1, 2, 60, -1],
  ]) {
    assert.throws(() => freshness(...args), RangeError);
  }
});

// ---------------------------------------------------------------- the seal's cost

// The 26 Nov commit on BNB Smart Chain: 189,309 gas at 0.05 gwei, 316 plans,
// valued at Atlas's BNB/USD as read on 26 Nov at 02:22:20 CT.
const SEAL = { gasUsed: 189309n, effectiveGasPrice: 50000000n, plans: 316 };
const BNB_USD = 554049771936238131510n;

test("the seal's fee is gas used times the effective gas price, exactly", () => {
  const cost = sealCost({ ...SEAL, price: BNB_USD, priceDecimals: 18 });
  assert.equal(cost.feeWei, 9465450000000n);
  assert.equal(formatBnb(cost.feeWei), "0.00000946545 BNB");
  assert.equal(formatGwei(SEAL.effectiveGasPrice), "0.05 gwei");
});

const near = (a, b, rel) => Math.abs(a - b) <= Math.abs(b) * rel;

test("the fee in dollars and per plan, at the given BNB price", () => {
  const cost = sealCost({ ...SEAL, price: BNB_USD, priceDecimals: 18 });
  // 0.00000946545 BNB × $554.04977193623813151 = $0.0052443304137738652...
  assert.ok(near(cost.usd, 0.0052443304137738652, 1e-14), String(cost.usd));
  assert.ok(near(cost.perPlanUsd, 0.0000165959823220691937, 1e-14), String(cost.perPlanUsd));
  assert.equal(formatSmallUsd(cost.usd), "$0.0052");
  assert.equal(formatSmallUsd(cost.perPlanUsd), "$0.000017");
  assert.equal(Math.round(cost.perPlanGas), 599);
  // The price's own decimals set the scale: the same price at 8 decimals.
  const eight = sealCost({ ...SEAL, price: 55404977194n, priceDecimals: 8 });
  assert.ok(near(eight.usd, cost.usd, 1e-10));
});

test("a receipt from chain must be the published commit's", () => {
  const commit = { blockNumber: 135677078, contract: "0x2922c68cE15EB3e83B7f43b136e981dDc4262876" };
  const receipt = { status: "success", blockNumber: 135677078n, to: "0x2922c68ce15eb3e83b7f43b136e981ddc4262876" };
  assert.equal(receiptMismatch(receipt, commit), null);
  assert.equal(receiptMismatch({ ...receipt, status: "reverted" }, commit), "the transaction reverted");
  assert.equal(receiptMismatch({ ...receipt, blockNumber: 135677079n }, commit), "it is in block 135677079, not 135677078");
  assert.match(receiptMismatch({ ...receipt, to: null }, commit), /sent to no contract/);
  assert.match(receiptMismatch({ ...receipt, to: "0x0000000000000000000000000000000000000001" }, commit), /not 0x2922/);
});

test("the cost refuses inputs that cannot price a seal", () => {
  const ok = { ...SEAL, price: BNB_USD, priceDecimals: 18 };
  for (const bad of [{ gasUsed: 0n }, { effectiveGasPrice: -1n }, { price: 0n }, { priceDecimals: -1 }, { plans: 0 }, { plans: 1.5 }]) {
    assert.throws(() => sealCost({ ...ok, ...bad }), RangeError, JSON.stringify(bad, (_, v) => (typeof v === "bigint" ? `${v}n` : v)));
  }
});

// ---------------------------------------------------------------- formatting

test("small dollar amounts keep two significant figures; larger ones go to the cent", () => {
  assert.equal(formatSmallUsd(554.0497719), "$554.05");
  assert.equal(formatSmallUsd(0.1), "$0.10");
  assert.equal(formatSmallUsd(0.0052443), "$0.0052");
  assert.equal(formatSmallUsd(0.00001659598), "$0.000017");
  assert.equal(formatSmallUsd(0), "$0.00");
  assert.equal(formatSmallUsd(-0.004), "−$0.0040");
  assert.equal(formatSmallUsd(Number.NaN), "—");
});

test("ages read in seconds, minutes, hours, then days", () => {
  assert.equal(formatAge(0), "0 s");
  assert.equal(formatAge(59.4), "59 s");
  assert.equal(formatAge(60), "1 min 00 s");
  assert.equal(formatAge(493), "8 min 13 s");
  assert.equal(formatAge(7500), "2 h 05 min");
  assert.equal(formatAge(86400), "1 day");
  assert.equal(formatAge(3 * 86400 + 5), "3 days");
  assert.equal(formatAge(-3), "0 s");
});

// ---------------------------------------------------------------- US market days

test("the market note follows the CT calendar day", () => {
  assert.deepEqual(ctDay(unix("2026-11-26T08:22:20Z")), { day: "2026-11-26", weekday: "Thu" });
  assert.equal(marketNote(unix("2026-11-26T08:22:20Z")), "US stock markets are closed Thu, Nov 26, for Thanksgiving. The tokens still trade; the stocks behind them do not.");
  // 21:00 CT on Thanksgiving is Friday morning in Bangkok: the note names the CT date, never "today".
  assert.match(marketNote(unix("2026-11-27T03:00:00Z")), /^US stock markets are closed Thu, Nov 26, for Thanksgiving\./);
  // 23:59:59 CT on Thanksgiving, then midnight CT on Friday, an early-close trading day.
  assert.deepEqual(usMarketClosure(unix("2026-11-27T05:59:59Z")), { reason: "holiday", holiday: "Thanksgiving" });
  assert.equal(usMarketClosure(unix("2026-11-27T06:00:00Z")), null);
  assert.equal(marketNote(unix("2026-11-27T15:00:00Z")), null);
  assert.deepEqual(usMarketClosure(unix("2026-11-28T18:00:00Z")), { reason: "weekend", holiday: null });
  assert.equal(
    marketNote(unix("2026-11-29T18:00:00Z")),
    "US stock markets are closed for the weekend (Sun, Nov 29). The tokens still trade; the stocks behind them do not until the markets reopen.",
  );
  for (const at of ["2026-11-26T08:22:20Z", "2026-11-29T18:00:00Z"]) assert.doesNotMatch(marketNote(unix(at)), /barely|today/);
  assert.equal(marketNote(unix("2026-11-30T15:00:00Z")), null);
});

/** Western Easter by the anonymous Gregorian algorithm, as [month, day]. */
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return [Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1];
}

/** The nth weekday (0 Sunday) of a month, or the last when n is -1, as YYYY-MM-DD. */
function nthWeekday(y, month, weekday, n) {
  const days = [];
  for (let d = 1; d <= 31; d++) {
    const t = new Date(Date.UTC(y, month - 1, d));
    if (t.getUTCMonth() !== month - 1) break;
    if (t.getUTCDay() === weekday) days.push(t.toISOString().slice(0, 10));
  }
  return n === -1 ? days.at(-1) : days[n - 1];
}

/**
 * A fixed-date holiday on a weekend moves to the Friday before or the Monday after, as NYSE observes it, except New
 * Year's Day on a Saturday: NYSE does not close on the Friday before, the last trading day of the year. null then.
 */
function observed(y, month, day) {
  const t = new Date(Date.UTC(y, month - 1, day));
  if (month === 1 && day === 1 && t.getUTCDay() === 6) return null;
  const shift = { 6: -1, 0: 1 }[t.getUTCDay()] ?? 0;
  return new Date(t.getTime() + shift * 86400000).toISOString().slice(0, 10);
}

/** Good Friday: two days before Western Easter. */
const goodFriday = (y) => {
  const [m, d] = easter(y);
  return new Date(Date.UTC(y, m - 1, d - 2)).toISOString().slice(0, 10);
};

test("every listed closure falls on a weekday and follows NYSE's rule for its holiday", () => {
  for (const day of Object.keys(US_MARKET_HOLIDAYS)) {
    assert.ok(![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()), `${day} is a weekend`);
  }
  const expected = {
    "2026-11-26": nthWeekday(2026, 11, 4, 4),
    "2026-12-25": observed(2026, 12, 25),
    "2027-01-01": observed(2027, 1, 1),
    "2027-01-18": nthWeekday(2027, 1, 1, 3),
    "2027-02-15": nthWeekday(2027, 2, 1, 3),
    "2027-03-26": goodFriday(2027),
    "2027-05-31": nthWeekday(2027, 5, 1, -1),
    "2027-06-18": observed(2027, 6, 19),
    "2027-07-05": observed(2027, 7, 4),
    "2027-09-06": nthWeekday(2027, 9, 1, 1),
    "2027-11-25": nthWeekday(2027, 11, 4, 4),
    "2027-12-24": observed(2027, 12, 25),
    "2028-01-17": nthWeekday(2028, 1, 1, 3),
    "2028-02-21": nthWeekday(2028, 2, 1, 3),
    "2028-04-14": goodFriday(2028),
    "2028-05-29": nthWeekday(2028, 5, 1, -1),
    "2028-06-19": observed(2028, 6, 19),
    "2028-07-04": observed(2028, 7, 4),
    "2028-09-04": nthWeekday(2028, 9, 1, 1),
    "2028-11-23": nthWeekday(2028, 11, 4, 4),
    "2028-12-25": observed(2028, 12, 25),
  };
  for (const [listed, rule] of Object.entries(expected)) assert.equal(listed, rule);
  assert.deepEqual(Object.keys(US_MARKET_HOLIDAYS), Object.keys(expected));
  // New Year's Day 2028 is a Saturday: no closure on Fri, Dec 31, 2027, which is a trading day.
  assert.equal(observed(2028, 1, 1), null);
  assert.equal(US_MARKET_HOLIDAYS["2027-12-31"], undefined);
  assert.equal(usMarketClosure(unix("2027-12-31T15:00:00Z")), null);
  assert.deepEqual(usMarketClosure(unix("2028-01-01T15:00:00Z")), { reason: "weekend", holiday: null });
});

// ---------------------------------------------------------------- reads, from recorded responses

// eth_call results from https://bsc-dataseed.bnbchain.org at blocks 135,813,964
// and 135,813,965 (26 Nov 2026, 02:22:33-34 CT), and the 26 Nov commit's receipt.
const W = (hex) => hex.padStart(64, "0");
const RECORDED = {
  block: { number: "0x8185b4c", timestamp: "0x6b07ec49", hash: "0x46c8e162e6801429c07362230be4704c49b61d0e71e6d47bda248cf8247c3d16", transactions: [] },
  calls: {
    [`${STOCK_MULTIFEED.address}:0x313ce567`]: `0x${W("12")}`,
    [`${STOCK_MULTIFEED.address}:0x4f1e64ae`]:
      `0x${W("20")}${W("4")}` +
      `${W("6a5f7d5cf57f9e192")}${W("6b07ec3c")}${W("6b07ec3d")}` +
      `${W("421d37748bd1e9d1")}${W("6b07ec1e")}${W("6b07ec1e")}` +
      `${W("2713bd50b90f7ea638")}${W("6b07ec3c")}${W("6b07ec3d")}` +
      `${W("b7a53832ff9e680c")}${W("6b07ec1d")}${W("6b07ec1e")}`,
    [`${BNB_USD_FEED.address}:0x313ce567`]: `0x${W("12")}`,
    [`${BNB_USD_FEED.address}:0x7284e416`]: `0x${W("20")}${W("7")}${"626e622f757364".padEnd(64, "0")}`,
    [`${BNB_USD_FEED.address}:0xfeaf968c`]: `0x${W("1")}${W("1e08fc341831a9d936")}${W("6b07ec3b")}${W("6b07ec3c")}${W("1")}`,
  },
  receipt: {
    type: "0x2",
    from: "0xfa22c29c4c3d975fcc617d899b1b695eff2d94b8",
    to: "0x2922c68ce15eb3e83b7f43b136e981ddc4262876",
    status: "0x1",
    cumulativeGasUsed: "0x1181266",
    logs: [],
    transactionHash: "0xf1f214029ec71b4fd860408c53a98acf317683d3af9a147226c456063404c369",
    contractAddress: null,
    gasUsed: "0x2e37d",
    blockHash: "0xf4b4c1b7b289e8d4f493a7438258990b5ae36e25b0dc4b92d2565ab76e0fbeeb",
    blockNumber: "0x8164496",
    transactionIndex: "0x35",
    effectiveGasPrice: "0x2faf080",
  },
};

/** A node that answers from RECORDED and keeps every request it was sent. */
function recordedNode() {
  const sent = [];
  const rpc = async (method, params) => {
    sent.push({ method, params });
    if (method === "eth_getBlockByNumber") return RECORDED.block;
    if (method === "eth_getTransactionReceipt") return params[0] === RECORDED.receipt.transactionHash ? RECORDED.receipt : null;
    if (method === "eth_call") {
      const result = RECORDED.calls[`${params[0].to}:${params[0].data.slice(0, 10)}`];
      if (result) return result;
    }
    throw new Error(`no recorded answer for ${method}`);
  };
  return { rpc, sent };
}

test("the stock board's read decodes fetchBatch's snapshots in the order asked, at one block", async () => {
  const { rpc, sent } = recordedNode();
  const keys = TEXAS_FEEDS.map((f) => feedKey(f.id));
  const read = await readMultiFeed(STOCK_MULTIFEED.address, keys, rpc);
  assert.deepEqual(read.block, { number: 135813964n, timestamp: 1795681353 });
  assert.equal(read.decimals, 18);
  assert.deepEqual(read.snapshots, [
    { key: "0x0000044e", price: 122639726864273891730n, aggregatedTs: 1795681340, onchainTs: 1795681341 },
    { key: "0x000003d8", price: 4764024954529376721n, aggregatedTs: 1795681310, onchainTs: 1795681310 },
    { key: "0x00000467", price: 720845400687750587960n, aggregatedTs: 1795681340, onchainTs: 1795681341 },
    { key: "0x000003e3", price: 13233044871786162188n, aggregatedTs: 1795681309, onchainTs: 1795681310 },
  ]);
  const batch = sent.find((s) => s.method === "eth_call" && s.params[0].data.startsWith("0x4f1e64ae"));
  assert.equal(batch.params[1], "0x8185b4c");
  // fetchBatch(bytes4[]): offset, length, then each key left-aligned in its word.
  assert.equal(batch.params[0].data, `0x4f1e64ae${W("20")}${W("4")}${keys.map((k) => k.slice(2).padEnd(64, "0")).join("")}`);
  assert.equal(formatSmallUsd(fixedToNumber(read.snapshots[0].price, read.decimals)), "$122.64");
  assert.equal(freshness(read.snapshots[1].onchainTs, read.block.timestamp, STOCK_MULTIFEED.heartbeatS).ageS, 43);
});

test("the BNB/USD read takes latestRoundData's answer and on-chain time, and checks the description", async () => {
  const { rpc, sent } = recordedNode();
  const read = await readSingleFeed(BNB_USD_FEED.address, BNB_USD_FEED.describes, rpc);
  assert.equal(read.description, "bnb/usd");
  assert.equal(read.decimals, 18);
  assert.equal(read.answer, BNB_USD);
  assert.equal(read.startedAt, 1795681339);
  assert.equal(read.updatedAt, 1795681340);
  const round = sent.find((s) => s.method === "eth_call" && s.params[0].data === "0xfeaf968c");
  assert.equal(round.params[1], "0x8185b4c");
  await assert.rejects(readSingleFeed(BNB_USD_FEED.address, /^eth\s*\/\s*usd$/i, recordedNode().rpc), /describes itself as "bnb\/usd"/);
});

test("the seal's receipt read returns the gas paid, and reads each hash once", async () => {
  const { rpc, sent } = recordedNode();
  const hash = RECORDED.receipt.transactionHash;
  const r = await readReceipt(hash, rpc);
  assert.deepEqual(r, {
    hash,
    status: "success",
    blockNumber: 135677078n,
    from: "0xfa22c29c4c3d975fcc617d899b1b695eff2d94b8",
    to: "0x2922c68ce15eb3e83b7f43b136e981ddc4262876",
    gasUsed: 189309n,
    effectiveGasPrice: 50000000n,
  });
  await readReceipt(hash, rpc);
  assert.equal(sent.filter((s) => s.method === "eth_getTransactionReceipt").length, 1);
  await assert.rejects(readReceipt(`0x${"0".repeat(64)}`, rpc), /no receipt for 0x0{64}/);
});

test("the public nodes are tried in order, a read names the node that gave it, and a failure names every node", async (t) => {
  const asked = [];
  const answers = {
    "https://a.example": () => Promise.reject(new TypeError("fetch failed")),
    "https://b.example": () => Promise.resolve(new Response("busy", { status: 503 })),
    "https://c.example": () => Promise.resolve(Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "header not found" } })),
    "https://d.example": () => Promise.resolve(Response.json({ jsonrpc: "2.0", id: 1, result: "0x38" })),
  };
  t.mock.method(globalThis, "fetch", (url, init) => {
    asked.push([url, JSON.parse(init.body).method]);
    return answers[url]();
  });
  const chainId = (rpc) => rpc("eth_chainId", []);
  assert.deepEqual(await onPublicNode(chainId, Object.keys(answers)), { data: "0x38", rpc: "https://d.example" });
  assert.deepEqual(asked.map(([u]) => u), Object.keys(answers));
  await assert.rejects(onPublicNode(chainId, Object.keys(answers).slice(0, 3)), {
    message: "no public node gave the read (a.example: fetch failed; b.example: HTTP 503; c.example: header not found)",
  });
});

test("a node that fails any call of a read hands the whole read to the next, so one read never mixes two nodes", async (t) => {
  // The first node gives its head but refuses the call at that block; the second gives both, from its own head.
  const head = (n) => ({ number: `0x${n.toString(16)}`, timestamp: "0x6b07ec49" });
  const calls = [];
  t.mock.method(globalThis, "fetch", (url, init) => {
    const { method, params } = JSON.parse(init.body);
    calls.push([new URL(url).host, method, method === "eth_call" ? params[1] : null]);
    if (method === "eth_getBlockByNumber") return Promise.resolve(Response.json({ jsonrpc: "2.0", id: 1, result: head(url.includes("one") ? 100 : 101) }));
    if (url.includes("one")) return Promise.resolve(Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "header not found" } }));
    return Promise.resolve(Response.json({ jsonrpc: "2.0", id: 1, result: RECORDED.calls[`${params[0].to}:${params[0].data.slice(0, 10)}`] }));
  });
  const keys = TEXAS_FEEDS.map((f) => feedKey(f.id));
  const got = await onPublicNode((rpc) => readMultiFeed(STOCK_MULTIFEED.address, keys, rpc), ["https://one.example", "https://two.example"]);
  assert.equal(got.rpc, "https://two.example");
  assert.equal(got.data.block.number, 101n);
  // Every call of the read that succeeded went to the second node, at its own head.
  const second = calls.filter(([host]) => host === "two.example");
  assert.deepEqual(second.map(([, m]) => m).sort(), ["eth_call", "eth_call", "eth_getBlockByNumber"]);
  assert.ok(second.filter(([, m, at]) => m === "eth_call" && at !== "latest").every(([, , at]) => at === "0x65"));
});

test("a failure says each distinct reason once, with the nodes it came from", () => {
  const all = new NodesUnavailable(["a", "b", "c"].map((h) => ({ host: `${h}.example`, message: "Failed to fetch" })));
  assert.equal(failureDetail(all), "Failed to fetch, from all 3 public nodes");
  const mixed = new NodesUnavailable([
    { host: "a.example", message: "HTTP 503" },
    { host: "b.example", message: "header not found" },
    { host: "c.example", message: "HTTP 503" },
  ]);
  assert.equal(failureDetail(mixed), "HTTP 503 (a.example, c.example); header not found (b.example)");
  assert.equal(failureDetail(new Error("the feed at 0x9c05 describes itself as \"eth/usd\".\nmore")), 'the feed at 0x9c05 describes itself as "eth/usd"');
});
