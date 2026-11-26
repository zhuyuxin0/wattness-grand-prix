// ONE PLAN's figures for the storyboard frames. A plan is a schedule (whole kW an hour, discharge positive) and contracts (whole contracts an
// hour, sold positive); it is scored on Desert Willow's 301 scenarios with the engine's own integer accounting, as
// frame-data.json game.scoring_a_new_plan states it:
//   cell[k][h] = (d - c) x node_cents[k][h] x 10 - d x 200 x 10 + q x (4 x entry - hub_sum4[k][h]) x 2,500 - |q| x 350,000
// in micro-dollars, then mean = floor(sum / 301), CVaR over the worst 30.1 scenario weights (30 whole, the 31st at a
// tenth), score = floor(mean - lambda x CVaR). The three sealed arms are re-derived here and checked against
// game.results to the micro-dollar before anything is drawn.

export interface Plan {
  /** Whole kW an hour (kWh over the hour): discharge positive, charge negative. Hours are CT hour-starting 0..23. */
  readonly kw: readonly number[];
  /** Whole contracts an hour: sold positive, bought negative. */
  readonly q: readonly number[];
}

export interface Scored {
  /** Each scenario's 24 hours, micro-dollars. */
  readonly cells: readonly (readonly number[])[];
  /** Each scenario's day total, micro-dollars. */
  readonly totals: readonly number[];
  readonly mean: number;
  /** Mean loss over the worst tenth (negative when even the worst tenth gains). */
  readonly cvar: number;
  readonly objective: number;
  readonly losing: number;
  readonly worst: number;
  readonly collateralCents: number;
  /** Count per $250 bin, game.histogram.edges_uusd. */
  readonly hist: readonly number[];
  /** Each scenario's bin. */
  readonly bin: readonly number[];
  /** The tail: the 30 worst scenarios whole and the 31st at a tenth, worst first. */
  readonly tail: readonly { k: number; weight: number }[];
}

