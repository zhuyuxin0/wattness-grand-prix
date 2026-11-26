# @gatelock/world

The 3D world of Wattness Grand Prix. It tells the story of one operating day, from one real battery to every ERCOT
battery, their plans sealed on BNB Chain before the market closes, and the checks anyone can run. It also holds
ONE PLAN, an arcade cabinet where a visitor plans Desert Willow's day and seals the plan from their own wallet on BSC
testnet, and the stack, a live map of what the entry is built from. It runs on three.js 0.187.0 and on the stage and
kit of wattness.tech's intro, and it renders dark in either site theme, as that intro does.

The package's surface is four mounts. Each takes an element, fills it, and returns a handle:

| Mount | What it shows | Where the site puts it |
|---|---|---|
| `mountStory` | The story, beat by beat, as one film on one stage | Intro (`#/`) |
| `mountOnePlan` | ONE PLAN, playable, with the seal | Markets → ONE PLAN |
| `mountStack` | The stack: every piece with its role and its real integration | The story's end, and an About view |
| `mountBrain` | Living Brain as it holds our three brains: the combined view, each brain, each page's connections | Agents → Memory |

## Layout

```
src/story/       the story player: mountStory, the beats, the two films' timings, capture mode
src/game/        ONE PLAN, playable: mountOnePlan, the scoring model, the seal (EIP-1193, BSC testnet only)
src/stations/    one folder per station (opening, world, grid, venue, garage, game, towers, stack, brain): its frames;
                 the stack's folder also holds mountStack, the brain's mountBrain
src/words/       plain-first captions: the plain meaning as the head, the racing term as a small line under it
src/kit/         the stage and kit of wattness.tech's intro, carried unchanged (PROVENANCE.md)
src/lib/         the world's additions around the kit: stage options, plates, easing and camera blends,
                 seeded randomness, theme tokens
src/data/        the frame data (synced, not committed) and the venue's layout (committed)
lab.html         the frame lab: any station frame by id, at an exact size
scripts/         serve.sh and stop.sh, render.mjs (stills), capture-story.mjs (films), sync-data.sh
storyboard/      the committed stills and their receipts; films and PNG sequences stay out of git
```

## Data

Every figure on screen comes from `src/data/frame-data.json` or from a file it cites: the sealed record for Nov 26,
2026 (316 plans under one root), Desert Willow's 301 price scenarios and its three plans, and the fleet. The stations'
own records sit beside their code: the garage's `ids.json` and `inputs.json`, the stack's `integrations.json` and
`greenfield-record.json`, the brain station's `brain-scene.json` (what Living Brain's API returned for our three brains,
`src/stations/brain/README.md`).

`frame-data.json` is built outside the repository and copied in by `sh scripts/sync-data.sh <folder>` (or the folder
named in `.data-src`); it is not committed. `layout.json`, the venue's layout from the same storyboard, is committed:
the sync compares the two and keeps the committed copy unless `--layout` is passed. Each mount reads them from
`src/data/`; `mountOnePlan` and `mountStack` also take the frame data as `data`.

