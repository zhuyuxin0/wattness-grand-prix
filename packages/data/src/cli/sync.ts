#!/usr/bin/env node
// Fetches and caches the plan's inputs, then writes a snapshot that pins them.
//   data:sync [--resource CLO_ESR1] [--from 2026-09-30] [--offline] [--snapshot <file>]
import { parseArgs } from "node:util";
import { DataError } from "../errors.js";
import { HISTORY_START } from "../excluded-days.js";
import { type PlanInputs, latestSnapshotPath, loadPlanInputs, readSnapshot, writeSnapshot } from "../inputs.js";
import type { PointDay } from "../prices.js";
import { defaultCacheDir } from "../store.js";

const { values } = parseArgs({
  options: {
    resource: { type: "string", default: "CLO_ESR1" },
    from: { type: "string", default: HISTORY_START },
    offline: { type: "boolean", default: false },
    snapshot: { type: "string" },
  },
});

const cacheDir = defaultCacheDir();
const snapshotPath = values.snapshot ?? (values.offline ? latestSnapshotPath(cacheDir) : undefined);

try {
  const { inputs, snapshot } = await loadPlanInputs({
    resource: values.resource,
    historyFrom: values.from,
    cacheDir,
    offline: values.offline,
    ...(snapshotPath ? { snapshot: readSnapshot(snapshotPath) } : {}),
  });
  report(inputs);
  if (snapshotPath) {
    console.log(`replayed  ${snapshotPath}`);
  } else {
    console.log(`snapshot  ${writeSnapshot(snapshot, cacheDir).path}`);
  }
} catch (e) {
  if (e instanceof DataError || (e instanceof Error && e.name === "ExcludedDayError")) {
    console.error(`data:sync: ${e.message}`);
    process.exit(1);
  }
  throw e;
}

function span(days: readonly PointDay[]): string {
  if (days.length === 0) return "none";
  const published = (d: PointDay, k: "da" | "rtHourly") => d[k].every((h) => h.grade === "published");
  const da = days.filter((d) => published(d, "da")).length;
  const rt = days.filter((d) => published(d, "rtHourly")).length;
  return `${days[0]?.day}..${days.at(-1)?.day} (${days.length} days; DA published ${da}, RT published ${rt})`;
}

function report(inputs: PlanInputs): void {
  const { release, battery, live } = inputs;
  console.log(`release   ${release.dataRelease} manifest ${release.dataManifestSha256}`);
  console.log(
    `battery   ${battery.resource} at ${battery.settlementPoint}, hub ${battery.hub}, ${battery.zone}, ${battery.county ? `${battery.county} County` : "no county"}; ` +
      `${battery.maxPowerKw} kW / ${battery.energyKwh} kWh (${battery.census.report} posted ${battery.census.posted})`,
  );
  console.log(`hub       ${battery.hub} ${span(inputs.hub)}`);
  console.log(`node      ${battery.settlementPoint} ${span(inputs.node)}`);
  for (const [i, pin] of live.pins.entries()) {
    const n = live.node[i];
    const h = live.hub[i];
    const priced = (p: typeof n) => p?.runs.filter((r) => r.lmp !== null).length ?? 0;
    console.log(`live      ${pin.day}: ${n?.runs.length ?? 0} runs through ${n?.through}; priced ${battery.settlementPoint} ${priced(n)}, ${battery.hub} ${priced(h)}`);
  }
  console.log(`files     ${inputs.files.length} inputs, ${inputs.trail.length} manifest/catalog files, all SHA-256 checked`);
}
