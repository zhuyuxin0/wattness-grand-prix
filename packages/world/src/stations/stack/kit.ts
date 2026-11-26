// @ts-nocheck
// What the stack's frames draw with, wrapped from the kit and never edited: chapter 05's one line program
// (kit/region/flows.ts) as strands (a body in a soft glow, comets once drawn, mitred chevrons), its flat-filled solids
// and hairline edges (kit/region/geo.ts), and its glass (kit/region/glass.ts) over one grab of the scene, extended here
// to a shell (a sphere, a disc) with the same fill, clamp and rim.
import * as THREE from 'three';
import { line, lines, comets, setDraw, setSpan, fillet, tickPulses, setLineResolution } from '../../kit/region/flows';
import { lin, Builder, flatMaterial, roundRect, offsetPoly, filletPoly, shadeMesh } from '../../kit/region/geo';
import { GrabBlurPass, glassPlane, markTexture } from '../../kit/region/glass';
import { radialTex } from '../../kit/textures';

export { THREE, line, lines, comets, setDraw, setSpan, fillet, tickPulses, setLineResolution, lin, Builder, flatMaterial, roundRect,
  offsetPoly, filletPoly, shadeMesh, GrabBlurPass, glassPlane, markTexture, radialTex };

export const UP = new THREE.Vector3(0, 1, 0);
export const RIGHT = new THREE.Vector3(1, 0, 0);
export const v3 = (p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2]));
export const arr = (p) => (p.isVector3 ? [p.x, p.y, p.z] : [p[0], p[1], p[2]]);
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const sr = (x, a, b) => smooth((x - a) / (b - a));

/** The point and direction at distance s along a polyline (V: Vector3s, cum: cumulative lengths). */
export function pointAt(V, cum, s) {
  const L = cum[cum.length - 1], d = Math.min(Math.max(s, 0), L);
  let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
  const a = V[i - 1], b = V[i], seg = Math.max(cum[i] - cum[i - 1], 1e-6), t = (d - cum[i - 1]) / seg;
  return { p: a.clone().lerp(b, t), dir: b.clone().sub(a).normalize() };
}
const cumOf = (V) => { const c = [0]; for (let i = 1; i < V.length; i++) c.push(c[i - 1] + V[i].distanceTo(V[i - 1])); return c; };

/** The overlay layer's flags on an object (marks, glass, lines: no AO, after the opaque scene). */
export function overlay(o, ro = null) { o.userData.overlay = true; o.userData.noAO = true; if (ro != null) o.renderOrder = ro; return o; }

/** A mesh in flat fills (chapter 05's solids: shaded by face direction, landing on its hex) from any geometry. */
export function flatMesh(geometry, hex, { transparent = false, opacity = 1, side = THREE.FrontSide } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const k = lin(hex), n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return new THREE.Mesh(g, flatMaterial({ transparent, opacity, side }));
}

/** A flat, unlit mark color (exact hex), for lamps, beads and glows' cores. */
export function basic(hex, { opacity = 1, transparent = opacity < 1, additive = false, map = null, depthWrite = !transparent } = {}) {
  // a mark's own texture lands on its own colors (no tone curve, white multiplier); a flat color through exactColor
  const m = new THREE.MeshBasicMaterial({ color: map ? new THREE.Color(1, 1, 1) : lin(hex), transparent, opacity, depthWrite, map, toneMapped: !map });
  if (additive) m.blending = THREE.AdditiveBlending;
  return m;
}

let alphaTexture = null;
/** A soft round falloff in alpha (white, transparent outside): the kit's radial profile on a clear ground, so the same
 *  glow adds light on the night ground and lays a tint on the light one (the kit's radialTex is opaque black outside,
 *  which only an additive blend can use). */
export function alphaRadial() {
  if (alphaTexture) return alphaTexture;
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'), gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  alphaTexture = new THREE.CanvasTexture(c);
  return alphaTexture;
}

/** The light theme's glow: a glow adds nothing on a near-white ground, so there it is a tint at this share of the dark
 *  cut's opacity (normal blend), its color the light palette's. */
export const LIGHT_GLOW = 1.6;

/** A soft round glow on the overlay layer; size in meters. Additive on the night ground, a tint on the light one. */
export function glow(hex, size, opacity = 0.5, theme = 'dark') {
  const lightCut = theme === 'light';
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: alphaRadial(), color: lin(hex), transparent: true, opacity: lightCut ? opacity * LIGHT_GLOW : opacity,
    depthWrite: false, blending: lightCut ? THREE.NormalBlending : THREE.AdditiveBlending }));
  s.scale.set(size, size, 1); overlay(s, 9);
  return s;
}

/** A pool of light on a surface at height y: a flat disc of radius r whose falloff is the glow's (additive at night,
 *  a tint on the light ground), on the overlay layer under the lines. */
