# The story player

The approved frames as one playable story, the way wattness.tech's intro plays: one renderer and one stage for the
whole film, one seekable time that drives everything, and the stations' own frames as its rests. Built on the frame
lab's contract (`../stations/README.md`); nothing in the kit or the stations is changed.

```
story.html      the page: ?mode=site (the default) or ?mode=capture&cut=master|90s|brain&w=1920&h=1080[&captions=film|frame|none]
main.ts         its entry: the capture clock (window.__gpClock, window.__ready), the proof's shots, the frame-time probe
mount.ts        mountStory(el, { mode, theme, startBeat, onRoute }) -> { dispose, goTo, on, beats, ready, seek, player }
beats.ts        the story: its keys (stops and waypoints), their plain names, the tab each links to, the films' timings
films.json      the films' rows and on-screen lines, copied from the storyboard's index.json (its sha256 inside)
clock.ts        the film as keys on a line of seconds: locate(t), the row (line) at t, the site's stops on the same seconds
player.ts       the stage, the frames on it, the picture at t, the cross-fade, the plates, the film's line, seek(t)
instances.ts    one station frame built into the shared stage through a lens (its own group, passes, camera, plates)
state.ts        the stage state a frame leaves (lights, ground, fade, fog, AO, shadows, passes), captured and put back
moves.ts        the camera between rests: glide (camBlend on smootherstep) and hop (out of one, into the next)
rise.ts         the field rising out of W01's map as the camera pulls back from the lock
site.ts         the site's controls: wheel, click, arrow keys, swipe, the chapter rail, the tab link, reduced motion
story.css       the canvases, the layers, the film's line, the chrome; the dark tokens set again on the story's root
```

## The model

