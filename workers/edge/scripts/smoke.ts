// Calls every endpoint of a deployed Worker for operating day 2026-11-26 and records what came back.
//
//   node scripts/smoke.ts https://grand-prix-edge.<subdomain>.workers.dev [--out DIR]
//
// Each served file must hash to the SHA-256 the publisher recorded when it read the objects back from
// Greenfield (scripts/greenfield/published.json). With --out, writes DIR/smoke-<UTC time>.json: per request
// the status, the x-gate and cache headers, the SHA-256 of the body and the time taken. Exits 1 if any
// request did not answer as expected.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!/^https:\/\/[^\s/]+$/.test(base)) {
  console.error("usage: node scripts/smoke.ts https://<worker host> [--out DIR]");
  process.exit(2);
}
const outAt = process.argv.indexOf("--out");
const outDir = outAt > 0 ? process.argv[outAt + 1] : undefined;

const published = JSON.parse(readFileSync(fileURLToPath(new URL("../../../scripts/greenfield/published.json", import.meta.url)), "utf8")) as {
  files: { object: string; sha256: string }[];
};
const sha = new Map(published.files.map((f) => [f.object.replace("od-20261126/", ""), f.sha256]));
const ROOT = "0xf4d4002344fe98be0f64870221e5cc0b5e1d6111c05fe46c0131763d725bbce7";

interface Probe {
  path: string;
  method?: string;
  status: number;
  /** The Greenfield object whose recorded SHA-256 the body must have. */
  object?: string;
  verdict?: "pass";
  cache?: "hit";
}

const probes: Probe[] = [
  { path: "/", status: 200 },
  { path: "/day/2026-11-26/index.json", status: 200, object: "manifest.json" },
  { path: "/day/2026-11-26/index.json?envelope=1", status: 200 },
  { path: "/day/2026-11-26/index.json?network=bsc-testnet", status: 200, object: "manifest.json" },
  { path: "/day/2026-11-26/index.json?network=bsc-mainnet,bsc-testnet", status: 200, object: "manifest.json" },
  { path: "/day/2026-11-26/leaves/DSWL_ESS_ESR1.json", status: 200, object: "leaves/DSWL_ESS_ESR1.json" },
  { path: "/day/2026-11-26/leaves/DSWL_ESS_ESR1.scenarios.json", status: 200, object: "leaves/DSWL_ESS_ESR1.scenarios.json" },
  { path: "/day/2026-11-26/leaves/ABINDUST_ESR1.json", status: 200, object: "leaves/ABINDUST_ESR1.json" },
  { path: "/day/2026-11-26/record.bsc-mainnet.json", status: 200, object: "record.bsc-mainnet.json" },
  { path: "/day/2026-11-26/record.bsc-testnet.json", status: 200, object: "record.bsc-testnet.json" },
  { path: "/day/2026-11-26/root.hex", status: 200, object: "root.hex" },
  { path: "/day/2026-11-26/salt.txt", status: 200, object: "salt.txt" },
  { path: "/day/2026-11-26/sync/DSWL_ESS_ESR1.json", status: 404 },
  { path: "/day/2026-11-20/index.json", status: 404 },
  { path: "/verify/DSWL_ESS_ESR1?od=2026-11-26&network=bsc-mainnet", status: 200, verdict: "pass" },
  { path: "/verify/DSWL_ESS_ESR1?od=2026-11-26&network=bsc-testnet", status: 200, verdict: "pass" },
  { path: "/day/2026-11-26/leaves/DSWL_ESS_ESR1.json", method: "OPTIONS", status: 204 },
  { path: "/day/2026-11-26/leaves/DSWL_ESS_ESR1.json", status: 200, object: "leaves/DSWL_ESS_ESR1.json", cache: "hit" },
];

const results = [];
let failures = 0;
for (const p of probes) {
  const t0 = performance.now();
  const res = await fetch(`${base}${p.path}`, { method: p.method ?? "GET" });
  const body = new Uint8Array(await res.arrayBuffer());
  const ms = Math.round(performance.now() - t0);
  const digest = createHash("sha256").update(body).digest("hex");
  const headers = Object.fromEntries([...res.headers].filter(([k]) => k.startsWith("x-gate-") || k === "cache-control" || k === "cf-cache-status" || k.startsWith("access-control-allow-origin")));
  const problems: string[] = [];
  if (res.status !== p.status) problems.push(`status ${res.status}, expected ${p.status}`);
  if (p.object && digest !== sha.get(p.object)) problems.push(`body SHA-256 ${digest}, Greenfield's object ${sha.get(p.object)}`);
  if (p.object && res.headers.get("x-gate-root") !== ROOT) problems.push(`x-gate-root ${res.headers.get("x-gate-root")}`);
  let verdict: unknown;
  if (p.verdict) {
    const v = JSON.parse(new TextDecoder().decode(body)) as { verdict: string; checks: { name: string; result: string }[] };
    verdict = { verdict: v.verdict, checks: Object.fromEntries(v.checks.map((c) => [c.name, c.result])) };
    if (v.verdict !== p.verdict) problems.push(`verdict ${v.verdict}`);
  }
  if (p.cache && res.headers.get("x-gate-cache") !== p.cache && res.headers.get("cf-cache-status") !== "HIT") problems.push(`not answered from the edge cache (x-gate-cache ${res.headers.get("x-gate-cache")})`);
  if (problems.length > 0) failures++;
  results.push({ method: p.method ?? "GET", path: p.path, status: res.status, ms, bytes: body.length, sha256: digest, headers, ...(verdict ? { verdict } : {}), as_expected: problems.length === 0, problems });
  console.log(`${problems.length === 0 ? "ok  " : "FAIL"} ${res.status} ${String(ms).padStart(5)} ms  ${p.method ?? "GET"} ${p.path}${problems.length ? `  ${problems.join("; ")}` : ""}`);
}

const now = new Date();
const report = {
  schema: "gate-record.edge-smoke.v1",
  base_url: base,
  ran_at: now.toISOString(),
  ran_at_ct: now.toLocaleString("en-US", { timeZone: "America/Chicago", hour12: false }),
  operating_day: "2026-11-26",
  all_as_expected: failures === 0,
  results,
};
if (outDir) {
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `smoke-${now.toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`wrote ${file}`);
}
process.exit(failures === 0 ? 0 : 1);
