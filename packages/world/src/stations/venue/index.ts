// The venue's frames: V01 the hub (the venue at night, seen as section 01's flowchart), V02 the drive down lane A7,
// V03 the stewards' bay beside its page (the 3D half; the page is captured from the site's preview and set beside it),
// V04 the closing. Specs: the storyboard's STORYBOARD.md and frames.json, group "venue".
import './venue.css';
import * as THREE from 'three';
import type { CameraPose } from '../../lib/stage';
import { buildVenue, type Venue } from './venue';
import { buildStewardsBay, type CheckState } from './stewards';
import { buildBoard, quadMatrix, tamperOf } from './board';
import { assignLayers } from '../../lib/stage';
import { PLINTH_H, RIM } from './ground';
import { halo, pool, radialTex, HEX } from './look';
import { fromSvg } from './layout';
import type { FrameContext, FrameHandle, StationModule } from '../types';
import { inFilm, yours } from '../../lib/yours';
import { chipsReady, logoChip, type LogoId } from '../../kit/logos';

const NIGHT = { key: { color: '#93a8d4', intensity: 0.32 }, rim: { color: '#7f95c0', intensity: 0.22 }, fill: { sky: '#46597d', ground: '#15130f', intensity: 0.42 }, env: 0.06, shadow: 0.16 };
const BACKDROP = { top: '#101315', horizon: '#1f2429', bottom: '#14171a', glow: '#2b3036', ground: '#14171a' };

const fmt = (n: number) => n.toLocaleString('en-US');

/** An element over the canvas at a stage point; anchor 'tl' puts its top-left there, 'c' its center. */
function placeEl(ctx: FrameContext, e: HTMLElement, at: { x: number; y: number } | null, anchor: 'tl' | 'c' | 'bl' = 'tl') {
  e.style.position = 'absolute'; e.style.left = '0'; e.style.top = '0';
  ctx.plates.root.appendChild(e);
  if (!at) { e.remove(); return null; }
  const w = e.offsetWidth, h = e.offsetHeight;
  const x = anchor === 'c' ? at.x - w / 2 : at.x, y = anchor === 'c' ? at.y - h / 2 : anchor === 'bl' ? at.y - h : at.y;
  e.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  return { x, y, w, h, el: e };
}

/** A word or a pill over the canvas at a stage point (placeEl's anchors). */
function place(ctx: FrameContext, cls: string, parts: (string | [string, string])[], at: { x: number; y: number } | null, anchor: 'tl' | 'c' | 'bl' = 'tl') {
  const e = document.createElement('div');
  e.className = `intro-tick ${cls}`;
  for (const p of parts) {
    if (typeof p === 'string') e.appendChild(document.createTextNode(p));
    else { const s = document.createElement('span'); s.className = p[0]; s.textContent = p[1]; e.appendChild(s); }
  }
  return placeEl(ctx, e, at, anchor);
}

/** The next 10:00 CT gate after the frame data was built: the sealed day's gate a day on, while that is after it. */
function nextGate(d: any) {
  let unix = d.sealed_day.gate.unix as number;
  while (unix <= d.built.unix) unix += 86400;
  const ct = new Date((unix - 6 * 3600) * 1000), od = new Date((unix + 86400 - 6 * 3600) * 1000);
  const mon = (t: Date) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t.getUTCMonth()];
  const day = (t: Date) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.getUTCDay()]}, ${mon(t)} ${t.getUTCDate()}`;
  const hm = (t: Date) => `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
  return { unix, ct: `${day(ct)}, ${hm(ct)} CT`, od: `plans for ${mon(od)} ${od.getUTCDate()}` };
}

