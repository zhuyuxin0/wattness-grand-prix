import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { formatAmount, formatTokens } from "../../lib/amounts";
import { isCapture } from "../../lib/capture";
import { minSec } from "../../lib/clock";
import { formatInt } from "../../lib/format";
import { addressUrl, txUrl } from "../../lib/testnet";
import { dualTime, formatOperatingDay } from "../../lib/time";
import { Glyph, Hash, middle } from "../../ui";
import { LogoChip, type ChipLogo } from "../../ui/LogoChip";
import { marketAt, percent, priceNumber, ticks, tinyPrice, type Market } from "./market";
import { PriceChart } from "./PriceChart";
import { stateAt, type Frame, type FrameState, type Holder, type LaunchReplay } from "./replay";
import "./card.css";

// The launch card: a launch on our OpenFour deployment drawn as a launchpad's token page (Four.meme's layout, our own
// marks and type), every figure from its real BSC testnet transactions: the token and its contract, the price and
// its change, market cap, liquidity, volume and creation time, the curve's candles, an inert Buy and Sell panel, the
// bonding curve's progress, and graduation, the twist: refused while no sealed record is bound (the module's
// EvidenceMissing revert), granted once the agent's sealed record is, the pool migrated to PancakeSwap. Under the
// chart, the trades, holders and every transaction. The replay steps through the transactions or plays them, and
// every part shows the launch as it stood after that one; it plays once by itself when the card comes into view, and
// opens on the last transaction for a reader who asks for reduced motion and in a recording.

const STEP_MS = 1900;

