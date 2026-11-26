// @ts-nocheck
// Ported from landing-3d/live/kit/chartwall.js (27 Oct 2026). Plain JS under a type pass: three.js has no types here.
// The day as a quant chart, in 3D: a display wall standing beside the site, in two strips with their own scales
// (never one dual axis), sharing the time axis, after the Terminal's Candles tab (tabs/candle/panes.ts):
//
//   price strip   hourly candles of the node's 5-minute SCED prices (open, high, low, close; --ch-up / --ch-down,
//                 wicks in the body's colour), the 15-minute real-time settlement price as a thin step (--ch-ink),
//                 the hourly day-ahead price as a step edge to edge (--ch-da, heavier), a $0 baseline plane
//   battery strip its own zero plane; ERCOT's dispatch per hour (the hour's mean base point, MW): discharging above
//                 zero in #eb6834, charging below in #2ec7a6, under 5 MW either way in --ch-grey;
//                 the reserves it held stacked above, in one validated blue: ECRS solid, Non-Spin hatched
//
// The current hour is outlined (2 px) across both strips. The wall draws no text: y ticks, hour ticks and strip
// titles are returned as points (wall frame -> site frame via group) for screen-space plates.
// Wall frame: metres, x along the hours from the left edge of hour 0, y up from the ground, z toward the viewer.
// Every mark is unlit and fed through tone.js, so it lands on its hex under Neutral tone mapping; the whole wall
// is an overlay (userData.overlay: drawn after ambient occlusion).
import { exactColor } from './tone';
import { radialTex } from './textures';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// Chart tokens (docs/console/wattness-terminal-tokens.css, both themes), plus the brand's charge and discharge
// colours and the reserve blue (validated: kit/README.md).
export const WALL_COLORS = {
  dark: { bg: '#191d21', up: '#58d783', down: '#f27059', da: '#b481f0', ink: '#e8eae6', grey: '#6f767d', muted: '#969ca3',
    grid: '#d7d9d4', charge: '#2ec7a6', discharge: '#eb6834', reserve: '#3566d0', outline: '#eef2f6', hair: '#ffffff', post: '#2b3036' },
  light: { bg: '#ffffff', up: '#349c3b', down: '#bb3d2d', da: '#6345b1', ink: '#16181a', grey: '#8b9198', muted: '#636a75',
    grid: '#1a1a1a', charge: '#2ec7a6', discharge: '#eb6834', reserve: '#1f7fd0', outline: '#1a1a1a', hair: '#9aa3ad', post: '#8a9097' },
};

const PANEL_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// Liquid glass, as the Terminal's .glass panes: a tinted fill, a diagonal sheen (glass::after), a rim lit on the top
// edge and shaded on the bottom (--glass-rim), a hairline round the edge.
const PANEL_FRAG = /* glsl */`
uniform vec3 uFill; uniform float uAlpha; uniform float uSheen; uniform vec2 uSize; uniform vec3 uHair; uniform float uGlow;
varying vec2 vUv;
void main() {
  vec2 p = vUv * uSize;                                  // meters from the bottom-left corner
  float edge = min(min(p.x, uSize.x - p.x), min(p.y, uSize.y - p.y));
  float hair = 1.0 - smoothstep(0.08, 0.08 + max(0.12, 1.5 * fwidth(edge)), edge); // never sharper than a pixel and a half
  float topRim = (1.0 - smoothstep(0.0, 0.9, uSize.y - p.y)) * 0.5;
  float botRim = (1.0 - smoothstep(0.0, 0.9, p.y)) * 0.35;
  float t = dot(vUv - 0.5, normalize(vec2(0.53, -0.85))) + 0.5;  // 122 degrees
  float sheen = mix(0.62, 0.10, smoothstep(0.0, 0.22, t)) * (1.0 - smoothstep(0.22, 0.42, t)) + 0.26 * smoothstep(0.74, 0.93, t) * (1.0 - smoothstep(0.93, 1.0, t));
  vec3 c = uFill * (1.0 + uGlow) + vec3(1.0) * (sheen * uSheen + topRim * 0.18) - vec3(botRim * 0.06);
  c = mix(c, uHair, hair * 0.55);
  gl_FragColor = vec4(c, max(uAlpha, hair * 0.7));
}`;

