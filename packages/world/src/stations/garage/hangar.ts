// @ts-nocheck
// The hangar: the apron and the garage's floor (with the Team data pit cut out of it), the bays' plinths with their
// hairline LEDs, the 12 m track through the garage (top leg, east hairpin, back straight, west hairpin, bottom leg)
// with its LED edges and comets, the glass curtain walls on steel mullions, the liquid-glass roof at 18 m on steel
// ribs with its linear luminaires and its dashed edge, and the high-bay lights. Untyped like the kit: three's scene
// graph is driven the kit's way. Positions are the storyboard's layout (layout.json): meters, x east, y up, z south.
import * as THREE from 'three';
import { createBuilder } from '../../kit/geo';
import { exactColor } from '../../kit/tone';
import { roundRect } from '../../kit/region/geo';
import { glassPlane } from '../../kit/region/glass';
import { line, comets } from '../../kit/region/flows';
import { padTex, gravelTex, roughnessTex } from '../../kit/textures';

export const ROOF_Y = 18;
export const PLINTH = { y: 0.12, rim: 0.35 };
export const TRACK = { w: 12, top: 0.14 };
export const COLORS = {
  night: ['#101315', '#14171a', '#1f2429', '#2b3036'], ink: '#e6e8ea', muted: '#969ca3', teal: '#2ec7a6', gold: '#F0B90B',
  orange: '#eb6834', light: '#ffe3ad', refused: '#e5534b', charge: '#7f9cc0', armA: '#2c60de', armB: '#d95926', armC: '#9085e9',
  violet: '#b481f0',
};

export const stationById = (layout, id) => layout.stations.find((s) => s.id === id);

/** A footprint's outline as [x, z] points, inset by `inset` (rounded corners kept). */
export function outline(fp, inset = 0, seg = 8) {
  const w = fp.x1 - fp.x0 - 2 * inset, d = fp.z1 - fp.z0 - 2 * inset;
  return roundRect((fp.x0 + fp.x1) / 2, (fp.z0 + fp.z1) / 2, w, d, Math.max(0.6, fp.corner_m - inset), seg);
}

const shapeOf = (pts) => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
/** A flat (x, z) shape at height y, facing up; uv in meters. */
function flat(pts, y, holes = []) {
  const s = shapeOf(pts);
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  return new THREE.ShapeGeometry(s, 6).rotateX(-Math.PI / 2).translate(0, y, 0);
}

/** A band between two closed outlines of equal length: a at height ya, b at yb (a chamfer, a wall). */
function band(a, ya, b, yb) {
  const pos = [], uv = [];
  const n = a.length;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, l = Math.hypot(a[j][0] - a[i][0], a[j][1] - a[i][1]);
    const A0 = [a[i][0], ya, a[i][1]], A1 = [a[j][0], ya, a[j][1]], B0 = [b[i][0], yb, b[i][1]], B1 = [b[j][0], yb, b[j][1]];
    pos.push(...A0, ...A1, ...B1, ...A0, ...B1, ...B0);
    uv.push(s, ya, s + l, ya, s + l, yb, s, ya, s + l, yb, s, yb);
    s += l;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** The floors' sealed concrete: graphite, saw-cut joints every `joint` m, a fine aggregate in its roughness. */
export function concrete(hex, { joint = 6, rough = 0.62, seed = 21 } = {}) {
  const map = padTex(THREE, { joint, seed });
  const r = roughnessTex(THREE, { lo: 0.7, hi: 1.0, metres: 2.2, seed: seed + 3 });
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), map, roughnessMap: r, roughness: rough, metalness: 0.0 });
}

/**
 * The shell. Returns the group and the parts the frames pose (lights, comets, the roof's glass).
 * o: { layout, theme, grab, res, mark, materials (kit registry), dpr }
 */
