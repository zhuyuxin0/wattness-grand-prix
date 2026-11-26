// @ts-nocheck
// Ported from landing-3d/live/kit/enclosure.js (27 Oct 2026). Plain JS under a type pass: three.js has no types here.
// The battery enclosure: a 20-ft-class steel enclosure of battery racks, about 5 MWh (chemistry not modelled).
// Local frame: metres, origin at the footprint centre on the pad, length along x, doors on +z, the
// cooling unit on the -x end, cable entry on the +x end. Generic: no maker's product is copied.
import { createBuilder } from './geo';
import { createMaterials } from './materials';

export const ENC = { L: 6.06, W: 2.44, H: 2.9, PL: 0.22, coolDepth: 0.62, plinthX0: -3.03 - 0.78, plinthX1: 3.03 + 0.34 };
const { L, W, H, PL } = ENC;
const Y0 = PL, Y1 = PL + H;

/** A louvre panel facing +z in the current frame, centred at (x, y), with real slat depth. */
function louvre(b, part, x, y, w, h, slats, lod, mat = 'louvre') {
  b.box(`${part}|${mat}`, w + 0.04, h + 0.04, 0.014, x, y, 0.007);
  b.box(`${part}|grille`, w, h, 0.01, x, y, 0.003);
  const pitch = h / slats;
  for (let i = 0; i < slats; i++) {
    const yy = y - h / 2 + pitch * (i + 0.5);
    b.box(`${part}|${mat}`, w - 0.01, 0.01, pitch * 1.25, x, yy, 0.02, { rx: -0.75 });
  }
  if (lod === 'hero') { // side frame lips
    b.box(`${part}|${mat}`, 0.018, h + 0.04, 0.035, x - w / 2 - 0.011, y, 0.018);
    b.box(`${part}|${mat}`, 0.018, h + 0.04, 0.035, x + w / 2 + 0.011, y, 0.018);
  }
}

/** A round axial fan grille facing +z in the current frame. */
function fan(b, part, x, y, d, lod) {
  const r = d / 2, seg = lod === 'hero' ? 40 : 20, tube = lod === 'hero' ? 6 : 4;
  b.cyl(`${part}|louvre`, r, 0.03, x, y, -0.005, { rx: Math.PI / 2, seg });
  b.torus(`${part}|grille`, r + 0.015, 0.03, x, y, 0.012, { seg, tube });
  for (const k of [0.3, 0.52, 0.74, 0.93]) b.torus(`${part}|grille`, r * k, 0.0055, x, y, 0.026, { seg, tube: 3 });
  for (let i = 0; i < 4; i++) b.box(`${part}|grille`, d * 0.98, 0.012, 0.01, x, y, 0.03, { rz: (i * Math.PI) / 4 });
  b.cyl(`${part}|grille`, r * 0.16, 0.05, x, y, 0.02, { rx: Math.PI / 2, seg: 16 });
  // the blades are a separate rotor (fanRotor), so they can turn: see FAN_MOUNTS and fanRotorGeometry
}

/** A fan's rotor (five blades and a hub) in its own frame: centred on the origin, facing +z, turning about z. */
export function fanRotor(b, key, d) {
  const r = d / 2;
  b.cyl(key, r * 0.15, 0.06, 0, 0, 0.0, { rx: Math.PI / 2, seg: 14 });
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5;
    b.box(key, r * 0.72, 0.15, 0.008, Math.cos(a) * r * 0.47, Math.sin(a) * r * 0.47, 0.0, { rz: a, rx: 0.35, order: 'ZXY' });
  }
}

/** The cooling unit's two fans in the enclosure frame: [x, y, z, yaw] of each rotor (its +z faces out, -x). */
export const FAN_D = 0.86;
export const FAN_RATE = 8.8; // rad/s
export const FAN_MOUNTS = [-0.55, 0.55].map((fx) => [-ENC.L / 2 - ENC.coolDepth + 0.01 - 0.004, ENC.PL + 1.86, fx, -Math.PI / 2]);
// (the cooling face's frame is turned -90 degrees about y, so its +x is the enclosure's +z and its +z the enclosure's
//  -x: a fan at face x sits at enclosure z = x)

/** One merged rotor geometry (one material) for instancing. */
export function fanRotorGeometry(THREE, d = FAN_D) {
  const b = createBuilder(THREE); b.base([0, 0, 1], false); fanRotor(b, 'rotor|galv', d); // at distance a disc facing out
  return b.byMaterial().galv;
}

function hinge(b, part, x, y) {
  b.box(`${part}|galv`, 0.05, 0.09, 0.008, x, y, 0.004);
  b.cyl(`${part}|galv`, 0.014, 0.11, x, y, 0.016, { seg: 8 });
}

