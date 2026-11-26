// The Atlas and CoinMarketCap adapter's rules (packages/adapters/atlas-cmc),
// as the page applies them to what it reads live: the freshness check every
// price passes, and the check its live run puts to the BSC testnet SingleFeed
// before that read may price the budget. scripts/data/prices.mjs runs the same
// rules, and the whole budget decision, at build time.

export interface PriceIn {
  priceUsd: number;
  observedAtSeconds: number;
}

/** checkPrice: why a price is refused at `now`, or null when it passes. */
export function priceProblem(price: PriceIn, now: number, maxAge = 180, futureDrift = 60): string | null {
  if (!Number.isFinite(price.priceUsd)) return "not a finite price";
  if (!(price.priceUsd > 0)) return "not a positive price";
  if (!Number.isInteger(price.observedAtSeconds) || price.observedAtSeconds <= 0) return "no valid update time";
  if (price.observedAtSeconds > now + futureDrift) return `dated more than ${futureDrift} s ahead`;
  if (now - price.observedAtSeconds > maxAge) return `older than ${maxAge} s`;
  return null;
}

/** live.ts's check of the testnet SingleFeed: it must name BNB/USD and pass checkPrice at its block. */
export function chainReadProblems(description: string, price: PriceIn, blockTime: number): string[] {
  const out: string[] = [];
  if (!/BNB.*USD/i.test(description)) out.push("its description names no BNB/USD instrument");
  const p = priceProblem(price, blockTime, 180);
  if (p) out.push(`its last update is ${p}`);
  return out;
}

/** The budget's first steps for one BNB price: its value in cents and the 10% base reserve's budget and count. */
export function baseBudget(treasuryBnb: number, bnbUsd: number, evaluationPriceCents: number) {
  const value = Math.floor(treasuryBnb * bnbUsd * 100);
  const budget = Math.floor(value * (1 - 0.1));
  return { valueCents: value, budgetCents: budget, evaluations: Math.floor(budget / evaluationPriceCents) };
}
