// @ts-nocheck
// Ported from landing-3d/live/kit/substation.js (27 Oct 2026). Plain JS under a type pass: three.js has no types here.
// The 138 kV project substation, its two buildings, and the line leaving on steel monopoles.
// Built directly in site coordinates (metres, +x east, +y up, +z south). Generic equipment.
import { createBuilder, sagPoints } from './geo';

/** A polymer post or string insulator along +y in the current frame, base at y0. */
function insulator(b, key, x, y0, z, h, { r = 0.06, shed = 0.14, n } = {}) {
  n = n || Math.max(4, Math.round(h / 0.12));
  b.cyl(key, r, h, x, y0 + h / 2, z, { seg: 10 });
  for (let i = 0; i < n; i++) b.cyl(key, i % 2 ? shed * 0.8 : shed, 0.022, x, y0 + 0.08 + (i * (h - 0.16)) / (n - 1), z, { seg: 14 });
  b.cyl('sub|galv', r * 1.5, 0.06, x, y0 + 0.03, z, { seg: 10 });
  b.cyl('sub|galv', r * 1.5, 0.06, x, y0 + h - 0.03, z, { seg: 10 });
}

/** Tapered tubular steel pole from the ground. */
function pole(b, key, x, z, h, r0, r1) {
  b.cyl('sub|concrete', r0 + 0.35, 0.5, x, 0.25, z, { seg: 16 });
  b.cyl(key, r0, 0.08, x, 0.54, z, { seg: 16, rt: r0 + 0.12, rb: r0 + 0.12 });
  b.cyl(key, r1, h, x, h / 2, z, { rt: r1, rb: r0, seg: 14 });
  b.cyl(key, r1 * 1.1, 0.12, x, h + 0.06, z, { seg: 12 });
}

/** A three-phase group-operated disconnect switch on a steel stand across x, at z. */
function disconnect(b, cx, z, span, h, phases) {
  for (const s of [-1, 1]) {
    b.box('sub|steel', 0.26, h, 0.26, cx + s * span / 2, h / 2, z, { c: 0.02 });
    b.cyl('sub|concrete', 0.42, 0.3, cx + s * span / 2, 0.15, z, { seg: 12 });
  }
  b.box('sub|steel', span + 0.4, 0.32, 0.32, cx, h + 0.16, z, { c: 0.02 });
  for (const px of phases) {
    b.box('sub|steel', 0.5, 0.08, 1.9, px, h + 0.36, z);
    for (const dz of [-0.7, 0.7]) insulator(b, 'sub|polymer', px, h + 0.4, z + dz, 1.15, { r: 0.055, shed: 0.12 });
    b.box('sub|galv', 0.07, 0.07, 1.45, px, h + 1.62, z, { c: 0.01 });
    b.box('sub|galv', 0.16, 0.1, 0.16, px, h + 1.6, z - 0.7);
    b.box('sub|galv', 0.16, 0.1, 0.16, px, h + 1.6, z + 0.7);
  }
  b.rod('sub|galv', [cx + span / 2 - 0.2, 1.1, z + 0.18], [cx + span / 2 - 0.2, h, z + 0.18], 0.025);
  b.box('sub|xfmr', 0.3, 0.45, 0.22, cx + span / 2 - 0.2, 1.1, z + 0.3, { c: 0.01 });
}

/** Bus between points (rigid tube) */
function bus(b, a, c) { b.rod('sub|galv', a, c, 0.05, { seg: 8 }); }

