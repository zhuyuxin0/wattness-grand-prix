// ONE PLAN, the Arena's machine: the Hedging walkthrough's field, glass and light made a coin-op game on Desert
// Willow's sealed day (frame-data.json game and showcase). Five frames: A, no hedge (X01); B, glass on A's fixed
// schedule (X02); the meet, the schedule moving under C's glass (X03); C, the sealed plan (X04); and play (X05). The
// playable game is src/game (mountOnePlan), on the same cabinet.
import type { FrameContext, StationModule } from '../types';
import { inFilm, yours } from '../../lib/yours';
import { CAB, onePlanFrame, glassAt, type SceneHandles } from './scene';
import { armCells, blendKw, checks, gameData, lightWeight, money, scorePlan, selfCheck, type GameData, type Scored } from './plan';
import type { Vec3 } from '../../lib/stage';
import type { PlaneMark } from './screens';

const SCOPE = "Desert Willow (DSWL_ESS_ESR1), operating day Nov 26. The plan's own 301 scenarios; the hedge at an assumed fair-value entry: a comparison, never a trade.";
const cam = (c: { target: Vec3; az: number; el: number; dist: number; vfov: number; shift: [number, number] }) => ({ ...c });

const losing = (s: Scored, n: number) => `${s.losing} of ${n} days lose money`;

function setup(ctx: FrameContext) {
  const d = ctx.needData();
  const G = gameData(d);
  const bad = selfCheck(G);
  if (bad.length) throw new Error(`ONE PLAN: the sealed arms do not re-derive: ${bad.join('; ')}`);
  return { d, G };
}

/** The scored rest of a sealed arm, from game.results' own parts. */
function rest(G: GameData, arm: 'A' | 'B' | 'C') {
  const cells = armCells(G, arm), s = scorePlan(G, G.arms[arm]);
  return { cells, s };
}

const tailSet = (s: Scored) => new Set(s.tail.map((t) => t.k));
// the site's arm colors at their dark values (site/src/styles/tokens.css --arm-a, --arm-b, --arm-c): the stage holds dark
const SWATCH = { A: '#2c60de', B: '#d95926', C: '#9085e9' } as const;
const board = (title: string, arm: 'A' | 'B' | 'C' | null, s: Scored | null, foot: string, sealed = false) =>
  ({ title, swatch: arm ? SWATCH[arm] : null, sealed, mean: s ? s.mean / 1e6 : null, worst: s ? -s.cvar / 1e6 : null, score: s ? s.objective / 1e6 : null, foot });

function trayTicks(ctx: FrameContext, h: SceneHandles) {
  const marks = [-3750, 0, 5000, 10000, 17000].map((v) => ({ at: h.anchors.trayTick(v), text: `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US')}` }));
  return ctx.plates.ticks('tray', marks, 'hwalk-tick');
}

