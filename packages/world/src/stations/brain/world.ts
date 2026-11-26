// The brain world: the combined brain at the center, the three member brains (each can come to the center and become
// the main brain), the filaments that tie the members to the center, their orbit lights, the motes falling in, and the
// film's effects (the sparks that combine the brains, the five across links of Battery Tab, the review's capture, beam
// and cutoff). It is posed from a WorldPose, a plain description of one moment; the film's clock (clock.ts) and the
// site's controller (mount.ts) both produce them. The camera never moves: a virtual camera's inverse is applied to the
// world's root instead, so every brain frame shares one rest camera and the story player's holds can run the clock.
import * as THREE from 'three';
import { Cloud, type CloudEdge, type CloudPage, type CloudState } from './cloud';
import { makeRibbons, type Ribbons } from './ribbons';
import { BRAINS, BRAIN_IDS, SCENE, brainOf, connectionsOf, keyOf, pagesOf, seedFor, type BrainId, type Page } from './data';
import { rng } from '../../lib/random';
import type { PointsJob } from './prepare';

export const VFOV = 37;
/** Living Brain's start: azimuth 40 degrees from the front toward its right, 7.1 degrees up (the kit's azimuth runs
 *  the other way round: 140). */
export const REST: { target: [number, number, number]; az: number; el: number; dist: number } = { target: [0, 0, 0], az: 140, el: 7.1, dist: 2.08 };
/** The one camera every brain frame rests on (the stage's pose). */
export const restPose = () => ({ target: [...REST.target] as [number, number, number], az: REST.az, el: REST.el, dist: REST.dist, vfov: VFOV, shift: [0, 0] as [number, number], near: 0.05, far: 200 });

export const ORBIT = { radius: 1.4, period: 46, incl: [0.28, -0.2, 0.18], bob: [0.07, 0.05, 0.065] };
export const FILAMENT = { from: '#3fb7ff', toward: '#67f3df' };

export interface VirtualCam { target: THREE.Vector3; az: number; el: number; dist: number }

export interface CloudPose {
  pos: THREE.Vector3;
  scale: number;
  /** Rotation about the vertical (radians). */
  yaw: number;
  st: Omit<CloudState, 'eye' | 'pixelRatio' | 'height'>;
}

export interface WorldPose {
  /** The world's clock (twinkle, pulses, filament flow, orbit lights, motes). */
  time: number;
  cam: VirtualCam;
  center: CloudPose;
  members: Record<BrainId, CloudPose>;
  /** Filaments from the center to each member, their flowing dots and the orbit lights: 0 to 1. */
  filaments: number;
  orbs: number;
  motes: number;
  /** The combine's sparks: seconds since they set off, or null. */
  sparks: number | null;
  /** Pulses out along the filaments as each across link lands: the clock the links' drawAt run on, or null. */
  landing: number | null;
  /** Battery Tab's five across links (LB6): seconds since they start, and their fade; null when off. */
  links: { t: number; fade: number } | null;
  /** The review's three moments (LB7): seconds since the first (remember), or null. */
  review: number | null;
  /** The conflict across brains, flagged in rose over its link (LB3): 0 to 1. */
  conflict: number;
}

/** Which page of which cloud, for picking and tags. */
export interface PageRef { cloud: 'center' | BrainId; index: number; page: Page }

export interface WorldOptions {
  /** Particles: the center and the main brains 60,000, the members 60,000 (Living Brain draws every member full). */
  counts?: Partial<Record<'center' | BrainId, number>>;
}

const DEFAULT_COUNT = 60000;
/** What a world with these counts draws from shape.ts: each cloud's particles (seed and count) and its page places (seed
 *  and number), for prepare.ts to make off the main thread before the world is built. */
export function worldPoints(o: WorldOptions = {}): PointsJob {
  const counts = { center: DEFAULT_COUNT, 'grand-prix': DEFAULT_COUNT, 'battery-review': DEFAULT_COUNT, terminal: DEFAULT_COUNT, ...(o.counts ?? {}) };
  return {
    points: [...BRAIN_IDS.map((b) => ({ seed: seedFor(b), count: counts[b], shellShare: 0.7 })), { seed: seedFor('combined'), count: counts.center, shellShare: 0.7 }],
    spots: [...BRAIN_IDS.map((b) => ({ seed: seedFor(b) ^ 0x1b873593, n: pagesOf(b).length })), { seed: seedFor('combined') ^ 0x1b873593, n: SCENE.pages.length }],
  };
}

const col = (hex: string) => new THREE.Color(hex);
const ease = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * t * (t * (t * 6 - 15) + 10); };

/** A brain's pages as the cloud takes them: in Living Brain's order, weights from its connections. */
function cloudPages(pages: Page[], colorOf: (p: Page) => THREE.Color): CloudPage[] {
  const most = Math.max(1, ...pages.map((p) => p.connections));
  return pages.map((p) => ({ key: keyOf(p.brain, p.slug), weight: 0.3 + 0.7 * (p.connections / most), color: colorOf(p) }));
}

