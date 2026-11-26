// @ts-nocheck
// W03 · Race day: telemetry against the sealed schedule. Looking back up the lane toward Parc fermé's gold: three
// outcome gates over the lane, dark with hatched stamps (nothing has linked); the timing pylon's 96 fifteen-minute rows
// for the hub and the node, hatched until they run, beside the sealed schedule; and along the lane's east edge the day
// as the track Desert Willow runs: each hour's price from the plan's own forecast at its node, filled where the sealed
// schedule runs it (teal discharging on the peaks, blue-gray charging in the valleys). Lit for the 90 s cut (Jo, Nov 26):
// the night raised, the price bars' graphite lighter and the price line heavier, the camera nearer so the day's track
// fills the frame, the words a size up.
import * as THREE from 'three';
import { createMaterials } from '../../kit/materials';
import { createBuilder, ensureBase } from '../../kit/geo';
import { comets, setLineResolution } from '../../kit/region/flows';
import { assignLayers } from '../../lib/stage';
import type { FrameContext, FrameHandle } from '../types';
import { caption, litType } from '../../words';
import { inFilm, yours } from '../../lib/yours';
import {
  HEX, night, plinth, slab, laneMesh, ledLoop, pool, poleLight, screenMaterial, canvasTexture, coverMaterial, fineLine, roundRect, lin, flat, keyCard, rectOf, usd2,
  columns, boxGeometry,
} from './common';

const LANE_X = 370;
/** The night raised for this frame: the moon and the sky's fill brighter (the venue's rig is key 0.32, fill 0.42). */
const NIGHT_LIT = { key: { color: '#93a8d4', intensity: 0.62 }, rim: { color: '#7f95c0', intensity: 0.34 }, fill: { sky: '#4f6388', ground: '#1b1914', intensity: 0.8 }, env: 0.14, shadow: 0.2 };
const DAY = { zFrom: -124, zTo: -48 };      // the race-day plinth's stretch of the lane: HE01 at the north end, the day running south
const PRICE_K = 0.14;                       // metres a $/MWh (kit/pricebars.ts: $0 to $100 over 0 to 14 m)
const TRACK_X = LANE_X + 7.6;               // the price track along the lane's east edge
const PYLON = { x: 330, z: -86, w: 8, h: 32, faceAz: 198 };
const GATES = [-112, -96, -80];

// the price bars' graphite: lighter than the first cut's #30363d, so the unfilled hours read against the lane at night
const CORE = '#4c555f';
const hourWords = (h: number) => (h % 24 === 0 ? 'midnight' : h === 12 ? 'noon' : h < 12 ? `${h} am` : `${h - 12} pm`);

