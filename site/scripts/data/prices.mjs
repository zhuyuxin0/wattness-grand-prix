// Prices data: BNB and USDT in US dollars from Atlas and CoinMarketCap, and the
// evaluation budget they price, as the Atlas and CoinMarketCap adapter
// (packages/adapters/atlas-cmc) reads and computes them.
//
// - Atlas: the signed Pull report the adapter records from Atlas's production
//   endpoint (its src/index.test.ts fixture, 25 Nov 2026 15:54:38 UTC). This
//   module decodes it the way the adapter does and recovers its signer, and
//   stops unless that is Atlas's published production signer.
// - CoinMarketCap: the Pro v3 quotes and the BSC-USDT security fields the
//   adapter's live run recorded with that report (evidence/atlas-cmc/
//   funding-decision.json on lane/atlas-cmc). The API needs a key, so the site
//   never calls it; these values are as recorded, each with its time.
// - The budget: the adapter's fundingDecision, ported line for line, run on
//   those inputs at the run's own clock. The build stops unless it gives the
//   decision the run recorded.
// - The on-chain feeds the page reads live in the browser (a view call, no
//   key): Atlas's BNB/USD and USDT/USD feeds on BSC testnet from Atlas's public
//   feed catalog, and the SingleFeed the adapter's live run reads.
// Written to public/data/prices.json. test/prices.test.mjs holds the port to
// the adapter's own test cases.

import { getAddress, keccak256, recoverAddress } from "viem";

export const ATLAS_SIGNER = "0x59eD4701224fD9e2a85Ef2946c2ab828C1dDC600";
export const FEEDS = { 633: "BNB", 649: "USDT" };

/** The production report, as packages/adapters/atlas-cmc/src/index.test.ts records it. */
export const RECORDED_ATLAS = {
  payload: "0x00000279001d22cd94418e07a0e600006b0704be0000028900000ddc4a7d8ed9ff1b00006b0704be02",
  signature:
    "0x3357f2ae8f26dd55019da14cd0c43febdc9ed637a8ce9e83d69c29f2684250527e85556449483c986c2c1e1967a5754b3d2aaf217cb703cefdd4f151115114191b",
  magicMarker: "0x7096",
  recordedAt: 1_795_622_078,
};

/** CoinMarketCap Pro v3 (USD, id 2781) as the same run recorded it. */
export const RECORDED_CMC = [
  { asset: "BNB", cmcId: 1839, priceUsd: 536.5417234113871, observedAtSeconds: 1_795_621_984, percentChange24h: -1.782070738165, volume24hUsd: 603924302.140191 },
  { asset: "USDT", cmcId: 825, priceUsd: 0.9986775747757998, observedAtSeconds: 1_795_621_984, percentChange24h: -0.013259745302, volume24hUsd: 59243122770.855255 },
];
export const RECORDED_SECURITY = {
  platform: "bsc",
  address: "0x55d398326f99059ff775485246999027b3197955",
  state: "available",
  flagged: false,
  verifiedContract: true,
  source: "W3W",
};
/** The run's clock when it priced the budget (its packet's observedAt, 15:54:39.788 UTC, in whole seconds). */
export const DECISION_NOW = 1_795_622_079;
export const TREASURY_BNB = 0.25;
export const EVALUATION_PRICE_CENTS = 200;
/** What the run recorded, for the build's check. */
const RECORDED_AFTER = {
  state: "priced",
  referenceValueUsdCents: 13413,
  baselineReserveFraction: 0.1,
  reserveFraction: 0.1356414147633,
  baselineEvaluationBudgetUsdCents: 12071,
  evaluationBudgetUsdCents: 11593,
  evaluationCount: 57,
};

// ---------------------------------------------------------------- the adapter's rules, ported

export function checkPrice(price, now, maxAge = 180, futureDrift = 60) {
  if (![now, maxAge, futureDrift].every(Number.isFinite) || maxAge < 0 || futureDrift < 0) throw new Error("Invalid freshness reference");
  if (!Number.isFinite(price.priceUsd)) throw new Error("Non-finite price");
  if (!(price.priceUsd > 0)) throw new Error("Non-positive price");
  if (!Number.isInteger(price.observedAtSeconds) || price.observedAtSeconds <= 0) throw new Error("Invalid price timestamp");
  if (price.observedAtSeconds > now + futureDrift) throw new Error("Future price");
  if (now - price.observedAtSeconds > maxAge) throw new Error("Stale price");
}

