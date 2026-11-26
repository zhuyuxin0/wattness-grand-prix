// @ts-nocheck
// Ported from landing-3d/live/kit/flow.js (27 Oct 2026); the pulses redrawn 28 Oct. Plain JS under a type pass:
// three.js has no types here.
// Power flow as comet pulses, the same look as the region scene's: each pulse is a capsule with a round head, full
// brightness at the head falling to nothing at the tail, a fine core inside a soft glow, both a fixed width in pixels.
// The flow runs over pieces of path (polylines): u is metres from the grid end toward the batteries, continuous where
// the power runs on from one piece into the next, so direction +1 draws power flowing in (charging) and -1 flowing
// out (discharging). Where a piece ends in equipment (a dead-end, the transformer, the switchgear, a skid), the
// pulses fade in or out over a metre or two instead of popping. Two kinds of ribbon: overhead runs face the camera
// (screen-space quads); runs on the ground lie on the ground, spread to the same width in pixels, so the pad and the
// trench covers never clip their glow.

const VERT = /* glsl */`
uniform vec2 uRes; uniform float uHalfW; uniform float uMaxOff;
attribute vec3 aPrev; attribute vec3 aNext; attribute float aSide; attribute float aU; attribute vec4 aEnds;
varying float vU; varying float vAcross; varying float vPxPerM; varying vec4 vEnds; varying vec2 vXZ;
vec2 toPx(vec3 p) { vec4 c = projectionMatrix * modelViewMatrix * vec4(p, 1.0); return c.xy / c.w * 0.5 * uRes; }
void main() {
  vec3 P = position;
  vec2 sP = toPx(P), d1 = sP - toPx(aPrev), d2 = toPx(aNext) - sP;
  float l1 = length(d1), l2 = length(d2);
  if (l1 < 1e-4) d1 = d2;
  if (l2 < 1e-4) d2 = d1;
  vec2 n1 = normalize(vec2(-d1.y, d1.x)), n2 = normalize(vec2(-d2.y, d2.x));
  vec2 nm = normalize(n1 + n2);
  float miter = 1.0 / max(0.4, dot(nm, n1));
  // pixels per meter along the line here (from the segment ahead; behind, at a piece's last point)
  float wl = l2 > 1e-4 ? distance(aNext, P) : distance(P, aPrev);
  vPxPerM = (l2 > 1e-4 ? l2 : l1) / max(wl, 1e-4);
  vU = aU; vEnds = aEnds; vXZ = P.xz; vAcross = aSide * uHalfW;
#ifdef GROUND
  // across the line on the ground, mitred; spread so the ribbon is uHalfW px either side on screen
  vec3 w1 = P - aPrev, w2 = aNext - P;
  if (length(w1.xz) < 1e-4) w1 = w2;
  if (length(w2.xz) < 1e-4) w2 = w1;
  vec3 c1 = normalize(vec3(w1.z, 0.0, -w1.x)), c2 = normalize(vec3(w2.z, 0.0, -w2.x));
  vec3 cm = normalize(c1 + c2);
  float pxPerp = abs(dot(toPx(P + cm) - sP, nm));         // px across the line on screen per meter along cm
  float off = min(uMaxOff, miter * uHalfW / max(pxPerp, 1e-3));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(P + cm * aSide * off, 1.0);
#else
  vec4 c = projectionMatrix * modelViewMatrix * vec4(P, 1.0);
  c.xy += nm * (aSide * uHalfW * miter) / (0.5 * uRes) * c.w;
  gl_Position = c;
#endif
}`;

const FRAG = /* glsl */`
uniform vec3 uColor; uniform float uPhase; uniform float uDir; uniform float uOpacity; uniform vec2 uFarR;
uniform float uPeriod; uniform float uTail; uniform float uCore; uniform float uHalfW; uniform float uGlowA;
varying float vU; varying float vAcross; varying float vPxPerM; varying vec4 vEnds; varying vec2 vXZ;
void main() {
  float ppm = max(vPxPerM, 1e-3);
  float a = mod(uPhase - vU * uDir, uPeriod);              // meters behind the head just ahead of this point
  if (a > uPeriod - uHalfW / ppm) a -= uPeriod;            // just ahead of a head: on its round cap
  float ax = a * ppm;                                      // the same in px (negative ahead of the head)
  float d = ax < 0.0 ? length(vec2(ax, vAcross)) : abs(vAcross); // px from the pulse's spine
  float b = ax <= 0.0 ? 1.0 : pow(clamp(1.0 - a / uTail, 0.0, 1.0), 1.5); // full at the head, nothing at the tail
  float core = clamp(uCore + 0.5 - d, 0.0, 1.0) * b;
  float glow = pow(clamp(1.0 - d / uHalfW, 0.0, 1.0), 1.6) * b * uGlowA;
  float ends = (vEnds.z > 0.0 ? smoothstep(vEnds.x, vEnds.x + vEnds.z, vU) : 1.0)
             * (vEnds.w > 0.0 ? 1.0 - smoothstep(vEnds.y - vEnds.w, vEnds.y, vU) : 1.0);
  float far = 1.0 - smoothstep(uFarR.x, uFarR.y, length(vXZ)); // thins out with distance (site frame, m)
  float al = (core + glow * (1.0 - core)) * ends * far * uOpacity;
  if (al < 0.003) discard;
  gl_FragColor = vec4(uColor * (1.0 + 0.5 * core), al);
}`;