export async function raceDay(ctx: FrameContext): Promise<FrameHandle> {
  const { stage, theme } = ctx;
  const data = ctx.needData();
  const L: any = ctx.layout;
  if (!L) throw new Error('src/data/layout.json is missing: run scripts/sync-data.sh');
  const sc = data.showcase, C = sc.arms[sc.selected_arm];
  const fc = sc.forecast;
  const materials = createMaterials(THREE, theme);
  const world = new THREE.Group(); world.name = 'world-race-day';
  const byId = Object.fromEntries(L.stations.map((s: any) => [s.id, s]));

  // ── apron, plinths: race day (live), Parc fermé (BNB yellow), the stewards (where the camera stands) ─────────────
  world.add(slab(roundRect(0, 0, 1040, 640, 14, 8), { y: 0, top: HEX.ground }));
  const rims = new THREE.Group(); rims.userData.overlay = true;
  for (const id of ['race-day', 'parc-ferme', 'stewards', 'garage']) {
    const s = byId[id]; if (!s) continue;
    const p = plinth({ ...s.footprint, corner: s.footprint.corner_m }, { jointO: [s.footprint.x0, s.footprint.z0] });
    world.add(p.mesh);
    const col = id === 'parc-ferme' ? HEX.bnb : id === 'race-day' ? HEX.teal : HEX.rim;
    rims.add(ledLoop(p.top, p.h + 0.012, { color: col, width: id === 'stewards' || id === 'garage' ? 1 : 1.3, glow: id === 'parc-ferme' ? 4 : id === 'race-day' ? 5 : 0, glowA: 0.2, opacity: id === 'race-day' ? 0.55 : id === 'parc-ferme' ? 0.6 : 0.9 }));
  }
  world.add(rims);

  // ── the lane: out of Parc fermé's ring, A4, race day, A5, into the stewards ───────────────────────────────────
  const main: [number, number][] = L.track.main_world;
  const iA = main.findIndex(([x, z]) => Math.abs(x - 256) < 0.5 && Math.abs(z + 140) < 0.5);
  const lanePts = main.slice(iA, iA + 120).filter(([x, z]) => z < 60);
  world.add(laneMesh(lanePts, { w: 12, y: 0.127 }));
  const edges = new THREE.Group(); edges.userData.overlay = true;
  // the lane's LED edge strips through race day, teal (live), and the comets running south
  for (const s of [-1, 1]) edges.add(fineLine([[LANE_X + s * 6.15, 0.16, -140], [LANE_X + s * 6.15, 0.16, -30]], { color: HEX.teal, width: 1.4, glow: 6, glowA: 0.2, opacity: 0.55, reveal: false, caps: false, fade: [6, 6] }));
  const run = comets([[LANE_X, 0.18, -150], [LANE_X, 0.18, -20]], { color: HEX.teal, core: 2, glow: 9, glowA: 0.25, period: 52, speed: 26, tail: 0.42, opacity: 0.7, reveal: false });
  edges.add(run);
  world.add(edges);

  // ── the price track: 24 hours along the lane's east edge (the plan's node forecast; the sealed schedule fills it) ──
  const hours = fc.node_da_cents.map((c: number, h: number) => ({ h, usd: c / 100, kw: C.kw[h] }));
  const segLen = (DAY.zTo - DAY.zFrom) / 24;
  const zOfHour = (h: number) => DAY.zFrom + (h + 0.5) * segLen;
  const tb = createBuilder(THREE);
  // a graphite rail under the bars, the track's kerb
  tb.box('rail|dark', 1.1, 0.34, DAY.zTo - DAY.zFrom + 1.4, TRACK_X, 0.12 + 0.17, (DAY.zFrom + DAY.zTo) / 2, { c: 0.05 });
  world.add(tb.build(materials.m).group);
  // each hour a bar on the walkthrough's shading: the price a graphite core, the schedule's share of the hour filled
  const cores: any[] = [], filled: any[] = [];
  const fills = new THREE.Group();
  for (const hr of hours) {
    const hgt = hr.usd * PRICE_K, z = zOfHour(hr.h), y0 = 0.46;
    const run = Math.abs(hr.kw) / (sc.power_mw * 1000);
    const fh = run > 0.001 ? Math.max(0.05, hgt * run) : 0;
    if (hgt - fh > 0.01) cores.push({ x: TRACK_X, y: y0 + fh, z, size: [0.7, hgt - fh, segLen - 0.34], color: CORE });
    if (fh > 0) {
      filled.push({ x: TRACK_X, y: y0, z, size: [0.76, fh, segLen - 0.3], color: hr.kw > 0 ? HEX.teal : HEX.charge });
      fills.add(pool(TRACK_X - 3, 0.14, z, 4.5 + 4 * run, hr.kw > 0 ? HEX.teal : HEX.charge, 0.12 * run + 0.03));
    }
  }
  world.add(columns(cores, { geometry: boxGeometry() }), columns(filled, { geometry: boxGeometry() }), fills);
  // the price line over the bars: the track's profile, stepped hour by hour
  const prof: number[][] = [];
  for (const hr of hours) { const z0 = DAY.zFrom + hr.h * segLen + 0.17, z1 = z0 + segLen - 0.34, y = 0.46 + hr.usd * PRICE_K + 0.04; prof.push([TRACK_X, y, z0], [TRACK_X, y, z1]); }
  const profile = new THREE.Group(); profile.userData.overlay = true;
  profile.add(fineLine(prof, { color: '#f6f7f8', width: 2.6, glow: 8, glowA: 0.24, opacity: 0.95, reveal: false }));
  // a cool wash along the track, so the day's bars stand on a lit kerb
  for (let z = DAY.zFrom + 6; z <= DAY.zTo; z += 14) profile.add(pool(TRACK_X - 2.5, 0.14, z, 11, '#cfdcee', 0.07));
  world.add(profile);

  // ── three outcome gates over the lane: dark, each stamp hatched until its stage links ────────────────────────────
  const gb = createBuilder(THREE);
  const stampTex = canvasTexture(drawStamp());
  const stamps = new THREE.Group();
  for (const z of GATES) {
    for (const s of [-1, 1]) {
      gb.box('gate|galv', 0.9, 12, 0.9, LANE_X + s * 9.6, 6.12, z, { c: 0.08 });
      gb.box('gate|dark', 1.3, 0.3, 1.3, LANE_X + s * 9.6, 0.27, z, { c: 0.04 });
    }
    gb.box('gate|dark', 20.4, 1.5, 1.1, LANE_X, 12.0, z, { c: 0.08 });
    gb.box('gate|galv', 20.6, 0.12, 1.2, LANE_X, 12.81, z, { c: 0.02 });
    gb.box('gate|galv', 20.6, 0.12, 1.2, LANE_X, 11.19, z, { c: 0.02 });
    gb.box('gate|dark', 6.4, 2.4, 0.5, LANE_X, 12.0, z + 0.7, { c: 0.05 });
    const stamp = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 2.05), screenMaterial(stampTex));
    stamp.position.set(LANE_X, 12.0, z + 0.96); stamps.add(stamp);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 2.25), coverMaterial({ tintA: 0.05, envA: 0.4, rimLine: 1, sheen: 0.03 }));
    glass.position.set(LANE_X, 12.0, z + 1.0); glass.renderOrder = 7; glass.userData.overlay = true; stamps.add(glass);
    // an idle LED under the beam
    const led = new THREE.Mesh(new THREE.BoxGeometry(18.6, 0.06, 0.06), flat(HEX.rim, { gain: 1.4 }));
    led.position.set(LANE_X, 11.2, z + 0.56); stamps.add(led);
  }
  world.add(gb.build(materials.m).group, stamps);

  // ── the timing pylon: glass over graphite, 96 rows and the sealed schedule ───────────────────────────────────────
  const pylon = new THREE.Group();
  pylon.position.set(PYLON.x, 0.12, PYLON.z);
  pylon.rotation.y = Math.PI - (PYLON.faceAz * Math.PI) / 180;
  const pb = createBuilder(THREE);
  pb.box('pylon|dark', PYLON.w + 0.9, PYLON.h + 0.9, 1.6, 0, (PYLON.h + 0.9) / 2, -0.4, { c: 0.12 });
  pb.box('pylon|galv', 0.14, PYLON.h + 0.6, 1.7, -(PYLON.w + 0.9) / 2, (PYLON.h + 0.9) / 2, -0.4, { c: 0.02 });
  pb.box('pylon|galv', 0.14, PYLON.h + 0.6, 1.7, (PYLON.w + 0.9) / 2, (PYLON.h + 0.9) / 2, -0.4, { c: 0.02 });
  pb.box('pylon|dark', PYLON.w + 1.6, 0.6, 2.4, 0, 0.3, -0.4, { c: 0.06 });
  pb.box('pylon|dark', PYLON.w + 1.1, 0.5, 1.9, 0, PYLON.h + 1.15, -0.4, { c: 0.06 });
  pylon.add(pb.build(materials.m).group);
  const pTex = canvasTexture(drawPylon(C, sc));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(PYLON.w, PYLON.h - 0.4), screenMaterial(pTex));
  face.position.set(0, PYLON.h / 2 + 0.45, 0.42); pylon.add(face);
  const cover = new THREE.Mesh(new THREE.PlaneGeometry(PYLON.w + 0.2, PYLON.h - 0.2), coverMaterial({ tintA: 0.05, envA: 0.45, rimLine: 1, sheen: 0.03 }));
  cover.position.set(0, PYLON.h / 2 + 0.45, 0.5); cover.renderOrder = 7; cover.userData.overlay = true; pylon.add(cover);
  world.add(pylon);
  const pf = new THREE.Vector3(Math.sin((PYLON.faceAz * Math.PI) / 180), 0, -Math.cos((PYLON.faceAz * Math.PI) / 180));
  world.add(pool(PYLON.x + pf.x * 7, 0.135, PYLON.z + pf.z * 7, 12, '#9fb0c4', 0.06));

  // ── Parc fermé at the lane's end: the gold root plate, its 316 ticks, the ring track ────────────────────────────
  const pfz = byId['parc-ferme'];
  const root = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 0.5, 96), flat(HEX.bnb, { gain: 0.16 }));
  plate.position.set(358, 0.37, -200); root.add(plate);
  const rimG = new THREE.Mesh(new THREE.TorusGeometry(14, 0.16, 8, 160).rotateX(Math.PI / 2), flat(HEX.bnb, { gain: 0.6 }));
  rimG.position.set(358, 0.63, -200); root.add(rimG);
  const tick = new THREE.BoxGeometry(0.22, 0.5, 1.4).translate(0, 0.25, 0);
  const ticks = new THREE.InstancedMesh(tick, flat(HEX.bnb, { gain: 0.55 }), data.sealed_day.leaf_count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < data.sealed_day.leaf_count; i++) {
    const a = (i / data.sealed_day.leaf_count) * Math.PI * 2;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    m4.compose(new THREE.Vector3(358 + Math.cos(a) * 22, 0.12, -200 + Math.sin(a) * 22), q, new THREE.Vector3(1, 1, 1));
    ticks.setMatrixAt(i, m4);
  }
  root.add(ticks);
  root.add(pool(358, 0.2, -200, 46, HEX.bnb, 0.08));
  // the gold seen down the lane as a soft standing glow over the plate
  const halo = pool(358, 6, -196, 24, HEX.bnb, 0.07, { flat: false }); halo.rotation.y = 0.33; root.add(halo);
  root.userData.overlay = true;
  world.add(root);
  void pfz;

  // pole lights along the lane, every 60 m (cool)
  for (const z of [-140, -80, -20]) world.add(poleLight(materials, LANE_X - 14, z, { y0: 0.12 }));
  for (const z of [-110, -50]) world.add(poleLight(materials, LANE_X + 16, z, { y0: 0.12 }));

  assignLayers(world);
  ensureBase(THREE, world);
  stage.scene.add(world);
  materials.farNormals(stage.gtao.normalMaterial);

  night(stage);
  stage.setLight({ ...NIGHT_LIT });
  stage.setFade({ center: [0.58, 0.45], screen: [0.85, 1.6], world: [260, 520], worldCenter: [360, -110], glow: [0.6, 0.42] });
  stage.setKey({ az: 235, el: 44, center: [356, 6, -90], radius: 58, rimAz: 70 });
  stage.setAO({ radius: 0.55, scale: 1.1, thickness: 1.5, samples: 16 });
  stage.setShadowAuto(true);

  // the storyboard's reverse angle lifted from below the gates to 6 deg above the lane and swung west, so the whole
  // day's track stands in frame (from the storyboard's pose its last hours ran off the right edge)
  // nearer than the first cut (112 m): the day's 24 hours span the frame's right half and the pylon stands whole beside them
  const CAM = { target: [366, 9.5, -88] as [number, number, number], az: 215, el: 7.5, dist: 97, vfov: 40, shift: [0.06, 0.06] as [number, number] };
  const close = data.sponsors.event.submission_close;
  const peak = hours.reduce((a, b) => (b.usd > a.usd ? b : a)), low = hours.reduce((a, b) => (b.usd < a.usd ? b : a));

  return {
    time: 2.0,
    note:
      `Waiting state: operating day ${data.sealed_day.operating_day} runs Nov 26 00:00 to 24:00 CT and nothing has linked yet (no outcome stage exists), ` +
      `so the gates' stamps and the pylon's 96 rows are hatched, never zero. Real: the 24 hours along the lane are Desert Willow's sealed arm ` +
      `${sc.selected_arm} (showcase.arms.${sc.selected_arm}.kw: discharge teal, charge #7f9cc0, filled to its share of ${sc.power_mw} MW) over each hour's ` +
      `price in the plan's own forecast at ${sc.settlement_point} (showcase.forecast.node_da_cents, ${fc.method.split(':')[0]}), on the kit's price ` +
      `scale (0.14 m a $/MWh): ${usd2(low.usd)} at ${hourWords(low.h)} (the valley it charges in) to ${usd2(peak.usd)} at ${hourWords(peak.h)} ` +
      `(the peak it discharges on). These are forecasts, not settled prices; real-time prices arrive as the day runs. The pylon's strip is the same ` +
      `schedule. The submission closes ${close.ct} (${close.bangkok}), before the day ends, so a submission shows real-time rows up to about 20:00 CT ` +
      `and says the day is still running. Illustrative: the gates, pylon, lights and Parc fermé's plate, ticks (${data.sealed_day.leaf_count}, the sealed ` +
      `leaf count) and glow; the comets carry no figure. Render again when stage 1 links.`,
    update(t) {
      stage.setCamera(CAM);
      materials.detail.value.x = (2 * Math.tan((stage.camera.fov * Math.PI) / 360)) / (ctx.height * ctx.dpr);
      setLineResolution(world, ctx.width, ctx.height, ctx.dpr);
      const p = run.material.userData.pulse; p.t.value = p.phase + t * p.speed;
    },
    decorate() {
      const P = ctx.plates;
      litType(ctx);
      caption(ctx, { head: 'The day the plan runs', flavor: 'race day', line: 'Operating day Nov 26: real-time prices arrive against the sealed schedule.' });
      P.scope('The sealed schedule does not change; outcomes link to the same record.');
      const key = keyCard(P.root, [
        { text: `Desert Willow's day, as the track it runs`, strong: true },
        { text: `Height: the plan's forecast price at ${sc.settlement_point}, $/MWh`, swatch: { background: CORE, boxShadow: 'inset 0 -2px 0 #f6f7f8' } },
        { text: `Filled: sealed arm ${sc.selected_arm}, discharging`, swatch: { background: HEX.teal } },
        { text: `Filled: sealed arm ${sc.selected_arm}, charging`, swatch: { background: HEX.charge } },
        { text: 'Hatched: not yet run or linked', swatch: { background: `repeating-linear-gradient(135deg, #59626b 0 2px, #1f2429 2px 4px)` } },
      ]);
      const keyRect = rectOf(key, P.root);
      const names = ['Day-ahead · links at stage 1', 'Real-time provisional', 'Real-time final'];
      const plates = GATES.map((z, i) => ({ id: `gate${i}`, text: names[i], at: [LANE_X - 3.2, 13.2, z + 0.9] as [number, number, number], priority: i + 3 }));
      const top = pylon.localToWorld(new THREE.Vector3(-PYLON.w / 2 + 0.8, PYLON.h + 0.2, 0.6)).toArray();
      const foot = pylon.localToWorld(new THREE.Vector3(PYLON.w / 2 - 0.6, 3.2, 0.6)).toArray();
      // the operating day starts 14 hours after its gate (10:00 CT the day before), at midnight CT
      const starts = yours(Number(data.sealed_day.gate.unix) + 14 * 3600, { date: true, film: inFilm(ctx.plates.root) });
      plates.push({ id: 'pylon', text: 'HB_NORTH · DSWL_BES1 · 15-minute', sub: `Starts Nov 26, 00:00 CT${starts ? ` · ${starts}` : ''}`, at: top, priority: 0 });
      plates.push(
        { id: 'peak', text: `${usd2(peak.usd)}/MWh · ${hourWords(peak.h)} to ${hourWords(peak.h + 1)}`, sub: `Discharging ${Math.round(Math.abs(C.kw[peak.h]) / 1000)} MW`, at: [TRACK_X, 0.46 + peak.usd * PRICE_K + 0.05, zOfHour(peak.h)] as [number, number, number], priority: 1 },
        { id: 'low', text: `${usd2(low.usd)}/MWh · ${hourWords(low.h)} to ${hourWords(low.h + 1)}`, sub: `Charging ${Math.round(Math.abs(C.kw[low.h]) / 1000)} MW`, at: [TRACK_X, 0.46 + low.usd * PRICE_K + 0.05, zOfHour(low.h)] as [number, number, number], priority: 2 },
      );
      // the hour ticks first, so the plates keep off them
      const hourRects = P.ticks('hours', [0, 6, 12, 18, 23].map((h) => ({ at: [TRACK_X - 1.4, 0.2, h === 23 ? DAY.zTo : DAY.zFrom + h * segLen] as [number, number, number], text: h === 23 ? 'midnight' : hourWords(h), align: 'left' as const })), 'hwalk-tick');
      P.leaders(plates, { keepOut: [keyRect, ...hourRects], max: 6 });
      void foot;
    },
  };
}

