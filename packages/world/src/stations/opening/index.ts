// @ts-nocheck
// The battery-first opening (v2/OPENING.md): Desert Willow's own site at night, built from the landing intro's parts
// (O01), its enclosures gathering into one column on the pad as the intro's site does in chapter 06 (O02), and the
// climb to the lock, where the real column and Desert Willow's column on the venue's 1:10,300 Texas model (W01) fill
// the same box on screen. One clock (gather.ts T) poses all of it; each frame is a moment on it.
//
//   opening.pad         O01 · This is Desert Willow.
//   opening.column      O02 · On the map it stands as one column.
//   opening.gather      a motion still between them: the enclosures mid-slide, the rest fading (illustrative)
//   opening.lock       check: the real column at the lock pose (658 m), the footprint gone, the ground W01's
//   opening.lock-venue  check: W01's own scene (stations/world/texas.ts, wrapped, not edited) at the venue's lock pose
//                       (12.6 m), only the pole standing, as the opening's entry into W01 asks
import * as THREE from 'three';
import { assignLayers, type CameraPose } from '../../lib/stage';
import { camBlend } from '../../lib/ease';
import { NIGHT, HEX, keyCard, rectOf, pool } from '../world/common';
import type { FrameContext, FrameHandle, StationModule } from '../types';
import { line as fineLine, setLineResolution } from '../../kit/region/flows';
import { buildDesertWillow, LAYOUT as SITE_LAYOUT } from './site';
import { ENC } from '../../kit/enclosure';
import { padCopy, columnCopy } from './copy';
import { inFilm, yours } from '../../lib/yours';
import {
  T, phaseAt, smooth, smoothRange, easeInOutCubic, proxyTint, baseFuse, proxyRise, packRadius, slotsFor, makeColumn,
  W01_COLUMN, heightRule, rampAt, dischargeHex, DISCHARGE_RAMP,
} from './gather';

type Which = 'pad' | 'column' | 'gather' | 'lock';

/** a to b at t, per channel as on screen (#rrggbb). */
function mixHex(a: string, b: string, t: number) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((A >> s) & 255) + (((B >> s) & 255) - ((A >> s) & 255)) * t);
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
}
/** The venue's lock distance (m from Desert Willow's model column; the real lock is this x k). OPENING.md section 4 set
 *  15.07 m and allowed a closer lock at the same ratio if W01's edges showed: at 15.07 m W01's black map cutouts
 *  stood in the top right corner of the venue's frame and not in the real one, so the cross-fade would have popped
 *  them in (at 13.2 m slivers of them still did); at 12.6 m they are out of frame and the column is about 0.63 of the
 *  frame's height, near the design's own 0.6. */
const LOCK_DIST = 12.6;
/** W01's map top as it lands on screen (stations/world/texas.ts: the region slab's top, '#212c30'; read off
 *  opening.lock-venue at ten points, all exactly #212c30), and its key (az 225, el 50, center [-340, 2, -197], radius
 *  96) with the catcher dark enough to read W01's shadow on its lit map top (#0a1519 on #212c30 there). */
const VENUE = { ground: '#212c30', key: { center: [-340, 2, -197], radius: 96 }, shadow: 0.5 };

