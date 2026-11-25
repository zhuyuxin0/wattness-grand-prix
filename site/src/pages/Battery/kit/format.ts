// Figures as the Battery and agent tabs print them: a typographic minus in
// labels and figures, the word "minus" in sentences, thousands with commas.

const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dec1 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const minus = (s: string) => s.replace("-", "−");

/** $1,234.56, or −$1,234.56. */
export const money = (usd: number) => minus(usd2.format(usd));
/** +$12.34 or −$12.34: a change, in a label or a table. */
export const delta = (usd: number) => (usd > 0 ? `+${usd2.format(usd)}` : minus(usd2.format(usd)));
/** "$12.34" or "minus $12.34": an amount inside a sentence. */
export const moneyWords = (usd: number) => (usd < 0 ? `minus ${usd2.format(-usd)}` : usd2.format(usd));
export const mw1 = (mw: number) => minus(dec1.format(mw));
export const num2 = (n: number) => minus(dec2.format(n));
export const count = (n: number) => minus(int.format(n));
/** +12 or −12 contracts: sold positive, bought negative. */
export const signedCount = (n: number) => (n > 0 ? `+${int.format(n)}` : minus(int.format(n)));
export const pct1 = (x: number) => `${minus(dec1.format(x * 100))}%`;
/** Parts per million as a whole percent: 850000 is 85%. */
export const ppmPct = (ppm: number) => `${Math.round(ppm / 1e4)}%`;
/** Cents per MWh as $/MWh digits, two places. */
export const perMwh = (cents: number) => minus(dec2.format(cents / 100));
/** Cents per MWh as $13.48 or −$5.90, the sign ahead of the dollar. */
export const usdMwh = (cents: number) => (cents < 0 ? `−$${dec2.format(-cents / 100)}` : `$${dec2.format(cents / 100)}`);
/** Whole dollars for an axis: $50, −$25. */
export const axisUsd = (v: number) => (v < 0 ? `−$${int.format(-v)}` : `$${int.format(v)}`);
export const axisNum = (v: number) => minus(int.format(v));

const pad = (n: number) => String(n).padStart(2, "0");
/** "17:00–18:00 CT" for hour 17 of the operating day. */
export const hourRange = (h: number) => `${pad(h)}:00–${pad(h + 1)}:00 CT`;
/** ERCOT's hour-ending label, HE18 for 17:00–18:00. */
export const hourEnding = (h: number) => `HE${pad(h + 1)}`;

const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const dayYearFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const asDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
};
/** "Nov 18" for 2026-11-18. */
export const shortDay = (iso: string) => dayFmt.format(asDate(iso));
/** "Oct 7–Nov 23, 2026" for a run of days in one year. */
export function dayRange(days: readonly string[]): string {
  if (days.length === 0) return "none";
  const first = days[0]!;
  const last = days[days.length - 1]!;
  if (days.length === 1) return dayYearFmt.format(asDate(first));
  return `${shortDay(first)}–${dayYearFmt.format(asDate(last))}`;
}
