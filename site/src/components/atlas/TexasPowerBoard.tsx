import { formatUsd, shortHash } from "../../lib/format";
import { dualTime } from "../../lib/time";
import { Glyph, Loading, Section } from "../../ui";
import { LATE_MARGIN_S, STOCK_MULTIFEED, TEXAS_FEEDS, feedPage, fixedToNumber, formatAge, freshness, marketNote, type StockFeed } from "./atlas";
import type { FeedSnapshot, MultiFeedRead, NodeRead } from "./chain";
import { Stamp, Unread } from "./ReadState";
import { useStockFeeds, type Polled } from "./useAtlas";
import "./atlas.css";

// Texas power on BNB Chain: four tokenized stocks of companies in Texas's power
// market, priced by Atlas's push feeds and read straight from BNB Smart Chain.
// Context beside the plans, never an input to them.

const HEARTBEAT = STOCK_MULTIFEED.heartbeatS;
const ids = TEXAS_FEEDS.map((f) => f.id);
const idList = `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`;
const logoUrl = (file: string) => `${import.meta.env.BASE_URL}logos/${file}`;

export function TexasPowerBoard({ id = "texas-power" }: { id?: string }) {
  const feeds = useStockFeeds();
  return (
    <Section
      id={id}
      className="atlas-section"
      title="Texas Power on BNB Chain"
      lede="Tokenized stocks of four companies in Texas's power market, priced by Atlas's feeds on BNB Smart Chain and read in your browser: no key, no wallet, no transaction. They are market context: they never enter a plan, and a token's price says nothing about an agent's plans."
      source={
        <>
          Data: Atlas, read from BNB Smart Chain (chain 56) with eth_call: fetchBatch() for feeds {idList} on the MultiFeed{" "}
          <a className="atlas-link mono" href={`https://bscscan.com/address/${STOCK_MULTIFEED.address}`} target="_blank" rel="noreferrer">
            {shortHash(STOCK_MULTIFEED.address)}
            <Glyph name="popout" />
          </a>
          , at one block. Feed ids and push settings from Atlas's public feed catalog. Logos are trademarks of their owners, shown only to identify each company. Display:
          Wattness.
        </>
      }
    >
      <Board feeds={feeds} />
    </Section>
  );
}

function Board({ feeds }: { feeds: Polled<NodeRead<MultiFeedRead>> }) {
  if (!feeds.data) {
    if (!feeds.error) return <Loading label="Reading BNB Smart Chain" />;
    return <Unread polled={feeds}>Atlas's feeds could not be read from BNB Smart Chain just now, so the board is not shown.</Unread>;
  }
  const read = feeds.data.data;
  const note = marketNote(read.block.timestamp);
  return (
    <>
      <Stamp polled={feeds} block={read.block} />
      {note && (
        <p className="atlas-note">
          <Glyph name="clock" />
          {note}
        </p>
      )}
      <div className="atlas-board" role="table" aria-label="Tokenized stocks of companies in Texas's power market, priced by Atlas on BNB Smart Chain">
        <div className="atlas-board__row atlas-board__row--head" role="row">
          <span role="columnheader">Company</span>
          <span role="columnheader">In Texas's power market</span>
          <span role="columnheader" className="atlas-board__num">
            Price
          </span>
          <span role="columnheader">Updated on chain</span>
          <span role="columnheader">Feed</span>
        </div>
        {TEXAS_FEEDS.map((feed, i) => (
          <Row key={feed.id} feed={feed} snap={read.snapshots[i]} read={read} />
        ))}
      </div>
      <p className="atlas-read">
        Atlas sets each feed to push on a <span className="num">{Math.round(STOCK_MULTIFEED.deviation * 100)}%</span> move and at least every{" "}
        <span className="num">{HEARTBEAT} s</span>; a price more than <span className="num">{HEARTBEAT + LATE_MARGIN_S} s</span> old at the read shows its age.
      </p>
    </>
  );
}

function Row({ feed, snap, read }: { feed: StockFeed; snap: FeedSnapshot | undefined; read: MultiFeedRead }) {
  const fresh = snap ? freshness(snap.onchainTs, read.block.timestamp, HEARTBEAT) : null;
  const written = snap && fresh && fresh.state !== "empty";
  return (
    <div className="atlas-board__row" role="row">
      <span role="rowheader" className="atlas-board__company">
        <span className="atlas-logo" aria-hidden="true">
          <img src={logoUrl(feed.logo)} alt="" width={72} height={18} />
        </span>
        <span>
          {feed.company} <span className="muted">({feed.symbol})</span>
        </span>
      </span>
      <span role="cell" className="atlas-board__role">
        {feed.role}
      </span>
      <span role="cell" className="atlas-board__price num">
        {written ? formatUsd(fixedToNumber(snap.price, read.decimals)) : <span className="muted">No price on chain</span>}
      </span>
      <span role="cell" className="atlas-board__time">
        {written ? <Updated at={snap.onchainTs} late={fresh.state === "late"} ageS={fresh.ageS} /> : <span className="muted">Never written</span>}
      </span>
      <span role="cell" className="atlas-board__feed">
        <a className="atlas-link" href={feedPage(feed.id)} target="_blank" rel="noreferrer" aria-label={`${feed.pair}, feed ${feed.id} on Atlas`}>
          {feed.pair}
          <Glyph name="popout" />
        </a>
      </span>
    </div>
  );
}

/** The value's own on-chain time; a late one also carries its date and its age at the read. */
function Updated({ at, late, ageS }: { at: number; late: boolean; ageS: number }) {
  const t = dualTime(at, { date: late });
  return (
    <span className="atlas-time num">
      <span>{t.ct}</span>
      {t.yours && <span className="muted">{t.yours}</span>}
      {late && (
        <span className="atlas-late">
          {formatAge(ageS)} old at the read, past its {HEARTBEAT} s heartbeat
        </span>
      )}
    </span>
  );
}
