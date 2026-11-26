import { useEffect, useState, type ReactNode } from "react";
import type { LogoSpec } from "@world/kit/logos";
import { TexasPowerBoard } from "../../components/atlas/TexasPowerBoard";
import { dualTime } from "../../lib/time";
import { Glyph, PageHeader, Ready, Section, Stat, StatRow, type CheckItem } from "../../ui";
import { Fact, Facts, TabLink } from "../Battery/kit";
import { LogoChip } from "../../ui/LogoChip";
import { useLiveFeeds, usePrices, useSigner, type FeedRead, type LiveRead, type LiveState, type PricesFile } from "./data";
import { SOURCE_COLUMN } from "./places";
import { baseBudget, chainReadProblems } from "./rule";
import { Strip } from "./Strip";
import { TickerSection } from "./Tickers";
import "./styles.css";

// Prices: BNB and USDT in US dollars. Under the head, a strip of the four
// companies' logos and the two sources', each a jump to its row or column.
// Atlas's feeds on BSC testnet, read live in the browser; Atlas's signed
// report and CoinMarketCap's quotes as the Atlas and CoinMarketCap adapter
// recorded them, side by side; and the evaluation budget those prices set,
// before and after, by the adapter's rule, with what the budget is and is not.
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

/** The owners' logos for this page: the world package's registry, loaded by dynamic import (the site loads the package
 *  only so), which also brings the logo chip's stylesheet; null until then, and on a failure the page keeps its words. */
type Logos = { atlas: LogoSpec; cmc: LogoSpec; note: string };
function useLogos(): Logos | null {
  const [logos, setLogos] = useState<Logos | null>(null);
  useEffect(() => {
    let live = true;
    import("@world/kit/logos").then(
      (m) => live && setLogos({ atlas: m.LOGOS.atlas, cmc: m.LOGOS.cmc, note: m.LOGO_NOTE }),
      (error: unknown) => console.warn("The logos could not be loaded:", error),
    );
    return () => {
      live = false;
    };
  }, []);
  return logos;
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
  const logos = useLogos();
  return (
    <div className="page page--prices">
      <PageHeader
        title="Prices"
        lede="BNB and USDT in US dollars from Atlas's oracle and from CoinMarketCap, the evaluation budget they set, and four Texas power companies' tokenized stocks on BNB Smart Chain."
      />
      <Strip logos={logos} />
      <Ready state={state} label="Loading the prices">
        {(p) => <Prices p={p} logos={logos} />}
      </Ready>
      <TexasPowerBoard chips={logos !== null} />
    </div>
  );
}

function Prices({ p, logos }: { p: PricesFile; logos: Logos | null }) {
  const live = useLiveFeeds(p.onChain);
  return (
    <>
      <TickerSection p={p} live={live} logos={logos} builtWith={null} />
      <SideBySide p={p} logos={logos} />
      <Budget p={p} state={live.state} logos={logos} />
    </>
  );
}

const isRead = (f: LiveRead["feeds"][number]): f is FeedRead => !("error" in f);

// ---------------------------------------------------------------- recorded, side by side

/** The side by side's Check it: the recovered signer, the signed payload and its signature, BSC-USDT's contract. */
function sourceItems(p: PricesFile, signer: ReturnType<typeof useSigner>): CheckItem[] {
  const items: CheckItem[] = [];
  if (signer.status === "done") items.push({ kind: "address", label: "The report's signer, recovered here", value: signer.signer, copy: "recovered signer" });
  items.push(
    { kind: "address", label: "Atlas's published production signer", value: p.atlas.publishedSigner, copy: "published signer" },
    { kind: "payload", label: "The signed payload", value: p.atlas.report.payload, note: "Two packages: feed id, price at 18 decimals, time, then the count.", copy: "signed payload" },
    { kind: "signature", label: "Atlas's signature over it", value: p.atlas.report.signature, copy: "signature" },
    { kind: "address", label: "BSC-USDT, the contract CoinMarketCap's security detail names", value: p.cmc.security.address, href: `https://bscscan.com/address/${p.cmc.security.address}`, copy: "BSC-USDT address" },
  );
  return items;
}

