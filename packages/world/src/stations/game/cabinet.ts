// The cabinet, built once and posed by plan: the Arena at night on the intro's stage, ONE PLAN's machine, the field of
// a plan's scenarios x 24 hours (the walkthrough's makeField at its own units), the schedule strip on the deck's west
// edge, the glass over the hedged hours with the light where the schedule does not deliver them, the coins in the
// tray and the screens. The storyboard's frames pose it once (scene.ts); the game (src/game) poses it on every change,
// easing the field and hopping the coins.
import * as THREE from 'three';
import { GrabPass, heatAt, hOf, makeField, THEMES, zOf } from '../../kit/hedge/fields';
import { lin } from '../../kit/region/geo';
import { createMaterials } from '../../kit/materials';
import { buildFigure } from '../../kit/props';
import type { Theme, Vec3, WorldStage } from '../../lib/stage';
import { LampBloomPass } from './bloom';
import type { CoinMove } from './coins';
import { LiveGlass, type GlassBar } from './glass';
import { BLOOM, PAL } from './look';
import { buildMachine, CAB, type SealState } from './machine';
import { onQuad, quadRect, screenStyles, type Project } from './screens';

export const FIELD = { cx: -325, cz: 205, y: 9.0, dx: 0.2, hz: 1.2, block: 3.4 };
const STRIP = { x: -357.0, dx: 0.32, perMw: 0.012, block: 2.0 };

/** What the cabinet shows of a plan. */
export interface PlanView {
  /** Micro-USD of scenario k's hour h. */
  cell(k: number, h: number): number;
  kw: readonly number[];
  q: readonly number[];
  /** Each hour's light weight (0 where the schedule delivers its contracts). */
  light: readonly number[];
  totals: ArrayLike<number>;
  bins: ArrayLike<number>;
  tail: Iterable<number>;
  /** 0 at A, 1 at C. */
  dial: number;
  /** The score tower's puck, dollars (null: none). */
  score: number | null;
  seal: SealState;
}

export interface CabinetOptions {
  /** Scenarios, the field's column order (scenario per column, west to east), each hour's assumed entry (cents). */
  n: number;
  order: readonly number[];
  entryCents: readonly number[];
  /** The score tower's reference marks (dollars) and the second pile's outline. */
  marks: { a?: number; b?: number; p1?: number };
  ghostHist?: readonly number[];
  visitors: boolean;
  /** The pour at the start, or every coin in place. */
  coinMove?: CoinMove;
}

export interface Cabinet {
  root: THREE.Group;
  machine: ReturnType<typeof buildMachine>;
  glass: LiveGlass;
  order: readonly number[];
  screens: { plane: HTMLElement; marquee: HTMLElement; ticker: HTMLElement; banner: HTMLElement; PW: number; PH: number };
  /** Poses the plan; the field eases to it over ease seconds and the coins move as move says. */
  setPlan(view: PlanView, t: number, move: CoinMove, ease?: number): void;
  /** Advances the eases, the coins and the bulbs to time t; true while anything is still moving. */
  update(t: number): boolean;
  /** Lays the screens on their quads for the posed camera; returns their rects. */
  layoutScreens(project: Project): { x: number; y: number; w: number; h: number }[];
  /** The field's world point at a column and hour ending, at the cell's height. */
  cellTop(j: number, he: number): Vec3;
  /** Where a glass bar's pane is at column j (its top) or its front edge. */
  glassAt(he: number, j: number, side?: 'top' | 'front'): Vec3 | null;
  resize(w: number, h: number): void;
  dispose(): void;
}

/** The kit's floor shader finds a cell from the fragment's world x and z against uOrigin (the walkthrough's fields sit
 *  at the world's origin); a field moved into the Arena gives it its world center. */
function atOrigin(f: any, x: number, z: number) {
  f.group.traverse((o: any) => { const u = o.material?.uniforms; if (u?.uOrigin && u?.tMask) u.uOrigin.value.set(x, z); });
}

const smooth = (u: number) => u * u * (3 - 2 * u);