export function decodeAtlasPayload(payload) {
  if (!/^0x[0-9a-fA-F]+$/.test(payload)) throw new Error("Invalid Atlas payload hex");
  const hex = payload.slice(2);
  if (hex.length < 42 || hex.length % 2) throw new Error("Invalid Atlas payload length");
  const count = Number.parseInt(hex.slice(-2), 16);
  if (!count || hex.length !== count * 40 + 2) throw new Error("Atlas package count mismatch");
  const packages = [];
  for (let i = 0; i < count; i++) {
    const part = hex.slice(i * 40, (i + 1) * 40);
    const feedId = BigInt(`0x${part.slice(0, 8)}`).toString();
    if (packages.some((x) => x.feedId === feedId)) throw new Error("Duplicate Atlas feed");
    packages.push({ feedId, rawPrice: BigInt(`0x${part.slice(8, 28)}`), timestampSeconds: Number(BigInt(`0x${part.slice(28, 40)}`)) });
  }
  return packages;
}

export function fundingDecision({ treasuryBnb, atlas, cmc, security, now, evaluationPriceUsdCents }) {
  if (!Number.isFinite(treasuryBnb) || treasuryBnb < 0 || treasuryBnb > 1000) throw new Error("Invalid treasury quantity");
  for (const p of atlas) checkPrice(p, now);
  for (const p of cmc) {
    checkPrice(p, now, 300);
    if (!Number.isFinite(p.percentChange24h)) throw new Error("Invalid CMC 24-hour change");
  }
  const a = atlas.find((x) => x.asset === "BNB");
  const u = atlas.find((x) => x.asset === "USDT");
  const c = cmc.find((x) => x.asset === "BNB");
  if (!a || !u || !c) throw new Error("Missing funding data");
  const reasons = [];
  const deviation = Math.abs(a.priceUsd - c.priceUsd) / c.priceUsd;
  if (deviation > 0.05) reasons.push("BNB source deviation exceeds 5%");
  if (Math.abs(u.priceUsd - 1) > 0.01) reasons.push("USDT reference deviation exceeds 1%");
  if (security.state === "unknown") reasons.push("USDT vendor coverage unknown");
  else {
    if (security.flagged !== false) reasons.push("USDT vendor flag unresolved or requires review");
    if (security.verifiedContract !== true) reasons.push("USDT vendor contract verification unresolved or negative");
    if (!security.source?.trim()) reasons.push("USDT vendor source missing");
  }
  const state = reasons.length ? "review" : "priced";
  const baselineReserveFraction = 0.1;
  const reserveFraction = Math.min(0.5, baselineReserveFraction + (Math.abs(c.percentChange24h) / 100) * 2);
  const value = Math.floor(treasuryBnb * Math.min(a.priceUsd, c.priceUsd) * 100);
  const baseline = Math.floor(value * (1 - baselineReserveFraction));
  const budget = state === "priced" ? Math.floor(value * (1 - reserveFraction)) : 0;
  const cost = evaluationPriceUsdCents ?? 200;
  if (!Number.isSafeInteger(cost) || cost <= 0) throw new Error("Invalid evaluation price");
  return {
    state,
    referenceValueUsdCents: value,
    baselineReserveFraction,
    reserveFraction,
    baselineEvaluationBudgetUsdCents: baseline,
    evaluationBudgetUsdCents: budget,
    evaluationCount: Math.floor(budget / cost),
    deviation,
    reasons: state === "priced" ? ["Fresh signed Atlas prices and CMC quote", "Reserve adjusted by twice the absolute observed 24-hour BNB percentage move"] : reasons,
  };
}

