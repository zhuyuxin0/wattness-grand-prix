// ONE PLAN, playable: mountOnePlan(el, { theme, mode, onSeal }) puts the cabinet on a stage in el and lets a visitor
// turn the schedule dial, drag glass onto hours and seal the plan from their own wallet on BSC testnet.
//
//   mode 'play'  : the site's Markets tab. The stage, then a deck in the site's theme: the dial and the rack of hours,
//                  the plan's score beside the planner's, and the seal.
//   mode 'story' : the story's "your turn" beat. The same controls laid over the stage in dark glass.
//
// The stage holds dark in both, as wattness.tech's intro does. Every score is the planner's own objective over the
// field's 301 sealed scenarios, computed exactly in the page (model.ts; the tests prove it against the engine).
import '../kit/css/fonts.css';
import './game.css';
import * as THREE from 'three';
import { createWorldStage, type CameraPose, type Theme, type Vec3, type WorldStage } from '../lib/stage';
import { buildCabinet, CAB, type Cabinet } from '../stations/game/cabinet';
import { boardHtml, planeSvg, type PlaneMark } from '../stations/game/screens';
import { dualClock, gateUnix } from './chain';
import type { Hex } from './hash';
import { ARMS, DIAL_STEPS, armPlan, directions, fieldFromFrameData, fitGlass, lightWeight, play, usd, type ArmId, type Field, type Played, type PlayerPlan } from './model';
import { dialView, detailView, lightView, rackView, readoutView, sealView, startsView, type SealPanelState } from './ui';
import { SealError, sealPlan, type Eip1193, type SealReceipt } from './wallet';

export type { Field, Played, PlayerPlan, SealReceipt, Eip1193 };
export { fieldFromFrameData, play, armPlan, DIAL_STEPS };

export interface OnePlanOptions {
  /** The site's theme: the deck under the stage follows it (play mode). The stage holds dark. */
  theme?: Theme;
  /** 'play' (the Markets tab, the default) or 'story' (the "your turn" beat). */
  mode?: 'play' | 'story';
  /** Called once a plan is sealed and its receipt read back from the chain. */
  onSeal?: (receipt: SealReceipt) => void;
  /** Frame data with showcase, game and sealed_day (src/data/frame-data.json); loaded from the package when absent. */
  data?: unknown;
  /** The wallet (EIP-1193); window.ethereum when absent. */
  ethereum?: Eip1193 | null;
  /** The record's codeHash (a 20-byte git object id, left-aligned); zero when absent. */
  codeHash?: Hex;
  /** The opening plan; the planner's sealed plan (C) when absent. */
  plan?: PlayerPlan;
  /** Unix seconds for the gate's clock; the page's clock when absent. */
  now?: () => number;
  /** Drawing-buffer pixels per CSS px; the device's, at most 2, when absent. */
  dpr?: number;
  /** One frame, no animation and no loop (stills). */
  still?: boolean;
  /** The camera, when the host frames the cabinet itself (the story player); fitted to the layout when absent. */
  camera?: CameraPose;
  /** Where the field's sealed record is shown (the site's Seal tab); the seal card links it once the field's gate has
   *  passed. No link when absent. */
  recordHref?: string;
}

export interface OnePlanHandle {
  readonly ready: Promise<void>;
  field(): Field;
  getPlan(): PlayerPlan;
  /** Sets the plan (the dial step and the glass); the field eases and the coins hop unless animate is false. */
  setPlan(plan: PlayerPlan, o?: { animate?: boolean }): Played;
  played(): Played;
  setTheme(theme: Theme): void;
  /** Selects an hour on the rack (its line under the rack). */
  select(hour: number | null): void;
  /** Draws a frame now. */
  render(): void;
  dispose(): void;
}

/** The camera for a layout and an aspect: the whole cabinet in frame, clear of what lies over the stage. */
function cameraFor(layout: 'overlay' | 'deck', aspect: number): CameraPose {
  if (layout === 'overlay') {
    // the machine left of the side column and above the controls; wider stages see it from a little further
    const dist = 142 * Math.max(1, (16 / 9) / Math.max(aspect, 0.8)) ** 0.6;
    return { target: [-324, 13, 208], az: 176, el: 32, dist, vfov: 34, shift: [-0.15, 0.15] };
  }
  const dist = 100 * Math.max(1, (16 / 9) / Math.max(aspect, 0.8)) ** 0.75;
  return { target: [-323, 12, 211], az: 174, el: 30, dist, vfov: 36, shift: [0, 0.03] };
}

