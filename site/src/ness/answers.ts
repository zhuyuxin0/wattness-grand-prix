// Ask Ness: prepared answers from the record. There is no model, server or
// sign-in behind them: each is written ahead, checked against the chain, the
// repository and the site's own data, and links to what it rests on. The panel
// says so in its first line.
//
// Rules for an answer (test/ness.test.mjs holds them):
//   - at most about 120 words, in short paragraphs; every figure with its day;
//   - times as {t:<unix seconds>}, which the panel shows in CT with the
//     reader's own beside it;
//   - every source a site tab, a file in this repository on GitHub, or a page
//     outside (BscScan, Greenfield, the sponsors' own);
//   - brainPage names the Living Brain page it comes from, as the Memory tab
//     keys pages ("<brain>:<slug>", public/data/memory/build-brain.json);
//   - the testnet tickers only in the Flap and OpenFour answers, and there
//     labeled as testnet.

export type GroupId = "sponsors" | "how" | "owners" | "developers";
export type SponsorId = "bnb" | "flap" | "openfour" | "cmc-atlas" | "cournot" | "living-brain";
/** The owners' logos, by the world package's registry ids (packages/world/src/kit/logos). */
export type LogoKey = "bnbchain" | "greenfield" | "agentstudio" | "cloudflare" | "flap" | "openfour" | "cmc" | "atlas" | "cournot" | "livingbrain";

/** One paragraph: prose (with {t:<unix>} times), a command to copy, or a short list. */
export type Block = string | { code: string } | { list: string[] };

export interface Source {
  /** What the link opens, in a few words. */
  label: string;
  /** A site path ("/seal"), or a full https address. */
  href: string;
}

export interface Answer {
  /** Stable and URL-safe: ?ask=<id> opens it. */
  id: string;
  group: GroupId;
  /** In the sponsor group: the sponsor it belongs to. */
  sponsor?: SponsorId;
  question: string;
  body: Block[];
  /** What it rests on, in the order to open them. */
  sources: Source[];
  /** The Living Brain page it comes from, keyed as the Memory tab keys pages. */
  brainPage?: string;
  /** Other words a visitor might search for. */
  keywords?: string[];
}

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: "sponsors", label: "By sponsor" },
  { id: "how", label: "How it works" },
  { id: "owners", label: "For battery owners and QSEs" },
  { id: "developers", label: "For developers" },
];

/** The questions a first visit starts from, above the groups. */
export const START_HERE: string[] = ["scoring-rule", "verify-yourself", "real-or-shadow"];

export const SPONSORS: { id: SponsorId; label: string; logos: LogoKey[] }[] = [
  { id: "bnb", label: "BNB Chain", logos: ["bnbchain"] },
  { id: "flap", label: "Flap", logos: ["flap"] },
  { id: "openfour", label: "OpenFour", logos: ["openfour"] },
  { id: "cmc-atlas", label: "CoinMarketCap × Atlas", logos: ["cmc", "atlas"] },
  { id: "cournot", label: "Cournot", logos: ["cournot"] },
  { id: "living-brain", label: "Living Brain", logos: ["livingbrain"] },
];

/** The brains as the Memory tab names them. */
export const BRAINS: Record<string, string> = {
  "grand-prix": "Grand Prix brain",
  "battery-review": "Desert Willow's review",
  terminal: "Terminal brain",
};

/** Each page an answer names, with its title in Living Brain (checked against build-brain.json). */
export const BRAIN_PAGES: Record<string, string> = {
  "grand-prix:gaterecord": "GateRecord",
  "grand-prix:wattness-grand-prix": "Wattness Grand Prix",
  "grand-prix:bnb-greenfield": "BNB Greenfield",
  "grand-prix:agent-studio": "Agent Studio",
  "grand-prix:browser-plan-verification": "Browser Plan Verification",
  "grand-prix:seal-tab": "Seal Tab",
  "grand-prix:seasonlauncher": "SeasonLauncher",
  "grand-prix:seasonvault": "SeasonVault",
  "grand-prix:season-days": "Season Days",
  "grand-prix:evidencegatedmigratemodule": "EvidenceGatedMigrateModule",
  "grand-prix:plnr-launch": "PLNR Launch",
  "grand-prix:openfour": "OpenFour",
  "grand-prix:evaluation-budget-decision": "Evaluation Budget Decision",
  "grand-prix:atlas": "Atlas",
  "grand-prix:prices-tab": "Prices Tab",
  "grand-prix:the-cournot-weather-rule": "The Cournot Weather Rule",
  "grand-prix:cournot-probability": "Cournot Probability",
  "grand-prix:packagesverifier": "Packages/Verifier",
  "grand-prix:living-brain": "Living Brain",
  "battery-review:dswl-ess-esr1": "DSWL_ESS_ESR1",
  "grand-prix:memory-tab": "Memory Tab",
  "grand-prix:plan-valuation": "Plan Valuation",
  "grand-prix:planner": "Planner",
  "grand-prix:planner-erc-8004-agent-2928": "Planner (ERC-8004 Agent 2928)",
  "grand-prix:write-once-record": "Write-once Record",
  "grand-prix:battery-plan-verification": "Battery Plan Verification",
  "grand-prix:verify-tab": "Verify Tab",
  "grand-prix:agent-plans": "Agent Plans",
  "grand-prix:gate-recordercot-da-energy": "Gate Record: ERCOT DA Energy",
  "grand-prix:ercot-batteries": "ERCOT Batteries",
  "grand-prix:desert-willow": "Desert Willow",
  "grand-prix:batteries-without-a-plan": "Batteries Without a Plan",
  "grand-prix:wattness-terminal": "Wattness Terminal",
  "grand-prix:three-plans-compared": "Three Plans Compared",
  "grand-prix:add-your-agent-tab": "Add Your Agent Tab",
  "grand-prix:run-it-yourself": "Run It Yourself",
  "grand-prix:wattness-grand-prix-repository": "Wattness Grand Prix Repository",
  "grand-prix:wattness-terminal-public-release": "Wattness Terminal Public Release",
};

// ---------------------------------------------------------------- where things are

