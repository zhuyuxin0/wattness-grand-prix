import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluate, reportDigest, DEFAULT_FIXTURE } from "./index.js";

const resource = "DSWL_ESS_ESR1";
const report = await evaluate({ resource, chain: "bsc-testnet" });
const dir = resolve(DEFAULT_FIXTURE, "../../evidence/agent-studio");
await mkdir(dir, { recursive: true });
await writeFile(resolve(dir, "live-testnet-evaluation.json"), JSON.stringify({
  observedAt: report.observedAt,
  request: { resource, chain: "bsc-testnet" },
  response: report,
  reportDigest: reportDigest(report),
  decision: report.status === "failed" ? "hold-for-review" : "accept-checks-with-listed-scope",
}, null, 2) + "\n");
process.stdout.write(JSON.stringify({ status: report.status, resource, checks: report.checks.map(x => ({ id: x.id, status: x.status })), digest: reportDigest(report) }) + "\n");
