import { describe, expect, it } from "vitest";
import { evaluate, parseRequest, reportDigest, type EvaluationReport } from "../src/index.js";

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
});
