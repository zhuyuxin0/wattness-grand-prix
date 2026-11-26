#!/usr/bin/env node
// Cuts the fleet map's two files from wattness.tech's published Terminal release, each with its receipt:
//
//   public/geo/fleet-points.json  every census battery's published point (resource, lat, lon, precision), from the
//                                 Fleet Map's fleet-geo route; the batteries it publishes without one, with its reason
//   public/geo/texas.json         Texas's counties, the load zones traced from them and the towns the map names, from
//                                 the Fleet Map's geo layers
//
//   node scripts/fleet-geo.mjs [--keep <empty dir>]
//
// Plain GETs of the release pointer, its manifest and the files it names: no cookie, no key, no identifying header.
// Each file is checked against its manifest descriptor's SHA-256 and bytes before it is cut. The receipt records the
// release, each route with its SHA-256 and the licence and attribution the manifest states for it, and when it was
// fetched, in CT and Bangkok. A battery's point is the route's own, never moved or guessed; where the day's
// settlement point is another node than the route's row, the node's point is taken, as the Terminal's map does
// (lib/fleet-model.ts, locOf). Run it again for a newer release; the map reads whatever the files hold.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const outDir = join(site, "public", "geo");
const ORIGIN = "https://wattness.tech";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const keep = arg("--keep");