/** The door bank on the long +z face. The frame's z=0 is the wall's outer face. */
function doorBank(b, part, lod) {
  const x0 = -2.8, x1 = 2.8, yb = Y0 + 0.2, yt = Y0 + 2.64, leafW = (x1 - x0) / 6;
  b.base([0, 0, 1]); // all of it sits on the door face: at distance it shades as that face (geo.ts aBase)
  b.box(`${part}|seam`, x1 - x0 + 0.02, yt - yb + 0.02, 0.008, 0, (yb + yt) / 2, 0.004);
  for (let k = 0; k < 6; k++) {
    const cx = x0 + leafW * (k + 0.5), left = k % 2 === 0;
    const lw = leafW - 0.016, lh = yt - yb - 0.016, z = 0.012;
    b.push(b.M(cx, 0, z));
    b.box(`${part}|paint`, lw, lh, 0.02, 0, (yb + yt) / 2, 0, { c: 0.006 });
    // pressed stiffening panel
    b.box(`${part}|paint`, lw - 0.16, lh * 0.36, 0.006, 0, yb + lh * 0.66, 0.012, { c: 0.003 });
    louvre(b, part, 0, yb + 0.52, lw - 0.26, 0.42, lod === 'hero' ? 8 : 6, lod);
    b.push(b.M(0, 0, 0.01));
    if (k % 2 === 1 || lod === 'hero') louvre(b, part, 0, yt - 0.3, lw - 0.26, 0.22, 4, lod);
    b.pop();
    const outer = left ? -lw / 2 + 0.02 : lw / 2 - 0.02;
    for (const hy of [0.3, 1.2, 2.1]) hinge(b, part, outer, yb + hy);
    const inner = left ? lw / 2 - 0.09 : -lw / 2 + 0.09;
    if (left) { // lever handle on its plate
      b.box(`${part}|dark`, 0.055, 0.22, 0.012, inner, yb + 1.12, 0.012);
      b.box(`${part}|galv`, 0.028, 0.15, 0.03, inner, yb + 1.1, 0.03, { c: 0.008 });
      b.box(`${part}|galv`, 0.028, 0.03, 0.05, inner, yb + 1.18, 0.018);
      // placards, no text: an arc-flash label (orange header) on the outer leaves, a hazard label (amber band) on
      // the middle one, each with a black hazard diamond and text lines. They are stuck on the pressed panel, whose
      // face is at z 0.015 here, as a stack a millimetre a layer: the white plate, then the header and the lines,
      // then the diamond on the header. Each layer's face stands clear of the one under it (they shared the panel's
      // plane before, so the depth test flipped between them as the camera drifted: the labels blinked), and each
      // layer also carries a depth offset (materials.ts) that keeps the order where depth precision runs out.
      const arc = k !== 2, hw = arc ? 0.4 : 0.34, hh = arc ? 0.3 : 0.24, py = yb + 1.6, px = -0.05, zf = 0.015;
      b.box(`${part}|warnWhite`, hw, hh, 0.0025, px, py, zf + 0.00025); // face at zf + 1.5 mm
      b.box(`${part}|${arc ? 'hazard' : 'warn'}`, hw, hh * 0.3, 0.002, px, py + hh * 0.35, zf + 0.0015); // face at zf + 2.5 mm
      for (let li = 0; li < 3; li++) b.box(`${part}|ink`, hw * (0.8 - li * 0.15), 0.014, 0.002, px - hw * li * 0.07, py + hh * 0.08 - li * hh * 0.17, zf + 0.0015);
      b.box(`${part}|ink`, 0.05, 0.05, 0.002, px - hw / 2 + 0.06, py + hh * 0.35, zf + 0.0025, { rz: Math.PI / 4 }); // face at zf + 3.5 mm
    } else {
      b.cyl(`${part}|dark`, 0.02, 0.025, inner, yb + 1.12, 0.022, { rx: Math.PI / 2, seg: 10 });
      b.box(`${part}|paint`, 0.03, lh, 0.012, -lw / 2 + 0.006, (yb + yt) / 2, 0.014); // astragal
    }
    b.pop();
  }
  // drip strip over the doors, and the unit number plate
  b.box(`${part}|paint`, x1 - x0 + 0.12, 0.035, 0.06, 0, yt + 0.06, 0.03, { c: 0.008 });
  b.box(`${part}|dark`, 0.2, 0.07, 0.006, x0 + 0.25, yt + 0.16, 0.004);
  // teal status lamp
  b.box(`${part}|dark`, 0.13, 0.13, 0.035, x1 - 0.14, yt + 0.17, 0.018, { c: 0.012 });
  b.cyl(`${part}|lamp`, 0.042, 0.035, x1 - 0.14, yt + 0.17, 0.048, { rx: Math.PI / 2, seg: 16 });
}

