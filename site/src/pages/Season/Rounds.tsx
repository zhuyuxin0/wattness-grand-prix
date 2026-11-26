import type { ReactNode } from "react";
import { minSec, until } from "../../lib/clock";
import { formatInt } from "../../lib/format";
import { formatAmount, formatPrice, ratio } from "../../lib/amounts";
import { addressUrl, blockUrl, txUrl } from "../../lib/testnet";
import { dualTime, formatOperatingDay } from "../../lib/time";
import { Glyph, Hash, ParcFerme, Stat, StatRow } from "../../ui";
import type { AgentDays, ContributorView, DayRecord, RoundView, TxView } from "./chain";
import { agentWord, bpsText, cap, odDay, pct, percentText, prix, usd } from "./view";

// The launched round and round 3, as read at one block.

function When({ unix, seconds = true }: { unix: number; seconds?: boolean }) {
  const t = dualTime(unix, { seconds });
  return (
    <span className="season-when">
      <span className="num">{t.ct}</span>
      {t.yours && <span className="muted num">{t.yours}</span>}
    </span>
  );
}

function Agent({ address }: { address: string }) {
  const word = agentWord(address);
  return (
    <span className="season-agent">
      {word && <span>{word}</span>}
      <Hash value={address} href={addressUrl(address)} label="agent address" copy={!word} />
    </span>
  );
}

/** One season day as GateRecord holds it for one agent. */
function DayRow({ d, now }: { d: DayRecord; now: number }) {
  const gate = dualTime(d.gate, { seconds: false });
  const r = d.record;
  return (
    <li className={`season-day${d.counts ? " season-day--counts" : ""}`}>
      <div className="season-day__when">
        <strong>{formatOperatingDay(odDay(d.od))}</strong>
        <span className="muted">
          Gate <span className="num">{gate.ct}</span>
          {gate.yours && <span className="num"> · {gate.yours}</span>}
        </span>
      </div>
      <div className="season-day__record">
        {r ? (
          <>
            <span>
              Sealed <When unix={r.committedAt} />
            </span>
            <span className="muted">
              Block{" "}
              <a className="num" href={blockUrl(r.blockNumber)} target="_blank" rel="noreferrer">
                {formatInt(r.blockNumber)}
              </a>
              , <span className="num">{minSec(d.gate - r.committedAt)}</span> before the gate, <span className="num">{formatInt(r.leafCount)}</span> batteries
            </span>
          </>
        ) : d.gate * 1000 > now ? (
          <span>
            Not sealed yet. The gate closes <span className="num">{until(d.gate - now / 1000)}</span>.
          </span>
        ) : (
          <span>No record before its gate.</span>
        )}
      </div>
      <div className="season-day__counts">
        {d.counts ? (
          <ParcFerme state="sealed" size="sm" label="Counts" />
        ) : !r && d.gate * 1000 > now ? (
          <ParcFerme state="open" size="sm" label="Not yet" />
        ) : (
          <span className="season-day__miss">Does not count</span>
        )}
      </div>
    </li>
  );
}

function SeasonDays({ a, now }: { a: AgentDays; now: number }) {
  const word = agentWord(a.agent);
  const sealed = a.days.filter((d) => d.counts).length;
  return (
    <div className="season-days">
      <h3 className="season-sub">
        Season days for {word ?? "the agent"} <Hash value={a.agent} href={addressUrl(a.agent)} label="agent address" copy={false} />
      </h3>
      <ul className="season-days__list">
        {a.days.map((d) => (
          <DayRow key={d.od} d={d} now={now} />
        ))}
      </ul>
      <p className="season-note">
        GateRecord holds <span className="num">{sealed}</span> of <span className="num">{a.days.length}</span> season days for this agent, sealed before the gate.
        {a.vaultSkill && (
          <>
            {" "}
            The vault's own count, <code>skillOf</code>, reads <span className="num">{a.vaultSkill.verified}</span> of{" "}
            <span className="num">{a.vaultSkill.total}</span>.
          </>
        )}
      </p>
    </div>
  );
}