/** A prefabricated building: panel walls, low-slope roof, door, wall AC unit, cable tray. */
function building(b, cx, cz, w, d, h, { doorSide = 1 } = {}) {
  b.box('sub|concrete', w + 0.6, 0.25, d + 0.6, cx, 0.125, cz, { c: 0.03 });
  b.box('sub|house', w, h, d, cx, 0.25 + h / 2, cz, { c: 0.02 });
  b.box('sub|roof', w + 0.3, 0.14, d + 0.3, cx, 0.25 + h + 0.07, cz, { c: 0.03 });
  for (let i = 1; i < Math.round(w / 1.2); i++) for (const s of [-1, 1]) b.box('sub|seam', 0.012, h - 0.1, 0.004, cx - w / 2 + (i * w) / Math.round(w / 1.2), 0.25 + h / 2, cz + s * (d / 2 + 0.002));
  for (let i = 1; i < Math.round(d / 1.2); i++) for (const s of [-1, 1]) b.box('sub|seam', 0.004, h - 0.1, 0.012, cx + s * (w / 2 + 0.002), 0.25 + h / 2, cz - d / 2 + (i * d) / Math.round(d / 1.2));
  const dz = cz + doorSide * (d / 2 + 0.01);
  b.box('sub|seam', 1.0, 2.15, 0.01, cx - w / 4, 0.25 + 1.08, dz);
  b.box('sub|house', 0.94, 2.1, 0.03, cx - w / 4, 0.25 + 1.06, dz + doorSide * 0.012, { c: 0.005 });
  b.box('sub|galv', 0.03, 0.16, 0.04, cx - w / 4 + 0.35, 0.25 + 1.05, dz + doorSide * 0.035);
  b.box('sub|warnWhite', 0.3, 0.2, 0.005, cx - w / 4, 0.25 + 1.7, dz + doorSide * 0.03);
  b.box('sub|warn', 0.3, 0.06, 0.006, cx - w / 4, 0.25 + 1.77, dz + doorSide * 0.031);
  b.box('sub|concrete', 1.4, 0.18, 0.9, cx - w / 4, 0.09, dz + doorSide * 0.45);
  // wall air conditioner
  b.box('sub|cool', 0.9, 1.6, 0.45, cx + w / 4, 0.25 + 1.3, dz + doorSide * 0.23, { c: 0.02 });
  for (let i = 0; i < 9; i++) b.box('sub|louvre', 0.7, 0.012, 0.03, cx + w / 4, 0.25 + 0.75 + i * 0.12, dz + doorSide * 0.465);
  // cable tray and lamp
  b.box('sub|galv', w * 0.8, 0.08, 0.3, cx, 0.25 + h - 0.35, cz - doorSide * (d / 2 + 0.2));
  b.box('sub|dark', 0.22, 0.12, 0.16, cx - w / 4, 0.25 + 2.45, dz + doorSide * 0.08, { c: 0.01 });
}