export function mountOnePlan(el: HTMLElement, opts: OnePlanOptions = {}): OnePlanHandle {
  const mode = opts.mode ?? 'play', layout = mode === 'story' ? 'overlay' : 'deck';
  const still = !!opts.still;
  const root = document.createElement('div');
  root.className = 'oneplan';
  root.dataset.layout = layout;
  root.dataset.atmosphere = 'dark';
  const stageEl = document.createElement('div'); stageEl.className = 'op-stage';
  const canvas = document.createElement('canvas');
  const screens = document.createElement('div'); screens.className = 'op-screens';
  const tags = document.createElement('div'); tags.className = 'op-tags';
  const hold = document.createElement('div'); hold.className = 'op-hold'; hold.textContent = 'Loading the cabinet…';
  stageEl.append(canvas, screens, tags, hold);
  const deck = document.createElement('div'); deck.className = 'op-deck';
  deck.dataset.theme = layout === 'overlay' ? 'dark' : opts.theme ?? 'dark';
  // the root holds the stage's dark (data-atmosphere="dark", the host site's convention); the deck under the stage
  // takes the page's theme back, so the host's tokens inside it (borders, raised ground, the plans' colors) are the
  // page theme's, not the stage's
  if (layout === 'deck') deck.dataset.atmosphere = deck.dataset.theme;
  root.append(stageEl, deck);
  if (layout === 'overlay') stageEl.appendChild(deck);
  el.appendChild(root);

  let disposed = false, raf = 0;
  let stage: WorldStage | null = null, cab: Cabinet | null = null, F: Field | null = null, dir: number[] = [];
  let plan: PlayerPlan = { step: 0, glass: new Array(24).fill(0) }, played: Played | null = null, selected: number | null = null;
  let sealState: SealPanelState = { kind: 'idle' };
  let dirty = true, lastOver = false, burstUntil = -1, dot = { wt: 0, mean: 0 }, dotFrom = { wt: 0, mean: 0 }, dotTo = { wt: 0, mean: 0 }, dotT0 = 0;
  const t0 = performance.now();
  const clock = () => (still ? 0 : (performance.now() - t0) / 1000);
  const now = () => (opts.now ? opts.now() : Date.now() / 1000);
  const provider = (): Eip1193 | null => (opts.ethereum !== undefined ? opts.ethereum : ((globalThis as any).ethereum ?? null));
  let ui: ReturnType<typeof buildUi> | null = null;

  const size = () => {
    const w = Math.max(320, Math.round(layout === 'overlay' ? el.clientWidth || 1280 : root.clientWidth || el.clientWidth || 1280));
    const h = layout === 'overlay' ? Math.max(240, Math.round(el.clientHeight || (w * 9) / 16)) : Math.max(240, Math.round((w * 9) / 16));
    return { w, h };
  };

  function buildUi(f: Field) {
    const dial = dialView((s) => change({ step: s, glass: plan.glass }));
    const handlers = { glass: (hr: number, v: number) => { const g = plan.glass.slice(); g[hr] = v; change({ step: plan.step, glass: g }); }, select: (hr: number | null) => { selected = hr; refreshUi(); } };
    const rack = rackView(dir, handlers);
    const detail = detailView(f, dir, handlers);
    const starts = startsView((a) => change(armPlan(f, a)), () => change({ step: plan.step, glass: new Array(24).fill(0) }));
    const light = lightView(() => change(fitGlass(f, plan)));
    const read = readoutView(f);
    const seal = sealView(f, () => void doSeal(), download, opts.recordHref);
    const controls = document.createElement('section'); controls.className = 'op-controls op-card';
    if (layout === 'overlay') controls.classList.add('op-glass');
    controls.setAttribute('aria-label', 'Your plan’s controls');
    controls.append(starts.el, dial.el, rack.el, light.el, detail.el);
    detail.el.style.gridColumn = '2';
    light.el.style.gridColumn = '1 / -1';
    const side = document.createElement('div'); side.className = 'op-side';
    if (layout === 'overlay') { read.el.classList.add('op-glass'); seal.el.classList.add('op-glass'); side.append(read.el, seal.el); deck.append(controls, side); }
    else {
      // under the stage: the controls and the seal on the left, the plan's score beside them
      const main = document.createElement('div'); main.className = 'op-main';
      main.append(controls, seal.el); side.append(read.el); deck.append(main, side);
    }
    return { dial, rack, detail, starts, light, read, seal };
  }

  function armOf(p: PlayerPlan): ArmId | null {
    if (!F) return null;
    for (const a of ARMS) { const ap = armPlan(F, a); if (ap.step === p.step && ap.glass.every((g, h) => g === (p.glass[h] ?? 0))) return a; }
    return null;
  }

  function refreshUi() {
    if (!ui || !F || !played) return;
    ui.dial.set(plan.step);
    ui.rack.set(played, plan, selected);
    ui.detail.set(played, plan, selected);
    ui.starts.set(armOf(plan));
    ui.light.set(played, plan);
    ui.read.set(played, { wt: -played.score.cvar / 1e6, mean: played.score.mean / 1e6 });
    ui.seal.set({ played, now: now(), wallet: !!provider(), state: sealState });
  }

  function marks(f: Field): PlaneMark[] {
    return ARMS.map((a) => ({ arm: a, wt: -f.arms[a].cvarUusd / 1e6, mean: f.arms[a].expectedUusd / 1e6, score: f.arms[a].objectiveUusd / 1e6, state: a === 'C' ? 'sealed' : 'ghost' }));
  }

  function drawBoard() {
    if (!cab || !F || !played) return;
    const s = played.score, diff = s.objective - F.arms.C.objectiveUusd, cents = Math.round(diff / 10000);
    const foot = `${s.losing} of ${F.n} days lose money · ${cents > 0 ? `${usd(diff)} ahead of the planner` : cents === 0 ? 'level with the planner' : `${usd(-diff)} behind the planner`}`;
    const { plane, PW, PH } = cab.screens;
    plane.innerHTML = `${boardHtml({ title: 'Your plan', swatch: null, sealed: false, mean: s.mean / 1e6, worst: -s.cvar / 1e6, score: s.objective / 1e6, foot })}<div class="chart">${planeSvg(PW - 540, PH, marks(F), dot, true)}</div>`;
  }

  function change(next: PlayerPlan, animate = !still) {
    if (!F || !cab) return;
    plan = { step: next.step, glass: next.glass.map((g, h) => (dir[h] === 0 ? 0 : g)) };
    const was = played;
    played = play(F, plan, dir);
    const t = clock();
    cab.setPlan({
      cell: (k, h) => {
        const x = played!.kw[h]!, q = played!.q[h]!, o = k * 24 + h;
        return x * F!.unitKw[o]! - Math.max(0, x) * F!.wearCentsPerMwh * 10 + q * F!.unitQ[o]! - Math.abs(q) * F!.feeCentsPerContract * 10000;
      },
      kw: played.kw, q: played.q, light: played.short.map(lightWeight), totals: played.score.totals, bins: played.score.bin, tail: played.score.tail.map((x) => x.k),
      dial: plan.step / DIAL_STEPS, score: played.score.objective / 1e6, seal: sealState.kind === 'sealed' ? 'sealed' : (now() < gateUnix(F.operatingDay) && !played.lit) ? 'ready' : 'dark',
    }, t, was && animate ? 'hop' : 'snap', animate ? 0.45 : 0);
    dotFrom = { ...dot }; dotTo = { wt: -played.score.cvar / 1e6, mean: played.score.mean / 1e6 }; dotT0 = t;
    if (!was || !animate) dot = { ...dotTo };
    // passing the planner chases the bulbs
    const over = played.score.objective > F.arms.C.objectiveUusd;
    if (over && !lastOver && was && animate) burstUntil = t + 1.6;
    lastOver = over;
    if (sealState.kind === 'error') sealState = { kind: 'idle' };
    drawBoard();
    refreshUi();
    if (stage) layoutTags();
    dirty = true;
    stage?.requestShadow();
    if (!still) loop();
  }

  function layoutTags() {
    if (!stage || !cab || !F) return;
    const cam = stage.camera, v = new THREE.Vector3(), w = canvas.clientWidth, hgt = canvas.clientHeight;
    cam.updateMatrixWorld();
    const project = (p: Vec3) => { v.set(p[0], p[1], p[2]).project(cam); return v.z > 1 ? null : { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * hgt }; };
    cab.layoutScreens(project);
    tags.replaceChildren();
    const A = cab.machine.anchors;
    const add = (text: string, at: Vec3, cls = '', dy = 4) => {
      const p = project(at); if (!p) return;
      const t = document.createElement('div'); t.className = `op-tag ${cls}`; t.textContent = text;
      t.style.left = `${p.x}px`; t.style.top = `${p.y + dy}px`; tags.appendChild(t);
    };
    // the end tubes hold every day past them: their ticks say so when a coin lies beyond
    const lo = F.edges[0]! / 1e6, hi = F.edges[F.edges.length - 1]! / 1e6, sc = played?.score;
    for (const v0 of [lo, 0, 5000, 10000, hi]) {
      const money = `${v0 < 0 ? '−' : ''}$${Math.abs(v0).toLocaleString('en-US')}`;
      add(v0 === lo && sc?.under ? `≤ ${money}` : v0 === hi && sc?.over ? `≥ ${money}` : money, A.trayTick(v0), v0 === 0 ? 'zero' : '');
    }
  }

  function frame() {
    raf = 0;
    if (disposed || !stage || !cab) return;
    const t = clock();
    let moving = cab.update(t);
    if (t < burstUntil) { cab.machine.chase(t * 3); moving = true; }
    // the dot glides to the plan (spring-like ease over 0.5 s)
    if (dot.wt !== dotTo.wt || dot.mean !== dotTo.mean) {
      const u = Math.min(1, (t - dotT0) / 0.5), k = 1 - Math.pow(1 - u, 3);
      dot = u >= 1 ? { ...dotTo } : { wt: dotFrom.wt + (dotTo.wt - dotFrom.wt) * k, mean: dotFrom.mean + (dotTo.mean - dotFrom.mean) * k };
      drawBoard(); moving = true;
    }
    if (moving || dirty) { stage.requestShadow(); stage.render(); dirty = false; }
    // the bulbs step six times a second; nothing else moves at rest
    if (!disposed) raf = requestAnimationFrame(frame);
  }
  const loop = () => { if (!raf && !disposed && !still) raf = requestAnimationFrame(frame); };

  const resize = () => {
    if (!stage || !cab || disposed) return;
    const { w, h } = size(), dpr = opts.dpr ?? Math.min(2, window.devicePixelRatio || 1);
    stageEl.style.height = `${h}px`;
    if (layout === 'overlay') root.style.height = `${h}px`;
    stage.setSize(w, h, dpr);
    cab.resize(w * dpr, h * dpr);
    stage.setCamera(opts.camera ?? cameraFor(layout, w / h));
    layoutTags();
    dirty = true;
    if (still) stage.render(); else loop();
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  // the gate's countdown on the seal panel
  const tick = still ? 0 : window.setInterval(() => { if (ui && played && sealState.kind !== 'busy') ui.seal.set({ played, now: now(), wallet: !!provider(), state: sealState }); }, 30_000);

  async function doSeal() {
    if (!F || !played || sealState.kind === 'busy') return;
    const pl = plan, pd = played;
    try {
      sealState = { kind: 'busy', step: 'connect' }; refreshUi();
      const receipt = await sealPlan(provider(), {
        field: F, plan: pl, played: pd, now, codeHash: opts.codeHash,
        onStep: (step, note) => { sealState = { kind: 'busy', step, tx: note }; ui?.seal.set({ played: pd, now: now(), wallet: true, state: sealState }); },
      });
      sealState = { kind: 'sealed', receipt };
      cab?.machine.setSeal('sealed'); dirty = true; loop();
      opts.onSeal?.(receipt);
    } catch (e) {
      sealState = { kind: 'error', message: e instanceof SealError ? e.message : `Could not seal: ${(e as Error)?.message ?? e}`, code: e instanceof SealError ? e.code : 'wallet' };
    }
    refreshUi();
  }

  function download(r: SealReceipt) {
    const blob = new Blob([r.record.json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `one-plan-${r.record.doc.resource}-${r.record.doc.operating_day}-${r.record.leaf.slice(2, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const ready = (async () => {
    const raw = opts.data ?? (await loadData());
    if (disposed) return;
    F = fieldFromFrameData(raw);
    dir = directions(F);
    const { w, h } = size(), dpr = opts.dpr ?? Math.min(2, window.devicePixelRatio || 1);
    stageEl.style.height = `${h}px`;
    if (layout === 'overlay') root.style.height = `${h}px`;
    stage = createWorldStage({ canvas, width: w, height: h, dpr, theme: 'dark', preserve: still, debug: false });
    const C = F.arms.C, A = F.arms.A, B = F.arms.B;
    const order = Array.from({ length: F.n }, (_, k) => k);
    {
      // the field's columns: the scenarios sorted by the no-hedge day total, worst at the west end (as the storyboard's)
      const totalsA = play(F, armPlan(F, 'A'), dir).score.totals;
      order.sort((a, b) => totalsA[a]! - totalsA[b]! || a - b);
    }
    const cHist = play(F, armPlan(F, 'C'), dir).score.hist;
    cab = buildCabinet(stage, 'dark', screens, w * dpr, h * dpr, {
      n: F.n, order, entryCents: F.entryCents, marks: { a: A.objectiveUusd / 1e6, b: B.objectiveUusd / 1e6, p1: C.objectiveUusd / 1e6 }, ghostHist: cHist, visitors: false,
    });
    // 24-hour market time, as the story's own ticker prints it ("09:15:17 CT")
    const sealedCt = dualClock(F.record.sealedUnix, { seconds: true, date: false }).ct.replace(/ CT$/, '');
    cab.screens.banner.innerHTML = `<span class="col"><span class="row"><span class="lead">Best sealed plan</span><span class="num">${usd(C.objectiveUusd)}</span><span class="p1">P1</span></span><span class="sub">the record wallet (${F.record.agent.slice(0, 6).toLowerCase()}…${F.record.agent.slice(-4).toLowerCase()}) · ${sealedCt} CT</span></span>`;
    const lead = F.record.gateUnix - F.record.sealedUnix;
    cab.screens.ticker.innerHTML = `<span><b>SEALED</b> ${sealedCt} CT · ${lead.toLocaleString('en-US')} s before the gate</span><span class="dot">●</span><span>ONE PLAN · ${F.name} · ${F.n} scenarios</span>`;
    ui = buildUi(F);
    stage.setCamera(opts.camera ?? cameraFor(layout, w / h));
    change(opts.plan ?? armPlan(F, 'C'), false);
    // the coins pour in from the field's lip at the start of a live game
    if (!still) cab.machine.coins.set(played!.score.totals, played!.score.bin, played!.score.tail.map((x) => x.k), clock(), 'drop', order);
    await stage.preparePrograms([() => cab!.update(clock())], () => !disposed);
    if (disposed) return;
    resize();
    hold.remove();
    for (let i = 0; i < 3; i++) { stage.requestShadow(); stage.render(); await new Promise((r) => requestAnimationFrame(r)); }
    layoutTags();
    ro?.observe(layout === 'overlay' ? el : root);
    if (!still) loop();
  })();
  ready.catch((e) => { hold.textContent = `ONE PLAN could not start: ${(e as Error)?.message ?? e}`; });

  return {
    ready,
    field() { if (!F) throw new Error('not ready'); return F; },
    getPlan: () => ({ step: plan.step, glass: plan.glass.slice() }),
    setPlan(p, o = {}) { change(p, o.animate ?? !still); if (still) { stage?.requestShadow(); stage?.render(); } return played!; },
    played() { if (!played) throw new Error('not ready'); return played; },
    setTheme(theme) { if (layout === 'deck') { deck.dataset.theme = theme; deck.dataset.atmosphere = theme; } },
    select(hr) { selected = hr; refreshUi(); },
    render() { if (stage && cab) { cab.update(clock()); layoutTags(); stage.requestShadow(); stage.render(); } },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      if (tick) clearInterval(tick);
      ro?.disconnect();
      cab?.dispose(); stage?.dispose();
      root.remove();
    },
  };
}

async function loadData(): Promise<unknown> {
  const files = import.meta.glob<unknown>('../data/frame-data.json', { import: 'default' });
  const load = files['../data/frame-data.json'];
  if (!load) throw new Error('no frame data: pass options.data, or sync src/data/frame-data.json (scripts/sync-data.sh)');
  return load();
}

export { CAB };
