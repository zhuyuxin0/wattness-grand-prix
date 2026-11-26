// ONE PLAN's model: a player's plan on a sealed day's field, checked against the battery's limits and scored with the
// engine's own accounting (packages/engine/src/accounting.ts: revenueUusd, cvarLoss, evaluate), in integers.
//
// A plan is a dial step and the glass. The dial blends the price-chasing schedule (arm A) into the co-optimized one
// (arm C), kW = round(((S - i) A + i C) / S) an hour, halves away from zero, as the engine rounds. The glass is whole
// contracts an hour, sold where the schedule discharges and bought where it charges, at most the hour's cap: the
// instrument's per-hour limit, or the scheduled MWh if lower (the plan's hedge cap, "schedule"). A and C never charge
// and discharge in the same hour, so each hour's direction is fixed along the dial, and every limit is linear in the
// schedule: each blend lies between two plans the engine accepted, inside the solver's 100 kWh margin. scheduleLimits
// checks it anyway on every step.
//
// The day total of scenario k is linear in the controls:
//   total_k = sum_h kw_h x unitKw[k][h] - max(0, kw_h) x wear + q_h x unitQ[k][h] - |q_h| x fee
// with unitKw = node cents x 10 and unitQ = (4 x entry - hub_sum4) x 2,500 (micro-USD), so a change re-scores 301 x 24
// products; the objective is floor(mean - lambda x CVaR) over the totals, as evaluate() computes it.

export type ArmId = 'A' | 'B' | 'C';
export const ARMS: readonly ArmId[] = ['A', 'B', 'C'];
export const HOURS = 24;
/** The dial's detents: 0 at A, DIAL_STEPS at C (every 0.05). */
export const DIAL_STEPS = 20;
const PPM = 1_000_000;

export interface Arm {
  id: ArmId;
  method: string;
  kw: readonly number[];
  contracts: readonly number[];
  expectedUusd: number;
  cvarUusd: number;
  objectiveUusd: number;
  collateralCents: number;
}

/** One sealed day's field: the battery, its limits, the instrument, the risk rule, the 301 scenarios and the arms. */
export interface Field {
  operatingDay: string;
  resource: string;
  name: string;
  settlementPoint: string;
  hub: string;
  n: number;
  powerKw: number;
  energyKwh: number;
  roundTripPpm: number;
  socMinPpm: number;
  socMaxPpm: number;
  socOpenPpm: number;
  socEndMinPpm: number;
  maxCyclesPpm: number;
  wearCentsPerMwh: number;
  entryCents: readonly number[];
  rangeCents: readonly [number, number];
  feeCentsPerContract: number;
  sizeKwh: number;
  maxContractsPerHour: number;
  collateralBudgetCents: number;
  alphaPpm: number;
  lambdaPpm: number;
  nodeCents: readonly (readonly number[])[];
  hubSum4: readonly (readonly number[])[];
  scenarioDigest: string;
  /** game.histogram's $250 bins (micro-USD edges). */
  edges: readonly number[];
  arms: Readonly<Record<ArmId, Arm>>;
  /** The record the field comes from: the agent's root, Desert Willow's leaf in it, the gate and the seal. */
  record: { root: string; leaf: string; leafPosition: number; leafCount: number; gateUnix: number; sealedUnix: number; agent: string; scopeLabel: string };
  /** Per scenario and hour, k x 24 + h: micro-USD for one kW over the hour (node cents x 10) and for one sold contract. */
  unitKw: Float64Array;
  unitQ: Float64Array;
}

const ints = (xs: unknown, what: string, len?: number): number[] => {
  if (!Array.isArray(xs) || (len != null && xs.length !== len)) throw new Error(`${what}: expected ${len ?? 'an'} array`);
  for (const x of xs) if (!Number.isSafeInteger(x)) throw new Error(`${what}: ${x} is not a safe integer`);
  return xs as number[];
};
const int = (x: unknown, what: string): number => { if (!Number.isSafeInteger(x)) throw new Error(`${what}: ${x} is not a safe integer`); return x as number; };