function Claim({ c, round, symbol }: { c: ContributorView; round: RoundView; symbol: string }) {
  const days = round.agents.find((a) => a.agent.toLowerCase() === c.agent.toLowerCase());
  const skill = days?.vaultSkill;
  const share = round.vault && skill && skill.total > 0 ? (pct(c.deposit, round.vault.totalDeposit) * skill.verified) / skill.total : null;
  const claimable = c.vault && (c.vault.claimableQuote > 0n || c.vault.claimableTokens > 0n);
  return (
    <article className="season-claim">
      <dl className="season-dl">
        <div>
          <dt>Contributor</dt>
          <dd>
            <Hash value={c.account} href={addressUrl(c.account)} label="contributor address" />
          </dd>
        </div>
        <div>
          <dt>Deposit</dt>
          <dd className="num">{usd(c.deposit, symbol)}</dd>
        </div>
        <div>
          <dt>Backs</dt>
          <dd>
            <Agent address={c.agent} />
          </dd>
        </div>
        <div>
          <dt>From the Launcher</dt>
          <dd>
            <span className="num">{prix(c.claimed, round.symbol)}</span> claimed of <span className="num">{prix(c.entitled, round.symbol)}</span>
          </dd>
        </div>
        {c.vault && (
          <div>
            <dt>From the vault</dt>
            <dd>
              <span className="num">{usd(c.vault.quoteClaimed, symbol)}</span> and <span className="num">{prix(c.vault.tokensClaimed, round.symbol)}</span> claimed
              {share !== null && (
                <span className="muted">
                  {" "}
                  · its share of the vault: <span className="num">{percentText(share)}</span>, the deposit share times{" "}
                  <span className="num">
                    {skill!.verified} of {skill!.total}
                  </span>{" "}
                  days
                </span>
              )}
            </dd>
          </div>
        )}
        {c.vault && (
          <div>
            <dt>Claimable now</dt>
            <dd className="num">
              {claimable ? `${usd(c.vault.claimableQuote, symbol)} and ${prix(c.vault.claimableTokens, round.symbol)}` : "Nothing; everything earned so far is claimed"}
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}

function Txs({ txs }: { txs: TxView[] }) {
  return (
    <ul className="season-txs">
      {txs.map((t) => (
        <li key={t.id}>
          <span className="season-txs__label">{t.label}</span>
          <Hash value={t.hash} href={txUrl(t.hash)} label="transaction hash" />
          <span className="muted">
            Block{" "}
            <a className="num" href={blockUrl(t.blockNumber)} target="_blank" rel="noreferrer">
              {formatInt(Number(t.blockNumber))}
            </a>
          </span>
          <When unix={t.time} />
          <span className={t.ok ? "season-ok" : "season-bad"}>
            <Glyph name={t.ok ? "check" : "close"} />
            {t.ok ? "Succeeded" : "Reverted"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Contract({ label, address, children }: { label: string; address: string; children?: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <Hash value={address} href={addressUrl(address)} label={`${label.toLowerCase()} address`} />
        {children && <p className="season-dl__note">{children}</p>}
      </dd>
    </div>
  );
}

/** Pool, token and vault of a launched round. */
function LaunchedContracts({ round, symbol }: { round: RoundView; symbol: string }) {
  const pool = round.pool;
  const vault = round.vault;
  const burned = pool ? pool.lpAtSink + pool.lpAtZero : 0n;
  return (
    <dl className="season-dl season-dl--contracts">
      <Contract label="Round" address={round.address}>
        Flap's Portal records it under the season's launcher factory.
      </Contract>
      {round.token && (
        <Contract label="Token" address={round.token}>
          {round.tokenInfo ? `${round.tokenInfo.name} (${round.tokenInfo.symbol}): ${prix(round.tokenInfo.totalSupply, round.tokenInfo.symbol)}` : round.symbol}. A{" "}
          {bpsText(round.taxBps)} tax on buys and sells; after Flap's fee, {bpsText(round.vaultShareBps)} of it goes to the vault.
        </Contract>
      )}
      {pool && (
        <Contract label="Pool" address={pool.address}>
          {pool.name} ({pool.symbol}): <span className="num">{usd(pool.reserveQuote, symbol)}</span> and{" "}
          <span className="num">{prix(pool.reserveToken, round.symbol)}</span>.{" "}
          {burned === pool.lpTotal ? (
            <>
              Its LP tokens are held at <code>0x…dEaD</code> and the zero address (<span className="num">{formatInt(Number(pool.lpAtZero))}</span> wei), so the liquidity
              cannot be withdrawn.
            </>
          ) : (
            <>
              <span className="num">{formatAmount(burned)}</span> of its <span className="num">{formatAmount(pool.lpTotal)}</span> LP tokens sit at <code>0x…dEaD</code> and the
              zero address.
            </>
          )}
        </Contract>
      )}
      {vault && (
        <Contract label="Vault" address={vault.address}>
          Holds <span className="num">{usd(vault.quoteBalance, symbol)}</span> and <span className="num">{prix(vault.tokenBalance, round.symbol)}</span>. Tax
          credited: <span className="num">{usd(vault.pooled, symbol)}</span> of its <span className="num">{usd(round.rewardCap, symbol)}</span> cap, with{" "}
          <span className="num">{usd(vault.forwarded, symbol)}</span> passed on above it. Paid out: <span className="num">{usd(vault.quotePaid, symbol)}</span> and{" "}
          <span className="num">{prix(vault.tokensPaid, round.symbol)}</span>.
        </Contract>
      )}
    </dl>
  );
}

export function LaunchedRound({ round, txs = [], symbol, now }: { round: RoundView; txs?: TxView[]; symbol: string; now: number }) {
  const opening = ratio(round.raised, round.poolToken);
  const price = round.pool ? ratio(round.pool.reserveQuote, round.pool.reserveToken) : null;
  const day = round.milestone.day;
  return (
    <>
      <StatRow>
        <Stat
          label="Raised"
          value={usd(round.raised, symbol)}
          note={
            <>
              Minimum {usd(round.minRaise, symbol)}, cap {usd(round.raiseCap, symbol)} · {formatInt(round.contributorCount)}{" "}
              {round.contributorCount === 1 ? "contributor" : "contributors"}
            </>
          }
        />
        <Stat
          label="Milestone"
          value={round.milestone.met ? "Met" : "Not met"}
          tone={round.milestone.met ? "sealed" : "default"}
          note={
            <>
              {cap(agentWord(round.milestone.committer) ?? "the agent")}'s plan for {formatOperatingDay(odDay(round.milestone.od))}
              {day.record && day.counts ? `, sealed ${minSec(day.gate - day.record.committedAt)} before its gate` : ""}
            </>
          }
        />
        <Stat
          label="Opening price"
          value={formatPrice(opening)}
          unit={`${symbol} per ${round.symbol}`}
          note={`${usd(round.raised, symbol)} against ${prix(round.poolToken, round.symbol)} in the pool`}
        />
        {price !== null && <Stat label="Pool price now" value={formatPrice(price)} unit={`${symbol} per ${round.symbol}`} note="From the pool's reserves" />}
      </StatRow>
      <p className="season-note season-note--tight">Prices are the pool's own ratio of test USD to {round.symbol}. A token's price says nothing about an agent's plans.</p>

      <LaunchedContracts round={round} symbol={symbol} />

      {round.agents
        .filter((a) => round.contributors.some((c) => c.agent.toLowerCase() === a.agent.toLowerCase()))
        .map((a) => (
          <SeasonDays key={a.agent} a={a} now={now} />
        ))}

      <div className="season-claims">
        <h3 className="season-sub">Claims</h3>
        <div className="season-claims__grid">
          {round.contributors.map((c) => (
            <Claim key={c.account} c={c} round={round} symbol={symbol} />
          ))}
        </div>
      </div>

      {txs.length > 0 && (
        <div>
          <h3 className="season-sub">Its transactions</h3>
          <Txs txs={txs} />
        </div>
      )}
    </>
  );
}

function Meter({ round, symbol }: { round: RoundView; symbol: string }) {
  const filled = Math.min(100, pct(round.raised, round.raiseCap));
  const min = Math.min(100, pct(round.minRaise, round.raiseCap));
  return (
    <div className="season-meter">
      <div className="season-meter__head">
        <span className="season-meter__raised num">{usd(round.raised, symbol)}</span>
        <span className="muted">
          raised of the <span className="num">{usd(round.minRaise, symbol)}</span> minimum; the round takes up to <span className="num">{usd(round.raiseCap, symbol)}</span>
        </span>
      </div>
      <div className="season-meter__track" role="img" aria-label={`${usd(round.raised, symbol)} raised, minimum ${usd(round.minRaise, symbol)}, cap ${usd(round.raiseCap, symbol)}`}>
        <span className="season-meter__fill" style={{ width: `${filled}%` }} />
        <span className="season-meter__min" style={{ left: `${min}%` }} />
      </div>
      <div className="season-meter__scale num" aria-hidden="true">
        <span>0</span>
        <span className="season-meter__min-label" style={{ left: `${min}%` }}>
          Minimum {usd(round.minRaise, symbol)}
        </span>
        <span>Cap {usd(round.raiseCap, symbol)}</span>
      </div>
    </div>
  );
}

const STATUS_WORD = { open: "Open", launched: "Launched", refunding: "Refunds open" } as const;

export function RoundThree({ round, symbol, now }: { round: RoundView; symbol: string; now: number }) {
  const day = round.milestone.day;
  const r = day.record;
  const left = round.deadline - now / 1000;
  const gateAhead = day.gate * 1000 > now;
  return (
    <>
      <Meter round={round} symbol={symbol} />

      <div className="season-cards">
        <article className="season-card">
          <h3 className="season-card__title">Milestone</h3>
          <p>
            {cap(agentWord(round.milestone.committer) ?? "the agent")}'s plan for <strong>{formatOperatingDay(odDay(round.milestone.od))}</strong>, sealed in GateRecord before
            that day's gate.
          </p>
          {r && day.counts ? (
            <div className="season-card__state">
              <ParcFerme state="sealed" size="sm" />
              <span>
                <When unix={r.committedAt} /> · block{" "}
                <a className="num" href={blockUrl(r.blockNumber)} target="_blank" rel="noreferrer">
                  {formatInt(r.blockNumber)}
                </a>
                , <span className="num">{minSec(day.gate - r.committedAt)}</span> before the gate
              </span>
            </div>
          ) : (
            <div className="season-card__state">
              <ParcFerme state="open" size="sm" label={gateAhead ? "Not sealed yet" : "No record before its gate"} />
              <span>
                Gate <When unix={day.gate} seconds={false} />
                {gateAhead && <span className="muted"> · closes {until(day.gate - now / 1000)}</span>}
              </span>
            </div>
          )}
        </article>

        <article className="season-card">
          <h3 className="season-card__title">Deadline</h3>
          <p>
            {round.status === "open"
              ? "Contributions and the launch close here. A round not launched by then only refunds."
              : round.status === "launched"
                ? "The round launched before its deadline."
                : "The round did not launch by its deadline, so every deposit can be refunded."}
          </p>
          <div className="season-card__state">
            <span className="season-card__big">
              <When unix={round.deadline} seconds={false} />
            </span>
            {round.status === "open" && left > 0 && <span className="muted">{until(left)}</span>}
          </div>
        </article>

        <article className="season-card">
          <h3 className="season-card__title">Round</h3>
          <p>
            <span className={`season-status season-status--${round.status}`}>{STATUS_WORD[round.status]}</span> ·{" "}
            <span className="num">{formatInt(round.contributorCount)}</span> of up to <span className="num">{formatInt(round.maxContributors)}</span> contributors, up to{" "}
            <span className="num">{usd(round.walletCap, symbol)}</span> per wallet.
          </p>
          <dl className="season-dl season-dl--tight">
            <div>
              <dt>Launcher</dt>
              <dd>
                <Hash value={round.address} href={addressUrl(round.address)} label="round address" />
              </dd>
            </div>
            <div>
              <dt>{round.token ? "Token" : "Its token"}</dt>
              <dd>
                {round.token ? (
                  <Hash value={round.token} href={addressUrl(round.token)} label="token address" />
                ) : (
                  <>
                    <Hash value={round.predictedToken} label="token address" />
                    <p className="season-dl__note">The address the launch gives {round.symbol}, worked out from the round's salt.</p>
                  </>
                )}
              </dd>
            </div>
            {round.pool && (
              <div>
                <dt>Pool</dt>
                <dd>
                  <Hash value={round.pool.address} href={addressUrl(round.pool.address)} label="pool address" />
                </dd>
              </div>
            )}
            {round.vault && (
              <div>
                <dt>Vault</dt>
                <dd>
                  <Hash value={round.vault.address} href={addressUrl(round.vault.address)} label="vault address" />
                </dd>
              </div>
            )}
          </dl>
        </article>
      </div>
    </>
  );
}
