// THE STORY PLAYER. One renderer and one stage (lib/stage.ts over the kit's) for the whole story; each station frame is
// built into it once, lazily, when the story comes near it, and disposed once the story has gone on and it is not among
// the frames drawn last (instances.ts; trim).
// One seekable time drives everything: draw(t) poses each frame shown at its own local time, sets the camera for the
// leg or the rest, and renders. Where two frames meet, both are drawn in the same tick: the outgoing one is copied to
// a 2D canvas beneath and the incoming one fades in over it on the WebGL canvas, as the intro's scenes cross-fade
// (the incoming stacked above at a rising opacity, the outgoing at full opacity beneath). Nothing here reads the wall
// clock and nothing random is unseeded: the picture at t is a function of t.
import { createWorldStage, type CameraPose, type WorldStage } from '../lib/stage';
import type { FrameData } from '../stations/types';
import { capture, stageParts, type StageParts } from './state';
import { FrameInstance, loadersIdle, type Shared } from './instances';
import { film, keyDef, type Film, type Where } from './clock';
import { backOff, calm, dolly, glide, smooth } from './moves';
import { makeRise, type Rise } from './rise';
import type { CutId, FilmKey, Run } from './beats';

export type Captions = 'frame' | 'film' | 'none';

export interface PlayerOptions {
  root: HTMLElement;
  width: number;
  height: number;
  dpr: number;
  cut?: CutId;
  /** The words: each frame's own caption (the site), the film's line per row (the films), or none. */
  captions?: Captions;
  /** Keep the drawing buffer after compositing (a capture reads the canvas; the site needs no copy). */
  preserve?: boolean;
  /** Load the frame data and layout (src/data); the stations read them as ctx.data and ctx.layout. */
  data?: { frameData: FrameData | null; layout: unknown };
  /** The holds: 'run' plays each key's run through its hold (the films: Parc fermé's time-lapse), 'rest' holds each
   *  frame at its beat's state (the site, where the visitor rests; the default). */
  holds?: 'run' | 'rest';
  onError?(e: unknown, frame: string): void;
}

/** A run's local time `s` seconds into its hold: linear between its pairs, held past either end. */
export function runAt(run: Run, s: number): number {
  const first = run[0]!, last = run[run.length - 1]!;
  if (s <= first[0]) return first[1];
  for (let i = 1; i < run.length; i++) {
    const a = run[i - 1]!, b = run[i]!;
    if (s <= b[0]) return a[1] + ((b[1] - a[1]) * (s - a[0])) / Math.max(1e-9, b[0] - a[0]);
  }
  return last[1];
}

interface Draw { inst: FrameInstance; local: number; alpha: number; pose: CameraPose | 'own'; rise?: number }
export interface Picture { draws: Draw[]; plates: { inst: FrameInstance; key: string; k: number } | null; where: Where; t: number }

/** A measuring harness's log (site/scripts/perf-story.mjs puts window.__gpPerf on the page before it loads): the
 *  player and the site push what they do onto it, timed by performance.now(). Without it (any visit) nothing is
 *  recorded and nothing changes. `draws` holds each render's start and its CPU milliseconds, in pairs. */
export interface PerfLog { events: Record<string, unknown>[]; draws: number[]; player?: StoryPlayer; site?: unknown }
export function perfLog(): PerfLog | null {
  const log = (globalThis as { __gpPerf?: PerfLog }).__gpPerf;
  return log && Array.isArray(log.events) && Array.isArray(log.draws) ? log : null;
}

const dataFiles = import.meta.glob<unknown>('../data/*.json', { import: 'default' });
export async function loadData() {
  const get = async (n: string) => { const f = dataFiles[`../data/${n}`]; return f ? f() : null; };
  const [frameData, layout] = await Promise.all([get('frame-data.json'), get('layout.json')]);
  return { frameData: (frameData as FrameData | null) ?? null, layout };
}

