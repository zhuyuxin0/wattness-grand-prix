import { BATTERY_NAMES } from "../../ui";

/** "HB_NORTH" as the hub's plain name, "North". */
export const hubLabel = (hub: string) => {
  const s = hub.replace(/^HB_/, "").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** A battery's plain name, for the few that have one; the rest go by their ERCOT code. */
export const plainName = (resource: string): string | null => BATTERY_NAMES[resource] ?? null;

/** The census field a left-out battery lacks, in plain words with ERCOT's field name in brackets. */
export const MISSING_FIELD: Record<string, string> = {
  p_max_mw: "No rated power",
  e_max_mwh: "No rated energy",
  settlement_point: "No settlement point",
};
