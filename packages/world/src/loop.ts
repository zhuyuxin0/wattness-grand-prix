// The loop lab: one frame of a station set up as the frame lab sets it (lab.ts), then posed again and again on a clock
// that closes on itself, for a seamless loop (the site's Terminal home plays one behind its panes).
//
//   loop.html?frame=<id>&w=1920&h=1080 [&seconds=12] [&fps=30] [&theme=dark] [&dpr=1] [&zoom=1] [&dx=0] [&dy=0]
//            [&daz=0] [&del=0] [&rock=0.9] [&t0=<the frame's own time>]
//
// Every input of the picture is a pure function of the loop's time t in [0, seconds), with period seconds:
//   - the camera: the frame's own pose, its lens narrowed by zoom and its shift moved by (dx, dy) screen widths and
//     heights, and a slow drift round its target, az + daz sin(2 pi t / seconds) and el - del cos(2 pi t / seconds);
//   - the frame's clock: t0 + rock sin(2 pi t / seconds), so its turning marks and scans swing and come back;
//   - every comet (kit/region/flows.ts pulses): each moves on by a whole number of its spacings over the loop, the
//     nearest to what its own speed would give, so it keeps within a few percent of the speed it is drawn at.
// Frame i is posed at t = i / fps, so frame seconds * fps is frame 0 again. The plates are never laid (the picture
// alone, as the lab's plates=0). window.__loopPose(i) poses and draws frame i, then resolves with its report;
// window.__ready / window.__error as in the lab. Nothing here reads the wall clock for the picture.
import './lib/tokens.css';
import './kit/css/glass.css';
import './kit/css/fonts.css';
import './kit/css/plates.css';
import './lab.css';
import * as THREE from 'three';
import { createWorldStage, type CameraPose, type Theme } from './lib/stage';
import { createPlates } from './lib/plates';
import type { FrameContext, FrameData, FrameHandle, FrameSetup, StationModule } from './stations/types';

export interface LoopReport {
  id: string;
  station: string;
  width: number;
  height: number;
  dpr: number;
  theme: Theme;
  seconds: number;
  fps: number;
  frames: number;
  camera: { zoom: number; dx: number; dy: number; daz: number; del: number };
  clock: { t0: number; rock: number };
  /** Each comet's spacings over one loop and its speed as drawn over its speed as built. */
  comets: { spacings: number; speedRatio: number }[];
  settle: number;
  gpu: string;
  setupMs: number;
}

declare global {
  interface Window {
    __ready?: boolean;
    __error?: string;
    __loop?: LoopReport;
    __loopPose?: (i: number) => Promise<{ i: number; t: number }>;
  }
}

const started = performance.now();
const q = new URLSearchParams(location.search);
const num = (key: string, fallback: number) => { const v = Number(q.get(key)); return q.has(key) && Number.isFinite(v) ? v : fallback; };
const pos = (key: string, fallback: number) => { const v = num(key, fallback); return v > 0 ? v : fallback; };
const frameId = q.get('frame') ?? 'stack.rest';
const W = Math.round(pos('w', 1920)), H = Math.round(pos('h', 1080));
const theme: Theme = q.get('theme') === 'light' ? 'light' : 'dark';
const dpr = pos('dpr', window.devicePixelRatio || 1);
const seconds = pos('seconds', 12), fps = pos('fps', 30);
const cam = { zoom: pos('zoom', 1), dx: num('dx', 0), dy: num('dy', 0), daz: num('daz', 0), del: num('del', 0) };
const rock = num('rock', 0.9);

const stations = import.meta.glob<StationModule>('./stations/*/index.ts');
const dataFiles = import.meta.glob<unknown>('./data/*.json', { import: 'default' });
const raf = () => new Promise<number>((r) => requestAnimationFrame(r));
const div = (cls: string) => { const e = document.createElement('div'); e.className = cls; return e; };

let inflight = 0;
const idle: (() => void)[] = [];
const lm = THREE.DefaultLoadingManager;
const itemStart = lm.itemStart.bind(lm), itemEnd = lm.itemEnd.bind(lm);
lm.itemStart = (url: string) => { inflight++; itemStart(url); };
lm.itemEnd = (url: string) => { itemEnd(url); inflight = Math.max(0, inflight - 1); if (!inflight) idle.splice(0).forEach((f) => f()); };
const loadersIdle = () => (inflight ? new Promise<void>((r) => idle.push(r)) : Promise.resolve());

async function findFrame(id: string): Promise<{ station: string; setup: FrameSetup }> {
  const dot = id.indexOf('.');
  const dir = q.get('station') ?? (dot > 0 ? id.slice(0, dot) : '');
  const load = stations[`./stations/${dir}/index.ts`];
  if (!load) throw new Error(`no station "${dir}" for frame "${id}"`);
  const setup = ((await load()).frames ?? {})[id];
  if (!setup) throw new Error(`station "${dir}" has no frame "${id}"`);
  return { station: dir, setup };
}

