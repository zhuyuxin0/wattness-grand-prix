// The towers' shared set (Timing screens, Season purse, License to launch): the night rig, the plinths and the track
// through them, pole lights, glows drawn as geometry, the liquid glass for panes and tubes, and screens whose UI is DOM
// laid onto a 3D face by a homography, so its words stay exact and crisp.
import * as THREE from 'three';
import { exactColor } from '../../kit/tone';
import { createMaterials } from '../../kit/materials';
import { createBuilder, ensureBase } from '../../kit/geo';
import { padTex, gravelTex, roughnessTex } from '../../kit/textures';
import { GrabPass, glassMaterial } from '../../kit/hedge/fields';
import * as flows from '../../kit/region/flows';
import type { FrameContext } from '../types';
import type { Vec3 } from '../../lib/stage';

export { createBuilder, ensureBase };

// typed doors onto the kit's untyped strand helpers (kit/region/flows.ts)
export interface LineOpts { color: string; width?: number; glow?: number; glowA?: number; opacity?: number; dash?: number; gap?: number;
  renderOrder?: number; depthTest?: boolean; reveal?: boolean; caps?: boolean; fade?: number[]; closed?: boolean }
export interface CometOpts { color: string; core?: number; glow?: number; glowA?: number; period?: number; speed?: number; phase?: number;
  tail?: number; opacity?: number; renderOrder?: number; reveal?: boolean; fade?: number[] | null; dir?: number }
export const line = (pts: number[][], o: LineOpts) => (flows.line as (p: number[][], o: LineOpts) => THREE.Mesh)(pts, o);
export const comets = (pts: number[][], o: CometOpts) => (flows.comets as (p: number[][], o: CometOpts) => THREE.Mesh)(pts, o);
const setLineResolution = flows.setLineResolution as (root: THREE.Object3D, w: number, h: number, dpr: number) => void;
const tickPulses = flows.tickPulses as (root: THREE.Object3D, seconds: number) => void;
/** The grab's two textures (fields.ts GrabPass: a half-resolution sharp copy and a quarter-resolution blur). */
export const grabTex = (g: GrabPass) => g as unknown as { sharp: THREE.WebGLRenderTarget; a: THREE.WebGLRenderTarget };

/** The storyboard's palette (STORYBOARD.md, Art direction). */
export const HEX = {
  sky: '#101315', ground: '#14171a', plinth: '#1f2429', rim: '#2b3036',
  muted: '#969ca3', text: '#e6e8ea', strong: '#f6f7f8',
  teal: '#2ec7a6', bnb: '#f0b90b', refused: '#e5534b', light: '#ffe3ad',
  tungsten: '#ffcf8f', brass: '#b8935a', pole: '#d6e2f2', charge: '#7f9cc0',
} as const;

export const exact = (hex: string, k = 1) => exactColor(THREE, hex).multiplyScalar(k);

/** The venue at night: the storyboard's backdrop and moon rig. `glow` moves the backdrop's soft glow (stage
 *  fractions); `warm` tints it toward the Arcade when its light sits just outside the frame. */
export function night(ctx: FrameContext, o: { glowAt?: [number, number]; warm?: number; env?: number } = {}) {
  const { stage } = ctx;
  const glow = o.warm ? mixHex(HEX.rim, '#5a4630', o.warm) : HEX.rim;
  stage.setBackdrop({ top: HEX.sky, horizon: '#1f2429', bottom: HEX.ground, glow, ground: HEX.ground });
  stage.setLight({ key: { color: '#93a8d4', intensity: 0.32 }, rim: { color: '#7f95c0', intensity: 0.22 },
    fill: { sky: '#46597d', ground: '#15130f', intensity: 0.42 }, env: o.env ?? 0.06, shadow: 0.16 });
  return glow;
}

/** Three's linear fog on lit materials only (Art direction, Fog: the long views), landing on its hex. */
export function fog(ctx: FrameContext, near: number, far: number, hex = '#1f2429') {
  ctx.stage.scene.fog = new THREE.Fog(exact(hex), near, far);
}

export function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t).toString(16).padStart(2, '0');
  return `#${m(16)}${m(8)}${m(0)}`;
}

