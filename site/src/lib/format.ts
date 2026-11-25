import { CENTRAL_TZ } from "../config";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Typographic minus, so negative figures align with positive ones.
const minus = (s: string) => s.replace("-", "−");

/** Micro-USD, the manifests' money unit, as dollars. */
export function formatUusd(uusd: number | null | undefined, opts: { whole?: boolean } = {}): string {
  if (uusd == null) return "—";
  return minus((opts.whole ? usd0 : usd).format(uusd / 1e6));
}

/** Cents per MWh as $/MWh, without the unit. */
export function formatCentsPerMwh(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return minus(dec2.format(cents / 100));
}

export function formatMw(kw: number | null | undefined): string {
  if (kw == null) return "—";
  return minus(dec1.format(kw / 1000));
}

export function formatMwh(kwh: number | null | undefined): string {
  if (kwh == null) return "—";
  return minus(dec1.format(kwh / 1000));
}

/** Parts per million as a percent. */
export function formatPpm(ppm: number | null | undefined): string {
  if (ppm == null) return "—";
  return minus(dec1.format(ppm / 1e4));
}

export function formatInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return minus(int.format(n));
}

/** 0x1234…cdef: keeps both ends so two hashes can still be told apart. */
export function shortHash(hash: string, head = 6, tail = 4): string {
  const prefix = hash.startsWith("0x") ? 2 : 0;
  if (hash.length <= prefix + head + tail + 1) return hash;
  return `${hash.slice(0, prefix + head)}…${hash.slice(-tail)}`;
}

const ctFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: CENTRAL_TZ,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});
const localFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

/** Market time first; the reader's own clock beside it when it differs. */
export function formatStamp(unix: number): { ct: string; local: string | null } {
  const d = new Date(unix * 1000);
  const ct = ctFmt.format(d);
  const local = localFmt.format(d);
  return { ct, local: local === ct ? null : local };
}

/** "Thu, Nov 26, 2026" for a YYYY-MM-DD operating day. */
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Lead time between two stamps, e.g. "13 h 42 min". */
export function formatLead(seconds: number): string {
  const sign = seconds < 0 ? "−" : "";
  const s = Math.abs(Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${sign}${m} min`;
  return `${sign}${h} h ${m} min`;
}

/** Dollars (the site data's money unit), with a typographic minus. */
export function formatUsd(dollars: number | null | undefined, opts: { whole?: boolean } = {}): string {
  if (dollars == null) return "—";
  return minus((opts.whole ? usd0 : usd).format(dollars));
}

/** One decimal place, for MW and MWh already in those units. */
export function formatDec1(n: number | null | undefined): string {
  if (n == null) return "—";
  return minus(dec1.format(n));
}
