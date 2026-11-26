import { formatPrice, ratio } from "../../lib/amounts";
import type { RoundView } from "./chain";
import { workedExample, type ExampleRow } from "./payouts";
import { bpsText, prix, usd, usdCents } from "./view";

// Three contributors fill round 3 to its cap. Every figure comes from the
// round's configuration as read, through payouts.ts.

function backsText(r: ExampleRow, days: number): string {
  if (r.backs === "self") return `Names no agent, so she backs her own address, which sealed ${r.sealed} of ${days} season days.`;
  return `Backs an agent that sealed ${r.sealed} of ${days} season days before the gate.`;
}

function Person({ r, days, symbol, token, rewardCap }: { r: ExampleRow; days: number; symbol: string; token: string; rewardCap: bigint }) {
  return (
    <article className="season-person">
      <header className="season-person__head">
        <h3 className="season-person__name">{r.name}</h3>
        <span className="season-person__deposit num">{usd(r.deposit, symbol)}</span>
      </header>
      <p className="season-person__backs">{backsText(r, days)}</p>
      <dl className="season-person__rows">
        <div>
          <dt>From the Launcher</dt>
          <dd className="num">{prix(r.launcher, token)}</dd>
        </div>
        <div>
          <dt>From the vault, by sealed days</dt>
          <dd className="num">{prix(r.vaultTokens, token)}</dd>
        </div>
        <div>
          <dt>Tax share at the vault's {usd(rewardCap, symbol)} cap</dt>
          <dd className="num">{usdCents(r.vaultTaxAtCap, symbol)}</dd>
        </div>
        <div className="season-person__total">
          <dt>Tokens in all</dt>
          <dd className="num">{prix(r.tokens, token)}</dd>
        </div>
        <div>
          <dt>At the opening price</dt>
          <dd className="num">{usdCents(r.atOpening, symbol)}</dd>
        </div>
        <div>
          <dt>Sold alone into the new pool</dt>
          <dd className="num">{usdCents(r.exitAlone, symbol)}</dd>
        </div>
      </dl>
    </article>
  );
}

export function WorkedExample({ round, symbol }: { round: RoundView; symbol: string }) {
  const days = round.seasonDays.length;
  const ex = workedExample({
    raiseCap: round.raiseCap,
    poolToken: round.poolToken,
    reserve: round.reserve,
    earnedBps: round.earnedBps,
    rewardCap: round.rewardCap,
    seasonDays: days,
  });
  const token = round.symbol;
  const opening = formatPrice(ratio(ex.raised, round.poolToken));
  return (
    <>
      <p className="season-prose">
        The three fill the round to its <span className="num">{usd(ex.raised, symbol)}</span> cap. At launch the pool holds all <span className="num">{usd(ex.raised, symbol)}</span>{" "}
        against <span className="num">{prix(round.poolToken, token)}</span>, an opening price of <span className="num">{opening}</span> {symbol} per {token}. Of the other{" "}
        <span className="num">{prix(round.reserve, token)}</span>, contributors claim <span className="num">{prix(ex.contributorTokens, token)}</span> from the Launcher pro rata
        to their deposits, and the vault holds <span className="num">{prix(ex.earnedTokens, token)}</span> ({bpsText(round.earnedBps)}) to pay by sealed days, with up to{" "}
        <span className="num">{usd(round.rewardCap, symbol)}</span> of trading tax.
      </p>
      <div className="season-people">
        {ex.rows.map((r) => (
          <Person key={r.name} r={r} days={days} symbol={symbol} token={token} rewardCap={round.rewardCap} />
        ))}
      </div>
      <ul className="season-facts">
        <li>
          A contributor whose agent seals every season day holds tokens worth their deposit at the opening price: Alice's{" "}
          <span className="num">{prix(ex.rows[0]?.tokens ?? 0n, token)}</span> at <span className="num">{opening}</span> {symbol} per {token} are worth{" "}
          <span className="num">{usd(ex.rows[0]?.atOpening ?? 0n, symbol)}</span>, her deposit.
        </li>
        <li>
          That is value on paper, not what a sale returns: every sale moves the pool's price. If all three sold everything into the new pool with no other buyers, they would get back
          about <span className="num">{usdCents(ex.exitAll, symbol)}</span> of their <span className="num">{usd(ex.raised, symbol)}</span> together. Sale figures follow the pool's
          constant-product rule, before the {bpsText(round.taxBps)} sell tax and the pool's swap fee.
        </li>
        <li>
          What no one earned stays in the vault: <span className="num">{prix(ex.unearnedTokens, token)}</span> and, at the cap,{" "}
          <span className="num">{usdCents(ex.unearnedTaxAtCap, symbol)}</span> of tax. The vault takes what tax arrives, up to its cap; no amount is promised.
        </li>
        <li>A token's price says nothing about an agent's plans.</li>
      </ul>
    </>
  );
}