function seeded(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/** Walnut grain, darkened most of the way to the plinth graphite: long wavy grain lines and pores along v. */
function walnutTex(seed = 61) {
  const w = 256, h = 1024, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!, img = g.createImageData(w, h), r = seeded(seed);
  const lines: { x: number; a: number; f: number; p: number; k: number }[] = [];
  for (let i = 0; i < 46; i++) lines.push({ x: r() * w, a: 3 + r() * 9, f: 1 + r() * 3, p: r() * 6.28, k: 0.25 + r() * 0.75 });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0.62;
    for (const L of lines) {
      const cx = L.x + L.a * Math.sin((y / h) * 6.283 * L.f + L.p);
      const d = Math.abs(((x - cx + w * 1.5) % w) - w / 2);
      v += 0.16 * L.k * Math.exp(-d * d / 3.2) - 0.05 * L.k * Math.exp(-d * d / 40);
    }
    v += 0.06 * (r() - 0.5);
    const b = Math.max(0, Math.min(1, v)), k = (y * w + x) * 4;
    img.data[k] = Math.round(b * 255); img.data[k + 1] = Math.round(b * 232); img.data[k + 2] = Math.round(b * 214); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 1.6, 1 / 6.4); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export type Mats = ReturnType<typeof towerMaterials>;

/** The kit's registry, plus the few the towers add: graphite paint and concrete, asphalt, and the Arcade's brass,
 *  walnut-graphite, enamel and tungsten (Art direction: the Arcade only). */
export function towerMaterials(theme: 'dark' | 'light') {
  const kit = createMaterials(THREE, theme);
  const m = kit.m;
  const roughMetal = roughnessTex(THREE, { lo: 0.55, hi: 0.95, metres: 0.8, seed: 29 });
  const concreteMap = padTex(THREE, { joint: 6, seed: 33 });
  const graphite = new THREE.MeshPhysicalMaterial({ color: '#272c32', roughness: 0.46, metalness: 0.15, clearcoat: 0.55, clearcoatRoughness: 0.22, roughnessMap: kit.textures.rough });
  const graphiteDark = new THREE.MeshPhysicalMaterial({ color: '#16191c', roughness: 0.5, metalness: 0.2, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  const sheen = roughnessTex(THREE, { lo: 0.32, hi: 0.62, metres: 3.2, seed: 43 });
  const concrete = new THREE.MeshStandardMaterial({ color: '#3d434a', map: concreteMap, roughness: 1, roughnessMap: sheen, metalness: 0.05 });
  const asphalt = new THREE.MeshStandardMaterial({ color: '#23272c', map: gravelTex(THREE, { seed: 37, metres: 1.6 }), roughness: 0.78 });
  const brass = new THREE.MeshStandardMaterial({ color: HEX.brass, metalness: 1, roughness: 0.32, roughnessMap: roughMetal });
  const brassDark = new THREE.MeshStandardMaterial({ color: '#8a6d42', metalness: 1, roughness: 0.42, roughnessMap: roughMetal });
  // walnut darkened most of the way to the plinth graphite (Art direction), so the bulbs and brass carry the warmth
  const walnut = new THREE.MeshPhysicalMaterial({ color: '#3a302a', map: walnutTex(), roughness: 0.4, clearcoat: 0.85, clearcoatRoughness: 0.1 });
  const enamel = (hex: string) => new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  const emissive = (hex: string, k: number, base = '#1f2429') =>
    new THREE.MeshStandardMaterial({ color: base, roughness: 0.35, emissive: exact(hex), emissiveIntensity: k });
  const screenBlack = new THREE.MeshStandardMaterial({ color: '#0c0e10', roughness: 0.18, metalness: 0.1, emissive: exact('#0f1214'), emissiveIntensity: 1 });
  const unlit = (hex: string, k = 1) => { const u = new THREE.MeshBasicMaterial({ color: exact(hex, k) }); return u; };
  return { kit, m, graphite, graphiteDark, concrete, asphalt, brass, brassDark, walnut, enamel, emissive, screenBlack, unlit };
}

// ── plinths ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** A rounded rectangle as a closed polyline at height y (world x, z). */
export function roundRect(x0: number, z0: number, x1: number, z1: number, r: number, y: number, seg = 8): number[][] {
  const pts: number[][] = [];
  const c = (cx: number, cz: number, a0: number) => { for (let i = 0; i <= seg; i++) { const a = a0 + (i / seg) * Math.PI / 2; pts.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]); } };
  c(x1 - r, z0 + r, -Math.PI / 2); c(x1 - r, z1 - r, 0); c(x0 + r, z1 - r, Math.PI / 2); c(x0 + r, z0 + r, Math.PI);
  return pts;
}

/** A station's plinth (layout.plinths): a slab 0.12 m proud of the apron with a 0.35 m chamfered rim, sealed graphite
 *  concrete, and its hairline LED just inside the rim (idle graphite, live teal). */
export function plinth(mats: Mats, fp: { x0: number; z0: number; x1: number; z1: number; corner_m: number }, led: string, o: { ledWidth?: number; ledGlow?: number } = {}) {
  const g = new THREE.Group(); g.name = 'plinth';
  const { x0, z0, x1, z1 } = fp, r = fp.corner_m;
  const s = new THREE.Shape();
  const w = x1 - x0, d = z1 - z0, rim = 0.35;
  const ix = rim, iz = rim, iw = w - 2 * rim, idp = d - 2 * rim, ir = Math.max(0.5, r - rim);
  s.moveTo(ix + ir, iz); s.lineTo(ix + iw - ir, iz); s.quadraticCurveTo(ix + iw, iz, ix + iw, iz + ir);
  s.lineTo(ix + iw, iz + idp - ir); s.quadraticCurveTo(ix + iw, iz + idp, ix + iw - ir, iz + idp);
  s.lineTo(ix + ir, iz + idp); s.quadraticCurveTo(ix, iz + idp, ix, iz + idp - ir); s.lineTo(ix, iz + ir); s.quadraticCurveTo(ix, iz, ix + ir, iz);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.1, bevelSize: rim, bevelSegments: 1, curveSegments: 10 });
  // shape x -> world x, shape y -> world -z (the rounded rectangle is symmetric), extrusion -> up; top at y 0.12
  geo.rotateX(-Math.PI / 2);
  geo.translate(x0, -0.1, z1);
  const mesh = new THREE.Mesh(geo, mats.concrete); mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = 'slab';
  g.add(mesh);
  const strip = line(roundRect(x0 + 0.62, z0 + 0.62, x1 - 0.62, z1 - 0.62, Math.max(0.5, r - 0.62), 0.128, 10), {
    color: led, width: o.ledWidth ?? 1.4, glow: o.ledGlow ?? 5, glowA: 0.28, closed: true, reveal: false, renderOrder: 4 });
  strip.userData.noAO = true;
  g.add(strip);
  return g;
}

