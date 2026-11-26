// What a plan records from one saved probability response, read the same way
// by the planner and by the verifier: the claim, the probability, the basis
// and the time it was received. Browser-safe: no secrets, no network.
import type { CournotBasis, WeatherClaim } from "@gatelock/core";
import { CournotError, parseAssessment, type CallEvidence, type MarketInfo } from "./index.js";

const MONTHS: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
// Kalshi's lower-tail minimum-temperature title, e.g.
// "Will the minimum temperature be <29° on Nov 26, 2026? (Yes: 28° or below)".
const TITLE = /^Will the minimum temperature be <(\d{1,3})° on ([A-Z][a-z]{2}) (\d{1,2}), (\d{4})\?/;
// Its rules text names the settlement station and repeats the date and threshold, e.g.
// "If the minimum temperature recorded at Dallas (CLIDFW) for Nov 26, 2026, is less than 29° fahrenheit ...".
const RULES = /minimum temperature recorded at [^()]*\(([A-Z0-9]{3,10})\) for ([A-Z][a-z]{2}) (\d{1,2}), (\d{4}), is less than (\d{1,3})°/;

function isoDay(month: string, day: string, year: string): string | null {
  const m = MONTHS[month];
  if (!m) return null;
  const d = new Date(Date.UTC(Number(year), m - 1, Number(day)));
  if (d.getUTCMonth() !== m - 1) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * The claim a Kalshi lower-tail minimum-temperature market makes, or null when
 * the market is anything else or its title and rules text disagree.
 */
export function parseClaim(market: MarketInfo): WeatherClaim | null {
  const t = TITLE.exec(market.title ?? "");
  const r = RULES.exec(typeof market.description === "string" ? market.description : "");
  if (!t || !r) return null;
  const date = isoDay(t[2] as string, t[3] as string, t[4] as string);
  if (!date || date !== isoDay(r[2] as string, r[3] as string, r[4] as string) || t[1] !== r[5]) return null;
  return {
    market_id: String(market.id),
    title: market.title,
    station: r[1] as string,
    measure: "minimum temperature",
    comparator: "<",
    threshold_f: Number(t[1]),
    date,
  };
}

const text = (v: unknown, max: number): string | null => (typeof v === "string" ? (v.length > max ? `${v.slice(0, max - 3)}...` : v) : null);

/** The basis as a list of {source, time, summary, url}; a structured (non-list) basis stays in the response file. */
export function basisItems(basis: unknown): CournotBasis[] {
  if (!Array.isArray(basis)) return [];
  return basis
    .filter((b): b is Record<string, unknown> => typeof b === "object" && b !== null && !Array.isArray(b))
    .map((b) => ({
      source: text(b.source, 80) ?? "unnamed",
      time: text(b.time, 40),
      summary: text(b.summary, 400) ?? "",
      url: text(b.url, 400),
    }));
}

export interface Reading {
  market: MarketInfo;
  claim: WeatherClaim | null;
  /** The returned probability rounded to the nearest part per million. */
  probabilityPpm: number;
  basis: CournotBasis[];
  /** The receipt time rounded up to the second, so it is never earlier than the response. */
  observedUnix: number;
  observedAt: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A saved probability call: the call evidence itself, or an assessment file that holds it under `evidence`. */
export function callEvidenceOf(doc: unknown): CallEvidence {
  const e = isObj(doc) && isObj(doc.evidence) && !("endpoint" in doc) ? doc.evidence : doc;
  if (!isObj(e) || typeof e.endpoint !== "string" || typeof e.receivedAt !== "string" || !("response" in e) || !isObj(e.request)) {
    throw new CournotError("invalid_response", "Not a saved probability call (endpoint, request, receivedAt, response).");
  }
  if (!e.endpoint.endsWith("/intelligence/v1/probability")) throw new CournotError("invalid_response", "The saved call is not a probability request.");
  return e as unknown as CallEvidence;
}

/** Reads a saved probability call exactly as the planner did; throws CournotError when it cannot. */
export function readingFromEvidence(evidence: CallEvidence): Reading {
  const request = evidence.request as Record<string, unknown>;
  const ids = Array.isArray(request.market_ids) ? request.market_ids : [];
  if (ids.length !== 1) throw new CournotError("invalid_response", "The saved call did not ask about exactly one market.", evidence);
  const response = evidence.response as Record<string, unknown> | null;
  const data = isObj(response) && isObj(response.data) ? response.data : null;
  const markets = data && Array.isArray(data.markets) ? data.markets : [];
  const info = markets
    .map((m) => (isObj(m) && isObj(m.market_info) ? m.market_info : null))
    .find((m) => m !== null && String(m.id) === String(ids[0]));
  if (!info || typeof info.title !== "string") throw new CournotError("invalid_response", "The response does not describe the requested market.", evidence);
  const market = info as unknown as MarketInfo;
  const a = parseAssessment(market, evidence);
  const received = Date.parse(evidence.receivedAt);
  if (!Number.isFinite(received)) throw new CournotError("invalid_response", "The saved call has no receipt time.", evidence);
  return {
    market,
    claim: parseClaim(market),
    probabilityPpm: Math.round(a.pointEstimate * 1_000_000),
    basis: basisItems(a.basis),
    observedUnix: Math.ceil(received / 1000),
    observedAt: evidence.receivedAt,
  };
}

/** The exact bytes a plan publishes for a call: two-space JSON and a final newline. */
export function savedCallBytes(evidence: CallEvidence): string {
  return `${JSON.stringify(evidence, null, 2)}\n`;
}
