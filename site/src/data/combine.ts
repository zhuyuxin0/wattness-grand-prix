import type { Loaded } from "./hooks";

/** Several loads as one: an error as soon as any fails, ready when all are. */
export function combine<T extends unknown[]>(...states: { [K in keyof T]: Loaded<T[K]> }): Loaded<T> {
  for (const s of states) if (s.status === "error") return s;
  if (states.every((s) => s.status === "ready")) return { status: "ready", data: states.map((s) => (s as { data: unknown }).data) as T };
  return { status: "loading" };
}
