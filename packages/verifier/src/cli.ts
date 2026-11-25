#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Address, Hex } from "viem";
import { resolveNetwork, rpcReader } from "./chain.js";
import { formatReport } from "./report.js";
import { httpFetcher } from "./sources.js";
import { FLEET_SCHEMA, fleetIndexErrors, leafOf, type FleetIndex } from "@gatelock/core";
import { verify, type Inclusion, type OutcomeFile, type RecordFile } from "./verify.js";

const USAGE = `usage: pnpm verify <manifest.json> | --manifest FILE | --od YYYY-MM-DD [options]

  <manifest.json> is a battery's manifest or a day's index (out/od-YYYYMMDD/manifest.json)
  --battery R                   with an index: check R's leaf and its Merkle proof (default: the showcase)

  --network local|bsc-testnet   chain to read (default bsc-testnet)
  --rpc URL                     try this RPC first
  --contract 0x...              GateRecord address (default: record.json, then contracts/deployments)
  --key 0x...                   record key (default: computed from the manifest)
  --scope LABEL                 scope label (default: record.json, then "<resource>/da-energy")
  --reference FILE              trusted copy to name changed fields (default: records/<day>/manifest.json)
  --offline                     no chain reads and no fetches
  --no-fetch                    read the chain but do not fetch inputs (skips V7)
  --no-chain                    fetch inputs but do not read the chain (skips V2, V3)

record.json, scenarios.json and outcome-<stage>.json are read from the manifest's directory.`;

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function findRepoRoot(from: string): string | null {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      od: { type: "string" },
      manifest: { type: "string" },
      battery: { type: "string" },
      scope: { type: "string" },
      network: { type: "string", default: "bsc-testnet" },
      rpc: { type: "string" },
      contract: { type: "string" },
      key: { type: "string" },
      reference: { type: "string" },
      offline: { type: "boolean", default: false },
      "no-fetch": { type: "boolean", default: false },
      "no-chain": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  // pnpm runs scripts from the workspace root; paths on the command line are relative to where it was typed.
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const repo = findRepoRoot(cwd);
  const given = values.manifest ?? positionals[0];
  let manifestPath = given
    ? resolve(cwd, given)
    : values.od && repo
      ? join(repo, "records", values.od, "manifest.json")
      : undefined;
  if (values.help || !manifestPath || positionals.length + (values.manifest ? 1 : 0) > 1) {
    console.error(USAGE);
    return values.help ? 0 : 2;
  }

  let manifest = readJson(manifestPath);
  let dir = dirname(resolve(manifestPath));
  const recordDir = dir;
  let inclusion: Inclusion | undefined;
  let scenariosOverride: string | undefined;
  let indexScope: string | undefined;
  if ((manifest as { schema?: unknown }).schema === FLEET_SCHEMA) {
    const index = manifest as FleetIndex;
    const problems = fleetIndexErrors(index);
    if (problems.length > 0) throw new Error(`index ${manifestPath}:\n  ${problems.join("\n  ")}`);
    const resource = values.battery ?? index.showcase ?? index.leaves[0]?.resource;
    if (!resource) throw new Error("index has no leaves");
    const { position, entry, proof } = leafOf(index, resource);
    inclusion = { index: position, size: index.leaf_count, proof };
    indexScope = index.scope_label;
    const leafPath = join(dir, entry.manifest);
    console.log(`index     ${manifestPath}`);
    console.log(`leaf      ${resource}, ${position + 1} of ${index.leaf_count}, audit path of ${proof.length} hashes`);
    if (index.exclusions.length > 0) console.log(`excluded  ${index.exclusions.length} batteries, listed in the index`);
    manifest = readJson(leafPath);
    scenariosOverride = join(dir, entry.scenarios);
    manifestPath = leafPath;
  } else if (values.battery) {
    throw new Error("--battery needs a day's index, not a single manifest");
  }
  const od = (manifest as { operating_day?: unknown }).operating_day;
  const canonicalDir = repo && typeof od === "string" && /^\d{4}-\d{2}-\d{2}$/.test(od) ? join(repo, "records", od) : null;
  const canonical = canonicalDir ? join(canonicalDir, "manifest.json") : null;
  const isCopy = canonical !== null && existsSync(canonical) && resolve(canonical) !== resolve(manifestPath);

  const referencePath = values.reference ? resolve(cwd, values.reference) : isCopy ? (canonical as string) : undefined;
  const reference = referencePath ? readJson(referencePath) : undefined;

  // A copy elsewhere is checked against the reference record's metadata and scenarios.
  const beside = (name: string): string | undefined =>
    [dir, ...(referencePath ? [dirname(referencePath)] : [])].map((d) => join(d, name)).find((p) => existsSync(p));
  const recordPath = beside("record.json");
  const record = recordPath ? (readJson(recordPath) as RecordFile) : undefined;
  const scenariosPath = scenariosOverride && existsSync(scenariosOverride) ? scenariosOverride : beside("scenarios.json");
  const scenarios = scenariosPath ? readJson(scenariosPath) : undefined;
  const outcomes: OutcomeFile[] = [1, 2, 3]
    .map((stage) => ({ stage, path: join(dir, `outcome-${stage}.json`) }))
    .filter((o) => existsSync(o.path))
    .map((o) => ({ stage: o.stage, doc: readJson(o.path) }));

  const network = resolveNetwork(values.network as string, values.rpc);
  let contract = (values.contract ?? record?.contract) as Address | undefined;
  const deployment = repo ? join(repo, "contracts", "deployments", `${network.name}.json`) : null;
  if (!contract && deployment && existsSync(deployment)) {
    contract = (readJson(deployment) as { address?: Address }).address;
  }

  // Copies by hash: the committed mirror, then the data lane's cache. Used only for files the site no longer serves.
  const mirrorPaths = (sha256: string) =>
    repo
      ? [join(repo, "records", "data", `${sha256}.json`), join(process.env.GATE_CACHE_DIR ?? join(repo, "cache"), "sha256", sha256.slice(0, 2), sha256)]
      : [];
  const mirror = (sha256: string) => {
    const p = mirrorPaths(sha256).find((x) => existsSync(x));
    return p ? new Uint8Array(readFileSync(p)) : null;
  };

  // Files published beside the record (an outside input's saved response): the record's directory first,
  // then the manifest's own directory and its parent, then the reference's.
  const outsideFile = (route: string): Uint8Array | null => {
    const leafDir = dirname(resolve(manifestPath as string));
    const dirs = [recordDir, leafDir, dirname(leafDir), ...(referencePath ? [dirname(referencePath), dirname(dirname(referencePath))] : [])];
    const p = dirs.map((d) => join(d, route)).find((x) => existsSync(x));
    return p ? new Uint8Array(readFileSync(p)) : null;
  };

  console.log(`manifest  ${manifestPath}`);
  if (referencePath) console.log(`reference ${referencePath}`);
  console.log(values.offline || values["no-chain"] ? "network   not read" : `network   ${network.name} (chain ${network.chainId})`);
  console.log("");

  const results = await verify({
    manifest,
    scenarios,
    outcomes,
    reference,
    record,
    key: values.key as Hex | undefined,
    ...(values.scope ?? indexScope ? { scopeLabel: (values.scope ?? indexScope) as string } : {}),
    ...(inclusion ? { inclusion } : {}),
    outsideFile,
    chain: values.offline || values["no-chain"] ? null : { reader: rpcReader(network), network, contract },
    sources: values.offline || values["no-fetch"] ? null : { fetcher: httpFetcher, mirror },
  });
  console.log(formatReport(results));
  return results.some((r) => r.status === "FAIL") ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`${basename(process.argv[1] ?? "verify")}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  },
);