/** The field from the world's frame data (src/data/frame-data.json: showcase, game and sealed_day). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fieldFromFrameData(d: any): Field {
  const s = d?.showcase, g = d?.game, sd = d?.sealed_day;
  if (!s || !g || !sd) throw new Error('ONE PLAN needs frame data with showcase, game and sealed_day');
  const sc = s.scenarios, a = s.assumptions, ins = s.instrument;
  const n = int(sc.count, 'scenarios.count');
  if (sc.node_cents.length !== n || sc.hub_sum4.length !== n) throw new Error('scenarios: count does not match the matrix');
  const arm = (id: ArmId): Arm => {
    const x = s.arms[id];
    return {
      id, method: String(x.method), kw: ints(x.kw, `${id}.kw`, HOURS), contracts: ints(x.contracts, `${id}.contracts`, HOURS),
      expectedUusd: int(x.expected_uusd, `${id}.expected`), cvarUusd: int(x.cvar_uusd, `${id}.cvar`), objectiveUusd: int(x.objective_uusd, `${id}.objective`),
      collateralCents: int(x.collateral_cents, `${id}.collateral`),
    };
  };
  const receipt = (sd.receipts as any[]).find((r) => r.chain_id === 56) ?? sd.receipts[0];
  const f = {
    operatingDay: String(sd.operating_day), resource: String(s.resource), name: String(s.name), settlementPoint: String(s.settlement_point), hub: String(s.hub), n,
    powerKw: int(g.limits.power_kw, 'power_kw'), energyKwh: int(g.limits.energy_kwh, 'energy_kwh'),
    roundTripPpm: int(a.round_trip_ppm, 'round_trip_ppm'), socMinPpm: int(a.soc_min_ppm, 'soc_min_ppm'), socMaxPpm: int(a.soc_max_ppm, 'soc_max_ppm'),
    socOpenPpm: int(a.soc_open_ppm, 'soc_open_ppm'), socEndMinPpm: int(a.soc_end_min_ppm, 'soc_end_min_ppm'), maxCyclesPpm: int(a.max_cycles_ppm, 'max_cycles_ppm'),
    wearCentsPerMwh: int(a.wear_cents_per_mwh, 'wear'), entryCents: ints(ins.entry_cents, 'entry_cents', HOURS),
    rangeCents: ints(ins.range_cents, 'range_cents', 2) as unknown as [number, number], feeCentsPerContract: int(ins.fee_cents_per_contract, 'fee'),
    sizeKwh: int(ins.size_kwh, 'size_kwh'), maxContractsPerHour: int(a.max_contracts_per_hour, 'max_contracts_per_hour'),
    collateralBudgetCents: int(a.collateral_budget_cents, 'collateral_budget_cents'),
    alphaPpm: int(s.risk.alpha_ppm, 'alpha_ppm'), lambdaPpm: int(s.risk.lambda_ppm, 'lambda_ppm'),
    nodeCents: sc.node_cents.map((r: unknown, k: number) => ints(r, `node_cents[${k}]`, HOURS)),
    hubSum4: sc.hub_sum4.map((r: unknown, k: number) => ints(r, `hub_sum4[${k}]`, HOURS)),
    scenarioDigest: String(sc.digest_sha256), edges: ints(g.histogram.edges_uusd, 'histogram.edges'),
    arms: { A: arm('A'), B: arm('B'), C: arm('C') },
    record: {
      root: String(sd.root), leaf: String(s.leaf), leafPosition: int(s.leaf_position, 'leaf_position'), leafCount: int(sd.leaf_count, 'leaf_count'),
      gateUnix: int(sd.gate.unix, 'gate'), sealedUnix: int(receipt.block_time.unix, 'sealed'), agent: String(sd.agent.wallet), scopeLabel: String(sd.scope_label),
    },
  };
  if (f.sizeKwh !== 1000) throw new Error('the scorer assumes 1 MWh contracts');
  return withUnits(f);
}

function withUnits(f: Omit<Field, 'unitKw' | 'unitQ'>): Field {
  const unitKw = new Float64Array(f.n * HOURS), unitQ = new Float64Array(f.n * HOURS);
  for (let k = 0; k < f.n; k++) {
    const node = f.nodeCents[k]!, hub = f.hubSum4[k]!;
    for (let h = 0; h < HOURS; h++) {
      unitKw[k * HOURS + h] = node[h]! * 10;
      // q contracts of 1 MWh earn q x (entry - S), S = hub_sum4 / 4: in micro-USD q x (4 entry - hub_sum4) x 2,500
      unitQ[k * HOURS + h] = (4 * f.entryCents[h]! - hub[h]!) * 2500;
    }
  }
  return { ...f, unitKw, unitQ };
}

// ── the schedule ──────────────────────────────────────────────────────────────────────────────────────────────────

/** n / d rounded half away from zero (packages/engine/src/ints.ts roundDiv), for integer n and positive integer d. */
export function roundDiv(num: number, den: number): number {
  const q = Math.floor((2 * Math.abs(num) + den) / (2 * den));
  return num < 0 && q !== 0 ? -q : q; // never -0: a hashed document refuses it
}