export class StoryPlayer {
  readonly stage: WorldStage;
  readonly parts: StageParts;
  readonly canvas: HTMLCanvasElement;
  readonly under: HTMLCanvasElement;
  readonly layers: HTMLDivElement;
  readonly line: HTMLDivElement;
  film: Film;
  captions: Captions;
  readonly holds: 'run' | 'rest';
  private S: Shared;
  private insts = new Map<string, FrameInstance>();
  private queue: Promise<unknown> = Promise.resolve();
  private building = new Set<string>();
  /** Frames whose setup is writing the shared stage, until their programs are queued: nothing else may draw meanwhile. */
  private writing = new Set<string>();
  /** Frames built whose programs are still compiling: not drawn until they have (a first draw would compile them). */
  private compiling = new Set<string>();
  /** Each build queued or under way, by frame, so a second ask joins it. */
  private pending = new Map<string, Promise<FrameInstance>>();
  private rises = new Map<FrameInstance, Rise>();
  private underOn = false;
  private lineKey = '';
  private tick = 0;
  /** Each frame's failure, by frame id (a frame that fails holds the picture before it). */
  readonly errors = new Map<string, string>();
  /** The last picture drawn (for the site's chrome and for checks). */
  last: Picture | null = null;
  /** Milliseconds each render took (CPU side, and to the GPU's finish when measured). */
  readonly timings: { cpu: number[]; gpu: number[] } = { cpu: [], gpu: [] };
  measureGpu = false;
  dead = false;
  /** Rects (stage px) of the page's own chrome, kept clear of the frames' plates. */
  keepOut: (() => { x: number; y: number; w: number; h: number }[]) | null = null;

  constructor(private o: PlayerOptions) {
    const { root, width: W, height: H, dpr } = o;
    this.film = film(o.cut ?? 'master');
    this.captions = o.captions ?? 'frame';
    this.holds = o.holds ?? 'rest';
    this.under = document.createElement('canvas'); this.under.className = 'gp-under';
    this.under.width = Math.round(W * dpr); this.under.height = Math.round(H * dpr);
    this.canvas = document.createElement('canvas'); this.canvas.className = 'gp-canvas';
    this.layers = document.createElement('div'); this.layers.className = 'gp-layers';
    this.line = document.createElement('div'); this.line.className = 'hwalk-cap gp-line'; this.line.style.opacity = '0';
    this.line.setAttribute('aria-live', 'polite');
    root.append(this.under, this.canvas, this.layers, this.line);
    this.stage = createWorldStage({ canvas: this.canvas, width: W, height: H, dpr, theme: 'dark', preserve: o.preserve ?? true, debug: false });
    this.parts = stageParts(this.stage);
    const baseline = capture(this.stage, this.parts, []);
    this.S = {
      stage: this.stage, parts: this.parts, layers: this.layers, width: W, height: H, dpr,
      data: o.data?.frameData ?? null, layout: o.data?.layout ?? null, added: new Set(), owner: null, baseline,
      keepOut: () => this.keepOut?.() ?? [],
      captionOverride: () => (this.captions === 'film' ? { el: this.line.childElementCount ? this.line : null } : this.captions === 'none' ? { el: null } : null),
    };
    const log = perfLog();
    if (log) log.player = this;
  }

  setCut(cut: CutId) { this.film = film(cut); this.lineKey = ''; }

  /** The instance for a frame id (made, not built). */
  inst(frame: string): FrameInstance {
    let i = this.insts.get(frame);
    if (!i || i.disposed) { i = new FrameInstance(frame, this.S); this.insts.set(frame, i); }
    return i;
  }

