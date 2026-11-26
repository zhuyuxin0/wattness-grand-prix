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
| `files.json` | `FilesIndex` | Every file above with its bytes, SHA-256 and source |

Loaders are in `src/data/load.ts`, hooks in `src/data/hooks.ts` (`useDay`, `useReceipts`, `useLateSeal`,
`useShowcaseManifest`, `useScenarios`, `useTerminalStructure`, `useBrain`); render with `<Ready state={...}>`.

## Working in parallel: the seams

The site is an app shaped like the Wattness Terminal: a masthead, a side panel of grouped tabs, and the page. The
panel, the routes and the overview's paths all read one list, `src/shell/tabs.ts`; a group or a tab is one entry
there, in the pipeline's order. Each tab is one folder under `src/pages/`, owned by one lane at a time:

| Group | Tab | Route | Folder |
|---|---|---|---|
| | Intro | `#/` | `pages/Intro` (the 3D story's stage) |
| Today | Overview | `#/overview` | `pages/Overview` |
| Plans | Fleet | `#/fleet`, `#/fleet/<resource>` | `pages/Fleet` |
| Plans | Battery | `#/battery`, `#/battery/<resource>` | `pages/Battery` |
| Agents | Forecast | `#/agents/forecast` | `pages/Forecast` |
| Agents | State of Charge | `#/agents/state` | `pages/StateOfCharge` |
| Agents | Hedge | `#/agents/hedge` | `pages/Hedge` |
| Agents | Risk | `#/agents/risk` | `pages/Risk` |
| Agents | Memory | `#/agents/memory` | `pages/Memory` |
| On Chain | Seal | `#/seal` | `pages/Seal` |
| On Chain | Verify | `#/verify`, `#/verify/<resource>` | `pages/Verify` |
| On Chain | Files | `#/files` | `pages/Files` |
| About | How It Works | `#/about` | `pages/HowItWorks` |
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
- New published data: add `scripts/data/<page>.mjs` whose default export takes the context documented in
  `scripts/build-data.mjs` (`day`, `batteries`, `leaf(resource)`, `writeJson`, ...). Modules run in name order;
  the size, credential and date checks cover their files too.
- In-browser verification: the Verify tab hashes with `src/pages/Verify/verify/core.ts`, a second implementation
  written apart from `packages/core`; `test/stewards.test.mjs` holds it to the sealed leaves and, once
  `packages/core` is built, to core's own `leafHash`.

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