// ── the gates' stamp: dark glass, a hatched seal-shaped stamp (nothing linked) ─────────────────────────────────────
function drawStamp() {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 410;
  const g = c.getContext('2d');
  g.fillStyle = '#0e1214'; g.fillRect(0, 0, c.width, c.height);
  g.save(); g.beginPath(); g.roundRect(340, 55, 520, 300, 40); g.clip();
  g.fillStyle = '#14181b'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#3a424b'; g.lineWidth = 9;
  for (let x = -400; x < 1600; x += 30) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 410, 410); g.stroke(); }
  g.restore();
  g.strokeStyle = '#4b555f'; g.lineWidth = 6; g.beginPath(); g.roundRect(340, 55, 520, 300, 40); g.stroke();
  return c;
}

// ── the pylon: 96 rows of two columns (hatched: not yet run) and the sealed hours beside them ────────────────────────
function drawPylon(C, sc) {
  const W = 1000, H = 3900, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1012'; g.fillRect(0, 0, W, H);
  const top = 150, bottom = H - 60, rowH = (bottom - top) / 96;
  // the header band: two column heads as bars (the words are plates), the day's lamp hatched
  g.fillStyle = '#161b1f'; g.fillRect(0, 0, W, top - 24);
  g.fillStyle = '#2ec7a6'; g.fillRect(40, top - 54, 120, 10);
  g.fillStyle = '#3a424b'; g.fillRect(200, top - 54, 250, 10); g.fillRect(490, top - 54, 250, 10);
  const colX = [[200, 450], [490, 740]];
  for (let i = 0; i < 96; i++) {
    const y = top + i * rowH;
    if (i % 4 === 0) { g.fillStyle = '#1b2024'; g.fillRect(30, y, W - 60, 2); }
    for (const [x0, x1] of colX) {
      g.save(); g.beginPath(); g.rect(x0, y + 3, x1 - x0, rowH - 6); g.clip();
      g.fillStyle = '#171c20'; g.fillRect(x0, y, x1 - x0, rowH);
      g.strokeStyle = '#353d46'; g.lineWidth = 5;
      for (let x = x0 - 60; x < x1 + 60; x += 18) { g.beginPath(); g.moveTo(x, y + rowH); g.lineTo(x + rowH, y); g.stroke(); }
      g.restore();
    }
    // the hour's index mark on the left every hour
    if (i % 4 === 0) { g.fillStyle = (i / 4) % 6 === 0 ? '#5d666f' : '#2b3036'; g.fillRect(40, y + 6, (i / 4) % 6 === 0 ? 90 : 46, 6); }
  }
  // the sealed schedule: one bar an hour across four rows, from a center line (discharge right teal, charge left blue-gray)
  const sx0 = 780, sx1 = W - 40, mid = (sx0 + sx1) / 2, half = (sx1 - sx0) / 2 - 6;
  g.fillStyle = '#2b3036'; g.fillRect(mid - 1.5, top, 3, bottom - top);
  for (let h = 0; h < 24; h++) {
    const kw = C.kw[h], k = Math.abs(kw) / (sc.power_mw * 1000);
    const y = top + h * 4 * rowH + 6, hh = 4 * rowH - 12;
    if (k < 0.001) continue;
    g.fillStyle = kw > 0 ? '#2ec7a6' : '#7f9cc0';
    if (kw > 0) g.fillRect(mid + 3, y, half * k, hh); else g.fillRect(mid - 3 - half * k, y, half * k, hh);
  }
  // the gold seal lamp at the head: the schedule is sealed
  g.fillStyle = '#F0B90B'; g.beginPath(); g.arc(mid, top - 50, 16, 0, Math.PI * 2); g.fill();
  return c;
}
