// @ts-nocheck
// W01 · Texas: where the 316 batteries are. The ERCOT plinth seen from the south-south-east: the ERCOT region in the
// diagram language of the intro's region (a flat slab shaded by face, a pixel edge, a feathered shade), each mapped
// battery a column at its own point (height and color its planned discharge), the points placed by county,
// substation or sibling drawn hollow, and the 46 batteries with no coordinates lying in four trays by load zone.
import * as THREE from 'three';
import { Builder, flatMaterial, lineMaterial, lin, shadeMesh, offsetPoly } from '../../kit/region/geo';
import { comets } from '../../kit/region/flows';
import { createMaterials } from '../../kit/materials';
import { ensureBase } from '../../kit/geo';
import { assignLayers } from '../../lib/stage';
import type { FrameContext, FrameHandle } from '../types';
import { caption } from '../../words';
import { ERCOT_RINGS } from './ercot-ring';
import {
  HEX, night, plinth, slab, laneMesh, catcher, ledLoop, pool, columns, dischargeHex, DISCHARGE_RAMP, keyCard, rectOf, n0, fineLine, roundRect,
} from './common';
import { setLineResolution } from '../../kit/region/flows';

const MAP_TOP = 0.62;     // the region slab's top, over the plinth's 0.12
const COL_R = 0.45;       // footprint 0.9 m

