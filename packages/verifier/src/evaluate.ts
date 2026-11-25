import { PPM, type Arm, type Manifest, type ScenarioMatrix } from "@gatelock/core";

// An arm's expected revenue and CVaR over the committed scenario matrix,
// written from the manifest's definitions rather than taken from the engine.
// BigInt throughout: a scenario's revenue is a sum of products of kW and
// cents that can pass 2^53 once summed over hundreds of scenarios.

const UUSD_PER_KWH_CENT = 10n; // kWh x cents/MWh = 10 micro-USD
const UUSD_PER_CENT = 10_000n;
const UUSD_PER_QUARTER_CENT = 2_500n;

function floorDiv(n: bigint, d: bigint): bigint {
  const q = n / d;
  return n % d !== 0n && n < 0n !== d < 0n ? q - 1n : q;
}

export function scenarioRevenueUusd(m: Manifest, arm: Arm, nodeCents: readonly number[], hubSum4: readonly number[]): bigint {
  const wear = BigInt(m.assumptions.wear_cents_per_mwh);
  const fee = BigInt(m.instrument.fee_cents_per_contract);
  let r = 0n;
  arm.kw.forEach((kw, h) => {
    const k = BigInt(kw);
    r += k * BigInt(nodeCents[h] as number) * UUSD_PER_KWH_CENT;
    if (k > 0n) r -= k * wear * UUSD_PER_KWH_CENT;
    const q = BigInt(arm.contracts[h] as number);
    // q contracts of one MWh at entry E settle at hubSum4 / 4: q x (4E - hubSum4) / 4 cents.
    r += q * (4n * BigInt(m.instrument.entry_cents[h] as number) - BigInt(hubSum4[h] as number)) * UUSD_PER_QUARTER_CENT;
    r -= (q < 0n ? -q : q) * fee * UUSD_PER_CENT;
  });
  return r;
}

/**
 * CVaR at alpha of loss (minus revenue) over equally weighted scenarios: the
 * mean of the worst (1 - alpha) share, the boundary scenario weighted by its
 * fraction. Floored.
 */
export function cvarOfLossUusd(revenues: readonly bigint[], alphaPpm: number): bigint {
  const losses = revenues.map((r) => -r).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  const tail = BigInt(losses.length) * BigInt(PPM - alphaPpm);
  if (tail <= 0n) throw new Error("alpha leaves no tail");
  let left = tail;
  let acc = 0n;
  for (const loss of losses) {
    if (left === 0n) break;
    const w = left < BigInt(PPM) ? left : BigInt(PPM);
    acc += w * loss;
    left -= w;
  }
  return floorDiv(acc, tail);
}

export interface ArmRisk {
  expected: bigint;
  cvar: bigint;
}

export function armRisk(m: Manifest, arm: Arm, matrix: ScenarioMatrix): ArmRisk {
  const revenues = matrix.node_cents.map((node, i) => scenarioRevenueUusd(m, arm, node, matrix.hub_sum4[i] as number[]));
  const expected = floorDiv(
    revenues.reduce((a, b) => a + b, 0n),
    BigInt(revenues.length),
  );
  return { expected, cvar: cvarOfLossUusd(revenues, m.risk.alpha_ppm) };
}

/** floor((mean x 10^6 - lambda x CVaR) / 10^6). */
export function objectiveUusd(expected: bigint, cvar: bigint, lambdaPpm: number): bigint {
  return floorDiv(expected * BigInt(PPM) - BigInt(lambdaPpm) * cvar, BigInt(PPM));
}
