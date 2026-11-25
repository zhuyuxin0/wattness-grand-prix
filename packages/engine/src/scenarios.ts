import type { Day } from "./calendar.js";
import { forecastHub } from "./forecast.js";
import { roundDiv } from "./ints.js";
import { BOUNDED_FUTURE } from "./instrument.js";
import { HOURS, INTERVALS, type PriceDay } from "./types.js";

export const SCENARIO_METHOD =
  "each history day's day-ahead and real-time hub errors against the forecast rule, added to the target's " +
  "hub forecast, crossed with each basis day's node-minus-hub day-ahead basis; equally weighted, no random numbers";

export const BASIS_DAYS = 7;

export interface Scenario {
  historyDay: Day;
  basisDay: Day;
  /** Day-ahead price at the settlement point, cents per MWh. */
  nodeCents: number[];
  /** Four times the hedge's settlement price at the hub, clipped to the range, cents per MWh. */
  hubSum4: number[];
}

export interface ScenarioSet {
  historyDays: Day[];
  basisDays: Day[];
  /** Hourly node-minus-hub day-ahead basis averaged over the basis days. */
  meanBasisCents: number[];
  scenarios: Scenario[];
}

export function daMap(days: readonly PriceDay[]): Map<Day, readonly number[]> {
  const m = new Map<Day, readonly number[]>();
  for (const d of days) if (d.da && d.da.length === HOURS) m.set(d.day, d.da);
  return m;
}

export function basisDays(hub: readonly PriceDay[], node: readonly PriceDay[], before: Day): Day[] {
  const hubDa = daMap(hub);
  return [...daMap(node).keys()]
    .filter((d) => d < before && hubDa.has(d))
    .sort()
    .slice(-BASIS_DAYS);
}

export function buildScenarios(
  target: Day,
  hubForecastCents: readonly number[],
  hub: readonly PriceDay[],
  node: readonly PriceDay[],
  lagDays: number,
  weights?: readonly number[],
): ScenarioSet {
  const hubDa = daMap(hub);
  const nodeDa = daMap(node);
  const bDays = basisDays(hub, node, target);
  if (bDays.length === 0) throw new Error("scenarios: no day with both node and hub day-ahead prices");
  const basis = bDays.map((d) => nodeDa.get(d)!.map((p, h) => p - hubDa.get(d)![h]!));
  const meanBasisCents = Array.from({ length: HOURS }, (_, h) =>
    Number(roundDiv(BigInt(basis.reduce((a, b) => a + b[h]!, 0)), BigInt(basis.length))),
  );

  const lo = 4 * BOUNDED_FUTURE.floorCents;
  const hi = 4 * BOUNDED_FUTURE.ceilingCents;
  const historyDays: Day[] = [];
  const scenarios: Scenario[] = [];
  for (const d of [...hub].sort((a, b) => (a.day < b.day ? -1 : 1))) {
    if (d.day >= target || !d.da || d.da.length !== HOURS || !d.rt15 || d.rt15.length !== INTERVALS) continue;
    const f = forecastHub(d.day, hubDa, lagDays, weights);
    if (!f) continue;
    historyDays.push(d.day);
    const da = d.da;
    const rt = d.rt15;
    const daErr = da.map((p, h) => p - f.cents[h]!);
    const rtErr4 = Array.from({ length: HOURS }, (_, h) => {
      const raw = rt[4 * h]! + rt[4 * h + 1]! + rt[4 * h + 2]! + rt[4 * h + 3]!;
      return raw - 4 * f.cents[h]!;
    });
    bDays.forEach((basisDay, b) => {
      scenarios.push({
        historyDay: d.day,
        basisDay,
        nodeCents: hubForecastCents.map((p, h) => p + daErr[h]! + basis[b]![h]!),
        hubSum4: hubForecastCents.map((p, h) => Math.min(hi, Math.max(lo, 4 * p + rtErr4[h]!))),
      });
    });
  }
  if (scenarios.length === 0) throw new Error("scenarios: no history day has complete prices and a forecast");
  return { historyDays, basisDays: bDays, meanBasisCents, scenarios };
}

/** SHA-256 over the scenario matrix as JSON; keys are written in sorted order, so this is also its JCS form. */
export async function scenarioDigest(set: ScenarioSet): Promise<string> {
  const body = JSON.stringify({
    basis_days: set.basisDays,
    history_days: set.historyDays,
    hub_sum4: set.scenarios.map((s) => s.hubSum4),
    node_cents: set.scenarios.map((s) => s.nodeCents),
  });
  const hash = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