export function buildHangar(o) {
  const { layout, theme, grab, res, materials: M } = o;
  const group = new THREE.Group(); group.name = 'hangar';
  const garage = stationById(layout, 'garage').footprint;
  const team = stationById(layout, 'team-data').footprint;
  const bays = ['race-day-forecast', 'fuel-and-wear', 'spotter', 'setup', 'risk-desk', 'pit-wall'].map((id) => stationById(layout, id));

  // ── floors: the apron outside, the garage's floor inside, the pit's opening cut out of it ──────────────────────
  const pit = outline(team, 0);
  const apronMat = concrete('#454b52', { joint: 12, rough: 0.78, seed: 41 });
  const floorMat = concrete('#6b737b', { joint: 6, rough: 0.5, seed: 21 });
  const garageOut = outline(garage, 0);
  const apron = new THREE.Mesh(flat([[-900, -700], [900, -700], [900, 700], [-900, 700]], -0.004, [garageOut]), apronMat);
  apron.receiveShadow = true; apron.name = 'apron';
  const floor = new THREE.Mesh(flat(garageOut, 0, [pit]), floorMat);
  floor.receiveShadow = true; floor.name = 'garageFloor';
  group.add(apron, floor);

  // ── plinths: a slab 0.12 m proud, a 0.35 m chamfer, a hairline LED along the chamfer's top ─────────────────────
  const plinthMat = concrete('#808992', { joint: 4, rough: 0.5, seed: 27 });
  const leds = new THREE.Group(); leds.name = 'leds';
  const ledFor = (s) => (s.gold ? COLORS.gold : COLORS.teal);
  for (const s of bays) {
    const fp = s.footprint, outer = outline(fp, 0), inner = outline(fp, PLINTH.rim);
    const top = new THREE.Mesh(flat(inner, PLINTH.y), plinthMat); top.receiveShadow = true; top.castShadow = false;
    const ch = new THREE.Mesh(band(outer, 0.002, inner, PLINTH.y), plinthMat); ch.receiveShadow = true;
    group.add(top, ch);
    leds.add(line(inner.map(([x, z]) => [x, PLINTH.y + 0.006, z]), { color: ledFor(s), width: s.gold ? 1.6 : 1.1, glow: s.gold ? 7 : 0, glowA: 0.3, opacity: s.gold ? 1 : 0.5, closed: true, renderOrder: 4 }));
  }
  // the pit's rim: the plinth's chamfer round the opening, its LED idle (the 26 Nov plan read no memory)
  {
    const outer = outline(team, -PLINTH.rim), inner = outline(team, 0);
    const ch = new THREE.Mesh(band(outer, 0.002, inner, PLINTH.y), plinthMat); ch.receiveShadow = true; group.add(ch);
    leds.add(line(inner.map(([x, z]) => [x, PLINTH.y + 0.006, z]), { color: '#3a4149', width: 1.3, glow: 0, closed: true, renderOrder: 4 }));
  }
  group.add(leds);

  // ── the track: the main line's points inside the garage, as a 12 m ribbon 0.14 m thick ────────────────────────
  const main = layout.track.main_world;
  let i0 = main.findIndex((p) => p[0] >= -262), i1 = i0;
  while (i1 + 1 < main.length && main[i1 + 1][0] <= 262 && main[i1 + 1][1] >= -260 && main[i1 + 1][1] <= 50) i1++;
  const center = main.slice(i0, i1 + 1);
  const trackMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#25292e'), map: gravelTex(THREE, { metres: 1.6, seed: 33 }), roughness: 0.82, metalness: 0 });
  const sideMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c1f23'), roughness: 0.7 });
  const { left, right, mid } = offsets(center, TRACK.w / 2);
  const surf = ribbonMesh(left, right, TRACK.top, trackMat); surf.receiveShadow = true; surf.name = 'track';
  group.add(surf);
  const skirtL = new THREE.Mesh(wallStrip(left, 0, TRACK.top), sideMat), skirtR = new THREE.Mesh(wallStrip(right, 0, TRACK.top), sideMat);
  group.add(skirtL, skirtR);
  // LED edge strips (teal), the track-limit lines (ink, faint) and the comets running the lap's direction
  const lanes = new THREE.Group(); lanes.name = 'lanes';
  const at = (pts, y) => pts.map(([x, z]) => [x, y, z]);
  lanes.add(line(at(left, TRACK.top + 0.01), { color: COLORS.teal, width: 1.2, glow: 5, glowA: 0.22, renderOrder: 4 }));
  lanes.add(line(at(right, TRACK.top + 0.01), { color: COLORS.teal, width: 1.2, glow: 5, glowA: 0.22, renderOrder: 4 }));
  const pulse = comets(at(mid, TRACK.top + 0.02), { color: COLORS.teal, core: 2.0, glow: 10, glowA: 0.26, period: 72, speed: 38, tail: 0.34, renderOrder: 5 });
  lanes.add(pulse);
  group.add(lanes);

  // ── walls: glass on steel mullions round the garage's outline, a door where the track comes in and goes out ────
  const wall = buildWalls(garage, center, M);
  group.add(wall.group);

  // ── roof: the region glass over the whole garage, steel ribs under it, luminaires under the ribs ──────────────
  const roof = buildRoof(o, garage);
  group.add(roof.group);

  return { group, garage, team, bays, center, pulse, roof, leds, lanes };
}

