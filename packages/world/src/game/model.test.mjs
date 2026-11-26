// ONE PLAN's scorer against the engine. At the three arms' own settings every scenario's day total, every hour's cell,
// the mean, the CVaR, the objective and the collateral equal the sealed record (frame-data.json game.results and
// showcase.arms, the engine's own output) to the micro-dollar; on every dial step and on hundreds of other plans they
// equal packages/engine's evaluate() and revenueUusd(), run here from source; and every plan the game lets a player
// make passes the engine's checkLimits, while glass over its cap is refused by both.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkLimits, evaluate, revenueUusd, socPath as engineSocPath } from '../../../engine/src/accounting.ts';
import { DEFAULT_ASSUMPTIONS, DEFAULT_RISK } from '../../../engine/src/types.ts';
import { canonicalJson as coreCanonicalJson } from '../../../core/src/jcs.ts';
import { fileSha256 } from '../../../core/src/hash.ts';
import {
  ARMS, DIAL_STEPS, HOURS, armPlan, capsOf, cellUusd, directions, fieldFromFrameData, fit, fitGlass, play, scheduleAt, scheduleLimits, score,
} from './model.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dataPath = resolve(here, '../data/frame-data.json');
if (!existsSync(dataPath)) throw new Error('src/data/frame-data.json is missing: run scripts/sync-data.sh');
const d = JSON.parse(readFileSync(dataPath, 'utf8'));
const F = fieldFromFrameData(d);
const fixture = resolve(here, '../../../../fixtures/od-20261126/leaves');
const dir = directions(F);

// the engine's view of the same day
const battery = { resource: F.resource, settlementPoint: F.settlementPoint, hub: F.hub, zone: 'LZ_NORTH', county: null, maxPowerKw: F.powerKw, energyKwh: F.energyKwh, source: { route: '', sha256: '' } };
const assumptions = { ...DEFAULT_ASSUMPTIONS, roundTripPpm: F.roundTripPpm, socMinPpm: F.socMinPpm, socMaxPpm: F.socMaxPpm, socOpenPpm: F.socOpenPpm, socEndMinPpm: F.socEndMinPpm, maxCyclesPpm: F.maxCyclesPpm, wearCentsPerMwh: F.wearCentsPerMwh, maxContractsPerHour: F.maxContractsPerHour, collateralBudgetCents: F.collateralBudgetCents, hedgeCap: 'schedule' };
const risk = { ...DEFAULT_RISK, alphaPpm: F.alphaPpm, lambdaPpm: F.lambdaPpm };
const scenarios = F.nodeCents.map((nodeCents, k) => ({ historyDay: '', basisDay: '', nodeCents: [...nodeCents], hubSum4: [...F.hubSum4[k]] }));
const schedule = (kw) => ({ chargeKw: kw.map((x) => Math.max(0, -x)), dischargeKw: kw.map((x) => Math.max(0, x)) });
const engine = (kw, q) => evaluate(battery, assumptions, risk, schedule(kw), [...q], F.entryCents, scenarios);

/** The page's score of a plan equals the engine's, field for field and scenario by scenario. */
function sameAsEngine(kw, q) {
  const mine = score(F, kw, q), theirs = engine(kw, q);
  expect(mine.mean).toBe(theirs.expectedUusd);
  expect(mine.cvar).toBe(theirs.cvarUusd);
  expect(mine.objective).toBe(theirs.objectiveUusd);
  expect(mine.collateralCents).toBe(theirs.collateralCents);
  for (let k = 0; k < F.n; k++) {
    const r = revenueUusd(assumptions, schedule(kw), [...q], F.entryCents, scenarios[k]);
    if (BigInt(mine.totals[k]) !== r) throw new Error(`scenario ${k}: ${mine.totals[k]} vs the engine's ${r}`);
  }
  return mine;
}

// a seeded generator for the sweep (no Math.random: the run is the same every time)
let seed = 0x5eed;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

