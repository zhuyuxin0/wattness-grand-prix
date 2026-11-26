// One brain drawn inside another station's scene, as the brain station draws it (cloud.ts): the stack's Living Brain
// piece holds, in its glass sphere, the combined brain of our three (every page of the Grand Prix build's, the
// Terminal's and Desert Willow's review, every own connection, and the 55 across brains), formed, with its core. Posed
// whenever it is drawn, for that camera: its sprites sized for the lens (lensK) and for the drawing buffer, its
// brightness the host's (dim(k): the stack's hover dims every other piece). Still unless the host turns it.
import * as THREE from 'three';
import { Cloud, lensK, type CloudEdge, type CloudPage } from './cloud';
import { BRAIN_IDS, SCENE, brainOf, keyOf, pagesOf, seedFor, type BrainId } from './data';

export interface InsetBrain {
  group: THREE.Group;
  /** The cloud's clock (its twinkle and its pulses), in seconds. */
  setTime(t: number): void;
  /** A stand-in material for a host that dims pieces by a uniform (the stack's hover.ts sets uOpacity 0 to 1). */
  dimmer: { uniforms: { uOpacity: { value: number } } };
}

/** at: the center; size: the brain's half-length in the host's units; o.count: particles (30,000); o.bright: 1. */
export function insetBrain(at: THREE.Vector3, size: number, o: { count?: number; bright?: number; renderOrder?: number } = {}): InsetBrain {
  const pages = BRAIN_IDS.flatMap((b) => pagesOf(b));
  const index = new Map(pages.map((p, i) => [keyOf(p.brain, p.slug), i]));
  const at$ = (b: BrainId, slug: string) => index.get(keyOf(b, slug))!;
  const most = Math.max(1, ...pages.map((p) => p.connections));
  const dot = new THREE.Color('#4c8fff');
  const cloudPages: CloudPage[] = pages.map((p) => ({ key: keyOf(p.brain, p.slug), weight: 0.3 + 0.7 * (p.connections / most), color: dot }));
  const edges: CloudEdge[] = SCENE.connections.map((c) => ({ a: at$(c.brain, c.a), b: at$(c.brain, c.b), sim: c.similarity }));
  const extra: CloudEdge[] = SCENE.across.map((x) => ({ a: at$(x.aBrain, x.a), b: at$(x.bBrain, x.b), sim: x.similarity,
    colorA: new THREE.Color(brainOf(x.aBrain).color), colorB: new THREE.Color(brainOf(x.bBrain).color), width: 1.2, gain: 1.2 }));
  const cloud = new Cloud({ seed: seedFor('combined'), pageSeed: seedFor('combined') ^ 0x1b873593, count: o.count ?? 30000, pages: cloudPages, edges, extra, core: true });
  // the shape's half-extent is 0.62 of a unit (shape.ts): a brain of half-length `size`
  const S = size / 0.62;
  cloud.group.position.copy(at);
  cloud.group.scale.setScalar(S);
  cloud.group.name = 'livingBrainInset';
  const order = o.renderOrder ?? 0;
  if (order) cloud.group.traverse((x) => { x.renderOrder += order; });
  const dimmer = { uniforms: { uOpacity: { value: 1 } } };
  const eye = new THREE.Vector3(), buf = new THREE.Vector2();
  const st = { time: 0, form: 1, coreForm: 1, breath: 0, tint: new THREE.Color(1, 1, 1), tintK: 0, bright: o.bright ?? 1, coreK: 1, pageFade: 1, sel: -1, selT: 0,
    extraTime: 1e3, extraFade: 0.6, eye, pixelRatio: 1, height: 1080, sizeK: S };
  cloud.pose(st);
  cloud.body.onBeforeRender = (renderer, _scene, cam) => {
    cam.getWorldPosition(eye);
    renderer.getDrawingBufferSize(buf);
    const k = dimmer.uniforms.uOpacity.value;
    cloud.pose({ ...st, eye, height: buf.y, sizeK: S * lensK(cam), bright: st.bright * k, pageFade: k, extraFade: st.extraFade * k });
  };
  return { group: cloud.group, dimmer, setTime: (t) => { st.time = t; } };
}
