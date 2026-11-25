import type { Hex } from "viem";
import { gateTs, odFromIso } from "./gate.js";
import { inclusionProof, merkleRoot } from "./hash.js";

// One operating day's record: a leaf per battery (its gate-record.manifest.v1),
// ordered by resource name, under one RFC 6962 root. The index itself is not
// hashed; it says where each leaf's files are and which batteries were left out.

export const FLEET_SCHEMA = "gate-record.fleet.v1";

/** The scope a day's plans are committed under; one record per committer and day. */
export const PLAN_SCOPE_LABEL = "gate-record/ercot-da-energy";

export interface FleetLeaf {
  resource: string;
  leaf: Hex;
  /** Paths relative to the index's directory. */
  manifest: string;
  scenarios: string;
}

export interface FleetExclusion {
  resource: string;
  reason: string;
}

export interface FleetIndex {
  schema: typeof FLEET_SCHEMA;
  operating_day: string;
  scope_label: string;
  gate_unix: number;
  plan_unix: number;
  /** Git tree hash of the source that planned every leaf: the record's codeHash. */
  code_tree: string;
  root: Hex;
  leaf_count: number;
  showcase: string | null;
  leaves: FleetLeaf[];
  exclusions: FleetExclusion[];
}

const RESOURCE = /^[A-Z0-9_]+$/;

export function sortLeaves<T extends { resource: string }>(leaves: readonly T[]): T[] {
  return [...leaves].sort((a, b) => (a.resource < b.resource ? -1 : a.resource > b.resource ? 1 : 0));
}

export function fleetRoot(leaves: readonly { leaf: Hex }[]): Hex {
  if (leaves.length === 0) throw new Error("a record needs at least one leaf");
  return merkleRoot(leaves.map((l) => l.leaf));
}

export function leafOf(index: FleetIndex, resource: string): { position: number; entry: FleetLeaf; proof: Hex[] } {
  const position = index.leaves.findIndex((l) => l.resource === resource);
  if (position < 0) {
    const excluded = index.exclusions.find((e) => e.resource === resource);
    throw new Error(excluded ? `${resource} was excluded: ${excluded.reason}` : `${resource} is not in this record`);
  }
  return { position, entry: index.leaves[position] as FleetLeaf, proof: inclusionProof(index.leaves.map((l) => l.leaf), position) };
}

/** Structural and root checks; leaf files are checked by whoever reads them. */
export function fleetIndexErrors(doc: unknown): string[] {
  const out: string[] = [];
  if (typeof doc !== "object" || doc === null) return ["index: expected object"];
  const d = doc as Partial<FleetIndex>;
  if (d.schema !== FLEET_SCHEMA) out.push(`schema: expected ${FLEET_SCHEMA}`);
  if (!Array.isArray(d.leaves) || d.leaves.length === 0) return [...out, "leaves: expected a non-empty array"];
  const names = d.leaves.map((l) => l.resource);
  if (names.some((n) => typeof n !== "string" || !RESOURCE.test(n))) out.push("leaves: bad resource name");
  for (let i = 1; i < names.length; i++) {
    if (!((names[i - 1] as string) < (names[i] as string))) out.push(`leaves: ${names[i]} is out of order or repeated`);
  }
  if (d.leaf_count !== d.leaves.length) out.push(`leaf_count ${d.leaf_count}, ${d.leaves.length} leaves listed`);
  try {
    const root = fleetRoot(d.leaves);
    if (d.root !== root) out.push(`root ${d.root}, leaves give ${root}`);
  } catch (err) {
    out.push(`leaves: ${(err as Error).message}`);
  }
  if (d.showcase !== null && d.showcase !== undefined && !names.includes(d.showcase)) out.push(`showcase ${d.showcase} is not a leaf`);
  if (!/^[0-9a-f]{40}$/.test(d.code_tree ?? "")) out.push("code_tree: expected 40 lowercase hex digits");
  // The contract keys a record by (committer, scope, od), so a committer could hold one record per
  // scope for the same day. Pinning the scope here makes the committer and the verifier agree on
  // the one record a day's plan may be read from.
  if (d.scope_label !== PLAN_SCOPE_LABEL) out.push(`scope_label: expected ${PLAN_SCOPE_LABEL}, got ${JSON.stringify(d.scope_label)}`);
  let gate: number | null = null;
  try {
    gate = gateTs(odFromIso(String(d.operating_day)));
  } catch {
    out.push(`operating_day: bad date ${JSON.stringify(d.operating_day)}`);
  }
  if (gate !== null && d.gate_unix !== gate) out.push(`gate_unix ${d.gate_unix}, the gate for ${d.operating_day} is ${gate}`);
  if (gate !== null && !(Number.isSafeInteger(d.plan_unix) && (d.plan_unix as number) < gate)) {
    out.push(`plan_unix ${d.plan_unix} is not before the gate ${gate}`);
  }
  return out;
}
