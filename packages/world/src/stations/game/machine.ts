// ONE PLAN's cabinet in the Arena, at layout.arena.machine's places: the body under the field (walnut-graphite sides,
// a brass-framed window onto the pegs and the tray), the tray's 83 glass tubes and their coins (coins.ts), the backbox
// (the risk and return screen, the seal feed's ticker, the marquee in its ring of tungsten bulbs, the best-plan banner
// over it), the score tower on the east side (a high striker: $2,500 at its foot, $3,800 at the bell), and the console
// in front (the brass schedule dial, the 24 glass pucks, the seal button with its BNB-yellow ring). Built from the
// kit's chamfered boxes and three's lathes and tubes, merged per material; the parts a player moves (the coins, the
// dial's pointer, the pucks, the score puck, the seal ring) are their own meshes, posed by the setters it returns.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chamferBox } from '../../kit/geo';
import { glassMaterial, heatAt } from '../../kit/hedge/fields';
import { lin } from '../../kit/region/geo';
import { OVERLAY } from '../../lib/stage';
import type { Vec3 } from '../../lib/stage';
import { arcadeMaterials, BLOOM, PAL } from './look';
import { CoinTray, type CoinMove } from './coins';

export const CAB = {
  x0: -358, x1: -292, z0: 184, z1: 222.4, deck: 8.96,
  field: { cx: -325, cz: 205, y: 9.0, w: 60.2, d: 28.8 },
  win: { x0: -355.8, x1: -294.2, y0: 1.0, y1: 6.9, z: 222.3 },
  board: 219.9,
  tray: { n: 83, pitch: 0.7253, x0: -355.1, z: 221.6, y0: 1.02, y1: 6.4, r: 0.345 },
  coin: { r: 0.29, t: 0.24 },
  back: { z0: 184, z1: 190, top: 31.8 },
  screen: { x0: -345, x1: -305, y0: 12.4, y1: 25 },
  ticker: { y0: 25.6, y1: 26.6 },
  marquee: { x0: -346, x1: -304, y0: 27, y1: 31 },
  banner: { x0: -336, x1: -314, y0: 33, y1: 36 },
  tower: { x: -289.6, z: 196, y0: 9, y1: 33, lo: 2500, hi: 3800 },
  console: { x0: -348.5, x1: -295, zb: 226, zf: 234, dial: [-343, 2.6, 230] as Vec3, seal: [-300, 2.6, 230] as Vec3, puckX0: -338, pitch: 1.4, tilt: 25 },
};

/** A tower height for a score (dollars). */
export const towerY = (usd: number) => CAB.tower.y0 + ((usd - CAB.tower.lo) / (CAB.tower.hi - CAB.tower.lo)) * (CAB.tower.y1 - CAB.tower.y0);

export type SealState = 'dark' | 'ready' | 'sealed';

export interface MachineState {
  /** The schedule dial, 0 at A to 1 at C. */
  dial: number;
  /** Contracts an hour (the pucks), sold positive. */
  q: readonly number[];
  sealLit: boolean;
  /** The score tower: the puck's score and the reference marks (dollars). */
  score: number | null;
  marks: { a?: number; b?: number; p1?: number };
  /** The coins: each scenario's day total (micro-dollars) and its bin; the tail's scenario indices. */
  totals: ArrayLike<number>;
  bins: ArrayLike<number>;
  tail: ReadonlySet<number>;
  /** A second pile drawn as a hairline outline behind the coins (the sealed C's, in play). */
  ghostHist?: readonly number[];
  /** How the coins arrive: in place (a still), or poured from the field's lip. */
  coinMove?: CoinMove;
  /** Column order and x for the pour (each scenario's column on the field). */
  columnX?: (k: number) => number;
  order?: readonly number[];
}

/** Metric box-projected UVs for a non-indexed geometry (u along the face's longer in-plane axis). */
function metricUV(g: THREE.BufferGeometry, scale = 1) {
  const p = g.attributes.position!, n = g.attributes.normal!, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

class Parts {
  private by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, g: THREE.BufferGeometry, m?: THREE.Matrix4) {
    let geo = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    if (!geo.attributes.uv) metricUV(geo);
    if (m) geo.applyMatrix4(m);
    const list = this.by.get(mat) ?? []; list.push(geo); this.by.set(mat, list);
  }
  /** A chamfered box, its center at (x, y, z), world-metric UVs. */
  box(mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, e = 0.03, rot?: THREE.Euler) {
    const g = chamferBox(THREE, sx, sy, sz, e) as THREE.BufferGeometry;
    g.deleteAttribute('base');
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler()), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m); metricUV(g);
    const list = this.by.get(mat) ?? []; list.push(g); this.by.set(mat, list);
  }
  build(group: THREE.Group, { shadow = true } = {}) {
    for (const [mat, geos] of this.by) {
      const merged = mergeGeometries(geos, false); if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = shadow; mesh.receiveShadow = true; group.add(mesh);
      for (const g of geos) g.dispose();
    }
    this.by.clear();
  }
}

