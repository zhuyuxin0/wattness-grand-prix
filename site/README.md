# Wattness Grand Prix: site

The public site for the sealed record. A static Vite + React 18 + TypeScript app with hash routing and a relative
base, so one build serves from any path. It is its own project, outside the repository's pnpm workspace.

```sh
pnpm install --ignore-workspace
pnpm data       # out/od-20261126 -> public/data (fixtures/od-20261126 when out/ is absent)
pnpm dev        # http://127.0.0.1:15191/
pnpm build      # data, type-check, build to dist/
pnpm build:app  # type-check and build without regenerating data
pnpm preview    # http://127.0.0.1:15192/
```

`public/data` is committed. In a clone without `out/`, `pnpm data` keeps the published record data rather than
replacing it with the two-leaf fixture (pass `--fixture` to force it). The Terminal graph and the Living Brain
readback come from `cache/site-sources/` (or `GP_SOURCES`, `--structure`, `--brain`); when absent, their last
published copies are kept. The script refuses to publish a credential from the private env file or any of the
verifier's excluded days, and keeps `public/data` under 3 MB.

## Recording

Load any page with `?clock=<ISO instant or unix ms>&capture=1` before the hash, e.g.
`/?clock=2026-11-25T15:30:00Z&capture=1#/stewards`. The clock is fixed (countdowns render one frame), looping
motion stops and hover-only reveals show. Pages read the clock with `now()` from `src/lib/capture.ts`.

## Data (`public/data/`)

| File | Type (`src/data/types.ts`) | What |
|---|---|---|
| `day.json` | `DayIndex` | The day's index and one `BatterySummary` per leaf (316), in leaf order |
| `showcase/DSWL_ESS_ESR1.manifest.json` | `Manifest` | Desert Willow's leaf, byte for byte as hashed |
| `showcase/DSWL_ESS_ESR1.scenarios.json` | `ScenarioDigest` | Hourly bands over the 301 scenarios, 40 sample paths |
| `receipts.json` | `Receipts` | Both GateRecord commits (BSC mainnet 56, testnet 97) |
| `late-seal.json` | `LateSeal` | The commit 22 s after the gate, refused with `AfterGate` |
| `terminal-structure.json` | `TerminalStructure` | The Terminal's architecture: 18 parts, 6 layers, 48 connections |
| `brain.json` | `BrainGraph` | Living Brain pages, connections and graph, with account fields removed |
| `greenfield.json` | `GreenfieldIndex` (`pages/Files/data.ts`) | The sealed day's files on BNB Greenfield: path, kind, bytes, SHA-256 |
| `agents.json` | `AgentsFile` (`pages/AgentIds/data.ts`) | The seven ERC-8004 identities and the three paid ERC-8183 jobs, each step with its transaction |
| `prices.json` | `PricesFile` (`pages/Prices/data.ts`) | Atlas's signed reports and CoinMarketCap's quotes as the adapter's run recorded them, and the budget rule's decision |
| `memory/build-brain.json` | `BuildBrain` (`pages/Memory/data.ts`) | The build's brain in Living Brain: a page for every tab, its connections and their corrections |
| `files.json` | `FilesIndex` | Every file above with its bytes, SHA-256 and source |

Loaders are in `src/data/load.ts`, hooks in `src/data/hooks.ts` (`useDay`, `useReceipts`, `useLateSeal`,
`useShowcaseManifest`, `useScenarios`, `useTerminalStructure`, `useBrain`); render with `<Ready state={...}>`.

## Working in parallel: the seams

The site is an app shaped like the Wattness Terminal: a masthead, a side panel of grouped tabs, and the page. The
panel, the routes and the overview's paths all read one list, `src/shell/tabs.ts`; a group or a tab is one entry
there, in the pipeline's order. Each tab is one folder under `src/pages/`, owned by one lane at a time:

