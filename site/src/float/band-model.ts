import type { Bounds, FloatPanel, Rect } from "./model";

// A band of dock panes: rc-dock float panes inside one region of a page (the Overview's control room), where the float
// layer's panes (model.ts) float over the whole window. Each pane is one part of the page, under a fixed id. The reader
// drags a pane by its header, resizes it at its edges and corner, closes it, brings it back from the band's panes
// menu, and resets the lot. Places are kept as fractions of the band, so an arrangement scales with the window, and
// until the reader moves, resizes, closes or reopens a pane, the default arrangement is worked out again for the
// band's size. Everything here is pure, so `pnpm test` checks it in Node.

/** Where a pane sits in the default arrangement: a column either side of the band's middle, at the bottom of the
 *  middle itself (the middle above it left open), or along the band's foot. */
export type Side = "left" | "right" | "middle" | "bottom";

export interface BandSpec {
  /** Fixed for the pane: the key its place is saved under. */
  id: string;
  side: Side;
  /** The height it opens at, in px, where its column has the room (every pane of the column needs one). */
  h?: number;
  /** The width a pane in the middle opens at, in px, where the middle has the room; the middle's width otherwise. */
  w?: number;
  /** Its share of its column's height when the column fills (or of the foot's width); 1 when not given. */
  weight?: number;
  /** The smallest it is drawn, in px, where the band has the room. */
  min?: { w: number; h: number };
}

export interface ArrangeOptions {
  /** The foot's panes along the middle between the columns (the default), or across the band's whole width under them. */
  foot?: "middle" | "full";
  /** Where each column starts, in px from the band's top: under what stands in the band's corner over it (the page's
   *  head, the panes menu). The band's edge when not given. */
  top?: { left?: number; right?: number };
  /** The room kept under the panes at the band's foot, in px (for what floats over the page there). The band's edge
   *  when not given. */
  bottom?: number;
}

