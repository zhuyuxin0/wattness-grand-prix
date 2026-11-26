import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { formatAmount, formatTokens } from "../../lib/amounts";
import { isCapture } from "../../lib/capture";
import { formatInt } from "../../lib/format";
import { addressUrl, txUrl } from "../../lib/testnet";
import { dualTime, formatOperatingDay } from "../../lib/time";
import { Glyph, middle } from "../../ui";
import { LogoChip, type ChipLogo } from "../../ui/LogoChip";
import { stateAt, type Frame, type FrameState, type Holder, type LaunchReplay } from "./replay";
import "./card.css";

// The launch card: a launch on our OpenFour deployment as a Four.meme user follows a token, replayed from its real
// BSC testnet transactions. The token's card, the bonding curve filling from its buys, its holders, and graduation:
// refused while no sealed record is bound (the module's EvidenceMissing revert), granted once the agent's sealed
// record is. A visitor steps through the frames or plays them; the card plays once by itself when it comes into
// view, and opens on the last frame for a reader who asks for reduced motion and in a recording.

const STEP_MS = 1900;

/** WBNB to four places, or six below a hundredth, so a small trade keeps its figures: "0.1 WBNB", "0.003551 WBNB". */
const coin = (wei: bigint | string, symbol: string) => {
  const v = BigInt(wei);
  const text = formatAmount(v, 18, v !== 0n && v < 10n ** 16n ? 6 : 4);
  return `${text.includes(".") ? text.replace(/\.?0+$/, "") : text} ${symbol}`;
};
const toks = (wei: bigint | string, symbol: string) => `${formatTokens(BigInt(wei))} ${symbol}`;
const whole = (wei: bigint | string) => formatTokens(BigInt(wei));
const odDay = (od: number) => {
  const s = String(od);
  return formatOperatingDay(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
};
const lead = (seconds: number) => `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
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
      {t.yours && <span className="muted">{t.yours}</span>}
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

/** Graduation's two conditions and its outcome at this frame. */
function Graduation({ l, s }: { l: LaunchReplay; s: FrameState }) {
  const soldOut = s.progress >= 1;
  const f = s.frame;
  const refusedNow = f.kind === "refused" && f.refused;
  return (
    <div className="lc-grad" aria-live="polite">
      <div className="lc-grad__head">
        <h3 className="lc-label">Graduation to PancakeSwap</h3>
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
      {s.graduated ? (
        <p className="lc-outcome lc-outcome--ok">
          <strong>Graduated.</strong> {toks(s.graduated.tokens, l.symbol)} and {coin(s.graduated.quote, l.quote.symbol)} went into an empty PancakeSwap V2 pair; its LP
          tokens were burned at <code>0x…dEaD</code>.
        </p>
      ) : refusedNow ? (
        <p className="lc-outcome lc-outcome--bad">
          <strong>
            Graduate refused: <code>EvidenceMissing</code>.
          </strong>{" "}
          The sale had sold out, but no sealed record was bound, so the module reverted the graduation on chain: agent <Addr value={f.refused!.agent} label="The agent" />, scope{" "}
          <code>{l.scopeLabel}</code>.
        </p>
      ) : s.bound ? (
        <p className="lc-outcome lc-outcome--sealed">
          <strong>Sealed record bound.</strong> The Wattness agent's plan for {odDay(s.bound.od)}: {formatInt(s.bound.leafCount)} batteries, sealed in GateRecord{" "}
          {lead(s.bound.gate - s.bound.committedAt)} before its 10:00 CT gate. Graduation can run again.
        </p>
      ) : (
        <p className="lc-outcome">
          {soldOut ? "The sale has sold out; graduation waits on the sealed record." : `Graduation waits for the sale to sell out and for the agent's sealed record, from ${odDay(l.minOd)}.`}
        </p>
      )}
    </div>
  );
}

/** The record the launch needs, and once bound, the one it has: the evidence behind the gate. */
function Record({ l, s }: { l: LaunchReplay; s: FrameState }) {
  const b = s.bound;
  return (
    <div className={`lc-block lc-record${b ? " lc-record--bound" : ""}`}>
      <div className="lc-block__head">
        <h3 className="lc-label">The sealed record</h3>
        <span className="lc-record__state">{b ? "Bound" : "Not bound"}</span>
      </div>
      <dl className="lc-dl">
        <div>
          <dt>Needs</dt>
          <dd>
            The Wattness agent's plan for a day from {odDay(l.minOd)}, at least {formatInt(l.minLeafCount)} batteries, sealed before that day's 10:00 CT gate
          </dd>
        </div>
        {b && (
          <>
            <div>
              <dt>Bound</dt>
              <dd>
                The plan for {odDay(b.od)}: {formatInt(b.leafCount)} batteries
              </dd>
            </div>
            <div>
              <dt>Sealed</dt>
              <dd>
                <Time unix={b.committedAt} />, {lead(b.gate - b.committedAt)} before the gate, in GateRecord
              </dd>
            </div>
          </>
        )}
      </dl>
    </div>
  );
}