const REPO = "https://github.com/zhuyuxin0/wattness-grand-prix";
const tree = (path: string) => `${REPO}/tree/main/${path}`;
const blob = (path: string) => `${REPO}/blob/main/${path}`;
const bsc = (tx: string) => `https://bscscan.com/tx/${tx}`;
const bscTest = (tx: string) => `https://testnet.bscscan.com/tx/${tx}`;
const GREENFIELD = "https://gnfd-testnet-sp3.nodereal.io/view/wattness-grand-prix-records";
const EDGE = "https://grand-prix-edge.wattness.workers.dev";

const SEAL_27 = bsc("0xd6ce6ebdd4f70dfe3aafae5fb76f014152f10a9f3a6c83d52362954cf853dbef");
const SEAL_27_TESTNET = bscTest("0x1ff8d7d8bceae913d50508600cd4304d4284930f8137d8f49348fee7f3a5d267");
const SEAL_26 = bsc("0xf1f214029ec71b4fd860408c53a98acf317683d3af9a147226c456063404c369");
const SOURCIFY = "https://repo.sourcify.dev/56/0x2922c68cE15EB3e83B7f43b136e981dDc4262876";
const GATE_RECORD_SOL = blob("contracts/contracts/GateRecord.sol");
const INDEX_26 = `${GREENFIELD}/od-20261126/manifest.json`;
const INDEX_27 = `${GREENFIELD}/od-20261127/manifest.json`;
const COURNOT_RESPONSE = `${GREENFIELD}/od-20261127/cournot/probability.json`;

const S = {
  seal: { label: "Seal", href: "/seal" },
  verify: { label: "Verify", href: "/verify" },
  verifyDswl: { label: "Verify Desert Willow's plan", href: "/verify/DSWL_ESS_ESR1" },
  files: { label: "Files", href: "/files" },
  agentIds: { label: "Agent IDs", href: "/agents/ids" },
  forecast: { label: "Forecast", href: "/agents/forecast" },
  hedge: { label: "Hedge", href: "/agents/hedge" },
  state: { label: "State of Charge", href: "/agents/state" },
  risk: { label: "Risk", href: "/agents/risk" },
  memory: { label: "Memory", href: "/agents/memory" },
  fleet: { label: "Fleet", href: "/fleet" },
  dswl: { label: "Desert Willow's plan", href: "/battery/DSWL_ESS_ESR1" },
  overview: { label: "Overview", href: "/overview" },
  season: { label: "Season", href: "/markets/season" },
  launchpad: { label: "Launchpad", href: "/markets/launchpad" },
  prices: { label: "Prices", href: "/markets/prices" },
  onePlan: { label: "ONE PLAN", href: "/markets/one-plan" },
  how: { label: "How It Works", href: "/about" },
  stack: { label: "Tech Stack", href: "/about/stack" },
  addAgent: { label: "Add Your Agent", href: "/about/agents" },
  seal27: { label: "The Nov 27 plans' seal on BSC mainnet", href: SEAL_27 },
  seal27Testnet: { label: "The Nov 27 record on BSC testnet", href: SEAL_27_TESTNET },
  seal26: { label: "The Nov 26 plans' seal on BSC mainnet", href: SEAL_26 },
  sourcify: { label: "GateRecord's verified source (Sourcify)", href: SOURCIFY },
  gateRecord: { label: "GateRecord.sol", href: GATE_RECORD_SOL },
  repo: { label: "The repository (MIT)", href: REPO },
  runIt: { label: "Run it", href: `${blob("README.md")}#run-it` },
  terminal: { label: "The Wattness Terminal", href: "https://wattness.tech" },
} satisfies Record<string, Source>;

// ---------------------------------------------------------------- the answers