/** A rectangle as fractions of the band's width and height. */
export interface Frac {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BandState {
  /** Every pane's place, open or closed. */
  places: Readonly<Record<string, Frac>>;
  /** The open panes, bottom to top: the last is drawn on top. */
  stack: readonly string[];
  /** True once the reader has moved, resized, closed or reopened a pane: from then on the band keeps their places. */
  custom: boolean;
}

/** The default arrangement keeps this far from the band's edges, and this far between panes. */
export const BAND_EDGE = 16;
export const BAND_GAP = 12;
/** The smallest a pane is drawn unless its spec says otherwise. */
export const BAND_MIN = { w: 240, h: 100 } as const;
/** The narrowest middle the default arrangement leaves clear for the picture behind the panes; narrower, the columns meet. */
export const CLEAR_MIN = 200;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const weightOf = (s: BandSpec) => (typeof s.weight === "number" && s.weight > 0 && Number.isFinite(s.weight) ? s.weight : 1);
export const minOf = (s: BandSpec | undefined) => s?.min ?? BAND_MIN;

/**
 * `total` split by weight, less the gaps between, each part at least its smallest size (a part held at its smallest
 * leaves the rest to the others), in whole px that add up to the whole when the smallest sizes fit.
 */
function split(total: number, weights: readonly number[], mins: readonly number[], gap: number): number[] {
  const n = weights.length;
  const room = Math.max(0, total - gap * Math.max(0, n - 1));
  const held = weights.map(() => false);
  let sizes = weights.map(() => 0);
  for (let pass = 0; pass <= n; pass++) {
    const free = weights.reduce((a, w, i) => (held[i] ? a : a + w), 0);
    const left = room - mins.reduce((a, m, i) => (held[i] ? a + m : a), 0);
    sizes = weights.map((w, i) => (held[i] ? mins[i]! : free > 0 ? (Math.max(0, left) * w) / free : 0));
    const short = sizes.map((v, i) => !held[i] && v < mins[i]!);
    if (!short.some(Boolean)) break;
    short.forEach((s, i) => (held[i] ||= s));
  }
  // Whole px: round the running edges, so the parts add up to what they did before rounding.
  let edge = 0;
  let at = 0;
  return sizes.map((v) => {
    edge += v;
    const next = Math.round(edge);
    const size = next - at;
    at = next;
    return size;
  });
}

const tall = (s: BandSpec) => (typeof s.h === "number" && s.h > 0 && Number.isFinite(s.h) ? s.h : 0);

/** The columns' width at a band's size, and whether they meet, leaving no middle clear. */
export function columnWidth(b: Bounds): { col: number; tight: boolean } {
  const inner = Math.max(0, b.w - 2 * BAND_EDGE);
  const col = clamp(Math.round(b.w * 0.272), 260, 400);
  if (2 * col + 2 * BAND_GAP + CLEAR_MIN <= inner) return { col, tight: false };
  return { col: Math.max(0, Math.floor((inner - BAND_GAP) / 2)), tight: true };
}

/** Which panes stand in which column and which along the foot at a band's width: the foot's join a column where the
 *  foot has no room for their smallest widths. */
function assign(specs: readonly BandSpec[], b: Bounds, opts: ArrangeOptions) {
  const innerW = Math.max(0, b.w - 2 * BAND_EDGE);
  const { col, tight } = columnWidth(b);
  const full = opts.foot === "full";
  const footRoom = full ? innerW : tight ? 0 : innerW - 2 * (col + BAND_GAP);
  const middleRoom = tight ? 0 : innerW - 2 * (col + BAND_GAP);
  const left = specs.filter((s) => s.side === "left");
  const right = specs.filter((s) => s.side === "right");
  const shorter = () => (left.length <= right.length ? left : right);
  let middle = specs.filter((s) => s.side === "middle");
  if (middle.some((s) => minOf(s).w > middleRoom)) {
    for (const s of middle) shorter().push(s);
    middle = [];
  }
  let foot = specs.filter((s) => s.side === "bottom");
  const footMin = foot.reduce((a, s) => a + minOf(s).w, 0) + BAND_GAP * Math.max(0, foot.length - 1);
  if (footMin > footRoom) {
    for (const s of foot) shorter().push(s);
    foot = [];
  }
  return { col, full, footRoom, middleRoom, left, right, middle, foot };
}

/** The room kept under the panes at the band's foot. */
const bottomOf = (opts: ArrangeOptions) =>
  typeof opts.bottom === "number" && Number.isFinite(opts.bottom) ? Math.max(0, Math.round(opts.bottom)) : BAND_EDGE;

/** The height a column's panes ask for: each its height, or its smallest where it gives none, with the gaps. */
const columnNeed = (list: readonly BandSpec[]) =>
  list.reduce((a, s) => a + (tall(s) || minOf(s).h), 0) + BAND_GAP * Math.max(0, list.length - 1);

/**
 * How tall the band must be for the default arrangement to open every pane at its height: the taller column from its
 * top, then the foot. A page whose band may grow past its own height (band.tsx `grow`) takes this as its least.
 */
export function neededHeight(specs: readonly BandSpec[], b: Bounds, opts: ArrangeOptions = {}): number {
  if (!(b.w > 0)) return 0;
  const { full, left, right, middle, foot } = assign(specs, b, opts);
  const top = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? Math.max(BAND_EDGE, Math.round(v)) : BAND_EDGE);
  const bottom = bottomOf(opts);
  const cols = Math.max(left.length ? top(opts.top?.left) + columnNeed(left) : 0, right.length ? top(opts.top?.right) + columnNeed(right) : 0);
  const mid = middle.length ? BAND_EDGE + columnNeed(middle) : 0;
  const footH = foot.length ? Math.max(...foot.map((s) => tall(s) || 150), ...foot.map((s) => minOf(s).h)) : 0;
  if (full && foot.length) return Math.max(cols, mid) + BAND_GAP + footH + bottom;
  const midFoot = foot.length ? (mid ? mid + BAND_GAP : BAND_EDGE) + footH : mid;
  return Math.max(cols, midFoot) + bottom;
}

/**
 * The default arrangement, in px: a column of panes down each side of the band and a row along its foot, either under
 * the middle between the columns or across the whole band, so the middle of the picture behind stays clear. Each column
 * starts where `opts.top` says. A column whose panes all give a height and fit opens them at it, from its top, its last
 * pane down at the column's foot and the room between left open; otherwise the column is filled by weight. Where the
 * foot has no room for its panes, they join the shorter column in turn; where the band is too narrow for a middle at
 * all, the two columns meet. A band not laid out yet (0 by 0) gets nothing.
 */
