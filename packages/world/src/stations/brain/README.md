# The brain station: Living Brain, as it holds our three brains

Living Brain (by ChatAndBuild) is the Grand Prix's memory. This station draws what its API returned for our three
brains, in Living Brain's own visual language: each brain a brain-shaped cloud of glowing particles, blue at the top to
violet below, with a bright core; its pages as dots with numbered tags; its connections as thin arcs that light from a
chosen page outward; the combined view as one cloud in the center with the member brains on their orbits, tied to it by
filaments. It is our rendering of our data, not Living Brain's interface: every frame carries the scope line "Living
Brain: our three brains, drawn from its API", and the one frame that shows Living Brain's own interface says so.

| Brain (member order) | Color | Pages | Connections |
|---|---|---:|---:|
| Wattness Grand Prix: how this entry was built | `#ff6fae` | 123 | 276 (107 strong) |
| Wattness DSWL_ESS_ESR1 review: Desert Willow's review | `#8f8cff` | 1 | 0 |
| Wattness Brain: the Wattness Terminal's architecture | `#59e3b2` | 18 | 53 (20 strong) |
| Combined | | 142 | 329 own, and 55 across brains |

## The data

`brain-scene.json` (schema `gatelock-world.brain-scene.v1`) is the build's `build-brain.json` (its pages, connections,
the tab map, and the corrections written beside Living Brain's summaries where they misstate the repository) with each
page's number in Living Brain's own node order (`lb-order.json`: the graph read again through its API, GET only, Nov
25, 23:57:27 CT). `make-scene-data.py <build-brain.json> <read-again folder> <out>` rebuilds both and stops on any count
that does not match the file's own totals. A page's number is its place in its own brain, most connected first, as
Living Brain prints it on the page's tag, so a page keeps its number in every view. The browser never calls Living
Brain: the data is in the bundle.

Every number on screen is read from `brain-scene.json`, or from the frame data's `sponsors.living_brain` for the
review's remember, retrieve and cutoff. `check-figures.mjs` holds the films' lines (`film.json`, and the Living Brain
rows of `story/films.json`) to the fields they name, and every number in each frame's words to the data.

## What is data, and what is design