export const ANSWERS: Answer[] = [
  // ---------------------------------------------------- BNB Chain
  {
    id: "bnb-chain",
    group: "sponsors",
    sponsor: "bnb",
    question: "How does the Grand Prix use BNB Chain?",
    body: [
      "BNB Smart Chain keeps the record. One transaction a day seals every plan under one root in GateRecord, on BSC mainnet and testnet. The contract computes ERCOT's 10:00 CT gate itself and refuses a late or a second record.",
      "BNB Greenfield keeps the files each root covers. Seven agents hold ERC-8004 identities on BSC testnet, the six roles of a plan registered through the BNB Agent SDK with gas sponsored by MegaFuel. They pay each other through ERC-8183 jobs, and BNB Agent Studio hosts two of them on AWS AgentCore.",
      "A Cloudflare Worker serves the sealed files only after checking them against GateRecord. The Flap and OpenFour launches on BSC testnet read the same record.",
    ],
    sources: [S.seal27, S.sourcify, S.seal, S.stack],
    brainPage: "grand-prix:gaterecord",
    keywords: ["bsc", "mainnet", "smart chain", "contract", "megafuel"],
  },
  {
    id: "bnb-criteria",
    group: "sponsors",
    sponsor: "bnb",
    question: "How does the Grand Prix meet the Developer Track's six criteria?",
    body: [
      {
        list: [
          "Design and usability: a 3D introduction to one operating day, then tabs in the pipeline's order, in light and dark, each figure with its source.",
          "Scalability: one root and one transaction a day for the whole fleet; the 316 Nov 27 plans took 172,209 gas.",
          "Innovation: the market's gate, computed and enforced on chain, so a track record cannot be chosen after the prices are known.",
          "Open source: MIT, one command to verify, and a second implementation of the leaf hash in Python's standard library.",
          "Integration: BSC mainnet and testnet, Greenfield, ERC-8004, ERC-8183, Agent Studio, MegaFuel, Atlas's feeds, Flap and OpenFour.",
          "Roadmap and business model: the open layer of the Wattness Terminal, the ERCOT data business it is built on.",
        ],
      },
    ],
    sources: [S.repo, S.runIt, S.seal27, S.how, S.terminal],
    brainPage: "grand-prix:wattness-grand-prix",
    keywords: ["judging", "developer track", "design", "scalability", "innovation", "open source", "integration", "roadmap", "business"],
  },
  {
    id: "bnb-greenfield",
    group: "sponsors",
    sponsor: "bnb",
    question: "What is stored on BNB Greenfield?",
    body: [
      "Every file a day's root covers, in the public bucket wattness-grand-prix-records on Greenfield testnet: the day's index, each battery's plan, its price scenarios and its input sync, the root, the salt and both chain receipts.",
      "That is 953 objects for the Nov 26 plans and 954 for Nov 27, Cournot's saved response among them, each downloaded back after upload and matched by its SHA-256.",
      "The Files tab lists a sealed day's files with each one's SHA-256 and public address.",
    ],
    sources: [
      { label: "The bucket on DCellar", href: "https://testnet.dcellar.io/buckets/wattness-grand-prix-records" },
      { label: "The Nov 26 index", href: INDEX_26 },
      { label: "The Nov 27 index", href: INDEX_27 },
      { label: "The Nov 27 publication, checked", href: blob("scripts/greenfield/published-od-20261127.json") },
      S.files,
      { label: "The publisher (scripts/greenfield)", href: tree("scripts/greenfield") },
    ],
    brainPage: "grand-prix:bnb-greenfield",
    keywords: ["storage", "files", "bucket", "sha-256", "objects"],
  },
  {
    id: "bnb-agent-studio",
    group: "sponsors",
    sponsor: "bnb",
    question: "Which agents run on BNB Agent Studio?",
    body: [
      "The evaluator (agent 2922) and the forecaster (2925) are hosted through BNB Agent Studio, which runs them on AWS AgentCore.",
      "The evaluator checks a sealed record against GateRecord and sells its report as an ERC-8183 job: jobs 1873, 1902 and 1908 were served there (1908 checked Desert Willow's Nov 27 plan), and so was the forecaster's job 1897.",
      "One agent hired another before the seal. In job 1907, for the Nov 27 plans, the planner (2928) escrowed 0.1 test U for Desert Willow's price scenarios. The forecaster delivered the scenarios' digest 58 s before the testnet seal; the sealed plan commits the same digest, and the job paid out after its 900-second dispute window.",
    ],
    sources: [
      S.agentIds,
      { label: "The evaluator's agent card", href: "https://bnbagent-api.bnbchain.world/v1/rt/01M8A6SP0DFR9E3KR8AYM3FDK9/.well-known/agent-card.json" },
      { label: "Job 1908 settled: Desert Willow's Nov 27 plan checked", href: bscTest("0xa45a93c1227377ba6b7ab1113ec3528a2a47c5cbdced68345aeb69aff1d64269") },
      { label: "Job 1902 settled", href: bscTest("0xe582ff17b2f14161e5ec44d6b2349137f3cf3be4b2135c8f74e47cd3dd4462dc") },
      { label: "Job 1907 delivered", href: bscTest("0xfa4279148a7d6a4843828ece1339161a1dd172c112deb9173c96bcb77f6bb583") },
      { label: "Job 1907 settled", href: bscTest("0x4d5ccb587d13df4db19f9d84d61ccf5920dd8339b25df9c527df395fbaf67ab7") },
      { label: "The evaluator's code", href: tree("packages/adapters/agent-studio") },
    ],
    brainPage: "grand-prix:agent-studio",
    keywords: ["aws", "agentcore", "erc-8183", "erc-8004", "jobs", "evaluator", "forecaster", "hosted"],
  },
  {
    id: "bnb-edge",
    group: "sponsors",
    sponsor: "bnb",
    question: "What does the Cloudflare edge Worker check?",
    body: [
      "The Worker at grand-prix-edge.wattness.workers.dev serves each sealed day's files from BNB Greenfield, each only after checking it against the root committed on GateRecord on BSC. Its x-gate-* headers say what each file was checked against.",
      "Its /verify/<battery> route answers with one battery's verdict: the leaf hash, its Merkle proof, the record key, the on-chain record and the gate, each pass or fail with the values compared.",
      "Desert Willow's plans for Nov 26 and Nov 27 both pass there against BSC mainnet.",
    ],
    sources: [
      { label: "Desert Willow's Nov 27 plan at the edge", href: `${EDGE}/verify/DSWL_ESS_ESR1?od=2026-11-27&network=bsc-mainnet` },
      { label: "Desert Willow's Nov 26 plan at the edge", href: `${EDGE}/verify/DSWL_ESS_ESR1?od=2026-11-26&network=bsc-mainnet` },
      S.verify,
    ],
    brainPage: "grand-prix:browser-plan-verification",
    keywords: ["cloudflare", "workers", "edge", "cdn", "verdict"],
  },
  {
    id: "bnb-check",
    group: "sponsors",
    sponsor: "bnb",
    question: "Where do I check the BNB Chain work?",
    body: [
      "Seal: both chains' receipts, the gate the contract computes, and the late commit it refuses.",
      "BscScan: the Nov 27 plans' seal on BSC mainnet, at {t:1795702241} on Nov 26, 1 h 49 min before the gate, 316 plans under one root.",
      "Verify: Desert Willow's plan checked in your browser against BSC mainnet. As sealed it passes; change one value and it fails, naming the field.",
      "Agent IDs: the seven ERC-8004 identities and their paid jobs. Files: the day's files on Greenfield with their SHA-256.",
    ],
    sources: [S.seal, S.seal27, S.verifyDswl, S.agentIds, S.files],
    brainPage: "grand-prix:seal-tab",
    keywords: ["bscscan", "proof", "where", "judges"],
  },

  // ---------------------------------------------------- Flap
  {
    id: "flap",
    group: "sponsors",
    sponsor: "flap",
    question: "How does the season use Flap's Pool Launch?",
    body: [
      "Our SeasonLauncherFactory, enabled on Flap's testnet Portal through its testnet helper, creates a round. Contributors put in test USD and name the agent they back.",
      "Anyone can call launch() once the raise reaches its minimum and GateRecord holds the milestone: the named agent's record for the named day, committed before that day's gate. A round that has not launched by its deadline only refunds.",
      "The launch seeds a V2 pool, and the token carries a 3% tax on buys and sells for its first 30 days. 72% of the tax reaches the season vault, which pays each contributor by deposit times the share of season days their agent sealed in time.",
    ],
    sources: [
      S.season,
      { label: "The Launcher and the Vault (modules/flap)", href: tree("modules/flap") },
      { label: "The factory enabled on Flap's Portal", href: bscTest("0x9084f63cad7e1d964abd88467a77e79a739b179469963e09ae4592df2de1a3fa") },
    ],
    brainPage: "grand-prix:seasonlauncher",
    keywords: ["pool launch", "portal", "launcher", "vault", "tax", "season", "refund"],
  },
  {
    id: "flap-delivered",
    group: "sponsors",
    sponsor: "flap",
    question: "What was delivered for the Flap track?",
    body: [
      "A Launcher and a Vault on Pool Launch, run end to end on BSC testnet. Round 3's milestone was the Nov 27 record: its testnet commit landed at {t:1795702216} on Nov 26, and the round filled and launched at {t:1795702352}.",
      "Round 1 launched on the Nov 26 record, and its vault paid by sealed days. A round whose milestone was not sealed in time could not launch, and its deposit came back.",
      "The launch UI is the Wattness Season Mini App, built from Flap's vault component template and open on Flap's host. The season token, PRIX, is a testnet placeholder.",
    ],
    sources: [
      { label: "Round 3 launched", href: bscTest("0x4881264736e39903dd28eadd23602d8d710c558055be4f2f74db9d5eeb872429") },
      { label: "Round 1's vault paid by sealed days", href: bscTest("0x1528a6d4f59aeeb3fead543bf6c49487b6c4ccf12c8e280ff36048b34df5750f") },
      { label: "A missed milestone refunded", href: bscTest("0xe5f8fe075565845a46985a6e29c2540e6f8b9a579b57b115a5419ece21932df8") },
      {
        label: "The Mini App on Flap's host",
        href: "https://utter.cash/apps/wattness-season?artifactPath=vaultui_wattness-season_01M8B7TYBFEQE0QK4PP4DFY5E6%2Fv20261126132700625_wattness-season_b2e5ede52980&lang=en",
      },
      S.season,
    ],
    brainPage: "grand-prix:seasonvault",
    keywords: ["round 3", "round 1", "mini app", "launch ui", "delivered", "testnet"],
  },
  {
    id: "flap-why",
    group: "sponsors",
    sponsor: "flap",
    question: "What problem does the season solve, and for whom?",
    body: [
      "A token launch usually waits only for money: once the raise is full, it launches whether or not the project has done anything. An agent that plans batteries has work the chain can check: its plan for a day was sealed before the market's gate, or it was not.",
      "It is for backers who want their stake tied to what the agent does, and for builders who want a launch that waits for evidence, not attention.",
      "What sets it apart: the condition is read on chain, with no oracle and no admin key; the payout follows the record day by day; a missed milestone refunds every deposit.",
    ],
    sources: [S.season, { label: "The contracts and tests (modules/flap)", href: tree("modules/flap") }],
    brainPage: "grand-prix:season-days",
    keywords: ["problem", "audience", "distinctive", "why"],
  },

  // ---------------------------------------------------- OpenFour
  {
    id: "openfour",
    group: "sponsors",
    sponsor: "openfour",
    question: "How does the launch use OpenFour?",
    body: [
      "OpenFour, Four.meme's open launch framework, builds each launch from swappable modules. On the OpenFour Hub route, our preset, Evidence-gated Bonding V1, keeps Bonding V1's Token, Vault, Curve and Trade and replaces Migrate.",
      "Its EvidenceGatedMigrateModule graduates a launch only when two things hold: the sale has sold out or raised its floor, and a GateRecord record is bound to it, the agent's own for that day, committed before the gate and covering at least the launch's minimum number of batteries. A root on its own never qualifies.",
      "Graduation moves the tokens and the raised quote into a PancakeSwap V2 pair and burns the LP.",
    ],
    sources: [
      S.launchpad,
      { label: "The module and its tests (modules/openfour)", href: tree("modules/openfour") },
      { label: "The preset added", href: bscTest("0x23aa595add67656eb2965908309467b1d4d2f35ade1a50f0dbbf39095e32a7f2") },
    ],
    brainPage: "grand-prix:evidencegatedmigratemodule",
    keywords: ["four.meme", "fourmeme", "hub", "preset", "bonding", "migrate", "graduation", "pancakeswap"],
  },
  {
    id: "openfour-delivered",
    group: "sponsors",
    sponsor: "openfour",
    question: "What was delivered for the OpenFour track?",
    body: [
      "The module and its preset on our own OpenFour deployment on BSC testnet, made with OpenFour's fork-deploy toolkit, and three public transactions on Nov 25: the sold-out launch's graduation refused with EvidenceMissing at {t:1795634242}, the Nov 26 record bound to the launch, and the graduation into its PancakeSwap V2 pair at {t:1795634271}.",
      "The agent token, PLNR, is a testnet placeholder.",
      "The Launchpad tab reads every step with view calls and names what is missing, liquidity or evidence.",
    ],
    sources: [
      { label: "Graduation refused: EvidenceMissing", href: bscTest("0x219f25a2b86a8a73595911f40dd81f072655bd6711fdd4eb6b8108b6a733686e") },
      { label: "The Nov 26 record bound", href: bscTest("0xd100cfa2402baaeec7de4545deedec2f72d238bbb53ec3fc34753d93718a1128") },
      { label: "Graduated into PancakeSwap V2", href: bscTest("0xc549f6e5a6598ba308e6ecb837cf0da2a6fa23c1d72a6e40065df4c585af5330") },
      S.launchpad,
    ],
    brainPage: "grand-prix:plnr-launch",
    keywords: ["refused", "bound", "graduated", "delivered", "testnet"],
  },
  {
    id: "openfour-why",
    group: "sponsors",
    sponsor: "openfour",
    question: "What problem does the graduation solve, and for whom?",
    body: [
      "On a launchpad, a token graduates when its sale sells out: demand alone lists it. When the token belongs to an AI agent, buyers have no on-chain way to tell whether the agent does the work it claims.",
      "It is for people who buy into agents' launches and want graduation to mean the agent has a record, builders who want their launch to carry proof of work, and launchpads that want listing to wait for evidence.",
      "What differs: graduation reads the agent's own record, bound in time to the market's gate, and only Migrate changes, so buying, selling and the curve work as users already know.",
    ],
    sources: [S.launchpad, { label: "The module (modules/openfour)", href: tree("modules/openfour") }],
    brainPage: "grand-prix:openfour",
    keywords: ["problem", "audience", "different", "why"],
  },

  // ---------------------------------------------------- CoinMarketCap × Atlas
  {
    id: "cmc-atlas",
    group: "sponsors",
    sponsor: "cmc-atlas",
    question: "How do CoinMarketCap and Atlas set what checking costs?",
    body: [
      "Each independent check of a sealed record is a paid ERC-8183 job. The budget rule values a declared BNB budget at the lower of Atlas's and CoinMarketCap's BNB prices.",
      "It holds back a reserve of 10% plus twice CoinMarketCap's 24-hour BNB move, at most 50%, and counts the checks the rest pays for. Prices more than 5% apart, USDT more than 1% from a dollar, or CoinMarketCap's security fields for BSC-USDT unknown or flagged turn the decision to review; a stale or future-dated price stops it.",
      "The plans themselves are valued only at ERCOT's prices.",
    ],
    sources: [S.prices, { label: "The budget rule (packages/adapters/atlas-cmc)", href: tree("packages/adapters/atlas-cmc") }],
    brainPage: "grand-prix:evaluation-budget-decision",
    keywords: ["coinmarketcap", "cmc", "atlas", "oracle", "budget", "reserve", "price", "usdt"],
  },
  {
    id: "cmc-atlas-delivered",
    group: "sponsors",
    sponsor: "cmc-atlas",
    question: "What was delivered for the CoinMarketCap × Atlas challenge?",
    body: [
      "A rule for whoever funds independent checks of sealed plans, a sponsor, an owner or a lender: how many checks a BNB budget buys today, from prices they can verify, and when to stop.",
      "The run on Nov 25 at {t:1795622040}: 0.25 BNB was worth $134.13 at the lower price, the day's 1.78% move set a 13.56% reserve, and the rest paid for 57 checks at $2 each.",
      "Usage anyone can verify: Atlas's signed report is published with its payload and signature, so its signer can be recovered, and the site reads Atlas's feeds on BSC mainnet and testnet with view calls and no key.",
    ],
    sources: [
      { label: "The signed report and quotes (prices.json)", href: blob("site/public/data/prices.json") },
      S.prices,
      S.seal,
      { label: "The adapter and its tests", href: tree("packages/adapters/atlas-cmc") },
    ],
    brainPage: "grand-prix:atlas",
    keywords: ["delivered", "run", "signed report", "verifiable", "usage", "audience", "problem"],
  },
  {
    id: "cmc-atlas-feeds",
    group: "sponsors",
    sponsor: "cmc-atlas",
    question: "What does the site read from Atlas on BNB Chain?",
    body: [
      "On the Prices tab, Atlas's BNB/USD and USDT/USD feeds on BSC testnet, live beside the budget's decision, and Atlas's MultiFeed on BSC mainnet for tokenized shares of four companies in Texas's power market: Vistra, Fluence, GE Vernova and IREN.",
      "On the Seal tab, Atlas's BNB/USD feed on BSC mainnet prices the latest seal's gas in dollars.",
      "Each read is a view call that anyone can repeat.",
    ],
    sources: [S.prices, S.seal, { label: "The read clients (packages/adapters/atlas-cmc)", href: tree("packages/adapters/atlas-cmc") }],
    brainPage: "grand-prix:prices-tab",
    keywords: ["multifeed", "vistra", "fluence", "ge vernova", "iren", "feeds", "gas"],
  },

  // ---------------------------------------------------- Cournot
  {
    id: "cournot",
    group: "sponsors",
    sponsor: "cournot",
    question: "How does Cournot's probability shape the plans?",
    body: [
      "Before the gate, the risk officer reads one probability from Cournot's Intelligence Oracle: the odds, from Kalshi's market, that the Dallas–Fort Worth low falls below 29°F.",
      "A declared rule, ours and labeled as ours, turns it into the weight on each battery's stress scenarios, w = p × 0.80 + (1 − p) × 0.25, and the hourly hedge limit, 50 MWh × (1 − 0.5 × w). The planner scores and picks each plan with those weights.",
      "For the Nov 27 plans, p = 0.01 moved the stress weight from 25% to 25.55% and the hedge cap from 100 contracts an hour to 43, on all 316 plans; 117 of them hedge up to that cap.",
    ],
    sources: [
      S.forecast,
      { label: "The weather rule (weather.ts)", href: blob("packages/core/src/weather.ts") },
      { label: "The Cournot client (packages/adapters/cournot)", href: tree("packages/adapters/cournot") },
    ],
    brainPage: "grand-prix:the-cournot-weather-rule",
    keywords: ["kalshi", "weather", "probability", "oracle", "intelligence", "stress", "hedge cap", "temperature"],
  },
  {
    id: "cournot-delivered",
    group: "sponsors",
    sponsor: "cournot",
    question: "What was delivered for the Cournot track?",
    body: [
      {
        list: [
          "Where and how it calls Cournot: inside the plan run, before the seal, resolve then probability, the order of the official Cournot Skill, with a 20-second limit and no automatic retry.",
          "How it uses the probability: the stress weight and the hedge cap, by the declared rule.",
          "Where users see the claim and the evidence: the Forecast tab's Weather Odds from Cournot card, and every Nov 27 plan under outside_inputs.cournot.",
          "Proof of a call: requested at {t:1795701903} on Nov 26, HTTP 200, p = 0.01 for Cournot market 28288699. The response's SHA-256 is sealed in every Nov 27 plan on BSC mainnet.",
        ],
      },
    ],
    sources: [
      { label: "Cournot's saved response on Greenfield", href: COURNOT_RESPONSE },
      S.seal27,
      S.forecast,
      { label: "The Cournot client", href: tree("packages/adapters/cournot") },
    ],
    brainPage: "grand-prix:cournot-probability",
    keywords: ["integration", "skill", "resolve", "proof", "call", "delivered"],
  },
  {
    id: "cournot-check",
    group: "sponsors",
    sponsor: "cournot",
    question: "How do I check Cournot's reading myself?",
    body: [
      "Hash the saved response on BNB Greenfield:",
      { code: `curl -s ${COURNOT_RESPONSE} | shasum -a 256` },
      "It prints this hash, the one under outside_inputs.cournot in every Nov 27 plan, whose proof leads to the root committed on BSC mainnet:",
      { code: "4990562681a469dc4ae486a5b787293b6d10deacf282f701b22b432488b5f394" },
      "The verifier does the same: its input check (V7) holds the response to the plan by that hash, and its rule check (V8) recomputes the weights, the hedge cap and the stress bucket.",
    ],
    sources: [
      { label: "Cournot's saved response", href: COURNOT_RESPONSE },
      { label: "The Nov 27 index", href: INDEX_27 },
      S.seal27,
      { label: "The verifier (packages/verifier)", href: tree("packages/verifier") },
    ],
    brainPage: "grand-prix:packagesverifier",
    keywords: ["hash", "sha-256", "curl", "verify", "check"],
  },

  // ---------------------------------------------------- Living Brain
  {
    id: "living-brain",
    group: "sponsors",
    sponsor: "living-brain",
    question: "How do the agents use Living Brain?",
    body: [
      "Living Brain is the agents' persistent memory, used through its REST API, with a brain of its own for a battery's reviews.",
      "Remember: a reviewed lesson is captured with an origin reference built from the battery, the sealed root and the note's version. Retrieve: a fresh session reads full pages back as of a cutoff, admitting only pages whose content and every source existed by then, and cites each by page, version and sources. Connect: Living Brain links pages within and across brains.",
      "Memory is read after the seal: it shapes the review, never a sealed plan.",
    ],
    sources: [S.memory, { label: "The adapter (packages/adapters/living-brain)", href: tree("packages/adapters/living-brain") }],
    brainPage: "grand-prix:living-brain",
    keywords: ["chatandbuild", "memory", "remember", "retrieve", "connect", "cutoff", "brain"],
  },
  {
    id: "living-brain-delivered",
    group: "sponsors",
    sponsor: "living-brain",
    question: "What was delivered for the Living Brain track?",
    body: [
      "A better second interaction, run live on Nov 25 at {t:1795625880}. A first session captured two notes for Desert Willow: the sealed plan's context and the reviewed rule for its hedge. A fresh client retrieved page dswl-ess-esr1, version 2, cited it, and its review of the hedge moved from needs-supported-review to assumed-entry-scenario.",
      "The cutoff holds: asked as of the Nov 26 plan's own time, the same retrieval admitted no page, because the lesson was written after that seal.",
      "Three brains on the Memory tab: 142 pages, with 55 connections across brains (read Nov 26).",
    ],
    sources: [
      S.memory,
      { label: "Desert Willow's page in memory", href: "/agents/memory?page=battery-review:dswl-ess-esr1" },
      { label: "The adapter and its live run", href: tree("packages/adapters/living-brain") },
    ],
    brainPage: "battery-review:dswl-ess-esr1",
    keywords: ["second interaction", "run", "delivered", "desert willow", "retrieveat"],
  },
  {
    id: "living-brain-why",
    group: "sponsors",
    sponsor: "living-brain",
    question: "What makes this memory different?",
    body: [
      "It keeps the gate's clock. Retrieval takes a cutoff and refuses anything that did not exist by then, so a review as of the seal cannot use hindsight.",
      "Citations, not snippets: a review cites page, version and sources, and search snippets never enter it.",
      "One brain per asset: each battery's lessons stay in its own brain, and a source from another brain is refused.",
      "The build remembers itself: its own brain holds 123 pages and 276 connections, from the site's tabs to GateRecord and the checks, beside the Wattness Terminal's 18 pages (read Nov 25 and 26).",
    ],
    sources: [S.memory, { label: "The adapter (packages/adapters/living-brain)", href: tree("packages/adapters/living-brain") }],
    brainPage: "grand-prix:memory-tab",
    keywords: ["unique", "different", "hindsight", "citations"],
  },

  // ---------------------------------------------------- How it works
  {
    id: "scoring-rule",
    group: "how",
    question: "Who sets the scoring rule?",
    body: [
      "Wattness wrote it, and it is published in the repository: energy at each battery's own ERCOT day-ahead price, minus an assumed wear cost and fees, plus the hedge settled on ERCOT's real-time hub prices.",
      "It is fixed in code before the seal: each sealed day commits the git tree of the code that planned it beside its root, and from the Nov 27 plans on, that tree holds the scoring code. Anyone can rerun it from the published inputs.",
      "The seal is what stops anyone, Wattness included, from changing a plan after the gate: GateRecord keeps one record per committer, scope and day, and refuses a late or a second one.",
    ],
    sources: [
      { label: "How a sealed plan settles (docs/outcomes.md)", href: blob("docs/outcomes.md") },
      S.gateRecord,
      S.seal,
    ],
    brainPage: "grand-prix:plan-valuation",
    keywords: ["score", "rules", "fair", "who decides", "valuation", "outcome"],
  },
  {
    id: "how-plans-are-made",
    group: "how",
    question: "How are the plans made?",
    body: [
      "By a solver, on public data. For each battery the planner solves tomorrow's charge and discharge by hour within its power and energy limits: a mixed-integer program, solved with HiGHS, over price scenarios built from recorded forecast errors (301 a battery for the Nov 26 plans).",
      "It compares three choices on the same inputs: no hedge, a hedge added to a fixed schedule, and both chosen together. Each is scored by its expected revenue and the average of its worst tenth of scenarios, and one is kept.",
      "No language model writes a plan. Every input is named by its SHA-256; replayed from its inputs, the Nov 26 day gave the same 316 leaves byte for byte.",
    ],
    sources: [S.how, S.dswl, { label: "The optimization (packages/engine)", href: tree("packages/engine") }],
    brainPage: "grand-prix:planner",
    keywords: ["ai", "llm", "model", "solver", "highs", "optimization", "scenarios", "cvar", "agents"],
  },
  {
    id: "the-agents",
    group: "how",
    question: "Who are the six agents?",
    body: [
      {
        list: [
          "Market reader (2923): reads each battery's prices from the Wattness Terminal's public data release, every file pinned by SHA-256.",
          "State keeper (2924): keeps each battery's power and energy limits and its state of charge.",
          "Forecaster (2925): forecasts tomorrow's hub and node prices and builds the price scenarios.",
          "Hedger (2926): prices ElectronX's published hourly contract at the battery's hub.",
          "Risk officer (2927): sets how much downside a plan may carry, with Cournot's probability as an input.",
          "Planner (2928): solves the three choices and keeps the one with the highest objective.",
        ],
      },
      "Each has its own ERC-8004 identity on BSC testnet, and work between them can be a paid ERC-8183 job. A seventh, the evaluator (2922), checks sealed records and sells its report.",
    ],
    sources: [S.agentIds, S.forecast, S.state, S.hedge, S.risk, { label: "The six roles (roles.ts)", href: blob("packages/agents/src/roles.ts") }],
    brainPage: "grand-prix:planner-erc-8004-agent-2928",
    keywords: ["agents", "roles", "market reader", "state keeper", "forecaster", "hedger", "risk officer", "planner", "evaluator", "erc-8004"],
  },
  {
    id: "the-gate",
    group: "how",
    question: "What is the gate?",
    body: [
      "ERCOT's day-ahead market takes offers for the next operating day until 10:00 CT, before its prices are known. A plan sealed by then could not have used them.",
      "GateRecord computes the gate itself, 10:00 Central on the day before the operating day, daylight-saving aware, and refuses any record for that day committed at or after it.",
      "The Nov 26 plans were sealed 44 min 43 s before their gate; the Nov 27 plans, 1 h 49 min 19 s before theirs.",
    ],
    sources: [S.overview, S.seal, S.gateRecord],
    brainPage: "grand-prix:gate-recordercot-da-energy",
    keywords: ["deadline", "10:00", "day-ahead", "ercot", "dst"],
  },
  {
    id: "after-the-seal",
    group: "how",
    question: "What cannot change after the seal?",
    body: [
      "The plans. Every plan of the day is a leaf of one Merkle root, committed to GateRecord before the gate with the git tree of the code that made them. Change one number in one plan and its leaf no longer leads to the root.",
      "The record. GateRecord keeps one write-once record per committer, scope and operating day. It refuses a commit at or after the gate (AfterGate) and a second one (AlreadyCommitted): a second plan for Nov 26, simulated 22 seconds after the gate, is refused.",
      "What comes later links to it: each outcome stage is taken once, from the committer, after it opens.",
    ],
    sources: [S.seal, S.gateRecord, S.sourcify],
    brainPage: "grand-prix:write-once-record",
    keywords: ["immutable", "change", "tamper", "late", "aftergate", "alreadycommitted", "merkle"],
  },
  {
    id: "verify-yourself",
    group: "how",
    question: "How do I verify a plan myself?",
    body: [
      "In your browser: open Verify and pick a battery. The page recomputes the plan's leaf with a second implementation, follows its proof to the root, reads the root back from GateRecord through a public node and replays the battery's limits hour by hour.",
      "From a clone, with no key and no wallet:",
      { code: "pnpm verify fixtures/od-20261126/manifest.json --network bsc-mainnet --scope gate-record/ercot-da-energy --battery DSWL_ESS_ESR1" },
      "Or recompute Desert Willow's leaf in Python's standard library with tools/verify_hash.py.",
    ],
    sources: [S.verifyDswl, S.runIt, { label: "tools/verify_hash.py", href: blob("tools/verify_hash.py") }, { label: "The verifier", href: tree("packages/verifier") }],
    brainPage: "grand-prix:battery-plan-verification",
    keywords: ["verify", "check", "proof", "command", "python"],
  },
  {
    id: "stewards",
    group: "how",
    question: "What do the stewards check?",
    body: [
      "The stewards are the Verify tab's checks, run in order on any battery's plan:",
      {
        list: [
          "The leaf: the plan recomputes to its leaf, and its proof leads to the day's root.",
          "The record: the same root is on GateRecord for that committer, scope and day.",
          "The gate: it was committed before ERCOT's 10:00 CT day-ahead gate.",
          "The limits: the schedule stays within the battery's power and energy every hour.",
        ],
      },
      "From a clone, the verifier adds the plan's accounting, every input against the published release, an outside input such as Cournot's response by its hash, and each linked outcome.",
    ],
    sources: [S.verify, { label: "The verifier (packages/verifier)", href: tree("packages/verifier") }],
    brainPage: "grand-prix:verify-tab",
    keywords: ["stewards", "checks", "v1", "limits", "gate", "record"],
  },
  {
    id: "real-or-shadow",
    group: "how",
    question: "What is real, and what is a shadow plan?",
    body: [
      "Real: the batteries and ERCOT's public data, the seals on BSC mainnet for the Nov 26 and Nov 27 plans, the files on BNB Greenfield, and the agents' identities, paid jobs and launches on BSC testnet.",
      "Shadow: the plans. Each is computed for a real ERCOT battery from public data, and the batteries are not operated from here. The hedge uses ElectronX's published contract terms at an entry price the model assumes, so it is a scenario, not a trade.",
      "After the gate, each plan is valued at the prices ERCOT publishes.",
    ],
    sources: [S.fleet, S.hedge, S.seal],
    brainPage: "grand-prix:agent-plans",
    keywords: ["shadow", "real", "paper", "operated", "electronx", "hedge"],
  },
  {
    id: "why-a-chain",
    group: "how",
    question: "Why seal on a blockchain, not a timestamp?",
    body: [
      "A timestamp proves that a hash existed; it cannot show the days that were left out. GateRecord keeps one record per wallet, market and day, computes the gate, refuses a late or a second record, and lists every day a wallet sealed.",
      "And contracts act on it: Flap's season vault pays for days sealed in time, and an OpenFour launch graduates only with a sealed record bound to it.",
      "One transaction seals the whole fleet: 0.0000086 BNB for the Nov 27 plans.",
    ],
    sources: [S.gateRecord, S.season, S.launchpad, S.seal27],
    brainPage: "grand-prix:gaterecord",
    keywords: ["blockchain", "timestamp", "why", "chain"],
  },

  // ---------------------------------------------------- For battery owners and QSEs
  {
    id: "owners",
    group: "owners",
    question: "What does this give a battery owner?",
    body: [
      "A record nobody can edit afterwards, its author included. An optimizer is hired on its track record, and a record is worth something only if it was fixed before the prices were known.",
      "Each sealed day holds a plan for every ERCOT battery with complete public data (316 on Nov 26), committed before the gate. Find your battery on Fleet, open its plan, and check it against the chain on Verify.",
      "On the Wattness Terminal, an owner can ask for a free hedge review from the battery's page, where its Hedging data covers it.",
    ],
    sources: [S.fleet, S.dswl, S.verify, S.terminal],
    brainPage: "grand-prix:ercot-batteries",
    keywords: ["owner", "track record", "optimizer", "hedge review", "my battery"],
  },
  {
    id: "desert-willow",
    group: "owners",
    question: "Why does the site keep showing Desert Willow?",
    body: [
      "Desert Willow (DSWL_ESS_ESR1) is the showcase battery: 150 MW and 338 MWh in Ellis County, on ERCOT's North hub, as the Nov 26 index lists it.",
      "It is the battery of the Wattness Terminal's Hedging walkthrough, whose file its plan reads. Its plan is on the Battery tab in full, its reviews have a brain of their own in Living Brain, and on ONE PLAN you can plan its sealed day yourself.",
    ],
    sources: [S.dswl, S.onePlan, { label: "Desert Willow's page in memory", href: "/agents/memory?page=battery-review:dswl-ess-esr1" }, S.terminal],
    brainPage: "grand-prix:desert-willow",
    keywords: ["desert willow", "dswl", "showcase", "ellis", "north hub", "example"],
  },
  {
    id: "owners-missing",
    group: "owners",
    question: "Why is a battery missing from Fleet?",
    body: [
      "The fleet is every ERCOT battery with complete public data. For the Nov 26 plans, 316 batteries had a plan and 32 were left out, each named in the day's index with the census field it lacks.",
      "Search Fleet by battery, node, hub or county; the day's index on BNB Greenfield names every battery left out and why.",
    ],
    sources: [S.fleet, { label: "The Nov 26 index", href: INDEX_26 }],
    brainPage: "grand-prix:batteries-without-a-plan",
    keywords: ["missing", "left out", "excluded", "census"],
  },
  {
    id: "qses",
    group: "owners",
    question: "What does a QSE get from the record?",
    body: [
      "An independent day-ahead plan for each ERCOT battery with complete public data, sealed before the same 10:00 CT gate its offers face, and valued afterwards at ERCOT's own prices.",
      "Each plan states the battery's limits, its hourly schedule and the state of charge it implies, with three choices compared: no hedge, a hedge on a fixed schedule, and both together.",
      "The Battery tab shows any battery's plan in full; the Wattness Terminal holds the market around it.",
    ],
    sources: [S.dswl, S.state, S.hedge, S.terminal],
    brainPage: "grand-prix:three-plans-compared",
    keywords: ["qse", "scheduling entity", "bids", "offers", "state of charge"],
  },
  {
    id: "optimizer-fee",
    group: "owners",
    question: "How would an optimizer be paid on a sealed record?",
    body: [
      "On results anyone can check. For battery optimization, Wattness sets out a charge per kW-month plus a share of what the plans add over a benchmark fixed before the first day, paid only above a high-water mark.",
      "Every figure that fee depends on can be checked against sealed plans and ERCOT's settlement prices, at one transaction a day for every battery (0.0000086 BNB for the Nov 27 plans).",
      "Data licensing, custom tools and battery optimization for owners, lenders, insurers and QSEs are Enterprise on the Wattness Terminal, by quote.",
    ],
    sources: [S.terminal, S.seal],
    brainPage: "grand-prix:wattness-terminal",
    keywords: ["fee", "pricing", "business", "enterprise", "lender", "insurer", "benchmark"],
  },

  // ---------------------------------------------------- For developers
  {
    id: "add-agent",
    group: "developers",
    question: "How do I add my own agent?",
    body: [
      "GateRecord takes commits from any wallet and keys every record by its committer, scope and operating day. Your agent seals its own plans under its own wallet, with the same scope and schema, before the same gate, and faces the same checks.",
      "Add Your Agent shows the three things to match, the scope, the schema and the one commit, and the call that sends it.",
      "On ONE PLAN you can plan Desert Willow's sealed day yourself, score it with the planner's objective and, for a day whose gate is still ahead, seal it from your wallet on BSC testnet.",
    ],
    sources: [S.addAgent, S.onePlan, S.gateRecord],
    brainPage: "grand-prix:add-your-agent-tab",
    keywords: ["agent", "commit", "wallet", "compete", "arena", "garage"],
  },
  {
    id: "run-it",
    group: "developers",
    question: "How do I run it from a clone?",
    body: [
      "Node 22 (22.18 or later) and pnpm 11:",
      { code: "pnpm install\npnpm test\npnpm verify fixtures/od-20261126/manifest.json --network bsc-mainnet --scope gate-record/ercot-da-energy --battery DSWL_ESS_ESR1" },
      "To plan an operating day in the coming week yourself, with no key and no chain, while its gate is still ahead:",
      { code: "pnpm plan --od YYYY-MM-DD --network local\npnpm verify out/local/od-YYYYMMDD/manifest.json --no-chain" },
    ],
    sources: [S.repo, S.runIt],
    brainPage: "grand-prix:run-it-yourself",
    keywords: ["install", "pnpm", "node", "clone", "command", "plan"],
  },
  {
    id: "code-map",
    group: "developers",
    question: "Where is each piece in the code?",
    body: [
      "One repository, MIT:",
      {
        list: [
          "contracts/: GateRecord, its tests and deployments.",
          "packages/core: canonical JSON, leaves and roots, the gate clock and the weather rule.",
          "packages/engine: the forecast, the price scenarios and the HiGHS optimization.",
          "packages/verifier: the end-to-end check.",
          "packages/agents: the six roles as ERC-8004 agents.",
          "packages/adapters: one client per sponsor.",
          "modules/flap and modules/openfour: the launch contracts.",
          "scripts/greenfield: the publisher. site/: this site.",
        ],
      },
    ],
    sources: [S.repo, S.stack],
    brainPage: "grand-prix:wattness-grand-prix-repository",
    keywords: ["code", "repository", "github", "layout", "packages"],
  },
  {
    id: "data-sources",
    group: "developers",
    question: "Where does the data come from?",
    body: [
      "ERCOT, read from the Wattness Terminal's public data release: prices by day and point, the battery census, and the Hedging walkthrough's file for Desert Willow. Each plan names every file it read by its SHA-256.",
      "Contract terms: ElectronX's published product specifications. Weather odds: Cournot, from Kalshi's market. BNB and USDT prices: Atlas and CoinMarketCap.",
      "Calculation and display: Wattness.",
    ],
    sources: [S.terminal, { label: "The readers (packages/data)", href: tree("packages/data") }, S.files],
    brainPage: "grand-prix:wattness-terminal-public-release",
    keywords: ["data", "source", "ercot", "release", "electronx"],
  },
];
