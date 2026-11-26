// License to launch (OpenFour): a 44 m glass tower on its podium, the bonding tube inside with a lit glass spiral whose
// turns are the agent's sealed days, the graduation gate at the top with its two lamps (liquidity; sealed before the
// gate) and an iris shutter, the agent's card on a brass-edged plinth at the foot, and the pool. T03 is the state today
// (one lamp lit by the 26 Nov record, the shutter shut); T04 is the design of graduation (both lamps lit, the shutter
// open, the token's disc on its arc into the pool).
import * as THREE from 'three';
import type { FrameContext, FrameHandle } from '../types';
import type { Vec3 } from '../../lib/stage';
import { caption } from '../../words';
import {
  HEX, exact, night, towerMaterials, plinth, track, along, poles, glows, pool, glassKit, faceOf, placeScreen, el, frameTick,
  mount, short, int, tagPlates, createBuilder, line, comets, grabTex, type Glow, type Mats,
} from './set';

/** The agent's token, one constant until the organizers answer on testnet tickers. */
export const AGENT_TOKEN = 'PLNR';

const C = { x: 330, z: 172 };            // the tower's center
const POD = { w: 14, h: 2.4 };           // the podium
const SHAFT = { w: 11, y0: 2.5, y1: 42 }; // the glass shaft
const TUBE = { r: 3, y0: 2.6, y1: 36 };   // the bonding tube
const GATE = { y0: 36, y1: 40 };
const POOL = { x: 400, z: 180, r: 15, y: 0.95 };
const CARD = { x: 330, z: 186, w: 5.2, h: 6.4, y: 1.15 };
const SPIRAL = { r: 2.25, rise: 2.9, y0: 3.4 }; // one turn per sealed day, rising 2.9 m

export type LaunchState = 'blocked' | 'graduate';

function hatchTexture() {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = '#111416'; g.fillRect(0, 0, s, s);
  g.strokeStyle = '#3a4148'; g.lineWidth = 10;
  for (let i = -s; i < 2 * s; i += 22) { g.beginPath(); g.moveTo(i, s); g.lineTo(i + s, 0); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** The helix's points, from turn a to turn b (turns from the spiral's foot). */
function helix(a: number, b: number, step = 0.04): number[][] {
  const pts: number[][] = [];
  for (let k = a; k <= b + 1e-9; k += step) {
    const th = k * Math.PI * 2 - Math.PI / 2;
    pts.push([C.x + Math.cos(th) * SPIRAL.r, SPIRAL.y0 + k * SPIRAL.rise, C.z + Math.sin(th) * SPIRAL.r]);
  }
  return pts;
}

/** The token's arc from the tube's mouth to the pool: up and over, a quadratic in the vertical plane through both. */
export function arcPoints(n = 80): number[][] {
  const a = new THREE.Vector3(C.x, GATE.y1 + 1.2, C.z), b = new THREE.Vector3(POOL.x, POOL.y + 0.2, POOL.z);
  const m = a.clone().lerp(b, 0.42); m.y = GATE.y1 + 26; // clears the crown's parapet on the way out
  const out: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a.x + 2 * u * t * m.x + t * t * b.x, u * u * a.y + 2 * u * t * m.y + t * t * b.y, u * u * a.z + 2 * u * t * m.z + t * t * b.z]);
  }
  return out;
}

