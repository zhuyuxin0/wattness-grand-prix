// Exact integer accounting. Units: kW and kWh; prices in cents per MWh;
// money in micro-USD; ratios in parts per million; SOC in micro-kWh.
// One hour at k kW moves k kWh, so hourly schedules carry kW directly.

export const PPM = 1_000_000;
export const MICRO_USD_PER_CENT = 10_000;

export class IntegerError extends Error {
  override name = "IntegerError";
}

export function checked(n: number, what = "value"): number {
  if (!Number.isSafeInteger(n)) throw new IntegerError(`${what} is not a safe integer: ${n}`);
  return n;
}

export function add(...xs: number[]): number {
  let s = 0;
  for (const x of xs) s = checked(s + checked(x), "sum");
  return s;
}

export function mul(...xs: number[]): number {
  let p = 1;
  for (const x of xs) p = checked(p * checked(x), "product");
  return p;
}

export function sum(xs: readonly number[]): number {
  return add(...xs);
}

export function clip(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(checked(x), lo), hi);
}

/** Floor division that rounds toward negative infinity for any sign. */
export function floorDiv(a: number, b: number): number {
  checked(a);
  checked(b);
  if (b === 0) throw new IntegerError("division by zero");
  return Math.floor(a / b);
}

/** Nearest multiple of tick; halves round up. */
export function roundToTick(x: number, tick: number): number {
  if (checked(tick) <= 0) throw new IntegerError(`tick must be positive: ${tick}`);
  return mul(floorDiv(add(mul(checked(x), 2), tick), mul(2, tick)), tick);
}

/** Energy value: kWh x cents/MWh = 10 micro-USD per unit, exactly. */
export function energyMicroUsd(kwh: number, centsPerMwh: number): number {
  return mul(kwh, centsPerMwh, 10);
}

/** Charging stores charge x RTE; discharging draws the full amount. */
export function socAfter(socMicroKwh: number, chargeKwh: number, dischargeKwh: number, rtePpm: number): number {
  if (chargeKwh < 0 || dischargeKwh < 0) throw new IntegerError("charge and discharge must be non-negative");
  return add(socMicroKwh, mul(chargeKwh, rtePpm), -mul(dischargeKwh, PPM));
}

/** Signed hourly kW (positive = discharge) split into charge and discharge kWh. */
export function splitKw(kw: number): { chargeKwh: number; dischargeKwh: number } {
  checked(kw, "kW");
  return kw >= 0 ? { chargeKwh: 0, dischargeKwh: kw } : { chargeKwh: -kw, dischargeKwh: 0 };
}

/**
 * P&L on q one-MWh bounded futures (positive q sells, negative buys) entered
 * at E cents/MWh and settled at S = clip(mean of the four 15-minute prices,
 * lo, hi). Working in the sum of the four keeps S exact:
 * q x (4E - clip(sum, 4lo, 4hi)) x 2500 micro-USD.
 */
export function boundedFuturePnlMicroUsd(
  contracts: number,
  entryCents: number,
  intervalCents: readonly [number, number, number, number],
  rangeCents: readonly [number, number],
): number {
  const [lo, hi] = rangeCents;
  const settle4 = clip(sum(intervalCents), mul(4, lo), mul(4, hi));
  return mul(contracts, add(mul(4, entryCents), -settle4), MICRO_USD_PER_CENT / 4);
}

/** A seller posts the distance from entry to the ceiling, a buyer the distance to the floor. */
export function boundedFutureCollateralCents(contracts: number, entryCents: number, rangeCents: readonly [number, number]): number {
  const [lo, hi] = rangeCents;
  return contracts >= 0 ? mul(contracts, add(hi, -entryCents)) : mul(-contracts, add(entryCents, -lo));
}

/** The assumed entry: the forecast hub price clipped to the range, then rounded to the nearest tick (halves up). */
/**
 * The assumed fair-value entry for one hour: the equally weighted mean over scenarios of the clipped
 * settlement price, rounded half up to the tick. sum4 holds four times each scenario's clipped price.
 */
export function assumedEntryCents(sum4: readonly number[], rangeCents: readonly [number, number], tickCents: number): number {
  const n = sum4.length;
  if (n === 0) throw new Error("entry: no scenarios");
  let total = 0n;
  for (const v of sum4) total += BigInt(clip(v, 4 * rangeCents[0], 4 * rangeCents[1]));
  const den = 4n * BigInt(n) * BigInt(tickCents);
  const ticks = (total + den / 2n) / den;
  return clip(Number(ticks) * tickCents, rangeCents[0], rangeCents[1]);
}
