// A player's sealed plan: one canonical JSON document, its RFC 6962 leaf hash, and the one-leaf record GateRecord
// takes for it under the arena's scope. A one-leaf tree's root is its leaf hash (RFC 6962: MTH({d}) = SHA-256(0x00 || d)),
// so root = leaf and leafCount = 1. The document names the field it was played on (the agent's sealed record, Desert
// Willow's leaf in it, the scenario set's digest), the schedule and contracts in the units the agent's leaf uses, the
// dial step that made the schedule, the score as the page computed it, the committer and a salt; integers only.
import { canonicalJson, leafHash, toHex, type Hex } from './hash';
import { odOf, scopeId, ZERO32 } from './chain';
import { DIAL_STEPS, type Field, type Played, type PlayerPlan } from './model';

export const ARENA_SCHEMA = 'gate-record.arena-plan.v1';
/** One record per committer, battery and operating day. */
export const arenaScopeLabel = (resource: string) => {
  if (!/^[A-Z0-9_]+$/.test(resource)) throw new Error(`bad resource name ${JSON.stringify(resource)}`);
  return `gate-record/arena/one-plan/${resource}`;
};

export interface ArenaLeaf {
  schema: typeof ARENA_SCHEMA;
  game: 'ONE PLAN';
  market: 'ERCOT';
  operating_day: string;
  resource: string;
  settlement_point: string;
  scope_label: string;
  field: { record_root: string; record_leaf: string; record_leaf_position: number; scenarios_sha256: string; scenarios: number; alpha_ppm: number; lambda_ppm: number };
  plan: { dial_step: number; dial_steps: number; kw: number[]; contracts: number[] };
  score: { expected_uusd: number; cvar_uusd: number; objective_uusd: number; collateral_cents: number };
  committer: string;
  salt: Hex;
}

export function freshSalt(): Hex {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return toHex(b);
}

export function arenaLeaf(f: Field, plan: PlayerPlan, played: Played, committer: string, salt: Hex): ArenaLeaf {
  if (played.lit) throw new Error('the light is on: glass over energy the schedule does not deliver cannot be sealed');
  if (played.limits.length) throw new Error(`the plan breaks a limit: ${played.limits[0]}`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(committer)) throw new Error('committer is not an address');
  if (!/^0x[0-9a-f]{64}$/.test(salt)) throw new Error('salt must be 32 bytes of lowercase hex');
  return {
    schema: ARENA_SCHEMA, game: 'ONE PLAN', market: 'ERCOT', operating_day: f.operatingDay, resource: f.resource, settlement_point: f.settlementPoint,
    scope_label: arenaScopeLabel(f.resource),
    field: {
      record_root: f.record.root, record_leaf: f.record.leaf, record_leaf_position: f.record.leafPosition, scenarios_sha256: f.scenarioDigest, scenarios: f.n,
      alpha_ppm: f.alphaPpm, lambda_ppm: f.lambdaPpm,
    },
    plan: { dial_step: plan.step, dial_steps: DIAL_STEPS, kw: played.kw.slice(), contracts: played.q.slice() },
    score: { expected_uusd: played.score.mean, cvar_uusd: played.score.cvar, objective_uusd: played.score.objective, collateral_cents: played.score.collateralCents },
    committer: committer.toLowerCase(), salt,
  };
}

export interface ArenaRecord { doc: ArenaLeaf; json: string; leaf: Hex; root: Hex; leafCount: 1; od: number; scopeLabel: string; scope: Hex; codeHash: Hex }

/** The commit's arguments for a leaf. codeHash names the code that made the record (a 20-byte git object id,
 *  left-aligned); a person's own plan has none unless the host passes the game's. */
export function arenaRecord(doc: ArenaLeaf, codeHash: Hex = ZERO32): ArenaRecord {
  const leaf = leafHash(doc);
  return { doc, json: canonicalJson(doc), leaf, root: leaf, leafCount: 1, od: odOf(doc.operating_day), scopeLabel: doc.scope_label, scope: scopeId(doc.scope_label), codeHash };
}