/** Closed or open shell, roof, corner castings, base frame and plinth. */
function shell(b, open, lod) {
  const t = 0.05;
  if (!open) {
    b.box('body|paint', L, H, W, 0, Y0 + H / 2, 0, { c: 0.018 });
  } else {
    b.box('body|paint', L, H, t, 0, Y0 + H / 2, -W / 2 + t / 2, { c: 0.012 });
    b.box('body|paint', t, H, W - 2 * t, -L / 2 + t / 2, Y0 + H / 2, 0);
    b.box('body|paint', t, H, W - 2 * t, L / 2 - t / 2, Y0 + H / 2, 0);
    b.box('front|paint', L, H, t, 0, Y0 + H / 2, W / 2 - t / 2, { c: 0.012 });
  }
  // base frame, slightly proud
  b.box('body|dark', L + 0.02, 0.17, W + 0.02, 0, Y0 + 0.085, 0, { c: 0.01 });
  // corner posts (galvanised castings top and bottom)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (const yy of [Y0 + 0.07, Y1 - 0.07]) b.box('body|galv', 0.17, 0.13, 0.17, sx * (L / 2 - 0.08), yy, sz * (W / 2 - 0.08), { c: 0.012 });
    // the posts stand 5 mm proud: only the hero is ever near enough to see them (on the others they only flicker)
    if (lod === 'hero') b.box('body|paint', 0.1, H - 0.26, 0.1, sx * (L / 2 - 0.045), Y0 + H / 2, sz * (W / 2 - 0.045), { c: 0.012 });
  }
  // plinth
  b.box('body|plinth', ENC.plinthX1 - ENC.plinthX0, PL, W + 0.42, (ENC.plinthX0 + ENC.plinthX1) / 2, PL / 2, 0, { c: 0.025 });
  // roof
  b.box('roof|paint', L + 0.08, 0.085, W + 0.08, 0, Y1 + 0.0425, 0, { c: 0.022 });
  b.push(b.M()).base([0, 1, 0]); // the ribs and lifting lugs sit on the roof's top
  for (let i = 0; i < 6; i++) b.box('roof|paint', 0.07, 0.025, W - 0.1, -2.5 + i, Y1 + 0.095, 0, { c: 0.008 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (L / 2 - 0.2), z = sz * (W / 2 - 0.17);
    b.box('roof|galv', 0.15, 0.02, 0.11, x, Y1 + 0.095, z);
    b.torus('roof|galv', 0.05, 0.015, x, Y1 + 0.16, z, { seg: lod === 'hero' ? 16 : 10, tube: 5 });
  }
  b.pop();
  b.box('roof|paint', 0.72, 0.05, 0.72, 1.55, Y1 + 0.11, 0, { c: 0.012 });
  b.box('roof|dark', 0.36, 0.08, 0.3, -2.1, Y1 + 0.12, -0.5, { c: 0.01 });
  // back face: panel seams and two small louvres
  b.push(b.M(0, 0, -W / 2, 0, Math.PI, 0)).base([0, 0, 1]);
  for (let i = 1; i < 6; i++) b.box('body|seam', 0.012, H - 0.36, 0.004, -L / 2 + (L * i) / 6, Y0 + H / 2, 0.002);
  louvre(b, 'body', -1.6, Y0 + 0.6, 0.6, 0.36, 5, lod);
  louvre(b, 'body', 1.6, Y0 + 0.6, 0.6, 0.36, 5, lod);
  b.pop();
}

/** The cooling unit bolted to the -x end. */
function coolingUnit(b, lod) {
  const d = ENC.coolDepth, cx = -L / 2 - d / 2 + 0.01, h = 2.56, yc = Y0 + 0.12 + h / 2, w = 2.24;
  b.box('cool|cool', d, h, w, cx, yc, 0, { c: 0.02 });
  b.box('cool|cool', d + 0.08, 0.06, w + 0.08, cx - 0.03, Y0 + 0.12 + h + 0.03, 0, { c: 0.015 });
  // outer face (-x): two fans above, louvre bank below
  b.push(b.M(-L / 2 - d + 0.01, 0, 0, 0, -Math.PI / 2, 0)).base([0, 0, 1]);
  fan(b, 'cool', -0.55, Y0 + 1.86, 0.86, lod);
  fan(b, 'cool', 0.55, Y0 + 1.86, 0.86, lod);
  louvre(b, 'cool', 0, Y0 + 0.78, 1.84, 0.82, lod === 'hero' ? 12 : 8, lod);
  b.box('cool|dark', 0.22, 0.06, 0.006, 0.82, Y0 + 1.3, 0.003);
  b.pop();
  // side louvres on the housing
  for (const s of [-1, 1]) {
    b.push(b.M(cx, 0, s * (w / 2), 0, s > 0 ? 0 : Math.PI, 0)).base([0, 0, 1]);
    louvre(b, 'cool', 0, Y0 + 1.25, 0.36, 1.1, 10, lod);
    b.pop();
  }
  // condensate drain
  b.cyl('cool|galv', 0.018, 0.3, cx - 0.2, Y0 + 0.02, 0.9, { seg: 8 });
}

