// The fleet map's model: the join of the day's plans to the published points, the counts the map prints, the color
// scale, the hour's totals and the evening peak; and the committed points and ground against their receipts. Run with
// `pnpm test` (Node 22.18 or later runs the TypeScript module directly; the hook adds the ".ts" Vite resolves).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (!/^\.\.?\//.test(specifier) || /\.[cm]?[jt]sx?$/.test(specifier)) throw error;
      return next(`${specifier}.ts`, context);
    }
  },
});

const M = await import("../src/components/fleet-map/model.ts");
const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "..");
const readJson = (rel) => JSON.parse(readFileSync(join(site, rel), "utf8"));

const plan = (resource, powerMw, scheduleMw = Array(24).fill(0)) => ({ resource, powerMw, scheduleMw });

test("a plan is placed at its own published point, by resource, and counted by the point's precision", () => {
  const plans = [plan("A_ESR1", 10), plan("B_ESR1", 50), plan("C_ESR1", 100), plan("D_ESR1", 5), plan("E_ESR1", 1)];
  const geo = {
    points: {
      A_ESR1: { lat: 31.1, lon: -97.2, precision: "site" },
      B_ESR1: { lat: 29.7, lon: -95.4, precision: "substation" },
      C_ESR1: { lat: 32.0, lon: -102.1, precision: "county" },
      D_ESR1: { lat: 27.8, lon: -97.4, precision: "co-located-plant" },
      Z_ESR1: { lat: 30.0, lon: -98.0, precision: "site" },
    },
    unmapped: { E_ESR1: "no settlement point on file" },
  };
  const j = M.joinFleet(plans, geo);
  assert.deepEqual(
    j.placed.map((p) => [p.b.resource, p.kind]),
    [
      ["A_ESR1", "exact"],
      ["B_ESR1", "approximate"],
      ["C_ESR1", "county"],
      ["D_ESR1", "approximate"],
    ],
  );
  assert.equal(j.placed[0].lat, 31.1, "the point is the published one, unmoved");
  assert.equal(j.placed[0].lon, -97.2);
  assert.deepEqual(j.unplaced.map((u) => [u.b.resource, u.reason]), [["E_ESR1", "no settlement point on file"]]);
  assert.deepEqual(j.counts, { exact: 1, approximate: 2, county: 1, unplaced: 1, total: 5 });
  assert.equal(j.counts.exact + j.counts.approximate + j.counts.county + j.counts.unplaced, j.counts.total, "every plan is counted once");
});

test("a point that is missing, not finite or out of range leaves its plan unplaced, never guessed", () => {
  const plans = [plan("N_ESR1", 10), plan("X_ESR1", 10), plan("Y_ESR1", 10), plan("Q_ESR1", 10)];
  const geo = {
    points: {
      X_ESR1: { lat: Number.NaN, lon: -97, precision: "site" },
      Y_ESR1: { lat: 31, lon: -297, precision: "site" },
      Q_ESR1: { lat: 31, lon: -97, precision: null },
    },
    unmapped: {},
  };
  const j = M.joinFleet(plans, geo);
  assert.equal(j.placed.length, 0);
  assert.deepEqual(
    j.unplaced.map((u) => u.b.resource),
    ["N_ESR1", "X_ESR1", "Y_ESR1", "Q_ESR1"],
  );
  assert.equal(j.unplaced[0].reason, "no point on file for it", "a resource the file lacks says so, and no more");
  assert.equal(j.unplaced[1].reason, "its published point is not usable");
  assert.equal(j.counts.unplaced, 4);
  // An inherited name is not a point.
  assert.equal(M.joinFleet([plan("constructor", 1)], { points: {}, unmapped: {} }).counts.unplaced, 1);
});

test("the precision words follow the Terminal's coverage rail", () => {
  assert.equal(M.placeKind("site"), "exact");
  for (const p of ["substation", "third-party", "co-located-plant", "sibling"]) assert.equal(M.placeKind(p), "approximate", p);
  assert.equal(M.placeKind("county"), "county");
});

test("the color scale: idle in the middle, charging below it, discharging above, in quarters of rated power", () => {
  assert.equal(M.rampStep(0, 10), M.IDLE_STEP);
  assert.equal(M.rampStep(0.0001, 10), M.IDLE_STEP, "under half a kW is idle (the schedule is in whole kW)");
  assert.equal(M.rampStep(-0.001, 10), 3, "a kW of charge is charging");
  assert.equal(M.rampStep(2.5, 10), 5, "a quarter of rated power is the first step");
  assert.equal(M.rampStep(2.6, 10), 6);
  assert.equal(M.rampStep(5, 10), 6);
  assert.equal(M.rampStep(7.5, 10), 7);
  assert.equal(M.rampStep(7.6, 10), 8);
  assert.equal(M.rampStep(10, 10), 8, "full discharge is the strongest blue");
  assert.equal(M.rampStep(12, 10), 8, "held to the rating");
  assert.equal(M.rampStep(-10, 10), 0, "full charge is the strongest red");
  assert.equal(M.rampStep(-5, 10), 2);
  assert.equal(M.rampStep(-2.5, 10), 3);
  assert.equal(M.rampStep(4, 0), 8, "an unrated battery's sign still shows");
  assert.equal(M.rampStep(Number.NaN, 10), M.IDLE_STEP);
  // Symmetric about idle.
  for (const mw of [0.4, 1, 2.5, 3, 5.5, 8, 10]) assert.equal(M.rampStep(mw, 10) - M.IDLE_STEP, M.IDLE_STEP - M.rampStep(-mw, 10), `±${mw}`);
  // Monotonic in the planned MW.
  let last = -1;
  for (let mw = -12; mw <= 12; mw += 0.25) {
    const s = M.rampStep(mw, 10);
    assert.ok(s >= last, `step at ${mw} MW`);
    last = s;
  }
});

