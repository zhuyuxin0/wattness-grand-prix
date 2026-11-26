// One station frame, built into the story's one stage. Each frame's setup gets the lab's context (stations/types.ts)
// with the stage seen through a lens: what it adds to the scene goes into its own group, what it adds to the post
// chain is listed as its own, the cameras it asks for are recorded (the player decides the camera), and its plates
// and overlay live in its own layer over the canvas. The stage state it leaves (state.ts) is captured whenever it
// hands the stage to another frame and put back when it takes it again. Nothing in the kit or the stations changes.
import * as THREE from 'three';
import type { CameraPose, WorldStage } from '../lib/stage';
import { createPlates, type Plates, type Rect } from '../lib/plates';
import type { FrameContext, FrameData, FrameHandle, FrameSetup, StationModule } from '../stations/types';
import { apply, capture, type StageParts, type StageState } from './state';

const stations = import.meta.glob<StationModule>('../stations/*/index.ts');
const dirs = Object.keys(stations).map((p) => p.split('/')[2] ?? p);

/** Textures loaded through three's loaders, in flight: a frame is not settled until they are in. */
let inflight = 0;
const idle: (() => void)[] = [];
let loadersHooked = false;
function hookLoaders() {
  if (loadersHooked) return;
  loadersHooked = true;
  const lm = THREE.DefaultLoadingManager;
  const start = lm.itemStart.bind(lm), end = lm.itemEnd.bind(lm);
  lm.itemStart = (url: string) => { inflight++; start(url); };
  lm.itemEnd = (url: string) => { end(url); inflight = Math.max(0, inflight - 1); if (!inflight) idle.splice(0).forEach((f) => f()); };
}
export const loadersIdle = () => (inflight ? new Promise<void>((r) => idle.push(r)) : Promise.resolve());

/** The setup that owns a frame id ("<dir>.<name>"). */
export async function findSetup(id: string): Promise<{ station: string; setup: FrameSetup }> {
  const dir = id.slice(0, id.indexOf('.'));
  const load = stations[`../stations/${dir}/index.ts`];
  if (!load) throw new Error(`story: no station "${dir}" for frame ${id} (stations: ${dirs.join(', ')})`);
  const mod = await load();
  const setup = (mod.frames as Partial<Record<string, FrameSetup>>)[id];
  if (!setup) throw new Error(`story: station ${dir} has no frame ${id} (it has ${Object.keys(mod.frames).join(', ')})`);
  return { station: dir, setup };
}

const copyPose = (p: CameraPose): CameraPose => ({ ...p, target: [...p.target] as CameraPose['target'], shift: p.shift ? [...p.shift] as [number, number] : undefined });

export interface Shared {
  stage: WorldStage;
  parts: StageParts;
  /** The element over the canvas that holds every frame's layer. */
  layers: HTMLElement;
  width: number; height: number; dpr: number;
  data: FrameData | null; layout: unknown;
  /** Every pass any live frame added, so a frame's turn switches the others' off. */
  added: Set<object>;
  /** The frame whose state the stage holds now. */
  owner: FrameInstance | null;
  /** Caption words in the film (null: the frame's own). */
  captionOverride: ((inst: FrameInstance) => { el: HTMLElement | null } | null) | null;
  /** The page's own chrome (the site's rail), which no plate may cover. */
  keepOut: (() => Rect[]) | null;
  /** The stage as createStage left it: each setup starts from it, as each frame starts from a fresh stage in the lab
   *  (a setup that leaves a value alone would otherwise inherit the last frame's: the arcade's local clipping). */
  baseline: StageState;
}

export class FrameInstance {
  readonly root = new THREE.Group();
  readonly layer: HTMLDivElement;
  readonly overlay: HTMLDivElement;
  readonly platesHost: HTMLDivElement;
  plates!: Plates;
  handle!: FrameHandle;
  station = '';
  /** The rest's local time (the handle's) and the camera the frame asks for there. */
  restLocal = 0;
  restPose: CameraPose | null = null;
  /** The camera the frame asked for at its last update. */
  ownPose: CameraPose | null = null;
  readonly passes = new Set<object>();
  /** This frame's copy of GTAO's normal material (state.ts StageParts.normal0), made when the frame first asks for it. */
  normalMaterial: THREE.Material | null = null;
  state: StageState | null = null;
  ready = false;
  disposed = false;
  error: string | null = null;
  /** The plates as laid out for this rest key (decorated), and their opacity now. */
  decoratedFor = '';
  platesOpacity = -1;
  /** Whether the frame's layout leaves its own DOM on the overlay (the arcade's cabinet screens, the garage's boards,
   *  the stewards' board): null until its first decorate. The film lays such screens out again through a leg. */
  screens: boolean | null = null;
  lastLocal = NaN;
  lastUsed = 0;
  /** Milliseconds its setup took, and to its programs compiled (player.ts ensure). */
  buildMs = 0;
  readyMs = 0;
  private waits: Promise<unknown>[] = [];
  private built: Promise<void> | null = null;
  /** The overlay's and the plates' content as the setup left it (clearPlates keeps it). */
  private overlayBase = new Set<Node>();
  private platesBase = new Set<Node>();

