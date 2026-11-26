// The frame lab. lab.html?frame=<id>&w=1920&h=1080 [&theme=dark|light] [&dpr=2] [&station=<dir>] [&debug=0]
// mounts the stage at that size, imports only the station that owns the frame, sets the frame up, poses it at the
// frame's own time on a fixed-step clock, draws until the picture has settled, lays out its plates, then sets
// window.__ready = true, or window.__error to the message. Without ?frame= it lists every station's frames.
// Nothing here reads the wall clock for the picture; performance.now() only times the render for its receipt.
import './lib/tokens.css';
import './kit/css/glass.css';
import './kit/css/fonts.css';
import './kit/css/plates.css';
import './lab.css';
import * as THREE from 'three';
import { createWorldStage, type Theme } from './lib/stage';
import { createPlates } from './lib/plates';
import type { FrameContext, FrameData, FrameHandle, FrameSetup, StationModule } from './stations/types';

export interface LabReport {
  id: string;
  station: string;
  width: number;
  height: number;
  dpr: number;
  theme: Theme;
  time: number;
  steps: number;
  settle: number;
  skin: 'walk' | 'intro';
  note: string;
  gpu: string;
  /** Module start to ready, ms. */
  renderMs: number;
  programs: { state: string; programs: number };
  frameInfo: { calls: number; triangles: number; passes: Record<string, number> };
  data: { frameData: boolean; layout: boolean };
}

declare global {
  interface Window { __ready?: boolean; __error?: string; __frame?: LabReport }
}

const started = performance.now();
const q = new URLSearchParams(location.search);
const num = (key: string, fallback: number) => { const v = Number(q.get(key)); return Number.isFinite(v) && v > 0 ? v : fallback; };
const frameId = q.get('frame');
const W = Math.round(num('w', 1920)), H = Math.round(num('h', 1080));
const theme: Theme = q.get('theme') === 'light' ? 'light' : 'dark';
const dpr = num('dpr', window.devicePixelRatio || 1);
const debug = q.get('debug') !== '0';

// Lazy on purpose: a station is imported only when one of its frames is asked for, so one station's error cannot
// break another's frames.
const stations = import.meta.glob<StationModule>('./stations/*/index.ts');
const dataFiles = import.meta.glob<unknown>('./data/*.json', { import: 'default' });
const dirOf = (path: string) => path.split('/')[2] ?? path;
const dirs = Object.keys(stations).map(dirOf).sort();

const raf = () => new Promise<number>((r) => requestAnimationFrame(r));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const div = (cls: string) => { const e = document.createElement('div'); e.className = cls; return e; };

// Textures loaded through three's loaders hold the shot until they are in.
let inflight = 0;
const idle: (() => void)[] = [];
const lm = THREE.DefaultLoadingManager;
const itemStart = lm.itemStart.bind(lm), itemEnd = lm.itemEnd.bind(lm);
lm.itemStart = (url: string) => { inflight++; itemStart(url); };
lm.itemEnd = (url: string) => { itemEnd(url); inflight = Math.max(0, inflight - 1); if (!inflight) idle.splice(0).forEach((f) => f()); };
const loadersIdle = () => (inflight ? new Promise<void>((r) => idle.push(r)) : Promise.resolve());

async function loadJson(name: string): Promise<unknown> {
  const load = dataFiles[`./data/${name}`];
  return load ? load() : null;
}

/** The station that owns a frame: ?station= if given, else the id's prefix ("<dir>.<name>"), else the first station
 *  that has it, importing them one by one. */
async function findFrame(id: string, explicit: string | null): Promise<{ station: string; setup: FrameSetup }> {
  const dot = id.indexOf('.');
  const owner = explicit ?? (dot > 0 && dirs.includes(id.slice(0, dot)) ? id.slice(0, dot) : null);
  const seen: string[] = [];
  for (const dir of owner ? [owner] : dirs) {
    const load = stations[`./stations/${dir}/index.ts`];
    if (!load) throw new Error(`no station "${dir}" (stations: ${dirs.join(', ') || 'none'})`);
    let mod: StationModule;
    try { mod = await load(); } catch (e) {
      if (owner) throw e;
      seen.push(`${dir}: failed to load: ${message(e)}`);
      continue;
    }
    const table: Partial<Record<string, FrameSetup>> = mod.frames ?? {};
    const setup = table[id];
    if (setup) return { station: dir, setup };
    seen.push(`${dir}: ${Object.keys(mod.frames ?? {}).join(', ') || 'no frames'}`);
  }
  throw new Error(`no station has a frame "${id}"\n${seen.join('\n')}`);
}

