// One registry of the owners' logos, as each owner publishes them (sources, hashes and every edit in SOURCES.md).
// Every chip on the site and in the 3D reads its file, name and link from here, so there is one set and one look.
// The files are drawn for a light ground (the white chip), except two drawn for a dark one, each set on a dark plate
// inside the chip: ElectronX's, which its site publishes in white only, and Flap's in its Signal Lime.

export type LogoId =
  | 'bnbchain'
  | 'greenfield'
  | 'agentstudio'
  | 'flap'
  | 'openfour'
  | 'cmc'
  | 'atlas'
  | 'cournot'
  | 'kalshi'
  | 'electronx'
  | 'livingbrain'
  | 'aws'
  | 'cloudflare';

export interface LogoSpec {
  id: LogoId;
  /** The name a reader knows it by: the chip's accessible name. */
  name: string;
  /** The owner's own page, opened in a new tab. */
  href: string;
  /** The owner's file, served beside this module. */
  src: string;
  /** The file's own size (an SVG's view box), so a chip has its width before the image decodes. */
  w: number;
  h: number;
  /** The ground the file is drawn for. A 'dark' file sits on a dark plate inside the white chip. */
  ground: 'light' | 'dark';
  /** A height factor, so a wordmark, a symbol and a lockup read at one weight at the same chip size. */
  optical: number;
  /** Words set beside the logo, for a product that wears its owner's logo (Agent Studio, OpenFour). */
  caption?: string;
}

// Vite rewrites a new URL('./file', import.meta.url) to the built file's URL only when the path is a literal
const AMAZON = new URL('./amazon.png', import.meta.url).href;
const ATLAS = new URL('./atlas.svg', import.meta.url).href;
const BNBCHAIN = new URL('./bnbchain.svg', import.meta.url).href;
const CLOUDFLARE = new URL('./cloudflare.png', import.meta.url).href;
const COINMARKETCAP = new URL('./coinmarketcap.svg', import.meta.url).href;
const COURNOT = new URL('./cournot.svg', import.meta.url).href;
const ELECTRONX = new URL('./electronx.png', import.meta.url).href;
const FLAP = new URL('./flap.svg', import.meta.url).href;
const FOURMEME_MARK = new URL('./fourmeme-mark.svg', import.meta.url).href;
const GREENFIELD = new URL('./greenfield.svg', import.meta.url).href;
const KALSHI = new URL('./kalshi.svg', import.meta.url).href;
const LIVINGBRAIN = new URL('./livingbrain.svg', import.meta.url).href;

export const LOGOS: Record<LogoId, LogoSpec> = {
  bnbchain: { id: 'bnbchain', name: 'BNB Chain', href: 'https://www.bnbchain.org/en', src: BNBCHAIN, w: 319, h: 56, ground: 'light', optical: 1 },
  greenfield: { id: 'greenfield', name: 'BNB Greenfield', href: 'https://greenfield.bnbchain.org/en', src: GREENFIELD, w: 204, h: 24, ground: 'light', optical: 0.8 },
  agentstudio: {
    id: 'agentstudio', name: 'BNB Agent Studio', href: 'https://docs.bnbchain.org/developer-kit/bnbchain-studio/quickstart/',
    src: BNBCHAIN, w: 319, h: 56, ground: 'light', optical: 1, caption: 'Agent Studio',
  },
  flap: { id: 'flap', name: 'Flap', href: 'https://flap.sh/', src: FLAP, w: 255, h: 43.7143, ground: 'dark', optical: 1.1 },
  openfour: { id: 'openfour', name: 'OpenFour by Four.meme', href: 'https://four.meme/', src: FOURMEME_MARK, w: 24, h: 25, ground: 'light', optical: 1.15, caption: 'OpenFour' },
  cmc: { id: 'cmc', name: 'CoinMarketCap', href: 'https://coinmarketcap.com/', src: COINMARKETCAP, w: 239, h: 41, ground: 'light', optical: 1.05 },
  atlas: { id: 'atlas', name: 'Atlas', href: 'https://atlasoracle.io/', src: ATLAS, w: 166.78, h: 42, ground: 'light', optical: 1.1 },
  cournot: { id: 'cournot', name: 'Cournot', href: 'https://cournot.ai/', src: COURNOT, w: 251, h: 73, ground: 'light', optical: 1.25 },
  kalshi: { id: 'kalshi', name: 'Kalshi', href: 'https://kalshi.com/', src: KALSHI, w: 51, h: 15, ground: 'light', optical: 0.95 },
  electronx: { id: 'electronx', name: 'ElectronX', href: 'https://www.electronx.com/', src: ELECTRONX, w: 473, h: 260, ground: 'dark', optical: 1.5 },
  livingbrain: { id: 'livingbrain', name: 'Living Brain', href: 'https://livingbrain.com/', src: LIVINGBRAIN, w: 1415, h: 240, ground: 'light', optical: 1.05 },
  aws: { id: 'aws', name: 'Amazon Web Services', href: 'https://aws.amazon.com/', src: AMAZON, w: 423, h: 128, ground: 'light', optical: 1.25 },
  cloudflare: { id: 'cloudflare', name: 'Cloudflare', href: 'https://www.cloudflare.com/', src: CLOUDFLARE, w: 387, h: 128, ground: 'light', optical: 1.35 },
};

/** The line every page that shows these logos carries. */
export const LOGO_NOTE = 'Logos are trademarks of their owners, shown only to identify them.';
