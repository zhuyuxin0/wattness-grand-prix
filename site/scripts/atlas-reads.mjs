// Every read the Atlas components make, once, from BNB Smart Chain's public
// nodes: the four stock feeds, BNB/USD and the latest sealed commit's receipt,
// each printed with its on-chain time in CT and in this machine's zone. No key,
// no transaction. Run from site/ with Node 22.18 or later:
//
//   node scripts/atlas-reads.mjs
//
// It exits 1 when a read fails or the receipt is not the published commit. A
// late price is printed as late; it is the feed's state, not a failure here.

import { readFileSync } from "node:fs";
import {
  BNB_USD_FEED,
  STOCK_MULTIFEED,
  TEXAS_FEEDS,
  feedKey,
  fixedToNumber,
  formatAge,
  formatBnb,
  formatGwei,
  formatSmallUsd,
  freshness,
  marketNote,
  receiptMismatch,
  sealCost,
} from "../src/components/atlas/atlas.ts";
import { BSC_RPCS, onPublicNode, readMultiFeed, readReceipt, readSingleFeed } from "../src/components/atlas/chain.ts";

const published = JSON.parse(readFileSync(new URL("../public/data/receipts.json", import.meta.url), "utf8"));
const commit = published.receipts.find((r) => r.mainnet);
if (!commit) throw new Error("public/data/receipts.json holds no mainnet commit");

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const stamp = (timeZone) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  });
const ct = stamp("America/Chicago");
const local = stamp(zone);
const when = (unix) => {
  const d = new Date(unix * 1000);
  const a = ct.format(d);
  const b = local.format(d);
  return a === b ? a : `${a} (${b})`;
};
const int = (n) => Number(n).toLocaleString("en-US");
const usd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

let failed = false;
async function attempt(label, read) {
  try {
    return await read();
  } catch (e) {
    failed = true;
    console.log(`${label}: FAILED, ${(e?.shortMessage ?? e?.message ?? String(e)).split("\n")[0]}`);
    return null;
  }
}

console.log(`BNB Smart Chain public nodes: ${BSC_RPCS.join(", ")}\n`);

const host = (url) => new URL(url).host;

const stocksRead = await attempt("Texas power stocks", () => onPublicNode((rpc) => readMultiFeed(STOCK_MULTIFEED.address, TEXAS_FEEDS.map((f) => feedKey(f.id)), rpc)));
const stocks = stocksRead?.data;
if (stocks) {
  console.log(`Texas power on BNB Chain: Atlas MultiFeed ${STOCK_MULTIFEED.address}`);
  console.log(`  read at block ${int(stocks.block.number)}, ${when(stocks.block.timestamp)}, through ${host(stocksRead.rpc)}; decimals ${stocks.decimals}`);
  TEXAS_FEEDS.forEach((feed, i) => {
    const s = stocks.snapshots[i];
    const f = freshness(s.onchainTs, stocks.block.timestamp, STOCK_MULTIFEED.heartbeatS);
    const name = `${feed.company} (${feed.pair}, feed ${feed.id})`.padEnd(32);
    if (f.state === "empty") return console.log(`  ${name} no price on chain`);
    const price = usd(fixedToNumber(s.price, stocks.decimals)).padStart(9);
    console.log(`  ${name} ${price}  updated ${when(s.onchainTs)}, ${formatAge(f.ageS)} before the read, ${f.state} (limit ${f.limitS} s)`);
  });
  const note = marketNote(stocks.block.timestamp);
  if (note) console.log(`  ${note}`);
  console.log("");
}

const bnbRead = await attempt("BNB/USD", () => onPublicNode((rpc) => readSingleFeed(BNB_USD_FEED.address, BNB_USD_FEED.describes, rpc)));
const bnb = bnbRead?.data;
if (bnb) {
  const f = freshness(bnb.updatedAt, bnb.block.timestamp, BNB_USD_FEED.heartbeatS);
  console.log(`BNB/USD: Atlas SingleFeed ${BNB_USD_FEED.address} ("${bnb.description}", feed ${BNB_USD_FEED.id})`);
  console.log(`  read at block ${int(bnb.block.number)}, ${when(bnb.block.timestamp)}, through ${host(bnbRead.rpc)}; decimals ${bnb.decimals}`);
  console.log(`  ${usd(fixedToNumber(bnb.answer, bnb.decimals))} per BNB, updated ${when(bnb.updatedAt)}, ${formatAge(f.ageS)} before the read, ${f.state} (limit ${f.limitS} s)\n`);
}

const receipt = (await attempt("Seal receipt", () => onPublicNode((rpc) => readReceipt(commit.txHash, rpc))))?.data;
if (receipt) {
  const mismatch = receiptMismatch(receipt, commit);
  console.log(`The seal for ${published.operatingDay}: transaction ${commit.txHash}`);
  console.log(`  block ${int(receipt.blockNumber)}, sealed ${when(commit.blockTime)}, ${receipt.status}, ${commit.leafCount} plans`);
  if (mismatch) {
    failed = true;
    console.log(`  NOT the published commit: ${mismatch}`);
  }
  console.log(`  ${int(receipt.gasUsed)} gas at ${formatGwei(receipt.effectiveGasPrice)} = ${formatBnb(receipt.gasUsed * receipt.effectiveGasPrice)}`);
  if (bnb && bnb.answer > 0n) {
    const cost = sealCost({
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
      price: bnb.answer,
      priceDecimals: bnb.decimals,
      plans: commit.leafCount,
    });
    console.log(
      `  at ${usd(fixedToNumber(bnb.answer, bnb.decimals))} per BNB, the BNB/USD above: ${formatSmallUsd(cost.usd)} ($${cost.usd.toPrecision(6)}), ` +
        `or ${formatSmallUsd(cost.perPlanUsd)} a plan ($${cost.perPlanUsd.toPrecision(6)}, about ${Math.round(cost.perPlanGas)} gas each)`,
    );
  }
}

if (failed) process.exitCode = 1;