/** The step-up transformer: tank, radiators, conservator, bushings and arresters. HV faces +z. */
function transformer(b, cx, cz) {
  const tw = 5.4, td = 3.0, th = 3.5, y0 = 0.45;
  b.box('sub|concrete', 9.5, 0.45, 7.2, cx, 0.225, cz, { c: 0.03 });
  for (const s of [-1, 1]) { b.box('sub|concrete', 9.5, 0.35, 0.25, cx, 0.45 + 0.17, cz + s * 3.47); b.box('sub|concrete', 0.25, 0.35, 7.2, cx + s * 4.62, 0.45 + 0.17, cz); }
  b.box('sub|yardDark', 9.0, 0.02, 6.7, cx, 0.46, cz);
  b.box('sub|xfmr', tw, th, td, cx, y0 + th / 2, cz, { c: 0.05 });
  b.box('sub|xfmr', tw + 0.25, 0.12, td + 0.25, cx, y0 + th + 0.06, cz, { c: 0.03 });
  b.box('sub|xfmr', tw + 0.2, 0.25, td + 0.2, cx, y0 + 0.125, cz, { c: 0.02 });
  // stiffeners on the long faces
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) b.box('sub|xfmr', 0.12, th - 0.4, 0.12, cx - tw / 2 + 0.4 + i * ((tw - 0.8) / 6), y0 + th / 2, cz + s * (td / 2 + 0.05));
  // radiator banks on both ends: 3 radiators x 14 fins each, headers top and bottom, fans below
  for (const s of [-1, 1]) {
    const x0 = cx + s * (tw / 2 + 0.25);
    for (let r = 0; r < 3; r++) {
      const zc = cz - 1.0 + r * 1.0;
      for (let f = 0; f < 14; f++) b.box('sub|xfmr', 0.9, 2.5, 0.035, x0 + s * 0.5, y0 + 1.7, zc - 0.36 + f * 0.055);
      b.cyl('sub|xfmr', 0.07, 0.95, x0 + s * 0.5, y0 + 3.0, zc, { rx: Math.PI / 2, seg: 8 });
      b.cyl('sub|xfmr', 0.07, 0.95, x0 + s * 0.5, y0 + 0.4, zc, { rx: Math.PI / 2, seg: 8 });
      b.rod('sub|xfmr', [cx + s * tw / 2, y0 + 3.0, zc], [x0 + s * 0.5, y0 + 3.0, zc], 0.08);
      b.rod('sub|xfmr', [cx + s * tw / 2, y0 + 0.4, zc], [x0 + s * 0.5, y0 + 0.4, zc], 0.08);
    }
    for (const dz of [-0.6, 0.6]) {
      b.cyl('sub|grille', 0.36, 0.12, x0 + s * 0.5, y0 + 0.12, cz + dz, { seg: 20 });
    }
  }
  // conservator on brackets along the north (-z) edge
  const cy = y0 + th + 1.2;
  b.cyl('sub|xfmr', 0.42, 3.4, cx - 0.4, cy, cz - td / 2 + 0.35, { rz: Math.PI / 2, seg: 20 });
  for (const s of [-1, 1]) b.sphere('sub|xfmr', 0.42, cx - 0.4 + s * 1.7, cy, cz - td / 2 + 0.35, { s: [0.35, 1, 1], ws: 16, hs: 10 });
  for (const s of [-1, 1]) b.box('sub|steel', 0.12, 1.0, 0.12, cx - 0.4 + s * 1.2, y0 + th + 0.6, cz - td / 2 + 0.35);
  b.rod('sub|galv', [cx + 1.0, cy - 0.3, cz - td / 2 + 0.35], [cx + 1.4, y0 + th + 0.1, cz - 0.6], 0.045);
  b.box('sub|dark', 0.22, 0.2, 0.2, cx + 1.2, y0 + th + 0.45, cz - 0.95);
  // HV bushings on the +z edge, arresters on brackets in front
  for (let i = 0; i < 3; i++) {
    const x = cx - 1.6 + i * 1.6, z = cz + td / 2 - 0.45;
    b.cyl('sub|xfmr', 0.3, 0.3, x, y0 + th + 0.27, z, { seg: 16 });
    b.push(b.M(x, y0 + th + 0.4, z, 0.16, 0, 0));
    insulator(b, 'sub|polymer', 0, 0, 0, 2.1, { r: 0.1, shed: 0.2, n: 16 });
    b.cyl('sub|galv', 0.08, 0.25, 0, 2.2, 0, { seg: 10 });
    b.pop();
    b.box('sub|steel', 0.5, 0.1, 0.6, x + 0.5, y0 + th - 0.3, cz + td / 2 + 0.3);
    insulator(b, 'sub|polymer', x + 0.6, y0 + th - 0.25, cz + td / 2 + 0.45, 1.5, { r: 0.08, shed: 0.15 });
  }
  // LV bushings and neutral on the -z edge, into a cable box
  for (let i = 0; i < 4; i++) {
    const x = cx - 1.8 + i * 1.0 + 1.6, z = cz - td / 2 + 1.05;
    insulator(b, 'sub|polymer', x, y0 + th + 0.12, z, i === 3 ? 0.55 : 0.85, { r: 0.08, shed: 0.15, n: 6 });
  }
  b.box('sub|xfmr', 3.0, 1.4, 0.7, cx + 1.0, y0 + 1.3, cz - td / 2 - 0.35, { c: 0.03 });
  // control cabinet on the east end side
  b.box('sub|xfmr', 0.5, 1.4, 1.0, cx + tw / 2 + 0.25, y0 + 1.0, cz + 1.25, { c: 0.02 });
  b.box('sub|seam', 0.004, 1.2, 0.8, cx + tw / 2 + 0.502, y0 + 1.0, cz + 1.25);
  b.box('sub|warnWhite', 0.004, 0.25, 0.35, cx + tw / 2 + 0.506, y0 + 1.25, cz + 1.25);
  // lifting lugs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('sub|xfmr', 0.25, 0.25, 0.1, cx + sx * (tw / 2 - 0.2), y0 + th - 0.2, cz + sz * (td / 2 + 0.06));
}

/** 138 kV dead-tank breaker across x at z. */
function breaker(b, cx, z) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('sub|steel', 0.18, 2.3, 0.18, cx + sx * 3.2, 1.15, z + sz * 0.9, { c: 0.015 });
  b.box('sub|steel', 6.8, 0.22, 2.2, cx, 2.35, z, { c: 0.02 });
  for (let i = 0; i < 3; i++) {
    const x = cx - 2.4 + i * 2.4;
    b.cyl('sub|xfmr', 0.42, 2.4, x, 2.95, z, { rx: Math.PI / 2, seg: 20 });
    for (const s of [-1, 1]) b.sphere('sub|xfmr', 0.42, x, 2.95, z + s * 1.2, { s: [1, 1, 0.4], ws: 16, hs: 10 });
    for (const s of [-1, 1]) {
      b.push(b.M(x, 3.25, z + s * 0.75, s * 0.35, 0, 0));
      insulator(b, 'sub|polymer', 0, 0, 0, 2.0, { r: 0.09, shed: 0.18, n: 15 });
      b.cyl('sub|galv', 0.07, 0.3, 0, 2.12, 0, { seg: 10 });
      b.pop();
    }
  }
  b.box('sub|xfmr', 1.0, 1.6, 0.7, cx + 3.6, 1.3, z - 0.3, { c: 0.02 });
  b.box('sub|seam', 0.8, 1.35, 0.004, cx + 3.6, 1.3, z + 0.052);
  b.box('sub|warnWhite', 0.24, 0.16, 0.004, cx + 3.6, 1.7, z + 0.056);
  b.rod('sub|galv', [cx + 3.2, 2.2, z - 0.3], [cx + 3.4, 1.9, z - 0.3], 0.05);
}

