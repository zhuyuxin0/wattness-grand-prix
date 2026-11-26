// The grid stations' share of the venue: the night rig, the graphite apron and plinths, the track with its LED
// strips, limit lines and comets, the pole lights, and the few marks the grid frames draw (glows, emissive screens,
// plate liveries). Built from the kit's materials, textures and lines; nothing here retones the stage.
import * as THREE from 'three';
import { createMaterials } from '../../kit/materials';
import { padTex, gravelTex, radialTex, roughnessTex } from '../../kit/textures';
import { ensureBase } from '../../kit/geo';
import { line, lines, comets, setLineResolution, tickPulses } from './lines';
import { roundRect, lin } from '../../kit/region/geo';
import { exactColor } from '../../kit/tone';
import { GrabPass, glassMaterial } from '../../kit/hedge/fields';
import { assignLayers, OVERLAY, type CameraPose, type Vec3, type WorldStage } from '../../lib/stage';
import type { FrameContext } from '../types';

export const HEX = {
  sky: '#101315', apron: '#14171a', plinth: '#1f2429', idle: '#2b3036', ink: '#969ca3', text: '#e6e8ea', strong: '#f6f7f8',
  teal: '#2ec7a6', bnb: '#F0B90B', orange: '#eb6834', refused: '#e5534b', charge: '#7f9cc0', armA: '#2c60de', armB: '#d95926',
  armC: '#9085e9', limit: '#3a4148', tungsten: '#ffcf8f', brass: '#b8935a', pole: '#dfe8f5',
} as const;

export type Materials = ReturnType<typeof createMaterials>;

/** The camera from a storyboard position and target (setCamera takes azimuth, down-angle and distance). */
export function poseFrom(position: Vec3, target: Vec3, vfov: number, shift: [number, number] = [0, 0]): CameraPose {
  const dx = position[0] - target[0], dy = position[1] - target[1], dz = position[2] - target[2];
  const dist = Math.hypot(dx, dy, dz);
  return { target, az: (Math.atan2(dx, -dz) * 180) / Math.PI, el: (Math.asin(dy / dist) * 180) / Math.PI, dist, vfov, shift };
}

/** The storyboard's night: graphite sky and ground, a cool moon as the key, a dim cool fill; linear fog on lit
 *  materials from near to far meters (the long views). */
export function nightRig(stage: WorldStage, fog?: [number, number]) {
  // the ground disc past the apron takes the fog's color, so the far apron meets the horizon without a band
  stage.setBackdrop({ top: HEX.sky, horizon: '#1f2429', bottom: HEX.apron, glow: HEX.idle, ground: '#1f2429' });
  stage.setLight({ key: { color: '#93a8d4', intensity: 0.32 }, rim: { color: '#7f95c0', intensity: 0.22 },
    fill: { sky: '#46597d', ground: '#15130f', intensity: 0.42 }, env: 0.06, shadow: 0.16 });
  stage.scene.fog = fog ? new THREE.Fog(exactColor(THREE, '#1f2429'), fog[0], fog[1]) : null;
}

/** A lit concrete surface: the kit's sealed-concrete map (joints every `joint` m) in an albedo that lands near the
 *  graphite palette under the venue's own lights. */
export function concrete(color: string, { joint = 6, rough = 0.88, seed = 21 } = {}) {
  const map = padTex(THREE, { joint, seed });
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), map, roughness: rough, metalness: 0.0, roughnessMap: roughnessTex(THREE, { lo: 0.7, hi: 1, metres: 3, seed: seed + 2 }) });
}

/** The apron: one graphite slab under the whole venue (the diagram's frame, 1040 x 640 m). */
export function apron(x0 = -520, x1 = 520, z0 = -320, z1 = 320) {
  const mat = concrete('#5a616a', { joint: 6, rough: 0.9 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), mat);
  m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); m.receiveShadow = true; m.name = 'apron';
  return m;
}

