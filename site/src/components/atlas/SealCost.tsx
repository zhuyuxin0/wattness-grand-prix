import { useReceipts, type ChainReceipt } from "../../data";
import { formatInt, formatUsd, shortHash } from "../../lib/format";
import { dualTime, formatOperatingDay } from "../../lib/time";
import { ErrorNote, Glyph, Loading, Ready, Section } from "../../ui";
import { BNB_USD_FEED, fixedToNumber, formatAge, formatBnb, formatGwei, formatSmallUsd, freshness, receiptMismatch, sealCost } from "./atlas";
import type { GasReceipt, NodeRead, SingleFeedRead } from "./chain";
import { Stamp, Unread } from "./ReadState";
import { useBnbUsd, useCommitReceipt, type Polled } from "./useAtlas";
import "./atlas.css";

// What the seal cost: the latest sealed day's mainnet commit, its gas from the
// receipt on chain, valued at Atlas's BNB/USD on BNB Smart Chain and divided
// over the plans under its root.

export function SealCost({ id = "seal-cost" }: { id?: string }) {
  const receipts = useReceipts();
  return (
    <Section
      id={id}
      className="atlas-section"
      title="What the Seal Cost"
      source={
        <>
          Gas: the commit's receipt, read from BNB Smart Chain by its transaction hash. BNB/USD: Atlas feed {BNB_USD_FEED.id}, the SingleFeed{" "}
          <a className="atlas-link mono" href={`https://bscscan.com/address/${BNB_USD_FEED.address}`} target="_blank" rel="noreferrer">
            {shortHash(BNB_USD_FEED.address)}
            <Glyph name="popout" />
          </a>{" "}
          on BNB Smart Chain, read with latestRoundData(). Both from a public node, with no key and no transaction. Calculation and display: Wattness.
        </>
      }
    >
      <Ready state={receipts} label="Loading the sealed record">
        {(r) => {
          const commit = r.receipts.find((x) => x.mainnet);
          if (!commit) return <p className="muted">No mainnet commit is published for {formatOperatingDay(r.operatingDay)}.</p>;
          return <Cost day={r.operatingDay} commit={commit} />;
        }}
      </Ready>
    </Section>
  );
}

function Cost({ day, commit }: { day: string; commit: ChainReceipt }) {
  const gas = useCommitReceipt(commit.txHash);
  const bnb = useBnbUsd();
  if (!gas.data) {
    if (!gas.error) return <Loading label="Reading BNB Smart Chain" />;
    return <Unread polled={gas}>The commit's receipt could not be read from BNB Smart Chain just now, so the seal's cost is not shown.</Unread>;
  }
  const mismatch = receiptMismatch(gas.data.data, commit);
  if (mismatch) return <ErrorNote error={new Error(`The receipt on chain for ${shortHash(commit.txHash)} is not the published commit: ${mismatch}.`)} />;
  return <Breakdown day={day} commit={commit} receipt={gas.data.data} bnb={bnb} />;
}

