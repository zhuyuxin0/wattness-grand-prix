import type { ReactNode } from "react";
import { REPO_URL } from "../../config";
import { usePageClock } from "../../lib/clock";
import { formatInt } from "../../lib/format";
import { formatOperatingDay } from "../../lib/time";
import { addressUrl, useTestnet, type Live } from "../../lib/testnet";
import { Glyph, Hash, Loading, PageHeader, Section } from "../../ui";
import { LiveRead } from "../../ui/LiveRead";
import { readSeason, type RoundView, type SeasonRead } from "./chain";
import { AppPane } from "./AppPane";
import { CheckIt } from "./CheckIt";
import { LaunchedRound, RoundThree } from "./Rounds";
import { SCOPE, SEASON } from "./addresses";
import { FLAP_FEE_BPS, ROUND3_TERMS, TAX_DAYS, termsOf } from "./terms";
import { bpsText, odDay, usd } from "./view";
import "./styles.css";

// Season: the Flap season from modules/flap. First the launch App itself, the
// Wattness Season Mini App that Flap's host runs (release 7, its build in
// public/apps/wattness-season/), framed in guest mode on BSC testnet: round 3
// live, its replay, and Alice, Bob and Carol played out. Then the new way to
// launch in four steps, the season's terms, and round 1 and round 3 read live.
// Each section's hashes and addresses sit in one Check it, one click away.

const SOURCE = (
  <>
    Read in your browser from BSC testnet (chain 97) over public RPC, no wallet: each round's Launcher, Flap's Portal, GateRecord, and once launched the token, its pool and its
    vault. Contracts:{" "}
    <a href={`${REPO_URL}/tree/main/modules/flap`} target="_blank" rel="noreferrer">
      modules/flap
    </a>
    .
  </>
);

const CONTRACTS = (
  <>
    Contracts:{" "}
    <a href={`${REPO_URL}/tree/main/modules/flap`} target="_blank" rel="noreferrer">
      modules/flap
    </a>
    .
  </>
);

const STEPS: { title: string; body: ReactNode }[] = [
  {
    title: "Contribute",
    body: "Deposit test USD into the round and name the agent you back. If you name none, you back your own address. One wallet and the whole round each have a cap.",
  },
  {
    title: "Launch on a sealed plan",
    body: "Anyone can launch the round once it has raised its minimum and GateRecord holds its milestone: the named agent's plan for the named day, sealed before that day's gate. A round not launched by its deadline only refunds.",
  },
  {
    title: "Seed the pool, claim the reserve",
    body: (
      <>
        The launch puts every deposit into a PancakeSwap V2 pool against half the token supply and sends the pool's LP tokens to <code>0x…dEaD</code>. Contributors claim their
        part of the other half, pro rata to their deposits.
      </>
    ),
  },
  {
    title: "Earn by sealed days",
    body: "The season vault holds the rest of that half and a share of the 3% trading tax, up to a cap. It pays each contributor their deposit share times the fraction of season days their agent sealed before the gate, read from GateRecord at the claim.",
  },
];

