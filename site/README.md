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
| `files.json` | `FilesIndex` | Every file above with its bytes, SHA-256 and source |

Loaders are in `src/data/load.ts`, hooks in `src/data/hooks.ts` (`useDay`, `useReceipts`, `useLateSeal`,
`useShowcaseManifest`, `useScenarios`, `useTerminalStructure`, `useBrain`); render with `<Ready state={...}>`.

## Working in parallel: the seams

Each route is one folder under `src/pages/`, owned by one lane at a time:

| Route | Folder | Term |
|---|---|---|
| `#/` | `pages/RaceWeekend` | Starting grid, qualifying, parc ferme, race day |
| `#/pit-wall` | `pages/PitWall` | The decision desk; Desert Willow's arms A, B, C |
| `#/standings` | `pages/Standings` | Scores per battery on matched conditions |
| `#/stewards` | `pages/Stewards` | The verifier anyone can run |
| `#/garage` | `pages/Garage` | Agent Studio builds the agents, AWS runs them; the Terminal graph |
| `#/paddock` | `pages/Paddock` | Team data (Living Brain), weather radar, timing screens, the season |

- A page's `index.tsx` default-exports the page; it is lazy-loaded as its own chunk, so a page can import
  `three` or d3 without weighing on the others. Routes end in `/*`, so a page owns its sub-paths
  (`#/standings/DSWL_ESS_ESR1`) with its own nested `<Routes>`.
- Put page-only components, charts, scenes and styles in the page folder (`styles.css` is already imported).
- The shared folders (`ui`, `data`, `lib`, `design`, `styles`, `shell`, `routes.tsx`, `config.ts`) are stable. When a
  page needs something new there, add a new file instead of changing an existing one.
- New published data: add `scripts/data/<page>.mjs` whose default export takes the context documented in
  `scripts/build-data.mjs` (`day`, `batteries`, `leaf(resource)`, `writeJson`, ...). Modules run in name order;
  the size, credential and date checks cover their files too.
- In-browser verification: `src/lib/merkle.ts` re-exports `packages/core`'s own `canonicalJson`, `leafHash`,
  `merkleRoot` and `rootFromProof`, so the site hashes exactly as the sealed record did.

## Design

Tokens are CSS custom properties in `src/styles/tokens.css`, mirrored for canvas and WebGL in
`src/design/tokens.ts`. Graphite surfaces, the Wattness teal for interaction and data, BNB yellow only for the
sealed state (`ParcFerme`, receipts) and the livery stripe. Libre Franklin for display, the system sans for text,
the system monospace for hashes, Barlow Condensed for timing-screen digits and table heads, all with tabular
figures. Arms A, B and C are `--arm-a`, `--arm-b`, `--arm-c` on every chart and table.

Shared components (`src/ui`): `Hash`, `Receipt`, `Countdown`, `Stat`/`StatRow`, `Section`, `Table` (three-click
sort, positions, sticky head), `ParcFerme`, `PageHeader`, `LiveryStripe`/`Mark`, `Glyph`, `Ready`/`Loading`.
Every figure carries its scope and the source line: `Section source` prints "Data: ERCOT. Calculation and
display: Wattness." by default.
