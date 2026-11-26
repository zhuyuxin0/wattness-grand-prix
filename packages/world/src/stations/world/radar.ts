// @ts-nocheck
// W02 · Weather radar: Dallas's cold-morning odds. On the Kalshi plinth a 22 m lattice mast turns a 9 m dish; beside it
// the scope, a 14 m round display under a glass dome, draws the ERCOT region, the fleet's points, a sweep and three
// blips: the Dallas market Cournot priced, and the Houston and natural gas markets it found. Lane A2 leaves east toward
// the garage as a review (dashed), since the read came after the seal.
import * as THREE from 'three';
import { createMaterials } from '../../kit/materials';
import { createBuilder, ensureBase } from '../../kit/geo';
import { buildFigure } from '../../kit/props';
import { comets, setLineResolution } from '../../kit/region/flows';
import { assignLayers } from '../../lib/stage';
import type { FrameContext, FrameHandle } from '../types';
import { caption } from '../../words';
import { ERCOT_RINGS } from './ercot-ring';
import {
  HEX, night, plinth, slab, laneMesh, ledLoop, pool, poleLight, screenMaterial, canvasTexture, coverMaterial, fineLine, roundRect, lin, flat,
} from './common';

const SCOPE = { x: -372, z: -66, r: 6.9, cy: 8.4, faceAz: 228, tilt: 10 };
// the mast stands behind the scope and to its left as the camera sees it, so the scope can be the frame's subject
const MAST = { x: -369, z: -101, h: 22 };
// The two cities the blips mark, for orientation on the scope: Dallas at the station the market resolves on (CLIDFW,
// Dallas/Fort Worth International Airport, NWS station metadata) and Houston at the city. Neither is a frame-data figure.
const DFW = { lat: 32.8998, lon: -97.0403 };
const HOU = { lat: 29.76, lon: -95.37 };
const SPIN = 12; // seconds a turn

const hms = (ct: string) => (/(\d\d:\d\d:\d\d)/.exec(ct) ?? [])[1] ?? ct;
const hm = (ct: string) => hms(ct).slice(0, 5);

