// Writes submission/submit-pack.json in the shape of OpenFour's developer/startup/scripts/pack-submit.js
// (kind "openfour-submit-pack", version "1"): the preset's composition, sources, registration on the
// developer-owned Registry, and the token records from submission/tokens.json. Reads local files only.
//
//   node scripts/submit-pack.ts [--rev <commit holding the module source>]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const { values: args } = parseArgs({ options: { rev: { type: "string", default: "06d70b5f2d10c1cecac02252b1c5da30ca3efc36" } } });
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));

const dep = read("deployments/bsc-testnet.json");
const tokens = read("submission/tokens.json");
const fork = {
  TOKEN_STANDARD: "0x48f90f4115ab8ef5e9e882e46964405e86bb62323d676b602350fc8baef2637e",
  VAULT_BASIC: "0x3e7c54e066dccd796d82c61050797d9b41fc573ce6b95b1968fb6e21c9df315b",
  CURVE_BONDING: "0x0e4ee145a2864ef2ac97032a3c00ed121816998110d1cf364770093ce952cb47",
  TRADE_SIMPLE: "0x379c13a7faced71bfa110d4297fd89666ac21c3407816ab9ef26027c15dce10d",
  tokenImplId: "0x2b5b4abf986db939c949935971f5f7455d608538c86cb2537b616ef1755b7d47",
  validator: "0xD8590b6914d4D60FcCfe08A2087B9A3d3F2d6A70",
};
const schema = [
  ["agent", "address", "The wallet that seals the agent's plans in GateRecord"],
  ["scope", "bytes32", "keccak256 of the scope label; default gate-record/ercot-da-energy"],
  ["minOd", "uint32", "Earliest qualifying operating day, YYYYMMDD"],
  ["minLeafCount", "uint32", "Batteries the record must cover"],
  ["codeHash", "bytes32", "Required record code hash; zero accepts any"],
  ["outcomeStage", "uint8", "0: the sealed record; 1 to 3: that settlement stage must also be linked"],
  ["liquidityPredicate", "uint8", "0: sold out; 1: raised at least minQuoteRaised"],
  ["minQuoteRaised", "uint256", "Quote floor for predicate 1; 0 with predicate 0"],
].map(([name, abiType, hint]) => ({ name, abiType, hint }));

const pack = {
  kind: "openfour-submit-pack",
  version: "1",
  createdAt: tokens.readAtBlock.time.utc,
  gitRev: args.rev,
  repository: "https://github.com/zhuyuxin0/wattness-grand-prix",
  preset: {
    id: "evidence-gated-bonding-v1",
    name: dep.preset.name,
    description: "Bonding V1 token, vault, curve and trade; graduation needs the agent's sealed GateRecord record",
    path: "modules/openfour/deployments/bsc-testnet.json",
    modules: {
      token: { reuse: "TOKEN_STANDARD", moduleId: fork.TOKEN_STANDARD },
      vault: { reuse: "VAULT_BASIC", moduleId: fork.VAULT_BASIC },
      curve: { reuse: "CURVE_BONDING", moduleId: fork.CURVE_BONDING },
      trade: { reuse: "TRADE_SIMPLE", moduleId: fork.TRADE_SIMPLE },
      migrate: {
        contract: "EvidenceGatedMigrateModule",
        keySource: dep.module.tag,
        moduleKey: dep.module.key,
        kind: 4,
        version: "1.0.0",
        implementation: dep.module.implementation,
        beacon: dep.module.beacon,
        constructor: { gateRecord: dep.module.gateRecord, pairFactory: dep.module.pairFactory },
      },
      customData: null,
    },
    validator: { reuse: "Bonding V1", address: fork.validator },
    tokenImpl: { reuse: "fork", tokenImplId: fork.tokenImplId },
  },
  sources: [
    "modules/openfour/contracts/EvidenceGatedMigrateModule.sol",
    "modules/openfour/contracts/interfaces/OpenFour.sol",
    "modules/openfour/contracts/interfaces/IGateRecord.sol",
  ],
  tests: ["modules/openfour/test/migrate.test.ts", "modules/openfour/test/schema.test.ts"],
  compiler: { solc: "0.8.28", evmVersion: "cancun", optimizer: { enabled: true, runs: 200 }, viaIR: true },
  descriptor: { tag: dep.module.tag, tagId: dep.module.key.slice(0, 18), version: "1.0.0", schema: { kind: "migrate", version: 1, params: schema } },
  registration: {
    path: "modules/openfour/deployments/bsc-testnet.json",
    registry: dep.openFour.registry,
    core: dep.openFour.core,
    presetId: String(dep.preset.id),
    tokenImplId: fork.tokenImplId,
    moduleKeys: [dep.module.key],
    transactions: tokens.module.registration.map((t: { label: string; txHash: string; blockNumber: string }) => ({ label: t.label, txHash: t.txHash, blockNumber: t.blockNumber })),
  },
  forkRegistry: dep.openFour.registry,
  forkedWith: dep.openFour.forkedWith,
  tokens: tokens.tokens
    .filter((row: { presetId: string }) => row.presetId === String(dep.preset.id))
    .slice(0, 20)
    .map((row: Record<string, any>) => ({
      tokenAddress: row.tokenAddress,
      name: row.name,
      symbol: row.symbol,
      presetId: row.presetId,
      presetName: row.presetName,
      creator: row.creator,
      txHash: row.txHash,
      chainId: row.chainId,
      quoteAsset: row.quoteAsset,
      createdAt: row.createdAt,
      phase: row.phase,
      pair: row.pool.pair,
      evidence: { key: row.evidence.key, od: row.evidence.od, root: row.evidence.root },
      records: row.records.map((r: Record<string, any>) => ({ action: r.action, result: r.result, txHash: r.txHash, blockNumber: r.blockNumber, ct: r.time.ct, bangkok: r.time.bangkok })),
    })),
  tokensFile: "modules/openfour/submission/tokens.json",
  audit: "docs/sponsors/openfour-ai-audit.md",
  gameplay: "docs/sponsors/openfour-gameplay.md",
  frontend: {
    demo: "https://gp.wattness.tech/markets/launchpad",
    source: "site/src/pages/Launchpad/",
    note: "The Launchpad tab reads a launch with view calls (modules/openfour/src/launch-tower.ts); the standard create, buy, sell and migrate screens are unchanged.",
  },
  notes: [
    "Registered only on the developer-owned Registry above; production Registries are OpenFour's to write after review.",
    "Testnet only (chain 97); the tokens are testnet tokens.",
    "Fixes the audit lists (H-1, M-1 to M-4, L-3) are not deployed; they would be re-reviewed before an official registration.",
  ],
};

writeFileSync(join(root, "submission/submit-pack.json"), `${JSON.stringify(pack, null, 2)}\n`);
console.log(JSON.stringify({ written: "submission/submit-pack.json", tokens: pack.tokens.length, forkRegistry: pack.forkRegistry, presetId: pack.registration.presetId }));