  constructor(readonly id: string, private S: Shared) {
    this.root.name = `story:${id}`;
    this.root.visible = false;
    this.layer = document.createElement('div');
    // the classes, theme and scale the lab's root carries: the stations scope their plates' rules under it, some on
    // the plates' parent itself (venue.css .world.v-hub, words.css .world.hwalk.is-x.w-lit)
    this.layer.className = 'gp-layer world intro hwalk is-x';
    this.layer.dataset.theme = 'dark';
    this.layer.style.setProperty('--u', String(S.width / 1920));
    this.layer.dataset.frame = id;
    this.overlay = document.createElement('div'); this.overlay.className = 'world-overlay';
    this.platesHost = document.createElement('div'); this.platesHost.className = 'world-plates';
    this.layer.append(this.overlay, this.platesHost);
    this.layer.style.opacity = '0';
    this.layer.style.visibility = 'hidden';
  }

  /** Builds the frame once (later calls return the same promise). The stage's current owner keeps its state. */
  build(): Promise<void> {
    this.built ??= this.doBuild();
    return this.built;
  }

  private lens(): WorldStage {
    const S = this.S, self = this, real = S.stage;
    const scene = new Proxy(real.scene, {
      get(target, prop) {
        if (prop === 'add') return (...o: THREE.Object3D[]) => { self.root.add(...o); return scene; };
        if (prop === 'remove') return (...o: THREE.Object3D[]) => { self.root.remove(...o); return scene; };
        if (prop === 'traverse') return (fn: (o: THREE.Object3D) => void) => self.root.traverse(fn);
        if (prop === 'traverseVisible') return (fn: (o: THREE.Object3D) => void) => self.root.traverseVisible(fn);
        if (prop === 'getObjectByName') return (n: string) => self.root.getObjectByName(n);
        if (prop === 'children') return self.root.children;
        const v = Reflect.get(target, prop, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
      set(target, prop, value) { return Reflect.set(target, prop, value, target); },
    });
    // The post chain as this frame sees it: the kit's own passes and its own, never another frame's. A frame places a
    // pass by an index into that view ("before the output": passes.length - 1; kit/stage.ts insertBeforeOverlay:
    // passes.length - 2), which is mapped onto the real chain, so one frame's passes never shift where another's go
    // (the arcade's bloom before the output had moved every later glass grab behind the overlay pass).
    const view = () => (real.composer.passes as unknown as object[]).filter((x) => S.parts.base.includes(x) || self.passes.has(x));
    const insertAt = (p: object, i: number) => {
      const passes = real.composer.passes as unknown as object[], v = view();
      const before = v[Math.max(0, i)];
      real.composer.insertPass(p as never, before ? passes.indexOf(before) : passes.length);
      self.own(p);
    };
    const overlayPass = S.parts.base[4]!;
    const composer = new Proxy(real.composer, {
      get(target, prop) {
        if (prop === 'insertPass') return (p: object, i: number) => insertAt(p, i);
        if (prop === 'addPass') return (p: object) => insertAt(p, view().length);
        if (prop === 'passes') return view();
        const v = Reflect.get(target, prop, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    const gtao = new Proxy(real.gtao, {
      get(target, prop) {
        if (prop === 'normalMaterial') {
          if (!self.normalMaterial) { self.normalMaterial = S.parts.normal0.clone(); self.useNormals(); }
          return self.normalMaterial;
        }
        const v = Reflect.get(target, prop, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
      set(target, prop, value) { return Reflect.set(target, prop, value, target); },
    });
    return new Proxy(real, {
      get(target, prop) {
        switch (prop) {
          case 'scene': return scene;
          case 'composer': return composer;
          case 'gtao': return gtao;
          case 'insertBeforeOverlay': return (p: object) => insertAt(p, view().indexOf(overlayPass));
          case 'setCamera': return (pose: CameraPose) => { self.ownPose = copyPose(pose); target.setCamera(pose); };
          case 'render': return () => target.frameInfo;
          case 'dispose': case 'setSize': case 'setTheme': return () => {};
          default: { const v = Reflect.get(target, prop, target); return typeof v === 'function' ? v.bind(target) : v; }
        }
      },
    }) as WorldStage;
  }

  private own(p: object) { this.passes.add(p); this.S.added.add(p); }
  /** GTAO draws its normals with this frame's copy of the material (or the stage's own, if the frame never asked). */
  private useNormals() { (this.S.stage.gtao as unknown as { normalMaterial: THREE.Material }).normalMaterial = this.normalMaterial ?? this.S.parts.normal0; }

  private async doBuild() {
    const S = this.S;
    hookLoaders();
    S.layers.appendChild(this.layer);
    S.stage.scene.add(this.root);
    const { station, setup } = await findSetup(this.id);
    this.station = station;
    // the stage holds the current owner's state: keep it before this setup writes its own
    if (S.owner && S.owner !== this && S.owner.ready) S.owner.state = capture(S.stage, S.parts, S.owner.passes);
    apply(S.stage, S.parts, S.baseline, S.added);
    S.owner = this;
    this.useNormals();
    this.plates = createPlates(this.platesHost, S.stage, { width: S.width, height: S.height });
    const data = S.data;
    const ctx: FrameContext = {
      id: this.id, station, stage: this.lens(), theme: 'dark', width: S.width, height: S.height, dpr: S.dpr, data, layout: S.layout,
      plates: this.platesFor(), overlay: this.overlay,
      needData() { if (!data) throw new Error('src/data/frame-data.json is missing: run scripts/sync-data.sh'); return data; },
      wait: (p) => { this.waits.push(p); },
    };
    try {
      this.handle = await setup(ctx);
      await Promise.all(this.waits); this.waits = [];
      await loadersIdle();
      this.restLocal = this.handle.time ?? 0;
      // the frame's own clock up to its rest, as the lab poses it, so anything that only advances with dt has arrived
      const steps = Math.max(0, Math.round(this.handle.steps ?? 30));
      for (let k = steps; k >= 1; k--) this.handle.update?.(this.restLocal - k / 60, 1 / 60);
      this.handle.update?.(this.restLocal, 0);
      this.lastLocal = this.restLocal;
      this.restPose = this.ownPose ? copyPose(this.ownPose) : poseOf(S.stage.camera);
      this.state = capture(S.stage, S.parts, this.passes);
      // the setup's own DOM (not the plates' layers, which are made again at each decorate)
      this.overlayBase = new Set(this.overlay.childNodes);
      const own = new Set<Node>([this.plates.root.querySelector(':scope > .intro-labels'), this.plates.root.querySelector(':scope > .intro-ticks')].filter((n): n is Element => !!n));
      this.platesBase = new Set([...this.platesHost.childNodes].filter((n) => !own.has(n)));
      this.ready = true;
    } catch (e) {
      this.error = e instanceof Error ? (e.stack ?? e.message) : String(e);
      throw e;
    }
  }

  /** The plates the frame sees: the lab's, with the caption handed to the film's line when the film shows one. */
  private platesFor(): Plates {
    const self = this;
    return new Proxy({} as Plates, {
      get(_t, prop) {
        const P = self.plates as unknown as Record<string | symbol, unknown>;
        if (prop === 'caption') return (c: { head: string; line?: string } | null) => {
          const o = self.S.captionOverride?.(self);
          const own = self.plates.caption(c);
          if (!o) return own;
          // the film's line stands in for the frame's caption: the frame's own plate is kept, hidden (a frame may hang
          // more on it, as the hub hangs its sealed facts), and the line's box is what the frame's plates keep off.
          // Hidden, not removed: a frame that places a mark beside its own caption measures it (the stack's end card
          // sets its lockup by the caption's box; without one the lockup went to the top and over a zone's title)
          const capEl = self.platesHost.querySelector(':scope > .hwalk-cap') as HTMLElement | null;
          if (capEl) capEl.style.visibility = 'hidden';
          const el = o.el; if (!el) return null;
          const a = el.getBoundingClientRect(), b = self.platesHost.getBoundingClientRect();
          return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
        };
        if (prop === 'leaders') return (items: Parameters<Plates['leaders']>[0], o: Parameters<Plates['leaders']>[1] = {}) =>
          self.plates.leaders(items, { ...o, keepOut: [...(o?.keepOut ?? []), ...(self.S.keepOut?.() ?? [])] });
        const v = P[prop];
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(self.plates) : v;
      },
    });
  }

  /** Takes the stage: the owner's state kept, this frame's put back, only this frame's group shown. */
  take() {
    const S = this.S;
    if (S.owner === this) return;
    if (S.owner && S.owner.ready && !S.owner.disposed) S.owner.state = capture(S.stage, S.parts, S.owner.passes);
    if (this.state) apply(S.stage, S.parts, this.state, S.added);
    this.useNormals();
    S.owner = this;
  }

  /** The frame posed at local time t (its own clock), as the owner of the stage. */
  pose(t: number, dt: number) {
    this.take();
    if (t !== this.lastLocal || dt > 0) { this.handle.update?.(t, dt); this.lastLocal = t; }
  }

  /** Lays the plates out for the camera as it stands (the rest's pose): the frame's decorate, once per key. */
  async decorate(key: string) {
    if (this.decoratedFor === key) return;
    this.clearPlates();
    this.decoratedFor = key;
    this.layer.style.setProperty('--u', String(this.S.width / 1920));
    await this.handle.decorate?.();
    await Promise.all(this.waits); this.waits = [];
    // any element counts, shown or not: a layout from a steep angle hides every screen it has, and the frame still has them
    this.screens = this.overlay.childElementCount > 0;
  }

  /** Empties what a decorate laid out: the plates' own layers (leaders, ticks) are made again, and whatever else the
   *  decorate added (key cards, end cards, a board on the overlay) goes; what the frame's setup put there stays (the
   *  arcade's cabinet screens, the towers' and the garage's displays live on the overlay from the setup on). */
  clearPlates() {
    this.plates?.clear();
    const keep = (host: HTMLElement, base: Set<Node>) => { for (const n of [...host.childNodes]) if (!base.has(n)) n.remove(); };
    keep(this.platesHost, this.platesBase);
    keep(this.overlay, this.overlayBase);
    this.platesHost.style.removeProperty('--hw-scope-h');
    this.plates = createPlates(this.platesHost, this.S.stage, { width: this.S.width, height: this.S.height });
    this.decoratedFor = '';
  }

  /** The layer's opacity over the canvas (plates and the frame's own DOM). */
  showPlates(k: number) {
    const v = Math.round(k * 1000) / 1000;
    if (v === this.platesOpacity) return;
    this.platesOpacity = v;
    this.overlay.style.opacity = ''; this.platesHost.style.opacity = '';
    this.layer.style.opacity = String(v);
    this.layer.style.visibility = v > 0 ? 'visible' : 'hidden';
  }

  /** The film's two opacities: the frame's own screens (its overlay) and its plates, apart. Through a leg the screens
   *  travel with the picture and the plates stay out; at a rest the screens are whole and the plates come in. */
  showLayer(screens: number, plates: number) {
    const o = Math.round(screens * 1000) / 1000, p = Math.round(plates * 1000) / 1000;
    this.platesOpacity = NaN;
    this.overlay.style.opacity = String(o);
    this.platesHost.style.opacity = String(p);
    this.layer.style.opacity = o > 0 || p > 0 ? '1' : '0';
    this.layer.style.visibility = o > 0 || p > 0 ? 'visible' : 'hidden';
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const S = this.S;
    try { this.handle?.dispose?.(); } catch (e) { console.warn(`story: ${this.id} dispose`, e); }
    const seen = new Set<unknown>();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !seen.has(m.geometry)) { seen.add(m.geometry); m.geometry.dispose(); }
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        if (seen.has(mat)) continue;
        seen.add(mat);
        for (const v of Object.values(mat)) if (v && (v as THREE.Texture).isTexture && !seen.has(v)) { seen.add(v); (v as THREE.Texture).dispose(); }
        const u = (mat as THREE.ShaderMaterial).uniforms;
        if (u) for (const x of Object.values(u)) { const t = x?.value as THREE.Texture | undefined; if (t && t.isTexture && !seen.has(t)) { seen.add(t); t.dispose(); } }
        mat.dispose();
      }
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    });
    S.stage.scene.remove(this.root);
    const passes = S.stage.composer.passes as unknown as object[];
    for (const p of this.passes) {
      const i = passes.indexOf(p);
      if (i >= 0) passes.splice(i, 1);
      S.added.delete(p);
      try { (p as { dispose?: () => void }).dispose?.(); } catch { /* gone */ }
    }
    this.layer.remove();
    if (this.normalMaterial) {
      if ((S.stage.gtao as unknown as { normalMaterial: THREE.Material }).normalMaterial === this.normalMaterial) (S.stage.gtao as unknown as { normalMaterial: THREE.Material }).normalMaterial = S.parts.normal0;
      this.normalMaterial.dispose();
    }
    if (S.owner === this) S.owner = null;
  }
}

/** A pose for a camera nobody asked for by pose: its position seen from a point ahead of it. */
export function poseOf(cam: THREE.PerspectiveCamera): CameraPose {
  const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
  const dist = 100, t = cam.position.clone().addScaledVector(dir, dist);
  const off = cam.position.clone().sub(t);
  const el = (Math.asin(Math.max(-1, Math.min(1, off.y / dist))) * 180) / Math.PI;
  const az = (Math.atan2(off.x, -off.z) * 180) / Math.PI;
  const shift = (cam.userData.shift as [number, number] | undefined) ?? [0, 0];
  return { target: [t.x, t.y, t.z], az, el, dist, vfov: cam.fov, shift: [shift[0], shift[1]], near: cam.near, far: cam.far };
}
