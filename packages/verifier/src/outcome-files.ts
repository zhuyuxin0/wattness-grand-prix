import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { outcomeDocumentPath, type OutcomeIndex } from "@gatelock/core";
import type { OutcomeFile } from "./verify.js";

// How the CLI finds a record's outcomes on disk. A day's index: outcomes/stage-<n>/index.json beside it,
// and the battery's document that index lists. A single manifest: outcome-<n>.json beside it.

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

/** Each stage's index under `root`, with the battery's document when the index lists one (else doc is null). */
export function readStageOutcomes(root: string, resource: string, log: (line: string) => void = () => {}): OutcomeFile[] {
  const found: OutcomeFile[] = [];
  for (const stage of [1, 2, 3]) {
    const stageDir = join(root, `stage-${stage}`);
    const indexPath = join(stageDir, "index.json");
    if (!existsSync(indexPath)) continue;
    const index = readJson(indexPath) as Partial<OutcomeIndex>;
    const listed = Array.isArray(index.leaves) && index.leaves.some((l) => l?.resource === resource);
    // The path is fixed by name, never taken from the index, so an index cannot lead a reader outside the stage.
    const docPath = join(stageDir, outcomeDocumentPath(resource));
    const doc = listed && existsSync(docPath) ? readJson(docPath) : null;
    log(`outcome   stage ${stage}: ${indexPath}${listed ? "" : ` (lists no ${resource})`}`);
    found.push({ stage, doc, index });
  }
  return found;
}

/** outcome-<n>.json beside a one-leaf manifest. */
export function readLeafOutcomes(dir: string): OutcomeFile[] {
  return [1, 2, 3]
    .map((stage) => ({ stage, path: join(dir, `outcome-${stage}.json`) }))
    .filter((o) => existsSync(o.path))
    .map((o) => ({ stage: o.stage, doc: readJson(o.path) }));
}