export interface Footprint { x0: number; z0: number; x1: number; z1: number; corner_m: number }

/** A plinth: the diagram's box as a slab 0.12 m proud of the apron with a 0.35 m chamfered rim and a hairline LED
 *  round its top edge (the rim's color: idle, live teal or the gold boxes' BNB yellow). */
export function plinth(fp: Footprint, { led = HEX.idle as string, ledA = 0.9, top = '#666e78', glow = 0 } = {}) {
  const g = new THREE.Group(); g.name = 'plinth';
  const H = 0.12, rim = 0.35;
  const w = fp.x1 - fp.x0, d = fp.z1 - fp.z0, cx = (fp.x0 + fp.x1) / 2, cz = (fp.z0 + fp.z1) / 2;
  const inner = roundRect(cx, cz, w - 2 * rim, d - 2 * rim, Math.max(0.5, fp.corner_m - rim), 10) as [number, number][];
  const shape = new THREE.Shape(inner.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.001, bevelEnabled: true, bevelThickness: H, bevelSize: rim, bevelOffset: 0, bevelSegments: 1, curveSegments: 10 });
  geo.rotateX(-Math.PI / 2); // the shape's y becomes -z (north), its depth goes up
  const slab = new THREE.Mesh(geo, concrete(top, { joint: 4, rough: 0.82, seed: 33 }));
  slab.position.y = 0.0; slab.receiveShadow = true; slab.castShadow = false; slab.name = 'plinth|slab';
  g.add(slab);
  // the LED hairline on the top edge, where the chamfer starts
  const ring = roundRect(cx, cz, w - 2 * rim, d - 2 * rim, Math.max(0.5, fp.corner_m - rim), 10) as [number, number][];
  const pts = ring.map(([x, z]) => [x, H + 0.012, z] as Vec3);
  const hair = line(pts, { color: led, width: 1.4, glow: glow > 0 ? 7 : 0, glowA: glow, opacity: ledA, closed: true, reveal: false, renderOrder: 4 });
  hair.userData.noAO = true;
  g.add(hair);
  return g;
}

/** The height of the venue's floor at (x, z): a plinth top where a footprint holds the point (its chamfer ramps it
 *  down to the apron), the apron elsewhere. */
export function floorAt(fps: readonly Footprint[], x: number, z: number) {
  let y = 0;
  for (const f of fps) {
    const dx = Math.max(f.x0 - x, x - f.x1, 0), dz = Math.max(f.z0 - z, z - f.z1, 0);
    const out = Math.max(f.x0 - x, x - f.x1, f.z0 - z, z - f.z1); // > 0 outside the box
    if (dx > 0 && dz > 0) continue;
    y = Math.max(y, out <= -0.35 ? 0.12 : out >= 0 ? 0 : 0.12 * (-out / 0.35));
  }
  return y;
}

/** Points along a polyline every `step` meters (the track's centerline is given every 8 m or so). */
export function resample(pts: readonly [number, number][], step: number) {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!, L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/** Offsets of a polyline to its left and right by `half` (mitred), as [x, z] pairs. */
function offsets(pts: readonly [number, number][], half: number) {
  const L: [number, number][] = [], R: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!, a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!;
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const nx = -tz, nz = tx; // left of the direction of travel (x east, z south)
    L.push([p[0] + nx * half, p[1] + nz * half]); R.push([p[0] - nx * half, p[1] - nz * half]);
  }
  return { L, R };
}

/** The track: a 12 m strip of dark sealed surface along the centerline (on the plinths it rides their tops), teal
 *  LED strips on both edges, the 1 px track-limit lines inside them and the center dash, comets running in the arrow's
 *  direction. Returns its group and the comet meshes (their clock is set by tick). */