export function arrange(specs: readonly BandSpec[], b: Bounds, opts: ArrangeOptions = {}): Record<string, Rect> {
  const out: Record<string, Rect> = {};
  if (!(b.w > 0 && b.h > 0)) return out;
  const inner = { x: BAND_EDGE, y: BAND_EDGE, w: Math.max(0, b.w - 2 * BAND_EDGE), h: Math.max(0, b.h - 2 * BAND_EDGE) };
  const { col, full, footRoom, middleRoom, left, right, middle, foot } = assign(specs, b, opts);
  const bottom = Math.max(inner.y, b.h - bottomOf(opts));
  const topOf = (v: number | undefined) => clamp(typeof v === "number" && Number.isFinite(v) ? Math.round(v) : inner.y, inner.y, bottom);
  const tops = { left: topOf(opts.top?.left), right: topOf(opts.top?.right) };
  const footMinH = foot.length ? Math.max(...foot.map((s) => minOf(s).h)) : 0;
  let footH = foot.length ? Math.max(foot.some(tall) ? Math.max(...foot.map(tall)) : clamp(Math.round(inner.h * 0.3), 150, 260), footMinH) : 0;
  if (full && foot.length) {
    // A full foot gives up height, down to its smallest, before a column's panes have to go under theirs.
    const need = (list: readonly BandSpec[], top: number) =>
      top - inner.y + list.reduce((a, s) => a + minOf(s).h, 0) + BAND_GAP * Math.max(0, list.length - 1);
    const room = bottom - inner.y - BAND_GAP - Math.max(need(left, tops.left), need(right, tops.right), need(middle, inner.y));
    footH = Math.max(footMinH, Math.min(footH, room));
  }
  const colFoot = full && foot.length ? Math.max(inner.y, bottom - footH - BAND_GAP) : bottom;

  const column = (list: readonly BandSpec[], x: number, top: number) => {
    if (!list.length) return;
    const colH = Math.max(0, colFoot - top);
    const heights = list.map(tall);
    const sized = heights.every((h) => h > 0);
    if (sized && heights.reduce((a, h) => a + h, 0) + BAND_GAP * (list.length - 1) <= colH) {
      let y = top;
      list.forEach((s, i) => {
        const h = heights[i]!;
        const last = i === list.length - 1 && list.length > 1;
        out[s.id] = { x, y: last ? top + colH - h : y, w: col, h };
        y += h + BAND_GAP;
      });
      return;
    }
    let y = top;
    split(colH, sized ? heights : list.map(weightOf), list.map((s) => minOf(s).h), BAND_GAP).forEach((h, i) => {
      out[list[i]!.id] = { x, y, w: col, h };
      y += h + BAND_GAP;
    });
  };
  column(left, inner.x, tops.left);
  column(right, inner.x + inner.w - col, tops.right);

  if (foot.length) {
    let x = full ? inner.x : inner.x + col + BAND_GAP;
    split(footRoom, foot.map(weightOf), foot.map((s) => minOf(s).w), BAND_GAP).forEach((w, i) => {
      out[foot[i]!.id] = { x, y: bottom - footH, w, h: footH };
      x += w + BAND_GAP;
    });
  }

  // The middle's panes stand at its bottom, on the foot when the foot is under the middle too, centered, the middle
  // above them open.
  if (middle.length) {
    const midFoot = foot.length ? bottom - footH - BAND_GAP : colFoot;
    const room = Math.max(0, midFoot - inner.y);
    const heights = middle.map((s) => tall(s) || minOf(s).h);
    const fits = heights.reduce((a, h) => a + h, 0) + BAND_GAP * (middle.length - 1) <= room;
    const sizes = fits ? heights : split(room, heights, middle.map((s) => minOf(s).h), BAND_GAP);
    const x0 = inner.x + col + BAND_GAP;
    let y = midFoot - sizes.reduce((a, h) => a + h, 0) - BAND_GAP * (middle.length - 1);
    middle.forEach((s, i) => {
      const w = Math.max(Math.min(minOf(s).w, middleRoom), Math.min(s.w && s.w > 0 ? Math.round(s.w) : middleRoom, middleRoom));
      const h = sizes[i]!;
      out[s.id] = { x: x0 + Math.round((middleRoom - w) / 2), y, w, h };
      y += h + BAND_GAP;
    });
  }
  return out;
}