function Holders({ l, s }: { l: LaunchReplay; s: FrameState }) {
  const total = BigInt(l.maxSupply);
  return (
    <div className="lc-block">
      <div className="lc-block__head">
        <h3 className="lc-label">Holders</h3>
        <span className="lc-count num">{s.holders.length}</span>
      </div>
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
              <span className="lc-holder__amt num muted">{toks(h.amount, l.symbol)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Activity({ l, s, onPick }: { l: LaunchReplay; s: FrameState; onPick: (i: number) => void }) {
  return (
    <div className="lc-block">
      <div className="lc-block__head">
        <h3 className="lc-label">Activity</h3>
        <span className="lc-count num">
          {s.index + 1} of {l.frames.length}
        </span>
      </div>
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
              <a className="lc-act__tx" href={txUrl(f.hash)} target="_blank" rel="noreferrer" aria-label={`The ${KIND[f.kind].toLowerCase()} transaction on testnet.bscscan.com (opens in a new tab)`}>
                <Glyph name="popout" />
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

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

export interface LaunchCardProps {
  launches: readonly LaunchReplay[];
  /** OpenFour's chip (the registry's Four.meme mark with "OpenFour"), once the registry is in. */
  chip: ChipLogo | null;
  /** The token's picture; a monogram until there is one. */
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

  const f = s.frame;
  const pct = Math.round(s.progress * 10_000) / 100;
  const q = l.quote.symbol;

  return (
    <article ref={ref} className={`lc lc--${s.phase === "Graduated" ? "graduated" : s.phase === "Sold out" ? "soldout" : "trading"}`} aria-label={`${l.name} (${l.symbol}) on OpenFour, replayed from BSC testnet`}>
      <header className="lc-bar">
        {chip ? <LogoChip logo={chip} size={14} /> : <span className="lc-bar__name">OpenFour</span>}
        <p className="lc-bar__idea">An evidence-gated launch: it graduates to PancakeSwap only once its agent's sealed record is bound to it.</p>
        {launches.length > 1 && (
          <div className="seg lc-pick" role="group" aria-label="Launch">
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
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="lc-player">
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
            Block{" "}
            <a href={txUrl(f.hash)} target="_blank" rel="noreferrer">
              {formatInt(f.block)}
            </a>
          </span>
          <Time unix={f.time} />
          {check && <span className="lc-player__check">{check}</span>}
        </p>
      </div>

      <div className="lc-grid">
        <div className="lc-main">
          <div className="lc-token">
            <span className="lc-avatar" aria-hidden="true">
              {art ?? <span className="lc-avatar__mono">{l.symbol.slice(0, 2)}</span>}
            </span>
            <div className="lc-token__text">
              <h2 className="lc-token__name">
                {l.name} <span className="lc-ticker">${l.symbol}</span>
              </h2>
              <p className="lc-token__meta">
                <span className="lc-net">BSC testnet</span>
                <span>
                  by <Addr value={l.creator} label="The creator's wallet" />
                </span>
                <span>
                  created <Time unix={l.frames[0]!.time} />
                </span>
              </p>
            </div>
            <span className={`lc-phase lc-phase--${s.phase === "Graduated" ? "ok" : s.phase === "Sold out" ? "held" : "open"}`}>{s.phase === "Graduated" ? "Graduated to PancakeSwap" : s.phase}</span>
          </div>

          <div className="lc-curve">
            <div className="lc-curve__head">
              <h3 className="lc-label">Bonding curve progress</h3>
              <span className="lc-curve__pct num">{pct.toLocaleString("en-US")}%</span>
            </div>
            <div className="lc-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Bonding curve progress">
              <span className="lc-fill" style={{ width: `${pct}%` }} />
            </div>
            <p className="lc-curve__note num">
              {toks(s.sold, l.symbol)} of {whole(l.saleAmount)} sold · {coin(s.raised, q)} of {coin(l.raiseAmount, q)} raised
            </p>
          </div>

          <Graduation l={l} s={s} />
          <Record l={l} s={s} />
        </div>

        <div className="lc-side">
          <Activity l={l} s={s} onPick={p.go} />
          <Holders l={l} s={s} />
        </div>
      </div>

    </article>
  );
}
