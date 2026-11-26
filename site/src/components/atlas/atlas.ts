// Atlas's push feeds on BNB Smart Chain that the site shows, and the arithmetic
// on what they return. No imports: Node runs this file directly in
// test/atlas.test.mjs and scripts/atlas-reads.mjs.

export type Address = `0x${string}`;

/**
 * A value older than its feed's heartbeat plus this margin, at the block it was
 * read in, shows its age. The margin absorbs the reporter's latency and block
 * inclusion; it is shorter than a heartbeat, so one missed push still shows.
 */
export const LATE_MARGIN_S = 30;

export interface StockFeed {
  /** Atlas's catalog id, which is also the feed's 4-byte key on chain. */
  id: number;
  pair: string;
  symbol: string;
  company: string;
  /** What the company does in Texas's power market, in one line. */
  role: string;
  /** The company's logo in public/logos/ (sources in public/logos/SOURCES.md). */
  logo: string;
}

/**
 * Tokenized US stocks on BNB Chain whose companies work in Texas's power
 * market, from Atlas's public catalog (oracle-feed/search, 26 Nov 2026).
 */
export const TEXAS_FEEDS: readonly StockFeed[] = [
  { id: 1102, pair: "VSTB/USD", symbol: "VSTB", company: "Vistra", role: "Generates power in Texas and owns the retailer TXU Energy", logo: "vistra.png" },
  { id: 984, pair: "FLNCB/USD", symbol: "FLNCB", company: "Fluence", role: "Supplies grid battery systems", logo: "fluence.svg" },
  { id: 1127, pair: "GEVB/USD", symbol: "GEVB", company: "GE Vernova", role: "Makes turbines and grid equipment", logo: "ge-vernova.svg" },
  { id: 995, pair: "IRENB/USD", symbol: "IRENB", company: "IREN", role: "Runs large data centers on the Texas grid", logo: "iren.svg" },
];

/**
 * The MultiFeed the four stock feeds are pushed to on BNB Smart Chain (Atlas's
 * platform 14). Atlas sets each feed to push on a 2% move and at least every
 * 60 s; that is its catalog's setting, so the late check below adds a margin.
 */
export const STOCK_MULTIFEED = {
  address: "0xeace519ebb14fb8404fa6ddd23c3b34abade44aa" as Address,
  heartbeatS: 60,
  deviation: 0.02,
} as const;

/** Atlas's BNB/USD SingleFeed on BNB Smart Chain: a new value on a 1% move, and at least every 60 s. */
export const BNB_USD_FEED = {
  id: 633,
  pair: "BNB/USD",
  address: "0x9c0517f5b4c8657c7f18d68d2d79e2b3b1cd6438" as Address,
  heartbeatS: 60,
  deviation: 0.01,
  /** The contract's own description() must match, so a reassigned address cannot pass for BNB/USD. */
  describes: /^bnb\s*\/\s*usd$/i,
} as const;

export const feedPage = (id: number): string => `https://atlasoracle.io/feeds/${id}`;

/** A MultiFeed keys each feed by its catalog id as a big-endian 4-byte word. */
export function feedKey(id: number): Address {
  if (!Number.isSafeInteger(id) || id < 0 || id > 0xffffffff) throw new RangeError(`feed id ${id} does not fit in 4 bytes`);
  return `0x${id.toString(16).padStart(8, "0")}`;
}

// ---------------------------------------------------------------- fixed point

function checkDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 77) throw new RangeError(`invalid decimals ${decimals}`);
}

/** A fixed-point integer as a number, close enough to display (an 18-decimal price). */
export function fixedToNumber(raw: bigint, decimals: number): number {
  checkDecimals(decimals);
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  return Number(whole) + Number(raw - whole * scale) / Number(scale);
}

