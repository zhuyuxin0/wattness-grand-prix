// Types for vendor/wattness-evaluator.js, which scripts/vendor-evaluator.mjs
// bundles from packages/adapters/agent-studio and fixtures/od-20261126.

export type Resource = "DSWL_ESS_ESR1" | "CLO_ESR1";

export interface EvaluationRequest {
  resource: Resource;
  chain?: "bsc-testnet" | "offline";
}

export interface CheckResult {
  id: string;
  title: string;
  status: "PASS" | "FAIL" | "SKIP";
  details: string[];
}

export interface EvaluationReport {
  schema: "wattness.evaluation-report.v1";
  resource: Resource;
  observedAt: string;
  scope: "shadow-plan-evaluation";
  status: "failed" | "checks-passed-with-skips" | "checks-passed";
  record: { root: string; chainId: 97; operatingDay: string; gateUnix: number; planUnix: number };
  checks: CheckResult[];
  limitations: readonly string[];
}

/** The sealed record the bundle embeds: its fleet index and the BSC testnet receipt. */
export interface SealedRecord {
  operatingDay: string;
  root: string;
  leafCount: number;
  codeTree: string;
  chainId: 97;
  contract: string;
  key: string;
  txHash: string;
  blockNumber: number;
}

export const RECORD: SealedRecord;
export const RESOURCES: readonly Resource[];
export function parseRequest(input: unknown): EvaluationRequest;
export function evaluateSealedRecord(request: EvaluationRequest, options?: { now?: () => Date }): Promise<EvaluationReport>;
export function reportDigest(report: EvaluationReport): string;
