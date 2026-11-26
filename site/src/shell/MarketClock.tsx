import { useEffect, useState } from "react";
import { CENTRAL_TZ } from "../config";
import { captureClock } from "../lib/capture";
import { formatCountdown, formatInZone, nextGate, READER_TZ } from "../lib/time";
import { Glyph } from "../ui/Glyph";
import { leftWords } from "./market-day";
import { MarketDayPanel, useMarketDay } from "./MarketDay";

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
 * Market time with the reader's own beside it: "13:42:07 CT · 02:42 yours". Never UTC. A press opens the market day,
 * as the Terminal's clock does.
 */
export function MarketClock({ now }: { now: number }) {
  const unix = Math.floor(now / 1000);
  const ct = formatInZone(unix, CENTRAL_TZ, { date: false });
  const own = formatInZone(unix, READER_TZ, { date: false, seconds: false });
  const same = own === formatInZone(unix, CENTRAL_TZ, { date: false, seconds: false });
  const day = useMarketDay();
  return (
    <>
      <button
        type="button"
        className="market-clock"
        {...day.trigger}
        aria-label={`Market time ${ct.slice(0, 5)} CT${same ? "" : `, ${own} yours`}. Show the market day`}
        title={day.open ? undefined : "Market time (ERCOT, Central), with yours beside it. Click for the market day."}
      >
        <span className="market-clock__ct num">{ct}</span>
        <span className="market-clock__zone">CT</span>
        {!same && <span className="market-clock__yours num">· {own} yours</span>}
      </button>
      {day.open && <MarketDayPanel id={day.id} anchor={day.ref} now={now} onClose={day.close} />}
    </>
  );
}

/**
 * The next 10:00 CT day-ahead gate and the time left: the Terminal's phase tag, in the ok state until the last ten
 * minutes, then bad. No caution amber. A press opens the market day: its phases, cut-offs and where now falls.
 */
export function GateTag({ now, compact = false }: { now: number; compact?: boolean }) {
  const gate = nextGate(now);
  const left = gate.unix - Math.floor(now / 1000);
  const late = left <= 600;
  const day = useMarketDay();
  // The spoken name changes by the minute, not the second: a screen reader is not read a ticking label. It rounds down,
  // as the countdown beside it reads: 01:08:24 is "1 hour 8 minutes", the last minute "less than a minute".
  const minutes = leftWords(left);
  return (
    <>
      <button
        type="button"
        className={`gate-tag${late ? " gate-tag--late" : ""}`}
        {...day.trigger}
        aria-label={compact ? `Gate in ${minutes}, at 10:00 CT. Show the market day` : `Gate 10:00 CT, ${minutes} left. Show the market day`}
        title={day.open ? undefined : `ERCOT's day-ahead gate, 10:00 CT: bids for ${gate.operatingDay} close. Click for the market day.`}
      >
        {compact ? "Gate in" : "Gate 10:00 CT ·"}
        <span className="num">{formatCountdown(left)}</span>
        <Glyph name="caret" />
      </button>
      {day.open && <MarketDayPanel id={day.id} anchor={day.ref} now={now} onClose={day.close} />}
    </>
  );
}