export async function texas(ctx: FrameContext): Promise<FrameHandle> {
  const { stage, theme } = ctx;
  const data = ctx.needData();
  const L: any = ctx.layout;
  if (!L) throw new Error('src/data/layout.json is missing: run scripts/sync-data.sh');
  const T = L.texas, G = L.grid;
  const fleet = data.fleet;
  const materials = createMaterials(THREE, theme);
  const world = new THREE.Group(); world.name = 'world-texas';

  const toXZ = (lon: number, lat: number): [number, number] => [
    T.origin_world[0] + (lon - T.center_lon) * T.m_per_deg_lon,
    T.origin_world[1] - (lat - T.center_lat) * T.m_per_deg_lat,
  ];

  // ── the apron and the plinths of the REAL WORLD column (and the garage's edge to the east) ──────────────────────
  const apronOutline = roundRect(0, 0, 1040, 640, 14, 8);
  world.add(slab(apronOutline, { y: 0, top: HEX.ground, grain: 0.07, joint: 6 }));
  const byId = Object.fromEntries(L.stations.map((s: any) => [s.id, s]));
  const live = ['starting-grid'];
  const near = ['starting-grid', 'weather-radar', 'garage'];
  const rims = new THREE.Group(); rims.userData.overlay = true;
  for (const id of near) {
    const s = byId[id]; if (!s) continue;
    const p = plinth({ ...s.footprint, corner: s.footprint.corner_m }, { jointO: [s.footprint.x0, s.footprint.z0] });
    world.add(p.mesh);
    const on = live.includes(id);
    rims.add(ledLoop(p.top, p.h + 0.012, { color: on ? HEX.teal : HEX.rim, width: on ? 1.25 : 1, glow: on ? 7 : 0, glowA: 0.22, opacity: on ? 0.9 : 1 }));
    if (id === 'starting-grid') world.add(catcher(p.top, p.h + 0.004, 0.5));
  }

  // ── the start straight: the track on the plinth, dimmed to a quarter where it crosses the map ───────────────────
  const main: [number, number][] = L.track.main_world;
  const straight = main.filter(([x, z]) => z === -196 && x >= -478 && x <= -200);
  const mapX: [number, number] = [-414, -316];
  const west = straight.filter(([x]) => x <= mapX[0] + 1), east = straight.filter(([x]) => x >= mapX[1] - 1);
  for (const seg of [west, east]) if (seg.length > 1) world.add(laneMesh(seg, { w: 12, y: 0.126 }));
  const over = laneMesh([[mapX[0], -196], [mapX[1], -196]], { w: 12, y: MAP_TOP + 0.012, opacity: 0.18, lineA: 0.32, renderOrder: 3 });
  over.userData.overlay = true; over.userData.noAO = true; world.add(over);
  // the front row's line: where the pole sits (layout.grid.front_row_x)
  const startLine = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 11.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: lin('#8c939b') }));
  startLine.position.set(G.front_row_x + 1.4, 0.131, G.track_z); world.add(startLine);

  // ── the map: the ERCOT region (the intro's HIFLD polygon), a slab in the diagram language ────────────────────────
  const rings = ERCOT_RINGS.map((r) => {
    const pts = r.map(([lon, lat]) => toXZ(lon, lat));
    if (pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    return pts;
  });
  const b = new Builder();
  // the region's top: the plinth's graphite with the intro's ERCOT teal as a muted wash (map/us.ts: each region a wash
  // with a crisper outline in its own color)
  for (const r of rings) b.prism(r, 0.12, MAP_TOP, { top: '#212c30', side: '#2a3338', edge: '#33494a', verticals: false });
  const map = b.build({ dpr: ctx.dpr, lineWidth: 1, material: flatMaterial() });
  map.mesh.receiveShadow = false; map.mesh.castShadow = true;
  world.add(map.group);
  world.add(catcher(rings[0], MAP_TOP + 0.003, 0.55));
  for (const r of rings.slice(1)) world.add(catcher(r, MAP_TOP + 0.003, 0.55));
  // the feathered shade the diagram's pads cast toward the camera's far side
  const shade = shadeMesh(rings, { dx: 0.4, dz: 0.9, feather: 2.8, opacity: 0.2, y: 0.128 });
  world.add(shade);
  // a hairline in the region's own edge: the outline a pixel inside the top, faint, so the coast reads at any angle
  const coast = new THREE.Group(); coast.userData.overlay = true;
  for (const r of rings) coast.add(fineLine(r.map(([x, z]) => [x, MAP_TOP + 0.01, z]), { color: '#3f8f80', width: 1.1, closed: true, reveal: false, caps: false, opacity: 0.75 }));
  world.add(coast);

  // ── the fleet: one column a mapped battery ───────────────────────────────────────────────────────────────────
  const maxD = Math.max(...fleet.batteries.map((x: any) => x.planned_discharge_mwh));
  const heightOf = (d: number) => 0.3 + 9.7 * d / maxD;          // layout.grid.column.height_rule
  const colorOf = (d: number) => dischargeHex(Math.sqrt(d / maxD)); // layout.grid.column.color
  const solid: any[] = [], hollow: any[] = [], unplaced: any[] = [];
  for (const bat of fleet.batteries) {
    const m = bat.map;
    const h = heightOf(bat.planned_discharge_mwh), c = colorOf(bat.planned_discharge_mwh);
    if (!m || m.missing || m.lat == null || m.lon == null) { unplaced.push({ bat, h, c }); continue; }
    const [x, z] = toXZ(m.lon, m.lat);
    (m.exact ? solid : hollow).push({ x, y: MAP_TOP, z, r: COL_R, h, color: c, bat });
  }
  world.add(columns(solid));
  world.add(columns(hollow, { hollow: true }));

  // Desert Willow: its column, a teal halo ring on the map, a soft light at its foot
  const sc = data.showcase;
  const dswl = solid.find((s) => s.bat.resource === sc.resource) ?? hollow.find((s) => s.bat.resource === sc.resource);
  const halo = new THREE.Group(); halo.userData.overlay = true;
  if (dswl) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.85, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: lin(HEX.teal), transparent: true, opacity: 0.95, depthWrite: false }));
    ring.position.set(dswl.x, MAP_TOP + 0.02, dswl.z); ring.renderOrder = 5; halo.add(ring);
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.72, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: lin(HEX.teal), transparent: true, opacity: 0.45, depthWrite: false }));
    ring2.position.set(dswl.x, MAP_TOP + 0.02, dswl.z); ring2.renderOrder = 5; halo.add(ring2);
    halo.add(pool(dswl.x, MAP_TOP + 0.015, dswl.z, 6.5, HEX.teal, 0.22));
  }
  world.add(halo);

  // ── not on the map: four trays by load zone on the plinth's west margin, south of the start straight (they carry no
  // geography, and in this pose that margin is open), side by side and squared along one edge, so the block reads as a
  // small bar chart of the unplaced fleet (deepest first); the batteries lie in rows, largest planned discharge first
  const ZONES = [['LZ_HOUSTON', 'Houston'], ['LZ_SOUTH', 'South'], ['LZ_NORTH', 'North'], ['LZ_WEST', 'West']];
  const trays: any[] = [];
  const lying: any[] = [];
  const TRAY_X0 = -451, SLOT = 11.2, PITCH = 1.1, LIP = 0.34, BACK_Z = -171, GAP = 1.6;
  let xCursor = TRAY_X0;
  for (const [zone, name] of ZONES) {
    const items = unplaced.filter((u) => u.bat.zone === zone).sort((a, b) => b.bat.planned_discharge_mwh - a.bat.planned_discharge_mwh || a.bat.resource.localeCompare(b.bat.resource));
    if (!items.length) continue;
    const depth = items.length * PITCH + 1.0, width = SLOT + 1.2;
    const x0 = xCursor; xCursor += width + GAP;
    const cx = x0 + width / 2, cz = BACK_Z + depth / 2;
    trays.push({ zone, name, n: items.length, cx, cz, width, depth, x0 });
    items.forEach((it, row) => {
      lying.push({ x: x0 + 0.6, y: 0.12 + 0.1 + COL_R, z: BACK_Z + 0.5 + PITCH / 2 + row * PITCH, r: COL_R, h: it.h, color: it.c, lie: -Math.PI / 2 });
    });
  }
  const tb = new Builder();
  for (const t of trays) {
    const out = roundRect(t.cx, t.cz, t.width, t.depth, 0.6, 4), inn = offsetPoly(out, -0.16);
    tb.prism(out, 0.12, 0.12 + LIP, { top: '#2b3036', side: '#2b3036', edge: null });
    tb.prism(inn, 0.12, 0.2, { top: '#191c20', side: '#191c20', edge: null });
  }
  const trayMesh = tb.build({ dpr: ctx.dpr, material: flatMaterial() });
  trayMesh.mesh.castShadow = true;
  world.add(trayMesh.group);
  world.add(columns(lying));
  for (const t of trays) world.add(catcher(roundRect(t.cx, t.cz, t.width - 0.3, t.depth - 0.3, 0.5, 4), 0.205, 0.45));
  const trayRims = new THREE.Group(); trayRims.userData.overlay = true;
  for (const t of trays) trayRims.add(fineLine(roundRect(t.cx, t.cz, t.width, t.depth, 0.6, 4).map(([x, z]) => [x, 0.12 + LIP + 0.01, z]), { color: '#4b555f', width: 1, closed: true, reveal: false, caps: false }));
  world.add(trayRims);

  // the start straight's comets, running east toward A1 (the lap's direction), faint: the field has not left the map
  const lanes = new THREE.Group(); lanes.userData.overlay = true;
  const cometRun = comets([[-470, 0.2, -196], [-250, 0.2, -196], [-200, 0.2, -196]], { color: HEX.teal, core: 1.6, glow: 7, glowA: 0.25, period: 46, speed: 30, tail: 0.5, opacity: 0.55, reveal: false });
  lanes.add(cometRun);
  world.add(lanes);

  assignLayers(world);
  ensureBase(THREE, world);
  stage.scene.add(world);
  materials.farNormals(stage.gtao.normalMaterial);

  night(stage);
  const target: [number, number, number] = [-360, 1.5, -200];
  stage.setFade({ center: [0.62, 0.5], screen: [0.72, 1.35], world: [300, 520], worldCenter: [-360, -190], glow: [0.6, 0.3] });
  stage.setKey({ az: 225, el: 50, center: [-340, 2, -197], radius: 96, rimAz: 40 });
  stage.setAO({ radius: 1.6, scale: 1.1, thickness: 2.2, samples: 16 });
  stage.setShadowAuto(true);

  // the storyboard's pose brought in from 230 m to 196 m and its lens shift eased, so the region fills the frame's
  // right two thirds, the tray block stands whole beside it and the caption keeps its corner
  const CAM = { target: [-352, 1.5, -204] as [number, number, number], az: 160, el: 44, dist: 200, vfov: 34, shift: [0.1, 0.14] as [number, number] };
  const mapped = fleet.map_coverage.mapped, missing = fleet.map_coverage.missing;
  const exactN = solid.length, approxN = hollow.length;

  return {
    time: 3.0,
    note:
      `Real: every column stands at its battery's point in the fleet geo file every leaf cites (fleet_geo ${fleet.map_coverage.geo_file.route}, sha256 ` +
      `${fleet.map_coverage.geo_file.sha256.slice(0, 8)}..., release ${fleet.map_coverage.geo_file.release}), projected with layout.texas (1:10,300). ` +
      `${exactN} exact sites stand solid; ${approxN} points placed by county (${fleet.map_coverage.by_precision.county}), substation ` +
      `(${fleet.map_coverage.by_precision.substation}), sibling (${fleet.map_coverage.by_precision.sibling}) or co-located plant ` +
      `(${fleet.map_coverage.by_precision['co-located-plant']}) stand hollow; county points are county interior points. The ${missing} batteries with no ` +
      `coordinates on file lie in four trays by load zone (${trays.map((t) => `${t.name} ${t.n}`).join(', ')}); no coordinate is invented for them. ` +
      `Height is 0.3 + 9.7 x planned discharge / ${maxD} MWh (the fleet's largest) and color the site's discharge ramp at its square root, from ` +
      `fleet.batteries[].planned_discharge_mwh (the selected arm's sealed schedule). Desert Willow's size is the sealed ${sc.energy_mwh} MWh. ` +
      `The map is the intro's HIFLD ERCOT polygon (iso-regions.geojson, copied into ercot-ring.ts). Illustrative: the plinths, trays and the faint ` +
      `comets on the start straight (a drawing of the lap's direction, carrying no figure).`,
    update(t) {
      stage.setCamera(CAM);
      materials.detail.value.x = (2 * Math.tan((stage.camera.fov * Math.PI) / 360)) / (ctx.height * ctx.dpr);
      setLineResolution(world, ctx.width, ctx.height, ctx.dpr);
      cometRun.material.userData.pulse.t.value = cometRun.material.userData.pulse.phase + t * cometRun.material.userData.pulse.speed;
    },
    decorate() {
      const P = ctx.plates;
      const totals = fleet.totals;
      caption(ctx, { head: `Texas: ${fleet.count} real batteries`, flavor: 'the starting field', line: 'Each ERCOT battery with its own sealed plan for Nov 26.' });
      P.scope(`${fleet.map_coverage.attribution.replace(/ \(ODbL\), per each point's source$/, '')}. Calculation and display: Wattness.`);
      const key = keyCard(P.root, [
        { text: `${fleet.count} batteries · ${n0(totals.power_mw)} MW · ${n0(totals.energy_mwh)} MWh`, strong: true },
        { text: 'Height: planned discharge, MWh', ramp: `linear-gradient(90deg, ${DISCHARGE_RAMP.join(', ')})`, ends: ['2', n0(maxD)] },
        { text: 'Hollow: placed by county, substation or a sibling site', swatch: { background: 'transparent', boxShadow: `inset 0 0 0 2px ${dischargeHex(0.7)}`, borderRadius: '50%', width: '12px', height: '12px', marginRight: '10px' } },
        { text: `In the trays: not on the map, ${missing} with no coordinates on file, by load zone`, swatch: { background: `linear-gradient(90deg, ${dischargeHex(0.85)} 0 70%, transparent 70%)`, height: '6px', borderRadius: '3px', verticalAlign: '2px' } },
      ]);
      const keyRect = rectOf(key, P.root);
      const avoid = [keyRect];
      const placed = [];
      if (dswl) placed.push({ id: 'dswl', text: `${sc.name} (${sc.resource}) · ${sc.power_mw} MW · ${sc.energy_mwh} MWh · ${sc.county} County`, sub: `Planned discharge ${n0(dswl.bat.planned_discharge_mwh)} MWh on Nov 26`, at: [dswl.x, MAP_TOP + dswl.h, dswl.z] as [number, number, number], priority: 0 });
      // keep the plate off every column's top (the data), where a place exists; failing that, off the region
      const tops = [...solid, ...hollow].map((c) => P.project([c.x, MAP_TOP + c.h, c.z])).filter(Boolean).map((q) => ({ x: q.x - 5, y: q.y - 5, w: 10, h: 10 }));
      P.leaders(placed, { keepOut: avoid, avoid: tops, max: 4 });
      // each tray named at its front edge; the block's head above its deepest tray
      P.ticks('trays', trays.map((t) => ({ at: [t.cx, 0.46, BACK_Z + t.depth + 1.0] as [number, number, number], text: `${t.name} · ${t.n}`, align: 'below' })), 'hwalk-tick');
      P.ticks('trayhead', [{ at: [trays[0].x0, 0.46, BACK_Z - 1.0] as [number, number, number], text: `Not on the map: ${missing}, no coordinates on file`, align: 'above' }], 'hwalk-tick hwalk-tick-side');
      void mapped;
    },
  };
}
