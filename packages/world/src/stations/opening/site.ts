// @ts-nocheck
// Desert Willow's site, schematic: assembled from the landing intro's part builders (the kit, imported and never
// edited), sized from the plan's rating at the intro's unit sizes, laid out in lines (v2/OPENING.md section 1).
// buildSite is not used: its layout is the intro's battery near Laredo. Meters; +x east, +y up, +z south; the origin is
// the pad's center. The small helpers the kit keeps private to site.ts (polygonMesh, the far fade on lit and line
// materials) are re-implemented here from it as they are.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMaterials, contactMaterial } from '../../kit/materials';
import { enclosureInstanceGeometries, ENC, FAN_MOUNTS, FAN_RATE, fanRotorGeometry } from '../../kit/enclosure';
import { pcsGeometries, PCS, PCS_FAN_MOUNTS, PCS_FAN_D } from '../../kit/pcs';
import { buildSubstation, conductorPaths, SUB } from '../../kit/substation';
import { buildFence } from '../../kit/fence';
import { ribbonGeometry } from '../../kit/flow';
import { contactTex, radialTex } from '../../kit/textures';
import { ensureBase } from '../../kit/geo';
import { exactColor } from '../../kit/tone';
import { offsetPoly } from '../../kit/region/geo';

/** The intro's units: its enclosure holds about 5.2 MWh ("5.2 MWh each at this site", intro copy.ts:60; 250.7 MWh over
 *  48) and its skid about 4.17 MW (100 MW over 24). */
export const UNIT = { enclosureMWh: 5.2, skidMW: 100 / 24 };

export const LAYOUT = {
  /** Five east-west lines of enclosures, end to end on plinths at an 8.68 m pitch (7.18 m plinth, 1.5 m gap). */
  lineZ: [-28.52, -14.26, 0, 14.26, 28.52],
  pitch: 8.68,
  /** Skid lines between the enclosure lines, skids at a 12.4 m pitch, long axis north-south. */
  skidZ: [-21.39, -7.13, 7.13, 21.39],
  skidPitch: 12.4,
  /** The block's pad and the strip under the two houses (south of the yard). */
  pad: [[-64, -38], [64, -38], [64, 15], [104.6, 15], [104.6, 32], [64, 32], [64, 38], [-64, 38]],
  /** The kit's substation group, turned 180 degrees and moved so its yard spans x 75 to 105 and z -55 to 15. */
  yardAt: [111, 0, 37],
  gateX: [-3, 3],
  /** The fence 1.4 m outside the pad; the yard's barbed run is the kit's own, turned with the yard. */
  fenceZ: { north: -39.4, south: 39.4 },
};

function polygonMesh(pts, material, { depth = 0.15, top = 0, bevel = 0.02 } = {}) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, top - depth - bevel, 0);
  const m = new THREE.Mesh(g, material); m.receiveShadow = true;
  return m;
}