/** Cable entry and service door on the +x end. */
function cableEnd(b, lod) {
  b.push(b.M(L / 2, 0, 0, 0, Math.PI / 2, 0)).base([0, 0, 1]); // +z of this frame = +x of the enclosure; x of frame = -z
  // service door
  const dx = 0.42, dw = 0.92, yb = Y0 + 0.2, dh = 2.36;
  b.box('cable|seam', dw + 0.02, dh + 0.02, 0.008, dx, yb + dh / 2, 0.004);
  b.box('cable|paint', dw - 0.01, dh - 0.01, 0.02, dx, yb + dh / 2, 0.016, { c: 0.006 });
  louvre(b, 'cable', dx, yb + 0.5, 0.6, 0.38, 6, lod);
  for (const hy of [0.3, 1.2, 2.05]) hinge(b, 'cable', dx + dw / 2 - 0.02, yb + hy);
  b.box('cable|dark', 0.05, 0.2, 0.012, dx - dw / 2 + 0.1, yb + 1.1, 0.024);
  b.box('cable|galv', 0.026, 0.14, 0.03, dx - dw / 2 + 0.1, yb + 1.08, 0.042, { c: 0.008 });
  b.box('cable|warnWhite', 0.18, 0.12, 0.004, dx, yb + 1.6, 0.028);
  b.box('cable|warn', 0.18, 0.04, 0.005, dx, yb + 1.64, 0.0285);
  // cable entry box with glands and conduits into the ground
  const bx = -0.62;
  b.box('cable|skid', 0.7, 0.62, 0.28, bx, Y0 + 0.86, 0.14, { c: 0.012 });
  b.box('cable|dark', 0.08, 0.1, 0.02, bx + 0.22, Y0 + 0.98, 0.29);
  for (let i = 0; i < 3; i++) {
    const x = bx - 0.22 + i * 0.22;
    b.cyl('cable|dark', 0.05, 0.05, x, Y0 + 0.53, 0.14, { seg: 8 });
    b.cyl('cable|galv', 0.042, Y0 + 0.5, x, (Y0 + 0.5) / 2, 0.14, { seg: lod === 'hero' ? 12 : 8 });
  }
  // disconnect switch with rotary handle
  b.box('cable|xfmr', 0.32, 0.42, 0.2, bx, Y0 + 1.55, 0.1, { c: 0.012 });
  b.box('cable|dark', 0.05, 0.16, 0.05, bx, Y0 + 1.55, 0.22);
  // lamp above the door
  b.box('cable|dark', 0.14, 0.08, 0.1, dx, yb + dh + 0.15, 0.05, { c: 0.01 });
  b.pop();
}