  /** Builds a frame (one build at a time: a setup writes the shared stage) and compiles its programs; resolves once they
   *  have compiled. The stage is free again once they are queued, so the story draws its other frames while they
   *  compile (isBuilding), and this one from then on (drawable). `why` names the caller for a measuring harness's log:
   *  a picture that needs it now, or a build ahead of the visitor. */
  ensure(frame: string, why: 'need' | 'prefetch' = 'need'): Promise<FrameInstance> {
    const inst = this.inst(frame);
    const queued = this.pending.get(frame);
    if (queued) return queued;
    if (inst.ready) return Promise.resolve(inst);
    if (inst.error) return Promise.reject(new Error(inst.error));
    const asked = performance.now();
    const run = this.queue.then(async () => {
      if (inst.ready || inst.disposed) return inst;
      if (this.dead) throw new Error('story: the player was disposed');
      this.building.add(frame); this.writing.add(frame);
      const b0 = performance.now();
      try {
        await inst.build();
        const b1 = performance.now();
        inst.buildMs = Math.round(b1 - b0);
        // only this frame's group visible while its programs compile, and the other frames' groups out of the scene
        // until the compile has been queued: three's compile prepares every material in the scene, shown or not, so each
        // build would prepare the kept frames' materials again under this frame's stage state (and queue variants of
        // them no frame draws), and wait for all their programs. preparePrograms queues them before its first await.
        for (const x of this.insts.values()) x.root.visible = x === inst;
        inst.pose(inst.restLocal, 0);
        if (inst.restPose) this.stage.setCamera(inst.restPose);
        const scene = this.stage.scene, parked = [...this.insts.values()].filter((x) => x !== inst && x.root.parent === scene);
        for (const x of parked) scene.remove(x.root);
        let compiled: ReturnType<WorldStage['preparePrograms']>;
        try { compiled = this.stage.preparePrograms([() => inst.pose(inst.restLocal, 0)], () => !this.dead && !inst.disposed); }
        finally { for (const x of parked) scene.add(x.root); }
        // the programs are queued and the stage is free: the other frames may draw while they compile (a draw takes the
        // stage and keeps this frame's state, which its next turn puts back)
        inst.root.visible = false;
        this.writing.delete(frame); this.compiling.add(frame);
        const prep = await compiled;
        const b2 = performance.now();
        inst.readyMs = Math.round(b2 - b0);
        perfLog()?.events.push({ e: 'build', frame, why, asked, start: b0, built: b1, ready: b2, buildMs: inst.buildMs, readyMs: inst.readyMs, programs: prep.programs, prep: prep.state });
      } catch (e) {
        perfLog()?.events.push({ e: 'build', frame, why, asked, start: b0, failed: performance.now() });
        this.errors.set(frame, e instanceof Error ? (e.stack ?? e.message) : String(e));
        this.o.onError?.(e, frame);
        throw e;
      } finally { this.building.delete(frame); this.writing.delete(frame); this.compiling.delete(frame); }
      return inst;
    });
    this.queue = run.catch(() => undefined);
    const done = () => { if (this.pending.get(frame) === run) this.pending.delete(frame); };
    this.pending.set(frame, run);
    run.then(done, done);
    return run;
  }
  /** Whether a build is writing the shared stage now (its setup, up to its programs queued): nothing else may draw. */
  isBuilding() { return this.writing.size > 0; }
  /** Whether any build is queued or under way. */
  isBusy() { return this.pending.size > 0; }
  /** Whether a frame can be drawn: built, and its programs compiled. */
  private drawable(inst: FrameInstance | undefined): inst is FrameInstance { return !!inst && inst.ready && !this.compiling.has(inst.id); }

  /** A key's run through its hold, when the holds run (the films) and it has one. */
  private runOf(k: FilmKey): Run | null { return this.holds === 'run' && k.run?.length ? k.run : null; }

  /** A key's local time `since` seconds into its hold: its run in the films, else its beat's rest. In the films a frame
   *  that moves at its rest (FrameHandle.live) and has no run there runs its own clock on from the rest instead; the
   *  site runs that clock itself (site.ts), on the wall clock. */
  holdLocal(k: FilmKey, inst: FrameInstance, since: number): number {
    const run = this.runOf(k);
    if (run) return runAt(run, since);
    const rest = keyDef(k.key).local ?? inst.restLocal;
    return this.holds === 'run' && inst.handle?.live ? rest + Math.max(0, since) : rest;
  }