// the far fade (kit/site.ts): whole inside r.x, gone beyond r.y, measured in the mesh's own frame
const FAR_GLSL = 'float farFade(vec2 p) { return 1.0 - smoothstep(uFarR.x, uFarR.y, length(p)); }';
function farFadeMaterial(base, U, key) {
  const m = base.clone();
  m.transparent = true; m.userData.noAO = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFarR = U;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFarXZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vFarXZ = transformed.xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vFarXZ;\nuniform vec2 uFarR;\n${FAR_GLSL}`)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a *= farFade(vFarXZ);');
  };
  m.customProgramCacheKey = () => `far-fade-${key}`;
  return m;
}
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

const box = (x0, z0, x1, z1, w, h, y) => {
  const len = Math.hypot(x1 - x0, z1 - z0), g = new THREE.BoxGeometry(len + w, h, w);
  g.rotateY(Math.atan2(-(z1 - z0), x1 - x0)); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return g;
};

export function buildDesertWillow({ theme = 'dark', mw, mwh }) {
  const nEnc = Math.round(mwh / UNIT.enclosureMWh), nSkid = Math.round(mw / UNIT.skidMW);
  const perLine = Math.ceil(nEnc / LAYOUT.lineZ.length), perSkidLine = Math.ceil(nSkid / LAYOUT.skidZ.length);
  const materials = createMaterials(THREE, theme);
  // the enclosures draw with their own registry, so the rest can fade, and they tint, alone (the intro clones them)
  const encMaterials = createMaterials(THREE, theme);
  const M = materials.m, EM = encMaterials.m;
  const group = new THREE.Group(); group.name = 'desert-willow';
  const ctex = contactTex(THREE), rtex = radialTex(THREE);
  // the road leaves the gate and fades out well before its turn west (42 to 76 m from the pad's center): at 95 to 190 m
  // it crossed the lower left of O01 under the caption as two flat bands, and stayed as a ghost L through the gather
  const farLine = { value: new THREE.Vector2(150, 300) }, farRoad = { value: new THREE.Vector2(42, 76) };

  // ── ground works: pad, apron, road ─────────────────────────────────────────────────────────────────────────────
  const pad = new THREE.Group(); pad.name = 'pad'; group.add(pad);
  pad.add(polygonMesh(LAYOUT.pad, M.pad, { depth: 0.14, top: 0, bevel: 0.03 }));
  pad.add(polygonMesh(offsetPoly(LAYOUT.pad, 5), M.gravel, { depth: 0.04, top: -0.06, bevel: 0 }));
  const roadPts = [[0, 40.4], [0, 96], [-3.6, 104], [-12, 108.6], [-60, 110.2], [-200, 111.2], [-340, 111.8]];
  const road = ribbonGeometry(THREE, roadPts.map(([x, z]) => [x, -0.035, z]), 6.2).geometry;
  road.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from(road.attributes.position.array).flatMap((v, i, a) => (i % 3 === 0 ? [a[i], a[i + 2]] : [])), 2));
  road.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(road.attributes.position.count * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  road.setIndex(Array.from(road.index.array).reverse());
  // at night the gravel under a weak moon fell darker than the ground and read as a black band: the road is drawn as
  // the venue draws ground, a flat color a step lighter than it, fading out soon after its turn west
  const roadMat = farFadeMaterial(new THREE.MeshBasicMaterial({ color: exactColor(THREE, '#1f2327') }), farRoad, 'road');
  const roadMesh = new THREE.Mesh(road, roadMat); roadMesh.name = 'road';
  group.add(roadMesh);

  // ── enclosures: lines of 13, doors south (yaw 0), instanced ───────────────────────────────────────────────────
  const encs = [];
  for (let l = 0; l < LAYOUT.lineZ.length; l++) for (let j = 0; j < perLine && encs.length < nEnc; j++) {
    const xPlinth = (j - (perLine - 1) / 2) * LAYOUT.pitch;
    // the enclosure's origin sits 0.22 m east of its plinth's center (ENC.plinthX0 and X1)
    encs.push({ index: encs.length, line: l, position: new THREE.Vector3(xPlinth - (ENC.plinthX0 + ENC.plinthX1) / 2, 0, LAYOUT.lineZ[l]), yaw: 0 });
  }
  const encGeo = enclosureInstanceGeometries(THREE, { lod: 'inst' });
  const block = new THREE.Group(); block.name = 'enclosures'; group.add(block);
  const encMeshes = [];
  for (const [mat, geo] of Object.entries(encGeo.geometries)) {
    const im = new THREE.InstancedMesh(geo, EM[mat], encs.length);
    im.castShadow = true; im.receiveShadow = true; im.name = `enc|${mat}`;
    block.add(im); encMeshes.push(im);
  }
  const encContactMat = contactMaterial(THREE, ctex, 0.62);
  const encShadow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), encContactMat, encs.length);
  encShadow.name = 'enc|contact'; encShadow.renderOrder = 1; block.add(encShadow);
  const shadowSize = [(ENC.plinthX1 - ENC.plinthX0) / 0.62 * 0.92, (ENC.W + 0.42) / 0.62 * 1.2];
  const shadowCx = (ENC.plinthX0 + ENC.plinthX1) / 2;
  const encRotors = new THREE.InstancedMesh(fanRotorGeometry(THREE), EM.galv, encs.length * FAN_MOUNTS.length);
  encRotors.name = 'enc|fanRotors'; encRotors.receiveShadow = true; block.add(encRotors);
  const fanLocal = FAN_MOUNTS.map(([x, y, z, yaw]) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)));
  const encBase = encs.map(() => new THREE.Matrix4());
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sv = new THREE.Vector3();
  const rz = new THREE.Matrix4(), rm = new THREE.Matrix4();
  let fanAngle = 0;
  function placeEncRotors(i) {
    for (let k = 0; k < fanLocal.length; k++) {
      rz.makeRotationZ(fanAngle * (1 + 0.07 * k) + i * 0.37 + k * 0.9);
      rm.copy(encBase[i]).multiply(fanLocal[k]).multiply(rz);
      encRotors.setMatrixAt(i * fanLocal.length + k, rm);
    }
  }
  const off = new THREE.Vector3();
  function placeEnclosure(i, p) {
    const e = encs[i];
    q.setFromAxisAngle(up, e.yaw);
    mtx.compose(p, q, sv.set(1, 1, 1));
    for (const im of encMeshes) im.setMatrixAt(i, mtx);
    encBase[i].copy(mtx); placeEncRotors(i);
    off.set(shadowCx, 0.006, 0).applyQuaternion(q);
    mtx.compose(off.add(p), q, sv.set(shadowSize[0], 1, shadowSize[1]));
    encShadow.setMatrixAt(i, mtx);
  }
  function encDirty() {
    for (const im of encMeshes) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    encShadow.instanceMatrix.needsUpdate = true; encShadow.computeBoundingSphere();
    encRotors.instanceMatrix.needsUpdate = true; encRotors.computeBoundingSphere();
  }
  encs.forEach((e) => placeEnclosure(e.index, e.position)); encDirty();

  // ── power conversion skids: lines of 9 between the enclosure lines, instanced ─────────────────────────────────────
  const skids = [];
  for (const z of LAYOUT.skidZ) for (let k = 0; k < perSkidLine && skids.length < nSkid; k++) skids.push({ position: new THREE.Vector3((k - (perSkidLine - 1) / 2) * LAYOUT.skidPitch, 0, z) });
  const pcsGeo = pcsGeometries(THREE);
  const pcs = new THREE.Group(); pcs.name = 'pcs'; group.add(pcs);
  for (const [mat, geo] of Object.entries(pcsGeo.geometries)) {
    const im = new THREE.InstancedMesh(geo, M[mat], skids.length); im.castShadow = im.receiveShadow = true; im.name = `pcs|${mat}`;
    skids.forEach((s, i) => { mtx.compose(s.position, q.identity(), sv.set(1, 1, 1)); im.setMatrixAt(i, mtx); });
    im.computeBoundingSphere(); pcs.add(im);
  }
  const skidBase = skids.map((k) => new THREE.Matrix4().compose(k.position, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
  const pcsRotors = new THREE.InstancedMesh(fanRotorGeometry(THREE, PCS_FAN_D), M.galv, skids.length * PCS_FAN_MOUNTS.length);
  pcsRotors.name = 'pcs|fanRotors'; pcsRotors.receiveShadow = true; pcs.add(pcsRotors);
  const pcsFanLocal = PCS_FAN_MOUNTS.map(([x, y, z, rx]) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rx), new THREE.Vector3(1, 1, 1)));
  function placeSkidRotors() {
    for (let i = 0; i < skids.length; i++) for (let k = 0; k < pcsFanLocal.length; k++) {
      rz.makeRotationZ(fanAngle * 1.3 * (1 + 0.05 * k) + i * 0.53 + k * 1.3);
      rm.copy(skidBase[i]).multiply(pcsFanLocal[k]).multiply(rz);
      pcsRotors.setMatrixAt(i * pcsFanLocal.length + k, rm);
    }
    pcsRotors.instanceMatrix.needsUpdate = true;
  }
  placeSkidRotors(); pcsRotors.computeBoundingSphere();
  const cmat = contactMaterial(THREE, ctex, 0.62);
  const pcsShadow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), cmat, skids.length);
  skids.forEach((s, i) => { mtx.compose(s.position.clone().setY(0.006), q.identity(), sv.set(2.6 / 0.62 * 0.95, 1, 5.0 / 0.62)); pcsShadow.setMatrixAt(i, mtx); });
  pcsShadow.renderOrder = 1; pcsShadow.computeBoundingSphere(); pcs.add(pcsShadow);

  // ── the substation and its line: the kit's group, turned to face the block, the line leaving north ───────────────
  const yard = new THREE.Group(); yard.name = 'yard';
  yard.position.set(...LAYOUT.yardAt); yard.rotation.y = Math.PI; group.add(yard);
  const sub = buildSubstation(THREE, materials);
  const substation = sub.parts.sub; substation.name = 'substation'; yard.add(substation);
  const line = sub.parts.line; line.name = 'line'; yard.add(line);
  const lineMats = new Map();
  line.traverse((o) => { if (o.isMesh) { if (!lineMats.has(o.material)) lineMats.set(o.material, farFadeMaterial(o.material, farLine, `line-${lineMats.size}`)); o.material = lineMats.get(o.material); } });
  const contact = new THREE.Group(); contact.name = 'contactShadows'; yard.add(contact);
  const quad = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), cmat); m.position.set(x, 0.07, z); m.renderOrder = 1; contact.add(m); };
  quad(SUB.cx, SUB.xf, 9.5 / 0.62, 7.2 / 0.62 * 1.05);
  quad(SUB.cx, SUB.breaker, 7.4 / 0.62, 2.6 / 0.62);
  quad(SUB.house.cx, SUB.house.cz, (SUB.house.w + 0.6) / 0.62, (SUB.house.d + 0.6) / 0.62);
  quad(SUB.swgr.cx, SUB.swgr.cz, (SUB.swgr.w + 0.6) / 0.62, (SUB.swgr.d + 0.6) / 0.62);
  const rmat = contactMaterial(THREE, rtex, 0.55);
  const roundShadow = (x, z, r) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), rmat); m.position.set(x, 0.07, z); m.renderOrder = 1; contact.add(m); };
  for (const x of SUB.deadEnd.xs) roundShadow(x, SUB.deadEnd.z, 1.6);
  for (const [x, z] of SUB.masts) roundShadow(x, z, 1.3);
  for (const [x, z] of SUB.poles) roundShadow(x, z, 2.0);
  // conductors as pixel-width lines (kit/site.ts)
  const cp = conductorPaths(THREE);
  const lineMat = new LineMaterial({ color: 0xffffff, linewidth: 1.25, worldUnits: false, transparent: true, opacity: 0.95 });
  lineMat.color.copy(exactColor(THREE, theme === 'light' ? '#59616a' : '#8a9097'));
  const shieldMat = lineMat.clone(); shieldMat.linewidth = 0.9;
  farFadeLine(lineMat, farLine); farFadeLine(shieldMat, farLine);
  for (const pts of [...cp.phases, ...cp.jumpers, cp.shield]) {
    const lg = new LineGeometry(); lg.setPositions(pts.flatMap((p) => [p.x, p.y, p.z]));
    const l = new Line2(lg, pts === cp.shield ? shieldMat : lineMat); l.computeLineDistances(); l.name = 'conductor'; l.userData.noAO = true;
    line.add(l);
  }
  const subRotors = [];
  const subRotorGeo = fanRotorGeometry(THREE, 0.66);
  for (const sx of [-1, 1]) for (const dz of [-0.6, 0.6]) {
    const r = new THREE.Mesh(subRotorGeo, M.galv); r.name = 'sub|fanRotor';
    const h = new THREE.Group(); h.position.set(SUB.cx + sx * 3.45, 0.45 + 0.19, SUB.xf + dz); h.rotation.x = -Math.PI / 2;
    h.add(r); substation.add(h); subRotors.push(r);
  }

  // ── fences: chain link 1.4 m outside the pad (the gate gap at x -3 to 3 on the south side), barbed round the yard ──
  // (the kit's yard fence turned with the yard: x' = 111 - x, z' = 37 - z)
  const yx = (x) => LAYOUT.yardAt[0] - x, yz = (z) => LAYOUT.yardAt[2] - z;
  const YW = yx(SUB.yard.x1 + 1), YE = yx(SUB.yard.x0 - 1), YN = yz(SUB.yard.z1 + 1), YS = yz(SUB.yard.z0 - 1);
  const { north: FN, south: FS } = LAYOUT.fenceZ, FW = -65.4, FE = 65.4, SE = 106, SS = 33.4, SN = 13.6;
  const fenceRuns = [
    { points: [[LAYOUT.gateX[1], FS], [FE, FS], [FE, SS], [SE, SS], [SE, YS]], closed: false },
    { points: [[SE, YS], [SE, YN], [YW, YN], [YW, SN]], closed: false, barbed: true },
    { points: [[YW, SN], [FE, SN], [FE, FN], [FW, FN], [FW, FS], [LAYOUT.gateX[0], FS]], closed: false },
    { points: [[LAYOUT.gateX[0], FS], [LAYOUT.gateX[1], FS]], closed: false, gap: [0, LAYOUT.gateX[1] - LAYOUT.gateX[0]] },
    // the yard's own south side, between it and the houses, with the kit's yard gate (x 17 to 23 before the turn)
    { points: [[SE, YS], [yx(17), YS]], closed: false, barbed: true },
    { points: [[yx(17), YS], [yx(23), YS]], closed: false, gap: [0, 6], barbed: true },
    { points: [[yx(23), YS], [YW, YS]], closed: false, barbed: true },
  ];
  const fence = buildFence(THREE, materials, fenceRuns);
  fence.group.name = 'fence'; group.add(fence.group);

  // ── trenches: a cover and its copper along each skid line, a spine at the block's east end, a trunk to the
  //    switchgear house ─────────────────────────────────────────────────────────────────────────────────────────
  const xs = skids.map((s) => s.position.x), xW = Math.min(...xs) - 3, xE = Math.max(...xs) + 6.4;
  const swX = yx(SUB.swgr.cx) - SUB.swgr.w / 2 - 0.3, swZ = yz(SUB.swgr.cz);
  const runs = [...LAYOUT.skidZ.map((z) => [xW, z, xE, z]), [xE, LAYOUT.skidZ[0], xE, LAYOUT.skidZ[LAYOUT.skidZ.length - 1]], [xE, swZ, swX, swZ]];
  const trenches = new THREE.Group(); trenches.name = 'trenches'; group.add(trenches);
  const tMesh = new THREE.Mesh(mergeGeometries(runs.map(([a, b, c, d]) => box(a, b, c, d, 0.6, 0.07, 0.035))), M.trench); tMesh.receiveShadow = true; tMesh.name = 'trenchCovers';
  const cMesh = new THREE.Mesh(mergeGeometries(runs.map(([a, b, c, d]) => box(a, b, c, d, 0.14, 0.02, 0.08))), M.copper); cMesh.receiveShadow = true; cMesh.name = 'trenchCopper';
  trenches.add(tMesh, cMesh);

  // ── pole lights: the pad's four corners and the middle of each side (the south one clear of the gate) ───────────
  const lights = new THREE.Group(); lights.name = 'poleLights'; group.add(lights);
  const headMat = new THREE.MeshStandardMaterial({ color: exactColor(THREE, '#2a2f35'), roughness: 0.5, emissive: new THREE.Color('#ffdcae'), emissiveIntensity: 0 });
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.11, 9, 8).translate(0, 4.5, 0), headGeo = new THREE.BoxGeometry(0.55, 0.16, 0.38);
  const lightAt = [[-62.5, -36.5], [62.5, -36.5], [-62.5, 36.5], [62.5, 36.5], [0, -36.5], [12, 36.5], [-62.5, 0], [62.5, 0]];
  const spots = [];
  for (const [x, z] of lightAt) {
    const pm = new THREE.Mesh(poleGeo, M.galv); pm.position.set(x, 0, z); pm.castShadow = true; lights.add(pm);
    const hd = new THREE.Mesh(headGeo, headMat); hd.position.set(x, 8.95, z); lights.add(hd);
    const sp = new THREE.SpotLight('#ffd9a8', 0, 80, Math.PI * 0.4, 1.0, 1.5);
    sp.position.set(x, 8.8, z); sp.target.position.set(x * 0.6, 0, z * 0.6);
    sp.layers.enableAll(); lights.add(sp, sp.target); spots.push(sp);
  }
  // the yard's two floodlights, on the kit's own floodlight poles (substation.ts, site.ts lightAt), aimed at the
  // transformer and the breaker; in the yard's frame, so they turn with it
  const yardLights = new THREE.Group(); yardLights.name = 'yardLights'; yard.add(yardLights);
  for (const [x, z, tz] of [[7.2, 50, SUB.xf], [34.8, 70, SUB.breaker]]) {
    const hd = new THREE.Mesh(headGeo, headMat); hd.position.set(x, 8.82, z + 0.2); yardLights.add(hd);
    const sp = new THREE.SpotLight('#ffd9a8', 0, 80, Math.PI * 0.4, 1.0, 1.5);
    sp.position.set(x, 8.7, z + 0.2); sp.target.position.set(SUB.cx, 0, tz);
    sp.layers.enableAll(); yardLights.add(sp, sp.target); spots.push(sp);
  }

  ensureBase(THREE, group);
  // out of the occlusion pass: the thin and the spinning (kit/site.ts)
  for (const o of [fence.group, line, lights, encRotors, pcsRotors, ...subRotors]) o.traverse((c) => { if (c.isMesh) c.userData.noAO = true; });

  // ── the rest, fadable: every material outside the enclosures, with its own opacity and depth write ──────────────
  const encSet = new Set([...encMeshes, encShadow, encRotors]);
  const rest = [], seen = new Set();
  const lineMatsAll = [lineMat, shieldMat];
  group.traverse((o) => {
    if (encSet.has(o) || !o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (seen.has(m)) continue; seen.add(m);
      rest.push({ m, base: m.opacity ?? 1, dw: m.depthWrite, tr: m.transparent });
    }
  });
  for (const m of lineMatsAll) if (!seen.has(m)) { seen.add(m); rest.push({ m, base: m.opacity, dw: m.depthWrite, tr: true }); }
  // the line's own materials (its far-fade clones and the conductors) fade on their own: at the column's distance a 15%
  // ghost of the line read as scratches beside the column's foot
  const lineOwn = new Set([...lineMats.values(), ...lineMatsAll]);
  for (const r of rest) r.line = lineOwn.has(r.m);
  let restNow = 1, lineNow = 1;
  function setRest(a, aLine = a) {
    if (a === restNow && aLine === lineNow) return; restNow = a; lineNow = aLine;
    for (const r of rest) {
      const k = r.line ? aLine : a;
      const tr = r.tr || k < 0.999;
      if (r.m.transparent !== tr) { r.m.transparent = tr; r.m.needsUpdate = true; }
      r.m.opacity = r.base * k; r.m.depthWrite = r.dw && k >= 0.999;
    }
    line.visible = aLine > 0.002;
    for (const p of [pad, pcs, fence.group, trenches, roadMesh]) p.visible = a > 0.002;
    // the yard and the pole lights hold spot lights: hide their meshes only, so every light stays counted and no
    // program recompiles as the site fades (OPENING.md section 1)
    for (const g of [yard, lights]) g.traverse((o) => { if (o.isMesh) o.visible = a > 0.002; });
  }

  // ── the enclosures' gather and tint ───────────────────────────────────────────────────────────────────────────
  const encMats = Object.values(EM).filter((m) => m.color);
  const encColor = encMats.map((m) => m.color.clone()), encEmissive = encMats.map((m) => (m.emissive ? m.emissive.clone() : null));
  const tintTo = new THREE.Color(), pNow = new THREE.Vector3();
  function poseEnclosures(move, slot, delay) {
    for (let i = 0; i < encs.length; i++) {
      const t = ss(delay[i], delay[i] + 0.78, move);
      pNow.copy(encs[i].position).lerp(sv.set(slot[i].x, 0, slot[i].z), t);
      placeEnclosure(i, pNow.clone());
    }
    encDirty();
  }
  function tintEnclosures(k, hex) {
    tintTo.copy(exactColor(THREE, hex));
    encMats.forEach((m, i) => { m.color.copy(encColor[i]).lerp(tintTo, k); if (encEmissive[i] && m.emissive) m.emissive.copy(encEmissive[i]).multiplyScalar(1 - k); });
    encContactMat.opacity = 0.62 * (1 - k);
  }
  function showEnclosures(v) { block.visible = v; }

  // ── light and motion ─────────────────────────────────────────────────────────────────────────────────────────
  let lightK = 1;
  /** The pole lights (spots and heads) at k (0..1); every spot stays counted, so no program recompiles. */
  function setLights(k) {
    lightK = k;
    for (const sp of spots) { sp.visible = true; sp.intensity = 380 * k; }
    headMat.emissiveIntensity = 6 * k;
  }
  /** Night: the screens and LEDs at the kit's night values (kit/site.ts setNight). */
  for (const R of [M, EM]) { R.screen.emissiveIntensity = 2.4; R.led.emissiveIntensity = 3; }
  function update(t) {
    const breathe = 3.2 + 1.4 * Math.sin(t * Math.PI * 2 * 0.25);
    M.lamp.emissiveIntensity = breathe; EM.lamp.emissiveIntensity = breathe;
    fanAngle = t * FAN_RATE;
    for (let i = 0; i < encs.length; i++) placeEncRotors(i);
    encRotors.instanceMatrix.needsUpdate = true;
    placeSkidRotors();
    subRotors.forEach((r, i) => { r.rotation.z = t * FAN_RATE * 0.8 + i * 1.1; });
  }
  function setResolution(w, h) { lineMat.resolution.set(w, h); shieldMat.resolution.set(w, h); }
  function setPixelScale(k) { materials.detail.value.x = k; encMaterials.detail.value.x = k; }

  // ── anchors for the plates (world frame) ──────────────────────────────────────────────────────────────────────
  yard.updateMatrixWorld(true);
  const inYard = (v) => v.clone().applyMatrix4(yard.matrixWorld);
  const front = encs.filter((e) => e.line === LAYOUT.lineZ.length - 1);
  const mid = front[Math.floor(front.length / 2)];
  const frontSkids = skids.filter((s) => s.position.z === LAYOUT.skidZ[LAYOUT.skidZ.length - 1]);
  const anchors = {
    enclosures: new THREE.Vector3(mid.position.x, ENC.PL + ENC.H + 0.1, mid.position.z),
    skids: frontSkids[Math.min(frontSkids.length - 1, Math.round(frontSkids.length * 0.72))].position.clone().setY(2.9),
    substation: inYard(sub.anchors.transformer),
    line: inYard(sub.anchors.line),
    padCorners: LAYOUT.pad.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    yardCorners: [[YW, YN], [SE, YN], [SE, YS], [YW, YS]].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    deadEnd: inYard(sub.anchors.deadEnd),
    // the block's west ends, so the plates can stand in the open ground beside the block instead of on it
    enclosuresWest: (() => { const e = front.reduce((a, b) => (b.position.x < a.position.x ? b : a)); return new THREE.Vector3(e.position.x + ENC.plinthX0 + 1.2, ENC.PL + ENC.H, e.position.z); })(),
    skidsWest: (() => { const zs = LAYOUT.skidZ, z = zs[Math.max(0, zs.length - 3)]; const k = skids.filter((s) => s.position.z === z).reduce((a, b) => (b.position.x < a.position.x ? b : a)); return k.position.clone().setY(2.6); })(),
  };

  return {
    group, materials, encMaterials, anchors,
    counts: { enclosures: encs.length, skids: skids.length, perLine, perSkidLine, lines: LAYOUT.lineZ.length, skidLines: LAYOUT.skidZ.length },
    home: encs.map((e) => ({ x: e.position.x, z: e.position.z })),
    skidHome: skids.map((k) => ({ x: k.position.x, z: k.position.z })),
    parts: { block, pcs, yard, line, fence: fence.group, trenches, lights, pad, road: roadMesh, encMeshes },
    setRest, poseEnclosures, tintEnclosures, showEnclosures, setLights, update, setResolution, setPixelScale,
    lightK: () => lightK,
  };
}

function ss(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
