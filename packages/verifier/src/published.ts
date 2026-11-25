// Reads a settlement point's day from the release's price file (wattness.instrument.v1), the file an outcome
// cites, so V10 can rebuild the outcome from the published prices rather than from the numbers the outcome
// states. Written apart from the data package on purpose: two readers of one file have to agree.

export const INSTRUMENT_SCHEMA = "wattness.instrument.v1";

export interface PublishedDay {
  hours: number;
  /** Day-ahead SPP by hour, whole cents per MWh; null for an hour not graded "published". */
  daCents: (number | null)[];
  /** Real-time SPP by 15-minute interval, whole cents per MWh; null for an interval not graded "published". */
  rt15Cents: (number | null)[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function need(ok: boolean, what: string): asserts ok {
  if (!ok) throw new Error(what);
}

/** SPPs are published to the cent; a value that is not is refused, not rounded. */
export function wholeCents(usdPerMwh: number): number {
  const cents = Math.round(usdPerMwh * 100);
  if (Math.abs(usdPerMwh * 100 - cents) > 1e-6) throw new Error(`${usdPerMwh} $/MWh is not a whole number of cents`);
  return cents;
}

function published(value: unknown, grade: unknown, label: string): number | null {
  need(value === null || value === undefined || (typeof value === "number" && Number.isFinite(value)), `${label}: value is not a number`);
  need(typeof grade === "string", `${label}: no grade`);
  return grade === "published" && typeof value === "number" ? wholeCents(value) : null;
}

export function parsePublishedDay(bytes: Uint8Array, point: string, day: string): PublishedDay {
  const label = `prices ${point} ${day}`;
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error(`${label}: not JSON`);
  }
  need(isRecord(raw) && raw.schema === INSTRUMENT_SCHEMA, `${label}: expected ${INSTRUMENT_SCHEMA}`);
  const key = raw.key;
  need(isRecord(key) && key.settlement_point === point && key.operating_day === day, `${label}: the file's key names another point or day`);
  const cal = raw.calendar;
  need(isRecord(cal) && Array.isArray(cal.hour_starts), `${label}: calendar.hour_starts`);
  const hours = cal.hour_starts.length;
  const da = raw.da;
  need(isRecord(da) && Array.isArray(da.hours) && da.hours.length === hours, `${label}: da.hours`);
  const rt = raw.rt;
  need(isRecord(rt) && Array.isArray(rt.intervals) && rt.intervals.length === hours * 4, `${label}: rt.intervals`);
  return {
    hours,
    daCents: da.hours.map((h, i) => {
      need(isRecord(h), `${label}: da hour ${i}`);
      return published(h.dam_spp ?? null, h.grade, `${label}: da hour ${i}`);
    }),
    rt15Cents: rt.intervals.map((iv, i) => {
      need(isRecord(iv) && isRecord(iv.rtspp), `${label}: rt interval ${i}`);
      return published(iv.rtspp.value ?? null, iv.rtspp.grade, `${label}: rt interval ${i}`);
    }),
  };
}
