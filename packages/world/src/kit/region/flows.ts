// @ts-nocheck
// Lines, flows and strands for chapters 04 and 05: one screen-space line shader for all of them (one program).
//
// Each polyline is an instanced strip of segments. Interior joints are mitred in screen space (the two segments
// meet on the bisector: no overlap, no gap, no notch, so a translucent glow never doubles up at a joint); a
// polyline's own ends get round caps, or none where the line fades out instead. Widths are CSS px at any distance.
// Per fragment the shader knows how far along the line it is (world units) and how far from the spine (px), so it
// draws, all in one pass:
//   line    a fine core with an anti-aliased edge, optionally under a soft glow;
//   dash    capsule dashes (rounded both ends, in screen space);
//   comet   pulses: a capsule whose leading end is round, its brightness running from full at the head to zero at
//           the tail over the pulse's length, inside a soft glow that rounds with it;
//   fades   at either end of the line (a pulse dims into an end instead of popping), a draw-on front that runs
//           along the line, and the entry's reveal round our pad.
import * as THREE from 'three';
import { lin } from './geo';

/** The entry's reveal radius (scene units from our pad's centre), shared by every line that reveals. */
export const REVEAL = { value: 1e9 };
const REVEAL_SOFT = 140;

// the strip: x across (-1, 1); y -1 the start cap, 0 the start, 1 the end, 2 the end cap
const STRIP_POS = [-1, -1, 0, 1, -1, 0, -1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0, -1, 2, 0, 1, 2, 0];
const STRIP_IDX = [0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6, 6, 5, 7];

const VERT = /* glsl */`
uniform vec2 resolution; uniform float linewidth; uniform float uCaps;
attribute vec3 iStart; attribute vec3 iEnd; attribute vec3 iPrev; attribute vec3 iNext; attribute vec2 iDist;
varying vec2 vUv; varying float vS; varying float vUpp; varying float vRevealD; varying float vEnd;
vec2 toPx(vec4 c) { return 0.5 * resolution * (c.xy / c.w); }
void main() {
  mat4 pmv = projectionMatrix * modelViewMatrix;
  vec4 cS = pmv * vec4(iStart, 1.0), cE = pmv * vec4(iEnd, 1.0);
  vec2 pS = toPx(cS), pE = toPx(cE);
  vec2 d = pE - pS; float L = length(d); d = L > 1e-4 ? d / L : vec2(1.0, 0.0);
  vec2 n = vec2(d.y, -d.x);
  float hw = 0.5 * linewidth;
  bool atEnd = position.y > 0.5;
  bool isCap = position.y < -0.5 || position.y > 1.5;
  vec3 me = atEnd ? iEnd : iStart, nb = atEnd ? iNext : iPrev;
  vec2 off = n * (hw * position.x);
  float capK = 0.0;
  if (distance(me, nb) < 1e-5) {
    // the polyline's own end: a round cap, or none
    if (isCap && uCaps > 0.5) { off += d * (atEnd ? hw : -hw); capK = 1.0; }
  } else {
    // an interior joint: mitre on the bisector (the cap collapses onto it)
    vec2 q = toPx(pmv * vec4(nb, 1.0));
    vec2 d2 = atEnd ? q - pE : pS - q; float L2 = length(d2); d2 = L2 > 1e-4 ? d2 / L2 : d;
    vec2 m = n + vec2(d2.y, -d2.x); float ml = length(m); m = ml > 1e-4 ? m / ml : n;
    off = m * (hw * position.x / max(dot(m, n), 0.3));
  }
  vec4 clip = atEnd ? cE : cS;
  clip.xy = ((atEnd ? pE : pS) + off) / (0.5 * resolution) * clip.w;
  gl_Position = clip;
  vUv = vec2(position.x, capK);
  vEnd = atEnd ? 1.0 : -1.0;
  vS = atEnd ? iDist.y : iDist.x;
  vUpp = (iDist.y - iDist.x) / max(L, 1e-3);
  vRevealD = length((modelMatrix * vec4(me, 1.0)).xz);
}`;