// ── the track ────────────────────────────────────────────────────────────────────────────────────────────────────

/** A stretch of the 12 m track (layout.track.main_world, [x, z] points): an asphalt band just proud of the plinths,
 *  its edges as hairlines, the lane's comets running in the arrow's direction, and pole lights every 60 m. */
export function track(mats: Mats, pts: number[][], o: { comet?: string; edge?: string; dir?: 1 | -1; phase?: number; y?: number; width?: number; dim?: number } = {}) {
  const g = new THREE.Group(); g.name = 'track';
  const y = o.y ?? 0.132, half = (o.width ?? 12) / 2;
  const P = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  const left: number[][] = [], right: number[][] = [], pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
  let u = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)]!, b = P[Math.min(P.length - 1, i + 1)]!;
    const t = b.clone().sub(a).normalize(), n = new THREE.Vector2(-t.y, t.x), p = P[i]!;
    if (i > 0) u += p.distanceTo(P[i - 1]!);
    left.push([p.x + n.x * half, y + 0.004, p.y + n.y * half]); right.push([p.x - n.x * half, y + 0.004, p.y - n.y * half]);
    pos.push(p.x + n.x * half, y, p.y + n.y * half, p.x - n.x * half, y, p.y - n.y * half);
    uv.push(0, u, half * 2, u); nor.push(0, 1, 0, 0, 1, 0);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const band = new THREE.Mesh(geo, mats.asphalt); band.receiveShadow = true; band.name = 'asphalt';
  band.material.polygonOffset = true; band.material.polygonOffsetFactor = -1; band.material.polygonOffsetUnits = -2;
  g.add(band);
  const edge = o.edge ?? HEX.muted, dim = o.dim ?? 1;
  for (const e of [left, right]) {
    const l = line(e, { color: edge, width: 1.1, glow: 0, opacity: 0.55 * dim, reveal: false, renderOrder: 4 });
    l.userData.noAO = true; g.add(l);
  }
  // the lane's centre: a fine dashed guide, and the comets running in the arrow's direction
  const center = P.map((p) => [p.x, y + 0.01, p.y]);
  const guide = line(center, { color: edge, width: 1, dash: 3, gap: 9, opacity: 0.22 * dim, reveal: false, renderOrder: 4 });
  guide.userData.noAO = true; g.add(guide);
  if (o.comet) {
    const run = (o.dir ?? 1) > 0 ? center : center.slice().reverse();
    const c = comets(run, { color: o.comet, core: 2.2, glow: 9, glowA: 0.34, period: 64, speed: 38, phase: o.phase ?? 0, tail: 0.42, reveal: false, renderOrder: 5 });
    c.userData.noAO = true; g.add(c);
  }
  return { group: g, length: u };
}

