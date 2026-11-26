// One ONE PLAN storyboard frame: the cabinet (cabinet.ts) posed at one plan, its screens filled, and the frame's
// plates laid out against the posed camera.
import type { CameraPose, Vec3 } from '../../lib/stage';
import type { FrameContext, FrameHandle } from '../types';
import type { Plate } from '../../lib/plates';
import { heatGradient } from '../../lib/heat';
import { buildCabinet, CAB, FIELD, fieldY } from './cabinet';
import type { MachineState } from './machine';
import { boardHtml, planeSvg, quadRect, type Board, type PlaneMark } from './screens';
import { columnOrder, type GameData } from './plan';

export interface OnePlanSpec {
  camera: CameraPose;
  /** The plan drawn: each scenario's 24 hours (micro-dollars), its schedule (kW) and contracts. */
  cells: readonly (readonly number[])[];
  kw: readonly number[];
  q: readonly number[];
  /** Each hour's light weight (0 where the schedule delivers its contracts). */
  light: readonly number[];
  machine: Omit<MachineState, 'q'>;
  plane: { marks: PlaneMark[]; player: { wt: number; mean: number } | null; inset: boolean };
  board: Board;
  banner: string;
  ticker: string;
  visitors: boolean;
  time: number;
  note: string;
  plates(ctx: FrameContext, s: SceneHandles): void;
}

export interface SceneHandles {
  G: GameData;
  anchors: ReturnType<typeof buildCabinet>['machine']['anchors'];
  glassBars: { he: number; y: number; top: number; bottom: number; z: number; t: number }[];
  /** The field's world point for a column and hour, at the cell's height. */
  cellTop(j: number, he: number): Vec3;
  /** Rects the plates keep off (the screens). */
  screens: { x: number; y: number; w: number; h: number }[];
  key(rows: KeyRow[], at?: 'left' | 'right'): { x: number; y: number; w: number; h: number };
  /** The screen box round world points, padded (CSS px), for keeping plates off a part of the machine. */
  rect(points: readonly Vec3[], pad?: number): { x: number; y: number; w: number; h: number };
  order: number[];
}

export type KeyRow = { kind: 'ramp'; text: string } | { kind: 'glass' | 'light' | 'orange' | 'coin' | 'none' | 'diag' | 'teal'; text: string };

let keyStyled = false;
function keyStyles() {
  if (keyStyled) return; keyStyled = true;
  const s = document.createElement('style');
  s.textContent = `
.dfx-key { gap: 10px; }
.dfx-key .row { display: flex; align-items: center; justify-content: flex-end; gap: 0; color: #c9ced3; }
.dfx-key .ramp { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.dfx-key .sw-coin { width: 14px !important; height: 14px !important; border-radius: 50% !important; background: radial-gradient(circle at 40% 38%, #5ea1ea 0 52%, #b8935a 56% 100%); }
.dfx-key .sw-diag { background: transparent; border-top: 2px dashed #969ca3; height: 0 !important; vertical-align: 4px !important; transform: rotate(-14deg); }
.dfx-key .sw-light { background: #ffe3ad !important; box-shadow: 0 0 10px rgba(255, 227, 173, 0.65); }
.intro-plate .hwalk-plate-sub { white-space: pre-line; }
.hwalk.is-x .hwalk-cap { max-width: 740px; }
.dfx-hud { position: absolute; z-index: 30; box-sizing: border-box; padding: 16px 18px 16px; border-radius: 16px; color: #e6e8ea;
  background: var(--glass-surface); -webkit-backdrop-filter: blur(14px) saturate(1.4); backdrop-filter: blur(14px) saturate(1.4);
  box-shadow: 0 0 0 1px var(--glass-graze), var(--glass-rim), var(--glass-depth); font: 500 14px/1.3 var(--w-font-sans); }
.dfx-hud .lab { color: #969ca3; font: 500 13px/1.2 var(--w-font-sans); letter-spacing: 0.02em; margin: 0 0 9px; }
.dfx-hud .dial { display: flex; align-items: baseline; justify-content: space-between; gap: 18px; margin-bottom: 14px; color: #c9ced3; font-size: 15px; }
.dfx-hud .dial b { font: 600 15px/1 var(--t-font-code); font-variant-numeric: tabular-nums; color: #f6f7f8; }
.dfx-hud .cells { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.dfx-hud .cell { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 8px 2px 7px; border-radius: 9px; background: rgba(255, 255, 255, 0.04);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08); }
.dfx-hud .cell.on { box-shadow: inset 0 0 0 1.5px #2ec7a6; background: rgba(46, 199, 166, 0.08); }
.dfx-hud .cell .he { font: 500 12px/1 var(--w-font-sans); color: #969ca3; }
.dfx-hud .cell .q { font: 600 19px/1 var(--t-font-code); font-variant-numeric: tabular-nums; color: #f6f7f8; }
.dfx-hud .cell .cap { white-space: nowrap; font: 500 11.5px/1 var(--t-font-code); font-variant-numeric: tabular-nums; color: #969ca3; }
.dfx-hud .cell .was { font: 500 11.5px/1 var(--t-font-code); font-variant-numeric: tabular-nums; color: #2ec7a6; }
.dfx-key.left .ramp i { width: 150px !important; }
.dfx-panel { position: absolute; z-index: 30; box-sizing: border-box; width: 500px; padding: 20px 22px 18px; border-radius: 16px; color: #e6e8ea;
  background: var(--glass-surface); -webkit-backdrop-filter: blur(14px) saturate(1.4); backdrop-filter: blur(14px) saturate(1.4);
  box-shadow: 0 0 0 1px var(--glass-graze), var(--glass-rim), var(--glass-depth); font: 400 15px/1.4 var(--w-font-sans); }
.dfx-panel h4 { margin: 0 0 10px; font: 600 22px/1.2 var(--t-font-display); color: #f6f7f8; display: flex; align-items: center; gap: 12px; }
.dfx-panel .btn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; box-shadow: inset 0 0 0 3px #F0B90B; opacity: 0.45; }
.dfx-panel .state { color: #c9ced3; font-size: 15px; }
`;
  document.head.appendChild(s);
}