export async function radar(ctx: FrameContext): Promise<FrameHandle> {
  const { stage, theme } = ctx;
  const data = ctx.needData();
  const L: any = ctx.layout;
  if (!L) throw new Error('src/data/layout.json is missing: run scripts/sync-data.sh');
  const cn = data.sponsors.cournot;
  const materials = createMaterials(THREE, theme);
  const world = new THREE.Group(); world.name = 'world-radar';
  const byId = Object.fromEntries(L.stations.map((s: any) => [s.id, s]));

  // ── apron, plinths, the return road (a design: not in the diagram) ────────────────────────────────────────────
  world.add(slab(roundRect(0, 0, 1040, 640, 14, 8), { y: 0, top: HEX.ground }));
  const rims = new THREE.Group(); rims.userData.overlay = true;
  for (const id of ['weather-radar', 'starting-grid', 'garage', 'arena']) {
    const s = byId[id]; if (!s) continue;
    const p = plinth({ ...s.footprint, corner: s.footprint.corner_m }, { jointO: [s.footprint.x0, s.footprint.z0] });
    world.add(p.mesh);
    const on = id === 'weather-radar';
    rims.add(ledLoop(p.top, p.h + 0.012, { color: on ? HEX.teal : HEX.rim, width: on ? 1.25 : 1, glow: on ? 7 : 0, glowA: 0.2, opacity: on ? 0.85 : 1 }));
  }
  world.add(rims);
  const main: [number, number][] = L.track.main_world;
  const road = main.filter(([x, z]) => x <= -486 && z >= -150 && z <= 130);
  if (road.length > 1) world.add(laneMesh(road, { w: 12, y: 0.012, lineA: 0.3 }));

  // ── lane A2: from the scope east toward the Risk desk, drawn as a review ─────────────────────────────────────
  const a2: [number, number][] = L.feeders.A2.world;
  world.add(laneMesh(a2, { w: 6, y: 0.13, lineA: 0.35, color: '#181b1f' }));
  const lanes = new THREE.Group(); lanes.userData.overlay = true;
  const a2pts = a2.map(([x, z]) => [x, 0.16, z]);
  lanes.add(fineLine(a2pts, { color: HEX.teal, width: 1.4, opacity: 0.42, dash: 2.2, gap: 1.6, reveal: false, caps: false, fade: [4, 30] }));
  const a2comet = comets(a2pts, { color: HEX.teal, core: 1.8, glow: 8, glowA: 0.22, period: 120, speed: 22, tail: 0.18, opacity: 0.5, reveal: false });
  lanes.add(a2comet);
  world.add(lanes);

  // ── the mast: a galvanized lattice, the kit's substation steel, with a platform and the dish ─────────────────────
  const b = createBuilder(THREE);
  const legs = (y: number) => { const half = 1.7 - (0.85 * y) / MAST.h; return [[-half, -half], [half, -half], [half, half], [-half, half]].map(([dx, dz]) => [MAST.x + dx, y, MAST.z + dz]); };
  const levels = [0, 2.6, 5.2, 7.8, 10.4, 13.0, 15.6, 18.2, 20.4];
  for (let i = 0; i < 4; i++) b.rod('mast|galv', legs(0)[i], legs(20.4)[i], 0.085, { seg: 8 });
  for (let k = 0; k < levels.length; k++) {
    const P = legs(levels[k]);
    for (let i = 0; i < 4; i++) b.rod('mast|galv', P[i], P[(i + 1) % 4], 0.045, { seg: 6 });
    if (k < levels.length - 1) {
      const Q = legs(levels[k + 1]);
      for (let i = 0; i < 4; i++) { b.rod('mast|galv', P[i], Q[(i + 1) % 4], 0.03, { seg: 5 }); b.rod('mast|galv', P[(i + 1) % 4], Q[i], 0.03, { seg: 5 }); }
    }
  }
  // footings, ladder cage, platform, railing
  for (const p of legs(0)) b.box('mast|concrete', 1.1, 0.5, 1.1, p[0], 0.25 + 0.12, p[2], { c: 0.05 });
  for (let y = 0.6; y < 20; y += 0.42) b.rod('mast|galv', [MAST.x - 0.25, y, MAST.z - 1.75 + (0.85 * y) / MAST.h], [MAST.x + 0.25, y, MAST.z - 1.75 + (0.85 * y) / MAST.h], 0.016, { seg: 4 });
  b.cyl('mast|steel', 2.5, 0.16, MAST.x, 20.5, MAST.z, { seg: 28 });
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; b.rod('mast|galv', [MAST.x + Math.cos(a) * 2.4, 20.58, MAST.z + Math.sin(a) * 2.4], [MAST.x + Math.cos(a) * 2.4, 21.6, MAST.z + Math.sin(a) * 2.4], 0.022, { seg: 4 }); }
  b.torus('mast|galv', 2.4, 0.03, MAST.x, 21.6, MAST.z, { rx: Math.PI / 2, seg: 40, tube: 5 });
  b.cyl('mast|dark', 0.55, 1.6, MAST.x, 21.4, MAST.z, { seg: 20 });
  // a status lamp at the platform: teal, the station is live
  b.sphere('mast|led', 0.16, MAST.x + 2.4, 21.75, MAST.z, { ws: 12, hs: 8 });
  const mast = b.build(materials.m);
  world.add(mast.group);

  // the dish: a 9 m paraboloid on a yoke, turning; its axis tilted up
  const dish = new THREE.Group(); dish.position.set(MAST.x, 22.3, MAST.z);
  const head = new THREE.Group(); dish.add(head);
  const db = createBuilder(THREE);
  const R = 4.5, f = 3.4;
  const prof: [number, number][] = [];
  for (let i = 0; i <= 24; i++) { const r = (R * i) / 24; prof.push([r, (r * r) / (4 * f)]); }
  db.lathe('dish|cool', prof, 0, 0, 0, { seg: 64 });
  const back: [number, number][] = prof.map(([r, y]) => [Math.max(0.0001, r * 1.0), y - 0.07]).reverse();
  db.lathe('dish|steel', back, 0, 0, 0, { seg: 64 });
  db.torus('dish|steel', R, 0.07, 0, (R * R) / (4 * f), 0, { rx: Math.PI / 2, seg: 72, tube: 8 });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; db.rod('dish|galv', [Math.cos(a) * 0.6, -0.5, Math.sin(a) * 0.6], [Math.cos(a) * R * 0.97, (R * R) / (4 * f) - 0.12, Math.sin(a) * R * 0.97], 0.045, { seg: 5 }); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; db.rod('dish|galv', [Math.cos(a) * R * 0.92, (R * R) / (4 * f) * 0.85, Math.sin(a) * R * 0.92], [0, f - 0.2, 0], 0.035, { seg: 5 }); }
  db.cyl('dish|dark', 0.28, 0.7, 0, f - 0.1, 0, { seg: 18 });
  db.cyl('dish|steel', 0.5, 0.8, 0, -0.6, 0, { seg: 20 });
  const dm = db.build(materials.m);
  head.add(dm.group);
  // yoke
  const yb = createBuilder(THREE);
  yb.box('yoke|dark', 2.2, 0.3, 1.2, 0, -0.2, 0, { c: 0.04 });
  for (const s of [-1, 1]) yb.box('yoke|dark', 0.22, 1.8, 0.9, s * 1.0, 0.6, 0, { c: 0.03 });
  dish.add(yb.build(materials.m).group);
  world.add(dish);

  // floodlights at the mast's foot: the station lights itself (cool, never the Arcade's tungsten)
  const spots: THREE.SpotLight[] = [];
  for (const [dx, dz, ty] of [[-4.5, 4.5, 12], [4.5, 5.0, 7]]) {
    const sp = new THREE.SpotLight('#dbe6f5', 240, 60, Math.PI * 0.16, 0.75, 1.6);
    sp.position.set(MAST.x + dx, 0.8, MAST.z + dz); sp.target.position.set(MAST.x, ty, MAST.z); sp.layers.enableAll();
    sp.castShadow = false; world.add(sp, sp.target); spots.push(sp);
    const fx = createBuilder(THREE); fx.box('fx|dark', 0.5, 0.35, 0.4, MAST.x + dx, 0.5, MAST.z + dz, { c: 0.03 });
    world.add(fx.build(materials.m).group);
  }
  world.add(pool(MAST.x, 0.135, MAST.z, 14, '#d6e2f0', 0.07));

  // a site worker at the mast's foot, for scale
  const fig = buildFigure(THREE, materials);
  const figure = (fig.group ?? fig);
  figure.position.set(SCOPE.x - 5.2, 0.12, SCOPE.z + 3.6); figure.rotation.y = 2.3;
  world.add(figure);

  // pole lights round the plinth (cool)
  for (const [x, z] of [[-410, -108], [-330, -108], [-340, -24], [-270, -24]]) world.add(poleLight(materials, x, z, { y0: 0.12 }));

  // ── the scope: a 14 m round display under a glass dome, on a yoke stand ─────────────────────────────────────────
  const scope = new THREE.Group();
  scope.position.set(SCOPE.x, SCOPE.cy, SCOPE.z);
  scope.rotation.order = 'YXZ';
  scope.rotation.y = -(SCOPE.faceAz * Math.PI) / 180 + Math.PI; // its face (+z local) toward faceAz
  scope.rotation.x = -(SCOPE.tilt * Math.PI) / 180;
  const sb = createBuilder(THREE);
  sb.cyl('shell|paint', SCOPE.r + 0.42, 1.1, 0, 0, -0.62, { rx: Math.PI / 2, seg: 96 });
  sb.torus('shell|dark', SCOPE.r + 0.22, 0.26, 0, 0, 0.02, { seg: 120, tube: 12 });
  sb.torus('shell|steel', SCOPE.r + 0.47, 0.06, 0, 0, -0.06, { seg: 120, tube: 6 });
  // the status ring of LEDs round the bezel: teal, live
  for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; sb.box('shell|led', 0.12, 0.12, 0.04, Math.cos(a) * (SCOPE.r + 0.47), Math.sin(a) * (SCOPE.r + 0.47), 0.03, { rz: a }); }
  scope.add(sb.build(materials.m).group);
  // the canvas
  const tex = canvasTexture(drawScope(data, cn));
  const screen = new THREE.Mesh(new THREE.CircleGeometry(SCOPE.r, 160), screenMaterial(tex, { gain: 1 }));
  screen.position.z = 0.04; scope.add(screen);
  // the dome: a cap of a sphere over the screen
  const sag = 1.05, Rc = (SCOPE.r * SCOPE.r + sag * sag) / (2 * sag), th = Math.asin(SCOPE.r / Rc);
  const domeGeo = new THREE.SphereGeometry(Rc, 128, 24, 0, Math.PI * 2, 0, th).rotateX(Math.PI / 2).translate(0, 0, 0.05 - (Rc - sag));
  const dome = new THREE.Mesh(domeGeo, coverMaterial({ tintA: 0.03, envA: 0.26, spec: 0.12, sheen: 0.012 }));
  dome.renderOrder = 8; dome.userData.overlay = true; dome.userData.noAO = true; scope.add(dome);
  world.add(scope);
  // a yoke: two graphite arms from the stand up to the disc's pivots, so it reads as mounted rather than balanced
  scope.updateMatrixWorld(true);
  const yk = createBuilder(THREE);
  for (const side of [-1, 1]) {
    const pv = scope.localToWorld(new THREE.Vector3(side * (SCOPE.r + 0.85), 0, -0.6));
    yk.box('yoke|dark', 0.75, pv.y - 0.12, 1.1, pv.x, (pv.y + 0.12) / 2, pv.z, { c: 0.06, ry: scope.rotation.y });
    yk.box('yoke|galv', 1.0, 1.0, 1.3, pv.x, pv.y, pv.z, { c: 0.08, ry: scope.rotation.y });
    yk.box('yoke|dark', 1.6, 0.4, 2.0, pv.x, 0.32, pv.z, { c: 0.05, ry: scope.rotation.y });
  }
  world.add(yk.build(materials.m).group);
  // the stand: a graphite pedestal and two arms to the shell
  const st = createBuilder(THREE);
  st.box('stand|dark', 5.2, 1.0, 3.2, SCOPE.x, 0.62, SCOPE.z, { c: 0.08 });
  st.box('stand|paint', 2.0, 1.7, 1.4, SCOPE.x, 1.95, SCOPE.z, { c: 0.06 });
  world.add(st.build(materials.m).group);
  // the screen's light on the plinth in front of it
  const faceV = new THREE.Vector3(Math.sin((SCOPE.faceAz * Math.PI) / 180), 0, -Math.cos((SCOPE.faceAz * Math.PI) / 180));
  world.add(pool(SCOPE.x + faceV.x * 7, 0.135, SCOPE.z + faceV.z * 7, 13, HEX.teal, 0.09));

  // ── the garage, 300 m east: its glass roof glowing over the bays ───────────────────────────────────────────────
  const gf = byId.garage.footprint;
  const glow = new THREE.Group(); glow.userData.overlay = true;
  for (const [x, z, r] of [[-200, -150, 60], [-200, -40, 50], [-205, -230, 40]]) { const v = pool(x, 9, z, r, '#9fe3d2', 0.05, { flat: false }); v.rotation.y = -Math.PI / 2 + 0.35; glow.add(v); }
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(gf.x1 - gf.x0, gf.z1 - gf.z0).rotateX(-Math.PI / 2), flat('#2b3a40', { opacity: 0.22 }));
  roof.position.set((gf.x0 + gf.x1) / 2, 18, (gf.z0 + gf.z1) / 2); roof.renderOrder = 6; glow.add(roof);
  for (const [x, z] of [[-150, -200], [-120, -60], [-40, -140], [30, -40], [110, -200], [140, -90]]) glow.add(pool(x, 0.2, z, 46, '#7fd9c4', 0.07));
  world.add(glow);

  assignLayers(world);
  ensureBase(THREE, world);
  stage.scene.add(world);
  materials.farNormals(stage.gtao.normalMaterial);

  night(stage);
  stage.setFade({ center: [0.55, 0.52], screen: [0.8, 1.5], world: [380, 700], worldCenter: [-330, -60], glow: [0.62, 0.46] });
  stage.setKey({ az: 215, el: 38, center: [-372, 9, -82], radius: 42, rimAz: 60 });
  stage.setAO({ radius: 0.6, scale: 1.1, thickness: 1.6, samples: 16 });
  stage.setShadowAuto(true);

  // the storyboard's line of sight brought in from 134.6 m to 112 m and lifted a little, so the scope's picture reads and
  // the mast stands whole on the left, the dish in frame, its foot and the worker clear of the caption
  const CAM = { target: [-372, 8.4, -66] as [number, number, number], az: 228, el: 3.5, dist: 50, vfov: 34, shift: [0.1, 0.02] as [number, number] };

  // the shot: the sweep just past the Dallas blip (scope's own clock)
  const dallasAng = scopeAngle(DFW);
  const shotSweep = dallasAng + 0.32;
  const time = (shotSweep / (Math.PI * 2)) * SPIN;
  const yes = (/YES price ([0-9.]+)/.exec(cn.probability.basis[0].summary) ?? [])[1] ?? cn.probability.value.toFixed(4);
  const seal = data.sealed_day.receipts[0].block_time.ct;

  return {
    time,
    note:
      `Real: the market Cournot resolved (${cn.resolve.market_id}, ${cn.resolve.station}, below ${cn.resolve.threshold_f}°F on ${cn.resolve.event_day}, ` +
      `matching confidence ${cn.resolve.matching_confidence}) and its probability ${cn.probability.value} (${cn.probability.ticker}), whose only basis is the Kalshi ` +
      `YES quote ${yes} at ${hms(cn.probability.basis[0].time.ct)} CT, read ${hms(cn.probability.observed.ct)} CT on Nov 25, after the seal (${hms(seal)} CT): ` +
      `a review, not an input (the Nov 26 plan had no outside inputs). Houston high and natural gas close are markets Cournot found (titles only; ` +
      `resolve-houston.json, resolve-natural-gas.json), not priced. The scope's Texas is the intro's HIFLD ERCOT polygon and its faint dots the fleet's ` +
      `mapped points (fleet_geo); the Dallas blip sits at the resolving station (CLIDFW, Dallas/Fort Worth airport) and Houston's at the city, positions ` +
      `from public station metadata, not the frame data; the natural gas ring sits outside the outline (a price, not a place). Illustrative: the mast, ` +
      `dish, stand and lights; A2 is drawn dashed as a review. Sponsor values stay internal until the sponsor release.`,
    update(t) {
      stage.setCamera(CAM);
      materials.detail.value.x = (2 * Math.tan((stage.camera.fov * Math.PI) / 360)) / (ctx.height * ctx.dpr);
      setLineResolution(world, ctx.width, ctx.height, ctx.dpr);
      head.rotation.set(0, 0, 0);
      dish.rotation.y = 2.62 - (t / 90) * Math.PI * 2;          // a slow turn; its bowl toward the south-south-west
      head.rotation.x = -(68 * Math.PI) / 180;                  // the axis 22 deg above the horizon
      const p = a2comet.material.userData.pulse; p.t.value = p.phase + t * p.speed;
      setSweep(tex, t);
    },
    decorate() {
      const P = ctx.plates;
      caption(ctx, { head: 'Texas weather odds', flavor: 'weather radar', line: "Kalshi's Texas weather markets, found and priced through Cournot." });
      P.scope(`Read ${hms(cn.probability.observed.ct)} CT on Nov 25, after the ${hm(seal)} CT seal: a review for the next gate, not an input to this plan.`);
      const pt = (geo) => { const [u, v] = scopeUV(geo); return scope.localToWorld(new THREE.Vector3(u * SCOPE.r, v * SCOPE.r, 0.6)).toArray(); };
      const hou = pt(HOU);
      const tx = ERCOT_RINGS[0].map(([lon, lat]) => P.project(pt({ lon, lat }))).filter(Boolean);
      const texasRect = { x: Math.min(...tx.map((q) => q.x)), y: Math.min(...tx.map((q) => q.y)), w: 0, h: 0 };
      texasRect.w = Math.max(...tx.map((q) => q.x)) - texasRect.x; texasRect.h = Math.max(...tx.map((q) => q.y)) - texasRect.y;
      P.leaders([
        { id: 'dallas', text: `Dallas low below ${cn.resolve.threshold_f}°F on Nov 26: ${Math.round(cn.probability.value * 100)}%`, sub: `Kalshi YES ${yes} · ${hms(cn.probability.basis[0].time.ct)} CT`, at: pt(DFW), priority: 0 },
        { id: 'found', text: 'Found: Houston high · natural gas close', at: hou, priority: 1 },
      ], { max: 3, avoid: [texasRect] });
    },
  };
}