/** Points of a polyline every `every` meters, with the direction there. */
export function along(pts: number[][], every: number, offset = 0) {
  const out: { x: number; z: number; tx: number; tz: number }[] = [];
  let acc = -offset;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1]!, [bx, bz] = pts[i]!, L = Math.hypot(bx! - ax!, bz! - az!);
    if (L < 1e-6) continue;
    let s = acc < 0 ? -acc : (every - (acc % every)) % every;
    for (; s <= L; s += every) out.push({ x: ax! + (bx! - ax!) * (s / L), z: az! + (bz! - az!) * (s / L), tx: (bx! - ax!) / L, tz: (bz! - az!) / L });
    acc += L;
  }
  return out;
}

/** The track's pole lights: galvanized 10 m poles, a dark head with its cool LED face and a soft pool where it lands.
 *  Real spot lights only where `lit` says (near the camera), so the shader's light count stays small. */
export function poles(mats: Mats, spots: { x: number; z: number; side: number; tx: number; tz: number }[], o: { lit?: (p: { x: number; z: number }) => boolean; intensity?: number } = {}) {
  const b = createBuilder(THREE);
  const g = new THREE.Group(); g.name = 'poles';
  const lights: THREE.SpotLight[] = [];
  const heads: Vec3[] = [];
  for (const p of spots) {
    const nx = -p.tz * p.side, nz = p.tx * p.side; // toward the lane
    const bx = p.x - nx * 8.4, bz = p.z - nz * 8.4;
    b.cyl('pole|galv', 0.16, 10.2, bx, 5.1, bz, { rt: 0.1, rb: 0.17, seg: 10 });
    b.cyl('pole|galv', 0.34, 0.3, bx, 0.15, bz, { seg: 10 });
    const hx = bx + nx * 1.5, hz = bz + nz * 1.5;
    b.rod('pole|galv', [bx, 10.05, bz], [hx, 10.12, hz], 0.06);
    b.at(hx, 10.1, hz, Math.atan2(nx, nz)).box('pole|dark', 0.42, 0.14, 0.9, 0, 0, 0, { c: 0.03 }).box('pole|led', 0.34, 0.02, 0.78, 0, -0.07, 0).pop();
    heads.push([hx, 10.0, hz]);
    if (o.lit?.(p)) {
      const sp = new THREE.SpotLight(HEX.pole, o.intensity ?? 520, 46, Math.PI * 0.3, 0.85, 1.6);
      sp.position.set(hx, 9.9, hz); sp.target.position.set(hx + nx * 4, 0, hz + nz * 4);
      sp.layers.enableAll(); g.add(sp, sp.target); lights.push(sp);
    }
  }
  const built = b.build({ galv: mats.m.galv, dark: mats.m.dark, led: mats.emissive(HEX.pole, 2.6, '#2a2f35') });
  g.add(built.group);
  return { group: g, lights, heads };
}