// ── V01 · the hub ────────────────────────────────────────────────────────────────────────────────────────────
const HUB: CameraPose = { target: [0, 0, 10], az: 180, el: 64, dist: 7300, vfov: 5, shift: [0, -0.02], near: 140, far: 9600 };
// Plain names only on the hub (Jo, Nov 26): each station by what it does, the site's tab name where it has one (Fleet,
// Forecast, State of Charge, Hedge, Risk, Memory, Seal, Verify), the role or sponsor in brackets; no racing words.
const STATION_WORDS: Record<string, [string, string]> = {
  'starting-grid': ['Fleet', '(ERCOT)'], 'weather-radar': ['Weather odds', '(Kalshi via Cournot)'], 'garage': ['Workshop', '(six agents)'],
  'race-day-forecast': ['Forecast', '(Forecaster)'], 'fuel-and-wear': ['State of charge', '(State keeper)'], 'spotter': ['Input files', '(Market reader)'],
  'setup': ['Hedge', '(Hedger)'], 'risk-desk': ['Risk', '(Risk officer)'], 'pit-wall': ['Plan', '(Planner)'], 'team-data': ['Memory', '(Living Brain)'],
  'parc-ferme': ['Seal', '(GateRecord)'], 'race-day': ['Operating day', '(Settlement witness)'], 'stewards': ['Verify', '(Verifier)'],
  'timing-screens': ['Prices', '(Atlas + CMC)'], 'arena': ['Game and rankings', ''], 'season-purse': ['Season', '(Flap)'], 'license-to-launch': ['Launchpad', '(OpenFour)'],
};
// the diagram's pills as the owners' logo chips (Jo, Nov 26: one official set, white glass, each a link to its owner
// in a new tab), centered where section 01 draws its pills (rect x, y, w, h in its viewBox); a caption names the
// product where it wears its owner's logo
const TAGS: [LogoId | LogoId[], string | undefined, number, number, number, number][] = [
  ['cournot', undefined, 150, 262, 88, 18], ['livingbrain', undefined, 586, 238, 112, 18], ['agentstudio', undefined, 306, 322, 146, 18],
  ['bnbchain', 'Mainnet', 868, 134, 100, 18], [['atlas', 'cmc'], undefined, 846, 396, 122, 18], ['flap', undefined, 560, 552, 56, 18],
  ['openfour', undefined, 880, 552, 90, 18],
];

