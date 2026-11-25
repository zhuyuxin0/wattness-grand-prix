#!/usr/bin/env node
// Plans one operating day and writes the record's files:
//   out/od-YYYYMMDD/manifest.json        the index: leaves in resource order, root, exclusions
//   out/od-YYYYMMDD/root.txt             the RFC 6962 root to commit
//   out/od-YYYYMMDD/leaves/<R>.json      each battery's gate-record.manifest.v1 (one leaf)
//   out/od-YYYYMMDD/leaves/<R>.scenarios.json
//   out/od-YYYYMMDD/sync/<R>.json        the data sync that pins each leaf's inputs
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { readSnapshot, type Snapshot } from "@gatelock/data";
import { centralClock, gateUnix } from "@gatelock/engine";
import { getAddress, type Hex } from "viem";
import { RESPONSE_ROUTE, describeReading, lastKeptCopy, readLive, readSavedCall } from "../cournot.js";
import { planDay, SHOWCASE } from "../plan-day.js";
import { sourceState } from "../source.js";
import { committerAddress, parseNetwork } from "../wallet.js";

const USAGE = `usage: pnpm plan --od YYYY-MM-DD [options]

  --network local|bsc-testnet|bsc-mainnet  chain the record is for (default bsc-testnet); sets the wallet and kind
  --fleet                every census battery with node prices in the window, not only ${SHOWCASE}
  --battery R            also plan R (repeatable)
  --salt 0x...           32-byte salt (default: out/<day>/salt.txt if present, else fresh)
  --plan-time UNIX       plan time (default: now); must be before the gate
  --offline              replay the syncs in out/<day>/sync with no network
  --out DIR              output directory (default: out/od-YYYYMMDD, or out/local/od-YYYYMMDD for local)
  --wallet 0x...         committer address (default: from the network)
  --erc8004-id ID        the planner's ERC-8004 agent id, written into every leaf (agent.erc8004_id)

  The risk officer (gate-record.weather-stress.v1), read before the plan time is stamped:
  --cournot FILE         a saved Cournot probability call; it is published beside the record
  --cournot live --cournot-resolve FILE --cournot-market ID
                         one probability call for market ID of a saved resolve response, then the plan
  Whatever the call does, the plan proceeds; the manifest says whether the reading was applied and why.`;

function findRepoRoot(from: string): string {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    if (dirname(dir) === dir) throw new Error("not inside the gatelock workspace");
  }
}

