import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { keccak256 } from "viem";
import type { Hex } from "viem";
import { AtlasClient, CmcClient, BSC_USDT, checkPrice, decodeAtlasPayload, fundingDecision, parseCmcQuotes, parseSecurity, sanitize, verifyAtlasResponse } from "./index.js";
import type { SecurityCoverage } from "./index.js";

const now = 1_795_000_000;
const p = { asset: "BNB" as const, priceUsd: 600, observedAtSeconds: now, source: "test", sourceId: "633" };
function payload(ts = now): Hex {
  return ("0x" + BigInt(633).toString(16).padStart(8, "0") + (600n * 10n ** 18n).toString(16).padStart(20, "0") + BigInt(ts).toString(16).padStart(12, "0") + "01") as Hex;
}
async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return "http://127.0.0.1:" + (server.address() as AddressInfo).port;
}
async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
describe("Atlas payload and authentication", () => {
  it("decodes raw 1e18 prices and six-byte timestamps", () => {
    expect(decodeAtlasPayload(payload())).toEqual([{ feedId: "633", rawPrice: 600n * 10n ** 18n, timestampSeconds: now }]);
  });
  it("rejects tampered package count and duplicate feeds", () => {
    expect(() => decodeAtlasPayload((payload().slice(0, -2) + "02") as Hex)).toThrow("count");
    const hex = payload().slice(2, -2);
    expect(() => decodeAtlasPayload(("0x" + hex + hex + "02") as Hex)).toThrow("Duplicate");
  });
  it("verifies the raw payload signature and binds expected feeds", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const raw = payload();
    const signature = await account.sign({ hash: keccak256(raw) });
    const body = { data: { payload: raw, signature, magicMarker: "0x7096" } };
    expect((await verifyAtlasResponse(body, { "633": "BNB" }, now, account.address))[0]?.priceUsd).toBe(600);
    await expect(verifyAtlasResponse(body, { "649": "USDT" }, now, account.address)).rejects.toThrow("Unexpected");
    const changed = { data: { ...body.data, payload: payload(now - 1) } };
    await expect(verifyAtlasResponse(changed, { "633": "BNB" }, now, account.address)).rejects.toThrow("signer");
  });
  it("rejects HTTP200 business failures and redacts credentials", async () => {
    const audit: unknown[] = [];
    const transport = (async () => new Response(JSON.stringify({ status: { error_code: "500" }, message: "example-secret" }), { status: 200 })) as typeof fetch;
    const client = new AtlasClient("example-secret", x => audit.push(x), transport);
    await expect(client.latest(now)).rejects.toThrow("business");
    expect(JSON.stringify(audit)).not.toContain("example-secret");
  });
  it.each(["Atlas latest", "CMC quotes", "CMC security"] as const)("keeps %s credentials off a redirect target", async route => {
    let targetRequests = 0;
    const target = createServer((_request, response) => {
      targetRequests++;
      response.end("{}");
    });
    const targetOrigin = await listen(target);
    const source = createServer((_request, response) => {
      response.writeHead(307, { Location: targetOrigin + "/capture" });
      response.end();
    });
    const sourceOrigin = await listen(source);
    const options: RequestInit[] = [];
    const transport = (async (_url, init) => {
      options.push(init ?? {});
      return fetch(sourceOrigin + "/redirect", init);
    }) as typeof fetch;
    try {
      const request = route === "Atlas latest"
        ? new AtlasClient("local-test-credential", () => {}, transport).latest(now)
        : route === "CMC quotes"
          ? new CmcClient("local-test-credential", () => {}, transport).quotes(now)
          : new CmcClient("local-test-credential", () => {}, transport).security();
      await expect(request).rejects.toThrow();
      expect(options).toHaveLength(1);
      expect(options[0]?.redirect).toBe("error");
      expect(Object.values(options[0]?.headers ?? {})).toContain("local-test-credential");
      expect(targetRequests).toBe(0);
    } finally {
      await close(source);
      await close(target);
    }
  });
});
describe("price and coverage controls", () => {
  it("rejects stale, future, non-positive and non-finite prices", () => {
    expect(() => checkPrice({ ...p, observedAtSeconds: now - 181 }, now)).toThrow("Stale");
    expect(() => checkPrice({ ...p, observedAtSeconds: now + 61 }, now)).toThrow("Future");
    expect(() => checkPrice({ ...p, priceUsd: -1 }, now)).toThrow("Non-positive");
    expect(() => checkPrice({ ...p, priceUsd: Infinity }, now)).toThrow("Non-finite");
    expect(() => checkPrice({ ...p, priceUsd: NaN }, now)).toThrow("Non-finite");
  });
  it("keeps missing vendor data unknown", () => {
    expect(parseSecurity({ data: [] }).state).toBe("unknown");
    expect(parseSecurity([{ exist: false }]).flagged).toBeNull();
    expect(parseSecurity([{ platformName: "bsc", tokenContractAddress: BSC_USDT, exist: true, extra: { isFlaggedByVendor: false, isVerified: true, source: "test" } }])).toMatchObject({ state: "available", flagged: false });
    expect(parseSecurity([{ platformName: "ethereum", tokenContractAddress: BSC_USDT, extra: { isFlaggedByVendor: false } }]).state).toBe("unknown");
  });
  it.each([
    { isFlaggedByVendor: null, isVerified: true, source: "test" },
    { isFlaggedByVendor: false, isVerified: null, source: "test" },
    { isFlaggedByVendor: false, isVerified: true, source: " " },
  ])("does not treat an indexed row with incomplete vendor fields as available", extra => {
    expect(parseSecurity([{ platformName: "bsc", tokenContractAddress: BSC_USDT, exist: true, extra }])).toMatchObject({ state: "unknown", reason: "Incomplete vendor fields" });
  });
  const quote = { id: 2781, price: 600, percent_change_24h: -4, last_updated: new Date(now * 1000).toISOString(), volume_24h: 10_000 };
  it("parses v3 CMC arrays and checks USD asset identity", () => {
    const result = parseCmcQuotes({ data: [{ id: 1839, quote: [quote] }, { id: 825, quote: [{ ...quote, price: 1 }] }] }, now);
    expect(result.map(x => x.asset)).toEqual(["BNB", "USDT"]);
  });
  it("keeps a missing CMC volume unknown", () => {
    const result = parseCmcQuotes({ data: [{ id: 1839, quote: [{ ...quote, volume_24h: null }] }, { id: 825, quote: [quote] }] }, now);
    expect(result[0]?.volume24hUsd).toBeNull();
  });
  it("sanitizes nested secret values and sensitive headers", () => {
    expect(sanitize({ key: "example-secret", headers: { Authorization: "Bearer example-secret" } }, ["example-secret"])).toEqual({ key: "[REDACTED]", headers: { Authorization: "[REDACTED]" } });
  });
});
describe("funding decision", () => {
  const atlas = [p, { ...p, asset: "USDT" as const, priceUsd: 1, sourceId: "649" }];
  const cmc = [{ ...p, percentChange24h: -4, volume24hUsd: 10_000 }];
  const security = { state: "available" as const, flagged: false, verifiedContract: true, source: "test", reason: "test" };
  it("changes the reserve and evaluation amount with observed market data", () => {
    const d = fundingDecision({ treasuryBnb: .25, atlas, cmc, security, now });
    expect(d.reserveFraction).toBeCloseTo(.18);
    expect(d.evaluationBudgetUsdCents).toBe(12300);
    expect(d.baselineEvaluationBudgetUsdCents).toBe(13500);
    expect(d.evaluationCount).toBe(61);
  });
  it("pauses allocations when vendor coverage is unknown", () => {
    const d = fundingDecision({ treasuryBnb: .25, atlas, cmc, security: { ...security, state: "unknown" }, now });
    expect(d.state).toBe("review");
    expect(d.evaluationCount).toBe(0);
  });
  it.each([
    ["unresolved flag", { flagged: null }],
    ["vendor flag", { flagged: true }],
    ["unresolved verification", { verifiedContract: null }],
    ["negative verification", { verifiedContract: false }],
    ["missing source", { source: null }],
    ["empty source", { source: " " }],
  ] satisfies [string, Partial<SecurityCoverage>][])("pauses allocations for %s even if the row says available", (_name, fields) => {
    const d = fundingDecision({ treasuryBnb: .25, atlas, cmc, security: { ...security, ...fields }, now });
    expect(d.state).toBe("review");
    expect(d.evaluationBudgetUsdCents).toBe(0);
    expect(d.evaluationCount).toBe(0);
    expect(d.reasons.length).toBeGreaterThan(0);
  });
  it("refuses non-finite inputs instead of pricing them", () => {
    expect(() => fundingDecision({ treasuryBnb: .25, atlas, cmc: [{ ...cmc[0]!, priceUsd: Infinity }], security, now })).toThrow("Non-finite");
    expect(() => fundingDecision({ treasuryBnb: .25, atlas, cmc: [{ ...cmc[0]!, percentChange24h: NaN }], security, now })).toThrow("24-hour change");
  });
  it("pauses allocations on source divergence", () => {
    const d = fundingDecision({ treasuryBnb: .25, atlas: [{ ...p, priceUsd: 700 }, atlas[1]!], cmc, security, now });
    expect(d.reasons).toContain("BNB source deviation exceeds 5%");
  });
});
