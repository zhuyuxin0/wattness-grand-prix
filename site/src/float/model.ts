// The float layer's model: the panes open over the page, as plain data. The layer (layer.tsx) draws them with
// rc-dock's float box, as wattness.tech's Terminal draws its floating panes (wattness-site apps/mms: rc-dock 3.3.2,
// ui/dock-bounds.ts keeps its floats inside the dock). Everything here is pure, so `pnpm test` checks it in Node.
//
// A pane is a tab's page at a path, in a rectangle of the layer (the window under the masthead). The list's order is
// the stacking order: the last pane is on top. Opening a path that is already open raises that pane rather than
// adding a second copy; past MAX_PANES the oldest pane closes.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pane extends Rect {
  /** Stable for the pane's life, and the key its place is saved under. */
  id: string;
  /** Where the pane's page is now: a path from the root, with its query. It follows links followed inside the pane. */
  path: string;
}

/** The layer's size in px. */
export interface Bounds {
  w: number;
  h: number;
}

/** At most this many panes at once; a sixth closes the oldest. Each pane holds a whole page. */
export const MAX_PANES = 5;
/** The smallest a pane is drawn, where the layer has the room. */
export const MIN_PANE = { w: 320, h: 220 } as const;
/** A new pane keeps this far from the layer's edges. */
export const EDGE = 16;
/** Each newer pane steps this far down and to the left of the one before, so every header stays in reach. */
export const STEP = 28;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The rectangle moved (and, where it is larger, shrunk) inside the layer. A layer not laid out yet (0 by 0) leaves it. */
export function clampRect(r: Rect, b: Bounds): Rect {
  if (!(b.w > 0 && b.h > 0)) return r;
  const w = Math.round(clamp(r.w, Math.min(MIN_PANE.w, b.w), b.w));
  const h = Math.round(clamp(r.h, Math.min(MIN_PANE.h, b.h), b.h));
  const x = Math.round(clamp(r.x, 0, b.w - w));
  const y = Math.round(clamp(r.y, 0, b.h - h));
  return { x, y, w, h };
}

/** Every pane inside the layer; the same list when none had to move. */
export function clampAll(panes: readonly Pane[], b: Bounds): readonly Pane[] {
  let moved = false;
  const next = panes.map((p) => {
    const r = clampRect(p, b);
    if (r.x === p.x && r.y === p.y && r.w === p.w && r.h === p.h) return p;
    moved = true;
    return { ...p, ...r };
  });
  return moved ? next : panes;
}

/** Where a new pane opens: the right half of the layer, nearly its height, stepped from the panes already open. */
export function placeNew(open: number, b: Bounds): Rect {
  const w = Math.min(clamp(Math.round(b.w * 0.5), 460, 820), Math.max(0, b.w - 2 * EDGE));
  const h = Math.min(clamp(Math.round(b.h * 0.82), 320, 820), Math.max(0, b.h - 2 * EDGE));
  const k = open % MAX_PANES;
  return clampRect({ x: b.w - w - EDGE - k * STEP, y: EDGE + k * STEP, w, h }, b);
}

/** The pane on top, or undefined when none is open. */
export function topPane(panes: readonly Pane[]): Pane | undefined {
  return panes[panes.length - 1];
}

/** The pane brought to the top; the same list when it is already there or not open. */
export function raise(panes: readonly Pane[], id: string): readonly Pane[] {
  const i = panes.findIndex((p) => p.id === id);
  if (i < 0 || i === panes.length - 1) return panes;
  return [...panes.slice(0, i), ...panes.slice(i + 1), panes[i]!];
}

export function closePane(panes: readonly Pane[], id: string): readonly Pane[] {
  return panes.some((p) => p.id === id) ? panes.filter((p) => p.id !== id) : panes;
}

/** A path opened: the pane already showing it comes to the top, or a new pane opens on top with `id`. */
export function openPath(panes: readonly Pane[], path: string, b: Bounds, id: string): readonly Pane[] {
  const same = panes.find((p) => p.path === path);
  if (same) return raise(panes, same.id);
  const next = [...panes, { id, path, ...placeNew(panes.length, b) }];
  return next.length > MAX_PANES ? next.slice(next.length - MAX_PANES) : next;
}

