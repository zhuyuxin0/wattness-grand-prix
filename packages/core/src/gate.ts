// ERCOT's day-ahead gate is 10:00 Central on the day before the operating day.
// Central time follows the US rule in force since 2007: CDT (UTC-5) from 02:00
// on the second Sunday of March to 02:00 on the first Sunday of November, CST
// (UTC-6) otherwise. This mirrors GateRecord.gateTs; gateTsFromTimeZone is an
// independent check against the IANA database.

const DAY = 86_400;
const HOUR = 3_600;
const GATE_HOUR = 10;

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

/** Days since 1970-01-01 (H. Hinnant, "chrono-compatible low-level date algorithms"). */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

export function civilFromDays(days: number): CivilDate {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

function weekday(days: number): number {
  return (((days + 4) % 7) + 7) % 7; // 0 = Sunday; 1970-01-01 was a Thursday
}

function nthSunday(year: number, month: number, n: number): number {
  const first = daysFromCivil(year, month, 1);
  return first + ((7 - weekday(first)) % 7) + 7 * (n - 1);
}

/** Hours behind UTC at a local hour (0-23) of a civil day in Central time. */
function centralOffset(days: number, hour: number): 5 | 6 {
  const { year } = civilFromDays(days);
  const start = nthSunday(year, 3, 2);
  const end = nthSunday(year, 11, 1);
  const afterStart = days > start || (days === start && hour >= 2);
  const beforeEnd = days < end || (days === end && hour < 2);
  return afterStart && beforeEnd ? 5 : 6;
}

/** Operating days are uint32 YYYYMMDD, the form the contract takes; like the contract, years before 2007 (the current DST rule) are refused. */
export function assertOd(od: number): CivilDate {
  if (!Number.isInteger(od) || od < 2007_01_01 || od > 9999_12_31) throw new RangeError(`bad operating day ${od}`);
  const date = { year: Math.floor(od / 10_000), month: Math.floor(od / 100) % 100, day: od % 100 };
  const back = civilFromDays(daysFromCivil(date.year, date.month, date.day));
  if (back.year !== date.year || back.month !== date.month || back.day !== date.day) {
    throw new RangeError(`bad operating day ${od}`);
  }
  return date;
}

export function odFromIso(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new RangeError(`bad date ${iso}`);
  const od = Number(m[1]) * 10_000 + Number(m[2]) * 100 + Number(m[3]);
  assertOd(od);
  return od;
}

export function isoFromOd(od: number): string {
  const { year, month, day } = assertOd(od);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Unix seconds of 10:00 Central on the day before od. */
export function gateTs(od: number): number {
  const { year, month, day } = assertOd(od);
  const gateDay = daysFromCivil(year, month, day) - 1;
  return gateDay * DAY + (GATE_HOUR + centralOffset(gateDay, GATE_HOUR)) * HOUR;
}

/** Unix seconds of local midnight that opens od. */
export function operatingDayStartTs(od: number): number {
  const { year, month, day } = assertOd(od);
  const d = daysFromCivil(year, month, day);
  return d * DAY + centralOffset(d, 0) * HOUR;
}

export function operatingDayEndTs(od: number): number {
  const { year, month, day } = assertOd(od);
  const next = daysFromCivil(year, month, day) + 1;
  return next * DAY + centralOffset(next, 0) * HOUR;
}

/** 23 on the spring-forward day, 25 on the fall-back day, 24 otherwise. */
export function hoursInOperatingDay(od: number): number {
  return (operatingDayEndTs(od) - operatingDayStartTs(od)) / HOUR;
}

/**
 * The gate derived from the IANA zone through Intl, sharing no code with gateTs.
 * Returns null if no instant on that date reads 10:00 in the zone.
 */
export function gateTsFromTimeZone(od: number, timeZone = "America/Chicago"): number | null {
  const { year, month, day } = assertOd(od);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const prev = new Date(Date.UTC(year, month - 1, day - 1));
  const want = `${String(prev.getUTCMonth() + 1).padStart(2, "0")}/${String(prev.getUTCDate()).padStart(2, "0")}/${prev.getUTCFullYear()}, 10:00`;
  for (let offset = -14; offset <= 14; offset++) {
    const ms = Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth(), prev.getUTCDate(), GATE_HOUR + offset);
    if (fmt.format(new Date(ms)) === want) return ms / 1000;
  }
  return null;
}

/** "2026-11-25 10:00:00 CST" in the given zone; display only. */
export function formatInZone(ts: number, timeZone = "America/Chicago"): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).formatToParts(new Date(ts * 1000));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} ${get("timeZoneName")}`;
}
