import { useEffect } from "react";
import type { LogoSpec } from "@world/kit/logos";
import { isCapture } from "../../lib/capture";
import { dualTime } from "../../lib/time";
import { Glyph, Loading, Section, type CheckItem } from "../../ui";
import { LiveRead as LiveStamp } from "../../ui/LiveRead";
import { LogoChip } from "../../ui/LogoChip";
import { age, addressUrl } from "../AgentIds/rpc";
import type { FeedRead, LiveRead, LiveState, PricesFile } from "./data";
import { chainReadProblems } from "./rule";

// The tickers: BNB/USD and USDT/USD as a trader reads them, Atlas's feeds on BSC testnet read live in the browser in
// one column and CoinMarketCap's Pro quotes in the other, each column under its owner's chip. CoinMarketCap's API needs
// a key, so its column is the quote the Atlas and CoinMarketCap adapter recorded, with its time. Under the board,
// folded, each feed as the chain answers it, with the check the adapter puts to the SingleFeed it reads.

type Logos = { atlas: LogoSpec; cmc: LogoSpec; note: string };

/** How often the board reads Atlas's feeds again while the page is in view. */
const REFRESH_MS = 30_000;

const minus = (s: string) => s.replace("-", "−");
const usd = (n: number, dp = 2) => minus(n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: dp, maximumFractionDigits: dp }));
const signedPct = (x: number, dp = 2) => `${x > 0 ? "+" : ""}${minus((x * 100).toFixed(dp))}%`;
function big(n: number | null): string {
  if (n == null) return "no value";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)} billion`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)} million`;
  return usd(n, 0);
}
/** A heartbeat as the catalog states it: 60 s, 24 h. */
const beat = (s: number) => (s < 3600 ? `${s} s` : `${s / 3600} h`);

const isRead = (f: LiveRead["feeds"][number]): f is FeedRead => !("error" in f);

function When({ unix, seconds = true }: { unix: number; seconds?: boolean }) {
  const t = dualTime(unix, { seconds });
  return (
    <span className="px-when num">
      <span>{t.ct}</span>
      {t.yours && <span className="muted">{t.yours}</span>}
    </span>
  );
}

type Asset = "BNB" | "USDT";
const PAIRS: { asset: Asset; pair: "BNB/USD" | "USDT/USD"; dp: number }[] = [
  { asset: "BNB", pair: "BNB/USD", dp: 2 },
  { asset: "USDT", pair: "USDT/USD", dp: 5 },
];

export interface LiveFeeds {
  state: LiveState;
  busy: boolean;
  failed: boolean;
  again: () => void;
}

/** The section's Check it: the feeds' contracts, verified once the chain has answered for each. */
export function tickerCheck(p: PricesFile, state: LiveState): { items: CheckItem[]; status: "verified" | "checking" | null; how: string } {
  const read = state.status === "ready" ? state.read : null;
  const items: CheckItem[] = p.onChain.feeds.map((f, i) => {
    const r = read?.feeds[i];
    return {
      kind: "address",
      label: f.pair ? `Atlas feed ${f.feedId}, ${f.pair}` : "The SingleFeed the adapter reads",
      value: f.address,
      href: addressUrl(f.address),
      copy: `${f.pair ?? "SingleFeed"} feed contract address`,
      note: r && isRead(r) ? `Answers "${r.description}", ${r.decimals} decimals` : undefined,
    };
  });
  const all = !!read && read.feeds.every(isRead);
  return {
    items,
    status: all ? "verified" : state.status === "loading" ? "checking" : null,
    how: all
      ? `Each contract answered in your browser at BSC testnet block ${read!.block.toLocaleString("en-US")}. Feed addresses and heartbeats from Atlas's public feed catalog.`
      : "Feed addresses and heartbeats from Atlas's public feed catalog; each opens on testnet.bscscan.com.",
  };
}