export const SUB = {
  yard: { x0: 6, x1: 36, z0: 22, z1: 92 },
  cx: 18.25,
  deadEnd: { z: 86, xs: [12, 24.5], h: 18, beamY: 15.2, phases: [14.6, 18.25, 21.9] },
  lineDisc: 81, breaker: 75.6, xfDisc: 69.8, xf: 61.5,
  masts: [[12, 34], [24.5, 34]],
  house: { cx: 12.7, cz: 18.25, w: 5.8, d: 5.0, h: 3.0 },
  swgr: { cx: 20.65, cz: 15.9, w: 6.9, d: 4.4, h: 3.3 },
  poles: [[18.25, 146], [18.25, 206], [16.5, 266]],
};

/** Geometry of the substation yard (equipment, buildings, poles). Returns builder output and anchors. */
export function buildSubstation(THREE, materials) {
  const b = createBuilder(THREE);
  const S = SUB, cx = S.cx, ph = S.deadEnd.phases;
  // yard gravel slab (slightly raised over the pad)
  b.box('sub|yard', S.yard.x1 - S.yard.x0, 0.06, S.yard.z1 - S.yard.z0, (S.yard.x0 + S.yard.x1) / 2, 0.03, (S.yard.z0 + S.yard.z1) / 2);
  // dead-end H-frame
  for (const x of S.deadEnd.xs) pole(b, 'sub|steel', x, S.deadEnd.z, S.deadEnd.h, 0.36, 0.2);
  b.box('sub|steel', 13.6, 0.5, 0.5, cx, S.deadEnd.beamY, S.deadEnd.z, { c: 0.04 });
  b.box('sub|steel', 13.0, 0.18, 0.18, cx, S.deadEnd.beamY - 1.2, S.deadEnd.z, { c: 0.02 });
  for (const x of ph) {
    b.box('sub|galv', 0.3, 0.3, 0.6, x, S.deadEnd.beamY, S.deadEnd.z + 0.4);
    b.push(b.M(x, S.deadEnd.beamY, S.deadEnd.z + 0.55, Math.PI / 2 - 0.06, 0, 0));
    insulator(b, 'sub|polymer', 0, 0, 0, 1.6, { r: 0.05, shed: 0.12 });
    b.pop();
  }
  // line disconnect, breaker, transformer disconnect
  disconnect(b, cx, S.lineDisc, 8.4, 4.4, ph);
  breaker(b, cx, S.breaker);
  disconnect(b, cx, S.xfDisc, 8.4, 4.4, [cx - 1.6, cx, cx + 1.6]);
  // rigid bus: line disconnect -> breaker bushings -> transformer disconnect -> HV bushings
  const bt = 6.05;
  for (let i = 0; i < 3; i++) {
    const xb = cx - 2.4 + i * 2.4, xp = ph[i], xt = cx - 1.6 + i * 1.6;
    bus(b, [xp, 4.4 + 1.62, S.lineDisc - 0.7], [xb, bt, S.breaker + 1.45]);
    bus(b, [xb, bt, S.breaker - 1.45], [xt, 4.4 + 1.62, S.xfDisc + 0.7]);
    bus(b, [xt, 4.4 + 1.62, S.xfDisc - 0.7], [xt, 6.7, S.xf + 1.05]);
  }
  transformer(b, cx, S.xf);
  // LV riser frame and cable terminations north of the transformer
  for (const s of [-1, 1]) b.box('sub|steel', 0.22, 4.2, 0.22, cx + 1.0 + s * 2.2, 2.1, S.xf - 6.5, { c: 0.015 });
  b.box('sub|steel', 4.8, 0.25, 0.3, cx + 1.0, 4.2, S.xf - 6.5);
  for (let i = 0; i < 3; i++) {
    const x = cx + 0.0 + i * 1.0;
    insulator(b, 'sub|polymer', x, 4.33, S.xf - 6.5, 0.8, { r: 0.07, shed: 0.13, n: 6 });
    b.rod('sub|galv', [x, 5.1, S.xf - 6.5], [x - 0.2, 4.2, S.xf - 2.6], 0.035);
    b.rod('sub|dark', [x, 4.2, S.xf - 6.35], [x, 0.05, S.xf - 6.35], 0.045);
  }
  // lightning masts
  for (const [x, z] of S.masts) pole(b, 'sub|steel', x, z, 19, 0.28, 0.08);
  // buildings
  building(b, S.house.cx, S.house.cz, S.house.w, S.house.d, S.house.h, { doorSide: -1 });
  building(b, S.swgr.cx, S.swgr.cz, S.swgr.w, S.swgr.d, S.swgr.h, { doorSide: -1 });
  // yard floodlights
  for (const [x, z] of [[7.2, 50], [34.8, 70]]) { pole(b, 'sub|galv', x, z, 9, 0.1, 0.06); b.box('sub|dark', 0.4, 0.2, 0.3, x, 9.0, z + 0.2, { c: 0.02 }); }
  // the line's monopoles with davit arms and suspension insulators
  const arms = [[-1, 18.6], [1, 21.6], [-1, 24.6]];
  for (const [px, pz] of S.poles) {
    pole(b, 'line|steel', px, pz, 26.5, 0.48, 0.22);
    for (const [s, y] of arms) {
      b.beam('line|steel', [px, y, pz], [px + s * 3.0, y + 0.35, pz], 0.2, 0.2);
      b.rod('line|steel', [px, y - 1.0, pz], [px + s * 2.0, y + 0.2, pz], 0.05);
      insulator(b, 'line|polymer', px + s * 2.85, y - 1.35, pz, 1.4, { r: 0.05, shed: 0.13 });
    }
  }
  const out = b.build(materials.m);
  const anchors = {
    transformer: new THREE.Vector3(cx, 0.45 + 3.6, S.xf),
    substation: new THREE.Vector3(cx, 4.5, S.breaker),
    breaker: new THREE.Vector3(cx, 3.4, S.breaker),
    line: new THREE.Vector3(S.poles[0][0], 26.6, S.poles[0][1]),
    house: new THREE.Vector3(S.house.cx, 3.4, S.house.cz),
    deadEnd: new THREE.Vector3(S.deadEnd.xs[1], S.deadEnd.h, S.deadEnd.z),
  };
  return { ...out, anchors, triangles: b.triangles() };
}

