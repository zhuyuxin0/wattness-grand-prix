import { HOURS } from "./types.js";

/**
 * ElectronX's hourly bounded future on an ERCOT hub, from its published
 * contract terms. Entry prices are not market data: the plan assumes them.
 */
export const BOUNDED_FUTURE = {
  venue: "ElectronX",
  product: "hourly bounded future",
  floorCents: 0,
  ceilingCents: 10_000,
  tickCents: 25,
  sizeKwh: 1_000,
  feeCentsPerContract: 35,
  settlement: "clip(mean of the four first-published real-time 15-minute hub SPPs of the hour, floor, ceiling)",
  collateral: "seller: (ceiling - entry) x contracts; buyer: (entry - floor) x contracts",
  entryRule:
    "assumed at fair value: the scenario-weighted mean of the hour's clipped settlement price, rounded to the nearest tick (half up)",
  sourceUrls: ["https://www.electronx.com/products"],
} as const;

const T = BOUNDED_FUTURE;

function clip(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Fair-value entry from equally weighted scenarios: E_h = mean_s clip(S_h,s), rounded half up to the tick.
 * hubSum4 already holds four times the clipped settlement price, so the mean is exact in integers.
 */
export function entryCents(hubSum4: readonly (readonly number[])[]): number[] {
  const n = hubSum4.length;
  if (n === 0) throw new Error("entry: no scenarios");
  return Array.from({ length: HOURS }, (_, h) => {
    let total = 0;
    for (const s of hubSum4) {
      const v = s[h];
      if (v === undefined) throw new Error(`entry: a scenario has no hour ${h}`);
      total += v;
    }
    // round(total / (4 n tick)) * tick, half up; every term is non-negative because S is clipped at the floor.
    const ticks = Math.floor((total + 2 * n * T.tickCents) / (4 * n * T.tickCents));
    return clip(ticks * T.tickCents, T.floorCents, T.ceilingCents);
  });
}

/** Four times the settlement price, in cents: exact for any four whole-cent prices. */
export function settlementSum4(rt15: readonly number[], hour: number): number {
  const q = rt15.slice(hour * 4, hour * 4 + 4);
  if (q.length !== 4) throw new Error(`settlement: hour ${hour} needs four 15-minute prices`);
  const sum = q[0]! + q[1]! + q[2]! + q[3]!;
  return clip(sum, 4 * T.floorCents, 4 * T.ceilingCents);
}

/** Collateral for a signed position (positive sells), in cents. */
export function collateralCents(contracts: number, entry: number): number {
  return contracts >= 0 ? (T.ceilingCents - entry) * contracts : (entry - T.floorCents) * -contracts;
}
