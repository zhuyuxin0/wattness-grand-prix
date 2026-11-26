// The files scripts/build-data.mjs writes under public/data/. Money is in
// dollars, power in MW, energy in MWh, prices in cents per MWh, times in unix
// seconds, unless a field name says otherwise.

import type { ArmName } from "../design/tokens";

export type { ArmName };

export interface ArmSummary {
  expectedUsd: number;
  cvarUsd: number;
  objectiveUsd: number;
  collateralUsd: number;
  /** Sum of |contracts| over the day's 24 hours. */
  contracts: number;
}

export interface BatterySummary {
  /** Position in the sealed index, which is the leaf's position in the tree. */
  index: number;
  resource: string;
  settlementPoint: string;
  hub: string;
  zone: string | null;
  county: string | null;
  powerMw: number;
  energyMwh: number;
  dischargeMwh: number;
  chargeMwh: number;
  selectedArm: ArmName;
  arms: Partial<Record<ArmName, ArmSummary>>;
  /** The selected arm's hourly schedule; positive is discharge. */
  scheduleMw: number[];
  leaf: `0x${string}`;
}

export interface DayIndex {
  schema: "grand-prix.day.v1";
  operatingDay: string;
  scopeLabel: string;
  gateUnix: number;
  planUnix: number;
  codeTree: string;
  root: `0x${string}`;
  leafCount: number;
  showcase: string;
  market: string;
  regime: string;
  physicalScope: string;
  inputsRelease: string;
  coverage: { listed: number; summarized: number; missing: string[]; from: "record" | "fixture" };
  exclusions: { resource: string; reason: string }[];
  batteries: BatterySummary[];
}

export interface ChainReceipt {
  chainId: number;
  chainName: string;
  mainnet: boolean;
  contract: `0x${string}`;
  txHash: `0x${string}`;
  blockNumber: number;
  /** Timestamp of the block that holds the commit. */
  blockTime: number;
  secondsBeforeGate: number;
  key: `0x${string}`;
  scope: `0x${string}`;
  scopeLabel: string;
  root: `0x${string}`;
  leafCount: number;
  codeHash: `0x${string}`;
  txUrl: string | null;
  contractUrl: string | null;
  source: string;
}

/** An earlier sealed day: its root and both commits, from that day's own record. */
export interface EarlierDay {
  operatingDay: string;
  root: `0x${string}`;
  leafCount: number;
  gateUnix: number;
  receipts: ChainReceipt[];
}

export interface Receipts {
  schema: "grand-prix.receipts.v1";
  operatingDay: string;
  receipts: ChainReceipt[];
  /** Earlier sealed days, newest first; absent in files built before the list existed. */
  earlier?: EarlierDay[];
}

export interface LateSeal {
  schema: "grand-prix.late-seal.v1";
  operatingDay: string;
  gateUnix: number;
  attemptUnix: number;
  secondsAfterGate: number;
  simulated: boolean;
  chains: { chainId: number; chainName: string; contract: string; contractUrl: string | null }[];
  error: { name: "AfterGate"; signature: string; args: [number, number] };
  errorText: string;
  rule: string;
  source: string;
}

export interface Bands {
  p05: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p95: number[];
  mean: number[];
  min: number[];
  max: number[];
}

export interface ScenarioDigest {
  schema: "grand-prix.scenarios-digest.v1";
  resource: string;
  units: "cents per MWh";
  count: number;
  weighting: string;
  method: string;
  digestSha256: string;
  fileSha256: string;
  historyDays: string[];
  basisDays: string[];
  node: Bands;
  hubSettle: Bands;
  samplePaths: number[][];
}

/** One arm of a sealed manifest, as hashed (integers in the manifest's units). */
export interface ManifestArm {
  method: string;
  kw: number[];
  soc_ukwh: number[];
  contracts: number[];
  collateral_cents: number;
  expected_uusd: number;
  cvar_uusd: number;
  objective_uusd: number;
  lp_objective_uusd: number;
}

/**
 * A sealed leaf (gate-record.manifest.v1). Only the fields pages read are
 * typed; the file is the exact document that was hashed, so keep it whole when
 * recomputing the leaf.
 */
export interface Manifest {
  schema: "gate-record.manifest.v1";
  kind: string;
  market: string;
  regime: string;
  operating_day: string;
  gate: { unix: number; local: string };
  plan_time: { unix: number; local: string };
  battery: {
    resource: string;
    settlement_point: string;
    hub: string;
    zone: string;
    county: string;
    max_power_kw: number;
    energy_kwh: number;
    source: { route: string; sha256: string };
  };
  physical_scope: string;
  assumptions: Record<string, string | number>;
  inputs: {
    release_id: string;
    release_generated_unix: number;
    manifest_sha256: string;
    files: { route: string; sha256: string }[];
    live: { route: string; sha256: string }[];
  };
  forecast: {
    method: string;
    day_type: string;
    lag_days: number;
    reference_days: { day: string; weight: number }[];
    hub_da_cents: number[];
    node_da_cents: number[];
    node_rule: string;
  };
  scenarios: { method: string; history_days: string[]; basis_days: string[]; count: number; weighting: string; digest_sha256: string };
  instrument: {
    venue: string;
    product: string;
    location: string;
    range_cents: [number, number];
    tick_cents: number;
    size_kwh: number;
    fee_cents_per_contract: number;
    settlement: string;
    collateral: string;
    source_urls: string[];
    entry_rule: string;
    entry_assumed: boolean;
    entry_cents: number[];
  };
  risk: { alpha_ppm: number; lambda_ppm: number; objective: string };
  arms: Record<ArmName, ManifestArm>;
  unsolved: unknown[];
  selected_arm: ArmName;
  selection_rule: string;
  engine: { repo: string; commit: string; tree: string; solver: string; solver_package: string };
  agent: { wallet: string; erc8004_id: string | number | null };
  outside_inputs: unknown;
  salt: `0x${string}`;
}

export interface TerminalSection {
  id: string;
  title: string;
  reads: string[];
}

export interface TerminalNode {
  id: string;
  name: string;
  short: string;
  layer: number;
  layerName: string;
  description: string;
  sections: TerminalSection[];
}

export interface TerminalEdge {
  from: string;
  to: string;
  kind: "contains" | "supplies" | "routes" | "watches" | "projects" | "controls";
  keys: string[];
}

export interface TerminalStructure {
  layers: string[];
  nodes: TerminalNode[];
  edges: TerminalEdge[];
}

export interface BrainPage {
  id: string;
  slug: string;
  title: string;
  summary?: string;
  bucket?: string;
  status?: string;
  pageType?: string;
  body?: string;
  entities?: string[];
  [extra: string]: unknown;
}

export interface BrainConnection {
  id: string;
  pageAId: string;
  pageBId: string;
  pageASlug: string;
  pageBSlug: string;
  pageATitle: string;
  pageBTitle: string;
  similarity?: number;
  strength?: "strong" | "medium" | "weak" | string;
  reasoning?: string;
  [extra: string]: unknown;
}

export interface BrainGraph {
  schema: "grand-prix.brain.v1";
  brain: string;
  pages: BrainPage[];
  connections: BrainConnection[];
  graph: { nodes: BrainPage[]; edges: BrainConnection[] };
  stats: Record<string, unknown> | null;
}

export interface FilesIndex {
  schema: "grand-prix.files.v1";
  builtFrom: "record" | "fixture";
  files: { path: string; bytes: number; sha256: string; source: string | null }[];
}