/** Inside: racks along both long walls with a centre aisle; cooling plenum at -x; fire and BMS at +x. */
function interior(b, lod) {
  const P = 'interior';
  b.box(`${P}|floor`, L - 0.12, 0.04, W - 0.12, 0, Y0 + 0.02, 0);
  // checker plate lines on the floor
  for (let i = -5; i <= 5; i++) b.box(`${P}|seam`, 0.01, 0.002, W - 0.2, i * 0.5, Y0 + 0.041, 0);
  const racksX = [-2.15, -1.27, -0.39, 0.49, 1.37];
  const modW = 0.74, modH = 0.2, modD = 0.54, pitch = 0.232, nMod = 9;
  for (const side of [-1, 1]) {
    const zc = side * (W / 2 - 0.06 - modD / 2 - 0.04); // rack centre z
    const face = -side; // modules face the aisle
    for (const [ri, rx] of racksX.entries()) {
      // rack frame
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(`${P}|rack`, 0.04, 2.28, 0.04, rx + sx * (modW / 2 + 0.03), Y0 + 0.04 + 1.14, zc + sz * (modD / 2), { c: 0.006 });
      b.box(`${P}|rack`, modW + 0.1, 0.05, modD + 0.04, rx, Y0 + 2.36, zc, { c: 0.008 });
      b.box(`${P}|rack`, modW + 0.1, 0.08, modD + 0.04, rx, Y0 + 0.08, zc);
      for (let k = 0; k < nMod; k++) {
        const y = Y0 + 0.16 + pitch * k + modH / 2;
        if (side === 1 && ri === 2 && k === 5) continue; // the pulled module's empty slot
        b.box(`${P}|module`, modW, modH, modD, rx, y, zc, { c: 0.008 });
        b.box(`${P}|rack`, modW + 0.06, 0.012, modD, rx, y - modH / 2 - 0.008, zc);
        const fz = zc + face * (modD / 2 + 0.004);
        b.box(`${P}|moduleEnd`, modW - 0.04, modH - 0.04, 0.008, rx, y, fz);
        b.box(`${P}|galv`, 0.06, 0.03, 0.025, rx - 0.28, y, fz + face * 0.012);
        b.box(`${P}|galv`, 0.06, 0.03, 0.025, rx + 0.28, y, fz + face * 0.012);
        b.box(`${P}|led`, 0.016, 0.016, 0.01, rx + 0.18, y + 0.05, fz + face * 0.006);
        b.box(`${P}|warnWhite`, 0.14, 0.035, 0.004, rx - 0.08, y + 0.05, fz + face * 0.004);
        // series links: copper busbars from this module to the next, alternating sides
        if (k < nMod - 1) b.box(`${P}|copper`, 0.035, pitch + 0.02, 0.008, rx + (k % 2 ? -0.33 : 0.33), y + pitch / 2, fz + face * 0.008);
        // rear: connectors and the rack's DC cables
        const bz = zc - face * (modD / 2 + 0.004);
        b.box(`${P}|copper`, 0.05, 0.05, 0.02, rx - 0.22, y, bz);
        b.box(`${P}|copper`, 0.05, 0.05, 0.02, rx + 0.22, y, bz);
      }
      // rack controller (high-voltage box) at the bottom front, with a small teal display
      const fz = zc + face * (modD / 2 + 0.02);
      b.box(`${P}|bms`, modW - 0.06, 0.07, 0.04, rx, Y0 + 0.12, fz, { c: 0.006 });
      // rear main busbar and cables
      const bz = zc - face * (modD / 2 + 0.03);
      b.box(`${P}|copper`, 0.05, 2.1, 0.012, rx + 0.3, Y0 + 1.2, bz);
      b.box(`${P}|dark`, 0.045, 2.1, 0.045, rx - 0.3, Y0 + 1.2, bz);
    }
    // cable tray along the ceiling above each row
    const tz = side * (W / 2 - 0.4);
    b.box(`ceiling|galv`, 4.8, 0.012, 0.3, -0.4, Y1 - 0.32, tz);
    for (const s2 of [-1, 1]) b.box(`ceiling|galv`, 4.8, 0.06, 0.012, -0.4, Y1 - 0.295, tz + s2 * 0.15);
    for (let i = 0; i < 10; i++) b.box(`ceiling|galv`, 0.02, 0.012, 0.3, -2.6 + i * 0.48, Y1 - 0.31, tz);
    b.box(`ceiling|dark`, 4.6, 0.05, 0.16, -0.4, Y1 - 0.29, tz);
  }
  // air duct down the aisle ceiling from the cooling unit, with diffusers
  b.box(`ceiling|duct`, 5.2, 0.24, 0.5, -0.35, Y1 - 0.2, 0, { c: 0.02 });
  for (let i = 0; i < 4; i++) b.box(`ceiling|grille`, 0.36, 0.01, 0.3, -2.1 + i * 1.2, Y1 - 0.325, 0);
  // cooling plenum on the -x end wall
  b.box(`${P}|cool`, 0.18, 2.2, 1.0, -L / 2 + 0.14, Y0 + 1.3, 0, { c: 0.015 });
  for (let i = 0; i < 9; i++) b.box(`${P}|grille`, 0.02, 0.012, 0.86, -L / 2 + 0.235, Y0 + 0.65 + i * 0.16, 0);
  // fire suppression cabinet (+x end, back side) with aerosol units and detectors on the ceiling
  b.box(`${P}|fire`, 0.42, 1.0, 0.32, L / 2 - 0.32, Y0 + 1.45, -0.62, { c: 0.02 });
  b.box(`${P}|warnWhite`, 0.2, 0.12, 0.004, L / 2 - 0.32, Y0 + 1.6, -0.458);
  b.cyl(`${P}|galv`, 0.02, 1.5, L / 2 - 0.32, Y0 + 2.2, -0.62, { seg: 8 });
  for (const x of [-1.6, 0.6]) {
    b.cyl(`ceiling|fire`, 0.09, 0.32, x, Y1 - 0.42, 0, { rz: Math.PI / 2, seg: 16 });
    b.cyl(`ceiling|warnWhite`, 0.07, 0.04, x + 0.6, Y1 - 0.04, 0.35, { seg: 14 });
  }
  // battery management cabinet (+x end, front side) with a teal screen
  b.box(`${P}|bms`, 0.5, 1.95, 0.5, L / 2 - 0.32, Y0 + 1.06, 0.62, { c: 0.015 });
  b.box(`${P}|seam`, 0.004, 1.85, 0.46, L / 2 - 0.572, Y0 + 1.06, 0.62);
  b.box(`${P}|screen`, 0.004, 0.18, 0.26, L / 2 - 0.574, Y0 + 1.5, 0.62);
  for (let i = 0; i < 4; i++) b.box(`${P}|led`, 0.004, 0.02, 0.02, L / 2 - 0.574, Y0 + 1.3, 0.52 + i * 0.065);
}

