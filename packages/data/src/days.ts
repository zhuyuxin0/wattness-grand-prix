/** Calendar days as YYYY-MM-DD strings. Comparison is lexical. */
export type Day = string;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDay(value: unknown): value is Day {
  if (typeof value !== "string") return false;
  const m = DAY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

export function assertDay(value: unknown, label = "day"): asserts value is Day {
  if (!isDay(value)) throw new TypeError(`${label}: not a calendar day: ${String(value)}`);
}

export function addDays(day: Day, n: number): Day {
  assertDay(day);
  const t = new Date(`${day}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Inclusive range. */
export function dayRange(from: Day, to: Day): Day[] {
  assertDay(from, "from");
  assertDay(to, "to");
  const out: Day[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
