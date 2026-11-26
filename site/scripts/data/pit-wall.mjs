// Pit wall data: one desk file per battery (all three arms, the node price
// outlook, each arm's expected revenue split into its parts, and whether the
// weather rule was applied to its plan), plus the terms every plan of the day
// shares: the Cournot reading among them, the rule's settings, and each hub's
// stress bucket (every battery at a hub shares its hub scenarios, so its
// bucket). Written to public/data/pit-wall/, with the Cournot response the
// leaves commit copied byte for byte (public/data/cournot/).
//
// The parts of expected revenue are recomputed here from the sealed leaf and
// its scenarios, under the scenario weights the leaf records (equal, or the
// weather rule's when its Cournot reading was applied), and the build stops if
// they do not add up to the leaf's own expected_uusd, so the page never shows a
// split the plan does not support.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HOURS = 24;
const ARMS = ["A", "B", "C"];
const dollars = (uusd) => Math.round(uusd / 1e4) / 100;

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function nodeBands(paths) {
  const out = { p05: [], p25: [], p75: [], p95: [] };
  for (let h = 0; h < HOURS; h++) {
    const col = paths.map((p) => p[h]).sort((x, y) => x - y);
    for (const [k, q] of [["p05", 0.05], ["p25", 0.25], ["p75", 0.75], ["p95", 0.95]]) out[k].push(Math.round(quantile(col, q)));
  }
  return out;
}

const PPM = 1_000_000;

/**
 * The scenario weights a leaf was planned under: null for equal weights, or the
 * weather rule's integer weights when its Cournot reading was applied. Mirrors
 * packages/core/src/weather.ts (stressBucket, scenarioWeights) on the rule the
 * leaf records, and stops unless the bucket is the one the leaf names.
 */