/** The pulled module: open tray with two rows of prismatic cells and copper links; the lid is separate. */
function moduleWithCells(b, lod) {
  const w = 0.74, h = 0.2, d = 0.54, t = 0.012;
  b.box('module|module', w, t, d, 0, t / 2, 0);
  b.box('module|moduleEnd', w, h, t, 0, h / 2, d / 2 - t / 2);
  b.box('module|moduleEnd', w, h, t, 0, h / 2, -d / 2 + t / 2);
  b.box('module|module', t, h, d, -w / 2 + t / 2, h / 2, 0);
  b.box('module|module', t, h, d, w / 2 - t / 2, h / 2, 0);
  // front face hardware
  b.box('module|galv', 0.06, 0.03, 0.025, -0.28, h / 2, d / 2 + 0.012);
  b.box('module|galv', 0.06, 0.03, 0.025, 0.28, h / 2, d / 2 + 0.012);
  b.box('module|led', 0.016, 0.016, 0.01, 0.18, h / 2 + 0.05, d / 2 + 0.004);
  // cells: 8 along x, two rows along z
  const n = 8, cw = (w - 0.06) / n, cd = (d - 0.07) / 2 - 0.006, ch = 0.165;
  for (let r = 0; r < 2; r++) for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.03 + cw * (i + 0.5), z = (r ? 1 : -1) * (cd / 2 + 0.006);
    b.box('module|cell', cw - 0.006, ch, cd, x, t + ch / 2, z, { c: 0.006 });
    b.box('module|cellTop', cw - 0.012, 0.006, cd - 0.012, x, t + ch + 0.002, z);
    for (const s of [-1, 1]) b.cyl('module|galv', 0.011, 0.014, x, t + ch + 0.01, z + s * cd * 0.3, { seg: 10 });
    b.box('module|warnWhite', cw - 0.02, 0.003, 0.02, x, t + ch + 0.006, z);
  }
  // copper links across cell pairs, and the module's cell-monitoring board
  for (let r = 0; r < 2; r++) for (let i = 0; i < n - 1; i += 1) {
    const x = -w / 2 + 0.03 + cw * (i + 1), z = (r ? 1 : -1) * (cd / 2 + 0.006) + ((i % 2 ? 1 : -1) * cd * 0.3);
    b.box('module|copper', cw * 0.9, 0.004, 0.034, x, t + ch + 0.019, z);
  }
  b.box('module|bms', 0.5, 0.006, 0.05, 0, t + ch + 0.024, 0);
  b.box('module|led', 0.012, 0.004, 0.012, 0.2, t + ch + 0.028, 0);
}

function lid(b) {
  b.box('lid|module', 0.75, 0.018, 0.55, 0, 0.009, 0, { c: 0.005 });
  for (let i = 0; i < 3; i++) b.box('lid|moduleEnd', 0.66, 0.006, 0.04, 0, 0.02, -0.18 + i * 0.18);
}

/** Per-material geometries of a closed enclosure (for InstancedMesh). */
export function enclosureInstanceGeometries(THREE, { lod = 'inst' } = {}) {
  const b = createBuilder(THREE);
  shell(b, false, lod);
  b.push(b.M(0, 0, W / 2)); doorBank(b, 'front', lod); b.pop();
  coolingUnit(b, lod);
  cableEnd(b, lod);
  return { geometries: b.byMaterial(), triangles: b.triangles() };
}

