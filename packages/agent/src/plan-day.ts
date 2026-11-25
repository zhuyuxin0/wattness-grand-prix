import {
  FLEET_SCHEMA,
  PLAN_SCOPE_LABEL,
  fleetRoot,
  leafHash,
  sortLeaves,
  type FleetExclusion,
  type FleetIndex,
  type FleetLeaf,
} from "@gatelock/core";
import {
  DataError,
  ProvenanceLog,
  Store,
  addDays,
  defaultCacheDir,
  httpFetcher,
  loadPlanInputs,
  offlineFetcher,
  openRelease,
  readCensusResources,
  type LiveDayPin,
  type ReleasePin,
  type Snapshot,
} from "@gatelock/data";
import { fromData, gateUnix, plan, type ArmId, type CournotReading, type Manifest, type RecordKind } from "@gatelock/engine";
import type { Address, Hex } from "viem";

export const ENGINE_REPO = "https://github.com/zhuyuxin0/wattness-grand-prix";
/** The showcase leaf: the one battery whose identity comes from the hedging walkthrough. */
export const SHOWCASE = "DSWL_ESS_ESR1";
/** Node prices must exist on at least one day of this window (days before the operating day). */
export const NODE_WINDOW = { fromDaysBefore: 8, toDaysBefore: 2 } as const;

export interface DayPlanOptions {
  operatingDay: string;
  /**
   * Plan time, unix seconds. When absent it is stamped once every input has been loaded,
   * so no cited input can postdate it.
   */
  planUnix?: number;
  kind: RecordKind;
  salt: Hex;
  wallet: Address;
  /** repo defaults to ENGINE_REPO; a replay of a sealed record passes the record's own. */
  source: { commit: string; tree: string; repo?: string };
  /** Resources to plan besides the showcase; empty plans the showcase alone. */
  others: readonly string[] | "census";
  /** Previous syncs by resource, for an offline replay. */
  snapshots?: ReadonlyMap<string, Snapshot>;
  offline?: boolean;
  /** Seconds arm C may take on a leaf other than the showcase. */
  otherJointSeconds?: number;
  log?: (line: string) => void;
  /** Clock for the plan-time stamp, in milliseconds. */
  now?: () => number;
  /** The risk officer's Cournot reading, taken before planning; every leaf applies the weather rule to it. */
  cournot?: CournotReading;
  /** The planner's ERC-8004 agent id, written into every leaf. */
  erc8004Id?: string | null;
}

export interface PlannedLeaf {
  resource: string;
  manifest: Manifest;
  scenarios: { basis_days: string[]; history_days: string[]; hub_sum4: number[][]; node_cents: number[][] };
  snapshot: Snapshot;
  leaf: Hex;
}

export interface DayPlan {
  index: FleetIndex;
  leaves: PlannedLeaf[];
  planUnix: number;
}

// "offline": an offline replay has no sync for a battery the original run excluded.
const SKIP_CODES = new Set(["missing", "shape", "offline"]);

function shortReason(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > 160 ? `${msg.slice(0, 157)}...` : msg;
}

type Loaded = Awaited<ReturnType<typeof loadPlanInputs>>;

/** The longest the plan-time stamp waits for a reading's second to pass. */
export const STAMP_WAIT_MS = 2_000;

/**
 * The plan-time stamp, in unix seconds. A reading's time is rounded up to the second and the stamp down, so a
 * reading received in the same second as the stamp would look later than the plan and the weather rule would
 * refuse it. The stamp waits out that second first, never longer than STAMP_WAIT_MS; a reading timed further
 * ahead than that is left for the rule to refuse.
 */
