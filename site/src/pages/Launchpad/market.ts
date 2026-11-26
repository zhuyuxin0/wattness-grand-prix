// The token page's market figures, each one computed from the replay's frames, so from the launch's receipts: the
// curve's price after the create and every trade (Core's initialPrice and lastPrice), the pair's first price once it
// graduated, the market cap, liquidity and volume at any frame, the trades, and candles of the price.
//
// Prices are WBNB per whole token. On chain they are integers at 1e18 precision; here they stay bigint until they
// are drawn. test/markets.test.mjs holds the figures to modules/openfour/submission/tokens.json.
//
// Type imports only: Node runs this file directly in the tests.

import type { Hex, LaunchReplay } from "./replay";

/** The precision of a price on chain: WBNB wei per whole token, times 1e18 over the token's 18 decimals. */
export const PRICE_ONE = 10n ** 18n;

/** One buy or sell on the curve, with the curve's price before and after it. */
export interface Tick {
  /** Its frame in the replay. */
  frame: number;
  kind: "buy" | "sell";
  hash: Hex;
  block: number;
  time: number;
  trader: Hex;
  tokens: bigint;
  /** WBNB the trader paid (a buy) or got (a sell), fees included. */
  quote: bigint;
  fees: bigint;
  /** The curve's price before and after, WBNB per whole token at 1e18 precision. */
  before: bigint;
  after: bigint;
}

/** Every trade on the curve, in the order they ran. */
export function ticks(l: LaunchReplay): Tick[] {
  const out: Tick[] = [];
  let price: bigint | null = null;
  l.frames.forEach((f, i) => {
    if (f.kind === "create" && f.price) price = BigInt(f.price);
    if ((f.kind === "buy" || f.kind === "sell") && f.trade && f.price) {
      const after = BigInt(f.price);
      out.push({
        frame: i,
        kind: f.kind,
        hash: f.hash,
        block: f.block,
        time: f.time,
        trader: f.trade.trader,
        tokens: BigInt(f.trade.tokens),
        quote: BigInt(f.trade.traderQuote),
        fees: BigInt(f.trade.fees),
        before: price ?? after,
        after,
      });
      price = after;
    }
  });
  return out;
}

/** Where a price comes from: the create, a trade on the curve, or the PancakeSwap pair after graduation. */
export type PriceSource = "create" | "trade" | "pair";

export interface Market {
  /** The price after the frame, WBNB per whole token at 1e18 precision. */
  price: bigint;
  /** When that price was set, and by what. */
  priceTime: number;
  priceSource: PriceSource;
  /** The curve's first price, at the create. */
  open: bigint;
  /** The price over the first price, minus one: 0.2159 is +21.59%. */
  change: number;
  /** The price times the whole supply, in WBNB wei. */
  marketCap: bigint;
  /** WBNB in the bonding curve, or once graduated, in the pair with its tokens. */
  liquidity: { where: "curve" | "pair"; quote: bigint; tokens: bigint };
  /** WBNB traders paid and got, fees included, over the trades so far. */
  volume: bigint;
  trades: number;
  created: number;
}

/** The pair's first price: its WBNB over its tokens, at 1e18 precision. */
export const pairPrice = (quote: bigint, tokens: bigint): bigint => (tokens === 0n ? 0n : (quote * PRICE_ONE) / tokens);

/** The market after the frames up to `index`. */
export function marketAt(l: LaunchReplay, index: number): Market {
  const i = Math.max(0, Math.min(index, l.frames.length - 1));
  const create = l.frames[0]!;
  const open = BigInt(create.price ?? "0");
  let price = open;
  let priceTime = create.time;
  let priceSource: PriceSource = "create";
  let volume = 0n;
  let trades = 0;
  let liquidity: Market["liquidity"] = { where: "curve", quote: 0n, tokens: 0n };
  for (const f of l.frames.slice(0, i + 1)) {
    if (f.trade && f.price) {
      price = BigInt(f.price);
      priceTime = f.time;
      priceSource = "trade";
      volume += BigInt(f.trade.traderQuote);
      trades += 1;
    }
    liquidity = { where: "curve", quote: BigInt(f.raised), tokens: BigInt(l.saleAmount) - BigInt(f.sold) };
    if (f.graduated) {
      price = pairPrice(BigInt(f.graduated.quote), BigInt(f.graduated.tokens));
      priceTime = f.time;
      priceSource = "pair";
      liquidity = { where: "pair", quote: BigInt(f.graduated.quote), tokens: BigInt(f.graduated.tokens) };
    }
  }
  return {
    price,
    priceTime,
    priceSource,
    open,
    change: open === 0n ? 0 : Number(((price - open) * 1_000_000n) / open) / 1_000_000,
    marketCap: (price * BigInt(l.maxSupply)) / PRICE_ONE,
    liquidity,
    volume,
    trades,
    created: create.time,
  };
}

