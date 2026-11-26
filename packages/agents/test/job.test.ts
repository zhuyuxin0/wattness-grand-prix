import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fileSha256 } from "@gatelock/core";
import { describe, expect, it } from "vitest";
import {
  decodeSubmitParams,
  encodeSubmitParams,
  jobDescription,
  MAX_DESCRIPTION_BYTES,
  parseJobRequest,
  scenariosDeliverable,
  scenariosDigest,
  scenariosFile,
  scenariosJobRequest,
} from "../src/index.js";

const SEALED = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "fixtures", "od-20261126");
const raw = readFileSync(join(SEALED, "leaves", "DSWL_ESS_ESR1.scenarios.json"), "utf8");
const leaf = JSON.parse(readFileSync(join(SEALED, "leaves", "DSWL_ESS_ESR1.json"), "utf8")) as { scenarios: { digest_sha256: string } };

describe("the scenarios deliverable", () => {
  it("is the digest the sealed leaf commits, not the hash of the file's formatting", () => {
    expect(scenariosDigest(JSON.parse(raw))).toBe(leaf.scenarios.digest_sha256);
    expect(scenariosDeliverable(JSON.parse(raw))).toBe(`0x${leaf.scenarios.digest_sha256}`);
    expect(fileSha256(raw)).not.toBe(leaf.scenarios.digest_sha256);
  });

  it("changes when one price changes", () => {
    const m = JSON.parse(raw) as { node_cents: number[][] };
    m.node_cents[0]![0]! += 1;
    expect(scenariosDigest(m)).not.toBe(leaf.scenarios.digest_sha256);
  });
});

describe("job requests", () => {
  const req = scenariosJobRequest({ operatingDay: "2026-11-26", resource: "DSWL_ESS_ESR1", clientId: 2935, providerId: 2932, timing: "sealed" });

  it("round-trip through the on-chain description", () => {
    const text = jobDescription(req);
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(MAX_DESCRIPTION_BYTES);
    expect(parseJobRequest(text)).toEqual(req);
    expect(req.deliverable.file).toBe("leaves/DSWL_ESS_ESR1.scenarios.json");
  });

  it("say plainly when the scenarios were sealed before the job", () => {
    expect(req.note).toMatch(/already sealed in the 2026-11-26 record/);
    const live = scenariosJobRequest({ operatingDay: "2026-11-27", resource: "DSWL_ESS_ESR1", clientId: 1, providerId: 2, timing: "before-seal" });
    expect(live.note).toMatch(/before the 2026-11-27 record is committed/);
  });

  it("refuse what is not a request", () => {
    expect(parseJobRequest("{}")).toBeNull();
    expect(parseJobRequest("not json")).toBeNull();
    expect(() => scenariosFile("../x")).toThrow(/bad resource/);
    expect(() => scenariosJobRequest({ ...{ operatingDay: "26 Nov", resource: "X", clientId: 1, providerId: 2, timing: "sealed" } })).toThrow(/YYYY-MM-DD/);
  });
});

describe("submit parameters", () => {
  it("carry the deliverable URL under the key the BNB agent SDK reads", () => {
    const p = { deliverable_url: "https://example.invalid/x.json", hash: "sha256-rfc8785", resource: "DSWL_ESS_ESR1", operating_day: "2026-11-26" };
    const hex = encodeSubmitParams(p);
    expect(JSON.parse(Buffer.from(hex.slice(2), "hex").toString("utf8")).deliverable_url).toBe(p.deliverable_url);
    expect(decodeSubmitParams(hex)).toEqual(p);
    expect(decodeSubmitParams("0x")).toBeNull();
  });
});