export class BrainWorld {
  readonly root = new THREE.Group();
  readonly center: Cloud;
  readonly members: Record<BrainId, Cloud>;
  /** The center's pages: every member's, in member order (Living Brain's combined numbering). */
  readonly centerPages: Page[];
  readonly memberPages: Record<BrainId, Page[]>;
  readonly centerIndex = new Map<string, number>();
  readonly memberIndex: Record<BrainId, Map<string, number>>;
  /** The across links in the center (the order they were made) and their draw times on the landing clock. */
  readonly acrossOrder: number[];
  private readonly filaments: Ribbons;
  private readonly flow: THREE.Points;
  private readonly flowPos: THREE.BufferAttribute;
  private readonly flowA: THREE.BufferAttribute;
  private readonly lanes: { brain: BrainId; lane: number; branch: number; rate: number; phase: number; sway: number; curl: number; lift: number; hb: number; skew: number; anchor: number; side: number; reach: number }[];
  private readonly orbs: { group: THREE.Group; brain: BrainId; r: number; w: number; bob: number; ph: number; tilt: number }[] = [];
  private readonly orbMat: THREE.ShaderMaterial;
  private readonly haloMat: THREE.ShaderMaterial;
  private readonly motes: THREE.Points;
  private readonly motePos: THREE.BufferAttribute;
  private readonly moteCol: THREE.BufferAttribute;
  private readonly moteA: THREE.BufferAttribute;
  private readonly moteU: Record<string, THREE.IUniform>;
  private readonly moteSeed: { s: number; o: number; seed: number }[];
  private readonly sparks: THREE.Points;
  private readonly sparkPos: THREE.BufferAttribute;
  private readonly sparkA: THREE.BufferAttribute;
  private readonly sparkU: Record<string, THREE.IUniform>;
  private readonly sparkList: { brain: BrainId; from: number; to: number; at: number }[];
  readonly links: Ribbons;
  readonly linkEnds: { brain: BrainId; index: number }[];
  readonly batteryIndex: number;
  private readonly streak: Ribbons;
  private readonly conflictLine: Ribbons;
  /** The across link the conflict sits on (an index into SCENE.across), and its pages in the center. */
  readonly conflictAcross: number;
  private readonly beam: Ribbons;
  private readonly flowU: Record<string, THREE.IUniform>;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly rig = { ref: new THREE.Object3D(), cam: new THREE.Object3D() };
  /** The pose last applied. */
  pose: WorldPose | null = null;

