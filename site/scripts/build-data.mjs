#!/usr/bin/env node
// Turns the sealed day into the site's static data under public/data/.
//
//   node scripts/build-data.mjs [--day <dir>] [--testnet <dir>] [--structure <file>] [--brain <file>] [--fixture]
//
// Reads the newest sealed day under out/ (out/od-YYYYMMDD, the full record, and
// its out/od-YYYYMMDD-bsc-testnet sibling) unless --day names one, and falls
// back to fixtures/od-20261126 (the index, two leaves, both receipts). Earlier
// sealed days under out/ give the Seal tab their roots and commits. Every
// published file is listed with its SHA-256 in public/data/files.json. The one
// read from the network is the late commit (scripts/late-seal.mjs), an eth_call
// to each chain's public nodes; offline, the call already published for the
// same day is kept.
//
// Page owners add their own data without editing this file: every module in
// scripts/data/*.mjs is imported in name order and its default export is called
// with the context documented at `context` below.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LATE_SEAL_SOURCE, lateCalls, lateSealFile } from "./late-seal.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = resolve(site, "..");
const outDir = join(site, "public", "data");
const MAX_BYTES = 3 * 1024 * 1024;

// Sources from outside this repository (the Terminal graph exported from
// wattness.tech's model, the Living Brain readback) are read from GP_SOURCES,
// default cache/site-sources/ (gitignored), or from --structure and --brain.
const sourcesDir = resolve(process.env.GP_SOURCES ?? join(repo, "cache", "site-sources"));

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

/** The newest out/od-YYYYMMDD that holds an index, or out/od-20261126 when there is none. */
function newestDay() {
  const out = join(repo, "out");
  const days = existsSync(out) ? readdirSync(out).filter((n) => /^od-\d{8}$/.test(n) && existsSync(join(out, n, "manifest.json"))).sort() : [];
  return join(out, days[days.length - 1] ?? "od-20261126");
}

const fullDay = resolve(arg("--day") ?? newestDay());
const fullTestnet = resolve(arg("--testnet") ?? `${fullDay}-bsc-testnet`);
const fixtureDay = join(repo, "fixtures", "od-20261126");
const structurePath = resolve(arg("--structure") ?? join(sourcesDir, "terminal-structure.json"));
const brainPath = resolve(arg("--brain") ?? join(sourcesDir, "brain-readback.json"));

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const usd = (uusd) => Math.round(uusd / 1e4) / 100;
const cents = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- sources

const useFull = existsSync(join(fullDay, "manifest.json"));
const dayDir = useFull ? fullDay : fixtureDay;
if (!existsSync(join(dayDir, "manifest.json"))) {
  console.error(`build-data: no manifest in ${fullDay} or ${fixtureDay}`);
  process.exit(1);
}
const day = readJson(join(dayDir, "manifest.json"));

const receiptSources = useFull
  ? [join(fullDay, "record.json"), join(fullTestnet, "record.json")]
  : [join(fixtureDay, "record.bsc-mainnet.json"), join(fixtureDay, "record.bsc-testnet.json")];
// The testnet receipt also lives in the fixture, so a full day without its
// testnet sibling still publishes both.
if (useFull && !existsSync(receiptSources[1])) receiptSources[1] = join(fixtureDay, "record.bsc-testnet.json");

// ---------------------------------------------------------------- output

// public/data is committed. A clone without out/ must not overwrite the full
// record's data with the two-leaf fixture, and sources that live outside the
// repository (the Terminal graph, the Living Brain readback) keep their last
// published copy when they are absent.
const previousFiles = existsSync(join(outDir, "files.json")) ? readJson(join(outDir, "files.json")) : null;
if (!useFull && previousFiles?.builtFrom === "record" && !process.argv.includes("--fixture")) {
  console.log("build-data: out/ is absent; keeping the published record data (pass --fixture to rebuild from the fixture)");
  process.exit(0);
}
const kept = new Map();
for (const rel of ["terminal-structure.json", "brain.json"]) {
  const p = join(outDir, rel);
  if (existsSync(p)) kept.set(rel, readFileSync(p));
}

// The late commit's calls (scripts/late-seal.mjs) are the one network read,
// made before public/data is cleared: a chain out of reach with no call
// published for the same day stops the build here, with the data as it was.
const showcaseFile = day.leaves.find((l) => l.resource === day.showcase)?.manifest;
const committer = showcaseFile && existsSync(join(dayDir, showcaseFile)) ? readJson(join(dayDir, showcaseFile)).agent?.wallet : null;
if (!committer) throw new Error(`build-data: the showcase plan ${day.showcase} names no committer (agent.wallet)`);
const lateSealPath = join(outDir, "late-seal.json");
const lateCallsMade = await lateCalls({
  operatingDay: day.operating_day,
  gateUnix: day.gate_unix,
  records: receiptSources.filter(existsSync).map(readJson),
  committer,
  previous: existsSync(lateSealPath) ? readJson(lateSealPath) : null,
});

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const written = [];

