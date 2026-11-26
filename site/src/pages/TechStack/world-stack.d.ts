// The stack's words, declared at the site's boundary for the Tech Stack tab's
// plain list (packages/world/src/stations/stack/pieces.ts and the records
// beside it). As with src/world.d.ts, the site checks its own calls against
// these hand-written declarations and never compiles the package's sources.

declare module "@world/stations/stack/pieces" {
  /** A card's value: text parts, some in monospace, some linked out; a block part takes its own line. */
  export interface Part {
    t: string;
    mono?: boolean;
    href?: string;
    block?: boolean;
  }
  export type Row = [string, Part[]];

  /** A piece's card, as the stack shows it on hover: its role and its real integration. */
  export interface Card {
    id: string;
    caps: string;
    name: string;
    role: string;
    rows: Row[];
    link?: { text: string; href: string };
    /** The site tab that shows the piece (ROUTES). */
    route: string;
    routeLabel: string;
  }

  /** Each piece's site tab, by the package's tab ids. */
  export const ROUTES: Readonly<Record<string, string>>;
  export const PIECE_IDS: readonly string[];
  /** Each piece's label: its plain meaning, and its name where it has one. Reads the fleet's count from the frame data. */
  export function labels(d: unknown): Record<string, { plain: string; name?: string }>;
  /** Every piece's card from the frame data (d), the Greenfield record, the integrations record and the marks' URLs, at now (unix s). */
  export function cards(d: unknown, gf: unknown, tn: unknown, marks: Record<string, string>, now?: number | null): Record<string, Card>;
  /** A CT wall time ("2026-11-25 14:37:22 CT") as unix seconds. */
  export function ctUnix(s: string | null | undefined): number | null;
}

/** The stack's key card (dom.ts) and its rows (common.ts) in the stack's palette (space.ts), drawn in the page's own place. */
declare module "@world/stations/stack/dom" {
  export function keyCard(host: HTMLElement, spec: { title: string; rows: unknown[] }, theme: "dark" | "light"): HTMLElement;
}
declare module "@world/stations/stack/common" {
  export function keyRows(palette: unknown): unknown[];
}
declare module "@world/stations/stack/space" {
  export const PAL: { dark: unknown; light: unknown };
}

declare module "@world/stations/stack/integrations.json" {
  const value: { read_back?: { rpc?: string; at_ct?: string } } & Record<string, unknown>;
  export default value;
}

declare module "@world/stations/stack/greenfield-record.json" {
  const value: Record<string, unknown>;
  export default value;
}
