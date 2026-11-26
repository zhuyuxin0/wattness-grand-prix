// @ts-nocheck
// Ported from landing-3d/live/kit/pcs.js (27 Oct 2026). Plain JS under a type pass: three.js has no types here.
// Power conversion skid (about 4 MW): inverter cabinet plus medium-voltage transformer and ring main unit
// on a steel skid. Local frame: origin at the footprint centre on the pad, long axis along z, the
// inverter at -z, the transformer at +z. Generic.
import { createBuilder } from './geo';

export const PCS = { L: 4.7, W: 2.3 };
const PCS_FAN_X = [-0.48, 0.48];
/** The roof fans' rotors in the skid frame: [x, y, z, rx] (rx turns the rotor's +z up; it turns about y). */
export const PCS_FAN_MOUNTS = PCS_FAN_X.map((x) => [x, 0.46 + 2.3 + 0.07 + 0.12, -PCS.L / 2 + 0.95, -Math.PI / 2]);
export const PCS_FAN_D = 0.6;

function louvreBank(b, x, y, w, h, n, face) {
  // face: +1 on the +x side, -1 on the -x side; panel lies in the y-z plane
  b.box('pcs|louvre', 0.014, h + 0.04, w + 0.04, x + face * 0.007, y, 0);
  const pitch = h / n;
  for (let i = 0; i < n; i++) b.box('pcs|louvre', pitch * 1.25, 0.01, w - 0.01, x + face * 0.02, y - h / 2 + pitch * (i + 0.5), 0, { rz: face * 0.75 });
}