export function pool(hex, r, opacity, theme = 'dark', y = 0.12) {
  const lightCut = theme === 'light';
  const m = new THREE.MeshBasicMaterial({ map: alphaRadial(), color: lin(hex), transparent: true, opacity: lightCut ? opacity * LIGHT_GLOW : opacity,
    depthWrite: false, blending: lightCut ? THREE.NormalBlending : THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 64).rotateX(-Math.PI / 2), m);
  mesh.position.y = y; overlay(mesh, 8);
  return mesh;
}

/** A closed ring as one fine line, in the plane spanned by a and b (unit vectors), around c. */
export function ring(c, r, a, b, o) {
  const pts = Array.from({ length: 64 }, (_, i) => { const t = (i / 64) * Math.PI * 2; return [c.x + (a.x * Math.cos(t) + b.x * Math.sin(t)) * r, c.y + (a.y * Math.cos(t) + b.y * Math.sin(t)) * r, c.z + (a.z * Math.cos(t) + b.z * Math.sin(t)) * r]; });
  return line(pts, { reveal: false, closed: true, ...o });
}

/** An arrowhead: two arms meeting in a mitred tip at the origin, pointing along dir, spread along side. */
function chevron(dir, side, size, color, ro, width = 1.6) {
  const tip = new THREE.Vector3(), back = tip.clone().addScaledVector(dir, -size);
  return line([arr(back.clone().addScaledVector(side, size * 0.62)), [0, 0, 0], arr(back.clone().addScaledVector(side, -size * 0.62))],
    { color, width, renderOrder: ro, reveal: false });
}

/** A strand, chapter 05's grammar (engine.ts strand()): a body (core in a soft glow, optional capsule dashes, end
 *  fades), comets on the same path, chevrons mid-run. state 'designed' draws round dots with no glow, no comets and no
 *  arrow, a hollow ring at the arrival end. Lengths in meters (the caller converts the recipe's px with the frame's
 *  meters a px). Returns a handle whose set(a) scales every part's opacity. */
export function strand(group, pts, o) {
  const { color, core = 1.5, glow: gw = 4.5, glowA = 0.14, dash = 0, gap = 0, fade = [8, 8], round = 0, ro = 13, state = 'live',
    beads = { core: 2.1, glow: 6.5, glowA: 0.32, tail: 0.3 }, period = 35, speed = 18, phase = 0, arrows = [0.55], arrow = 5.8, mpp = 0.66,
    side = null, ringAt = 'end', camera = null } = o;
  const pp = round ? fillet(pts.map(arr), round, 10) : pts.map(arr);
  const V = pp.map((p) => new THREE.Vector3(...p)), cum = cumOf(V), len = cum[cum.length - 1];
  const parts = [];
  const add = (obj, base) => { group.add(obj); parts.push({ obj, base }); return obj; };
  if (state === 'designed') {
    const body = add(line(pp, { color, width: 1.2, glow: 0, dash: 1.5 * mpp, gap: 6 * mpp, renderOrder: ro, reveal: false, caps: false, fade: [0, 0] }), 0.5);
    let r = null;
    if (ringAt && camera) {
      const end = ringAt === 'end' ? V[V.length - 1] : V[0];
      const cr = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), cu = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      r = add(ring(end, 4 * mpp, cr, cu, { color, width: 1.2, renderOrder: ro + 1 }), 0.6);
    }
    return { state, V, cum, len, parts, body, ring: r, set(a) { for (const p of parts) p.obj.material.opacity = p.base * a; }, mid: pointAt(V, cum, len * 0.5).p };
  }
  const body = add(line(pp, { color, width: core, glow: gw, glowA, dash, gap, renderOrder: ro, reveal: false, caps: false, fade }), 1);
  let bead = null;
  if (beads) bead = add(comets(pp, { color, core: beads.core, glow: beads.glow, glowA: beads.glowA, period, speed, phase, tail: beads.tail, renderOrder: ro + 1, reveal: false }), 1);
  const heads = [];
  for (const at of arrows) {
    const s0 = at * len, { p, dir } = pointAt(V, cum, s0);
    const sd = side ?? (Math.abs(dir.x) > 0.7 ? UP : RIGHT);
    const c = add(chevron(dir, sd, arrow, color, ro + 2), 1); c.position.copy(p); heads.push(c);
  }
  return { state, V, cum, len, parts, body, bead, heads, set(a) { for (const p of parts) p.obj.material.opacity = p.base * a; }, mid: pointAt(V, cum, len * 0.5).p,
    at: (s) => pointAt(V, cum, s) };
}

