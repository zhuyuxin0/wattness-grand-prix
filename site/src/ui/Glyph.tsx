import "./glyph.css";

// Every icon on the site is one of wattness.tech's drawn glyphs (glyph.css, the
// Terminal's mask set): drawn in the text's color, never a typed character. The
// control that holds a glyph carries the name and the state; the glyph is
// decorative unless it is given a title.

const DRAWN = [
  "caret",
  "fold",
  "fold-open",
  "next",
  "prev",
  "up",
  "down",
  "close",
  "check",
  "popout",
  "sort-up",
  "sort-down",
  "sun",
  "moon",
  "refresh",
  "plus",
  "minus",
  "expand",
  "collapse",
  "clock",
  "more",
  "docs",
  "menu",
] as const;

/** Earlier names, drawn with the Terminal's glyph for the same job. */
const ALIAS = {
  "chevron-down": "caret",
  "chevron-right": "next",
  external: "popout",
  cross: "close",
} as const;

export type GlyphName = (typeof DRAWN)[number] | keyof typeof ALIAS | "seal" | "dash";

interface GlyphProps {
  name: GlyphName;
  /** Box size in px; the Terminal's default is 10. */
  size?: number;
  className?: string;
  /** A glyph is decorative unless it carries the only label. */
  title?: string;
}

export function Glyph({ name, size = 10, className, title }: GlyphProps) {
  // The sealed state is a mark, not an icon: the seal dot (shapes in components.css).
  if (name === "seal") return <span className={`seal-mark${className ? ` ${className}` : ""}`} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} />;
  // An empty slot that keeps its place, e.g. a sort arrow before the column is sorted.
  const drawn = name === "dash" ? "sort-down" : name in ALIAS ? ALIAS[name as keyof typeof ALIAS] : name;
  return (
    <i
      className={`glyph glyph-${drawn}${name === "dash" ? " glyph--idle" : ""}${className ? ` ${className}` : ""}`}
      style={size === 10 ? undefined : { width: size, height: size }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    />
  );
}
