// The venue's ground: the apron, the plinths at the diagram's own footprints, their rim LEDs, the track and its
// lanes, the two feeders, the return road (a design: the diagram draws no lane back to the grid), the painted
// arrowheads, the pole lights and the shadow catchers that put the moon's shadows on the flat grounds.
import * as THREE from 'three';
import { roundRect, offsetPoly } from '../../kit/region/geo';
import { comets as kitComets } from '../../kit/region/flows';
import { HEX, flat, glowMat, concreteTex, asphaltTex, radialTex, pool, strand } from './look';
import { cumulative, offset, pointAt, slice, resample, type Layout, type Station, type XZ } from './layout';

const comets = kitComets as unknown as (points: number[][], o: Record<string, unknown>) => THREE.Mesh;

export const PLINTH_H = 0.12;
export const TRACK_Y = 0.15;
/** Where the return road starts (track meters): the segments from here on are the design addition. */
export const RETURN_S = 3864;

export type RimState = 'live' | 'idle' | 'gold';
/** Each box's rim: teal where it runs today, BNB yellow on the two gold boxes, idle where nothing has run. */
export const RIM: Record<string, RimState> = {
  'starting-grid': 'live', 'weather-radar': 'live', 'garage': 'idle',
  'race-day-forecast': 'live', 'fuel-and-wear': 'live', 'spotter': 'live', 'setup': 'live', 'risk-desk': 'live', 'pit-wall': 'gold',
  'team-data': 'live', 'parc-ferme': 'gold', 'race-day': 'live', 'stewards': 'live', 'timing-screens': 'live',
  'arena': 'idle', 'season-purse': 'idle', 'license-to-launch': 'idle',
};
export const rimHex = (s: RimState) => (s === 'gold' ? HEX.bnb : s === 'live' ? HEX.teal : HEX.rim);
/** An idle box's outline: the muted ink, part-transparent. The palette's #2b3036 vanished against the plinth tops, and
 *  a box that has not run must still read as one of the diagram's boxes. */
const IDLE_LINE = { color: HEX.muted, opacity: 0.5 };
/** The opening in the apron and the Team data plinth through which the brain's pit shows (inset from its footprint). */
export const TEAM_OPENING_INSET = 2;

