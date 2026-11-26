// One brain as Living Brain draws it (SPEC 1.3), in our own code: the body of particles flying home from dust, the
// core's glow, the page dots, the connections as ribbons with their pulses. Everything is emissive and additive, on the
// overlay layer, depth-write off. A cloud is posed by a state (its clock, its formation, its tint toward a member color,
// the selection and its wipe), never by the wall clock, so a frame is a function of its time.
import * as THREE from 'three';
import { brainPoints, pageSpots } from './shape';
import { arcPoints, along, makeRibbons, type RibbonLine, type Ribbons } from './ribbons';
import { rng } from '../../lib/random';

export const BODY_TOP = '#5b8dff';
export const BODY_BOTTOM = '#9b4dff';
export const DOT = '#4c8fff';

/** The calibration (SPEC 3.4, 1.7). Living Brain's constants land on its measured colors through its ACES curve at
 *  1.05; ours run through the kit's Neutral curve at 1, which keeps the darks brighter and the blues more saturated. These
 *  bring our rendered bands back onto the measured table: the body's colors mixed toward their own luminance, its
 *  brightness, the core's light whitening the particles round it, and the connections dimmer. */
export const LOOK = { desat: 0.5, gain: 1.31, white: 0.2, whiteMax: 0.6, hi: 0.25, low: 0.04, edge: 0.8, dot: 1.0, core: 0.8 };

/** The sprites' sizes are drawn for the brain station's 37 degree lens (world.ts VFOV). Under another lens a host
 *  scales sizeK by this, so the particles stay as fine against the brain's shape as the station draws them (the
 *  venue's hub and the stack look through 5 degrees, where the station's sizes come out a seventh as large). */
export function lensK(cam: THREE.Camera): number {
  const c = cam as THREE.PerspectiveCamera;
  if (!c.isPerspectiveCamera || !(c.fov > 0)) return 1;
  return Math.tan((37 / 2) * (Math.PI / 180)) / Math.tan((c.fov / 2) * (Math.PI / 180));
}

const BODY_VERT = /* glsl */`
attribute vec3 aStart;
attribute float aSize;
attribute float aBright;
attribute float aPhase;
attribute float aMix;
uniform float uTime;
uniform float uForm;
uniform float uBreath;
uniform float uCoreK;
uniform float uPixelRatio;
uniform float uHeight;
uniform float uBright;
uniform float uSizeK;
uniform float uTwinkle;
uniform vec3 uViewDir;
uniform vec4 uPush;
varying float vB;
varying float vMix;
varying float vCore;
void main() {
  float seed = fract(sin(aPhase * 127.1) * 43758.5453);
  float region = 0.5 + 0.5 * sin(position.x * 5.0 + position.z * 3.0 + position.y * 4.0);
  float delay = region * 0.12 + seed * 0.06;
  float dur = 0.68 + (1.0 - seed) * 0.12;
  float lp = clamp((uForm - delay) / dur, 0.0, 1.0);
  float settle = lp * lp * lp * (lp * (lp * 6.0 - 15.0) + 10.0);
  vec3 p = mix(aStart, position, settle);
  vec3 radial = normalize(aStart);
  vec3 tangent = cross(radial, vec3(0.0, 1.0, 0.0));
  vec3 bitangent = cross(radial, tangent);
  float env = sin(lp * 3.14159265); env *= env;
  float ph = lp * 4.0 + aPhase;
  p += env * (tangent * (0.24 + seed * 0.18) * sin(ph) + bitangent * 0.16 * cos(ph * 0.8 + region) + radial * 0.06 * sin(lp * 7.0 + aPhase));
  float breath = sin(uTime * 0.95) * uBreath * settle;
  p *= 1.0 + breath;
  float twinkle = mix(1.0, 0.65 + 0.35 * sin(uTime * 1.6 + aPhase * 6.2831853), uTwinkle);
  float front = dot(p, uViewDir);
  float depthB = mix(0.4, 1.15, smoothstep(-0.7, 0.7, front));
  float r = length(p);
  float core = uCoreK * 0.05 / (r * r + 0.025);
  vB = (aBright * twinkle * depthB + core) * uBright;
  vMix = aMix;
  vCore = core;
  vec3 tp = p - uPush.xyz;
  float pd = length(tp);
  p += (pd > 1e-4 ? tp / pd : vec3(0.0)) * smoothstep(0.22, 0.0, pd) * 0.04 * uPush.w;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uSizeK * (1.0 + breath * 1.8) * uPixelRatio * (uHeight * 0.5 / -mv.z);
}`;

