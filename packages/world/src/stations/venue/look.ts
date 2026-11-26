// The venue's look: the storyboard's palette (STORYBOARD.md, Art direction), flat grounds that land on their hex
// through the Neutral curve, emissive marks, soft glows drawn as geometry (the stage has no bloom), and the few
// procedural textures the venue adds to the kit's.
import * as THREE from 'three';
import { exactColor } from '../../kit/tone';
import { lin } from '../../kit/region/geo';
import { line as kitLine } from '../../kit/region/flows';

// the kit's flows are untyped JS: their option objects are typed here
const line = kitLine as unknown as (points: number[][], o: Record<string, unknown>) => THREE.Mesh;

export const HEX = {
  sky: '#101315', ground: '#14171a', plinth: '#1f2429', rim: '#2b3036',
  apron: '#171b1f', asphalt: '#111417', returnRoad: '#15191c',
  muted: '#969ca3', text: '#e6e8ea', strong: '#f6f7f8',
  teal: '#2ec7a6', bnb: '#f0b90b', orange: '#eb6834', light: '#ffe3ad', refused: '#e5534b', charge: '#7f9cc0',
  armA: '#2c60de', armB: '#d95926', armC: '#9085e9',
  tungsten: '#ffcf8f', brass: '#b8935a', pole: '#d6e2f2',
} as const;

const exact = (hex: string, k = 1) => exactColor(THREE, hex).multiplyScalar(k);

/** A flat ground: unlit, landing on its hex (times the texture's mean when a texture modulates it). */
export function flat(hex: string, o: { map?: THREE.Texture | null; mean?: number; side?: THREE.Side; transparent?: boolean; opacity?: number; polygonOffset?: number } = {}) {
  const m = new THREE.MeshBasicMaterial({ color: exact(hex, o.map ? 1 / (o.mean ?? 0.9) : 1), map: o.map ?? null, side: o.side ?? THREE.FrontSide });
  if (o.transparent) { m.transparent = true; m.opacity = o.opacity ?? 1; m.depthWrite = false; }
  if (o.polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = -o.polygonOffset; m.polygonOffsetUnits = -o.polygonOffset * 2; }
  return m;
}

/** An emissive mark at its hex, k times as bright (k > 1 pushes it past the Neutral shoulder toward white). */
export function glowMat(hex: string, k = 1, o: { additive?: boolean; opacity?: number; map?: THREE.Texture | null; side?: THREE.Side } = {}) {
  // a light cuts through the long views' fog
  const m = new THREE.MeshBasicMaterial({ color: exact(hex, k), map: o.map ?? null, side: o.side ?? THREE.FrontSide, toneMapped: false, fog: false });
  if (o.additive || o.opacity != null) {
    m.transparent = true; m.depthWrite = false; m.opacity = o.opacity ?? 1;
    if (o.additive) m.blending = THREE.AdditiveBlending;
  }
  m.userData.noAO = true;
  return m;
}

const canvasTex = (c: HTMLCanvasElement, srgb: boolean, repeat?: [number, number]) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 8; t.needsUpdate = true;
  return t;
};

function seeded(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/** Sealed concrete for the apron and plinths: a fine aggregate in linear 0.84 to 0.98 (mean about 0.91) and saw-cut
 *  joints every `joint` meters. World-metric through the geometry's uv (meters). */
export function concreteTex(joint = 12, seed = 41) {
  const s = 512, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d')!, img = g.createImageData(s, s), r = seeded(seed);
  // two octaves of blocky value noise for the mottling, per-pixel grit on top
  const grid = (n: number) => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = r(); return a; };
  const g1 = grid(8), g2 = grid(32);
  const at = (a: Float32Array, n: number, x: number, y: number) => {
    const fx = (x / s) * n, fy = (y / s) * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const v = (i: number, j: number) => a[((j % n) * n + (i % n))]!;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx) * (1 - sy) + (v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx) * sy;
  };
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const v = 0.91 + 0.035 * (at(g1, 8, x, y) - 0.5) + 0.025 * (at(g2, 32, x, y) - 0.5) + 0.03 * (r() - 0.5);
    const b = Math.round(Math.max(0, Math.min(1, v)) * 255), k = (y * s + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, 0, s, 2); g.fillRect(0, 0, 2, s);
  return canvasTex(c, false, [1 / joint, 1 / joint]);
}

