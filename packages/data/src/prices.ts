import { type Day, assertDay } from "./days.js";
import { DataError } from "./errors.js";
import { expect, isRecord } from "./fetch-verified.js";
import { assertOpenDay } from "./excluded-days.js";

export const INSTRUMENT_SCHEMA = "wattness.instrument.v1";

const POINT = /^[A-Z0-9_]{1,64}$/;

/** Guarded before the route exists, so an excluded day never reaches a fetch. */
export function priceRoute(point: string, day: Day): string {
  if (!POINT.test(point)) throw new DataError("route", `bad settlement point ${point}`);
  assertDay(day);
  assertOpenDay(day);
  return `/api/prices/${point}/${day}`;
}

/** How a value came to be, as the release grades it ("published", "reconstructed", "absent", ...). */
export type Grade = string;

export interface Priced {
  /** $/MWh as the release holds it, or null when not on file. */
  usdPerMwh: number | null;
  grade: Grade;
}

/** One operating day at one settlement point. Hours are CT clock hours; a DST day has 23 or 25. */
export interface PointDay {
  point: string;
  day: Day;
  /** "record" once ERCOT's settled files are in; "live" while built from SCED runs. */
  mode: string;
  hourStarts: string[];
  intervalStarts: string[];
  /** Day-ahead SPP by hour (NP4-190-CD). */
  da: Priced[];
  daFinal: boolean;
  /** Real-time SPP by 15-minute interval (NP6-905-CD when published). */
  rt15: Priced[];
  /** Hourly real-time settlement value: the mean of the hour's four interval SPPs. */
  rtHourly: Priced[];
  rtFinal: boolean;
}

function priced(value: unknown, grade: unknown, label: string): Priced {
  expect(value === null || (typeof value === "number" && Number.isFinite(value)), `${label}: value`);
  expect(typeof grade === "string", `${label}: grade`);
  return { usdPerMwh: value, grade };
}

function section(raw: Record<string, unknown>, key: string, label: string): Record<string, unknown> {
  const s = raw[key];
  expect(isRecord(s), `${label}: ${key}`);
  return s;
}

export function parsePointDay(raw: unknown, point: string, day: Day): PointDay {
  const label = `prices ${point} ${day}`;
  expect(isRecord(raw) && raw.schema === INSTRUMENT_SCHEMA, `${label}: expected ${INSTRUMENT_SCHEMA}`);
  const key = section(raw, "key", label);
  expect(key.settlement_point === point && key.operating_day === day, `${label}: key differs from route`);
  const cal = section(raw, "calendar", label);
  const hourStarts = cal.hour_starts;
  const intervalStarts = cal.interval_starts;
  expect(Array.isArray(hourStarts) && hourStarts.every((s) => typeof s === "string"), `${label}: hour_starts`);
  expect(Array.isArray(intervalStarts) && intervalStarts.length === hourStarts.length * 4, `${label}: interval_starts`);
  const n = hourStarts.length;

  const da = section(raw, "da", label);
  const daHours = da.hours;
  expect(Array.isArray(daHours) && daHours.length === n, `${label}: da.hours`);
  const rt = section(raw, "rt", label);
  const rtHours = rt.hours;
  const rtIntervals = rt.intervals;
  expect(Array.isArray(rtHours) && rtHours.length === n, `${label}: rt.hours`);
  expect(Array.isArray(rtIntervals) && rtIntervals.length === n * 4, `${label}: rt.intervals`);

  return {
    point,
    day,
    mode: String(raw.mode),
    hourStarts: hourStarts as string[],
    intervalStarts: intervalStarts as string[],
    da: daHours.map((h, i) => {
      expect(isRecord(h), `${label}: da hour ${i}`);
      return priced(h.dam_spp ?? null, h.grade, `${label}: da hour ${i}`);
    }),
    daFinal: da.final === true,
    rt15: rtIntervals.map((iv, i) => {
      expect(isRecord(iv) && isRecord(iv.rtspp), `${label}: rt interval ${i}`);
      return priced(iv.rtspp.value ?? null, iv.rtspp.grade, `${label}: rt interval ${i}`);
    }),
    rtHourly: rtHours.map((h, i) => {
      expect(isRecord(h) && isRecord(h.settled), `${label}: rt hour ${i}`);
      return priced(h.settled.value ?? null, h.settled.grade, `${label}: rt hour ${i}`);
    }),
    rtFinal: rt.final === true,
  };
}

/**
 * Whole cents per MWh. SPPs are published to the cent; a value that is not
 * (a reconstruction from SCED runs) is refused rather than silently rounded.
 */
export function toCents(usdPerMwh: number): number {
  const cents = Math.round(usdPerMwh * 100);
  if (Math.abs(usdPerMwh * 100 - cents) > 1e-6) {
    throw new DataError("shape", `${usdPerMwh} $/MWh is not a whole number of cents`);
  }
  return cents;
}

/** Cents per value when every value is present and graded "published", else null. */
export function publishedCents(values: readonly Priced[]): number[] | null {
  if (!values.every((v) => v.grade === "published" && v.usdPerMwh !== null)) return null;
  return values.map((v) => toCents(v.usdPerMwh as number));
}

/** Whole-cent arrays for the engine: each leg is null unless all of it is published. */
export function centsDay(d: PointDay): { point: string; day: Day; da: number[] | null; rt15: number[] | null } {
  return { point: d.point, day: d.day, da: publishedCents(d.da), rt15: publishedCents(d.rt15) };
}
