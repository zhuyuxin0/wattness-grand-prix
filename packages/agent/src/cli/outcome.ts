#!/usr/bin/env node
// Links a sealed day's outcome to its GateRecord, one stage at a time:
//   1 day-ahead settled     the release holds the operating day's day-ahead prices; opens at the gate
//   2 real-time provisional  the live tier's SCED runs for the day; opens when the day ends
//   3 real-time settled      a later release's first-published real-time hub prices; opens when the day ends
// Writes <dir>/outcomes/stage-<n>/: one gate-record.outcome.v1 per leaf, index.json with their root,
// summary.json, and link.<network>.json once a link is sent.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Address } from "viem";
import { loadContractsLib } from "../contracts-lib.js";
import { parseStage } from "../outcome.js";
import { releasePrices } from "../outcome-prices.js";
import { runOutcome } from "../outcome-run.js";

const USAGE = `usage: pnpm outcome --od YYYY-MM-DD --stage 1|2|3 [options]

  --network local|bsc-testnet|bsc-mainnet  chain holding the record (default bsc-testnet)
  --mainnet              required with --network bsc-mainnet
  --dry-run              simulate linkOutcome only (the default)
  --send                 sign and send the link
  --dir DIR              the planned day (default: out/od-YYYYMMDD, out/od-YYYYMMDD-<network>, or out/local/... for local)
  --out DIR              where this stage's documents go (default: <dir>/outcomes/stage-<n>)
  --contract 0x...       GateRecord address (default: record.json, then contracts/deployments)
  --rpc URL              try this RPC first

Exit 0 when simulated or linked, 1 when refused, 2 on a usage error, 3 when the stage's prices are not yet published.`;

function findRepoRoot(from: string): string {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    if (dirname(dir) === dir) throw new Error("not inside the gatelock workspace");
  }
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      od: { type: "string" },
      stage: { type: "string" },
      network: { type: "string", default: "bsc-testnet" },
      mainnet: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      send: { type: "boolean", default: false },
      dir: { type: "string" },
      out: { type: "string" },
      contract: { type: "string" },
      rpc: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help || !values.od || !values.stage) {
    console.error(USAGE);
    return values.help ? 0 : 2;
  }
  if (values.send && values["dry-run"]) {
    console.error("--send and --dry-run contradict each other");
    return 2;
  }
  let stage;
  try {
    stage = parseStage(values.stage);
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const repo = findRepoRoot(cwd);
  const result = await runOutcome({
    repo,
    operatingDay: values.od,
    stage,
    network: values.network as string,
    ...(values.rpc ? { rpc: values.rpc } : {}),
    mainnet: values.mainnet,
    send: values.send,
    ...(values.dir ? { dir: resolve(cwd, values.dir) } : {}),
    ...(values.out ? { out: resolve(cwd, values.out) } : {}),
    ...(values.contract ? { contract: values.contract as Address } : {}),
    prices: releasePrices(),
    lib: await loadContractsLib(repo),
  });
  return result.code;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`outcome: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