describe('the field', () => {
  it('is the sealed scenario set: the matrix in frame-data.json is the fixture byte for byte and hashes to the leaf digest', () => {
    const m = JSON.parse(readFileSync(resolve(fixture, 'DSWL_ESS_ESR1.scenarios.json'), 'utf8'));
    expect(m.node_cents).toEqual(F.nodeCents.map((r) => [...r]));
    expect(m.hub_sum4).toEqual(F.hubSum4.map((r) => [...r]));
    expect(fileSha256(coreCanonicalJson(m))).toBe(F.scenarioDigest);
    const leaf = JSON.parse(readFileSync(resolve(fixture, 'DSWL_ESS_ESR1.json'), 'utf8'));
    expect(leaf.scenarios.digest_sha256).toBe(F.scenarioDigest);
    expect(leaf.instrument.entry_cents).toEqual([...F.entryCents]);
    for (const a of ARMS) {
      expect(leaf.arms[a].kw).toEqual([...F.arms[a].kw]);
      expect(leaf.arms[a].contracts).toEqual([...F.arms[a].contracts]);
      expect(leaf.arms[a].objective_uusd).toBe(F.arms[a].objectiveUusd);
    }
  });

  it('fixes each hour\'s direction along the dial: A and C never move energy opposite ways', () => {
    expect(dir.filter((x) => x !== 0).length).toBe(8);
    for (let i = 0; i <= DIAL_STEPS; i++) scheduleAt(F, i).forEach((x, h) => { if (x !== 0) expect(Math.sign(x)).toBe(dir[h]); });
  });
});

describe('the dial', () => {
  it('reaches A at 0 and C at the last step', () => {
    expect(scheduleAt(F, 0)).toEqual([...F.arms.A.kw]);
    expect(scheduleAt(F, DIAL_STEPS)).toEqual([...F.arms.C.kw]);
  });

  it('keeps the battery\'s limits at the extremes and halfway, with the engine\'s own state of charge', () => {
    for (const i of [0, DIAL_STEPS / 2, DIAL_STEPS]) {
      const kw = scheduleAt(F, i), c = scheduleLimits(F, kw);
      expect(c.problems).toEqual([]);
      expect(c.socUkwh).toEqual(engineSocPath(battery, assumptions, schedule(kw)));
      // inside the solver's 100 kWh margin, give or take the rounding to whole kW
      for (const v of Object.values(c.headroom)) expect(v > 0n).toBe(true);
      expect(() => checkLimits(battery, assumptions, schedule(kw), new Array(HOURS).fill(0), F.entryCents)).not.toThrow();
      const lo = c.headroom.floor, hi = c.headroom.ceiling, end = c.headroom.close;
      console.log(`dial ${i}/${DIAL_STEPS}: state of charge stays ${Number(lo) / 1e6} kWh above its floor and ${Number(hi) / 1e6} kWh under its ceiling, and closes ${Number(end) / 1e6} kWh over its closing floor`);
    }
  });

  it('keeps them on every step, the glass at every hour\'s cap included', () => {
    for (let i = 0; i <= DIAL_STEPS; i++) {
      const kw = scheduleAt(F, i), caps = capsOf(F, kw), q = caps.map((c, h) => c * dir[h]);
      expect(scheduleLimits(F, kw).ok).toBe(true);
      expect(() => checkLimits(battery, assumptions, schedule(kw), q, F.entryCents)).not.toThrow();
    }
  });
});

