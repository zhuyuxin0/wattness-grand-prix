import type { ReactNode } from "react";
import { TexasPowerBoard } from "../../components/atlas/TexasPowerBoard";
import { dualTime } from "../../lib/time";
import { Glyph, Hash, Loading, PageHeader, Ready, Section } from "../../ui";
import { LiveRead as LiveStamp } from "../../ui/LiveRead";
import { age, addressUrl } from "../AgentIds/rpc";
import { Fact, Facts, Flow, TabLink } from "../Battery/kit";
import { useLiveFeeds, usePrices, useSigner, type FeedRead, type LiveRead, type LiveState, type PricesFile } from "./data";
import { baseBudget, chainReadProblems } from "./rule";
import "./styles.css";

// Prices: BNB and USDT in US dollars. Atlas's feeds on BSC testnet, read live
// in the browser; Atlas's signed report and CoinMarketCap's quotes as the
// Atlas and CoinMarketCap adapter recorded them, side by side; and the
// evaluation budget those prices set, before and after, by the adapter's rule.
// Then, as context only, four Texas power companies' tokenized stocks from
// Atlas's feeds on BNB Smart Chain.

const SOURCE = "Data: Atlas and CoinMarketCap. Calculation and display: Wattness.";
const NOT_PLANS = "A token's price says nothing about an agent's plans: here BNB's and USDT's only size the evaluation budget, and the stock tokens' are market context.";

const minus = (s: string) => s.replace("-", "−");
const usd = (n: number, dp = 2) => minus(n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: dp, maximumFractionDigits: dp }));
const cents = (c: number) => usd(c / 100);
const pct = (x: number, dp = 2) => `${minus((x * 100).toFixed(dp))}%`;
const signedPct = (x: number, dp = 2) => `${x > 0 ? "+" : ""}${pct(x, dp)}`;
function big(n: number | null): string {
  if (n == null) return "no value";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)} billion`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)} million`;
  return usd(n, 0);
}

function When({ unix, seconds = true }: { unix: number; seconds?: boolean }) {
  const t = dualTime(unix, { seconds });
  return (
    <span className="px-when num">
      <span>{t.ct}</span>
      {t.yours && <span className="muted">{t.yours}</span>}
    </span>
  );
}

export default function PricesPage() {
  const state = usePrices();
  return (
    <div className="page page--prices">
      <PageHeader
        title="Prices"
        lede={
          <>
            BNB and USDT in US dollars from Atlas's oracle and from CoinMarketCap, side by side, and the reference budget they set for evaluations of a sealed record; below
            them, four Texas power companies' tokenized stocks on BNB Smart Chain.
            <Flow>
              {NOT_PLANS} The budget pays nothing itself; the evaluator's jobs on <TabLink to="/agents/ids">Agent IDs</TabLink> were paid 0.1 U each. Testnet BNB has no cash
              value, so every dollar figure in the budget is a reference.
            </Flow>
          </>
        }
      />
      <Ready state={state} label="Loading the prices">
        {(p) => <Prices p={p} />}
      </Ready>
      <TexasPowerBoard />
    </div>
  );
}

function Prices({ p }: { p: PricesFile }) {
  const live = useLiveFeeds(p.onChain);
  return (
    <>
      <Live p={p} state={live.state} busy={live.busy} failed={live.failed} again={live.again} />
      <SideBySide p={p} />
      <Budget p={p} state={live.state} />
    </>
  );
}

// ---------------------------------------------------------------- live, on chain

const isRead = (f: LiveRead["feeds"][number]): f is FeedRead => !("error" in f);
/** A heartbeat as the catalog states it: 60 s, 24 h. */
const beat = (s: number) => (s < 3600 ? `${s} s` : `${s / 3600} h`);