function writeJson(rel, value, source) {
  const file = join(outDir, rel);
  mkdirSync(dirname(file), { recursive: true });
  const text = JSON.stringify(value);
  writeFileSync(file, text);
  written.push({ path: rel, bytes: Buffer.byteLength(text), sha256: sha256(text), source: source ?? null });
}

function copyVerbatim(rel, from, source) {
  const file = join(outDir, rel);
  mkdirSync(dirname(file), { recursive: true });
  const buf = Buffer.isBuffer(from) ? from : readFileSync(from);
  writeFileSync(file, buf);
  written.push({ path: rel, bytes: buf.length, sha256: sha256(buf), source: source ?? null });
}

const srcLabel = (p) => (p.startsWith(repo) ? relative(repo, p) : p.split("/").slice(-2).join("/"));

// ---------------------------------------------------------------- the day

function sumWhere(kw, pred) {
  let s = 0;
  for (const v of kw) if (pred(v)) s += Math.abs(v);
  return s;
}

function summarize(entry, index, doc) {
  const b = doc.battery;
  const arms = {};
  for (const name of ["A", "B", "C"]) {
    const a = doc.arms[name];
    if (!a) continue;
    arms[name] = {
      expectedUsd: usd(a.expected_uusd),
      cvarUsd: usd(a.cvar_uusd),
      objectiveUsd: usd(a.objective_uusd),
      collateralUsd: cents(a.collateral_cents / 100),
      contracts: a.contracts.reduce((s, c) => s + Math.abs(c), 0),
    };
  }
  const sel = doc.arms[doc.selected_arm];
  return {
    index,
    resource: b.resource,
    settlementPoint: b.settlement_point,
    hub: b.hub,
    zone: b.zone ?? null,
    county: b.county ?? null,
    powerMw: b.max_power_kw / 1000,
    energyMwh: b.energy_kwh / 1000,
    // Hourly intervals, so the kW figures sum to kWh. Positive is discharge.
    dischargeMwh: Math.round(sumWhere(sel.kw, (v) => v > 0)) / 1000,
    chargeMwh: Math.round(sumWhere(sel.kw, (v) => v < 0)) / 1000,
    selectedArm: doc.selected_arm,
    arms,
    scheduleMw: sel.kw.map((v) => v / 1000),
    leaf: entry.leaf,
  };
}

const batteries = [];
const missing = [];
day.leaves.forEach((entry, index) => {
  const file = join(dayDir, entry.manifest);
  if (!existsSync(file)) {
    missing.push(entry.resource);
    return;
  }
  batteries.push(summarize(entry, index, readJson(file)));
});

const showcaseEntry = day.leaves.find((l) => l.resource === day.showcase);
if (!showcaseEntry) throw new Error(`showcase ${day.showcase} is not in the index`);
const showcasePath = join(dayDir, showcaseEntry.manifest);
const showcase = readJson(showcasePath);

writeJson(
  "day.json",
  {
    schema: "grand-prix.day.v1",
    operatingDay: day.operating_day,
    scopeLabel: day.scope_label,
    gateUnix: day.gate_unix,
    planUnix: day.plan_unix,
    codeTree: day.code_tree,
    root: day.root,
    leafCount: day.leaf_count,
    showcase: day.showcase,
    market: showcase.market,
    regime: showcase.regime,
    physicalScope: showcase.physical_scope,
    inputsRelease: showcase.inputs.release_id,
    coverage: { listed: day.leaves.length, summarized: batteries.length, missing, from: useFull ? "record" : "fixture" },
    exclusions: day.exclusions ?? [],
    batteries,
  },
  srcLabel(join(dayDir, "manifest.json")),
);

// The manifest as hashed, byte for byte, so the page can recompute its leaf.
copyVerbatim(`showcase/${day.showcase}.manifest.json`, showcasePath, srcLabel(showcasePath));

// ---------------------------------------------------------------- scenarios

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo];
  const b = sorted[hi];
  return a + (b - a) * (pos - lo);
}

function bands(paths) {
  const hours = paths[0]?.length ?? 0;
  const out = { p05: [], p25: [], p50: [], p75: [], p95: [], mean: [], min: [], max: [] };
  for (let h = 0; h < hours; h++) {
    const col = paths.map((p) => p[h]).sort((x, y) => x - y);
    out.p05.push(cents(quantile(col, 0.05)));
    out.p25.push(cents(quantile(col, 0.25)));
    out.p50.push(cents(quantile(col, 0.5)));
    out.p75.push(cents(quantile(col, 0.75)));
    out.p95.push(cents(quantile(col, 0.95)));
    out.mean.push(cents(col.reduce((s, v) => s + v, 0) / col.length));
    out.min.push(col[0]);
    out.max.push(col[col.length - 1]);
  }
  return out;
}

