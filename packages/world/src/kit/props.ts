// @ts-nocheck
// Ported from landing-3d/live/kit/props.js (27 Oct 2026). Plain JS under a type pass: three.js has no types here.
// Scale props: a faceless 1.75 m site worker (workwear, hi-vis vest, gloves, glasses, hard hat, a tablet), and an
// unbranded crew-cab pickup. Local frames on the ground.
import { createBuilder } from './geo';

/** A tapered capsule from A to B (radii rA at A, rB at B), lathed so it shades smoothly; for limbs. */
function capsule(THREE, A, B, rA, rB, seg = 18, rings = 6) {
  const a = new THREE.Vector3(...A), b = new THREE.Vector3(...B), d = b.clone().sub(a), L = d.length();
  const pts = [];
  for (let i = 0; i <= rings; i++) { const t = (-Math.PI / 2) * (1 - i / rings); pts.push(new THREE.Vector2(Math.cos(t) * rA, Math.sin(t) * rA)); }
  for (let i = 0; i <= rings; i++) { const t = (Math.PI / 2) * (i / rings); pts.push(new THREE.Vector2(Math.cos(t) * rB, L + Math.sin(t) * rB)); }
  pts[0].x = 0; pts[pts.length - 1].x = 0;
  const g = new THREE.LatheGeometry(pts, seg);
  const m = new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1));
  return { g, m };
}

/** Piecewise-linear radius of a lathe profile [[r, y], ...] at height y. */
const radiusAt = (prof, y) => {
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1], [r1, y1] = prof[i];
    if (y <= y1) return r0 + (r1 - r0) * Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
  }
  return prof[prof.length - 1][0];
};

/** Figure 1.75 m tall facing -z, feet at y=0: a site worker in grey workwear (shirt lighter than the trousers), an
 *  orange hi-vis vest with two waist bands and two braces of reflective tape, leather work gloves, safety glasses,
 *  a full-brim white hard hat and boots; reading a rugged tablet held at chest height, head a little bowed.
 *  Faceless (a plain head with a nose and ears for its profile), proportioned to about 7.5 heads. */
