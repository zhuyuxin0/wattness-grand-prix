// The worked example: three contributors fill a round to its cap, and each
// one's tokens follow from the round's own configuration, with the contracts'
// own integer arithmetic (modules/flap: SeasonLauncher.entitledTokens and
// earnedTokens, SeasonVault.entitled). Amounts are in smallest units (18
// decimals for test USD and PRIX). Pure: no chain access.

export interface ExampleConfig {
  /** The round's cap; the example fills it. */
  raiseCap: bigint;
  /** PRIX seeded into the pool against all deposits. */
  poolToken: bigint;
  /** PRIX handed back to the Launcher: the contributor part and the earned part. */
  reserve: bigint;
  /** The earned part of the reserve, in basis points. */
  earnedBps: number;
  /** Most test USD of trading tax the vault credits. */
  rewardCap: bigint;
  seasonDays: number;
}

export interface ExamplePerson {
  name: string;
  /** Share of the cap, in percent; the last person takes what is left. */
  sharePct: number;
  /** Season days the backed agent sealed before the gate. */
  sealed: number;
  /** Who the person backs: an agent, or nobody, which backs their own address. */
  backs: "agent" | "self";
}

export interface ExampleRow extends ExamplePerson {
  deposit: bigint;
  /** PRIX claimed from the Launcher, pro rata to the deposit. */
  launcher: bigint;
  /** PRIX from the vault: deposit share of the earned part times sealed days. */
  vaultTokens: bigint;
  /** Test USD from the vault if its tax pool reaches its cap. */
  vaultTaxAtCap: bigint;
  tokens: bigint;
  /** The tokens at the opening price: the pool's ratio at launch. */
  atOpening: bigint;
  /** Test USD back from selling every token alone into the fresh pool, before the sell tax. */
  exitAlone: bigint;
}

export interface Example {
  raised: bigint;
  earnedTokens: bigint;
  contributorTokens: bigint;
  rows: ExampleRow[];
  /** What no one earned stays in the vault. */
  unearnedTokens: bigint;
  unearnedTaxAtCap: bigint;
  /** Everyone sells everything into the fresh pool with no other buyers. */
  tokensAll: bigint;
  exitAll: bigint;
}

const ACC = 10n ** 30n;

/** Alice backs an agent that sealed every season day, Bob one that missed a day, Carol nobody. */
export function examplePeople(seasonDays: number): ExamplePerson[] {
  return [
    { name: "Alice", sharePct: 50, sealed: seasonDays, backs: "agent" },
    { name: "Bob", sharePct: 30, sealed: Math.max(0, seasonDays - 1), backs: "agent" },
    { name: "Carol", sharePct: 20, sealed: 0, backs: "self" },
  ];
}

/** Test USD out of a constant-product pool for `tokensIn`, before any fee or tax. */
export function sellInto(poolQuote: bigint, poolToken: bigint, tokensIn: bigint): bigint {
  if (tokensIn <= 0n) return 0n;
  return (poolQuote * tokensIn) / (poolToken + tokensIn);
}

export function workedExample(c: ExampleConfig, people: ExamplePerson[] = examplePeople(c.seasonDays)): Example {
  const raised = c.raiseCap;
  const total = BigInt(c.seasonDays);
  // SeasonLauncher.earnedTokens(): RESERVE * earnedBps / 10_000.
  const earnedTokens = (c.reserve * BigInt(c.earnedBps)) / 10_000n;
  const contributorTokens = c.reserve - earnedTokens;
  // SeasonVault: accQuotePerDeposit after a credit of rewardCap.
  const acc = raised > 0n ? (c.rewardCap * ACC) / raised : 0n;

  let left = raised;
  const rows = people.map((p, i): ExampleRow => {
    const deposit = i === people.length - 1 ? left : (raised * BigInt(p.sharePct)) / 100n;
    left -= deposit;
    const sealed = BigInt(Math.min(p.sealed, c.seasonDays));
    // SeasonLauncher.entitledTokens(): deposit * (RESERVE - earnedTokens()) / raised.
    const launcher = raised > 0n ? (deposit * contributorTokens) / raised : 0n;
    // SeasonVault.entitled(): earnedTokens * deposit * verified / (totalDeposit * total), and the quote share.
    const vaultTokens = total > 0n ? (earnedTokens * deposit * sealed) / (raised * total) : 0n;
    const vaultTaxAtCap = total > 0n ? (((deposit * acc) / ACC) * sealed) / total : 0n;
    const tokens = launcher + vaultTokens;
    return {
      ...p,
      deposit,
      launcher,
      vaultTokens,
      vaultTaxAtCap,
      tokens,
      atOpening: c.poolToken > 0n ? (tokens * raised) / c.poolToken : 0n,
      exitAlone: sellInto(raised, c.poolToken, tokens),
    };
  });

  const tokensAll = rows.reduce((s, r) => s + r.tokens, 0n);
  return {
    raised,
    earnedTokens,
    contributorTokens,
    rows,
    unearnedTokens: earnedTokens - rows.reduce((s, r) => s + r.vaultTokens, 0n),
    unearnedTaxAtCap: c.rewardCap - rows.reduce((s, r) => s + r.vaultTaxAtCap, 0n),
    tokensAll,
    exitAll: sellInto(raised, c.poolToken, tokensAll),
  };
}
