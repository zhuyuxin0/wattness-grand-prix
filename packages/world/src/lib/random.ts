// Seeded randomness: the same seed draws the same numbers on every load and machine, so a frame that scatters
// anything (props, jitter, a coin's spin) renders the same pixels each time. Never Math.random in a frame.

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [a, b). */
  range(a: number, b: number): number;
  /** An integer in [0, n). */
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
  /** Normal, by Box-Muller. */
  normal(mean?: number, sd?: number): number;
  /** A shuffled copy (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[];
}

/** mulberry32. */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r: Rng = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (n) => Math.floor(next() * n),
    pick: (items) => items[Math.floor(next() * items.length)] as (typeof items)[number],
    normal: (mean = 0, sd = 1) => mean + sd * Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next()),
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j] as (typeof out)[number], out[i] as (typeof out)[number]]; }
      return out;
    },
  };
  return r;
}

/** A 32-bit seed from a string (FNV-1a), so a frame can key its randomness on its own id. */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
