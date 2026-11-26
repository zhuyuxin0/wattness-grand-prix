import { existsSync } from "node:fs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CournotClient, CournotError, applyWeatherPolicy } from "./index.js";
import type { CommittedRecord, MarketInfo } from "./index.js";

const projectRoot = fileURLToPath(new URL("../../../../", import.meta.url));
// GATE_EVIDENCE_DIR points a run at a store outside the repository; the default is the repository's evidence/.
const evidenceDir = resolve(process.env.GATE_EVIDENCE_DIR ?? resolve(projectRoot, "evidence"), "cournot");
const defaultRecord = resolve(projectRoot, "fixtures/od-20261126/record.bsc-mainnet.json");
const usage = [
  "Usage: live resolve <event description> [limit]",
  "       live assess <saved-resolve.json> <selected-market-id> [record.json]",
].join("\n");

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const save = async (name: string, data: unknown) => {
  await mkdir(evidenceDir, { recursive: true });
  const path = resolve(evidenceDir, name);
  await writeFile(path, JSON.stringify(data, null, 2) + "\n");
  return path;
};

async function resolveEvent(message: string | undefined, limitArg: string | undefined): Promise<void> {
  if (!message) throw new Error(usage);
  const result = await new CournotClient().resolve(message, limitArg === undefined ? 5 : Number(limitArg));
  const path = await save("resolve-" + stamp() + ".json", result.evidence);
  console.log(JSON.stringify({
    state: "resolved", evidence: path,
    markets: result.markets.map(m => ({ id: m.market_info.id, title: m.market_info.title, end: m.market_info.end_time ?? null, confidence: m.matching_confidence })),
  }, null, 2));
}

/** The committed record a review sits beside: its block time, labeled by the sibling manifest's operating day. */
async function committedRecord(path: string): Promise<CommittedRecord> {
  const record = JSON.parse(await readFile(path, "utf8")) as { committedAt?: unknown; root?: unknown };
  if (!Number.isSafeInteger(record.committedAt) || typeof record.root !== "string") throw new Error("Record file lacks committedAt or root: " + path);
  const manifestPath = resolve(dirname(path), "manifest.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, "utf8")) as { operating_day?: unknown; root?: unknown } : null;
  const label = manifest && manifest.root === record.root && typeof manifest.operating_day === "string" ? manifest.operating_day : record.root;
  return { label, committedAt: new Date(Number(record.committedAt) * 1000).toISOString() };
}

async function assess(resolveFile: string | undefined, marketId: string | undefined, recordFile: string | undefined): Promise<void> {
  if (!resolveFile || !marketId) throw new Error(usage);
  const saved = JSON.parse(await readFile(resolveFile, "utf8")) as { request?: { message?: unknown }; response?: { data?: { markets?: unknown } } };
  const markets = saved.response?.data?.markets;
  if (typeof saved.request?.message !== "string" || !Array.isArray(markets)) throw new Error("Not a saved resolve response: " + resolveFile);
  const market = (markets as { market_info?: MarketInfo }[]).find(v => String(v.market_info?.id) === marketId)?.market_info;
  if (!market) throw new Error("Selected market is absent from the saved live resolve response.");
  const record = await committedRecord(recordFile ?? defaultRecord);
  try {
    const assessment = await new CournotClient().assess(saved.request.message, market);
    const appliedAt = new Date().toISOString();
    const recommendation = applyWeatherPolicy(assessment, {
      id: "weather-sensitivity-v1",
      label: "Declared illustrative weather-to-risk sensitivity",
      baselineEventProbability: .30,
      conditionalStressIfEvent: .80,
      conditionalStressIfNotEvent: .25,
      baseHedgeLimitMWh: 50,
      scenarioHedgeLimitReduction: .50,
      informationCutoff: appliedAt,
      appliedAt,
    }, record);
    await save("probability-live.json", assessment);
    await save("decision-before-after.json", recommendation);
    console.log(JSON.stringify({ state: "complete", marketId: market.id, probability: assessment.pointEstimate, before: recommendation.before, after: recommendation.after, observedAt: assessment.observedAt, relationToRecord: recommendation.relationToRecord?.statement ?? null }));
  } catch (error) {
    if (error instanceof CournotError) {
      await save("probability-blocker.json", { kind: error.kind, message: error.message, evidence: error.evidence ?? null });
      console.error(JSON.stringify({ state: error.kind, message: error.message }));
      process.exitCode = 2;
      return;
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "resolve") return resolveEvent(rest[0], rest[1]);
  if (command === "assess") return assess(rest[0], rest[1], rest[2]);
  // The original form: live <saved-resolve.json> <selected-market-id>
  return assess(command, rest[0], rest[1]);
}

main().catch((error: unknown) => {
  // This runner holds no key, so its own error messages are safe to print.
  const state = error instanceof CournotError ? error.kind : "failed";
  console.error(JSON.stringify({ state, message: error instanceof Error ? error.message : "Live runner failed", retried: false, paid: false }));
  process.exitCode = error instanceof CournotError ? 2 : 1;
});