// ---------------------------------------------------------------- px and fractions

const r5 = (v: number) => Math.round(v * 1e5) / 1e5;

export function toFrac(r: Rect, b: Bounds): Frac {
  return { x: r5(r.x / b.w), y: r5(r.y / b.h), w: r5(r.w / b.w), h: r5(r.h / b.h) };
}

export function toPx(f: Frac, b: Bounds): Rect {
  return { x: Math.round(f.x * b.w), y: Math.round(f.y * b.h), w: Math.round(f.w * b.w), h: Math.round(f.h * b.h) };
}

/** The rectangle moved (and, where it is larger, shrunk) inside the band, and grown to its smallest size. */
export function clampIn(r: Rect, b: Bounds, min: { w: number; h: number } = BAND_MIN): Rect {
  if (!(b.w > 0 && b.h > 0)) return r;
  const w = Math.round(clamp(r.w, Math.min(min.w, b.w), b.w));
  const h = Math.round(clamp(r.h, Math.min(min.h, b.h), b.h));
  const x = Math.round(clamp(r.x, 0, b.w - w));
  const y = Math.round(clamp(r.y, 0, b.h - h));
  return { x, y, w, h };
}

/** Where a pane is drawn: its place in px, inside the band and no smaller than its smallest size. */
export function placeOf(state: BandState, spec: BandSpec, b: Bounds): Rect {
  const f = state.places[spec.id];
  const r = f ? toPx(f, b) : (arrange([spec], b)[spec.id] ?? { x: 0, y: 0, w: 0, h: 0 });
  return clampIn(r, b, minOf(spec));
}

// ---------------------------------------------------------------- the state

/** Every pane open, in the default arrangement, stacked in the specs' order. */
export function defaultState(specs: readonly BandSpec[], b: Bounds, opts: ArrangeOptions = {}): BandState {
  const px = arrange(specs, b, opts);
  const places: Record<string, Frac> = {};
  for (const s of specs) {
    const r = px[s.id];
    if (r && b.w > 0 && b.h > 0) places[s.id] = toFrac(r, b);
  }
  return { places, stack: specs.map((s) => s.id), custom: false };
}

/** The band measured at a new size: the default arrangement is worked out again until the reader has changed it. */
export function fitState(state: BandState, specs: readonly BandSpec[], b: Bounds, opts: ArrangeOptions = {}): BandState {
  if (state.custom || !(b.w > 0 && b.h > 0)) return state;
  const fresh = defaultState(specs, b, opts);
  const same = specs.every((s) => {
    const a = state.places[s.id];
    const c = fresh.places[s.id];
    return !!a && !!c && a.x === c.x && a.y === c.y && a.w === c.w && a.h === c.h;
  });
  return same ? state : { ...state, places: fresh.places };
}

/**
 * The page's panes changed (a part that waited for its data, a part a build leaves out): a pane the band has not
 * placed opens on top at its default place, and a pane that is gone leaves the stack. The same state when the band
 * already holds exactly these panes.
 */
export function syncSpecs(state: BandState, specs: readonly BandSpec[], b: Bounds, opts: ArrangeOptions = {}): BandState {
  const known = new Set(specs.map((s) => s.id));
  const fresh = specs.filter((s) => !state.places[s.id]);
  const stack = state.stack.filter((id) => known.has(id));
  if (!fresh.length && stack.length === state.stack.length) return state;
  if (!state.custom) {
    const d = defaultState(specs, b, opts);
    return { ...d, stack: [...stack, ...fresh.map((s) => s.id)] };
  }
  const placed = defaultState(specs, b, opts).places;
  const places = { ...state.places };
  for (const s of fresh) if (placed[s.id]) places[s.id] = placed[s.id]!;
  return { ...state, places, stack: [...stack, ...fresh.map((s) => s.id)] };
}

export const isOpen = (state: BandState, id: string) => state.stack.includes(id);

