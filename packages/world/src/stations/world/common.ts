// @ts-nocheck
// What the world group's frames share, built only from the kit's parts: the venue's night rig, the sealed-concrete
// apron and plinths (exact hexes, shaded by face, a fine aggregate and 6 m joints), the plinths' LED hairlines, lanes,
// shadow catchers over the unlit surfaces, pole lights, a screen material that lands a canvas on its exact hexes, a
// glass dome, and the walkthrough's key card in DOM. Untyped like the kit it wraps (three has no types here).
import * as THREE from 'three';
import { lin, Builder, offsetPoly, roundRect, filletPoly } from '../../kit/region/geo';
import { line as fineLine } from '../../kit/region/flows';
import { exactColor } from '../../kit/tone';
import { radialTex } from '../../kit/textures';

export { lin, fineLine, roundRect, filletPoly, offsetPoly, Builder };

/** The venue's night (STORYBOARD.md section 2): graphite backdrop, a cool moon as the key. */
export const NIGHT = {
  backdrop: { top: '#101315', horizon: '#1f2429', bottom: '#14171a', glow: '#2b3036', ground: '#14171a' },
  light: { key: { color: '#93a8d4', intensity: 0.32 }, rim: { color: '#7f95c0', intensity: 0.22 }, fill: { sky: '#46597d', ground: '#15130f', intensity: 0.42 }, env: 0.06, shadow: 0.16 },
};
export const HEX = {
  sky: '#101315', ground: '#14171a', plinth: '#1f2429', rim: '#2b3036', ink: '#969ca3', text: '#e6e8ea', strong: '#f6f7f8',
  teal: '#2ec7a6', bnb: '#F0B90B', orange: '#eb6834', refused: '#e5534b', charge: '#7f9cc0', light: '#ffe3ad', hatch: '#2a3038',
  track: '#16191c',
};

export function night(stage) {
  stage.setBackdrop(NIGHT.backdrop);
  stage.setLight(NIGHT.light);
  stage.setGround(HEX.ground);
}

