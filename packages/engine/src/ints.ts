// Exact integer helpers. Money is cents per MWh for prices and micro-USD for amounts.

export function assertInt(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${what} must be a safe integer, got ${value}`);
}

/** n / d rounded half away from zero, for integer n and positive integer d. */
export function roundDiv(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new Error("roundDiv: divisor must be positive");
  const q = (2n * (n < 0n ? -n : n) + d) / (2n * d);
  return n < 0n ? -q : q;
}

/** n / d rounded toward minus infinity, for positive integer d. */
export function floorDiv(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new Error("floorDiv: divisor must be positive");
  const q = n / d;
  return n % d !== 0n && n < 0n ? q - 1n : q;
}

export function toSafe(n: bigint, what: string): number {
  const x = Number(n);
  if (!Number.isSafeInteger(x)) throw new Error(`${what} overflows a safe integer`);
  return x;
}

/** A decimal $/MWh price as whole cents; refuses anything not on a cent. */
export function usdToCents(usd: number): number {
  const cents = Math.round(usd * 100);
  if (Math.abs(cents - usd * 100) > 1e-6) throw new Error(`price ${usd} is not a whole number of cents`);
  return cents;
}

export const PPM = 1_000_000;
