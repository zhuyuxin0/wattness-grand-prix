// A sponsor's mark at the right end of a tab's row, in the side panel and the phone menu: one small monochrome mark,
// cut from the logo registry's own file (packages/world/src/kit/logos) and drawn as a CSS mask over it in the row's
// ink, so it follows the row at rest, under the pointer and on the open tab. Each mark shows the file's symbol where
// the file sets one beside its words. The files are referenced by path, never imported as modules: the 3D package
// loads only by dynamic import from a page (test/world-tabs.test.mjs). test/sponsor-marks.test.mjs holds every name,
// file and size here to the registry's.
import type { LogoId } from "@world/kit/logos";
import type { PanelTab } from "./tabs";

export interface SponsorMark {
  id: LogoId;
  /** The registry's name: the mark's title and accessible name, as "Built with <name>". */
  name: string;
  /** The registry's own file. */
  src: string;
  /** The file's size, as the registry gives it (an SVG's view box, a PNG's pixels). */
  w: number;
  h: number;
  /** The part of the file the mark shows, in the file's units: x, y, width, height. */
  crop: readonly [number, number, number, number];
  /** The mark's height in px: about 14, less for a wide shape, so the marks read at one weight. */
  px: number;
}

// Vite rewrites a new URL('./file', import.meta.url) to the built file's URL only when the path is a literal
const ATLAS = new URL("../../../packages/world/src/kit/logos/atlas.svg", import.meta.url).href;
const BNBCHAIN = new URL("../../../packages/world/src/kit/logos/bnbchain.svg", import.meta.url).href;
const CLOUDFLARE = new URL("../../../packages/world/src/kit/logos/cloudflare.png", import.meta.url).href;
const COINMARKETCAP = new URL("../../../packages/world/src/kit/logos/coinmarketcap.svg", import.meta.url).href;
const COURNOT = new URL("../../../packages/world/src/kit/logos/cournot.svg", import.meta.url).href;
const ELECTRONX = new URL("../../../packages/world/src/kit/logos/electronx.png", import.meta.url).href;
const FLAP = new URL("../../../packages/world/src/kit/logos/flap.svg", import.meta.url).href;
const FOURMEME_MARK = new URL("../../../packages/world/src/kit/logos/fourmeme-mark.svg", import.meta.url).href;
const GREENFIELD = new URL("../../../packages/world/src/kit/logos/greenfield.svg", import.meta.url).href;
const LIVINGBRAIN = new URL("../../../packages/world/src/kit/logos/livingbrain.svg", import.meta.url).href;

const mark = (m: SponsorMark) => m;

export const MARKS: Partial<Record<LogoId, SponsorMark>> = {
  // BNB Chain's lockup: its symbol, left of the words
  bnbchain: mark({ id: "bnbchain", name: "BNB Chain", src: BNBCHAIN, w: 319, h: 56, crop: [0, 0, 48.5, 56], px: 14 }),
  // Agent Studio wears BNB Chain's logo (SOURCES.md)
  agentstudio: mark({ id: "agentstudio", name: "BNB Agent Studio", src: BNBCHAIN, w: 319, h: 56, crop: [0, 0, 48.5, 56], px: 14 }),
  greenfield: mark({ id: "greenfield", name: "BNB Greenfield", src: GREENFIELD, w: 204, h: 24, crop: [0, 0, 20.9, 24], px: 14 }),
  // the grid of dots, left of the words
  cournot: mark({ id: "cournot", name: "Cournot", src: COURNOT, w: 251, h: 73, crop: [0, 15, 33, 43], px: 13 }),
  // the brain, left of the words
  livingbrain: mark({ id: "livingbrain", name: "Living Brain", src: LIVINGBRAIN, w: 1415, h: 240, crop: [0, 0, 237, 240], px: 14 }),
  // ElectronX's logo whole: its name and the X whose long legs reach past the words, as ElectronX draws it
  electronx: mark({ id: "electronx", name: "ElectronX", src: ELECTRONX, w: 473, h: 260, crop: [0, 0, 473, 260], px: 20 }),
  // the wings, left of the words
  flap: mark({ id: "flap", name: "Flap", src: FLAP, w: 255, h: 43.7143, crop: [0, 0, 52.4, 43.7143], px: 12 }),
  // Four.meme's square mark, whole
  openfour: mark({ id: "openfour", name: "OpenFour by Four.meme", src: FOURMEME_MARK, w: 24, h: 25, crop: [0, 0, 24, 25], px: 14 }),
  // the ring, left of the words
  cmc: mark({ id: "cmc", name: "CoinMarketCap", src: COINMARKETCAP, w: 239, h: 41, crop: [0, 0, 40.5, 41], px: 13 }),
  // the A, left of the words
  atlas: mark({ id: "atlas", name: "Atlas", src: ATLAS, w: 166.78, h: 42, crop: [0, 0, 48, 42], px: 13 }),
  // the cloud, above the words
  cloudflare: mark({ id: "cloudflare", name: "Cloudflare", src: CLOUDFLARE, w: 387, h: 128, crop: [193.5, 0, 186, 84.5], px: 9 }),
};

/** A tab's sponsors, in the order its entry names them. */
export function sponsorsOf(tab: Pick<PanelTab, "sponsor">): LogoId[] {
  const s = tab.sponsor;
  return s === undefined ? [] : Array.isArray(s) ? s : [s];
}

/** The marks a tab's row shows: one per sponsor that has a mark here. */
export function marksOf(tab: Pick<PanelTab, "sponsor">): SponsorMark[] {
  return sponsorsOf(tab).flatMap((id) => {
    const m = MARKS[id];
    return m ? [m] : [];
  });
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

/** The mark's box and its mask: the crop scaled to the mark's height, the rest of the file outside the box. */
export function markStyle(m: SponsorMark): Record<string, string> {
  const [x, y, w, h] = m.crop;
  const k = m.px / h;
  const image = `url("${m.src}")`;
  const size = `${px(m.w * k)} ${px(m.h * k)}`;
  const position = `${px(-x * k)} ${px(-y * k)}`;
  return {
    width: px(w * k),
    height: px(m.px),
    WebkitMaskImage: image,
    maskImage: image,
    WebkitMaskSize: size,
    maskSize: size,
    WebkitMaskPosition: position,
    maskPosition: position,
  };
}