test("the ramp is the Terminal's heat ramp: nine stops, gray at idle, in light and dark", () => {
  for (const theme of ["light", "dark"]) {
    const r = M.RAMP[theme];
    assert.equal(r.length, 9);
    assert.equal(new Set(r).size, 9, `${theme}: nine distinct stops`);
    for (const c of r) assert.match(c, /^#[0-9a-f]{6}$/);
    const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [r0, , b0] = rgb(r[0]);
    const [r8, , b8] = rgb(r[8]);
    assert.ok(r0 > b0, `${theme}: charging's end is red`);
    assert.ok(b8 > r8, `${theme}: discharging's end is blue`);
    const [mr, mg, mb] = rgb(r[M.IDLE_STEP]);
    assert.ok(Math.max(mr, mg, mb) - Math.min(mr, mg, mb) < 12, `${theme}: idle is a gray`);
  }
  assert.equal(M.STEP_WORDS.length, 9);
  assert.equal(M.STEP_WORDS[M.IDLE_STEP], "Idle");
});

test("the hour's totals count every plan once, each way, with its MW", () => {
  const plans = [plan("A", 10, [5, ...Array(23).fill(0)]), plan("B", 20, [-20, ...Array(23).fill(0)]), plan("C", 5, [0, 1, ...Array(22).fill(0)]), plan("D", 8, [-3])];
  const t = M.hourTotals(plans, 0);
  assert.deepEqual(t, { hour: 0, discharging: 1, dischargeMw: 5, charging: 2, chargeMw: 23, idle: 1 });
  const t1 = M.hourTotals(plans, 1);
  assert.equal(t1.discharging + t1.charging + t1.idle, plans.length, "a short schedule's missing hour is idle");
  assert.equal(M.dayTotals(plans).length, 24);
});

test("the map opens on the evening peak: the evening hour the plans discharge the most", () => {
  const at = (h, mw) => {
    const s = Array(24).fill(0);
    s[h] = mw;
    return s;
  };
  assert.equal(M.eveningPeakHour([plan("A", 10, at(17, 9)), plan("B", 10, at(19, 4))]), 17);
  assert.equal(M.eveningPeakHour([plan("A", 10, at(7, 10)), plan("B", 10, at(20, 1))]), 20, "a bigger morning peak does not win");
  assert.equal(M.eveningPeakHour([plan("A", 10, at(7, 10))]), 7, "with no evening discharge, the day's largest");
  assert.equal(M.eveningPeakHour([plan("A", 10)]), 18, "with none at all, 18:00");
  const tie = [plan("A", 10, at(16, 5)), plan("B", 10, at(18, 5))];
  assert.equal(M.eveningPeakHour(tie), 16, "the earliest on a tie");
});

test("dot sizes: area in proportion to rated MW, with a floor", () => {
  const r250 = M.radiusOf(250, 250, 16);
  const r62 = M.radiusOf(62.5, 250, 16);
  assert.equal(r250, 16);
  assert.ok(Math.abs(r62 - 8) < 1e-9, "a quarter of the MW is half the radius");
  assert.equal(M.radiusOf(0.01, 250, 16), 1.6, "the floor");
  assert.equal(M.sizeReference([plan("A", 240), plan("B", 3)]), 250);
  assert.equal(M.sizeReference([plan("A", 12)]), 50);
});

test("the projection keeps Texas the right way up and in its frame", () => {
  const ring = [
    [-106.6, 31.9],
    [-93.5, 30.0],
    [-97.4, 25.9],
    [-103.0, 36.5],
  ];
  const f = M.frameFor([ring], 1000, 10);
  const [ex, ey] = f.at(-106.6, 31.9); // El Paso
  const [bx, by] = f.at(-97.4, 25.9); // Brownsville
  const [ax, ay] = f.at(-103.0, 36.5); // the Panhandle's corner
  assert.ok(ex < bx, "west is left");
  assert.ok(ay < by, "north is up");
  for (const [x, y] of [f.at(...ring[0]), f.at(...ring[1]), f.at(...ring[2]), f.at(...ring[3])]) {
    assert.ok(x >= 9.99 && x <= 990.01 && y >= 9.99 && y <= f.height - 9.99, `${x}, ${y} inside the frame`);
  }
  assert.ok(f.height > 800 && f.height < 1100, "Texas is about as tall as it is wide");
  assert.ok(Number.isFinite(ex + ey + ax));
});

test("the title names the day by the market's calendar", () => {
  assert.equal(M.dayWord("2026-11-27", "2026-11-26"), "Tomorrow's");
  assert.equal(M.dayWord("2026-11-27", "2026-11-27"), "Today's");
  assert.equal(M.dayWord("2026-11-27", "2026-11-28"), null);
  assert.equal(M.dayWord("2026-12-01", "2026-11-30"), "Tomorrow's", "across a month");
  assert.equal(M.dayWord("2027-01-01", "2026-12-31"), "Tomorrow's", "across a year");
});

// ---------------------------------------------------------------- the committed files

const points = readJson("public/geo/fleet-points.json");
const texas = readJson("public/geo/texas.json");
const day = readJson("public/data/day.json");

test("the points file is the published route's cut, with its receipt", () => {
  assert.equal(points.schema, "grand-prix.fleet-points.v1");
  const r = points.receipt;
  assert.match(r.release, /^terminal-daily-\d{8}-\d{4}$/);
  assert.match(r.manifest.sha256, /^[0-9a-f]{64}$/);
  const route = r.files.find((f) => f.route === "/api/fleet-geo/v2/native");
  assert.ok(route, "the receipt names the native fleet-geo route");
  assert.match(route.sha256, /^[0-9a-f]{64}$/);
  assert.ok(route.license && route.license.length > 3, "the license as the manifest states it");
  assert.match(r.fetched.ct, /CT$/);
  assert.match(r.fetched.bangkok, /Bangkok$/);
  for (const [esr, p] of Object.entries(points.points)) {
    assert.deepEqual(Object.keys(p).sort(), ["lat", "lon", "precision"], `${esr} keeps only what the map needs`);
    assert.ok(p.lat > 25 && p.lat < 37 && p.lon > -107 && p.lon < -93, `${esr} is in Texas`);
    assert.ok(["site", "substation", "third-party", "co-located-plant", "sibling", "county"].includes(p.precision), `${esr}: ${p.precision}`);
  }
  for (const esr of Object.keys(points.unmapped)) assert.ok(!(esr in points.points), `${esr} is either placed or unmapped`);
  assert.doesNotMatch(JSON.stringify(points), /\/Users\/|\/private\/tmp\/|@[a-z0-9-]+\.[a-z]{2,}/i, "no local path or email");
});

test("the day's plans join the points: counted, and the counts add up", () => {
  for (const b of day.batteries) {
    assert.ok(b.resource in points.points || b.resource in points.unmapped, `${b.resource} is in the cut (run scripts/fleet-geo.mjs again for a new day's list)`);
  }
  const j = M.joinFleet(day.batteries, points);
  assert.equal(j.counts.total, day.batteries.length);
  assert.equal(j.counts.exact + j.counts.approximate + j.counts.county + j.counts.unplaced, day.batteries.length);
  assert.ok(j.counts.exact > day.batteries.length / 2, "most plans stand at their own site");
  for (const u of j.unplaced) assert.ok(!(u.b.resource in points.points), `${u.b.resource} has no point`);
});

test("the ground file: Texas's counties, the four ERCOT load zones and the towns, with its receipt", () => {
  assert.equal(texas.schema, "grand-prix.texas-geo.v1");
  assert.equal(texas.counties.length, 254, "Texas's 254 counties");
  for (const c of texas.counties) for (const r of c) for (const [lon, lat] of r) assert.ok(lon > -107 && lon < -93 && lat > 25.5 && lat < 36.6);
  for (const [name, lon, lat] of texas.places) assert.ok(lon < -93 && lon > -107 && lat > 25.5 && lat < 36.6, `${name} is [name, lon, lat]`);
  const houston = texas.places.find((p) => p[0] === "Houston");
  assert.ok(houston && Math.abs(houston[1] + 95.4) < 0.3 && Math.abs(houston[2] - 29.8) < 0.3, "Houston where Houston is");
  const zones = texas.zones.map((z) => z.zone).sort();
  for (const z of ["LZ_HOUSTON", "LZ_NORTH", "LZ_SOUTH", "LZ_WEST"]) assert.ok(zones.includes(z), z);
  assert.ok(texas.receipt.files.length >= 2);
  for (const f of texas.receipt.files) assert.match(f.sha256, /^[0-9a-f]{64}$/, f.route);
  assert.doesNotMatch(JSON.stringify(texas.receipt), /\/Users\/|\/private\/tmp\//);
});

test("the cut files are small enough to load with the Fleet tab", () => {
  const bytes = (rel) => readFileSync(join(site, rel)).length;
  assert.ok(bytes("public/geo/fleet-points.json") < 80_000, "points under 80 kB");
  assert.ok(bytes("public/geo/texas.json") < 400_000, "ground under 400 kB");
});
