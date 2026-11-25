import { type Day, assertDay } from "./days.js";

/**
 * Excluded operating days: no input may come from them, and nothing is fetched for them.
 */
export const EXCLUDED_DAYS = Object.freeze({ from: "2026-07-30", to: "2026-09-29" });

/** First day the plan's price history may use. */
export const HISTORY_START: Day = "2026-09-30";

export class ExcludedDayError extends Error {
  override name = "ExcludedDayError";
  constructor(readonly day: Day) {
    super(`operating day ${day} is excluded (${EXCLUDED_DAYS.from}..${EXCLUDED_DAYS.to}); refusing before any fetch`);
  }
}

export function isExcludedDay(day: Day): boolean {
  assertDay(day);
  return day >= EXCLUDED_DAYS.from && day <= EXCLUDED_DAYS.to;
}

export function assertOpenDay(day: Day): void {
  if (isExcludedDay(day)) throw new ExcludedDayError(day);
}

/** Refuses an inclusive window that touches any excluded day. */
export function assertOpenWindow(from: Day, to: Day): void {
  assertDay(from, "from");
  assertDay(to, "to");
  if (from > to) throw new RangeError(`window ${from}..${to} is reversed`);
  if (from <= EXCLUDED_DAYS.to && to >= EXCLUDED_DAYS.from) {
    throw new ExcludedDayError(from >= EXCLUDED_DAYS.from ? from : EXCLUDED_DAYS.from);
  }
}

/** Every YYYY-MM-DD in a route or path, so a day hidden in a query or segment is still checked. */
export function assertOpenRoute(route: string): void {
  for (const m of route.matchAll(/\d{4}-\d{2}-\d{2}/g)) assertOpenDay(m[0]);
}