/** A fixed-point integer's exact decimal form, without trailing zeros: 9465450000000n at 18 is "0.00000946545". */
export function fixedToString(raw: bigint, decimals: number): string {
  checkDecimals(decimals);
  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, "");
  return `${negative ? "−" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

// ---------------------------------------------------------------- freshness

export type FeedState = "fresh" | "late" | "empty";

export interface Freshness {
  state: FeedState;
  /** Seconds from the value's on-chain update to the block it was read in. */
  ageS: number;
  /** The age past which the value is late: heartbeat plus margin. */
  limitS: number;
}

/**
 * Judges an on-chain update time against the timestamp of the block it was read
 * in, so neither the reader's clock nor a slow page decides. A feed that was
 * never updated reads as zero, which is no price, not a price of zero.
 */
export function freshness(updatedAt: number, readAt: number, heartbeatS: number, marginS: number = LATE_MARGIN_S): Freshness {
  if (![updatedAt, readAt, heartbeatS, marginS].every(Number.isFinite) || heartbeatS <= 0 || marginS < 0) {
    throw new RangeError("freshness needs finite times, a positive heartbeat and a margin of zero or more");
  }
  const limitS = heartbeatS + marginS;
  if (updatedAt <= 0) return { state: "empty", ageS: 0, limitS };
  const ageS = Math.max(0, readAt - updatedAt);
  return { state: ageS > limitS ? "late" : "fresh", ageS, limitS };
}

// ---------------------------------------------------------------- the seal's cost

export interface SealCostInput {
  /** From the commit's receipt. */
  gasUsed: bigint;
  /** Wei per gas, from the same receipt. */
  effectiveGasPrice: bigint;
  /** BNB/USD as the feed returns it. */
  price: bigint;
  priceDecimals: number;
  /** Plans under the sealed root (its leaf count). */
  plans: number;
}

export interface SealCost {
  /** Gas used times the effective gas price: what the commit paid, in wei. */
  feeWei: bigint;
  /** The fee at the given BNB/USD, in dollars. */
  usd: number;
  perPlanUsd: number;
  perPlanGas: number;
}

const ATTO = 10n ** 18n;

export function sealCost({ gasUsed, effectiveGasPrice, price, priceDecimals, plans }: SealCostInput): SealCost {
  if (gasUsed <= 0n) throw new RangeError("gas used must be positive");
  if (effectiveGasPrice < 0n) throw new RangeError("the gas price cannot be negative");
  if (price <= 0n) throw new RangeError("the BNB price must be positive");
  checkDecimals(priceDecimals);
  if (!Number.isSafeInteger(plans) || plans <= 0) throw new RangeError("the plan count must be a positive integer");
  const feeWei = gasUsed * effectiveGasPrice;
  // Wei carry 18 decimals and the price its own. The product is exact in
  // integer atto-dollars, so a fee of a fraction of a cent keeps its digits
  // until the one conversion to a float.
  const attoUsd = (feeWei * price * ATTO) / 10n ** BigInt(18 + priceDecimals);
  const usd = Number(attoUsd) / 1e18;
  return { feeWei, usd, perPlanUsd: usd / plans, perPlanGas: Number(gasUsed) / plans };
}

/**
 * Why a receipt read from chain is not the published commit's, or null when it
 * is: it must have succeeded, in the published block, sent to the published
 * contract.
 */
export function receiptMismatch(
  receipt: { status: string; blockNumber: bigint; to: string | null },
  commit: { blockNumber: number; contract: string },
): string | null {
  if (receipt.status !== "success") return `the transaction ${receipt.status === "reverted" ? "reverted" : `has status ${receipt.status}`}`;
  if (receipt.blockNumber !== BigInt(commit.blockNumber)) return `it is in block ${receipt.blockNumber}, not ${commit.blockNumber}`;
  if (receipt.to?.toLowerCase() !== commit.contract.toLowerCase()) return `it was sent to ${receipt.to ?? "no contract"}, not ${commit.contract}`;
  return null;
}

// ---------------------------------------------------------------- formatting

/** "0.00000946545 BNB": exact, from wei. */
export const formatBnb = (wei: bigint): string => `${fixedToString(wei, 18)} BNB`;

/** "0.05 gwei": exact, from wei. */
export const formatGwei = (wei: bigint): string => `${fixedToString(wei, 9)} gwei`;

const usdTwoFigures = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumSignificantDigits: 2,
  maximumSignificantDigits: 2,
});
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Dollars to the cent from 10 cents up; below that, two significant figures, so a fraction of a cent still reads: "$0.0052". */
export function formatSmallUsd(usd: number): string {
  if (!Number.isFinite(usd)) return "—";
  const s = Math.abs(usd) >= 0.1 || usd === 0 ? usdCents.format(usd) : usdTwoFigures.format(usd);
  return s.replace("-", "−");
}

/** "13 s", "8 min 13 s", "2 h 05 min", "3 days". */
export function formatAge(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min`;
  const days = Math.floor(s / 86400);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