export function pcsGeometries(THREE, { lod = 'inst' } = {}) {
  const b = createBuilder(THREE);
  const L = PCS.L;
  // plinth and steel skid
  b.box('pcs|plinth', 2.6, 0.2, L + 0.3, 0, 0.1, 0, { c: 0.02 });
  for (const s of [-1, 1]) b.box('pcs|skidFrame', 0.16, 0.24, L, s * 1.02, 0.32, 0, { c: 0.01 });
  for (let i = 0; i < 5; i++) b.box('pcs|skidFrame', 2.0, 0.14, 0.14, 0, 0.3, -L / 2 + 0.2 + i * ((L - 0.4) / 4));
  b.box('pcs|skidFrame', 2.2, 0.02, L - 0.1, 0, 0.45, 0);
  // inverter cabinet
  const iz = -L / 2 + 0.95, ih = 2.3, iy = 0.46 + ih / 2;
  b.box('pcs|skid', 2.0, ih, 1.7, 0, iy, iz, { c: 0.016 });
  b.box('pcs|skid', 2.08, 0.07, 1.78, 0, 0.46 + ih + 0.035, iz, { c: 0.012 });
  for (const s of [-1, 1]) {
    b.push(b.M(s * 1.0, 0, iz)).base([s, 0, 0], false); // all of it sits on the cabinet's side (geo.ts aBase); dark, so no fade to the paint
    // two doors with seams, louvres low and high, handles
    b.box('pcs|louvre', 0.008, ih - 0.24, 1.58, 0, iy, 0);
    for (const dz of [-0.4, 0.4]) {
      b.box('pcs|skid', 0.02, ih - 0.27, 0.77, s * 0.012, iy, dz, { c: 0.005 });
      b.push(b.M(s * 0.022, 0, dz));
      louvreBank(b, 0, 0.46 + 0.62, 0.54, 0.62, 7, s);
      louvreBank(b, 0, 0.46 + ih - 0.42, 0.54, 0.3, 4, s);
      b.box('pcs|galv', 0.03, 0.14, 0.03, s * 0.02, iy, (dz < 0 ? 1 : -1) * 0.3, { c: 0.008 });
      b.pop();
    }
    // operator panel with a lit teal screen, and the DC cable entry: copper glands along the base
    b.box('pcs|dark', 0.02, 0.2, 0.26, s * 0.03, 0.46 + 1.62, -0.4);
    b.box('pcs|screen', 0.006, 0.12, 0.18, s * 0.042, 0.46 + 1.64, -0.4);
    b.box('pcs|copper', 0.03, 0.05, 1.3, s * 0.04, 0.6, 0);
    for (let i = 0; i < 6; i++) b.cyl('pcs|copper', 0.035, 0.06, s * 0.05, 0.53, -0.55 + i * 0.22, { rz: Math.PI / 2, seg: 10 });
    b.pop();
  }
  // teal lamp and a placard on the -z end
  b.push(b.M()).base([0, 0, -1], false);
  b.box('pcs|dark', 0.08, 0.08, 0.04, 0.75, 0.46 + ih - 0.12, iz - 0.86, { c: 0.01 });
  b.cyl('pcs|lamp', 0.04, 0.035, 0.75, 0.46 + ih - 0.12, iz - 0.885, { rx: Math.PI / 2, seg: 14 });
  b.box('pcs|warnWhite', 0.24, 0.16, 0.004, 0, 0.46 + 1.5, iz - 0.852);
  b.box('pcs|warn', 0.24, 0.05, 0.005, 0, 0.46 + 1.56, iz - 0.853);
  b.base([0, 1, 0], false); // the lifting lugs and the fans sit on the cabinet's roof
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.torus('pcs|galv', 0.045, 0.014, sx * 0.85, 0.46 + ih + 0.1, iz + sz * 0.7, { seg: 10, tube: 4 });
  // two exhaust fans on the cabinet roof: shroud, grille ring and bars (the rotors are separate: PCS_FAN_MOUNTS)
  for (const fx of PCS_FAN_X) {
    const yt = 0.46 + ih + 0.07;
    b.cyl('pcs|dark', 0.34, 0.2, fx, yt + 0.1, iz, { seg: 20, open: true });
    b.torus('pcs|galv', 0.34, 0.02, fx, yt + 0.2, iz, { rx: Math.PI / 2, seg: 20, tube: 4 });
    for (let i = 0; i < 2; i++) b.box('pcs|galv', 0.66, 0.012, 0.02, fx, yt + 0.2, iz, { ry: (i * Math.PI) / 2 });
    b.cyl('pcs|louvre', 0.33, 0.01, fx, yt + 0.01, iz, { seg: 20 });
  }
  b.pop();
  // LV duct to the transformer
  b.box('pcs|skid', 0.7, 0.5, 0.7, 0, 0.46 + 1.7, iz + 1.15, { c: 0.01 });
  // MV transformer with radiator fins
  const tz = L / 2 - 1.15, th = 1.55, ty = 0.46 + th / 2;
  b.box('pcs|xfmr', 1.3, th, 1.25, 0, ty, tz, { c: 0.02 });
  b.box('pcs|xfmr', 1.4, 0.06, 1.35, 0, 0.46 + th + 0.03, tz, { c: 0.012 });
  for (const s of [-1, 1]) { // the radiator fins and their headers, on either side of the tank
    b.push(b.M()).base([s, 0, 0], false);
    for (let i = 0; i < 8; i++) b.box('pcs|xfmr', 0.34, 1.12, 0.028, s * 0.82, ty - 0.04, tz - 0.48 + i * 0.137);
    b.box('pcs|xfmr', 0.36, 0.06, 1.1, s * 0.82, ty + 0.55, tz); b.box('pcs|xfmr', 0.36, 0.06, 1.1, s * 0.82, ty - 0.62, tz);
    b.pop();
  }
  b.push(b.M()).base([0, 1, 0], false); // the bushings on the tank's lid
  for (let i = 0; i < 3; i++) {
    b.cyl('pcs|polymer', 0.045, 0.32, -0.35 + i * 0.35, 0.46 + th + 0.2, tz + 0.3, { seg: 10 });
    for (let k = 0; k < 3; k++) b.cyl('pcs|polymer', 0.075, 0.02, -0.35 + i * 0.35, 0.46 + th + 0.1 + k * 0.08, tz + 0.3, { seg: 12 });
    b.cyl('pcs|copper', 0.04, 0.06, -0.35 + i * 0.35, 0.46 + th + 0.38, tz + 0.3, { seg: 10 });
  }
  b.pop();
  b.box('pcs|xfmr', 0.9, 0.5, 0.2, 0, 0.46 + th - 0.1, tz + 0.55, { c: 0.01 });
  b.box('pcs|dark', 0.3, 0.18, 0.06, 0.4, ty, tz - 0.66);
  // ring main unit at the +z end
  b.box('pcs|xfmr', 1.4, 1.35, 0.42, 0, 0.46 + 0.675, L / 2 - 0.22, { c: 0.012 });
  b.push(b.M()).base([0, 0, 1], false);
  b.box('pcs|seam', 1.2, 1.1, 0.004, 0, 0.46 + 0.7, L / 2 - 0.008);
  b.box('pcs|warnWhite', 0.18, 0.12, 0.004, -0.3, 0.46 + 1.0, L / 2 - 0.004);
  b.pop();
  return { geometries: b.byMaterial(), triangles: b.triangles() };
}
