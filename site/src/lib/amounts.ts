// Token amounts and prices for the chain tabs. Amounts stay bigint in their
// smallest unit until they are words on the page.
//
// No imports: Node runs this file directly in test/markets.test.mjs.

/** A token amount in its smallest unit, rounded half up to `digits` places, grouped: "1,311.95". */
export function formatAmount(value: bigint, decimals = 18, digits = 2): string {
  const negative = value < 0n;
  let v = negative ? -value : value;
  let places = decimals;
  if (decimals > digits) {
    const scale = 10n ** BigInt(decimals - digits);
    v = (v + scale / 2n) / scale;
    places = digits;
  }
  const unit = 10n ** BigInt(places);
  const whole = (v / unit).toLocaleString("en-US");
  const frac = places > 0 ? (v % unit).toString().padStart(places, "0") : "";
  const out = digits > 0 ? `${whole}.${frac.padEnd(digits, "0")}` : whole;
  return negative && v !== 0n ? `−${out}` : out;
}

/** A whole number of tokens: "400,000,000". */
export const formatTokens = (value: bigint, decimals = 18) => formatAmount(value, decimals, 0);

/** A small price to three significant figures, never in exponent form: "0.00000215". */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3, maximumFractionDigits: 20 }).format(value);
}

/** quote / token, both in smallest units with the same decimals, as a plain number. */
export function ratio(quote: bigint, token: bigint): number {
  if (token === 0n) return 0;
  // Scaled by 1e24 before the division, so a price as small as 1e-20 keeps its figures.
  return Number((quote * 10n ** 24n) / token) / 1e24;
}
