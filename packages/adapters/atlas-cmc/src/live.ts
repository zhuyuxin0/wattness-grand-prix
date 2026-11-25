import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createPublicClient, formatUnits, http, parseAbi } from "viem";
import { bscTestnet } from "viem/chains";
import { loadSecrets } from "@gatelock/core/secrets";
import { AtlasClient, CmcClient, TESTNET_SINGLE_FEED, checkPrice, fundingDecision, sanitize } from "./index.js";
import type { AuditRecord, Price, SecurityCoverage } from "./index.js";

// The default is the repository's evidence/atlas-cmc, whatever the working directory.
const { values: options } = parseArgs({ options: { out: { type: "string" } } });
const evidenceDirectory = options.out ? resolve(options.out) : fileURLToPath(new URL("../../../../evidence/atlas-cmc/", import.meta.url));
const local = (iso: string, timeZone: string): string => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}`;
};
const stamped = (iso: string) => ({ observedAt: iso, observedAtCt: local(iso, "America/Chicago"), observedAtBangkok: local(iso, "Asia/Bangkok") });
const audit: AuditRecord[] = [];
const keys = loadSecrets(["ATLAS_API_KEY", "CMC_PRO_API_KEY"]);
const secrets = [keys.ATLAS_API_KEY, keys.CMC_PRO_API_KEY];
const record = (x: AuditRecord): void => { audit.push(x); };
const atlas = new AtlasClient(keys.ATLAS_API_KEY, record);
const cmc = new CmcClient(keys.CMC_PRO_API_KEY, record);
const failures: { component: string; message: string }[] = [];
async function attempt<T>(component: string, fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch (e) {
    failures.push({ component, message: String(sanitize(e instanceof Error ? e.message : "Unknown error", secrets)) });
    return null;
  }
}
const [atlasResult, cmcResult, securityResult] = await Promise.all([
  attempt("Atlas signed Pull", () => atlas.latest()),
  attempt("CoinMarketCap Pro quotes", () => cmc.quotes()),
  attempt("CoinMarketCap Pro security", () => cmc.security()),
]);
const client = createPublicClient({ chain: bscTestnet, transport: http("https://bsc-testnet-dataseed.bnbchain.org", { retryCount: 0, timeout: 20_000 }) });
const abi = parseAbi([
  "function description() view returns (string)",
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
]);
const chainResult = await attempt("Atlas testnet SingleFeed", async () => {
  if (await client.getChainId() !== 97) throw new Error("Expected chain 97");
  const block = await client.getBlock();
  const [description, decimals, round] = await Promise.all([
    client.readContract({ address: TESTNET_SINGLE_FEED, abi, functionName: "description", blockNumber: block.number }),
    client.readContract({ address: TESTNET_SINGLE_FEED, abi, functionName: "decimals", blockNumber: block.number }),
    client.readContract({ address: TESTNET_SINGLE_FEED, abi, functionName: "latestRoundData", blockNumber: block.number }),
  ]);
  const price: Price = { asset: "BNB", priceUsd: Number(formatUnits(round[1], decimals)), observedAtSeconds: Number(round[3]), source: "Atlas BSC-testnet SingleFeed", sourceId: TESTNET_SINGLE_FEED };
  const rejectedReasons: string[] = [];
  if (!/BNB.*USD/i.test(description)) rejectedReasons.push("Description does not identify the expected BNB/USD instrument");
  try { checkPrice(price, Number(block.timestamp), 180); } catch (e) { rejectedReasons.push(e instanceof Error ? e.message : "Price validation failed"); }
  return {
    chainId: 97, endpoint: "https://bsc-testnet-dataseed.bnbchain.org", contract: TESTNET_SINGLE_FEED,
    description, decimals, blockNumber: block.number.toString(), blockHash: block.hash,
    blockTimestamp: Number(block.timestamp), round: round.map(x => x.toString()),
    rawDecodedPrice: price.priceUsd, sourceTimestamp: price.observedAtSeconds,
    ageSeconds: Number(block.timestamp) - price.observedAtSeconds,
    pricingEligible: rejectedReasons.length === 0, rejectedReasons,
    note: "Read-only eth_call; no transaction hash because no transaction was sent. Unknown instrument or stale prices are excluded from the funding calculation.",
  };
});
const now = Math.floor(Date.now() / 1000);
const security: SecurityCoverage = securityResult ?? { state: "unknown", flagged: null, verifiedContract: null, source: null, reason: "Live vendor query unavailable; inspect sanitized request evidence" };
const decision = atlasResult && cmcResult
  ? await attempt("Funding policy", async () => fundingDecision({ treasuryBnb: .25, atlas: atlasResult.prices, cmc: cmcResult, security, now }))
  : null;
const packet = {
  ...stamped(new Date().toISOString()),
  stage: "Live sponsor integration; reference-denominated planning only",
  treasuryInput: { bnbQuantity: .25, origin: "Declared demonstration planning budget, not an asserted wallet balance", evaluationPriceUsdCents: 200 },
  before: { state: "unpriced", evaluationBudgetUsdCents: null, evaluationCount: null, reason: "Await fresh signed prices and market/risk evidence" },
  after: decision,
  atlas: atlasResult?.prices ?? null,
  cmc: cmcResult,
  dataAgeSeconds: {
    atlas: atlasResult?.prices.map(p => ({ feedId: p.sourceId, ageSeconds: now - p.observedAtSeconds })) ?? null,
    cmc: cmcResult?.map(p => ({ sourceId: p.sourceId, ageSeconds: now - p.observedAtSeconds })) ?? null,
  },
  security,
  chainRead: chainResult,
  failures,
  transactions: [],
};
await mkdir(evidenceDirectory, { recursive: true });
await writeFile(resolve(evidenceDirectory, "live-requests.json"), JSON.stringify(sanitize(audit.map(({ observedAt, ...rest }) => ({ ...stamped(observedAt), ...rest })), secrets), null, 2) + "\n");
await writeFile(resolve(evidenceDirectory, "funding-decision.json"), JSON.stringify(sanitize(packet, secrets), null, 2) + "\n");
console.log(JSON.stringify({ evidenceDirectory, requests: audit.length, signedAtlas: !!atlasResult, cmcQuotes: !!cmcResult, cmcSecurity: !!securityResult, testnetRead: !!chainResult, testnetPricingEligible: chainResult?.pricingEligible ?? false, decision, failures }, null, 2));
if (!atlasResult || !cmcResult || !decision) process.exitCode = 1;
