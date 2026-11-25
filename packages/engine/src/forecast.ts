import { addDays, dayType, type Day, type DayType } from "./calendar.js";
import { roundDiv } from "./ints.js";
import { HOURS } from "./types.js";

export const FORECAST_METHOD =
  "day-type persistence: weighted mean of the newest day-ahead hub prices on file for days of the same type " +
  "(weekday, or weekend and NERC holiday), weights newest first; a day counts only if it is at least " +
  "`lag_days` before the target, the same lag the plan itself faces";

export const DEFAULT_WEIGHTS: readonly number[] = [4, 3, 2, 1];

export interface HubForecast {
  day: Day;
  dayType: DayType;
  references: { day: Day; weight: number }[];
  cents: number[];
}

/**
 * The rule applied to any target day, so a history day's error is measured
 * against exactly what the rule would have said for it. Returns null when
 * fewer same-type days than weights are on file.
 */
export function forecastHub(
  target: Day,
  daByDay: ReadonlyMap<Day, readonly number[]>,
  lagDays: number,
  weights: readonly number[] = DEFAULT_WEIGHTS,
): HubForecast | null {
  if (lagDays < 1) throw new Error("forecast: lag must be at least one day");
  if (weights.length === 0 || weights.some((w) => !Number.isSafeInteger(w) || w <= 0)) {
    throw new Error("forecast: weights must be positive integers");
  }
  const type = dayType(target);
  const latest = addDays(target, -lagDays);
  const candidates = [...daByDay.keys()].filter((d) => d <= latest && dayType(d) === type).sort().reverse();
  if (candidates.length < weights.length) return null;

  const references = weights.map((weight, i) => ({ day: candidates[i]!, weight }));
  const total = BigInt(weights.reduce((a, b) => a + b, 0));
  const cents: number[] = [];
  for (let h = 0; h < HOURS; h++) {
    let acc = 0n;
    for (const r of references) acc += BigInt(r.weight) * BigInt(daByDay.get(r.day)![h]!);
    cents.push(Number(roundDiv(acc, total)));
  }
  return { day: target, dayType: type, references, cents };
}