// ── exact surfaces: sealed concrete in graphite ───────────────────────────────────────────────────────────────────
const SURF_VERT = /* glsl */`
attribute vec3 color;
varying vec3 vColor; varying vec3 vN; varying vec3 vW;
void main() {
  vColor = color;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const NOISE = /* glsl */`
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y); }`;
const SURF_FRAG = /* glsl */`
uniform vec3 uKey; uniform float uGrain; uniform float uJoint; uniform float uJointA; uniform float uOpacity; uniform vec2 uJointO;
varying vec3 vColor; varying vec3 vN; varying vec3 vW;
${NOISE}
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float up = clamp(n.y, 0.0, 1.0);
  float lam = max(dot(n, normalize(uKey)), 0.0);
  // faces off the horizontal shaded by the key (a chamfer or a side reads as one); the top lands on its hex
  float side = 0.58 + 0.34 * lam + 0.1 * max(n.z, 0.0);
  float s = mix(side, 1.0, pow(up, 8.0));
  s = mix(s, 0.5, step(n.y, -0.5));
  vec2 q = vW.xz;
  float fw = max(length(fwidth(q)), 1e-4);
  // aggregate: a fine grain that fades out once a pixel spans it, over a broad mottling
  float g = (vnoise(q * 3.1) - 0.5) * (1.0 - smoothstep(0.05, 0.3, fw)) + (vnoise(q * 0.71) - 0.5) * 0.6 * (1.0 - smoothstep(0.3, 1.2, fw));
  float m = vnoise(q * 0.045) * 0.55 + vnoise(q * 0.17) * 0.45 - 0.5;
  float k = 1.0 + uGrain * (0.6 * g + 1.0 * m);
  if (uJoint > 0.0) {
    vec2 a = abs(fract((q - uJointO) / uJoint + 0.5) - 0.5) * uJoint;
    float jl = 1.0 - smoothstep(0.015, 0.015 + fw * 1.1, min(a.x, a.y));
    k *= 1.0 - uJointA * jl * clamp(0.05 / fw, 0.0, 1.0) * up;
  }
  gl_FragColor = vec4(vColor * s * k, uOpacity);
}`;

export function surfaceMaterial({ grain = 0.09, joint = 6, jointA = 0.32, jointO = [0, 0], key = [-0.45, 0.77, 0.45], opacity = 1 } = {}) {
  const transparent = opacity < 1;
  return new THREE.ShaderMaterial({
    vertexShader: SURF_VERT, fragmentShader: SURF_FRAG, transparent, depthWrite: !transparent, extensions: { derivatives: true },
    uniforms: {
      uKey: { value: new THREE.Vector3(...key) }, uGrain: { value: grain }, uJoint: { value: joint }, uJointA: { value: jointA },
      uOpacity: { value: opacity }, uJointO: { value: new THREE.Vector2(...jointO) },
    },
  });
}

/** Triangles of a closed outline [[x, z], ...] at height y, facing up, colored hex (linear exact). */
function capTris(pos, nrm, col, poly, y, k) {
  const pts = poly.map(([x, z]) => new THREE.Vector2(x, z));
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(pts, [])) {
    const A = pts[a], B = pts[b], C = pts[c];
    // up-facing winding in (x, z) with +z south
    const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
    const tri = cross < 0 ? [A, B, C] : [A, C, B];
    for (const p of tri) { pos.push(p.x, y, p.y); nrm.push(0, 1, 0); col.push(k.r, k.g, k.b); }
  }
}
/** A band between two closed outlines of equal length (outer at y0, inner at y1), normals from the band itself. */
function bandTris(pos, nrm, col, outer, y0, inner, y1, k) {
  const n = outer.length;
  const v = new THREE.Vector3(), w = new THREE.Vector3(), nn = new THREE.Vector3();
  // the ring's orientation, so every quad faces outward and up
  let area = 0; for (let i = 0; i < n; i++) { const p = outer[i], q = outer[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = [outer[i][0], y0, outer[i][1]], b = [outer[j][0], y0, outer[j][1]], c = [inner[j][0], y1, inner[j][1]], d = [inner[i][0], y1, inner[i][1]];
    v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); w.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]); nn.crossVectors(v, w).normalize();
    let quad = [a, b, c, a, c, d];
    if (nn.y < 0 || (Math.abs(nn.y) < 1e-3 && area < 0)) { nn.negate(); quad = [a, c, b, a, d, c]; }
    for (const p of quad) { pos.push(...p); nrm.push(nn.x, nn.y, nn.z); col.push(k.r, k.g, k.b); }
  }
}
function meshOf(pos, nrm, col, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return new THREE.Mesh(g, mat);
}

/** A plinth: a rounded slab h proud of the apron with a chamfered rim of width rim, its top in hex; returns the mesh,
 *  the top's outline (for the LED hairline and the shadow catcher) and the footprint's outline. */
export function plinth({ x0, z0, x1, z1, corner = 10 }, { h = 0.12, rim = 0.35, top = HEX.plinth, grain = 0.085, joint = 6, jointO = [0, 0] } = {}) {
  const outer = roundRect((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, corner, 10);
  const inner = offsetPoly(outer, -rim);
  const pos = [], nrm = [], col = [], k = lin(top);
  capTris(pos, nrm, col, inner, h, k);
  bandTris(pos, nrm, col, outer, 0.004, inner, h, k);
  const mesh = meshOf(pos, nrm, col, surfaceMaterial({ grain, joint, jointO }));
  mesh.receiveShadow = false;
  return { mesh, top: inner, outline: outer, h };
}

/** A flat slab from an outline (the apron, a pad): top at y, a chamfer of width rim down to y0. */
export function slab(outline, { y = 0, y0 = -0.16, rim = 0.3, top = HEX.ground, grain = 0.07, joint = 6, jointA = 0.28 } = {}) {
  const inner = offsetPoly(outline, -rim);
  const pos = [], nrm = [], col = [], k = lin(top);
  capTris(pos, nrm, col, inner, y, k);
  bandTris(pos, nrm, col, outline, y0, inner, y, k);
  return meshOf(pos, nrm, col, surfaceMaterial({ grain, joint, jointA }));
}

/** A ribbon of width w along a polyline [[x, z], ...] at height y (a lane's surface), uv.x across, uv.y along (m). */
export function ribbonGeometry(points, w, y) {
  const pos = [], uv = [], idx = [];
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    if (i > 0) s += Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]);
    const nx = -dz, nz = dx;
    pos.push(p[0] + nx * w / 2, y, p[1] + nz * w / 2, p[0] - nx * w / 2, y, p[1] - nz * w / 2);
    uv.push(1, s, 0, s);
    if (i > 0) { const o = (i - 1) * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return { geometry: g, length: s };
}

// a lane: asphalt in graphite, a fine grain, the track-limit lines inset 0.4 m, faint at the centerline
const LANE_FRAG = /* glsl */`
uniform vec3 uColor; uniform vec3 uLine; uniform float uLineA; uniform float uOpacity; uniform float uW;
varying vec2 vUv; varying vec3 vW;
${NOISE}
void main() {
  vec2 q = vW.xz; float fw = max(length(fwidth(q)), 1e-4);
  float g = (vnoise(q * 4.0) - 0.5) * (1.0 - smoothstep(0.04, 0.25, fw)) + (vnoise(q * 0.9) - 0.5) * 0.5 * (1.0 - smoothstep(0.3, 1.2, fw));
  float m = vnoise(q * 0.06) - 0.5;
  vec3 c = uColor * (1.0 + 0.07 * g + 0.06 * m);
  float x = vUv.x * uW;                                   // metres across
  float fx = max(fwidth(x), 1e-4);
  float edge = min(abs(x - 0.4), abs(x - (uW - 0.4)));
  float ln = 1.0 - smoothstep(0.06, 0.06 + fx * 1.2, edge);
  c = mix(c, uLine, ln * uLineA);
  gl_FragColor = vec4(c, uOpacity);
}`;
export function laneMesh(points, { w = 12, y = 0.13, color = HEX.track, lineColor = '#8c939b', lineA = 0.55, opacity = 1, renderOrder = 0 } = {}) {
  const { geometry, length } = ribbonGeometry(points, w, y);
  const transparent = opacity < 1;
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: LANE_FRAG, transparent, depthWrite: !transparent, extensions: { derivatives: true },
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    uniforms: { uColor: { value: lin(color).clone() }, uLine: { value: lin(lineColor).clone() }, uLineA: { value: lineA }, uOpacity: { value: opacity }, uW: { value: w } },
  });
  const m = new THREE.Mesh(geometry, mat); m.renderOrder = renderOrder;
  m.userData.length = length;
  return m;
}

/** Shadows over an unlit surface: a ShadowMaterial cap a few millimetres above it. */
export function catcher(outline, y, opacity = 0.42) {
  const pos = [], nrm = [], col = [];
  capTris(pos, nrm, col, outline, y, { r: 0, g: 0, b: 0 });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const m = new THREE.Mesh(g, new THREE.ShadowMaterial({ opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  m.receiveShadow = true; m.userData.noAO = true; m.renderOrder = 1;
  return m;
}

/** A closed outline as a hairline LED at height y: a fine core under a soft glow (CSS px), on the overlay. */
export function ledLoop(outline, y, { color = HEX.rim, width = 1.1, glow = 0, glowA = 0.3, opacity = 1 } = {}) {
  const pts = outline.map(([x, z]) => [x, y, z]);
  return fineLine(pts, { color, width, glow, glowA, opacity, closed: true, reveal: false, caps: false });
}

/** Additive light on the ground: a soft disc of color at strength a, radius r (a pole light's pool, a glow). */
export function pool(x, y, z, r, color, a, { flat = true } = {}) {
  const mat = new THREE.MeshBasicMaterial({ color: lin(color).clone().multiplyScalar(a), alphaMap: radialTex(THREE), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false });
  mat.userData.noAO = true;
  const g = new THREE.PlaneGeometry(2 * r, 2 * r);
  if (flat) g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z); m.userData.overlay = true; m.userData.noAO = true; m.renderOrder = 4;
  return m;
}

/** A pole light (the kit's site lights: a galvanized pole, a dark head with a lens) with its pool of cool light. */
export function poleLight(materials, x, z, { h = 9, color = '#d6e2f0', head = 2.6, poolR = 15, poolA = 0.09, y0 = 0 } = {}) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, h, 10).translate(0, h / 2, 0), materials.m.galv);
  pole.position.set(x, y0, z); pole.castShadow = true; g.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.12), materials.m.galv); arm.position.set(x + 0.6, y0 + h - 0.1, z); g.add(arm);
  const hd = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.36), materials.m.dark); hd.position.set(x + 1.2, y0 + h - 0.16, z); g.add(hd);
  const lensMat = new THREE.MeshBasicMaterial({ color: lin(color).clone().multiplyScalar(head) });
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.26).rotateX(Math.PI / 2), lensMat); lens.position.set(x + 1.2, y0 + h - 0.245, z); g.add(lens);
  g.add(pool(x + 1.2, y0 + 0.14, z, poolR, color, poolA));
  return g;
}

// ── a screen: a canvas landing on its exact hexes ───────────────────────────────────────────────────────────────
// The stage tone-maps the whole frame once (Neutral). A screen's texels are mapped through the curve's inverse in
// the shader (the same fixed point kit/tone.ts exactColor runs), so the canvas's hexes land as drawn.
const NEUTRAL_GLSL = /* glsl */`
vec3 neutralFwd(vec3 c) {
  float x = min(c.r, min(c.g, c.b));
  float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= off;
  float peak = max(c.r, max(c.g, c.b));
  if (peak < 0.76) return c;
  float d = 0.24, np = 1.0 - d * d / (peak + d - 0.76);
  c *= np / peak;
  float g = 1.0 - 1.0 / (0.15 * (peak - np) + 1.0);
  return mix(c, vec3(np), g);
}
vec3 neutralInv(vec3 t) {
  vec3 x = t;
  for (int i = 0; i < 6; i++) x = max(x + (t - neutralFwd(x)), vec3(0.0));
  return x;
}
vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }`;
const SCREEN_FRAG = /* glsl */`
uniform sampler2D tMap; uniform float uGain; uniform float uOpacity;
varying vec2 vUv;
${NEUTRAL_GLSL}
void main() {
  vec4 t = texture2D(tMap, vUv);
  vec3 lin = srgbToLinear(t.rgb);
  gl_FragColor = vec4(neutralInv(lin) * uGain, t.a * uOpacity);
}`;
export function screenMaterial(texture, { gain = 1, transparent = false, opacity = 1, side = THREE.FrontSide } = {}) {
  texture.colorSpace = THREE.NoColorSpace;
  return new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: SCREEN_FRAG, transparent, depthWrite: !transparent, side,
    uniforms: { tMap: { value: texture }, uGain: { value: gain }, uOpacity: { value: opacity } },
  });
}
export function canvasTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// ── glass over a screen: the Terminal's glass as a cover (Fresnel to the stage's sky, the key's highlight, a rim) ──
const COVER_VERT = /* glsl */`
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const COVER_FRAG = /* glsl */`
uniform vec3 uSky; uniform vec3 uHor; uniform vec3 uKey; uniform vec3 uRim; uniform vec3 uTint; uniform float uTintA; uniform float uSpec; uniform float uEnvA;
uniform float uRimLine; uniform vec3 uHair; uniform float uSheen;
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
  if (dot(N, V) < 0.0) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  vec3 R = reflect(-V, N);
  vec3 env = mix(uHor, uSky, smoothstep(-0.05, 0.55, R.y));
  float F = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  vec3 c = uTint * uTintA + env * F * uEnvA;
  float a = uTintA + F * uEnvA;
  vec3 H1 = normalize(normalize(uKey) + V), H2 = normalize(normalize(uRim) + V);
  float s = pow(max(dot(N, H1), 0.0), 220.0) * 1.4 + pow(max(dot(N, H1), 0.0), 26.0) * 0.06 + pow(max(dot(N, H2), 0.0), 140.0) * 0.7;
  // the 122-degree sheen of glass.css, faint
  float t = dot(vUv - 0.5, normalize(vec2(0.53, -0.85))) + 0.5;
  float sheen = 0.5 * (1.0 - smoothstep(0.0, 0.25, t)) + 0.2 * smoothstep(0.75, 0.95, t) * (1.0 - smoothstep(0.95, 1.0, t));
  c += vec3(s * uSpec + sheen * uSheen);
  a = clamp(a + s * uSpec + sheen * uSheen, 0.0, 1.0);
  // the hairline round the pane's edge (uv border)
  vec2 e = min(vUv, 1.0 - vUv) / max(fwidth(vUv), vec2(1e-5));
  float hair = (1.0 - smoothstep(0.5, 1.6, min(e.x, e.y))) * uRimLine;
  c = mix(c, uHair, hair); a = max(a, hair * 0.85);
  gl_FragColor = vec4(c, a);
}`;
export function coverMaterial({ tintA = 0.08, envA = 0.55, spec = 0.9, rimLine = 0, sheen = 0.035, key = [-0.45, 0.8, 0.55], rim = [0.6, 0.45, -0.6] } = {}) {
  const m = new THREE.ShaderMaterial({
    vertexShader: COVER_VERT, fragmentShader: COVER_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true },
    uniforms: {
      uSky: { value: lin('#9db9de').clone() }, uHor: { value: lin('#243650').clone() }, uKey: { value: new THREE.Vector3(...key) }, uRim: { value: new THREE.Vector3(...rim) },
      uTint: { value: lin('#1f2429').clone() }, uTintA: { value: tintA }, uSpec: { value: spec }, uEnvA: { value: envA },
      uRimLine: { value: rimLine }, uHair: { value: lin('#a9b3bd').clone() }, uSheen: { value: sheen },
    },
  });
  m.userData.noAO = true;
  return m;
}