async function hub(ctx: FrameContext): Promise<FrameHandle> {
  const { stage } = ctx;
  // the pane's grab at full resolution with one light pass: the bays read through the glass, softened, not frosted
  const v: Venue = await buildVenue(ctx, { shadow: 0.3, roof: { blurPasses: 1, blurRadius: 0.9, fillA: 0.07, clamp: 0.9, sheen: 0.06, grabDiv: 1 } });
  stage.setBackdrop(BACKDROP);
  stage.setLight(NIGHT);
  stage.setFade({ center: [0.5, 0.5], screen: [0.62, 1.25], world: [640, 1500], worldCenter: [0, 10], glow: [0.5, 0.42] });
  // the moon high, so the masts' and towers' shadows stay short beside them instead of streaking across the boxes
  stage.setKey({ az: 205, el: 58, center: [0, 0, 10], radius: 640, intensity: 0.5, rimAz: 30, rimIntensity: 0.24 });
  stage.setAO({ radius: 2.5, scale: 1.0, thickness: 2.0, distanceFallOff: 1, samples: 16 });
  stage.setShadowAuto(true);
  const d = v.d, sd = d.sealed_day;
  return {
    time: 6.0,
    note: `The hub. Real: every plinth is section 01's box at its own footprint and corner radius (layout.json); the rims' colors say what runs (teal), the two gold boxes (BNB yellow) and what has not run (idle gray). The starting grid's ${v.grid.count} columns are the sealed plans (heights by planned discharge, frame-data.json fleet.batteries), the dots on Texas the ${d.fleet.map_coverage.mapped} mapped batteries; Parc fermé's ring holds ${sd.leaf_count} ticks, one a sealed leaf; the Arcade's field and coins are arm C's ${d.game.results.C.total_uusd.length} scenarios (game.results.C, game.histogram); the timing towers carry the Atlas and CMC reads (sponsors.atlas, sponsors.cmc); Team data's pit holds Living Brain's three brains of ours as the brain station draws them (stations/brain/pit.ts, from brain-scene.json, read from Living Brain's API). Illustrative: the radar's sweep, the bays' heroes at hub scale, the pole lights. Design: the return road (the diagram draws no lane back to the grid), dashed and dim. Drawn idle here: the season purse and the launch tower; Flap's launch and OpenFour's graduation ran on BSC testnet on Nov 25 and are lit in the stack's finale. The agents' title names Agent Studio, which gives the six roles their identities and paid jobs; the two hosted agents, the evaluator and the Forecaster, are drawn in the stack's finale.`,
    update(t) {
      stage.setCamera(HUB);
      v.detail();
      v.tick(t);
    },
    async decorate() {
      const root = ctx.plates.root.parentElement!;
      root.classList.add('v-hub');
      const P = (x: number, z: number, y = PLINTH_H) => ctx.plates.project([x, y, z]);
      for (const z of v.L.zones) place(ctx, 'v-zone', [z.title], P(z.title_world[0], z.title_world[1] + 3, 0), 'bl');
      const site = !!ctx.plates.root.closest('.gp-story[data-mode="site"]');
      for (const s of v.L.stations) {
        const [name, full] = STATION_WORDS[s.id] ?? [s.name, ''];
        // at the site's stage sizes these two ran into each other: their plain names alone
        const code = site && (s.id === 'fuel-and-wear' || s.id === 'spotter') ? '' : full;
        const f = s.footprint, state = RIM[s.id] ?? 'idle';
        const inset = s.id === 'garage' ? 5 : 3.2;
        place(ctx, `v-station${state === 'live' ? ' is-live' : state === 'gold' ? ' is-gold' : ''}`, code ? [name + ' ', ['v-code', code]] : [name],
          P(f.x0 + inset, f.z0 + inset, s.id === 'garage' ? 18 : PLINTH_H), 'tl');
      }
      // the chips' logos 16 px tall in the 1920 cut, smaller with the stage, never under 12 px
      const logoPx = Math.round(Math.max(12, Math.min(16, 19 * (ctx.width / 1920))));
      for (const [ids, caption, x, y, w, h] of TAGS) {
        const [wx, wz] = fromSvg(x + w / 2, y + h / 2);
        const chip = logoChip(ids, { caption, size: logoPx, className: 'v-logo' });
        // the brain's pages now glow where the diagram puts this pill: it rides the box's bottom rim instead. Agent
        // Studio's pill sat where the site's caption covers it: its chip rides the workshop's top edge, at the right
        const at = ids === 'livingbrain' ? P(wx, -41.5, PLINTH_H) : ids === 'agentstudio' ? P(160, -256, 18) : P(wx, wz, PLINTH_H);
        const r = placeEl(ctx, chip, at, 'c');
        // a narrow stage crops the venue: a chip cut by the edge moves in, one whose middle is off the stage goes
        if (!r) continue;
        const m = 6, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        if (cx < 0 || cx > ctx.width || cy < 0 || cy > ctx.height) { chip.remove(); continue; }
        const nx = Math.max(m, Math.min(ctx.width - m - r.w, r.x));
        if (nx !== r.x) chip.style.transform = `translate3d(${nx.toFixed(1)}px, ${r.y.toFixed(1)}px, 0)`;
      }
      // the caption in the diagram's open ground left of the agents, under the real world's boxes. A film lays the hub
      // out again at a move's poses too, where these points can sit behind the camera (no plates show there): skip them
      const capAt = P(-478, -12, 0), capEnd = P(-218, -12, 0);
      if (capAt && capEnd) {
        root.style.setProperty('--v-cap-x', `${Math.round(capAt.x)}px`);
        root.style.setProperty('--v-cap-y', `${Math.round(capAt.y)}px`);
        root.style.setProperty('--v-cap-w', `${Math.round(capEnd.x - capAt.x)}px`);
      }
      if (site) ctx.plates.caption({ head: 'How each day runs', line: "Public data in, a plan for every battery, sealed on BNB Chain before the 10:00 CT gate, then checked by anyone." });
      else ctx.plates.caption({ head: 'Wattness Grand Prix', line: "Every real ERCOT battery's plan for tomorrow, sealed on BNB Chain before the market closes." });
      // the sealed facts and the hint ride in the caption's glass, under its line
      const capEl = ctx.plates.root.querySelector('.hwalk-cap') as HTMLElement;
      const r0 = sd.receipts[0];
      const day = `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(sd.operating_day.slice(5, 7)) - 1]} ${Number(sd.operating_day.slice(8))}`;
      const row = document.createElement('div'); row.className = 'v-caprow';
      // two lines: the day the plans are for, then what was sealed and when (one line overflowed the card)
      const chip = document.createElement('div'); chip.className = 'v-chip is-stack';
      for (const parts of [[`Operating day ${day}`], [`${fmt(sd.leaf_count)} plans sealed`, `${fmt(r0.seconds_before_gate)} s before the close`]]) {
        const ln = document.createElement('span'); ln.className = 'v-line';
        parts.forEach((b, k) => {
          if (k) { const dot = document.createElement('span'); dot.className = 'v-dot'; dot.textContent = '·'; ln.appendChild(dot); }
          const e = document.createElement('b'); e.textContent = b; ln.appendChild(e);
        });
        chip.appendChild(ln);
      }
      row.append(chip); if (!site) capEl.appendChild(row);
      // the hint in the margin above the venue's top right, where a reader's eye lands after the boxes. It asks for a
      // click, so a film (the story's capture mode) leaves it out: no one watching a video can act on it
      const corner = P(480, -300, 0);
      if (corner && !ctx.plates.root.closest('.gp-story')) {
        const hint = document.createElement('div'); hint.className = 'v-hint';
        hint.append(document.createElement('i'), document.createTextNode('Click a station'));
        ctx.plates.root.appendChild(hint);
        hint.style.left = `${Math.round(corner.x - hint.offsetWidth)}px`; hint.style.top = `${Math.round(corner.y - hint.offsetHeight / 2)}px`;
      }
      // a still or a film's frame is taken with the logos drawn (a file that never comes holds it 1.5 s at most)
      await chipsReady(ctx.plates.root);
    },
  };
}

