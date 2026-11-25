// The operating day's 24 hours, as the plans index them: hour 0 is 00:00–01:00 CT.

const pad = (n: number) => String(n).padStart(2, "0");

export const HOURS_OF_DAY: number[] = Array.from({ length: 24 }, (_, h) => h);

/** "17:00" for hour 17 (its start, CT). */
export const hourStartLabel = (h: number) => `${pad(h)}:00`;

/** ERCOT's hour-ending label: HE18 for 17:00–18:00. */
export const hourEndingLabel = (h: number) => `HE${pad(h + 1)}`;

/** Cents per MWh as dollars per MWh, two places, with a typographic minus. */
export const dollarsPerMwh = (cents: number | null | undefined) =>
  cents == null ? "no value" : (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace("-", "−");