  constructor(o: WorldOptions = {}) {
    this.root.name = 'brainWorld';
    const counts = { center: DEFAULT_COUNT, 'grand-prix': DEFAULT_COUNT, 'battery-review': DEFAULT_COUNT, terminal: DEFAULT_COUNT, ...(o.counts ?? {}) };
    const dot = col('#4c8fff');
    // ── the members ───────────────────────────────────────────────────────────────────────────────────────────────
    this.memberPages = Object.fromEntries(BRAIN_IDS.map((b) => [b, pagesOf(b)])) as Record<BrainId, Page[]>;
    this.memberIndex = Object.fromEntries(BRAIN_IDS.map((b) => [b, new Map(this.memberPages[b].map((p, i) => [p.slug, i]))])) as Record<BrainId, Map<string, number>>;
    this.members = {} as Record<BrainId, Cloud>;
    for (const b of BRAIN_IDS) {
      const pages = this.memberPages[b], idx = this.memberIndex[b];
      const edges: CloudEdge[] = connectionsOf(b).map((c) => ({ a: idx.get(c.a)!, b: idx.get(c.b)!, sim: c.similarity }));
      this.members[b] = new Cloud({ seed: seedFor(b), pageSeed: seedFor(b) ^ 0x1b873593, count: counts[b], pages: cloudPages(pages, () => dot), edges, core: true });
      this.root.add(this.members[b].group);
    }
    // ── the combined brain at the center: every page, every own connection, and the 55 across as the extra set ──────
    this.centerPages = BRAIN_IDS.flatMap((b) => this.memberPages[b]);
    this.centerPages.forEach((p, i) => this.centerIndex.set(keyOf(p.brain, p.slug), i));
    const ci = (b: BrainId, s: string) => this.centerIndex.get(keyOf(b, s))!;
    const brainCol = Object.fromEntries(BRAINS.map((b) => [b.id, col(b.color)])) as Record<BrainId, THREE.Color>;
    const own: CloudEdge[] = SCENE.connections.map((c) => ({ a: ci(c.brain, c.a), b: ci(c.brain, c.b), sim: c.similarity }));
    const made = [...SCENE.across.keys()].sort((x, y) => SCENE.across[x]!.made.ct.localeCompare(SCENE.across[y]!.made.ct) || SCENE.across[y]!.similarity - SCENE.across[x]!.similarity);
    this.acrossOrder = made;
    const drawAt = acrossDrawTimes(made.map((i) => SCENE.across[i]!));
    const extra: CloudEdge[] = made.map((i, k) => {
      const x = SCENE.across[i]!;
      return { a: ci(x.aBrain, x.a), b: ci(x.bBrain, x.b), sim: x.similarity, colorA: brainCol[x.aBrain], colorB: brainCol[x.bBrain], width: 1.6, gain: 1.5, drawAt: drawAt[k]! };
    });
    this.center = new Cloud({ seed: seedFor('combined'), pageSeed: seedFor('combined') ^ 0x1b873593, count: counts.center, pages: cloudPages(this.centerPages, () => dot), edges: own, extra, core: true });
    this.root.add(this.center.group);

    // ── filaments: three lanes and two branches each, per member ─────────────────────────────────────────────────
    const fr = rng(seedFor('combined') ^ 0x7f4a7c15);
    this.lanes = [];
    for (const b of BRAIN_IDS) for (let lane = 0; lane < 3; lane++) for (let branch = -1; branch < 2; branch++) {
      this.lanes.push({ brain: b, lane, branch, rate: fr.range(0.41, 0.73), phase: fr.range(0, Math.PI * 2), sway: fr.range(0.04, 0.09), curl: fr.range(0.03, 0.06),
        lift: fr.range(0.08, 0.22), hb: fr.range(-0.08, 0.08), skew: fr.range(-0.04, 0.04), anchor: fr.range(0.3, 0.62), side: branch === 0 ? 1 : -1, reach: fr.range(0.12, 0.26) });
    }
    const SEG = 24;
    const blank = new Float32Array((SEG + 1) * 3);
    this.filaments = makeRibbons(this.lanes.map((l) => {
      const m = col(brainOf(l.brain).color).lerp(col(FILAMENT.toward), 0.3);
      return { pts: blank, colorA: col(FILAMENT.from).lerp(col(FILAMENT.toward), 0.3), colorB: m, sim: 1, gain: 1.93, width: 1.0 };
    }), { overlay: false });
    this.root.add(this.filaments.mesh);
    // the dots flowing along them: five per lane, two per branch, and two landing pulses per across link
    const flowN = this.lanes.reduce((n, l) => n + (l.branch < 0 ? 5 : 2), 0) + SCENE.across.length * 2;
    const fg = new THREE.BufferGeometry();
    this.flowPos = new THREE.BufferAttribute(new Float32Array(flowN * 3), 3);
    this.flowA = new THREE.BufferAttribute(new Float32Array(flowN), 1);
    const fc = new Float32Array(flowN * 3);
    let k = 0;
    for (const l of this.lanes) for (let j = 0; j < (l.branch < 0 ? 5 : 2); j++, k++) { const c = col(brainOf(l.brain).color).lerp(col('#ffffff'), 0.45); fc.set([c.r, c.g, c.b], k * 3); }
    for (; k < flowN; k++) fc.set([0.85, 0.97, 1.0], k * 3);
    fg.setAttribute('position', this.flowPos); fg.setAttribute('aColor', new THREE.BufferAttribute(fc, 3)); fg.setAttribute('aA', this.flowA);
    this.flowU = { uPixelRatio: { value: 1 }, uHeight: { value: 1080 }, uSize: { value: 0.034 } };
    this.flow = new THREE.Points(fg, dotsMaterial(this.flowU));
    this.flow.frustumCulled = false; this.flow.renderOrder = 5;
    this.root.add(this.flow);

    // ── orbit lights: one to four glassy orbs per member, tinted 28 % toward it ───────────────────────────────────
    this.orbMat = new THREE.ShaderMaterial({ vertexShader: ORB_VERT, fragmentShader: ORB_FRAG, uniforms: { uTime: { value: 0 }, uA: { value: 1 }, uTint: { value: new THREE.Color() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.haloMat = new THREE.ShaderMaterial({ vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, uniforms: { uA: { value: 1 }, uTint: { value: new THREE.Color() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const or = rng(seedFor('combined') ^ 0x3c6ef372);
    for (const b of BRAIN_IDS) {
      const n = 1 + or.int(4);
      for (let i = 0; i < n; i++) {
        const g = new THREE.Group();
        const tint = col('#dfe9ff').lerp(col(brainOf(b).color), 0.28);
        const orbM = this.orbMat.clone(); (orbM.uniforms.uTint!.value as THREE.Color).copy(tint); orbM.uniforms.uTime = this.orbMat.uniforms.uTime!;
        const haloM = this.haloMat.clone(); (haloM.uniforms.uTint!.value as THREE.Color).copy(tint);
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 24, 16), orbM));
        const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.21), haloM); halo.renderOrder = 6;
        g.add(halo);
        g.userData.halo = halo;
        this.members[b].group.add(g);
        this.orbs.push({ group: g, brain: b, r: or.range(0.73, 0.89), w: or.range(0.55, 1.0) * (or.next() < 0.5 ? -1 : 1), bob: or.range(0.09, 0.2), ph: or.range(0, Math.PI * 2), tilt: or.range(-0.5, 0.5) });
      }
    }

    // ── motes: 160 points falling in from radius 5.4, reborn at the edge ───────────────────────────────────────────
    const mr = rng(seedFor('combined') ^ 0x510e527f);
    this.moteSeed = Array.from({ length: 160 }, () => ({ s: 0.2 * (0.6 + 0.8 * mr.next()), o: mr.next(), seed: mr.int(1 << 30) }));
    const mg = new THREE.BufferGeometry();
    this.motePos = new THREE.BufferAttribute(new Float32Array(160 * 3), 3);
    this.moteCol = new THREE.BufferAttribute(new Float32Array(160 * 3), 3);
    this.moteA = new THREE.BufferAttribute(new Float32Array(160), 1);
    mg.setAttribute('position', this.motePos); mg.setAttribute('aColor', this.moteCol); mg.setAttribute('aA', this.moteA);
    this.moteU = { uPixelRatio: { value: 1 }, uHeight: { value: 1080 }, uSize: { value: 0.02 } };
    this.motes = new THREE.Points(mg, dotsMaterial(this.moteU));
    this.motes.frustumCulled = false;
    this.root.add(this.motes);

    // ── the combine's sparks: one per page, from its member to its place in the combined brain ──────────────────
    const sr = rng(seedFor('combined') ^ 0x9b05688c);
    this.sparkList = BRAIN_IDS.flatMap((b) => this.memberPages[b].map((p, i) => ({ brain: b, from: i, to: this.centerIndex.get(keyOf(b, p.slug))!, at: sr.range(0, 1.4) })));
    const sg = new THREE.BufferGeometry();
    this.sparkPos = new THREE.BufferAttribute(new Float32Array(this.sparkList.length * 3), 3);
    this.sparkA = new THREE.BufferAttribute(new Float32Array(this.sparkList.length), 1);
    const sc = new Float32Array(this.sparkList.length * 3);
    this.sparkList.forEach((s, i) => { const c = col(brainOf(s.brain).color).lerp(col('#ffffff'), 0.5); sc.set([c.r, c.g, c.b], i * 3); });
    sg.setAttribute('position', this.sparkPos); sg.setAttribute('aColor', new THREE.BufferAttribute(sc, 3)); sg.setAttribute('aA', this.sparkA);
    this.sparkU = { uPixelRatio: { value: 1 }, uHeight: { value: 1080 }, uSize: { value: 0.05 } };
    this.sparks = new THREE.Points(sg, dotsMaterial(this.sparkU));
    this.sparks.frustumCulled = false; this.sparks.renderOrder = 7;
    this.root.add(this.sparks);

    // ── Battery Tab's five across links, from the main Grand Prix brain into the two members ─────────────────────
    const gp = this.memberIndex['grand-prix'];
    this.batteryIndex = gp.get('battery-tab')!;
    const five = SCENE.across.filter((x) => (x.aBrain === 'grand-prix' && x.a === 'battery-tab') || (x.bBrain === 'grand-prix' && x.b === 'battery-tab'))
      .sort((x, y) => y.similarity - x.similarity);
    this.linkEnds = five.map((x) => { const other = x.aBrain === 'grand-prix' && x.a === 'battery-tab' ? { brain: x.bBrain, slug: x.b } : { brain: x.aBrain, slug: x.a }; return { brain: other.brain, index: this.memberIndex[other.brain].get(other.slug)! }; });
    const LS = 40, lblank = new Float32Array((LS + 1) * 3);
    this.links = makeRibbons(five.map((x, i) => ({ pts: lblank, a: -1, b: -1, colorA: col(brainOf('grand-prix').color), colorB: col(brainOf(this.linkEnds[i]!.brain).color), sim: x.similarity, width: 1.8, gain: 2.6, drawAt: i * 0.25 })), { overlay: false });
    this.links.uniforms.uDrawDur!.value = 0.6;
    this.root.add(this.links.mesh);
    // the review's capture streak and retrieval beam
    const rline = (a: string, b: string, w: number) => makeRibbons([{ pts: new Float32Array(31 * 3), a: -1, b: -1, colorA: col(a), colorB: col(b), sim: 1, width: w, gain: 1.6, drawAt: 0 }], { overlay: false });
    this.streak = rline('#ffffff', '#8f8cff', 2.0);
    this.beam = rline('#73e6ff', '#c8f8ff', 1.3);
    this.streak.uniforms.uDrawDur!.value = 0.8; this.beam.uniforms.uDrawDur!.value = 0.7;
    this.root.add(this.streak.mesh, this.beam.mesh);
    // the conflict: the across link between the two Wattness Terminal pages, drawn again in rose-300 when flagged
    this.conflictAcross = SCENE.across.findIndex((x) => !!x.conflict);
    const ck = Math.max(0, this.acrossOrder.indexOf(this.conflictAcross));
    this.conflictLine = makeRibbons([{ pts: this.center.extraCurves[ck] ?? new Float32Array(6), a: -1, b: -1, colorA: col('#fda4af'), colorB: col('#fda4af'), sim: 1, width: 2.2, gain: 2.0 }], { overlay: false });
    this.conflictLine.mesh.renderOrder = 8;
    this.center.group.add(this.conflictLine.mesh);

    this.root.traverse((x) => { x.userData.overlay = true; x.userData.noAO = true; });
    // the reference camera, for the rig
    setPose(this.rig.ref, new THREE.Vector3(...REST.target), REST.az, REST.el, REST.dist);
  }

  /** The aspect of the drawing buffer (for the ribbons' pixel widths). */
  setAspect(aspect: number) {
    for (const c of [this.center, ...Object.values(this.members)]) c.aspect = aspect;
    this.aspect = aspect;
  }
  aspect = 16 / 9;

  /** Applies a pose. view: the canvas size in CSS px and the pixel ratio; camera: the stage's (fixed) camera. */
  apply(p: WorldPose, view: { height: number; dpr: number }, camera: THREE.Camera) {
    this.pose = p;
    // the rig: the reference camera's world matrix times the virtual camera's inverse
    setPose(this.rig.cam, p.cam.target, p.cam.az, p.cam.el, p.cam.dist);
    this.rig.ref.updateMatrixWorld(); this.rig.cam.updateMatrixWorld();
    this.root.matrixAutoUpdate = false;
    this.root.matrix.copy(this.rig.ref.matrixWorld).multiply(this.rig.cam.matrixWorld.clone().invert());
    this.root.matrixWorldNeedsUpdate = true;
    this.root.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    const eye = camera.getWorldPosition(new THREE.Vector3());
    const H = view.height, pr = view.dpr;
    const place = (c: Cloud, cp: CloudPose) => {
      c.group.position.copy(cp.pos); c.group.scale.setScalar(Math.max(1e-4, cp.scale)); c.group.rotation.set(0, cp.yaw, 0);
      c.group.visible = cp.st.bright > 0.001 || cp.st.pageFade > 0.001;
      c.group.updateMatrixWorld(true);
      c.pose({ ...cp.st, eye, pixelRatio: pr, height: H });
    };
    place(this.center, p.center);
    for (const b of BRAIN_IDS) place(this.members[b], p.members[b]);
    const U = (u: Record<string, THREE.IUniform>) => { u.uPixelRatio!.value = pr; u.uHeight!.value = H; };
    U(this.flowU); U(this.moteU); U(this.sparkU);
    this.poseFilaments(p, pr, H);
    this.poseOrbs(p);
    this.poseMotes(p);
    this.poseSparks(p);
    this.poseLinks(p, pr, H);
    this.poseReview(p, pr, H);
    const CU = this.conflictLine.uniforms;
    CU.uFade!.value = p.conflict; CU.uPixelRatio!.value = pr; (CU.uRes!.value as THREE.Vector2).set(H * pr * this.aspect, H * pr);
    this.conflictLine.mesh.visible = p.conflict > 0.001;
  }

  /** A member's position on its orbit (orbit angle th, radians, measured round the vertical from +x). */
  static orbitAt(i: number, th: number, out = new THREE.Vector3()): THREE.Vector3 {
    const R = ORBIT.radius, inc = ORBIT.incl[i % 3]!, s = Math.sin(th);
    return out.set(Math.cos(th) * R, s * R * Math.sin(inc) + Math.sin(th + 0.35 + 0.95 * i) * ORBIT.bob[i % 3]!, s * R * Math.cos(inc));
  }

  private poseFilaments(p: WorldPose, pr: number, H: number) {
    const f = p.filaments;
    const U = this.filaments.uniforms;
    U.uFade!.value = f; U.uPixelRatio!.value = pr; (U.uRes!.value as THREE.Vector2).set(H * pr * this.aspect, H * pr);
    this.filaments.mesh.visible = f > 0.001;
    this.flow.visible = f > 0.001 || p.landing != null;
    const C = this.center.group.position, t = p.time;
    const side = new THREE.Vector3(), lift = new THREE.Vector3(), d = new THREE.Vector3();
    const curves = new Map<string, THREE.Vector3[]>();
    let k = 0;
    const pts = new Float32Array(25 * 3);
    this.lanes.forEach((l, i) => {
      const m = this.members[l.brain].group;
      const P = m.position, s = m.scale.x;
      d.copy(P).sub(C); if (d.lengthSq() < 1e-6) d.set(0, 0, 1); d.normalize();
      frame(d, side, lift);
      const a = (l.lane - 1) * 0.105;
      const sway = Math.sin(t * l.rate + l.phase) * l.sway, curl = Math.sin(t * 0.52 * l.rate + 1.7 * l.phase) * l.curl;
      let ctrl: THREE.Vector3[];
      if (l.branch < 0) {
        const n0 = C.clone().addScaledVector(d, 0.16).addScaledVector(side, 0.38 * a + l.skew).addScaledVector(lift, curl + 0.25 * l.hb);
        const h = P.clone().addScaledVector(d, -0.18 * s).addScaledVector(side, 0.92 * a + l.skew).addScaledVector(lift, l.hb);
        ctrl = [n0,
          n0.clone().lerp(h, 0.24).addScaledVector(lift, 0.48 * l.lift + 0.9 * curl).addScaledVector(side, 0.58 * a + 0.28 * sway),
          n0.clone().lerp(h, 0.55).addScaledVector(lift, l.lift + 0.35 * curl).addScaledVector(side, sway + 1.4 * a),
          n0.clone().lerp(h, 0.83).addScaledVector(lift, 0.2 * l.lift - 0.55 * curl).addScaledVector(side, 0.18 * a - 0.34 * sway), h];
        curves.set(`${l.brain}:${l.lane}`, new THREE.CatmullRomCurve3(ctrl).getPoints(24));
      } else {
        const lane = curves.get(`${l.brain}:${l.lane}`)!;
        const r = lane[Math.round(l.anchor * 24)]!.clone();
        const u = P.clone().addScaledVector(d, -0.18 * s * 0.82).addScaledVector(side, 0.46 * a + l.skew + l.side * l.reach * 0.72).addScaledVector(lift, 0.7 * l.hb + 0.28 * l.lift);
        ctrl = [r, r.clone().lerp(u, 0.35).addScaledVector(side, l.side * (l.reach + sway)).addScaledVector(lift, l.lift * 0.6 + curl),
          r.clone().lerp(u, 0.72).addScaledVector(side, l.side * (0.42 * l.reach - 0.2 * sway)).addScaledVector(lift, 0.2 * l.lift - 0.4 * curl), u];
      }
      const cps = l.branch < 0 ? curves.get(`${l.brain}:${l.lane}`)! : new THREE.CatmullRomCurve3(ctrl).getPoints(24);
      cps.forEach((q, j) => { pts[j * 3] = q.x; pts[j * 3 + 1] = q.y; pts[j * 3 + 2] = q.z; });
      this.filaments.setLine(i, pts);
      // the member's own fade (it fades with the zoom) carries its filaments' dots
      const mf = Math.min(1, p.members[l.brain].st.bright);
      const dots = l.branch < 0 ? 5 : 2;
      const period = (l.branch < 0 ? 3.45 : 4.2) + l.lane * 0.36 + (l.rate - 0.41) * 2.5;
      for (let j = 0; j < dots; j++, k++) {
        const u = (((t / period + j / dots + l.phase / 6.283) % 1) + 1) % 1;
        const e = u * u * (3 - 2 * u);
        const q = cps[Math.min(23, Math.floor(e * 24))]!, q2 = cps[Math.min(24, Math.floor(e * 24) + 1)]!;
        const fr = e * 24 - Math.floor(e * 24);
        this.flowPos.setXYZ(k, q.x + (q2.x - q.x) * fr, q.y + (q2.y - q.y) * fr, q.z + (q2.z - q.z) * fr);
        this.flowA.setX(k, f * mf * Math.sin(Math.PI * u) * 0.9);
      }
    });
    // landing pulses: as each across link lands, a dot runs out along lane 1 of both its members' filaments
    const landing = p.landing;
    SCENE.across.forEach((x, i) => {
      const at = this.center.spec.extra![this.acrossOrder.indexOf(i)]!.drawAt ?? 0;
      for (let j = 0; j < 2; j++, k++) {
        const b = j ? x.bBrain : x.aBrain;
        const u = landing == null ? -1 : (landing - at - 0.45) / 1.1;
        if (u < 0 || u > 1) { this.flowA.setX(k, 0); this.flowPos.setXYZ(k, 0, -50, 0); continue; }
        const lane = curves.get(`${b}:1`)!;
        const e = u * u * (3 - 2 * u), q = lane[Math.min(24, Math.round(e * 24))]!;
        this.flowPos.setXYZ(k, q.x, q.y, q.z);
        this.flowA.setX(k, Math.sin(Math.PI * u) * 1.6 * Math.max(f, 0.6));
      }
    });
    this.filaments.commit();
    this.flowPos.needsUpdate = true; this.flowA.needsUpdate = true;
  }

  private poseOrbs(p: WorldPose) {
    const t = p.time;
    this.orbMat.uniforms.uTime!.value = t;
    for (const o of this.orbs) {
      const a = t * o.w + o.ph;
      o.group.position.set(Math.cos(a) * o.r, Math.sin(t * 0.7 + o.ph) * o.bob + Math.sin(a) * o.r * Math.sin(o.tilt), Math.sin(a) * o.r * Math.cos(o.tilt));
      const k = p.orbs * Math.min(1, p.members[o.brain].st.bright) * (p.members[o.brain].st.tintK > 0.3 ? 1 : 0);
      o.group.visible = k > 0.001;
      const orbMesh = o.group.children[0] as THREE.Mesh, halo = o.group.userData.halo as THREE.Mesh;
      (orbMesh.material as THREE.ShaderMaterial).uniforms.uA!.value = k;
      (halo.material as THREE.ShaderMaterial).uniforms.uA!.value = k;
    }
  }

  private poseMotes(p: WorldPose) {
    const R = 5.4, t = p.time;
    const far = col('#7c8fff'), near = col('#ffffff'), c = new THREE.Color();
    this.moteSeed.forEach((m, i) => {
      const a = (1.3 * m.s) / R, bOverA = (1.6 * R) / 1.3;
      const T = Math.log((bOverA - 0.12) / (bOverA - R)) / a;
      const x = t / T + m.o, cycle = Math.floor(x), tau = (x - cycle) * T;
      const r = bOverA + (R - bOverA) * Math.exp(a * tau);
      const h = rng((m.seed + cycle * 7919) >>> 0);
      let u = 0, v = 0, w = 0, q = 0;
      do { u = h.next() * 2 - 1; v = h.next() * 2 - 1; w = h.next() * 2 - 1; q = u * u + v * v + w * w; } while (q > 1 || q === 0);
      const s = r / Math.sqrt(q);
      this.motePos.setXYZ(i, u * s, v * s, w * s);
      const k = 1 - Math.min(1, Math.max(0, r / R));
      c.copy(far).lerp(near, 0.7 * k);
      this.moteCol.setXYZ(i, c.r, c.g, c.b);
      this.moteA.setX(i, (0.25 + 0.75 * k) * p.motes);
    });
    this.motes.visible = p.motes > 0.001;
    this.motePos.needsUpdate = true; this.moteCol.needsUpdate = true; this.moteA.needsUpdate = true;
  }

  private poseSparks(p: WorldPose) {
    const s = p.sparks;
    this.sparks.visible = s != null;
    if (s == null) return;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.sparkList.forEach((sp, i) => {
      const u = (s - sp.at) / 1.1;
      if (u <= 0 || u >= 1) { this.sparkA.setX(i, 0); this.sparkPos.setXYZ(i, 0, -50, 0); return; }
      this.members[sp.brain].pageWorld(sp.from, a);
      this.center.pageWorld(sp.to, b);
      // into the root's frame (the sparks are its children)
      this.root.worldToLocal(a); this.root.worldToLocal(b);
      const e = ease(u);
      const q = a.clone().lerp(b, e).addScaledVector(up, Math.sin(Math.PI * e) * 0.22);
      this.sparkPos.setXYZ(i, q.x, q.y, q.z);
      this.sparkA.setX(i, Math.sin(Math.PI * u) * 1.4);
    });
    this.sparkPos.needsUpdate = true; this.sparkA.needsUpdate = true;
  }

  private poseLinks(p: WorldPose, pr: number, H: number) {
    const L = p.links, U = this.links.uniforms;
    this.links.mesh.visible = L != null && L.fade > 0.001;
    if (!L) return;
    U.uTime!.value = L.t; U.uFade!.value = L.fade; U.uPixelRatio!.value = pr; (U.uRes!.value as THREE.Vector2).set(H * pr * this.aspect, H * pr);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3(), out = new Float32Array(41 * 3);
    const gp = this.members['grand-prix'];
    this.linkEnds.forEach((e, i) => {
      gp.pageWorld(this.batteryIndex, a); this.members[e.brain].pageWorld(e.index, b);
      this.root.worldToLocal(a); this.root.worldToLocal(b);
      const c = this.center.group.position;
      mid.copy(a).add(b).multiplyScalar(0.5);
      const away = mid.clone().sub(c); away.y += 0.3; away.normalize();
      const ctrl = mid.clone().addScaledVector(away, 0.35 + 0.08 * i);
      const curve = new THREE.QuadraticBezierCurve3(a.clone(), ctrl, b.clone());
      curve.getPoints(40).forEach((q, j) => { out[j * 3] = q.x; out[j * 3 + 1] = q.y; out[j * 3 + 2] = q.z; });
      this.links.setLine(i, out);
    });
    this.links.commit();
  }

  /** The review's capture (a streak into its one page, at 0 s) and the retrieval's beam (at 4 s). */
  private poseReview(p: WorldPose, pr: number, H: number) {
    const r = p.review;
    this.streak.mesh.visible = r != null && r >= 0 && r < 2;
    this.beam.mesh.visible = r != null && r >= 4 && r < 8.2;
    if (r == null) return;
    const dot = this.members['battery-review'].pageWorld(0, new THREE.Vector3());
    this.root.worldToLocal(dot);
    const pts = new Float32Array(31 * 3);
    const set = (R: Ribbons, from: THREE.Vector3, t: number, fade: number) => {
      const ctrl = from.clone().lerp(dot, 0.5).add(new THREE.Vector3(0, 0.3, 0));
      new THREE.QuadraticBezierCurve3(from, ctrl, dot).getPoints(30).forEach((q, j) => { pts[j * 3] = q.x; pts[j * 3 + 1] = q.y; pts[j * 3 + 2] = q.z; });
      R.setLine(0, pts); R.commit();
      const U = R.uniforms;
      U.uPixelRatio!.value = pr; (U.uRes!.value as THREE.Vector2).set(H * pr * this.aspect, H * pr);
      U.uTime!.value = t; U.uFade!.value = fade;
    };
    // the capture comes in from the upper left and fades once it lands; the beam from the upper right, held to 8 s
    set(this.streak, dot.clone().add(new THREE.Vector3(-1.9, 1.2, 0.5)), r, Math.max(0, 1 - Math.max(0, r - 0.95) / 0.8));
    set(this.beam, dot.clone().add(new THREE.Vector3(1.8, 1.1, 0.4)), r - 4, Math.min(1, Math.max(0, (8.2 - r) / 0.3)));
  }

  dispose() {
    this.center.dispose();
    for (const m of Object.values(this.members)) m.dispose();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const x of mats) x.dispose();
    });
  }
}

