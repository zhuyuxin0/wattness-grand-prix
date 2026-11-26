// The launch card's replay: each launch on our OpenFour deployment as a Four.meme user follows a token, one frame per
// real BSC testnet transaction (chain 97) in the order it ran: the create, every buy and sell on the bonding curve,
// the graduation refused without a sealed record, the record bound, the graduation granted. Every figure is copied
// from the transaction's receipt (its Transfer and TradeExecuted logs, its status), and the page reads each receipt
// again in the visitor's browser (chain.ts: checkReplay) before it calls the replay verified.
// test/markets.test.mjs holds the hashes to modules/openfour/deployments/bsc-testnet.json and
// packages/world/src/stations/stack/integrations.json and the figures to one another.
//
// LAUNCHES takes one entry per launch, and the card offers a choice between them. A launch's create, buy, sell and
// migrate records in modules/openfour/submission/tokens.json (action, txHash, blockNumber, time.unix, status, the
// trade's amounts, the bound record, the pool) map one to one onto its frames; the test holds each to its record.
//
// No imports: Node runs this file directly in the tests.

export type Hex = `0x${string}`;

export type FrameKind = "create" | "buy" | "sell" | "refused" | "bind" | "graduated";

/** OpenFour's vault phases as the card names them. */
export type Phase = "Trading" | "Sold out" | "Graduated";

/** A move of the launch's token in the receipt (a Transfer log); from the zero address is the mint. */
export interface Move {
  from: Hex;
  to: Hex;
  /** In the token's smallest unit, 18 decimals, as a decimal string. */
  amount: string;
}

export interface Trade {
  trader: Hex;
  /** Tokens bought or sold on the curve. */
  tokens: string;
  /** WBNB to the curve (a buy) or from it (a sell). */
  curve: string;
  /** WBNB the trader paid (a buy) or got (a sell), fees included. */
  traderQuote: string;
  /** Protocol and developer fees, in WBNB. */
  fees: string;
}

export interface Frame {
  kind: FrameKind;
  hash: Hex;
  block: number;
  /** Unix seconds of its block. */
  time: number;
  /** Its receipt's status: false only for the refused graduation. */
  ok: boolean;
  moves: Move[];
  trade?: Trade;
  /** The vault after the frame: tokens sold on the curve and WBNB raised, from the trade's own log. */
  sold: string;
  raised: string;
  phase: Phase;
  /** The refused graduation: the module's custom error and its arguments, from the revert data. */
  refused?: { error: "EvidenceMissing"; agent: Hex; scope: Hex; data: Hex };
  /** The binding: the agent's sealed record, as GateRecord holds it. */
  bound?: { key: Hex; od: number; root: Hex; leafCount: number; codeHash: Hex; committedAt: number; gate: number; recordBlock: number };
  /** The graduation: what went into the pair, and its LP tokens. */
  graduated?: { pair: Hex; tokens: string; quote: string; lpBurned: string; lpMinimum: string };
}

export interface LaunchReplay {
  id: string;
  name: string;
  symbol: string;
  token: Hex;
  vault: Hex;
  migrateModule: Hex;
  pair: Hex;
  creator: Hex;
  /** The agent whose sealed record the launch needs. */
  agent: Hex;
  scopeLabel: string;
  /** The earliest operating day the launch accepts, and the fewest batteries. */
  minOd: number;
  minLeafCount: number;
  quote: { symbol: "WBNB"; address: Hex };
  maxSupply: string;
  saleAmount: string;
  raiseAmount: string;
  frames: Frame[];
  /** The trader's own transactions before a buy (wrapping tBNB, approving Core): in Check it, not frames. */
  setup: { label: string; hash: Hex; block: number }[];
}

export const ZERO: Hex = "0x0000000000000000000000000000000000000000";
export const DEAD: Hex = "0x000000000000000000000000000000000000dEaD";

const E18 = "000000000000000000";