const scenariosPath = join(dayDir, showcaseEntry.scenarios);
if (existsSync(scenariosPath)) {
  const sc = readJson(scenariosPath);
  const hub = sc.hub_sum4.map((row) => row.map((v) => v / 4));
  const step = Math.max(1, Math.floor(sc.node_cents.length / 40));
  writeJson(
    `showcase/${day.showcase}.scenarios.json`,
    {
      schema: "grand-prix.scenarios-digest.v1",
      resource: day.showcase,
      units: "cents per MWh",
      count: sc.node_cents.length,
      weighting: showcase.scenarios.weighting,
      method: showcase.scenarios.method,
      digestSha256: showcase.scenarios.digest_sha256,
      fileSha256: sha256(readFileSync(scenariosPath)),
      historyDays: sc.history_days,
      basisDays: sc.basis_days,
      node: bands(sc.node_cents),
      // Mean of the hour's four 15-minute hub prices, the quantity the
      // bounded future settles on before clipping.
      hubSettle: bands(hub),
      samplePaths: sc.node_cents.filter((_, i) => i % step === 0).slice(0, 40),
    },
    srcLabel(scenariosPath),
  );
}

// ---------------------------------------------------------------- receipts

const EXPLORER = { 56: "https://bscscan.com", 97: "https://testnet.bscscan.com" };
const CHAIN_NAME = { 56: "BNB Smart Chain", 97: "BNB Smart Chain Testnet" };

/** One chain's commit receipt (record.json) for a day whose index gives the root and the gate. */
function receiptOf(p, index) {
  const r = readJson(p);
  if (r.root !== index.root) throw new Error(`${p}: root ${r.root} is not the index root ${index.root}`);
  const explorer = EXPLORER[r.chainId] ?? null;
  return {
    chainId: r.chainId,
    chainName: CHAIN_NAME[r.chainId] ?? `Chain ${r.chainId}`,
    mainnet: r.chainId === 56,
    contract: r.contract,
    txHash: r.txHash,
    blockNumber: r.blockNumber,
    blockTime: r.committedAt,
    secondsBeforeGate: index.gate_unix - r.committedAt,
    key: r.key,
    scope: r.scope,
    scopeLabel: r.scopeLabel,
    root: r.root,
    leafCount: r.leafCount,
    codeHash: r.codeHash,
    txUrl: explorer ? `${explorer}/tx/${r.txHash}` : null,
    contractUrl: explorer ? `${explorer}/address/${r.contract}` : null,
    source: srcLabel(p),
  };
}

const receipts = receiptSources.filter(existsSync).map((p) => receiptOf(p, day));

// Earlier sealed days beside the day built (out/od-YYYYMMDD before it, with
// its -bsc-testnet sibling): each one's root and commits, from its own index
// and record.json, newest first.
const outRoot = dirname(fullDay);
const earlier = useFull
  ? readdirSync(outRoot)
      .filter((n) => /^od-\d{8}$/.test(n) && n < basename(fullDay) && existsSync(join(outRoot, n, "manifest.json")) && existsSync(join(outRoot, n, "record.json")))
      .sort()
      .reverse()
      .map((n) => {
        const index = readJson(join(outRoot, n, "manifest.json"));
        const list = [join(outRoot, n, "record.json"), join(outRoot, `${n}-bsc-testnet`, "record.json")].filter(existsSync).map((p) => receiptOf(p, index));
        return { operatingDay: index.operating_day, root: index.root, leafCount: index.leaf_count, gateUnix: index.gate_unix, receipts: list };
      })
  : [];

writeJson("receipts.json", { schema: "grand-prix.receipts.v1", operatingDay: day.operating_day, receipts, earlier }, "record.json");

// A second commit for the same day, tried 22 s after the gate on both
// deployments: an eth_call from the day's committer with the block's time set
// to gate + 22 s, never a transaction, and its control 1 s before the gate,
// made above (scripts/late-seal.mjs). Each revert is recorded as the node
// returned it.
writeJson(
  "late-seal.json",
  lateSealFile({ operatingDay: day.operating_day, gateUnix: day.gate_unix, receipts, calls: lateCallsMade }),
  LATE_SEAL_SOURCE,
);

// ---------------------------------------------------------------- Terminal graph

if (existsSync(structurePath)) {
  copyVerbatim("terminal-structure.json", structurePath, "wattness.tech Terminal model export");
} else if (kept.has("terminal-structure.json")) {
  copyVerbatim("terminal-structure.json", kept.get("terminal-structure.json"), "wattness.tech Terminal model export (kept)");
} else {
  console.warn(`build-data: no Terminal graph at ${structurePath}; the page shows nothing for it`);
}