const FRAG = /* glsl */`
uniform vec3 diffuse; uniform float opacity; uniform float linewidth; uniform float uCore; uniform float uGlowA;
uniform vec2 uSpan; uniform vec2 uFade; uniform float uDraw; uniform float uDrawSoft; uniform vec2 uDash;
uniform float uReveal; uniform float uRevealOn;
uniform float uComet; uniform float uT; uniform float uDir; uniform float uPeriod; uniform float uTail;
varying vec2 vUv; varying float vS; varying float vUpp; varying float vRevealD; varying float vEnd;
void main() {
  float hw = 0.5 * linewidth, hc = 0.5 * uCore;
  float c = abs(vUv.x) * hw;              // px from the spine
  float cap = vUv.y * hw;                 // px beyond the line's end (round caps only)
  float upp = max(vUpp, 1e-6);            // world units per px along this segment
  float s = vS + vEnd * cap * upp;        // world distance along the line
  float r, b = 1.0;
  if (uComet > 0.5) {
    // the comet's head is where (s * dir - t) / period is a whole number; this fragment is ahead world units behind
    // the next head (a little negative just past one)
    float ahead = (1.0 - fract((s * uDir - uT) / uPeriod)) * uPeriod;
    if (ahead > uPeriod - 3.0 * hw * upp) ahead -= uPeriod;
    float a = ahead / upp;                // px behind the tip
    r = length(vec2(max(hc - a, 0.0), c)); // from the spine of a capsule whose round head ends at the tip
    b = pow(clamp(1.0 - max(ahead, 0.0) / uTail, 0.0, 1.0), 1.25);
  } else if (uDash.x > 0.0) {
    float a = mod(s, uDash.x + uDash.y) / upp, dl = uDash.x / upp;
    r = length(vec2(max(max(hc - a, a - (dl - hc)), 0.0), c));
  } else {
    r = length(vec2(c, cap));
  }
  float core = clamp(hc - r + 0.5, 0.0, 1.0);
  float glow = uGlowA * pow(clamp(1.0 - r / hw, 0.0, 1.0), 1.6);
  float alpha = (core + glow * (1.0 - core)) * b;
  if (uFade.x > 0.0) alpha *= smoothstep(uSpan.x, uSpan.x + uFade.x, s);
  if (uFade.y > 0.0) alpha *= 1.0 - smoothstep(uSpan.y - uFade.y, uSpan.y, s);
  if (uDraw >= 0.0) alpha *= 1.0 - smoothstep(uDraw - uDrawSoft, uDraw, s);   // the draw-on front (-1: drawn)
  if (uRevealOn > 0.5) alpha *= 1.0 - smoothstep(uReveal - ${REVEAL_SOFT.toFixed(1)}, uReveal, vRevealD);
  alpha *= opacity;
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(diffuse, alpha);
}`;

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const arr3 = (p) => (p.isVector3 ? [p.x, p.y, p.z] : [p[0], p[1], p[2]]);

/** Polylines into one instanced strip geometry; closed joins each one's last point back to its first. Returns the
 *  geometry and the first polyline's length (world units). */
export function stripGeometry(lines, closed = false) {
  const S = [], E = [], A = [], N = [], D = [];
  let first = null;
  for (const raw of lines) {
    const P = [];
    for (const q of raw.map(arr3)) if (!P.length || dist3(P[P.length - 1], q) > 1e-4) P.push(q);
    if (closed && P.length > 2 && dist3(P[0], P[P.length - 1]) < 1e-4) P.pop();
    const n = P.length;
    if (n < 2) continue;
    const cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1] + dist3(P[i - 1], P[i]));
    const total = closed ? cum[n - 1] + dist3(P[n - 1], P[0]) : cum[n - 1];
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = P[i], b = P[(i + 1) % n];
      const prev = i > 0 ? P[i - 1] : closed ? P[n - 1] : a;
      const next = i + 2 < n ? P[i + 2] : closed ? P[(i + 2) % n] : b;
      S.push(...a); E.push(...b); A.push(...prev); N.push(...next);
      D.push(cum[i], i + 1 < n ? cum[i + 1] : total);
    }
    if (first == null) first = total;
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setIndex(STRIP_IDX);
  g.setAttribute('position', new THREE.Float32BufferAttribute(STRIP_POS, 3));
  g.setAttribute('iStart', new THREE.InstancedBufferAttribute(new Float32Array(S), 3));
  g.setAttribute('iEnd', new THREE.InstancedBufferAttribute(new Float32Array(E), 3));
  g.setAttribute('iPrev', new THREE.InstancedBufferAttribute(new Float32Array(A), 3));
  g.setAttribute('iNext', new THREE.InstancedBufferAttribute(new Float32Array(N), 3));
  g.setAttribute('iDist', new THREE.InstancedBufferAttribute(new Float32Array(D), 2));
  g.instanceCount = S.length / 3;
  return { geometry: g, length: first ?? 0 };
}