// ── glows: soft lights drawn as geometry (the stage has no bloom) ────────────────────────────────────────────────

const GLOW_VERT = /* glsl */`
attribute vec3 aCenter; attribute float aSize; attribute vec3 aColor; attribute float aAlpha; attribute float aSharp;
varying vec2 vUv; varying vec3 vColor; varying float vAlpha; varying float vSharp;
void main() {
  vUv = position.xy * 2.0; vColor = aColor; vAlpha = aAlpha; vSharp = aSharp;
  vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
  mv.xy += position.xy * aSize;
  gl_Position = projectionMatrix * mv;
}`;
const GLOW_FRAG = /* glsl */`
varying vec2 vUv; varying vec3 vColor; varying float vAlpha; varying float vSharp;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float a = (vSharp * exp(-r2 * 26.0) + (1.0 - vSharp) * 0.55 * exp(-r2 * 5.5) + 0.12 * exp(-r2 * 2.0)) * (1.0 - r2) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}`;

export interface Glow { at: Vec3; size: number; hex: string; alpha?: number; sharp?: number; k?: number }

/** Camera-facing soft glows (bulbs, lamps, screen halos), additive, one draw. */
export function glows(items: Glow[], order = 6) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.getAttribute('position'));
  const c: number[] = [], s: number[] = [], col: number[] = [], al: number[] = [], sh: number[] = [];
  for (const it of items) {
    c.push(...it.at); s.push(it.size);
    const e = exact(it.hex, it.k ?? 1); col.push(e.r, e.g, e.b); al.push(it.alpha ?? 1); sh.push(it.sharp ?? 0.4);
  }
  g.setAttribute('aCenter', new THREE.InstancedBufferAttribute(new Float32Array(c), 3));
  g.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(s), 1));
  g.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(col), 3));
  g.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(new Float32Array(al), 1));
  g.setAttribute('aSharp', new THREE.InstancedBufferAttribute(new Float32Array(sh), 1));
  g.instanceCount = items.length;
  const m = new THREE.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending });
  m.userData.noAO = true;
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = order;
  mesh.userData.overlay = true; mesh.userData.noAO = true;
  return mesh;
}

/** A lit backdrop panel w x h facing +z: dark at its foot rising to `hi` at its head, falling off toward the sides, so
 *  glass standing before it reads by its silhouette (unlit, landing on its hexes). */
export function backlight(w: number, h: number, lo: string, hi: string, o: { power?: number; side?: number } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uLo: { value: exact(lo) }, uHi: { value: exact(hi) }, uPow: { value: o.power ?? 1.6 }, uSide: { value: o.side ?? 0.45 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uLo; uniform vec3 uHi; uniform float uPow; uniform float uSide; varying vec2 vUv; void main(){ float x = abs(vUv.x - 0.5) * 2.0; float k = pow(clamp(vUv.y, 0.0, 1.0), uPow) * (1.0 - uSide * x * x); gl_FragColor = vec4(mix(uLo, uHi, k), 1.0); }',
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

/** A soft pool of light on a surface (additive, a radial falloff): where a screen or lamp lands on the plinth. */
export function pool(hex: string, at: Vec3, rx: number, rz: number, k = 1, rotY = 0) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: exact(hex, k) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; varying vec2 vUv; void main(){ float r = length(vUv); if (r > 1.0) discard; float a = pow(1.0 - r, 2.2) * (1.0 - 0.3 * r); gl_FragColor = vec4(uColor * a, a); }',
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
  });
  m.userData.noAO = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * rx, 2 * rz).rotateX(-Math.PI / 2), m);
  mesh.position.set(...at); mesh.rotation.y = rotY; mesh.renderOrder = 3;
  mesh.userData.overlay = true; mesh.userData.noAO = true;
  return mesh;
}

// ── the liquid glass ─────────────────────────────────────────────────────────────────────────────────────────────