Data: which brains, their colors (Living Brain's member order), every page dot with its number and title, every
connection and its strength, the 55 connections across brains and when each was made (17 as the build's notes
compiled, Nov 25, 23:33 to 23:46 CT; 38 by Find links, Nov 26, 00:20:17 to 00:20:25 CT), the one conflict (found by
Find links at 00:20:22 CT, so flagged inside its burst), every count.

Design, as in Living Brain, encoding nothing: the brain's shape, where the particles and the page dots sit on it, the
core, the motes, the filaments, the orbit lights, the members' turn to their profiles, the camera and the motion.

## How it is drawn

| File | |
|---|---|
| `shape.ts` | Our own brain: a signed distance field (two hemispheres split by the fissure in their upper part, fused below its floor and leaning in at the top, so the front reads as a dome; the temporal lobes, widest in the lower third, under a lateral fissure cut deep enough to read from the side; the frontal lobe's underside stepping up from the temporal pole; the cerebellum and a short stem tucked under it, with a crease between it and the occipital lobe; folded by narrow cracks along a noise's zero set, the shell keeping its clumps to the gyri between them, so it reads as streaks with dark lines between), sampled evenly by area and scaled to Living Brain's 0.62 half-extent. No mesh file. A share of the inside particles sits deep round the core, where the hemispheres meet, so the core lights particles all round it as in Living Brain's anatomical mesh. Page dots sit only on the outer surface: none below the base, on the stem or on the medial faces. Each brain draws its particles from one pool by its seed (FNV-1a of its id), so the film, the lab and the site place everything the same way. |
| `cloud.ts` | One brain: 60,000 particles flying home from dust (Living Brain's formation: 3.2 s, a quintic ease and a swirl), twinkling and breathing; the ray-marched core; the page dots; the connections as 1.15 px ribbons that light from a chosen page outward over 2 s; their pulses. `LOOK` holds the calibration. A member tinted toward its color keeps its lower half lit (the bottom's darkening and its red cut by the untinted share only), pales toward its own luminance, and its own connections and pulses take its tint, as Living Brain tints a member 72 %. |
| `world.ts` | The combined brain, the three members on their orbits (one turn in 46 s), the filaments and the dots flowing along them, the orbit lights (lilac-white orbs filled with moving filament noise, in a soft halo), the motes, and the film's effects. The 55 links across brains are drawn at the spec's 1.6 px and 1.5 times an own connection's brightness. Posed from a plain description of one moment; the camera never moves, the world does, so one rest camera serves every frame. |
| `moments.ts`, `clock.ts` | The Living Brain sequence's one clock (LB1 to LB7) and the short clock of the films' beat; the world's pose at any second of either. On each clock the orbits' phase and each member's yaw were found together by a search, so the members show their profiles at the combined view's rests, as Living Brain's do: within 17 degrees of side-on at 13.0 and 23.0 s on the sequence's clock and within 7 over the short clock's hold (1.0 to 4.6 s), at least 2.6 member radii apart on screen, and none in front of the combined brain while the links draw (one may stand behind it, as Living Brain's Grand Prix member does). A member turns to its profile as it leaves LB1's row and back as it comes to the center. The links across brains are at full while they draw and settle to 0.6 after LB3's rest, so the combined brain reads as a brain under them. |
| `tags.ts`, `brain.css` | The words over the canvas, as DOM: numbered tags centered on their dots (Living Brain's: no leader lines; faint on the far side; one under a heavier one hidden), the member brains' names, plain first ("Grand Prix brain", "Desert Willow's review", "Terminal brain"; Living Brain's own names are in the cards), and page counts, the HUD (a number never parts from its words), the scope line, the card and the review's plates. The member tags take part in the overlap rule: their names after the beat's own page tags and before the rest, their page counts last, the farther member's giving way to the nearer's. |
| `bloom.ts` | A bright pass, bloom and vignette before the kit's output, as Living Brain's post chain. |
| `index.ts` | The frames. `interface.ts`: Living Brain's own interface, played from a recording; in a checkout without it, `brain.interface` draws LB5's moment under the scope line (our rendering, as every other frame), never a black frame, and `capture-story.mjs` refuses a film that shows it. LB7's line is `film.json`'s, its times read from the frame data; without the frame data's `sponsors.living_brain` the review's plates and that line are not drawn. |
| `pit.ts` | The garage's pit (its G03 hook): the three brains lying under the glass floor. Seen from above (the garage's hangar, the films' glimpse at 0:33), they lie alone and brighter; the Terminal's layers and parts under them are G03's. The venue's hub draws the same pit in its Team data plinth, the three brains centered, fewer particles and their sprites sized for its 5 degree lens (`lens`, `cloud.ts` lensK). |
| `inset.ts` | One brain inside another station's scene: the stack's Living Brain sphere holds the combined brain (every page of the three, their connections and the 55 across) in profile, on the night ground; on the light ground the sphere keeps its mark and the Terminal brain's constellation, where a glow washes out. The stack's hover dims it through a stand-in uniform. |
| `film.ts`, `film.json` | The story's keys, the films' Living Brain beats, and the Living Brain cut with its lines. |
| `mount.ts`, `card.ts`, `mount.css` | `mountBrain`, the Memory tab's view (the package README). |

Calibrated against Living Brain's own Explore view, measured on its renders with the same tools (the Grand Prix brain
alone, formed, at its distance 2.08 on a 37 degree lens, `render.mjs --scale 2`, Nov 27 after the anatomy pass): our
side view's height over length is 0.75 and our front view's height over width 0.91, inside the targets set from Living
Brain's (side 0.74 to 0.80, front 0.90 to 1.00; its own side view measures 0.76 to 0.77). At Living Brain's starting
angle our brain shows more of its side than Living Brain's mesh does (height over width 0.79 there against its 0.94 to
0.96): the two meshes do not face the same way, and ours is our own. The band medians at the calibration pose are within
14 per channel of its measured colors (top #3F5396, middle #5D64B2, bottom #5747AC, around the core #919FD6; the
largest differences: top 6, middle 13, bottom 6, core 4), the core a soft glow rather than a swarm of whitened
particles. In the Memory stage's all-brains view at rest (1440 x 900, three moments) the members' medians are the Grand
Prix brain's #B364A2, the review's #6B76B8 and the Terminal's #4F7F81 against Living Brain's #97569B, #635FB4 and
#5E979D: within 28 per channel, where they were 27, 16 and 46 off with their lower halves dark. One brightness cannot
bring pink and teal both within 14: the Neutral curve keeps a saturated color's hue where Living Brain's ACES pales
it, and how much of a member's box its lines and its neighbors' fill moves with its place on the orbit. The kit
tone-maps with the Neutral curve at exposure 1 where Living Brain uses ACES at 1.05, so its shader constants are the
starting point and `LOOK` brings the rendered colors back onto its measured ones.

