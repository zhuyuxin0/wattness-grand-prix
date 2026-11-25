import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import * as index from "../src/index.js";
import { CournotClient, applyWeatherPolicy, parseAssessment, sanitize } from "../src/index.js";
import type { CallEvidence, ConditionalWeatherPolicy } from "../src/index.js";

const market = { id: 77, title: "Will Dallas minimum temperature be below 29°F?", end_time: "2026-11-27T07:00:00Z" };
const record = (response: unknown): CallEvidence => ({
  endpoint: "https://interface.cournot.ai/intelligence/v1/probability",
  request: { message: "Dallas minimum temperature", market_ids: [77] },
  requestedAt: "2026-11-25T15:00:00Z", receivedAt: "2026-11-25T15:00:01Z",
  httpStatus: 200, requestId: null, response: sanitize(response), transactionHashes: [],
});
const policy: ConditionalWeatherPolicy = {
  id: "test-policy", label: "Assumed sensitivity", baselineEventProbability: .3,
  conditionalStressIfEvent: .8, conditionalStressIfNotEvent: .25,
  baseHedgeLimitMWh: 50, scenarioHedgeLimitReduction: .5,
  informationCutoff: "2026-11-25T16:00:00Z", appliedAt: "2026-11-25T16:00:00Z",
};

describe("Cournot event assessment", () => {
  it("preserves structured result and all basis fields while accepting probability zero", () => {
    const a = parseAssessment(market, record({ code: 0, data: { result: { point_estimate: 0, model_label: "returned" }, basis: { limitations: ["returned limitation"], new_field: { arbitrary: "retained" } }, markets: [{ id: 77 }] } }));
    expect(a.pointEstimate).toBe(0);
    expect(a.basis).toEqual({ limitations: ["returned limitation"], new_field: { arbitrary: "retained" } });
    expect(a.dataAgeMs).toBeNull();
  });
  it("accepts nested response and exposes basis source age rather than inventing freshness", () => {
    const a = parseAssessment(market, record({ code: 0, data: { probability: { result: { point_estimate: .7 }, basis: [{ source: "Weather", time: "2026-11-25T14:00:01Z" }] } } }));
    expect(a.dataAgeMs).toBe(3600000);
    expect(a.basisSourceTimes).toEqual(["2026-11-25T14:00:01.000Z"]);
  });
  it("refuses probabilities outside [0,1], unanswered responses and different event identities", () => {
    expect(() => parseAssessment(market, record({ code: 0, data: { probability: 70 } }))).toThrow("finite probability");
    expect(() => parseAssessment(market, record({ code: 0, data: { probability: .7, answered: false } }))).toThrow("did not answer");
    expect(() => parseAssessment(market, record({ code: 0, data: { probability: .7, markets: [{ id: 88 }] } }))).toThrow("identity");
  });
  it("redacts keys and IPs recursively without discarding new evidence fields", () => {
    expect(sanitize({ basis: { free_quota: { ip: "192.0.2.1", remaining: 2 }, api_key: "secret", summary: "unchanged" } })).toEqual({ basis: { free_quota: { ip: "[redacted]", remaining: 2 }, api_key: "[redacted]", summary: "unchanged" } });
  });
  it("removes echoed keys and IP addresses wherever they appear", () => {
    const clean = sanitize({ msg: "key k-123 rejected for 203.0.113.9", client_ip: "198.51.100.7", api_key_quota: { remaining: 4 }, basis: [{ summary: "price 0.0100", time: "2026-11-25T15:50:29Z" }] }, ["k-123"]);
    expect(clean).toEqual({ msg: "key [redacted] rejected for [redacted ip]", client_ip: "[redacted]", api_key_quota: { remaining: 4 }, basis: [{ summary: "price 0.0100", time: "2026-11-25T15:50:29Z" }] });
  });
  it("keeps a configured key out of the recorded evidence", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 4100, msg: "invalid key k-secret-1" }), { status: 200 }));
    const error = await new CournotClient({ apiKey: "k-secret-1", fetch: fetcher as typeof fetch }).assess("Dallas temperature", market).catch((e: unknown) => e);
    expect(fetcher.mock.calls[0]?.[1].headers["COURNOT-API-KEY"]).toBe("k-secret-1");
    expect(JSON.stringify(error)).not.toContain("k-secret-1");
    expect(JSON.stringify((error as { evidence?: unknown }).evidence)).toContain("invalid key [redacted]");
  });
  it("rejects sensitive event text before sending an outside request", async () => {
    const fetcher = vi.fn();
    await expect(new CournotClient({ fetch: fetcher as typeof fetch }).resolve("contact person@example.invalid")).rejects.toThrow("email");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not retry, sign or pay after 402 or 429", async () => {
    for (const status of [402, 429]) {
      const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0 }), { status }));
      await expect(new CournotClient({ fetch: fetcher as typeof fetch }).assess("Dallas temperature", market)).rejects.toMatchObject({ kind: status === 402 ? "payment_required" : "rate_limited" });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0]?.[1].redirect).toBe("error");
    }
  });
  it("does not treat HTTP200 business errors as successful assessments", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 4100, msg: "invalid argument" }), { status: 200 }));
    await expect(new CournotClient({ fetch: fetcher as typeof fetch }).assess("Dallas temperature", market)).rejects.toMatchObject({ kind: "api_error" });
  });
});

describe("package entries", () => {
  it("keeps the secrets loader out of the browser-safe index", () => {
    expect(readFileSync(new URL("../src/index.ts", import.meta.url), "utf8")).not.toContain("@gatelock/core/secrets");
    expect("clientWithConfiguredKey" in index).toBe(false);
  });
});

describe("declared weather sensitivity", () => {
  it("changes a real recommendation using a separate explicit conditional model", () => {
    const a = parseAssessment(market, record({ code: 0, data: { probability: .7 } }));
    const result = applyWeatherPolicy(a, policy);
    expect(result.before.stressScenarioWeight).toBeCloseTo(.415);
    expect(result.after.stressScenarioWeight).toBeCloseTo(.635);
    expect(result.after.hedgeLimitMWh).toBeLessThan(result.before.hedgeLimitMWh);
    expect(result.oracleEvent.probability).toBe(.7);
    expect(result.explanation).toContain("assumed conditional model");
    expect(result.relationToExistingSeal).toContain("not included");
  });
  it("blocks later observations from an earlier cutoff and prevents time travel", () => {
    const a = parseAssessment(market, record({ code: 0, data: { probability: .7 } }));
    expect(() => applyWeatherPolicy(a, { ...policy, informationCutoff: "2026-11-25T14:00:00Z" })).toThrow("after");
    expect(() => applyWeatherPolicy(a, { ...policy, appliedAt: "2026-11-25T14:00:00Z" })).toThrow("before");
  });
});
