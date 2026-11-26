// The logo registry and chip, declared at the site's boundary like the world's mounts (world.d.ts): the site never
// compiles packages/world's sources. Written by hand from packages/world/src/kit/logos/registry.ts and chip.ts; a
// change to a logo's id or to the chip's options is made here too.

declare module "@world/kit/logos" {
  export type LogoId =
    | "bnbchain"
    | "greenfield"
    | "agentstudio"
    | "flap"
    | "openfour"
    | "cmc"
    | "atlas"
    | "cournot"
    | "kalshi"
    | "electronx"
    | "livingbrain"
    | "aws"
    | "cloudflare";

  export interface LogoSpec {
    id: LogoId;
    /** The name a reader knows it by: the chip's accessible name. */
    name: string;
    /** The owner's own page, opened in a new tab. */
    href: string;
    /** The owner's file, served beside the registry. */
    src: string;
    /** The file's own size, so a chip has its width before the image decodes. */
    w: number;
    h: number;
    /** The ground the file is drawn for: a 'dark' file sits on a dark plate inside the white chip. */
    ground: "light" | "dark";
    /** A height factor, so wordmarks, symbols and lockups read at one weight. */
    optical: number;
    /** Words set beside the logo (Agent Studio, OpenFour). */
    caption?: string;
  }

  export const LOGOS: Record<LogoId, LogoSpec>;
  export const LOGO_NOTE: string;

  export interface ChipOptions {
    caption?: string;
    size?: number;
    link?: boolean;
    href?: string;
    className?: string;
  }
  export function logoChip(ids: LogoId | LogoId[], opts?: ChipOptions): HTMLElement;
  export function chipsReady(el: ParentNode, ms?: number): Promise<void>;
  export function preloadLogos(ids?: LogoId[]): Promise<void>;
}