function weightsOf(m, sc) {
  const c = m.outside_inputs?.cournot;
  if (!c || c.status !== "applied" || !c.after) return null;
  const { stress_hours: hours, stress_share: [num, den] } = c.rule;
  const n = sc.history_days.length;
  const basis = sc.basis_days.length;
  const rows = sc.hub_sum4;
  if (rows.length !== n * basis) throw new Error(`pit-wall: ${m.battery.resource}: ${rows.length} scenarios, not ${n} x ${basis}`);
  const scores = sc.history_days.map((day, i) => {
    const first = rows[i * basis];
    for (let b = 1; b < basis; b++) {
      if (rows[i * basis + b].some((v, h) => v !== first[h])) throw new Error(`pit-wall: ${m.battery.resource}: history day ${day} carries two hub paths`);
    }
    return { day, i, score: hours.reduce((s, h) => s + first[h], 0) };
  });
  const k = Math.ceil((n * num) / den);
  const ranked = [...scores].sort((a, b) => b.score - a.score || (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const chosen = new Set(ranked.slice(0, k).map((s) => s.i));
  const flags = rows.map((_, r) => chosen.has(Math.floor(r / basis)));
  const days = sc.history_days.filter((_, i) => chosen.has(i));
  const inBucket = flags.filter(Boolean).length;
  if (days.join() !== c.stress.days.join() || inBucket !== c.stress.scenarios) {
    throw new Error(`pit-wall: ${m.battery.resource}: the stress bucket recomputed is not the one the leaf names`);
  }
  const w = c.after.stress_weight_ppm;
  const stress = w * (flags.length - inBucket);
  const rest = (PPM - w) * inBucket;
  return { weights: flags.map((f) => (f ? stress : rest)), total: inBucket * (flags.length - inBucket) * PPM };
}

// Expected revenue over the scenarios, by part, in micro-USD, under the leaf's
// weights (null: equal). Mirrors packages/engine's revenueUusd term by term.
function parts(m, arm, sc, weights) {
  const n = sc.node_cents.length;
  const total = weights ? weights.total : n;
  const entry = m.instrument.entry_cents;
  const wear = m.assumptions.wear_cents_per_mwh;
  const fee = m.instrument.fee_cents_per_contract;
  let energy = 0;
  let wearCost = 0;
  let settle = 0;
  let fees = 0;
  for (let h = 0; h < HOURS; h++) {
    const kw = arm.kw[h];
    const d = Math.max(kw, 0);
    let node = 0;
    let hub4 = 0;
    for (let s = 0; s < n; s++) {
      const w = weights ? weights.weights[s] : 1;
      node += w * sc.node_cents[s][h];
      hub4 += w * sc.hub_sum4[s][h];
    }
    // kW over one hour is kWh; kWh x cents/MWh x 10 is micro-USD.
    energy += (kw * node * 10) / total;
    wearCost += d * wear * 10;
    const q = arm.contracts[h];
    settle += (q * (4 * entry[h] * total - hub4) * 2500) / total;
    fees += Math.abs(q) * fee * 10_000;
  }
  return { energy, wear: -wearCost, settle, fees: -fees };
}

/** The Cournot reading every leaf of the day shares, or null when the leaf records none. */
function readingOf(m) {
  const c = m.outside_inputs?.cournot;
  if (!c) return null;
  return { rule: c.rule, claim: c.claim, probabilityPpm: c.probability_ppm, basis: c.basis, observed: c.observed, response: c.response };
}

export default function pitWall(ctx) {
  const { day, dayDir, leaf, writeJson } = ctx;
  let common = null;
  let reading;
  let applied = 0;
  // The rule's settings, the same in every leaf it was applied to, and each hub's bucket.
  let ruled;
  const buckets = {};
  const entries = {};
  const hubForecast = {};
  let written = 0;

  for (const e of day.leaves) {
    const m = leaf(e.resource);
    if (!m) continue;
    const scPath = join(dayDir, e.scenarios);
    const sc = existsSync(scPath) ? ctx.readJson(scPath) : null;
    const b = m.battery;
    const hub = b.hub;
    const r = readingOf(m);
    if (reading === undefined) reading = r;
    else if (JSON.stringify(r) !== JSON.stringify(reading)) throw new Error(`pit-wall: ${b.resource} records another Cournot reading than the day's other leaves`);
    const c = m.outside_inputs?.cournot ?? null;
    if (c?.status === "applied") {
      applied++;
      const settings = JSON.stringify({ planCap: c.before.max_contracts_per_hour, after: c.after });
      if (ruled === undefined) ruled = settings;
      else if (settings !== ruled) throw new Error(`pit-wall: ${b.resource}: the weather rule gave other settings than in the day's other leaves`);
      const bucket = { days: c.stress.days, scenarios: c.stress.scenarios, equalWeightPpm: c.before.stress_weight_ppm };
      if (buckets[hub] && JSON.stringify(buckets[hub]) !== JSON.stringify(bucket)) throw new Error(`pit-wall: ${b.resource}: another stress bucket than the other batteries at ${hub}`);
      buckets[hub] = bucket;
    }
    entries[hub] ??= m.instrument.entry_cents;
    hubForecast[hub] ??= m.forecast.hub_da_cents;

    if (!common) {
      const { entry_cents: _entry, location: _location, ...terms } = m.instrument;
      common = {
        gate: m.gate,
        planTime: m.plan_time,
        market: m.market,
        regime: m.regime,
        physicalScope: m.physical_scope,
        assumptions: m.assumptions,
        risk: m.risk,
        instrument: terms,
        selectionRule: m.selection_rule,
        armMethods: Object.fromEntries(ARMS.map((a) => [a, m.arms[a]?.method ?? null])),
        forecast: { method: m.forecast.method, nodeRule: m.forecast.node_rule, dayType: m.forecast.day_type, lagDays: m.forecast.lag_days },
        scenarios: { method: m.scenarios.method, count: m.scenarios.count, weighting: m.scenarios.weighting },
        inputsRelease: m.inputs.release_id,
        engine: { commit: m.engine.commit, solver: m.engine.solver, solverPackage: m.engine.solver_package },
      };
    }

    const weights = sc ? weightsOf(m, sc) : null;
    const arms = {};
    for (const name of ARMS) {
      const a = m.arms[name];
      if (!a) continue;
      let split = null;
      if (sc) {
        const p = parts(m, a, sc, weights);
        const total = p.energy + p.wear + p.settle + p.fees;
        // The engine floors the mean to a whole micro-dollar.
        if (Math.abs(total - a.expected_uusd) > 2) {
          throw new Error(`pit-wall: ${b.resource} arm ${name}: parts sum to ${total} uUSD, the leaf says ${a.expected_uusd}`);
        }
        split = { energyUsd: dollars(p.energy), wearUsd: dollars(p.wear), hedgeUsd: dollars(p.settle), feesUsd: dollars(p.fees) };
      }
      // B keeps A's schedule; it is published once, and null here means "A's".
      const asA = name !== "A" && m.arms.A && a.kw.every((v, h) => v === m.arms.A.kw[h]);
      arms[name] = {
        kw: asA ? null : a.kw,
        // End-of-hour state of charge, whole kWh.
        socKwh: asA ? null : a.soc_ukwh.map((v) => Math.round(v / 1e6)),
        contracts: a.contracts,
        collateralUsd: a.collateral_cents / 100,
        expectedUsd: dollars(a.expected_uusd),
        cvarUsd: dollars(a.cvar_uusd),
        objectiveUsd: dollars(a.objective_uusd),
        split,
      };
    }

    writeJson(
      `pit-wall/${b.resource}.json`,
      {
        schema: "grand-prix.pit-wall.v1",
        resource: b.resource,
        settlementPoint: b.settlement_point,
        hub,
        zone: b.zone ?? null,
        county: b.county ?? null,
        maxPowerKw: b.max_power_kw,
        energyKwh: b.energy_kwh,
        leaf: e.leaf,
        selectedArm: m.selected_arm,
        unsolved: m.unsolved,
        nodeForecastCents: m.forecast.node_da_cents,
        nodeScenarioCents: sc ? nodeBands(sc.node_cents) : null,
        cournot: c ? { status: c.status, reason: c.reason } : null,
        arms,
      },
      e.manifest,
    );
    written++;
  }

  if (!common) return;

  // The Cournot response the leaves commit, as saved beside the record; the page hashes it against them.
  if (reading?.response) {
    const route = reading.response.route;
    if (!/^[A-Za-z0-9._\-/]+$/.test(route) || route.startsWith("/") || route.split("/").includes("..")) throw new Error(`pit-wall: ${route} is not a plain relative path`);
    const p = join(dayDir, route);
    if (existsSync(p)) {
      const got = createHash("sha256").update(readFileSync(p)).digest("hex");
      if (got !== reading.response.sha256) throw new Error(`pit-wall: ${route} hashes to ${got}, the leaves say ${reading.response.sha256}`);
      ctx.copyVerbatim(route, p, route);
    }
  }

  writeJson(
    "pit-wall/common.json",
    {
      schema: "grand-prix.pit-wall-common.v1",
      operatingDay: day.operating_day,
      batteries: written,
      ...common,
      cournot: reading ? { ...reading, appliedTo: applied, ...(ruled ? JSON.parse(ruled) : { planCap: null, after: null }), buckets } : null,
      entryCents: entries,
      hubForecastCents: hubForecast,
    },
    "manifest.json",
  );
}
