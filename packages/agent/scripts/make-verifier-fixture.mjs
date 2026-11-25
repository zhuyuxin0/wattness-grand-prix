// Regenerates packages/verifier/test/fixtures/engine-2026-11-26 from a cached data sync:
//   node packages/agent/scripts/make-verifier-fixture.mjs <sync snapshot.json>
// Fixed plan time, salt, wallet and source so the leaf hash in engine-output.test.ts stays pinned.
import { mkdirSync, writeFileSync } from "node:fs";
import { loadPlanInputs, readSnapshot } from "@gatelock/data";
import { fromData, plan } from "@gatelock/engine";

const snapshot = readSnapshot(process.argv[2]);
const { inputs } = await loadPlanInputs({ resource: snapshot.resource, snapshot, offline: true });
const p = await plan({
  kind: "test",
  operatingDay: "2026-11-26",
  planUnix: 1795615200,
  ...fromData(inputs),
  salt: `0x${"5a".repeat(32)}`,
  engine: { repo: "https://github.com/zhuyuxin0/gatelock", commit: "0".repeat(40), tree: "0".repeat(40) },
  agent: { wallet: "0x000000000000000000000000000000000000dEaD", erc8004Id: null },
});
const dir = new URL("../../verifier/test/fixtures/engine-2026-11-26/", import.meta.url);
mkdirSync(dir, { recursive: true });
const s = p.scenarios;
writeFileSync(new URL("manifest.json", dir), `${JSON.stringify(p.manifest, null, 2)}\n`);
writeFileSync(
  new URL("scenarios.json", dir),
  `${JSON.stringify({ basis_days: s.basisDays, history_days: s.historyDays, hub_sum4: s.scenarios.map((x) => x.hubSum4), node_cents: s.scenarios.map((x) => x.nodeCents) })}\n`,
);