/** The pane's page moved to another path (a link followed inside it); the same list when nothing changed. */
export function setPath(panes: readonly Pane[], id: string, path: string): readonly Pane[] {
  const i = panes.findIndex((p) => p.id === id);
  if (i < 0 || panes[i]!.path === path) return panes;
  return panes.map((p, j) => (j === i ? { ...p, path } : p));
}

// ---------------------------------------------------------------- rc-dock's layout, both ways

/** The group every pane's panel belongs to (layer.tsx gives rc-dock its settings). */
export const PANE_GROUP = "gp-pane";
export const panelId = (paneId: string) => `panel-${paneId}`;

/** A float panel as rc-dock saves it: the fields read back here. */
export interface FloatPanel {
  id?: string;
  tabs: readonly { id?: string }[];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  z?: number;
}

/** rc-dock's layout for the panes: an empty dock and one single-tab float panel per pane, stacked in list order. */
export function toLayout(panes: readonly Pane[]) {
  return {
    dockbox: { mode: "horizontal" as const, children: [] as never[] },
    floatbox: {
      mode: "float" as const,
      children: panes.map((p, i) => ({
        id: panelId(p.id),
        group: PANE_GROUP,
        activeId: p.id,
        tabs: [{ id: p.id }],
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        z: i + 1,
      })),
    },
  };
}

const finite = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/**
 * The panes after rc-dock moved, resized or restacked them: each pane takes its panel's rectangle, in the panels'
 * stacking order (z, then their order). A pane with no panel is gone; a panel with no pane is ignored.
 */
export function fromLayout(floats: readonly FloatPanel[], panes: readonly Pane[]): readonly Pane[] {
  const byId = new Map(panes.map((p) => [p.id, p]));
  const rows = floats
    .map((f, i) => ({ f, i, pane: byId.get(String(f.tabs[0]?.id ?? "")) }))
    .filter((r): r is { f: FloatPanel; i: number; pane: Pane } => r.pane !== undefined);
  rows.sort((a, b) => finite(a.f.z, 0) - finite(b.f.z, 0) || a.i - b.i);
  const next = rows.map(({ f, pane }) => {
    const x = Math.round(finite(f.x, pane.x));
    const y = Math.round(finite(f.y, pane.y));
    const w = Math.round(finite(f.w, pane.w));
    const h = Math.round(finite(f.h, pane.h));
    return x === pane.x && y === pane.y && w === pane.w && h === pane.h ? pane : { ...pane, x, y, w, h };
  });
  const same = next.length === panes.length && next.every((p, i) => p === panes[i]);
  return same ? panes : next;
}

// ---------------------------------------------------------------- saved in this browser

const ID = /^[a-z0-9-]{1,40}$/;

/** A path a pane may hold: from the root, one line, no scheme or host, not too long. */
export function isPanePath(path: unknown): path is string {
  return typeof path === "string" && path.length <= 300 && /^\/(?!\/)[^\s#\\]*$/.test(path);
}

/** The open panes as this browser saves them (a convenience: nothing breaks when it cannot). */
export function serialize(panes: readonly Pane[]): string {
  return JSON.stringify({ v: 1, panes: panes.map(({ id, path, x, y, w, h }) => ({ id, path, x, y, w, h })) });
}

/**
 * The saved panes, checked: unreadable or foreign data gives none, and a pane whose path opens no tab (`known`) is
 * dropped, as are a repeated id or path. Places are clamped when the layer is measured, not here.
 */
export function parseSaved(raw: string | null, known: (path: string) => boolean): Pane[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!data || typeof data !== "object") return [];
  const { v, panes } = data as { v?: unknown; panes?: unknown };
  if (v !== 1 || !Array.isArray(panes)) return [];
  const out: Pane[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const item of panes) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const { id, path } = p;
    if (typeof id !== "string" || !ID.test(id) || ids.has(id)) continue;
    if (!isPanePath(path) || paths.has(path) || !known(path)) continue;
    const r = [p.x, p.y, p.w, p.h];
    if (!r.every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    const [x, y, w, h] = r as number[];
    if (!(w! > 0 && h! > 0)) continue;
    ids.add(id);
    paths.add(path);
    out.push({ id, path, x: x!, y: y!, w: w!, h: h! });
  }
  return out.slice(-MAX_PANES);
}