export async function onePlanFrame(ctx: FrameContext, G: GameData, spec: OnePlanSpec): Promise<FrameHandle> {
  const { stage, theme } = ctx;
  const W = ctx.width * ctx.dpr, H = ctx.height * ctx.dpr;
  const order = columnOrder(G);
  const cab = buildCabinet(stage, theme, ctx.overlay, W, H, {
    n: G.n, order, entryCents: G.entryCents, marks: spec.machine.marks, ghostHist: spec.machine.ghostHist, visitors: spec.visitors,
  });
  cab.setPlan({
    cell: (k, h) => spec.cells[k]![h]!, kw: spec.kw, q: spec.q, light: spec.light, totals: spec.machine.totals, bins: spec.machine.bins, tail: spec.machine.tail,
    dial: spec.machine.dial, score: spec.machine.score, seal: spec.machine.sealLit ? 'sealed' : 'dark',
  }, 0, 'snap');
  keyStyles();
  const { plane, ticker, banner, PW, PH } = cab.screens;
  ticker.innerHTML = spec.ticker;
  banner.innerHTML = spec.banner;
  plane.innerHTML = `${boardHtml(spec.board)}<div class="chart">${planeSvg(PW - 540, PH, spec.plane.marks, spec.plane.player, spec.plane.inset)}</div>`;

  const project = (p: Vec3) => ctx.plates.project(p);
  const handles: SceneHandles = {
    G, anchors: cab.machine.anchors, glassBars: cab.glass.bars, order, screens: [],
    cellTop: (j, he) => cab.cellTop(j, he),
    key(rows, at = 'right') {
      const el = document.createElement('div'); el.className = 'hwalk-key dfx-key';
      if (at === 'left') { el.classList.add('left'); Object.assign(el.style, { left: '96px', right: 'auto', maxWidth: '430px', justifyItems: 'start', textAlign: 'left' }); }
      for (const r of rows) {
        if (r.kind === 'ramp') {
          const d = document.createElement('div'); d.className = 'ramp';
          d.innerHTML = `<span class="bar"><i style="background:${heatGradient(theme)}"></i><b>0</b></span><span>${r.text}</span>`;
          el.appendChild(d); continue;
        }
        const d = document.createElement('div'); d.className = 'row';
        if (r.kind !== 'none') { const sw = document.createElement('span'); sw.className = `sw sw-${r.kind === 'orange' ? 'orange' : r.kind}`; d.appendChild(sw); }
        d.appendChild(document.createTextNode(r.text)); el.appendChild(d);
      }
      ctx.plates.root.appendChild(el);
      const a = el.getBoundingClientRect(), b = ctx.plates.root.getBoundingClientRect();
      return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
    },
    rect(points, pad = 8) {
      const r = quadRect(points as Vec3[], project);
      return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
    },
  };

  return {
    time: spec.time,
    steps: 30,
    settle: 3,
    note: spec.note,
    update(t) {
      stage.setCamera(spec.camera);
      cab.update(t);
    },
    decorate() {
      handles.screens = cab.layoutScreens(project);
      spec.plates(ctx, handles);
    },
    dispose() { cab.dispose(); },
  };
}

/** A leader plate's anchor on a glass bar: its top at column j. */
export function glassAt(s: SceneHandles, he: number, j: number, side: 'top' | 'front' = 'top'): Vec3 {
  const b = s.glassBars.find((g) => g.he === he)!;
  const x = FIELD.cx + (j - (s.order.length - 1) / 2) * FIELD.dx;
  return side === 'top' ? [x, b.top, b.z] : [x, b.y, b.z + FIELD.hz * 0.48];
}

export { FIELD, CAB, fieldY };
export type { Plate };
