// The risk officer's read of Cournot before the gate. Either a saved
// probability call (--cournot <file>) or one live call (--cournot live) made
// before the plan time is stamped. The response is published beside the
// record; whatever goes wrong, the plan proceeds without it and says why.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { claimIneligibility, fileSha256, type WeatherClaim } from "@gatelock/core";
import {
  CournotClient,
  CournotError,
  callEvidenceOf,
  parseClaim,
  readingFromEvidence,
  savedCallBytes,
  type CallEvidence,
  type MarketInfo,
} from "@gatelock/cournot";
import type { CournotReading } from "@gatelock/engine";

/** Where the saved response sits, relative to the record's directory. */
export const RESPONSE_ROUTE = "cournot/probability.json";
/** The live call's budget; the seal does not wait longer. */
export const LIVE_TIMEOUT_MS = 20_000;

const failed = (failure: string, claim: WeatherClaim | null = null, extra: Partial<CournotReading> = {}): CournotReading => ({
  claim,
  probabilityPpm: null,
  basis: [],
  observedUnix: null,
  response: null,
  failure,
  ...extra,
});

function publish(recordDir: string, bytes: string | Uint8Array): { route: string; sha256: string } {
  const path = join(recordDir, RESPONSE_ROUTE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  return { route: RESPONSE_ROUTE, sha256: fileSha256(bytes) };
}

const message = (err: unknown) => (err instanceof CournotError ? `${err.kind}: ${err.message}` : err instanceof Error ? err.message : String(err));

/** A reading from a published call, or the reason it cannot be read. */
function fromEvidence(evidence: CallEvidence, response: { route: string; sha256: string }): CournotReading {
  try {
    const r = readingFromEvidence(evidence);
    return { claim: r.claim, probabilityPpm: r.probabilityPpm, basis: r.basis, observedUnix: r.observedUnix, response, failure: null };
  } catch (err) {
    const received = Date.parse(evidence.receivedAt);
    return failed(`the response cannot be read: ${message(err)}`, null, {
      response,
      observedUnix: Number.isFinite(received) ? Math.ceil(received / 1000) : null,
    });
  }
}

/** --cournot <file>: a saved probability call (the call itself, or an assessment that holds it). */
export function readSavedCall(file: string, recordDir: string): CournotReading {
  let raw: Uint8Array;
  try {
    raw = new Uint8Array(readFileSync(file));
  } catch (err) {
    return failed(`the saved response cannot be opened: ${message(err)}`);
  }
  let evidence: CallEvidence;
  try {
    evidence = callEvidenceOf(JSON.parse(new TextDecoder().decode(raw)));
  } catch (err) {
    // Published as given, so the record shows what was refused.
    return failed(`the saved response is not a probability call: ${message(err)}`, null, { response: publish(recordDir, raw) });
  }
  return fromEvidence(evidence, publish(recordDir, savedCallBytes(evidence)));
}

export interface LiveOptions {
  /** A saved resolve response (the adapter's `live resolve` writes one). */
  resolveFile: string;
  marketId: string;
  operatingDay: string;
  recordDir: string;
  /** A second copy of whatever comes back goes here, outside the record, so a re-plan reuses it instead of calling again. */
  keepDir?: string;
  client?: CournotClient;
}

/** Where the kept copy of a live call went, when it was kept. */
export let lastKeptCopy: string | null = null;

function keep(dir: string | undefined, operatingDay: string, evidence: CallEvidence): void {
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const stamp = evidence.receivedAt.replace(/[:.]/g, "-");
  lastKeptCopy = join(dir, `probability-od${operatingDay.replaceAll("-", "")}-${stamp}.json`);
  writeFileSync(lastKeptCopy, savedCallBytes(evidence));
}

/**
 * --cournot live: exactly one probability call, for the chosen market of a saved
 * resolve response, and only when the weather rule reads that market for this day.
 */
export async function readLive(o: LiveOptions): Promise<CournotReading> {
  let saved: { request?: { message?: unknown }; response?: { data?: { markets?: unknown } } };
  try {
    saved = JSON.parse(readFileSync(o.resolveFile, "utf8"));
  } catch (err) {
    return failed(`not called: the resolve file cannot be read: ${message(err)}`);
  }
  const text = saved.request?.message;
  const markets = saved.response?.data?.markets;
  if (typeof text !== "string" || !Array.isArray(markets)) return failed("not called: the resolve file is not a saved resolve response");
  const market = (markets as { market_info?: MarketInfo }[]).find((m) => String(m.market_info?.id) === o.marketId)?.market_info;
  if (!market) return failed(`not called: market ${o.marketId} is not in the resolve response`);
  const claim = parseClaim(market);
  // Checked before the call, so a market the rule would not read never spends one.
  const why = claimIneligibility(claim, o.operatingDay);
  if (why) return failed(`not called: ${why}`, claim);

  const client = o.client ?? new CournotClient({ timeoutMs: LIVE_TIMEOUT_MS });
  let evidence: CallEvidence;
  try {
    evidence = (await client.assess(text, market)).evidence;
  } catch (err) {
    const kept = err instanceof CournotError ? err.evidence : undefined;
    if (!kept) return failed(`the call failed: ${message(err)}`, claim);
    keep(o.keepDir, o.operatingDay, kept);
    const received = Date.parse(kept.receivedAt);
    return failed(`the call failed: ${message(err)}`, claim, {
      response: publish(o.recordDir, savedCallBytes(kept)),
      observedUnix: Number.isFinite(received) ? Math.ceil(received / 1000) : null,
    });
  }
  keep(o.keepDir, o.operatingDay, evidence);
  return fromEvidence(evidence, publish(o.recordDir, savedCallBytes(evidence)));
}

/** One line for the console. */
export function describeReading(r: CournotReading): string {
  if (r.failure) return `not applied: ${r.failure}`;
  const c = r.claim;
  return `market ${c?.market_id ?? "?"} (${c ? `${c.station} min < ${c.threshold_f}°F on ${c.date}` : "no claim"}), p ${r.probabilityPpm} ppm, response ${r.response?.sha256.slice(0, 12)}...`;
}