/** The pane brought to the top; the same state when it is already there or closed. */
export function raiseIn(state: BandState, id: string): BandState {
  const i = state.stack.indexOf(id);
  if (i < 0 || i === state.stack.length - 1) return state;
  return { ...state, stack: [...state.stack.slice(0, i), ...state.stack.slice(i + 1), id] };
}

/** The pane closed; it keeps its place for when it comes back. */
export function closeIn(state: BandState, id: string): BandState {
  if (!isOpen(state, id)) return state;
  return { ...state, stack: state.stack.filter((x) => x !== id), custom: true };
}

/** The pane back where it was, on top; an open pane is raised. */
export function reopenIn(state: BandState, id: string): BandState {
  if (isOpen(state, id)) return raiseIn(state, id);
  return { ...state, stack: [...state.stack, id], custom: true };
}

/** One press of a key that moves (dx, dy) or resizes (dw, dh) a pane, in px. */
export interface Nudge {
  dx?: number;
  dy?: number;
  dw?: number;
  dh?: number;
}

/** The keyboard's way to drag: the pane moved or resized by a step, kept inside the band, and raised. */
export function nudgeIn(state: BandState, spec: BandSpec, b: Bounds, d: Nudge): BandState {
  if (!isOpen(state, spec.id) || !(b.w > 0 && b.h > 0)) return state;
  const r = placeOf(state, spec, b);
  const next = clampIn({ x: r.x + (d.dx ?? 0), y: r.y + (d.dy ?? 0), w: r.w + (d.dw ?? 0), h: r.h + (d.dh ?? 0) }, b, minOf(spec));
  const raised = raiseIn(state, spec.id);
  if (next.x === r.x && next.y === r.y && next.w === r.w && next.h === r.h) return raised;
  return { ...raised, places: { ...raised.places, [spec.id]: toFrac(next, b) }, custom: true };
}

/** The step a key moves or resizes a pane by: an arrow key 16 px, Shift resizes instead of moving. */
export const NUDGE = 16;

/** What a key does to a pane whose header has the focus, or null for a key it leaves alone. */
export function nudgeFor(key: string, shift: boolean): Nudge | null {
  const v = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
  if (!v) return null;
  const [x, y] = v as [number, number];
  return shift ? { dw: x * NUDGE, dh: y * NUDGE } : { dx: x * NUDGE, dy: y * NUDGE };
}

// ---------------------------------------------------------------- rc-dock's layout, both ways

/** The group every band pane's panel belongs to (band-dock.tsx gives rc-dock its settings). */
export const BAND_GROUP = "gp-band";
/** A pane's tab and panel in rc-dock's layout, prefixed so no id is shared with the float layer's. */
export const bandTabId = (id: string) => `gpb-${id}`;
export const bandPanelId = (id: string) => `gpb-panel-${id}`;
export const paneOfTab = (tabId: unknown) => (typeof tabId === "string" && tabId.startsWith("gpb-") ? tabId.slice(4) : "");

/**
 * rc-dock's layout for the band: an empty dock and one single-tab float panel per open pane. The panels keep the specs'
 * order, so the page's reading order never changes, and the stack sets their z.
 */
export function toBandLayout(state: BandState, specs: readonly BandSpec[], b: Bounds) {
  const open = specs.filter((s) => isOpen(state, s.id));
  return {
    dockbox: { mode: "horizontal" as const, children: [] as never[] },
    floatbox: {
      mode: "float" as const,
      children: open.map((s) => {
        const r = placeOf(state, s, b);
        return {
          id: bandPanelId(s.id),
          group: BAND_GROUP,
          activeId: bandTabId(s.id),
          tabs: [{ id: bandTabId(s.id) }],
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
          z: state.stack.indexOf(s.id) + 1,
        };
      }),
    },
  };
}

const finite = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/**
 * The band after rc-dock moved, resized or restacked its panels: a pane whose panel moved takes the panel's place
 * (inside the band, at least its smallest size), the stack follows the panels' z, and a pane with no panel is closed.
 * The same state when nothing changed.
 */
