import { useEffect, useState } from "react";
import { CENTRAL_TZ } from "../config";
import { captureClock } from "../lib/capture";
import { formatCountdown, formatInZone, nextGate, READER_TZ } from "../lib/time";

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

/** Market time with the reader's own beside it: "13:42:07 CT · 02:42 yours". Never UTC. */
export function MarketClock({ now }: { now: number }) {
  const unix = Math.floor(now / 1000);
  const ct = formatInZone(unix, CENTRAL_TZ, { date: false });
  const own = formatInZone(unix, READER_TZ, { date: false, seconds: false });
  const same = own === formatInZone(unix, CENTRAL_TZ, { date: false, seconds: false });
  return (
    <span className="market-clock" title="Market time (ERCOT, Central), with yours beside it">
      <span className="market-clock__ct num">{ct}</span>
      <span className="market-clock__zone">CT</span>
      {!same && <span className="market-clock__yours num">· {own} yours</span>}
    </span>
  );
}

/**
 * The next 10:00 CT day-ahead gate and the time left: the Terminal's phase tag,
 * in the ok state until the last ten minutes, then bad. No caution amber.
 */
export function GateTag({ now, compact = false }: { now: number; compact?: boolean }) {
  const gate = nextGate(now);
  const left = gate.unix - Math.floor(now / 1000);
  const late = left <= 600;
  return (
    <span
      className={`gate-tag${late ? " gate-tag--late" : ""}`}
      role="timer"
      aria-label={`${formatCountdown(left)} to the 10:00 CT day-ahead gate`}
      title={`ERCOT's day-ahead gate, 10:00 CT: bids for ${gate.operatingDay} close`}
    >
      {compact ? "Gate in" : "Gate 10:00 CT ·"}
      <span className="num">{formatCountdown(left)}</span>
    </span>
  );
}
