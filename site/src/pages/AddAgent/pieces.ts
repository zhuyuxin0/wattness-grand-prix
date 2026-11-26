import type { LogoId } from "@world/kit/logos";

// The stack an outside agent plugs into, as Add Your Agent lists it (Stack.tsx draws it): the pieces the Grand Prix's
// agents are built on, each with its owners' logos from the world package's registry and where the site shows it
// working. Each line says what the piece does in this build, as the README's sponsor sections state it. No model
// provider or agent framework is a piece: none has run here (test/add-agent-stack.test.mjs holds the list to that,
// to the registry and to the tabs). Plain data, so the test reads it directly.

/** One chip: one logo, or several in one glass. */
export interface StackChip {
  ids: LogoId[];
  /** Words beside a one-logo chip, as the 3D's labels set them. */
  caption?: string;
  /** The owners' names, shown until the logos load. */
  words: string;
}

/** Where a piece is shown: a tab of the site (its id in src/shell/tabs.ts), or a section of this page. */
export type StackSee = { tab: string } | { section: string; label: string };

/** A line of words, with code set apart. */
export type StackText = (string | { code: string })[];

export interface StackPiece {
  id: string;
  name: string;
  chips: StackChip[];
  text: StackText;
  see: StackSee[];
}

export const PIECES: StackPiece[] = [
  {
    id: "identity",
    name: "Identity",
    chips: [{ ids: ["bnbchain"], words: "BNB Chain" }],
    text: ["An ERC-8004 identity on BSC testnet, in the registry where the Grand Prix's seven agents hold theirs."],
    see: [{ tab: "agent-ids" }],
  },
  {
    id: "hosting",
    name: "Hosting",
    chips: [
      { ids: ["agentstudio"], words: "BNB Agent Studio" },
      { ids: ["aws"], caption: "AgentCore", words: "Amazon Bedrock AgentCore" },
    ],
    text: [
      "BNB Agent Studio's managed hosting deploys an agent to Amazon Bedrock AgentCore. The Grand Prix's evaluator was deployed there and served paid ERC-8183 jobs from it.",
    ],
    see: [{ tab: "agent-ids" }],
  },
  {
    id: "seal",
    name: "The seal",
    chips: [{ ids: ["bnbchain"], words: "BNB Chain" }],
    text: [
      "One commit to GateRecord on BNB Smart Chain before the 10:00 CT gate, keyed by your agent's wallet, so its plans sit beside these and never collide with them.",
    ],
    see: [{ section: "ag-match", label: "Three Things to Match" }],
  },
  {
    id: "files",
    name: "Files",
    chips: [{ ids: ["greenfield"], words: "BNB Greenfield" }],
    text: ["The files a root covers, in a public bucket on BNB Greenfield testnet, each downloaded back and matched by its SHA-256."],
    see: [{ tab: "files" }],
  },
  {
    id: "memory",
    name: "Memory",
    chips: [{ ids: ["livingbrain"], words: "Living Brain" }],
    text: [
      "Living Brain keeps the agents' memory: brains on the build and on the Wattness Terminal, and reviewed lessons read back only as of a decision's cutoff, so memory shapes a review, never a sealed plan.",
    ],
    see: [{ tab: "memory" }],
  },
  {
    id: "prices",
    name: "Signed prices",
    chips: [{ ids: ["atlas", "cmc"], words: "Atlas and CoinMarketCap" }],
    text: [
      "Atlas's signed reports and CoinMarketCap's quotes decide what checking the plans costs: the rule values a BNB budget at the lower of their prices, holds back a reserve and counts the checks the rest pays for.",
    ],
    see: [{ tab: "prices" }],
  },
  {
    id: "odds",
    name: "Market odds",
    chips: [{ ids: ["cournot", "kalshi"], words: "Cournot and Kalshi" }],
    text: ["One probability read before the gate from Cournot's Intelligence Oracle, the odds from a Kalshi market, with the response's SHA-256 sealed in the plan."],
    see: [{ tab: "forecast" }],
  },
  {
    id: "launch",
    name: "Launch",
    chips: [
      { ids: ["flap"], words: "Flap" },
      { ids: ["openfour"], words: "OpenFour by Four.meme" },
    ],
    text: [
      "On BSC testnet, a Flap season token launches only once a named agent's plan is sealed before its gate, and an OpenFour launch graduates into a PancakeSwap V2 pool only once the agent's sealed record is bound to it.",
    ],
    see: [{ tab: "season" }, { tab: "launchpad" }],
  },
  {
    id: "edge",
    name: "Checks at the edge",
    chips: [{ ids: ["cloudflare"], caption: "Worker", words: "Cloudflare Worker" }],
    text: [
      "A Cloudflare Worker serves each sealed day's files from BNB Greenfield only after checking them against GateRecord, and answers ",
      { code: "/verify/<battery>" },
      " with the proof, record and gate checks.",
    ],
    see: [{ tab: "verify" }],
  },
];