export function buildCabinet(stage: WorldStage, theme: Theme, overlay: HTMLElement, W: number, H: number, o: CabinetOptions): Cabinet {
  const T = (THEMES as any)[theme];

  // ── the stage at night ──────────────────────────────────────────────────────────────────────────────────────────
  stage.setBackdrop({ top: '#101315', horizon: '#1f2429', bottom: '#14171a', glow: '#2b3036', ground: '#14171a' });
  stage.setGround('#14171a');
  // the ground dissolves round the Arena, not round the world's origin 380 m away
  stage.setFade({ center: [0.5, 0.5], screen: [2, 3], world: [150, 520], worldCenter: [-325, 214], glow: [0.6, 0.34] });
  stage.setLight({ key: { color: '#93a8d4', intensity: 0.32 }, rim: { color: '#7f95c0', intensity: 0.22 }, fill: { sky: '#46597d', ground: '#15130f', intensity: 0.42 }, env: 0.06, shadow: 0.16 });
  stage.setKey({ az: 225, el: 50, center: [-325, 12, 212], radius: 48 });
  stage.setAO({ radius: 0.5, scale: 1.0, thickness: 1.0, samples: 16 });
  stage.setShadowAuto(true);
  stage.renderer.localClippingEnabled = true;
  const grab = new GrabPass(W, H);
  stage.insertBeforeOverlay(grab as any);
  const res = new THREE.Vector2(W, H);
  const bloom = new LampBloomPass(stage.scene, stage.camera, BLOOM, W, H, { strength: 0.9, radius: 0.6 });
  stage.composer.insertPass(bloom, stage.composer.passes.length - 1);

  const root = new THREE.Group(); root.name = 'arena';
  stage.scene.add(root);

  // ── the field: one column a scenario in the given order, 24 hours deep ───────────────────────────────────────────
  const { n, order } = o;
  const series = {
    days: order.map((k) => `scenario-${k}`),
    cells: order.flatMap((_, j) => Array.from({ length: 24 }, (_, h) => ({ j, he: h + 1, rev: 0, gE: null, hedged: null }))),
    evening: [18], lid: order.map(() => [] as number[]), contracts: 0,
  };
  const field: any = (makeField as any)(series, theme, grab, res, { dx: FIELD.dx, hz: FIELD.hz, block: FIELD.block, sheet: false, bandFill: 0.15, outlineW: 0.16 });
  field.group.position.set(FIELD.cx, FIELD.y, FIELD.cz);
  atOrigin(field, FIELD.cx, FIELD.cz);
  field.show({ bars: true, floor: true, sides: true, glass: false, tiles: false, gaps: false, path: false, outline: false });
  root.add(field.group);
  // the field's values in its cells' order (column j, hour h), dollars: where an ease starts, where it ends, and now
  const N = n * 24;
  const from = new Float64Array(N), to = new Float64Array(N), now = new Float64Array(N);
  let easeT0 = 0, easeDur = 0, easing = false;
  const layoutField = (vals: Float64Array) => {
    field.layout({ place: (_c: any, i: number, _v: number, own: any) => { const v = vals[i]!; return { ...own, h: hOf(v), color: heatAt(theme, v) }; } });
  };
  let hedgedKey = '';

  // ── the schedule strip: one bar an hour, discharge up in teal, charge down in #7f9cc0, 0.012 m a MW ─────────────
  const stripSeries = { days: ['schedule'], cells: Array.from({ length: 24 }, (_, h) => ({ j: 0, he: h + 1, rev: 0, gE: null, hedged: null })), evening: [18], lid: [[]], contracts: 0 };
  const strip: any = (makeField as any)(stripSeries, theme, grab, res, { dx: STRIP.dx, hz: FIELD.hz, block: STRIP.block, sheet: false, solidPits: false });
  strip.group.position.set(STRIP.x, FIELD.y + 0.02, FIELD.cz);
  atOrigin(strip, STRIP.x, FIELD.cz);
  strip.show({ bars: true, floor: true, sides: true, glass: false, tiles: false, gaps: false, path: false, outline: false });
  const teal = lin(PAL.teal), charge = lin(PAL.charge), floor = lin(T.floor);
  let stripKw: readonly number[] = new Array(24).fill(0);
  const layoutStrip = () => strip.layout({ place: (c: any, _i: number, _v: number, own: any) => { const v = (stripKw[c.he - 1] ?? 0) / 1000; return { ...own, h: v * STRIP.perMw, color: v > 0 ? teal : v < 0 ? charge : floor }; } });
  root.add(strip.group);

  // ── the glass, and the light under any pane the schedule does not back ─────────────────────────────────────────
  const glass = new LiveGlass(theme, grab, res, { cx: FIELD.cx, cz: FIELD.cz, floorY: FIELD.y, width: FIELD.dx * n, hz: FIELD.hz });
  root.add(glass.group);

  // ── the machine ────────────────────────────────────────────────────────────────────────────────────────────────
  const column = new Map(order.map((k, j) => [k, j] as const));
  const machine = buildMachine(stage.scene.environment, grab, res, {
    dial: 0, q: new Array(24).fill(0), sealLit: false, score: null, marks: o.marks, totals: new Float64Array(n), bins: new Int16Array(n), tail: new Set(),
    ghostHist: o.ghostHist, coinMove: 'snap', order,
    columnX: (k) => FIELD.cx + ((column.get(k) ?? 0) - (n - 1) / 2) * FIELD.dx,
  });
  root.add(machine.group);

  // the visitors at the console's rail, for scale: the kit's figure in plain dark clothes, no hard hat
  if (o.visitors) {
    const mats: any = createMaterials(THREE, theme);
    mats.m.vest.color.set('#2b3138'); mats.m.warnWhite.color.set('#2b3138'); mats.m.figure.color.set('#59616b'); mats.m.pants.color.set('#1f2328');
    mats.m.glove.color.set('#9a7861'); mats.m.hat.visible = false; mats.m.glass.color.set('#0e1114');
    mats.detail.value.x = (2 * Math.tan((30 * Math.PI) / 360)) / H;
    const spots: [number, number, number][] = [[-336.2, 235.9, 0.12], [-322.6, 236.3, -0.2], [-320.9, 236.0, 0.35]];
    for (const [x, z, r] of spots) {
      const f = buildFigure(THREE, mats); f.group.position.set(x, 0.12, z); f.group.rotation.y = r; root.add(f.group);
    }
    mats.farNormals(stage.gtao.normalMaterial);
  }

  // ── the Arcade's practicals: a warm pair over the plaza, the marquee's spill, the field's own glow on the brass ───
  const practical = (pos: Vec3, at: Vec3, cd: number, angle = 0.55) => {
    const s = new THREE.SpotLight('#ffcf8f', cd, 0, angle, 0.65, 2); s.position.set(...pos); s.target.position.set(...at);
    s.layers.enableAll(); root.add(s, s.target);
  };
  practical([-352, 30, 266], [-334, 4, 224], 2600);
  practical([-298, 30, 266], [-316, 4, 224], 2600);
  for (const x of [-339, -325, -311]) { const p = new THREE.PointLight('#ffcf8f', 45, 0, 2); p.position.set(x, 24, 194.5); p.layers.enableAll(); root.add(p); }
  // the tray lit from inside, a warm strip over the tubes
  for (let x = -350; x <= -300; x += 10) { const p = new THREE.PointLight('#ffe2b8', 2.6, 0, 2); p.position.set(x, 6.6, 221.9); p.layers.enableAll(); root.add(p); }
  // a warm pool on the plaza where the players stand
  practical([-325, 22, 252], [-325, 0, 238], 2400, 0.62);
  { const p = new THREE.PointLight('#a9c3e6', 240, 0, 2); p.position.set(FIELD.cx, FIELD.y + 7, FIELD.cz + 4); p.layers.enableAll(); root.add(p); }

  // ── the screens (DOM on their quads) ───────────────────────────────────────────────────────────────────────────
  screenStyles();
  const plane = document.createElement('div'); plane.className = 'dfx-screen dfx-plane';
  const marquee = document.createElement('div'); marquee.className = 'dfx-screen dfx-neon'; marquee.innerHTML = '<span>ONE PLAN</span>';
  const ticker = document.createElement('div'); ticker.className = 'dfx-screen dfx-ticker';
  const banner = document.createElement('div'); banner.className = 'dfx-screen dfx-banner';
  // the screen's CSS box keeps its quad's aspect (CAB.screen), the board on the left and the plane beside it
  const PH = 400, PW = Math.round((PH * (CAB.screen.x1 - CAB.screen.x0)) / (CAB.screen.y1 - CAB.screen.y0));
  overlay.append(plane, ticker, marquee, banner);

  let chaseStep = -1;
  const cab: Cabinet = {
    root, machine, glass, order, screens: { plane, marquee, ticker, banner, PW, PH },
    setPlan(view, t, move, ease = 0.45) {
      // the field: each cell of each column, eased from where it stands now
      for (let j = 0; j < n; j++) {
        const k = order[j]!;
        for (let h = 0; h < 24; h++) to[j * 24 + h] = view.cell(k, h) / 1e6;
      }
      if (move === 'snap' || ease <= 0) { now.set(to); from.set(to); easing = false; layoutField(now); }
      else { from.set(now); easeT0 = t; easeDur = ease; easing = true; }
      // the outline round the hedged hours, rebuilt when the set of hours changes
      const hedged = view.q.map((x, h) => (x !== 0 ? h + 1 : 0)).filter(Boolean);
      const key = hedged.join(',');
      if (key !== hedgedKey) { hedgedKey = key; field.buildOutline(() => hedged); field.show({ bars: true, floor: true, sides: true, glass: false, tiles: false, gaps: false, path: false, outline: hedged.length > 0 }); field.setOutline(hedged.length ? 1 : 0); }
      stripKw = view.kw.slice(); layoutStrip();
      const bars: GlassBar[] = [];
      view.q.forEach((q, h) => { if (q) bars.push({ he: h + 1, q, entryUsd: o.entryCents[h]! / 100, light: view.light[h] ?? 0 }); });
      glass.set(bars);
      machine.setDial(view.dial);
      machine.setPucks(view.q);
      machine.setScore(view.score);
      machine.setSeal(view.seal);
      machine.coins.set(view.totals, view.bins, view.tail, t, move, order);
    },
    update(t) {
      let moving = false;
      if (easing) {
        const u = Math.min(1, (t - easeT0) / easeDur), k = smooth(Math.max(0, u));
        for (let i = 0; i < N; i++) now[i] = from[i]! + (to[i]! - from[i]!) * k;
        layoutField(now);
        if (u >= 1) easing = false; else moving = true;
      }
      if (machine.coins.update(t)) moving = true;
      const step = Math.floor(t * 6);
      if (step !== chaseStep) { chaseStep = step; machine.chase(t); }
      return moving;
    },
    layoutScreens(project) {
      const A = machine.anchors;
      onQuad(plane, PW, PH, A.screen, project);
      onQuad(ticker, 1500, 50, A.ticker, project);
      onQuad(marquee, 2100, 200, A.marquee, project);
      onQuad(banner, 1100, 150, A.banner, project);
      return [quadRect(A.screen, project), quadRect(A.marquee, project), quadRect(A.banner, project), quadRect(A.ticker, project)];
    },
    cellTop(j, he) { const p = field.placedAt(j, he); const x = FIELD.cx + (j - (n - 1) / 2) * FIELD.dx; return [x, FIELD.y + Math.max(0, p ? p.h : 0), FIELD.cz + zOf(he, FIELD.hz)]; },
    glassAt(he, j, side = 'top') {
      const b = glass.bars.find((g) => g.he === he);
      if (!b) return null;
      const x = FIELD.cx + (j - (n - 1) / 2) * FIELD.dx;
      return side === 'top' ? [x, b.top, b.z] : [x, b.y, b.z + FIELD.hz * 0.48];
    },
    resize(w, h) { res.set(w, h); },
    dispose() {
      grab.dispose?.(); bloom.dispose(); field.dispose?.(); strip.dispose?.();
      for (const el of [plane, ticker, marquee, banner]) el.remove();
      stage.scene.remove(root);
    },
  };
  return cab;
}

/** A dollar value's height over the field's floor (world y). */
export const fieldY = (usd: number) => FIELD.y + hOf(usd);
export { CAB };