interface Pulse { t: { value: number }; speed: number; phase: number }

async function main() {
  const html = document.documentElement;
  html.dataset.skin = 'wattness'; html.dataset.theme = theme;
  const root = document.getElementById('world');
  if (!root) throw new Error('loop.html has no #world');
  root.className = 'world intro hwalk is-x';
  root.dataset.theme = theme;
  root.style.width = `${W}px`; root.style.height = `${H}px`;
  root.style.setProperty('--u', String(W / 1920));
  await Promise.all(['400 26px', '500 16px', '600 40px'].map((f) => document.fonts.load(`${f} "Libre Franklin Brand"`)));

  const canvas = document.createElement('canvas'); canvas.className = 'world-canvas';
  const overlay = div('world-overlay'), platesHost = div('world-plates');
  root.append(canvas, overlay, platesHost);
  const [data, layout] = await Promise.all(['frame-data.json', 'layout.json'].map((n) => dataFiles[`./data/${n}`]?.() ?? null));
  const stage = createWorldStage({ canvas, width: W, height: H, dpr, theme, debug: false });
  const plates = createPlates(platesHost, stage, { width: W, height: H });
  const { station, setup } = await findFrame(frameId);
  const waits: Promise<unknown>[] = [];
  const frameData = (data as FrameData | null) ?? null;
  const ctx: FrameContext = {
    id: frameId, station, stage, theme, width: W, height: H, dpr, data: frameData, layout, plates, overlay,
    needData() {
      if (!frameData) throw new Error('src/data/frame-data.json is missing: run scripts/sync-data.sh');
      return frameData;
    },
    wait(p) { waits.push(p); },
  };

  // The camera the frame sets, every time it sets one, is taken through the loop's framing and drift at the current t.
  let phase = 0;
  const setCamera = stage.setCamera.bind(stage);
  const framed = (p: CameraPose): CameraPose => {
    const k = cam.zoom;
    const vfov = (2 * Math.atan(Math.tan((p.vfov * Math.PI) / 360) / k) * 180) / Math.PI;
    const s = p.shift ?? [0, 0];
    return { ...p, vfov, shift: [s[0] * k + cam.dx, s[1] * k + cam.dy], az: p.az + cam.daz * Math.sin(phase), el: p.el - cam.del * Math.cos(phase) };
  };
  const handle: FrameHandle = await setup(ctx);
  // installed after the setup, whose own fitting calls set its camera as it measures
  stage.setCamera = (p: CameraPose) => setCamera(framed(p));
  const t0 = num('t0', handle.time ?? 0);
  const settle = Math.max(1, Math.round(handle.settle ?? 3));
  await Promise.all(waits);
  await loadersIdle();

  // every comet, with its spacing: over the loop it moves on a whole number of spacings
  const pulses: { p: Pulse; period: number; n: number }[] = [];
  stage.scene.traverse((o: THREE.Object3D) => {
    const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    const p = m?.userData?.pulse as Pulse | undefined;
    if (!p || pulses.some((x) => x.p === p)) return;
    const period = Number(m!.uniforms?.uPeriod?.value) || 1;
    const n = p.speed === 0 ? 0 : Math.max(1, Math.round((Math.abs(p.speed) * seconds) / period)) * Math.sign(p.speed);
    pulses.push({ p, period, n });
  });

  const pose = (t: number) => {
    phase = (2 * Math.PI * t) / seconds;
    handle.update?.(t0 + rock * Math.sin(phase), 0);
    for (const { p, period, n } of pulses) p.t.value = p.phase + (n * period * t) / seconds;
  };

  const programs = await stage.preparePrograms([() => pose(0)], () => true);
  void programs;
  window.__loopPose = async (i: number) => {
    const t = (((i % (seconds * fps)) + seconds * fps) % (seconds * fps)) / fps;
    pose(t);
    for (let k = 0; k < settle; k++) { stage.requestShadow(); stage.render(); await raf(); }
    stage.renderer.getContext().finish();
    await raf();
    return { i, t };
  };
  window.__loop = {
    id: frameId, station, width: W, height: H, dpr, theme, seconds, fps, frames: Math.round(seconds * fps), camera: cam, clock: { t0, rock },
    comets: pulses.map(({ p, period, n }) => ({ spacings: n, speedRatio: p.speed ? Number(((n * period) / seconds / p.speed).toFixed(4)) : 1 })),
    settle, gpu: stage.gpu(), setupMs: Math.round(performance.now() - started),
  };
  window.__ready = true;
}

main().catch((e: unknown) => {
  const text = e instanceof Error ? (e.stack ?? e.message) : String(e);
  window.__error = text;
  const pre = document.createElement('pre'); pre.className = 'world-error'; pre.textContent = text;
  (document.getElementById('world') ?? document.body).appendChild(pre);
  console.error(e);
});
