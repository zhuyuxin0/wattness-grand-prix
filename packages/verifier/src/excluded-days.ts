// Excluded operating days. The verifier keeps its own copy of the window
// rather than trusting the planner's guard.
export const EXCLUDED_FROM = "2026-07-30";
export const EXCLUDED_TO = "2026-09-29";

const DAY = /\d{4}-\d{2}-\d{2}/g;

export function isExcludedDay(day: string): boolean {
  return day >= EXCLUDED_FROM && day <= EXCLUDED_TO;
}

/** Every YYYY-MM-DD appearing in the strings. */
export function daysIn(...texts: string[]): string[] {
  return texts.flatMap((t) => [...t.matchAll(DAY)].map((m) => m[0]));
}
