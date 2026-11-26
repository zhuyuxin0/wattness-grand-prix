// Ask Ness's frame, as wattness.tech's Ness keeps its window (wattness-site
// apps/mms/src/ui/ness/store.ts): three modes. Beside, a column at the right
// that the page narrows for where it keeps room, and covers where it cannot;
// float, a window dragged by its header and sized from its corner, kept on
// screen; full screen, the panel over the whole view. Esc steps down a mode:
// full screen to the reader's other mode, and either of those to the launcher.
// A phone keeps the sheet from the bottom. The reader's mode, the column's
// width and the window's place are kept in this browser; full screen is a
// moment, not a place to reopen into. No imports, so the tests run it in Node
// as it is (test/ness-frame.test.mjs).

export type NessMode = "beside" | "float" | "full";
export type DesktopMode = Exclude<NessMode, "full">;
export interface FloatRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface FrameState {
  /** The mode the panel opens in, and the one full screen steps down to. */
  mode: DesktopMode;
  /** The column's width beside the page, px. */
  width: number;
  /** The window's place and size, or null until it is first floated. */
  float: FloatRect | null;
}

export const FRAME_KEY = "gp.ness.frame";
export const WIDTH = { min: 360, max: 640, initial: 420 } as const;
export const FLOAT_MIN = { w: 340, h: 320 } as const;
/** The page keeps at least this much beside the column (its side panel and the page), or the column covers it. */
export const PAGE_MIN = 960;
/** Under this width the panel is the phone's sheet. */
export const PHONE_MAX = 767;
/** A window let go this close to the right edge goes back beside the page, as a pane goes back into a dock. */
export const DOCK_ZONE = 28;
/** A column pulled this far by its header comes away as a window. */
export const PULL = 8;
/** The gap a window keeps from the view's edges. */
export const EDGE = 8;

export const DEFAULT_FRAME: FrameState = { mode: "beside", width: WIDTH.initial, float: null };

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function clampWidth(w: number): number {
  return Math.round(Math.min(WIDTH.max, Math.max(WIDTH.min, w)));
}

/** The frame kept in this browser, or the default where there is none or it does not read. */
export function readFrame(raw: string | null): FrameState {
  if (!raw) return DEFAULT_FRAME;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof FrameState, unknown>> | null;
    if (!v || typeof v !== "object") return DEFAULT_FRAME;
    const mode: DesktopMode = v.mode === "float" ? "float" : "beside";
    const width = finite(v.width) ? clampWidth(v.width) : WIDTH.initial;
    const f = v.float as Partial<FloatRect> | null | undefined;
    const float = f && finite(f.x) && finite(f.y) && finite(f.w) && finite(f.h) ? { x: f.x, y: f.y, w: f.w, h: f.h } : null;
    return { mode, width, float };
  } catch {
    return DEFAULT_FRAME;
  }
}

export function writeFrame(s: FrameState): string {
  const f = s.float;
  return JSON.stringify({
    mode: s.mode,
    width: clampWidth(s.width),
    float: f ? { x: Math.round(f.x), y: Math.round(f.y), w: Math.round(f.w), h: Math.round(f.h) } : null,
  });
}

/** A window kept on screen: at least its least size, at most the view less its gaps, and inside the view below `top`. */
export function keepInView(r: FloatRect, vw: number, vh: number, top = EDGE): FloatRect {
  const w = Math.min(Math.max(r.w, FLOAT_MIN.w), vw - 2 * EDGE);
  const h = Math.min(Math.max(r.h, FLOAT_MIN.h), vh - top - EDGE);
  const x = Math.max(EDGE, Math.min(r.x, vw - w - EDGE));
  const y = Math.max(top, Math.min(r.y, vh - h - EDGE));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Where a window first floats: at the right under the masthead, 440 wide and as tall as fits, to 720. */
export function defaultFloat(vw: number, vh: number, top: number): FloatRect {
  const w = 440;
  return keepInView({ x: vw - w - 16, y: top + EDGE, w, h: Math.min(720, vh - top - 2 * EDGE) }, vw, vh, top);
}

/**
 * The column beside the page at this view's width: the page narrows for it where it keeps PAGE_MIN, with the column
 * no wider than leaves that; elsewhere the column covers the page's right side at the reader's width.
 */
export function besideLayout(vw: number, width: number): { narrows: boolean; width: number } {
  const w = clampWidth(width);
  if (vw - WIDTH.min < PAGE_MIN) return { narrows: false, width: Math.min(w, vw) };
  return { narrows: true, width: Math.min(w, vw - PAGE_MIN) };
}

/** Where Esc goes from a mode: full screen to the mode it came from, the others to the launcher. */
export function stepDown(mode: NessMode, before: DesktopMode): NessMode | "closed" {
  return mode === "full" ? before : "closed";
}

/** Whether a window let go at this pointer x docks beside the page again. */
export function inDockZone(x: number, vw: number): boolean {
  return x >= vw - DOCK_ZONE;
}

/** A pointer that has moved this far from where it pressed has started a drag. */
export function pulled(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= PULL;
}