// ── V04 · the closing ────────────────────────────────────────────────────────────────────────────────────────
const CLOSING: CameraPose = { target: [-10, 0, 30], az: 225, el: 28, dist: 1700, vfov: 26, shift: [0.085, 0.0], near: 60, far: 6000 };

async function closing(ctx: FrameContext): Promise<FrameHandle> {
  const { stage } = ctx;
  const v: Venue = await buildVenue(ctx, { shadow: 0.3, roof: { blurPasses: 1, blurRadius: 0.9, fillA: 0.1, clamp: 0.8, sheen: 0.09, grabDiv: 2 } });
  stage.setBackdrop(BACKDROP);
  stage.setLight(NIGHT);
  stage.setFade({ center: [0.55, 0.55], screen: [0.7, 1.4], world: [700, 1900], worldCenter: [0, 10], glow: [0.62, 0.36] });
  stage.setKey({ az: 205, el: 46, center: [0, 0, 10], radius: 640, intensity: 0.5, rimAz: 40, rimIntensity: 0.26 });
  stage.setAO({ radius: 2.5, scale: 1.0, thickness: 2.0, samples: 16 });
  stage.setShadowAuto(true);
  // the long view's depth: three's linear fog on the lit materials only (the overlay's marks keep their own fades)
  stage.scene.fog = new THREE.Fog(new THREE.Color().setRGB(0.012, 0.016, 0.02, THREE.LinearSRGBColorSpace), 900, 2600);
  v.pulse(true);
  const d = v.d, g = nextGate(d);
  return {
    // the pulse's head mid-A7, between the stewards and the timing towers
    time: 8.0,
    note: `The closing. Real: the venue as in the hub (plinths at the diagram's footprints, the grid's ${v.grid.count} sealed plans, Parc fermé's ${d.sealed_day.leaf_count} ticks, the Arcade's field, coins and score tower on arm C's sealed numbers, game.results.C). The next gate is computed from the sealed day's gate (sealed_day.gate) and the data's build time (built), the first 10:00 CT gate after it: ${g.ct}, ${g.od}; a still made after that gate must recompute it. Design: the return road, dim and dashed. Not run: no season launch, no graduation, no arena seal flow; the P1 banner holds the agent's sealed C, ranked on the modeled score until race day settles.`,
    update(t) {
      stage.setCamera(CLOSING);
      v.detail();
      v.tick(t);
    },
    decorate() {
      const card = document.createElement('div'); card.className = 'v-end';
      const h = document.createElement('h2'); h.textContent = 'Wattness Grand Prix';
      // the field as planned: every ERCOT battery whose public data was complete that day (the rest are excluded, with
      // the census field each lacks, in the sealed record)
      const odDay = new Date(`${d.sealed_day.operating_day}T12:00:00Z`);
      const odLabel = `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][odDay.getUTCMonth()]} ${odDay.getUTCDate()}`;
      const p = document.createElement('p'); p.textContent = `Every ERCOT battery with complete public data (${fmt(d.fleet.count)} on ${odLabel}), planned for tomorrow and sealed on BNB Chain before the market closes. Anyone can check any plan.`;
      const gate = document.createElement('div'); gate.className = 'v-gate';
      const b1 = document.createElement('b'); b1.textContent = `Market closes ${g.ct}`;
      // the reader's own clock beside CT (a film prints CT alone)
      const own = yours(g.unix, { date: true, film: inFilm(ctx.plates.root) });
      gate.append(b1, document.createTextNode(`${own ? ` · ${own}` : ''} · ${g.od}`));
      const foot = document.createElement('div'); foot.className = 'v-foot';
      const url = document.createElement('span'); url.className = 'v-url'; url.textContent = 'gp.wattness.tech';
      const attr = document.createElement('span'); attr.className = 'v-attr'; attr.textContent = 'Data: ERCOT. Calculation and display: Wattness.';
      foot.append(url, attr);
      card.append(h, p, gate, foot);
      ctx.plates.root.appendChild(card);
    },
  };
}