/** The schedule at a dial step: whole kW an hour, discharge positive. */
export function scheduleAt(f: Field, step: number): number[] {
  if (!Number.isInteger(step) || step < 0 || step > DIAL_STEPS) throw new RangeError(`dial step ${step} is outside 0..${DIAL_STEPS}`);
  const A = f.arms.A.kw, C = f.arms.C.kw;
  return A.map((a, h) => roundDiv((DIAL_STEPS - step) * a + step * C[h]!, DIAL_STEPS));
}

/** Each hour's hedge direction along the whole dial: 1 sells (the schedule discharges), -1 buys (it charges), 0 none. */
export function directions(f: Field): number[] {
  const A = f.arms.A.kw, C = f.arms.C.kw;
  return A.map((a, h) => {
    const c = C[h]!;
    if (a !== 0 && c !== 0 && Math.sign(a) !== Math.sign(c)) throw new Error(`hour ${h}: A and C move energy in opposite directions; the dial cannot blend them`);
    return Math.sign(a + c);
  });
}

/** Each hour's cap in whole contracts at a schedule: the instrument's limit, or the scheduled MWh if lower. */
export function capsOf(f: Field, kw: readonly number[]): number[] {
  return kw.map((x) => Math.min(f.maxContractsPerHour, Math.floor(Math.abs(x) / f.sizeKwh)));
}

/** State of charge at the end of each hour, micro-kWh (losses on charging), as socPath computes it. */
export function socPath(f: Field, kw: readonly number[]): bigint[] {
  let soc = BigInt(f.energyKwh) * BigInt(f.socOpenPpm);
  return kw.map((x) => {
    soc += x < 0 ? BigInt(-x) * BigInt(f.roundTripPpm) : -BigInt(x) * BigInt(PPM);
    return soc;
  });
}

export interface ScheduleCheck {
  ok: boolean;
  problems: string[];
  socUkwh: bigint[];
  /** The closest the path comes to each limit, micro-kWh (negative where it crosses). */
  headroom: { floor: bigint; ceiling: bigint; close: bigint; cycles: bigint };
}

/** The battery's limits on a schedule, as the engine's checkLimits states them. */
export function scheduleLimits(f: Field, kw: readonly number[]): ScheduleCheck {
  const E = BigInt(f.energyKwh), lo = E * BigInt(f.socMinPpm), hi = E * BigInt(f.socMaxPpm), close = E * BigInt(f.socEndMinPpm), cap = E * BigInt(f.maxCyclesPpm);
  const soc = socPath(f, kw), problems: string[] = [];
  let floor = 1n << 62n, ceiling = 1n << 62n, discharged = 0n;
  kw.forEach((x, h) => {
    if (!Number.isSafeInteger(x)) problems.push(`hour ${h}: ${x} kW is not a whole number`);
    if (Math.abs(x) > f.powerKw) problems.push(`hour ${h}: power outside 0..${f.powerKw} kW`);
    const s = soc[h]!;
    if (s - lo < floor) floor = s - lo;
    if (hi - s < ceiling) ceiling = hi - s;
    if (s < lo || s > hi) problems.push(`hour ${h}: state of charge outside its limits`);
    if (x > 0) discharged += BigInt(x) * BigInt(PPM);
  });
  const end = soc[HOURS - 1]!;
  if (end < close) problems.push('closing state of charge below its floor');
  if (discharged > cap) problems.push('discharged energy above the cycle cap');
  return { ok: problems.length === 0, problems, socUkwh: soc, headroom: { floor, ceiling, close: end - close, cycles: cap - discharged } };
}

// ── the glass ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** A player's plan: the dial's step and the glass, whole contracts an hour, sold positive and bought negative. */
export interface PlayerPlan { step: number; glass: readonly number[] }

export interface Fitted {
  kw: number[];
  caps: number[];
  /** The contracts the schedule backs: the glass, each hour cut to its cap. */
  q: number[];
  /** Per hour, how much of the glass the schedule does not deliver, 0..1 (the light: hedged, not delivered). */
  short: number[];
  /** Any glass over its cap: the plan cannot be sealed as it stands. */
  lit: boolean;
}

