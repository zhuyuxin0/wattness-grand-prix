// The six roles one day plan is made of. The engine plays all six in one
// process (packages/agent); each role also has its own ERC-8004 identity, so a
// handoff that is real between two processes can be a job between two agents.
// What a role reads and writes is stated in the leaf's own field names.

export const ROLE_IDS = ["market-reader", "state-keeper", "forecaster", "hedger", "risk-officer", "planner"] as const;
export type RoleId = (typeof ROLE_IDS)[number];

export interface Role {
  id: RoleId;
  /** Plain name, Title Case. */
  title: string;
  /** The secrets-file stem: AGENT_<KEY>_PRIVATE_KEY and AGENT_<KEY>_ADDRESS. */
  key: string;
  summary: string;
  /** How the role does its work, in one or two sentences. */
  method: string;
  reads: readonly string[];
  /** Leaf fields and files the role's output occupies. */
  writes: readonly string[];
  /** Repo-relative source paths. */
  code: readonly string[];
  takesFrom: readonly RoleId[];
  handsTo: readonly RoleId[];
}

export const ROLES: readonly Role[] = [
  {
    id: "market-reader",
    title: "Market Reader",
    key: "MARKET_READER",
    summary:
      "Reads the market for each battery: hourly day-ahead and first-published real-time 15-minute settlement point prices at its hub and its node.",
    method:
      "Reads each day and point from the Wattness Terminal's public data release and the newest live day files, and pins every file it read by SHA-256.",
    reads: [
      "day-ahead and real-time settlement point prices by day and point, from the Wattness Terminal's public data release",
      "the live day files for the newest days",
    ],
    writes: ["inputs: the release id, its manifest SHA-256, and every file read with its SHA-256", "sync/<resource>.json"],
    code: ["packages/data/src/release.ts", "packages/data/src/prices.ts", "packages/data/src/live.ts", "packages/data/src/inputs.ts"],
    takesFrom: [],
    handsTo: ["forecaster"],
  },
  {
    id: "state-keeper",
    title: "State Keeper",
    key: "STATE_KEEPER",
    summary:
      "Keeps each battery's physical state: power and energy limits, the state-of-charge band, the opening and closing state of charge, and the daily cycle limit.",
    method:
      "Takes power, energy and location from the storage census row (for Desert Willow, from the Hedging walkthrough's own fields), then tracks state of charge hour by hour with losses taken on charging and refuses any schedule that crosses a limit.",
    reads: ["the storage census row: resource, settlement point, hub, load zone, maximum power, energy"],
    writes: ["battery", "assumptions: round trip, state-of-charge band and margin, opening and closing state of charge, cycle limit, wear cost"],
    code: ["packages/data/src/census.ts", "packages/engine/src/types.ts", "packages/engine/src/accounting.ts"],
    takesFrom: [],
    handsTo: ["planner"],
  },
  {
    id: "forecaster",
    title: "Forecaster",
    key: "FORECASTER",
    summary: "Forecasts tomorrow's hourly day-ahead price at each battery's hub and node, and builds the price scenarios every plan is scored over.",
    method:
      "Day-type persistence: a 4-3-2-1 weighted mean of the newest same-type day-ahead hub prices, plus the node's mean day-ahead basis. Each scenario adds one history day's day-ahead and real-time hub errors against the same rule to the forecast, crossed with one basis day's node-minus-hub basis; equally weighted, no random numbers.",
    reads: ["day-ahead and real-time hub prices, and day-ahead node prices, from the market reader"],
    writes: [
      "forecast: hub_da_cents, node_da_cents, the reference days and weights",
      "scenarios: method, history and basis days, count, digest_sha256",
      "leaves/<resource>.scenarios.json, whose RFC 8785 canonical SHA-256 is scenarios.digest_sha256",
    ],
    code: ["packages/engine/src/forecast.ts", "packages/engine/src/scenarios.ts"],
    takesFrom: ["market-reader"],
    handsTo: ["hedger", "risk-officer", "planner"],
  },
  {
    id: "hedger",
    title: "Hedger",
    key: "HEDGER",
    summary: "Prices the hedge: ElectronX's published hourly bounded future at the battery's hub, with its entry assumed at fair value.",
    method:
      "Uses the contract's published terms ($0 floor, $100 ceiling, $0.25 tick, 1 MWh, $0.35 fee per contract). Entry is the scenario-weighted mean of the hour's clipped settlement price, rounded to the tick and labeled assumed; no ElectronX market data is read.",
    reads: ["ElectronX's published contract terms", "the forecaster's hub scenarios"],
    writes: ["instrument: terms, settlement and collateral rules, entry_rule, entry_cents by hour, entry_assumed"],
    code: ["packages/engine/src/instrument.ts"],
    takesFrom: ["forecaster"],
    handsTo: ["planner"],
  },
  {
    id: "risk-officer",
    title: "Risk Officer",
    key: "RISK_OFFICER",
    summary:
      "Sets how much downside a plan may carry and scores every plan over the scenarios: expected revenue, conditional value at risk (CVaR) and the objective.",
    method:
      "The objective is mean revenue minus lambda times CVaR at alpha, with alpha 0.9 and lambda 0.5 over equally weighted scenarios. It also reads Cournot's probability for a Texas weather market, which a declared Wattness policy maps to a stress-scenario weight and a hedge limit.",
    reads: ["the forecaster's scenarios", "Cournot's event probability, with its basis and observation time"],
    writes: ["risk: alpha_ppm, lambda_ppm, objective", "each arm's expected_uusd, cvar_uusd and objective_uusd"],
    code: ["packages/engine/src/accounting.ts", "packages/engine/src/types.ts", "packages/adapters/cournot/src/index.ts"],
    takesFrom: ["forecaster"],
    handsTo: ["planner"],
  },
  {
    id: "planner",
    title: "Planner",
    key: "PLANNER",
    summary:
      "Chooses tomorrow's plan: three arms under the same inputs, A unhedged, B a hedge added to A's schedule, C schedule and hedge chosen together, and the arm with the highest objective is kept.",
    method:
      "Mixed-integer and linear programs solved with HiGHS: one binary per hour keeps charge and discharge apart. It writes one leaf per battery and the fleet root that is sealed before the gate, and hires the forecaster for a battery's scenarios over ERC-8183.",
    reads: ["the battery and its limits", "the forecast and scenarios", "the hedge's terms and entry", "the risk terms"],
    writes: ["arms A, B and C: kW, state of charge and contracts by hour", "selected_arm and selection_rule", "the fleet index and its RFC 6962 root"],
    code: ["packages/engine/src/arms.ts", "packages/engine/src/lp.ts", "packages/engine/src/plan.ts", "packages/agent/src/plan-day.ts"],
    takesFrom: ["state-keeper", "forecaster", "hedger", "risk-officer"],
    handsTo: [],
  },
];

export function role(id: RoleId): Role {
  const r = ROLES.find((x) => x.id === id);
  if (!r) throw new Error(`unknown role ${id}`);
  return r;
}

export function isRoleId(s: string): s is RoleId {
  return (ROLE_IDS as readonly string[]).includes(s);
}

/** Names of the two secrets a role's wallet is stored under. */
export function secretNames(id: RoleId): { key: string; address: string } {
  const stem = `AGENT_${role(id).key}`;
  return { key: `${stem}_PRIVATE_KEY`, address: `${stem}_ADDRESS` };
}
