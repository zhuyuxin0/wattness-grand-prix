/**
 * The tabs' icons: one line drawing per tab, beside its label in the side panel and the phone menu, never instead of
 * it. They are drawn like wattness.tech's menu and workspace icons (wattness-site apps/mms/src/ui/glyph.css, Nov 2),
 * the 16 px members of the glyph set this site's Glyph copies: 1.3 px strokes at 16 px, round caps and joins, no
 * fills, in the text's color. A drawing names its box: 16 units for the Terminal's own glyphs, copied byte for byte
 * (the Floors shield without its check), and 24 for the drawings adapted from Lucide (ISC License,
 * THIRD-PARTY-NOTICES.md), drawn at 1.95 units so the stroke is the same 1.3 px. A drawing is one or more paths, each
 * starting with an absolute move.
 *
 * Plain data, with no imports, so test/tab-icons.test.mjs reads it directly.
 *
 * @license Paths marked "lucide" are from Lucide 0.577.0, ISC License, Copyright (c) Lucide Contributors 2026, with
 * portions Copyright (c) 2013-2026 Cole Bemis (Feather, MIT). See THIRD-PARTY-NOTICES.md at the repository's root.
 */

export interface TabIconDrawing {
  /** The drawing's box in units: 16 (the Terminal's glyphs) or 24 (Lucide's grid). */
  box: 16 | 24;
  /** Where the drawing comes from: the Terminal's glyph it copies, or the Lucide icon it adapts. */
  source: string;
  /** Its paths, each starting with an absolute move (M). */
  d: readonly string[];
}

/** The stroke at 16 px, in px: the Terminal's 16 px glyphs (glyph.css, "Menu and workspace icons"). */
export const TAB_ICON_STROKE = 1.3;

export const TAB_ICONS = {
  // Intro: a play button in a circle
  play: {
    box: 24,
    source: "lucide circle-play",
    d: ["M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z", "M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0"],
  },
  // Overview: a gauge
  gauge: {
    box: 24,
    source: "lucide gauge",
    d: ["M12 14l4-4", "M3.34 19a10 10 0 1 1 17.32 0"],
  },
  // Fleet: a grid of cells, one row a plan
  grid: {
    box: 24,
    source: "lucide grid-3x3",
    d: ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M3 9h18", "M3 15h18", "M9 3v18", "M15 3v18"],
  },
  // Battery: the Terminal's battery (its My Battery workspace)
  battery: {
    box: 16,
    source: "terminal ws-battery",
    d: ["M3.25 4.75h9a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-4.5a1 1 0 0 1 1-1zM15 6.75v2.5M5 7v2M7.25 7v2"],
  },
  // Agent IDs: an identity card
  "id-card": {
    box: 24,
    source: "lucide id-card",
    d: [
      "M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
      "M7 11a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
      "M6.17 15a3 3 0 0 1 5.66 0",
      "M16 10h2",
      "M16 14h2",
    ],
  },
  // Forecast: the weather, a cloud before the sun
  "cloud-sun": {
    box: 24,
    source: "lucide cloud-sun",
    d: [
      "M12 2v2",
      "M4.93 4.93l1.41 1.41",
      "M20 12h2",
      "M19.07 4.93l-1.41 1.41",
      "M15.947 12.65a4 4 0 0 0-5.925-4.128",
      "M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z",
    ],
  },
  // State of Charge: a battery charging
  "battery-charging": {
    box: 24,
    source: "lucide battery-charging",
    d: [
      "M11 7l-3 5h4l-3 5",
      "M14.856 6H16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.935",
      "M22 14v-4",
      "M5.14 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2.936",
    ],
  },
  // Hedge: a shield, the outline of the Terminal's Floors workspace icon without its check
  shield: {
    box: 16,
    source: "terminal ws-floors, its outline",
    d: ["M8 1.75l5.25 2v4c0 3.1-2.3 5.4-5.25 6.5C5.05 13.15 2.75 10.85 2.75 7.75v-4z"],
  },
  // Risk: a warning triangle
  warning: {
    box: 24,
    source: "lucide triangle-alert",
    d: ["M21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
  },
  // Memory: a brain
  brain: {
    box: 24,
    source: "lucide brain",
    d: [
      "M12 18V5",
      "M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4",
      "M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5",
      "M17.997 5.125a4 4 0 0 1 2.526 5.77",
      "M18 18a4 4 0 0 0 2-7.464",
      "M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517",
      "M6 18a4 4 0 0 1-2-7.464",
      "M6.003 5.125a4 4 0 0 0-2.526 5.77",
    ],
  },
  // Seal: a stamp
  stamp: {
    box: 24,
    source: "lucide stamp",
    d: [
      "M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13",
      "M20 15.5a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1z",
      "M5 22h14",
    ],
  },
  // Verify: a badge with a check
  "check-badge": {
    box: 24,
    source: "lucide badge-check",
    d: [
      "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
      "M9 12l2 2 4-4",
    ],
  },
  // Files: a folder
  folder: {
    box: 24,
    source: "lucide folder",
    d: ["M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"],
  },
  // Season: a trophy
  trophy: {
    box: 24,
    source: "lucide trophy",
    d: [
      "M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978",
      "M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978",
      "M18 9h1.5a1 1 0 0 0 0-5H18",
      "M4 22h16",
      "M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z",
      "M6 9H4.5a1 1 0 0 1 0-5H6",
    ],
  },
  // Launchpad: a rocket
  rocket: {
    box: 24,
    source: "lucide rocket",
    d: [
      "M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5",
      "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09",
      "M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z",
      "M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05",
    ],
  },
  // Prices: two candles, the Terminal's market icon
  candles: {
    box: 16,
    source: "terminal ws-market",
    d: ["M4.75 1.75v12.5M3.25 4.75h3v5.5h-3zM11.25 1.75v12.5M9.75 6.25h3v4.5h-3z"],
  },
  // ONE PLAN: a gamepad
  gamepad: {
    box: 24,
    source: "lucide gamepad-2",
    d: [
      "M6 11h4",
      "M8 9v4",
      "M15 12h.01",
      "M18 10h.01",
      "M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z",
    ],
  },
  // How It Works: an open book, the Terminal's Docs menu icon
  book: {
    box: 16,
    source: "terminal book",
    d: ["M2 3.5h4.2c1 0 1.8.8 1.8 1.7V13c0-.8-.7-1.4-1.6-1.4H2zM14 3.5H9.8C8.8 3.5 8 4.3 8 5.2V13c0-.8.7-1.4 1.6-1.4H14z"],
  },
  // Tech Stack: layers
  layers: {
    box: 24,
    source: "lucide layers",
    d: [
      "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",
      "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12",
      "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",
    ],
  },
  // Add Your Agent: a robot with a plus, Lucide's bot redrawn smaller (no ears) to make room for the plus
  "robot-plus": {
    box: 24,
    source: "lucide bot, adapted",
    d: ["M4 9h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z", "M9 9V5H6", "M6.5 13.5v2", "M11.5 13.5v2", "M19.5 2.5v6", "M16.5 5.5h6"],
  },
} as const satisfies Record<string, TabIconDrawing>;

export type TabIconName = keyof typeof TAB_ICONS;