describe('the score', () => {
  it('matches the sealed record to the micro-dollar at the three arms\' own settings', () => {
    const lines = [];
    for (const a of ARMS) {
      const plan = armPlan(F, a), p = play(F, plan), r = d.game.results[a], arm = F.arms[a];
      expect(p.lit).toBe(false);
      expect(p.limits).toEqual([]);
      expect(p.q).toEqual([...arm.contracts]);
      expect(p.score.mean).toBe(arm.expectedUusd);
      expect(p.score.cvar).toBe(arm.cvarUusd);
      expect(p.score.objective).toBe(arm.objectiveUusd);
      expect(p.score.collateralCents).toBe(arm.collateralCents);
      expect(Array.from(p.score.totals)).toEqual(r.total_uusd);
      expect(p.score.hist).toEqual(d.game.histogram.counts[a]);
      expect(p.score.losing).toBe(r.stats_uusd.scenarios_below_zero);
      expect(p.score.worst).toBe(r.stats_uusd.min);
      for (let k = 0; k < F.n; k++) for (let h = 0; h < HOURS; h++) {
        const parts = r.physical_uusd[k][h] + r.hedge_uusd[k][h] + r.wear_uusd[h] + r.fee_uusd[h];
        if (cellUusd(F, p.kw, p.q, k, h) !== parts) throw new Error(`${a}: scenario ${k} hour ${h}`);
      }
      // the tail's members, worst first, are the record's (the 31st at a tenth)
      expect(p.score.tail.map((t) => t.k)).toEqual(r.tail.members.map((m) => m.k));
      expect(p.score.tail.map((t) => t.weightPpm)).toEqual(r.tail.members.map((m) => m.weight_ppm));
      sameAsEngine(p.kw, p.q);
      lines.push(`${a}: mean ${p.score.mean}, CVaR ${p.score.cvar}, objective ${p.score.objective} micro-USD, as sealed`);
    }
    console.log(lines.join('\n'));
  });

  it('matches the engine on every dial step, bare and at full glass', () => {
    for (let i = 0; i <= DIAL_STEPS; i++) {
      const kw = scheduleAt(F, i), caps = capsOf(F, kw);
      sameAsEngine(kw, new Array(HOURS).fill(0));
      sameAsEngine(kw, caps.map((c, h) => c * dir[h]));
    }
  });

  it('matches the engine on 300 random plans within the caps, and every one is within the limits', () => {
    for (let r = 0; r < 300; r++) {
      const step = Math.floor(rnd() * (DIAL_STEPS + 1)), kw = scheduleAt(F, step), caps = capsOf(F, kw);
      const glass = caps.map((c, h) => dir[h] * Math.floor(rnd() * (c + 1)) * (rnd() < 0.3 ? 0 : 1));
      const p = play(F, { step, glass });
      expect(p.lit).toBe(false);
      expect(p.limits).toEqual([]);
      sameAsEngine(p.kw, p.q);
    }
  });

  it('cuts glass over its cap to what the schedule delivers, lights it, and the engine refuses the uncut glass', () => {
    // C's glass on A's schedule: HE06 sells 13 against 2.1 MWh, HE10 buys 17 against none (X03)
    const plan = { step: 0, glass: [...F.arms.C.contracts] };
    const p = fit(F, plan);
    expect(p.lit).toBe(true);
    expect(p.q[5]).toBe(2);
    expect(p.q[9]).toBe(0);
    expect(p.short[9]).toBe(1);
    expect(() => checkLimits(battery, assumptions, schedule(p.kw), [...plan.glass], F.entryCents)).toThrow(/hedge larger than the scheduled energy/);
    expect(() => checkLimits(battery, assumptions, schedule(p.kw), p.q, F.entryCents)).not.toThrow();
    expect(fit(F, fitGlass(F, plan)).lit).toBe(false);
    // HE10's light stays on until the last step: 17 contracts need 17 MWh of charging, the dial's 0.95 gives 16.28
    for (let i = 0; i < DIAL_STEPS; i++) expect(fit(F, { step: i, glass: [...F.arms.C.contracts] }).short[9] > 0).toBe(true);
    expect(fit(F, { step: DIAL_STEPS, glass: [...F.arms.C.contracts] }).lit).toBe(false);
  });

  it('can beat the planner: whole contracts on C\'s schedule that score above the sealed C', () => {
    // found by coordinate ascent from C over the hedged hours, whole contracts within each cap
    const glass = new Array(HOURS).fill(0);
    Object.assign(glass, { 5: 14, 7: 34, 9: -17, 10: -71, 11: -100, 12: -14, 17: 95 });
    const p = play(F, { step: DIAL_STEPS, glass });
    expect(p.lit).toBe(false);
    expect(p.limits).toEqual([]);
    const e = sameAsEngine(p.kw, p.q);
    expect(e.objective).toBeGreaterThan(F.arms.C.objectiveUusd);
    console.log(`beat the planner: ${e.objective} against C's ${F.arms.C.objectiveUusd} micro-USD (+${e.objective - F.arms.C.objectiveUusd})`);
  });
});
