import type { Address, Hash } from "viem";
import type { Artifact, BuildInfo } from "./artifact.ts";

export const SOURCIFY_API = "https://sourcify.dev/server";

export interface VerifyRequest {
  stdJsonInput: BuildInfo["input"];
  compilerVersion: string;
  contractIdentifier: string;
  creationTransactionHash: Hash;
}

export function verifyRequest(artifact: Artifact, buildInfo: BuildInfo, creationTx: Hash): VerifyRequest {
  if (buildInfo.id !== artifact.buildInfoId) {
    throw new Error(`build info ${buildInfo.id} is not the artifact's ${artifact.buildInfoId}`);
  }
  if (!(artifact.inputSourceName in buildInfo.input.sources)) {
    throw new Error(`${artifact.inputSourceName} missing from build info sources`);
  }
  return {
    // Submitted unchanged: the metadata hash in the bytecode covers these exact source names.
    stdJsonInput: buildInfo.input,
    compilerVersion: buildInfo.solcLongVersion,
    contractIdentifier: `${artifact.inputSourceName}:${artifact.contractName}`,
    creationTransactionHash: creationTx,
  };
}

export type Match = "exact_match" | "match";

export interface VerifyResult {
  match: Match;
  verificationId?: string;
  alreadyVerified: boolean;
}

interface JobStatus {
  isJobCompleted?: boolean;
  contract?: { match?: Match | null; runtimeMatch?: Match | null; creationMatch?: Match | null };
  error?: { customCode?: string; message?: string };
}

export interface SourcifyOptions {
  api?: string;
  fetch?: typeof fetch;
  pollMs?: number;
  timeoutMs?: number;
}

export async function lookupMatch(chainId: number, address: Address, options: SourcifyOptions = {}): Promise<Match | null> {
  const { api = SOURCIFY_API, fetch: f = fetch } = options;
  const res = await f(`${api}/v2/contract/${chainId}/${address}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sourcify lookup: HTTP ${res.status}`);
  const body = (await res.json()) as { match?: Match | null };
  return body.match ?? null;
}

export async function verifyOnSourcify(
  chainId: number,
  address: Address,
  request: VerifyRequest,
  options: SourcifyOptions = {},
): Promise<VerifyResult> {
  const { api = SOURCIFY_API, fetch: f = fetch, pollMs = 3_000, timeoutMs = 180_000 } = options;

  const existing = await lookupMatch(chainId, address, options);
  if (existing) return { match: existing, alreadyVerified: true };

  const res = await f(`${api}/v2/verify/${chainId}/${address}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (res.status === 409) {
    const match = await lookupMatch(chainId, address, options);
    if (match) return { match, alreadyVerified: true };
  }
  const body = (await res.json()) as { verificationId?: string; customCode?: string; message?: string };
  if (!res.ok || !body.verificationId) {
    throw new Error(`Sourcify rejected the request: HTTP ${res.status} ${body.customCode ?? ""} ${body.message ?? ""}`.trim());
  }

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = (await (await f(`${api}/v2/verify/${body.verificationId}`)).json()) as JobStatus;
    if (job.isJobCompleted) {
      const match = job.contract?.match;
      if (match) return { match, verificationId: body.verificationId, alreadyVerified: false };
      const why = job.error ? `${job.error.customCode ?? ""}: ${job.error.message ?? ""}` : "no match";
      throw new Error(`Sourcify verification ${body.verificationId} failed (${why})`);
    }
    if (Date.now() > deadline) throw new Error(`Sourcify verification ${body.verificationId} still pending`);
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