// ── glass as a shell: the plane's fill, clamp, sheen and rim on a sphere or a disc ───────────────────────────────
const SHELL_VERT = /* glsl */`
varying vec3 vN; varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const SHELL_FRAG = /* glsl */`
uniform sampler2D tBlur; uniform vec2 uRes; uniform vec3 uFill; uniform float uFillA; uniform vec3 uHair; uniform float uHairA;
uniform float uClamp; uniform float uOpacity; uniform float uSheen; uniform vec3 uTint; uniform float uTintA;
varying vec3 vN; varying vec3 vW;
void main() {
  vec3 V = normalize(cameraPosition - vW), N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  float ndv = abs(dot(N, V));
  vec3 bg = texture2D(tBlur, gl_FragCoord.xy / uRes).rgb;
  float l = dot(bg, vec3(0.2126, 0.7152, 0.0722));
  bg = max(mix(vec3(l), bg, 1.4), 0.0);
  float lf = dot(uFill, vec3(0.2126, 0.7152, 0.0722));
  bg *= min(1.0, (lf + uClamp) / max(dot(bg, vec3(0.2126, 0.7152, 0.0722)), 1e-4));
  vec3 c = mix(bg, uFill, uFillA);
  c = mix(c, uTint, uTintA * (1.0 - ndv));
  // the rim: bright where the shell turns away (its silhouette), a hairline at the very edge
  float fr = pow(1.0 - ndv, 3.0);
  c += uHair * fr * 0.55 * uHairA;
  float px = fwidth(ndv);
  c = mix(c, uHair, (1.0 - smoothstep(0.0, px * 2.2, ndv - px * 0.5)) * uHairA * 0.9);
  // the sheen: a soft highlight up and to the left, as glass.css's 122-degree gradient lights a pane's top left
  vec3 R = reflect(-V, N);
  float sh = pow(max(dot(R, normalize(vec3(-0.45, 0.85, 0.3))), 0.0), 18.0);
  c += vec3(sh * uSheen);
  gl_FragColor = vec4(c, uOpacity * (0.82 + 0.18 * fr));
}`;

export function shellMaterial({ blur, res, theme = 'dark', fill = null, fillA = null, hair = null, tint = '#000000', tintA = 0, opacity = 1, side = THREE.FrontSide }) {
  const dark = theme !== 'light';
  return new THREE.ShaderMaterial({
    vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG, transparent: true, depthWrite: false, side, extensions: { derivatives: true },
    uniforms: {
      tBlur: { value: blur }, uRes: { value: res.clone() }, uFill: { value: lin(fill ?? (dark ? '#1f2429' : '#ffffff')).clone() },
      uFillA: { value: fillA ?? (dark ? 0.34 : 0.14) }, uHair: { value: lin(hair ?? (dark ? '#a9b3bd' : '#9aa3ad')).clone() }, uHairA: { value: dark ? 0.85 : 0.95 },
      uClamp: { value: dark ? 0.05 : 0.3 }, uOpacity: { value: opacity }, uSheen: { value: dark ? 0.32 : 0.2 }, uTint: { value: lin(tint).clone() }, uTintA: { value: tintA },
    },
  });
}

/** A camera fitted to world points (and screen boxes round points: { p, hw, hh } in CSS px) inside rect (stage
 *  fractions), at a fixed azimuth, down-angle and lens: the intro's fitParams (engine.ts), five passes. */
export function fitCamera(stage, W, H, pts, { az, el, vfov, rect, boxes = [] }) {
  const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  let dist = 9000, shift = [0, 0];
  const v = new THREE.Vector3();
  for (let i = 0; i < 6; i++) {
    stage.setCamera({ target: [c.x, c.y, c.z], az, el, dist, vfov, shift, near: dist * 0.5, far: dist * 1.8 });
    stage.camera.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { v.copy(p).project(stage.camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    for (const b of boxes) {
      v.copy(b.p).project(stage.camera); const bx = (2 * b.hw) / W, by = (2 * b.hh) / H;
      x0 = Math.min(x0, v.x - bx); x1 = Math.max(x1, v.x + bx); y0 = Math.min(y0, v.y - by); y1 = Math.max(y1, v.y + by);
    }
    const fx0 = (x0 + 1) / 2, fx1 = (x1 + 1) / 2, fy0 = (1 - y1) / 2, fy1 = (1 - y0) / 2;
    const k = Math.min((rect.x1 - rect.x0) / (fx1 - fx0), (rect.y1 - rect.y0) / (fy1 - fy0));
    dist /= k;
    const cxNow = ((fx0 + fx1) / 2 - 0.5) * k + 0.5, cyNow = ((fy0 + fy1) / 2 - 0.5) * k + 0.5;
    shift = [shift[0] * k + ((rect.x0 + rect.x1) / 2 - cxNow), shift[1] * k - ((rect.y0 + rect.y1) / 2 - cyNow)];
  }
  const pose = { target: [c.x, c.y, c.z], az, el, dist, vfov, shift, near: dist * 0.5, far: dist * 1.8 };
  stage.setCamera(pose);
  // meters a CSS px at the target
  const mpp = (2 * dist * Math.tan((vfov * Math.PI) / 360)) / H;
  return { pose, mpp };
}
