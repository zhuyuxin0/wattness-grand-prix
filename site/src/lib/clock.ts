import { useEffect, useState } from "react";
import { captureClock } from "./capture";
import { CENTRAL_TZ } from "../config";
import { zonedInstant } from "./time";

/** The page clock in unix ms: fixed when recording, otherwise ticking at `everyMs`. */
export function usePageClock(everyMs = 1000): number {
  const fixed = captureClock();
  const [t, setT] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined) return;
    const id = window.setInterval(() => setT(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [fixed, everyMs]);
  return fixed ?? t;
}

/** Unix seconds of 00:00 CT on an operating day and of the next midnight. */
export function operatingWindow(day: string): { start: number; end: number } {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const start = Math.round(zonedInstant(CENTRAL_TZ, y, m, d) / 1000);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const end = Math.round(zonedInstant(CENTRAL_TZ, next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()) / 1000);
  return { start, end };
}

/** "44 min 43 s" */
export function minSec(seconds: number): string {
  const s = Math.abs(Math.round(seconds));
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

/** "44:43" */
export function clockDigits(seconds: number): string {
  const s = Math.abs(Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** "in 12 h 53 min" style distance, coarse enough not to need a ticking clock. */
export function until(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 48) return `in ${Math.floor(h / 24)} days`;
  if (h) return `in ${h} h ${String(m).padStart(2, "0")} min`;
  return `in ${Math.max(1, m)} min`;
}