/** A polyline's left and right offsets (x, z), and its own points. */
export function offsets(pts, half) {
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    // left of the direction of travel, x east and z south: (tz, -tx)
    left.push([pts[i][0] + tz * half, pts[i][1] - tx * half]);
    right.push([pts[i][0] - tz * half, pts[i][1] + tx * half]);
  }
  return { left, right, mid: pts };
}

function ribbonMesh(L, R, y, mat) {
  const pos = [], uv = [];
  let s = 0;
  for (let i = 0; i + 1 < L.length; i++) {
    const l = Math.hypot(L[i + 1][0] - L[i][0], L[i + 1][1] - L[i][1]);
    const a = [L[i][0], y, L[i][1]], b = [R[i][0], y, R[i][1]], c = [R[i + 1][0], y, R[i + 1][1]], d = [L[i + 1][0], y, L[i + 1][1]];
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    uv.push(L[i][0], L[i][1], R[i][0], R[i][1], R[i + 1][0], R[i + 1][1], L[i][0], L[i][1], R[i + 1][0], R[i + 1][1], L[i + 1][0], L[i + 1][1]);
    s += l;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  // the winding may face down; the normal must face up
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  mat.side = THREE.DoubleSide;
  return new THREE.Mesh(g, mat);
}

function wallStrip(P, y0, y1) {
  const pos = [];
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1];
    pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y0, a[1], b[0], y1, b[1], a[0], y1, a[1]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}

/** Points every `step` m along a closed outline (with their tangents). */
function along(poly, step) {
  const out = [];
  const n = poly.length;
  let carry = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let s = carry;
    while (s < l) { const t = s / l; out.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l }); s += step; }
    carry = s - l;
  }
  return out;
}

function buildWalls(fp, track, M) {
  const B = createBuilder(THREE);
  const H = ROOF_Y - 0.6;
  const poly = outline(fp, 0, 10);
  // doors: where the track crosses the outline (the west door for A1, the east one for A3)
  const doors = [];
  for (let i = 0; i + 1 < track.length; i++) {
    const a = track[i], b = track[i + 1];
    if ((a[0] - fp.x0) * (b[0] - fp.x0) <= 0) doors.push({ x: fp.x0, z: (a[1] + b[1]) / 2 });
    if ((a[0] - fp.x1) * (b[0] - fp.x1) <= 0) doors.push({ x: fp.x1, z: (a[1] + b[1]) / 2 });
  }
  const inDoor = (p) => doors.some((d) => Math.abs(p.x - d.x) < 1.5 && Math.abs(p.z - d.z) < 9.5);
  const posts = along(poly, 7.5);
  for (const p of posts) {
    const ry = Math.atan2(-p.tz, p.tx);
    const door = inDoor(p);
    if (door) { B.push(B.M(p.x, 0, p.z, 0, ry, 0)); B.box('frame|steel', 0.34, 1.4, 0.7, 0, H - 0.7); B.pop(); continue; }
    B.push(B.M(p.x, 0, p.z, 0, ry, 0));
    B.box('frame|steel', 0.34, H, 0.7, 0, H / 2, 0);
    B.pop();
  }
  // transoms: the sill, two rails and the head, run as beams between successive posts
  for (let i = 0; i < posts.length; i++) {
    const a = posts[i], b = posts[(i + 1) % posts.length];
    if (Math.hypot(b.x - a.x, b.z - a.z) > 12) continue;
    for (const y of [0.35, 6.2, 12.2, H]) {
      if (y < 11 && (inDoor(a) || inDoor(b))) continue;
      B.beam(y === H ? 'frame|steel' : 'frame|galv', [a.x, y, a.z], [b.x, y, b.z], y === H ? 0.6 : 0.2, y === H ? 0.9 : 0.24);
    }
  }
  for (const d of doors) {
    // the door's header and its two jambs
    B.box('frame|steel', 0.6, 0.9, 19.5, d.x, 11.2, d.z);
    for (const s of [-1, 1]) B.box('frame|steel', 0.6, 11.6, 0.6, d.x, 5.8, d.z + s * 9.8);
  }
  const built = B.build(M.m, { shadows: true });
  built.group.name = 'walls';
  // the glass: one faint, reflective sheet round the outline, open at the doors
  const gpos = [];
  for (let i = 0; i < posts.length; i++) {
    const a = posts[i], b = posts[(i + 1) % posts.length];
    if (Math.hypot(b.x - a.x, b.z - a.z) > 12) continue;
    const y0 = inDoor(a) || inDoor(b) ? 11.6 : 0.45;
    gpos.push(a.x, y0, a.z, b.x, y0, b.z, b.x, H, b.z, a.x, y0, a.z, b.x, H, b.z, a.x, H, a.z);
  }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3)); gg.computeVertexNormals();
  const gm = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0d1114'), roughness: 0.06, metalness: 0.85, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
  gm.userData.noAO = true;
  const glass = new THREE.Mesh(gg, gm); glass.userData.noAO = true; glass.renderOrder = 1; glass.name = 'wallGlass';
  built.group.add(glass);
  return { group: built.group, doors };
}