function chrome(ctx: FrameContext, head: string, line: string, scope: boolean, width?: number) {
  const sc = scope ? ctx.plates.scope(SCOPE) : null;
  let cap = ctx.plates.caption({ head, line });
  const el = ctx.plates.root.querySelector<HTMLElement>('.hwalk-cap');
  if (width && el) {
    // a frame whose caption sits over empty floor takes a wider one, so its head keeps to one line
    el.style.maxWidth = `${width}px`;
    const a = el.getBoundingClientRect(), b = ctx.plates.root.getBoundingClientRect();
    cap = { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
  }
  return [cap, sc].filter(Boolean) as { x: number; y: number; w: number; h: number }[];
}

const planeMarks = (G: GameData, rests: Record<'A' | 'B' | 'C', Scored>, state: Partial<Record<'A' | 'B' | 'C', PlaneMark['state']>>): PlaneMark[] =>
  (['A', 'B', 'C'] as const).filter((a) => state[a]).map((a) => ({ arm: a, wt: -rests[a].cvar / 1e6, mean: rests[a].mean / 1e6, score: rests[a].objective / 1e6, state: state[a]! }));

function tickerFor(d: any): string {
  const r = d.sealed_day.receipts[0], late = d.sealed_day.late_seal.attempts[0];
  const ct = String(r.block_time.ct).split(' ')[1];
  return `<span><b>SEALED</b> ${ct} CT \u00b7 ${Number(r.seconds_before_gate).toLocaleString('en-US')} s before the gate</span><span class="dot">\u25cf</span>`
    + `<span class="bad">LATE SEAL REFUSED \u00b7 ${String(late.refused_with).split('(')[0]}</span>`;
}

/** The banner over the backbox: the day's best sealed plan, plain words first, the racing word (P1) after them. */
export function bannerFor(G: GameData, d: any, full = false): string {
  const best = money(G.arms.C.sealed.objective_uusd);
  if (!full) return `<span class="lead">Best sealed plan</span><span class="num">${best}</span><span class="p1">P1</span>`;
  const w = String(d.sealed_day.agent.wallet), t = String(d.sealed_day.receipts[0].block_time.ct).split(' ')[1];
  return `<span class="col"><span class="row"><span class="lead">Best sealed plan</span><span class="num">${best}</span><span class="p1">P1</span></span><span class="sub">the record wallet (${w.slice(0, 6).toLowerCase()}\u2026${w.slice(-4).toLowerCase()}) \u00b7 ${t} CT</span></span>`;
}

async function x01(ctx: FrameContext) {
  const { d, G } = setup(ctx);
  const A = rest(G, 'A'), B = rest(G, 'B'), C = rest(G, 'C');
  const rests = { A: A.s, B: B.s, C: C.s };
  return onePlanFrame(ctx, G, {
    // the storyboard's pose (az 172, el 24, 108 m) hid the trench behind HE08's ridge and put the console under the
    // caption: higher and further back, the whole machine above and right of the caption, the visitors clear of it
    camera: cam({ target: [-325, 14, 206], az: 168, el: 37, dist: 152, vfov: 30, shift: [0.08, 0.12] }),
    cells: A.cells, kw: G.arms.A.kw, q: G.arms.A.q, light: new Array(24).fill(0),
    machine: { dial: 0, sealLit: false, score: A.s.objective / 1e6, marks: {}, totals: A.s.totals, bins: A.s.bin, tail: tailSet(A.s) },
    plane: { marks: planeMarks(G, rests, { A: 'lit' }), player: null, inset: false },
    board: board('No hedge (A)', 'A', A.s, losing(A.s, G.n)),
    banner: bannerFor(G, d), ticker: tickerFor(d), visitors: true, time: 8.0,
    note: `Real: every bar is arm A's own accounting for that scenario and hour (game.results.A physical + hedge + wear + fee, frame-data.json), and every coin its day total in its exact $250 bin (game.histogram); the figures (mean, worst tenth, score, ${A.s.losing} losing days) re-derive to the micro-dollar from the parts and from the engine's formula on showcase.scenarios. Illustrative: the column order (sorted by A's day total, worst west), the coins' resting order inside a tube, the bulbs' chase and the visitors. The marquee carries the cabinet's name, ONE PLAN. The attract-mode pour runs in the playable game (src/game); here it is a still.`,
    plates(ctx, h) {
      chrome(ctx, 'ONE PLAN', "Desert Willow's sealed day as a field: 301 price scenarios across, 24 hours deep. Each column's coin is that day's total.", true);
      h.key([{ kind: 'ramp', text: 'Blue earned · red paid' }, { kind: 'none', text: 'Height: dollars in the hour (compressed scale)' }, { kind: 'coin', text: "Coin: one scenario's day · columns: worst to best without a hedge" }], 'left');
      trayTicks(ctx, h);
    },
  });
}

export const frames: StationModule['frames'] = {
  // ── X01 · No hedge: the bumpy day and a wide pile ─────────────────────────────────────────────────────────────
  'game.X01': async (ctx) => x01(ctx),
  // ── X02 · Glass on a fixed schedule: the rows draw together ───────────────────────────────────────────────────
  'game.X02': async (ctx) => {
    const { d, G } = setup(ctx);
    const A = rest(G, 'A'), B = rest(G, 'B'), C = rest(G, 'C');
    const rests = { A: A.s, B: B.s, C: C.s };
    const ck = checks(G, G.arms.B);
    return onePlanFrame(ctx, G, {
      // the storyboard's pose (80 m, el 38) left the tray under the caption: back and up, the field over the pile, the
      // marquee and scoreboard whole at the top and the pulled pucks right of the caption
      camera: cam({ target: [-320, 10, 207], az: 166, el: 36, dist: 120, vfov: 30, shift: [0.1, 0] }),
      cells: B.cells, kw: G.arms.B.kw, q: G.arms.B.q, light: ck.short.map(lightWeight),
      machine: { dial: 0, sealLit: false, score: B.s.objective / 1e6, marks: { a: A.s.objective / 1e6 }, totals: B.s.totals, bins: B.s.bin, tail: tailSet(B.s) },
      plane: { marks: planeMarks(G, rests, { A: 'ghost', B: 'lit' }), player: null, inset: false },
      board: board('Hedge on a fixed schedule (B)', 'B', B.s, `${losing(B.s, G.n)} \u00b7 collateral ${money(B.s.collateralCents * 10000)}`),
      banner: bannerFor(G, d), ticker: tickerFor(d), visitors: false, time: 8.0,
      note: `Real: arm B's sealed plan (A's schedule, ${G.arms.B.q.filter((x) => x).length} hedged hours) as game.results.B gives it, every cell and coin; each glass bar's height is its contracts at the hour's assumed entry (game.hedge.entry_cents), its thickness its contract count. No light: B's contracts never exceed A's scheduled MWh (checked). Illustrative: the column order. Motion, not shown in the still: the pour and the coins' hops.`,
      plates(ctx, h) {
        const keep = chrome(ctx, 'Glass on a fixed schedule', "A hedge on a fixed schedule (B): A's schedule, unchanged. Each glass bar is one hour's contracts at its assumed entry; under it, that hour's results draw together.", true);
        const key = h.key([{ kind: 'glass', text: 'Glass: contracts at the assumed entry; thicker: more contracts' }, { kind: 'orange', text: "Orange, dashed: the contract's hours" }], 'left');
        const q = G.arms.B.q, e = G.entryCents;
        const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
        ctx.plates.leaders([
          { id: 'he18', text: `HE18 · sell ${q[17]} at ${usd(e[17]!)}`, at: glassAt(h, 18, 250), priority: 1 },
          { id: 'he11', text: `HE11 · buy ${-q[10]!} at ${usd(e[10]!)}`, at: glassAt(h, 11, 40, 'front'), priority: 2 },
        ], { keepOut: [...keep, key, ...h.screens], max: 4 });
      },
    });
  },

  // ── X03 · The meet: the schedule moves under the glass ────────────────────────────────────────────────────────
  'game.X03': async (ctx) => {
    const { d, G } = setup(ctx);
    const S = 0.35;
    const plan = { kw: blendKw(G, S), q: G.arms.C.q };
    const sc = scorePlan(G, plan), ck = checks(G, plan);
    const A = rest(G, 'A'), B = rest(G, 'B'), C = rest(G, 'C');
    const rests = { A: A.s, B: B.s, C: C.s };
    const he10 = Math.max(0, -plan.kw[9]!) / 1000;
    return onePlanFrame(ctx, G, {
      // higher than the storyboard's 22 deg, which hid the trench behind HE08; the dial below the frame, not cut by its edge
      camera: cam({ target: [-334, 8.5, 210], az: 210, el: 31, dist: 60, vfov: 30, shift: [0.1, 0.08] }),
      cells: sc.cells, kw: plan.kw, q: plan.q, light: ck.short.map(lightWeight),
      machine: { dial: S, sealLit: false, score: null, marks: {}, totals: sc.totals, bins: sc.bin, tail: tailSet(sc) },
      plane: { marks: planeMarks(G, rests, { A: 'ghost', B: 'ghost' }), player: null, inset: false },
      board: board('', null, null, ''),
      banner: bannerFor(G, d), ticker: tickerFor(d), visitors: false, time: 8.0,
      note: `A drawn in-between, not a plan: the schedule at s = ${S} (0.65 x A's kW + 0.35 x C's, whole kW) under C's contracts, each cell from the engine's formula on showcase.scenarios (game.scoring_a_new_plan). It breaks the hedge cap at HE10 (buys 17, the schedule charges ${he10.toFixed(1)} MWh), which is what the light marks (weight 0.1 + 0.9 shortfall^1.5 = ${lightWeight(ck.short[9]!).toFixed(2)}); HE06 is met (its light went out at s = 0.23). No figure prints, as the storyboard says. The sealed C was solved in one program, not in these two steps: this path is a teaching route between two real plans.`,
      plates(ctx, h) {
        const keep = chrome(ctx, 'One plan: schedule and hedge chosen together', "C's glass does not fit A's schedule: light shows contracts the schedule would not deliver. The schedule moves under the glass until the light goes out.", false, 1000);
        const key = h.key([{ kind: 'light', text: 'Light: hedged, not delivered' }]);
        const q = plan.q;
        ctx.plates.leaders([
          { id: 'he06', text: `HE06 · sell ${q[5]} · met`, at: glassAt(h, 6, 26), priority: 0 },
          { id: 'he10', text: `HE10 · buy ${-q[9]!} · charging ${he10.toFixed(1)} MWh`, at: glassAt(h, 10, 70), priority: 1 },
        ], { keepOut: [...keep, key, ...h.screens], max: 3 });
      },
    });
  },

  // ── X04 · Chosen together: the sealed plan ───────────────────────────────────────────────────────────────────
  'game.X04': async (ctx) => {
    const { d, G } = setup(ctx);
    const A = rest(G, 'A'), B = rest(G, 'B'), C = rest(G, 'C');
    const rests = { A: A.s, B: B.s, C: C.s };
    const ck = checks(G, G.arms.C);
    const sealedAt = String(d.sealed_day.receipts[0].block_time.ct).split(' ')[1];
    return onePlanFrame(ctx, G, {
      // the whole machine above and right of the caption, the seal button and the tower clear of the plates
      camera: cam({ target: [-322, 14, 206], az: 156, el: 36, dist: 150, vfov: 30, shift: [0.06, 0.11] }),
      cells: C.cells, kw: G.arms.C.kw, q: G.arms.C.q, light: ck.short.map(lightWeight),
      machine: { dial: 1, sealLit: true, score: C.s.objective / 1e6, marks: { a: A.s.objective / 1e6, b: B.s.objective / 1e6, p1: C.s.objective / 1e6 }, totals: C.s.totals, bins: C.s.bin, tail: tailSet(C.s) },
      plane: { marks: planeMarks(G, rests, { A: 'lit', B: 'lit', C: 'sealed' }), player: null, inset: true },
      board: board('Schedule and hedge together (C)', 'C', C.s, `${losing(C.s, G.n)} \u00b7 worst day ${money(C.s.worst)} \u00b7 collateral ${money(C.s.collateralCents * 10000)}`, true),
      banner: bannerFor(G, d), ticker: tickerFor(d), visitors: true, time: 8.0,
      note: `Real: C is the sealed plan under root ${String(d.sealed_day.root).slice(0, 6)}…${String(d.sealed_day.root).slice(-4)} (BSC mainnet tx at ${sealedAt} CT); every cell, coin and figure re-derives to the micro-dollar from game.results.C and from the engine's formula. The plane's marks are the three solved arms (not a frontier). Unlike the Terminal walkthrough's beat 7, which is labeled an illustration, this rest is the sealed result itself. Illustrative: the column order, the bulbs and the visitors.`,
      plates(ctx, h) {
        const keep = chrome(ctx, 'Chosen together: the sealed plan',
          `Schedule and hedge solved as one plan (C). It gives up ${money(A.s.mean - C.s.mean)} of mean against A and lifts the worst tenth from a ${money(A.s.cvar)} loss to a ${money(-C.s.cvar)} gain.`, true);
        const key = h.key([{ kind: 'none', text: "Score: mean − 0.5 × the worst tenth's average loss" }, { kind: 'diag', text: 'Diagonals: equal score' }], 'left');
        const scr = h.anchors.screen, tw = CAB.tower;
        const tower = h.rect([[tw.x - 1.8, tw.y1 + 2.4, tw.z], [tw.x + 1.8, tw.y1 + 2.4, tw.z], [tw.x + 1.8, 0, tw.z + 1.8], [tw.x - 1.8, 0, tw.z + 1.8]], 12);
        ctx.plates.leaders([
          { id: 'plane', text: `A ${money(A.s.objective)} · B ${money(B.s.objective)} · C ${money(C.s.objective)}, sealed ${sealedAt} CT`, at: [scr[0][0] + 0.4, (scr[0][1] + scr[3][1]) / 2, scr[0][2]], priority: 1 },
        ], { keepOut: [...keep, key, tower], avoid: h.screens, max: 4 });
      },
    });
  },

  // ── X05 · Your turn: the dial, the glass and the best-plan banner ───────────────────────────────────────────────────
  'game.X05': async (ctx) => {
    const { d, G } = setup(ctx);
    const A = rest(G, 'A'), B = rest(G, 'B'), C = rest(G, 'C');
    const rests = { A: A.s, B: B.s, C: C.s };
    const plan = { kw: G.arms.C.kw, q: G.arms.C.q.map((x, h) => (h === 17 ? 100 : x)) };
    const ck = checks(G, plan);
    if (!ck.maxOk || !ck.capOk || !ck.budgetOk) throw new Error('X05: the player plan breaks a limit');
    const P = scorePlan(G, plan);
    const behind = C.s.objective - P.objective;
    const progress = (P.objective - A.s.objective) / (C.s.objective - A.s.objective);
    return onePlanFrame(ctx, G, {
      // back far enough to keep the best-plan banner and the console in frame, the machine left of the seal panel
      camera: cam({ target: [-322, 11.5, 210], az: 177, el: 30, dist: 104, vfov: 38, shift: [-0.08, 0.08] }),
      cells: P.cells, kw: plan.kw, q: plan.q, light: ck.short.map(lightWeight),
      machine: { dial: 1, sealLit: false, score: P.objective / 1e6, marks: { a: A.s.objective / 1e6, b: B.s.objective / 1e6, p1: C.s.objective / 1e6 }, totals: P.totals, bins: P.bin, tail: tailSet(P), ghostHist: C.s.hist },
      plane: { marks: planeMarks(G, rests, { A: 'ghost', B: 'ghost', C: 'sealed' }), player: { wt: -P.cvar / 1e6, mean: P.mean / 1e6 }, inset: true },
      board: board('Your plan', null, P, `${losing(P, G.n)} \u00b7 ${money(behind)} behind the best sealed plan`),
      banner: bannerFor(G, d, true), ticker: tickerFor(d), visitors: false, time: 8.0,
      note: `Real today: the scoring and every limit check. This plan (C's schedule and contracts with HE18 sold at 100) is a real what-if computed exactly with the engine's integer formula on showcase.scenarios: mean ${money(P.mean)}, worst tenth ${money(-P.cvar)}, score ${money(P.objective)}, ${P.losing} losing days, collateral ${money(P.collateralCents * 10000)}, within every limit. The seal flow is built (src/game, mountOnePlan): the visitor's own wallet commits a one-leaf record under the arena scope to GateRecord on BSC testnet, refused for any other chain and after the day's gate. Not built yet: the next day's scenario set published before its gate, and the scoring of arena seals after settlement; this still shows the panel's design. Nov 26's gate closed on Nov 25 at 10:00 CT.`,
      plates(ctx, h) {
        const keep = chrome(ctx, 'Your turn', "Turn the dial to move the schedule; drag glass onto hours to hedge. The score is the planner's own.", false);
        // the seal panel, on glass at the right
        const panel = document.createElement('div'); panel.className = 'dfx-panel';
        // the field's gate has passed: the panel says what was sealed for the day, as the Markets tab's seal card does,
        // with the reader's own clock beside CT (a film prints CT alone)
        const r0 = d.sealed_day.receipts[0], at = yours(Number(r0.block_time.unix), { date: true, seconds: true, film: inFilm(ctx.plates.root) });
        panel.innerHTML = `<h4><span class="btn"></span>Sealed before the gate · BNB Chain</h4><div class="state">Desert Willow's plan for Nov 26, plan C, was sealed Nov 25, ${String(r0.block_time.ct).split(' ')[1]}&nbsp;CT${at ? ` (${at})` : ''}, ${Number(r0.seconds_before_gate).toLocaleString('en-US')}&nbsp;s before the gate. Your score is measured against it.</div>`;
        Object.assign(panel.style, { right: '96px', top: '380px' });
        ctx.plates.root.appendChild(panel);
        const pr = panel.getBoundingClientRect(), rr = ctx.plates.root.getBoundingClientRect();
        const panelRect = { x: pr.left - rr.left, y: pr.top - rr.top, w: pr.width, h: pr.height };
        // the console mirrored in DOM under it: the dial's value and each hedged hour's contracts with its cap (whole
        // contracts the hour's scheduled MWh back, at most the instrument's 100); the hour the player changed is ringed
        const sgn = (x: number) => `${x > 0 ? '+' : '−'}${Math.abs(x)}`;
        const capOf = (hh: number) => {
          const kw = plan.kw[hh]!, q = plan.q[hh]!;
          return Math.min(G.maxContracts, Math.floor((q > 0 ? Math.max(0, kw) : Math.max(0, -kw)) / 1000));
        };
        const hud = document.createElement('div'); hud.className = 'dfx-hud';
        const cells = plan.q.map((q, hh) => (q ? `<div class="cell${q !== G.arms.C.q[hh] ? ' on' : ''}"><span class="he">HE${String(hh + 1).padStart(2, '0')}</span>`
          + `<span class="q">${sgn(q)}</span><span class="cap">cap ${capOf(hh)}</span>${q !== G.arms.C.q[hh] ? `<span class="was">C ${sgn(G.arms.C.q[hh]!)}</span>` : ''}</div>` : '')).join('');
        hud.innerHTML = `<div class="dial"><span>Schedule dial</span><b>at C (1.00)</b></div><div class="lab">Glass: contracts an hour, sold + and bought −</div><div class="cells">${cells}</div>`;
        Object.assign(hud.style, { right: '96px', top: `${Math.round(panelRect.y + panelRect.h + 14)}px`, width: `${Math.round(panelRect.w)}px` });
        ctx.plates.root.appendChild(hud);
        const ur = hud.getBoundingClientRect();
        const hudRect = { x: ur.left - rr.left, y: ur.top - rr.top, w: ur.width, h: ur.height };
        const sx = CAB.console.seal;
        const seal = h.rect([[sx[0] - 2.2, sx[1] + 1.2, sx[2] - 1.4], [sx[0] + 2.2, sx[1] + 1.2, sx[2] - 1.4], [sx[0] + 2.2, sx[1] - 0.4, sx[2] + 1.6], [sx[0] - 2.2, sx[1] - 0.4, sx[2] + 1.6]], 10);
        ctx.plates.leaders([
          { id: 'progress', text: `No hedge → best sealed plan (P1): ${(progress * 100).toFixed(1)}%`, at: h.anchors.towerAt(P.objective / 1e6), priority: 1 },
          { id: 'cap', text: `HE18 · sell up to ${capOf(17)} · schedule ${Math.max(0, plan.kw[17]!) / 1000} MWh`, at: h.anchors.puckAt[17]!, priority: 2 },
        ], { keepOut: [...keep, panelRect, hudRect, seal, ...h.screens], max: 4 });
      },
    });
  },
};