// ── the scope's picture ───────────────────────────────────────────────────────────────────────────────────────────
const C = 2048, CR = 1000; // canvas size, the screen's radius in px
const MAPC = { lon: -99.0, lat: 31.1, k: 104 }; // the scope's own projection: px a degree of latitude
const GAS_UV = [0.66, -0.5];
function scopeUV({ lat, lon }) {
  const x = (lon - MAPC.lon) * Math.cos((31 * Math.PI) / 180) * MAPC.k, y = (lat - MAPC.lat) * MAPC.k;
  return [x / CR, y / CR];
}
function scopeAngle(geo) { const [u, v] = scopeUV(geo); return Math.atan2(u, v); } // clockwise from north

let base: HTMLCanvasElement | null = null;
let live: HTMLCanvasElement | null = null;
let lastSweep = NaN;
function drawScope(data, cn) {
  base = document.createElement('canvas'); base.width = base.height = C;
  const g = base.getContext('2d');
  const c0 = C / 2;
  g.fillStyle = '#000'; g.fillRect(0, 0, C, C);
  const bg = g.createRadialGradient(c0, c0, 0, c0, c0, CR);
  bg.addColorStop(0, '#111719'); bg.addColorStop(0.75, '#0e1315'); bg.addColorStop(1, '#0b0f11');
  g.fillStyle = bg; g.beginPath(); g.arc(c0, c0, CR, 0, Math.PI * 2); g.fill();
  // range rings and the cross
  g.strokeStyle = '#242b31'; g.lineWidth = 3;
  for (const k of [0.25, 0.5, 0.75]) { g.beginPath(); g.arc(c0, c0, CR * k, 0, Math.PI * 2); g.stroke(); }
  g.strokeStyle = '#323a42'; g.lineWidth = 4; g.beginPath(); g.arc(c0, c0, CR * 0.985, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#1e2429'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(c0 - CR, c0); g.lineTo(c0 + CR, c0); g.moveTo(c0, c0 - CR); g.lineTo(c0, c0 + CR); g.stroke();
  // bearing ticks every 5 degrees, longer every 30
  for (let d = 0; d < 360; d += 5) {
    const a = (d * Math.PI) / 180, l = d % 30 === 0 ? 46 : 20;
    g.strokeStyle = d % 30 === 0 ? '#5d666f' : '#394149'; g.lineWidth = d % 30 === 0 ? 4 : 2.5;
    g.beginPath(); g.moveTo(c0 + Math.sin(a) * (CR * 0.985 - l), c0 - Math.cos(a) * (CR * 0.985 - l)); g.lineTo(c0 + Math.sin(a) * CR * 0.985, c0 - Math.cos(a) * CR * 0.985); g.stroke();
  }
  // the ERCOT region
  const P = (lon, lat) => { const [u, v] = scopeUV({ lon, lat }); return [c0 + u * CR, c0 - v * CR]; };
  g.beginPath();
  for (const ring of ERCOT_RINGS) { ring.forEach(([lon, lat], i) => { const [x, y] = P(lon, lat); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); }
  g.fillStyle = '#16262a'; g.fill();
  g.strokeStyle = '#2ec7a6'; g.lineWidth = 7; g.lineJoin = 'round'; g.stroke();
  // the fleet's mapped points, faint
  g.fillStyle = 'rgba(46,199,166,0.5)';
  for (const bt of data.fleet.batteries) { const m = bt.map; if (!m || m.lat == null) continue; const [x, y] = P(m.lon, m.lat); g.beginPath(); g.arc(x, y, 5.5, 0, Math.PI * 2); g.fill(); }
  // found: Houston (a ring), natural gas (a dashed ring outside the outline)
  const [hx, hy] = P(HOU.lon, HOU.lat);
  g.strokeStyle = '#a3abb3'; g.lineWidth = 7; g.beginPath(); g.arc(hx, hy, 34, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#a3abb3'; g.beginPath(); g.arc(hx, hy, 6, 0, Math.PI * 2); g.fill();
  const gx = c0 + GAS_UV[0] * CR, gy = c0 - GAS_UV[1] * CR;
  g.setLineDash([18, 13]); g.lineWidth = 7; g.beginPath(); g.arc(gx, gy, 42, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  g.beginPath(); g.arc(gx, gy, 6, 0, Math.PI * 2); g.fill();
  live = document.createElement('canvas'); live.width = live.height = C;
  live.getContext('2d').drawImage(base, 0, 0);
  void cn;
  return live;
}
/** The sweep at time t: a bright line and a fading trail behind it; the Dallas blip lit as the sweep has just passed. */
function setSweep(tex, t) {
  const a = ((t % SPIN) / SPIN) * Math.PI * 2;
  if (a === lastSweep || !live || !base) return;
  lastSweep = a;
  const g = live.getContext('2d'), c0 = C / 2;
  g.clearRect(0, 0, C, C); g.drawImage(base, 0, 0);
  g.save(); g.beginPath(); g.arc(c0, c0, CR * 0.982, 0, Math.PI * 2); g.clip();
  const trail = 1.25;
  for (let i = 0; i < 90; i++) {
    const a0 = a - (trail * (i + 1)) / 90, a1 = a - (trail * i) / 90, k = 1 - i / 90;
    g.fillStyle = `rgba(46,199,166,${(0.26 * k * k).toFixed(4)})`;
    g.beginPath(); g.moveTo(c0, c0); g.arc(c0, c0, CR, a0 - Math.PI / 2, a1 - Math.PI / 2 + 0.002); g.closePath(); g.fill();
  }
  g.strokeStyle = 'rgba(126,240,214,1)'; g.lineWidth = 9;
  g.beginPath(); g.moveTo(c0, c0); g.lineTo(c0 + Math.sin(a) * CR, c0 - Math.cos(a) * CR); g.stroke();
  g.restore();
  // Dallas: priced, lit by the pass; brighter the closer the sweep has just come by
  const [u, v] = scopeUV(DFW), dx = c0 + u * CR, dy = c0 - v * CR;
  let since = a - Math.atan2(u, v); while (since < 0) since += Math.PI * 2;
  const lit = Math.exp(-since / 1.6);
  const halo = g.createRadialGradient(dx, dy, 0, dx, dy, 90);
  halo.addColorStop(0, `rgba(46,199,166,${(0.55 * lit).toFixed(3)})`); halo.addColorStop(1, 'rgba(46,199,166,0)');
  g.fillStyle = halo; g.beginPath(); g.arc(dx, dy, 90, 0, Math.PI * 2); g.fill();
  g.strokeStyle = `rgba(46,199,166,${(0.5 + 0.5 * lit).toFixed(3)})`; g.lineWidth = 9; g.beginPath(); g.arc(dx, dy, 44, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#f6f7f8'; g.beginPath(); g.arc(dx, dy, 16, 0, Math.PI * 2); g.fill();
  tex.needsUpdate = true;
}