/** The walkthrough's grab of the opaque scene, inserted between the AO copy-back and the overlay, and its glass. */
export function glassKit(ctx: FrameContext) {
  const W = ctx.width * ctx.dpr, H = ctx.height * ctx.dpr;
  const grab = new GrabPass(W, H);
  ctx.stage.insertBeforeOverlay(grab);
  const res = new THREE.Vector2(W, H);
  const key = new THREE.Vector3(), rim = new THREE.Vector3();
  const lightDirs = () => {
    key.copy(ctx.stage.key.position).sub(ctx.stage.key.target.position).normalize();
    rim.copy(ctx.stage.rim.position).sub(ctx.stage.rim.target.position).normalize();
  };
  /** A flat rounded pane w x h (the walkthrough's sheet material on a plane: rim, hairline, refraction, highlights). */
  const pane = (w: number, h: number, o: { radius?: number; rimW?: number; tint?: string; tintA?: number; spec?: number; frost?: number } = {}) => {
    const mat = glassMaterial(ctx.theme, grab, res, { size: [w, h], radius: o.radius ?? 0.35, rimW: o.rimW ?? 0.3 }) as THREE.ShaderMaterial;
    const u = mat.uniforms as Record<string, { value: any }>;
    if (o.tint) u.uTint!.value = exact(o.tint);
    if (o.tintA != null) u.uTintA!.value = o.tintA;
    if (o.spec != null) u.uSpec!.value = o.spec;
    if (o.frost != null) u.uFrost!.value = o.frost;
    u.uKeyDir!.value = key; u.uRimDir!.value = rim;
    const geo = new THREE.PlaneGeometry(w, h);
    const n = geo.getAttribute('position').count;
    geo.setAttribute('aKnown', new THREE.Float32BufferAttribute(new Float32Array(n).fill(1), 1));
    geo.setAttribute('aPour', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 10;
    mesh.userData.overlay = true; mesh.userData.noAO = true;
    return mesh;
  };
  /** A glass tube (open cylinder) of radius r and height h, standing on its base: refraction of the grab, Fresnel
   *  toward the stage's sky, the key's highlights, a bright rim along the silhouette and a lip at both ends. */
  const tube = (r: number, h: number, o: { tint?: string; tintA?: number; seg?: number; lip?: number; spec?: number } = {}) => {
    const mat = tubeGlass(ctx, grab, res, key, rim, o);
    const geo = new THREE.CylinderGeometry(r, r, h, o.seg ?? 72, 1, true).translate(0, h / 2, 0);
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 11;
    mesh.userData.overlay = true; mesh.userData.noAO = true;
    mat.uniforms.uH.value = h;
    return mesh;
  };
  return { grab, res, pane, tube, lightDirs };
}

const TUBE_VERT = /* glsl */`
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv;
void main() {
  vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const TUBE_FRAG = /* glsl */`
uniform sampler2D tSharp; uniform sampler2D tBlur; uniform vec2 uRes; uniform vec3 uTint; uniform float uTintA;
uniform vec3 uKeyDir; uniform vec3 uRimDir; uniform vec3 uEnvSky; uniform vec3 uEnvHor; uniform vec3 uHair; uniform float uSpec;
uniform float uH; uniform float uLip; uniform float uOpacity;
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv;
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vWorld);
  bool back = dot(N, V) < 0.0;
  if (back) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  vec3 nv = normalize((viewMatrix * vec4(N, 0.0)).xyz);
  vec2 suv = gl_FragCoord.xy / uRes;
  float edge = pow(1.0 - ndv, 2.0);
  vec2 off = nv.xy * 0.03 * (0.3 + 2.2 * edge);
  vec3 sharp = texture2D(tSharp, clamp(suv - off, 0.001, 0.999)).rgb;
  vec3 soft = texture2D(tBlur, clamp(suv - off * 1.5, 0.001, 0.999)).rgb;
  vec3 bg = mix(sharp, soft, clamp(0.1 + edge * 0.5, 0.0, 1.0));
  float l = dot(bg, vec3(0.2126, 0.7152, 0.0722));
  bg = max(mix(vec3(l), bg, 1.2), 0.0);
  vec3 c = mix(bg, uTint, uTintA + edge * 0.25);
  vec3 R = reflect(-V, N);
  vec3 env = mix(uEnvHor, uEnvSky, smoothstep(-0.05, 0.55, R.y));
  float F = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  c = mix(c, env, clamp(F * 0.5, 0.0, 1.0));
  vec3 H1 = normalize(normalize(uKeyDir) + V), H2 = normalize(normalize(uRimDir) + V);
  float s1 = pow(max(dot(N, H1), 0.0), 160.0) * 1.2 + pow(max(dot(N, H1), 0.0), 24.0) * 0.06;
  float s2 = pow(max(dot(N, H2), 0.0), 110.0) * 0.6;
  c += vec3(s1 + s2) * uSpec * (back ? 0.35 : 1.0);
  // the silhouette's bright line, and a lip at the top and bottom ends
  float sil = smoothstep(0.82, 0.98, 1.0 - ndv);
  c = mix(c, uHair, sil * 0.55);
  float y = vUv.y * uH;
  float lip = (1.0 - smoothstep(0.0, uLip, y)) + (1.0 - smoothstep(0.0, uLip, uH - y));
  c = mix(c, uHair, clamp(lip, 0.0, 1.0) * 0.5);
  float a = (back ? 0.55 : 1.0) * uOpacity;
  gl_FragColor = vec4(c, a);
}`;

function tubeGlass(ctx: FrameContext, grab: GrabPass, res: THREE.Vector2, key: THREE.Vector3, rim: THREE.Vector3, o: { tint?: string; tintA?: number; lip?: number; spec?: number }) {
  const dark = ctx.theme !== 'light';
  return new THREE.ShaderMaterial({
    vertexShader: TUBE_VERT, fragmentShader: TUBE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      tSharp: { value: grabTex(grab).sharp.texture }, tBlur: { value: grabTex(grab).a.texture }, uRes: { value: res },
      uTint: { value: exact(o.tint ?? (dark ? '#1f2429' : '#ffffff')) }, uTintA: { value: o.tintA ?? 0.1 },
      uKeyDir: { value: key }, uRimDir: { value: rim },
      uEnvSky: { value: exact(dark ? '#9db9de' : '#ffffff') }, uEnvHor: { value: exact(dark ? '#243650' : '#d5e0ee') },
      uHair: { value: exact(dark ? '#a9b3bd' : '#7f8a96') }, uSpec: { value: o.spec ?? 0.9 },
      uH: { value: 1 }, uLip: { value: o.lip ?? 0.25 }, uOpacity: { value: 1 },
    },
  });
}

// ── screens: DOM laid onto a 3D face ─────────────────────────────────────────────────────────────────────────────

/** The CSS matrix3d that carries a w x h box (its top-left at the origin) onto the quad p0 (top-left), p1 (top-right),
 *  p2 (bottom-right), p3 (bottom-left), in stage px: the square-to-quad projective map, scaled to the box. */
export function quadMatrix(w: number, h: number, p: { x: number; y: number }[]) {
  const [a0, a1, a2, a3] = p as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  const dx1 = a1.x - a2.x, dx2 = a3.x - a2.x, dx3 = a0.x - a1.x + a2.x - a3.x;
  const dy1 = a1.y - a2.y, dy2 = a3.y - a2.y, dy3 = a0.y - a1.y + a2.y - a3.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den, hh = (dx1 * dy3 - dx3 * dy1) / den;
  const a = a1.x - a0.x + g * a1.x, b = a3.x - a0.x + hh * a3.x, c = a0.x;
  const d = a1.y - a0.y + g * a1.y, e = a3.y - a0.y + hh * a3.y, f = a0.y;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${m.map((v) => +v.toFixed(9)).join(',')})`;
}

