import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { basisItems, callEvidenceOf, parseClaim, readingFromEvidence, savedCallBytes } from "../src/index.js";
import type { CallEvidence, Json, MarketInfo } from "../src/index.js";

// Synthetic market and call, shaped like Kalshi's lower-tail minimum-temperature market as Cournot returns it.
const market: MarketInfo = {
  id: 77,
  title: "Will the minimum temperature be <33° on Nov 27, 2026? (Yes: 32° or below)",
  description:
    "If the minimum temperature recorded at Dallas (CLIDFW) for Nov 27, 2026, is less than 33° fahrenheit according to The Weather Company, then the market resolves to Yes.",
  end_time: "2026-11-28T07:00:00Z",
};
const call = (over: Partial<CallEvidence> = {}, data: Record<string, unknown> = {}): CallEvidence => ({
  endpoint: "https://interface.cournot.ai/intelligence/v1/probability",
  request: { message: "synthetic: Dallas minimum below 33F on 27 Nov", market_ids: [77] },
  requestedAt: "2026-11-26T14:58:59.100Z",
  receivedAt: "2026-11-26T14:59:00.250Z",
  httpStatus: 200,
  requestId: null,
  response: {
    code: 0,
    msg: "Success",
    data: {
      probability: 0.123456789,
      markets: [{ market_info: market as unknown as Json, matching_confidence: 0.9 }],
      basis: [{ source: "kalshi", summary: "latest YES price 0.12", time: "2026-11-26T14:58:00Z", url: "https://example.invalid/m" }],
      ...data,
    },
  },
  transactionHashes: [],
  ...over,
});

describe("the claim a market makes", () => {
  it("reads station, threshold and date from the title and the rules text together", () => {
    expect(parseClaim(market)).toEqual({
      market_id: "77",
      title: market.title,
      station: "CLIDFW",
      measure: "minimum temperature",
      comparator: "<",
      threshold_f: 33,
      date: "2026-11-27",
    });
  });

  it("refuses a market whose title and rules disagree, an upper tail, a range or a high", () => {
    expect(parseClaim({ ...market, description: market.description!.replace("Nov 27", "Nov 26") })).toBeNull();
    expect(parseClaim({ ...market, description: market.description!.replace("less than 33", "less than 34") })).toBeNull();
    expect(parseClaim({ ...market, title: "Will the minimum temperature be >36° on Nov 27, 2026? (Yes: 37° or above)" })).toBeNull();
    expect(parseClaim({ ...market, title: "Will the minimum temperature be 33-34° on Nov 27, 2026?" })).toBeNull();
    expect(parseClaim({ ...market, title: "Will the highest temperature in Houston be 70°F or higher on November 26?" })).toBeNull();
    expect(parseClaim({ ...market, title: "Will the minimum temperature be <33° on Feb 30, 2026?" })).toBeNull();
  });
});

describe("a saved probability call", () => {
  it("gives the probability in ppm, the basis, and the receipt time rounded up", () => {
    const r = readingFromEvidence(call());
    expect(r.probabilityPpm).toBe(123_457);
    expect(r.observedUnix).toBe(Math.ceil(Date.parse("2026-11-26T14:59:00.250Z") / 1000));
    expect(r.basis).toEqual([{ source: "kalshi", time: "2026-11-26T14:58:00Z", summary: "latest YES price 0.12", url: "https://example.invalid/m" }]);
    expect(r.claim?.date).toBe("2026-11-27");
  });

  it("is read from the call itself or from an assessment that holds it, and never from a resolve call", () => {
    const e = call();
    expect(callEvidenceOf(e)).toBe(e);
    expect(callEvidenceOf({ market, pointEstimate: 0.12, evidence: e })).toBe(e);
    expect(() => callEvidenceOf({ ...e, endpoint: "https://interface.cournot.ai/intelligence/v1/resolve" })).toThrow(/not a probability request/);
    expect(() => callEvidenceOf({ hello: 1 })).toThrow(/Not a saved probability call/);
  });

  it("refuses a response about another market or none", () => {
    expect(() => readingFromEvidence(call({ request: { message: "x", market_ids: [78] } }))).toThrow(/does not describe the requested market/);
    expect(() => readingFromEvidence(call({ request: { message: "x", market_ids: [77, 78] } }))).toThrow(/exactly one market/);
    expect(() => readingFromEvidence(call({}, { probability: 1.5 }))).toThrow(/finite probability/);
  });

  it("keeps a structured basis in the file only", () => {
    expect(basisItems({ limitations: ["x"] })).toEqual([]);
    expect(basisItems([{ summary: "s" }, "x", null])).toEqual([{ source: "unnamed", time: null, summary: "s", url: null }]);
  });

  it("is published as two-space JSON with a final newline", () => {
    const e = call();
    expect(savedCallBytes(e)).toBe(`${JSON.stringify(e, null, 2)}\n`);
  });

  // The recorded 25 Nov call, a fixture kept outside the repository: GATE_COURNOT_RECORDED names its file.
  const recorded = process.env.GATE_COURNOT_RECORDED;
  it.skipIf(!recorded || !existsSync(recorded))("reads the recorded 25 Nov call (fixture) as the review did", () => {
    const r = readingFromEvidence(callEvidenceOf(JSON.parse(readFileSync(recorded as string, "utf8"))));
    expect(r.probabilityPpm).toBe(10_000);
    expect(r.claim).toMatchObject({ market_id: "24962617", station: "CLIDFW", threshold_f: 29, date: "2026-11-26" });
    // 15:51:43.723Z, rounded up: 496 s before the 26 Nov gate.
    expect(r.observedUnix).toBe(1_795_622_400 - 496);
    expect(r.basis[0]).toMatchObject({ source: "kalshi", time: "2026-11-25T15:50:29Z" });
  });
});