/** The across links' draw times on the landing clock (seconds from the first): the 17 made as the paced run's notes
 *  compiled, one by one over 3 s; then Find links' 38 over 3.5 s from 3.5 s, their real spacing kept in proportion. */
export function acrossDrawTimes(xs: { made: { ct: string } }[]): number[] {
  const secs = xs.map((x) => { const m = /(\d{2}):(\d{2}):(\d{2}) CT$/.exec(x.made.ct)!; const d = /-(\d{2}) /.exec(x.made.ct)!; return Number(d[1]) * 86400 + Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]); });
  // the paced run's are those before the Find links run (Nov 26 00:20 CT): a gap of more than 20 minutes splits them
  const split = secs.findIndex((s, i) => i > 0 && s - secs[i - 1]! > 1200);
  const first = split < 0 ? secs.length : split;
  const out: number[] = [];
  for (let i = 0; i < first; i++) out.push(first > 1 ? (3.0 * i) / (first - 1) * 0.92 : 0);
  const a = secs[first] ?? 0, b = secs[secs.length - 1] ?? a;
  for (let i = first; i < secs.length; i++) out.push(3.5 + (b > a ? ((secs[i]! - a) / (b - a)) * 3.0 : (3.0 * (i - first)) / Math.max(1, secs.length - first - 1)));
  return out;
}