export interface GameData {
  readonly n: number;
  readonly entryCents: readonly number[];
  readonly nodeCents: readonly (readonly number[])[];
  readonly hubSum4: readonly (readonly number[])[];
  readonly edges: readonly number[];
  readonly lambdaPpm: number;
  readonly wearCents: number;
  readonly feeCents: number;
  readonly rangeCents: readonly [number, number];
  readonly maxContracts: number;
  readonly budgetCents: number;
  /** game.histogram.counts, per arm. */
  readonly counts: Readonly<Record<'A' | 'B' | 'C', readonly number[]>>;
  readonly arms: Readonly<Record<'A' | 'B' | 'C', Plan & { readonly sealed: any; readonly results: any }>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function gameData(d: any): GameData {
  const g = d.game, s = d.showcase, sc = s.scenarios;
  const arm = (k: 'A' | 'B' | 'C') => ({ kw: s.arms[k].kw as number[], q: s.arms[k].contracts as number[], sealed: s.arms[k], results: g.results[k] });
  return {
    n: sc.count, entryCents: g.hedge.entry_cents, nodeCents: sc.node_cents, hubSum4: sc.hub_sum4, edges: g.histogram.edges_uusd,
    lambdaPpm: g.objective.lambda_ppm, wearCents: g.limits.wear_cents_per_mwh, feeCents: g.hedge.fee_cents_per_contract,
    rangeCents: g.hedge.range_cents, maxContracts: g.hedge.max_contracts_per_hour, budgetCents: g.hedge.collateral_budget_cents,
    counts: g.histogram.counts,
    arms: { A: arm('A'), B: arm('B'), C: arm('C') },
  };
}

const floorDiv = (a: bigint, b: bigint) => { const q = a / b; return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q; };

/** One hour of one scenario, micro-dollars. */
export function cellUusd(G: GameData, plan: Plan, k: number, h: number): number {
  const kw = plan.kw[h] ?? 0, q = plan.q[h] ?? 0;
  const d = Math.max(0, kw), c = Math.max(0, -kw);
  return (d - c) * G.nodeCents[k]![h]! * 10 - d * G.wearCents * 10 + q * (4 * G.entryCents[h]! - G.hubSum4[k]![h]!) * 2500 - Math.abs(q) * G.feeCents * 10000;
}

export function collateralCents(G: GameData, q: readonly number[]): number {
  const [lo, hi] = G.rangeCents;
  let c = 0;
  for (let h = 0; h < 24; h++) { const x = q[h] ?? 0; c += x > 0 ? (hi - G.entryCents[h]!) * x : x < 0 ? (G.entryCents[h]! - lo) * -x : 0; }
  return c;
}

/** Scores a plan from its cells (micro-dollars, [k][h]). */
export function scoreCells(G: GameData, cells: readonly (readonly number[])[], q: readonly number[]): Scored {
  const n = cells.length;
  const totals = cells.map((row) => row.reduce((a, b) => a + b, 0));
  let sum = 0n;
  for (const t of totals) sum += BigInt(t);
  const mean = Number(floorDiv(sum, BigInt(n)));
  // the worst first; ties by the lower scenario index (the CVaR does not depend on it)
  const order = totals.map((t, k) => k).sort((a, b) => totals[a]! - totals[b]! || a - b);
  const whole = Math.floor(n / 10), part = n % 10; // 301: 30 whole, the 31st at a tenth
  let tenTimes = 0n;
  for (let i = 0; i < whole; i++) tenTimes += 10n * BigInt(-totals[order[i]!]!);
  tenTimes += BigInt(part) * BigInt(-totals[order[whole]!]!);
  const cvar = Number(floorDiv(tenTimes, BigInt(n)));
  const objective = Number(floorDiv(BigInt(mean) * 1000000n - BigInt(G.lambdaPpm) * BigInt(cvar), 1000000n));
  const lo = G.edges[0]!, step = G.edges[1]! - G.edges[0]!, bins = G.edges.length - 1;
  const bin = totals.map((t) => Math.max(0, Math.min(bins - 1, Math.floor((t - lo) / step))));
  const hist = new Array(bins).fill(0);
  for (const b of bin) hist[b]++;
  const tail = order.slice(0, whole + (part ? 1 : 0)).map((k, i) => ({ k, weight: i < whole ? 1 : part / 10 }));
  return {
    cells, totals, mean, cvar, objective, losing: totals.filter((t) => t < 0).length, worst: Math.min(...totals),
    collateralCents: collateralCents(G, q), hist, bin, tail,
  };
}

export function scorePlan(G: GameData, plan: Plan): Scored {
  const cells: number[][] = [];
  for (let k = 0; k < G.n; k++) { const row: number[] = []; for (let h = 0; h < 24; h++) row.push(cellUusd(G, plan, k, h)); cells.push(row); }
  return scoreCells(G, cells, plan.q);
}

/** A sealed arm's cells as game.results gives them (physical + hedge + wear + fee). */
export function armCells(G: GameData, arm: 'A' | 'B' | 'C'): number[][] {
  const r = G.arms[arm].results;
  const out: number[][] = [];
  for (let k = 0; k < G.n; k++) { const row: number[] = []; for (let h = 0; h < 24; h++) row.push(r.physical_uusd[k][h] + r.hedge_uusd[k][h] + r.wear_uusd[h] + r.fee_uusd[h]); out.push(row); }
  return out;
}

/** The schedule between A's and C's at s (0 A, 1 C), whole kW an hour. */
export function blendKw(G: GameData, s: number): number[] {
  const a = G.arms.A.kw, c = G.arms.C.kw;
  return a.map((x, h) => Math.round((1 - s) * x + s * c[h]!));
}

/** The plan's limit checks that bear on the picture: contracts per hour, the hedge capped by the schedule, the budget. */
export function checks(G: GameData, plan: Plan) {
  const out = { maxOk: true, capOk: true, budgetOk: true, short: new Array<number>(24).fill(0) };
  for (let h = 0; h < 24; h++) {
    const q = plan.q[h] ?? 0, kw = plan.kw[h] ?? 0;
    if (Math.abs(q) > G.maxContracts) out.maxOk = false;
    // contracts are 1 MWh each: a sold contract needs 1,000 kWh of the hour's discharge, a bought one of its charge
    const backed = q > 0 ? Math.max(0, kw) : q < 0 ? Math.max(0, -kw) : 0;
    const need = Math.abs(q) * 1000;
    if (need > backed) { out.capOk = false; out.short[h] = (need - backed) / need; }
  }
  out.budgetOk = collateralCents(G, plan.q) <= G.budgetCents;
  return out;
}

/** "Light: hedged, not delivered": its weight under an hour's glass, 0 where the schedule delivers the contracts. */
export const lightWeight = (short: number) => (short > 0 ? 0.1 + 0.9 * Math.pow(short, 1.5) : 0);

/** Columns west to east: the scenarios sorted by arm A's day total, worst first (ties by index). */
export function columnOrder(G: GameData): number[] {
  const t: number[] = G.arms.A.results.total_uusd;
  return t.map((_, k) => k).sort((a, b) => t[a]! - t[b]! || a - b);
}

/** Checks every sealed arm re-derives exactly: cells, totals, mean, CVaR, score, histogram, collateral. Returns the
 *  failures (empty when all hold). */
export function selfCheck(G: GameData): string[] {
  const bad: string[] = [];
  for (const arm of ['A', 'B', 'C'] as const) {
    const a = G.arms[arm], r = a.results, st = r.stats_uusd;
    const fromParts = scoreCells(G, armCells(G, arm), a.q);
    const fromPlan = scorePlan(G, a);
    for (let k = 0; k < G.n; k++) {
      if (fromParts.totals[k] !== r.total_uusd[k]) { bad.push(`${arm}: total ${k} from parts`); break; }
      if (fromPlan.totals[k] !== r.total_uusd[k]) { bad.push(`${arm}: total ${k} from the formula`); break; }
    }
    for (let k = 0; k < G.n && !bad.length; k++) for (let h = 0; h < 24; h++) if (fromPlan.cells[k]![h] !== fromParts.cells[k]![h]) { bad.push(`${arm}: cell ${k},${h}`); break; }
    if (fromPlan.mean !== st.mean) bad.push(`${arm}: mean ${fromPlan.mean} vs ${st.mean}`);
    if (fromPlan.cvar !== st.cvar) bad.push(`${arm}: cvar ${fromPlan.cvar} vs ${st.cvar}`);
    if (fromPlan.objective !== st.objective) bad.push(`${arm}: objective ${fromPlan.objective} vs ${st.objective}`);
    if (fromPlan.losing !== st.scenarios_below_zero) bad.push(`${arm}: losing`);
    if (fromPlan.worst !== st.min) bad.push(`${arm}: worst`);
    if (fromPlan.collateralCents !== a.sealed.collateral_cents) bad.push(`${arm}: collateral`);
    if (fromPlan.hist.some((c, i) => c !== G.counts[arm][i])) bad.push(`${arm}: histogram`);
  }
  return bad;
}

const usd2 = (uusd: number) => {
  const c = Math.round(uusd / 10000), neg = c < 0, a = Math.abs(c);
  return `${neg ? '−' : ''}$${Math.floor(a / 100).toLocaleString('en-US')}.${String(a % 100).padStart(2, '0')}`;
};
/** Micro-dollars as dollars to the cent, the minus sign typeset. */
export const money = usd2;
/** Whole dollars, the minus sign typeset. */
export const moneyWhole = (uusd: number) => { const v = Math.round(uusd / 1e6); return `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US')}`; };