/** The pulses' material. Widths are CSS px (setResolution turns them into drawing-buffer px); period and tail in
 *  metres; the phase advances with the flow's speed (site.ts), so a change of speed never makes the pulses jump. */
export function cometMaterial(THREE, { color = '#2ec7a6', ground = false, period = 9, tail = 4.5, core = 1.5, glow = 6, glowA = 0.34, maxOff = 6 } = {}) {
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    defines: ground ? { GROUND: '' } : {},
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uPhase: { value: 0 }, uDir: { value: 1 }, uOpacity: { value: 1 },
      uFarR: { value: new THREE.Vector2(1e6, 2e6) }, uPeriod: { value: period }, uTail: { value: tail },
      uRes: { value: new THREE.Vector2(1600, 900) }, uCore: { value: core / 2 }, uHalfW: { value: glow / 2 }, uGlowA: { value: glowA },
      uMaxOff: { value: maxOff },
    },
    polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -4,
  });
  m.userData.noAO = true;
  m.userData.css = { core, glow };
  return m;
}

/** Drawing-buffer size and its device-pixel ratio, for the pulses' pixel widths. */
export function setCometResolution(m, w, h, dpr = 1) {
  m.uniforms.uRes.value.set(w, h);
  m.uniforms.uCore.value = (m.userData.css.core / 2) * dpr;
  m.uniforms.uHalfW.value = (m.userData.css.glow / 2) * dpr;
}

/** One geometry for many pieces of path: each { points: [[x, y, z], ...], u0, fadeIn, fadeOut } becomes a ribbon
 *  strip whose vertices carry their neighbours (the shader mitres the joins and sets the width), u, and the piece's
 *  ends: [u0, u1, fadeIn, fadeOut] (m; 0 where the piece runs on into another). Runs longer than `step` metres are
 *  split, so the pixels-per-metre scale stays local. Returns the geometry and each piece's u1. */
export function cometGeometry(THREE, pieces, { step = 3 } = {}) {
  const pos = [], prev = [], next = [], side = [], uu = [], ends = [], idx = [], u1s = [];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  for (const pc of pieces) {
    const P = [];
    pc.points.forEach((a, i) => {
      if (i > 0) {
        const b = pc.points[i - 1], n = Math.max(1, Math.ceil(dist(a, b) / step));
        for (let k = 1; k < n; k++) P.push([0, 1, 2].map((c) => b[c] + ((a[c] - b[c]) * k) / n));
      }
      P.push(a);
    });
    const us = [pc.u0];
    for (let i = 1; i < P.length; i++) us.push(us[i - 1] + dist(P[i], P[i - 1]));
    const u1 = us[us.length - 1], base = pos.length / 3;
    u1s.push(u1);
    for (let i = 0; i < P.length; i++) {
      const pr = P[Math.max(0, i - 1)], nx = P[Math.min(P.length - 1, i + 1)];
      for (const s of [-1, 1]) { pos.push(...P[i]); prev.push(...pr); next.push(...nx); side.push(s); uu.push(us[i]); ends.push(pc.u0, u1, pc.fadeIn || 0, pc.fadeOut || 0); }
      if (i > 0) { const k = base + i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPrev', new THREE.Float32BufferAttribute(prev, 3));
  g.setAttribute('aNext', new THREE.Float32BufferAttribute(next, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(uu, 1));
  g.setAttribute('aEnds', new THREE.Float32BufferAttribute(ends, 4));
  g.setIndex(idx);
  return { geometry: g, u1: u1s };
}

/** Flat ribbon along a polyline on (or above) the ground; points [x, y, z]; u from the first point (the access road). */
export function ribbonGeometry(THREE, points, width, u0 = 0) {
  const pos = [], aU = [], aV = [], idx = [];
  let acc = u0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    let tx = next[0] - prev[0], tz = next[2] - prev[2]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    // miter: average of adjacent segment normals
    let nx = -tz, nz = tx, scale = 1;
    if (i > 0 && i < points.length - 1) {
      const a = [p[0] - prev[0], p[2] - prev[2]], b2 = [next[0] - p[0], next[2] - p[2]];
      const la = Math.hypot(...a), lb = Math.hypot(...b2);
      const n1 = [-a[1] / la, a[0] / la], n2 = [-b2[1] / lb, b2[0] / lb];
      const m = [n1[0] + n2[0], n1[1] + n2[1]], lm = Math.hypot(...m) || 1;
      nx = m[0] / lm; nz = m[1] / lm; scale = 1 / Math.max(0.5, nx * n1[0] + nz * n1[1]);
    }
    if (i > 0) acc += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
    const h = (width / 2) * scale;
    pos.push(p[0] + nx * h, p[1], p[2] + nz * h, p[0] - nx * h, p[1], p[2] - nz * h);
    aU.push(acc, acc); aV.push(0, 1);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(aU, 1));
  g.setAttribute('aV', new THREE.Float32BufferAttribute(aV, 1));
  g.setIndex(idx);
  return { geometry: g, length: acc - u0 };
}
