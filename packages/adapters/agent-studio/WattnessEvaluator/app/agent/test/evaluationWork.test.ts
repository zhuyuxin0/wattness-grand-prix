import { describe, expect, it } from "vitest";
import { RECORD, reportDigest } from "../vendor/wattness-evaluator.js";
import {
  DELIVERABLE_SCHEMA,
  parseTask,
  runEvaluation,
  taskRejection,
  type EvaluationDeliverable,
} from "../src/evaluationWork.js";
import { SellerCore, type SigningApi } from "../src/sellerCore.js";

const task = (fields: Record<string, unknown>) => JSON.stringify(fields);
const OFFLINE = task({ operating_day: "2026-11-26", resource: "CLO_ESR1", chain: "offline" });
const TERMS = { deliverables: "evaluation report", quality_standards: "checks V1-V10 with stated scope" };

function fakeSigning(spec: { task: string; terms: Record<string, unknown> }) {
  const submitted: { jobId: number; content: string }[] = [];
  let quotes = 0;
  const signing: SigningApi = {
    listPrice: () => 0n,
    clampPrice: (wei) => wei,
    signQuote: async () => {
      quotes += 1;
      return { response: { accepted: true }, provider_sig: "0xsig" };
    },
    verifySignedJob: async () => ({ ok: true, reason: "", permanent: false }),
    jobSpec: async () => spec,
    submitResult: async (jobId, content) => {
      submitted.push({ jobId, content });
      return { submitTx: "0xtx", deliverableUrl: "file:///deliverable.json" };
    },
  };
  return { signing, submitted, quotes: () => quotes };
}

describe("evaluation task", () => {
  it("accepts the sealed record's evaluation request", () => {
    expect(RECORD.operatingDay).toBe("2026-11-26");
    expect(parseTask(task({ operating_day: "2026-11-26", resource: "DSWL_ESS_ESR1" }))).toEqual({
      resource: "DSWL_ESS_ESR1",
      chain: "bsc-testnet",
    });
    expect(taskRejection(OFFLINE)).toBeNull();
  });

  it("refuses anything the evaluator cannot run", () => {
    expect(taskRejection("evaluate the battery")).toMatch(/JSON/);
    expect(taskRejection(task({ operating_day: "2026-11-25", resource: "CLO_ESR1" }))).toMatch(/2026-11-26/);
    expect(taskRejection(task({ operating_day: "2026-11-26", resource: "../../etc" }))).toMatch(/approved fixture/);
    expect(taskRejection(task({ operating_day: "2026-11-26", resource: "CLO_ESR1", chain: "bsc-mainnet" }))).toMatch(/testnet/);
    expect(taskRejection(task({ operating_day: "2026-11-26", resource: "CLO_ESR1", fixtureDir: "/" }))).toMatch(/unknown task field/);
    expect(taskRejection("x".repeat(600))).toMatch(/512/);
    expect(taskRejection(undefined)).toMatch(/JSON/);
  });
});

describe("evaluation deliverable", () => {
  it("carries the report, its digest and the record it evaluated", async () => {
    const text = await runEvaluation({ task: OFFLINE, terms: TERMS }, "42");
    const doc = JSON.parse(text) as EvaluationDeliverable;
    expect(doc.schema).toBe(DELIVERABLE_SCHEMA);
    expect(doc.job_id).toBe("42");
    expect(doc.request).toEqual({ operating_day: "2026-11-26", resource: "CLO_ESR1", chain: "offline" });
    expect(doc.record.root).toBe(RECORD.root);
    expect(doc.report.status).toBe("checks-passed-with-skips");
    expect(doc.report_digest).toBe(reportDigest(doc.report));
  });

  it("will not work without a verified task", async () => {
    await expect(runEvaluation(null, "42")).rejects.toThrow(/no verified task/);
  });
});

describe("seller core with the evaluator", () => {
  it("never signs a quote for an unsupported task", async () => {
    const fake = fakeSigning({ task: OFFLINE, terms: TERMS });
    const core = new SellerCore({
      runWork: async () => "",
      generator: "test",
      taskRejection,
      signing: fake.signing,
      pendingJobs: async () => ({ jobs: [] }),
    });
    const refused = await core.negotiate({ task_description: "write me a poem", terms: TERMS });
    const response = refused.response as Record<string, unknown>;
    expect(response.accepted).toBe(false);
    expect(response.reason_code).toBe("0x06");
    expect(refused.provider_sig ?? "").toBe("");
    expect(fake.quotes()).toBe(0);

    await core.negotiate({ task_description: OFFLINE, terms: TERMS });
    expect(fake.quotes()).toBe(1);
  });

  it("delivers the evaluation of the signed task for a funded job", async () => {
    const fake = fakeSigning({ task: OFFLINE, terms: TERMS });
    const core = new SellerCore({
      runWork: async (_prompt, { sessionId, spec }) => runEvaluation(spec ?? null, sessionId),
      generator: "test",
      taskRejection,
      signing: fake.signing,
      pendingJobs: async () => ({ jobs: [] }),
    });
    const ack = await core.notifyFunded({ job_id: 7 });
    expect(ack.status).toBe("accepted");
    await core.drain();
    expect(fake.submitted).toHaveLength(1);
    const doc = JSON.parse(fake.submitted[0]!.content) as EvaluationDeliverable;
    expect(doc.job_id).toBe("7");
    expect(doc.request.resource).toBe("CLO_ESR1");
    expect(doc.report.checks.find((c) => c.id === "V1")?.status).toBe("PASS");
  });
});
