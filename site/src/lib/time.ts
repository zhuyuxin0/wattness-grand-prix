import { CENTRAL_TZ, GATE_HOUR_CT } from "../config";

// Clock math for the gate. Everything here is a pure function of the instant
// it is given, so a page (or a recording) passes a fixed clock and gets the
// same frame every time.

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFmt = new Map<string, Intl.DateTimeFormat>();

function wall(ms: number, timeZone: string): WallParts {
  let fmt = partsFmt.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFmt.set(timeZone, fmt);
  }
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(new Date(ms))) if (part.type !== "literal") p[part.type] = Number(part.value);
  return { year: p.year!, month: p.month!, day: p.day!, hour: p.hour!, minute: p.minute!, second: p.second! };
}

/** Milliseconds the zone's wall clock is ahead of UTC at this instant. */
function offsetMs(ms: number, timeZone: string): number {
  const w = wall(ms, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The instant a zone's wall clock reads the given date and time. */
export function zonedInstant(timeZone: string, year: number, month: number, day: number, hour = 0, minute = 0): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let t = guess - offsetMs(guess, timeZone);
  // A second pass settles the offset across a daylight-saving change.
  t = guess - offsetMs(t, timeZone);
  return t;
}

export interface Gate {
  /** Unix seconds of the gate. */
  unix: number;
  /** YYYY-MM-DD: the operating day this gate closes bids for (the next CT day). */
  operatingDay: string;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function addDays(y: number, m: number, d: number, n: number): [number, number, number] {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}

/** The first 10:00 CT gate strictly after `nowMs`. */
export function nextGate(nowMs: number): Gate {
  const w = wall(nowMs, CENTRAL_TZ);
  let [y, m, d] = [w.year, w.month, w.day];
  let t = zonedInstant(CENTRAL_TZ, y, m, d, GATE_HOUR_CT);
  if (t <= nowMs) {
    [y, m, d] = addDays(y, m, d, 1);
    t = zonedInstant(CENTRAL_TZ, y, m, d, GATE_HOUR_CT);
  }
  const [oy, om, od] = addDays(y, m, d, 1);
  return { unix: Math.round(t / 1000), operatingDay: iso(oy, om, od) };
}

/** The 10:00 CT gate that closes bids for an operating day. */
export function gateFor(operatingDay: string): number {
  const [y, m, d] = operatingDay.split("-").map(Number) as [number, number, number];
  const [gy, gm, gd] = addDays(y, m, d, -1);
  return Math.round(zonedInstant(CENTRAL_TZ, gy, gm, gd, GATE_HOUR_CT) / 1000);
}

export interface Split {
  negative: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function split(seconds: number): Split {
  const negative = seconds < 0;
  let s = Math.abs(Math.floor(seconds));
  const days = Math.floor(s / 86400);
  s -= days * 86400;
  const hours = Math.floor(s / 3600);
  s -= hours * 3600;
  const minutes = Math.floor(s / 60);
  return { negative, days, hours, minutes, seconds: s - minutes * 60 };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 23:05:09, or 1d 02:05:09 past a day. */
export function formatCountdown(seconds: number): string {
  const s = split(seconds);
  const hms = `${pad(s.hours)}:${pad(s.minutes)}:${pad(s.seconds)}`;
  return `${s.negative ? "−" : ""}${s.days ? `${s.days}d ` : ""}${hms}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 25, 09:15:17" in the zone. */
export function formatInZone(unix: number, timeZone: string, opts: { seconds?: boolean; date?: boolean } = {}): string {
  const w = wall(unix * 1000, timeZone);
  const time = `${pad(w.hour)}:${pad(w.minute)}${opts.seconds === false ? "" : `:${pad(w.second)}`}`;
  return opts.date === false ? time : `${MONTHS[w.month - 1]} ${w.day}, ${time}`;
}

/** The reader's own zone, from the browser; market time when it cannot be read. */
export const READER_TZ: string = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || CENTRAL_TZ;
  } catch {
    return CENTRAL_TZ;
  }
})();

export interface DualTime {
  ct: string;
  /** The reader's own clock, "21:15 yours", or null when it reads the same as CT. */
  yours: string | null;
}

/** Market time first, the reader's own beside it. Never UTC. */
export function dualTime(unix: number, opts: { seconds?: boolean; date?: boolean } = {}): DualTime {
  const ct = formatInZone(unix, CENTRAL_TZ, opts);
  const own = formatInZone(unix, READER_TZ, opts);
  return { ct: `${ct} CT`, yours: own === ct ? null : `${own} yours` };
}

/** "Thu, Nov 26, 2026" for an operating day. */
export function formatOperatingDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}
