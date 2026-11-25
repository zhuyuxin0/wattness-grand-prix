import type { DayIndex } from "../../../data";
import { CENTRAL_TZ } from "../../../config";
import { gateFor, zonedInstant } from "../../../lib/time";
import { readRecord, recordKey, scopeId, type ChainRead, type Network } from "./chain";
import {
  checkLimits,
  computeLeaf,
  diff,
  inclusionProof,
  merkleRoot,
  walkProof,
  type Difference,
  type LimitManifest,
  type LimitsReport,
  type ProofStep,
} from "./core";

export type CheckId = 1 | 2 | 3 | 4 | 5;
export type Status = "pass" | "fail" | "unread";
export type Claim = "Commitment verified" | "Model constraints checked";

export interface Comparison {
  label: string;
  /** What the check expects, and where that value comes from. */
  expected: string;
  expectedFrom: string;
  actual: string;
  actualFrom: string;
  ok: boolean;
  kind: "hash" | "text";
}

interface Base {
  id: CheckId;
  title: string;
  claim: Claim;
  status: Status;
  comparisons: Comparison[];
  notes: string[];
  error?: string;
}

export type CheckResult =
  | (Base & { id: 1; differences: Difference[]; canonicalBytes: number })
  | (Base & { id: 2; leaf: string; steps: ProofStep[]; index: number; size: number })
  | (Base & { id: 3; read: ChainRead | null })
  | (Base & { id: 4; committedAt: number | null; gate: number })
  | (Base & { id: 5; limits: LimitsReport | null });

export const TITLES: Record<CheckId, { title: string; claim: Claim }> = {
  1: { title: "The leaf recomputes from the plan", claim: "Commitment verified" },
  2: { title: "The proof reaches the day's root", claim: "Commitment verified" },
  3: { title: "The chain holds the same record", claim: "Commitment verified" },
  4: { title: "Sealed before the gate", claim: "Commitment verified" },
  5: { title: "Battery limits hold every hour", claim: "Model constraints checked" },
};

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function cmp(label: string, expected: string, expectedFrom: string, actual: string, actualFrom: string, kind: "hash" | "text" = "hash"): Comparison {
  return { label, expected, expectedFrom, actual, actualFrom, ok: kind === "hash" ? eq(expected, actual) : expected === actual, kind };
}

const status = (cs: Comparison[]): Status => (cs.every((c) => c.ok) ? "pass" : "fail");

export function odNumber(day: string): number {
  return Number(day.replaceAll("-", ""));
}

/** Hours in a CT operating day: 23 or 25 on daylight-saving changes. */
export function hoursIn(day: string): number {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return Math.round((zonedInstant(CENTRAL_TZ, y, m, d + 1) - zonedInstant(CENTRAL_TZ, y, m, d)) / 3_600_000);
}

export interface RunInput {
  day: DayIndex;
  resource: string;
  /** The plan as sealed, rebuilt from the published pack. */
  sealed: Record<string, unknown>;
  /** The document to check: the sealed plan, or a tampered copy of it. */
  doc: Record<string, unknown>;
  network: Network;
  contract: string;
}

export async function checkLeaf(input: RunInput): Promise<CheckResult & { id: 1 }> {
  const entry = input.day.batteries.find((b) => b.resource === input.resource);
  if (!entry) throw new Error(`${input.resource} is not in the day's index`);
  const { leaf, bytes } = await computeLeaf(input.doc);
  const comparisons = [cmp("Leaf hash", entry.leaf, `the day's index, position ${entry.index + 1} of ${input.day.leafCount}`, leaf, "SHA-256(0x00 ‖ RFC 8785 JSON), WebCrypto")];
  return {
    id: 1,
    ...TITLES[1],
    status: status(comparisons),
    comparisons,
    notes: [`${bytes.toLocaleString("en-US")} bytes of canonical JSON`],
    differences: diff(input.sealed, input.doc),
    canonicalBytes: bytes,
  };
}

