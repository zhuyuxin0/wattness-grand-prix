import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSecrets } from "@gatelock/core/secrets";
import { LivingBrain, MemoryError, redact, reviewFromMemory } from "./index.js";
import type { AuthMode, Evidence } from "./index.js";

// Raw credential values stay in the intended API headers, never in the packet.
const keyNames = ["LIVING_BRAIN_API_KEY", "LIVING_BRAIN_SUBJECT_ID"] as const;
const secrets = loadSecrets(keyNames);
const projectRoot = fileURLToPath(new URL("../../../../", import.meta.url));
// GATE_EVIDENCE_DIR points a run at a store outside the repository (its state.json
// names the brain to reuse); the default is the repository's evidence/.
const evidenceDir = resolve(process.env.GATE_EVIDENCE_DIR ?? resolve(projectRoot, "evidence"), "living-brain");
mkdirSync(evidenceDir, { recursive: true });
const statePath = resolve(evidenceDir, "state.json");
const fixtureDir = resolve(projectRoot, "fixtures/od-20261126");
const root = readFileSync(resolve(fixtureDir, "root.txt"), "utf8").trim();
if (!/^0x[0-9a-f]{64}$/i.test(root)) throw new MemoryError("Fixture root is invalid");
// The replay cutoff is the sealed plan's own time, read from the record it belongs to.
const manifest = JSON.parse(readFileSync(resolve(fixtureDir, "manifest.json"), "utf8")) as { root?: unknown; plan_unix?: unknown };
if (manifest.root !== root || !Number.isSafeInteger(manifest.plan_unix)) throw new MemoryError("Fixture manifest does not match its root");
const planCutoff = new Date(Number(manifest.plan_unix) * 1000).toISOString();
const asset = "DSWL_ESS_ESR1";
const state: { brainId?: string; authMode?: AuthMode; sources?: string[] } = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, "utf8")) as { brainId?: string; authMode?: AuthMode; sources?: string[] }
  : {};
const evidence: Evidence[] = [];
function createClient(authMode: AuthMode): LivingBrain {
  return new LivingBrain({
    apiKey: secrets.LIVING_BRAIN_API_KEY, subjectId: secrets.LIVING_BRAIN_SUBJECT_ID, authMode,
    onEvidence: entry => {
      evidence.push(entry);
      appendFileSync(resolve(evidenceDir, "requests.jsonl"), JSON.stringify(entry) + "\n");
    },
  });
}
const save = (name: string, data: unknown) => writeFileSync(resolve(evidenceDir, name), JSON.stringify(redact(data, [secrets.LIVING_BRAIN_API_KEY, secrets.LIVING_BRAIN_SUBJECT_ID]), null, 2) + "\n");
async function run(): Promise<void> {
  let mode = state.authMode ?? "bearer", writer = createClient(mode);
  if (!state.brainId) {
    try {
      state.brainId = (await writer.createBrain("Wattness " + asset + " review", "Public asset decision context and reviewed assumptions for shadow plans.")).id;
    } catch (error) {
      if (!(error instanceof MemoryError) || error.status !== 401 || mode !== "bearer") throw error;
      mode = "api-key"; writer = createClient(mode);
      state.brainId = (await writer.createBrain("Wattness " + asset + " review", "Public asset decision context and reviewed assumptions for shadow plans.")).id;
    }
    state.authMode = mode; save("state.json", state);
  }
  const brainId = state.brainId;
  const captures = [
    {
      origin: "wattness:" + asset + ":" + root + ":context-v1",
      label: asset + " committed shadow-plan context",
      content: "Asset " + asset + ". Operating day 2026-11-26. Root " + root + ". This record contains shadow plans for a real ERCOT battery. Keep commitment verified, inputs identified, model constraints checked, and result reproduced as distinct checks. A public record does not establish actual plant operation.",
    },
    {
      origin: "wattness:" + asset + ":" + root + ":entry-review-v1",
      label: asset + " reviewed hedge entry assumption",
      content: "Reviewed decision for " + asset + ", root " + root + ": the hedge entry is assumed at the model fair value. The result is a scenario comparison, not executable trading profit. For later reviews, label the assumed entry beside the result and require an observed executable quote before making a trading-profit claim. Preserve the source, version, and time of this reviewed rule.",
    },
  ];
  if (!state.sources || state.sources.length !== captures.length) {
    state.sources = [];
    for (const item of captures) {
      const captured = await writer.capture(brainId, item.content, item.label, item.origin);
      if (captured.brainId !== brainId) throw new MemoryError("Capture belongs to the wrong brain");
      state.sources.push(captured.id); save("state.json", state);
    }
  }
  const completed = [];
  for (const id of state.sources) completed.push(await writer.waitForCapture(brainId, id));
  save("ingestion.json", completed);

  // The reader has no writer-session state or local lesson body.
  const reader = createClient(mode);
  const query = asset + " assumed model fair value hedge entry scenario comparison";
  const cutoff = new Date().toISOString();
  const current = await reader.retrieveAt(brainId, query, cutoff);
  // The reader knows only the reviewed rule's public origin reference, never its text.
  const reviewedOrigin = captures[1]!.origin;
  const before = reviewFromMemory({ cutoff, pages: [], exclusions: [] }, reviewedOrigin);
  const after = reviewFromMemory(current, reviewedOrigin);
  const historical = await reader.retrieveAt(brainId, query, planCutoff);
  const graph = await reader.graph(brainId);
  save("handover.json", {
    asset, root, cutoff, writerSession: "capture-and-compile", readerSession: "fresh-client-retrieval",
    before, after, retrieval: current, historicalCutoffCheck: historical,
    dataAgeMs: current.pages.map(p => ({ slug: p.page.slug, ageMs: Date.parse(cutoff) - Date.parse(p.citation.availableAt) })),
    graph, transactionHashes: [],
  });
  if (after.classification !== "assumed-entry-scenario" || after.citations.length === 0) throw new MemoryError("Fresh session did not retrieve a supported review");
  if (historical.pages.length !== 0) throw new MemoryError("Historical cutoff admitted later memory");
  console.log(JSON.stringify({
    status: "handover-completed", authMode: mode, asset, root, planCutoff,
    pagesCited: after.citations.length, historicalPagesAdmitted: historical.pages.length,
    requests: evidence.length, evidenceDirectory: evidenceDir,
  }));
}
run().catch(error => {
  const failure = error instanceof MemoryError ? { error: error.message, status: error.status ?? null } : { error: "Live integration failed", status: null };
  save("failure.json", failure);
  console.error(JSON.stringify(failure));
  process.exitCode = 1;
});
