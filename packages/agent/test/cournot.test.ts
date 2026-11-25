// The risk officer's read before the plan: a saved call, or exactly one live
// call, published beside the record; any failure leaves a reason, never a wait.
// Every call and market here is synthetic; no request leaves the process.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileSha256 } from "@gatelock/core";
import { CournotClient, savedCallBytes, type CallEvidence, type Json } from "@gatelock/cournot";
import { describe, expect, it, vi } from "vitest";
import { RESPONSE_ROUTE, readLive, readSavedCall } from "../src/cournot.js";

const market = {
  id: 77,
  title: "Will the minimum temperature be <33° on Nov 27, 2026? (Yes: 32° or below)",
  description: "If the minimum temperature recorded at Dallas (CLIDFW) for Nov 27, 2026, is less than 33° fahrenheit according to The Weather Company, then the market resolves to Yes.",
};
const body = (probability: number) => ({ code: 0, msg: "Success", data: { probability, markets: [{ market_info: market, matching_confidence: 0.9 }], basis: [] } });
const call: CallEvidence = {
  endpoint: "https://interface.cournot.ai/intelligence/v1/probability",
  request: { message: "synthetic", market_ids: [77] },
  requestedAt: "2026-11-26T14:59:00.000Z",
  receivedAt: "2026-11-26T14:59:00.400Z",
  httpStatus: 200,
  requestId: null,
  response: body(0.2) as unknown as Json,
  transactionHashes: [],
};
const resolveFile = (dir: string, m = market) => {
  const p = join(dir, "resolve.json");
  writeFileSync(p, JSON.stringify({ endpoint: "https://interface.cournot.ai/intelligence/v1/resolve", request: { message: "synthetic", limit: 5 }, response: { code: 0, data: { markets: [{ market_info: m, matching_confidence: 0.9 }] } } }));
  return p;
};
const tmp = () => mkdtempSync(join(tmpdir(), "gate-cournot-"));
const published = (dir: string) => readFileSync(join(dir, RESPONSE_ROUTE));

describe("a saved call", () => {
  it("is published beside the record and read into the reading", () => {
    const dir = tmp();
    const file = join(dir, "call.json");
    writeFileSync(file, JSON.stringify(call));
    const r = readSavedCall(file, join(dir, "record"));
    expect(r.failure).toBeNull();
    expect(r.probabilityPpm).toBe(200_000);
    expect(r.claim).toMatchObject({ station: "CLIDFW", threshold_f: 33, date: "2026-11-27" });
    expect(r.observedUnix).toBe(Math.ceil(Date.parse(call.receivedAt) / 1000));
    expect(published(join(dir, "record")).toString()).toBe(savedCallBytes(call));
    expect(r.response).toEqual({ route: RESPONSE_ROUTE, sha256: fileSha256(published(join(dir, "record"))) });
  });

  it("publishes the call held in an assessment file, byte for byte as the call itself", () => {
    const dir = tmp();
    const file = join(dir, "assessment.json");
    writeFileSync(file, JSON.stringify({ market, pointEstimate: 0.2, evidence: call }));
    const r = readSavedCall(file, dir);
    expect(published(dir).toString()).toBe(savedCallBytes(call));
    expect(r.probabilityPpm).toBe(200_000);
  });

  it("says why when the file is not a probability call, and publishes it as given", () => {
    const dir = tmp();
    const file = join(dir, "x.json");
    writeFileSync(file, '{"hello": 1}');
    const r = readSavedCall(file, dir);
    expect(r.failure).toMatch(/not a probability call/);
    expect(published(dir).toString()).toBe('{"hello": 1}');
    expect(readSavedCall(join(dir, "missing.json"), join(dir, "other")).failure).toMatch(/cannot be opened/);
  });
});

describe("--cournot live", () => {
  const client = (fetch: ReturnType<typeof vi.fn>) => new CournotClient({ fetch: fetch as unknown as typeof globalThis.fetch });

  it("makes exactly one call, publishes the response and reads it", async () => {
    const dir = tmp();
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body(0.35)), { status: 200 }));
    const r = await readLive({ resolveFile: resolveFile(dir), marketId: "77", operatingDay: "2026-11-27", recordDir: dir, client: client(fetch) });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetch.mock.calls[0]![1].body))).toEqual({ message: "synthetic", market_ids: [77] });
    expect(r.failure).toBeNull();
    expect(r.probabilityPpm).toBe(350_000);
    expect(r.response?.sha256).toBe(fileSha256(published(dir)));
  });

  it("spends no call on a market the rule would not read", async () => {
    const dir = tmp();
    const fetch = vi.fn();
    const r = await readLive({ resolveFile: resolveFile(dir), marketId: "77", operatingDay: "2026-11-29", recordDir: dir, client: client(fetch) });
    expect(fetch).not.toHaveBeenCalled();
    expect(r.failure).toBe("not called: market 77 is for 2026-11-27; the rule reads 2026-11-29 or 2026-11-28");
    expect(r.claim?.market_id).toBe("77");
    const none = await readLive({ resolveFile: resolveFile(dir), marketId: "78", operatingDay: "2026-11-27", recordDir: dir, client: client(fetch) });
    expect(none.failure).toBe("not called: market 78 is not in the resolve response");
    expect(fetch).not.toHaveBeenCalled();
    expect(existsSync(join(dir, RESPONSE_ROUTE))).toBe(false);
  });

  it("proceeds without the reading when the call is refused or fails, keeping what came back", async () => {
    const dir = tmp();
    const limited = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 429, msg: "slow down" }), { status: 429 }));
    const r = await readLive({ resolveFile: resolveFile(dir), marketId: "77", operatingDay: "2026-11-27", recordDir: dir, client: client(limited) });
    expect(limited).toHaveBeenCalledTimes(1);
    expect(r.failure).toMatch(/^the call failed: rate_limited/);
    expect(r.probabilityPpm).toBeNull();
    expect(r.response?.sha256).toBe(fileSha256(published(dir)));

    const down = vi.fn().mockRejectedValue(new Error("socket hang up"));
    const d = await readLive({ resolveFile: resolveFile(tmp()), marketId: "77", operatingDay: "2026-11-27", recordDir: tmp(), client: client(down) });
    expect(down).toHaveBeenCalledTimes(1);
    expect(d.failure).toMatch(/^the call failed: service_error/);
    expect(d.response).toBeNull();
  });
});