function writeJson(path: string, doc: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`);
  renameSync(tmp, path);
}

function stamp(unix: number): string {
  const bkk = new Date(unix * 1000).toLocaleString("sv-SE", { timeZone: "Asia/Bangkok", hourCycle: "h23" });
  return `${centralClock(unix)} (${bkk} Bangkok)`;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      od: { type: "string" },
      network: { type: "string", default: "bsc-testnet" },
      fleet: { type: "boolean", default: false },
      battery: { type: "string", multiple: true, default: [] },
      salt: { type: "string" },
      "plan-time": { type: "string" },
      offline: { type: "boolean", default: false },
      out: { type: "string" },
      wallet: { type: "string" },
      "erc8004-id": { type: "string" },
      cournot: { type: "string" },
      "cournot-resolve": { type: "string" },
      "cournot-market": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help || !values.od || !/^\d{4}-\d{2}-\d{2}$/.test(values.od)) {
    console.error(USAGE);
    return values.help ? 0 : 2;
  }
  const od = values.od;
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const repo = findRepoRoot(cwd);
  const network = parseNetwork(values.network as string);
  // Local proofs live apart from the record a real chain will hold.
  const dayDir = `od-${od.replaceAll("-", "")}`;
  const out = values.out ? resolve(cwd, values.out) : network === "local" ? join(repo, "out", "local", dayDir) : join(repo, "out", dayDir);
  if (existsSync(join(out, "record.json"))) {
    throw new Error(`${out} already holds a committed record (record.json); plan into another --out`);
  }

  const source = sourceState(repo);
  if (network !== "local" && source.dirty) {
    throw new Error(`the source tree is dirty or has no commit; a plan for ${network} must come from a clean commit`);
  }

  // Without --plan-time, plan time is stamped after every input has loaded (see planDay).
  const givenPlanUnix = values["plan-time"] ? Number(values["plan-time"]) : undefined;
  if (givenPlanUnix !== undefined && !Number.isSafeInteger(givenPlanUnix)) throw new Error("--plan-time must be a unix second");
  const gate = gateUnix(od);
  if (givenPlanUnix !== undefined && givenPlanUnix >= gate) {
    throw new Error(`plan time ${stamp(givenPlanUnix)} is not before the gate ${stamp(gate)}`);
  }

  const saltFile = join(out, "salt.txt");
  const salt = (values.salt ?? (existsSync(saltFile) ? readFileSync(saltFile, "utf8").trim() : `0x${randomBytes(32).toString("hex")}`)) as Hex;
  if (!/^0x[0-9a-f]{64}$/.test(salt)) throw new Error("salt must be 0x and 64 lowercase hex digits");
  const wallet = values.wallet ? getAddress(values.wallet) : committerAddress(network);
  const erc8004Id = values["erc8004-id"] ?? null;
  // An ERC-8004 agent id is a token id: a decimal uint256.
  if (erc8004Id !== null && !/^(0|[1-9][0-9]{0,77})$/.test(erc8004Id)) throw new Error("--erc8004-id must be a decimal agent id");
  if (values.cournot === "live" && !(values["cournot-resolve"] && values["cournot-market"])) {
    throw new Error("--cournot live needs --cournot-resolve FILE and --cournot-market ID");
  }
  if (values.cournot !== "live" && (values["cournot-resolve"] || values["cournot-market"])) {
    throw new Error("--cournot-resolve and --cournot-market go with --cournot live");
  }
  // Free probability calls are few: a record that already holds a response reuses it rather than calling again.
  if (values.cournot === "live" && existsSync(join(out, RESPONSE_ROUTE))) {
    throw new Error(`${join(out, RESPONSE_ROUTE)} already holds a Cournot response; plan with --cournot ${join(out, RESPONSE_ROUTE)} to reuse it`);
  }

  const snapshots = new Map<string, Snapshot>();
  if (values.offline) {
    const dir = join(out, "sync");
    if (!existsSync(dir)) throw new Error(`--offline needs ${dir} from an earlier plan`);
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const s = readSnapshot(join(dir, f));
      snapshots.set(s.resource, s);
    }
  }

  console.log(`operating day ${od}, gate ${stamp(gate)}`);
  console.log(`plan time     ${givenPlanUnix === undefined ? "stamped once every input has loaded" : stamp(givenPlanUnix)}`);
  console.log(`network       ${network}, committer ${wallet}`);
  console.log(`source        tree ${source.tree}${source.dirty ? " (dirty working tree)" : ""}, HEAD ${source.commit ?? "none"}`);
  if (erc8004Id !== null) console.log(`agent         ERC-8004 id ${erc8004Id}`);

  // The risk officer reads Cournot before any input loads, so the observation precedes the plan time.
  const cournot = values.cournot
    ? values.cournot === "live"
      ? await readLive({
          resolveFile: resolve(cwd, values["cournot-resolve"] as string),
          marketId: values["cournot-market"] as string,
          operatingDay: od,
          recordDir: out,
          // Outside out/, so removing the day's directory never loses a call.
          keepDir: join(process.env.GATE_EVIDENCE_DIR ?? join(repo, "cache"), "cournot"),
        })
      : readSavedCall(resolve(cwd, values.cournot), out)
    : undefined;
  if (cournot) console.log(`cournot       ${describeReading(cournot)}`);
  if (lastKeptCopy) console.log(`              a copy of the response is at ${lastKeptCopy}; a re-plan reuses it with --cournot <that file>`);
  console.log("");

  const started = performance.now();
  const day = await planDay({
    operatingDay: od,
    ...(givenPlanUnix === undefined ? {} : { planUnix: givenPlanUnix }),
    kind: network === "local" ? "test" : "prospective",
    salt,
    wallet,
    source: { commit: source.commit ?? "0".repeat(40), tree: source.tree },
    others: values.fleet ? "census" : (values.battery as string[]),
    snapshots,
    offline: values.offline,
    log: (line) => console.log(line),
    ...(cournot ? { cournot } : {}),
    erc8004Id,
  });

  for (const l of day.leaves) {
    writeJson(join(out, "leaves", `${l.resource}.json`), l.manifest);
    writeJson(join(out, "leaves", `${l.resource}.scenarios.json`), l.scenarios);
    writeJson(join(out, "sync", `${l.resource}.json`), l.snapshot);
  }
  writeJson(join(out, "manifest.json"), day.index);
  writeFileSync(join(out, "root.txt"), `${day.index.root}\n`);
  writeFileSync(saltFile, `${salt}\n`);

  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log("");
  console.log(`plan time     ${stamp(day.planUnix)}, ${gate - day.planUnix} s before the gate`);
  console.log(`leaves        ${day.index.leaf_count} (showcase ${day.index.showcase}), ${day.index.exclusions.length} excluded, ${seconds} s`);
  for (const e of day.index.exclusions.slice(0, 10)) console.log(`  excluded    ${e.resource}: ${e.reason}`);
  if (day.index.exclusions.length > 10) console.log(`  ... ${day.index.exclusions.length - 10} more in manifest.json`);
  console.log(`root          ${day.index.root}`);
  if (cournot) {
    const leaves = day.leaves.map((l) => (l.manifest.outside_inputs as { cournot: { status: string; reason: string | null } }).cournot);
    const applied = leaves.filter((c) => c.status === "applied").length;
    console.log(`cournot       applied on ${applied} of ${leaves.length} leaves${applied < leaves.length ? `; first reason: ${leaves.find((c) => c.status !== "applied")?.reason}` : ""}`);
  }
  console.log(`wrote         ${out}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`plan: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