function buildRoof(o, fp) {
  const { theme, grab, res, mark, materials: M } = o;
  const group = new THREE.Group(); group.name = 'roof';
  const W = fp.x1 - fp.x0, D = fp.z1 - fp.z0, cx = (fp.x0 + fp.x1) / 2, cz = (fp.z0 + fp.z1) / 2;
  const pane = glassPlane({ w: W, d: D, y: ROOF_Y, x: cx, z: cz, radius: fp.corner_m, theme, blur: grab.a.texture, mark, res });
  // seen from under it: no mark (it would read mirrored), and the clamp lifted a little so the lit hall shows through
  pane.material.uniforms.uMarkA.value = 0;
  pane.material.uniforms.uShadowA.value = 0;
  pane.material.side = THREE.DoubleSide; // the kit's pane is seen from above; this one is the ceiling too
  // a night sky through it: the fill near the sky's own top, the sheen and hairline quiet
  pane.material.uniforms.uFill.value.copy(exactColor(THREE, '#0b0d0f')); pane.material.uniforms.uFillA.value = 0.94;
  pane.material.uniforms.uSheen.value = 0.012; pane.material.uniforms.uLight.value = 0.35; pane.material.uniforms.uHairA.value = 0.3;
  group.add(pane);
  // steel: slim ribs north-south every 28.7 m (15 bays) on a ring beam over the walls
  const B = createBuilder(THREE);
  const nx = 15;
  for (let i = 1; i < nx; i++) {
    const x = fp.x0 + (W * i) / nx;
    B.box('rib|galv', 0.26, 0.72, D - 1.6, x, ROOF_Y - 0.36, cz);
    B.box('rib|galv', 0.6, 0.06, D - 1.6, x, ROOF_Y - 0.72, cz);
  }
  const ring = outline(fp, 0.4, 8);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    B.beam('rib|steel', [a[0], ROOF_Y - 0.5, a[1]], [b[0], ROOF_Y - 0.5, b[1]], 0.6, 0.9);
  }
  const steel = B.build(M.m, { shadows: false });
  group.add(steel.group);
  // luminaires: a slim lit line under each rib, in 13 m pieces
  const lumMat = new THREE.MeshBasicMaterial({ color: exactColor(THREE, '#c9d3df') });
  lumMat.userData.noAO = true;
  const lumGeo = new THREE.BoxGeometry(0.16, 0.05, 13);
  const pieces = Math.floor((D - 20) / 17);
  const lum = new THREE.InstancedMesh(lumGeo, lumMat, nx * pieces);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let i = 1; i < nx; i++) {
    const x = fp.x0 + (W * i) / nx;
    for (let j = 0; j < pieces; j++) { m4.makeTranslation(x, ROOF_Y - 0.78, fp.z0 + 10 + (j + 0.5) * ((D - 20) / pieces)); lum.setMatrixAt(k++, m4); }
  }
  lum.count = k; lum.userData.noAO = true; lum.frustumCulled = false; lum.name = 'luminaires';
  group.add(lum);
  // the diagram's dashed enclosure: the roof's hairline edge, dashed
  const edge = line(outline(fp, 1.2, 8).map(([x, z]) => [x, ROOF_Y - 0.05, z]), { color: '#a9b3bd', width: 1.2, opacity: 0.7, dash: 6, gap: 4, closed: true, renderOrder: 12 });
  group.add(edge);
  return { group, pane, steel, lum };
}

/** A high-bay light: a spot under the roof aimed straight down at (x, z); cool white, no shadow. */
export function highBay(x, z, { y = ROOF_Y - 1.2, intensity = 900, angle = 0.62, penumbra = 0.85, color = '#e3ebf5', distance = 90, decay = 1.3, tx = x, tz = z } = {}) {
  const s = new THREE.SpotLight(color, intensity, distance, angle, penumbra, decay);
  s.position.set(x, y, z); s.target.position.set(tx, 0, tz);
  s.layers.enableAll();
  return s;
}