/** The plan's schedule, its caps, and its glass cut to what the schedule delivers. */
export function fit(f: Field, plan: PlayerPlan, dir = directions(f)): Fitted {
  const kw = scheduleAt(f, plan.step), caps = capsOf(f, kw);
  const q = new Array<number>(HOURS).fill(0), short = new Array<number>(HOURS).fill(0);
  let lit = false;
  for (let h = 0; h < HOURS; h++) {
    const g = plan.glass[h] ?? 0;
    if (!Number.isSafeInteger(g)) throw new Error(`hour ${h}: glass ${g} is not whole contracts`);
    if (g === 0) continue;
    if (Math.sign(g) !== dir[h]) throw new Error(`hour ${h}: glass ${g} runs against the hour's schedule`);
    const m = Math.abs(g);
    q[h] = Math.min(m, caps[h]!) === 0 ? 0 : dir[h]! * Math.min(m, caps[h]!);
    const backed = Math.max(0, dir[h]! * kw[h]!), need = m * f.sizeKwh;
    if (need > backed || m > caps[h]!) { lit = true; short[h] = Math.max(0, need - backed) / need; }
  }
  return { kw, caps, q, short, lit };
}

/** The light's weight under an hour's glass (the storyboard's 0.1 + 0.9 shortfall^1.5; 0 where it is delivered). */
export const lightWeight = (short: number) => (short > 0 ? 0.1 + 0.9 * Math.pow(short, 1.5) : 0);

export function collateralCents(f: Field, q: readonly number[]): number {
  const [lo, hi] = f.rangeCents;
  let c = 0;
  for (let h = 0; h < HOURS; h++) { const x = q[h] ?? 0; c += x > 0 ? (hi - f.entryCents[h]!) * x : x < 0 ? (f.entryCents[h]! - lo) * -x : 0; }
  return c;
}

/** Every limit the engine's checkLimits applies to a schedule and a hedge; empty when the plan is within them. */
export function planLimits(f: Field, kw: readonly number[], q: readonly number[]): string[] {
  const out = scheduleLimits(f, kw).problems;
  for (let h = 0; h < HOURS; h++) {
    const x = q[h] ?? 0;
    if (!Number.isSafeInteger(x)) out.push(`hour ${h}: contracts are not whole`);
    if (Math.abs(x) > f.maxContractsPerHour) out.push(`hour ${h}: more than ${f.maxContractsPerHour} contracts`);
    const covered = x >= 0 ? Math.max(0, kw[h]!) : Math.max(0, -kw[h]!);
    if (Math.abs(x) * f.sizeKwh > covered) out.push(`hour ${h}: hedge larger than the scheduled energy`);
  }
  if (collateralCents(f, q) > f.collateralBudgetCents) out.push('collateral above the budget');
  return out;
}

// ── the score ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Score {
  /** Each scenario's day total, micro-USD. */
  totals: Float64Array;
  /** floor(sum / n), CVaR of loss at alpha (floored), floor(mean - lambda x CVaR): micro-USD. */
  mean: number;
  cvar: number;
  objective: number;
  losing: number;
  worst: number;
  best: number;
  collateralCents: number;
  /** Each scenario's $250 bin (clamped into the end bins), the counts, and how many fell past either end. */
  bin: Int16Array;
  hist: number[];
  under: number;
  over: number;
  /** The tail: the worst whole scenarios and the boundary one, with weights in ppm of a scenario. */
  tail: { k: number; weightPpm: number }[];
}

const floorDivBig = (a: bigint, b: bigint) => { const q = a / b; return a % b !== 0n && (a < 0n) !== (b < 0n) ? q - 1n : q; };
const safe = (x: number, what: string) => { if (!Number.isSafeInteger(x)) throw new Error(`${what} overflows a safe integer`); return x; };

/** Each scenario's day total for a schedule and contracts, micro-USD. */
export function dayTotals(f: Field, kw: readonly number[], q: readonly number[], out = new Float64Array(f.n)): Float64Array {
  let fixed = 0;
  for (let h = 0; h < HOURS; h++) fixed -= Math.max(0, kw[h]!) * f.wearCentsPerMwh * 10 + Math.abs(q[h]!) * f.feeCentsPerContract * 10000;
  for (let k = 0; k < f.n; k++) {
    let t = fixed;
    const o = k * HOURS;
    for (let h = 0; h < HOURS; h++) t += kw[h]! * f.unitKw[o + h]! + q[h]! * f.unitQ[o + h]!;
    out[k] = safe(t, `scenario ${k}'s total`);
  }
  return out;
}

/** One scenario's hour, micro-USD (the field's cell): energy at the node, wear, the hedge and its fee. */
export function cellUusd(f: Field, kw: readonly number[], q: readonly number[], k: number, h: number): number {
  const x = kw[h]!, c = q[h]!;
  return x * f.unitKw[k * HOURS + h]! - Math.max(0, x) * f.wearCentsPerMwh * 10 + c * f.unitQ[k * HOURS + h]! - Math.abs(c) * f.feeCentsPerContract * 10000;
}