export async function checkProof(input: RunInput): Promise<CheckResult & { id: 2 }> {
  const leaves = input.day.batteries.map((b) => b.leaf);
  const m = input.day.batteries.findIndex((b) => b.resource === input.resource);
  const [{ leaf }, proof, fullRoot] = await Promise.all([computeLeaf(input.doc), inclusionProof(leaves, m), merkleRoot(leaves)]);
  const { root, steps } = await walkProof(leaf, m, leaves.length, proof);
  const comparisons = [
    cmp("Root from this leaf's proof", input.day.root, "the day's index", root, `${steps.length} RFC 6962 steps from the recomputed leaf`),
    cmp("Root over all leaves", input.day.root, "the day's index", fullRoot, `RFC 6962 tree over the index's ${leaves.length} leaf hashes`),
  ];
  return { id: 2, ...TITLES[2], status: status(comparisons), comparisons, notes: [], leaf, steps, index: m, size: leaves.length };
}

export async function checkChain(input: RunInput): Promise<[CheckResult & { id: 3 }, CheckResult & { id: 4 }]> {
  const agent = (input.doc.agent as { wallet?: string } | undefined)?.wallet ?? "";
  const od = odNumber(input.day.operatingDay);
  const scope = scopeId(input.day.scopeLabel);
  const gate = gateFor(input.day.operatingDay);
  const sealedGate = (input.doc.gate as { unix?: number } | undefined)?.unix ?? null;
  let read: ChainRead | null = null;
  let error: string | undefined;
  try {
    read = await readRecord(input.network, input.contract, recordKey(agent, scope, od));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const host = read ? new URL(read.rpc).host : "";
  const from = `GateRecord.get(key) on ${input.network.short}`;
  const codeHash = `0x${input.day.codeTree}${"0".repeat(24)}`;
  const c3: Comparison[] = read
    ? [
        cmp("Root", input.day.root, "the day's index", read.record.root, from),
        cmp("Leaf count", String(input.day.leafCount), "the day's index", String(read.record.leafCount), from, "text"),
        cmp("Committer", agent, "the plan's agent wallet", read.record.committer, from),
        cmp("Scope", scope, `keccak256("${input.day.scopeLabel}")`, read.record.scope, from),
        cmp("Operating day", String(od), "the plan", String(read.record.od), from, "text"),
        cmp("Code hash", codeHash, `git tree ${input.day.codeTree.slice(0, 7)}, left-aligned`, read.record.codeHash, from),
      ]
    : [];
  const r3 = {
    id: 3 as const,
    ...TITLES[3],
    status: read ? status(c3) : ("unread" as const),
    comparisons: c3,
    notes: read
      ? [
          `key = keccak256(abi.encode(committer, scope, ${od})) = ${recordKey(agent, scope, od)}`,
          `answered by ${host} at block ${read.headBlock.toLocaleString("en-US")}`,
        ]
      : [],
    error,
    read,
  };

  const committedAt = read?.record.committedAt ?? null;
  const c4: Comparison[] = [];
  if (sealedGate !== null) c4.push(cmp("Gate", String(gate), "10:00 CT the day before, from the time zone", String(sealedGate), "the plan's gate", "text"));
  if (committedAt !== null) {
    c4.push({
      label: "Committed before the gate",
      expected: `before ${gate}`,
      expectedFrom: "the gate, unix seconds",
      actual: String(committedAt),
      actualFrom: `block ${read?.record.blockNumber.toLocaleString("en-US")} timestamp, on chain`,
      ok: committedAt < gate,
      kind: "text",
    });
  }
  const r4 = {
    id: 4 as const,
    ...TITLES[4],
    status: committedAt === null ? ("unread" as const) : status(c4),
    comparisons: c4,
    notes: [],
    error,
    committedAt,
    gate,
  };
  return [r3, r4];
}

export function checkBattery(input: RunInput): CheckResult & { id: 5 } {
  try {
    const limits = checkLimits(input.doc as unknown as LimitManifest, hoursIn(input.day.operatingDay));
    return { id: 5, ...TITLES[5], status: limits.problems.length === 0 ? "pass" : "fail", comparisons: [], notes: limits.problems.slice(0, 6), limits };
  } catch (e) {
    return { id: 5, ...TITLES[5], status: "fail", comparisons: [], notes: [e instanceof Error ? e.message : String(e)], limits: null };
  }
}