// ---------------------------------------------------------------- Living Brain

const SENSITIVE_KEY = /(api[-_]?key|secret|token|password|passwd|auth|subject|email|cookie|session|credential|signature|tenant|owner|user[-_]?id|created[-_]?by|people|brain[-_]?id|contributor|edited[-_]?by|migration)/i;
const MAX_TEXT = 1200;

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(k)) continue;
      out[k] = sanitize(v);
    }
    return out;
  }
  if (typeof value === "string" && value.length > MAX_TEXT) return `${value.slice(0, MAX_TEXT)}…`;
  return value;
}

// Values to prove absent from the output; read from the private env file
// only when it exists, and never printed. Public entries (addresses, URLs,
// ids) share that file, so only names that mark a credential are checked.
const SECRET_NAME = /(KEY|SECRET|TOKEN|PASSWORD|PRIVATE|MNEMONIC|SUBJECT)/;
function secretValues() {
  const p = join(homedir(), "Documents", "wattness-secrets", "bnb-bangkok.env");
  if (!existsSync(p)) return [];
  const vals = [];
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m || !SECRET_NAME.test(m[1])) continue;
    const v = (m[2] ?? "").replace(/^["']|["']$/g, "");
    if (v.length >= 8) vals.push(v);
  }
  return vals;
}

if (existsSync(brainPath)) {
  const raw = readJson(brainPath);
  const list = (x, ...keys) => {
    if (Array.isArray(x)) return x;
    if (x && typeof x === "object") for (const k of keys) if (Array.isArray(x[k])) return x[k];
    return [];
  };
  const graph = raw.graph && typeof raw.graph === "object" ? raw.graph : {};
  writeJson(
    "brain.json",
    sanitize({
      schema: "grand-prix.brain.v1",
      brain: "Wattness Brain",
      pages: list(raw.pages, "data", "items", "pages"),
      connections: list(raw.connections, "data", "items", "connections"),
      graph: {
        nodes: list(graph, "nodes", "data"),
        edges: list(graph, "edges", "links", "connections"),
      },
      stats: raw.stats && !raw.stats.error ? raw.stats : null,
    }),
    "Living Brain API readback",
  );
} else if (kept.has("brain.json")) {
  copyVerbatim("brain.json", kept.get("brain.json"), "Living Brain API readback (kept)");
} else {
  console.warn("build-data: no Living Brain readback yet; brain.json is not written");
}

// ---------------------------------------------------------------- page modules

const context = {
  /** Absolute paths: the day directory read, the site, the repository, the output. */
  dayDir,
  site,
  repo,
  outDir,
  /** True when reading the full record, false on the two-leaf fixture. */
  full: useFull,
  /** The fleet index (gate-record.fleet.v1) and the per-battery summaries. */
  day,
  batteries,
  readJson,
  /** Load one leaf's manifest by resource, or null when the fixture lacks it. */
  leaf(resource) {
    const e = day.leaves.find((l) => l.resource === resource);
    const p = e && join(dayDir, e.manifest);
    return p && existsSync(p) ? readJson(p) : null;
  },
  /** writeJson(path under public/data, value, source label) */
  writeJson,
  copyVerbatim,
};

const modulesDir = join(here, "data");
if (existsSync(modulesDir)) {
  for (const name of readdirSync(modulesDir).filter((n) => n.endsWith(".mjs")).sort()) {
    const mod = await import(pathToFileURL(join(modulesDir, name)).href);
    if (typeof mod.default === "function") await mod.default(context);
  }
}

// ---------------------------------------------------------------- checks

const secrets = secretValues();
const EXCLUDED = /\b2026-(0[789])-(\d\d)\b/g;
let total = 0;
for (const f of written) {
  const text = readFileSync(join(outDir, f.path), "utf8");
  total += f.bytes;
  for (const s of secrets) if (text.includes(s)) throw new Error(`${f.path}: holds a private value; refusing to publish`);
  for (const m of text.matchAll(EXCLUDED)) {
    const d = m[0];
    if (d >= "2026-07-30" && d <= "2026-09-29") throw new Error(`${f.path}: names ${d}, an excluded day`);
  }
}

writeJson("files.json", {
  schema: "grand-prix.files.v1",
  builtFrom: useFull ? "record" : "fixture",
  files: written.slice(),
});
total += written[written.length - 1].bytes;

if (total > MAX_BYTES) throw new Error(`public/data is ${total} bytes, over the ${MAX_BYTES} byte budget`);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
for (const f of written) console.log(`${f.path.padEnd(44)} ${kb(f.bytes).padStart(10)}`);
console.log(`${"total".padEnd(44)} ${kb(total).padStart(10)}  (${useFull ? "record" : "fixture"}, ${batteries.length} of ${day.leaves.length} batteries)`);
