import { readFile } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { leafOf, fleetIndexErrors, type FleetIndex } from "@gatelock/core";
import { verify, resolveNetwork, rpcReader, type RecordFile, type CheckResult } from "@gatelock/verifier";

export const RESOURCES = ["DSWL_ESS_ESR1", "CLO_ESR1"] as const;
export type Resource = typeof RESOURCES[number];
export interface EvaluationRequest { resource: Resource; chain?: "bsc-testnet" | "offline" }
export interface EvaluationReport {
  schema: "wattness.evaluation-report.v1";
  resource: Resource;
  observedAt: string;
  scope: "shadow-plan-evaluation";
  status: "failed" | "checks-passed-with-skips" | "checks-passed";
  record: { root: string; chainId: 97; operatingDay: string; gateUnix: number; planUnix: number };
  checks: CheckResult[];
  limitations: readonly string[];
}
export const DEFAULT_FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../fixtures/od-20261126");
export const LIMITATIONS = [
  "The plan is a shadow plan for a real ERCOT battery; plant operation is not established.",
  "A hedge entered at model fair value is an assumed scenario comparison, not executable trading profit.",
  "Offline evaluation skips chain and external-source checks; live chain checks read BSC testnet only.",
  "This report is produced after the original commitment and does not change that sealed plan.",
  "Checks establish their stated scopes, not personhood, persistent skill or future returns.",
] as const;

export function parseRequest(input: unknown): EvaluationRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Request must be an object");
  const doc = input as Record<string, unknown>;
  if (Object.keys(doc).some(k => !["resource", "chain"].includes(k))) throw new Error("Unknown request field");
  if (!RESOURCES.includes(doc.resource as Resource)) throw new Error("Resource is not in the approved fixture set");
  if (doc.chain !== undefined && doc.chain !== "bsc-testnet" && doc.chain !== "offline") throw new Error("Only BSC testnet or offline evaluation is allowed");
  return { resource: doc.resource as Resource, chain: doc.chain === "offline" ? "offline" : "bsc-testnet" };
}
async function json(path: string): Promise<unknown> { return JSON.parse(await readFile(path, "utf8")); }
function inside(root: string, path: string): string {
  const target = resolve(root, path);
  if (!target.startsWith(resolve(root) + sep)) throw new Error("Fixture path escapes its approved directory");
  return target;
}
export async function evaluate(request: EvaluationRequest, options: { fixtureDir?: string; checks?: typeof verify; now?: () => Date } = {}): Promise<EvaluationReport> {
  const checked = parseRequest(request);
  const root = options.fixtureDir ?? DEFAULT_FIXTURE;
  const rawIndex = await json(resolve(root, "manifest.json"));
  const errors = fleetIndexErrors(rawIndex);
  if (errors.length) throw new Error("Invalid fleet index: " + errors.join("; "));
  const index = rawIndex as FleetIndex;
  const leaf = leafOf(index, checked.resource);
  const manifest = await json(inside(root, leaf.entry.manifest));
  const scenarios = await json(inside(root, leaf.entry.scenarios));
  const record = await json(resolve(root, "record.bsc-testnet.json")) as RecordFile;
  if (record.chainId !== 97 || record.root !== index.root) throw new Error("Fixture receipt does not match the testnet fleet root");
  const network = resolveNetwork("bsc-testnet");
  const checks = await (options.checks ?? verify)({
    manifest, scenarios, reference: manifest, record, sources: null,
    inclusion: { index: leaf.position, size: index.leaf_count, proof: leaf.proof },
    chain: checked.chain === "offline" ? null : { reader: rpcReader(network), network },
  });
  return {
    schema: "wattness.evaluation-report.v1",
    resource: checked.resource,
    observedAt: (options.now?.() ?? new Date()).toISOString(),
    scope: "shadow-plan-evaluation",
    status: checks.some(x => x.status === "FAIL") ? "failed" : checks.some(x => x.status === "SKIP") ? "checks-passed-with-skips" : "checks-passed",
    record: { root: index.root, chainId: 97, operatingDay: index.operating_day, gateUnix: index.gate_unix, planUnix: index.plan_unix },
    checks,
    limitations: LIMITATIONS,
  };
}
export function reportDigest(report: EvaluationReport): string {
  return "0x" + createHash("sha256").update(JSON.stringify(report)).digest("hex");
}
export const AGENT_CARD = {
  name: "Wattness Evaluation",
  description: "Evaluates a committed shadow plan for an approved real ERCOT battery.",
  version: "0.0.0",
  skills: [{ id: "evaluate-shadow-plan", name: "Evaluate shadow plan", description: "Commitment, scenario and model checks with explicit limits." }],
};
