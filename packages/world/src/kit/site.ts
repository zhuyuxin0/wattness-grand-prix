// @ts-nocheck
// Ported from landing-3d/live/kit/site.js (27 Oct 2026). Plain JS under a type pass: three.js has no types here.
// buildSite: the featured battery's site, illustrative, sized to its real MW and MWh and laid out after the
// 18 Oct 2025 satellite image of the real site (rows, skid positions, substation at the south end, the line
// leaving south). Metres; +x east, +y up, +z south; the pad's footprint centred on the origin.
import { createMaterials, contactMaterial } from './materials';
import { enclosureInstanceGeometries, buildEnclosure, ghostEnclosure, ENC, FAN_MOUNTS, FAN_RATE, fanRotorGeometry } from './enclosure';
import { pcsGeometries, PCS, PCS_FAN_MOUNTS, PCS_FAN_D } from './pcs';
import { buildSubstation, conductorPaths, SUB } from './substation';
import { buildFence } from './fence';
import { buildTruck, buildFigure } from './props';
import { cometMaterial, cometGeometry, setCometResolution, ribbonGeometry } from './flow';
import { buildPriceBars } from './pricebars';
import { contactTex, radialTex } from './textures';
import { ensureBase } from './geo';
import { exactColor } from './tone';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/** Measured from the imagery (0.5 m pixels): pair centres in rows, skid columns, the central aisle. */
export const LAYOUT = {
  rowsZ: [-76.4, -67.9, -59.4, -50.9, -42.4, -33.9],
  pairsX: [-21.2, -12.4, 10.2, 19.4],
  skidsX: [-26.9, -6.6, 4.4, 25.0],
  aisleX: -1.1,
  pairGap: 0.18,
  pad: [[-45, -94], [45, -94], [45, 60], [38.4, 94], [-6.6, 94], [-6.6, 14.6], [-45, -12]],
  gateX: [-6.0, -1.2],
};

/** The far fade: everything that leaves the site (the 138 kV line, its pulses, the access road) thins out with
 *  distance from the pad's centre, in the site frame (metres): whole inside r.x, gone beyond r.y. Shared by every
 *  patched material, so one setFarFade() moves it. */
const FAR_GLSL = 'float farFade(vec2 p) { return 1.0 - smoothstep(uFarR.x, uFarR.y, length(p)); }';
function farFadeMaterial(base, U) {
  const m = base.clone();
  m.transparent = true; m.userData.noAO = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFarR = U;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFarXZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vFarXZ = transformed.xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vFarXZ;\nuniform vec2 uFarR;\n${FAR_GLSL}`)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a *= farFade(vFarXZ);');
  };
  m.customProgramCacheKey = () => 'far-fade';
  return m;
}
/** The same fade on a fat-line material (in place). */
function farFadeLine(mat, U) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFarR = U;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFarXZ;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n  vFarXZ = ( position.y < 0.5 ? instanceStart : instanceEnd ).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vFarXZ;\nuniform vec2 uFarR;\n${FAR_GLSL}`)
      .replace('gl_FragColor = vec4( diffuseColor.rgb, alpha );', 'gl_FragColor = vec4( diffuseColor.rgb, alpha * farFade(vFarXZ) );');
  };
  mat.customProgramCacheKey = () => 'far-fade-line';
  return mat;
}
export const FAR_FADE = [165, 315];

function ss(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

function offsetPolygon(pts, d) {
  // simple miter offset for a convex-ish CCW/CW polygon (outward for d>0 given its winding)
  const n = pts.length, out = [];
  let area = 0; for (let i = 0; i < n; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % n]; area += x0 * z1 - x1 * z0; }
  const s = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(...e1), l2 = Math.hypot(...e2);
    const n1 = [s * e1[1] / l1, -s * e1[0] / l1], n2 = [s * e2[1] / l2, -s * e2[0] / l2];
    const m = [n1[0] + n2[0], n1[1] + n2[1]], lm = Math.hypot(...m) || 1;
    const k = d / Math.max(0.35, (m[0] / lm) * n1[0] + (m[1] / lm) * n1[1]);
    out.push([p[0] + (m[0] / lm) * k, p[1] + (m[1] / lm) * k]);
  }
  return out;
}

function polygonMesh(THREE, pts, material, { depth = 0.15, top = 0, bevel = 0.02 } = {}) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, top - depth - bevel, 0);
  const m = new THREE.Mesh(g, material); m.receiveShadow = true;
  return m;
}