function Live({ p, state, busy, failed, again }: { p: PricesFile; state: LiveState; busy: boolean; failed: boolean; again: () => void }) {
  const read = state.status === "ready" ? state.read : null;
  return (
    <Section
      id="px-live"
      title="On Chain Now"
      lede="Atlas's BNB/USD and USDT/USD feeds on BSC testnet, read in your browser with view calls: no key, no wallet, no transaction. Beside them, the SingleFeed the adapter's own run reads, with the check it must pass before it may price anything."
      source={
        <>
          Data: Atlas, read from BSC testnet (chain 97) with eth_call: description(), decimals() and latestRoundData(), all at one block
          {read ? (
            <>
              {" "}
              ({read.block.toLocaleString("en-US")}, through {new URL(read.rpc).host})
            </>
          ) : null}
          . Feed addresses and heartbeats from Atlas's public feed catalog. Calculation and display: Wattness.
        </>
      }
    >
      {/* the live cards only once a read is in: the shared loading bar before it, one muted line if no node answers */}
      {!read && state.status === "loading" && <Loading label="Reading BSC testnet" />}
      {!read && state.status === "error" && (
        <p className="px-unread">
          No public BSC testnet node answered just now. The recorded prices below stand on their own.
          <button type="button" className="live-read__again" onClick={again} disabled={busy}>
            <Glyph name="refresh" />
            {busy ? "Reading" : "Read again"}
          </button>
        </p>
      )}
      {read && (
        <>
          <LiveStamp
            at={{ number: BigInt(read.block), time: read.blockTime }}
            rpc={read.rpc}
            busy={busy}
            error={failed ? new Error("No public BSC testnet node answered.") : null}
            onRefresh={again}
          />
          <div className="px-feeds">
            {p.onChain.feeds.map((feed, i) => {
              const r = read.feeds[i];
              return <FeedCard key={feed.address} feed={feed} read={r && isRead(r) ? r : null} error={r && !isRead(r) ? r.error : null} blockTime={read.blockTime} loading={false} />;
            })}
          </div>
        </>
      )}
    </Section>
  );
}