  /** The picture at film time t: which frames, at which local times and cameras, at which opacities. */
  picture(t: number): Picture | null {
    const F = this.film, where = F.locate(t);
    const keyAt = (i: number) => F.keys[i]!;
    const instOf = (k: FilmKey) => this.insts.get(keyDef(k.key).frame);
    if (where.kind === 'hold') {
      const k = keyAt(where.i), inst = instOf(k);
      if (!this.drawable(inst)) return null;
      const local = this.holdLocal(k, inst, where.since);
      const stop = keyDef(k.key).stop !== false;
      const span = k.until - k.at;
      // the plates come in once the camera has landed and go before the leg out (none on a hold too short to read)
      // (the film's first rest takes them in more slowly, as the opening shot settles)
      const out = where.i === F.keys.length - 1 ? 1 : 1 - smooth((0.35 - where.left) / 0.35);
      const pk = !stop || span < 0.95 ? 0 : (where.i === 0 ? smooth((where.since - 0.5) / 0.9) : smooth((where.since - 0.2) / 0.45)) * out;
      return { draws: [{ inst, local, alpha: 1, pose: inst.restPose! }], plates: { inst, key: `${F.cut}:${where.i}`, k: pk }, where, t };
    }
    const A = keyAt(where.i - 1), B = keyAt(where.i);
    const ia = instOf(A), ib = instOf(B);
    if (!this.drawable(ia) || !this.drawable(ib)) return null;
    const leg = F.leg(where.i), e = where.e;
    const mode = leg.cam ?? 'glide';
    // the outgoing frame held where its hold ended (one that moves at its rest runs on through the leg); the incoming
    // one plays its own motion into its rest, or, when its hold runs a clock, waits at the run's start
    const la = leg.clockA ? leg.clockA[0] + (leg.clockA[1] - leg.clockA[0]) * e : this.holdLocal(A, ia, A.until - A.at + (ia.handle?.live ? e * where.dur : 0));
    const runB = this.runOf(B);
    const restB = runB ? runAt(runB, 0) : keyDef(B.key).local ?? ib.restLocal;
    const motion = runB ? 0 : Math.min(restB, where.dur);
    const lb = leg.clockB ? leg.clockB[0] + (leg.clockB[1] - leg.clockB[0]) * e : restB - motion * (1 - e);
    const rise = leg.rise ? Math.max(0, Math.min(1, (e - leg.rise[0]) / (leg.rise[1] - leg.rise[0]))) : undefined;
    const fade = leg.fade ?? (mode === 'hop' ? [0.36, 0.64] : [1 / 3, 2 / 3]);
    const kb = fade[1] <= fade[0] ? (e >= fade[0] ? 1 : 0) : smooth((e - fade[0]) / (fade[1] - fade[0]));
    let pa: CameraPose | 'own', pb: CameraPose | 'own';
    if (mode === 'own') pa = pb = 'own';
    else if (mode === 'hop' && ia !== ib) {
      // each station keeps its own framing: out of the first along its line of sight, into the second the same way
      // (a side inside a hall backs off less, so its camera stays inside: leg.back)
      const [ba, bb] = leg.back ?? [1, 1];
      pa = backOff(ia.restPose!, ba * calm(e / Math.max(0.05, fade[1])));
      pb = backOff(ib.restPose!, bb * (1 - calm((e - fade[0]) / Math.max(0.05, 1 - fade[0]))));
    } else if (mode === 'dolly') pa = pb = dolly(ia.restPose!, ib.restPose!, e);
    else pa = pb = glide(ia.restPose!, ib.restPose!, e, false);
    if (ia === ib) return { draws: [{ inst: ib, local: lb, alpha: 1, pose: pb, rise }], plates: null, where, t };
    const draws: Draw[] = [];
    if (kb < 1) draws.push({ inst: ia, local: la, alpha: 1, pose: pa });
    if (kb > 0) draws.push({ inst: ib, local: lb, alpha: kb, pose: pb, rise });
    return { draws, plates: null, where, t };
  }

  /** The frames the picture at t needs, and those of the keys round it (to build ahead). */
  framesNear(t: number, ahead = 1): { need: string[]; near: string[] } {
    const F = this.film, where = F.locate(t);
    const i = where.i;
    const need = where.kind === 'hold' ? [F.keys[i]!] : [F.keys[i - 1]!, F.keys[i]!];
    const near: string[] = [];
    for (let j = Math.max(0, i - 1); j <= Math.min(F.keys.length - 1, i + ahead); j++) near.push(keyDef(F.keys[j]!.key).frame);
    return { need: [...new Set(need.map((k) => keyDef(k.key).frame))], near: [...new Set(near)] };
  }