/** A camera from az, el and lens that fits pts into rect (stage fractions): the intro's fitParams (region/engine.ts). */
function fitPose(stage, pts: THREE.Vector3[], { az, el, vfov, rect, iters = 8 }) {
  const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  let dist = 600, shift: [number, number] = [0, 0];
  const v = new THREE.Vector3();
  for (let i = 0; i < iters; i++) {
    stage.setCamera({ target: [c.x, c.y, c.z], az, el, dist, vfov, shift });
    stage.camera.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { v.copy(p).project(stage.camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    const fx0 = (x0 + 1) / 2, fx1 = (x1 + 1) / 2, fy0 = (1 - y1) / 2, fy1 = (1 - y0) / 2;
    const k = Math.min((rect.x1 - rect.x0) / (fx1 - fx0), (rect.y1 - rect.y0) / (fy1 - fy0));
    dist /= k;
    const cxNow = ((fx0 + fx1) / 2 - 0.5) * k + 0.5, cyNow = ((fy0 + fy1) / 2 - 0.5) * k + 0.5;
    shift = [shift[0] * k + ((rect.x0 + rect.x1) / 2 - cxNow), shift[1] * k - ((rect.y0 + rect.y1) / 2 - cyNow)];
  }
  return { target: [c.x, c.y, c.z], az, el, vfov, dist, shift } as CameraPose;
}

/** Desert Willow's figures and the column's size, from frame-data.json and the layout. */
function figures(ctx: FrameContext) {
  const data = ctx.needData();
  const s = data.showcase;
  const arm = s.selected_arm;
  const discharge: number = s.arms[arm].discharge_mwh;
  const maxBat = data.fleet.batteries.reduce((a, b) => (b.planned_discharge_mwh > a.planned_discharge_mwh ? b : a));
  const max: number = maxBat.planned_discharge_mwh;
  const color = dischargeHex(rampAt(discharge, max));
  const w01H = heightRule(discharge, max);
  return { data, s, arm, discharge, max, maxBat, color, w01H, cycles: s.arms[arm].cycles, receipt: data.sealed_day.receipts[0], day: data.sealed_day.operating_day };
}

async function opening(ctx: FrameContext, which: Which): Promise<FrameHandle> {
  const { stage, theme } = ctx;
  const F = figures(ctx);
  const s = F.s;
  const site = buildDesertWillow({ theme, mw: s.power_mw, mwh: s.energy_mwh });
  const n = site.counts;

  // the column: the packed disc's radius (the intro's PACK_R + 1.5), W01's column scaled to it
  const packR = packRadius(n.enclosures);
  const R = packR + 1.5;
  const k = R / W01_COLUMN.r;
  const H = F.w01H * k;
  const column = makeColumn({ x: 0, z: 0, r: R, h: H, color: F.color });
  const { slot, delay } = slotsFor(site.home, packR);

  // the column's light on the night ground: a soft teal pool at its foot (W01's own pool helper), gone by the lock,
  // where W01's entry has no halo yet
  const glow = pool(0, 0.05, 0, 3.1 * R, HEX.teal, 1);
  const glowBase = glow.material.color.clone();
  // the pad's faint footprint at the column's foot: its outline as the intro's fine line (region/flows.ts: a fine core
  // under a soft glow), drawn in once the site has faded, gone before the lock
  const footprint = fineLine(SITE_LAYOUT.pad.map(([x, z]) => [x, 0.16, z]), { color: HEX.teal, width: 1.2, glow: 7, glowA: 0.22, opacity: 0, closed: true, reveal: false, caps: false });
  footprint.userData.noAO = true;
  const world = new THREE.Group(); world.name = 'opening';
  world.add(site.group, column.mesh, glow, footprint);
  assignLayers(world);
  stage.scene.add(world);
  site.materials.farNormals(stage.gtao.normalMaterial);

  // the venue's night (STORYBOARD.md section 2; stations/world/common.ts NIGHT)
  stage.setBackdrop(NIGHT.backdrop);
  stage.setLight(NIGHT.light);
  stage.setGround(HEX.ground);
  stage.setShadowAuto(true);
  // the moon: O01's (az 200, el 62, the intro's night key) easing over the gather to W01's (az 225, el 50), so the
  // column's shadow already falls as W01's does when the two lock. Through the climb the shadow box grows to W01's own
  // at the column's scale (radius 96 x k, its center's offset from Desert Willow's model column x k), so one 4096 map
  // spans the column with as many texels as W01's does and the shadow's soft edge matches at the lock instead of
  // sharpening and softening through the cross-fade.
  const venueXZ = (() => { const T0 = (ctx.layout as any).texas, m = s.map; return [T0.origin_world[0] + (m.lon - T0.center_lon) * T0.m_per_deg_lon, T0.origin_world[1] - (m.lat - T0.center_lat) * T0.m_per_deg_lat]; })();
  const lockKey = { center: [(VENUE.key.center[0] - venueXZ[0]) * k, (VENUE.key.center[1] - W01_COLUMN.mapTop) * k, (VENUE.key.center[2] - venueXZ[1]) * k], radius: VENUE.key.radius * k };
  const keyAt = (t: number) => {
    const { gather, climb } = phaseAt(t);
    const e = smooth(gather), L = (a: number, b: number) => a + (b - a) * e;
    const base = { az: L(200, 225), el: L(62, 50), center: [L(18, 0), L(0, 0.2 * H), L(-8, -40)] as [number, number, number], radius: L(110, 240) };
    if (climb <= 0) return base;
    const c = smoothRange(climb, 0.05, 0.95), M = (a: number, b: number) => a + (b - a) * c;
    // the radius in log, so the shadow's softening runs evenly through the climb
    return { ...base, center: base.center.map((v, i) => M(v, lockKey.center[i])) as [number, number, number], radius: Math.exp(M(Math.log(base.radius), Math.log(lockKey.radius))) };
  };
  // and the night ground becomes W01's map top: at the lock both drawings show one ground, so the cross-fade carries
  // only the column's shadow, not a full-frame change of color
  const groundAt = (t: number) => {
    const c = smoothRange(phaseAt(t).climb, 0.1, 0.9);
    const B = NIGHT.backdrop;
    return {
      backdrop: { top: mixHex(B.top, VENUE.ground, c), horizon: mixHex(B.horizon, VENUE.ground, c), bottom: mixHex(B.bottom, VENUE.ground, c), glow: mixHex(B.glow, VENUE.ground, c), ground: mixHex(HEX.ground, VENUE.ground, c) },
      light: { ...NIGHT.light, shadow: NIGHT.light.shadow + (VENUE.shadow - NIGHT.light.shadow) * c },
    };
  };
  if (which === 'pad' || which === 'gather') {
    stage.setAO({ radius: 3.5, scale: 1.4, thickness: 2.5, samples: 16 });
    stage.setAOStrength(1);
    stage.setFade({ center: [0.64, 0.46], screen: [0.78, 1.45], world: which === 'pad' ? [120, 320] : [160, 600], worldCenter: [18, -8], glow: [0.7, 0.3] });
  } else {
    stage.setAOStrength(0);
    stage.setFade({ center: [0.62, 0.5], screen: [0.8, 1.5], world: [220, 900], worldCenter: [0, 0], glow: [0.62, 0.42] });
  }

  // the camera: O01 fitted over the pad and the yard; O02 the column rest; the lock
  const A = site.anchors;
  // O01: a little higher than the design's 29 deg, so the five lines open up and the block fills the frame's middle
  // band instead of a thin strip under an empty sky; the line's first monopole is in the fit, so the line leaves inside
  // the frame and its plate is not pinned in the corner
  const P_PAD = fitPose(stage, [...A.padCorners, ...A.yardCorners, A.line], { az: 160, el: 33, vfov: 40, rect: { x0: 0.25, x1: 0.93, y0: 0.1, y1: 0.78 } });
  // the column rest: the column about 0.56 of the frame's height, its top clear of the key card, its foot just above
  // the caption, at 0.65 of the width (the walkthrough's plates take more of the frame than OPENING.md's 70% allowed)
  const P_HOLD: CameraPose = { target: [0, 0.42 * H, 0], az: 160, el: 20, dist: 850, vfov: 34, shift: [0.146, -0.032] };
  // the gather's own framing: the pad alone, closer than O01's fit (which holds the yard and the line too), so the
  // enclosures closing into their disc read large; the pull-back to the column's rest then follows the column as it
  // rises. The gather had eased straight to the column's framing before the column rose, leaving the pad about 150 px
  // wide in an empty frame for a second and a half (the 90 s cut's 0:06 to 0:07.5).
  const P_GATHER = fitPose(stage, A.padCorners, { az: 160, el: 30, vfov: 36, rect: { x0: 0.3, x1: 0.92, y0: 0.22, y1: 0.74 } });
  const P_LOCK: CameraPose = { target: [0, 0.42 * H, 0], az: 160, el: 44, dist: LOCK_DIST * k, vfov: 34, shift: [0.17, 0] };
  const camAt = (t: number): CameraPose => {
    const { gather, stack, climb } = phaseAt(t);
    if (t < T.b0) return P_PAD;
    if (t < T.b1) return camBlend(P_PAD, P_GATHER, smoothRange(gather, 0.3, 0.98));
    if (t < T.z0) return camBlend(P_GATHER, P_HOLD, easeInOutCubic((stack - 0.18) / 0.66));
    return camBlend(P_HOLD, P_LOCK, easeInOutCubic(climb));
  };

  function pose(t: number) {
    const { gather, stack, climb } = phaseAt(t);
    // B: the enclosures slide to their slots; the rest fades to a 15% footprint; the pole lights dim last
    site.poseEnclosures(smoothRange(gather, 0, 0.72), slot, delay);
    // then Z: the footprint fades from 15% to nothing by the lock (the ground's scale jumps there)
    const restA = 1 - smoothRange(gather, 0.04, 0.5);
    const aRest = climb > 0 ? 0.15 * (1 - smooth(climb)) : 0.15 + 0.85 * restA;
    // the line leaves with the gather: by O02 only the pad's own footprint is left at the column's foot
    site.setRest(aRest, aRest * (1 - smoothRange(gather, 0.5, 1)));
    site.setLights(1 - smoothRange(gather, 0.3, 0.9));
    // H: tint, fuse, rise (the disc is the column's own foot: its radius is the column's)
    site.tintEnclosures(proxyTint(stack), F.color);
    const fuse = baseFuse(stack);
    site.showEnclosures(fuse < 0.999);
    column.setOpacity(stack <= 0 ? 0 : fuse);
    column.setHeight(3.2 + (H - 3.2) * proxyRise(stack));
    glow.material.color.copy(glowBase).multiplyScalar(0.2 * proxyRise(stack) * (1 - smooth(climb / 0.7)));
    glow.visible = glow.material.color.r + glow.material.color.g > 1e-4;
    footprint.material.opacity = 0.55 * smoothRange(gather, 0.45, 0.9) * (1 - smooth(climb / 0.7));
    footprint.visible = footprint.material.opacity > 0.002;
    setLineResolution(world, ctx.width, ctx.height, ctx.dpr);
    stage.setKey(keyAt(t));
    const G = groundAt(t);
    stage.setBackdrop(G.backdrop);
    stage.setLight(G.light);
    site.update(t);
    stage.setCamera(camAt(t));
    site.setPixelScale((2 * Math.tan((stage.camera.fov * Math.PI) / 360)) / (ctx.height * ctx.dpr));
    site.setResolution(ctx.width * ctx.dpr, ctx.height * ctx.dpr);
  }

  const time = which === 'pad' ? T.o01 : which === 'column' ? T.o02 : which === 'gather' ? T.b0 + 0.4 * (T.b1 - T.b0) : T.lock;
  const scope = s.size_source;
  const notes = {
    pad: `O01. Real: the name, ${s.resource} at node ${s.settlement_point}, ${s.power_mw} MW and ${s.energy_mwh} MWh (frame-data.json showcase, its size from ` +
      `${scope.route}, sha256 ${scope.sha256.slice(0, 8)}...), ${s.county} County, the map point (EIA-860, site precision) and the substation's name ` +
      `(the Terminal's public fleet reference, release terminal-daily-20261124-1120, opening/evidence.json). Illustrative: every position, both counts ` +
      `(${n.enclosures} enclosures = ${s.energy_mwh} / 5.2 MWh and ${n.skids} skids = ${s.power_mw} / 4.17 MW, the intro's unit sizes, not the site's ` +
      `equipment), the substation's equipment and the line's route. No line voltage is on file, so none is named. The census row's 349.5 MWh differs; the ` +
      `frame prints the plan's ${s.energy_mwh} MWh.`,
    column: `O02. Real: the column's height and color are the sealed leaf's planned discharge, ${F.discharge} MWh for ${F.day} (showcase.arms.${F.arm}.discharge_mwh; ` +
      `arms A, B and C all discharge ${s.arms.A.discharge_mwh} MWh), on W01's rules: height 0.3 + 9.7 x d / ${F.max} (${F.maxBat.resource}, the fleet's largest), ` +
      `color the discharge ramp at sqrt(d / ${F.max}) = ${rampAt(F.discharge, F.max).toFixed(3)}; W01's own column object (stations/world/common.ts) at ` +
      `${k.toFixed(2)} x W01's size: ${(2 * R).toFixed(1)} m across, ${H.toFixed(1)} m tall. Sealed ${F.receipt.block_time.ct} (block ${F.receipt.block}). ` +
      `Illustrative: the gather (the enclosures do not move); the packing is the intro's (radius ${packR} m for ${n.enclosures}).`,
    gather: `Motion still between O01 and O02 (t ${(T.b0 + 0.4 * (T.b1 - T.b0)).toFixed(2)} s of the opening's clock): the ${n.enclosures} enclosures slide to ` +
      `the intro's packed slots round the pad's center (radius ${packR} m), southern lines first, while the skids, the yard, the line, the fence and the ` +
      `road fade toward a 15% footprint and the pole lights dim. Illustrative: the enclosures do not move; this is the intro's chapter 06 gather.`,
    lock: `Check frame, not a storyboard frame: the real column (${(2 * R).toFixed(1)} x ${H.toFixed(1)} m) at the lock, target 0.42 of its height, az 160, ` +
      `el 44, ${P_LOCK.dist.toFixed(0)} m, 34 deg lens, shift 0.17; pairs with opening.lock-venue (W01's column at ${LOCK_DIST} m). ` +
      `Through the climb the night ground eases to W01's map top (${VENUE.ground}) and the shadow box to W01's at the column's scale (radius ` +
      `${lockKey.radius.toFixed(0)} m, W01's ${VENUE.key.radius} m x ${k.toFixed(2)}), so the pair agree in ground and shadow as well as in the column.`,
  }[which];

  return {
    time,
    note: notes,
    update(t) { pose(t); },
    decorate() {
      const P = ctx.plates;
      if (which === 'pad') {
        const c = padCopy(s, n);
        const cap = P.caption({ head: c.head, line: c.line });
        const sc = P.scope(c.scope);
        const keepOut = [cap, sc].filter(Boolean);
        // the plates keep off the equipment: every enclosure, skid, the yard and its two houses is an avoid box, and the
        // enclosures' and skids' leaders start at the block's west ends, so their plates stand in the open ground beside
        // the block (they had covered a dozen enclosures in its middle)
        const boxOf = (x0, x1, y0, y1, z0, z1) => {
          let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
          for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) {
            const q = P.project([x, y, z]); if (!q) continue;
            a = Math.min(a, q.x); b = Math.max(b, q.x); c = Math.min(c, q.y); d = Math.max(d, q.y);
          }
          return { x: a, y: c, w: b - a, h: d - c };
        };
        const encTop = ENC.PL + ENC.H, encHalfZ = ENC.W / 2 + 0.2;
        const avoid = [
          ...site.home.map((h) => boxOf(h.x + ENC.plinthX0, h.x + ENC.plinthX1, 0, encTop, h.z - encHalfZ, h.z + encHalfZ)),
          ...site.skidHome.map((h) => boxOf(h.x - 1.4, h.x + 1.4, 0, 2.9, h.z - 2.6, h.z + 2.6)),
          boxOf(Math.min(...A.yardCorners.map((v) => v.x)), Math.max(...A.yardCorners.map((v) => v.x)), 0, 12,
            Math.min(...A.yardCorners.map((v) => v.z)), Math.max(...A.yardCorners.map((v) => v.z))),
          boxOf(86, 102, 0, 3.4, 15.5, 24.5),
        ];
        P.leaders([
          { id: 'enclosures', text: c.enclosures.text, sub: c.enclosures.sub, at: A.enclosuresWest.toArray(), priority: 0 },
          { id: 'skids', text: c.skids.text, sub: c.skids.sub, at: A.skidsWest.toArray(), priority: 1 },
          { id: 'substation', text: c.substation.text, at: A.substation.toArray(), priority: 2 },
          { id: 'line', text: c.line2grid.text, at: A.line.toArray(), priority: 3 },
        ], { keepOut, avoid, max: 4 });
      } else if (which === 'column') {
        const c = columnCopy(s, { discharge: F.discharge, cycles: F.cycles, day: F.day, arm: F.arm, sealedCT: F.receipt.block_time.ct, sealedYours: yours(F.receipt.block_time.unix, { date: true, film: inFilm(P.root) }), max: F.max });
        const cap = P.caption({ head: c.head, line: c.line });
        const sc = P.scope(c.scope);
        const key = keyCard(P.root, [{ text: c.key, ramp: `linear-gradient(90deg, ${DISCHARGE_RAMP.join(', ')})`, ends: c.keyEnds }]);
        // the column's own place on the key (W01's card, wrapped): the ramp runs on sqrt(d / max), so 304.2 MWh sits at
        // 0.734 of the bar; a tick across the bar and its value under it tie the column's color to the scale
        const bar = key.querySelector('.ramp .bar');
        if (bar) {
          const at = `${(100 * rampAt(F.discharge, F.max)).toFixed(2)}%`;
          const tick = document.createElement('s');
          Object.assign(tick.style, { position: 'absolute', left: at, top: '-3px', bottom: '-3px', width: '2px', transform: 'translateX(-50%)', borderRadius: '1px', background: 'var(--w-fg, #e6e8ea)', boxShadow: '0 0 0 1px rgba(10, 12, 14, 0.55)', textDecoration: 'none' });
          const val = document.createElement('b'); val.textContent = c.keyMark;
          Object.assign(val.style, { left: at, color: 'var(--w-fg, #e6e8ea)' });
          bar.append(tick, val);
        }
        const keepOut = [cap, sc, rectOf(key, P.root)].filter(Boolean);
        const toCam = [Math.sin((160 * Math.PI) / 180), 0, -Math.cos((160 * Math.PI) / 180)];
        P.leaders([
          { id: 'top', text: c.top.text, sub: c.top.sub, at: [0, H, 0], priority: 0 },
          { id: 'foot', text: c.foot.text, sub: c.foot.sub, at: [toCam[0] * R, 0.5, toCam[2] * R], priority: 1 },
        ], { keepOut, max: 2 });
      } else if (which === 'gather') {
        P.scope(`Motion still between O01 and O02: the gather, as the landing intro's site gathers in chapter 06. Illustrative: the enclosures do not move.`);
      } else {
        P.scope(`Check frame: the real column at the lock, ${P_LOCK.dist.toFixed(0)} m (opening.lock); W01's at ${LOCK_DIST} m (opening.lock-venue).`);
      }
    },
  };
}

/** The venue's lock: W01's frame (stations/world/texas.ts) built by its own code, then posed at the lock camera with
 *  the field not yet risen (only Desert Willow's column standing) and no halo, the state the opening's entry asks of W01. */
async function venueLock(ctx: FrameContext): Promise<FrameHandle> {
  const { texas } = await import('../world/texas');
  const F = figures(ctx);
  const L: any = ctx.layout;
  const w01 = await texas(ctx);
  const T0 = L.texas;
  const dw = F.s.map;
  const x = T0.origin_world[0] + (dw.lon - T0.center_lon) * T0.m_per_deg_lon;
  const z = T0.origin_world[1] - (dw.lat - T0.center_lat) * T0.m_per_deg_lat;
  // the index of Desert Willow among W01's solid columns (texas.ts: the batteries with a point, exact ones solid)
  const solid = F.data.fleet.batteries.filter((b) => b.map && !b.map.missing && b.map.lat != null && b.map.lon != null && b.map.exact);
  const di = solid.findIndex((b) => b.resource === F.s.resource);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  let found = 0;
  ctx.stage.scene.traverse((o) => {
    if (o.isInstancedMesh && o.geometry?.attributes?.aHollow) {
      if (o.count === solid.length && found === 0) { for (let i = 0; i < o.count; i++) if (i !== di) o.setMatrixAt(i, zero); o.instanceMatrix.needsUpdate = true; found++; }
      else o.visible = false;
    }
    // the halo (two rings and a pool round Desert Willow) closes later, as the pull-back ends
    if (o.isMesh && !o.isInstancedMesh && Math.hypot(o.position.x - x, o.position.z - z) < 0.5 && (o.geometry?.type === 'RingGeometry' || o.material?.blending === THREE.AdditiveBlending)) o.visible = false;
  });
  if (!found || di < 0) throw new Error(`W01's columns were not found (solid mesh ${found}, Desert Willow index ${di}): its texas.ts has changed`);
  const k = (packRadius(Math.round(F.s.energy_mwh / 5.2)) + 1.5) / W01_COLUMN.r;
  const P_VENUE: CameraPose = { target: [x, W01_COLUMN.mapTop + 0.42 * F.w01H, z], az: 160, el: 44, dist: LOCK_DIST, vfov: 34, shift: [0.17, 0] };
  return {
    time: 0,
    note: `Check frame, not a storyboard frame: W01's own scene (stations/world/texas.ts, wrapped), only Desert Willow's column standing (${(2 * W01_COLUMN.r).toFixed(1)} x ` +
      `${F.w01H.toFixed(3)} m at [${x.toFixed(1)}, ${z.toFixed(1)}]), no halo, at the venue's lock: az 160, el 44, ${LOCK_DIST} m (the real lock's ${(LOCK_DIST * k).toFixed(0)} m / ${k.toFixed(2)}).`,
    update(t, dt) { w01.update?.(t, dt); ctx.stage.setCamera(P_VENUE); },
    decorate() { ctx.plates.scope(`Check frame: W01's column at the venue's lock, ${LOCK_DIST} m (opening.lock-venue); the real one at ${(LOCK_DIST * k).toFixed(0)} m (opening.lock).`); },
  };
}

export const frames: StationModule['frames'] = {
  'opening.pad': (ctx) => opening(ctx, 'pad'),
  'opening.column': (ctx) => opening(ctx, 'column'),
  'opening.gather': (ctx) => opening(ctx, 'gather'),
  'opening.lock': (ctx) => opening(ctx, 'lock'),
  'opening.lock-venue': venueLock,
};