/** Conductor polylines: phases from the dead-end beam through the poles and on toward the utility's
 *  switchyard; plus the jumpers down to the line disconnect. Points in site coordinates. */
export function conductorPaths(THREE) {
  const S = SUB, de = S.deadEnd;
  const armAt = (p, k) => { const [s, y] = [[-1, 18.6], [1, 21.6], [-1, 24.6]][k]; return [p[0] + s * 2.85, y - 1.35, p[1]]; };
  const order = [0, 1, 2]; // dead-end phase i -> arm k
  const phases = [];
  for (let i = 0; i < 3; i++) {
    const pts = [];
    let prev = [de.phases[i], de.beamY - 0.05, de.z + 2.1];
    const stops = S.poles.map((p) => armAt(p, order[i]));
    stops.push([S.poles[2][0] - 2.0 + (stops[2][0] - S.poles[2][0]), stops[2][1], 330]);
    for (const st of stops) {
      const span = Math.hypot(st[0] - prev[0], st[2] - prev[2]);
      const seg = sagPoints(THREE, prev, st, span * 0.024, 20);
      if (pts.length) seg.shift();
      pts.push(...seg); prev = st;
    }
    phases.push(pts);
  }
  const jumpers = de.phases.map((x) => sagPoints(THREE, [x, de.beamY - 0.1, de.z + 0.3], [x, 4.4 + 1.62, S.lineDisc + 0.7], 1.2, 12));
  // shield wire from the H-frame pole tops to the monopole tops
  const shield = [];
  let prev = [de.xs[0], de.h + 0.1, de.z];
  for (const p of S.poles) { const st = [p[0], 26.6, p[1]]; const seg = sagPoints(THREE, prev, st, 1.0, 16); if (shield.length) seg.shift(); shield.push(...seg); prev = st; }
  return { phases, jumpers, shield };
}
