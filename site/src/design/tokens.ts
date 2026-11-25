// The values canvas, SVG scales and WebGL scenes need as numbers or strings.
// Keep in step with src/styles/tokens.css.

export const color = {
  chrome: "#101315",
  bg: "#14171a",
  raised: "#1f2429",
  border: "#2b3036",
  text: "#e6e8ea",
  textStrong: "#f6f7f8",
  muted: "#969ca3",
  faint: "#6b7178",
  teal: "#2ec7a6",
  bnb: "#f0b90b",
  refused: "#e5534b",
} as const;

export type ArmName = "A" | "B" | "C";

export const arm: Record<ArmName, { color: string; label: string; short: string }> = {
  A: { color: "#d9825b", label: "No hedge", short: "A" },
  B: { color: "#8f7cf0", label: "Hedge on a fixed schedule", short: "B" },
  C: { color: "#2ec7a6", label: "Schedule and hedge together", short: "C" },
};

export const font = {
  display: '"Libre Franklin", "Helvetica Neue", Arial, sans-serif',
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
  timing: '"Barlow Condensed", "Libre Franklin", "Arial Narrow", Arial, sans-serif',
} as const;

export const motion = {
  fast: 120,
  base: 220,
  slow: 480,
} as const;

/** 0xRRGGBB for three.js materials. */
export function hex(css: string): number {
  return Number.parseInt(css.replace("#", ""), 16);
}
