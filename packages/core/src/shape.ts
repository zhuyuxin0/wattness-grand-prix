import { MANIFEST_SCHEMA, OUTCOME_SCHEMA } from "./manifest.js";

// Structural checks for hashed documents. Each returns a list of problems,
// empty when the document has the expected shape. Semantics (limits, sums,
// dates) are the verifier's job.

type Rule = (v: unknown, path: string, out: string[]) => void;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const str: Rule = (v, p, o) => void (typeof v !== "string" && o.push(`${p}: expected string`));
const int: Rule = (v, p, o) => void (!Number.isSafeInteger(v) && o.push(`${p}: expected integer`));
const nonNeg: Rule = (v, p, o) =>
  void (!(Number.isSafeInteger(v) && (v as number) >= 0) && o.push(`${p}: expected non-negative integer`));
const lit =
  (...values: unknown[]): Rule =>
  (v, p, o) =>
    void (!values.includes(v) && o.push(`${p}: expected ${values.map((x) => JSON.stringify(x)).join(" | ")}`));
const re =
  (pattern: RegExp, what: string): Rule =>
  (v, p, o) =>
    void ((typeof v !== "string" || !pattern.test(v)) && o.push(`${p}: expected ${what}`));
const nullable =
  (rule: Rule): Rule =>
  (v, p, o) =>
    v === null ? undefined : rule(v, p, o);
const arr =
  (rule: Rule): Rule =>
  (v, p, o) => {
    if (!Array.isArray(v)) return void o.push(`${p}: expected array`);
    v.forEach((x, i) => rule(x, `${p}[${i}]`, o));
  };
const tuple =
  (...rules: Rule[]): Rule =>
  (v, p, o) => {
    if (!Array.isArray(v) || v.length !== rules.length) return void o.push(`${p}: expected ${rules.length}-tuple`);
    rules.forEach((r, i) => r(v[i], `${p}[${i}]`, o));
  };
const any: Rule = () => {};
const obj =
  (fields: Record<string, Rule>): Rule =>
  (v, p, o) => {
    if (!isObj(v)) return void o.push(`${p}: expected object`);
    for (const [k, rule] of Object.entries(fields)) {
      if (!(k in v)) o.push(`${p}.${k}: missing`);
      else rule(v[k], `${p}.${k}`, o);
    }
    for (const k of Object.keys(v)) if (!(k in fields)) o.push(`${p}.${k}: unexpected field`);
  };

const day = re(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const sha = re(/^[0-9a-f]{64}$/, "64 lowercase hex digits");
const hex32 = re(/^0x[0-9a-f]{64}$/, "0x-prefixed 32 bytes, lowercase");
const address = re(/^0x[0-9a-fA-F]{40}$/, "0x-prefixed address");
const armId = lit("A", "B", "C");
const perArm = (rule: Rule): Rule => obj({ A: nullable(rule), B: nullable(rule), C: nullable(rule) });

const fileRef = obj({ route: str, sha256: sha });
const stamp = obj({ unix: nonNeg, local: str });

const manifestRule = obj({
  schema: lit(MANIFEST_SCHEMA),
  kind: lit("prospective", "replay", "test"),
  market: lit("ERCOT"),
  regime: lit("RTC+B"),
  operating_day: day,
  gate: stamp,
  plan_time: stamp,
  battery: obj({
    resource: str,
    settlement_point: str,
    hub: str,
    zone: nullable(str),
    county: nullable(str),
    max_power_kw: nonNeg,
    energy_kwh: nonNeg,
    source: fileRef,
  }),
  physical_scope: str,
  assumptions: obj({
    basis: lit("assumed"),
    round_trip_ppm: nonNeg,
    soc_min_ppm: nonNeg,
    soc_max_ppm: nonNeg,
    soc_open_ppm: nonNeg,
    soc_end_min_ppm: nonNeg,
    soc_margin_kwh: nonNeg,
    max_cycles_ppm: nonNeg,
    wear_cents_per_mwh: nonNeg,
    max_contracts_per_hour: nonNeg,
    collateral_budget_cents: nonNeg,
    hedge_cap: lit("schedule", "size"),
    losses: str,
  }),
  inputs: obj({
    release_id: str,
    release_generated_unix: nonNeg,
    manifest_sha256: sha,
    files: arr(fileRef),
    live: arr(fileRef),
  }),
  forecast: obj({
    method: str,
    day_type: str,
    lag_days: nonNeg,
    reference_days: arr(obj({ day, weight: nonNeg })),
    hub_da_cents: arr(int),
    node_da_cents: arr(int),
    node_rule: str,
  }),
  scenarios: obj({
    method: str,
    history_days: arr(day),
    basis_days: arr(day),
    count: nonNeg,
    weighting: str,
    digest_sha256: sha,
  }),
  instrument: obj({
    venue: str,
    product: str,
    location: str,
    range_cents: tuple(int, int),
    tick_cents: nonNeg,
    size_kwh: nonNeg,
    fee_cents_per_contract: nonNeg,
    settlement: str,
    collateral: str,
    source_urls: arr(str),
    entry_rule: str,
    entry_assumed: lit(true),
    entry_cents: arr(int),
  }),
  risk: obj({ alpha_ppm: nonNeg, lambda_ppm: nonNeg, objective: str }),
  arms: perArm(
    obj({
      method: str,
      kw: arr(int),
      soc_ukwh: arr(nonNeg),
      contracts: arr(int),
      collateral_cents: nonNeg,
      expected_uusd: int,
      cvar_uusd: int,
      objective_uusd: int,
      lp_objective_uusd: int,
    }),
  ),
  unsolved: arr(obj({ arm: armId, reason: str })),
  selected_arm: armId,
  selection_rule: str,
  engine: obj({ repo: str, commit: str, tree: re(/^[0-9a-f]{40}$/, "40 lowercase hex digits"), solver: str, solver_package: str }),
  agent: obj({ wallet: address, erc8004_id: nullable(str) }),
  outside_inputs: any,
  salt: hex32,
});

const four = tuple(int, int, int, int);
const outcomeRule = obj({
  schema: lit(OUTCOME_SCHEMA),
  stage: lit(1, 2, 3),
  operating_day: day,
  manifest_root: hex32,
  inputs: obj({ release_id: nullable(str), manifest_sha256: nullable(sha), files: arr(fileRef), live: arr(fileRef) }),
  prices: obj({ da_node_cents: arr(int), rt_hub_cents: nullable(arr(nullable(four))) }),
  arms: perArm(
    obj({
      energy_uusd: int,
      wear_uusd: nonNeg,
      hedge_uusd: nullable(int),
      fees_uusd: nonNeg,
      net_uusd: nullable(int),
    }),
  ),
});

const scenarioRule = obj({
  basis_days: arr(day),
  history_days: arr(day),
  hub_sum4: arr(arr(int)),
  node_cents: arr(arr(int)),
});

export function manifestShapeErrors(doc: unknown): string[] {
  const out: string[] = [];
  manifestRule(doc, "$", out);
  return out;
}

export function outcomeShapeErrors(doc: unknown): string[] {
  const out: string[] = [];
  outcomeRule(doc, "$", out);
  return out;
}

export function scenarioShapeErrors(doc: unknown): string[] {
  const out: string[] = [];
  scenarioRule(doc, "$", out);
  return out;
}
