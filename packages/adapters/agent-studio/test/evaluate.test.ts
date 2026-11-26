import { describe, expect, it } from "vitest";
import { evaluate, fixtureFiles, parseRequest, reportDigest, type EvaluationReport } from "../src/index.js";

describe("Evaluation boundary", () => {
  it("rejects arbitrary paths, extra fields and mainnet requests", () => {
    expect(() => parseRequest({ resource: "../../private" })).toThrow();
    expect(() => parseRequest({ resource: "CLO_ESR1", chain: "bsc-mainnet" })).toThrow();
    expect(() => parseRequest({ resource: "CLO_ESR1", fixtureDir: "/private" })).toThrow();
  });
  it("runs the real sealed fixture and keeps skipped scope visible", async () => {
    const report = await evaluate({ resource: "CLO_ESR1", chain: "offline" });
    expect(report.record.chainId).toBe(97);
    expect(report.record.root).toBe("0xf4d4002344fe98be0f64870221e5cc0b5e1d6111c05fe46c0131763d725bbce7");
    expect(report.checks.some(x => x.status === "FAIL")).toBe(false);
    expect(report.checks.some(x => x.status === "SKIP")).toBe(true);
    expect(report.status).toBe("checks-passed-with-skips");
  });
  it("a failed verification cannot become an accepted report", async () => {
    const report = await evaluate({ resource: "CLO_ESR1", chain: "offline" }, { checks: async () => [{ id: "V1", title: "Payload", status: "FAIL", details: ["Changed bytes"] }] });
    expect(report.status).toBe("failed");
  });
  it("binds report digest to verdict and resource", async () => {
    const report = await evaluate({ resource: "CLO_ESR1", chain: "offline" });
    const altered: EvaluationReport = { ...report, status: "failed" };
    expect(reportDigest(altered)).not.toBe(reportDigest(report));
  });
  it("an embedded fixture gives the same report as the fixture directory", async () => {
    const now = () => new Date("2026-11-26T00:00:00Z");
    const files = await fixtureFiles();
    expect(Object.keys(files).sort()).toEqual([
      "leaves/CLO_ESR1.json", "leaves/CLO_ESR1.scenarios.json",
      "leaves/DSWL_ESS_ESR1.json", "leaves/DSWL_ESS_ESR1.scenarios.json",
      "manifest.json", "record.bsc-testnet.json",
    ]);
    const fromDir = await evaluate({ resource: "DSWL_ESS_ESR1", chain: "offline" }, { now });
    const embedded = await evaluate({ resource: "DSWL_ESS_ESR1", chain: "offline" }, { now, fixture: JSON.parse(JSON.stringify(files)) });
    expect(reportDigest(embedded)).toBe(reportDigest(fromDir));
  });
  it("an embedded fixture serves only the files it holds", async () => {
    const files = await fixtureFiles(undefined, ["CLO_ESR1"]);
    await expect(evaluate({ resource: "DSWL_ESS_ESR1", chain: "offline" }, { fixture: files })).rejects.toThrow(/not embedded/);
  });
});
