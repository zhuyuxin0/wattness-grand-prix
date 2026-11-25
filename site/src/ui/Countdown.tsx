import { useEffect, useState } from "react";
import { dualTime, formatCountdown, formatOperatingDay, nextGate } from "../lib/time";

interface CountdownProps {
  /**
   * A fixed clock (unix ms). With it the component renders one frame and never
   * ticks, which keeps screenshots and recordings deterministic.
   */
  now?: number;
  /** Count to this gate (unix seconds) instead of the next 10:00 CT. */
  gateUnix?: number;
  size?: "sm" | "md" | "lg";
  /** Hide the gate's time (CT and the reader's own) and the operating day. */
  bare?: boolean;
  label?: string;
  className?: string;
}

function useClock(fixed: number | undefined): number {
  const [now, setNow] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined) {
      setNow(fixed);
      return;
    }
    // Align ticks to the second boundary so the digits change together.
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
  return now;
}

export function Countdown({ now: fixed, gateUnix, size = "md", bare = false, label = "Next gate", className }: CountdownProps) {
  const now = useClock(fixed);
  const gate = gateUnix ?? nextGate(now).unix;
  const operatingDay = gateUnix === undefined ? nextGate(now).operatingDay : null;
  const left = gate - Math.floor(now / 1000);
  const t = dualTime(gate, { seconds: false });
  const closed = left <= 0;

  return (
    <div className={`countdown countdown--${size}${closed ? " countdown--closed" : ""}${className ? ` ${className}` : ""}`}>
      <span className="countdown__label">{closed ? "Gate closed" : label}</span>
      <span className="countdown__digits" role="timer" aria-live="off" aria-label={`${formatCountdown(left)} to the gate`}>
        {formatCountdown(Math.max(0, left))}
      </span>
      {!bare && (
        <span className="countdown__meta">
          <span>{t.ct}</span>
          {t.yours && <span className="muted">{t.yours}</span>}
          {operatingDay && <span className="muted">bids for {formatOperatingDay(operatingDay)}</span>}
        </span>
      )}
    </div>
  );
}