function SideBySide({ p, logos }: { p: PricesFile; logos: Logos | null }) {
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
      check={{
        items: sourceItems(p, signer),
        status: signer.status === "done" ? (signer.matches ? "verified" : "failed") : signer.status === "checking" ? "checking" : null,
        how:
          signer.status === "done"
            ? `The signer was recovered in your browser from the Keccak-256 of the report's payload and its signature${signer.matches ? ": Atlas's published production signer" : ", and it is not Atlas's published signer"}.`
            : "The report's signer is recovered in your browser from the Keccak-256 of its payload and its signature.",
      }}
      source={`${SOURCE} Atlas: signed Pull report for feeds 633 and 649, payload and signature as recorded by packages/adapters/atlas-cmc. CoinMarketCap: Pro v3 quotes for ids 1839 and 825 in USD, and its security detail for BSC-USDT, recorded by the same run.${logos ? ` ${logos.note}` : ""}`}
    >
      <div className="px-pairs">
        {rows.map(({ asset, dp, agreement }) => {
          const ax = a(asset);
          const cx = c(asset);
          return (
            <article key={asset} className="px-pair" aria-label={`${asset}/USD`}>
              <h3 className="px-pair__name">{asset}/USD</h3>
              <div className="px-pair__cols">
                <div className="px-src" id={asset === "BNB" ? SOURCE_COLUMN.atlas : undefined}>
                  <div className="px-src__who">
                    {logos ? <LogoChip logo={logos.atlas} size={13} /> : "Atlas ·"} signed report, feed {ax.feedId}
                  </div>
                  <div className="px-src__price num">{usd(ax.priceUsd, dp)}</div>
                  <When unix={ax.observedAtSeconds} />
                </div>
                <div className="px-src" id={asset === "BNB" ? SOURCE_COLUMN.cmc : undefined}>
                  <div className="px-src__who">
                    {logos ? <LogoChip logo={logos.cmc} size={13} /> : "CoinMarketCap"} Pro · id {cx.cmcId}
                  </div>
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
              <span>{signer.matches ? "Atlas's published production signer" : "Not Atlas's published signer"}</span>
            </span>
          )}
        </Fact>
        <Fact label="Signed payload" note={`Signed by Atlas's production signer at the report's time; the payload and the signer are in Check it.`}>
          Two packages: feed id, price at 18 decimals, time, then the count
        </Fact>
        <Fact label="BSC-USDT, CoinMarketCap's security detail" note="Vendor fields the rule requires before it prices a budget, not a safety certification.">
          <span className="num">
            flagged by the vendor: {yesNo(sec.flagged)} · contract verified: {yesNo(sec.verifiedContract)} · source: {sec.source ?? "none"}
          </span>
        </Fact>
      </Facts>
    </Section>
  );
}

// ---------------------------------------------------------------- the budget

function Budget({ p, state, logos }: { p: PricesFile; state: LiveState; logos: Logos | null }) {
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
      lede={`A declared ${d.treasuryBnb} BNB, valued at the lower of the two BNB prices less a reserve for the day's move, pays for ${after.evaluationCount} evaluations of a sealed record at ${cents(d.evaluationPriceUsdCents)} each: a reference figure, since testnet BNB has no cash value.`}
      builtWith={logos ? [logos.atlas, logos.cmc] : null}
      source={`${SOURCE} Rule: fundingDecision in packages/adapters/atlas-cmc, run on the recorded inputs at the run's own clock, ${at.ct}${at.yours ? ` (${at.yours})` : ""}; it gives the decision the run recorded.`}
    >
      <StatRow className="px-budget-stats">
        <Stat label={`Value of ${d.treasuryBnb} BNB`} value={cents(after.referenceValueUsdCents)} note={`At ${usd(lower, 4)}, ${lowerFrom} price, the lower`} size="sm" />
        <Stat label="Reserve" value={pct(after.reserveFraction)} note={`${pct(after.baselineReserveFraction, 0)} plus twice the day's BNB move`} size="sm" />
        <Stat label="Budget" value={cents(after.evaluationBudgetUsdCents)} note={after.state === "priced" ? "Priced: both sources fresh and in agreement" : "Review: no budget"} size="sm" />
        <Stat label={`Evaluations at ${cents(d.evaluationPriceUsdCents)}`} value={String(after.evaluationCount)} note="Counted by the adapter's rule" size="sm" />
      </StatRow>
      <details className="pk-details px-more">
        <summary>
          <Glyph name="fold" className="pk-details__closed" />
          <Glyph name="fold-open" className="pk-details__open" />
          How the rule sets it, before and after the prices
        </summary>
          <p className="px-budget-note">
            {NOT_PLANS} The budget counts evaluations of a sealed record and pays nothing itself; the evaluator's jobs on{" "}
            <TabLink to="/agents/ids">Agent IDs</TabLink> were paid 0.1 U each. Testnet BNB has no cash value, so every dollar figure in the budget is a reference.
          </p>
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
      </details>
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
