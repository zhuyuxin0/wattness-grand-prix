import { getAddress } from "viem";
import { formatAmount, formatTokens } from "../../lib/amounts";
import { WATTNESS_AGENT } from "./addresses";

// Words and figures the season's views share.

const UNIT = 10n ** 18n;

/** Test USD: whole dollars when the amount is whole, cents otherwise. "1,600 USD", "8.68 USD". */
export function usd(v: bigint, symbol = "USD"): string {
  return `${formatAmount(v, 18, v % UNIT === 0n ? 0 : 2)} ${symbol}`;
}

/** Test USD to the cent, always: "50.00 USD". */
export const usdCents = (v: bigint, symbol = "USD") => `${formatAmount(v, 18, 2)} ${symbol}`;

export const prix = (v: bigint, symbol = "PRIX") => `${formatTokens(v)} ${symbol}`;

export const isWattness = (a: string) => getAddress(a) === getAddress(WATTNESS_AGENT);

/** "the Wattness agent" for its record wallet; otherwise null, and the view shows the address. */
export const agentWord = (a: string) => (isWattness(a) ? "the Wattness agent" : null);

/** The first letter in capitals, for a phrase that opens a sentence. */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 20261127 as "2026-11-27". */
export function odDay(od: number): string {
  const s = String(od);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export const pct = (num: bigint, den: bigint) => (den > 0n ? Number((num * 10_000n) / den) / 100 : 0);

export function percentText(p: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: p % 1 === 0 ? 0 : 2 }).format(p)}%`;
}

export const bpsText = (bps: number) => percentText(bps / 100);
