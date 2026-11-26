// The Prices tab's tickers and budget (src/pages/Prices): the board reads Atlas live and shows CoinMarketCap as
// recorded, each column under its owner's chip; the budget is one line with its working folded; the hashes behind
// the side-by-side sit in its Check it, none in rows on the page. Run with `pnpm test`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(here, "..", p), "utf8");
const tickers = read("src/pages/Prices/Tickers.tsx");
const page = read("src/pages/Prices/index.tsx");
const prices = JSON.parse(read("public/data/prices.json"));

test("each ticker column is headed by its owner's chip, Atlas live and CoinMarketCap recorded", () => {
  const head = tickers.slice(tickers.indexOf("px-tk__head"), tickers.indexOf("{PAIRS.map"));
  assert.match(head, /\{atlasChip\}[\s\S]*On chain, live[\s\S]*\{cmcChip\}[\s\S]*Pro quote, recorded/);
  assert.match(tickers, /const atlasChip = logos \? <LogoChip logo=\{logos\.atlas\}/);
  assert.match(tickers, /const cmcChip = logos \? <LogoChip logo=\{logos\.cmc\}/);
  // the board's pairs are the feeds the catalog lists, and CoinMarketCap quotes both
  for (const pair of ["BNB/USD", "USDT/USD"]) {
    assert.ok(prices.onChain.feeds.some((f) => f.pair === pair), `${pair} is a catalog feed`);
    assert.ok(tickers.includes(`pair: "${pair}"`));
  }
  for (const asset of ["BNB", "USDT"]) assert.ok(prices.cmc.quotes.some((q) => q.asset === asset));
  // CoinMarketCap's API needs a key: the page never calls it
  assert.doesNotMatch(tickers + page, /pro-api\.coinmarketcap\.com|X-CMC_PRO_API_KEY/i);
});

test("the budget is one line, its working folded", () => {
  const budget = page.slice(page.indexOf("function Budget("), page.indexOf("function BaRow("));
  assert.match(budget, /lede=\{`A declared \$\{d\.treasuryBnb\} BNB/);
  const details = budget.indexOf('<details className="pk-details px-more">');
  assert.ok(details > 0, "the working is folded");
  assert.ok(budget.indexOf('className="px-ba"') > details, "the before and after table is inside the fold");
  assert.ok(budget.indexOf('className="px-rules"') > details, "the rules are inside the fold");
});

test("no hash strings in rows on the Prices tab: they sit in Check it", () => {
  assert.doesNotMatch(page, /<Hash\b/);
  assert.doesNotMatch(tickers, /<Hash\b/);
  assert.match(page, /check=\{\{\s*items: sourceItems\(p, signer\)/);
  assert.match(tickers, /check=\{tickerCheck\(p, live\.state\)\}/);
});