A **film** (`beats.ts`: `MASTER`, 3:00, and `CUT_90`, the 90-second cut, on `STORY.md`'s rows; the Living Brain cut,
69 s, the brain station's `film.ts`; and `SITE_KEYS`, the site's own stops, cut `site`, which site mode plays) is a list
of keys on a line of seconds. Each key is a station frame at its rest (the frame's own `time`, as the lab renders it) and holds from
`at` to `until`; into each key runs a **leg** from the key before:

- **own**: each frame on its own clock and camera. The opening is built on one clock (`stations/opening/gather.ts` T),
  so the pad, the gather, the column and the climb are its clock running; where its two looks change (the pad's
  occlusion and fade to the column's) both frames draw at the same clock and cross-fade.
- **glide**: from the last rest's camera to this one's, angles the short way and the picture's scale and lens in log
  (`lib/ease.ts` camBlend), on smootherstep. Stations share the venue's coordinates (`layout.json`), so a glide between
  neighbors is a real path (W01 to the grid, the rise to the hub's plan view at 5 degrees, the dive into the garage).
- **hop**: between stations far apart, the camera eases back out of the first along its line of sight while the second
  fades in over it, already easing in to its rest: neither picture empties into the ground between them. A side inside
  a hall backs off a little (`leg.back`), so the pit wall's camera never leaves through the roof.

Two frames of one model at one place (the stack's rest and its witness) glide, so both draw on one camera and only the
state crosses; a hop drew the model twice, at two sizes, through the fade. The dive from the garage's roof to the pit
wall is a dolly whose cross-fade waits until the camera is under the pit wall's roof (18 m): the hangar's frame, its
roof lifted, carries the descent.

Where the frames change, both are drawn in the same tick: the outgoing one is copied to a 2D canvas beneath and the
incoming one fades in over it on the WebGL canvas, as the intro's scenes cross-fade. The **lock** (the opening's climb
to 658 m onto W01's column at 12.6 m) is the pattern: `opening.column` runs its clock to the lock and `opening.lock-venue`
takes over on the same box on screen; the pull-back to W01 then raises the field out of the map, Desert Willow first
(`rise.ts`, wrapping W01's instanced columns). The incoming frame's own clock plays into its rest over the leg (the
stack's build, the arcade's coins, the seal's comet), so its motion arrives with the camera. Rests are the frames as
rendered: their clocks hold there, except where a film key runs one (`run`, below).

**A hold's clock.** A film key may run its frame's own clock through the hold (`FilmKey.run`: [seconds after `at`, local
time] pairs, linear between them): the films play it, the site rests on the beat's state (`KeyDef.local`). Parc fermé
is built this way (`stations/grid/r02.ts` LAPSE): its gate clock runs the sealed day's real stamps, the plans made at
09:12:46 CT, sealed at 09:15:17 (the ring and the root light, the receipt pylons at their block times), the gate at
10:00:00 (the boom comes down), the late plan refused at 10:00:22, and the frame's rest is the end of it. The master
plays the seal under its line and, after the weather odds, the gate and the refusal under theirs; the 90-second cut
plays all of it under its one line. The leg into a running key waits at the run's start, and the leg out leaves from
its end.

**One time.** `seek(t)` (capture) and the site's position (stops, mapped onto the same seconds with the holds left out)
both come down to `picture(t)`: which frames, at which local times, cameras and opacities. Nothing reads the wall clock
for the picture and nothing random is unseeded (story.html seeds `Math.random` before any module, as lab.html does).

**One stage.** Each frame is built into its own group in the one scene through a lens (`instances.ts`): what it adds
to the scene, the passes it inserts (glass grabs, the arcade's bloom), the cameras it asks for, its copy of the ambient
occlusion's normal material (a station patches the one it is given) and its plates are its own. Its passes go where it
asks in its own view of the post chain (the kit's passes and its own), so one frame's passes never shift another's.
Each setup starts from the stage as `createStage` left it, as each frame starts from a fresh stage in the lab; the stage
state it leaves (`state.ts`: lights, ground and fade uniforms, fog, local clipping, ambient occlusion and its defines,
the shadow refresh, its passes) is captured when it hands the stage on and put back when it takes it again. Each
frame's plates and overlay live in a layer that carries the lab root's classes and scale (`.world.intro.hwalk.is-x`,
`--u`), and what its setup put on the overlay (the arcade's screens, the towers' and the garage's displays) stays
across decorates. Frames are built lazily, one at a time (a setup writes the shared stage), their programs compiled in
parallel before their first draw, and disposed once the story has moved two keys past them.

Checked: four rests drawn by the player after other frames on the same stage (W01 after the opening; the arcade's X01,
Parc fermé's R02 and the stack's rest after W01, X01 and R02) match the frame lab's renders of the same frames pixel
for pixel (0 pixels differ at a 1% fuzz).

## Two modes

**site** (`mountStory(el, { mode: 'site', onRoute })`): the visitor moves the story with the wheel or trackpad (it
scrubs through a leg and snaps to the nearest rest), a click on the picture, the arrow keys, Page Up and Down, Space, a
swipe, or the chapter rail at the top. A step plays the leg at the film's pace; a jump across chapters lands one stop
short and plays the last leg. The rail lists the beats by plain name, the race weekend's word second and small (Jo, 26
Nov); each beat's plate carries "Open <tab>", which calls `onRoute(tabId)` with the Grand Prix site's tab id
(`site/src/shell/tabs.ts`). Plates come in once the picture has landed. At a rest nothing is drawn (no hover, no
parallax): a still pointer draws nothing. With reduced motion the rests are stills and a step cross-fades between them.
The frames ahead are built while the visitor rests. The 3D and its chrome hold dark in either site theme.

**capture** (`story.html?mode=capture`): `window.__gpClock(t)` poses the film at t seconds and resolves once the frame
has settled (its frames built, programs compiled, plates laid out, textures and fonts in); `window.__ready` is false
until then. The film's line for each row replaces the frame's caption (the frame's own plate is kept in the layout,
hidden, so a frame that sets a mark beside its caption still finds it: the stack's end card); the plates come in once
the camera lands and leave before the next leg. A frame's own screens (its overlay: the arcade's cabinet, the garage's
floors and boards, the stewards' board, the towers' displays) are part of the picture: through a leg the film lays them
out again for the leg's camera at each frame of the film, at the frame's share of the cross-fade (`player.ts` dress),
and at a rest they are whole even on a hold too short for plates. Between two frames of one world that show different
screens (`leg.screens: 'both'`, the dive from the bays to the boards) each frame's screens ride the whole leg.

```sh
sh scripts/serve.sh 15191
node scripts/capture-story.mjs --port 15191 --cut master --from 10 --to 30 --fps 60   # PNGs, then H.264 crf 14
node scripts/capture-story.mjs --port 15191 --cut 90s                                 # the whole 90-second cut
node scripts/capture-story.mjs --port 15191 --cut brain                               # the Living Brain cut, 69 s
node scripts/capture-story.mjs --port 15191 --shots --scale 2                         # every rest and two mid-legs a part
node scripts/capture-story.mjs --port 15191 --measure 10,30 --gpu                     # real-time frame intervals
sh scripts/stop.sh 15191
```

`--scale 2` shoots at 3840 x 2160 and the encode brings it to 1920 x 1080 with Lanczos. `--frames <dir>` keeps the PNGs
apart from the film (20 s at 60 fps is about 1,200 PNGs, a gigabyte at scale 1).

## Proof and frame time

`storyboard/player/`: every key at rest and two moments inside each part's legs, through the player at 1920 x 1080
(`shots-master.json` lists each with its film time, frames, local times and opacities); `film-master/master-10-30.mp4`,
the master from 0:10 to 0:30 at 60 fps (H.264, crf 14): the column's climb, the lock, the field rising, the drive to
the grid and the rise to the map; `measure-master-*.json`, the frame time; `site-*.png`, the site mode.

Measured on this Mac (Apple M1 Max, Chrome's ANGLE on Metal, headless) with other agents' renders sharing the GPU (its
load 50 to 57% before each run): drawing each frame of a range one at a time and waiting for the GPU,

| range | at | mean | median | 95th | worst |
|---|---|---:|---:|---:|---:|
| 0:10 to 0:30 (opening, lock, W01, grid, map) | 1920 x 1080 | 2.6 ms | 1.4 ms | 7.2 ms | 47 ms |
| 0:41 to 1:01 (the arcade, X01 to X04) | 1920 x 1080 | 21.3 ms | 15.3 ms | 49 ms | 261 ms |
| 2:40 to 3:00 (the stack) | 1920 x 1080 | 5.7 ms | 4.5 ms | 12.6 ms | 23 ms |
| 0:10 to 0:30 | 3840 x 2160 | 7.2 ms | 2.6 ms | 26.3 ms | 98 ms |

Played in real time on the animation frame, the opening's range held 120 frames a second at 1080 (95th 9.3 ms) and the
arcade's 60 (median 16.7 ms, 95th 33.4 ms). The arcade's frames (about two million triangles each, a bloom and a glass
grab) are the heavy part; the worst frames are a cross-fade's double draw and a frame's first upload.

## Open

- **Screens in the site's moves.** The film lays each frame's screens out again at every frame of a leg; the site,
  which plays on the animation frame, still shows them with the plates, at rests.
- **Screens are page text.** A frame's screens are drawn over the canvas, so geometry never hides them; the films
  keep them clear of the cases where it should (the dive's floors go before the boards stand over them, and a floor
  screen turned past 75 degrees, toward upside down, is hidden: `stations/garage/screen.ts` upright).
- **The site's lines.** The site shows each frame's own caption; the film's line replaces it only in a capture.
- **A plate laid out before the line moves.** `dress` hands the frame's scope height to the film's line
  (`--hw-scope-h`) after the frame has laid out its plates; where a scope wraps to a second row the line rises after
  the plates were placed against it, and a plate could sit under the line's new top. Not seen in the stills rendered
  for the check beat, Parc fermé, the pit wall and the stack's seal views.

The check beat shows the stewards' bay on the sealed copy (`grid.R03-pass`, every lamp teal, under "All five checks
pass"); the tamper that follows cross-fades into the changed copy (`venue.stewards`, three red). Words that a frame
wraps in its flavor (`words/index.ts` caption, the garage's own) return the film's line, so its plates keep off the
line, not off the hidden caption.

## The API

```ts
import { mountStory } from '@gatelock/world/src/story/mount';
const story = mountStory(el, { mode: 'site', theme: 'light', startBeat: 'the-map', onRoute: (tab) => navigate(tab) });
story.on('beat', (b) => {});   // { index, id, name, term, part, tab, frame }; also 'ready', 'route', 'end', 'error'
story.goTo('stack');           // a beat's index or id (story.beats)
story.dispose();
```