export async function stampPlanTime(
  now: () => number,
  observedUnix: number | null,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<number> {
  if (observedUnix !== null) {
    const wait = observedUnix * 1000 - now();
    if (wait > 0 && wait <= STAMP_WAIT_MS) await sleep(wait);
  }
  return Math.floor(now() / 1000);
}

export async function planDay(o: DayPlanOptions): Promise<DayPlan> {
  const log = o.log ?? (() => {});
  const gate = gateUnix(o.operatingDay);
  if (o.planUnix !== undefined && o.planUnix >= gate) throw new Error(`plan time ${o.planUnix} is at or after the gate ${gate}`);
  const windowFrom = addDays(o.operatingDay, -NODE_WINDOW.fromDaysBefore);
  const windowTo = addDays(o.operatingDay, -NODE_WINDOW.toDaysBefore);

  let pins: { release: ReleasePin; live: LiveDayPin[] } | undefined;
  const load = async (resource: string, identity: "census" | "walkthrough"): Promise<Loaded> => {
    const snapshot = o.snapshots?.get(resource);
    if (o.offline && !snapshot) throw new DataError("offline", `no snapshot for ${resource}`);
    return loadPlanInputs({
      resource,
      identity,
      offline: o.offline ?? false,
      ...(snapshot ? { snapshot } : pins ? { pins } : {}),
    });
  };

  const exclusions: FleetExclusion[] = [];
  const ready: { resource: string; showcase: boolean; loaded: Loaded }[] = [];

  // Every input is in hand before anything is solved, so the plan time can follow the last fetch.
  const loadOne = async (resource: string, showcase: boolean): Promise<void> => {
    let loaded: Loaded;
    try {
      loaded = await load(resource, showcase ? "walkthrough" : "census");
    } catch (err) {
      if (showcase || !(err instanceof DataError && SKIP_CODES.has(err.code))) throw err;
      exclusions.push({ resource, reason: shortReason(err) });
      return;
    }
    const { inputs, snapshot } = loaded;
    pins ??= { release: snapshot.release, live: snapshot.live };
    const nodeInWindow = inputs.node.some((d) => d.day >= windowFrom && d.day <= windowTo && d.da.every((h) => h.grade === "published"));
    if (!nodeInWindow) {
      const reason = `no day-ahead prices at ${inputs.battery.settlementPoint} on ${windowFrom}..${windowTo}`;
      if (showcase) throw new Error(`showcase ${resource}: ${reason}`);
      exclusions.push({ resource, reason });
      return;
    }
    ready.push({ resource, showcase, loaded });
  };

  await loadOne(SHOWCASE, true);
  let others: string[];
  if (o.others === "census") {
    others = (await censusResources(pins!, o.offline ?? false)).filter((r) => r !== SHOWCASE);
  } else {
    others = [...new Set(o.others)].filter((r) => r !== SHOWCASE);
  }
  for (const r of others) await loadOne(r, false);

  const planUnix = o.planUnix ?? (await stampPlanTime(o.now ?? Date.now, o.cournot?.observedUnix ?? null));
  if (planUnix >= gate) throw new Error(`plan time ${planUnix} is at or after the gate ${gate}`);

  const leaves: PlannedLeaf[] = [];
  const arms: ArmId[] = ["A", "B", "C"];
  for (const { resource, showcase, loaded } of ready) {
    const { inputs, snapshot } = loaded;
    let p: Awaited<ReturnType<typeof plan>>;
    try {
      p = await plan({
        kind: o.kind,
        operatingDay: o.operatingDay,
        planUnix,
        ...fromData(inputs),
        salt: o.salt,
        engine: { repo: o.source.repo ?? ENGINE_REPO, commit: o.source.commit, tree: o.source.tree },
        agent: { wallet: o.wallet, erc8004Id: o.erc8004Id ?? null },
        ...(o.cournot ? { cournot: o.cournot } : {}),
        arms,
        ...(showcase ? {} : { jointTimeLimitSeconds: o.otherJointSeconds ?? 5 }),
      });
    } catch (err) {
      if (showcase) throw err;
      exclusions.push({ resource, reason: `plan: ${shortReason(err)}` });
      continue;
    }
    const s = p.scenarios;
    leaves.push({
      resource,
      manifest: p.manifest,
      scenarios: {
        basis_days: s.basisDays,
        history_days: s.historyDays,
        hub_sum4: s.scenarios.map((x) => x.hubSum4),
        node_cents: s.scenarios.map((x) => x.nodeCents),
      },
      snapshot,
      leaf: leafHash(p.manifest),
    });
    const solved = arms.filter((a) => (p.manifest.arms as Record<string, unknown>)[a] !== null).join("");
    const officer = p.cournot
      ? p.cournot.status === "applied"
        ? ` cournot: stress ${p.cournot.after!.stress_weight_ppm} ppm, cap ${p.cournot.after!.max_contracts_per_hour}`
        : " cournot: not applied"
      : "";
    log(`${resource.padEnd(18)} ${inputs.battery.settlementPoint.padEnd(14)} arms ${solved.padEnd(3)} selected ${String(p.manifest.selected_arm)}${officer}`);
  }

  const sorted = sortLeaves(leaves);
  const entries: FleetLeaf[] = sorted.map((l) => ({
    resource: l.resource,
    leaf: l.leaf,
    manifest: `leaves/${l.resource}.json`,
    scenarios: `leaves/${l.resource}.scenarios.json`,
  }));
  const index: FleetIndex = {
    schema: FLEET_SCHEMA,
    operating_day: o.operatingDay,
    scope_label: PLAN_SCOPE_LABEL,
    gate_unix: gate,
    plan_unix: planUnix,
    code_tree: o.source.tree,
    root: fleetRoot(entries),
    leaf_count: entries.length,
    showcase: SHOWCASE,
    leaves: entries,
    exclusions: sortLeaves(exclusions),
  };
  return { index, leaves: sorted, planUnix };
}

async function censusResources(pins: { release: ReleasePin; live: LiveDayPin[] }, offline: boolean): Promise<string[]> {
  const release = await openRelease({
    fetcher: offline ? offlineFetcher : httpFetcher(),
    store: new Store(defaultCacheDir()),
    log: new ProvenanceLog(),
    pin: pins.release,
  });
  return (await readCensusResources(release)).map((r) => r.resource);
}