/** Full-detail enclosure with an interior and explode(t). */
export function buildEnclosure(THREE, opts = {}) {
  const { lod = 'hero' } = opts;
  const materials = opts.materials || createMaterials(THREE, opts.theme || 'dark');
  const b = createBuilder(THREE);
  shell(b, true, lod);
  b.push(b.M(0, 0, W / 2)); doorBank(b, 'front', lod); b.pop();
  coolingUnit(b, lod);
  cableEnd(b, lod);
  interior(b, lod);
  const mb = createBuilder(THREE); moduleWithCells(mb, lod);
  const lb = createBuilder(THREE); lid(lb);
  const built = b.build(materials.m);
  const group = built.group; group.name = 'enclosure';
  const parts = built.parts;
  // ceiling services (trays, duct, aerosol units, detectors) lift with the roof
  parts.ceiling.position.y = 0; parts.roof.add(parts.ceiling);
  // the cooling unit's fan rotors: their own meshes, turned by spin(seconds)
  const rotorGeo = fanRotorGeometry(THREE);
  const rotors = FAN_MOUNTS.map(([x, y, z, yaw], i) => {
    const holder = new THREE.Group(); holder.position.set(x, y, z); holder.rotation.y = yaw;
    const r = new THREE.Mesh(rotorGeo, materials.m.galv); r.castShadow = true; r.receiveShadow = true; r.name = `fanRotor${i}`;
    holder.add(r); parts.cool.add(holder); return r;
  });
  const mod = mb.build(materials.m); const lidB = lb.build(materials.m);
  const modGroup = new THREE.Group(); modGroup.name = 'pulledModule'; modGroup.add(mod.group);
  const lidGroup = new THREE.Group(); lidGroup.name = 'lid'; lidGroup.add(lidB.group); modGroup.add(lidGroup);
  group.add(modGroup);
  const triangles = b.triangles() + mb.triangles() + lb.triangles();

  // the front wall's own material copies, so it can fade without touching the other enclosures
  const frontMats = [];
  parts.front.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone(); materials.farDetail?.(o.material); // a clone drops the patch: put it back
    o.material.userData.baseOpacity = 1; frontMats.push(o.material);
  });

  // ghost of the front wall: outlines plus a faint fill, shown once it has slid out
  const ghost = ghostWall(THREE, opts.ghostColor || '#cfd6de');
  ghost.position.z = W / 2 - 0.025; parts.front.add(ghost);

  // guide lines: roof seat corners -> roof corners; module seat -> module (teal)
  const guideGeo = new THREE.BufferGeometry();
  guideGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 2 * 12), 3));
  const guideMat = new THREE.LineBasicMaterial({ color: opts.guideColor || '#2ec7a6', transparent: true, opacity: 0, depthWrite: false });
  const guides = new THREE.LineSegments(guideGeo, guideMat); guides.name = 'guides'; guides.frustumCulled = false;
  guides.userData.overlay = true; group.add(guides);

  const seat = { x: 0.49 - 0.88, y: Y0 + 0.16 + 0.232 * 5, z: W / 2 - 0.06 - 0.27 - 0.04 };
  const pulled = { x: 0.15, y: Y0 + 1.05, z: W / 2 + 1.05 };
  // the pulled module stands on a small service cart so it does not float
  const cart = createBuilder(THREE);
  cart.box('cart|dark', 0.84, 0.04, 0.62, 0, -0.03, 0, { c: 0.01 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cart.box('cart|galv', 0.03, pulled.y - 0.08, 0.03, sx * 0.38, -0.05 - (pulled.y - 0.08) / 2, sz * 0.27);
  cart.box('cart|dark', 0.84, 0.03, 0.62, 0, -pulled.y + 0.2, 0, { c: 0.008 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cart.cyl('cart|tyre', 0.05, 0.035, sx * 0.36, -pulled.y + 0.05, sz * 0.25, { rz: Math.PI / 2, seg: 12 });
  const cartB = cart.build(materials.m); modGroup.add(cartB.group); cartB.group.visible = false;

  const anchors = {
    doors: new THREE.Vector3(1.38, Y0 + 1.95, W / 2 + 0.03),
    cooling: new THREE.Vector3(-L / 2 - ENC.coolDepth, Y0 + 1.86, 0.55),
    racks: new THREE.Vector3(-1.27, Y0 + 2.2, -0.6),
    module: new THREE.Vector3(),
    cells: new THREE.Vector3(),
    fire: new THREE.Vector3(L / 2 - 0.32, Y0 + 1.9, -0.62),
    bms: new THREE.Vector3(L / 2 - 0.32, Y0 + 2.05, 0.62),
    roof: new THREE.Vector3(0, Y1 + 0.1, 0),
  };
  const ss = (a, b2, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b2 - a))); return t * t * (3 - 2 * t); };

  function explode(t) {
    t = Math.min(1, Math.max(0, t));
    parts.roof.position.y = 2.2 * ss(0, 0.7, t);
    parts.front.position.z = 1.6 * ss(0.15, 0.85, t);
    const fade = 1 - ss(0.2, 0.75, t);
    for (const m of frontMats) {
      m.transparent = fade < 0.999; m.opacity = fade; m.depthWrite = fade > 0.5;
    }
    parts.front.children.forEach((c) => { if (c.isMesh) { c.visible = fade > 0.02; c.castShadow = fade > 0.5; } });
    ghost.visible = t > 0.2; ghost.children.forEach((c) => { c.material.opacity = c.userData.base * ss(0.2, 0.9, t); });
    parts.interior.visible = t > 0.001; parts.ceiling.visible = t > 0.001;
    const mt = ss(0.4, 1, t);
    modGroup.visible = t > 0.001;
    modGroup.position.set(seat.x + (pulled.x - seat.x) * mt, seat.y + (pulled.y - seat.y) * mt, seat.z + (pulled.z - seat.z) * mt);
    lidGroup.position.y = 0.2 + 0.42 * ss(0.6, 1, t);
    cartB.group.visible = mt > 0.98;
    anchors.module.set(modGroup.position.x + 0.37, modGroup.position.y + 0.2, modGroup.position.z + 0.27);
    anchors.cells.set(modGroup.position.x - 0.1, modGroup.position.y + 0.19, modGroup.position.z - 0.05);
    // guide lines
    const p = guideGeo.attributes.position.array; let i = 0;
    const put = (a, c) => { p.set(a, i); p.set(c, i + 3); i += 6; };
    const ry = parts.roof.position.y;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put([sx * L / 2, Y1, sz * W / 2], [sx * L / 2, Y1 + ry, sz * W / 2]);
    const fz = parts.front.position.z;
    for (const sx of [-1, 1]) put([sx * L / 2, Y0 + 0.01, W / 2], [sx * L / 2, Y0 + 0.01, W / 2 + fz]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put([seat.x + sx * 0.37, seat.y - 0.1, seat.z + sz * 0.27], [modGroup.position.x + sx * 0.37, modGroup.position.y, modGroup.position.z + sz * 0.27]);
    guideGeo.attributes.position.needsUpdate = true; guideGeo.setDrawRange(0, i / 3);
    guideMat.opacity = 0.9 * ss(0.05, 0.4, t);
    guides.visible = t > 0.01;
  }
  explode(0);

  function setGhostColor(hex) { ghost.children.forEach((c) => c.material.color.set(hex)); }
  /** Turn the fans: about 1.4 turns a second (a still frame shows no blur), the two a little out of phase. */
  function spin(seconds) { rotors.forEach((r, i) => { r.rotation.z = seconds * FAN_RATE * (1 + 0.07 * i) + i * 0.9; }); }
  spin(0);
  return { group, parts: { ...parts, module: modGroup, lid: lidGroup, guides, ghost, rotors }, anchors, explode, spin, triangles, setGhostColor, materials, dims: ENC };
}

/** Outline + faint fill of the front wall (in its own frame: z=0 is the wall's mid-plane). */
function ghostWall(THREE, color) {
  const g = new THREE.Group(); g.name = 'frontGhost';
  const pts = [];
  const rect = (x0, y0, x1, y1, z = 0.03) => { pts.push(x0, y0, z, x1, y0, z, x1, y0, z, x1, y1, z, x1, y1, z, x0, y1, z, x0, y1, z, x0, y0, z); };
  rect(-L / 2, Y0, L / 2, Y1, 0.03);
  rect(-L / 2, Y0, L / 2, Y1, -0.03);
  const x0 = -2.8, yb = Y0 + 0.2, yt = Y0 + 2.64, lw = 5.6 / 6;
  for (let k = 0; k < 6; k++) {
    rect(x0 + lw * k + 0.008, yb, x0 + lw * (k + 1) - 0.008, yt, 0.045);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lm = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false });
  const lines = new THREE.LineSegments(lg, lm); lines.userData.base = 0.42; lines.userData.overlay = true;
  const fill = new THREE.Mesh(new THREE.BoxGeometry(L, H, 0.05), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false }));
  fill.position.y = Y0 + H / 2; fill.userData.base = 0.05; fill.userData.overlay = true;
  g.add(fill, lines);
  return g;
}