// ── V03 · the stewards' bay beside its page (the 3D half) ───────────────────────────────────────────────────────
// The page's verifier on the changed copy (captured from the site's preview, the side-by-side's right half): 01 and
// 02 fail (the leaf and its proof), 03 and 04 pass (the record on chain is untouched), 05 fails (the battery's limits).
const TAMPER_CHECKS: CheckState[] = ['fail', 'fail', 'pass', 'pass', 'fail'];
// closer than R03's own read and lifted, so the bay fills the tall half instead of sitting under a third of sky
const STEWARDS_HALF: CameraPose = { target: [436, 11.5, 6], az: 233, el: -1.0, dist: 60, vfov: 50, shift: [0, 0.12], near: 0.5, far: 3200 };

async function stewardsHalf(ctx: FrameContext): Promise<FrameHandle> {
  const { stage } = ctx;
  const v: Venue = await buildVenue(ctx, { near: true, stewards: false, shadow: 0.3, roof: { blurPasses: 1, blurRadius: 0.9, fillA: 0.14, clamp: 0.45, sheen: 0.08 } });
  const d = v.d, t = tamperOf(d);
  const bay = buildStewardsBay(v.HW, { checks: TAMPER_CHECKS, tampered: true, changedRow: 4 });
  assignLayers(bay.group); stage.scene.add(bay.group);
  stage.setBackdrop(BACKDROP);
  stage.setLight({ ...NIGHT, key: { color: '#93a8d4', intensity: 0.6 }, fill: { sky: '#46597d', ground: '#15130f', intensity: 0.55 } });
  stage.setFade({ center: [0.5, 0.55], screen: [0.7, 1.3], world: [600, 1500], worldCenter: [430, 4], glow: [0.6, 0.4] });
  stage.setKey({ az: 210, el: 34, center: [430, 6, 6], radius: 60, intensity: 0.6, rimAz: 40, rimIntensity: 0.3 });
  stage.setAO({ radius: 0.5, scale: 1.1, thickness: 1.2, samples: 16 });
  stage.setShadowAuto(true);
  const kw = (n: number) => fmt(n).replace('-', '\u2212');
  return {
    time: 4.0,
    note: `The stewards' bay in the tamper state, the left half of the side-by-side. Real: the board on the bay's screen is built from frame-data.json (showcase name, resource, node, hub, rating; leaf ${d.showcase.leaf_position + 1} of ${d.sealed_day.leaf_count}, counted from one as the page counts it) with the page's own markup and rules, and the five lamps carry the page's verifier results on the changed copy (01, 02, 05 fail; 03, 04 pass), as captured from the site's preview; the change is the page's tamper rule computed here: ${t.path} ${kw(t.sealedKw)} to ${kw(t.tamperedKw)} kW. Illustrative: the card's rows (the leaf's fields as bars, the changed one red), the ladder's geometry (nine rungs, one a sibling hash) and the bay's architecture. The screen is 30 x 8.4 m here, the board's own aspect (the layout's 10 x 6 m would hold it too small to read beside the page).`,
    update(time) {
      stage.setCamera(STEWARDS_HALF);
      v.detail();
      v.tick(time);
    },
    async decorate() {
      // this half is shown at full size inside a 1920 frame, so its plates take the 1920 cut's sizes (the lab scales
      // them by the stage's width, which here is 960, and the leader plate came out at 8 px)
      ctx.plates.root.parentElement!.style.setProperty('--u', '1');
      await Promise.all(['500 20px', '600 20px', '700 20px'].map((f) => document.fonts.load(`${f} "Barlow Condensed"`)));
      // the page's board on the screen, exact: its markup in the lab's DOM, set on the screen's corners
      const board = buildBoard(d, TAMPER_CHECKS, true);
      ctx.overlay.appendChild(board);
      const corners = bay.screenCorners().map((p) => ctx.plates.project(p)!);
      board.style.transform = quadMatrix(board.offsetWidth, board.offsetHeight, corners);
      // the lamps' numbers, in the page's strip type and colors
      bay.lamps.forEach((p, i) => {
        const at = ctx.plates.project([p[0], p[1] - 2.6, p[2]]);
        const e = place(ctx, `v-lampno is-${TAMPER_CHECKS[i]}`, [String(i + 1).padStart(2, '0')], at, 'c');
        void e;
      });
      ctx.plates.leaders([
        { id: 'card', text: `Changed copy: ${t.path} ${kw(t.sealedKw)} \u2192 ${kw(t.tamperedKw)} kW`, sub: `${d.showcase.name} \u00b7 leaf ${d.showcase.leaf_position + 1} of ${d.sealed_day.leaf_count}`, at: bay.card, priority: 0 },
      ], { max: 1 });
      if (ctx.plates.root.closest('.gp-story[data-mode="site"]')) {
        // on the site the beat stands alone: its own caption, not the storyboard's label for one half of a split screen
        const failed = TAMPER_CHECKS.filter((c) => c === 'fail').length;
        ctx.plates.caption({ head: 'A changed number fails the check', line: `${failed} of ${TAMPER_CHECKS.length} checks fail: the changed copy is not the sealed plan.` });
      } else {
        const half = document.createElement('div'); half.className = 'v-half';
        half.append(document.createTextNode('The world '), Object.assign(document.createElement('span'), { textContent: '\u00b7 Anyone can check any plan' }));
        ctx.plates.root.appendChild(half);
      }
    },
  };
}