function FeedCard({
  feed,
  read,
  error,
  blockTime,
  loading,
}: {
  feed: PricesFile["onChain"]["feeds"][number];
  read: FeedRead | null;
  error: string | null;
  blockTime: number | null;
  loading: boolean;
}) {
  const adapter = feed.from === "adapter";
  const dp = feed.pair === "USDT/USD" ? 5 : 2;
  const problems = read && blockTime != null && feed.pair !== "USDT/USD" ? chainReadProblems(read.description, { priceUsd: read.priceUsd, observedAtSeconds: read.updatedAt }, blockTime) : null;
  const onTime = read && feed.heartbeatSeconds ? read.ageSeconds <= feed.heartbeatSeconds : null;
  return (
    <article className={`px-feed${adapter ? " px-feed--adapter" : ""}`} aria-label={feed.pair ?? "The adapter's SingleFeed"}>
      <header className="px-feed__head">
        <div className="px-feed__titles">
          <h3 className="px-feed__pair">{feed.pair ?? "The Adapter's SingleFeed"}</h3>
          <span className="px-feed__sub">{adapter ? "the feed packages/adapters/atlas-cmc's live run reads" : `Atlas feed ${feed.feedId} on BSC testnet`}</span>
        </div>
        <div className="px-feed__price num">{read ? usd(read.priceUsd, dp) : loading ? "…" : "no value"}</div>
      </header>
      {error && <p className="px-note">This feed did not answer: {error}</p>}
      <dl className="px-rows">
        <div>
          <dt>Updated</dt>
          <dd>{read ? <When unix={read.updatedAt} /> : <span className="muted">{loading ? "reading" : "no value"}</span>}</dd>
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
        <div>
          <dt>Contract</dt>
          <dd>
            <Hash value={feed.address} href={addressUrl(feed.address)} label="feed contract address" />
          </dd>
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

// ---------------------------------------------------------------- recorded, side by side

function SideBySide({ p }: { p: PricesFile }) {
  const signer = useSigner(p.atlas.report, p.atlas.publishedSigner);
  const a = (asset: "BNB" | "USDT") => p.atlas.prices.find((x) => x.asset === asset)!;
  const c = (asset: "BNB" | "USDT") => p.cmc.quotes.find((x) => x.asset === asset)!;
  const sec = p.cmc.security;
  const yesNo = (v: boolean | null) => (v === null ? "unknown" : v ? "yes" : "no");
  const rows: { asset: "BNB" | "USDT"; dp: number; agreement: ReactNode }[] = [
    {
      asset: "BNB",
      dp: 4,
      agreement: (
        <>
          {usd(Math.abs(a("BNB").priceUsd - c("BNB").priceUsd), 4)} apart, {pct(p.agreement.bnbDeviation)} of CoinMarketCap's price; the rule allows {pct(p.agreement.bnbLimit, 0)}
        </>
      ),
    },
    {
      asset: "USDT",
      dp: 5,
      agreement: (
        <>
          Atlas's USDT is {pct(p.agreement.usdtFromDollar)} from $1; the rule allows {pct(p.agreement.usdtLimit, 0)}
        </>
      ),
    },
  ];
  return (
    <Section
      id="px-sources"
      title="Two Sources, Side by Side"
      lede={
        <>
          The prices the adapter's live run read on {dualTime(p.atlas.report.recordedAt, { seconds: false }).ct.replace(/, \d\d:\d\d CT$/, "")}: Atlas's signed report and
          CoinMarketCap Pro's quotes, a minute and a half apart. CoinMarketCap's API needs a key, so this page never calls it; its figures are as recorded, each with its
          time.
        </>
      }
      source={`${SOURCE} Atlas: signed Pull report for feeds 633 and 649, payload and signature as recorded by packages/adapters/atlas-cmc. CoinMarketCap: Pro v3 quotes for ids 1839 and 825 in USD, and its security detail for BSC-USDT, recorded by the same run.`}
    >
      <div className="px-pairs">
        {rows.map(({ asset, dp, agreement }) => {
          const ax = a(asset);
          const cx = c(asset);
          return (
            <article key={asset} className="px-pair" aria-label={`${asset}/USD`}>
              <h3 className="px-pair__name">{asset}/USD</h3>
              <div className="px-pair__cols">
                <div className="px-src">
                  <div className="px-src__who">Atlas · signed report, feed {ax.feedId}</div>
                  <div className="px-src__price num">{usd(ax.priceUsd, dp)}</div>
                  <When unix={ax.observedAtSeconds} />
                </div>
                <div className="px-src">
                  <div className="px-src__who">CoinMarketCap Pro · id {cx.cmcId}</div>
                  <div className="px-src__price num">{usd(cx.priceUsd, dp)}</div>
                  <When unix={cx.observedAtSeconds} />
                  <span className="px-src__more num">
                    24 h {signedPct(cx.percentChange24h / 100)} · volume {big(cx.volume24hUsd)}
                  </span>
                </div>
              </div>
              <p className="px-pair__agree num">{agreement}</p>
            </article>
          );
        })}
      </div>
      <Facts className="px-checks">
        <Fact label="Atlas's signature" note="Recovered here, in your browser, from the Keccak-256 of the report's payload and its signature.">
          {signer.status === "checking" ? (
            <span className="muted">checking</span>
          ) : signer.status === "error" ? (
            <span>could not be checked: {signer.error}</span>
          ) : (
            <span className="px-signer">
              <Glyph name={signer.matches ? "check" : "close"} />
              <Hash value={signer.signer} label="recovered signer" />
              <span className="muted">{signer.matches ? "Atlas's published production signer" : "not Atlas's published signer"}</span>
            </span>
          )}
        </Fact>
        <Fact label="Signed payload" note={`Two packages: feed id, price at 18 decimals, time, then the count. Signed by ${p.atlas.publishedSigner.slice(0, 8)}… at the report's time.`}>
          <Hash value={p.atlas.report.payload} head={10} tail={6} label="signed payload" />
        </Fact>
        <Fact label="BSC-USDT, CoinMarketCap's security detail" note="Vendor fields the rule requires before it prices a budget, not a safety certification.">
          <span className="num">
            flagged by the vendor: {yesNo(sec.flagged)} · contract verified: {yesNo(sec.verifiedContract)} · source: {sec.source ?? "none"}
          </span>
          <Hash value={sec.address} label="BSC-USDT address" />
        </Fact>
      </Facts>
    </Section>
  );
}

// ---------------------------------------------------------------- the budget

function Budget({ p, state }: { p: PricesFile; state: LiveState }) {
  const d = p.decision;
  const after = d.after;
  const bnbAtlas = p.atlas.prices.find((x) => x.asset === "BNB")!;
  const bnbCmc = p.cmc.quotes.find((x) => x.asset === "BNB")!;
  const lower = Math.min(bnbAtlas.priceUsd, bnbCmc.priceUsd);
  const lowerFrom = bnbCmc.priceUsd <= bnbAtlas.priceUsd ? "CoinMarketCap's" : "Atlas's";
  const moved = after.baselineEvaluationBudgetUsdCents - after.evaluationBudgetUsdCents;
  const baselineCount = Math.floor(after.baselineEvaluationBudgetUsdCents / d.evaluationPriceUsdCents);
  const live = state.status === "ready" ? state.read.feeds[0] : null;
  const liveBnb = live && isRead(live) && chainReadProblems(live.description, { priceUsd: live.priceUsd, observedAtSeconds: live.updatedAt }, state.status === "ready" ? state.read.blockTime : 0).length === 0 ? live : null;
  const now = liveBnb ? baseBudget(d.treasuryBnb, liveBnb.priceUsd, d.evaluationPriceUsdCents) : null;
  const at = dualTime(d.now);

  return (
    <Section
      id="px-budget"
      title="What the Price Does to the Budget"
      lede={`The evaluation budget is a declared ${d.treasuryBnb} BNB, not a wallet balance. The adapter's rule values it at the lower of the two BNB prices, holds back a reserve that grows with the day's move, and counts the evaluations the rest pays for at ${cents(d.evaluationPriceUsdCents)} each.`}
      source={`${SOURCE} Rule: fundingDecision in packages/adapters/atlas-cmc, run on the recorded inputs at the run's own clock, ${at.ct}${at.yours ? ` (${at.yours})` : ""}; it gives the decision the run recorded.`}
    >
      <div className="px-ba" role="table" aria-label="The budget before and after the prices">
        <div className="px-ba__row px-ba__head" role="row">
          <span role="columnheader" />
          <span role="columnheader">Before the prices</span>
          <span role="columnheader">After</span>
        </div>
        <BaRow label="State" before="Unpriced: no budget until fresh signed prices, a quote and the vendor fields are in" after={after.state === "priced" ? "Priced: both sources fresh and in agreement" : "Review: no budget"} />
        <BaRow label={`Value of ${d.treasuryBnb} BNB`} before="none" after={`${cents(after.referenceValueUsdCents)}, at ${usd(lower, 4)}, ${lowerFrom} price, the lower`} />
        <BaRow
          label="Reserve"
          before="none"
          after={`${pct(after.reserveFraction)} = ${pct(after.baselineReserveFraction, 0)} + 2 × ${pct(Math.abs(bnbCmc.percentChange24h) / 100)}, the day's BNB move (at most ${pct(p.limits.reserveCap, 0)})`}
        />
        <BaRow label="Budget" before="none" after={cents(after.evaluationBudgetUsdCents)} strong />
        <BaRow label={`Evaluations at ${cents(d.evaluationPriceUsdCents)}`} before="none" after={String(after.evaluationCount)} strong />
      </div>
      <p className="px-move num">
        At the fixed {pct(after.baselineReserveFraction, 0)} reserve the same value would give {cents(after.baselineEvaluationBudgetUsdCents)} and {baselineCount} evaluations; the
        day's move took {cents(moved)} and {baselineCount - after.evaluationCount} evaluations off.
      </p>
      {now && liveBnb && (
        <p className="px-move px-move--live num">
          At Atlas's BNB/USD on chain now, {usd(liveBnb.priceUsd)}, {d.treasuryBnb} BNB is worth {cents(now.valueCents)}; at the {pct(after.baselineReserveFraction, 0)} base reserve that
          is {cents(now.budgetCents)}, {now.evaluations} evaluations ({now.evaluations - baselineCount >= 0 ? "+" : "−"}
          {Math.abs(now.evaluations - baselineCount)} on the recorded base). The full rule also takes CoinMarketCap's quote from the same minute; that call needs a key, so it runs with the adapter, as in the recorded run above.
        </p>
      )}
      <Facts className="px-rules">
        <Fact label="Atlas price">Refused if older than {p.limits.atlasMaxAgeSeconds} s or dated {p.limits.futureDriftSeconds} s ahead</Fact>
        <Fact label="CoinMarketCap quote">Refused if older than {p.limits.cmcMaxAgeSeconds} s</Fact>
        <Fact label="The two BNB prices">More than {pct(p.agreement.bnbLimit, 0)} apart: review, no budget</Fact>
        <Fact label="Atlas's USDT">More than {pct(p.agreement.usdtLimit, 0)} from $1: review, no budget</Fact>
        <Fact label="Vendor fields">Unknown, flagged or unverified: review, no budget</Fact>
        <Fact label="Price per evaluation">{cents(d.evaluationPriceUsdCents)}, a reference; the evaluator's own job price is $0.10 in testnet U</Fact>
      </Facts>
    </Section>
  );
}

function BaRow({ label, before, after, strong }: { label: string; before: string; after: string; strong?: boolean }) {
  return (
    <div className={`px-ba__row${strong ? " px-ba__row--strong" : ""}`} role="row">
      <span role="rowheader" className="px-ba__label">
        {label}
      </span>
      <span role="cell" className="px-ba__before">
        <span className="px-ba__tag">Before</span>
        {before}
      </span>
      <span role="cell" className="px-ba__after num">
        <span className="px-ba__tag">After</span>
        {after}
      </span>
    </div>
  );
}
