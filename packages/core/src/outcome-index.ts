import type { Hex } from "viem";
import { inclusionProof, merkleRoot } from "./hash.js";
import type { FileRef } from "./manifest.js";

// One settlement stage of a fleet record: a gate-record.outcome.v1 per plan
// leaf, kept in the plan's leaf order, under one RFC 6962 root. That root is
// what GateRecord.linkOutcome(key, stage, root) holds. Outcome leaf i settles
// plan leaf i, so a battery's audit path has the same shape in both trees.
// Like the fleet index, this index is not hashed itself; its leaves are.

export const OUTCOME_INDEX_SCHEMA = "gate-record.outcome-index.v1";

export interface OutcomeIndexLeaf {
  resource: string;
  /** SHA-256(0x00 || JCS(outcome document)). */
  leaf: Hex;
  /** The plan leaf this outcome settles. */
  plan_leaf: Hex;
  /** The outcome document, relative to the index's directory: leaves/<resource>.json. */
  document: string;
}

export interface OutcomeIndex {
  schema: typeof OUTCOME_INDEX_SCHEMA;
  operating_day: string;
  stage: 1 | 2 | 3;
  stage_name: string;
  /** Root of the plan record these outcomes settle. */
  record_root: Hex;
  /** Root over the outcome leaves: the hash GateRecord links for this stage. */
  root: Hex;
  leaf_count: number;
  release_id: string | null;
  manifest_sha256: string | null;
  live_day: FileRef | null;
  physical_basis: string;
  hedge_settlement: string | null;
  rt_rule: string | null;
  leaves: OutcomeIndexLeaf[];
}

/** What the outcome index is checked against: the plan record's root, day and leaves. */
export interface PlanLeaves {
  root: Hex;
  operating_day: string;
  leaves: readonly { resource: string; leaf: Hex }[];
}

const HEX32 = /^0x[0-9a-f]{64}$/;
const RESOURCE = /^[A-Z0-9_]+$/;

export function outcomeDocumentPath(resource: string): string {
  return `leaves/${resource}.json`;
}

export function outcomeRoot(leaves: readonly { leaf: Hex }[]): Hex {
  if (leaves.length === 0) throw new Error("an outcome needs at least one leaf");
  return merkleRoot(leaves.map((l) => l.leaf));
}

/**
 * Structural and root checks. With the plan, also that the outcomes settle exactly its leaves, in its order.
 * Outcome documents are checked by whoever reads them.
 */
export function outcomeIndexErrors(doc: unknown, plan?: PlanLeaves): string[] {
  const out: string[] = [];
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return ["outcome index: expected object"];
  const d = doc as Partial<OutcomeIndex>;
  if (d.schema !== OUTCOME_INDEX_SCHEMA) out.push(`schema: expected ${OUTCOME_INDEX_SCHEMA}`);
  if (d.stage !== 1 && d.stage !== 2 && d.stage !== 3) out.push(`stage: expected 1, 2 or 3, got ${JSON.stringify(d.stage)}`);
  if (typeof d.operating_day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.operating_day)) out.push("operating_day: expected YYYY-MM-DD");
  if (typeof d.record_root !== "string" || !HEX32.test(d.record_root)) out.push("record_root: expected 0x-prefixed 32 bytes, lowercase");
  if (!Array.isArray(d.leaves) || d.leaves.length === 0) return [...out, "leaves: expected a non-empty array"];
  const leaves = d.leaves as Partial<OutcomeIndexLeaf>[];
  leaves.forEach((l, i) => {
    if (typeof l !== "object" || l === null) return void out.push(`leaves[${i}]: expected object`);
    if (typeof l.resource !== "string" || !RESOURCE.test(l.resource)) out.push(`leaves[${i}]: bad resource name`);
    if (typeof l.leaf !== "string" || !HEX32.test(l.leaf)) out.push(`leaves[${i}].leaf: expected 0x-prefixed 32 bytes, lowercase`);
    if (typeof l.plan_leaf !== "string" || !HEX32.test(l.plan_leaf)) out.push(`leaves[${i}].plan_leaf: expected 0x-prefixed 32 bytes, lowercase`);
    // A fixed name keeps a reader from following a path out of the stage's directory.
    if (typeof l.resource === "string" && l.document !== outcomeDocumentPath(l.resource)) {
      out.push(`leaves[${i}].document: expected ${outcomeDocumentPath(l.resource)}, got ${JSON.stringify(l.document)}`);
    }
    if (i > 0 && !((leaves[i - 1]?.resource ?? "") < (l.resource ?? ""))) out.push(`leaves: ${l.resource} is out of order or repeated`);
  });
  if (d.leaf_count !== leaves.length) out.push(`leaf_count ${d.leaf_count}, ${leaves.length} leaves listed`);
  if (leaves.every((l) => typeof l?.leaf === "string" && HEX32.test(l.leaf))) {
    const root = outcomeRoot(leaves as OutcomeIndexLeaf[]);
    if (d.root !== root) out.push(`root ${d.root}, leaves give ${root}`);
  }
  if (plan) {
    if (d.record_root !== plan.root) out.push(`record_root ${d.record_root}, the plan's root is ${plan.root}`);
    if (d.operating_day !== plan.operating_day) out.push(`operating_day ${d.operating_day}, the plan's is ${plan.operating_day}`);
    if (leaves.length !== plan.leaves.length) out.push(`${leaves.length} outcome leaves for ${plan.leaves.length} plan leaves`);
    const n = Math.min(leaves.length, plan.leaves.length);
    let shown = 0;
    for (let i = 0; i < n && shown < 5; i++) {
      const o = leaves[i]!;
      const p = plan.leaves[i]!;
      if (o.resource !== p.resource) {
        out.push(`leaves[${i}] settles ${o.resource}, plan leaf ${i} is ${p.resource}`);
        shown++;
      } else if (o.plan_leaf !== p.leaf) {
        out.push(`leaves[${i}] (${o.resource}) settles plan leaf ${o.plan_leaf}, the plan's is ${p.leaf}`);
        shown++;
      }
    }
  }
  return out;
}

/** A battery's place in a stage's outcome tree and its RFC 6962 audit path. */
export function outcomeLeafOf(index: OutcomeIndex, resource: string): { position: number; entry: OutcomeIndexLeaf; proof: Hex[] } {
  const position = index.leaves.findIndex((l) => l.resource === resource);
  if (position < 0) throw new Error(`${resource} has no outcome in stage ${index.stage}'s index`);
  return { position, entry: index.leaves[position] as OutcomeIndexLeaf, proof: inclusionProof(index.leaves.map((l) => l.leaf), position) };
}