// Non-Spin: the reserve blue, hatched (45 degree stripes in wall metres), so it reads apart from ECRS without a hue.
const HATCH_VERT = /* glsl */`
varying vec3 vP; varying vec3 vN;
void main() { vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const HATCH_FRAG = /* glsl */`
uniform vec3 uA; uniform vec3 uB; uniform float uPitch;
varying vec3 vP; varying vec3 vN;
void main() {
  float s = fract((vP.x + vP.y + vP.z) / uPitch);
  float k = smoothstep(0.42, 0.5, s) * (1.0 - smoothstep(0.92, 1.0, s));
  vec3 c = mix(uA, uB, k);
  float shade = vN.y > 0.5 ? 1.12 : vN.y < -0.5 ? 0.6 : abs(vN.x) > 0.5 ? 0.8 : 1.0;
  gl_FragColor = vec4(c * shade, 1.0);
}`;

export function buildChartWall(THREE, { day, theme = 'dark', pitch = 3.6, price = { min: -25, max: 160, k: 0.16 },
  mw = { min: -50, max: 110, k: 0.1 }, base = 2.4, gap = 6.5, depth = 1.6, threshold = 5 } = {}) {
  const group = new THREE.Group(); group.name = 'chartWall'; group.userData.overlay = true;
  const n = 24, L = pitch * n;
  const hB = (mw.max - mw.min) * mw.k, hP = (price.max - price.min) * price.k;
  const yB0 = base, yBz = yB0 - mw.min * mw.k, yB1 = yB0 + hB;
  const yP0 = yB1 + gap, yPz = yP0 - price.min * price.k, yP1 = yP0 + hP;
  const yP = (p) => yPz + Math.max(price.min, Math.min(price.max, p)) * price.k;
  const yM = (m) => yBz + Math.max(mw.min, Math.min(mw.max, m)) * mw.k;
  const xOf = (h) => h * pitch; // left edge of hour h
  const zMark = 0.35 + depth / 2; // marks' centre plane (the panel's front is z 0.3)
  const zFront = 0.35 + depth + 0.08; // lines drawn just in front of the marks
  const lines = [];
  const lineMat = (o) => { const m = new LineMaterial({ worldUnits: false, transparent: true, depthWrite: false, ...o }); m.resolution.set(1600, 900); lines.push(m); return m; };

  // ── panels (two strips), posts, glow on the ground ─────────────────────────────────────────────
  const panels = [];
  const panel = (y0, y1) => {
    const w = L + 7.0, h = y1 - y0 + 3.2;
    const m = new THREE.ShaderMaterial({ vertexShader: PANEL_VERT, fragmentShader: PANEL_FRAG, transparent: true, depthWrite: true, side: THREE.DoubleSide,
      uniforms: { uFill: { value: new THREE.Color() }, uAlpha: { value: 0.86 }, uSheen: { value: 0.08 }, uSize: { value: new THREE.Vector2(w, h) }, uHair: { value: new THREE.Color() }, uGlow: { value: 0 } } });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.set(L / 2 - 1.0, (y0 + y1) / 2 + 0.2, 0); p.renderOrder = 3; p.name = 'panel';
    group.add(p); panels.push(p);
    return p;
  };
  const panelP = panel(yP0, yP1), panelB = panel(yB0, yB1);
  // at night the panels glow as a display: a soft halo round each, behind it (additive)
  const halos = [];
  for (const p of panels) {
    const { x: w, y: h } = p.material.uniforms.uSize.value, m = 9;
    const hm = new THREE.ShaderMaterial({ vertexShader: PANEL_VERT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color() }, uSize: { value: new THREE.Vector2(w + 2 * m, h + 2 * m) }, uM: { value: m }, uK: { value: 0 } },
      fragmentShader: `uniform vec3 uColor; uniform vec2 uSize; uniform float uM; uniform float uK; varying vec2 vUv;
        void main() { vec2 p = abs(vUv * uSize - uSize * 0.5) - (uSize * 0.5 - uM); float d = length(max(p, 0.0));
          float a = exp(-d * d / (uM * uM * 0.18)) * uK; gl_FragColor = vec4(uColor * a, a); }` });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(w + 2 * m, h + 2 * m), hm);
    halo.position.copy(p.position).setZ(-0.4); halo.renderOrder = 2; halo.visible = false; group.add(halo); halos.push(halo);
  }
  // two slim posts to the ground at each end, and a sill
  const postMat = new THREE.MeshBasicMaterial({ transparent: true });
  const postG = new THREE.Group(); postG.name = 'posts';
  for (const x of [-3.2, L + 1.2]) {
    const pst = new THREE.Mesh(new THREE.BoxGeometry(0.35, yP1 + 1.5, 0.35), postMat); pst.position.set(x, (yP1 + 1.5) / 2, -0.25); postG.add(pst);
  }
  group.add(postG);
  const glowMat = new THREE.MeshBasicMaterial({ alphaMap: radialTex(THREE), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.25, 46).rotateX(-Math.PI / 2), glowMat);
  glow.position.set(L / 2 - 1, 0.05, 14); glow.renderOrder = 2; glow.name = 'groundGlow';
  group.add(glow);

  // ── grid lines and zero planes ─────────────────────────────────────────────────────────────────
  const priceTicks = [0, 50, 100, 150], mwTicks = [-50, 0, 50, 100];
  const gridPts = [];
  for (const p of priceTicks) if (p !== 0) gridPts.push(-0.6, yP(p), 0.33, L + 0.6, yP(p), 0.33);
  for (const m of mwTicks) if (m !== 0) gridPts.push(-0.6, yM(m), 0.33, L + 0.6, yM(m), 0.33);
  for (const h of [6, 12, 18]) { gridPts.push(xOf(h), yP0, 0.33, xOf(h), yP1, 0.33, xOf(h), yB0, 0.33, xOf(h), yB1, 0.33); }
  const gridGeo = new LineSegmentsGeometry(); gridGeo.setPositions(gridPts);
  const gridMat = lineMat({ linewidth: 1, opacity: 0.16 });
  const grid = new LineSegments2(gridGeo, gridMat); grid.renderOrder = 4; group.add(grid);

  const zeroPlaneMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide });
  const zeroLineMat = lineMat({ linewidth: 1.6, opacity: 0.85 });
  const zeros = new THREE.Group(); zeros.name = 'zeroPlanes'; group.add(zeros);
  const zeroDepth = depth + 1.4;
  for (const y of [yPz, yBz]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(L + 1.2, zeroDepth).rotateX(-Math.PI / 2), zeroPlaneMat);
    pl.position.set(L / 2, y, 0.3 + zeroDepth / 2); pl.renderOrder = 4; zeros.add(pl);
    const lg = new LineSegmentsGeometry();
    lg.setPositions([-0.6, y, 0.32, L + 0.6, y, 0.32, -0.6, y, 0.3 + zeroDepth, L + 0.6, y, 0.3 + zeroDepth, -0.6, y, 0.32, -0.6, y, 0.3 + zeroDepth, L + 0.6, y, 0.32, L + 0.6, y, 0.3 + zeroDepth]);
    const l = new LineSegments2(lg, zeroLineMat); l.renderOrder = 7; zeros.add(l);
  }

  // ── marks: candles, battery bars, ECRS (one merged, vertex-coloured mesh), Non-Spin (hatched) ───────────
  const ohlc = day.rt_ohlc_hourly_usd_mwh, net = day.dispatch_mw;
  const ecrs = day.as_awards_mw?.ECRS || new Array(n).fill(0), nspin = day.as_awards_mw?.NSPIN || new Array(n).fill(0);
  const kindOf = (i) => (net[i] < -threshold ? 'charge' : net[i] > threshold ? 'discharge' : 'grey');
  const MIN = 0.14; // m: the thinnest mark, a little over a pixel at chapter 3's distance
  const boxes = []; // { x, y0, y1, w, d, key }
  const hatch = [];
  for (let i = 0; i < n; i++) {
    const cx = xOf(i) + pitch / 2, c = ohlc[i];
    if (c) {
      const up = c.c >= c.o, key = up ? 'up' : 'down';
      let b0 = yP(Math.min(c.o, c.c)), b1 = yP(Math.max(c.o, c.c));
      if (b1 - b0 < MIN) { const m = (b0 + b1) / 2; b0 = m - MIN / 2; b1 = m + MIN / 2; }
      boxes.push({ x: cx, y0: b0, y1: b1, w: pitch * 0.6, d: depth, key });
      boxes.push({ x: cx, y0: yP(c.l), y1: yP(c.h), w: 0.16, d: 0.16, key });
    }
    // the battery's hour, and the reserves it held stacked above what it sent; a mark is never thinner than MIN, as a
    // flat candle is not, so the idle hours' few hundred kW read as a gray tick instead of a sub-pixel sliver
    const v = net[i];
    let top = yBz;
    if (Math.abs(v) > 0.05) {
      let y0 = yM(Math.min(0, v)), y1 = yM(Math.max(0, v));
      if (y1 - y0 < MIN) { if (v > 0) y1 = y0 + MIN; else y0 = y1 - MIN; }
      boxes.push({ x: cx, y0, y1, w: pitch * 0.6, d: depth, key: kindOf(i) });
      if (v > 0) top = y1;
    }
    if (ecrs[i] > 0.5) { const h = Math.max(MIN, ecrs[i] * mw.k); boxes.push({ x: cx, y0: top, y1: top + h, w: pitch * 0.6, d: depth, key: 'reserve' }); top += h; }
    if (nspin[i] > 0.5) { const h = Math.max(MIN, nspin[i] * mw.k); hatch.push({ x: cx, y0: top, y1: top + h, w: pitch * 0.6, d: depth }); top += h; }
  }
  const pos = [], nor = [], idx = [], keys = [];
  for (const b of boxes) {
    const g = new THREE.BoxGeometry(b.w, Math.max(0.02, b.y1 - b.y0), b.d); g.translate(b.x, (b.y0 + b.y1) / 2, zMark);
    const base0 = pos.length / 3;
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    for (const k of g.index.array) idx.push(base0 + k);
    for (let v = 0; v < g.attributes.position.count; v++) keys.push(b.key);
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  geo.setIndex(idx);
  const marks = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
  marks.renderOrder = 5; marks.name = 'marks'; group.add(marks);
  const hpos = [], hnor = [], hidx = [];
  for (const b of hatch) {
    const g = new THREE.BoxGeometry(b.w, b.y1 - b.y0, b.d); g.translate(b.x, (b.y0 + b.y1) / 2, zMark);
    const base0 = hpos.length / 3; hpos.push(...g.attributes.position.array); hnor.push(...g.attributes.normal.array);
    for (const k of g.index.array) hidx.push(base0 + k); g.dispose();
  }
  const hgeo = new THREE.BufferGeometry();
  hgeo.setAttribute('position', new THREE.Float32BufferAttribute(hpos, 3)); hgeo.setAttribute('normal', new THREE.Float32BufferAttribute(hnor, 3)); hgeo.setIndex(hidx);
  const hatchMat = new THREE.ShaderMaterial({ vertexShader: HATCH_VERT, fragmentShader: HATCH_FRAG,
    uniforms: { uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uPitch: { value: 0.9 } } });
  const hatched = new THREE.Mesh(hgeo, hatchMat); hatched.renderOrder = 5; hatched.name = 'nonSpin'; group.add(hatched);

  // ── step lines: the 15-minute real-time price (thin, ink) and the hourly day-ahead price (violet) ─────────
  const rt15 = day.rt_spp_15min_usd_mwh, da = day.da_spp_usd_mwh;
  const stepPts = (vals, per) => {
    const out = []; const w = pitch / per;
    vals.forEach((v, k) => { out.push(k * w, yP(v), zFront, (k + 1) * w, yP(v), zFront); });
    return out;
  };
  const rtGeo = new LineGeometry(); rtGeo.setPositions(stepPts(rt15, 4));
  const rtMat = lineMat({ linewidth: 1.25, opacity: 0.95 });
  const rtLine = new Line2(rtGeo, rtMat); rtLine.renderOrder = 8; rtLine.name = 'rt15'; group.add(rtLine);
  const daGeo = new LineGeometry(); daGeo.setPositions(stepPts(da, 1).map((v, i) => (i % 3 === 2 ? v + 0.04 : v)));
  const daMat = lineMat({ linewidth: 2.4, opacity: 1 });
  const daLine = new Line2(daGeo, daMat); daLine.renderOrder = 9; daLine.name = 'da'; group.add(daLine);

  // ── the current hour's outline, across both strips ─────────────────────────────────────────────
  const outGeo = new LineSegmentsGeometry();
  const outMat = lineMat({ linewidth: 2, opacity: 1, depthTest: false });
  const outline = new LineSegments2(outGeo, outMat); outline.renderOrder = 10; outline.frustumCulled = false; group.add(outline);
  const hourFillMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.07, depthWrite: false });
  const hourFill = new THREE.Mesh(new THREE.PlaneGeometry(pitch, yP1 - yB0 + 1.2), hourFillMat); hourFill.renderOrder = 4; group.add(hourFill);

  for (const o of [...panels, ...halos, postG, glow, grid, zeros, marks, hatched, rtLine, daLine, outline, hourFill]) o.traverse((c) => { c.userData.overlay = true; c.userData.noAO = true; });

  // ── anchors (wall frame) for screen-space plates ───────────────────────────────────────────────
  const fmtUsd = (p) => (p < 0 ? `−$${-p}` : `$${p}`);
  const fmtMw = (m) => (m === 0 ? '0 MW' : m < 0 ? `−${-m} MW` : `+${m} MW`);
  const local = {
    priceTicks: priceTicks.map((p) => ({ text: fmtUsd(p), at: new THREE.Vector3(-0.8, yP(p), 0.3) })),
    mwTicks: mwTicks.map((m) => ({ text: fmtMw(m), at: new THREE.Vector3(-0.8, yM(m), 0.3) })),
    hourTicks: [[0, 'midnight'], [6, '6 am'], [12, 'noon'], [18, '6 pm']].map(([h, text]) => ({ hour: h, text, at: new THREE.Vector3(xOf(h), yB0 - 0.9, 0.3) })),
    // inside each panel's top-left corner (that corner is empty on this day: night hours, low prices)
    titles: [{ id: 'priceTitle', text: 'Price at its node, $/MWh', at: new THREE.Vector3(0.4, yP1 + 1.0, 0.3) },
      { id: 'mwTitle', text: 'Its power, MW: out above 0, in below', at: new THREE.Vector3(0.4, yB1 + 1.0, 0.3) }],
  };
  const anchorOf = (v) => v.clone().applyMatrix4(group.matrix);
  let hour = 0, th = theme;
  const hourTop = () => { const c = ohlc[hour]; return new THREE.Vector3(xOf(hour) + pitch / 2, yP(c ? c.h : 0) + 0.6, zMark); };
  const hourFoot = () => new THREE.Vector3(xOf(hour) + pitch / 2, yB0 - 0.3, zMark);

  function paint() {
    const C = WALL_COLORS[th === 'light' ? 'light' : 'dark'];
    const col = geo.attributes.color.array, nrm = geo.attributes.normal.array;
    const ex = {}; for (const k of ['up', 'down', 'charge', 'discharge', 'grey', 'reserve']) ex[k] = exactColor(THREE, C[k]);
    for (let v = 0; v < keys.length; v++) {
      const c = ex[keys[v]], ny = nrm[v * 3 + 1], nx = Math.abs(nrm[v * 3]);
      const shade = ny > 0.5 ? 1.12 : ny < -0.5 ? 0.6 : nx > 0.5 ? 0.8 : 1.0;
      col[v * 3] = c.r * shade; col[v * 3 + 1] = c.g * shade; col[v * 3 + 2] = c.b * shade;
    }
    geo.attributes.color.needsUpdate = true;
    hatchMat.uniforms.uA.value.copy(ex.reserve);
    hatchMat.uniforms.uB.value.copy(exactColor(THREE, th === 'light' ? '#cfe2f5' : '#1b2a4a'));
    for (const p of panels) { p.material.uniforms.uFill.value.copy(exactColor(THREE, C.bg)); p.material.uniforms.uHair.value.copy(exactColor(THREE, C.hair)); p.material.uniforms.uAlpha.value = th === 'light' ? 0.9 : 0.86; }
    postMat.color.copy(exactColor(THREE, C.post));
    gridMat.color.copy(exactColor(THREE, C.grid)); gridMat.opacity = th === 'light' ? 0.13 : 0.16;
    zeroPlaneMat.color.copy(exactColor(THREE, C.ink)); zeroLineMat.color.copy(exactColor(THREE, C.ink));
    rtMat.color.copy(exactColor(THREE, C.ink)); daMat.color.copy(exactColor(THREE, C.da));
    outMat.color.copy(exactColor(THREE, C.outline)); hourFillMat.color.copy(exactColor(THREE, C.ink));
    // the outline: the hour's slot from the battery strip's foot to the price strip's top
    const x0 = xOf(hour) + 0.08, x1 = xOf(hour + 1) - 0.08, y0 = yB0 - 0.5, y1 = yP1 + 0.5, z = zFront + 0.05;
    outGeo.setPositions([x0, y0, z, x1, y0, z, x1, y0, z, x1, y1, z, x1, y1, z, x0, y1, z, x0, y1, z, x0, y0, z]);
    outline.computeLineDistances();
    hourFill.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0.32);
  }
  paint();

  return {
    group, size: { L, top: yP1 + 1.6, yP0, yP1, yB0, yB1, yPz, yBz, zFront }, yP, yM, xOf, panels: [panelP, panelB],
    /** Ticks and titles as site-frame points (call after the group is placed and its matrix updated). */
    ticks() {
      group.updateMatrix();
      const m = (a) => a.map((t) => ({ ...t, at: anchorOf(t.at) }));
      return { price: m(local.priceTicks), mw: m(local.mwTicks), hours: m(local.hourTicks), titles: m(local.titles) };
    },
    hourTop: () => anchorOf(hourTop()), hourFoot: () => anchorOf(hourFoot()),
    setHour(h) { hour = Math.max(0, Math.min(n - 1, Math.round(h))); paint(); },
    setTheme(t) { th = t; paint(); },
    /** Night: the panels lit as a display, a soft spill on the ground in front. */
    setNight(on, k = 1) {
      for (const p of panels) p.material.uniforms.uGlow.value = on ? (th === 'light' ? 0 : 0.6 * k) : 0;
      for (const h of halos) { h.visible = on; h.material.uniforms.uK.value = 0.55 * k; h.material.uniforms.uColor.value.copy(exactColor(THREE, th === 'light' ? '#9fb6d8' : '#4d6ea8')); }
      glowMat.opacity = on ? 0.22 * k : 0; glowMat.color.copy(exactColor(THREE, th === 'light' ? '#c9d6ea' : '#7e9cc8'));
      glow.visible = on;
    },
    setResolution(w, h) { for (const m of lines) m.resolution.set(w, h); },
  };
}
