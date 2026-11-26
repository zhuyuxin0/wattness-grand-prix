# Stations

A station is one folder, `src/stations/<dir>/`, whose `index.ts` exports its frames. The frame lab (`lab.html`)
imports a station only when one of its frames is asked for, so a station that fails to load breaks only its own frames.
Folders starting with `_` are rigs, not storyboard frames.

## The contract

`types.ts` holds the types.

```ts
import type { StationModule } from '../types';

export const frames: StationModule['frames'] = {
  'grid.overview': async (ctx) => {
    // build into ctx.stage.scene; set the ground, fade, key, AO and camera
    return {
      time: 0,          // seconds on the frame's own clock
      note: 'What is shown; which figures are real and from which file; what is illustrative or has not run yet.',
      update(t, dt) {}, // pose everything at t, a pure function of t
      decorate() {},    // plates, ticks, key and caption, laid out against the posed camera
    };
  },
};
```

- **Ids** are `<dir>.<name>`: the lab finds the station from the prefix (or from `&station=`; failing both it asks each
  station in turn). The renderer names its files after the id.
- **`ctx`** gives the frame:
  - `stage`: the kit's stage (`lib/stage.ts` types it): `renderer`, `scene`, `camera`, `composer`, `gtao`, the
    `key`, `rim` and `fill` lights, and `setCamera`, `setKey`, `setFade`, `setGround`, `setBackdrop`, `setLight`,
    `setAO`, `setAOStrength`, `setShadowAuto`, `insertBeforeOverlay` (for a glass's grab pass).
  - `theme` (`'dark'` or `'light'`), `width`, `height` (CSS px) and `dpr`.
  - `data`: `src/data/frame-data.json`, or null if it has not been synced; `needData()` returns it or throws a message
    that says how to sync it. `layout`: `src/data/layout.json`, the storyboard's layout, or null.
  - `plates`: words over the canvas (`lib/plates.ts`): `leaders`, `ticks`, `key`, `caption`, `scope`, `project`.
  - `overlay`: an element over the canvas and under the plates, for a frame's own DOM (a screen showing live UI).
  - `wait(promise)`: the shot waits for it (an image, a texture). Textures loaded through three's loaders are waited
    for without it.
- **The handle** returns `note` (required), and optionally `time` (default 0), `steps` (fixed 1/60 s steps run up to
  the shot, default 30), `settle` (frames drawn at the shot's pose, default 3), `skin` (`'walk'`, the Hedging
  walkthrough's 1920 cut and the default, or `'intro'`), `update`, `decorate` and `dispose`.

## What the lab does

`lab.html?frame=<id>&w=1920&h=1080[&theme=light][&dpr=2]`: seeds `Math.random` before any module runs, loads the
display face, mounts the stage at that size, imports the station, calls the frame's setup, waits for `ctx.wait` and the
texture loaders, compiles every program, runs `update(time - k/60, 1/60)` for k = steps..1 and then `update(time, 0)`,
draws `settle` frames, calls `decorate`, waits for fonts, and sets `window.__ready = true` and `window.__frame` (the
GPU, render time, draw calls). Any error sets `window.__error` and shows it on the page. Without `?frame=` the page
lists every station's frames.

## Rules for a frame

- One stage and one kit (`src/kit`, the Terminal's, unchanged): no second renderer, tone curve or bloom.
- Flat colors (grounds, data marks, lines, glows) go in through `exactColor` or `lin` so they land on their hex; lit
  hardware takes the kit's materials.
- Data marks, glass, flows and outlines go on the overlay layer (`userData.overlay`, then `assignLayers`); thin,
  transparent and far things carry `userData.noAO`.
- Fit the key light's shadow box and the ground's fade to the framing.
- A frame is a pure function of its time. No wall clock, no `Math.random` (use `lib/random.ts`), no fetches: figures
  come from `ctx.data` only.
- Words are DOM plates, never painted into the 3D.
- Heights and colors encode real values through the walkthrough's scales (`lib/heat.ts`); an unknown value is hatched
  or left out, never drawn as zero.
- The note says plainly what is illustrative and what has not run yet.

## Rendering

```sh
sh scripts/sync-data.sh                 # frame data into src/data (the folder in .data-src, or an argument)
sh scripts/serve.sh 15191               # the lab on 127.0.0.1:15191
node scripts/render.mjs --port 15191 --frames _probe.rig --scale 2 --out out
sh scripts/stop.sh 15191
```