function material({ color, core, glow, glowA, opacity, dash, gap, reveal, caps, fade, length, comet, depthTest }) {
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest, side: THREE.DoubleSide,
    uniforms: {
      resolution: { value: new THREE.Vector2(1, 1) }, linewidth: { value: 1 }, uCore: { value: 1 }, uGlowA: { value: glowA },
      diffuse: { value: lin(color).clone() }, opacity: { value: 1 }, uCaps: { value: caps ? 1 : 0 },
      uSpan: { value: new THREE.Vector2(0, length) }, uFade: { value: new THREE.Vector2(fade[0], fade[1]) }, uDraw: { value: -1 }, uDrawSoft: { value: 1 },
      uDash: { value: new THREE.Vector2(dash, gap) }, uReveal: REVEAL, uRevealOn: { value: reveal ? 1 : 0 },
      uComet: { value: comet ? 1 : 0 }, uT: { value: 0 }, uDir: { value: comet?.dir ?? 1 }, uPeriod: { value: comet?.period ?? 1 },
      uTail: { value: comet?.tail ?? 1 },
    },
  });
  m.opacity = opacity;
  // the material's own opacity is what the scene animates; the uniform reads it
  Object.defineProperty(m.uniforms.opacity, 'value', { get: () => m.opacity, set: () => {} });
  // the quad is the glow's width, or the core's plus a pixel each side for its anti-aliased edge (CSS px)
  m.userData.fine = { quad: Math.max(core + 1.5, glow), core };
  if (comet) m.userData.pulse = { t: m.uniforms.uT, speed: comet.speed, phase: comet.phase ?? 0 };
  m.customProgramCacheKey = () => 'wl-fine-v3';
  return m;
}

function mesh(geometry, mat, renderOrder) {
  const o = new THREE.Mesh(geometry, mat);
  o.frustumCulled = false; o.renderOrder = renderOrder; o.userData.overlay = true; o.userData.length = mat.uniforms.uSpan.value.y;
  return o;
}

/** A line: a fine core (width, CSS px) under an optional soft glow (glow: its full width, glowA: its alpha); dash and
 *  gap in world units; caps: round ends; fade: [start, end] lengths (world) over which it fades in and out. */
export function line(points, { color, width = 1, glow = 0, glowA = 0.3, opacity = 1, dash = 0, gap = 0, renderOrder = 2, depthTest = true,
  reveal = true, caps = true, fade = [0, 0], closed = false } = {}) {
  const { geometry, length } = stripGeometry([points], closed);
  const m = material({ color, core: width, glow, glowA: glow ? glowA : 0, opacity, dash, gap, reveal, caps: caps && !closed, fade, length, comet: null, depthTest });
  return mesh(geometry, m, renderOrder);
}

/** Several polylines of one look as one draw (the network's lines of one voltage, the collectors). */
export function lines(polys, { color, width = 1, opacity = 1, renderOrder = 2, reveal = true, caps = true } = {}) {
  const { geometry } = stripGeometry(polys);
  const m = material({ color, core: width, glow: 0, glowA: 0, opacity, dash: 0, gap: 0, reveal, caps, fade: [0, 0], length: 1e5, comet: null, depthTest: true });
  return mesh(geometry, m, renderOrder);
}

/** Pulses along a polyline: comets with a round head (core, CSS px) in a soft glow (glow, glowA), every period world
 *  units, moving speed units per second from the first point toward the last; tail: the comet's length as a share of
 *  the period; fade: [start, end] lengths over which they come in and leave. */
