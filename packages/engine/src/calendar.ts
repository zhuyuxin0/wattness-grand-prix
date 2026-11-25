// Operating days are ERCOT's, named by their Central date: "YYYY-MM-DD".
export type Day = string;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Excluded operating days. No code path may read a day in this range. */
export const EXCLUDED_DAYS = { first: "2026-07-30", last: "2026-09-29" } as const;
export const HISTORY_START: Day = "2026-09-30";

// NERC holidays that fall inside the history window or the record period.
const NERC_HOLIDAYS: ReadonlySet<Day> = new Set(["2026-11-26", "2026-12-25", "2027-01-01"]);

export class ExcludedDayError extends Error {
  override name = "ExcludedDayError";
}

function parse(day: Day): number {
  const m = DAY.exec(day);
  if (!m) throw new Error(`not a day: ${JSON.stringify(day)}`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (toDay(ms) !== day) throw new Error(`not a calendar day: ${day}`);
  return ms;
}

function toDay(ms: number): Day {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: Day, n: number): Day {
  return toDay(parse(day) + n * MS_PER_DAY);
}

export function daysBetween(from: Day, to: Day): number {
  return Math.round((parse(to) - parse(from)) / MS_PER_DAY);
}

/** Sundays, Saturdays and NERC holidays trade like each other; everything else is a weekday. */
export type DayType = "weekday" | "offpeak";

export function dayType(day: Day): DayType {
  const dow = new Date(parse(day)).getUTCDay();
  return dow === 0 || dow === 6 || NERC_HOLIDAYS.has(day) ? "offpeak" : "weekday";
}

export function isExcludedDay(day: Day): boolean {
  parse(day);
  return day >= EXCLUDED_DAYS.first && day <= EXCLUDED_DAYS.last;
}

export function assertReadable(day: Day): void {
  if (isExcludedDay(day)) throw new ExcludedDayError(`${day} is in the excluded range ${EXCLUDED_DAYS.first}..${EXCLUDED_DAYS.last}`);
  if (day < HISTORY_START) throw new ExcludedDayError(`${day} is before history starts on ${HISTORY_START}`);
}

/** ERCOT's day-ahead gate: 10:00 Central on the day before the operating day. */
export function gateUnix(od: Day): number {
  const prev = parse(addDays(od, -1)) / 1000;
  for (const offsetHours of [5, 6]) {
    const t = prev + (10 + offsetHours) * 3600;
    if (centralClock(t).slice(11, 16) === "10:00") return t;
  }
  throw new Error(`no 10:00 Central on ${addDays(od, -1)}`);
}

const CENTRAL = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "longOffset",
});

/** ISO 8601 in Central time with its offset, e.g. 2026-11-25T10:00:00-06:00. */
export function centralClock(unix: number): string {
  const parts = Object.fromEntries(CENTRAL.formatToParts(new Date(unix * 1000)).map((p) => [p.type, p.value]));
  const offset = (parts.timeZoneName ?? "").replace("GMT", "") || "+00:00";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}