/** A screen's face in the world: its center, the unit vectors along its width (right) and height (up), its size. */
export interface Face { c: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3; w: number; h: number }

export function faceOf(obj: THREE.Object3D, w: number, h: number, local: Vec3 = [0, 0, 0]): Face {
  obj.updateMatrixWorld(true);
  const c = new THREE.Vector3(...local).applyMatrix4(obj.matrixWorld);
  const q = new THREE.Quaternion(); obj.getWorldQuaternion(q);
  return { c, right: new THREE.Vector3(1, 0, 0).applyQuaternion(q), up: new THREE.Vector3(0, 1, 0).applyQuaternion(q), w, h };
}

/** Lays a DOM screen (built at `px` CSS px per meter) onto a face, in ctx.overlay. */
export function placeScreen(ctx: FrameContext, el: HTMLElement, face: Face, px: number) {
  const w = Math.round(face.w * px), h = Math.round(face.h * px);
  el.style.width = `${w}px`; el.style.height = `${h}px`;
  const corner = (sx: number, sy: number) => {
    const p = face.c.clone().addScaledVector(face.right, (sx * face.w) / 2).addScaledVector(face.up, (sy * face.h) / 2);
    return ctx.plates.project([p.x, p.y, p.z]);
  };
  const q = [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)];
  if (q.some((v) => !v)) { el.style.display = 'none'; return; }
  el.style.transform = quadMatrix(w, h, q as { x: number; y: number }[]);
  if (!el.isConnected) ctx.overlay.appendChild(el);
}