export function buildFigure(THREE, materials) {
  const b = createBuilder(THREE);
  const K = 'figure|figure', P = 'figure|pants', V = 'figure|vest', R = 'figure|warnWhite', S = 'figure|skin', H = 'figure|hat',
    B = 'figure|boots', G = 'figure|glove', D = 'figure|dark', GL = 'figure|glass';
  const limb = (key, A, Bp, rA, rB, seg) => { const { g, m } = capsule(THREE, A, Bp, rA, rB, seg); b.add(key, g, m); };
  const DEPTH = 0.64; // the torso's depth over its width

  // ── legs and boots (weight a little on the right leg, the left foot a step forward) ─────────────
  for (const s of [-1, 1]) {
    const fz = s < 0 ? -0.07 : 0.02, x = s * 0.105;
    // boot: a rounded last on a sole, a shaft to the ankle
    b.box(B, 0.112, 0.034, 0.285, x, 0.017, fz - 0.045, { c: 0.014 });
    limb(B, [x, 0.068, fz + 0.06], [x, 0.062, fz - 0.135], 0.054, 0.05, 16);
    limb(B, [x, 0.06, fz + 0.01], [x, 0.17, fz + 0.012], 0.06, 0.056, 16);
    // shin and thigh, the trousers a shade darker than the shirt
    const knee = [s * 0.1, 0.5, fz * 0.5 - 0.02], hip = [s * 0.092, 0.9, 0.0];
    limb(P, [x, 0.16, fz + 0.012], knee, 0.052, 0.061, 18);
    limb(P, knee, hip, 0.064, 0.086, 18);
  }
  b.sphere(P, 0.168, 0, 0.935, 0.0, { s: [1, 0.6, 0.74], ws: 28, hs: 16 }); // hips and seat

  // ── torso: an elliptical lathe, belt, collar ──────────────────────────────────────────────────
  const torso = [[0.15, 0.9], [0.156, 0.98], [0.15, 1.06], [0.16, 1.18], [0.176, 1.28], [0.184, 1.36], [0.178, 1.42], [0.152, 1.46], [0.1, 1.49], [0.0, 1.5]];
  const flat = (y = 0) => b.M(0, y, 0, 0, 0, 0, [1, 1, DEPTH]);
  b.add(K, new THREE.LatheGeometry(torso.map(([r, y]) => new THREE.Vector2(r, y)), 32), flat());
  b.add(D, new THREE.LatheGeometry([[0.162, 0.962], [0.165, 0.972], [0.165, 1.0], [0.16, 1.01]].map(([r, y]) => new THREE.Vector2(r, y)), 32), flat()); // belt
  b.add(K, new THREE.LatheGeometry([[0.078, 1.44], [0.074, 1.47], [0.064, 1.5], [0.06, 1.505]].map(([r, y]) => new THREE.Vector2(r, y)), 24), b.M(0, 0, 0, 0, 0, 0, [1, 1, 0.85])); // collar

  // ── the vest: a shell over the torso, open at the neck, with ANSI-style tape ─────────────────
  const vest = torso.slice(1, 8).map(([r, y]) => [r + 0.012, y]);
  vest.push([0.13, 1.468]);
  b.add(V, new THREE.LatheGeometry(vest.map(([r, y]) => new THREE.Vector2(r, y)), 32), flat());
  for (const [y0, y1] of [[1.09, 1.135], [1.2, 1.245]]) {
    const ring = [[radiusAt(vest, y0) + 0.004, y0], [radiusAt(vest, (y0 + y1) / 2) + 0.005, (y0 + y1) / 2], [radiusAt(vest, y1) + 0.004, y1]];
    b.add(R, new THREE.LatheGeometry(ring.map(([r, y]) => new THREE.Vector2(r, y)), 32), flat());
  }
  // braces: 4.5 cm strips up the front and the back, lying on the vest's surface
  const strip = (xc, side) => {
    const pos = [], idx = [], n = 12, w = 0.0225, y0 = 1.245, y1 = 1.44;
    for (let i = 0; i <= n; i++) {
      const y = y0 + ((y1 - y0) * i) / n, Rv = radiusAt(vest, y) + 0.0055;
      for (const x of [xc - w, xc + w]) pos.push(x, y, side * DEPTH * Rv * Math.sqrt(Math.max(0, 1 - (x / Rv) ** 2)));
      if (i) { const k = i * 2; idx.push(...(side < 0 ? [k - 2, k, k - 1, k - 1, k, k + 1] : [k - 2, k - 1, k, k - 1, k + 1, k])); } // wound outward
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    b.add(R, g);
  };
  for (const xc of [-0.088, 0.088]) for (const side of [-1, 1]) strip(xc, side);

  // ── arms: shoulders, sleeves, gloved hands holding the tablet ────────────────────────────────
  for (const s of [-1, 1]) {
    const sh = [s * 0.195, 1.405, 0.008], el = [s * 0.228, 1.12, 0.0], wr = [s * 0.14, 1.105, -0.245];
    b.sphere(K, 0.07, s * 0.186, 1.405, 0.006, { s: [1, 0.92, 1], ws: 22, hs: 16 }); // deltoid
    limb(K, sh, el, 0.06, 0.049, 20);
    limb(K, el, wr, 0.048, 0.039, 20);
    // a gauntlet cuff, then the hand gripping the tablet's edge (fingers over, thumb on top)
    limb(G, [wr[0] * 1.02, wr[1], wr[2] + 0.03], [wr[0] * 0.98, wr[1] + 0.004, wr[2] - 0.035], 0.043, 0.04, 16);
    b.sphere(G, 0.048, s * 0.133, 1.11, -0.305, { s: [0.62, 0.95, 1.22], ws: 18, hs: 12 });
    b.sphere(G, 0.018, s * 0.116, 1.138, -0.312, { s: [1, 0.8, 1.7], ws: 12, hs: 8 });
  }
  // the tablet: a rugged case tilted toward the face, its screen up
  b.push(b.M(0, 1.12, -0.315, 0.7, 0, 0));
  b.box(D, 0.27, 0.016, 0.195, 0, 0, 0, { c: 0.007 });
  b.box(GL, 0.232, 0.004, 0.16, 0, 0.0085, 0, { c: 0.001 });
  b.pop();

  // ── neck and head, bowed a little toward the tablet ──────────────────────────────────────────
  limb(S, [0, 1.44, 0.012], [0, 1.555, 0.0], 0.05, 0.047, 18);
  b.push(b.M(0, 1.555, 0, -0.26, 0, 0));
  b.sphere(S, 0.1, 0, 0.1, 0.0, { s: [0.79, 1.08, 0.95], ws: 32, hs: 24 }); // skull
  b.sphere(S, 0.072, 0, 0.045, -0.026, { s: [0.86, 0.9, 0.98], ws: 24, hs: 16 }); // jaw and chin
  b.sphere(S, 0.016, 0, 0.074, -0.097, { s: [0.7, 1.4, 1.0], ws: 14, hs: 10 }); // nose, under the lens
  for (const s of [-1, 1]) b.sphere(S, 0.026, s * 0.079, 0.095, 0.004, { s: [0.45, 1, 0.7], ws: 12, hs: 10 }); // ears
  // safety glasses: a wrap lens round the front at eye level
  b.add(GL, new THREE.TorusGeometry(0.09, 0.0105, 8, 40, Math.PI), b.M(0, 0.118, 0.0, -Math.PI / 2, 0, 0, [0.935, 1.12, 1.9], 'XYZ'));
  // the hard hat: a full-brim shell, a crown ridge, sitting on the head with its brim clear of it
  b.push(b.M(0, 0.16, -0.004, 0, 0, 0, [0.92, 1, 1.08]));
  const shell = [[0.12, 0.0], [0.118, 0.008], [0.114, 0.04], [0.1, 0.078], [0.076, 0.105], [0.042, 0.12], [0.0, 0.124]]; // profiles run up: faces out
  b.add(H, new THREE.LatheGeometry(shell.map(([r, y]) => new THREE.Vector2(r, y)), 40));
  const brim = [[0.108, 0.004], [0.116, -0.006], [0.146, -0.016], [0.166, -0.024], [0.172, -0.022], [0.168, -0.016], [0.148, -0.006], [0.118, 0.006], [0.112, 0.016]]; // under side out, top side in
  b.add(H, new THREE.LatheGeometry(brim.map(([r, y]) => new THREE.Vector2(r, y)), 48));
  const ridge = [];
  for (let i = 0; i <= 16; i++) { const a = -Math.PI * 0.42 + (Math.PI * 0.84 * i) / 16, r = 0.118; ridge.push([0, 0.004 + Math.cos(a) * 0.124, Math.sin(a) * r]); }
  b.tube(H, ridge, 0.011, { seg: 32, radial: 10 });
  b.pop();
  b.pop();

  const out = b.build(materials.m);
  let tris = 0;
  for (const mesh of out.meshes) { tris += mesh.geometry.attributes.position.count / 3; mesh.castShadow = mesh.receiveShadow = true; }
  const g = new THREE.Group(); g.add(out.group); g.name = 'figure';
  return { group: g, anchors: { head: new THREE.Vector3(0, 1.75, 0), chest: new THREE.Vector3(0, 1.3, 0) }, triangles: tris };
}

/** Crew-cab pickup, 5.9 m long, nose toward +x. */
export function buildTruck(THREE, materials) {
  const b = createBuilder(THREE);
  const T = 'truck|truck';
  b.box(T, 5.75, 0.62, 1.96, 0, 0.82, 0, { c: 0.07 });              // lower body
  b.box(T, 1.35, 0.32, 1.9, 2.2, 1.27, 0, { c: 0.06 });               // hood
  b.box(T, 2.25, 0.82, 1.86, 0.48, 1.55, 0, { c: 0.09 });             // cab
  b.box('truck|glass', 0.5, 0.62, 1.7, 1.46, 1.58, 0, { rz: 0.62, c: 0.02 });
  b.box('truck|glass', 1.96, 0.5, 1.88, 0.42, 1.62, 0, { c: 0.02 });   // side glass band
  b.box(T, 0.08, 0.6, 1.89, 0.42, 1.6, 0);                              // B pillar
  b.box(T, 2.0, 0.07, 1.84, 0.46, 1.97, 0, { c: 0.03 });              // roof
  // bed
  b.box(T, 2.3, 0.5, 0.07, -1.72, 1.37, 0.94);
  b.box(T, 2.3, 0.5, 0.07, -1.72, 1.37, -0.94);
  b.box(T, 0.07, 0.5, 1.9, -2.84, 1.37, 0);
  b.box('truck|dark', 2.2, 0.04, 1.8, -1.72, 1.14, 0);
  // bumpers, grille, lights, mirrors
  b.box('truck|dark', 0.18, 0.28, 2.0, 2.92, 0.72, 0, { c: 0.04 });
  b.box('truck|dark', 0.18, 0.22, 2.0, -2.92, 0.7, 0, { c: 0.04 });
  b.box('truck|grille', 0.04, 0.4, 1.2, 2.88, 1.08, 0);
  for (const s of [-1, 1]) {
    b.box('truck|warnWhite', 0.05, 0.14, 0.3, 2.88, 1.15, s * 0.78);
    b.box('truck|fire', 0.05, 0.3, 0.12, -2.88, 1.35, s * 0.86);
    b.box('truck|dark', 0.22, 0.16, 0.06, 1.3, 1.5, s * 1.04, { c: 0.02 });
  }
  // wheels
  for (const x of [1.82, -1.68]) for (const s of [-1, 1]) {
    b.cyl('truck|tyre', 0.39, 0.28, x, 0.39, s * 0.83, { rx: Math.PI / 2, seg: 20 });
    b.cyl('truck|rim', 0.23, 0.29, x, 0.39, s * 0.835, { rx: Math.PI / 2, seg: 16 });
    b.box('truck|dark', 1.0, 0.3, 0.1, x, 0.86, s * 0.95, { c: 0.04 });
  }
  const out = b.build(materials.m);
  return { ...out, triangles: b.triangles() };
}