/** A camera-like object at a pose (the kit's spherical rule: azimuth from the target toward the camera). */
function setPose(o: THREE.Object3D, target: THREE.Vector3, az: number, el: number, dist: number) {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  o.position.set(target.x + Math.sin(a) * Math.cos(e) * dist, target.y + Math.sin(e) * dist, target.z - Math.cos(a) * Math.cos(e) * dist);
  o.up.set(0, 1, 0);
  o.lookAt(target);
  // Object3D.lookAt points +z at the target; a camera looks down -z: turn it round
  o.rotateY(Math.PI);
}

function frame(d: THREE.Vector3, side: THREE.Vector3, lift: THREE.Vector3) {
  side.set(0, 1, 0).cross(d);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0).cross(d);
  side.normalize();
  lift.copy(d).cross(side).normalize();
}

const DOTS_VERT = /* glsl */`
attribute vec3 aColor;
attribute float aA;
uniform float uPixelRatio;
uniform float uHeight;
uniform float uSize;
varying vec3 vColor;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vColor = aColor; vA = aA;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPixelRatio * (uHeight * 0.5 / -mv.z);
}`;
const DOTS_FRAG = /* glsl */`
varying vec3 vColor;
varying float vA;
void main() {
  if (vA <= 0.001) discard;
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  float core = smoothstep(0.4, 0.0, d);
  float halo = pow(smoothstep(1.0, 0.0, d), 1.6);
  float a = max(core, halo * 0.5) * vA;
  gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.6) * 1.2, a);
}`;
function dotsMaterial(u: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({ vertexShader: DOTS_VERT, fragmentShader: DOTS_FRAG, uniforms: u, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending });
}