async function showIndex(root: HTMLElement) {
  const box = div('world-index');
  const h = document.createElement('h1'); h.textContent = 'World frames'; box.appendChild(h);
  root.appendChild(box);
  for (const dir of dirs) {
    const h2 = document.createElement('h2'); h2.textContent = dir; box.appendChild(h2);
    try {
      const mod = await stations[`./stations/${dir}/index.ts`]!();
      const ul = document.createElement('ul');
      for (const id of Object.keys(mod.frames ?? {})) {
        const li = document.createElement('li'), a = document.createElement('a');
        const p = new URLSearchParams(q); p.set('frame', id); a.href = `?${p}`; a.textContent = id;
        li.appendChild(a); ul.appendChild(li);
      }
      box.appendChild(ul);
    } catch (e) {
      const bad = document.createElement('p'); bad.className = 'bad'; bad.textContent = message(e); box.appendChild(bad);
    }
  }
  window.__ready = true;
}

async function main() {
  const html = document.documentElement;
  html.dataset.skin = 'wattness'; html.dataset.theme = theme;
  const root = document.getElementById('world');
  if (!root) throw new Error('lab.html has no #world');
  root.className = 'world intro hwalk is-x';
  root.dataset.theme = theme;
  root.style.width = `${W}px`; root.style.height = `${H}px`;
  // the walkthrough's sizes scale with the frame's width over 1920 (walkthrough.css --u)
  root.style.setProperty('--u', String(W / 1920));
  if (!frameId) return showIndex(root);

  // the faces plates, captions and canvas text use, in before anything is measured or drawn
  await Promise.all(['400 26px', '500 16px', '600 40px'].map((f) => document.fonts.load(`${f} "Libre Franklin Brand"`)));

  const canvas = document.createElement('canvas'); canvas.className = 'world-canvas';
  const overlay = div('world-overlay'), platesHost = div('world-plates');
  root.append(canvas, overlay, platesHost);

  const [data, layout] = await Promise.all([loadJson('frame-data.json'), loadJson('layout.json')]);
  const stage = createWorldStage({ canvas, width: W, height: H, dpr, theme, debug });
  const plates = createPlates(platesHost, stage, { width: W, height: H });
  const { station, setup } = await findFrame(frameId, q.get('station'));
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

  const handle: FrameHandle = await setup(ctx);
  const skin = handle.skin ?? 'walk';
  if (skin === 'intro') root.className = 'world intro';
  const time = handle.time ?? 0;
  const steps = Math.max(0, Math.round(handle.steps ?? 30)), settle = Math.max(1, Math.round(handle.settle ?? 3));
  await Promise.all(waits);
  await loadersIdle();

  // every program the shot needs, compiled in parallel before the first draw
  const programs = await stage.preparePrograms([() => handle.update?.(time, 0)], () => true);
  // the frame's own clock up to the shot, then the shot's pose with dt = 0
  for (let k = steps; k >= 1; k--) handle.update?.(time - k / 60, 1 / 60);
  handle.update?.(time, 0);
  for (let i = 0; i < settle; i++) { stage.requestShadow(); stage.render(); await raf(); }
  stage.renderer.getContext().finish();

  await handle.decorate?.();
  await Promise.all(waits);
  await document.fonts.ready;
  await raf(); await raf();

  window.__frame = {
    id: frameId, station, width: W, height: H, dpr, theme, time, steps, settle, skin, note: handle.note,
    gpu: stage.gpu(), renderMs: Math.round(performance.now() - started), programs,
    frameInfo: JSON.parse(JSON.stringify(stage.frameInfo)), data: { frameData: frameData != null, layout: layout != null },
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
