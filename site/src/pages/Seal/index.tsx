import { Link } from "react-router-dom";
import { SOURCE_LINE } from "../../config";
import { combine, useDay, useLateSeal, useReceipts, type DayIndex, type LateSeal, type Receipts } from "../../data";
import { minSec } from "../../lib/clock";
import { formatInt } from "../../lib/format";
import { dualTime, formatOperatingDay } from "../../lib/time";
import { Glyph, Hash, PageHeader, Ready, Section } from "../../ui";
import { RecordTable } from "./RecordTable";
import { SealClock } from "./SealClock";
import "./styles.css";

// Seal: the operating day as BNB Chain holds it. The lead is how long before
// the gate the root went on chain; then both receipts field by field, and the
// gate the contract computes for itself, with the late commit it refuses.

const CHAIN_SOURCE = "Commits: GateRecord on BNB Smart Chain, read from each chain's receipt.";

export default function SealPage() {
  const all = combine(useDay(), useReceipts(), useLateSeal());
  return (
    <div className="page page--seal">
      <PageHeader
        title="Seal"
        lede={
          <>
            The record on BNB Chain: one root over every plan for the operating day, committed to GateRecord before ERCOT's 10:00 CT day-ahead gate.
            <span className="seal-flow">
              It seals the plans in <Link to="/fleet">Fleet</Link> and <Link to="/battery">Battery</Link>. Next, <Link to="/verify">Verify</Link> checks any plan
              against it, and <Link to="/files">Files</Link> holds the day's files.
            </span>
          </>
        }
      />
      <Ready state={all}>{([day, r, late]) => <Record day={day} receipts={r} late={late} />}</Ready>
    </div>
  );
}

function Record({ day, receipts, late }: { day: DayIndex; receipts: Receipts; late: LateSeal }) {
  const list = receipts.receipts;
  const main = list.find((x) => x.mainnet) ?? list[0];
  if (!main) return null;
  const test = list.find((x) => x !== main);
  const sealed = dualTime(main.blockTime);
  const gate = dualTime(day.gateUnix);
  const lateAt = dualTime(late.attemptUnix);
  const od = day.operatingDay.replaceAll("-", "");

  return (
    <>
      <Section title="Sealed Before the Gate" source={`${SOURCE_LINE} ${CHAIN_SOURCE}`}>
        <div className="seal-lead">
          <p className="seal-lead__figure">
            <span className="seal-lead__value">{minSec(main.secondsBeforeGate)}</span>
            <span className="seal-lead__unit">before the gate</span>
          </p>
          <p className="seal-lead__text">
            <span className="seal-mark" aria-hidden="true" />
            Sealed on {main.chainName} (chain {main.chainId}) in block <span className="num">{formatInt(main.blockNumber)}</span> at{" "}
            <span className="num">{sealed.ct}</span>
            {sealed.yours && <span className="muted num"> · {sealed.yours}</span>}: one root over all <span className="num">{formatInt(day.leafCount)}</span>{" "}
            plans for {formatOperatingDay(day.operatingDay)}.
            {test && (
              <>
                {" "}
                The same root reached {test.chainName} <span className="num">{minSec(test.secondsBeforeGate)}</span> before the gate.
              </>
            )}
          </p>
        </div>
        <SealClock day={day} receipts={list} late={late} />
      </Section>

      <Section
        title="Both Chains, One Record"
        lede="What each chain's receipt records, field by field. The commits differ only in where and when they landed."
        source={CHAIN_SOURCE}
      >
        <div className="seal-root">
          <span className="seal-root__label">Root</span>
          <Hash value={day.root} full label="root" className="seal-root__hash" />
          <span className="seal-root__note">
            RFC 6962 Merkle root over <span className="num">{formatInt(day.leafCount)}</span> RFC 8785 leaves, one per battery, under the scope{" "}
            <code>{day.scopeLabel}</code>.
          </span>
        </div>
        <RecordTable receipts={list} />
      </Section>

      <Section
        title="The Gate, Computed on Chain"
        lede="GateRecord works out each operating day's gate itself: 10:00 Central on the day before, on daylight time from the second Sunday in March to the first Sunday in November. It checks the gate before it looks for an earlier record, so any commit after the gate fails on the gate."
        source={`Contract source: ${late.source}, verified on Sourcify. The late commit is a simulation against both deployments: a call, never a transaction.`}
      >
        <dl className="seal-gate">
          <div>
            <dt>Operating day</dt>
            <dd>
              {formatOperatingDay(day.operatingDay)} <code>od = {od}</code>
            </dd>
          </div>
          <div>
            <dt>Its gate</dt>
            <dd>
              <span className="num">{gate.ct}</span>
              {gate.yours && <span className="muted num"> · {gate.yours}</span>} <code>gate = {day.gateUnix}</code>
            </dd>
          </div>
          <div>
            <dt>The rule</dt>
            <dd>
              <code className="seal-gate__rule">{late.rule}</code>
            </dd>
          </div>
        </dl>
        <div className="seal-late">
          <span className="seal-late__state">
            <Glyph name="close" />
            Refused
          </span>
          <p>
            A second commit for the same day, simulated <span className="num">{late.secondsAfterGate} s</span> after the gate at{" "}
            <span className="num">{lateAt.ct}</span>
            {lateAt.yours && <span className="muted num"> ({lateAt.yours})</span>}, reverts on both chains with <code>{late.errorText}</code>.
          </p>
        </div>
      </Section>

      <p className="seal-next">
        <Link to="/verify" className="seal-next__link">
          Verify a plan against this record
          <Glyph name="next" />
        </Link>
        <span className="muted">The check runs in your browser and reads the record from BNB Smart Chain.</span>
      </p>
    </>
  );
}