function Breakdown({ day, commit, receipt, bnb }: { day: string; commit: ChainReceipt; receipt: GasReceipt; bnb: Polled<NodeRead<SingleFeedRead>> }) {
  // A feed that was never written reads zero, which is no price at all.
  const got = bnb.data?.data ?? null;
  const read = got && got.answer > 0n && got.updatedAt > 0 ? got : null;
  const cost = read
    ? sealCost({ gasUsed: receipt.gasUsed, effectiveGasPrice: receipt.effectiveGasPrice, price: read.answer, priceDecimals: read.decimals, plans: commit.leafCount })
    : null;
  const feeWei = receipt.gasUsed * receipt.effectiveGasPrice;
  const plans = formatInt(commit.leafCount);
  const sealed = dualTime(commit.blockTime);

  return (
    <>
      {got ? (
        <Stamp polled={bnb} block={got.block} />
      ) : (
        bnb.error && <Unread polled={bnb}>Atlas's {BNB_USD_FEED.pair} could not be read from BNB Smart Chain just now, so the fee is shown in BNB only.</Unread>
      )}

      <p className="atlas-cost__line">
        Sealing all <span className="num">{plans}</span> plans for {formatOperatingDay(day)} cost <span className="num atlas-cost__strong">{formatBnb(feeWei)}</span> in gas
        {cost ? (
          <>
            : <span className="num atlas-cost__strong">{formatSmallUsd(cost.usd)}</span> at BNB's price now, or{" "}
            <span className="num atlas-cost__strong">{formatSmallUsd(cost.perPlanUsd)}</span> a plan.
          </>
        ) : (
          "."
        )}
      </p>

      <dl className="atlas-cost__parts">
        <div>
          <dt>Gas</dt>
          <dd className="atlas-cost__value num">
            {formatInt(Number(receipt.gasUsed))} gas at {formatGwei(receipt.effectiveGasPrice)}
          </dd>
          <dd className="atlas-cost__how">
            Gas used and effective gas price, from the commit's receipt in block <span className="num">{formatInt(commit.blockNumber)}</span>
          </dd>
        </div>
        <div>
          <dt>Fee</dt>
          <dd className="atlas-cost__value num">{formatBnb(feeWei)}</dd>
          <dd className="atlas-cost__how">Gas used × gas price</dd>
        </div>
        <div>
          <dt>BNB price</dt>
          <dd className="atlas-cost__value num">{read ? `${formatUsd(fixedToNumber(read.answer, read.decimals))} per BNB` : <span className="muted">no value</span>}</dd>
          <dd className="atlas-cost__how">
            <PriceTime bnb={bnb} read={read} />
          </dd>
        </div>
        {cost && (
          <>
            <div>
              <dt>In dollars</dt>
              <dd className="atlas-cost__value num">{formatSmallUsd(cost.usd)}</dd>
              <dd className="atlas-cost__how">Fee × BNB price</dd>
            </div>
            <div>
              <dt>Per plan</dt>
              <dd className="atlas-cost__value num">{formatSmallUsd(cost.perPlanUsd)}</dd>
              <dd className="atlas-cost__how">
                ÷ <span className="num">{plans}</span> plans under one root, about <span className="num">{formatInt(cost.perPlanGas)}</span> gas each
              </dd>
            </div>
          </>
        )}
      </dl>

      {cost && (
        <p className="atlas-cost__note">
          The dollar figures use BNB's price at the read above, not its price when the seal landed at <span className="num">{sealed.ct}</span>
          {sealed.yours && <span className="muted num"> · {sealed.yours}</span>}.
        </p>
      )}
    </>
  );
}

/** Where the price came from and when the chain last took it, with its age when that is past the heartbeat. */
function PriceTime({ bnb, read }: { bnb: Polled<NodeRead<SingleFeedRead>>; read: SingleFeedRead | null }) {
  if (!read) {
    if (bnb.data) return <>Atlas {BNB_USD_FEED.pair} reads zero on chain: no price to value the fee at</>;
    return <>{bnb.error ? `No ${BNB_USD_FEED.pair} read` : `Reading Atlas ${BNB_USD_FEED.pair} from BNB Smart Chain`}</>;
  }
  const fresh = freshness(read.updatedAt, read.block.timestamp, BNB_USD_FEED.heartbeatS);
  const late = fresh.state !== "fresh";
  const t = dualTime(read.updatedAt, { date: late });
  return (
    <>
      Atlas {BNB_USD_FEED.pair}, updated on chain at <span className="num">{t.ct}</span>
      {t.yours && <span className="muted num"> · {t.yours}</span>}
      {late && (
        <>
          ;{" "}
          <span className="atlas-late">
            <span className="num">{formatAge(fresh.ageS)}</span> old at the read, past its <span className="num">{BNB_USD_FEED.heartbeatS} s</span> heartbeat
          </span>
        </>
      )}
    </>
  );
}
