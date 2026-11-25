import type { ChainReceipt, DayIndex, LateSeal, Receipts } from "../../data";
import { formatInt } from "../../lib/format";
import { dualTime, formatInZone, formatOperatingDay } from "../../lib/time";
import { BANGKOK_TZ, CENTRAL_TZ } from "../../config";
import { Hash, ParcFerme } from "../../ui";
import { clockDigits, minSec } from "./clock";

interface SealedRecordProps {
  day: DayIndex;
  receipts: Receipts;
  late: LateSeal;
}

/** The latest sealed record as one timing board: the day, the lead, the root, both chains, the refusal. */
export function SealedRecord({ day, receipts, late }: SealedRecordProps) {
  const main = receipts.receipts.find((r) => r.mainnet) ?? receipts.receipts[0];
  if (!main) return null;
  const sealed = dualTime(main.blockTime);

  return (
    <article className="board" aria-labelledby="board-title">
      <header className="board__head">
        <ParcFerme state="sealed" />
        <h2 className="board__title" id="board-title">
          Latest sealed record
        </h2>
        <span className="board__scope mono">{day.scopeLabel}</span>
      </header>

      <div className="board__metrics">
        <Metric label="Operating day" value={formatOperatingDay(day.operatingDay).replace(/, \d{4}$/, "")} note={`${day.market} · ${day.regime} · ${day.operatingDay.slice(0, 4)}`} />
        <Metric label="Plans sealed" value={formatInt(day.leafCount)} note="one leaf per battery, one root" />
        <Metric
          label="Sealed before the gate"
          value={clockDigits(main.secondsBeforeGate)}
          note={`${minSec(main.secondsBeforeGate)} · ${sealed.ct}`}
          tone="sealed"
        />
        <Metric label="Late seal" value="Reverted" note={`${late.secondsAfterGate} s after the gate · both chains`} tone="refused" />
      </div>

      <SealClock day={day} receipts={receipts.receipts} late={late} />

      <div className="board__root">
        <span className="board__label">Root</span>
        <Hash value={day.root} full label="root" className="board__root-hash" />
        <span className="board__root-note">RFC 6962 over {formatInt(day.leafCount)} RFC 8785 leaves</span>
      </div>

      <div className="board__chains" role="table" aria-label="Commits to GateRecord">
        <div className="board__row board__row--head" role="row">
          <span role="columnheader">Chain</span>
          <span role="columnheader">Block</span>
          <span role="columnheader">Block time</span>
          <span role="columnheader" className="align-right">
            Lead
          </span>
          <span role="columnheader">Transaction</span>
        </div>
        {receipts.receipts.map((r) => (
          <ChainRow key={r.chainId} r={r} />
        ))}
      </div>

      <div className="board__late">
        <ParcFerme state="refused" size="sm" />
        <p>
          A second plan for the same day, simulated at {formatInZone(late.attemptUnix, CENTRAL_TZ, { date: false })} CT (
          {formatInZone(late.attemptUnix, BANGKOK_TZ, { date: false })} Bangkok), is refused on both chains with <code>{late.errorText}</code>. The
          contract computes the gate itself.
        </p>
      </div>
    </article>
  );
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "sealed" | "refused" }) {
  return (
    <div className={`metric${tone ? ` metric--${tone}` : ""}`}>
      <span className="board__label">{label}</span>
      <span className="metric__value num">{value}</span>
      <span className="metric__note">{note}</span>
    </div>
  );
}

function ChainRow({ r }: { r: ChainReceipt }) {
  const t = dualTime(r.blockTime);
  return (
    <div className="board__row" role="row">
      <span role="cell" className="board__chain">
        <span className="board__chain-name">{r.chainName}</span>
        <span className="board__chain-id">
          {r.mainnet ? "Mainnet" : "Testnet"} · {r.chainId}
        </span>
      </span>
      <span role="cell" className="num" data-label="Block">
        {formatInt(r.blockNumber)}
      </span>
      <span role="cell" className="num" data-label="Block time">
        <span className="board__time">
          <span>{t.ct}</span>
          <span className="muted">{t.bangkok}</span>
        </span>
      </span>
      <span role="cell" className="board__lead num align-right" data-label="Lead">
        {clockDigits(r.secondsBeforeGate)}
      </span>
      <span role="cell" data-label="Transaction">
        <Hash value={r.txHash} href={r.txUrl} label={`${r.chainName} transaction hash`} />
      </span>
    </div>
  );
}

