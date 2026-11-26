// @ts-nocheck
// The gather, the column and the opening's clock.
//
// The gather is the landing intro's chapter 06 (wattness-site c5c182dc, apps/mms/src/ui/intro/map/kit-site.ts packIn and
// map/timeline.ts proxyTint, baseFuse, baseNarrow, proxyRise; read there, ported here as they are): the enclosures
// slide to slots packed in a disc round the pad's center, take the column's color, fuse into a disc of it, and the
// column rises out of the disc.
//
// The column is W01's own column (stations/world/common.ts columns, columnMaterial, dischargeHex: its unit cylinder, its
// face shading and its ramp), imported, never copied, at 52.22 times W01's size: W01 stands Desert Willow 0.9 m across
// and 5.530 m tall (0.3 + 9.7 x 304.176 / 564.13, layout.grid.column.height_rule); here it is 47.0 m across and 288.8 m
// tall, the enclosures' disc. The only change is an opacity uniform on a clone of W01's material, for the fuse.
import * as THREE from 'three';
import { columns, columnMaterial, dischargeHex, DISCHARGE_RAMP } from '../world/common';

export { dischargeHex, DISCHARGE_RAMP };

// ── the intro's curves (map/timeline.ts) ─────────────────────────────────────────────────────────────────────────
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (t: number) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
export const smoothRange = (x: number, a: number, b: number) => smooth((x - a) / (b - a));
export const easeInOutCubic = (t: number) => { const x = clamp01(t); return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; };
/** Phase H on its progress `stack`: the enclosures take the column's color (0 to 0.28), a disc of that color fades in
 *  over them (0.12 to 0.30), the disc narrows to the column's foot (0.26 to 0.76) while the column rises out of it
 *  (0.24 to 0.86). */
export const proxyTint = (stack: number) => smooth(stack / 0.28);
export const baseFuse = (stack: number) => smoothRange(stack, 0.12, 0.30);
export const baseNarrow = (stack: number) => easeInOutCubic((stack - 0.26) / 0.5);
export const proxyRise = (stack: number) => easeInOutCubic((stack - 0.24) / 0.62);

// ── the packing (map/kit-site.ts packIn): boxes 6.06 m (plus the cooling unit, 6.9 m in all) by 2.44 m, long sides
//    east-west as at home, 0.3 m apart along a row and 0.35 m between rows, rows centered on the point ────────────
const BOX = { x: 6.9, z: 2.44, gx: 0.3, gz: 0.35 };
export function packIn(R: number): [number, number][] {
  const pz = BOX.z + BOX.gz;
  const k = Math.floor((2 * R - BOX.z) / pz) + 1;
  const z0 = -((k - 1) * pz) / 2;
  const out: [number, number][] = [];
  for (let i = 0; i < k; i++) {
    const z = z0 + i * pz, zz = Math.abs(z) + BOX.z / 2;
    if (zz > R) continue;
    const half = Math.sqrt(R * R - zz * zz);
    const m = Math.floor((2 * half + BOX.gx) / (BOX.x + BOX.gx));
    const w = m * BOX.x + (m - 1) * BOX.gx;
    for (let j = 0; j < m; j++) out.push([-w / 2 + BOX.x / 2 + j * (BOX.x + BOX.gx), z]);
  }
  return out;
}
/** The smallest radius (0.25 m steps from 15 m, the intro's search) that packs n enclosures. */
export function packRadius(n: number) { let r = 15; while (packIn(r).length < n) r += 0.25; return r; }

/** Slots for the enclosures: reading order (north to south, west to east) at home onto reading order in the disc, so
 *  the block keeps its arrangement; the southern lines (nearest the camera) leave first, 0 to 0.22 of the move. */
export function slotsFor(home: { x: number; z: number }[], R: number) {
  const pts = packIn(R).slice(0, home.length);
  const order = (ps: { x: number; z: number }[]) => ps.map((p, i) => ({ i, x: p.x, z: p.z }))
    .sort((a, b) => (Math.abs(a.z - b.z) > 1.0 ? a.z - b.z : a.x - b.x)).map((p) => p.i);
  const from = order(home), to = order(pts.map(([x, z]) => ({ x, z })));
  const slot = new Array(home.length);
  from.forEach((hi, k) => { const [x, z] = pts[to[k]]; slot[hi] = { x, z }; });
  const zs = home.map((h) => h.z), zMin = Math.min(...zs), zMax = Math.max(...zs);
  const delay = home.map((h) => 0.22 * (zMax - h.z) / Math.max(1e-6, zMax - zMin));
  return { slot, delay };
}

// ── the column: W01's, scaled ────────────────────────────────────────────────────────────────────────────────────
/** W01's Desert Willow column (stations/world/texas.ts): footprint 0.9 m, height on layout.grid.column.height_rule. */
export const W01_COLUMN = { r: 0.45, mapTop: 0.62 };
export const heightRule = (d: number, max: number) => 0.3 + 9.7 * d / max;
export const rampAt = (d: number, max: number) => Math.sqrt(d / max);

/** One W01 column at (x, z) on the ground, radius r and full height h, its color the ramp at t. setHeight and
 *  setOpacity pose it; the instance matrix is the only thing that changes. */
export function makeColumn({ x = 0, z = 0, r, h, color }) {
  const mat = columnMaterial();
  mat.uniforms.uOpacity = { value: 1 };
  mat.fragmentShader = mat.fragmentShader
    .replace('uniform vec3 uKey;', 'uniform vec3 uKey; uniform float uOpacity;')
    .replace('gl_FragColor = vec4(vColor * s, 1.0);', 'gl_FragColor = vec4(vColor * s, uOpacity);');
  if (!mat.fragmentShader.includes('uOpacity);')) throw new Error("W01's column shader has changed: the opacity patch did not apply");
  const mesh = columns([{ x, y: 0, z, r, h, color }], { material: mat });
  mesh.name = 'dswl-column';
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(x, 0, z), sc = new THREE.Vector3();
  let hNow = h, aNow = 1;
  const apply = () => {
    m.compose(p, q, sc.set(2 * r, Math.max(0.01, hNow), 2 * r));
    mesh.setMatrixAt(0, m); mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = aNow > 0.002;
    mat.uniforms.uOpacity.value = aNow;
    const solid = aNow >= 0.999;
    if (mat.transparent === solid) { mat.transparent = !solid; mat.depthWrite = solid; mat.needsUpdate = true; }
  };
  apply();
  return {
    mesh, material: mat, r, h, color,
    setHeight(v: number) { hNow = v; apply(); },
    setOpacity(a: number) { aNow = a; apply(); },
  };
}

// ── the opening's clock (seconds) ────────────────────────────────────────────────────────────────────────────────
/** O01 rests on the site; B gathers (4 s); H tints, fuses and rises (3.4 s); O02 rests on the column; Z climbs to the
 *  lock (2.4 s), where the cross-fade into W01 begins. */
export const T = { o01: 1.0, b0: 2.0, b1: 6.0, h1: 9.4, o02: 9.8, z0: 10.0, z1: 12.4, lock: 12.6 };
export const phaseAt = (t: number) => ({
  gather: clamp01((t - T.b0) / (T.b1 - T.b0)),
  stack: clamp01((t - T.b1) / (T.h1 - T.b1)),
  climb: clamp01((t - T.z0) / (T.z1 - T.z0)),
});
