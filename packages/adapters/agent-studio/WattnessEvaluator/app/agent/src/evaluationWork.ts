/**
 * The seller's work: evaluate a sealed Wattness record. Deterministic, no
 * model in the loop.
 *
 * A job's task description is a JSON evaluation request:
 *
 *     {"operating_day":"2026-11-26","resource":"DSWL_ESS_ESR1","chain":"bsc-testnet"}
 *
 * `negotiate` refuses to quote any other task, so a buyer can only fund work
 * this agent can deliver. The deliverable is the evaluation report and its
 * digest; the on-chain `submit` commits to the manifest that carries it.
 */

import {
  RECORD,
  evaluateSealedRecord,
  parseRequest,
  reportDigest,
  type EvaluationReport,
  type EvaluationRequest,
} from "../vendor/wattness-evaluator.js";

export const DELIVERABLE_SCHEMA = "wattness.evaluation-deliverable.v1";
const TASK_FIELDS = ["operating_day", "resource", "chain"];

export class TaskError extends Error {
  override name = "TaskError";
}

export interface JobSpec {
  task: string;
  terms: Record<string, unknown>;
}

export interface EvaluationDeliverable {
  schema: typeof DELIVERABLE_SCHEMA;
  job_id: string;
  request: Required<EvaluationRequest> & { operating_day: string };
  record: typeof RECORD;
  report: EvaluationReport;
  report_digest: string;
}

/** The evaluation request a task description names, or a TaskError. */
export function parseTask(task: unknown): Required<EvaluationRequest> {
  if (typeof task !== "string" || task.length > 512) {
    throw new TaskError("task must be a JSON evaluation request of at most 512 characters");
  }
  let doc: unknown;
  try {
    doc = JSON.parse(task);
  } catch {
    throw new TaskError("task must be a JSON evaluation request");
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new TaskError("task must be a JSON object");
  }
  const fields = doc as Record<string, unknown>;
  const unknown = Object.keys(fields).filter((k) => !TASK_FIELDS.includes(k));
  if (unknown.length > 0) throw new TaskError(`unknown task field: ${unknown.join(", ")}`);
  if (fields.operating_day !== RECORD.operatingDay) {
    throw new TaskError(`only the sealed ${RECORD.operatingDay} record is offered`);
  }
  let request: EvaluationRequest;
  try {
    request = parseRequest({ resource: fields.resource, ...(fields.chain === undefined ? {} : { chain: fields.chain }) });
  } catch (e) {
    throw new TaskError(e instanceof Error ? e.message : String(e));
  }
  return { resource: request.resource, chain: request.chain ?? "bsc-testnet" };
}

/** Why this seller will not quote `task`, or null when it will. */
export function taskRejection(task: unknown): string | null {
  try {
    parseTask(task);
    return null;
  } catch (e) {
    if (e instanceof TaskError) return e.message;
    throw e;
  }
}

/**
 * Produce the deliverable text for a verified, funded job.
 *
 * `spec` is the task + terms the provider signature covers (re-read from
 * chain by the caller). A chain read that fails throws, so the delivery is
 * retried rather than reporting a failed check it never made.
 */
export async function runEvaluation(
  spec: JobSpec | null,
  jobId: string,
  options: { now?: () => Date } = {},
): Promise<string> {
  if (spec === null) throw new Error(`job ${jobId} has no verified task`);
  const request = parseTask(spec.task);
  const report = await evaluateSealedRecord(request, options);
  const deliverable: EvaluationDeliverable = {
    schema: DELIVERABLE_SCHEMA,
    job_id: jobId,
    request: { operating_day: RECORD.operatingDay, ...request },
    record: RECORD,
    report,
    report_digest: reportDigest(report),
  };
  return JSON.stringify(deliverable);
}