export function Tickers({ p, live, logos }: { p: PricesFile; live: LiveFeeds; logos: Logos | null }) {
  const read = live.state.status === "ready" ? live.state.read : null;
  const again = live.again;

  // read again while the page is in view, never in a recording
  useEffect(() => {
    if (isCapture()) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") again();
    }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [again]);

  const feedFor = (pair: string) => {
    const i = p.onChain.feeds.findIndex((f) => f.pair === pair);
    const r = read?.feeds[i];
    return { feed: p.onChain.feeds[i], read: r && isRead(r) ? r : null, error: r && !isRead(r) ? r.error : null };
  };
  const cmcAt = p.cmc.quotes[0]?.observedAtSeconds ?? p.decision.now;
  const cmcWhen = dualTime(cmcAt, { seconds: false });
  const atlasChip = logos ? <LogoChip logo={logos.atlas} size={14} /> : <span className="px-tk__name">Atlas</span>;
  const cmcChip = logos ? <LogoChip logo={logos.cmc} size={14} /> : <span className="px-tk__name">CoinMarketCap</span>;

  return (
    <>
      <div className="px-tk" role="table" aria-label="BNB and USDT in US dollars: Atlas on chain, live, and CoinMarketCap, recorded">
        <div className="px-tk__row px-tk__head" role="row">
          <span role="columnheader" className="px-tk__corner">
            Pair
          </span>
          <span role="columnheader" className="px-tk__src">
            {atlasChip}
            <span className="px-tk__what">
              <span className="px-live-dot" aria-hidden="true" />
              On chain, live · BSC testnet
            </span>
          </span>
          <span role="columnheader" className="px-tk__src">
            {cmcChip}
            <span className="px-tk__what">
              Pro quote, recorded {cmcWhen.ct}
              {cmcWhen.yours ? ` · ${cmcWhen.yours}` : ""}
            </span>
          </span>
        </div>
        {PAIRS.map(({ asset, pair, dp }) => {
          const a = feedFor(pair);
          const c = p.cmc.quotes.find((x) => x.asset === asset);
          return (
            <div key={pair} className="px-tk__row" role="row">
              <span role="rowheader" className="px-tk__pair">
                {pair}
                <span className="px-tk__asset">{asset === "BNB" ? "BNB" : "Tether USD"}</span>
              </span>
              <span role="cell" className="px-tk__cell">
                <span className="px-tk__chip">
                  {atlasChip}
                  <span className="px-tk__what">
                    <span className="px-live-dot" aria-hidden="true" />
                    On chain, live
                  </span>
                </span>
                <span className="px-tk__price num">{a.read ? usd(a.read.priceUsd, dp) : live.state.status === "loading" ? "…" : "no value"}</span>
                <span className="px-tk__sub num">
                  {a.read ? (
                    <>
                      Updated <When unix={a.read.updatedAt} />
                      {a.feed?.heartbeatSeconds ? (
                        <span className="muted">
                          {" "}
                          · heartbeat {beat(a.feed.heartbeatSeconds)}
                          {a.feed.deviationPct ? `, or a ${a.feed.deviationPct}% move` : ""}
                        </span>
                      ) : null}
                    </>
                  ) : a.error ? (
                    `This feed did not answer: ${a.error}`
                  ) : (
                    "Reading BSC testnet"
                  )}
                </span>
              </span>
              <span role="cell" className="px-tk__cell">
                <span className="px-tk__chip">
                  {cmcChip}
                  <span className="px-tk__what">Recorded {cmcWhen.ct}</span>
                </span>
                <span className="px-tk__price num">{c ? usd(c.priceUsd, dp) : "no value"}</span>
                {c && (
                  <span className="px-tk__sub num">
                    <span className={c.percentChange24h < 0 ? "px-tk__down" : c.percentChange24h > 0 ? "px-tk__up" : ""}>
                      {c.percentChange24h !== 0 && <Glyph name={c.percentChange24h < 0 ? "down" : "up"} />}
                      {signedPct(c.percentChange24h / 100)}
                    </span>{" "}
                    24 h · volume {big(c.volume24hUsd)} · id {c.cmcId}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {!read && live.state.status === "loading" && <Loading label="Reading BSC testnet" />}
      {!read && live.state.status === "error" && (
        <p className="px-unread">
          No public BSC testnet node answered just now; CoinMarketCap's recorded quotes and the side-by-side below stand on their own.
          <button type="button" className="live-read__again" onClick={again} disabled={live.busy}>
            <Glyph name="refresh" />
            {live.busy ? "Reading" : "Read again"}
          </button>
        </p>
      )}
      {read && (
        <LiveStamp
          at={{ number: BigInt(read.block), time: read.blockTime }}
          rpc={read.rpc}
          busy={live.busy}
          error={live.failed ? new Error("No public BSC testnet node answered.") : null}
          onRefresh={again}
        />
      )}

      {read && (
        <details className="pk-details px-more">
          <summary>
            <Glyph name="fold" className="pk-details__closed" />
            <Glyph name="fold-open" className="pk-details__open" />
            Each feed as the chain answers it, and the adapter's check
          </summary>
          <div className="px-feeds">
            {p.onChain.feeds.map((feed, i) => {
              const r = read.feeds[i];
              return <FeedCard key={feed.address} feed={feed} read={r && isRead(r) ? r : null} error={r && !isRead(r) ? r.error : null} blockTime={read.blockTime} />;
            })}
          </div>
        </details>
      )}
    </>
  );
}

function FeedCard({ feed, read, error, blockTime }: { feed: PricesFile["onChain"]["feeds"][number]; read: FeedRead | null; error: string | null; blockTime: number }) {
  const adapter = feed.from === "adapter";
  const dp = feed.pair === "USDT/USD" ? 5 : 2;
  const problems = read && feed.pair !== "USDT/USD" ? chainReadProblems(read.description, { priceUsd: read.priceUsd, observedAtSeconds: read.updatedAt }, blockTime) : null;
  const onTime = read && feed.heartbeatSeconds ? read.ageSeconds <= feed.heartbeatSeconds : null;
  return (
    <article className={`px-feed${adapter ? " px-feed--adapter" : ""}`} aria-label={feed.pair ?? "The adapter's SingleFeed"}>
      <header className="px-feed__head">
        <div className="px-feed__titles">
          <h3 className="px-feed__pair">{feed.pair ?? "The Adapter's SingleFeed"}</h3>
          <span className="px-feed__sub">{adapter ? "the feed packages/adapters/atlas-cmc's live run reads" : `Atlas feed ${feed.feedId} on BSC testnet`}</span>
        </div>
        <div className="px-feed__price num">{read ? usd(read.priceUsd, dp) : "no value"}</div>
      </header>
      {error && <p className="px-note">This feed did not answer: {error}</p>}
      <dl className="px-rows">
        <div>
          <dt>Updated</dt>
          <dd>{read ? <When unix={read.updatedAt} /> : <span className="muted">no value</span>}</dd>
        </div>
        <div>
          <dt>Age at the block</dt>
          <dd className="num">
            {read ? age(read.ageSeconds) : <span className="muted">no value</span>}
            {onTime !== null && feed.heartbeatSeconds && (
              <span className="muted">
                {" "}
                · heartbeat {beat(feed.heartbeatSeconds)}
                {feed.deviationPct ? `, or a ${feed.deviationPct}% move` : ""}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Decimals</dt>
          <dd className="num">{read ? read.decimals : <span className="muted">no value</span>}</dd>
        </div>
        <div>
          <dt>Description</dt>
          <dd className="mono px-desc">{read ? read.description : <span className="muted">no value</span>}</dd>
        </div>
      </dl>
      {problems && (
        <p className={`px-verdict${problems.length ? " px-verdict--out" : " px-verdict--in"}`}>
          <Glyph name={problems.length ? "minus" : "check"} />
          {problems.length
            ? `The adapter's check leaves it out of the budget: ${problems.join(", and ")}.`
            : "Passes the adapter's check for a chain read: it names BNB/USD and is at most 180 s old at this block."}
        </p>
      )}
    </article>
  );
}

/** The section around the board: its title, Built with Atlas and CoinMarketCap, and its Check it. */
export function TickerSection({ p, live, logos, builtWith }: { p: PricesFile; live: LiveFeeds; logos: Logos | null; builtWith: Parameters<typeof Section>[0]["builtWith"] }) {
  const read = live.state.status === "ready" ? live.state.read : null;
  return (
    <Section
      id="px-live"
      title="BNB and USDT, Live"
      lede="Atlas's BNB/USD and USDT/USD feeds read live from BSC testnet in your browser, with view calls only, beside CoinMarketCap's Pro quotes as the adapter's run recorded them: its API needs a key, so this page never calls it."
      builtWith={builtWith}
      check={tickerCheck(p, live.state)}
      source={
        <>
          Data: Atlas, read from BSC testnet (chain 97) with eth_call: description(), decimals() and latestRoundData(), all at one block
          {read ? <> ({read.block.toLocaleString("en-US")}, through {new URL(read.rpc).host})</> : null}, read again every 30 s while the page is in view; CoinMarketCap, Pro v3 quotes
          for ids 1839 and 825 in USD, recorded by packages/adapters/atlas-cmc. Calculation and display: Wattness.{logos ? ` ${logos.note}` : ""}
        </>
      }
    >
      <Tickers p={p} live={live} logos={logos} />
    </Section>
  );
}
