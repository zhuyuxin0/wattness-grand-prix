// The garage's pit (its G03 hook, SPEC 4.8): Living Brain's three brains of ours lying under the glass floor, as the
// brain station draws them, in place of the wire network the pit held. In a row along the pit: the Terminal's brain
// over its six layer plates, the Grand Prix brain beside it, Desert Willow's review at the east end where its thread
// rises to the pit wall's C board; each tinted toward its member color, formed, without tags; the 55 connections across
// brains as thin glowing curves between them. The pit is 8 m deep, so each brain lies low (its height under a third
// of its length): seen from the hall above it reads as a brain from the top. Brighter than in the brain station: it is
// seen through the floor's frosted glass in a lit hall. Still: no clock in the garage moves it.
import * as THREE from 'three';
import { Cloud, type CloudEdge } from './cloud';
import { makeRibbons } from './ribbons';
import { BRAIN_IDS, SCENE, brainOf, connectionsOf, pagesOf, seedFor, type BrainId } from './data';

export interface PitBrains {
  group: THREE.Group;
  /** The clouds' brightness (2.6 by default; a frame seen from far above, through the glass, raises it). */
  setBright(k: number): void;
  /** The Terminal brain's pages by slug, in the garage's coordinates (G03 rings the Wattness Terminal page). */
  pos: Map<string, [number, number, number]>;
  /** The review's one page: where Desert Willow's thread starts. */
  dw: [number, number, number];
}

/** fp: the pit's footprint (x0, x1, z0, z1); res: the drawing buffer's size in px. */
export function pitBrains(fp: { x0: number; x1: number; z0: number; z1: number }, res: THREE.Vector2, o: { count?: number } = {}): PitBrains {
  const group = new THREE.Group(); group.name = 'livingBrainPit';
  const cz = (fp.z0 + fp.z1) / 2;
  // along the pit, in the garage's x: the Terminal over its parts, the Grand Prix brain, the review at the east end
  const at: Record<BrainId, [number, number, number]> = { terminal: [6, -4.2, cz + 1], 'grand-prix': [78, -4.2, cz - 1], 'battery-review': [fp.x1 - 34, -4.2, cz - 6] };
  const S = { xz: 24, y: 7.0 };
  const dot = new THREE.Color('#4c8fff');
  const clouds = {} as Record<BrainId, Cloud>;
  for (const b of BRAIN_IDS) {
    const pages = pagesOf(b), idx = new Map(pages.map((p, i) => [p.slug, i]));
    const most = Math.max(1, ...pages.map((p) => p.connections));
    const edges: CloudEdge[] = connectionsOf(b).map((c) => ({ a: idx.get(c.a)!, b: idx.get(c.b)!, sim: c.similarity }));
    const c = new Cloud({ seed: seedFor(b), pageSeed: seedFor(b) ^ 0x1b873593, count: o.count ?? 20000, core: false, edges,
      pages: pages.map((p) => ({ key: `${b}/${p.slug}`, weight: 0.3 + 0.7 * (p.connections / most), color: dot })) });
    c.group.position.set(...at[b]);
    c.group.scale.set(S.xz, S.y, S.xz);
    c.group.rotation.y = Math.PI / 2; // the front of each brain toward the east, along the pit
    c.aspect = res.x / res.y;
    group.add(c.group);
    clouds[b] = c;
  }
  group.updateMatrixWorld(true);
  const pageAt = (b: BrainId, slug: string) => {
    const i = pagesOf(b).findIndex((p) => p.slug === slug);
    return clouds[b].pageWorld(Math.max(0, i), new THREE.Vector3());
  };
  // the 55 across: arcs from page to page, rising a little toward the glass
  const across = makeRibbons(SCENE.across.map((x) => {
    const a = pageAt(x.aBrain, x.a), c = pageAt(x.bBrain, x.b);
    const mid = a.clone().add(c).multiplyScalar(0.5); mid.y = Math.min(-0.6, Math.max(a.y, c.y) + 1.6);
    const pts = new THREE.QuadraticBezierCurve3(a, mid, c).getPoints(32).flatMap((p) => [p.x, p.y, p.z]);
    return { pts: new Float32Array(pts), a: -1, b: -1, colorA: new THREE.Color(brainOf(x.aBrain).color), colorB: new THREE.Color(brainOf(x.bBrain).color), sim: x.similarity, width: 1.0, gain: 1.0 };
  }), { overlay: false });
  (across.uniforms.uRes!.value as THREE.Vector2).copy(res);
  group.add(across.mesh);
  // posed once, formed and tinted, for whatever camera draws them (the depth term reads it as they render)
  const eye = new THREE.Vector3(0, 400, 0);
  const states: { c: Cloud; st: Parameters<Cloud['pose']>[0] }[] = [];
  for (const b of BRAIN_IDS) {
    const c = clouds[b];
    const st = { time: 0, form: 1, coreForm: 1, breath: 0, tint: new THREE.Color(brainOf(b).color), tintK: 0.72, bright: 2.6, coreK: 0, pageFade: 1, sel: -1, selT: 0, eye, pixelRatio: 1, height: res.y, sizeK: S.xz * 1.3 };
    c.pose(st);
    c.body.onBeforeRender = (_r, _s, cam) => { cam.getWorldPosition(eye); c.pose({ ...st, eye }); };
    states.push({ c, st });
  }
  const pos = new Map<string, [number, number, number]>();
  pagesOf('terminal').forEach((p) => { const v = pageAt('terminal', p.slug); pos.set(p.slug, [v.x, v.y, v.z]); });
  const r = pageAt('battery-review', pagesOf('battery-review')[0]!.slug);
  const setBright = (k: number) => { for (const { c, st } of states) { st.bright = k; c.pose(st); } };
  return { group, setBright, pos, dw: [r.x, r.y, r.z] };
}