/** A small DOM builder for screens: el('div.cls', children | text). */
export function el(spec: string, ...kids: (Node | string | null | undefined | false)[]): HTMLElement {
  const [tag, ...cls] = spec.split('.');
  const e = document.createElement(tag || 'div');
  if (cls.length) e.className = cls.join(' ');
  for (const k of kids) if (k != null && k !== false) e.append(typeof k === 'string' ? document.createTextNode(k) : k);
  return e;
}

// ── frame plumbing ───────────────────────────────────────────────────────────────────────────────────────────────

/** Line and comet widths in drawing-buffer px, the far-detail scale, and the comets' clock, for a posed camera. */
export function frameTick(ctx: FrameContext, root: THREE.Object3D, mats: Mats, t: number) {
  setLineResolution(root, ctx.width, ctx.height, ctx.dpr);
  tickPulses(root, t);
  mats.kit.detail.value.x = (2 * Math.tan((ctx.stage.camera.fov * Math.PI) / 360)) / (ctx.height * ctx.dpr);
}

/** Adds a root to the scene: its overlay subtrees onto the overlay layer, aBase where the kit's materials need it, and
 *  the far-detail normals for the AO pass. */
export function mount(ctx: FrameContext, root: THREE.Object3D, mats: Mats) {
  root.traverse((o) => { if (o.userData.overlay) o.traverse((c) => c.layers.set(1)); });
  ensureBase(THREE, root);
  ctx.stage.scene.add(root);
  mats.kit.farNormals(ctx.stage.gtao.normalMaterial);
}

/** Gives leader plates the site's livery stripes after layout: a plate whose text starts with a key takes its class. */
export function tagPlates(ctx: FrameContext, tags: Record<string, string>) {
  ctx.plates.root.querySelectorAll<HTMLElement>('.intro-plate').forEach((e) => {
    for (const [text, cls] of Object.entries(tags)) if (e.firstChild?.textContent?.startsWith(text)) e.classList.add(cls);
  });
}

/** Shrinks a line of type until it fits its box (measured once, scaled: the face's type is laid out before it is
 *  carried onto its face, so this is layout width, not screen width). */
export function fit(e: HTMLElement, maxW: number) {
  const w = e.scrollWidth;
  if (w > maxW) { const fs = parseFloat(getComputedStyle(e).fontSize); e.style.fontSize = `${Math.floor(fs * (maxW / w) * 10) / 10}px`; }
}

/** Money as plates print it: dollars with cents, US grouping. */
export const usd = (v: number, dp = 2) => `$${v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
export const int = (v: number) => Math.round(v).toLocaleString('en-US');
/** "2026-11-25 10:00:00 CT" -> "10:00:00 CT". */
export const clockCT = (ct: string) => ct.replace(/^\d{4}-\d{2}-\d{2} /, '');
/** A wallet or hash shortened the site's way: 0xfa22…94b8. */
export const short = (h: string) => `${h.slice(0, 6).toLowerCase()}…${h.slice(-4).toLowerCase()}`;
