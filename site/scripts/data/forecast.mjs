// Forecast data: the hub side of every battery's price scenarios, for the
// Forecast tab. Each scenario pairs one history day's hub prices with one basis
// day's node basis, history day first (scenario i × basis count + j), so every
// battery at a hub carries the same hub prices: one path per history day. They
// are published once per hub, with their bands over all the scenarios.
//
// The price is the one each hedge contract settles on: the mean of the hour's
// four 15-minute real-time hub prices, held to the bounded future's range (the
// scenarios' hub_sum4 over 4, as pit-wall.mjs uses it). The forecast's own
// reference days, which every plan of the day shares, ride along. The build
// stops if two batteries at one hub disagree, if a hub's paths do not repeat per
// basis day, or if two plans name other reference days.
// Written to public/data/forecast/hubs.json.

import { existsSync } from "node:fs";
import { join, relative } from "node:path";

const HOURS = 24;
const QUANTILES = [
  ["p05", 0.05],
  ["p25", 0.25],
  ["p50", 0.5],
  ["p75", 0.75],
  ["p95", 0.95],
];
const cents = (n) => Math.round(n * 100) / 100;

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function bands(rows) {
  const out = Object.fromEntries([...QUANTILES.map(([k]) => [k, []]), ["mean", []]]);
  for (let h = 0; h < HOURS; h++) {
    const col = rows.map((r) => r[h]).sort((x, y) => x - y);
    for (const [k, q] of QUANTILES) out[k].push(cents(quantile(col, q)));
    out.mean.push(cents(col.reduce((s, v) => s + v, 0) / col.length));
  }
  return out;
}

export default function forecast(ctx) {
  const { day, dayDir, repo, leaf, readJson, writeJson } = ctx;
  const hubs = {};
  let historyDays = null;
  let basisDays = null;
  let count = null;
  let reference = null;

  for (const e of day.leaves) {
    const m = leaf(e.resource);
    const scPath = e.scenarios ? join(dayDir, e.scenarios) : null;
    if (!m || !scPath || !existsSync(scPath)) continue;
    const sc = readJson(scPath);
    const hub = m.battery.hub;
    const ref = { dayType: m.forecast.day_type, lagDays: m.forecast.lag_days, days: m.forecast.reference_days.map((d) => ({ day: d.day, weight: d.weight })) };
    reference ??= ref;
    if (JSON.stringify(ref) !== JSON.stringify(reference)) throw new Error(`forecast: ${e.resource} names other reference days`);
    historyDays ??= sc.history_days;
    basisDays ??= sc.basis_days;
    count ??= sc.hub_sum4.length;
    if (sc.history_days.join() !== historyDays.join() || sc.basis_days.join() !== basisDays.join()) {
      throw new Error(`forecast: ${e.resource} was built from other history or basis days`);
    }
    if (sc.hub_sum4.length !== historyDays.length * basisDays.length) {
      throw new Error(`forecast: ${e.resource} has ${sc.hub_sum4.length} scenarios, not ${historyDays.length} × ${basisDays.length}`);
    }
    const rows = sc.hub_sum4.map((r) => r.map((v) => v / 4));
    const key = JSON.stringify(rows);
    const seen = hubs[hub];
    if (seen) {
      if (seen.key !== key) throw new Error(`forecast: ${e.resource} disagrees with the other batteries at ${hub}`);
      seen.batteries++;
      continue;
    }
    const paths = historyDays.map((_, i) => rows[i * basisDays.length]);
    rows.forEach((r, s) => {
      if (r.join() !== paths[Math.floor(s / basisDays.length)].join()) throw new Error(`forecast: ${hub} scenario ${s} is not its history day's path`);
    });
    hubs[hub] = { key, batteries: 1, bands: bands(rows), paths: paths.map((p) => p.map(cents)) };
  }

  if (!historyDays) return;
  writeJson(
    "forecast/hubs.json",
    {
      schema: "grand-prix.forecast-hubs.v1",
      operatingDay: day.operating_day,
      units: "cents per MWh",
      quantity: "the hour's settlement price: the mean of its four 15-minute real-time hub prices, held to the bounded future's range",
      count,
      reference,
      historyDays,
      basisDays,
      hubs: Object.fromEntries(
        Object.keys(hubs)
          .sort()
          .map((h) => [h, { batteries: hubs[h].batteries, bands: hubs[h].bands, paths: hubs[h].paths }]),
      ),
    },
    `${relative(repo, dayDir)}/leaves/*.scenarios.json`,
  );
}
