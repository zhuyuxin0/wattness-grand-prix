// The Prices tab's strip (src/pages/Prices/Strip.tsx): the two sources' chips and the four companies', each a jump to a
// place the page sets, and the facts the page's intro held, kept on the page. Run with `pnpm test` (Node 22.18 or
// later runs the TypeScript modules directly).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { TEXAS_BOARD, TEXAS_FEEDS, boardRowId } from "../src/components/atlas/atlas.ts";
import { hashId } from "../src/lib/follow-hash.ts";
import { SOURCE_COLUMN } from "../src/pages/Prices/places.ts";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(site, "src", ...p), "utf8");
const page = read("pages", "Prices", "index.tsx");
const strip = read("pages", "Prices", "Strip.tsx");
const board = read("components", "atlas", "TexasPowerBoard.tsx");

test("each company's row has a place a link can name, one per company", () => {
  const ids = TEXAS_FEEDS.map((f) => boardRowId(TEXAS_BOARD, f));
  assert.deepEqual(ids, ["texas-power-vstb", "texas-power-flncb", "texas-power-gevb", "texas-power-irenb"]);
  for (const id of ids) assert.equal(hashId(`#${id}`), id);
  // the board writes each row's id with the same helper, under the board's own id
  assert.match(board, /id=\{boardRowId\(board, feed\)\}/);
  assert.match(board, /id = TEXAS_BOARD/);
});

test("each source's column has a place, on the BNB/USD pair", () => {
  const ids = Object.values(SOURCE_COLUMN);
  assert.equal(new Set(ids).size, 2);
  for (const id of ids) assert.equal(hashId(`#${id}`), id);
  assert.ok(page.includes('id={asset === "BNB" ? SOURCE_COLUMN.atlas : undefined}'), "the Atlas column sets its id");
  assert.ok(page.includes('id={asset === "BNB" ? SOURCE_COLUMN.cmc : undefined}'), "the CoinMarketCap column sets its id");
});

test("the strip shows both sources and all four companies, each jumping to its place or near it", () => {
  assert.ok(strip.includes("SOURCE_COLUMN.atlas") && strip.includes("SOURCE_COLUMN.cmc"));
  assert.match(strip, /TEXAS_FEEDS\.map\(/);
  assert.match(strip, /boardRowId\(TEXAS_BOARD, feed\)/);
  // the near places: the side-by-side section and the board's section, both set on the page
  assert.ok(page.includes('id="px-sources"'));
  assert.match(strip, /near="px-sources"/);
  assert.match(strip, /near=\{TEXAS_BOARD\}/);
  // the strip sits right under the head
  assert.match(page, /<\/?PageHeader[\s\S]*?\/>\s*<Strip /);
});

test("the facts the intro held stay on the page", () => {
  for (const fact of [
    "A token's price says nothing about an agent's plans: here BNB's and USDT's only size the evaluation budget, and the stock tokens' are market context.",
    "evaluations of a sealed record",
    "were paid 0.1 U each",
    "Testnet BNB has no cash value, so every dollar figure in the budget is a reference.",
    "BNB and USDT in US dollars from Atlas's oracle and from CoinMarketCap",
    "four Texas power companies' tokenized stocks on BNB Smart Chain",
  ]) {
    assert.ok(page.includes(fact), fact);
  }
  assert.match(page, /\{NOT_PLANS\}/);
});