| Group | Tab | Route | Folder |
|---|---|---|---|
| | Intro | `#/` | `pages/Intro` (the starting grid; the 3D story opens over it from the stage bar) |
| Today | Overview | `#/overview` | `pages/Overview` |
| Plans | Fleet | `#/fleet`, `#/fleet/<resource>` | `pages/Fleet` |
| Plans | Battery | `#/battery`, `#/battery/<resource>` | `pages/Battery` |
| Agents | Agent IDs | `#/agents/ids` | `pages/AgentIds` |
| Agents | Forecast | `#/agents/forecast` | `pages/Forecast` |
| Agents | State of Charge | `#/agents/state` | `pages/StateOfCharge` |
| Agents | Hedge | `#/agents/hedge` | `pages/Hedge` |
| Agents | Risk | `#/agents/risk` | `pages/Risk` |
| Agents | Memory | `#/agents/memory` | `pages/Memory` |
| On Chain | Seal | `#/seal` | `pages/Seal` |
| On Chain | Verify | `#/verify`, `#/verify/<resource>` | `pages/Verify` |
| On Chain | Files | `#/files` | `pages/Files` |
| Markets | Season | `#/markets/season` | `pages/Season` |
| Markets | Launchpad | `#/markets/launchpad` | `pages/Launchpad` |
| Markets | Prices | `#/markets/prices` | `pages/Prices` |
| Markets | ONE PLAN | `#/markets/one-plan` | `pages/OnePlan` (ONE PLAN's stage) |
| About | How It Works | `#/about` | `pages/HowItWorks` |
| About | Tech Stack | `#/about/stack` | `pages/TechStack` (the stack's map) |
| About | Add Your Agent | `#/about/agents` | `pages/AddAgent` |

Tab names are plain; the Grand Prix's words live in the Intro, the glossary and one short note under a page's title
(the tab's `term`). The battery tabs share one selection (`src/shell/battery.ts`): picking a battery on any of them
carries to the rest; a link may name one with `#/battery/<resource>` or `?battery=<resource>`.

- A page's `index.tsx` default-exports the page; it is lazy-loaded as its own chunk, so a page can import
  `three` or d3 without weighing on the others. Routes end in `/*`, so a page owns its sub-paths
  (`#/standings/DSWL_ESS_ESR1`) with its own nested `<Routes>`.
- Put page-only components, charts, scenes and styles in the page folder (`styles.css` is already imported).
- The shared folders (`ui`, `data`, `lib`, `design`, `styles`, `shell`, `routes.tsx`, `config.ts`) are stable. When a
  page needs something new there, add a new file instead of changing an existing one.
- Live chain reads: `src/lib/testnet.ts` (`readTestnet`, `useTestnet`) reads BSC testnet over the verifier's public
  nodes, with no wallet and no key; one read pins one block, and a failing node hands the whole read to the next.
  `src/ui/LiveRead` stamps what a page shows with that block, its time in CT and the reader's, the node, and
  Read again; given a `chain`, it names another.
- BNB Smart Chain reads: `src/components/atlas/` (Atlas's feeds and a commit's receipt, for the Texas power board on
  Prices and the seal's cost on Seal) reads over the verifier's mainnet nodes with plain JSON-RPC, one node and one
  block per read, and stamps with `LiveRead`. `node scripts/atlas-reads.mjs` makes every one of its reads once. The
  board's company logos are in `public/logos/`, each with its source in `SOURCES.md`.
- Each tab's foot links to the tab's own page in the build's memory, opened on Memory (`src/shell/MemoryCue.tsx`,
  drawn by `Pager`).
- New published data: add `scripts/data/<page>.mjs` whose default export takes the context documented in
  `scripts/build-data.mjs` (`day`, `batteries`, `leaf(resource)`, `writeJson`, ...). Modules run in name order;
  the size, credential and date checks cover their files too.
- In-browser verification: the Verify tab hashes with `src/pages/Verify/verify/core.ts`, a second implementation
  written apart from `packages/core`; `test/stewards.test.mjs` holds it to the sealed leaves and, once
  `packages/core` is built, to core's own `leafHash`.

## The 3D world (`packages/world`)

The story, ONE PLAN and the stack are the package's three mounts: each takes an element, fills it and returns a
handle (`packages/world/README.md`). The site imports the package from source as `@world` (`vite.config.ts`),
dedupes three.js to its own 0.187.0, so the package builds from this install, and lets the dev server read
`packages/world/src`.

- A page loads its mount with a dynamic import inside an effect and disposes it in the effect's cleanup, so three.js
  and the frames stay in that tab's chunks: the story in Intro, ONE PLAN in ONE PLAN, the stack in Tech Stack.
  `test/world-tabs.test.mjs` fails on a static import of `@world` or on a load from outside `src/pages/`.
- `src/world.d.ts` declares the mounts' options and handles by hand, so the site never type-checks the package's
  sources. It changes when a mount's options or handle change.
- `onRoute` names a tab by the package's id. `worldPath(id)` (`src/shell/world.ts`) gives its path here, for a battery
  tab with the carried battery. `WORLD_TABS` in `src/shell/tabs.ts` holds the ids, and the test reads the story's and
  the stack's own lists against it.
- The mounts draw from `packages/world/src/data/`: the venue's `layout.json`, committed, and `frame-data.json`,
  synced there before the build and not committed (`sh packages/world/scripts/sync-data.sh <folder>`). Without the
  frame data each mount's `ready` rejects with a message that names the sync.
- The site's copy of the frame data, reviewed for publication, is committed in `world-data/`: the synced file less
  the fields no mount reads that hold the lanes' working notes, tool output or account usage. The Pages workflow
  checks it against its pinned SHA-256, syncs it (`sh packages/world/scripts/sync-data.sh site/world-data`) and stops
  unless the same bytes land in `packages/world/src/data/`. A new copy changes the pin in `pages.yml` with it.

## Design

The site is a sibling of wattness.tech and wattness.ai: the same mark, type, tokens, theme toggle and glyphs.

- Tokens are wattness.tech's names and values in light and dark (`src/styles/tokens.css`), mirrored for canvas and
  WebGL in `src/design/tokens.ts`. The page ground is the pane; chrome sits below it and raised controls above it.
  Witness Teal marks selection, focus and the brand trace only. BNB Chain yellow (`--seal`) is the sealed state and
  the chain's witness only. Arms A, B and C are `--arm-a`, `--arm-b`, `--arm-c` on every chart and table.
- The theme follows the system until the visitor picks one with the toggle (moon in light, sun in dark); the choice
  is remembered. `index.html` paints it before first paint, `src/lib/theme.ts` keeps it, and `useTheme` and
  `useSceneTheme` (`src/ui/useTheme.ts`) let canvases follow it. A 3D stage holds its own dark with
  `data-atmosphere="dark"`, as wattness.tech's intro does.
- Libre Franklin, self-hosted with its licence (`src/assets/fonts/OFL.txt`), sets the brand word and display
  headings; the interface is the system face at 12 to 13 px; figures that change or line up use tabular figures;
  monospace is for hashes and code only.
- Icons are wattness.tech's drawn glyphs (`src/ui/Glyph.tsx`, `glyph.css`), never typed characters.

Shared components (`src/ui`): `Hash`, `Receipt`, `Countdown`, `Stat`/`StatRow`, `Section`, `Table` (three-click
sort, positions, sticky head), `ParcFerme` (the sealed state as a word and the seal mark), `PageHeader`, `Logo`,
`Glyph`, `ThemeToggle`, `BatteryPicker` and `BatteryBar`, `Ready`/`Loading`. Every figure carries its scope and the
source line: `Section source` prints "Data: ERCOT. Calculation and display: Wattness." by default.
