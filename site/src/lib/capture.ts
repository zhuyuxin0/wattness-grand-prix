// Recording mode. Scripted captures load the page with
//   ?clock=2026-11-25T15:30:00Z   a fixed clock (ISO instant or unix ms)
//   ?capture=1                    no ticking, no hover-only reveals
// on any path, e.g. /verify?clock=1795620000000&capture=1, so every frame of a
// recording is reproducible.

function param(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

/** The fixed clock in unix ms, or undefined for the live clock. */
export function captureClock(): number | undefined {
  const raw = param("clock");
  if (!raw) return undefined;
  const n = /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function isCapture(): boolean {
  return param("capture") === "1";
}

/** The clock pages should treat as "now": the fixed one when recording. */
export function now(): number {
  return captureClock() ?? Date.now();
}