export function buildSite(THREE, opts = {}) {
  const theme = opts.theme || 'dark';
  const mw = opts.mw ?? 100, mwh = opts.mwh ?? 250.7;
  const day = opts.day || null;
  const materials = createMaterials(THREE, theme);
  const M = materials.m;
  const group = new THREE.Group(); group.name = 'site';
  const stats = { triangles: {} };
  const farU = { value: new THREE.Vector2(...FAR_FADE) };

  // ── ground works: pad, apron, road ─────────────────────────────────────────────────────────────
  const pad = new THREE.Group(); pad.name = 'pad'; group.add(pad);
  pad.add(polygonMesh(THREE, LAYOUT.pad, M.pad, { depth: 0.14, top: 0, bevel: 0.03 }));
  const apron = polygonMesh(THREE, offsetPolygon(LAYOUT.pad, 5), M.gravel, { depth: 0.04, top: -0.06, bevel: 0 });
  pad.add(apron);
  const roadPts = [[-3.6, 99], [-3.6, 104], [-8, 108], [-40, 109], [-120, 110], [-260, 111], [-340, 111.5]]; // runs on past the far fade
  const road = ribbonGeometry(THREE, roadPts.map(([x, z]) => [x, -0.035, z]), 6.2).geometry;
  road.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from(road.attributes.position.array).flatMap((v, i, a) => (i % 3 === 0 ? [a[i], a[i + 2]] : [])), 2));
  road.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(road.attributes.position.count * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  road.setIndex(Array.from(road.index.array).reverse()); // ribbons are wound facing down; face the road up
  const roadMesh = new THREE.Mesh(road, farFadeMaterial(M.gravel, farU)); roadMesh.receiveShadow = true; roadMesh.name = 'road'; pad.add(roadMesh);

  // ── enclosures (instanced) and the hero ────────────────────────────────────────────────────────
  const enclosures = [];
  const half = ENC.W / 2 + LAYOUT.pairGap / 2;
  LAYOUT.rowsZ.forEach((z, r) => LAYOUT.pairsX.forEach((x, p) => {
    enclosures.push({ index: enclosures.length, row: r, pair: p, side: 'north', position: new THREE.Vector3(x, 0, z - half), yaw: Math.PI, scale: 1 });
    enclosures.push({ index: enclosures.length, row: r, pair: p, side: 'south', position: new THREE.Vector3(x, 0, z + half), yaw: 0, scale: 1 });
  }));
  const heroIndex = enclosures.findIndex((e) => e.row === 5 && e.pair === 0 && e.side === 'south');
  const encGeo = enclosureInstanceGeometries(THREE, { lod: 'inst' });
  stats.triangles.enclosureInstance = encGeo.triangles;
  const block = new THREE.Group(); block.name = 'enclosures'; group.add(block);
  const encMeshes = [];
  for (const [mat, geo] of Object.entries(encGeo.geometries)) {
    const im = new THREE.InstancedMesh(geo, M[mat], enclosures.length);
    im.castShadow = true; im.receiveShadow = true; im.name = `enc|${mat}`;
    block.add(im); encMeshes.push(im);
  }
  const ctex = contactTex(THREE), rtex = radialTex(THREE);
  const cmat = contactMaterial(THREE, ctex, 0.62);
  const encShadow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), cmat, enclosures.length);
  encShadow.name = 'enc|contact'; encShadow.renderOrder = 1; block.add(encShadow);
  const shadowSize = [(ENC.plinthX1 - ENC.plinthX0) / 0.62 * 0.92, (ENC.W + 0.42) / 0.62 * 1.2];
  const shadowCx = (ENC.plinthX0 + ENC.plinthX1) / 2;

  // the cooling units' fan rotors: two per enclosure, one InstancedMesh, turned in update() (the hero has its own)
  const rotorGeo = fanRotorGeometry(THREE);
  const encRotors = new THREE.InstancedMesh(rotorGeo, M.galv, enclosures.length * FAN_MOUNTS.length);
  encRotors.name = 'enc|fanRotors'; encRotors.castShadow = false; encRotors.receiveShadow = true; block.add(encRotors);
  const fanLocal = FAN_MOUNTS.map(([x, y, z, yaw]) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)));
  const encBase = enclosures.map(() => new THREE.Matrix4());
  let fanAngle = 0;

  const hero = buildEnclosure(THREE, { materials, lod: 'hero', ghostColor: theme === 'light' ? '#5d6670' : '#cfd6de' });
  stats.triangles.hero = hero.triangles;
  hero.group.name = 'hero'; group.add(hero.group);
  const heroShadow = new THREE.Mesh(new THREE.PlaneGeometry(shadowSize[0], shadowSize[1]).rotateX(-Math.PI / 2), cmat);
  heroShadow.position.set(shadowCx, 0.006, 0); heroShadow.renderOrder = 1; hero.group.add(heroShadow);

  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sv = new THREE.Vector3();
  function setEnclosureTransform(i, position, yaw = enclosures[i].yaw, scale = enclosures[i].scale, bounds = true) {
    const e = enclosures[i];
    if (position) e.position.copy(position);
    e.yaw = yaw; e.scale = scale;
    q.setFromAxisAngle(up, yaw);
    const s = i === heroIndex ? 0 : scale;
    mtx.compose(e.position, q, sv.set(s, s, s));
    for (const im of encMeshes) { im.setMatrixAt(i, mtx); im.instanceMatrix.needsUpdate = true; }
    encBase[i].copy(mtx); placeEncRotors(i);
    // contact shadow: offset to the plinth's centre in the enclosure's frame
    const off = new THREE.Vector3(shadowCx, 0.006, 0).applyQuaternion(q).multiplyScalar(scale);
    mtx.compose(e.position.clone().add(off), q, sv.set(shadowSize[0] * s, 1, shadowSize[1] * s));
    encShadow.setMatrixAt(i, mtx); encShadow.instanceMatrix.needsUpdate = true;
    if (i === heroIndex) { hero.group.position.copy(e.position); hero.group.rotation.set(0, yaw, 0); hero.group.scale.setScalar(scale); }
    if (bounds) refreshBounds();
  }
  // the intro moves many enclosures in one frame: it passes bounds = false and calls this once
  function refreshBounds() { for (const im of encMeshes) im.computeBoundingSphere(); encShadow.computeBoundingSphere(); encRotors.computeBoundingSphere(); }
  const rz = new THREE.Matrix4(), rm = new THREE.Matrix4();
  function placeEncRotors(i) {
    for (let k = 0; k < fanLocal.length; k++) {
      rz.makeRotationZ(fanAngle * (1 + 0.07 * k) + i * 0.37 + k * 0.9);
      rm.copy(encBase[i]).multiply(fanLocal[k]).multiply(rz);
      encRotors.setMatrixAt(i * fanLocal.length + k, rm);
    }
    encRotors.instanceMatrix.needsUpdate = true;
  }
  enclosures.forEach((e) => setEnclosureTransform(e.index, null));

  // ── power conversion skids (instanced) ────────────────────────────────────────────────────────
  const skids = [];
  LAYOUT.rowsZ.forEach((z, r) => LAYOUT.skidsX.forEach((x, c) => skids.push({ row: r, col: c, position: new THREE.Vector3(x, 0, z), yaw: 0 })));
  const pcsGeo = pcsGeometries(THREE);
  stats.triangles.pcsInstance = pcsGeo.triangles;
  const pcs = new THREE.Group(); pcs.name = 'pcs'; group.add(pcs);
  const pcsMeshes = [];
  for (const [mat, geo] of Object.entries(pcsGeo.geometries)) {
    const im = new THREE.InstancedMesh(geo, M[mat], skids.length); im.castShadow = im.receiveShadow = true; im.name = `pcs|${mat}`;
    skids.forEach((s, i) => { mtx.compose(s.position, q.setFromAxisAngle(up, s.yaw), sv.set(1, 1, 1)); im.setMatrixAt(i, mtx); });
    im.computeBoundingSphere(); pcs.add(im); pcsMeshes.push(im);
  }
  const skidBase = skids.map((k) => new THREE.Matrix4().compose(k.position, new THREE.Quaternion().setFromAxisAngle(up, k.yaw), new THREE.Vector3(1, 1, 1)));
  const pcsRotorGeo = fanRotorGeometry(THREE, PCS_FAN_D);
  const pcsRotors = new THREE.InstancedMesh(pcsRotorGeo, M.galv, skids.length * PCS_FAN_MOUNTS.length);
  pcsRotors.name = 'pcs|fanRotors'; pcsRotors.receiveShadow = true; pcs.add(pcsRotors);
  const pcsFanLocal = PCS_FAN_MOUNTS.map(([x, y, z, rx]) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rx), new THREE.Vector3(1, 1, 1)));
  const skidLift = skids.map(() => 0);
  const skidScale = skids.map(() => 1); // the intro grows the skids out of the pad (0..1)
  function placeSkid(i) {
    const lift = new THREE.Matrix4().makeTranslation(0, skidLift[i], 0);
    const m = lift.clone().multiply(skidBase[i]);
    if (skidScale[i] !== 1) m.multiply(new THREE.Matrix4().makeScale(skidScale[i], skidScale[i], skidScale[i]));
    for (const im of pcsMeshes) { im.setMatrixAt(i, m); im.instanceMatrix.needsUpdate = true; }
    for (let k = 0; k < pcsFanLocal.length; k++) {
      rz.makeRotationZ(fanAngle * 1.3 * (1 + 0.05 * k) + i * 0.53 + k * 1.3);
      rm.copy(m).multiply(pcsFanLocal[k]).multiply(rz);
      pcsRotors.setMatrixAt(i * pcsFanLocal.length + k, rm);
    }
    pcsRotors.instanceMatrix.needsUpdate = true;
  }
  skids.forEach((_, i) => placeSkid(i)); pcsRotors.computeBoundingSphere();
  const pcsShadow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), cmat, skids.length);
  skids.forEach((s, i) => { mtx.compose(s.position.clone().setY(0.006), q.identity(), sv.set(2.6 / 0.62 * 0.95, 1, 5.0 / 0.62 * 1.0)); pcsShadow.setMatrixAt(i, mtx); });
  pcsShadow.renderOrder = 1; pcsShadow.computeBoundingSphere(); pcs.add(pcsShadow);
  /** The intro's build-out: skid i at scale s (0..1), its contact shadow with it. */
  function setSkidScale(i, s0) {
    const s = Math.max(0, Math.min(1, s0)); if (skidScale[i] === s) return;
    skidScale[i] = s; placeSkid(i);
    mtx.compose(skids[i].position.clone().setY(0.006), q.identity(), sv.set(2.6 / 0.62 * 0.95 * s, 1, 5.0 / 0.62 * 1.0 * s)); pcsShadow.setMatrixAt(i, mtx); pcsShadow.instanceMatrix.needsUpdate = true;
  }

  // ── substation, buildings, line ───────────────────────────────────────────────────────────────
  const sub = buildSubstation(THREE, materials);
  stats.triangles.substation = sub.triangles;
  const substation = sub.parts.sub; substation.name = 'substation'; group.add(substation);
  const line = sub.parts.line; line.name = 'line'; group.add(line);
  const lineMats = new Map(); // the line's poles and insulators fade with distance (the substation's steel does not)
  line.traverse((o) => { if (o.isMesh) { if (!lineMats.has(o.material)) lineMats.set(o.material, farFadeMaterial(o.material, farU)); o.material = lineMats.get(o.material); } });
  const contact = new THREE.Group(); contact.name = 'contactShadows'; group.add(contact);
  const quad = (x, z, w, d, op = 0.6, tex = ctex, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), tex === ctex ? cmat : contactMaterial(THREE, tex, op));
    m.position.set(x, 0.07, z); m.rotation.y = ry; m.renderOrder = 1; contact.add(m); return m;
  };
  const rmat = contactMaterial(THREE, rtex, 0.55);
  quad(SUB.cx, SUB.xf, 9.5 / 0.62, 7.2 / 0.62 * 1.05);
  quad(SUB.cx, SUB.breaker, 7.4 / 0.62, 2.6 / 0.62);
  quad(SUB.house.cx, SUB.house.cz, (SUB.house.w + 0.6) / 0.62, (SUB.house.d + 0.6) / 0.62);
  quad(SUB.swgr.cx, SUB.swgr.cz, (SUB.swgr.w + 0.6) / 0.62, (SUB.swgr.d + 0.6) / 0.62);
  const roundShadow = (x, z, r) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), rmat); m.position.set(x, 0.07, z); m.renderOrder = 1; contact.add(m); };
  for (const x of SUB.deadEnd.xs) roundShadow(x, SUB.deadEnd.z, 1.6);
  for (const [x, z] of SUB.masts) roundShadow(x, z, 1.3);
  for (const [x, z] of SUB.poles) roundShadow(x, z, 2.0);

  // conductors as pixel-width lines
  const cp = conductorPaths(THREE);
  const lineMat = new LineMaterial({ color: exactColor(THREE, theme === 'light' ? '#59616a' : '#8a9097').getHex(), linewidth: 1.25, worldUnits: false, transparent: true, opacity: 0.95 });
  lineMat.color.copy(exactColor(THREE, theme === 'light' ? '#59616a' : '#8a9097'));
  const shieldMat = lineMat.clone(); shieldMat.linewidth = 0.9;
  farFadeLine(lineMat, farU); farFadeLine(shieldMat, farU);
  const lines = [];
  for (const pts of [...cp.phases, ...cp.jumpers, cp.shield]) {
    const lg = new LineGeometry(); lg.setPositions(pts.flatMap((p) => [p.x, p.y, p.z]));
    const l = new Line2(lg, pts === cp.shield ? shieldMat : lineMat); l.computeLineDistances(); l.name = 'conductor';
    l.userData.noAO = true; // a pixel-wide line has no place in the occlusion pass (its normal material cannot draw it)
    line.add(l); lines.push(l);
  }

  // ── fences ────────────────────────────────────────────────────────────────────────────────────
  const o = offsetPolygon(LAYOUT.pad, 1.4);
  const gy = o[3][1];
  // from the gate's east post, east and round the pad (against the polygon's order) to its west post
  const ringPts = [o[3], o[2], o[1], o[0], o[6], o[5], o[4]];
  const fenceRuns = [
    { points: [[LAYOUT.gateX[1], gy], ...ringPts, [LAYOUT.gateX[0], gy]], closed: false },
    { points: [[LAYOUT.gateX[0], gy], [LAYOUT.gateX[1], gy]], closed: false, gap: [0.0, LAYOUT.gateX[1] - LAYOUT.gateX[0]] },
    { points: [[17, SUB.yard.z0 - 1], [5, SUB.yard.z0 - 1], [5, SUB.yard.z1 + 1], [37, SUB.yard.z1 + 1], [37, SUB.yard.z0 - 1], [23, SUB.yard.z0 - 1]], closed: false, barbed: true },
    { points: [[23, SUB.yard.z0 - 1], [17, SUB.yard.z0 - 1]], closed: false, gap: [0, 6], barbed: true },
  ];
  const fence = buildFence(THREE, materials, fenceRuns);
  fence.group.name = 'fence'; group.add(fence.group);
  stats.triangles.fence = fence.triangles;

  // ── trenches (dark covers) ────────────────────────────────────────────────────────────────────
  const trenches = new THREE.Group(); trenches.name = 'trenches'; group.add(trenches);
  const tb = []; // [x0,z0,x1,z1]
  const laneZ = [LAYOUT.rowsZ[0] - 4.25, ...LAYOUT.rowsZ.map((z) => z + 4.25)];
  const xW = LAYOUT.skidsX[0] - 0.4, xE = LAYOUT.skidsX[3] + 0.4, ax = LAYOUT.aisleX;
  for (const z of laneZ) tb.push([xW, z, xE, z]);
  tb.push([ax, laneZ[0], ax, laneZ[laneZ.length - 1]]);
  for (const z of LAYOUT.rowsZ) for (const x of LAYOUT.skidsX) tb.push([x, z + PCS.L / 2, x, z + 4.25]);
  const sw = SUB.swgr;
  tb.push([ax, laneZ[laneZ.length - 1], ax, 8], [ax, 8, sw.cx, 8], [sw.cx, 8, sw.cx, sw.cz - sw.d / 2 - 0.3], [sw.cx, sw.cz + sw.d / 2 + 0.3, sw.cx, SUB.xf - 6.4]);
  const tg = [];
  for (const [x0, z0, x1, z1] of tb) {
    const len = Math.hypot(x1 - x0, z1 - z0), g = new THREE.BoxGeometry(len + 0.6, 0.07, 0.6);
    g.rotateY(Math.atan2(-(z1 - z0), x1 - x0)); g.translate((x0 + x1) / 2, 0.035, (z0 + z1) / 2); tg.push(g);
  }
  const tMesh = new THREE.Mesh(mergeBoxes(THREE, tg), M.trench); tMesh.receiveShadow = true; tMesh.castShadow = false; tMesh.name = 'trenchCovers';
  trenches.add(tMesh);
  // a copper line along each cover: the cable runs read at site scale (one draw call)
  const cg = [];
  for (const [x0, z0, x1, z1] of tb) {
    const len = Math.hypot(x1 - x0, z1 - z0), g = new THREE.BoxGeometry(len + 0.1, 0.02, 0.14);
    g.rotateY(Math.atan2(-(z1 - z0), x1 - x0)); g.translate((x0 + x1) / 2, 0.08, (z0 + z1) / 2); cg.push(g);
  }
  const cMesh = new THREE.Mesh(mergeBoxes(THREE, cg), M.copper); cMesh.receiveShadow = true; cMesh.name = 'trenchCopper';
  trenches.add(cMesh);

  // ── power flow: comet pulses along the path the power takes (flow.ts) ─────────────────────────────
  // u in metres from the grid end: the line (from beyond the far fade) -> the dead-end -> the jumpers -> the bus through
  // the switches and the breaker -> the transformer -> its low side, down into the trench -> the switchgear -> up the
  // aisle -> out along each lane -> up each stub into its skid. Through equipment (the dead-end's insulators, the
  // transformer, the switchgear house) u runs on by about the equipment's length, and the pulses fade out and back in.
  const flows = new THREE.Group(); flows.name = 'flow'; flows.visible = false; group.add(flows);
  const fGround = cometMaterial(THREE, { ground: true, period: 8, tail: 4 });
  const fAir = cometMaterial(THREE, { period: 11, tail: 5 });
  fAir.uniforms.uFarR = farU; // the pulses on the line thin out with it
  const EDGE = 1.6; // m over which the pulses fade in or out where a piece of path ends in equipment
  const yG = 0.13; // the ground runs: just above the trench covers' copper (top at 0.09)
  const air = [], ground = [];
  const len = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) : 0), 0);
  // the line, phase by phase (from the far end), all three arriving at the dead-end together
  const conductorIn = cp.phases.map((pts) => pts.map((p) => [p.x, p.y, p.z]).reverse());
  const uLine = Math.max(...conductorIn.map(len));
  for (const pts of conductorIn) air.push({ points: pts, u0: uLine - len(pts), fadeIn: 0, fadeOut: EDGE });
  // the jumpers down to the line disconnect, running on into the bus: disconnect, breaker, disconnect, high-side bushings
  const uJ = uLine + 2.2, busY = 6.05;
  let uBus1 = 0;
  cp.jumpers.forEach((jp, i) => {
    const pts = jp.map((p) => [p.x, p.y, p.z]), lj = len(pts);
    air.push({ points: pts, u0: uJ, fadeIn: EDGE, fadeOut: 0 });
    const xb = SUB.cx - 2.4 + i * 2.4, xp = SUB.deadEnd.phases[i], xt = SUB.cx - 1.6 + i * 1.6;
    const bus = [[xp, 4.4 + 1.66, SUB.lineDisc + 0.7], [xp, 4.4 + 1.66, SUB.lineDisc - 0.7], [xb, busY + 0.05, SUB.breaker + 1.45], [xb, busY + 0.05, SUB.breaker - 1.45], [xt, 4.4 + 1.66, SUB.xfDisc + 0.7], [xt, 4.4 + 1.66, SUB.xfDisc - 0.7], [xt, 6.75, SUB.xf + 1.05]];
    air.push({ points: bus, u0: uJ + lj, fadeIn: 0, fadeOut: EDGE });
    uBus1 = Math.max(uBus1, uJ + lj + len(bus));
  });
  // the low side: up from the tank, over the riser frame and down into the trench
  const uLV = uBus1 + 4;
  let uRiser1 = 0;
  for (let i = 0; i < 3; i++) {
    const x = SUB.cx + i * 1.0, pts = [[x - 0.2, 4.6, SUB.xf - 2.6], [x, 5.15, SUB.xf - 6.5], [x, 4.3, SUB.xf - 6.35], [x, 0.3, SUB.xf - 6.35]];
    air.push({ points: pts, u0: uLV, fadeIn: EDGE, fadeOut: EDGE });
    uRiser1 = Math.max(uRiser1, uLV + len(pts));
  }
  // on the ground: to the switchgear house, through it, and round to the aisle
  const zLast = laneZ[laneZ.length - 1]; // (sw, ax, laneZ, xW and xE are the trenches')
  const G = (pts) => pts.map(([x, z]) => [x, yG, z]);
  const f1 = G([[sw.cx, SUB.xf - 6.4], [sw.cx, sw.cz + sw.d / 2 + 0.3]]);
  ground.push({ points: f1, u0: uRiser1 + 0.5, fadeIn: EDGE, fadeOut: EDGE });
  const f2 = G([[sw.cx, sw.cz - sw.d / 2 - 0.3], [sw.cx, 8], [ax, 8], [ax, zLast]]), uF2 = uRiser1 + 0.5 + len(f1) + sw.d + 0.6;
  ground.push({ points: f2, u0: uF2, fadeIn: EDGE, fadeOut: 0 });
  // up the aisle (it ends at the northmost lane), out along each lane, up each stub into its skid
  const uAisle = uF2 + len(f2);
  ground.push({ points: G([[ax, zLast], [ax, laneZ[0]]]), u0: uAisle, fadeIn: 0, fadeOut: EDGE });
  for (let li = laneZ.length - 1; li >= 1; li--) {
    const z = laneZ[li], uz = uAisle + (zLast - z), rowZ = LAYOUT.rowsZ[li - 1];
    for (const [xEnd, xs] of [[xW, LAYOUT.skidsX.filter((x) => x < ax)], [xE, LAYOUT.skidsX.filter((x) => x > ax)]]) {
      ground.push({ points: G([[ax, z], [xEnd, z]]), u0: uz, fadeIn: 0, fadeOut: EDGE });
      for (const x of xs) ground.push({ points: G([[x, z], [x, rowZ + PCS.L / 2]]), u0: uz + Math.abs(x - ax), fadeIn: 0, fadeOut: EDGE });
    }
  }
  flows.add(new THREE.Mesh(cometGeometry(THREE, ground).geometry, fGround), new THREE.Mesh(cometGeometry(THREE, air).geometry, fAir));
  flows.traverse((o) => { if (o.isMesh) { o.userData.overlay = true; o.renderOrder = 4; o.frustumCulled = false; } });

  // ── price bars along the near (north) edge, hours left to right for a camera in the north ─────────
  let bars = null;
  if (day) {
    bars = buildPriceBars(THREE, { prices: day.rt_spp_usd_mwh, net: day.dispatch_mw, origin: opts.barsOrigin || [0, -90.5], dir: opts.barsDir || [-1, 0], pitch: opts.barsPitch || 2.15, maxH: opts.barsMaxH || 14, theme });
    bars.group.visible = false; group.add(bars.group);
  }

  // ── props ─────────────────────────────────────────────────────────────────────────────────────
  const other = new THREE.Group(); other.name = 'other'; group.add(other);
  const truck = buildTruck(THREE, materials); truck.group.position.set(6.4, 0, 17.6); truck.group.rotation.y = Math.PI / 2; other.add(truck.group);
  truck.group.add(Object.assign(new THREE.Mesh(new THREE.PlaneGeometry(5.9 / 0.62 * 0.85, 2.0 / 0.62 * 1.1).rotateX(-Math.PI / 2), cmat), { renderOrder: 1 }));
  truck.group.children[truck.group.children.length - 1].position.y = 0.01;
  const figure = buildFigure(THREE, materials); figure.group.visible = false; other.add(figure.group);
  const figShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2), contactMaterial(THREE, rtex, 0.6));
  figShadow.position.y = 0.006; figShadow.renderOrder = 1; figure.group.add(figShadow);

  // ── the substation transformer's fan rotors (four, under the radiator banks) ─────────────────────
  const subRotorGeo = fanRotorGeometry(THREE, 0.66);
  const subRotors = [];
  for (const sx of [-1, 1]) for (const dz of [-0.6, 0.6]) {
    const r = new THREE.Mesh(subRotorGeo, M.galv); r.name = 'sub|fanRotor';
    const h = new THREE.Group(); h.position.set(SUB.cx + sx * 3.45, 0.45 + 0.19, SUB.xf + dz); h.rotation.x = -Math.PI / 2;
    h.add(r); substation.add(h); subRotors.push(r);
  }

  // ── site lighting: pole lights round the block and the yard's two floodlights; lit at night ─────────
  const lights = new THREE.Group(); lights.name = 'poleLights'; lights.visible = false; group.add(lights); // shown by the page (chapter 3)
  const headMat = new THREE.MeshStandardMaterial({ color: exactColor(THREE, '#2a2f35'), roughness: 0.5, emissive: new THREE.Color('#ffdcae'), emissiveIntensity: 0 });
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.11, 9, 8).translate(0, 4.5, 0);
  const headGeo = new THREE.BoxGeometry(0.55, 0.16, 0.38);
  const poleSpots = [];
  const lightAt = [[-41, -90, 1], [41, -90, 1], [-41, -22, 1], [41, -22, 1], [7.2, 50, 0], [34.8, 70, 0]]; // [x, z, own pole]
  for (const [x, z, own] of lightAt) {
    if (own) { const pm = new THREE.Mesh(poleGeo, M.galv); pm.position.set(x, 0, z); pm.castShadow = true; lights.add(pm); }
    const hd = new THREE.Mesh(headGeo, headMat); hd.position.set(x, 8.95, z + (own ? 0 : 0.2)); lights.add(hd);
    const sp = new THREE.SpotLight('#ffd9a8', 0, 80, Math.PI * 0.4, 1.0, 1.5);
    sp.position.set(x, 8.8, z); sp.target.position.set(x * 0.55, 0, z * 0.6 + (own ? (z < -50 ? 14 : -12) : 0) + (z > 0 ? -4 : 0));
    sp.layers.enableAll(); sp.visible = false; lights.add(sp, sp.target); poleSpots.push(sp);
  }

  // ── the reserve it held: a dashed ring round the block, in the reserve blue, breathing (no flow: held, not sent)
  const resPts = [];
  { const x0 = -31.5, x1 = 30.5, z0 = -85.5, z1 = -24.5, r = 3, seg = 6;
    const corner = (cx, cz, a0) => { for (let i = 0; i <= seg; i++) { const a = a0 + (i / seg) * Math.PI / 2; resPts.push(cx + Math.cos(a) * r, 0.45, cz + Math.sin(a) * r); } };
    corner(x1 - r, z0 + r, -Math.PI / 2); corner(x1 - r, z1 - r, 0); corner(x0 + r, z1 - r, Math.PI / 2); corner(x0 + r, z0 + r, Math.PI);
    resPts.push(resPts[0], resPts[1], resPts[2]); }
  const resGeo = new LineGeometry(); resGeo.setPositions(resPts);
  const resMat = new LineMaterial({ color: 0x3566d0, linewidth: 3, worldUnits: false, dashed: true, dashSize: 2.2, gapSize: 1.2, transparent: true, opacity: 0.95, depthWrite: false });
  const reserveRing = new Line2(resGeo, resMat); reserveRing.computeLineDistances(); reserveRing.name = 'reserveRing'; reserveRing.renderOrder = 6;
  const resFillMat = new THREE.MeshBasicMaterial({ color: 0x3566d0, transparent: true, opacity: 0.1, depthWrite: false });
  const resFill = new THREE.Mesh(new THREE.PlaneGeometry(62, 61).rotateX(-Math.PI / 2), resFillMat); resFill.position.set(-0.5, 0.2, -55); resFill.renderOrder = 2;
  const reserve = new THREE.Group(); reserve.name = 'reserve'; reserve.visible = false; reserve.add(resFill, reserveRing); group.add(reserve);
  reserve.traverse((o) => { o.userData.overlay = true; o.userData.noAO = true; });
  let reserveState = { mw: 0 }, reserveFade = 1;

  // ── hover: a gentle lift and glow on the asset under the pointer ──────────────────────────────────
  const glowBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: exactColor(THREE, '#9ff0dc'), transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
  const glowEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: exactColor(THREE, '#2ec7a6'), transparent: true, opacity: 0.85, depthWrite: false }));
  const hoverG = new THREE.Group(); hoverG.name = 'hover'; hoverG.visible = false; hoverG.add(glowBox, glowEdges); group.add(hoverG);
  hoverG.traverse((o) => { o.userData.overlay = true; o.userData.noAO = true; o.renderOrder = 11; });
  const SUBPARTS = [
    { name: 'Step-up transformer, 138 kV', c: [SUB.cx, 3, SUB.xf], s: [10.5, 6.5, 7.5] },
    { name: 'Circuit breaker', c: [SUB.cx, 2.6, SUB.breaker], s: [8.5, 5.2, 3.6] },
    { name: 'Disconnect switches', c: [SUB.cx, 3, SUB.lineDisc], s: [9, 6.5, 3] },
    { name: 'Disconnect switches', c: [SUB.cx, 3, SUB.xfDisc], s: [9, 6.5, 3] },
    { name: 'Dead-end structure: the line lands here', c: [SUB.cx, SUB.deadEnd.h / 2, SUB.deadEnd.z], s: [15, SUB.deadEnd.h + 1, 3] },
    { name: 'Control house', c: [SUB.house.cx, SUB.house.h / 2 + 0.2, SUB.house.cz], s: [SUB.house.w + 0.8, SUB.house.h + 0.8, SUB.house.d + 0.8] },
    { name: 'Switchgear house', c: [SUB.swgr.cx, SUB.swgr.h / 2 + 0.2, SUB.swgr.cz], s: [SUB.swgr.w + 0.8, SUB.swgr.h + 0.8, SUB.swgr.d + 0.8] },
    ...SUB.poles.map(([x, z]) => ({ name: '138 kV line to the grid', c: [x, 13.5, z], s: [7.5, 27.5, 3] })),
  ];
  const hit = new THREE.Vector3(), inv = new THREE.Matrix4();
  let hovered = null;
  /** The asset under a ray (world space): { kind, name, index?, box (site frame) } or null. */
  function pick(raycaster) {
    group.updateMatrixWorld(true);
    const targets = [];
    if (block.visible) targets.push(...encMeshes.filter((m) => m.visible && m.name === 'enc|paint'));
    if (hero.group.visible) targets.push(hero.group);
    if (pcs.visible) targets.push(...pcsMeshes.filter((m) => m.name === 'pcs|skid'));
    if (substation.visible) targets.push(substation);
    if (line.visible) targets.push(line);
    const hits = raycaster.intersectObjects(targets, true).filter((h) => !h.object.userData.overlay && h.object.visible);
    if (!hits.length) return null;
    const h0 = hits[0];
    inv.copy(group.matrixWorld).invert(); hit.copy(h0.point).applyMatrix4(inv);
    const box = new THREE.Box3();
    if (h0.object.name === 'enc|paint' && h0.instanceId != null || hero.group.getObjectById(h0.object.id)) {
      const i = h0.object.name === 'enc|paint' ? h0.instanceId : heroIndex; const e = enclosures[i];
      box.setFromCenterAndSize(e.position.clone().setY(1.7), new THREE.Vector3(...(Math.abs(Math.sin(e.yaw)) > 0.5 ? [3.2, 3.5, 7.4] : [7.4, 3.5, 3.2])));
      return { kind: 'enclosure', index: i, name: `Battery enclosure, about ${(mwh / enclosures.length).toFixed(1)} MWh (one of ${enclosures.length})`, box };
    }
    if (h0.object.name === 'pcs|skid' && h0.instanceId != null) {
      const k = skids[h0.instanceId];
      box.setFromCenterAndSize(k.position.clone().setY(1.6), new THREE.Vector3(2.8, 3.4, 5.2));
      return { kind: 'skid', index: h0.instanceId, name: `Inverter and transformer skid, about ${(mw / skids.length).toFixed(1)} MW (one of ${skids.length})`, box };
    }
    let best = null, bd = Infinity;
    for (const sp of SUBPARTS) { const d = Math.hypot(hit.x - sp.c[0], (hit.y - sp.c[1]) * 0.3, hit.z - sp.c[2]); if (d < bd) { bd = d; best = sp; } }
    if (best && bd < 9) { box.setFromCenterAndSize(new THREE.Vector3(...best.c), new THREE.Vector3(...best.s)); return { kind: 'substation', name: best.name, box }; }
    box.setFromCenterAndSize(new THREE.Vector3((SUB.yard.x0 + SUB.yard.x1) / 2, 4, (SUB.yard.z0 + SUB.yard.z1) / 2), new THREE.Vector3(32, 8, 72));
    return { kind: 'substation', name: 'Substation yard', box };
  }
  const LIFT = 0.35;
  function setHover(info) {
    if (hovered && (!info || info.kind !== hovered.kind || info.index !== hovered.index || info.name !== hovered.name)) {
      if (hovered.kind === 'enclosure') { const e = enclosures[hovered.index]; setEnclosureTransform(hovered.index, e.position.clone().setY(e.position.y - LIFT)); }
      if (hovered.kind === 'skid') { skidLift[hovered.index] = 0; placeSkid(hovered.index); }
      hovered = null;
    }
    if (info && !hovered) {
      if (info.kind === 'enclosure') { const e = enclosures[info.index]; setEnclosureTransform(info.index, e.position.clone().setY(e.position.y + LIFT)); }
      if (info.kind === 'skid') { skidLift[info.index] = LIFT; placeSkid(info.index); }
      hovered = info;
    }
    hoverG.visible = !!info;
    if (info) {
      const c = info.box.getCenter(new THREE.Vector3()), sz = info.box.getSize(new THREE.Vector3());
      if (info.kind === 'enclosure' || info.kind === 'skid') c.y += LIFT;
      hoverG.position.copy(c); hoverG.scale.copy(sz);
    }
  }

  // ── anchors (site frame) ──────────────────────────────────────────────────────────────────────
  const heroAnchor = (name) => () => hero.anchors[name].clone().applyMatrix4(hero.group.matrix);
  hero.group.updateMatrix();
  const frontRow = enclosures.find((e) => e.row === 5 && e.pair === 1 && e.side === 'south');
  const anchors = {
    enclosures: new THREE.Vector3(frontRow.position.x, ENC.PL + ENC.H + 0.1, frontRow.position.z),
    inverters: new THREE.Vector3(LAYOUT.skidsX[3], 2.95, LAYOUT.rowsZ[5] - 1.35),
    transformer: sub.anchors.transformer, substation: sub.anchors.substation, breaker: sub.anchors.breaker,
    line: sub.anchors.line, house: sub.anchors.house, deadEnd: sub.anchors.deadEnd,
    // on the line itself: the middle phase a fifth of the way from the dead-end to the first pole, the stretch chapter
    // 2's camera still holds (the dead-end's own anchor is a pole of its frame; Jo, 28 Oct)
    lineSpan: cp.phases[1][4].clone(),
  };
  for (const k of ['doors', 'cooling', 'racks', 'module', 'cells', 'fire', 'bms', 'roof']) Object.defineProperty(anchors, k, { get: heroAnchor(k), enumerable: true });
  Object.defineProperty(anchors, 'person', { get: () => new THREE.Vector3(0, 1.3, 0).applyMatrix4(figure.group.matrix), enumerable: true }); // the chest: the hat and head stay clear of the dot
  Object.defineProperty(anchors, 'bar', { get: () => (bars ? bars.anchor.clone() : new THREE.Vector3()), enumerable: true });
  Object.defineProperty(anchors, 'reserve', { get: () => new THREE.Vector3(-12, 0.45, -24.5), enumerable: true }); // the ring's south edge
  Object.defineProperty(anchors, 'barsKey', { get: () => (bars ? bars.keyAnchor.clone() : new THREE.Vector3()), enumerable: true });
  /** The price bars' hour marks (ground, site frame) for screen-space tick labels: [{ hour, at: Vector3 }]. */
  const barTicks = () => (bars ? bars.ticks.map((t) => ({ hour: t.hour, at: t.at.clone() })) : []);

  // ── behaviour ─────────────────────────────────────────────────────────────────────────────────
  // the flow: what the page asked for (flowState), what is drawn (flowShown), the pulses' fade (flowK: a change of
  // direction fades them out, then the new ones in) and their phase (metres travelled, so a change of rate never jumps)
  let flowState = { mode: 'idle', mw: 0 }, flowShown = { mode: 'idle', mw: 0 }, flowK = 0, flowFade = 1, flowPhase = 0, lastClock = null;
  const TEAL = exactColor(THREE, '#2ec7a6').multiplyScalar(1.15), ORANGE = exactColor(THREE, '#eb6834').multiplyScalar(1.1);
  function showFlow(s) {
    flowShown = s;
    const col = s.mode === 'discharge' ? ORANGE : TEAL, dir = s.mode === 'discharge' ? -1 : 1;
    for (const m of [fGround, fAir]) { m.uniforms.uColor.value.copy(col); m.uniforms.uDir.value = dir; }
  }
  function setFlow({ mode = 'idle', mw: f = 0 } = {}) {
    flowState = { mode, mw: f };
    if (mode !== 'idle') flows.visible = true; // drawn (at zero) from the first call, so its program is ready
    if (mode === flowShown.mode) flowShown = flowState;
  }
  function stepFlow(dt) {
    if (flowState.mode !== flowShown.mode) {
      flowK = flowShown.mode === 'idle' ? 0 : Math.max(0, flowK - dt / 0.18);
      if (flowK <= 0) showFlow(flowState);
    } else flowK = flowShown.mode === 'idle' ? 0 : Math.min(1, flowK + dt / 0.25);
    flowPhase += dt * (1.4 + 2.6 * Math.min(1, Math.abs(flowShown.mw) / Math.max(1, mw)));
    fGround.uniforms.uPhase.value = flowPhase; fAir.uniforms.uPhase.value = flowPhase * 1.4;
    fGround.uniforms.uOpacity.value = fAir.uniforms.uOpacity.value = flowK * flowFade;
    if (flowShown.mode === 'idle' && flowState.mode === 'idle') flows.visible = false;
  }
  function setHour(h) { if (bars) bars.setHour(h); }
  function setPriceBars(v) { if (bars) bars.setVisible(v); }
  let themeNow = theme;
  function setTheme(t) {
    themeNow = t; materials.setTheme(t);
    if (bars) bars.setTheme(t);
    const lc = exactColor(THREE, t === 'light' ? '#59616a' : '#8a9097');
    lineMat.color.copy(lc); shieldMat.color.copy(lc);
    roadMesh.material.color.copy(M.gravel.color);
    for (const [b0, m] of lineMats) m.color.copy(b0.color);
    hero.setGhostColor(t === 'light' ? '#5d6670' : '#cfd6de');
  }
  /** The drawing buffer's size (px) and its device-pixel ratio (the pulses' widths are CSS px). */
  function setResolution(w, h, dpr = 1) {
    lineMat.resolution.set(w, h); shieldMat.resolution.set(w, h); resMat.resolution.set(w, h); if (bars) bars.setResolution(w, h);
    setCometResolution(fGround, w, h, dpr); setCometResolution(fAir, w, h, dpr);
  }
  setResolution(1600, 900);
  let night = false;
  function update(time) {
    const dt = lastClock == null ? 0 : Math.max(0, Math.min(0.1, time - lastClock)); lastClock = time;
    stepFlow(dt);
    // status lamps breathe slowly (0.25 Hz), brighter at night
    const breathe = (night ? 3.2 : 2.0) + (night ? 1.4 : 0.8) * Math.sin(time * Math.PI * 2 * 0.25);
    M.lamp.emissiveIntensity = breathe;
    // fans: every rotor turns continuously
    fanAngle = time * FAN_RATE;
    hero.spin(time);
    for (let i = 0; i < enclosures.length; i++) placeEncRotors(i);
    for (let i = 0; i < skids.length; i++) placeSkid(i);
    subRotors.forEach((r, i) => { r.rotation.z = time * FAN_RATE * 0.8 + i * 1.1; });
    // the held reserve breathes, and its dashes stand still
    if (reserve.visible) { const k = 0.5 + 0.5 * Math.sin(time * Math.PI * 2 * 0.2); resMat.opacity = (0.7 + 0.3 * k) * reserveFade; resFillMat.opacity = ((night ? 0.12 : 0.08) + 0.06 * k) * reserveFade; }
  }
  /** Night: the pole lights and floodlights on, lamps brighter. */
  function setNight(on) {
    night = !!on;
    for (const sp of poleSpots) { sp.visible = night; sp.intensity = night ? 380 : 0; }
    headMat.emissiveIntensity = night ? 6 : 0;
    M.screen.emissiveIntensity = night ? 2.4 : 1.3; M.led.emissiveIntensity = night ? 3 : 2.0;
  }
  /** The reserve held this hour (MW): a dashed ring round the block in the reserve blue; 0 hides it. */
  function setReserve({ mw: r = 0, color } = {}) {
    reserveState = { mw: r };
    reserve.visible = r > 0.5;
    if (color) { const c = exactColor(THREE, color); resMat.color.copy(c); resFillMat.color.copy(c); }
  }
  function ghost(indices, { color, line = 0.42, fill = 0.06 } = {}) {
    const g = new THREE.Group(); g.name = 'ghosts';
    for (const i of indices) {
      const e = enclosures[i]; const gh = ghostEnclosure(THREE, color || (themeNow === 'light' ? '#5d6670' : '#cfd6de'), { line, fill });
      gh.position.copy(e.position); gh.rotation.y = e.yaw; g.add(gh);
    }
    group.add(g); return g;
  }

  ensureBase(THREE, group); // the meshes the builder did not make shade as themselves at distance (geo.ts)
  // out of the occlusion pass: the thin and the spinning (fence, line, pole lights, fan rotors); their occlusion is
  // nothing to see, and its buffers (no multisampling) alias on them and flicker the occlusion round them
  // (meshes only: a light hidden for that pass would change the light state between passes)
  for (const o of [fence.group, line, lights, encRotors, pcsRotors, ...subRotors]) o.traverse((c) => { if (c.isMesh) c.userData.noAO = true; });

  const footprint = { w: 90, d: 188 };
  const triangles = () => { let t = 0; group.traverse((o) => { if (o.isMesh && o.geometry) { const n = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; t += o.isInstancedMesh ? n * o.count : n; } }); return t; };
  stats.uniqueTriangles = () => { let t = 0; group.traverse((o) => { if (o.isMesh && o.geometry) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return t; };

  return {
    group, materials,
    parts: {
      hero: hero.group, heroKit: hero, heroIndex,
      enclosures: Object.assign(enclosures, { meshes: encMeshes, contact: encShadow }),
      setEnclosureTransform, refreshBounds, setSkidScale,
      pcs, skids, substation, line, pad, fence: fence.group, trenches, flows, bars: bars && bars.group,
      other, truck: truck.group, figure: figure.group, contact, lights, reserve, road: roadMesh,
      rotors: { enclosures: encRotors, skids: pcsRotors, substation: subRotors },
    },
    footprint, anchors, layout: LAYOUT, rating: { mw, mwh, enclosureMWh: mwh / enclosures.length, skidMW: mw / skids.length },
    setTheme, setFlow, setHour, setPriceBars, setResolution, update, explode: hero.explode, ghost, barTicks,
    /** A pixel's size per metre of depth (2 tan(vfov / 2) / the drawing buffer's height), for detail at distance
     *  (materials.ts farDetail); 0 keeps every detail. */
    setPixelScale: (k) => { materials.detail.value.x = k; },
    setNight, setReserve, pick, setHover, reserveState: () => reserveState,
    /** Overlays that can leave as the camera climbs away (1 whole, 0 gone): the reserve ring, and the flow. */
    setOverlayFade: (reserveK = 1, flowOut = 1) => { reserveFade = reserveK; flowFade = flowOut; fGround.uniforms.uOpacity.value = fAir.uniforms.uOpacity.value = flowOut * flowK; },
    /** The far fade's radii (m from the pad's centre): whole inside r0, gone beyond r1. */
    setFarFade: (r0 = FAR_FADE[0], r1 = FAR_FADE[1]) => farU.value.set(r0, r1),
    flowState: () => flowState, stats, triangles,
  };
}

function mergeBoxes(THREE, geos) {
  const pos = [], nor = [], uv = [], idx = [];
  for (const g of geos) {
    const b = pos.length / 3;
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array);
    for (const k of g.index.array) idx.push(b + k);
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export { ENC, PCS, SUB, ss };