/** Grand Prix Planner (PLNR), the first launch: created, sold out in one buy, refused, bound, graduated on Nov 25. */
export const PLNR: LaunchReplay = {
  id: "plnr",
  name: "Grand Prix Planner",
  symbol: "PLNR",
  token: "0xB1e792b2C6Bf7Ae7A1D972af313442039422ef14",
  vault: "0xD5AfAbB7B4C97B7a46a5282Ce44d4619EB3bc300",
  migrateModule: "0xD23E368C50b8F5E8624Adfc30cdE2D4dE8E87735",
  pair: "0xe54cDdE2d4A28b0131C5Dc6b9E5Afb20701680Ee",
  creator: "0x749A444AC6220539D8b5E9D8E21232ff70C4C79D",
  agent: "0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8",
  scopeLabel: "gate-record/ercot-da-energy",
  minOd: 20261126,
  minLeafCount: 300,
  quote: { symbol: "WBNB", address: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd" },
  maxSupply: `10000000000${E18}`,
  saleAmount: `8000000000${E18}`,
  raiseAmount: "100000000000000000",
  frames: [
    {
      kind: "create",
      hash: "0x875372271c9dde0ecdb3703dec11a7fd88108d68ce80bde84241ab4411ecac6f",
      block: 144842416,
      time: 1795634211,
      ok: true,
      moves: [{ from: ZERO, to: "0xD5AfAbB7B4C97B7a46a5282Ce44d4619EB3bc300", amount: `10000000000${E18}` }],
      sold: "0",
      raised: "0",
      phase: "Trading",
    },
    {
      kind: "buy",
      hash: "0x17d7940454fc2e05e39803520582b3faadbdda7fd6aab920b2880ec29df73a56",
      block: 144842456,
      time: 1795634229,
      ok: true,
      moves: [{ from: "0xD5AfAbB7B4C97B7a46a5282Ce44d4619EB3bc300", to: "0x749A444AC6220539D8b5E9D8E21232ff70C4C79D", amount: `8000000000${E18}` }],
      trade: {
        trader: "0x749A444AC6220539D8b5E9D8E21232ff70C4C79D",
        tokens: `8000000000${E18}`,
        curve: "99999999999999998",
        traderQuote: "100999999999999996",
        fees: "999999999999998",
      },
      sold: `8000000000${E18}`,
      raised: "99999999999999998",
      phase: "Sold out",
    },
    {
      kind: "refused",
      hash: "0x219f25a2b86a8a73595911f40dd81f072655bd6711fdd4eb6b8108b6a733686e",
      block: 144842485,
      time: 1795634242,
      ok: false,
      moves: [],
      sold: `8000000000${E18}`,
      raised: "99999999999999998",
      phase: "Sold out",
      refused: {
        error: "EvidenceMissing",
        agent: "0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8",
        scope: "0x4ace28d1c5fc87449d9960b5d139d6667e75a42fad1082c63dc9ba3f08586bb9",
        data: "0x28cb3d31000000000000000000000000fa22c29c4c3d975fcc617d899b1b695eff2d94b84ace28d1c5fc87449d9960b5d139d6667e75a42fad1082c63dc9ba3f08586bb9",
      },
    },
    {
      kind: "bind",
      hash: "0xd100cfa2402baaeec7de4545deedec2f72d238bbb53ec3fc34753d93718a1128",
      block: 144842524,
      time: 1795634260,
      ok: true,
      moves: [],
      sold: `8000000000${E18}`,
      raised: "99999999999999998",
      phase: "Sold out",
      bound: {
        key: "0xafee502d7b63d89f48434a1e9c1b73c949ca08f7189f68be54e30f2d81fdedf9",
        od: 20261126,
        root: "0xf4d4002344fe98be0f64870221e5cc0b5e1d6111c05fe46c0131763d725bbce7",
        leafCount: 316,
        codeHash: "0xb83af42225f0ac312b05c5dd269f6c35502ec6b4000000000000000000000000",
        committedAt: 1795619820,
        gate: 1795622400,
        recordBlock: 144810495,
      },
    },
    {
      kind: "graduated",
      hash: "0xc549f6e5a6598ba308e6ecb837cf0da2a6fa23c1d72a6e40065df4c585af5330",
      block: 144842547,
      time: 1795634271,
      ok: true,
      moves: [{ from: "0xD5AfAbB7B4C97B7a46a5282Ce44d4619EB3bc300", to: "0xe54cDdE2d4A28b0131C5Dc6b9E5Afb20701680Ee", amount: `2000000000${E18}` }],
      sold: `8000000000${E18}`,
      raised: "99999999999999998",
      phase: "Graduated",
      graduated: {
        pair: "0xe54cDdE2d4A28b0131C5Dc6b9E5Afb20701680Ee",
        tokens: `2000000000${E18}`,
        quote: "99999999999999998",
        lpBurned: "14142135623730950345595",
        lpMinimum: "1000",
      },
    },
  ],
  setup: [
    { label: "Wrap 0.12 tBNB into WBNB", hash: "0x03058afbded0dd16544dfc9e50141bdde73867dad454b6e5b9c156041d74418e", block: 144842446 },
    { label: "Approve Core to spend WBNB", hash: "0x0f8d4103585f9e51447e851589a1196c1b837cddc466c1d001545d41cfac2788", block: 144842450 },
  ],
};

/**
 * Grand Prix Planner 27 Nov (PLNR27), the second launch, on Nov 26 CT: a buy, a sale back to the curve, a buy that sold
 * it out, the graduation refused, the sealed plan for Nov 27 bound, graduated.
 */
export const PLNR27: LaunchReplay = {
  id: "plnr27",
  name: "Grand Prix Planner 27 Nov",
  symbol: "PLNR27",
  token: "0x027C1A8D15ceb3048F5EC787D5e1E64B1043cE47",
  vault: "0x7bb1751A4f74215C6d66913Ab99c7aBdef5e7330",
  migrateModule: "0xF3Cb2A05dF23A4464A8A7606229e150552b71871",
  pair: "0x28Fb374c51B89c7D58c5849a478339BFda640879",
  creator: "0x749A444AC6220539D8b5E9D8E21232ff70C4C79D",
  agent: "0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8",
  scopeLabel: "gate-record/ercot-da-energy",
  minOd: 20261127,
  minLeafCount: 300,
  quote: { symbol: "WBNB", address: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd" },
  maxSupply: `10000000000${E18}`,
  saleAmount: `8000000000${E18}`,
  raiseAmount: "100000000000000000",
  frames: [
    {
      kind: "create",
      hash: "0x26ab9fbc2def498e98436ee1754700eaddcd5c6d3a3ea54a83a7e9562d546323",
      block: 145021087,
      time: 1795714786,
      ok: true,
      moves: [{ from: ZERO, to: "0x7bb1751A4f74215C6d66913Ab99c7aBdef5e7330", amount: `10000000000${E18}` }],
      sold: "0",
      raised: "0",
      phase: "Trading",
    },
    {
      kind: "buy",
      hash: "0x65bd6eba352db36dd2054f307330352fca71ce4468e8fc8778f9d21b3f2268b5",
      block: 145021141,
      time: 1795714811,
      ok: true,
      moves: [{ from: "0x7bb1751A4f74215C6d66913Ab99c7aBdef5e7330", to: "0x749A444AC6220539D8b5E9D8E21232ff70C4C79D", amount: `1000000000${E18}` }],
      trade: {
        trader: "0x749A444AC6220539D8b5E9D8E21232ff70C4C79D",
        tokens: `1000000000${E18}`,
        curve: "3516174402250351",
        traderQuote: "3551336146272853",
        fees: "35161744022502",
      },
      sold: `1000000000${E18}`,
      raised: "3516174402250351",
      phase: "Trading",
    },
    {
      kind: "sell",
      hash: "0x1e420c74807f518ea5a7ce5831add11c13b51a0d4cd06b20c6cc3eeb62f6fd56",
      block: 145021178,
      time: 1795714827,
      ok: true,
      moves: [{ from: "0x749A444AC6220539D8b5E9D8E21232ff70C4C79D", to: "0x7bb1751A4f74215C6d66913Ab99c7aBdef5e7330", amount: `900000000${E18}` }],
      trade: {
        trader: "0x749A444AC6220539D8b5E9D8E21232ff70C4C79D",
        tokens: `900000000${E18}`,
        curve: "3194299804593599",
        traderQuote: "3162356806547665",
        fees: "31942998045934",
      },
      sold: `100000000${E18}`,
      raised: "321874597656752",
      phase: "Trading",
    },
    {
      kind: "buy",
      hash: "0xdd809ed51df954bd0e3f4aa931650ac6a187f20072cfeb22ee05ecd8224d9467",
      block: 145021216,
      time: 1795714844,
      ok: true,
      moves: [{ from: "0x7bb1751A4f74215C6d66913Ab99c7aBdef5e7330", to: "0x749A444AC6220539D8b5E9D8E21232ff70C4C79D", amount: `7900000000${E18}` }],
      trade: {
        trader: "0x749A444AC6220539D8b5E9D8E21232ff70C4C79D",
        tokens: `7900000000${E18}`,
        curve: "99678125402343246",
        traderQuote: "100674906656366678",
        fees: "996781254023432",
      },
      sold: `8000000000${E18}`,
      raised: "99999999999999998",
      phase: "Sold out",
    },
    {
      kind: "refused",
      hash: "0xce84183e3eba32a691dd66dad351c1eba0541df7d64c46a7471cfe222891eeaf",
      block: 145021247,
      time: 1795714858,
      ok: false,
      moves: [],
      sold: `8000000000${E18}`,
      raised: "99999999999999998",
      phase: "Sold out",
      refused: {
        error: "EvidenceMissing",
        agent: "0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8",
        scope: "0x4ace28d1c5fc87449d9960b5d139d6667e75a42fad1082c63dc9ba3f08586bb9",
        data: "0x28cb3d31000000000000000000000000fa22c29c4c3d975fcc617d899b1b695eff2d94b84ace28d1c5fc87449d9960b5d139d6667e75a42fad1082c63dc9ba3f08586bb9",
      },
    },
    {
      kind: "bind",
      hash: "0xd7be1172ffe756dc26175c9b6520fcdfe41d85a7b190cd571bffa851ed10d515",
      block: 145021288,
      time: 1795714877,
      ok: true,
      moves: [],
      sold: `8000000000${E18}`,
      raised: "99999999999999998",
      phase: "Sold out",
      bound: {
        key: "0x24f59168bacf7252e2fc846a70c3a3b464eb3d15dd1a329a352d505c920bcf99",
        od: 20261127,
        root: "0x3cd800432f3596e13c9f169348630c0fb69192501cf448a4859dd3104e9e59be",
        leafCount: 316,
        codeHash: "0x586e47c2a156389974a4294359c3f16ad34eac0b000000000000000000000000",
        committedAt: 1795702216,
        gate: 1795708800,
        recordBlock: 144993233,
      },
    },
    {
      kind: "graduated",
      hash: "0x9d2b5112d35700f4fe274fcc70dc537ddfb9755d4f891d4e4e26d7ee133b6720",
      block: 145021313,
      time: 1795714888,
      ok: true,
      moves: [{ from: "0x7bb1751A4f74215C6d66913Ab99c7aBdef5e7330", to: "0x28Fb374c51B89c7D58c5849a478339BFda640879", amount: `2000000000${E18}` }],
      sold: `8000000000${E18}`,
      raised: "99999999999999998",
      phase: "Graduated",
      graduated: {
        pair: "0x28Fb374c51B89c7D58c5849a478339BFda640879",
        tokens: `2000000000${E18}`,
        quote: "99999999999999998",
        lpBurned: "14142135623730950345595",
        lpMinimum: "1000",
      },
    },
  ],
  setup: [
    { label: "Approve Core to take PLNR27 back", hash: "0x0dbda5e90174546b578d065b830bdb690ffc37b89eff2b93a23bbc6c2f682abd", block: 145021174 },
    { label: "Wrap tBNB into WBNB", hash: "0x0f15116a544404d6cd503522eab44920806fe5624b7ae711d10e7d07e8e1cb5b", block: 145021207 },
    { label: "Approve Core to spend WBNB", hash: "0xefe8853055d68f774bffe01e674f6467fb45d6608f37d804a5ad238518636252", block: 145021211 },
  ],
};

/** Every launch the card can replay: the newest opens, with every route a launch can take. */
export const LAUNCHES: readonly LaunchReplay[] = [PLNR27, PLNR];

// ---------------------------------------------------------------- the state at a frame

export interface Holder {
  address: Hex;
  amount: bigint;
  /** What the address is to the launch. */
  role: "curve" | "pair" | "creator" | "trader" | "burn";
}

export interface FrameState {
  frame: Frame;
  index: number;
  sold: bigint;
  raised: bigint;
  /** Tokens sold over the curve's sale amount, 0 to 1. */
  progress: number;
  holders: Holder[];
  phase: Phase;
  /** The sealed record bound by this frame, if any. */
  bound: Frame["bound"] | null;
  /** Whether a graduation has been refused by this frame. */
  refusedBefore: boolean;
  graduated: Frame["graduated"] | null;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function roleOf(l: LaunchReplay, address: Hex): Holder["role"] {
  if (same(address, l.vault)) return "curve";
  if (same(address, l.pair)) return "pair";
  if (same(address, DEAD)) return "burn";
  if (same(address, l.creator)) return "creator";
  return "trader";
}

/** The launch after its frames up to `index`: balances from the token's moves, the vault from the last trade. */
export function stateAt(l: LaunchReplay, index: number): FrameState {
  const i = Math.max(0, Math.min(index, l.frames.length - 1));
  const balances = new Map<string, { address: Hex; amount: bigint }>();
  let bound: Frame["bound"] | null = null;
  let graduated: Frame["graduated"] | null = null;
  let refusedBefore = false;
  for (const f of l.frames.slice(0, i + 1)) {
    for (const m of f.moves) {
      const amount = BigInt(m.amount);
      if (!same(m.from, ZERO)) {
        const k = m.from.toLowerCase();
        const b = balances.get(k) ?? { address: m.from, amount: 0n };
        b.amount -= amount;
        balances.set(k, b);
      }
      const k = m.to.toLowerCase();
      const b = balances.get(k) ?? { address: m.to, amount: 0n };
      b.amount += amount;
      balances.set(k, b);
    }
    if (f.bound) bound = f.bound;
    if (f.graduated) graduated = f.graduated;
    if (f.kind === "refused") refusedBefore = true;
  }
  const frame = l.frames[i]!;
  const sold = BigInt(frame.sold);
  const sale = BigInt(l.saleAmount);
  const holders = [...balances.values()]
    .filter((b) => b.amount > 0n)
    .map((b) => ({ address: b.address, amount: b.amount, role: roleOf(l, b.address) }))
    .sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1));
  return {
    frame,
    index: i,
    sold,
    raised: BigInt(frame.raised),
    progress: sale === 0n ? 0 : Number((sold * 10_000n) / sale) / 10_000,
    holders,
    phase: frame.phase,
    bound,
    refusedBefore,
    graduated,
  };
}
