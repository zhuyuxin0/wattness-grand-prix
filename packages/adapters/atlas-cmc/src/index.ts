import { getAddress, keccak256, recoverAddress } from "viem";
import type { Hex } from "viem";

export const ATLAS_ORIGIN = "https://api.atlasoracle.io/report";
export const ATLAS_SIGNER = "0x59eD4701224fD9e2a85Ef2946c2ab828C1dDC600";
export const CMC_ORIGIN = "https://pro-api.coinmarketcap.com";
export const BNB_FEED_ID = "633";
export const USDT_FEED_ID = "649";
export const BSC_USDT = "0x55d398326f99059ff775485246999027b3197955";
export const TESTNET_SINGLE_FEED = "0xb3d1614bf894e68add1ea50ca250c152bad5256f";

export interface Price {
  asset: "BNB" | "USDT";
  priceUsd: number;
  observedAtSeconds: number;
  source: string;
  sourceId: string;
}
export interface CmcQuote extends Price {
  percentChange24h: number;
  volume24hUsd: number | null;
}
export interface SecurityCoverage {
  state: "available" | "unknown";
  flagged: boolean | null;
  verifiedContract: boolean | null;
  source: string | null;
  reason: string;
}
export interface AuditRecord {
  observedAt: string;
  method: string;
  endpoint: string;
  request: unknown;
  httpStatus: number;
  requestId?: string;
  response: unknown;
}
export type AuditSink = (record: AuditRecord) => void;

const obj = (x: unknown): Record<string, unknown> => {
  if (x === null || typeof x !== "object" || Array.isArray(x)) throw new Error("Expected JSON object");
  return x as Record<string, unknown>;
};
const finite = (x: unknown, label: string): number => {
  const n = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
  if (!Number.isFinite(n)) throw new Error("Invalid " + label);
  return n;
};
export function checkPrice(price: Price, now: number, maxAge = 180, futureDrift = 60): void {
  // NaN compares false both ways, so an invalid clock would pass every freshness check.
  if (![now, maxAge, futureDrift].every(Number.isFinite) || maxAge < 0 || futureDrift < 0) throw new Error("Invalid freshness reference");
  if (!Number.isFinite(price.priceUsd)) throw new Error("Non-finite price");
  if (!(price.priceUsd > 0)) throw new Error("Non-positive price");
  if (!Number.isInteger(price.observedAtSeconds) || price.observedAtSeconds <= 0) throw new Error("Invalid price timestamp");
  if (price.observedAtSeconds > now + futureDrift) throw new Error("Future price");
  if (now - price.observedAtSeconds > maxAge) throw new Error("Stale price");
}
export function sanitize(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === "string") return secrets.reduce((s, key) => key ? s.split(key).join("[REDACTED]") : s, value);
  if (Array.isArray(value)) return value.map(x => sanitize(x, secrets));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [
      k, /authorization|api.?key|subject.?id/i.test(k) ? "[REDACTED]" : sanitize(v, secrets),
    ]));
  }
  return value;
}