// ── the tubes' glass: a cheap fresnel shell, bright at the silhouette with a streak down the front ──────────────
const TUBE_VERT = /* glsl */`
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main() { vUv = uv; vN = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * normal)); vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w; }`;
const TUBE_FRAG = /* glsl */`
uniform vec3 uTint; uniform vec3 uStreak;
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main() {
  vec3 n = normalize(vN), V = normalize(cameraPosition - vW);
  if (!gl_FrontFacing) n = -n;
  float ndv = abs(dot(n, V));
  float edge = pow(1.0 - ndv, 3.0);
  // the streak: a narrow highlight a little left of the front, where a warm practical catches the curve
  float streak = smoothstep(0.86, 0.97, dot(n, normalize(vec3(-0.35, 0.15, 1.0)))) * 0.9;
  float a = clamp(0.03 + 0.32 * edge + 0.22 * streak, 0.0, 0.6);
  vec3 c = mix(uTint, uStreak, clamp(streak + edge * 0.4, 0.0, 1.0));
  gl_FragColor = vec4(c, a);
}`;

export function buildMachine(env: THREE.Texture | null, grab: any, res: THREE.Vector2, st: MachineState) {
  const M = arcadeMaterials(env);
  const group = new THREE.Group(); group.name = 'one-plan';
  const P = new Parts();
  const C = CAB;
  const bulbs: { i: number; phase: number }[] = [];
  let lampMesh: THREE.InstancedMesh | null = null;
  const bloomers: THREE.Object3D[] = [];
  const overlay: THREE.Object3D[] = [];

  // ── the Arena's plinth: sealed graphite concrete, 0.12 m proud, a chamfered rim, a hairline LED ───────────────
  {
    const s = new THREE.Shape(), x0 = -480, x1 = -180, z0 = 146, z1 = 276, r = 10;
    s.moveTo(x0 + r, z0); s.lineTo(x1 - r, z0); s.quadraticCurveTo(x1, z0, x1, z0 + r); s.lineTo(x1, z1 - r); s.quadraticCurveTo(x1, z1, x1 - r, z1);
    s.lineTo(x0 + r, z1); s.quadraticCurveTo(x0, z1, x0, z1 - r); s.lineTo(x0, z0 + r); s.quadraticCurveTo(x0, z0, x0 + r, z0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.3, bevelSegments: 2, curveSegments: 12 });
    g.rotateX(Math.PI / 2); g.translate(0, 0.08, 0);
    const mesh = new THREE.Mesh(g, M.concrete); mesh.receiveShadow = true; mesh.name = 'arena-plinth';
    group.add(mesh);
  }

  // ── the body: kick, walnut sides, the front's stiles and rails round the window, the deck round the field ──────
  const kick = 0.62, F = C.field, fx0 = F.cx - F.w / 2, fx1 = F.cx + F.w / 2, fz0 = F.cz - F.d / 2, fz1 = F.cz + F.d / 2;
  P.box(M.trim, C.x1 - C.x0 - 0.8, kick - 0.12, C.z1 - C.z0 - 0.8, (C.x0 + C.x1) / 2, (kick + 0.12) / 2, (C.z0 + C.z1) / 2, 0.04);
  P.box(M.brass, C.x1 - C.x0 - 0.7, 0.08, 0.08, (C.x0 + C.x1) / 2, kick - 0.04, C.z1 - 0.38, 0.02);
  for (const x of [C.x0 + 0.3, C.x1 - 0.3]) P.box(M.walnut, 0.6, C.deck - kick, C.z1 - C.z0, x, (C.deck + kick) / 2, (C.z0 + C.z1) / 2, 0.06);
  // the front: stiles either side of the window, a rail under it and a deep one over it
  P.box(M.walnut, C.win.x0 - C.x0, C.deck - kick, 0.6, (C.x0 + C.win.x0) / 2, (C.deck + kick) / 2, C.z1 - 0.3, 0.06);
  P.box(M.walnut, C.x1 - C.win.x1, C.deck - kick, 0.6, (C.x1 + C.win.x1) / 2, (C.deck + kick) / 2, C.z1 - 0.3, 0.06);
  P.box(M.walnut, C.win.x1 - C.win.x0, C.win.y0 - kick, 0.6, (C.win.x0 + C.win.x1) / 2, (C.win.y0 + kick) / 2, C.z1 - 0.3, 0.04);
  P.box(M.walnut, C.win.x1 - C.win.x0, C.deck - C.win.y1, 0.6, (C.win.x0 + C.win.x1) / 2, (C.deck + C.win.y1) / 2, C.z1 - 0.3, 0.04);
  // the window's brass frame
  const fw = 0.16, wx = (C.win.x0 + C.win.x1) / 2, ww = C.win.x1 - C.win.x0, wy = (C.win.y0 + C.win.y1) / 2, wh = C.win.y1 - C.win.y0;
  P.box(M.brass, ww + fw * 2, fw, 0.2, wx, C.win.y0 - fw / 2, C.z1 + 0.02, 0.03);
  P.box(M.brass, ww + fw * 2, fw, 0.2, wx, C.win.y1 + fw / 2, C.z1 + 0.02, 0.03);
  for (const x of [C.win.x0 - fw / 2, C.win.x1 + fw / 2]) P.box(M.brass, fw, wh, 0.2, x, wy, C.z1 + 0.02, 0.03);
  // brass corner posts and the deck's edge
  for (const x of [C.x0, C.x1]) for (const z of [C.z1]) P.box(M.brass, 0.22, C.deck - kick + 0.1, 0.22, x + (x === C.x0 ? 0.11 : -0.11), (C.deck + kick) / 2, z - 0.11, 0.05);
  // the deck round the field, slightly under the field's floor so the field reads as an inlaid tray
  const dy = C.deck - 0.09;
  P.box(M.paint, C.x1 - C.x0, 0.18, C.z1 - fz1, (C.x0 + C.x1) / 2, dy, (fz1 + C.z1) / 2, 0.03);
  P.box(M.paint, fx0 - C.x0, 0.18, fz1 - fz0, (C.x0 + fx0) / 2, dy, F.cz, 0.03);
  P.box(M.paint, C.x1 - fx1, 0.18, fz1 - fz0, (fx1 + C.x1) / 2, dy, F.cz, 0.03);
  P.box(M.paint, C.x1 - C.x0, 0.18, fz0 - C.z0, (C.x0 + C.x1) / 2, dy, (C.z0 + fz0) / 2, 0.03);
  // the brass rail round the field
  const rail = 0.16, ry = F.y + 0.12;
  P.box(M.brass, F.w + rail * 3, 0.24, rail, F.cx, ry, fz1 + rail * 0.75, 0.05);
  P.box(M.brass, F.w + rail * 3, 0.24, rail, F.cx, ry, fz0 - rail * 0.75, 0.05);
  for (const x of [fx0 - rail * 0.75, fx1 + rail * 0.75]) P.box(M.brass, rail, 0.24, F.d + rail * 3, x, ry, F.cz, 0.05);
  // a walnut cap along the deck's front edge
  P.box(M.walnut, C.x1 - C.x0 + 0.2, 0.3, 0.5, (C.x0 + C.x1) / 2, C.deck + 0.02, C.z1 - 0.2, 0.08);

  // ── behind the window: the backboard, the pegs, the tray's floor and its tubes, the zero mark ─────────────────
  P.box(M.trim, ww + 0.2, C.deck - kick, 0.3, wx, (C.deck + kick) / 2, C.board, 0.02);
  {
    // the drop: a brass lip under the field's front edge, where the coins leave it for the tubes
    P.box(M.brass, ww - 0.4, 0.12, 0.5, wx, C.deck - 0.35, C.z1 + 0.02, 0.04);
  }
  P.box(M.brassDark, ww, 0.06, 1.4, wx, C.tray.y0 - 0.03, C.tray.z, 0.02);
  // the $0 mark: a hairline on the backboard at the zero bin's edge
  const zeroX = C.tray.x0 + 15 * C.tray.pitch;
  {
    const zl = new THREE.Mesh(new THREE.PlaneGeometry(0.05, C.tray.y1 - C.tray.y0 + 0.3), new THREE.MeshBasicMaterial({ color: lin('#969ca3') }));
    zl.position.set(zeroX, (C.tray.y0 + C.tray.y1) / 2 + 0.15, C.board + 0.16); group.add(zl);
  }
  {
    // the tubes: open glass cylinders, a brass collar at the top of each
    const tubeGeo = new THREE.CylinderGeometry(C.tray.r, C.tray.r, C.tray.y1 - C.tray.y0, 28, 1, true);
    const tubeMat = new THREE.ShaderMaterial({ vertexShader: TUBE_VERT, fragmentShader: TUBE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTint: { value: lin('#8fa3b6').clone() }, uStreak: { value: lin('#fff1da').clone() } } });
    const tubes = new THREE.InstancedMesh(tubeGeo, tubeMat, C.tray.n);
    for (let b = 0; b < C.tray.n; b++) {
      const x = C.tray.x0 + (b + 0.5) * C.tray.pitch;
      tubes.setMatrixAt(b, new THREE.Matrix4().makeTranslation(x, (C.tray.y0 + C.tray.y1) / 2, C.tray.z));
    }
    tubes.renderOrder = 4; tubes.userData.noAO = true; overlay.push(tubes);
    group.add(tubes);
    // the tubes hang from one brass rail; thin brass fins part them at the back
    P.box(M.brass, ww - 0.2, 0.16, 0.9, wx, C.tray.y1 + 0.08, C.tray.z, 0.04);
    for (let b = 0; b <= C.tray.n; b++) P.box(M.brassDark, 0.03, C.tray.y1 - C.tray.y0, 0.3, C.tray.x0 + b * C.tray.pitch, (C.tray.y0 + C.tray.y1) / 2, C.tray.z - 0.42, 0.01);
  }

  // ── the coins: enamel in the ramp's color of the day's total, brass rims, the worst tenth's rims bright ────────
  const tray = new CoinTray({
    n: C.tray.n, pitch: C.tray.pitch, x0: C.tray.x0, z: C.tray.z, y0: C.tray.y0, y1: C.tray.y1, coin: C.coin, bracketZ: C.z1 + 0.14,
    lip: { y: C.deck + 0.25, z: C.tray.z, columnX: st.columnX ?? (() => C.field.cx) },
  }, st.totals.length, M.brass);
  group.add(tray.group);
  tray.set(st.totals, st.bins, st.tail, 0, st.coinMove ?? 'snap', st.order);
  if (st.ghostHist) {
    // the sealed plan's pile as a hairline outline behind the coins
    const pts: THREE.Vector3[] = [];
    st.ghostHist.forEach((c, b) => {
      const xa = C.tray.x0 + b * C.tray.pitch, xb = xa + C.tray.pitch, y = C.tray.y0 + c * C.coin.t;
      pts.push(new THREE.Vector3(xa, y, C.tray.z + 0.42), new THREE.Vector3(xb, y, C.tray.z + 0.42));
    });
    // a ribbon, not a 1 px line: thin boxes along the steps
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!, b = pts[i + 1]!, L = a.distanceTo(b); if (L < 1e-3) continue;
      const g = new THREE.BoxGeometry(a.y === b.y ? L + 0.05 : 0.05, a.y === b.y ? 0.05 : L + 0.05, 0.02);
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, a.z); geos.push(g);
    }
    const ghost = new THREE.Mesh(mergeGeometries(geos, false)!, new THREE.MeshBasicMaterial({ color: lin('#F0B90B'), transparent: true, opacity: 0.95, depthTest: false }));
    ghost.renderOrder = 20; overlay.push(ghost); group.add(ghost);
  }

  // ── the window's glass, the walkthrough's liquid glass over the tray ────────────────────────────────────────────
  {
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = glassMaterial('dark', grab, res, { size: [ww, wh], radius: 0.25, rimW: 0.3, tiles: true });
    (mat as any).uniforms.uTintA.value = 0.05; (mat as any).uniforms.uFrost.value = 0.02; (mat as any).uniforms.uRefract.value = 0.012; (mat as any).uniforms.uDome.value = 0.04;
    const pane = new THREE.InstancedMesh(g, mat, 1);
    pane.setMatrixAt(0, new THREE.Matrix4().makeScale(ww, 1, wh));
    const hold = new THREE.Group(); hold.position.set(wx, wy, C.win.z); pane.rotation.x = Math.PI / 2; hold.add(pane);
    pane.renderOrder = 14; pane.frustumCulled = false; overlay.push(hold); group.add(hold);
  }

  // ── the backbox ────────────────────────────────────────────────────────────────────────────────────────────────
  const B = C.back, bz = B.z1, by0 = C.deck;
  P.box(M.walnut, C.x1 - C.x0, B.top - by0, B.z1 - B.z0, (C.x0 + C.x1) / 2, (B.top + by0) / 2, (B.z0 + B.z1) / 2, 0.08);
  // its face: a graphite panel inset in the walnut, brass inlay lines down the wings
  P.box(M.paint, C.x1 - C.x0 - 2.4, B.top - by0 - 2.0, 0.12, (C.x0 + C.x1) / 2, (B.top + by0) / 2 + 0.2, bz + 0.04, 0.04);
  for (const x of [C.x0 + 1.15, C.x1 - 1.15]) P.box(M.brass, 0.1, B.top - by0 - 2.2, 0.08, x, (B.top + by0) / 2 + 0.2, bz + 0.12, 0.02);
  P.box(M.brass, C.x1 - C.x0 + 0.6, 0.36, 0.9, (C.x0 + C.x1) / 2, B.top + 0.18, (B.z0 + B.z1) / 2 + 0.3, 0.08);
  P.box(M.walnut, C.x1 - C.x0 + 1.0, 0.5, B.z1 - B.z0 + 1.0, (C.x0 + C.x1) / 2, B.top + 0.61, (B.z0 + B.z1) / 2, 0.1);
  // the screen's bezel and its dark glass
  const S = C.screen, sx = (S.x0 + S.x1) / 2, sw = S.x1 - S.x0, sy = (S.y0 + S.y1) / 2, sh = S.y1 - S.y0, bezel = 0.5;
  P.box(M.brass, sw + bezel * 2, bezel, 0.4, sx, S.y0 - bezel / 2, bz + 0.22, 0.06);
  P.box(M.brass, sw + bezel * 2, bezel, 0.4, sx, S.y1 + bezel / 2, bz + 0.22, 0.06);
  for (const x of [S.x0 - bezel / 2, S.x1 + bezel / 2]) P.box(M.brass, bezel, sh, 0.4, x, sy, bz + 0.22, 0.06);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), M.screen); screen.position.set(sx, sy, bz + 0.13); group.add(screen);
  // the ticker's strip and the marquee's lightbox
  const T = C.ticker, Mq = C.marquee, mx = (Mq.x0 + Mq.x1) / 2, mw = Mq.x1 - Mq.x0, my = (Mq.y0 + Mq.y1) / 2, mh = Mq.y1 - Mq.y0;
  const tick = new THREE.Mesh(new THREE.PlaneGeometry(sw, T.y1 - T.y0), M.screen); tick.position.set(sx, (T.y0 + T.y1) / 2, bz + 0.13); group.add(tick);
  P.box(M.trim, mw + 1.6, mh + 1.6, 1.0, mx, my, bz + 0.5, 0.12);
  P.box(M.brass, mw + 1.0, 0.14, 0.3, mx, Mq.y0 - 0.35, bz + 1.02, 0.03);
  P.box(M.brass, mw + 1.0, 0.14, 0.3, mx, Mq.y1 + 0.35, bz + 1.02, 0.03);
  for (const x of [Mq.x0 - 0.42, Mq.x1 + 0.42]) P.box(M.brass, 0.14, mh + 0.84, 0.3, x, my, bz + 1.02, 0.03);
  const mqFace = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshBasicMaterial({ color: lin('#0a0b0c') })); mqFace.position.set(mx, my, bz + 1.01); group.add(mqFace);
  // tungsten bulbs round the marquee, and down the backbox's two outer edges
  {
    const bulbGeo = new THREE.SphereGeometry(0.17, 16, 10), socket = new THREE.CylinderGeometry(0.13, 0.15, 0.16, 12).rotateX(Math.PI / 2);
    const ring: Vec3[] = [];
    const per = (a: Vec3, b: Vec3, step: number) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / step)); for (let i = 0; i < n; i++) ring.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, a[2]]); };
    const bx0 = Mq.x0 - 0.78, bx1 = Mq.x1 + 0.78, byA = Mq.y0 - 0.72, byB = Mq.y1 + 0.72, z = bz + 1.1;
    per([bx0, byA, z], [bx1, byA, z], 0.86); per([bx1, byA, z], [bx1, byB, z], 0.86); per([bx1, byB, z], [bx0, byB, z], 0.86); per([bx0, byB, z], [bx0, byA, z], 0.86);
    for (const x of [C.x0 + 0.55, C.x1 - 0.55]) for (let y = by0 + 1.2; y < B.top - 0.6; y += 0.95) ring.push([x, y, bz + 0.25]);
    const lamps = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), ring.length);
    ring.forEach((p, i) => {
      lamps.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p[0], p[1], p[2])); lamps.setColorAt(i, new THREE.Color(1, 1, 1));
      bulbs.push({ i, phase: i });
      P.add(M.brassDark, socket.clone(), new THREE.Matrix4().makeTranslation(p[0], p[1], p[2] - 0.12));
    });
    lamps.layers.enable(BLOOM); lamps.userData.noAO = true; bloomers.push(lamps); group.add(lamps); lampMesh = lamps;
  }
  // the best-plan banner on two brass posts over the backbox
  const Bn = C.banner, bnx = (Bn.x0 + Bn.x1) / 2, bnw = Bn.x1 - Bn.x0, bny = (Bn.y0 + Bn.y1) / 2, bnh = Bn.y1 - Bn.y0;
  P.box(M.trim, bnw + 0.6, bnh + 0.6, 0.5, bnx, bny, (B.z0 + B.z1) / 2 + 2.3, 0.1);
  for (const x of [Bn.x0 + 2, Bn.x1 - 2]) P.box(M.brass, 0.3, Bn.y0 - B.top - 0.5, 0.3, x, (Bn.y0 + B.top + 0.5) / 2 + 0.25, (B.z0 + B.z1) / 2 + 2.3, 0.06);
  const bannerFace = new THREE.Mesh(new THREE.PlaneGeometry(bnw, bnh), M.screen); bannerFace.position.set(bnx, bny, (B.z0 + B.z1) / 2 + 2.56); group.add(bannerFace);

  // ── the score tower: a high striker on the east side ──────────────────────────────────────────────────────────
  const Tw = C.tower;
  let scorePuck!: THREE.Mesh;
  {
    const tx = Tw.x, tz = Tw.z;
    P.box(M.walnut, 3.4, Tw.y0, 3.4, tx, Tw.y0 / 2, tz, 0.08);
    P.box(M.brass, 3.6, 0.24, 3.6, tx, Tw.y0 + 0.12, tz, 0.05);
    P.box(M.walnut, 2.6, Tw.y1 - Tw.y0 + 0.8, 0.6, tx, (Tw.y0 + Tw.y1 + 0.8) / 2, tz - 1.1, 0.06);
    for (const dx of [-1.02, 1.02]) P.box(M.brass, 0.16, Tw.y1 - Tw.y0, 0.16, tx + dx, (Tw.y0 + Tw.y1) / 2, tz - 0.62, 0.04);
    // the scale's ticks every $100 on the back panel, brass
    for (let v = Tw.lo; v <= Tw.hi + 1e-6; v += 100) P.box(M.brassDark, v % 500 === 0 ? 1.6 : 0.9, 0.07, 0.05, tx, towerY(v), tz - 0.78, 0.01);
    // the bell
    const bell = new THREE.LatheGeometry([[0.0, 0.0], [1.5, 0.0], [1.42, 0.18], [1.12, 0.85], [0.78, 1.45], [0.28, 1.72], [0.0, 1.75]].map(([r, y]) => new THREE.Vector2(r, y)), 48);
    P.add(M.brass, bell, new THREE.Matrix4().makeTranslation(tx, Tw.y1 + 0.42, tz - 0.3));
    P.box(M.brass, 2.8, 0.2, 1.4, tx, Tw.y1 + 0.3, tz - 0.4, 0.05);
    // the glass tube the puck rides in
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, Tw.y1 - Tw.y0, 32, 1, true), new THREE.ShaderMaterial({ vertexShader: TUBE_VERT.replace(/instanceMatrix \* /g, '').replace('mat3(instanceMatrix) * ', ''), fragmentShader: TUBE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTint: { value: lin('#5d6a76').clone() }, uStreak: { value: lin('#c9b48f').clone() } } }));
    for (let v = Tw.lo; v <= Tw.hi + 1e-6; v += 500) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf8f').multiplyScalar(0.9) }));
      t.position.set(tx - 1.32, towerY(v), tz - 0.3); group.add(t);
    }
    tube.position.set(tx, (Tw.y0 + Tw.y1) / 2, tz); tube.renderOrder = 4; overlay.push(tube); group.add(tube);
    // the reference marks: thin lit bars across the tube at A, B and the best sealed plan
    const markBar = (usd: number, color: string, k: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 0.14), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }));
      m.position.set(tx, towerY(usd), tz + 0.92); group.add(m); return m;
    };
    if (st.marks.a != null) markBar(st.marks.a, PAL.armA, 1.2);
    if (st.marks.b != null) markBar(st.marks.b, PAL.armB, 1.2);
    if (st.marks.p1 != null) { const m = markBar(st.marks.p1, PAL.bnb, 2.2); m.layers.enable(BLOOM); bloomers.push(m); }
    scorePuck = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.6, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1da').multiplyScalar(2.2) }));
    scorePuck.position.set(tx, towerY(st.score ?? Tw.lo), tz); scorePuck.visible = st.score != null;
    scorePuck.layers.enable(BLOOM); bloomers.push(scorePuck); group.add(scorePuck);
  }

  // ── the console: a sloped desk, the dial, the pucks, the seal button, a brass rail ─────────────────────────────
  const K = C.console, tilt = (K.tilt * Math.PI) / 180;
  const slopeY = (z: number) => K.dial[1] - (z - K.dial[2]) * Math.tan(tilt);
  const zTop = 226.6, zBot = 233.4, yTop = slopeY(zTop), yBot = slopeY(zBot);
  {
    const cw = K.x1 - K.x0, cx = (K.x0 + K.x1) / 2;
    // the slope as a slab, then the front lip
    const len = (zBot - zTop) / Math.cos(tilt), midZ = (zTop + zBot) / 2, midY = (yTop + yBot) / 2;
    P.box(M.paint, cw, 0.3, len, cx, midY - 0.15 * Math.cos(tilt), midZ - 0.15 * Math.sin(tilt), 0.05, new THREE.Euler(tilt, 0, 0));
    // the slope's body under it, so the desk is solid from the side
    const side = new THREE.Shape(); side.moveTo(K.zb, 0); side.lineTo(K.zb, yTop); side.lineTo(zTop, yTop - 0.12); side.lineTo(zBot, yBot - 0.12); side.lineTo(K.zf, yBot - 0.12); side.lineTo(K.zf, 0); side.lineTo(K.zb, 0);
    const sg = new THREE.ExtrudeGeometry(side, { depth: cw - 0.2, bevelEnabled: false });
    sg.rotateY(-Math.PI / 2); sg.translate(K.x1 - 0.1, 0, 0);
    P.add(M.walnut, sg);
    // brass edges along the slope's top and bottom, and the rail
    P.box(M.brass, cw + 0.1, 0.14, 0.14, cx, yTop + 0.02, zTop, 0.03);
    P.box(M.brass, cw + 0.1, 0.14, 0.14, cx, yBot + 0.02, zBot + 0.05, 0.03);
    const railY = 1.25;
    P.add(M.brass, new THREE.CylinderGeometry(0.07, 0.07, cw + 1.4, 16).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(cx, railY, K.zf + 0.45));
    for (let x = K.x0 + 0.5; x <= K.x1 - 0.4; x += 4.4) P.add(M.brass, new THREE.CylinderGeometry(0.05, 0.05, railY, 10), new THREE.Matrix4().makeTranslation(x, railY / 2, K.zf + 0.45));
    // the zero line the pucks rest on, a brass inlay across the slope
    P.box(M.brass, 24 * K.pitch + 0.4, 0.05, 0.08, K.puckX0 + 11.5 * K.pitch, slopeY(K.dial[2]) + 0.02, K.dial[2], 0.01, new THREE.Euler(tilt, 0, 0));
  }
  const onSlope = (x: number, along: number, lift = 0): THREE.Matrix4 => {
    // a frame on the slope: along runs up the slope (toward the cabinet), lift off its surface
    const z = K.dial[2] - along * Math.cos(tilt), y = slopeY(K.dial[2]) + along * Math.sin(tilt);
    const n = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z).addScaledVector(n, lift), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)), new THREE.Vector3(1, 1, 1));
  };
  let pointer!: THREE.Mesh, setDial!: (s: number) => void;
  {
    // the dial: a knurled brass drum on a bezel of detents, a graphite cap with its pointer in the physical teal
    const [dx] = K.dial, R = 2.2;
    P.add(M.brassDark, new THREE.CylinderGeometry(R + 0.55, R + 0.6, 0.12, 64), onSlope(dx, 0, 0.06));
    const knurl = new THREE.CylinderGeometry(R, R, 0.7, 96, 1);
    {
      // ridges in the drum's side: every other column of vertices pushed out
      const p = knurl.attributes.position!;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.02 * Math.sign(Math.cos(a * 48)); if (Math.abs(Math.hypot(x, z) - R) < 1e-3) { p.setX(i, x * k); p.setZ(i, z * k); } }
      knurl.computeVertexNormals();
    }
    P.add(M.knurl, knurl, onSlope(dx, 0, 0.47));
    P.add(M.trim, new THREE.CylinderGeometry(R - 0.15, R - 0.08, 0.12, 64), onSlope(dx, 0, 0.86));
    // detents: 21 ticks over the dial's sweep, A at -60 deg and C at +60 deg; the two ends longer
    for (let i = 0; i <= 20; i++) {
      const a = ((-60 + i * 6) * Math.PI) / 180, end = i === 0 || i === 20, r = R + 0.35;
      const t = new THREE.BoxGeometry(end ? 0.14 : 0.07, 0.05, end ? 0.5 : 0.28).translate(0, 0, -r);
      t.rotateY(-a);
      P.add(end ? M.brass : M.steel, t, onSlope(dx, 0, 0.14));
    }
    // the pointer, at the dial's value: A at -60 deg, C at +60 deg
    pointer = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, R - 0.35).translate(0, 0, -(R - 0.35) / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.teal).multiplyScalar(1.6) }));
    pointer.matrixAutoUpdate = false; pointer.layers.enable(BLOOM); bloomers.push(pointer); group.add(pointer);
    const base = onSlope(dx, 0, 0.93), spin = new THREE.Matrix4();
    setDial = (s: number) => { pointer.matrix.copy(base).multiply(spin.makeRotationY(-((-60 + 120 * Math.max(0, Math.min(1, s))) * Math.PI) / 180)); pointer.matrixWorldNeedsUpdate = true; };
    setDial(st.dial);
  }
  const puckAt: Vec3[] = [], puckZero: Vec3[] = [];
  let setPucks!: (q: readonly number[]) => void;
  {
    // the 24 pucks: each in its slot, resting on the zero line, or pulled up the slope (sold) or down it (bought)
    const slot = new THREE.BoxGeometry(0.26, 0.04, 3.6);
    const disc = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 40), base = new THREE.TorusGeometry(0.52, 0.06, 10, 40).rotateX(Math.PI / 2);
    const tileGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const glass = glassMaterial('dark', grab, res, { size: [1.04, 1.04], radius: 0.52, rimW: 0.2, tiles: true });
    (glass as any).uniforms.uTintA.value = 0.18; (glass as any).uniforms.uDome.value = 0.5;
    const tiles = new THREE.InstancedMesh(tileGeo, glass, 24);
    const bases = new THREE.InstancedMesh(base, M.brassDark, 24), discs = new THREE.InstancedMesh(disc, M.trim, 24);
    for (const m of [bases, discs]) { m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(m); }
    tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const v = new THREE.Vector3(), grow = new THREE.Matrix4().makeScale(1.04, 1, 1.04);
    for (let h = 0; h < 24; h++) {
      const x = K.puckX0 + h * K.pitch;
      P.add(M.rubber, slot.clone(), onSlope(x, 0, 0.0));
      const z0 = v.setFromMatrixPosition(onSlope(x, 0, 0.24)); puckZero.push([z0.x, z0.y, z0.z]);
      puckAt.push([z0.x, z0.y, z0.z]);
    }
    setPucks = (q: readonly number[]) => {
      for (let h = 0; h < 24; h++) {
        const x = K.puckX0 + h * K.pitch, along = ((q[h] ?? 0) / 100) * 1.55;
        bases.setMatrixAt(h, onSlope(x, along, 0.1));
        discs.setMatrixAt(h, onSlope(x, along, 0.14));
        const m = onSlope(x, along, 0.24).multiply(grow);
        tiles.setMatrixAt(h, m);
        v.setFromMatrixPosition(m); puckAt[h] = [v.x, v.y, v.z];
      }
      for (const m of [bases, discs, tiles]) m.instanceMatrix.needsUpdate = true;
    };
    setPucks(st.q);
    tiles.renderOrder = 15; tiles.frustumCulled = false; overlay.push(tiles); group.add(tiles);
  }
  let setSeal!: (state: SealState) => void;
  {
    // the seal button: a dark glass dome in a ring of BNB yellow, lit only for a sealed plan
    const [sx2] = K.seal;
    P.add(M.trim, new THREE.CylinderGeometry(1.95, 2.05, 0.3, 64), onSlope(sx2, 0, 0.15));
    const dome = new THREE.SphereGeometry(1.45, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.32, 1);
    P.add(M.trim, dome, onSlope(sx2, 0, 0.3));
    const ringMat = new THREE.MeshBasicMaterial({ color: lin('#4a3c10').clone() });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.13, 14, 64).rotateX(Math.PI / 2), ringMat);
    ring.applyMatrix4(onSlope(sx2, 0, 0.32)); group.add(ring);
    // dark while the plan cannot be sealed, half lit when it can, BNB yellow and blooming once sealed
    const dark = lin('#4a3c10').clone(), ready = new THREE.Color(PAL.bnb).multiplyScalar(0.55), sealed = new THREE.Color(PAL.bnb).multiplyScalar(2.2);
    setSeal = (state: SealState) => {
      ringMat.color.copy(state === 'sealed' ? sealed : state === 'ready' ? ready : dark);
      if (state === 'sealed') ring.layers.enable(BLOOM); else ring.layers.disable(BLOOM);
    };
    bloomers.push(ring);
    setSeal(st.sealLit ? 'sealed' : 'dark');
  }

  P.build(group);
  for (const o of overlay) o.traverse((c) => c.layers.set(OVERLAY));
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material === M.screen) o.userData.noAO = true; });

  /** The bulbs' chase at time t: a slow run of light round the ring, every third bulb bright. */
  const tungsten = new THREE.Color('#ffcf8f'), lampC = new THREE.Color();
  const chase = (t: number) => {
    if (!lampMesh) return;
    for (const b of bulbs) {
      // every third bulb lit, the pattern stepping round the ring six times a second
      const k = (((b.phase - Math.floor(t * 6)) % 3) + 3) % 3 === 0 ? 1 : 0.32;
      lampMesh.setColorAt(b.i, lampC.copy(tungsten).multiplyScalar(3.4 * k));
    }
    if (lampMesh.instanceColor) lampMesh.instanceColor.needsUpdate = true;
  };

  const anchors = {
    screen: [[S.x0, S.y1, bz + 0.14], [S.x1, S.y1, bz + 0.14], [S.x1, S.y0, bz + 0.14], [S.x0, S.y0, bz + 0.14]] as [Vec3, Vec3, Vec3, Vec3],
    ticker: [[S.x0, T.y1, bz + 0.14], [S.x1, T.y1, bz + 0.14], [S.x1, T.y0, bz + 0.14], [S.x0, T.y0, bz + 0.14]] as [Vec3, Vec3, Vec3, Vec3],
    marquee: [[Mq.x0, Mq.y1, bz + 1.02], [Mq.x1, Mq.y1, bz + 1.02], [Mq.x1, Mq.y0, bz + 1.02], [Mq.x0, Mq.y0, bz + 1.02]] as [Vec3, Vec3, Vec3, Vec3],
    banner: [[Bn.x0, Bn.y1, (B.z0 + B.z1) / 2 + 2.57], [Bn.x1, Bn.y1, (B.z0 + B.z1) / 2 + 2.57], [Bn.x1, Bn.y0, (B.z0 + B.z1) / 2 + 2.57], [Bn.x0, Bn.y0, (B.z0 + B.z1) / 2 + 2.57]] as [Vec3, Vec3, Vec3, Vec3],
    zeroX, puckAt, puckZero, coinAt: tray.at,
    get bracket() { return tray.bracket; },
    towerAt: (usd: number): Vec3 => [Tw.x + 0.9, towerY(usd), Tw.z + 0.6],
    dial: K.dial, seal: K.seal,
    trayTick: (usd: number): Vec3 => [C.tray.x0 + ((usd * 1e6 - -3.75e9) / 2.5e8) * C.tray.pitch, C.win.y0 - 0.05, C.z1 + 0.2],
  };
  const setScore = (usd: number | null) => {
    scorePuck.visible = usd != null;
    if (usd != null) scorePuck.position.y = towerY(Math.max(Tw.lo - 150, Math.min(Tw.hi + 60, usd)));
  };
  return { group, bulbs, bloomers, chase, anchors, materials: M, coins: tray, setDial, setPucks, setScore, setSeal };
}
