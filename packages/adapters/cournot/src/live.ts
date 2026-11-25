import { readFile, mkdir, writeFile } from "node:fs/promises";
import { CournotClient, CournotError, applyWeatherPolicy } from "./index.js";
import type { MarketInfo } from "./index.js";

async function main(): Promise<void> {
  const [resolveFile, marketId] = process.argv.slice(2);
  if (!resolveFile || !marketId) throw new Error("Usage: live <saved-resolve-evidence.json> <selected-market-id>");
  const saved = JSON.parse(await readFile(resolveFile, "utf8")) as {
    request: { message: string };
    response: { data: { markets: { market_info: MarketInfo }[] } };
  };
  const market = saved.response.data.markets.find(v => String(v.market_info.id) === marketId)?.market_info;
  if (!market) throw new Error("Selected market is absent from the saved live resolve response.");
  const client = new CournotClient();
  await mkdir("evidence/cournot", { recursive: true });
  try {
    const assessment = await client.assess(saved.request.message, market);
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
    });
    await writeFile("evidence/cournot/probability-live.json", JSON.stringify(assessment, null, 2) + "\n");
    await writeFile("evidence/cournot/decision-before-after.json", JSON.stringify(recommendation, null, 2) + "\n");
    console.log(JSON.stringify({ state: "complete", marketId: market.id, probability: assessment.pointEstimate, before: recommendation.before, after: recommendation.after, observedAt: assessment.observedAt }));
  } catch (error) {
    if (error instanceof CournotError) {
      await writeFile("evidence/cournot/probability-blocker.json", JSON.stringify({ kind: error.kind, message: error.message, evidence: error.evidence ?? null }, null, 2) + "\n");
      console.error(JSON.stringify({ state: error.kind, message: error.message }));
      process.exitCode = 2;
      return;
    }
    throw error;
  }
}
main().catch(() => { console.error("Live runner failed before obtaining an assessment. No retry or payment was attempted."); process.exitCode = 1; });