const BODY_FRAG = /* glsl */`
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uTint;
uniform float uTintK;
uniform float uDesat;
uniform float uWhite;
uniform float uWhiteMax;
uniform float uHi;
uniform float uLow;
varying float vB;
varying float vMix;
varying float vCore;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  float a = pow(smoothstep(1.0, 0.0, d), 1.6);
  vec3 c = mix(mix(uTop, uBottom, vMix), uTint, uTintK);
  // ACES lifts the blue top toward lavender and keeps the violet bottom; it whitens the brightest
  c = mix(c, vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), uDesat * pow(1.0 - vMix, 3.0));
  c = mix(c, vec3(1.0), clamp(vCore * uWhite + (vB - 0.9) * uHi, 0.0, uWhiteMax));
  c *= mix(1.0, uLow, smoothstep(0.5, 1.0, vMix));
  // and a deeper violet there: ACES takes some red out of #9B4DFF that the Neutral curve keeps
  c.r *= mix(1.0, 0.84, smoothstep(0.55, 1.0, vMix));
  gl_FragColor = vec4(c * vB, a * vB);
}`;

// The core (1.3b): a ray-marched glow in a sphere, its density a clamped inverse-square singularity, a shell band
// broken by ridged noise, and filaments streaked outward; its color by radius from white through ice and deep blue to
// violet. Marched in the core's own frame, so the cloud can stand anywhere and at any scale.
const CORE_VERT = /* glsl */`
varying vec3 vLocal;
void main() { vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CORE_FRAG = /* glsl */`
precision highp float;
uniform float uTime;
uniform float uK;
uniform float uForm;
uniform float uRadius;
uniform float uGain;
uniform vec3 uEye;
varying vec3 vLocal;
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float ridged(float n) { float r = 1.0 - abs(n * 2.0 - 1.0); return r * r; }
float rfbm(vec3 p) { float s = 0.0, a = 0.5, f = 1.0; for (int i = 0; i < 3; i++) { s += ridged(vnoise(p * f)) * a; a *= 0.48; f *= 2.15; } return s; }
float density(vec3 p, float shellR, float t) {
  float r = length(p);
  float sing = uK * 0.0035 / (r * r + 0.0009);
  float band = smoothstep(shellR * 0.62, shellR * 0.92, r) * smoothstep(shellR * 1.55, shellR * 0.95, r);
  float th = acos(clamp(p.y / max(r, 1e-4), -1.0, 1.0)), ph = atan(p.z, p.x);
  float shell = band * (0.25 + rfbm(vec3(th * 2.6, ph * 2.6, r * 3.2 - t * 0.03)) * 1.15) * uK;
  vec3 radial = normalize(p + 1e-4);
  vec3 warped = p + radial * (vnoise(p * 2.6 + radial * t * 0.16) - 0.5) * 0.16;
  float fil = rfbm(warped * 3.4 + vec3(0.0, 0.0, t * 0.05)) * smoothstep(shellR * 1.7, shellR * 0.45, r) * 0.65 * uK;
  // faded to nothing at the march's sphere, so its edge never shows as a disc
  return max(sing + shell + fil, 0.0) * smoothstep(0.19, 0.12, r);
}
vec3 ramp(float r, float shellR) {
  vec3 c = mix(vec3(1.0), vec3(0.490, 0.827, 0.988), smoothstep(0.0, shellR * 0.18, r));
  c = mix(c, vec3(0.11, 0.24, 0.62), smoothstep(shellR * 0.55, shellR * 1.05, r));
  return mix(c, vec3(0.427, 0.157, 0.851), smoothstep(shellR * 1.05, shellR * 1.9, r));
}
void main() {
  vec3 ro = uEye, rd = normalize(vLocal - uEye);
  float R = uRadius;
  float b = dot(ro, rd), c = dot(ro, ro) - R * R, h = b * b - c;
  if (h < 0.0) discard;
  h = sqrt(h);
  float t0 = max(-b - h, 0.0), t1 = -b + h;
  if (t1 <= t0) discard;
  float breathe = sin(uTime * 6.2831853 / 6.4) * 0.5 + sin(uTime * 6.2831853 / 9.7) * 0.5;
  float boost = (1.0 + breathe * 0.18) * mix(0.25, 1.0, uForm);
  float shellR = R * 0.6 * (1.0 + breathe * 0.04) * mix(0.08, 1.0, uForm);
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  const int STEPS = 32;
  float dt = (t1 - t0) / float(STEPS);
  float t = t0 + dt * ign;
  vec4 acc = vec4(0.0);
  for (int i = 0; i < STEPS; i++) {
    if (acc.a > 0.99) break;
    vec3 p = ro + rd * t;
    float d = density(p / R * 0.19, shellR / R * 0.19, uTime) * boost;
    if (d > 0.0001) {
      float a = clamp(d * dt / R * 0.19 * 2.6, 0.0, 1.0);
      acc.rgb += (1.0 - acc.a) * ramp(length(p) / R * 0.19, shellR / R * 0.19) * d * a;
      acc.a += (1.0 - acc.a) * a;
    }
    t += dt;
  }
  gl_FragColor = vec4(acc.rgb * uGain, 1.0);
}`;

// The page dots (1.3c): a bright core and a halo, breathing; selected pages go icy cyan and grow, their connected pages
// brighten a touch, the rest dim.
const DOT_VERT = /* glsl */`
attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;
attribute float aHi;
uniform float uTime;
uniform float uPixelRatio;
uniform float uHeight;
uniform float uSizeK;
varying vec3 vColor;
varying float vGlow;
varying float vHi;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float selT = smoothstep(1.6, 2.4, aHi);
  float conT = smoothstep(1.0, 1.6, aHi) * (1.0 - selT);
  float highT = max(selT, conT);
  float breathe = 0.7 + 0.3 * sin(uTime * 1.6 + aPhase * 6.2831853);
  float calm = 0.88 + 0.1 * sin(uTime * 0.55 + aPhase * 6.2831853);
  vGlow = mix(breathe, calm, highT);
  vColor = aColor;
  vHi = aHi;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uSizeK * (1.0 + 0.38 * selT + 0.14 * conT) * uPixelRatio * (uHeight * 0.5 / -mv.z);
}`;
const DOT_FRAG = /* glsl */`
uniform float uFade;
varying vec3 vColor;
varying float vGlow;
varying float vHi;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  float core = smoothstep(0.32, 0.0, d);
  float halo = pow(smoothstep(1.0, 0.0, d), 1.5);
  float a = max(core, halo * 0.5) * vGlow * uFade;
  float selT = smoothstep(1.6, 2.4, vHi);
  vec3 c = mix(vColor, vec3(1.0), core * 0.55);
  c = mix(c, vec3(0.62, 0.95, 1.0), selT * 0.85);
  gl_FragColor = vec4(c * (0.55 + vGlow * 0.7) * uFade * vHi, a * min(vHi, 1.0));
}`;

// Pulses: two dots per connection on a 10 s loop, offset by half.
const PULSE_VERT = /* glsl */`
attribute vec3 aColor;
attribute float aGlow;
uniform float uPixelRatio;
uniform float uHeight;
uniform float uSizeK;
varying vec3 vColor;
varying float vGlow;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vColor = aColor; vGlow = aGlow;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = 0.026 * uSizeK * uPixelRatio * (uHeight * 0.5 / -mv.z) * mix(1.0, 1.3, clamp(aGlow - 1.0, 0.0, 1.0));
}`;
const PULSE_FRAG = /* glsl */`
uniform float uFade;
varying vec3 vColor;
varying float vGlow;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  float core = smoothstep(0.4, 0.0, d);
  float halo = pow(smoothstep(1.0, 0.0, d), 1.6);
  float a = max(core, halo * 0.5) * vGlow * uFade;
  gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.7) * 1.4 * vGlow, a);
}`;

export interface CloudPage {
  /** A key unique across brains (data.ts keyOf). */
  key: string;
  /** 0.3 + 0.7 x its connections over the brain's most. */
  weight: number;
  color: THREE.Color;
}

export interface CloudEdge {
  /** Page indices into the cloud's pages. */
  a: number;
  b: number;
  sim: number;
  colorA?: THREE.Color;
  colorB?: THREE.Color;
  width?: number;
  gain?: number;
  /** When it draws in, on the cloud's clock; null: drawn with the others. */
  drawAt?: number | null;
}

export interface CloudSpec {
  /** The particles' seed (the brain's). */
  seed: number;
  /** The pages' placement seed (the brain's, or the combined view's). */
  pageSeed: number;
  count: number;
  pages: CloudPage[];
  edges: CloudEdge[];
  /** Edges drawn on their own set (the across connections: their own timing and color). */
  extra?: CloudEdge[];
  core: boolean;
}

export interface CloudState {
  /** The cloud's clock: twinkle, breathing, pulses (seconds). */
  time: number;
  /** Formation progress, 0 dust to 1 formed (3.2 s in Living Brain). */
  form: number;
  /** The core's formation, 0 to 1. */
  coreForm: number;
  /** Breathing amount (0.06 on the main brain, 0 on members). */
  breath: number;
  /** The tint toward a member color and its share (0.72 for a member). */
  tint: THREE.Color;
  tintK: number;
  /** Overall brightness of the body (1), and of the core (1). */
  bright: number;
  coreK: number;
  /** Page dots, connections and pulses fade in from 1.8 to 2.9 s in Living Brain. */
  pageFade: number;
  /** The selected page (index) and the wipe's progress (0 to 1.1 over 2 s), or -1. */
  sel: number;
  selT: number;
  /** Extra page states: 1 normal, 2.4 selected, 1.6 connected, 0.68 dimmed. Null: from sel. */
  hi?: Float32Array | null;
  /** The extra set's clock (its lines draw in at their drawAt) and fade. */
  extraTime?: number;
  extraFade?: number;
  /** The camera, in world space, for the depth term and the core's march. */
  eye: THREE.Vector3;
  pixelRatio: number;
  height: number;
  /** Sprite size multiplier (1) and the hover push (point in local space, strength). */
  sizeK?: number;
  push?: THREE.Vector4;
}

const lin = (hex: string) => new THREE.Color(hex);

export class Cloud {
  readonly group = new THREE.Group();
  readonly body: THREE.Points;
  readonly core: THREE.Mesh | null;
  readonly dots: THREE.Points;
  readonly edges: Ribbons | null;
  readonly extra: Ribbons | null;
  readonly pulses: THREE.Points | null;
  /** Page positions in the cloud's frame, and their curves' points. */
  readonly spots: Float32Array;
  readonly curves: Float32Array[];
  readonly extraCurves: Float32Array[];
  private readonly hi: Float32Array;
  private readonly hiAttr: THREE.BufferAttribute;
  private readonly adj: number[][];
  private readonly pulsePos: THREE.BufferAttribute | null = null;
  private readonly pulseGlow: THREE.BufferAttribute | null = null;
  private readonly bodyU: Record<string, THREE.IUniform>;
  private readonly dotU: Record<string, THREE.IUniform>;
  private readonly coreU: Record<string, THREE.IUniform> | null;
  private readonly pulseU: Record<string, THREE.IUniform> | null;
  private readonly phases: number[];
  private lastSel = -2;
  private readonly tmp = new THREE.Vector3();
  private readonly inv = new THREE.Matrix4();

  constructor(readonly spec: CloudSpec) {
    this.group.name = 'brainCloud';
    // ── the body ──────────────────────────────────────────────────────────────────────────────────────────────
    const P = brainPoints(spec.seed, spec.count);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P.pos, 3));
    g.setAttribute('aStart', new THREE.BufferAttribute(P.start, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(P.size, 1));
    g.setAttribute('aBright', new THREE.BufferAttribute(P.bright, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(P.phase, 1));
    g.setAttribute('aMix', new THREE.BufferAttribute(P.mix, 1));
    this.bodyU = {
      uTime: { value: 0 }, uForm: { value: 1 }, uBreath: { value: 0 }, uCoreK: { value: 1 }, uPixelRatio: { value: 1 }, uHeight: { value: 1080 },
      uBright: { value: 1 }, uSizeK: { value: 1 }, uTwinkle: { value: 1 }, uViewDir: { value: new THREE.Vector3(0, 0, 1) }, uPush: { value: new THREE.Vector4(1e4, 1e4, 1e4, 0) },
      uTop: { value: lin(BODY_TOP) }, uBottom: { value: lin(BODY_BOTTOM) }, uTint: { value: new THREE.Color(1, 1, 1) }, uTintK: { value: 0 },
      uDesat: { value: LOOK.desat }, uWhite: { value: LOOK.white }, uWhiteMax: { value: LOOK.whiteMax }, uHi: { value: LOOK.hi }, uLow: { value: LOOK.low },
    };
    this.body = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, uniforms: this.bodyU,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    }));
    this.body.frustumCulled = false;
    this.group.add(this.body);

    // ── the core ──────────────────────────────────────────────────────────────────────────────────────────────
    if (spec.core) {
      this.coreU = { uTime: { value: 0 }, uK: { value: 1 }, uForm: { value: 1 }, uRadius: { value: 0.19 }, uGain: { value: 0.42 * LOOK.core }, uEye: { value: new THREE.Vector3(0, 0, 3) } };
      this.core = new THREE.Mesh(new THREE.SphereGeometry(0.19, 32, 20), new THREE.ShaderMaterial({
        vertexShader: CORE_VERT, fragmentShader: CORE_FRAG, uniforms: this.coreU,
        transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
      }));
      this.core.frustumCulled = false;
      this.core.renderOrder = 2;
      this.group.add(this.core);
    } else { this.core = null; this.coreU = null; }

    // ── the pages ─────────────────────────────────────────────────────────────────────────────────────────────
    const n = spec.pages.length;
    const S = pageSpots(spec.pageSeed, n);
    this.spots = S.pos;
    const dg = new THREE.BufferGeometry();
    const size = new Float32Array(n), col = new Float32Array(n * 3), ph = new Float32Array(n);
    const pr = rng(spec.pageSeed ^ 0x2545f491);
    spec.pages.forEach((p, i) => { size[i] = 0.03 + 0.026 * p.weight; col.set([p.color.r, p.color.g, p.color.b], i * 3); ph[i] = pr.next(); });
    this.hi = new Float32Array(n).fill(1);
    this.hiAttr = new THREE.BufferAttribute(this.hi, 1);
    dg.setAttribute('position', new THREE.BufferAttribute(S.pos, 3));
    dg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    dg.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    dg.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    dg.setAttribute('aHi', this.hiAttr);
    this.dotU = { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uHeight: { value: 1080 }, uSizeK: { value: 1 }, uFade: { value: 1 } };
    this.dots = new THREE.Points(dg, new THREE.ShaderMaterial({
      vertexShader: DOT_VERT, fragmentShader: DOT_FRAG, uniforms: this.dotU,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    }));
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 3;
    this.group.add(this.dots);

    // ── the connections, their pulses, and the extra set ──────────────────────────────────────────────────────
    const er = rng(spec.pageSeed ^ 0x68e31da4);
    const at = (i: number) => new THREE.Vector3(S.pos[i * 3]!, S.pos[i * 3 + 1]!, S.pos[i * 3 + 2]!);
    const dot = lin(DOT);
    const lineOf = (e: CloudEdge, pts: Float32Array): RibbonLine => ({
      pts, a: e.a, b: e.b, colorA: e.colorA ?? spec.pages[e.a]?.color ?? dot, colorB: e.colorB ?? spec.pages[e.b]?.color ?? dot,
      sim: e.sim, width: e.width, gain: e.gain, drawAt: e.drawAt ?? null,
    });
    this.curves = spec.edges.map((e) => arcPoints(at(e.a), at(e.b), () => er.next()));
    this.phases = spec.edges.map(() => er.next());
    this.adj = Array.from({ length: n }, () => []);
    spec.edges.forEach((e, i) => { this.adj[e.a]?.push(i); this.adj[e.b]?.push(i); });
    if (spec.edges.length) {
      this.edges = makeRibbons(spec.edges.map((e, i) => lineOf(e, this.curves[i]!)));
      this.edges.mesh.renderOrder = 1; this.edges.over.renderOrder = 4;
      this.group.add(this.edges.mesh, this.edges.over);
      const m = spec.edges.length * 2;
      const pg = new THREE.BufferGeometry();
      this.pulsePos = new THREE.BufferAttribute(new Float32Array(m * 3), 3);
      this.pulseGlow = new THREE.BufferAttribute(new Float32Array(m).fill(1), 1);
      const pc = new Float32Array(m * 3);
      spec.edges.forEach((e, i) => {
        const c = (e.colorA ?? spec.pages[e.a]?.color ?? dot).clone().lerp(e.colorB ?? spec.pages[e.b]?.color ?? dot, 0.5);
        pc.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
      });
      pg.setAttribute('position', this.pulsePos); pg.setAttribute('aColor', new THREE.BufferAttribute(pc, 3)); pg.setAttribute('aGlow', this.pulseGlow);
      this.pulseU = { uPixelRatio: { value: 1 }, uHeight: { value: 1080 }, uSizeK: { value: 1 }, uFade: { value: 1 } };
      this.pulses = new THREE.Points(pg, new THREE.ShaderMaterial({
        vertexShader: PULSE_VERT, fragmentShader: PULSE_FRAG, uniforms: this.pulseU,
        transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
      }));
      this.pulses.frustumCulled = false; this.pulses.renderOrder = 3;
      this.group.add(this.pulses);
    } else { this.edges = null; this.pulses = null; this.pulseU = null; }
    this.extraCurves = (spec.extra ?? []).map((e) => arcPoints(at(e.a), at(e.b), () => er.next()));
    if (spec.extra?.length) {
      this.extra = makeRibbons(spec.extra.map((e, i) => lineOf(e, this.extraCurves[i]!)), { overlay: false });
      this.extra.mesh.renderOrder = 2;
      this.group.add(this.extra.mesh);
    } else this.extra = null;
    this.group.traverse((o) => { o.userData.overlay = true; o.userData.noAO = true; });
  }

  /** A page's position in world space now (after the group's transform). */
  pageWorld(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.spots[i * 3]!, this.spots[i * 3 + 1]!, this.spots[i * 3 + 2]!).applyMatrix4(this.group.matrixWorld);
  }

  /** Poses the cloud at a state. The group's transform is set by its owner first (updateMatrixWorld). */
  pose(s: CloudState) {
    const B = this.bodyU;
    this.group.updateMatrixWorld();
    this.inv.copy(this.group.matrixWorld).invert();
    const eyeLocal = this.tmp.copy(s.eye).applyMatrix4(this.inv);
    B.uTime!.value = s.time; B.uForm!.value = s.form; B.uBreath!.value = s.breath; B.uCoreK!.value = s.coreK * (this.core ? 1 : 0);
    B.uPixelRatio!.value = s.pixelRatio; B.uHeight!.value = s.height; B.uBright!.value = s.bright * LOOK.gain;
    B.uDesat!.value = LOOK.desat; B.uWhite!.value = LOOK.white; B.uWhiteMax!.value = LOOK.whiteMax; B.uHi!.value = LOOK.hi; B.uLow!.value = LOOK.low; B.uSizeK!.value = s.sizeK ?? 1;
    (B.uViewDir!.value as THREE.Vector3).copy(eyeLocal).normalize();
    (B.uTint!.value as THREE.Color).copy(s.tint); B.uTintK!.value = s.tintK;
    (B.uPush!.value as THREE.Vector4).copy(s.push ?? new THREE.Vector4(1e4, 1e4, 1e4, 0));
    this.body.visible = s.bright > 0.001;
    if (this.core && this.coreU) {
      this.coreU.uTime!.value = s.time; this.coreU.uK!.value = s.coreK; this.coreU.uForm!.value = s.coreForm;
      (this.coreU.uEye!.value as THREE.Vector3).copy(eyeLocal);
      this.core.visible = s.coreK > 0.001 && s.bright > 0.001;
    }
    const D = this.dotU;
    D.uTime!.value = s.time; D.uPixelRatio!.value = s.pixelRatio; D.uHeight!.value = s.height; D.uSizeK!.value = s.sizeK ?? 1; D.uFade!.value = s.pageFade;
    this.dots.visible = s.pageFade > 0.001;
    // page states: from the selection unless given
    if (s.hi) { this.hi.set(s.hi); this.hiAttr.needsUpdate = true; this.lastSel = -3; }
    else if (s.sel !== this.lastSel) {
      this.hi.fill(s.sel >= 0 ? 0.68 : 1);
      if (s.sel >= 0) {
        for (const ei of this.adj[s.sel] ?? []) { const e = this.spec.edges[ei]!; this.hi[e.a === s.sel ? e.b : e.a] = 1.6; }
        this.hi[s.sel] = 2.4;
      }
      this.hiAttr.needsUpdate = true;
      this.lastSel = s.sel;
    }
    if (this.edges) {
      const U = this.edges.uniforms;
      U.uSel!.value = s.sel; U.uSelT!.value = s.selT; U.uFade!.value = s.pageFade * LOOK.edge; U.uTime!.value = s.time; U.uPixelRatio!.value = s.pixelRatio;
      (U.uRes!.value as THREE.Vector2).set((s.height * s.pixelRatio * this.aspect), s.height * s.pixelRatio);
      this.edges.mesh.visible = s.pageFade > 0.001;
      this.edges.over.visible = s.pageFade > 0.001 && s.sel >= 0;
    }
    if (this.extra) {
      const U = this.extra.uniforms;
      U.uSel!.value = s.sel; U.uSelT!.value = s.selT; U.uFade!.value = s.extraFade ?? 0; U.uTime!.value = s.extraTime ?? 0; U.uPixelRatio!.value = s.pixelRatio;
      (U.uRes!.value as THREE.Vector2).set((s.height * s.pixelRatio * this.aspect), s.height * s.pixelRatio);
      this.extra.mesh.visible = (s.extraFade ?? 0) > 0.001;
    }
    if (this.pulses && this.pulsePos && this.pulseU && this.pulseGlow) {
      const U = this.pulseU;
      U.uPixelRatio!.value = s.pixelRatio; U.uHeight!.value = s.height; U.uSizeK!.value = s.sizeK ?? 1; U.uFade!.value = s.pageFade;
      const v = this.tmp;
      this.curves.forEach((c, i) => {
        for (let k = 0; k < 2; k++) {
          const f = (((s.time / 10 + this.phases[i]! + k * 0.5) % 1) + 1) % 1;
          along(c, f, v);
          this.pulsePos!.setXYZ(i * 2 + k, v.x, v.y, v.z);
          const e = this.spec.edges[i]!;
          this.pulseGlow!.setX(i * 2 + k, s.sel < 0 ? 1 : e.a === s.sel || e.b === s.sel ? 2.5 : 0.45);
        }
      });
      this.pulsePos.needsUpdate = true; this.pulseGlow.needsUpdate = true;
      this.pulses.visible = s.pageFade > 0.001;
    }
  }

  /** The drawing buffer's aspect, for the ribbons' pixel widths (set by the owner on resize). */
  aspect = 16 / 9;

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const x of mats) x.dispose();
    });
  }
}