/** A ghosted whole enclosure (outlines + faint fill), for neighbours out of focus. */
export function ghostEnclosure(THREE, color = '#cfd6de', { fill = 0.06, line = 0.42 } = {}) {
  const g = new THREE.Group(); g.name = 'ghostEnclosure';
  const pts = [];
  const seg = (a, b) => pts.push(...a, ...b);
  const box = (x0, y0, z0, x1, y1, z1) => {
    const c = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => seg(c[a], c[b]));
  };
  box(-L / 2, Y0, -W / 2, L / 2, Y1, W / 2);
  box(-L / 2 - ENC.coolDepth, Y0 + 0.12, -1.12, -L / 2, Y0 + 2.68, 1.12);
  box(ENC.plinthX0, 0, -W / 2 - 0.21, ENC.plinthX1, PL, W / 2 + 0.21);
  const x0 = -2.8, yb = Y0 + 0.2, yt = Y0 + 2.64, lw = 5.6 / 6, z = W / 2 + 0.01;
  for (let k = 0; k <= 6; k++) seg([x0 + lw * k, yb, z], [x0 + lw * k, yt, z]);
  seg([x0, yb, z], [-x0, yb, z]); seg([x0, yt, z], [-x0, yt, z]);
  for (let k = 0; k < 6; k++) { const cx = x0 + lw * (k + 0.5), hw = (lw - 0.26) / 2; seg([cx - hw, yb + 0.31, z], [cx + hw, yb + 0.31, z]); seg([cx - hw, yb + 0.73, z], [cx + hw, yb + 0.73, z]); }
  for (let i = 1; i < 6; i++) seg([-L / 2 + (L * i) / 6, Y0 + 0.18, -W / 2 - 0.01], [-L / 2 + (L * i) / 6, Y1 - 0.18, -W / 2 - 0.01]);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: line, depthWrite: false }));
  const fillM = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fill, depthWrite: false }));
  fillM.position.y = Y0 + H / 2;
  lines.userData.overlay = fillM.userData.overlay = true;
  g.add(fillM, lines);
  return g;
}