const outline = (s: Station, inset = 0) => {
  const f = s.footprint, w = f.x1 - f.x0 - 2 * inset, d = f.z1 - f.z0 - 2 * inset;
  return roundRect((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2, w, d, Math.max(0.5, f.corner_m - inset), 8) as XZ[];
};

/** A flat polygon's top at height y, with optional holes: uv in meters (x, z). */
function topGeometry(poly: readonly XZ[], y: number, holes: readonly (readonly XZ[])[] = []) {
  const pts = poly.map(([x, z]) => new THREE.Vector2(x, z));
  if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
  const hs = holes.map((h) => { const q = h.map(([x, z]) => new THREE.Vector2(x, z)); if (!THREE.ShapeUtils.isClockWise(q)) q.reverse(); return q; });
  const tris = THREE.ShapeUtils.triangulateShape(pts, hs);
  const all = [...pts, ...hs.flat()];
  const pos: number[] = [], uv: number[] = [];
  for (const [a, b, c] of tris) for (const i of [a, c, b]) { const p = all[i]!; pos.push(p.x, y, p.y); uv.push(p.x, p.y); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A band between two closed outlines (outer at y0, inner at y1): the plinth's chamfer, or a vertical wall when the
 *  two outlines coincide in plan. */
function bandGeometry(outer: readonly XZ[], y0: number, inner: readonly XZ[], y1: number) {
  const pos: number[] = [], uv: number[] = [];
  const n = outer.length; let s = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = outer[i]!, b = outer[j]!, c = inner[j]!, d = inner[i]!;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const quad = [[a[0], y0, a[1], s, 0], [b[0], y0, b[1], s + L, 0], [c[0], y1, c[1], s + L, 1], [d[0], y1, d[1], s, 1]];
    for (const k of [0, 1, 2, 0, 2, 3]) { const q = quad[k]!; pos.push(q[0]!, q[1]!, q[2]!); uv.push(q[3]!, q[4]!); }
    s += L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A ribbon along a polyline, width w, its top at y; uv: u across 0..1, v meters along. */
export function ribbonGeometry(P: readonly XZ[], w: number, y: number, closed = false) {
  const L = offset(P, w / 2, closed), R = offset(P, -w / 2, closed), cum = cumulative(P);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  P.forEach((_, i) => { pos.push(L[i]![0], y, L[i]![1], R[i]![0], y, R[i]![1]); uv.push(0, cum[i]!, 1, cum[i]!); });
  const n = P.length, segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) { const a = 2 * i, b = 2 * ((i + 1) % n); idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function catcher(geo: THREE.BufferGeometry, opacity: number, lift = 0.004) {
  const m = new THREE.Mesh(geo, new THREE.ShadowMaterial({ opacity, depthWrite: false, transparent: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  m.position.y = lift; m.receiveShadow = true; m.userData.noAO = true; m.renderOrder = 1;
  return m;
}

/** A painted arrowhead on the track, the diagram's marker: a filled triangle with a notched back, its tip at `tip`,
 *  pointing along d (unit, xz), len long and 2 half wide. */
function arrowGeometry(tip: XZ, d: XZ, len: number, half: number, y: number) {
  const nx = d[1], nz = -d[0], at = (k: number, s: number): XZ => [tip[0] - d[0] * len * k + nx * s, tip[1] - d[1] * len * k + nz * s];
  const q = [tip, at(1, half), at(0.78, 0), at(1, -half)];
  const pos: number[] = [];
  for (const k of [0, 1, 2, 0, 2, 3]) pos.push(q[k]![0], y, q[k]![1]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}

export interface GroundOptions {
  dpr: number;
  /** Screen-space rim and edge lines (far views) or world-sized LED strips (near views). */
  near: boolean;
  shadow: number;
}

export function buildGround(L: Layout, o: GroundOptions) {
  const g = new THREE.Group(); g.name = 'ground';
  const lines = new THREE.Group(); lines.name = 'lines'; lines.userData.overlay = true; g.add(lines);
  const concrete = concreteTex(12), plinthTex = concreteTex(6, 77), asphalt = asphaltTex(), soft = radialTex(1.7);

  // the apron: one sealed-concrete slab under the venue, a hair lighter than the ground round it, its edge chamfered;
  // open over Team data, whose brain lies in a pit under a glass floor (heroes.ts)
  const team = L.stations.find((s) => s.id === 'team-data');
  const opening = team ? outline(team, TEAM_OPENING_INSET) : null;
  const holes = opening ? [opening] : [];
  const apronOut = roundRect(0, 0, 1040, 640, 16, 10) as XZ[], apronIn = offsetPoly(apronOut, -0.3) as XZ[];
  const apronTop = new THREE.Mesh(topGeometry(apronIn, 0, holes), flat(HEX.apron, { map: concrete, mean: 0.91 }));
  const apronEdge = new THREE.Mesh(bandGeometry(apronOut, -0.16, apronIn, 0), flat('#101315'));
  g.add(apronTop, apronEdge);
  g.add(catcher(topGeometry(apronIn, 0, holes), o.shadow, 0.003));
  lines.add(strand([...apronOut, apronOut[0]!].map(([x, z]) => [x, 0.01, z]), { color: HEX.rim, width: 1, opacity: 0.9, order: 3 }));

  // the plinths: a slab 0.12 m proud with a 0.35 m chamfered rim and a hairline LED in it
  const plinths = new THREE.Group(); plinths.name = 'plinths'; g.add(plinths);
  const topMat = flat(HEX.plinth, { map: plinthTex, mean: 0.91 }), sideMat = flat('#181c20'), chamferMat = flat('#262c32');
  const rimLines: { id: string; obj: THREE.Object3D }[] = [];
  for (const s of L.stations) {
    if (s.id === 'garage') continue; // the hangar's floor is the apron; its edge is the glass roof's dashed hairline
    const outer = outline(s), mid = outline(s, 0.35);
    // Team data's top is a frame round the opening: the glass floor over the pit fills the rest (heroes.ts)
    const topHoles = s.id === 'team-data' && opening ? [opening] : [];
    plinths.add(new THREE.Mesh(bandGeometry(outer, 0, outer, PLINTH_H - 0.04), sideMat));
    plinths.add(new THREE.Mesh(bandGeometry(outer, PLINTH_H - 0.04, mid, PLINTH_H), chamferMat));
    plinths.add(new THREE.Mesh(topGeometry(mid, PLINTH_H, topHoles), topMat));
    plinths.add(catcher(topGeometry(mid, PLINTH_H, topHoles), o.shadow, 0.003));
    if (topHoles.length) plinths.add(new THREE.Mesh(bandGeometry(opening!, PLINTH_H, opening!, -0.4), flat('#181c20', { side: THREE.DoubleSide })));
    const state = RIM[s.id] ?? 'idle', hex = rimHex(state), ring = outline(s, 0.17).map(([x, z]) => [x, PLINTH_H - 0.012, z]);
    if (o.near) {
      const led = new THREE.Mesh(ribbonGeometry(outline(s, 0.17), 0.07, PLINTH_H - 0.01, true), state === 'idle' ? glowMat('#5d656d', 1) : glowMat(hex, 2.2));
      led.material.polygonOffset = true; led.material.polygonOffsetFactor = -2; led.material.polygonOffsetUnits = -4;
      plinths.add(led);
      if (state !== 'idle') plinths.add(new THREE.Mesh(ribbonGeometry(outline(s, 0.17), 0.9, PLINTH_H + 0.002, true), glowMat(hex, 0.32, { additive: true, opacity: 0.55, map: null })));
    } else {
      const obj = state === 'idle'
        ? strand([...ring, ring[0]!], { color: IDLE_LINE.color, width: 1.1, opacity: IDLE_LINE.opacity, order: 5 })
        : strand([...ring, ring[0]!], { color: hex, width: 1.25, glow: 5, glowA: 0.22, opacity: 1, order: 5 });
      lines.add(obj); rimLines.push({ id: s.id, obj });
    }
  }

  // the track: one 12 m lane through every station in the order of the arrows, its surface a step proud of what it
  // crosses; the return road (from RETURN_S on, a design) drawn dimmer with dashed edges
  const T = L.track.main_world, cumT = cumulative(T), total = cumT[cumT.length - 1]!;
  const main = slice(T, cumT, 0, RETURN_S), back = [...slice(T, cumT, RETURN_S, total), T[0]!];
  const roadMat = flat(HEX.asphalt, { map: asphalt, mean: 0.9 }), returnMat = flat(HEX.returnRoad, { map: asphalt, mean: 0.9 });
  const curb = flat('#0c0e10');
  const roadGeo = ribbonGeometry(main, L.track.width_m, TRACK_Y), backGeo = ribbonGeometry(back, L.track.width_m, TRACK_Y);
  g.add(new THREE.Mesh(roadGeo, roadMat), new THREE.Mesh(backGeo, returnMat));
  g.add(catcher(roadGeo, o.shadow, 0.003), catcher(backGeo, o.shadow * 0.8, 0.003));
  // the road's two sides, down to the apron (a curb face in the dark)
  for (const side of [1, -1]) for (const P of [main, back]) {
    const edge = offset(P, (side * L.track.width_m) / 2);
    const pos: number[] = [];
    for (let i = 1; i < edge.length; i++) { const a = edge[i - 1]!, b = edge[i]!; pos.push(a[0], 0, a[1], b[0], 0, b[1], b[0], TRACK_Y, b[1], a[0], 0, a[1], b[0], TRACK_Y, b[1], a[0], TRACK_Y, a[1]); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
    const mat = curb.clone(); mat.side = THREE.DoubleSide; g.add(new THREE.Mesh(geo, mat));
  }
  // edges: the LED strips along both sides of the main track, the 1 px track-limit lines just inside them
  const edgeL = offset(main, 5.75), edgeR = offset(main, -5.75), limL = offset(main, 5.25), limR = offset(main, -5.25);
  if (o.near) {
    for (const e of [main]) for (const side of [1, -1]) {
      const strip = new THREE.Mesh(ribbonGeometry(offset(e, side * 5.8), 0.07, TRACK_Y + 0.006), glowMat(HEX.teal, 2.0));
      const wash = new THREE.Mesh(ribbonGeometry(offset(e, side * 5.55), 0.5, TRACK_Y + 0.004), glowMat(HEX.teal, 0.1, { additive: true, opacity: 0.5 }));
      const limit = new THREE.Mesh(ribbonGeometry(offset(e, side * 5.1), 0.1, TRACK_Y + 0.005), flat('#8e979f'));
      for (const m of [strip, wash, limit]) { (m.material as THREE.Material).polygonOffset = true; (m.material as THREE.Material).polygonOffsetFactor = -2; (m.material as THREE.Material).polygonOffsetUnits = -4; }
      g.add(strip, wash, limit);
    }
  } else {
    for (const e of [edgeL, edgeR]) lines.add(strand(e.map(([x, z]) => [x, TRACK_Y + 0.01, z]), { color: HEX.teal, width: 1, glow: 3, glowA: 0.12, opacity: 0.42, order: 4 }));
    for (const e of [limL, limR]) lines.add(strand(e.map(([x, z]) => [x, TRACK_Y + 0.01, z]), { color: '#c9ced3', width: 0.8, opacity: 0.18, order: 4 }));
  }
  for (const side of [1, -1]) {
    const e = offset(back, side * 5.6);
    lines.add(strand(e.map(([x, z]) => [x, TRACK_Y + 0.01, z]), { color: HEX.muted, width: 1, opacity: 0.38, dash: 7, gap: 7, order: 4 }));
  }

  // the lanes: each of the diagram's arrows, comets running in its direction along the track's center (the feeders
  // on their own 6 m lanes), and a painted arrowhead where the diagram draws one
  const lanes = new THREE.Group(); lanes.name = 'lanes'; lanes.userData.overlay = true; g.add(lanes);
  const laneComets: { id: string; obj: THREE.Mesh }[] = [];
  const headMatFor = (k: number) => {
    const m = glowMat(HEX.teal, k);
    m.polygonOffset = true; m.polygonOffsetFactor = -3; m.polygonOffsetUnits = -6;
    return m;
  };
  const arrowHead = headMatFor(o.near ? 1.3 : 1.7);
  for (const lane of L.lanes) {
    const feeder = lane.carries === 'feeder';
    const path = feeder ? L.feeders[lane.id]!.world : lane.world_points;
    const y = (feeder ? 0.1 : TRACK_Y) + 0.03;
    const pts = resample(path, 2).map(([x, z]) => [x, y, z]);
    const obj = comets(pts, { color: HEX.teal, core: feeder ? 1.8 : 2.8, glow: feeder ? 7 : 11, glowA: 0.4, period: feeder ? 34 : 46, speed: 38,
      phase: lane.id.charCodeAt(1) * 7, tail: 0.5, renderOrder: 6, reveal: false }) as THREE.Mesh;
    lanes.add(obj); laneComets.push({ id: lane.id, obj });
    // the diagram's arrow: in the wide views a steady line down the lane's middle under the comets, ending at its head
    const cum = cumulative(path), end = cum[cum.length - 1]!;
    const len = feeder ? 9 : 14, half = feeder ? 4.6 : 7.4, tipAt = pointAt(path, cum, Math.max(0, end - 1));
    if (!o.near) {
      const shaft = slice(path, cum, 0, Math.max(0, end - 1 - len * 0.8)).map(([x, z]) => [x, y + 0.01, z]);
      if (shaft.length > 1) lanes.add(strand(shaft, { color: HEX.teal, width: feeder ? 1.5 : 2.1, glow: feeder ? 6 : 9, glowA: 0.28, opacity: 0.9, order: 6 }));
    }
    const head = new THREE.Mesh(arrowGeometry(tipAt.p, tipAt.d, len, half, y - 0.012), arrowHead);
    // above the roof's glass in the draw order, as the lines are (venue.ts), so A1's and A3's heads stay sharp under it
    head.renderOrder = 14; head.userData.noAO = true; lanes.add(head);
  }
  // the rest of the main track carries fainter comets (the lap between the arrows)
  const lapComets = comets(resample(main, 3).map(([x, z]) => [x, TRACK_Y + 0.02, z]), { color: HEX.teal, core: 1.3, glow: 5, glowA: 0.2, period: 64, speed: 38, phase: 11, tail: 0.42,
    opacity: 0.45, renderOrder: 5, reveal: false }) as THREE.Mesh;
  lanes.add(lapComets);
  // the closing's pulse: one bright front once round the lap in arrow order (its head where the frame's clock puts it)
  const lapLen = cumulative(main).at(-1)!;
  const wave = comets(resample(main, 3).map(([x, z]) => [x, TRACK_Y + 0.04, z]), { color: HEX.teal, core: 4.4, glow: 24, glowA: 0.6, period: lapLen + 400, speed: 300, phase: 0, tail: 0.06,
    opacity: 1, renderOrder: 7, reveal: false, fade: [0, 0] }) as THREE.Mesh;
  wave.visible = false; lanes.add(wave);

  // the feeders' own surfaces (6 m), the A2 feeder crossing the Team data floor on a glass bridge
  for (const f of Object.values(L.feeders)) {
    const geo = ribbonGeometry(f.world, f.width_m, 0.1);
    g.add(new THREE.Mesh(geo, flat('#121619', { map: asphalt, mean: 0.9 })));
    for (const side of [1, -1]) lines.add(strand(offset(f.world, side * 2.85).map(([x, z]) => [x, 0.12, z]), { color: HEX.teal, width: 0.9, opacity: 0.3, order: 4 }));
  }

  // pole lights every 60 m along the main track's outside edge (none under the hangar's roof), cool, with their
  // pools on the ground; the warm light in the venue is the Arcade's alone
  const poles = new THREE.Group(); poles.name = 'poles'; g.add(poles);
  const headMat = glowMat(HEX.pole, 2.4), poleMat = new THREE.MeshStandardMaterial({ color: '#59616a', roughness: 0.45, metalness: 0.8 });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.14, 9, 8).translate(0, 4.5, 0), armGeo = new THREE.BoxGeometry(2.2, 0.12, 0.12), headGeo = new THREE.BoxGeometry(0.8, 0.16, 0.42);
  const poleAt: { x: number; z: number; d: XZ }[] = [];
  const cumM = cumulative(main), lenM = cumM[cumM.length - 1]!;
  const inGarage = (x: number, z: number) => x > -215 && x < 225 && z > -260 && z < 48;
  for (let s = 30; s < lenM; s += 60) {
    const { p, d } = pointAt(main, cumM, s), side = 9.5, x = p[0] + d[1] * side, z = p[1] - d[0] * side;
    if (inGarage(x, z)) continue;
    poleAt.push({ x, z, d });
    const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(x, 0, z); pole.castShadow = true; poles.add(pole);
    const yaw = Math.atan2(-d[1], d[0]);
    const arm = new THREE.Mesh(armGeo, poleMat); arm.position.set(x - d[1] * 1.0, 8.95, z + d[0] * 1.0); arm.rotation.y = yaw + Math.PI / 2; poles.add(arm);
    const head = new THREE.Mesh(headGeo, headMat); head.position.set(x - d[1] * 1.9, 8.82, z + d[0] * 1.9); head.rotation.y = yaw; poles.add(head);
    g.add(pool(HEX.pole, 13, 0.09, soft, [x - d[1] * 3.5, TRACK_Y + 0.02, z + d[0] * 3.5]));
  }

  return { group: g, lines, lanes, rimLines, laneComets, wave, poles: poleAt, track: { main, back, cumMain: cumM, all: T, cumAll: cumT } };
}