const ORB_VERT = /* glsl */`
varying vec3 vN;
varying vec3 vV;
varying vec3 vL;
void main() {
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = -p.xyz; vL = normalize(position);
  gl_Position = projectionMatrix * p;
}`;
const ORB_FRAG = /* glsl */`
uniform float uTime;
uniform float uA;
uniform vec3 uTint;
varying vec3 vN;
varying vec3 vV;
varying vec3 vL;
void main() {
  vec3 n = normalize(vN);
  float facing = max(dot(n, normalize(vV)), 0.0);
  float rim = pow(1.0 - facing, 2.7), broad = pow(1.0 - facing, 1.3);
  float t = uTime * 0.3;
  float cloud = sin(vL.x * 5.0 + t + sin(vL.y * 4.0 - t * 0.6));
  float streak = pow(max(0.0, cloud), 10.0);
  float glint = pow(max(dot(n, normalize(vec3(-0.45, 0.7, 0.5))), 0.0), 18.0);
  vec3 c = vec3(0.01, 0.018, 0.04) + uTint * (broad * 0.25 + rim * 0.95) + vec3(0.6, 0.8, 1.0) * (glint * 0.7 + streak * (0.08 + rim * 0.3));
  gl_FragColor = vec4(c * 0.9, uA);
}`;
const HALO_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  c.xy += position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  gl_Position = projectionMatrix * c;
}`;
const HALO_FRAG = /* glsl */`
uniform float uA;
uniform vec3 uTint;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float ring = exp(-pow((r - 0.52) / 0.12, 2.0)) * 0.35 + exp(-pow(r / 0.6, 2.0)) * 0.12;
  gl_FragColor = vec4(uTint * ring, uA * ring);
}`;