export function track(pts: readonly [number, number][], fps: readonly Footprint[], { width = 12, comet = true, cometSpeed = 34, ledA = 0.55, phase = 0 } = {}) {
  const g = new THREE.Group(); g.name = 'track';
  const P = resample(pts, 1.5), half = width / 2;
  const { L, R } = offsets(P, half);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let s = 0;
  P.forEach((p, i) => {
    if (i > 0) s += Math.hypot(p[0] - P[i - 1]![0], p[1] - P[i - 1]![1]);
    const l = L[i]!, r = R[i]!;
    pos.push(l[0], floorAt(fps, l[0], l[1]) + 0.006, l[1], r[0], floorAt(fps, r[0], r[1]) + 0.006, r[1]);
    uv.push(0, s / width, 1, s / width);
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const map = gravelTex(THREE, { metres: 1.2, seed: 41 }); map.repeat.set(8, 8);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3b4149'), map, roughness: 0.78, metalness: 0.05,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const strip = new THREE.Mesh(geo, mat); strip.receiveShadow = true; strip.name = 'track|surface';
  g.add(strip);
  const lift = (q: [number, number], dy: number): Vec3 => [q[0], floorAt(fps, q[0], q[1]) + dy, q[1]];
  const edgeL = offsets(P, half - 0.25), edgeR = offsets(P, half - 0.25);
  const ledL = edgeL.L.map((q) => lift(q, 0.03)), ledR = edgeR.R.map((q) => lift(q, 0.03));
  for (const e of [ledL, ledR]) { const o = line(e, { color: HEX.teal, width: 1.6, glow: 8, glowA: 0.28, opacity: ledA, reveal: false, renderOrder: 4 }); o.userData.noAO = true; g.add(o); }
  const lim = offsets(P, half - 1.1);
  g.add(lines([lim.L.map((q) => lift(q, 0.02)), lim.R.map((q) => lift(q, 0.02))], { color: HEX.limit, width: 1, reveal: false, renderOrder: 3 }));
  g.add(line(P.map((q) => lift(q, 0.02)), { color: HEX.idle, width: 1.2, dash: 3, gap: 5, reveal: false, renderOrder: 3, caps: false }));
  const pulses: THREE.Object3D[] = [];
  if (comet) {
    for (const [e, ph] of [[ledL, 0], [ledR, 19]] as const) {
      const c = comets(e, { color: HEX.teal, core: 2.2, glow: 12, glowA: 0.42, period: 38, speed: cometSpeed, phase: phase + ph, tail: 0.42, reveal: false, renderOrder: 5 });
      c.userData.noAO = true; g.add(c); pulses.push(c);
    }
  }
  return { group: g, pulses, centerline: P };
}

/** Pole lights every `every` meters along a polyline, alternating sides `side` m off the centerline: a 9 m
 *  galvanized pole, an arm and a cool LED head, and the pool it throws (an additive radial wash, no light count). */
export function poleLights(M: Materials, pts: readonly [number, number][], fps: readonly Footprint[], { every = 60, side = 8.6, from = 0, pool = 0.16, poolR = 11, one = 0 } = {}) {
  const g = new THREE.Group(); g.name = 'poleLights';
  const P = resample(pts, 1);
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 9, 10).translate(0, 4.5, 0);
  const armGeo = new THREE.BoxGeometry(1.6, 0.1, 0.12).translate(0.8, 0, 0);
  const headGeo = new THREE.BoxGeometry(0.7, 0.14, 0.34);
  const lensGeo = new THREE.PlaneGeometry(0.58, 0.24).rotateX(Math.PI / 2);
  const lens = new THREE.MeshBasicMaterial({ color: exactColor(THREE, '#eef4fb'), toneMapped: false });
  const head = new THREE.MeshStandardMaterial({ color: exactColor(THREE, '#2a2f35'), roughness: 0.5, metalness: 0.4 });
  const poolMat = new THREE.MeshBasicMaterial({ color: exactColor(THREE, '#cfdcee'), alphaMap: radialTex(THREE), transparent: true, opacity: pool,
    depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
  poolMat.userData.noAO = true;
  const out: { x: number; z: number }[] = [];
  let k = 0;
  for (let s = from; s < P.length - 1; s += every, k++) {
    const i = Math.round(s), p = P[i]!, q = P[Math.min(P.length - 1, i + 1)]!;
    let tx = q[0] - p[0], tz = q[1] - p[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const sd = one || (k % 2 ? 1 : -1), nx = -tz * sd, nz = tx * sd;
    const x = p[0] + nx * side, z = p[1] + nz * side, y0 = floorAt(fps, x, z);
    const pole = new THREE.Group(); pole.position.set(x, y0, z);
    pole.rotation.y = Math.atan2(nz, -nx); // the arm reaches back over the track
    const pm = new THREE.Mesh(poleGeo, M.m.galv); pm.castShadow = true; pole.add(pm);
    const arm = new THREE.Mesh(armGeo, M.m.galv); arm.position.y = 8.9; pole.add(arm);
    const hd = new THREE.Mesh(headGeo, head); hd.position.set(1.55, 8.84, 0); pole.add(hd);
    const ln = new THREE.Mesh(lensGeo, lens); ln.position.set(1.55, 8.765, 0); pole.add(ln);
    g.add(pole);
    const hx = x - nx * 1.55, hz = z - nz * 1.55;
    const pm2 = new THREE.Mesh(new THREE.PlaneGeometry(poolR * 2, poolR * 2).rotateX(-Math.PI / 2), poolMat);
    pm2.position.set(hx, floorAt(fps, hx, hz) + 0.03, hz); pm2.renderOrder = 2; pm2.userData.overlay = true; pm2.userData.noAO = true;
    g.add(pm2);
    out.push({ x: hx, z: hz });
  }
  return { group: g, heads: out };
}

/** An additive glow: a radial wash (flat on the floor, or upright facing +z) in a hex, on the overlay layer. */
export function glow(hex: string, size: number, opacity: number, { flat = true, order = 3 } = {}) {
  const mat = new THREE.MeshBasicMaterial({ color: exactColor(THREE, hex), alphaMap: radialTex(THREE), transparent: true, opacity, depthWrite: false,
    blending: THREE.AdditiveBlending });
  const geo = new THREE.PlaneGeometry(size, size);
  if (flat) geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.renderOrder = order; m.userData.overlay = true; m.userData.noAO = true;
  return m;
}

/** An emissive panel that lands on its hex (no tone curve): LEDs, lamp faces, screens' self-light. */
export function emissive(hex: string, opacity = 1) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex), toneMapped: false, transparent: opacity < 1, opacity });
  return m;
}