// ── V02 · the drive down A7 ──────────────────────────────────────────────────────────────────────────────────
const DRIVE: CameraPose = { target: [-47.3, 3.5, 88.6], az: 80.9, el: -0.2, dist: 78.1, vfov: 40, shift: [0, 0.04], near: 0.3, far: 3000 };

async function drive(ctx: FrameContext): Promise<FrameHandle> {
  const { stage } = ctx;
  // the tower screens draw in the timing face, so it is in before they are drawn
  await Promise.all(['500 120px', '600 120px'].map((f) => document.fonts.load(`${f} "Barlow Condensed"`)));
  const v: Venue = await buildVenue(ctx, { near: true, shadow: 0.3, roof: { blurPasses: 2, blurRadius: 1.2, fillA: 0.22, clamp: 0.45, sheen: 0.16, shadow: 0, edge: false } });
  // seen from under its edge the pane must draw both faces, or the hangar reads as bare posts; the mark would read
  // mirrored from below, so it is left off here
  v.roof.material.side = THREE.DoubleSide; v.roof.material.uniforms.uMarkA.value = 0;
  // the night sky with the Arcade's tungsten in the haze above it, where the lane is heading (the venue's only warmth)
  stage.setBackdrop({ ...BACKDROP, top: '#101418', horizon: '#2b3139', glow: '#5a472f' });
  // raised for the 90 s cut (Jo, Nov 26): the moon and the sky's fill brighter, the arch's downlights and the poles
  // stronger, the fog pushed back, so the lane, the towers and the arch read at a glance
  stage.setLight({ ...NIGHT, key: { color: '#93a8d4', intensity: 0.85 }, rim: { color: '#7f95c0', intensity: 0.34 }, fill: { sky: '#4f6388', ground: '#1b1914', intensity: 0.85 }, env: 0.14 });
  stage.setFade({ center: [0.5, 0.46], screen: [0.9, 1.6], world: [900, 2000], worldCenter: [0, 10], glow: [0.36, 0.5] });
  stage.setKey({ az: 205, el: 32, center: [-60, 6, 95], radius: 130, intensity: 0.45, rimAz: 40, rimIntensity: 0.3 });
  stage.setAO({ radius: 0.6, scale: 1.1, thickness: 1.4, samples: 16 });
  stage.setShadowAuto(true);
  stage.scene.fog = new THREE.Fog(new THREE.Color().setRGB(0.012, 0.016, 0.02, THREE.LinearSRGBColorSpace), 180, 950);
  // light where the camera is: the arch's downlights and the nearest pole heads, cool, lighting the hardware they hang
  // over as well as the lane (their pools are drawn on the ground)
  const spots: THREE.SpotLight[] = [];
  const spotAt = (x: number, y: number, z: number, tx: number, tz: number, i: number) => {
    const sp = new THREE.SpotLight('#d6e2f2', i, 60, Math.PI * 0.32, 0.9, 1.6); sp.position.set(x, y, z); sp.target.position.set(tx, 0, tz);
    sp.layers.enableAll(); stage.scene.add(sp, sp.target); spots.push(sp);
  };
  for (const x of [-136, -108, -81, -54]) spotAt(x, 13.6, 102, x, 98, 560);
  // the lane lit from the camera's foot to past the arch: soft cool pools along the line of sight (the ground's hexes
  // are exact and unlit, so the venue's own lights reach it only as pools), and a wash round the nearest tower's foot
  const lanePools = radialTex(1.4);
  for (const t of [0.12, 0.42, 0.72, 1.02, 1.32, 1.62]) stage.scene.add(pool(HEX.pole, 15, 0.075, lanePools, [30 - 77.3 * t, 0.16, 76.3 + 12.3 * t], { sx: 1.6, order: 1 }));
  stage.scene.add(pool(HEX.pole, 16, 0.07, lanePools, [-40, 0.16, 56], { order: 1 }));
  // the Arcade's glow beyond the arch: a soft tungsten haze behind the cabinet, facing the lane, so the cabinet and its
  // bulbs stand against it
  stage.scene.add(halo(HEX.tungsten, 190, 84, 0.1, radialTex(2.0), [-392, 16, 214], 71.5));
  // the Arcade's warm practical pair over the cabinet, the venue's only warm light (the art direction's pair)
  for (const [x, z] of [[-292, 236], [-358, 236]] as const) {
    const sp = new THREE.SpotLight('#ffcf8f', 2600, 160, Math.PI * 0.3, 0.8, 1.4); sp.position.set(x, 32, z); sp.target.position.set(-325, 4, 203);
    sp.layers.enableAll(); stage.scene.add(sp, sp.target); spots.push(sp);
  }
  for (const p of v.ground.poles) { const dx = p.x - 29.8, dz = p.z - 76.3; if (Math.hypot(dx, dz) < 140 && dx < 20) spotAt(p.x - p.d[1] * 1.9, 8.7, p.z + p.d[0] * 1.9, p.x - p.d[1] * 6, p.z + p.d[0] * 6, 360); }
  // the timing tower nearest the lane, floodlit from the lane's side so its frame and plinth read beside its screen
  { const sp = new THREE.SpotLight('#e6eefa', 900, 70, Math.PI * 0.2, 0.7, 1.6); sp.position.set(-12, 9, 66); sp.target.position.set(-38, 8, 50); sp.layers.enableAll(); stage.scene.add(sp, sp.target); spots.push(sp); }
  return {
    time: 5.0,
    note: `The drive down A7, Stewards to the Arena. Real: the towers' screens carry the Atlas and CoinMarketCap reads of Nov 25 (sponsors.atlas.signed_pull, sponsors.cmc.quotes, .security, .funding_decision; read after the seal, internal until the sponsor release) and the arch's screens repeat the two prices; the lane is the layout's track (A7, under the timing gantry). Illustrative: the comets running ahead on the lane (the plan capsule was dropped: it read as a toy), the pole lights and the Arcade's glow are the venue's own light.`,
    update(t) {
      stage.setCamera(DRIVE);
      v.detail();
      v.tick(t);
    },
    decorate() {
      const third = document.createElement('div'); third.className = 'v-third';
      const head = document.createElement('div'); head.className = 'v-third-head';
      const words = document.createElement('div'); words.className = 'v-third-words';
      const line = document.createElement('div'); line.className = 'v-third-line';
      const arrow = document.createElement('i'); arrow.textContent = '\u2192';
      line.append(document.createTextNode('Checks '), arrow, document.createTextNode(' Rankings'));
      const flavor = document.createElement('div'); flavor.className = 'w-flavor'; flavor.textContent = 'stewards to the arena';
      words.append(line, flavor); head.append(words);
      const sub = document.createElement('div'); sub.className = 'v-third-sub'; sub.textContent = 'Lane A7 \u00b7 scored by the same verifier';
      third.append(head, sub);
      ctx.plates.root.appendChild(third);
    },
  };
}

export const frames: StationModule['frames'] = {
  'venue.hub': hub,
  'venue.drive': drive,
  'venue.stewards': stewardsHalf,
  'venue.closing': closing,
};