export function buildLaunchTower(ctx: FrameContext, mats: Mats, o: { far?: boolean; state: LaunchState; glass?: ReturnType<typeof glassKit>; days?: number }) {
  const group = new THREE.Group(); group.name = 'launchTower';
  const lit = o.state === 'graduate';
  const days = o.days ?? 1;
  const b = createBuilder(THREE);
  const hw = POD.w / 2, sw = SHAFT.w / 2;
  // podium: graphite concrete, chamfered, a shadow gap and a brass-free steel kick plate
  b.box('pod|concrete', POD.w, POD.h, POD.w, C.x, POD.h / 2, C.z, { c: 0.12 });
  b.box('pod|graphiteDark', POD.w + 0.3, 0.14, POD.w + 0.3, C.x, POD.h - 0.07, C.z, { c: 0.04 });
  // the shaft's frame: corner columns, ring beams, mullions on each face
  const cols: [number, number][] = [[-sw, -sw], [sw, -sw], [sw, sw], [-sw, sw]];
  for (const [dx, dz] of cols) b.box('frame|steel', 0.42, SHAFT.y1 - SHAFT.y0, 0.42, C.x + dx, (SHAFT.y0 + SHAFT.y1) / 2, C.z + dz, { c: 0.04 });
  for (let y = SHAFT.y0 + 0.15; y <= SHAFT.y1 + 0.01; y += (SHAFT.y1 - SHAFT.y0 - 0.3) / 8) {
    b.box('frame|steel', SHAFT.w + 0.3, 0.16, 0.2, C.x, y, C.z - sw).box('frame|steel', SHAFT.w + 0.3, 0.16, 0.2, C.x, y, C.z + sw);
    b.box('frame|steel', 0.2, 0.16, SHAFT.w + 0.3, C.x - sw, y, C.z).box('frame|steel', 0.2, 0.16, SHAFT.w + 0.3, C.x + sw, y, C.z);
  }
  for (const f of [-1, 1]) for (const k of [-1, 1]) {
    b.box('frame|galv', 0.08, SHAFT.y1 - SHAFT.y0, 0.12, C.x + k * sw / 3, (SHAFT.y0 + SHAFT.y1) / 2, C.z + f * (sw + 0.02));
    b.box('frame|galv', 0.12, SHAFT.y1 - SHAFT.y0, 0.08, C.x + f * (sw + 0.02), (SHAFT.y0 + SHAFT.y1) / 2, C.z + k * sw / 3);
  }
  // the crown: a cap plate with a chamfer, a shadow line, a steel parapet
  b.box('crown|graphite', SHAFT.w + 1.2, 0.7, SHAFT.w + 1.2, C.x, SHAFT.y1 + 0.35, C.z, { c: 0.08 });
  b.box('crown|graphiteDark', SHAFT.w + 0.6, 0.18, SHAFT.w + 0.6, C.x, SHAFT.y1 + 0.79, C.z, { c: 0.03 });
  b.box('crown|galv', SHAFT.w + 1.0, 1.4, 0.12, C.x, SHAFT.y1 + 1.4, C.z - sw - 0.4).box('crown|galv', SHAFT.w + 1.0, 1.4, 0.12, C.x, SHAFT.y1 + 1.4, C.z + sw + 0.4);
  b.box('crown|galv', 0.12, 1.4, SHAFT.w + 1.0, C.x - sw - 0.4, SHAFT.y1 + 1.4, C.z).box('crown|galv', 0.12, 1.4, SHAFT.w + 1.0, C.x + sw + 0.4, SHAFT.y1 + 1.4, C.z);
  // the tube's collar at its foot and the gate's housing at its mouth (a steel drum with ribs)
  b.cyl('tube|galv', TUBE.r + 0.45, 0.6, C.x, TUBE.y0 + 0.2, C.z, { seg: 64 });
  b.cyl('gate|graphite', TUBE.r + 0.9, GATE.y1 - GATE.y0, C.x, (GATE.y0 + GATE.y1) / 2, C.z, { seg: 72, open: true });
  b.torus('gate|steel', TUBE.r + 0.9, 0.16, C.x, GATE.y0, C.z, { rx: Math.PI / 2, seg: 72, tube: 8 });
  b.torus('gate|steel', TUBE.r + 0.9, 0.16, C.x, GATE.y1, C.z, { rx: Math.PI / 2, seg: 72, tube: 8 });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    b.box('gate|steel', 0.14, GATE.y1 - GATE.y0, 0.3, C.x + Math.cos(a) * (TUBE.r + 1.0), (GATE.y0 + GATE.y1) / 2, C.z + Math.sin(a) * (TUBE.r + 1.0), { ry: -a });
  }
  // the graduation mark: a brass ring round the tube at the module's threshold (a design height, not a market figure)
  const markY = GATE.y0 - 2.4;
  b.torus('mark|brass', TUBE.r + 0.12, 0.09, C.x, markY, C.z, { rx: Math.PI / 2, seg: 72, tube: 8 });
  // the signal head: a graphite housing on two posts at the crown's north side (the tube's mouth stays open for the
  // launch), turned to face the approach along A9 (compass HEAD.az); the gate's two lamps under deep hoods:
  // liquidity (left) and the attributable record (right)
  const HEAD = { az: 160, y: SHAFT.y1 + 7.6, w: 13.6, h: 5.2, d: 2.0, dx: 3.3, r: 1.6, ox: 0, oz: -3.6 };
  const ry = Math.PI - (HEAD.az * Math.PI) / 180, hz = HEAD.d / 2;
  const cr = Math.cos(ry), sr = Math.sin(ry);
  const hp = (x: number, y: number, z: number): Vec3 => [C.x + HEAD.ox + x * cr + z * sr, HEAD.y + y, C.z + HEAD.oz - x * sr + z * cr];
  b.at(C.x + HEAD.ox, HEAD.y, C.z + HEAD.oz, ry);
  const post = HEAD.y - HEAD.h / 2 - (SHAFT.y1 + 0.7);
  for (const s of [-1, 1]) {
    b.box('head|graphite', 0.9, post, 1.1, s * (HEAD.w / 2 - 0.9), -HEAD.h / 2 - post / 2, 0, { c: 0.05 });
    b.box('head|steel', 1.5, 0.3, 1.7, s * (HEAD.w / 2 - 0.9), -HEAD.h / 2 - post + 0.15, 0, { c: 0.04 });
  }
  b.box('head|graphite', HEAD.w, HEAD.h, HEAD.d, 0, 0, 0, { c: 0.22 });
  b.box('head|steel', HEAD.w + 0.36, 0.24, HEAD.d + 0.36, 0, HEAD.h / 2 + 0.12, 0, { c: 0.06 });
  b.box('head|graphiteDark', HEAD.w - 0.6, 0.14, 0.04, 0, HEAD.h / 2 - 0.42, hz + 0.01);
  b.box('head|graphiteDark', HEAD.w - 0.6, 0.14, 0.04, 0, -HEAD.h / 2 + 0.42, hz + 0.01);
  b.box('head|graphiteDark', 0.12, HEAD.h - 1.2, 0.04, 0, 0, hz + 0.01);
  for (const s of [-1, 1]) {
    // hood: a thick-walled visor ring standing 1.5 m proud, its inside dark; a steel bezel at the lens
    b.lathe('head|graphiteDark', [[HEAD.r + 0.2, 0], [HEAD.r + 0.38, 0], [HEAD.r + 0.38, 0.85], [HEAD.r + 0.2, 0.85], [HEAD.r + 0.2, 0]], s * HEAD.dx, 0, hz + 0.02, { rx: Math.PI / 2, seg: 64 });
    b.torus('head|steel', HEAD.r + 0.12, 0.12, s * HEAD.dx, 0, hz + 0.08, { seg: 64, tube: 10 });
    b.torus('head|steel', HEAD.r + 0.29, 0.07, s * HEAD.dx, 0, hz + 0.87, { seg: 64, tube: 8 });
  }
  b.pop();
  const built = b.build({ concrete: mats.concrete, graphite: mats.graphite, graphiteDark: mats.graphiteDark, steel: mats.m.steel, galv: mats.m.galv, brass: mats.brass });
  group.add(built.group);

  // the lenses: liquidity (left) and sealed before the gate (right); an unmet lamp is dark and hatched
  const lensGeo = new THREE.CircleGeometry(HEAD.r, 64);
  const liquidityOn = lit;
  const lensL = new THREE.Mesh(lensGeo, liquidityOn ? mats.emissive(HEX.teal, 3.2, '#0f1a17') : new THREE.MeshStandardMaterial({ map: hatchTexture(), roughness: 0.3, metalness: 0.1 }));
  const lensR = new THREE.Mesh(lensGeo, mats.emissive(HEX.teal, 3.2, '#0f1a17'));
  for (const [m, s] of [[lensL, -1], [lensR, 1]] as const) { m.position.set(...hp(s * HEAD.dx, 0, hz + 0.1)); m.rotation.y = ry; group.add(m); }
  const lampPos = (s: number, out = 0.6): Vec3 => hp(s * HEAD.dx, 0, hz + out);

  // the spiral: one lit turn per sealed day; the rest of its path to the gate a faint guide
  const turns = (TUBE.y1 - 1.5 - SPIRAL.y0) / SPIRAL.rise;
  const litTurns = lit ? turns : days;
  // a fine lit core with a soft glow round it (both in the opaque pass, so the tube's glass refracts them)
  const curve = new THREE.CatmullRomCurve3(helix(0, litTurns).map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const spiral = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, Math.round(litTurns * 72)), 0.075, 8, false), mats.emissive(HEX.teal, lit ? 2.2 : 3.0, '#0d1614'));
  spiral.userData.noAO = true; group.add(spiral);
  const sheen = line(helix(0, litTurns, 0.02), { color: HEX.teal, width: 1.4, glow: 9, glowA: lit ? 0.22 : 0.3, opacity: 0.6, reveal: false, renderOrder: 6 });
  sheen.userData.noAO = true; group.add(sheen);
  const guide = line(helix(litTurns, turns), { color: HEX.muted, width: 1, opacity: 0.32, dash: 0.4, gap: 0.5, reveal: false, renderOrder: 6 });
  guide.userData.noAO = true; group.add(guide);
  // a bead where the lit path ends: today's turn
  const halo: Glow[] = [];
  const end = helix(litTurns, litTurns)[0]!;
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mats.emissive(HEX.teal, 4.0, '#0d1614'));
  bead.position.set(end[0]!, end[1]!, end[2]!); bead.userData.noAO = true; group.add(bead);
  halo.push({ at: end as Vec3, size: 2.6, hex: HEX.teal, alpha: 0.85, sharp: 0.8, k: 1.2 });

  // the iris: eight blades, shut (blocked) or drawn back (graduation)
  const iris = new THREE.Group(); iris.position.set(C.x, GATE.y0 + 1.6, C.z);
  const blade = new THREE.Shape();
  blade.moveTo(0, 0); blade.lineTo(TUBE.r * 1.05, -0.25); blade.quadraticCurveTo(TUBE.r * 1.12, TUBE.r * 0.55, TUBE.r * 0.55, TUBE.r * 0.98); blade.lineTo(0, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(blade, { depth: 0.06, bevelEnabled: false }).rotateX(Math.PI / 2);
  const open = lit ? 1 : 0;
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(bladeGeo, mats.m.steel);
    const a = (i / 8) * Math.PI * 2;
    const r0 = open * TUBE.r * 0.82;
    m.position.set(Math.cos(a) * r0, i * 0.012, Math.sin(a) * r0);
    m.rotation.y = -a - open * 0.9; m.castShadow = true;
    iris.add(m);
  }
  group.add(iris);

  // the fill: in graduation the tube holds its curve's reserve up to the mark (a light, not a liquid of any token)
  let fill: THREE.Mesh | null = null;
  if (lit) {
    const fm = new THREE.MeshBasicMaterial({ color: exact(HEX.teal, 0.42), transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
    fm.userData.noAO = true;
    // in the opaque pass (not the overlay), so the tube's glass refracts it rather than covering it
    fill = new THREE.Mesh(new THREE.CylinderGeometry(TUBE.r - 0.12, TUBE.r - 0.12, markY - TUBE.y0 - 0.4, 64, 1, false).translate(C.x, (markY + TUBE.y0 + 0.4) / 2 - 0.0, C.z), fm);
    fill.userData.noAO = true; fill.renderOrder = 2;
    group.add(fill);
    const men = new THREE.Mesh(new THREE.CircleGeometry(TUBE.r - 0.12, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: exact(HEX.teal, 1.1), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    men.position.set(C.x, markY - 0.2, C.z); men.userData.noAO = true; men.renderOrder = 2;
    group.add(men);
  }

  // glows: the lit lamps (a tight core and a wide bloom each), the spiral's light in the tube, the crown's edge
  for (const s of liquidityOn ? [-1, 1] : [1]) {
    halo.push({ at: lampPos(s, 0.4), size: 4.2, hex: HEX.teal, alpha: 0.9, sharp: 0.75, k: 1.3 });
    halo.push({ at: lampPos(s, 0.8), size: 14, hex: HEX.teal, alpha: 0.32, sharp: 0.1, k: 1.0 });
  }
  halo.push({ at: [C.x, SPIRAL.y0 + 1.5, C.z], size: 9, hex: HEX.teal, alpha: lit ? 0.22 : 0.16, sharp: 0 });
  if (lit) halo.push({ at: [C.x, (markY + TUBE.y0) / 2, C.z], size: 26, hex: HEX.teal, alpha: 0.1, sharp: 0 });
  const crownLed = line([[C.x - sw - 0.6, SHAFT.y1 + 0.05, C.z + sw + 0.62], [C.x + sw + 0.6, SHAFT.y1 + 0.05, C.z + sw + 0.62]], { color: HEX.rim, width: 1.2, glow: 0, reveal: false, renderOrder: 5 });
  crownLed.userData.noAO = true; group.add(crownLed);

  // lights: the lit lamps throw teal on the head and the crown; the spiral lights the tube's foot
  const lampLight = new THREE.PointLight(HEX.teal, lit ? 170 : 110, 26, 1.8); lampLight.position.set(...(lit ? hp(0, -0.5, hz + 4) : lampPos(1, 3.5)));
  const tubeLight = new THREE.PointLight('#7fe0c9', lit ? 120 : 60, 18, 1.8); tubeLight.position.set(C.x, SPIRAL.y0 + 2, C.z);
  group.add(lampLight, tubeLight);
  // uplights at the podium's corners wash the shaft's frame (cool, not the Arcade's warmth)
  if (!o.far) {
    for (const [dx, dz] of [[-1, 1], [1, 1]] as const) {
      const up = new THREE.SpotLight('#dfe9f2', 900, 60, Math.PI * 0.07, 0.6, 1.4);
      up.position.set(C.x + dx * (sw + 0.9), POD.h + 0.2, C.z + dz * (sw + 0.9)); up.target.position.set(C.x + dx * (sw - 0.2), SHAFT.y1, C.z + dz * (sw - 0.2));
      group.add(up, up.target);
    }
  }

  // glass: the shaft's four faces and the tube (the far view draws the shaft's faces as a faint tint and its edges)
  if (!o.far && o.glass) {
    const gk = o.glass;
    const faces: [number, number, number][] = [[0, sw, 0], [0, -sw, Math.PI], [sw, 0, Math.PI / 2], [-sw, 0, -Math.PI / 2]];
    for (const [dx, dz, ry] of faces) {
      const p = gk.pane(SHAFT.w, SHAFT.y1 - SHAFT.y0, { radius: 0.2, rimW: 0.25, tintA: 0.1, spec: 0.8 });
      p.position.set(C.x + dx, (SHAFT.y0 + SHAFT.y1) / 2, C.z + dz); p.rotation.y = ry;
      p.renderOrder = dz < 0 ? 8 : dz > 0 ? 12 : 10;
      group.add(p);
    }
    const tb = gk.tube(TUBE.r, TUBE.y1 - TUBE.y0, { tintA: 0.06, lip: 0.35 });
    tb.position.set(C.x, TUBE.y0, C.z); tb.renderOrder = 11; group.add(tb);
  } else {
    const tint = new THREE.MeshBasicMaterial({ color: exact('#1f2a30'), transparent: true, opacity: 0.35, depthWrite: false });
    tint.userData.noAO = true;
    const box = new THREE.Mesh(new THREE.BoxGeometry(SHAFT.w, SHAFT.y1 - SHAFT.y0, SHAFT.w), tint);
    box.position.set(C.x, (SHAFT.y0 + SHAFT.y1) / 2, C.z); box.userData.overlay = true; box.userData.noAO = true; box.renderOrder = 8;
    group.add(box);
  }
  group.add(glows(halo, 7));
  return {
    group, iris, markY,
    lamps: { liquidity: lampPos(-1, 0.3), sealed: lampPos(1, 0.3) },
    head: hp(0, HEAD.h / 2 + 0.3, 0),
    tubeTop: [C.x, GATE.y1, C.z] as Vec3, spiralEnd: end as Vec3, mid: [C.x, 18, C.z + sw] as Vec3,
  };
}

// ── the pool ─────────────────────────────────────────────────────────────────────────────────────────────────────

const POOL_VERT = /* glsl */`
varying vec3 vWorld;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
// the liquid: the walkthrough glass's reading of the scene behind (refraction of the grab), Fresnel toward the stage's
// sky, the key's highlight; its normal from rings spreading from where the disc lands (amplitude 0: dark and still)
const POOL_FRAG = /* glsl */`
uniform sampler2D tSharp; uniform sampler2D tBlur; uniform vec2 uRes; uniform vec3 uTint; uniform float uTintA;
uniform vec3 uKeyDir; uniform vec3 uEnvSky; uniform vec3 uEnvHor; uniform vec3 uHair;
uniform vec2 uCenter; uniform float uR; uniform vec2 uDrop; uniform float uAmp; uniform float uFront; uniform vec3 uGlow; uniform float uGlowA;
uniform vec3 uLp[3]; uniform vec3 uLc[3];
varying vec3 vWorld;
void main() {
  vec2 q = vWorld.xz - uCenter;
  float r = length(q);
  if (r > uR) discard;
  vec2 dq = vWorld.xz - uDrop; float rd = length(dq);
  float k = 2.6, env = exp(-pow(max(rd - uFront, 0.0) / 1.5, 2.0)) * smoothstep(0.0, 1.2, uFront - rd + 1.2) * exp(-rd * 0.06);
  float slope = uAmp * env * cos(rd * k - uFront * k);
  vec2 g = rd > 1e-3 ? dq / rd * slope : vec2(0.0);
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  vec3 nv = normalize((viewMatrix * vec4(N, 0.0)).xyz);
  vec2 suv = gl_FragCoord.xy / uRes;
  vec2 off = nv.xy * 0.02;
  vec3 bg = mix(texture2D(tSharp, clamp(suv - off, 0.001, 0.999)).rgb, texture2D(tBlur, clamp(suv - off * 1.5, 0.001, 0.999)).rgb, 0.6);
  vec3 c = mix(bg * 0.6, uTint, uTintA);
  vec3 R = reflect(-V, N);
  vec3 env2 = mix(uEnvHor, uEnvSky, smoothstep(-0.05, 0.55, R.y));
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  c = mix(c, env2, clamp(F * 0.7, 0.0, 1.0));
  vec3 H = normalize(normalize(uKeyDir) + V);
  c += vec3(pow(max(dot(N, H), 0.0), 260.0) * 1.1);
  c += uGlow * uGlowA * env * (0.6 + 0.4 * cos(rd * k - uFront * k));
  // the lit lamps' reflections: streaks along the view, narrow across it and long along it, broken by the rings
  vec3 Rh = normalize(vec3(R.x, 0.0, R.z) + 1e-5);
  for (int i = 0; i < 3; i++) {
    vec3 d = normalize(uLp[i] - vWorld); vec3 dh = normalize(vec3(d.x, 0.0, d.z) + 1e-5);
    float ah = max(dot(Rh, dh), 0.0), ev = R.y - d.y;
    c += uLc[i] * pow(ah, 700.0) * exp(-ev * ev * 14.0);
  }
  float rim = smoothstep(uR - 0.5, uR, r);
  c = mix(c, uHair, rim * 0.12);
  gl_FragColor = vec4(c, 1.0);
}`;

export function buildPool(ctx: FrameContext, mats: Mats, gk: ReturnType<typeof glassKit>, o: { drop?: [number, number]; front?: number; amp?: number; lights?: { at: Vec3; hex: string; k: number }[] } = {}) {
  const group = new THREE.Group(); group.name = 'pool';
  const b = createBuilder(THREE);
  // the coping: a chamfered concrete ring round the water (outer wall up, top inward, inner wall down to the floor),
  // a fine brass lip at the water's edge and a brass inlay along its top
  b.lathe('basin|concrete', [[POOL.r + 1.7, 0.0], [POOL.r + 1.7, 0.98], [POOL.r + 1.58, 1.1], [POOL.r + 0.1, 1.1], [POOL.r, 1.0], [POOL.r, 0.3]], POOL.x, 0, POOL.z, { seg: 160 });
  b.torus('rim|brass', POOL.r + 0.05, 0.085, POOL.x, 1.04, POOL.z, { rx: Math.PI / 2, seg: 160, tube: 8 });
  b.torus('rim|brassDark', POOL.r + 0.85, 0.05, POOL.x, 1.1, POOL.z, { rx: Math.PI / 2, seg: 160, tube: 6 });
  const built = b.build({ concrete: mats.concrete, graphiteDark: mats.graphiteDark, brass: mats.brass, brassDark: mats.brassDark });
  group.add(built.group);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(POOL.r, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#0b0e10', roughness: 0.6 }));
  floor.position.set(POOL.x, 0.42, POOL.z); group.add(floor);
  const dark = ctx.theme !== 'light';
  const mat = new THREE.ShaderMaterial({
    vertexShader: POOL_VERT, fragmentShader: POOL_FRAG, transparent: true, depthWrite: false,
    uniforms: {
      tSharp: { value: grabTex(gk.grab).sharp.texture }, tBlur: { value: grabTex(gk.grab).a.texture }, uRes: { value: gk.res },
      uTint: { value: exact('#0f1418') }, uTintA: { value: 0.55 }, uKeyDir: { value: new THREE.Vector3(-0.4, 0.8, 0.45) },
      uEnvSky: { value: exact(dark ? '#3a4a60' : '#ffffff') }, uEnvHor: { value: exact(dark ? '#191d21' : '#d5e0ee') }, uHair: { value: exact('#a9b3bd') },
      uCenter: { value: new THREE.Vector2(POOL.x, POOL.z) }, uR: { value: POOL.r }, uDrop: { value: new THREE.Vector2(...(o.drop ?? [POOL.x, POOL.z])) },
      uAmp: { value: o.amp ?? 0 }, uFront: { value: o.front ?? 0 }, uGlow: { value: exact(HEX.teal) }, uGlowA: { value: (o.amp ?? 0) > 0 ? 1.1 : 0 },
      uLp: { value: [0, 1, 2].map((i) => new THREE.Vector3(...(o.lights?.[i]?.at ?? [POOL.x, -100, POOL.z]))) },
      uLc: { value: [0, 1, 2].map((i) => (o.lights?.[i] ? exact(o.lights[i]!.hex, o.lights[i]!.k) : new THREE.Color(0, 0, 0))) },
    },
  });
  mat.userData.noAO = true;
  const surf = new THREE.Mesh(new THREE.CircleGeometry(POOL.r, 128).rotateX(-Math.PI / 2), mat);
  surf.position.set(POOL.x, POOL.y, POOL.z); surf.renderOrder = 7; surf.userData.overlay = true; surf.userData.noAO = true;
  group.add(surf);
  return { group, mat, rim: [POOL.x - POOL.r * 0.7, 1.3, POOL.z + POOL.r * 0.72] as Vec3, center: [POOL.x, POOL.y, POOL.z] as Vec3 };
}

// ── the agent's card ─────────────────────────────────────────────────────────────────────────────────────────────

/** The agent's card on its brass-edged plinth, built round its own center and turned to face compass `az` (the
 *  approach), so its face reads from the lane. */
function buildCard(mats: Mats, az = 180) {
  const group = new THREE.Group(); group.name = 'card';
  const b = createBuilder(THREE);
  b.box('plinth|graphite', 7.2, 1.0, 2.8, 0, 0.62, 0, { c: 0.06 });
  for (const s of [-1, 1]) {
    b.box('plinth|brass', 7.3, 0.07, 0.07, 0, 1.11, s * 1.4);
    b.box('plinth|brass', 0.07, 0.07, 2.9, s * 3.62, 1.11, 0);
    b.box('plinth|brass', 0.07, 1.0, 0.07, s * 3.62, 0.62, 1.4);
  }
  // the card: a dark slab in a brass frame, standing in a slot
  b.box('card|graphiteDark', CARD.w + 0.3, CARD.h + 0.3, 0.26, 0, CARD.y + CARD.h / 2, 0, { c: 0.05 });
  b.box('card|brass', CARD.w + 0.42, 0.08, 0.3, 0, CARD.y + CARD.h + 0.18, 0).box('card|brass', CARD.w + 0.42, 0.08, 0.3, 0, CARD.y - 0.02, 0);
  for (const s of [-1, 1]) b.box('card|brass', 0.08, CARD.h + 0.28, 0.3, s * (CARD.w / 2 + 0.17), CARD.y + CARD.h / 2 + 0.08, 0);
  const built = b.build({ graphite: mats.graphite, graphiteDark: mats.graphiteDark, brass: mats.brass });
  group.add(built.group);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(CARD.w, CARD.h), mats.screenBlack);
  face.position.set(0, CARD.y + CARD.h / 2 + 0.08, 0.135);
  group.add(face);
  group.position.set(CARD.x, 0, CARD.z); group.rotation.y = Math.PI - (az * Math.PI) / 180;
  group.updateMatrixWorld(true);
  const world = (p: Vec3): Vec3 => { const v = new THREE.Vector3(...p).applyMatrix4(group.matrixWorld); return [v.x, v.y, v.z]; };
  return { group, face, world };
}

function cardScreen(d: any, state: LaunchState) {
  const ev = d.sponsors.agent_studio.evaluation;
  const r = d.sealed_day.receipts[0];
  const day = new Date(`${d.sealed_day.operating_day}T12:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const dayStr = day.replace(/^(\w+) (\d+)$/, '$2 $1');
  const pips = el('div.tw-pips'); pips.style.gridTemplateColumns = `repeat(${ev.passed + ev.skipped}, 1fr)`; pips.style.gap = '9px'; pips.style.marginTop = '16px';
  for (const c of ev.checks) pips.append(el(c.status === 'PASS' ? 'i.on' : 'i.warn'));
  const days = el('div.tw-pips'); days.style.gridTemplateColumns = 'repeat(10, 1fr)'; days.style.gap = '9px'; days.style.marginTop = '16px';
  days.append(el('i.on')); for (let i = 1; i < 10; i++) days.append(el('i'));
  return el('div.tw-screen.tw-tower',
    el('div.hd', el('b', 'The agent'), el('i.lamp')),
    el('div.at.mono', short(d.sealed_day.agent.wallet)),
    el('div.how', state === 'graduate' ? 'Unlocks while it keeps sealing every gate' : 'License to launch: sealed-before-gate records only'),
    el('dl.tw-kv',
      el('dt', 'days sealed'), el('dd.teal', '1'),
      el('dt', `${dayStr} · before the gate`), el('dd', `${int(r.seconds_before_gate)} s`)),
    days,
    el('dl.tw-kv', el('dt', 'checks'), el('dd', `${ev.passed} pass`)),
    pips,
    el('div.rows', el('div.row', 'token', el('b', `Grand Prix Planner (${AGENT_TOKEN})`)),
      el('div.row', 'launch', el('b', `OpenFour ${d.sponsors.openfour.presets.active.name}`))));
}

// ── the frames ───────────────────────────────────────────────────────────────────────────────────────────────────

const camFrom = (pos: Vec3, target: Vec3, vfov: number, shift: [number, number]) => {
  const dx = pos[0] - target[0], dy = pos[1] - target[1], dz = pos[2] - target[2], dist = Math.hypot(dx, dy, dz);
  return { target, az: (Math.atan2(dx, -dz) * 180) / Math.PI, el: (Math.asin(dy / dist) * 180) / Math.PI, dist, vfov, shift };
};

export async function launchFrame(ctx: FrameContext, state: LaunchState): Promise<FrameHandle> {
  const d = ctx.needData();
  const L = ctx.layout as any;
  const { stage } = ctx;
  const of = d.sponsors.openfour, ev = d.sponsors.agent_studio.evaluation, r0 = d.sealed_day.receipts[0];
  const graduate = state === 'graduate';

  night(ctx, { env: 0.09, warm: graduate ? 0.35 : 0 });
  const mats = towerMaterials(ctx.theme);
  const gk = glassKit(ctx);
  const root = new THREE.Group(); root.name = graduate ? 'T04' : 'T03';
  const st = L.stations.find((s: any) => s.id === 'license-to-launch');
  root.add(plinth(mats, st.footprint, HEX.rim));
  root.add(plinth(mats, L.stations.find((s: any) => s.id === 'season-purse').footprint, HEX.rim));

  // A9 and the start of the return road (a design), eastward
  const main: number[][] = L.track.main_world;
  const lane = main.filter(([x, z]) => z >= 205 && z < 300 && x > 140);
  const tr = track(mats, lane, { comet: HEX.teal, dir: 1, phase: 23 });
  root.add(tr.group);
  const pl = poles(mats, along(lane, 60, 30).map((p, i) => ({ ...p, side: i % 2 ? -1 : 1 })).filter((p) => p.x < 300 || p.x > 448), { lit: (p) => p.x > 250 && p.x < 480 && p.z < 240, intensity: 380 });
  root.add(pl.group);

  const tower = buildLaunchTower(ctx, mats, { state, glass: gk });
  root.add(tower.group);
  const arc = arcPoints();
  const landT = 0.935; // T04: the disc at this share of its arc, about to touch the pool
  const landAt = arc[Math.round(landT * (arc.length - 1))]!;
  // the pool mirrors the lit lamps (and, in graduation, the disc above it)
  const mirror = [
    ...(graduate ? [{ at: tower.lamps.liquidity, hex: HEX.teal, k: 1.6 }] : []),
    { at: tower.lamps.sealed, hex: HEX.teal, k: 1.6 },
    ...(graduate ? [{ at: [landAt[0]!, landAt[1]!, landAt[2]!] as Vec3, hex: HEX.teal, k: 2.4 }] : [{ at: [330, 20, 179] as Vec3, hex: '#6f8296', k: 0.35 }]),
  ];
  const pl2 = buildPool(ctx, mats, gk, graduate ? { drop: [landAt[0]! + 1.2, landAt[2]! + 0.4], front: 5.5, amp: 0.38, lights: mirror } : { lights: mirror });
  root.add(pl2.group);
  const card = buildCard(mats, 138);
  root.add(card.group);

  const halo: Glow[] = [];
  for (const h of pl.heads) halo.push({ at: h, size: 3.2, hex: HEX.pole, alpha: 0.55, sharp: 0.6 });
  root.add(pool('#bfe9df', card.world([0, 0.135, 4.5]), 5, 4, 0.18));
  // the card's own light, a cool downlight from the podium's edge
  const cardLight = new THREE.SpotLight('#dfe9f2', 260, 26, Math.PI * 0.22, 0.7, 1.6);
  cardLight.position.set(CARD.x + 2, 11, CARD.z + 9); cardLight.target.position.set(CARD.x, 3, CARD.z); root.add(cardLight, cardLight.target);

  let disc: THREE.Group | null = null;
  if (graduate) {
    // the token's disc on its arc, a teal comet behind it, and the arc's path as a faint guide
    disc = new THREE.Group();
    const b = createBuilder(THREE);
    b.cyl('coin|enamel', 2.1, 0.34, 0, 0, 0, { seg: 64 });
    b.torus('coin|brass', 2.12, 0.2, 0, 0, 0, { rx: Math.PI / 2, seg: 64, tube: 10 });
    b.torus('coin|brass', 1.35, 0.05, 0, 0.19, 0, { rx: Math.PI / 2, seg: 64, tube: 6 });
    b.torus('coin|brass', 1.35, 0.05, 0, -0.19, 0, { rx: Math.PI / 2, seg: 64, tube: 6 });
    disc.add(b.build({ enamel: mats.enamel('#1d6f5f'), brass: mats.brass }).group);
    const i = Math.round(landT * (arc.length - 1)), a = arc[i - 1]!, c = arc[i + 1]!;
    disc.position.set(landAt[0]!, landAt[1]!, landAt[2]!);
    const dir = new THREE.Vector3(c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!).normalize();
    disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0).lerp(dir, 0.45).normalize());
    root.add(disc);
    const tail = arc.slice(0, Math.round(landT * (arc.length - 1)) + 1);
    const cm = comets(tail, { color: HEX.teal, core: 3.2, glow: 16, glowA: 0.4, period: 400, speed: 0, phase: tail.length * 0 + pathLen(tail) - 0.5, tail: 0.075, reveal: false, renderOrder: 9, fade: [0, 0] });
    cm.userData.noAO = true; root.add(cm);
    const g = line(arc, { color: HEX.teal, width: 1, opacity: 0.28, dash: 0.9, gap: 0.9, reveal: false, renderOrder: 6 });
    g.userData.noAO = true; root.add(g);
    halo.push({ at: [landAt[0]!, landAt[1]!, landAt[2]!], size: 9, hex: HEX.teal, alpha: 0.35, sharp: 0.2 });
    const dl = new THREE.PointLight(HEX.teal, 120, 26, 1.8); dl.position.set(landAt[0]!, landAt[1]! + 1, landAt[2]!); root.add(dl);
  }
  root.add(glows(halo));
  mount(ctx, root, mats);

  const screen = cardScreen(d, state);
  screen.style.width = `${CARD.w * 110}px`; screen.style.height = `${CARD.h * 110}px`;
  ctx.overlay.appendChild(screen);

  // T03 and T04 share one camera, so the pair reads as before and after: what lights, opens, fills and lifts
  // a little above the podium, so the pool opens up beside the tower and clears the caption
  const cam = camFrom([440, 22, 250], [368, 19, 178], 40, [0.045, 0.075]);
  stage.setFade({ center: [0.5, 0.5], screen: [2, 3], world: [380, 760], worldCenter: [330, 190], glow: graduate ? [0.06, 0.48] : [0.42, 0.62] });
  stage.setKey({ az: 215, el: 40, center: [355, 10, 180], radius: 60, rimAz: 40 });
  stage.setAO({ radius: 0.7, scale: 1.1, thickness: 1.3, samples: 16 });
  stage.setShadowAuto(true);

  // month first ("Nov 26"), as every date the reader sees
  const dayWord = (() => { const [y, m, dd] = d.sealed_day.operating_day.split('-').map(Number); return `${new Date(Date.UTC(y, m - 1, dd)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${dd}`; })();
  return {
    time: 1.6,
    note: graduate
      ? `Entirely a design: no evidence-gated module is deployed, no ${AGENT_TOKEN} token exists, no liquidity, no migration. The OpenFour testnet run is in progress; this frame claims no result from it. The plates describe how graduation works; the fill is the module's threshold mark, not a market figure. Real, as in T03: the agent's wallet, its one sealed day (${dayWord}, ${int(r0.seconds_before_gate)} s before the gate on BSC mainnet) and its checks (${ev.passed} pass, ${ev.skipped} skipped), from frame-data.json sealed_day and sponsors.agent_studio. ${AGENT_TOKEN} is a working name held in one constant. Jo decides whether a design frame belongs in the public cut.`
      : `The state today. Real: the right lamp reads the ${dayWord} record, sealed ${int(r0.seconds_before_gate)} s before the gate (frame-data.json sealed_day.receipts[0]); the agent's wallet ${short(d.sealed_day.agent.wallet)} and its evaluation, ${ev.passed} checks pass and ${ev.skipped} skipped (sponsors.agent_studio.evaluation); OpenFour's ${of.presets.active.name} preset and its ${of.modules.length} modules, found by the testnet discovery probe (block ${int(of.block)}, ${of.block_time.ct.slice(11)}). The OpenFour testnet run is in progress; at this data no custom module is deployed, no token created and no migration run, so the liquidity lamp has nothing to read and stays dark and hatched, and the spiral has one lit turn for the one sealed day. ${AGENT_TOKEN} is a working name held in one constant. Illustrative: the tower and its signal head (on the crown, turned toward A9), the spiral's rise per day, the card's angle toward the lane, and the pool. Whether a developer-owned registry qualifies for OpenFour's Hub is an open question to OpenFour.`,
    update(t) {
      stage.setCamera(cam);
      gk.lightDirs();
      frameTick(ctx, root, mats, t);
    },
    decorate() {
      const cf = faceOf(card.face, CARD.w, CARD.h);
      placeScreen(ctx, screen, cf, 110);
      const cps = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => cf.c.clone().addScaledVector(cf.right, (sx * cf.w) / 2).addScaledVector(cf.up, (sy * cf.h) / 2)))
        .map((p) => ctx.plates.project([p.x, p.y, p.z])).filter((p): p is { x: number; y: number } => !!p);
      const cardBox = { x: Math.min(...cps.map((p) => p.x)) - 4, y: Math.min(...cps.map((p) => p.y)) - 4, w: 0, h: 0 };
      cardBox.w = Math.max(...cps.map((p) => p.x)) - cardBox.x + 8; cardBox.h = Math.max(...cps.map((p) => p.y)) - cardBox.y + 8;
      if (graduate) {
        const cap = caption(ctx, { head: 'Graduation, once the record qualifies', flavor: 'license to launch', line: 'Both lamps lit: liquidity in place and the record qualifying. The token moves from its curve to its pool.' });
        ctx.plates.scope('How graduation works: an evidence-gated migration on BSC testnet.');
        ctx.plates.leaders([
          { id: 'card', text: 'Unlocks pause if the agent misses a gate.', at: card.world([-3.55, 1.12, 1.3]), priority: 0 },
        ], { max: 4, keepOut: cap ? [cap, cardBox] : [cardBox] });
        tagPlates(ctx, { Unlocks: 'tw-design' });
      } else {
        const cap = caption(ctx, { head: 'Launch only with a sealed record', flavor: 'license to launch', line: 'Only agents with records sealed before the market closes can launch. Graduation waits on two lamps.' });
        ctx.plates.leaders([
          { id: 'lamp-l', text: 'Liquidity: not yet', at: tower.lamps.liquidity, priority: 1 },
          { id: 'lamp-r', text: `Sealed before the gate: ${dayWord} · ${int(r0.seconds_before_gate)} s`, at: tower.lamps.sealed, priority: 0 },
          { id: 'card', text: `The agent (${short(d.sealed_day.agent.wallet)}) · 1 day sealed · ${ev.passed} checks pass`, at: card.world([-3.55, 1.12, 1.3]), priority: 2 },
          { id: 'module', text: `OpenFour ${of.presets.active.name} · ${['zero', 'one', 'two', 'three', 'four', 'five', 'six'][of.modules.length] ?? of.modules.length} modules · migration behind an evidence gate`, at: tower.mid, priority: 3 },
          { id: 'token', text: `Grand Prix Planner (${AGENT_TOKEN})`, at: tower.spiralEnd, priority: 4 },
        ], { max: 6, keepOut: cap ? [cap, cardBox] : [cardBox] });
        tagPlates(ctx, { 'Sealed before the gate': 'tw-sealed' });
      }
    },
  };
}

function pathLen(p: number[][]) { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i]![0]! - p[i - 1]![0]!, p[i]![1]! - p[i - 1]![1]!, p[i]![2]! - p[i - 1]![2]!); return s; }