/** Asphalt: darker grit, no joints, and a faint wear band down the middle of a lane (u across 0..1, v in meters). */
export function asphaltTex(seed = 57) {
  const w = 256, h = 512, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!, img = g.createImageData(w, h), r = seeded(seed);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, band = Math.exp(-((u - 0.35) ** 2) / 0.006) + Math.exp(-((u - 0.65) ** 2) / 0.006);
    const v = 0.9 + 0.05 * (r() - 0.5) + 0.04 * band;
    const b = Math.round(Math.max(0, Math.min(1, v)) * 255), k = (y * w + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = canvasTex(c, false);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1 / 24);
  return t;
}

/** A radial falloff, white at the center (alpha), for light pools and halos. */
export function radialTex(power = 1.6) {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d')!, img = g.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.min(1, Math.hypot(x + 0.5 - s / 2, y + 0.5 - s / 2) / (s / 2));
    // alphaMap reads the green channel: the falloff goes in the color, opaque
    const a = Math.pow(1 - d, power) * (1 - d * d * 0.2), k = (y * s + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(Math.max(0, a) * 255); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return canvasTex(c, false);
}

/** A light pool or halo on a surface: an additive disc of radius r at its hex and strength. */
export function pool(hex: string, r: number, strength: number, tex: THREE.Texture, at: [number, number, number], o: { sx?: number; sz?: number; rotY?: number; order?: number } = {}) {
  const m = new THREE.MeshBasicMaterial({ color: exact(hex, strength), alphaMap: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * r * (o.sx ?? 1), 2 * r * (o.sz ?? 1)).rotateX(-Math.PI / 2), m);
  // drawn with the opaque pass's transparents (not the overlay), so the glass's grab sees the light under it
  mesh.position.set(...at); mesh.rotation.y = o.rotY ?? 0; mesh.renderOrder = o.order ?? 1;
  mesh.userData.noAO = true;
  return mesh;
}

/** A vertical halo facing the camera's side (a billboard is not needed for stills: it faces the given azimuth). */
export function halo(hex: string, w: number, h: number, strength: number, tex: THREE.Texture, at: [number, number, number], faceDeg: number) {
  const m = new THREE.MeshBasicMaterial({ color: exact(hex, strength), alphaMap: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.set(...at); mesh.rotation.y = (-faceDeg * Math.PI) / 180 + Math.PI;
  mesh.renderOrder = 5; mesh.userData.noAO = true;
  return mesh;
}

/** A screen-space line (the kit's region strand): width and glow in CSS px, on the overlay layer. */
export function strand(points: number[][], o: { color: string; width?: number; glow?: number; glowA?: number; opacity?: number; dash?: number; gap?: number; closed?: boolean; order?: number; fade?: [number, number]; depthTest?: boolean }) {
  return line(points, { color: o.color, width: o.width ?? 1, glow: o.glow ?? 0, glowA: o.glowA ?? 0.3, opacity: o.opacity ?? 1, dash: o.dash ?? 0, gap: o.gap ?? 0,
    closed: o.closed ?? false, renderOrder: o.order ?? 4, reveal: false, caps: !o.closed, fade: o.fade ?? [0, 0], depthTest: o.depthTest ?? true });
}

const BAR_VERT = /* glsl */`
varying vec3 vColor; varying vec3 vN; varying vec2 vUv;
void main() {
  vColor = instanceColor; vUv = uv;
  vN = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * normal));
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}`;
// the walkthrough's bar shading (fields.ts BAR_FRAG): a lit top, the face toward the key mid, the far faces shaded,
// a darker edge so each cell reads as a box; the color is the instance's, already exact (heatAt, exact)
const BAR_FRAG = /* glsl */`
uniform vec3 uKey; uniform float uEdge; varying vec3 vColor; varying vec3 vN; varying vec2 vUv;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float lam = max(dot(n, normalize(uKey)), 0.0);
  float s = 0.56 + 0.44 * lam + 0.06 * max(n.y, 0.0);
  s = mix(s, 0.5, step(n.y, -0.5));
  vec3 c = vColor * s;
  vec2 e = min(vUv, 1.0 - vUv) / max(fwidth(vUv), vec2(1e-5));
  c = mix(c, c * 0.72, uEdge * (1.0 - smoothstep(0.6, 1.4, min(e.x, e.y))));
  gl_FragColor = vec4(c, 1.0);
}`;

/** Data marks as boxes (an InstancedMesh with instance colors): exact colors under the walkthrough's face shading. */
export function barMaterial(edge = 1) {
  return new THREE.ShaderMaterial({ vertexShader: BAR_VERT, fragmentShader: BAR_FRAG,
    uniforms: { uKey: { value: new THREE.Vector3(-0.45, 0.77, 0.45) }, uEdge: { value: edge } } });
}

export { lin, exact };