// ---------------------------------------------------------------- US market days

/**
 * NYSE full-day closures from the first sealed day through 2028, by the
 * exchange's published calendar. Weekends are computed; early closes still
 * trade. New Year's Day 2028 falls on a Saturday and NYSE stays open on Friday,
 * Dec 31, 2027, so that year has no New Year's closure.
 */
export const US_MARKET_HOLIDAYS: Readonly<Record<string, string>> = {
  "2026-11-26": "Thanksgiving",
  "2026-12-25": "Christmas",
  "2027-01-01": "New Year's Day",
  "2027-01-18": "Martin Luther King Jr. Day",
  "2027-02-15": "Washington's Birthday",
  "2027-03-26": "Good Friday",
  "2027-05-31": "Memorial Day",
  "2027-06-18": "Juneteenth",
  "2027-07-05": "Independence Day",
  "2027-09-06": "Labor Day",
  "2027-11-25": "Thanksgiving",
  "2027-12-24": "Christmas",
  "2028-01-17": "Martin Luther King Jr. Day",
  "2028-02-21": "Washington's Birthday",
  "2028-04-14": "Good Friday",
  "2028-05-29": "Memorial Day",
  "2028-06-19": "Juneteenth",
  "2028-07-04": "Independence Day",
  "2028-09-04": "Labor Day",
  "2028-11-23": "Thanksgiving",
  "2028-12-25": "Christmas",
};

const ctParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

/** The CT calendar day of an instant, "2026-11-26", and its weekday, "Thu". */
export function ctDay(unix: number): { day: string; weekday: string } {
  const p: Record<string, string> = {};
  for (const part of ctParts.formatToParts(new Date(unix * 1000))) p[part.type] = part.value;
  return { day: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday ?? "" };
}

export interface MarketClosure {
  reason: "holiday" | "weekend";
  /** The holiday's name; none on a weekend. */
  holiday: string | null;
}

/** Whether US stock markets are shut all day on the CT day of an instant. */
export function usMarketClosure(unix: number): MarketClosure | null {
  const { day, weekday } = ctDay(unix);
  const holiday = US_MARKET_HOLIDAYS[day];
  if (holiday) return { reason: "holiday", holiday };
  if (weekday === "Sat" || weekday === "Sun") return { reason: "weekend", holiday: null };
  return null;
}

const ctDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" });

/**
 * The board's line for a day the stocks behind the tokens do not trade; null on
 * a trading day. The tokens trade around the clock, so the line names the CT
 * date rather than "today", which a reader ahead of CT would take as their own.
 */
export function marketNote(unix: number): string | null {
  const closed = usMarketClosure(unix);
  if (!closed) return null;
  const on = ctDate.format(new Date(unix * 1000));
  if (closed.reason === "holiday") return `US stock markets are closed ${on}, for ${closed.holiday}. The tokens still trade; the stocks behind them do not.`;
  return `US stock markets are closed for the weekend (${on}). The tokens still trade; the stocks behind them do not until the markets reopen.`;
}