// The seal clock: 50 minutes before the gate on a linear scale, then the first
// minute after it at a larger one, so the refused seal 22 s past the gate does
// not sit on the gate line.
const BEFORE = 50 * 60;
const AFTER = 60;
const SPLIT = 0.88;

function SealClock({ day, receipts, late }: { day: DayIndex; receipts: ChainReceipt[]; late: LateSeal }) {
  const gate = day.gateUnix;
  const x = (t: number) => {
    const d = t - gate;
    const f = d <= 0 ? SPLIT * (1 + Math.max(d, -BEFORE) / BEFORE) : SPLIT + (1 - SPLIT) * Math.min(d, AFTER) / AFTER;
    return `${(f * 100).toFixed(3)}%`;
  };
  const main = receipts.find((r) => r.mainnet) ?? receipts[0]!;
  const others = receipts.filter((r) => r !== main);
  const ticks = [-50, -40, -30, -20, -10].map((m) => gate + m * 60);

  return (
    <figure className="sealclock" aria-label={`Sealed ${minSec(main.secondsBeforeGate)} before the 10:00 CT gate; a seal ${late.secondsAfterGate} s after it was refused`}>
      <div className="sealclock__row sealclock__row--top" aria-hidden="true">
        <span className="sealclock__label" style={{ left: x(main.blockTime) }}>
          <b className="is-sealed">Sealed</b> {formatInZone(main.blockTime, CENTRAL_TZ, { date: false })} CT
        </span>
        <span className="sealclock__label sealclock__label--end" style={{ left: x(gate) }}>
          <b>Gate</b> {formatInZone(gate, CENTRAL_TZ, { date: false })} CT
        </span>
      </div>
      <div className="sealclock__track" aria-hidden="true">
        <span className="sealclock__after" style={{ left: x(gate) }} />
        <span className="sealclock__lead" style={{ left: x(main.blockTime), right: `calc(100% - ${x(gate)})` }}>
          <span className="sealclock__lead-text num">{minSec(main.secondsBeforeGate)} before the gate</span>
        </span>
        {ticks.map((t) => (
          <span key={t} className="sealclock__tick" style={{ left: x(t) }} />
        ))}
        <span className="sealclock__mark sealclock__mark--plan" style={{ left: x(day.planUnix) }} />
        {others.map((r) => (
          <span key={r.chainId} className="sealclock__mark sealclock__mark--alt" style={{ left: x(r.blockTime) }} />
        ))}
        <span className="sealclock__mark sealclock__mark--seal" style={{ left: x(main.blockTime) }} />
        <span className="sealclock__gate" style={{ left: x(gate) }} />
        <span className="sealclock__mark sealclock__mark--late" style={{ left: x(late.attemptUnix) }} />
      </div>
      <div className="sealclock__row sealclock__row--bottom" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className="sealclock__axis num" style={{ left: x(t) }}>
            {formatInZone(t, CENTRAL_TZ, { date: false, seconds: false })}
          </span>
        ))}
        <span className="sealclock__label sealclock__label--plan" style={{ left: x(day.planUnix) }}>
          <b>Planned</b> {formatInZone(day.planUnix, CENTRAL_TZ, { date: false })}
        </span>
        <span className="sealclock__label sealclock__label--end sealclock__label--late" style={{ left: "100%" }}>
          <b>+{late.secondsAfterGate} s</b> reverted
        </span>
      </div>
      <figcaption className="visually-hidden">
        Planned at {dualTime(day.planUnix).ct}; sealed on {main.chainName} at {dualTime(main.blockTime).ct}
        {others.map((r) => `, on ${r.chainName} at ${dualTime(r.blockTime).ct}`).join("")}; gate at {dualTime(gate).ct}; a late seal at{" "}
        {dualTime(late.attemptUnix).ct} was refused.
      </figcaption>
    </figure>
  );
}