In the snippets below, `@world` is this package's `src/` folder, aliased in the host's Vite config (see
[In the site](#in-the-site)).

## mountStory

```ts
import { mountStory } from '@world/story/mount';

const story = mountStory(el, { mode: 'site', theme: 'light', onRoute: (tab) => navigate(tab) });
story.on('beat', (beat) => {});   // { index, id, name, term, part, tab, frame }
story.goTo('the-map');
story.dispose();
```

| Option | Default | |
|---|---|---|
| `mode` | `'site'` | `'site'`: the visitor moves it. `'capture'`: the caller poses the film with `seek(t)`. |
| `theme` | `'dark'` | The site's theme, recorded on the story's root as `data-site-theme`. The 3D and its chrome stay dark. |
| `startBeat` | `0` | A beat's index or id (`'desert-willow'`, `'the-map'`, `'stack'`, ...). In capture, the second to open on. |
| `onRoute(tab)` | | Called by a beat's `Open <tab>` button with one of the site's tab ids: `intro`, `overview`, `fleet`, `battery`, `forecast`, `state`, `hedge`, `risk`, `memory`, `seal`, `verify`, `files`, `season`, `launchpad`, `one-plan`, `about`, `add-agent`. |
| `cut` | `'master'` | Capture only: `'master'` (3:00), `'90s'`, or `'brain'` (the Living Brain cut, 69 s). |
| `captions` | site `'frame'`, capture `'film'` | Each frame's own caption, the film's line for each row, or `'none'`. |
| `dpr` | site `min(devicePixelRatio, 2)` | Drawing-buffer pixels per CSS pixel. |
| `reducedMotion` | the visitor's `prefers-reduced-motion` | Rests as stills, with cross-fades between them. |

The handle:

- `beats`: the stops in order, each `{ index, id, name, term, part, tab, frame }`. `name` is the plain meaning and
  `term` the racing term, when the beat has one ("Plans sealed before the market closes", then "parc fermé").
- `ready`: resolves once the first picture is on screen.
- `goTo(beat)`: a beat's index or id.
- `on(event, fn)`: `'ready'`, `'beat'`, `'route'`, `'end'` or `'error'`. Returns its own unsubscribe.
- `seek(t, dt?)`: capture mode. Poses the film at `t` seconds and resolves once the frame has settled.
- `dispose()`.

In site mode the story plays the site's own stops (`beats.ts` SITE_KEYS: the master's keys from before Living Brain's
beat, X05 "Your turn" kept, with Living Brain's one stop after the pit wall; never Living Brain's own interface, whose
recording a site's checkout does not hold). The wheel or trackpad scrubs through a move and snaps to the nearest rest. A click, the arrow keys, Page
Up and Page Down, Space, Home and End, a swipe and the chapter rail along the top step through the beats. The wheel
is the story's while the pointer is over it; the keys act while the story has focus or the pointer, or while nothing
on the page has focus. The story fills the element and follows its size. At a rest with a still pointer nothing is
drawn.

Frames are built one at a time as the story reaches them, their shaders compiled before they first draw, and released
once the story is two keys past them (a key is a beat, or a point a move passes through).

## mountOnePlan

```ts
import { mountOnePlan } from '@world/game';

const game = mountOnePlan(el, { mode: 'play', theme: 'light', onSeal: (receipt) => {} });
game.setTheme('dark');
game.dispose();
```

| Option | Default | |
|---|---|---|
| `theme` | `'dark'` | The deck under the stage follows it. The stage stays dark. |
| `mode` | `'play'` | `'play'`: the stage at 16:9 of the element's width, then a deck with the controls, the seal and the read-out. `'story'`: the controls and read-out laid over the stage in dark glass. |
| `onSeal(receipt)` | | Called once the transaction is mined and its `Committed` event read back. |
| `data` | the synced frame data | The field: Desert Willow's sealed day. |
| `ethereum` | `window.ethereum` | The visitor's wallet (EIP-1193). |
| `codeHash` | zero | The record's code hash. |
| `plan` | the planner's sealed plan (C) | `{ step: 0..20, glass: number[24] }`. |
| `now` | the page's clock | Unix seconds, for the gate check. |
| `dpr` | `min(devicePixelRatio, 2)` | |
| `camera` | fitted to the layout | A camera pose, for a host that frames the cabinet itself. |
| `still` | `false` | One frame, no animation. |

The handle: `ready`, `field()`, `getPlan()`, `setPlan(plan, { animate })`, `played()`, `setTheme(theme)`,
`select(hour)`, `render()` and `dispose()`. `played().score` holds the plan's mean, worst-tenth average (`cvar`), score
(`objective`), worst day and 301 day totals in integer micro-dollars, the count of days that lose money, and the
collateral in cents.

How it plays:

- The schedule dial blends plan A (no hedge) into plan C (schedule and hedge chosen together) in 21 detents.
- Glass is dragged onto an hour and along its lane, or set with the keys or the 10, 25, 50 and Cap buttons, from zero to
  the hour's cap, on the eight hours the battery moves energy.
- An hour whose glass exceeds what the schedule delivers lights up ("hedged, not delivered"). "Fit the glass" trims it.
- The score is the planner's own objective over the 301 sealed price scenarios: the mean minus half the worst tenth's
  average loss. The page computes it exactly, and the tests hold it to the engine to the micro-dollar at every detent.
  Each scenario's day lands as a coin in its $250 tube.

Seal my plan uses only the visitor's wallet; the page never holds or asks for a key. The plan becomes one canonical
JSON document (`gate-record.arena-plan.v1`), and its leaf hash is the root committed to GateRecord under
`gate-record/arena/one-plan/<battery>`. The seal runs on BSC testnet (chain 97) only: the wallet is asked to switch to
it, and the chain is checked again right before sending. The gate is checked against the page's clock and the chain's
latest block, and an existing record is read first. After mining, the panel shows the receipt and offers the leaf as
a JSON download. Once a field's gate has passed, the cabinet plays it as practice.

## mountStack

```ts
import { mountStack } from '@world/stations/stack/mount';

const stack = mountStack(el, { theme: 'dark', onRoute: (tab) => navigate(tab) });
```

| Option | Default | |
|---|---|---|
| `theme` | `'dark'` | The 3D's own theme. The site passes `'dark'` in either page theme. |
| `onRoute(tab)` | | Called with the tab that shows a piece. |
| `data` | the synced frame data | |
| `key` | `true` | The key card, bottom right (hidden under 720 px). |
| `dpr` | `min(devicePixelRatio, 2)` | |
| `still` | the visitor's `prefers-reduced-motion` | The moving marks along the lines hold still. |

The handle: `ready`, `pieces` (every piece's id), `hover(id | null)`, `screenOf(id)` (a point on screen where the piece
is under the pointer) and `dispose()`.

Hovering or tapping a piece opens its card: its role and its real integration, with contracts and transactions linked
to the explorer. A click, a second tap or the card's button calls `onRoute`. Every piece is also a button in a visually
hidden list: focus opens its card, Enter routes, Escape closes. The stack sizes itself to the element, follows its
size, and stops drawing while it is out of view.

The routes (`ROUTES` in `pieces.ts`):

| Pieces | Tab |
|---|---|
| ERCOT | `fleet` |
| Wattness Terminal | `about` |
| Cournot | `risk` |
| ElectronX, Hedger | `hedge` |
| BNB Agent Studio, the hosted agents (AgentCore: the evaluator and the Forecaster) | `agents` (the site's Agent IDs) |
| Forecaster, Market reader | `forecast` |
| State keeper | `state` |
| Risk officer | `risk` |
| Planner | `battery` |
| Living Brain | `memory` |
| GateRecord | `seal` |
| BNB Greenfield, the edge Worker (Cloudflare) | `files` |
| Verifier | `verify` |
| Atlas, CoinMarketCap | `prices` |
| Arena | `add-agent` |
| Flap | `season` |
| OpenFour | `launchpad` |

## mountBrain

```ts
import { mountBrain } from '@world/stations/brain/mount';

const brain = mountBrain(el, {
  theme,                                                  // the page's theme; the 3D holds dark in both
  tabs: TABS.map(({ id, label }) => ({ id, label })),     // which "Open <tab>" buttons may show
  initial: { brain: 'all', page: null },                  // from the URL: ?brain=&page=
  onRoute: (tabId) => navigate(tabId),
  onState: ({ brain, page }, { history }) => syncUrl(brain, page, history),
});
brain.goTo({ brain: 'grand-prix', page: 'battery-tab' });
brain.dispose();
```

| Option | Default | |
|---|---|---|
| `theme` | `'dark'` | The page's theme. The stage holds dark; the list without WebGL follows it. |
| `tabs` | none | The host's tabs, `{ id, label }`: a page that is a tab's own shows "Open <label>", and a page a tab lists among its related pages shows "Part of: <label>". |
| `initial` | `{ brain: 'all', page: null }` | `brain`: `'all'`, `'grand-prix'`, `'terminal'` or `'battery-review'`. A page needs its brain (slugs repeat: `wattness-terminal` is in two). Opening on a page skips the formation. |
| `onRoute(tabId)` | | "Open <tab>" or "Part of" clicked. |
| `onState(state, { history })` | | The visitor changed the view: focusing a brain asks for `'push'`, selecting a page `'replace'`. The mount never writes the URL. |
| `dpr` | `min(devicePixelRatio, 2)` | 1.5 at most on phones. |
| `quality` | `'auto'` | Full clouds (60,000 particles each) on desktop, a member on its orbit drawing 24,000 of them at 1.25 times the brightness; under 720 px or on a coarse pointer 30,000, and 12,000 drawn for a brain on its orbit. |
| `reducedMotion` | the visitor's `prefers-reduced-motion` | Formed at once; no turn, twinkle, breathing, motes or orbits (the members held where the films' short clock has them at 3.0 s); moves are 200 ms. |
| `corrections` | none | The host's corrections beside Living Brain's text where brain-scene.json has none: a page's keyed `'brain/slug'`, a connection's `'brainA/a>brainB/b'` (either order). The site passes the ones its `build-brain.json` carries. |

The handle: `ready`, `state()` (`{ brain, page }`), `goTo({ brain, page })` (no `onState` for the host's own moves),
`setTheme(theme)` (the list without WebGL follows it),
`on('state' | 'route' | 'ready' | 'error', fn)` (returns its unsubscribe), `screenOf(brain, slug)` and `dotOf(brain,
slug)` (where a page's tag or dot is, for checks and recordings), `brainAt(brain)`, and `dispose()`.

How it plays: the combined view forms from dust once per page load (3.2 s), the three member brains orbiting it and
showing their profiles, as Living Brain's do; the links across brains settle to 0.6 of their brightness once formed and
come back to full while a page is lit. A member clicked (its cloud, its name, or its chip top right) comes to the
center over 1.4 s, turning to face the camera, and its tags resolve; "All brains" or Escape goes back. A page's tag (or
dot) hovered lights its connections, wiping out from it over 2 s, and shows a small card; clicked, its card pins on the
right (a bottom sheet in the narrow layout): Living Brain's summary as it wrote it, the correction beside it where the
summary misstates the repository or the chain record (the scene's, or the host's `corrections`), the conflict across brains where the page is in it, and its connections in its brain and
across brains, each with its strength and match; a row selects its page, in another brain after that brain comes to the
center. While a page is selected, hovering another shows its small card and keeps the selection's connections lit, and a
tag that slides under a still pointer as the view moves never takes the hover. A page with links across brains turns
the view so the brains they reach stand to its sides. Drag, wheel and pinch are Living Brain's controls (damping,
distance 1.4 to 7, or farther where a tall stage's framing needs it; a wheel's notch eased over about 120 ms); its slow
turn pauses while the visitor moves it and for 4 s after. Every page is a button in a visually hidden list (focus shows
its card, Enter selects); arrow keys turn the view when the stage has focus, and Escape keeps working after a chip, a
card's row or a list button (they update in place, or focus returns to the stage). The narrow layout (under 800 px, or
wherever the HUD and the chips would meet in their row) puts the chips at the bottom over the scope line and the card in
a bottom sheet, and a "Pages" button opens the pages as a drawer; on a stage taller than it is wide the all-brains view
is framed by the orbit, drawn in so the members and their names stay on the stage. Without WebGL the brains' pages are
the view, as lists scrolling inside the host's box; a page picked there comes with its brain, as the deep link needs. It
draws only while visible.

The host gives the element its size (the Memory tab: full width, `height: clamp(480px, 70vh, 820px)`), with the tab's
tables under it. The deep link is the host's: `#/agents/memory?brain=<all|grand-prix|terminal|battery-review>&page=<slug>`,
read into `initial` and written back from `onState`.

## In the site

The site (`site/`) is Vite with React 18 and hash routes. Each mount goes in a page component: mounted once in an
effect, disposed in its cleanup, and loaded with a dynamic import so three.js and the frames stay in their own chunk.

| Page | Route | Mount |
|---|---|---|
| Intro | `#/` | `mountStory(el, { mode: 'site', theme, onRoute })` |
| Markets → ONE PLAN | its tab under Markets | `mountOnePlan(el, { mode: 'play', theme, onSeal })`, with `setTheme` when the visitor switches |
| About: How It Works | `#/about` | `mountStack(el, { theme: 'dark', onRoute })`; the story ends on the same stack |
| Agents → Memory | `#/agents/memory` | `mountBrain(el, { theme, tabs, initial, onRoute, onState })` over the tab's tables |

```tsx
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { TABS } from '../../shell/tabs';

export function StoryStage({ theme }: { theme: 'light' | 'dark' }) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    let handle: { dispose(): void } | null = null;
    let gone = false;
    import('@world/story/mount').then(({ mountStory }) => {
      if (gone || !ref.current) return;
      handle = mountStory(ref.current, {
        mode: 'site',
        theme,
        onRoute: (id) => {
          const tab = TABS.find((t) => t.id === id);
          if (tab) navigate(tab.path);
        },
      });
    });
    return () => { gone = true; handle?.dispose(); };
  }, []);
  return <div ref={ref} className="story-stage" />;
}
```

The element needs a size: the story and the stack fill it, and ONE PLAN's play mode takes its width. The site resolves
the package's sources by an alias and keeps one three.js, its own 0.187.0, so the package builds from the site's own
install. In `site/vite.config.ts`, beside the entries already there:

```ts
resolve: {
  alias: { '@world': resolve(here, '../packages/world/src') },
  dedupe: ['three'],
},
server: { fs: { allow: [resolve(here, '../packages/world/src')] } },
```

The site type-checks with stricter options than this package (`noUncheckedIndexedAccess`, `noUnusedLocals`,
`noUnusedParameters`), so it declares the mounts' types at the boundary, in a `.d.ts` of its own
(`declare module '@world/story/mount' { ... }`, and the same for `@world/stations/brain/mount`) with no `paths` entry
for `@world`, rather than checking the package's sources. The frame data is synced into `src/data/` before the site builds.

The 3D renders dark and holds dark in both site themes, as wattness.tech's intro does. `theme` changes only what sits
in the page: ONE PLAN's deck, and the site's theme recorded on the story's root.

## Frame lab and stills

```sh
pnpm install                                   # at the repository root
sh scripts/sync-data.sh <folder>               # once, and whenever the frame data changes
sh scripts/serve.sh <port>                     # 127.0.0.1 only; reserved ports are refused
node scripts/render.mjs --port <port> --frames grid.R02,stack.rest --scale 2 --out out
sh scripts/stop.sh <port>
```

`lab.html?frame=<id>&w=1920&h=1080` mounts one frame, poses it at its own time on a fixed-step clock, draws until the
picture has settled and sets `window.__ready`. Without `?frame=` it lists every station's frames. `render.mjs` shoots
each frame to `<id>.png` with a JSON receipt (render time, the GPU's renderer string, console warnings). `--scale 2`
shoots 3840 x 2160 and brings it to 1920 x 1080 with Lanczos; `--theme light` renders the light cut; `--repeat 2` draws
each frame twice and reports whether the PNGs match.

## Films

The story plays as two films, the 3:00 master and the 90-second cut, captured frame by frame on the player's own
clock at 1920 x 1080 and 60 frames a second, and encoded as H.264 (crf 14, yuv420p, faststart). A third, the Living
Brain cut (`--cut brain`, 69 s), is the brain station's whole sequence: three brains, combined, linked across, the Grand
Prix brain, one page and its links across brains, remember and retrieve, and Living Brain's own interface. The master's
Living Brain beat is 0:41 to 0:49 (retrieve, connect, then Living Brain's own interface) and the 90-second cut's 0:25 to
0:31 (connect, then its own interface; `src/stations/brain/film.ts`). Living Brain's own interface plays from a recording
kept out of git (`storyboard/interface/frames/`, made by `src/stations/brain/capture-interface.mjs`): a checkout that
captures these films needs that folder copied in, and `capture-story.mjs` refuses them without it.

```sh
sh scripts/serve.sh <port>
node scripts/capture-story.mjs --port <port> --cut master --out storyboard/cut --frames <dir>
node scripts/capture-story.mjs --port <port> --cut 90s --out storyboard/cut --frames <dir>
node scripts/capture-story.mjs --port <port> --cut brain --out storyboard/cut --frames <dir>
sh scripts/stop.sh <port>
```

- `--from` and `--to` capture a range. Frames are numbered from the film's start, so ranges can render side by side
  into one folder with `--no-encode`, and one `--encode-only` run over the whole film encodes them.
- `--scale 2` captures at 3840 x 2160 and encodes at 1920 x 1080.
- `--captions film | frame | none` picks the words: the film's line for each row by default.
- Each run writes `<cut>-<from>-<to>.mp4` and a JSON receipt beside it: frames, timings and any errors.
- `--shots --scale 2` renders the proof stills: every key at rest and two moments inside each part's moves.
- `--times 12.5,47` renders stills at those seconds.
- `--measure 10,30 --gpu` measures frame time over a range.

A PNG frame at 1920 x 1080 is about a megabyte, so `--frames` belongs outside the repository; the ignore rules keep
PNG sequences and films out of git in any case.

## Checks

From the repository root:

```sh
pnpm --filter @gatelock/world typecheck
pnpm --filter @gatelock/world build       # dist/: the lab, the story, ONE PLAN, the stack's and the Memory tab's demo pages
node_modules/.bin/vitest run --config packages/world/src/game/vitest.config.mjs
```

From this folder, with the pages served (`sh scripts/serve.sh <port>`):

```sh
node src/game/play.check.mjs --port <port>                         # ONE PLAN played in headless Chrome
node src/stations/stack/demo/check.mjs --port <port> --out <dir>   # every piece's card and route
node src/stations/brain/demo/check.mjs --port <port> --out <dir>   # every brain, the 28 tags, a card, routes, keys, phones
node src/stations/brain/check-figures.mjs --port <port>             # every number the brain frames and lines show, traced
```

The game's tests hold the page's scoring to the engine (`packages/engine`) and its hashing and chain calls to
`packages/core` and viem, using the sealed fixtures in `fixtures/od-20261126`. The play check turns the dial, drags
glass, fits it, and seals against a scripted wallet in the page; no request leaves the page.

The pages for each mount: `src/story/story.html` (`?mode=site&beat=<id>`, or
`?mode=capture&cut=master|90s|brain&w=1920&h=1080`), `src/game/play.html` (`?mode=`, `theme=`, `arm=`, `dial=`, `glass=`),
`src/stations/stack/demo/index.html` (`?theme=`) and `src/stations/brain/demo/index.html` (`?theme=`, `brain=`, `page=`).

The render, capture and check scripts drive headless Chrome on the GPU through a launcher module named by
`WORLD_BROWSER_LIB`. It exports `launch()` and `guardRequests()`: Playwright's Chromium with a temporary profile and
TMPDIR, and every request outside the served origin refused.

## The kit

`src/kit/` is the stage and kit of wattness.tech's intro: the Wattness Terminal's landing intro and its Hedging
walkthrough. It is carried unchanged and published here with the agreement of Wattness's founder. `PROVENANCE.md`
lists every file with its source path, its git blob and the few lines changed to fit it here. The world
wraps the kit and never edits it: `src/lib/` and `src/words/` hold what the stations add. Libre Franklin ships under the
SIL Open Font License (`src/kit/fonts/OFL.txt`).