export function comets(points, { color, core = 1.5, glow = 6, glowA = 0.3, period = 46, speed = 34, phase = 0, tail = 0.46, opacity = 1,
  renderOrder = 3, reveal = true, fade = null, dir = 1 } = {}) {
  const { geometry, length } = stripGeometry([points]);
  const f = fade ?? [Math.min(period * 0.9, length * 0.2), Math.min(period * 1.2, length * 0.25)];
  const m = material({ color, core, glow, glowA, opacity, dash: 0, gap: 0, reveal, caps: false, fade: f, length,
    comet: { period, tail: tail * period, speed, phase, dir }, depthTest: true });
  return mesh(geometry, m, renderOrder);
}

/** A ground flow: comets with their glow, as one draw (its weight follows the hour). */
export function flow(points, { color, core = 1.5, glow = 6, glowA = 0.3, period = 46, speed = 34, phase = 0, tail = 0.62, renderOrder = 3 }) {
  const o = comets(points, { color, core, glow, glowA, period, speed, phase, tail, renderOrder });
  o.userData.flow = true;
  return o;
}

/** Draw a line on up to distance d (world units along it), with a soft front of soft units. */
export function setDraw(o, d, soft = 12) {
  const u = o.material?.uniforms; if (!u?.uDraw) return;
  u.uDraw.value = Math.max(0, d); u.uDrawSoft.value = soft;
}

/** Show only the stretch of a line from a to b (world units along it); its fades run inside that stretch. */
export function setSpan(o, a, b) {
  const u = o.material?.uniforms; if (!u?.uSpan) return;
  u.uSpan.value.set(a, b);
}

export function tickPulses(root, seconds) {
  root.traverse((o) => { const p = o.material?.userData?.pulse; if (p) p.t.value = p.phase + seconds * p.speed; });
}

/** Keep every line at its CSS widths for the drawing buffer. */
export function setLineResolution(root, w, h, dpr) {
  root.traverse((o) => {
    const m = o.material, f = m?.userData?.fine;
    if (f) { m.uniforms.resolution.value.set(w * dpr, h * dpr); m.uniforms.linewidth.value = f.quad * dpr; m.uniforms.uCore.value = f.core * dpr; }
    else if (m && m.isLineMaterial) { m.resolution.set(w * dpr, h * dpr); if (m.userData.cssWidth) m.linewidth = m.userData.cssWidth * dpr; }
  });
}

/** Round a polyline's corners ([x, y, z] points; r in world units, kept under 45% of either neighbouring segment):
 *  each corner becomes an arc of seg pieces, so lines and the pulses on them turn smoothly. */
export function fillet(points, r, seg = 6) {
  const P = points.map(arr3);
  if (P.length < 3 || r <= 0) return P;
  const out = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const p = P[i], a = P[i - 1], b = P[i + 1];
    const u = [a[0] - p[0], a[1] - p[1], a[2] - p[2]], v = [b[0] - p[0], b[1] - p[1], b[2] - p[2]];
    const lu = Math.hypot(...u), lv = Math.hypot(...v);
    if (lu < 1e-6 || lv < 1e-6) continue;
    const un = u.map((x) => x / lu), vn = v.map((x) => x / lv);
    const cos = Math.max(-1, Math.min(1, un[0] * vn[0] + un[1] * vn[1] + un[2] * vn[2]));
    const th = Math.acos(cos);                   // the angle between the two legs at the corner
    if (th > Math.PI - 1e-3) { out.push(p); continue; } // straight on
    const t = Math.min(r / Math.tan(th / 2), 0.45 * lu, 0.45 * lv);
    const A = p.map((x, k) => x + un[k] * t), B = p.map((x, k) => x + vn[k] * t);
    // a quadratic Bezier through the corner is close to the arc and stays tangent to both legs
    for (let k = 0; k <= seg; k++) {
      const s = k / seg, w0 = (1 - s) * (1 - s), w1 = 2 * s * (1 - s), w2 = s * s;
      out.push([0, 1, 2].map((j) => w0 * A[j] + w1 * p[j] + w2 * B[j]));
    }
  }
  out.push(P[P.length - 1]);
  return out;
}
