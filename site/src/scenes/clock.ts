// Scene time. Every animated value in a scene is a pure function of one number,
// the scene time in seconds, so any frame can be rendered on demand.
//
// Where the time comes from, first match wins:
//   1. the component's `clock` prop (seconds), e.g. the scene lab's scrubber;
//   2. window.__gpClock(), a function returning seconds, which a capture script
//      installs before stepping frames;
//   3. the page's own playback, counted from requestAnimationFrame timestamps.
//
// A capture script can also skip the render loop entirely and call
//   window.__gpScenes[name].render(seconds)
// which draws that frame synchronously (canvas and labels) before returning.

declare global {
  interface Window {
    __gpClock?: () => number;
    __gpScenes?: Record<string, SceneHandle>;
  }
}

export interface SceneHandle {
  name: string;
  duration: number;
  /** Resolves when data, fonts and geometry are in place. */
  ready: Promise<void>;
  /** Draw the frame at `seconds` now, labels included. */
  render(seconds: number): void;
  /** Canvas size in device pixels, for capture scripts. */
  size(): { width: number; height: number };
}

export function externalClock(): number | undefined {
  try {
    const f = window.__gpClock;
    if (typeof f !== "function") return undefined;
    const v = Number(f());
    return Number.isFinite(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

export function registerScene(handle: SceneHandle): () => void {
  const reg = (window.__gpScenes ??= {});
  reg[handle.name] = handle;
  return () => {
    if (reg[handle.name] === handle) delete reg[handle.name];
  };
}

// ---------------------------------------------------------------- timing math

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 0 before `start`, 1 after `start + length`, linear between. */
export const span = (t: number, start: number, length: number) => clamp01((t - start) / length);

export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeIn = (x: number) => x * x * x;
export const smooth = (x: number) => x * x * (3 - 2 * x);

/** A seeded generator (mulberry32), so every "random" layout is the same on every load. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 32-bit hash of a string, to seed per-item values. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Characters resolving into a string, left to right, from a fixed glyph set:
 * deterministic for a given (text, progress), so a recording never flickers
 * differently on a second pass.
 */
export function resolveText(text: string, progress: number, seed = 7): string {
  if (progress >= 1) return text;
  if (progress <= 0) return "";
  const glyphs = "0123456789abcdef";
  const n = text.length;
  const shown = Math.floor(progress * n * 1.25);
  const step = Math.floor(progress * 40);
  let out = "";
  for (let i = 0; i < n; i++) {
    const ch = text[i]!;
    if (i < shown - 0.25 * n) out += ch;
    else if (i < shown) out += ch === " " || ch === "·" ? ch : glyphs[(hashString(`${seed}:${i}:${step}`) >>> 3) % glyphs.length];
    else out += ch === " " ? " " : " ";
  }
  return out;
}
