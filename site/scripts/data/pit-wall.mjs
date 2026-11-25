// Pit wall data: one desk file per battery (all three arms, the node price
// outlook and each arm's expected revenue split into its parts), plus the
// terms every plan of the day shares. Written to public/data/pit-wall/.
//
// The parts of expected revenue are recomputed here from the sealed leaf and
// its scenarios, and the build stops if they do not add up to the leaf's own
// expected_uusd, so the page never shows a split the plan does not support.

import { existsSync } from "node:fs";
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

// Expected revenue over the equally weighted scenarios, by part, in micro-USD.
// Mirrors packages/engine's revenueUusd term by term.
function parts(m, arm, sc) {
  const n = sc.node_cents.length;
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
      node += sc.node_cents[s][h];
      hub4 += sc.hub_sum4[s][h];
    }
    // kW over one hour is kWh; kWh x cents/MWh x 10 is micro-USD.
    energy += (kw * node * 10) / n;
    wearCost += d * wear * 10;
    const q = arm.contracts[h];
    settle += (q * (4 * entry[h] * n - hub4) * 2500) / n;
    fees += Math.abs(q) * fee * 10_000;
  }
  return { energy, wear: -wearCost, settle, fees: -fees };
}

export default function pitWall(ctx) {
  const { day, dayDir, leaf, writeJson } = ctx;
  let common = null;
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

    const arms = {};
    for (const name of ARMS) {
      const a = m.arms[name];
      if (!a) continue;
      let split = null;
      if (sc) {
        const p = parts(m, a, sc);
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
        arms,
      },
      e.manifest,
    );
    written++;
  }

  if (!common) return;
  writeJson(
    "pit-wall/common.json",
    { schema: "grand-prix.pit-wall-common.v1", operatingDay: day.operating_day, batteries: written, ...common, entryCents: entries, hubForecastCents: hubForecast },
    "manifest.json",
  );
}