function Steps() {
  return (
    <ol className="season-steps">
      {STEPS.map((s, i) => (
        <li key={s.title} className="season-step">
          <span className="season-step__n num" aria-hidden="true">
            {i + 1}
          </span>
          <h3 className="season-step__title">{s.title}</h3>
          <p className="season-step__body">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

/**
 * How round 3 works, each term once: who decides whether it launches, the
 * refusal of a late record, the caps, the tax, what no one can change, and
 * where an unearned share stays. Terms come from the live read when there is
 * one, else from terms.ts.
 */
function RoundRules({ round }: { round?: RoundView }) {
  const t = round ? termsOf(round) : ROUND3_TERMS;
  const day = formatOperatingDay(odDay(t.od)).replace(/, \d{4}$/, "");
  const testUsd = (v: bigint) => <span className="num">{usd(v, "test USD")}</span>;
  return (
    <ul className="season-disclose">
      <li>
        <strong>Whether it launches rests on Wattness.</strong> The round can launch only once Wattness's committer wallet has sealed its record for {day} in GateRecord
        before that day's gate, and the raise has reached its minimum. If the round has not launched by its deadline, every deposit can be claimed back in full; there is no
        withdrawal before then.
      </li>
      <li>
        <strong>A late record is refused.</strong> GateRecord refuses any record made at or after a day's gate, so a late seal can neither launch the round nor count as a
        season day.
      </li>
      <li>
        <strong>Caps.</strong> Up to {testUsd(t.walletCap)} a wallet and {testUsd(t.raiseCap)} for the round, from at most{" "}
        <span className="num">{formatInt(t.maxContributors)}</span> wallets. The vault takes at most {testUsd(t.rewardCap)} of the trading tax; tax above that goes to the
        round's creator, Wattness's testnet wallet.
      </li>
      <li>
        <strong>
          A <span className="num">{bpsText(t.taxBps)}</span> tax for <span className="num">{TAX_DAYS}</span> days.
        </strong>{" "}
        Buys and sells of PRIX pay <span className="num">{bpsText(t.taxBps)}</span> for the first <span className="num">{TAX_DAYS}</span> days after the launch; the first sell
        after that ends the tax. Flap's protocol fee comes off first: <span className="num">{bpsText(FLAP_FEE_BPS)}</span> of the tax on round 1's PRIX. Of the
        rest, <span className="num">{bpsText(t.vaultShareBps)}</span> goes to the vault and <span className="num">{bpsText(10_000 - t.vaultShareBps)}</span> is burned.
      </li>
      <li>
        <strong>The agent you back decides your vault share.</strong> The vault pays each contributor their deposit share times the fraction of season days their agent sealed
        before the gate; name no agent and you back your own address. The share no agent earned stays in the vault, and no one can take it out.
      </li>
      <li>
        <strong>A launch locks the deposits in the pool.</strong> At launch every deposit goes into the pool, and the pool's LP tokens go to <code>0x…dEaD</code>, so the
        liquidity cannot be withdrawn.
      </li>
      <li>
        <strong>No owner, admin, pause or upgrade.</strong> The round's Launcher and vault, their factories and GateRecord have none of these, so no one, Wattness included,
        can change their rules, stop them or replace their code. The launch, PRIX and its tax run on Flap's contracts: Flap's Portal, which owns the token and its tax
        processor, is an upgradeable proxy.
      </li>
      <li>
        <strong>Testnet tokens only.</strong> Test USD and PRIX (testnet) live on BSC testnet.
      </li>
    </ul>
  );
}

/** The terms' wallets and contracts, folded. */
function TermsCheck({ round }: { round?: RoundView }) {
  const t = round ? termsOf(round) : ROUND3_TERMS;
  const rows: { what: string; value: string; href?: string }[] = [
    { what: "Committer, Wattness's record wallet", value: t.committer, href: addressUrl(t.committer) },
    { what: "Creator, Wattness's testnet wallet", value: t.creator, href: addressUrl(t.creator) },
    { what: "Round 3's Launcher", value: SEASON.round3.launcher, href: addressUrl(SEASON.round3.launcher) },
    { what: "GateRecord", value: SEASON.gateRecord, href: addressUrl(SEASON.gateRecord) },
    { what: `Scope, ${SCOPE.label}`, value: SCOPE.id },
    { what: "Test USD", value: SEASON.quoteToken, href: addressUrl(SEASON.quoteToken) },
    { what: "Season launcher factory", value: SEASON.launcherFactory, href: addressUrl(SEASON.launcherFactory) },
    { what: "Season vault factory", value: SEASON.vaultFactory, href: addressUrl(SEASON.vaultFactory) },
    { what: "Flap's Portal", value: SEASON.portal, href: addressUrl(SEASON.portal) },
  ];
  return (
    <CheckIt what="the wallets and contracts these terms name">
      <ul className="season-check__list">
        {rows.map((r) => (
          <li key={r.what}>
            <span className="season-check__what">{r.what}</span>
            <Hash value={r.value} href={r.href ?? null} label={r.what} />
          </li>
        ))}
      </ul>
    </CheckIt>
  );
}

/**
 * A live section before its first read: the shared loading bar; if no node answers, one muted line on the page (in
 * its first live section) with the stamp's compact Read again, and nothing in the others, as Verify does.
 */
function Pending({ live, first = false }: { live: Live<SeasonRead>; first?: boolean }) {
  if (!live.error) return <Loading label="Reading BSC testnet" />;
  if (!first) return null;
  return (
    <p className="season-pending">
      No public BSC testnet node answered just now, so the live figures are not shown.
      <button type="button" className="live-read__again" onClick={live.refresh} disabled={live.busy}>
        <Glyph name="refresh" />
        {live.busy ? "Reading" : "Read again"}
      </button>
    </p>
  );
}

function Stamp({ live, first = false }: { live: Live<SeasonRead>; first?: boolean }) {
  if (!live.read) return null;
  // one Read again on the page, on its first live section's stamp
  return <LiveRead at={live.read.at} rpc={live.read.rpc} busy={live.busy} error={first ? live.error : null} onRefresh={first ? live.refresh : undefined} />;
}

/** Round 3's lede follows its state: open, launched, or past its deadline without a launch. */
function roundThreeLede(s: SeasonRead | undefined): string {
  const day = s ? formatOperatingDay(odDay(s.round3.milestone.od)).replace(/, \d{4}$/, "") : "Fri, Nov 27";
  if (s?.round3.status === "launched")
    return `It launched once the Wattness agent's plan for ${day} was sealed in GateRecord before that day's gate and the raise had reached its minimum. The vault counts each season day from GateRecord.`;
  if (s?.round3.status === "refunding") return `It did not launch by its deadline, so every deposit can be refunded.`;
  return `Open now. It launches only once the Wattness agent's plan for ${day} is sealed before that day's gate and the round has raised its minimum.`;
}

export default function SeasonPage() {
  const live = useTestnet("season", readSeason);
  const now = usePageClock(30_000);
  const s = live.read?.data;

  return (
    <div className="page page--season">
      <PageHeader
        title="Season Token"
        lede="A new way to launch on Flap: the token launches only once a real-world proof is on chain, the Wattness agent's plan for a day of ERCOT batteries sealed in GateRecord before the market's 10:00 CT gate. Below, the launch App itself, live on BSC testnet: round 3 as a race, its replay, and Alice, Bob and Carol played out."
      />

      <Section
        id="season-app"
        source={
          <>
            The App reads round 3's Launcher, GateRecord, the pool and the vault in your browser from BSC testnet; the replays' transactions are on testnet.bscscan.com, and
            Alice, Bob and Carol's amounts follow the contracts' rules. {CONTRACTS}
          </>
        }
      >
        <AppPane />
      </Section>

      <Section
        id="season-how"
        title="A New Way to Launch"
        lede="A launch on Flap usually waits only for money. A season round also waits for proof of work done in the physical world, read on chain, and pays its backers by the days that proof arrives on time."
        source={<>What the contracts do, in four steps. {CONTRACTS}</>}
      >
        <Steps />
      </Section>

      <Section
        id="season-rules"
        title="The Season's Terms"
        variant="panel"
        source={
          <>
            Round 3's terms as its Launcher holds them on BSC testnet; round 1 runs the same code with the same caps. Flap's fee as round 1's tax processor
            holds it. {CONTRACTS}
          </>
        }
      >
        <div className="season-stack">
          <RoundRules round={s?.round3} />
          <TermsCheck round={s?.round3} />
        </div>
      </Section>

      <Section id="season-round-3" title="Round 3" lede={roundThreeLede(s)} source={SOURCE}>
        {s ? (
          <div className="season-stack">
            <Stamp live={live} first />
            {s.round3.status === "launched" ? (
              <LaunchedRound round={s.round3} symbol={s.quoteSymbol} now={now} />
            ) : (
              <RoundThree round={s.round3} symbol={s.quoteSymbol} now={now} />
            )}
          </div>
        ) : (
          <Pending live={live} first />
        )}
      </Section>

      <Section
        id="season-launched"
        title="Round 1"
        lede="Round 1 launched once the Wattness agent's plan for Nov 26 was sealed in GateRecord before that day's gate and the raise had passed its minimum. The vault counts each season day from GateRecord."
        source={SOURCE}
      >
        {s ? (
          <div className="season-stack">
            <Stamp live={live} />
            <LaunchedRound round={s.launched} txs={s.launchedTxs} symbol={s.quoteSymbol} now={now} />
          </div>
        ) : (
          <Pending live={live} />
        )}
      </Section>
    </div>
  );
}