/** The signed report's prices, checked the way verifyAtlasResponse checks them. */
export async function atlasPrices(report, now) {
  if (report.magicMarker !== "0x7096") throw new Error("Unexpected Atlas marker");
  const signer = await recoverAddress({ hash: keccak256(report.payload), signature: report.signature });
  if (getAddress(signer) !== getAddress(ATLAS_SIGNER)) throw new Error("Unauthorized Atlas signer");
  const packages = decodeAtlasPayload(report.payload);
  if (packages.length !== Object.keys(FEEDS).length) throw new Error("Unexpected Atlas feed count");
  const prices = packages.map((p) => {
    const asset = FEEDS[p.feedId];
    if (!asset) throw new Error("Unexpected Atlas feed");
    const price = { asset, priceUsd: Number(p.rawPrice) / 1e18, observedAtSeconds: p.timestampSeconds, source: "Atlas signed Pull", sourceId: p.feedId, raw: p.rawPrice.toString() };
    checkPrice(price, now);
    return price;
  });
  return { signer: getAddress(signer), prices };
}

// ---------------------------------------------------------------- the page's data

export default async function prices({ writeJson }) {
  const atlas = await atlasPrices(RECORDED_ATLAS, DECISION_NOW);
  const cmc = RECORDED_CMC.map((q) => ({ ...q, source: "CoinMarketCap Pro v3", sourceId: String(q.cmcId) }));
  const after = fundingDecision({ treasuryBnb: TREASURY_BNB, atlas: atlas.prices, cmc, security: RECORDED_SECURITY, now: DECISION_NOW, evaluationPriceUsdCents: EVALUATION_PRICE_CENTS });
  for (const [k, v] of Object.entries(RECORDED_AFTER)) {
    const got = after[k];
    if (typeof v === "number" ? Math.abs(got - v) > 1e-9 : got !== v) throw new Error(`prices: the ported rule gives ${k} ${got}; the run recorded ${v}`);
  }
  const usdtAtlas = atlas.prices.find((p) => p.asset === "USDT");
  writeJson(
    "prices.json",
    {
      schema: "grand-prix.prices.v1",
      atlas: {
        endpoint: "https://api.atlasoracle.io/report/v1/price/latest",
        report: RECORDED_ATLAS,
        signer: atlas.signer,
        publishedSigner: ATLAS_SIGNER,
        prices: atlas.prices.map(({ asset, priceUsd, observedAtSeconds, sourceId, raw }) => ({ asset, feedId: Number(sourceId), priceUsd, observedAtSeconds, raw })),
      },
      cmc: {
        endpoint: "https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/latest?id=1839,825&convert=USD",
        quotes: RECORDED_CMC,
        security: RECORDED_SECURITY,
      },
      agreement: {
        bnbDeviation: after.deviation,
        bnbLimit: 0.05,
        usdtFromDollar: Math.abs(usdtAtlas.priceUsd - 1),
        usdtLimit: 0.01,
      },
      decision: {
        now: DECISION_NOW,
        treasuryBnb: TREASURY_BNB,
        evaluationPriceUsdCents: EVALUATION_PRICE_CENTS,
        before: { state: "unpriced", evaluationBudgetUsdCents: null, evaluationCount: null },
        after,
      },
      limits: { atlasMaxAgeSeconds: 180, futureDriftSeconds: 60, cmcMaxAgeSeconds: 300, reserveCap: 0.5 },
      onChain: {
        chainId: 97,
        explorer: "https://testnet.bscscan.com",
        rpcs: ["https://bsc-testnet-dataseed.bnbchain.org", "https://bsc-testnet.bnbchain.org", "https://bsc-testnet-rpc.publicnode.com"],
        feeds: [
          { pair: "BNB/USD", feedId: 633, address: "0x3957d289ee9c38272377786787ea34f9dd29788d", heartbeatSeconds: 60, deviationPct: 1, from: "catalog" },
          { pair: "USDT/USD", feedId: 649, address: "0x9dfd7992952bb9e8fb4bc6065fdc3518addc4e8b", heartbeatSeconds: 86400, deviationPct: 5, from: "catalog" },
          { pair: null, feedId: null, address: "0xb3d1614bf894e68add1ea50ca250c152bad5256f", heartbeatSeconds: null, deviationPct: null, from: "adapter" },
        ],
      },
    },
    "packages/adapters/atlas-cmc (its recorded report and rule), the run's recorded CoinMarketCap quotes (scripts/data/prices.mjs)",
  );
}
