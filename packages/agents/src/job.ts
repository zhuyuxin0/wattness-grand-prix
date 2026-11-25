// A job between two agents over ERC-8183: the planner (client) pays the
// forecaster (provider) for one battery's price scenarios. The deliverable
// recorded on chain is the SHA-256 of the scenarios file's RFC 8785 canonical
// JSON, which is the value the battery's leaf commits as
// scenarios.digest_sha256; so the chain shows the planner sealed exactly what
// the forecaster delivered.
import { canonicalJson, fileSha256 } from "@gatelock/core";
import { hexToString, stringToHex, type Hex } from "viem";
import type { RoleId } from "./roles.js";

export const JOB_SCHEMA = "grand-prix.agent-job.v1";
/** ERC-8183 descriptions are capped at 4096 bytes. */
export const MAX_DESCRIPTION_BYTES = 4096;
export const SCENARIOS_HASH_RULE = "sha256 of the file's RFC 8785 canonical JSON, the leaf's scenarios.digest_sha256";

/**
 * "sealed": the scenarios were sealed in that day's record before the job was opened, and the job delivers
 * them as sealed. "before-seal": the job is delivered before the day's record is committed.
 */
export type JobTiming = "sealed" | "before-seal";

export interface ScenariosJobRequest {
  schema: typeof JOB_SCHEMA;
  task: "price-scenarios";
  operating_day: string;
  resource: string;
  client: { role: RoleId; agent_id: number };
  provider: { role: RoleId; agent_id: number };
  deliverable: { file: string; hash: string };
  timing: JobTiming;
  note: string;
}

export function scenariosFile(resource: string): string {
  if (!/^[A-Z0-9_]+$/.test(resource)) throw new Error(`bad resource name ${JSON.stringify(resource)}`);
  return `leaves/${resource}.scenarios.json`;
}

export function timingNote(timing: JobTiming, operatingDay: string): string {
  return timing === "sealed"
    ? `Delivers the price scenarios already sealed in the ${operatingDay} record, as sealed; the job was opened after that seal.`
    : `Delivered before the ${operatingDay} record is committed; the sealed leaf must commit the same digest.`;
}

export function scenariosJobRequest(o: {
  operatingDay: string;
  resource: string;
  clientId: number;
  providerId: number;
  timing: JobTiming;
}): ScenariosJobRequest {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.operatingDay)) throw new Error(`operating day must be YYYY-MM-DD, got ${o.operatingDay}`);
  return {
    schema: JOB_SCHEMA,
    task: "price-scenarios",
    operating_day: o.operatingDay,
    resource: o.resource,
    client: { role: "planner", agent_id: o.clientId },
    provider: { role: "forecaster", agent_id: o.providerId },
    deliverable: { file: scenariosFile(o.resource), hash: SCENARIOS_HASH_RULE },
    timing: o.timing,
    note: timingNote(o.timing, o.operatingDay),
  };
}

/** The job's on-chain description: the request's canonical JSON. */
export function jobDescription(req: ScenariosJobRequest): string {
  const text = canonicalJson(req);
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_DESCRIPTION_BYTES) throw new Error(`job description is ${bytes} bytes, over ${MAX_DESCRIPTION_BYTES}`);
  return text;
}

/** The request a description carries, or null when it is not one of ours. */
export function parseJobRequest(description: string): ScenariosJobRequest | null {
  let doc: unknown;
  try {
    doc = JSON.parse(description);
  } catch {
    return null;
  }
  if (doc === null || typeof doc !== "object") return null;
  const d = doc as Partial<ScenariosJobRequest>;
  if (d.schema !== JOB_SCHEMA || d.task !== "price-scenarios" || typeof d.resource !== "string" || typeof d.operating_day !== "string") return null;
  return d as ScenariosJobRequest;
}

/** SHA-256 of a scenarios matrix's canonical JSON, lowercase hex without 0x, as the leaf commits it. */
export function scenariosDigest(matrix: unknown): string {
  return fileSha256(canonicalJson(matrix));
}

/** The bytes32 a forecaster submits for a scenarios matrix. */
export function scenariosDeliverable(matrix: unknown): Hex {
  return `0x${scenariosDigest(matrix)}`;
}

export interface SubmitParams {
  /** Where the delivered file can be fetched; the BNB agent SDK reads this key. */
  deliverable_url: string;
  hash: string;
  resource: string;
  operating_day: string;
}

export function encodeSubmitParams(p: SubmitParams): Hex {
  return stringToHex(canonicalJson(p));
}

export function decodeSubmitParams(raw: Hex): SubmitParams | null {
  if (raw === "0x") return null;
  try {
    const doc = JSON.parse(hexToString(raw)) as Partial<SubmitParams>;
    return typeof doc.deliverable_url === "string" ? (doc as SubmitParams) : null;
  } catch {
    return null;
  }
}