/** A canvas screen (exact colors: no tone curve) of w x h meters at px pixels per meter; draw(g, W, H) paints it. */
export function screen(w: number, h: number, px: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void) {
  const c = document.createElement('canvas'); c.width = Math.round(w * px); c.height = Math.round(h * px);
  const g = c.getContext('2d')!;
  draw(g, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  m.name = 'screen';
  return m;
}

/** The liquid glass's grab (the opaque scene, half and quarter resolution), inserted where the kit's glass reads it. */
export function glassKit(ctx: FrameContext) {
  const W = ctx.width * ctx.dpr, H = ctx.height * ctx.dpr;
  const grab = new GrabPass(W, H);
  ctx.stage.insertBeforeOverlay(grab);
  const res = new THREE.Vector2(W, H);
  /** The walkthrough's liquid glass on a w x h pane (radius r; tint and its share), on the overlay layer. */
  const pane = (w: number, h: number, { r = 0.3, rimW = 0.35, tint = null as string | null, tintA = 0.14, refract = 0.035, frost = 0.12, spec = 0.9 } = {}) => {
    const mat = glassMaterial(ctx.theme, grab, res, { size: [w, h], radius: r, rimW });
    if (tint) { mat.uniforms.uTint.value.copy(lin(tint)); }
    mat.uniforms.uTintA.value = tintA; mat.uniforms.uRefract.value = refract; mat.uniforms.uFrost.value = frost; mat.uniforms.uSpec.value = spec;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.layers.set(OVERLAY); m.renderOrder = 10; m.userData.overlay = true; m.userData.noAO = true;
    return m;
  };
  /** The same glass over any geometry whose uv spans the surface (uv rim): canopies, slabs' faces. */
  const shell = (geo: THREE.BufferGeometry, { size = [4, 4] as [number, number], tint = null as string | null, tintA = 0.12, refract = 0.05, frost = 0.1, spec = 1, rimW = 0.02 } = {}) => {
    const mat = glassMaterial(ctx.theme, grab, res, { size, radius: 0.01, rimW, uvRim: 1 });
    if (tint) mat.uniforms.uTint.value.copy(lin(tint));
    mat.uniforms.uTintA.value = tintA; mat.uniforms.uRefract.value = refract; mat.uniforms.uFrost.value = frost; mat.uniforms.uSpec.value = spec;
    const m = new THREE.Mesh(geo, mat);
    m.layers.set(OVERLAY); m.renderOrder = 10; m.userData.overlay = true; m.userData.noAO = true;
    return m;
  };
  return { grab, res, pane, shell };
}

/** Everything a grid frame needs before its first draw: layers, the far-detail attribute, the AO pass's normals, the
 *  lines' pixel widths. */
export function finish(ctx: FrameContext, root: THREE.Object3D, M: Materials) {
  assignLayers(root);
  ensureBase(THREE, root);
  ctx.stage.scene.add(root);
  M.farNormals(ctx.stage.gtao.normalMaterial);
  setLineResolution(root, ctx.width, ctx.height, ctx.dpr);
}

/** Pose the comets at time t (seconds on the frame's clock). */
export function pulse(root: THREE.Object3D, t: number) { tickPulses(root, t); }

/** The per-pixel detail scale the kit's far-detail materials read, for the posed camera. */
export function detail(ctx: FrameContext, M: Materials) {
  M.detail.value.x = (2 * Math.tan((ctx.stage.camera.fov * Math.PI) / 360)) / (ctx.height * ctx.dpr);
}

/** A light that every pass counts (the overlay pass too), so the light state never changes between passes. */
export function counted<T extends THREE.Light>(l: T): T { l.layers.enableAll(); return l; }

/** Plates' livery: a sealed figure carries a BNB-yellow left stripe, a refused one red, a live one teal. Plates are
 *  found by their text after the leader layer has placed them. */
export function livery(ctx: FrameContext, marks: Record<string, 'sealed' | 'refused' | 'live'>) {
  for (const el of Array.from(ctx.plates.root.querySelectorAll<HTMLElement>('.intro-plate'))) {
    const t = el.firstChild?.textContent ?? '';
    for (const [text, kind] of Object.entries(marks)) if (t === text) el.classList.add(`gp-${kind}`);
  }
}

export const fmt = {
  int: (n: number) => Math.round(n).toLocaleString('en-US'),
  usd: (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  short: (h: string, a = 4, b = 4) => `${h.slice(0, 2 + a)}…${h.slice(-b)}`,
};

/** The screen rect (stage px) round a set of world points, padded: an avoid box for the plates. */
export function rectOf(ctx: FrameContext, pts: readonly Vec3[], pad = 6) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { const q = ctx.plates.project(p); if (!q) continue; x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

/** The eight corners of a box (center, half sizes, yaw about y). */
export function boxCorners(c: Vec3, half: Vec3, yaw = 0): Vec3[] {
  const out: Vec3[] = [], cs = Math.cos(yaw), sn = Math.sin(yaw);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * half[0], z = sz * half[2];
    out.push([c[0] + x * cs + z * sn, c[1] + sy * half[1], c[2] - x * sn + z * cs]);
  }
  return out;
}
