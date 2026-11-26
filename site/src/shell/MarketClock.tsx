import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { captureClock } from "../lib/capture";
import { PHASES, REAL_TIME, countdown, endTime, marketClockAt, readerTime } from "./market-day";
import { MarketDayPanel } from "./MarketDay";

/** Unix ms, ticking on the second; fixed when recording. */
export function useSecondClock(): number {
  const fixed = captureClock();
  const [now, setNow] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined) return;
    let interval = 0;
    const timeout = window.setTimeout(() => {
      setNow(Date.now());
      interval = window.setInterval(() => setNow(Date.now()), 1000);
    }, 1000 - (Date.now() % 1000));
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [fixed]);
  return fixed ?? now;
}

/**
 * wattness.tech's market clock (wattness-site apps/mms/src/ui/clock.tsx), item for item: the wall time in CT with the
 * reader's own beside it; the phase tomorrow's Operating Day is in, in the phase's color, with the day and the time left;
 * the DAM deadline; and today's Operating Hour with the next Adjustment Period close. The wall time and the phase open
 * the market day. `band` is the phone's second band, beside the page's name: the phase and the deadline alone.
 */
export function MarketClock({ now, band = false }: { now: number; band?: boolean }) {
  const s = marketClockAt(now);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const from = useRef<HTMLButtonElement | null>(null);
  const id = useId();

  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    from.current = e.currentTarget;
    setOpen((o) => !o);
  };
  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) from.current?.focus({ preventScroll: true });
  }, []);
  // A press on either control while the day is open closes it there (the toggle); a press anywhere else closes it where
  // it lands.
  const owns = useCallback((target: Node) => !!box.current?.contains(target) && !!(target as Element).closest?.(".mc-wall, .mc-tag"), []);
  const trigger = {
    "aria-haspopup": "dialog" as const,
    "aria-expanded": open,
    "aria-controls": open ? id : undefined,
    onClick: toggle,
  };

  const bids = PHASES[0]!;
  const { adjustmentClose: adj, bidOfferToSced: bid, sced, statusCheck } = REAL_TIME;

  return (
    <span className={`mc${band ? " mc--band" : ""}`} ref={box}>
      {!band && (
        <button
          type="button"
          className="mc-wall"
          {...trigger}
          title="ERCOT's time, Central Prevailing Time, with yours beside it. Click for market phases and deadlines."
        >
          <b>{s.wall}</b> CT <span className="mc-mine">· {readerTime(now)} yours</span>
        </button>
      )}
      <button
        type="button"
        className={`mc-tag mc-${s.phase.tone}`}
        {...trigger}
        title={`${s.phase.label} for Operating Day ${s.operatingDayShort}. Next: ${s.phase.next} at ${endTime(s.phase.end)} CT.\n\n"${s.phase.quote}"\n— ${s.phase.source}\n\nClick for the whole day.`}
      >
        {s.phase.label} <span className="mc-for">· {s.operatingDayShort}</span>
        {s.phase.atDeadline ? null : <span className="mc-in">· {countdown(s.phase.left)} left</span>}
      </button>
      <span
        className={`mc-dead${s.deadline.urgency ? ` mc-${s.deadline.urgency}-t` : ""}`}
        title={`DAM transaction deadline ${bids.end} CT for Operating Day ${s.deadline.operatingDayShort}.\n\n"${bids.quote}"\n— ${bids.source}`}
      >
        <span className="mc-dead-label">DAM deadline</span>
        <span className="mc-dead-short">DAM</span> <b>{countdown(s.deadline.left)}</b>
      </span>
      {!band && (
        <span
          className="mc-tag mc-rt"
          title={`Operating Hour HE${s.he}, ${s.dayShort}. The Adjustment Period closes at ${s.adjustment.topHH}:00 CT for HE${s.adjustment.he}${s.adjustment.sameDay ? "" : ` (${s.adjustment.dayShort})`}.\n\n"${adj.quote}"\n— ${adj.source}\n\nA battery's Energy Bid/Offer Curve and AS Offers stay open to each SCED run: "${bid.quote}" — ${bid.source}\n\nSCED: ${sced.label} (${sced.source}). COP status check at HH:55 (${statusCheck.source}).`}
        >
          HE{s.he} <span className="mc-for">· adjustments for HE{s.adjustment.he} close in {countdown(s.adjustment.left)}</span>
        </span>
      )}
      {open && <MarketDayPanel id={id} anchor={box} owns={owns} now={now} onClose={close} />}
    </span>
  );
}
