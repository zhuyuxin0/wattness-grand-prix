export const COURNOT_ORIGIN = "https://interface.cournot.ai";
export type MarketId = string | number;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface MarketInfo {
  id: MarketId;
  title: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  market_outcome?: string;
  market_outcome_price?: number;
  [key: string]: unknown;
}
export interface ResolvedMarket {
  matching_confidence: number | null;
  market_info: MarketInfo;
}
export interface CallEvidence {
  endpoint: string;
  request: Json;
  requestedAt: string;
  receivedAt: string;
  httpStatus: number;
  requestId: string | null;
  response: Json;
  transactionHashes: string[];
}
export interface ResolveResult {
  markets: ResolvedMarket[];
  evidence: CallEvidence;
}
export interface Assessment {
  market: MarketInfo;
  exactClaim: string;
  pointEstimate: number;
  result: Json;
  basis: Json;
  basisSourceTimes: string[];
  dataAgeMs: number | null;
  observedAt: string;
  billing: Json;
  evidence: CallEvidence;
}
export type ErrorKind = "input" | "payment_required" | "rate_limited" | "api_error" | "service_error" | "invalid_response";
export class CournotError extends Error {
  constructor(public readonly kind: ErrorKind, message: string, public readonly evidence?: CallEvidence) {
    super(message);
    this.name = "CournotError";
  }
}
type ObjectRecord = Record<string, unknown>;
const object = (v: unknown): v is ObjectRecord => v !== null && typeof v === "object" && !Array.isArray(v);
const validId = (v: unknown): v is MarketId =>
  (typeof v === "string" && v.trim().length > 0 && v.length <= 128) ||
  (typeof v === "number" && Number.isSafeInteger(v) && v >= 0);
const iso = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const probability = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

/** Preserve the response's evidence while removing credential and IP fields. */
export function sanitize(value: unknown): Json {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]");
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (object(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      key !== "api_key_quota" && /api.?key|authorization|payment.signature|secret|private.?key|^ip$/i.test(key) ? "[redacted]" : sanitize(item),
    ]));
  }
  return null;
}

function validateMessage(message: string): void {
  if (typeof message !== "string" || !message.trim() || message.length > 4000) {
    throw new CournotError("input", "A nonempty event description of at most 4000 characters is required.");
  }
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(message)) {
    throw new CournotError("input", "Event requests cannot contain email addresses.");
  }
}

function sourceTimes(value: unknown): string[] {
  const times: string[] = [];
  const walk = (v: unknown, key = ""): void => {
    if (/time|timestamp|as_of|updated_at/i.test(key) && iso(v)) times.push(new Date(v).toISOString());
    if (Array.isArray(v)) for (const item of v) walk(item);
    else if (object(v)) for (const [k, item] of Object.entries(v)) walk(item, k);
  };
  walk(value);
  return [...new Set(times)].sort();
}

export function parseAssessment(market: MarketInfo, evidence: CallEvidence): Assessment {
  const response = evidence.response;
  if (!object(response) || response.code !== 0 || !object(response.data)) {
    throw new CournotError("invalid_response", "A successful probability envelope was not returned.", evidence);
  }
  const data = response.data;
  if (data.answered === false) {
    throw new CournotError("invalid_response", "The oracle did not answer the event.", evidence);
  }
  const nested = object(data.probability) ? data.probability : null;
  const result = nested && object(nested.result) ? nested.result : object(data.result) ? data.result : null;
  const estimate = result?.point_estimate ?? nested?.point_estimate ?? data.probability;
  if (!probability(estimate)) {
    throw new CournotError("invalid_response", "A finite probability in [0, 1] was not returned.", evidence);
  }
  if (Array.isArray(data.markets)) {
    const ids = data.markets.map(v => object(v) ? (object(v.market_info) ? v.market_info.id : v.id) : null);
    if (!ids.some(id => String(id) === String(market.id))) {
      throw new CournotError("invalid_response", "Returned market identity does not match the selected event.", evidence);
    }
  }
  const basis = nested?.basis ?? data.basis ?? null;
  const times = sourceTimes(basis);
  const age = times.length ? Math.max(0, Date.parse(evidence.receivedAt) - Math.min(...times.map(Date.parse))) : null;
  return {
    market,
    exactClaim: market.title,
    pointEstimate: estimate,
    result: sanitize(result ?? data.probability),
    basis: sanitize(basis),
    basisSourceTimes: times,
    dataAgeMs: age,
    observedAt: evidence.receivedAt,
    billing: sanitize({ route: data.billing ?? null, freeQuota: data.free_quota ?? null, prepaidQuota: data.api_key_quota ?? null, charged: data.charged ?? null }),
    evidence,
  };
}

export class CournotClient {
  constructor(private readonly options: {
    apiKey?: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
  } = {}) {}