## Frames

| Frame | Time | Shows |
|---|---|---|
| `brain.sequence` | the whole clock (rests at 23.0) | The films' frame: the story's keys rest on it at their `local` times and run its clock through their holds |
| `brain.three` | 7.0 | LB1: the three brains formed side by side, their names and page counts |
| `brain.combined` | 13.0 | LB2: the combined brain formed, the members on their orbits, the filaments |
| `brain.links` | 23.0 | LB3: the 55 connections across brains drawn inside the combined brain, the conflict flagged in rose |
| `brain.grand-prix` | 31.0 | LB4: the Grand Prix brain alone, its tags 01 to 42 |
| `brain.page` | 39.0 | LB5: Battery Tab (page 02) selected, its 20 connections lit, its card |
| `brain.across` | 48.0 | LB6: Battery Tab's 5 connections across brains, into the Terminal's brain and Desert Willow's review |
| `brain.review` | 60.5 | LB7: the review's one page: remember (version 2, 10:58:36 CT), retrieve (0 citations, then 1), the plan's 09:12:46 CT cutoff (0 pages admitted) |
| `brain.shared` | 5.0 (short clock) | The films' beat and the site's stop: the combined brain, the 55 links drawn at three times the pace, the conflict; it moves at its rest (FrameHandle.live), and on a stage narrower than it is tall it is framed as the Memory stage frames one, its words at 1x |
| `brain.interface` | 6.5 | LB8: Living Brain's own interface, Battery Tab hovered (the recording; LB5's moment where the checkout lacks it) |
| `brain.calibrate`, `-side`, `-front` | | The calibration pose, and the brain from its side and its front, without words |

## The films

`film.ts` gives the story its keys and four segments. The master's Living Brain beat after the pit wall shows the
track's verbs in turn: remember and retrieve (0:41 to 0:44: Desert Willow's review at the center, its remember plate up
and the retrieval landing, "After the seal, retrieve: a new session's answer cites Desert Willow's review. No plan reads
it."), connect (0:44 to 0:47: the combined brain on its short clock, the 55 links across brains drawing and the
conflict flagged), then Living Brain's own interface (0:47 to 0:49). The 90-second cut's (0:25 to 0:31) is connect,
then its own interface. Their lines say when: the brains were written and linked after the seal, and no plan reads them.
The site's one stop (`brainSite`, in `story/beats.ts` SITE_KEYS) stands after the weather odds, with what the day read
after the seal: the combined brain at the short clock's rest, a frame that moves at its rest (FrameHandle.live), so
the story's player runs its clock on while the visitor rests there, the members on their orbits; the site has its own
list of stops, the master's from before this beat with X05 "Your turn" kept, and never shows Living
Brain's own interface (its recording is not in a site's checkout). The Living Brain cut is LB1 to LB8 in 69 s on the sequence's clock at real time
(`capture-story.mjs --cut brain`). One world on one clock: the holds run the clock and the legs carry it on, so the
dive, the turn and the flight are the clock running, never a cross-fade.

## Living Brain's own interface

`capture-interface.mjs` records the Grand Prix brain's Explore view in one new page of a Chrome the reader has signed in
to (DevTools on a loopback port), read only: writes to Living Brain's API and its analytics beacons are refused, nothing
is captured, edited or linked. Personal details are hidden before the app draws (the page's content security policy
bypassed for that page, an init script's rule hiding the account's name, email, project and plan, and the combined
view's detail tags; then a pass over the text by name hashes kept outside the repository); the recording is refused if
any such text is visible at its end. It is resampled to 30 frames a second at 1920 x 1080 into
`storyboard/interface/frames/` with its manifest, outside git as films are; `brain.interface` draws the frame for its
local time, labeled "Living Brain's own interface · the Grand Prix brain · recorded <time> CT". Look at every frame for
names before a film uses it. A checkout that captures the master or the 90-second cut needs the folder copied in (it is
not in git): `capture-story.mjs` refuses those films without `storyboard/interface/frames/manifest.json`.