export function fromBandLayout(
  floats: readonly FloatPanel[],
  state: BandState,
  specs: readonly BandSpec[],
  b: Bounds,
): BandState {
  const panels = new Map<string, FloatPanel>();
  for (const f of floats) {
    const id = paneOfTab(f.tabs[0]?.id);
    if (id && !panels.has(id)) panels.set(id, f);
  }
  const byId = new Map(specs.map((s) => [s.id, s]));
  let places = state.places;
  let moved = false;
  const rows: { id: string; z: number; i: number }[] = [];
  state.stack.forEach((id, i) => {
    const f = panels.get(id);
    const spec = byId.get(id);
    if (!f || !spec) return;
    rows.push({ id, z: finite(f.z, 0), i });
    if (!(b.w > 0 && b.h > 0)) return;
    const shown = placeOf(state, spec, b);
    const r = {
      x: Math.round(finite(f.x, shown.x)),
      y: Math.round(finite(f.y, shown.y)),
      w: Math.round(finite(f.w, shown.w)),
      h: Math.round(finite(f.h, shown.h)),
    };
    if (r.x === shown.x && r.y === shown.y && r.w === shown.w && r.h === shown.h) return;
    places = { ...places, [id]: toFrac(clampIn(r, b, minOf(spec)), b) };
    moved = true;
  });
  rows.sort((a, c) => a.z - c.z || a.i - c.i);
  const stack = rows.map((r) => r.id);
  const sameStack = stack.length === state.stack.length && stack.every((id, i) => id === state.stack[i]);
  if (!moved && sameStack) return state;
  return {
    places,
    stack: sameStack ? state.stack : stack,
    custom: state.custom || moved || stack.length !== state.stack.length,
  };
}

// ---------------------------------------------------------------- saved in this browser

/** What this browser keeps once the reader has changed the band (a convenience: nothing breaks when it cannot). */
export function serializeBand(state: BandState, specs: readonly BandSpec[]): string {
  const places: Record<string, [number, number, number, number]> = {};
  for (const s of specs) {
    const f = state.places[s.id];
    if (f) places[s.id] = [f.x, f.y, f.w, f.h];
  }
  const closed = specs.map((s) => s.id).filter((id) => !isOpen(state, id));
  return JSON.stringify({ v: 1, places, stack: [...state.stack], closed });
}

export interface SavedBand {
  places: Record<string, Frac>;
  stack: string[];
  closed: string[];
}

const inUnit = (v: unknown, lo: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= 1;

/**
 * The saved band, checked: unreadable or foreign data gives null; a pane this page no longer has, a place out of the
 * band, or an id named twice is dropped.
 */
export function parseBand(raw: string | null, specs: readonly BandSpec[]): SavedBand | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const { v, places, stack, closed } = data as Record<string, unknown>;
  if (v !== 1 || !places || typeof places !== "object" || !Array.isArray(stack) || !Array.isArray(closed)) return null;
  const known = new Set(specs.map((s) => s.id));
  const out: SavedBand = { places: {}, stack: [], closed: [] };
  for (const [id, value] of Object.entries(places as Record<string, unknown>)) {
    if (!known.has(id) || !Array.isArray(value) || value.length !== 4) continue;
    const [x, y, w, h] = value as unknown[];
    if (!inUnit(x, 0) || !inUnit(y, 0) || !inUnit(w, 0) || !inUnit(h, 0)) continue;
    if (!((w as number) > 0 && (h as number) > 0)) continue;
    out.places[id] = { x: x as number, y: y as number, w: w as number, h: h as number };
  }
  const seen = new Set<string>();
  for (const id of stack) {
    if (typeof id !== "string" || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.stack.push(id);
  }
  for (const id of closed) {
    if (typeof id !== "string" || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.closed.push(id);
  }
  return out;
}

/**
 * The band as the reader left it, at today's size: the saved places and stack, a pane saved as closed stays closed,
 * and a pane the saved band did not know opens on top at its default place.
 */
export function restoreBand(saved: SavedBand, specs: readonly BandSpec[], b: Bounds, opts: ArrangeOptions = {}): BandState {
  const fresh = defaultState(specs, b, opts);
  const named = new Set([...saved.stack, ...saved.closed]);
  return {
    places: { ...fresh.places, ...saved.places },
    stack: [...saved.stack, ...specs.map((s) => s.id).filter((id) => !named.has(id))],
    custom: true,
  };
}