async function get(url) {
  const res = await fetch(url, { redirect: "follow", credentials: "omit", referrerPolicy: "no-referrer" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------- the release

const pointerBuf = await get(`${ORIGIN}/release.json`);
const pointer = JSON.parse(pointerBuf.toString("utf8"));
const release = pointer.dataRelease;
if (!/^terminal-daily-\d{8}-\d{4}$/.test(String(release))) throw new Error(`release.json names no data release: ${JSON.stringify(pointer).slice(0, 200)}`);
const releaseBase = `${ORIGIN}/data/terminal-display/v1/releases/${release}`;
const manifestUrl = `${releaseBase}/manifest.json`;
const manifestBuf = await get(manifestUrl);
const manifest = JSON.parse(manifestBuf.toString("utf8"));
if (manifest.release !== release) throw new Error(`the manifest is release ${manifest.release}, not ${release}`);
if (pointer.dataManifestSha256 && sha256(manifestBuf) !== pointer.dataManifestSha256)
  throw new Error(`the manifest's SHA-256 ${sha256(manifestBuf)} is not release.json's ${pointer.dataManifestSha256}`);
const fetchedAt = new Date();
if (keep) {
  mkdirSync(keep, { recursive: true });
  writeFileSync(join(keep, "release.json"), JSON.stringify(pointer));
  writeFileSync(join(keep, "manifest.json"), manifestBuf);
}

const sources = new Map(manifest.sources.map((s) => [s.id, s]));
const licenceOf = (f) =>
  f.source_ids.map((id) => {
    const s = sources.get(id);
    return { id, report: s?.report ?? null, licence: s?.licence ?? null, attribution: s?.attribution ?? null };
  });

/** The manifest's descriptor for a route: in its own list, or in the catalog of the route's bucket (the first two hex
 *  digits of the route's SHA-256), fetched and checked against the manifest's SHA-256 and bytes for it. */
const catalogs = new Map();
async function descriptor(route) {
  const listed = (manifest.files ?? []).find((x) => x.route === route);
  if (listed) return { f: listed, catalog: null };
  const bucket = sha256(Buffer.from(route, "utf8")).slice(0, 2);
  const c = (manifest.catalogs ?? []).find((x) => x.bucket === bucket);
  if (!c) return null;
  let cat = catalogs.get(c.path);
  if (!cat) {
    const buf = await get(`${releaseBase}/${c.path}`);
    if (sha256(buf) !== c.sha256 || buf.length !== c.bytes) throw new Error(`${c.path}: not the manifest's ${c.sha256} (${c.bytes} B)`);
    cat = JSON.parse(buf.toString("utf8"));
    if (cat.release !== release) throw new Error(`${c.path} is release ${cat.release}`);
    catalogs.set(c.path, cat);
  }
  const f = cat.files.find((x) => x.route === route);
  return f ? { f, catalog: { path: c.path, sha256: c.sha256 } } : null;
}

/** A file the manifest names for a route, fetched and checked against its descriptor. */
async function file(route) {
  const d = await descriptor(route);
  if (!d) return null;
  const f = d.f;
  // A release's files are served under its own folder; the display root is the fallback.
  const urls = [`${releaseBase}/${f.path}`, `${ORIGIN}/data/terminal-display/v1/${f.path}`];
  let buf = null;
  let url = null;
  for (const u of urls) {
    try {
      buf = await get(u);
      url = u;
      break;
    } catch (e) {
      console.warn(`fleet-geo: ${u}: ${e.message}`);
    }
  }
  if (!buf) throw new Error(`no copy of ${route} answered`);
  const got = sha256(buf);
  if (got !== f.sha256 || buf.length !== f.bytes) throw new Error(`${route}: ${got} (${buf.length} B) is not the manifest's ${f.sha256} (${f.bytes} B)`);
  if (keep) writeFileSync(join(keep, f.path.replace(/[^a-zA-Z0-9._-]/g, "_")), buf);
  const sourcesOf = licenceOf(f);
  return {
    route,
    value: JSON.parse(buf.toString("utf8")),
    entry: {
      route,
      url,
      bytes: buf.length,
      sha256: got,
      schema: f.schema,
      catalog: d.catalog,
      license: [...new Set(sourcesOf.map((s) => s.licence).filter(Boolean))].join(" | "),
      attribution: [...new Set(sourcesOf.map((s) => s.attribution).filter(Boolean))].join(" | ") || null,
      source: sourcesOf.map((s) => `${s.id}: ${s.report}`).join(" | "),
    },
  };
}

// ---------------------------------------------------------------- when, in CT and Bangkok

const stamp = (d, timeZone, label) =>
  `${new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(d)
    .replace(",", "")} ${label}`;
const fetched = { ct: stamp(fetchedAt, "America/Chicago", "CT"), bangkok: stamp(fetchedAt, "Asia/Bangkok", "Bangkok") };
const receiptBase = {
  release,
  releaseUrl: `${ORIGIN}/release.json`,
  releasePointer: { releaseId: pointer.releaseId ?? null, generatedAt: pointer.generatedAt ?? null, sha256: sha256(pointerBuf) },
  manifest: { url: manifestUrl, sha256: sha256(manifestBuf), checked: "against release.json's dataManifestSha256" },
  fetched,
};

// ---------------------------------------------------------------- the points

const native = await file("/api/fleet-geo/v2/native");
if (!native) throw new Error("the release holds no /api/fleet-geo/v2/native");
const geo = native.value.schema === "fleet-geo.v1" ? native.value : native.value.data ?? native.value;
if (!Array.isArray(geo.rows)) throw new Error(`fleet-geo: no rows (schema ${native.value.schema})`);

// The day's settlement points, to take a node's point where the route's row names another node (the Terminal's
// locOf). public/data/day.json is the site's current day.
const day = JSON.parse(readFileSync(join(site, "public", "data", "day.json"), "utf8"));
const daySp = new Map(day.batteries.map((b) => [b.resource, b.settlementPoint]));
const PRECISIONS = new Set(["site", "substation", "third-party", "co-located-plant", "sibling", "county"]);
const fin = (x) => typeof x === "number" && Number.isFinite(x);

const rows = new Map(geo.rows.map((r) => [String(r.esr), r]));
const points = {};
const unmapped = {};
let byNode = 0;
// The Grand Prix's batteries only: the day's plans, in resource order.
for (const esr of [...daySp.keys()].sort()) {
  const r = rows.get(esr);
  if (!r) {
    unmapped[esr] = "not in the release's census";
    continue;
  }
  const own = fin(r.lat) && fin(r.lon) && PRECISIONS.has(r.precision) ? { lat: r.lat, lon: r.lon, precision: r.precision } : null;
  const sp = daySp.get(esr);
  let p = own;
  if (sp && r.settlement_point && sp !== r.settlement_point) {
    const n = geo.nodes?.[sp];
    if (n && fin(n.lat) && fin(n.lon) && PRECISIONS.has(n.precision)) {
      p = { lat: n.lat, lon: n.lon, precision: n.precision };
      byNode += 1;
    }
  }
  if (p) points[esr] = p;
  else unmapped[esr] = r.why_unmapped ?? null;
}
const inDay = Object.keys(points).length;

mkdirSync(outDir, { recursive: true });
const pointsFile = {
  schema: "grand-prix.fleet-points.v1",
  what:
    "Each Grand Prix battery's point on wattness.tech's Fleet Map, as its published fleet-geo route gives it: the battery's ERCOT resource name, latitude, longitude and the point's precision (site: its own EIA-860 plant; substation, third-party, co-located-plant or sibling: a node point; county: its county's interior point). The batteries the route publishes without a point are listed with its reason. Cut for the plans in public/data/day.json; test/fleet-map.test.mjs fails when a day's plan is in neither list, so a new battery means running the cut again.",
  license:
    "As the release states for the route: ERCOT data under ERCOT's Terms of Use, Section 5; EIA-860 and US Census Bureau data, US government work in the public domain; node points placed with OpenStreetMap data, © OpenStreetMap contributors, under the Open Database License 1.0, which this cut keeps.",
  receipt: {
    ...receiptBase,
    files: [native.entry],
    cut: `the ${day.batteries.length} plans of ${day.operatingDay}: ${inDay} with a point, ${Object.keys(unmapped).length} without one, ${byNode} at their day's node because the route's row names another node; the route's census holds ${geo.rows.length} batteries`,
  },
  points,
  unmapped,
};
writeFileSync(join(outDir, "fleet-points.json"), `${JSON.stringify(pointsFile)}\n`);

// ---------------------------------------------------------------- the ground

const round = (v) => Math.round(v * 1000) / 1000;
/** Douglas-Peucker on a [lon, lat] line, in degrees; a closed ring is split at its farthest point first. */
function simplify(line, tol) {
  if (line.length <= 4) return line.map(([x, y]) => [round(x), round(y)]);
  const keepIdx = new Uint8Array(line.length);
  const run = (a, b) => {
    const stack = [[a, b]];
    while (stack.length) {
      const [i0, i1] = stack.pop();
      const [ax, ay] = line[i0];
      const [bx, by] = line[i1];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let max = 0;
      let at = -1;
      for (let i = i0 + 1; i < i1; i++) {
        const [px, py] = line[i];
        let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const ex = ax + t * dx - px;
        const ey = ay + t * dy - py;
        const d = ex * ex + ey * ey;
        if (d > max) {
          max = d;
          at = i;
        }
      }
      if (at >= 0 && max > tol * tol) {
        keepIdx[at] = 1;
        stack.push([i0, at], [at, i1]);
      }
    }
  };
  const last = line.length - 1;
  keepIdx[0] = 1;
  keepIdx[last] = 1;
  const closed = line[0][0] === line[last][0] && line[0][1] === line[last][1];
  if (closed) {
    let far = 1;
    let farD = -1;
    for (let i = 1; i < last; i++) {
      const d = (line[i][0] - line[0][0]) ** 2 + (line[i][1] - line[0][1]) ** 2;
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    keepIdx[far] = 1;
    run(0, far);
    run(far, last);
  } else run(0, last);
  const out = [];
  for (let i = 0; i <= last; i++) if (keepIdx[i]) out.push([round(line[i][0]), round(line[i][1])]);
  return out;
}

const layer = async (name) => file(`/api/fleet-geo/layers?name=${name}`);
// Texas is drawn from its counties (their union and its outer edge), as the brief and the Terminal's own layers allow:
// the state layer (GENZ2023 20m) is far coarser than the counties (TIGERweb, generalized at 0.005 degrees).
const countiesL = await layer("counties");
const placesL = await layer("places");
if (!countiesL) throw new Error("the release holds no counties layer");
const Cn = countiesL.value.data ?? countiesL.value;
const P = placesL ? placesL.value.data ?? placesL.value : null;

const TOL = 0.004; // degrees, about 400 m: under a third of a screen pixel at the map's widest
// The counties as published, rounded to 0.001 degree: the same rounding keeps a shared border's vertices shared.
const counties = Cn.counties.map((c) => c.rings.map((r) => r.map(([x, y]) => [round(x), round(y)])).filter((r) => r.length >= 4));
/** A ring's signed area and centroid, in degrees (planar; enough to put a label inside a zone). */
function ringCentroid(ring) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j];
    const [x1, y1] = ring[i];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  return a ? { a: a / 2, x: cx / (3 * a), y: cy / (3 * a) } : { a: 0, x: ring[0][0], y: ring[0][1] };
}
/** Where a zone's name goes: the area-weighted centroid of its counties. */
function zoneAt(zone) {
  let A = 0;
  let X = 0;
  let Y = 0;
  for (const c of Cn.counties) {
    if (c.zone !== zone) continue;
    for (const r of c.rings) {
      const { a, x, y } = ringCentroid(r);
      const w = Math.abs(a);
      A += w;
      X += x * w;
      Y += y * w;
    }
  }
  return A ? [round(X / A), round(Y / A)] : null;
}
const zones = Cn.zones.map((z) => ({ zone: z.zone, label: z.label, at: zoneAt(z.zone), paths: z.paths.map((p) => simplify(p, TOL)).filter((p) => p.length >= 2) }));

// The towns the map names: the largest Texas cities in the layer, by the places' own kind where it says one.
const WANT = ["Houston", "Dallas", "San Antonio", "Austin", "Fort Worth", "El Paso", "Corpus Christi", "Lubbock", "Laredo", "Amarillo", "Brownsville", "Midland", "Odessa", "Abilene", "Waco", "Tyler", "Beaumont", "San Angelo", "Wichita Falls", "Victoria"];
const places = [];
if (P?.places) {
  for (const name of WANT) {
    // The Gazetteer's rows are [name, lat, lon, county]; the map keeps [name, lon, lat].
    const hit = P.places.find((p) => String(p[0]).replace(/ city$/i, "") === name);
    if (hit) places.push([name, round(hit[2]), round(hit[1])]);
  }
}

const texasFile = {
  schema: "grand-prix.texas-geo.v1",
  what:
    "The fleet map's ground, cut from wattness.tech's Fleet Map layers: Texas's 254 counties (the map draws the state as their union), the four ERCOT load zones the Terminal traces from them (approximate there too; simplified by Douglas-Peucker at about 400 m), every coordinate rounded to 0.001 degree, and the towns the map names, at the Census Gazetteer's interior points.",
  license: "As the release states for both layers: public domain (US Census Bureau). The load zones are the Terminal's, traced from the counties' zones (zoneNote).",
  receipt: {
    ...receiptBase,
    files: [countiesL.entry, ...(placesL ? [placesL.entry] : [])],
    cut: `${counties.length} counties, ${zones.length} zones, ${places.length} towns`,
  },
  counties,
  zones,
  zoneNote: Cn.zone_note ?? null,
  places,
};
writeFileSync(join(outDir, "texas.json"), `${JSON.stringify(texasFile)}\n`);

console.log(
  JSON.stringify(
    {
      release,
      fetched,
      points: { kept: Object.keys(points).length, unmapped: Object.keys(unmapped).length, byNode, inDay, of: day.batteries.length },
      ground: texasFile.receipt.cut,
      bytes: { points: JSON.stringify(pointsFile).length, texas: JSON.stringify(texasFile).length },
      files: [native.entry, countiesL.entry, ...(placesL ? [placesL.entry] : [])].map((e) => ({ route: e.route, sha256: e.sha256, bytes: e.bytes, license: e.license })),
    },
    null,
    2,
  ),
);