  /** Disposes every frame not in keep. */
  prune(keep: Iterable<string>) {
    const k = new Set(keep);
    for (const [id, inst] of this.insts) if (!k.has(id) && inst.ready && !this.building.has(id)) this.drop(id, inst);
  }

  /** Lets frames go, least recently drawn first: those in keep stay, and so do the `drawn` frames drawn last (so a step
   *  back to any of them draws at once); a frame built ahead and never drawn stays only while it is in keep. */
  trim(keep: Iterable<string>, drawn: number) {
    const k = new Set(keep);
    const built = [...this.insts].filter(([id, inst]) => inst.ready && !this.building.has(id));
    const recent = new Set(built.filter(([, i]) => i.lastUsed > 0).sort((a, b) => b[1].lastUsed - a[1].lastUsed).slice(0, Math.max(0, drawn)).map(([id]) => id));
    for (const [id, inst] of built) if (!k.has(id) && !recent.has(id)) this.drop(id, inst);
  }

  private drop(id: string, inst: FrameInstance) {
    this.rises.delete(inst); inst.dispose(); this.insts.delete(id);
    perfLog()?.events.push({ e: 'drop', frame: id, t: performance.now() });
  }

  private riseFor(inst: FrameInstance): Rise {
    let r = this.rises.get(inst);
    if (!r) { r = makeRise(inst.root, this.S.data, this.S.layout); this.rises.set(inst, r); }
    return r;
  }

  /** Draws a picture: each frame posed and rendered; two frames cross-fade through the canvas beneath. */
  render(pic: Picture, dt = 0) {
    const t0 = performance.now();
    const shown = new Set(pic.draws.map((d) => d.inst));
    for (const inst of this.insts.values()) inst.root.visible = false;
    let under = false;
    pic.draws.forEach((d, n) => {
      d.inst.lastUsed = t0;
      d.inst.pose(d.local, dt);
      const r = this.rises.get(d.inst) ?? (d.rise != null ? this.riseFor(d.inst) : null);
      if (r) { if (d.rise != null) r.set(d.rise); else r.restore(); }
      const pose = d.pose === 'own' ? d.inst.ownPose ?? d.inst.restPose! : d.pose;
      this.stage.setCamera(pose);
      d.inst.root.visible = true;
      this.stage.requestShadow();
      this.stage.render();
      d.inst.root.visible = false;
      if (pic.draws.length > 1 && n === 0) {
        // the outgoing frame, whole, beneath the incoming one
        const g = this.under.getContext('2d')!;
        g.globalCompositeOperation = 'copy';
        g.drawImage(this.canvas, 0, 0, this.under.width, this.under.height);
        under = true;
      }
    });
    const top = pic.draws[pic.draws.length - 1];
    const a = top ? (pic.draws.length > 1 ? top.alpha : 1) : 1;
    this.canvas.style.opacity = a >= 1 ? '' : a.toFixed(4);
    if (under !== this.underOn) { this.underOn = under; this.under.style.visibility = under ? 'visible' : 'hidden'; }
    // the shown frames stay visible to nothing else; the plates of the rest only
    for (const inst of this.insts.values()) if (!pic.plates || inst !== pic.plates.inst) inst.showPlates(0);
    void shown;
    this.last = pic;
    this.tick++;
    const cpu = performance.now() - t0;
    perfLog()?.draws.push(t0, cpu);
    this.timings.cpu.push(cpu);
    if (this.measureGpu) { this.stage.renderer.getContext().finish(); this.timings.gpu.push(performance.now() - t0); }
    if (this.timings.cpu.length > 20000) { this.timings.cpu.splice(0, 10000); this.timings.gpu.splice(0, 10000); }
  }

