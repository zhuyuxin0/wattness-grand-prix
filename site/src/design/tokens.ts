// The token values code needs outside CSS. Keep in step with src/styles/tokens.css.
//
// - `color` and `arm[x].color` are CSS references for DOM and SVG: they follow
//   the theme (and a dark island) on their own.
// - `palette[theme]` holds the same roles as hex, for canvas code that needs a
//   number or does color math.
// - `stageColor` is the 3D stage's own dark, which the stage keeps in either
//   theme, the way wattness.tech's intro does. WebGL cannot read CSS variables.

export type Theme = "light" | "dark";
export type ArmName = "A" | "B" | "C";

export const palette = {
  light: {
    pane: "#ffffff",
    bg: "#fafaf9",
    chrome: "#f3f4f6",
    raised: "#ffffff",
    selected: "#dcf2ec",
    fg: "#1a1a1a",
    muted: "#636a75",
    border: "#e5e7eb",
    accent: "#2ec7a6",
    accentText: "#0b6b58",
    ok: "#2a772e",
    bad: "#9f1d35",
    info: "#1565c0",
    seal: "#f0b90b",
    sealText: "#7f6206",
    sealInk: "#0b0e11",
    ours: "#a03b8d",
    armA: "#2a78d6",
    armB: "#eb6834",
    armC: "#4a3aa7",
  },
  dark: {
    pane: "#191d21",
    bg: "#14171a",
    chrome: "#101315",
    raised: "#1f2429",
    selected: "#123028",
    fg: "#d7d9d4",
    muted: "#969ca3",
    border: "#2b3036",
    accent: "#2ec7a6",
    accentText: "#2ec7a6",
    ok: "#6bcf8a",
    bad: "#ef6b63",
    info: "#56b4e0",
    seal: "#f0b90b",
    sealText: "#f0b90b",
    sealInk: "#0b0e11",
    ours: "#bf539f",
    armA: "#2c60de",
    armB: "#d95926",
    armC: "#9085e9",
  },
} as const satisfies Record<Theme, Record<string, string>>;

/** CSS references for DOM and SVG. */
export const color = {
  pane: "var(--t-pane)",
  chrome: "var(--t-chrome)",
  raised: "var(--t-raised)",
  border: "var(--w-border)",
  grid: "var(--ch-grid)",
  axis: "var(--ch-axis)",
  fg: "var(--w-fg)",
  muted: "var(--w-muted)",
  accentText: "var(--t-accent-text)",
  ok: "var(--s-ok)",
  bad: "var(--s-bad)",
  seal: "var(--seal)",
  sealText: "var(--seal-text)",
  ours: "var(--ch-ours)",
  // Names the pages were written against.
  bg: "var(--t-pane)",
  text: "var(--w-fg)",
  textStrong: "var(--w-fg)",
  faint: "var(--w-muted)",
  teal: "var(--t-accent-mark)",
  bnb: "var(--seal)",
  refused: "var(--s-bad)",
} as const;

/** The 3D stage's dark: its ground is chrome, below the pane, as on wattness.tech's intro. */
export const stageColor = {
  bg: palette.dark.chrome,
  pane: palette.dark.pane,
  raised: palette.dark.raised,
  border: palette.dark.border,
  text: palette.dark.fg,
  muted: palette.dark.muted,
  teal: palette.dark.accent,
  bnb: palette.dark.seal,
  refused: palette.dark.bad,
} as const;

export const arm: Record<ArmName, { color: string; label: string; short: string }> = {
  A: { color: "var(--arm-a)", label: "No hedge", short: "A" },
  B: { color: "var(--arm-b)", label: "Hedge on a fixed schedule", short: "B" },
  C: { color: "var(--arm-c)", label: "Schedule and hedge together", short: "C" },
};

/** An arm's hex for a theme, for canvas code. */
export function armHex(name: ArmName, theme: Theme): string {
  const p = palette[theme];
  return name === "A" ? p.armA : name === "B" ? p.armB : p.armC;
}

export const font = {
  display: '"Libre Franklin Brand", "Franklin Gothic Medium", "Helvetica Neue", Arial, sans-serif',
  sans: '-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const;

export const motion = {
  fast: 180,
  base: 240,
  slow: 820,
  trace: 720,
} as const;

/** 0xRRGGBB for three.js materials. */
export function hex(css: string): number {
  return Number.parseInt(css.replace("#", ""), 16);
}