/** A price as a plain number of WBNB per whole token, for drawing. */
export const priceNumber = (p: bigint): number => Number(p) / 1e18;

export interface Candle {
  /** Unix seconds the bucket starts. */
  start: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** WBNB traded in the bucket, fees included, and its buy and sell sides. */
  volume: bigint;
  bought: bigint;
  sold: bigint;
  trades: Tick[];
}

/**
 * Candles of the curve's price, `seconds` wide, from the trades up to frame `upto`. A trade moves the price from where
 * the last one left it to its own lastPrice, so even a bucket with one trade has an open and a close.
 */
export function candles(l: LaunchReplay, upto: number, seconds: number): Candle[] {
  const byStart = new Map<number, Candle>();
  for (const t of ticks(l)) {
    if (t.frame > upto) break;
    const start = Math.floor(t.time / seconds) * seconds;
    const open = priceNumber(t.before);
    const close = priceNumber(t.after);
    let c = byStart.get(start);
    if (!c) {
      c = { start, open, high: open, low: open, close, volume: 0n, bought: 0n, sold: 0n, trades: [] };
      byStart.set(start, c);
    }
    c.high = Math.max(c.high, open, close);
    c.low = Math.min(c.low, open, close);
    c.close = close;
    c.volume += t.quote;
    if (t.kind === "buy") c.bought += t.quote;
    else c.sold += t.quote;
    c.trades.push(t);
  }
  return [...byStart.values()].sort((a, b) => a.start - b.start);
}

/** The lowest and highest price the launch reached, the pair's first price included: the chart's fixed range. */
export function priceRange(l: LaunchReplay): [number, number] {
  const all: number[] = [];
  for (const t of ticks(l)) all.push(priceNumber(t.before), priceNumber(t.after));
  const end = marketAt(l, l.frames.length - 1);
  all.push(priceNumber(end.price));
  if (!all.length) return [0, 1];
  return [Math.min(...all), Math.max(...all)];
}

// ---------------------------------------------------------------- words

const SUB = "₀₁₂₃₄₅₆₇₈₉";

/** A tiny price the way token pages write it: the zeros after the point counted, then the figures. */
export interface TinyPrice {
  /** "0.0" before the count, or the whole price when it is not tiny. */
  head: string;
  /** Zeros after the decimal point before the first figure; null when the price is written plainly. */
  zeros: number | null;
  /** The figures after the zeros. */
  tail: string;
  /** Every zero written out: "0.000000000049". */
  plain: string;
}

/** 4.9e-11 is 0.0₁₀49: ten zeros after the point, then 49, to `figures` significant figures. */
export function tinyPrice(v: number, figures = 4): TinyPrice {
  if (!Number.isFinite(v) || v <= 0) return { head: "0", zeros: null, tail: "", plain: "0" };
  if (v >= 0.001) {
    const plain = new Intl.NumberFormat("en-US", { maximumSignificantDigits: figures }).format(v);
    return { head: plain, zeros: null, tail: "", plain };
  }
  let e = Math.floor(Math.log10(v));
  let digits = Math.round(v / 10 ** (e - figures + 1));
  if (digits >= 10 ** figures) {
    digits = Math.round(digits / 10);
    e += 1;
  }
  const tail = String(digits).replace(/0+$/, "") || "0";
  const zeros = -e - 1;
  return { head: "0.0", zeros, tail, plain: `0.${"0".repeat(zeros)}${tail}` };
}

/** The same in one string, the count in subscript figures: "0.0₁₀49". For the chart's axis. */
export function tinyText(v: number, figures = 4): string {
  const t = tinyPrice(v, figures);
  if (t.zeros === null) return t.head;
  return `${t.head}${String(t.zeros)
    .split("")
    .map((d) => SUB[Number(d)])
    .join("")}${t.tail}`;
}

/** A change as a signed percent with two places and a typographic minus: "+21.59%", "−16.20%". */
export function percent(change: number): string {
  const v = Math.round(change * 10_000) / 100;
  const text = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${text}%`;
}
