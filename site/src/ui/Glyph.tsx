// Every icon on the site is drawn here, so none is ever a typed character.
const PATHS = {
  copy: "M5.5 5.5V3.25c0-.41.34-.75.75-.75h6.5c.41 0 .75.34.75.75v6.5c0 .41-.34.75-.75.75H10.5M3.25 5.5h6.5c.41 0 .75.34.75.75v6.5c0 .41-.34.75-.75.75h-6.5a.75.75 0 0 1-.75-.75v-6.5c0-.41.34-.75.75-.75Z",
  check: "M3 8.5 6.5 12 13 4.5",
  cross: "M4 4l8 8M12 4l-8 8",
  external: "M9 3h4v4M13 3 7.5 8.5M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5",
  sun: "M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06",
  moon: "M13.5 9.6A5.5 5.5 0 0 1 6.4 2.5a5.5 5.5 0 1 0 7.1 7.1Z",
  "sort-up": "M8 12.5v-9M4.5 7 8 3.5 11.5 7",
  "sort-down": "M8 3.5v9M4.5 9 8 12.5 11.5 9",
  "chevron-right": "M6 3.5 10.5 8 6 12.5",
  "chevron-down": "M3.5 6 8 10.5 12.5 6",
  menu: "M2.5 4.5h11M2.5 8h11M2.5 11.5h11",
  seal: "M8 1.75 13.25 4v4c0 3-2.25 5.25-5.25 6.25C5 13.25 2.75 11 2.75 8V4L8 1.75ZM5.75 8l1.6 1.6L10.5 6.4",
  clock: "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM8 4.75V8l2.25 1.5",
  dash: "M4 8h8",
} as const;

export type GlyphName = keyof typeof PATHS;

interface GlyphProps {
  name: GlyphName;
  size?: number;
  className?: string;
  /** A glyph is decorative unless it carries the only label. */
  title?: string;
}

export function Glyph({ name, size = 16, className, title }: GlyphProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