/** The planner's objective over the scenarios, as evaluate() computes it (mean, cvarLoss, objective, all floored). */
export function scoreTotals(f: Field, totals: Float64Array, q: readonly number[]): Score {
  const n = f.n;
  let sum = 0n;
  for (let k = 0; k < n; k++) sum += BigInt(totals[k]!);
  const mean = floorDivBig(sum, BigInt(n));
  // cvarLoss: losses worst first; the tail holds n x (1 - alpha) scenario weights, the boundary one taken in part
  const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => totals[a]! - totals[b]! || a - b);
  const tailPpm = BigInt(n) * BigInt(PPM - f.alphaPpm);
  if (tailPpm <= 0n) throw new Error('alpha leaves no tail');
  let left = tailPpm, acc = 0n;
  const tail: { k: number; weightPpm: number }[] = [];
  for (const k of order) {
    if (left === 0n) break;
    const w = left < BigInt(PPM) ? left : BigInt(PPM);
    acc += w * -BigInt(totals[k]!);
    left -= w;
    tail.push({ k, weightPpm: Number(w) });
  }
  const cvar = floorDivBig(acc, tailPpm);
  const objective = floorDivBig(mean * BigInt(PPM) - BigInt(f.lambdaPpm) * cvar, BigInt(PPM));
  const lo = f.edges[0]!, step = f.edges[1]! - f.edges[0]!, bins = f.edges.length - 1;
  const bin = new Int16Array(n), hist = new Array<number>(bins).fill(0);
  let under = 0, over = 0, losing = 0, worst = Infinity, best = -Infinity;
  for (let k = 0; k < n; k++) {
    const t = totals[k]!;
    const b = Math.floor((t - lo) / step);
    if (b < 0) under++; else if (b >= bins) over++;
    bin[k] = Math.max(0, Math.min(bins - 1, b));
    hist[bin[k]!]!++;
    if (t < 0) losing++;
    if (t < worst) worst = t;
    if (t > best) best = t;
  }
  return {
    totals, mean: Number(mean), cvar: Number(cvar), objective: Number(objective), losing, worst, best,
    collateralCents: collateralCents(f, q), bin, hist, under, over, tail,
  };
}

export function score(f: Field, kw: readonly number[], q: readonly number[]): Score {
  return scoreTotals(f, dayTotals(f, kw, q), q);
}

/** A plan scored as the player sees it: the schedule, the glass that fits, the score, the limits it keeps. */
export interface Played extends Fitted { score: Score; limits: string[] }

export function play(f: Field, plan: PlayerPlan, dir = directions(f)): Played {
  const fitted = fit(f, plan, dir);
  return { ...fitted, score: score(f, fitted.kw, fitted.q), limits: planLimits(f, fitted.kw, fitted.q) };
}

/** A sealed arm as a player's plan, when the dial can reach its schedule (A and B at step 0, C at the last step). */
export function armPlan(f: Field, id: ArmId): PlayerPlan {
  const step = id === 'C' ? DIAL_STEPS : 0;
  const kw = scheduleAt(f, step);
  if (kw.some((x, h) => x !== f.arms[id].kw[h])) throw new Error(`arm ${id}'s schedule is not on the dial`);
  return { step, glass: f.arms[id].contracts.slice() };
}

/** The glass that fits the schedule exactly: each hour cut to its cap (turns the light out). */
export function fitGlass(f: Field, plan: PlayerPlan): PlayerPlan {
  return { step: plan.step, glass: fit(f, plan).q };
}

// ── money ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Micro-USD as dollars to the cent (rounded half away from zero), the minus sign typeset. */
export function usd(uusd: number, { sign = false, whole = false } = {}): string {
  const cents = roundDiv(uusd, 10000), neg = cents < 0, a = Math.abs(cents);
  const body = whole ? `$${Math.round(a / 100).toLocaleString('en-US')}` : `$${Math.floor(a / 100).toLocaleString('en-US')}.${String(a % 100).padStart(2, '0')}`;
  return `${neg ? '−' : sign && cents > 0 ? '+' : ''}${body}`;
}

/** Cents as dollars to the cent. */
export const usdCents = (cents: number) => usd(cents * 10000);

/** An hour's names: its CT clock on the 24-hour clock first ("09:00–10:00"), the market's hour ending second. */
export function hourName(h: number): { clock: string; he: string } {
  const hh = (x: number) => `${String(x).padStart(2, '0')}:00`;
  return { clock: `${hh(h)}–${hh(h + 1)}`, he: `HE${String(h + 1).padStart(2, '0')}` };
}
