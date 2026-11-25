import { useCallback, useSyncExternalStore } from "react";
import { SHOWCASE } from "../config";

// The battery the Battery and agent tabs show. Picking one on any of them
// carries to the rest, and the viewer's last pick is remembered on this device
// (a convenience: a page reads its own ?battery= or #/battery/<resource> first,
// and falls back to Desert Willow when the store is empty or blocked).

const KEY = "gp.battery";
const subs = new Set<() => void>();

function read(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && /^[A-Z0-9_]{2,40}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

let current: string = read() ?? SHOWCASE.resource;

export function selectedBattery(): string {
  return current;
}

export function selectBattery(resource: string): void {
  if (!resource || resource === current) return;
  current = resource;
  try {
    localStorage.setItem(KEY, resource);
  } catch {
    // A blocked store only costs remembering the pick.
  }
  for (const fn of [...subs]) fn();
}

function subscribe(fn: () => void) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

/** The carried battery and its setter. */
export function useSelectedBattery(): [string, (resource: string) => void] {
  const value = useSyncExternalStore(subscribe, selectedBattery, () => SHOWCASE.resource);
  return [value, useCallback((r: string) => selectBattery(r), [])];
}

/** Where a battery tab opens for the carried battery. */
export function batteryPath(tabPath: string, resource: string): string {
  return tabPath === "/battery" ? `/battery/${resource}` : tabPath;
}