/** Unlit exact color (a data mark's flat face, a lamp's lens). */
export function flat(hex, { opacity = 1, additive = false, gain = 1, side = THREE.FrontSide } = {}) {
  const m = new THREE.MeshBasicMaterial({ color: lin(hex).clone().multiplyScalar(gain), transparent: opacity < 1 || additive, opacity, side,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !(opacity < 1 || additive) });
  if (additive || opacity < 1) m.userData.noAO = true;
  return m;
}

// ── data columns: the walkthrough's bar shading on instanced cylinders ─────────────────────────────────────────────
const COL_VERT = /* glsl */`
attribute vec3 aColor; attribute float aHollow;
varying vec3 vColor; varying vec3 vN; varying vec3 vLocal; varying float vHollow;
void main() {
  vColor = aColor; vLocal = position; vHollow = aHollow;
  vN = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * normal));
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const COL_FRAG = /* glsl */`
uniform vec3 uKey; uniform float uLift;
varying vec3 vColor; varying vec3 vN; varying vec3 vLocal; varying float vHollow;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float up = max(n.y, 0.0);
  float lam = max(dot(n, normalize(uKey)), 0.0);
  float s = 0.56 + 0.44 * lam + 0.06 * up;
  if (n.y > 0.9) s = 1.04 + uLift;
  s = mix(s, 0.5, step(n.y, -0.5));
  // a hollow column's inner wall reads as the inside of a tube
  float r = length(vLocal.xz);
  if (vHollow > 0.5 && r < 0.42 && n.y < 0.9) s *= 0.5;
  // a darker hairline where the side meets the top
  float rimBand = smoothstep(0.985, 0.999, vLocal.y) * (1.0 - step(0.9, n.y));
  s *= 1.0 - 0.28 * rimBand;
  gl_FragColor = vec4(vColor * s, 1.0);
}`;
export function columnMaterial({ key = [-0.45, 0.77, 0.45], lift = 0 } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: COL_VERT, fragmentShader: COL_FRAG,
    uniforms: { uKey: { value: new THREE.Vector3(...key) }, uLift: { value: lift } },
  });
}
/** A unit box (1 x 1 x 1, base at 0), shaded as the columns: a bar of the walkthrough's kind. */
export function boxGeometry() { return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0).toNonIndexed(); }
/** A unit column (radius 0.5, height 1, base at 0); hollow: an open tube with a wall of wall (in its own units). */
export function columnGeometry({ hollow = false, wall = 0.11, seg = 20 } = {}) {
  if (!hollow) {
    const g = new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1).translate(0, 0.5, 0);
    return g.toNonIndexed();
  }
  const outer = new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1, true).translate(0, 0.5, 0).toNonIndexed();
  const inner = new THREE.CylinderGeometry(0.5 - wall, 0.5 - wall, 1, seg, 1, true).translate(0, 0.5, 0).toNonIndexed();
  // the inner wall faces in
  const ip = inner.attributes.position.array, inr = inner.attributes.normal.array;
  for (let i = 0; i < ip.length; i += 9) { for (let k = 0; k < 3; k++) { const t = ip[i + 3 + k]; ip[i + 3 + k] = ip[i + 6 + k]; ip[i + 6 + k] = t; } }
  for (let i = 0; i < inr.length; i++) inr[i] = -inr[i];
  const ring = new THREE.RingGeometry(0.5 - wall, 0.5, seg, 1).rotateX(-Math.PI / 2).translate(0, 1, 0).toNonIndexed();
  const parts = [outer, inner, ring];
  const P = [], N = [];
  for (const g of parts) { P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return g;
}
/** Instanced columns: items { x, y, z, r, h, color (hex), lie (radians about z: lying along x) }. */
export function columns(items, { hollow = false, material = null, geometry = null } = {}) {
  const geo = geometry ?? columnGeometry({ hollow });
  const colors = new Float32Array(items.length * 3), hol = new Float32Array(items.length);
  items.forEach((it, i) => { const k = lin(it.color); colors.set([k.r, k.g, k.b], i * 3); hol[i] = hollow ? 1 : 0; });
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
  geo.setAttribute('aHollow', new THREE.InstancedBufferAttribute(hol, 1));
  const mesh = new THREE.InstancedMesh(geo, material ?? columnMaterial(), items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  items.forEach((it, i) => {
    e.set(0, it.yaw ?? 0, it.lie ?? 0); q.setFromEuler(e);
    m.compose(new THREE.Vector3(it.x, it.y ?? 0, it.z), q, it.size ? new THREE.Vector3(...it.size) : new THREE.Vector3(2 * it.r, it.h, 2 * it.r));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false;
  return mesh;
}

/** The site's discharge ramp (layout.grid.column.color) at t in 0..1. */
const RAMP = ['#1b4a42', '#249c83', '#2ec7a6', '#bdf4e6'];
export function dischargeHex(t) {
  const f = Math.max(0, Math.min(1, t)) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(f)), k = f - i;
  const a = parseInt(RAMP[i].slice(1), 16), b = parseInt(RAMP[i + 1].slice(1), 16);
  const ch = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * k);
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
}
export const DISCHARGE_RAMP = RAMP;

// ── DOM: the walkthrough's key card (kit/css/plates.css .hwalk-key), built by hand for the world's rows ─────────
export function keyCard(host, rows) {
  const k = document.createElement('div'); k.className = 'hwalk-key';
  for (const r of rows) {
    const row = document.createElement('div');
    if (r.ramp) {
      row.className = 'ramp';
      const bar = document.createElement('span'); bar.className = 'bar';
      const i = document.createElement('i'); i.style.background = r.ramp; bar.appendChild(i);
      if (r.ends) {
        const lo = document.createElement('b'); lo.textContent = r.ends[0]; lo.style.left = '0'; lo.style.transform = 'none';
        const hi = document.createElement('b'); hi.textContent = r.ends[1]; hi.style.left = 'auto'; hi.style.right = '0'; hi.style.transform = 'none';
        bar.append(lo, hi);
        bar.classList.add('ends');
      }
      row.append(document.createTextNode(r.text), bar);
    } else {
      if (r.swatch) {
        const sw = document.createElement('span'); sw.className = 'sw'; Object.assign(sw.style, r.swatch); row.appendChild(sw);
      }
      row.appendChild(document.createTextNode(r.text));
    }
    if (r.strong) row.style.color = 'var(--w-fg)';
    k.appendChild(row);
  }
  host.appendChild(k);
  return k;
}
export function rectOf(el, root) {
  const a = el.getBoundingClientRect(), b = root.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
}

/** Thousands with commas. */
export const n0 = (v) => Math.round(v).toLocaleString('en-US');
export const usd2 = (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export { exactColor };