  /** Lays out the rest's plates with the camera at the rest's pose (the frame's decorate), then shows them at k. */
  async plates(pic: Picture) {
    const p = pic.plates;
    if (!p) return;
    const { inst, key, k } = p;
    if (k <= 0) { inst.showPlates(0); return; }
    if (inst.decoratedFor !== key) {
      const d = pic.draws[0]!;
      inst.take();
      this.stage.setCamera(inst.restPose!);
      this.stage.camera.updateMatrixWorld();
      this.syncLine(pic.t);
      try { await inst.decorate(key); } catch (e) { this.errors.set(`${inst.id}:decorate`, String(e)); }
      // the scope line's height reaches the film's line too, so it clears a long scope as the frame's caption would
      const h = inst.platesHost.style.getPropertyValue('--hw-scope-h');
      if (h) this.line.style.setProperty('--hw-scope-h', h); else this.line.style.removeProperty('--hw-scope-h');
      void d;
    }
    inst.showPlates(k);
  }

  /** The film's line for the row at t (captions 'film'): in over 0.35 s at the row's start, out over 0.3 s at its end. */
  syncLine(t: number) {
    if (this.captions !== 'film') { if (this.line.style.opacity !== '0') this.line.style.opacity = '0'; return; }
    const r = this.film.rowAt(t);
    const text = r?.row.line ?? null;
    const key = `${this.film.cut}:${r?.i ?? -1}`;
    if (key !== this.lineKey) {
      this.lineKey = key;
      this.line.replaceChildren();
      if (text) { const h = document.createElement('h3'); h.textContent = text; this.line.appendChild(h); }
    }
    if (!r || !text) { this.line.style.opacity = '0'; return; }
    const k = Math.min(smooth((t - r.row.start_s) / 0.35), r.row.end_s >= this.film.seconds ? 1 : 1 - smooth((t - (r.row.end_s - 0.3)) / 0.3));
    this.line.style.opacity = k.toFixed(3);
  }

  /** The film's words and screens for a picture (the capture's; the site keeps plates() and its own pace). At a rest:
   *  the plates laid out at the rest's pose and shown at k, and the frame's own screens whole, even on a hold too short
   *  for plates. Through a leg: each drawn frame's screens (the arcade's cabinet, the garage's boards and floors, the
   *  stewards' board, the towers' displays) laid out again for the leg's camera, at the frame's share of the picture,
   *  its plates kept out; without this the 3D moved with its screens blank and they popped in at the rest. Returns
   *  whether a layout moved the camera, and the opacities to set once the picture is drawn again. */
  private async dress(pic: Picture): Promise<{ moved: boolean; apply: () => void }> {
    const sets: [FrameInstance, number, number][] = [];
    let moved = false;
    const n = pic.draws.length, kb = n > 1 ? pic.draws[n - 1]!.alpha : 1;
    const layout = async (inst: FrameInstance, pose: CameraPose, key: string) => {
      inst.take();
      this.stage.setCamera(pose);
      this.stage.camera.updateMatrixWorld();
      moved = true;
      try { await inst.decorate(key); } catch (e) { this.errors.set(`${inst.id}:decorate`, String(e)); }
    };
    // a leg between two frames of one world that show different screens (leg.screens 'both'): each frame's screens
    // through the leg, on the one camera both draw with, whichever picture shows
    const w = pic.where;
    if (w.kind === 'leg' && this.film.leg(w.i).screens === 'both' && n > 0 && pic.draws[0]!.pose !== 'own') {
      const pose = pic.draws[0]!.pose as CameraPose;
      // the first frame's screens go as the camera comes down past them (over 0.5 to 0.75 of the leg), the second's
      // come in as it nears them (0.4 to 0.7): a floor seen from above never stands over the boards it leads to
      const shares = [1 - smooth((w.e - 0.5) / 0.25), smooth((w.e - 0.4) / 0.3)];
      for (const [j, k] of [this.film.keys[w.i - 1]!, this.film.keys[w.i]!].entries()) {
        const inst = this.insts.get(keyDef(k.key).frame);
        if (!this.drawable(inst) || inst.screens === false) continue;
        if (shares[j]! <= 0.002) { sets.push([inst, 0, 0]); continue; }
        await layout(inst, pose, `leg:${pic.t}`);
        sets.push([inst, inst.screens ? shares[j]! : 0, 0]);
      }
      return { moved, apply: () => { for (const [inst, o, p] of sets) inst.showLayer(o, p); } };
    }
    for (let i = 0; i < n; i++) {
      const d = pic.draws[i]!, inst = d.inst;
      if (pic.plates && pic.plates.inst === inst) {
        const { key, k } = pic.plates;
        if ((k > 0 || inst.screens !== false) && inst.decoratedFor !== key) {
          this.syncLine(pic.t);
          await layout(inst, inst.restPose!, key);
          // the scope line's height reaches the film's line too, so it clears a long scope as the frame's caption would
          const h = inst.platesHost.style.getPropertyValue('--hw-scope-h');
          if (h) this.line.style.setProperty('--hw-scope-h', h); else this.line.style.removeProperty('--hw-scope-h');
        }
        sets.push([inst, inst.screens ? 1 : 0, k]);
        continue;
      }
      const share = n > 1 ? (i === 0 ? 1 - kb : kb) : 1;
      if (inst.screens === false || share <= 0.002) { sets.push([inst, 0, 0]); continue; }
      await layout(inst, d.pose === 'own' ? inst.ownPose ?? inst.restPose! : d.pose, `leg:${pic.t}`);
      sets.push([inst, inst.screens ? share : 0, 0]);
    }
    return { moved, apply: () => { for (const [inst, o, p] of sets) inst.showLayer(o, p); } };
  }