  private async call(operation: "resolve" | "probability", body: Json): Promise<CallEvidence> {
    const endpoint = COURNOT_ORIGIN + "/intelligence/v1/" + operation;
    const requestedAt = new Date().toISOString();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.options.apiKey) headers["COURNOT-API-KEY"] = this.options.apiKey;
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 30000),
      });
    } catch {
      throw new CournotError("service_error", "Request failed; billing outcome is unknown. No automatic retry was made.");
    }
    let raw: unknown;
    try { raw = await response.json(); }
    catch { raw = { invalidJson: true }; }
    const evidence: CallEvidence = {
      endpoint, request: sanitize(body), requestedAt, receivedAt: new Date().toISOString(),
      httpStatus: response.status, requestId: response.headers.get("x-request-id"),
      response: sanitize(raw), transactionHashes: [],
    };
    if (response.status === 402) throw new CournotError("payment_required", "No probability obtained: access or payment is required. This adapter does not sign or pay.", evidence);
    if (response.status === 429) throw new CournotError("rate_limited", "The oracle rate-limited this request. No automatic retry was made.", evidence);
    if (!response.ok) throw new CournotError("service_error", "The oracle returned an HTTP error; billing may be uncertain.", evidence);
    if (!object(raw) || raw.code !== 0) throw new CournotError("api_error", "The oracle did not return a successful API code.", evidence);
    return evidence;
  }

  async resolve(message: string, limit = 5): Promise<ResolveResult> {
    validateMessage(message);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new CournotError("input", "Resolve limit must be an integer between 1 and 10.");
    const evidence = await this.call("resolve", { message, limit });
    const envelope = evidence.response as ObjectRecord;
    const data = envelope.data;
    if (!object(data) || !Array.isArray(data.markets)) throw new CournotError("invalid_response", "Resolve did not return markets.", evidence);
    const markets: ResolvedMarket[] = data.markets.map(item => {
      if (!object(item) || !object(item.market_info) || !validId(item.market_info.id) || typeof item.market_info.title !== "string") {
        throw new CournotError("invalid_response", "Resolve returned a malformed market.", evidence);
      }
      return { market_info: item.market_info as MarketInfo, matching_confidence: typeof item.matching_confidence === "number" ? item.matching_confidence : null };
    });
    return { markets, evidence };
  }

  /** A selected resolved market is mandatory; the client never spends a call on an arbitrary search. */
  async assess(message: string, market: MarketInfo): Promise<Assessment> {
    validateMessage(message);
    if (!validId(market.id) || typeof market.title !== "string" || !market.title) throw new CournotError("input", "A selected resolved market is required.");
    const evidence = await this.call("probability", { message, market_ids: [market.id] });
    return parseAssessment(market, evidence);
  }
}

export interface ConditionalWeatherPolicy {
  id: string;
  label: string;
  baselineEventProbability: number;
  conditionalStressIfEvent: number;
  conditionalStressIfNotEvent: number;
  baseHedgeLimitMWh: number;
  scenarioHedgeLimitReduction: number;
  informationCutoff: string;
  appliedAt: string;
}
export interface WeatherRecommendation {
  policy: ConditionalWeatherPolicy;
  oracleEvent: { marketId: MarketId; claim: string; probability: number; observedAt: string };
  before: { eventProbability: number; stressScenarioWeight: number; hedgeLimitMWh: number };
  after: { eventProbability: number; stressScenarioWeight: number; hedgeLimitMWh: number };
  explanation: string;
  relationToExistingSeal: string;
}

/** A disclosed sensitivity policy; the assumed conditional model is not an oracle electricity forecast. */
export function applyWeatherPolicy(assessment: Assessment, policy: ConditionalWeatherPolicy): WeatherRecommendation {
  for (const x of [policy.baselineEventProbability, policy.conditionalStressIfEvent, policy.conditionalStressIfNotEvent, policy.scenarioHedgeLimitReduction]) {
    if (!probability(x)) throw new CournotError("input", "Policy probability/fraction is outside [0, 1].");
  }
  if (!Number.isFinite(policy.baseHedgeLimitMWh) || policy.baseHedgeLimitMWh < 0 ||
      !iso(policy.informationCutoff) || !iso(policy.appliedAt)) throw new CournotError("input", "Policy units or dates are invalid.");
  if (Date.parse(assessment.observedAt) > Date.parse(policy.informationCutoff)) {
    throw new CournotError("input", "Assessment became available after the mandate's information cutoff.");
  }
  if (Date.parse(policy.appliedAt) < Date.parse(assessment.observedAt)) {
    throw new CournotError("input", "A policy cannot use an assessment before it was observed.");
  }
  const compute = (p: number) => {
    const stressScenarioWeight = p * policy.conditionalStressIfEvent + (1 - p) * policy.conditionalStressIfNotEvent;
    return { eventProbability: p, stressScenarioWeight, hedgeLimitMWh: policy.baseHedgeLimitMWh * (1 - policy.scenarioHedgeLimitReduction * stressScenarioWeight) };
  };
  return {
    policy,
    oracleEvent: { marketId: assessment.market.id, claim: assessment.exactClaim, probability: assessment.pointEstimate, observedAt: assessment.observedAt },
    before: compute(policy.baselineEventProbability),
    after: compute(assessment.pointEstimate),
    explanation: "Cournot assesses the stated weather event. Wattness's explicitly assumed conditional model maps that event to a scenario weight and hedge-limit sensitivity; it is not a calibrated electricity-price forecast.",
    relationToExistingSeal: "This assessment was requested after the OD26 record was sealed. It is a later review/sensitivity and is not included in, or an amendment to, that immutable record.",
  };
}