/** WBNB to four places, or six below a hundredth, so a small trade keeps its figures: "0.1", "0.003551". */
const amount = (wei: bigint | string) => {
  const v = BigInt(wei);
  const text = formatAmount(v, 18, v !== 0n && v < 10n ** 16n ? 6 : 4);
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
};
const coin = (wei: bigint | string, symbol: string) => `${amount(wei)} ${symbol}`;
const toks = (wei: bigint | string, symbol: string) => `${formatTokens(BigInt(wei))} ${symbol}`;
const whole = (wei: bigint | string) => formatTokens(BigInt(wei));
/** Whole tokens in short form for a phone's table: "7.9B", "900M". */
const compact = (wei: bigint | string) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(Number(BigInt(wei) / 10n ** 18n));
const odDay = (od: number) => {
  const s = String(od);
  return formatOperatingDay(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
};
/** "Nov 27" for an operating day. */
const odShort = (od: number) => odDay(od).replace(/^\w+, /, "").replace(/, \d{4}$/, "");
const reduced = () => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

const KIND: Record<Frame["kind"], string> = {
  create: "Create",
  buy: "Buy",
  sell: "Sell",
  refused: "Graduate",
  bind: "Bind record",
  graduated: "Graduate",
};

/** The scrubber's shorter words. */
const SHORT: Record<Frame["kind"], string> = {
  create: "Create",
  buy: "Buy",
  sell: "Sell",
  refused: "Refused",
  bind: "Bind",
  graduated: "Graduate",
};

function Time({ unix, date = true }: { unix: number; date?: boolean }) {
  const t = dualTime(unix, { date });
  return (
    <span className="lc-time num">
      <span>{t.ct}</span>
      {t.yours && <span className="lc-dim">{t.yours}</span>}
    </span>
  );
}

function Addr({ value, label }: { value: string; label: string }) {
  return (
    <a className="lc-addr num" href={addressUrl(value)} target="_blank" rel="noreferrer" title={value} aria-label={`${label}, ${value}, on testnet.bscscan.com (opens in a new tab)`}>
      {middle(value, 4, 4)}
    </a>
  );
}

function TxLink({ hash, what }: { hash: string; what: string }) {
  return (
    <a className="lc-txlink" href={txUrl(hash)} target="_blank" rel="noreferrer" aria-label={`The ${what} transaction on testnet.bscscan.com (opens in a new tab)`}>
      Transaction
      <Glyph name="popout" />
    </a>
  );
}

/** A tiny price as token pages write it: 0.0₁₀49, the zeros after the point counted. */
function Price({ value }: { value: bigint }) {
  const t = tinyPrice(priceNumber(value));
  return (
    <span className="lc-tiny num" aria-label={t.plain}>
      <span aria-hidden="true">
        {t.head}
        {t.zeros !== null && <sub>{t.zeros}</sub>}
        {t.tail}
      </span>
    </span>
  );
}

/** Our own mark for a token without a picture: its letters on Witness Teal, a day's figures in a tab. */
function TokenMark({ symbol }: { symbol: string }) {
  const digits = /\d+$/.exec(symbol)?.[0] ?? "";
  const letters = symbol.slice(0, symbol.length - digits.length).slice(0, 2);
  return (
    <span className="lc-mono" aria-hidden="true">
      <span className="lc-mono__letters">{letters}</span>
      {digits && <span className="lc-mono__tab num">{digits}</span>}
    </span>
  );
}

// ---------------------------------------------------------------- the head

function Head({ l, s, m, art }: { l: LaunchReplay; s: FrameState; m: Market; art?: ReactNode }) {
  const dir = m.change > 0 ? "up" : m.change < 0 ? "down" : "flat";
  const when = dualTime(m.priceTime);
  const phase = s.phase === "Graduated" ? "Graduated to PancakeSwap" : s.phase;
  return (
    <div className="lc-head">
      {art ? (
        <span className="lc-mono lc-mono--art" aria-hidden="true">
          {art}
        </span>
      ) : (
        <TokenMark symbol={l.symbol} />
      )}
      <div className="lc-id">
        <h2 className="lc-id__pair">
          <span className="lc-id__sym">{l.symbol}</span>
          <span className="lc-id__quote">/ {l.quote.symbol}</span>
          <span className="lc-net">Testnet</span>
          <span className={`lc-phase lc-phase--${s.phase === "Graduated" ? "ok" : s.phase === "Sold out" ? "held" : "open"}`}>{phase}</span>
        </h2>
        <p className="lc-id__name">{l.name}, on BSC testnet</p>
        <p className="lc-id__meta">
          <span className="lc-ca">
            <span className="lc-dim">Contract</span>
            <Hash value={l.token} head={4} tail={4} href={addressUrl(l.token)} label={`${l.symbol} contract address`} />
          </span>
          <span className="lc-by">
            <span className="lc-dim">Created by</span> <Addr value={l.creator} label="The creator's wallet, OpenFour's testnet wallet" />
          </span>
        </p>
      </div>
      <div className="lc-price">
        <p className="lc-price__value">
          <Price value={m.price} /> <span className="lc-price__unit">{l.quote.symbol}</span>
        </p>
        <p className={`lc-price__change lc-price__change--${dir} num`}>
          {percent(m.change)} <span className="lc-dim">since the create</span>
        </p>
        <p className="lc-price__when num">
          {m.priceSource === "pair" ? "Pair's first price" : m.priceSource === "trade" ? "Last trade" : "Curve opens"}, {when.ct}
          {when.yours && <span className="lc-dim"> · {when.yours}</span>}
        </p>
      </div>
    </div>
  );
}

function Stats({ l, m }: { l: LaunchReplay; m: Market }) {
  const created = dualTime(m.created);
  return (
    <ul className="lc-stats" aria-label="Market">
      <li>
        <span className="lc-stats__k">Market cap</span>
        <b className="num">{coin(m.marketCap, l.quote.symbol)}</b>
        <span className="lc-stats__n">Price × {whole(l.maxSupply)}</span>
      </li>
      <li>
        <span className="lc-stats__k">Liquidity</span>
        <b className="num">{coin(m.liquidity.quote, l.quote.symbol)}</b>
        <span className="lc-stats__n">{m.liquidity.where === "pair" ? `In the pair, with ${toks(m.liquidity.tokens, l.symbol)}` : "In the bonding curve"}</span>
      </li>
      <li>
        <span className="lc-stats__k">Volume</span>
        <b className="num">{coin(m.volume, l.quote.symbol)}</b>
        <span className="lc-stats__n">
          {m.trades} {m.trades === 1 ? "trade" : "trades"}, fees included
        </span>
      </li>
      <li>
        <span className="lc-stats__k">Creation time</span>
        <b className="num">{created.ct}</b>
        <span className="lc-stats__n">{created.yours ?? "Market time"}</span>
      </li>
    </ul>
  );
}

// ---------------------------------------------------------------- the right column

/** The Buy and Sell panel as a launchpad draws it, inert: it shows the replay's trade at this frame. */
function TradePanel({ l, s }: { l: LaunchReplay; s: FrameState }) {
  const f = s.frame;
  const t = f.trade;
  const sell = f.kind === "sell";
  const q = l.quote.symbol;
  let field = "0.0";
  let unit: string = q;
  let line: ReactNode = null;
  if (t && f.kind === "buy") {
    field = amount(t.traderQuote);
    line = (
      <>
        <Addr value={t.trader} label="The trader's wallet" /> paid {coin(t.traderQuote, q)}, fees {amount(t.fees)} included, and received <b>{toks(t.tokens, l.symbol)}</b>.
      </>
    );
  } else if (t && sell) {
    field = whole(t.tokens);
    unit = l.symbol;
    line = (
      <>
        <Addr value={t.trader} label="The trader's wallet" /> sold {toks(t.tokens, l.symbol)} back to the curve and received <b>{coin(t.traderQuote, q)}</b> after {amount(t.fees)} in fees.
      </>
    );
  } else if (s.graduated) {
    line = null;
  } else if (s.progress >= 1) {
    line = "Sold out: nothing is left to buy on the curve.";
  } else {
    line = (
      <>
        The curve opens at <Price value={BigInt(l.frames[0]!.price ?? "0")} /> {q} per {l.symbol}.
      </>
    );
  }
  return (
    <section className="lc-pane lc-trade" aria-label="Buy and sell, off in this replay">
      <p className="lc-off">
        <span className="lc-off__dot" aria-hidden="true" />
        Testnet replay, trading off
      </p>
      <div className="lc-trade__tabs" aria-hidden="true">
        <span className={sell ? "" : "is-on is-buy"}>Buy</span>
        <span className={sell ? "is-on is-sell" : ""}>Sell</span>
      </div>
      <div className="lc-trade__field" aria-label={`Amount: ${field} ${unit}`}>
        <span className="lc-trade__amount num">{field}</span>
        <span className="lc-trade__unit">{unit}</span>
      </div>
      <div className="lc-trade__presets" aria-hidden="true">
        {(sell ? ["25%", "50%", "100%"] : [`0.001 ${q}`, `0.01 ${q}`, `0.1 ${q}`]).map((p) => (
          <span key={p}>{p}</span>
        ))}
      </div>
      <div className="lc-trade__go" aria-hidden="true">
        {sell ? "Sell" : "Buy"} off: a replay of real testnet transactions
      </div>
      {line && <p className="lc-trade__line">{line}</p>}
      {s.graduated && (
        <p className="lc-trade__migrated">
          <Glyph name="check" />
          <span>
            The pool was migrated to PancakeSwap: pair <Addr value={s.graduated.pair} label={`The ${l.symbol} / WBNB PancakeSwap V2 pair`} />
          </span>
        </p>
      )}
    </section>
  );
}

function Progress({ l, s }: { l: LaunchReplay; s: FrameState }) {
  const pct = Math.round(s.progress * 10_000) / 100;
  const left = BigInt(l.saleAmount) - s.sold;
  const kept = BigInt(l.maxSupply) - BigInt(l.saleAmount);
  const q = l.quote.symbol;
  return (
    <section className="lc-pane lc-progress" aria-labelledby={`${l.id}-progress`}>
      <div className="lc-pane__head">
        <h3 className="lc-pane__title" id={`${l.id}-progress`}>
          Bonding Curve Progress
        </h3>
        <span className="lc-progress__pct num">{pct.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</span>
      </div>
      <div className="lc-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Bonding curve progress">
        <span className="lc-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="lc-progress__ticks num" aria-hidden="true">
        <span>0%</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100%</span>
      </div>
      {s.graduated ? (
        <p className="lc-progress__text">
          The curve sold out and graduated: <b>{toks(s.graduated.tokens, l.symbol)}</b> and <b>{coin(s.graduated.quote, q)}</b> went into an empty PancakeSwap V2 pair, and its LP tokens were burned at{" "}
          <code>0x…dEaD</code>.
        </p>
      ) : (
        <p className="lc-progress__text">
          There {left === 10n ** 18n ? "is" : "are"} <b>{toks(left, l.symbol)}</b> still for sale on the bonding curve and <b>{coin(s.raised, q)}</b> in it, of a {coin(l.raiseAmount, q)} raise.
        </p>
      )}
      {!s.graduated && (
        <p className="lc-progress__text lc-dim">
          When the sale sells out, the {q} it raised and the {whole(kept)} {l.symbol} the curve keeps back go into PancakeSwap and the LP tokens are burned, once the agent's sealed record is
          bound. Progress rises as tokens sell and falls as they are sold back.
        </p>
      )}
      <p className="lc-progress__note num">
        {toks(s.sold, l.symbol)} of {whole(l.saleAmount)} sold · {coin(s.raised, q)} of {coin(l.raiseAmount, q)} raised
      </p>
    </section>
  );
}

/** Graduation, the twist: refused without a sealed record, the agent's record bound, the pool migrated. */
function Graduation({ l, s }: { l: LaunchReplay; s: FrameState }) {
  const soldOut = s.progress >= 1;
  const refused = l.frames.findIndex((f) => f.kind === "refused");
  const bindAt = l.frames.findIndex((f) => f.kind === "bind");
  const gradAt = l.frames.findIndex((f) => f.kind === "graduated");
  const rf = l.frames[refused];
  const bf = l.frames[bindAt];
  const gf = l.frames[gradAt];
  const b = bf?.bound;
  const reached = (i: number) => i >= 0 && s.index >= i;
  const step = (i: number) => (reached(i) ? (i === s.index ? " is-now" : " is-done") : " is-pending");
  return (
    <section className="lc-pane lc-grad" aria-labelledby={`${l.id}-grad`} aria-live="polite">
      <div className="lc-pane__head">
        <h3 className="lc-pane__title" id={`${l.id}-grad`}>
          Graduation to PancakeSwap
        </h3>
        <span className="lc-grad__rule">Needs both</span>
      </div>
      <ul className="lc-conds">
        <li className={soldOut ? "is-met" : ""}>
          <Glyph name={soldOut ? "check" : "minus"} />
          The sale sold out
        </li>
        <li className={s.bound ? "is-met is-sealed" : ""}>
          <Glyph name={s.bound ? "check" : "minus"} />
          The agent's sealed record bound
        </li>
      </ul>
      <ol className="lc-steps">
        {rf?.refused && (
          <li className={`lc-step lc-step--bad${step(refused)}`}>
            <span className="lc-step__dot" aria-hidden="true">
              {reached(refused) && <Glyph name="close" />}
            </span>
            <div className="lc-step__main">
              <p className="lc-step__title">{reached(refused) ? "Graduation refused: no sealed record" : "Graduate"}</p>
              {reached(refused) ? (
                <>
                  <p className="lc-step__body">
                    <code>EvidenceMissing</code>: the sale had sold out, but no sealed record was bound, so the module reverted the graduation on chain, for agent{" "}
                    <Addr value={rf.refused.agent} label="The agent" /> and scope <code>{l.scopeLabel}</code>.
                  </p>
                  <p className="lc-step__meta">
                    <TxLink hash={rf.hash} what="refused graduation" />
                    <span className="num">Block {formatInt(rf.block)}</span>
                    <Time unix={rf.time} date={false} />
                  </p>
                </>
              ) : (
                <p className="lc-step__body lc-dim">Waits for the sale to sell out.</p>
              )}
            </div>
          </li>
        )}
        {b && bf && (
          <li className={`lc-step lc-step--seal${step(bindAt)}`}>
            <span className="lc-step__dot" aria-hidden="true">
              {reached(bindAt) && <Glyph name="check" />}
            </span>
            <div className="lc-step__main">
              <p className="lc-step__title">{reached(bindAt) ? `The agent's ${odShort(b.od)} sealed record bound` : "Bind the agent's sealed record"}</p>
              {reached(bindAt) ? (
                <>
                  <p className="lc-step__body">
                    The Wattness agent's plan for {odDay(b.od)}: {formatInt(b.leafCount)} batteries, sealed in GateRecord at <Time unix={b.committedAt} />, {minSec(b.gate - b.committedAt)} before its 10:00 CT gate.
                    Graduation can run again.
                  </p>
                  <p className="lc-step__meta">
                    <TxLink hash={bf.hash} what="binding" />
                    <span className="num">Block {formatInt(bf.block)}</span>
                    <Time unix={bf.time} date={false} />
                  </p>
                </>
              ) : (
                <p className="lc-step__body lc-dim">
                  Needs the Wattness agent's plan for a day from {odDay(l.minOd)}, at least {formatInt(l.minLeafCount)} batteries, sealed before that day's 10:00 CT gate.
                </p>
              )}
            </div>
          </li>
        )}
        {gf?.graduated && (
          <li className={`lc-step lc-step--ok${step(gradAt)}`}>
            <span className="lc-step__dot" aria-hidden="true">
              {reached(gradAt) && <Glyph name="check" />}
            </span>
            <div className="lc-step__main">
              <p className="lc-step__title">{reached(gradAt) ? "The pool was migrated to PancakeSwap" : "Migrate to PancakeSwap"}</p>
              {reached(gradAt) ? (
                <>
                  <p className="lc-step__body">
                    {toks(gf.graduated.tokens, l.symbol)} and {coin(gf.graduated.quote, l.quote.symbol)} went into an empty PancakeSwap V2 pair,{" "}
                    <Addr value={gf.graduated.pair} label={`The ${l.symbol} / WBNB PancakeSwap V2 pair`} />; its LP tokens were burned at <code>0x…dEaD</code>.
                  </p>
                  <p className="lc-step__meta">
                    <TxLink hash={gf.hash} what="graduation" />
                    <span className="num">Block {formatInt(gf.block)}</span>
                    <Time unix={gf.time} date={false} />
                  </p>
                </>
              ) : (
                <p className="lc-step__body lc-dim">Once both hold, graduate() moves the curve's {l.quote.symbol} and its kept tokens into a new pair.</p>
              )}
            </div>
          </li>
        )}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------- under the chart

/** What a holder is to the launch, as a launchpad tags it. */
function holderName(h: Holder): ReactNode {
  switch (h.role) {
    case "curve":
      return "Bonding curve (the vault)";
    case "pair":
      return "PancakeSwap V2 pair";
    case "burn":
      return "Burned";
    case "creator":
      return (
        <>
          <Addr value={h.address} label="The creator's wallet" /> <span className="lc-tag">creator</span>
        </>
      );
    default:
      return <Addr value={h.address} label="A holder's wallet" />;
  }
}

/** One line for a frame in the activity list, in the launchpad's words. */
function activity(l: LaunchReplay, f: Frame): ReactNode {
  const q = l.quote.symbol;
  switch (f.kind) {
    case "create":
      return (
        <>
          <Addr value={l.creator} label="The creator's wallet" /> created {l.symbol}: {toks(l.maxSupply, l.symbol)}, {whole(l.saleAmount)} on the curve for a {coin(l.raiseAmount, q)} raise
        </>
      );
    case "buy":
    case "sell":
      return f.trade ? (
        <>
          <Addr value={f.trade.trader} label="The trader's wallet" /> {f.kind === "buy" ? "bought" : "sold"} {toks(f.trade.tokens, l.symbol)} for {coin(f.trade.traderQuote, q)}
        </>
      ) : null;
    case "refused":
      return (
        <>
          Refused: <code>EvidenceMissing</code>, no sealed record bound
        </>
      );
    case "bind":
      return f.bound ? (
        <>
          The agent's sealed plan for {odDay(f.bound.od)}, {formatInt(f.bound.leafCount)} batteries, bound
        </>
      ) : null;
    case "graduated":
      return f.graduated ? (
        <>
          Graduated: {toks(f.graduated.tokens, l.symbol)} and {coin(f.graduated.quote, q)} into PancakeSwap
        </>
      ) : null;
  }
}

function Trades({ l, s }: { l: LaunchReplay; s: FrameState }) {
  return (
    <div className="lc-scroll">
      <table className="lc-table">
        <thead>
          <tr>
            <th scope="col" className="lc-table__acct">
              Account
            </th>
            <th scope="col">Type</th>
            <th scope="col" className="is-num">
              {l.quote.symbol}
            </th>
            <th scope="col" className="is-num">
              {l.symbol}
            </th>
            <th scope="col" className="is-num lc-table__price">
              Price after
            </th>
            <th scope="col">Time</th>
            <th scope="col" className="is-end">
              Txn
            </th>
          </tr>
        </thead>
        <tbody>
          {ticks(l).map((t) => {
            const state = t.frame < s.index ? "past" : t.frame === s.index ? "now" : "next";
            return (
              <tr key={t.hash} className={`lc-row lc-row--${t.kind} lc-row--${state}`} aria-current={state === "now" ? "step" : undefined}>
                <td className="lc-table__acct">
                  <Addr value={t.trader} label="The trader's wallet" />
                </td>
                <td>
                  <span className={`lc-side lc-side--${t.kind}`}>{t.kind === "buy" ? "Buy" : "Sell"}</span>
                  <span className="lc-table__who">
                    <Addr value={t.trader} label="The trader's wallet" />
                  </span>
                </td>
                <td className="is-num num">{amount(t.quote)}</td>
                <td className="is-num num">
                  <span className="lc-full">{whole(t.tokens)}</span>
                  <span className="lc-short" aria-hidden="true">
                    {compact(t.tokens)}
                  </span>
                </td>
                <td className="is-num lc-table__price">
                  <Price value={t.after} />
                </td>
                <td>
                  <Time unix={t.time} date={false} />
                </td>
                <td className="is-end">
                  <a className="lc-tx" href={txUrl(t.hash)} target="_blank" rel="noreferrer" aria-label={`The ${t.kind} transaction on testnet.bscscan.com (opens in a new tab)`}>
                    <Glyph name="popout" />
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Holders({ l, s }: { l: LaunchReplay; s: FrameState }) {
  const total = BigInt(l.maxSupply);
  return (
    <ol className="lc-holders">
      {s.holders.map((h) => {
        const pct = total === 0n ? 0 : Number((h.amount * 10_000n) / total) / 100;
        return (
          <li key={h.address} className={`lc-holder lc-holder--${h.role}`}>
            <span className="lc-holder__who">{holderName(h)}</span>
            <span className="lc-holder__pct num">{pct.toLocaleString("en-US", { maximumFractionDigits: 2 })}%</span>
            <span className="lc-holder__bar" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </span>
            <span className="lc-holder__amt num lc-dim">{toks(h.amount, l.symbol)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Activity({ l, s, onPick }: { l: LaunchReplay; s: FrameState; onPick: (i: number) => void }) {
  return (
    <ol className="lc-acts">
      {l.frames.map((f, i) => {
        const state = i < s.index ? "past" : i === s.index ? "now" : "next";
        return (
          <li key={f.hash} className={`lc-act lc-act--${state}${f.ok ? "" : " lc-act--refused"}`}>
            <button type="button" className="lc-act__btn" onClick={() => onPick(i)} aria-current={state === "now" ? "step" : undefined}>
              <span className={`lc-act__kind lc-act__kind--${f.kind}`}>
                {f.ok ? null : <Glyph name="close" />}
                {KIND[f.kind]}
              </span>
              <span className="lc-act__what">{activity(l, f)}</span>
              <span className="lc-act__when">
                <Time unix={f.time} date={false} />
              </span>
            </button>
            <a className="lc-tx" href={txUrl(f.hash)} target="_blank" rel="noreferrer" aria-label={`The ${KIND[f.kind].toLowerCase()} transaction on testnet.bscscan.com (opens in a new tab)`}>
              <Glyph name="popout" />
            </a>
          </li>
        );
      })}
    </ol>
  );
}

type Tab = "trades" | "holders" | "activity";

function Lists({ l, s, onPick }: { l: LaunchReplay; s: FrameState; onPick: (i: number) => void }) {
  const [tab, setTab] = useState<Tab>("trades");
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "trades", label: "Trades", count: ticks(l).length },
    { id: "holders", label: "Holders", count: s.holders.length },
    { id: "activity", label: "Every transaction", count: l.frames.length },
  ];
  return (
    <section className="lc-pane lc-lists" aria-label={`${l.symbol}'s trades, holders and transactions`}>
      <div className="lc-tabs" role="tablist" aria-label="Lists">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${l.id}-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${l.id}-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              const i = tabs.findIndex((x) => x.id === tab);
              const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]!;
              setTab(next.id);
              (e.currentTarget.parentElement?.querySelector(`#${l.id}-tab-${next.id}`) as HTMLButtonElement | null)?.focus();
            }}
          >
            {t.label} <span className="lc-tabs__n num">{t.count}</span>
          </button>
        ))}
        <span className="lc-tabs__note">In block order, as of the replay's transaction</span>
      </div>
      <div role="tabpanel" id={`${l.id}-panel-${tab}`} aria-labelledby={`${l.id}-tab-${tab}`} className="lc-lists__panel">
        {tab === "trades" ? <Trades l={l} s={s} /> : tab === "holders" ? <Holders l={l} s={s} /> : <Activity l={l} s={s} onPick={onPick} />}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- the replay

/** Play, pause, step and the frames' scrubber. */
function usePlayer(count: number, start: number) {
  const [index, setIndex] = useState(start);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (index >= count - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setIndex((i) => Math.min(i + 1, count - 1)), STEP_MS);
    return () => window.clearTimeout(t);
  }, [playing, index, count]);
  const play = useCallback(() => {
    setIndex((i) => (i >= count - 1 ? 0 : i));
    setPlaying(true);
  }, [count]);
  const pause = useCallback(() => setPlaying(false), []);
  const go = useCallback(
    (i: number) => {
      setPlaying(false);
      setIndex(Math.max(0, Math.min(i, count - 1)));
    },
    [count],
  );
  return { index, playing, play, pause, go, setIndex };
}

function Player({ l, p, check }: { l: LaunchReplay; p: ReturnType<typeof usePlayer>; check?: ReactNode }) {
  const last = l.frames.length - 1;
  const f = l.frames[p.index]!;
  return (
    <div className="lc-player" aria-label="Replay">
      <div className="lc-player__ctl">
        <button type="button" className="lc-btn" onClick={() => p.go(p.index - 1)} disabled={p.index === 0} aria-label="Back one transaction">
          <Glyph name="prev" />
        </button>
        {p.playing ? (
          <button type="button" className="lc-btn lc-btn--main" onClick={p.pause} aria-label="Pause the replay">
            <Glyph name="pause" />
            Pause
          </button>
        ) : (
          <button type="button" className="lc-btn lc-btn--main" onClick={p.play} aria-label={p.index >= last ? "Replay from the start" : "Play the replay"}>
            <Glyph name={p.index >= last ? "refresh" : "play"} />
            {p.index >= last ? "Replay" : "Play"}
          </button>
        )}
        <button type="button" className="lc-btn" onClick={() => p.go(p.index + 1)} disabled={p.index >= last} aria-label="Forward one transaction">
          <Glyph name="next" />
        </button>
      </div>
      <ol className="lc-scrub" aria-label="Transactions">
        {l.frames.map((x, i) => (
          <li key={x.hash} className={`${i <= p.index ? "is-done" : ""}${i === p.index ? " is-now" : ""}${x.ok ? "" : " is-refused"}`}>
            <button type="button" onClick={() => p.go(i)} aria-label={`${i + 1}: ${KIND[x.kind]}${x.ok ? "" : ", refused"}, block ${formatInt(x.block)}`} aria-current={i === p.index ? "step" : undefined}>
              <span className="lc-scrub__dot" aria-hidden="true" />
              <span className="lc-scrub__name">{SHORT[x.kind]}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="lc-player__at">
        <span className="num">
          {p.index + 1} of {l.frames.length} · Block{" "}
          <a href={txUrl(f.hash)} target="_blank" rel="noreferrer">
            {formatInt(f.block)}
          </a>
        </span>
        <Time unix={f.time} />
        {check && <span className="lc-player__check">{check}</span>}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- the card

export interface LaunchCardProps {
  launches: readonly LaunchReplay[];
  /** OpenFour's chip (the registry's Four.meme mark with "OpenFour"), once the registry is in. */
  chip: ChipLogo | null;
  /** The token's picture; our monogram until there is one. */
  art?: ReactNode;
  /** Set once the page has read every frame's receipt again: "verified", or what did not match. */
  check?: ReactNode;
}

export function LaunchCard({ launches, chip, art, check }: LaunchCardProps) {
  const [pick, setPick] = useState(0);
  const l = launches[Math.min(pick, launches.length - 1)]!;
  const last = l.frames.length - 1;
  const still = isCapture() || reduced();
  const p = usePlayer(l.frames.length, still ? last : 0);
  const s = stateAt(l, p.index);
  const m = marketAt(l, p.index);
  const ref = useRef<HTMLElement>(null);
  const autoplayed = useRef(still);

  // Play once by itself when the card comes into view.
  useEffect(() => {
    const el = ref.current;
    if (!el || autoplayed.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !autoplayed.current) {
          autoplayed.current = true;
          window.setTimeout(() => p.play(), 700);
          io.disconnect();
        }
      },
      // the card can be taller than the screen, so its top fifth in view is enough, not a share of its area
      { threshold: 0, rootMargin: "0px 0px -20% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // once per launch shown
  }, [l.id, p.play]);

  return (
    <article
      ref={ref}
      className={`lc lc--${s.phase === "Graduated" ? "graduated" : s.phase === "Sold out" ? "soldout" : "trading"}`}
      data-atmosphere="dark"
      aria-label={`${l.name} (${l.symbol}) on OpenFour, replayed from BSC testnet`}
    >
      <header className="lc-bar">
        {chip ? <LogoChip logo={chip} size={14} /> : <span className="lc-bar__name">OpenFour</span>}
        <p className="lc-bar__idea">An evidence-gated launch: it graduates to PancakeSwap only once its agent's sealed record is bound to it.</p>
        {launches.length > 1 && (
          <div className="lc-pick" role="group" aria-label="Launch">
            {launches.map((x, i) => (
              <button
                key={x.id}
                type="button"
                aria-pressed={x.id === l.id}
                onClick={() => {
                  setPick(i);
                  p.go(still ? x.frames.length - 1 : 0);
                }}
              >
                {x.symbol}
                <span className="lc-pick__net">testnet</span>
              </button>
            ))}
          </div>
        )}
      </header>

      <Head l={l} s={s} m={m} art={art} />
      <Stats l={l} m={m} />

      <div className="lc-body">
        <div className="lc-col lc-col--main">
          <section className="lc-pane lc-chartpane" aria-label={`${l.symbol}'s price and the replay`}>
            <PriceChart l={l} index={p.index} />
            <Player l={l} p={p} check={check} />
          </section>
          <Graduation l={l} s={s} />
          <Lists l={l} s={s} onPick={p.go} />
        </div>
        <div className="lc-col lc-col--side">
          <TradePanel l={l} s={s} />
          <Progress l={l} s={s} />
        </div>
      </div>
    </article>
  );
}