  /** Seeks to film time t and settles there: builds what the picture needs (and the next key's frame), renders, lays
   *  out the plates and the frames' screens, waits for fonts and textures. The capture's clock. */
  async seek(t: number, dt = 0): Promise<Picture | null> {
    const { need, near } = this.framesNear(t, 1);
    for (const f of need) { try { await this.ensure(f); } catch { /* recorded in errors */ } }
    let pic = this.picture(t);
    if (!pic) pic = this.fallback(t);
    if (!pic) return null;
    this.syncLine(t);
    this.render(pic, dt);
    const shown = await this.dress(pic);
    // a layout moved the camera (and the stage's owner): draw once more so the canvas is this picture's
    if (shown.moved) this.render(pic, 0);
    shown.apply();
    await loadersIdle();
    await document.fonts.ready;
    this.stage.renderer.getContext().finish();
    // keep the frames round t; build the next one now, so the leg after this hold starts without a wait
    this.prune([...near, ...need]);
    return pic;
  }

  /** A picture from what is built, when a frame failed: the nearest key's frame that did build, held at its rest. */
  fallback(t: number): Picture | null {
    const F = this.film, where = F.locate(t);
    const order = [where.i, where.i - 1, where.i + 1, where.i - 2, where.i + 2];
    for (const j of order) {
      const k = F.keys[j];
      if (!k) continue;
      const inst = this.insts.get(keyDef(k.key).frame);
      if (this.drawable(inst)) return { draws: [{ inst, local: this.holdLocal(k, inst, Math.max(0, Math.min(k.until - k.at, t - k.at))), alpha: 1, pose: inst.restPose! }], plates: null, where, t };
    }
    return null;
  }

  /** For checks: the frames alive, their state. */
  info() {
    return {
      cut: this.film.cut, frames: [...this.insts.values()].map((i) => ({ id: i.id, ready: i.ready, buildMs: i.buildMs, readyMs: i.readyMs, error: i.error ? i.error.split('\n')[0] : null })),
      errors: Object.fromEntries(this.errors), gpu: this.stage.gpu(), info: JSON.parse(JSON.stringify(this.stage.frameInfo)),
    };
  }

  resize(width: number, height: number, dpr: number) {
    this.S.width = width; this.S.height = height; this.S.dpr = dpr;
    this.stage.setSize(width, height, dpr);
    this.under.width = Math.round(width * dpr); this.under.height = Math.round(height * dpr);
    // the frames fitted their cameras, lines and plates to the old size: they are built again as the story needs them
    this.prune([]);
  }

  dispose() {
    this.dead = true;
    for (const inst of this.insts.values()) inst.dispose();
    this.insts.clear();
    this.stage.dispose();
    this.under.remove(); this.canvas.remove(); this.layers.remove(); this.line.remove();
  }
}