async function jsonRequest(endpoint: string, method: string, headers: Record<string, string>, request: unknown, key: string, audit: AuditSink, transport: typeof fetch): Promise<unknown> {
  const response = await transport(endpoint, {
    method, headers, ...(method === "POST" ? { body: JSON.stringify(request) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let body: unknown;
  try { body = JSON.parse(text) as unknown; } catch { body = { nonJsonResponse: text.slice(0, 300) }; }
  const requestId = response.headers.get("x-request-id") ?? response.headers.get("request-id");
  audit({ observedAt: new Date().toISOString(), method, endpoint, request, httpStatus: response.status, ...(requestId ? { requestId } : {}), response: sanitize(body, [key]) });
  if (!response.ok) throw new Error("HTTP " + response.status + " from " + new URL(endpoint).hostname);
  if (!Array.isArray(body)) {
    const status = obj(body).status;
    if (status && String(obj(status).error_code ?? "0") !== "0") {
      throw new Error("API business failure " + String(obj(status).error_code));
    }
  }
  return body;
}

export interface AtlasPackage { feedId: string; rawPrice: bigint; timestampSeconds: number }
export function decodeAtlasPayload(payload: Hex): AtlasPackage[] {
  if (!/^0x[0-9a-fA-F]+$/.test(payload)) throw new Error("Invalid Atlas payload hex");
  const hex = payload.slice(2);
  if (hex.length < 42 || hex.length % 2) throw new Error("Invalid Atlas payload length");
  const count = Number.parseInt(hex.slice(-2), 16);
  if (!count || hex.length !== count * 40 + 2) throw new Error("Atlas package count mismatch");
  const packages: AtlasPackage[] = [];
  for (let i = 0; i < count; i++) {
    const part = hex.slice(i * 40, (i + 1) * 40);
    const feedId = BigInt("0x" + part.slice(0, 8)).toString();
    if (packages.some(x => x.feedId === feedId)) throw new Error("Duplicate Atlas feed");
    packages.push({ feedId, rawPrice: BigInt("0x" + part.slice(8, 28)), timestampSeconds: Number(BigInt("0x" + part.slice(28, 40))) });
  }
  return packages;
}
export async function verifyAtlasResponse(body: unknown, expected: Readonly<Record<string, "BNB" | "USDT">>, now: number, expectedSigner = ATLAS_SIGNER): Promise<Price[]> {
  const data = obj(obj(body).data);
  if (data.magicMarker !== "0x7096") throw new Error("Unexpected Atlas marker");
  const payload = data.payload;
  const signature = data.signature;
  if (typeof payload !== "string" || typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error("Missing Atlas signature");
  const signer = await recoverAddress({ hash: keccak256(payload as Hex), signature: signature as Hex });
  if (getAddress(signer) !== getAddress(expectedSigner)) throw new Error("Unauthorized Atlas signer");
  const packages = decodeAtlasPayload(payload as Hex);
  if (packages.length !== Object.keys(expected).length) throw new Error("Unexpected Atlas feed count");
  return packages.map(p => {
    const asset = expected[p.feedId];
    if (!asset) throw new Error("Unexpected Atlas feed");
    const price: Price = { asset, priceUsd: Number(p.rawPrice) / 1e18, observedAtSeconds: p.timestampSeconds, source: "Atlas signed Pull", sourceId: p.feedId };
    checkPrice(price, now);
    return price;
  });
}
export class AtlasClient {
  #key: string;
  constructor(key: string, private readonly audit: AuditSink = () => {}, private readonly transport: typeof fetch = fetch) { this.#key = key; }
  async latest(now = Math.floor(Date.now() / 1000)): Promise<{ raw: unknown; prices: Price[] }> {
    const raw = await jsonRequest(ATLAS_ORIGIN + "/v1/price/latest", "POST", { "X-API-KEY": this.#key, "Content-Type": "application/json" }, { feedIds: [BNB_FEED_ID, USDT_FEED_ID], signed: true }, this.#key, this.audit, this.transport);
    return { raw, prices: await verifyAtlasResponse(raw, { [BNB_FEED_ID]: "BNB", [USDT_FEED_ID]: "USDT" }, now) };
  }
}
export function parseCmcQuotes(body: unknown, now: number): CmcQuote[] {
  const data = obj(body).data;
  if (!Array.isArray(data)) throw new Error("Expected CMC v3 data array");
  return (["1839", "825"] as const).map(id => {
    const record = data.find(x => String(obj(x).id) === id);
    if (!record) throw new Error("Missing CMC quote " + id);
    const recordObject = obj(record);
    if (!Array.isArray(recordObject.quote)) throw new Error("Missing CMC quote array");
    const quote = recordObject.quote.find(x => String(obj(x).id) === "2781");
    if (!quote) throw new Error("Missing CMC USD quote");
    const q = obj(quote);
    const price: CmcQuote = {
      asset: id === "1839" ? "BNB" : "USDT",
      priceUsd: finite(q.price, "CMC price"),
      observedAtSeconds: Math.floor(Date.parse(String(q.last_updated)) / 1000),
      source: "CoinMarketCap Pro v3",
      sourceId: id,
      percentChange24h: finite(q.percent_change_24h, "CMC 24-hour change"),
      volume24hUsd: q.volume_24h == null ? null : finite(q.volume_24h, "CMC turnover"),
    };
    checkPrice(price, now, 300);
    return price;
  });
}
export function parseSecurity(body: unknown): SecurityCoverage {
  const raw = Array.isArray(body) ? body : obj(body).data;
  const rows = Array.isArray(raw) ? raw : [];
  const first = rows.find(x => {
    const row = obj(x);
    return String(row.platformName).toLowerCase() === "bsc" && String(row.tokenContractAddress).toLowerCase() === BSC_USDT;
  });
  if (!first || obj(first).exist === false) return { state: "unknown", flagged: null, verifiedContract: null, source: null, reason: "No indexed vendor record" };
  const extra = obj(obj(first).extra ?? {});
  const flagged = typeof extra.isFlaggedByVendor === "boolean" ? extra.isFlaggedByVendor : null;
  const verifiedContract = typeof extra.isVerified === "boolean" ? extra.isVerified : null;
  const source = typeof extra.source === "string" && extra.source.trim() ? extra.source.trim() : null;
  const complete = flagged !== null && verifiedContract !== null && source !== null;
  return {
    state: complete ? "available" : "unknown",
    flagged,
    verifiedContract,
    source,
    reason: complete ? "Specific vendor fields, not an investment-safety certification" : "Incomplete vendor fields",
  };
}
export class CmcClient {
  #key: string;
  constructor(key: string, private readonly audit: AuditSink = () => {}, private readonly transport: typeof fetch = fetch) { this.#key = key; }
  async quotes(now = Math.floor(Date.now() / 1000)): Promise<CmcQuote[]> {
    const raw = await jsonRequest(CMC_ORIGIN + "/v3/cryptocurrency/quotes/latest?id=1839,825&convert=USD", "GET", { "X-CMC_PRO_API_KEY": this.#key, Accept: "application/json" }, null, this.#key, this.audit, this.transport);
    return parseCmcQuotes(raw, now);
  }
  async security(): Promise<SecurityCoverage> {
    const raw = await jsonRequest(CMC_ORIGIN + "/v1/dex/security/detail?platformName=bsc&address=" + BSC_USDT, "GET", { "X-CMC_PRO_API_KEY": this.#key, Accept: "application/json" }, null, this.#key, this.audit, this.transport);
    return parseSecurity(raw);
  }
}

export interface FundingDecision {
  state: "priced" | "review";
  basis: string;
  referenceValueUsdCents: number;
  baselineReserveFraction: number;
  reserveFraction: number;
  baselineEvaluationBudgetUsdCents: number;
  evaluationBudgetUsdCents: number;
  evaluationCount: number;
  reasons: string[];
}
export function fundingDecision(input: { treasuryBnb: number; atlas: readonly Price[]; cmc: readonly CmcQuote[]; security: SecurityCoverage; now: number; evaluationPriceUsdCents?: number }): FundingDecision {
  const { treasuryBnb, atlas, cmc, security, now } = input;
  if (!Number.isFinite(treasuryBnb) || treasuryBnb < 0 || treasuryBnb > 1000) throw new Error("Invalid treasury quantity");
  for (const p of atlas) checkPrice(p, now);
  for (const p of cmc) {
    checkPrice(p, now, 300);
    if (!Number.isFinite(p.percentChange24h)) throw new Error("Invalid CMC 24-hour change");
  }
  const a = atlas.find(x => x.asset === "BNB"), u = atlas.find(x => x.asset === "USDT"), c = cmc.find(x => x.asset === "BNB");
  if (!a || !u || !c) throw new Error("Missing funding data");
  const reasons: string[] = [];
  const deviation = Math.abs(a.priceUsd - c.priceUsd) / c.priceUsd;
  if (deviation > .05) reasons.push("BNB source deviation exceeds 5%");
  if (Math.abs(u.priceUsd - 1) > .01) reasons.push("USDT reference deviation exceeds 1%");
  if (security.state === "unknown") reasons.push("USDT vendor coverage unknown");
  else {
    if (security.flagged !== false) reasons.push("USDT vendor flag unresolved or requires review");
    if (security.verifiedContract !== true) reasons.push("USDT vendor contract verification unresolved or negative");
    if (!security.source?.trim()) reasons.push("USDT vendor source missing");
  }
  const state = reasons.length ? "review" : "priced";
  // Observed daily movement sets a disclosed reserve rule, not a forecast of volatility.
  const baselineReserveFraction = .10;
  const reserveFraction = Math.min(.50, baselineReserveFraction + Math.abs(c.percentChange24h) / 100 * 2);
  const value = Math.floor(treasuryBnb * Math.min(a.priceUsd, c.priceUsd) * 100);
  const baseline = Math.floor(value * (1 - baselineReserveFraction));
  const budget = state === "priced" ? Math.floor(value * (1 - reserveFraction)) : 0;
  const cost = input.evaluationPriceUsdCents ?? 200;
  if (!Number.isSafeInteger(cost) || cost <= 0) throw new Error("Invalid evaluation price");
  return {
    state,
    basis: "Reference pricing of a BNB-denominated evaluation budget; testnet funds have no cash-redemption value",
    referenceValueUsdCents: value,
    baselineReserveFraction,
    reserveFraction,
    baselineEvaluationBudgetUsdCents: baseline,
    evaluationBudgetUsdCents: budget,
    evaluationCount: Math.floor(budget / cost),
    reasons: state === "priced" ? ["Fresh signed Atlas prices and CMC quote", "Reserve adjusted by twice the absolute observed 24-hour BNB percentage move"] : reasons,
  };
}
