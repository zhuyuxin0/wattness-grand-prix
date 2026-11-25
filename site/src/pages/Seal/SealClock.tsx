import type { ChainReceipt, DayIndex, LateSeal } from "../../data";
import { formatInZone, dualTime } from "../../lib/time";
import { CENTRAL_TZ } from "../../config";
import { Glyph } from "../../ui";

// The seal clock: the 50 minutes before the gate on one linear scale, then the
// first minute after it drawn ten times wider, so the refused commit 22 s past
// the gate does not sit on the gate line. The break is the gate itself and the
// caption says so. Every mark is labeled once; the table under the clock holds
// the same times.

const BEFORE = 50 * 60;
const AFTER = 60;
/** 50 min on 5/6 of the width and 1 min on 1/6: the minute after the gate is drawn at 10x. */
const SPLIT = 5 / 6;

function at(t: number, gate: number): number {
  const d = t - gate;
  if (d <= 0) return SPLIT * (1 + Math.max(d, -BEFORE) / BEFORE);
  return SPLIT + ((1 - SPLIT) * Math.min(d, AFTER)) / AFTER;
}

const pct = (f: number) => `${(f * 100).toFixed(3)}%`;
const hms = (unix: number) => formatInZone(unix, CENTRAL_TZ, { date: false });

interface SealClockProps {
  day: DayIndex;
  receipts: ChainReceipt[];
  late: LateSeal;
}

export function SealClock({ day, receipts, late }: SealClockProps) {
  const gate = day.gateUnix;
  const main = receipts.find((r) => r.mainnet) ?? receipts[0];
  if (!main) return null;
  const test = receipts.find((r) => r !== main);
  const x = (t: number) => at(t, gate);
  const ticks = [-50, -40, -30, -20, -10].map((m) => gate + m * 60);
  const date = formatInZone(gate, CENTRAL_TZ, { seconds: false }).replace(/, \d\d:\d\d$/, "");
  const tip = (what: string, unix: number) => {
    const t = dualTime(unix);
    return `${what}: ${t.ct}${t.yours ? ` · ${t.yours}` : ""}`;
  };

  return (
    <figure className="sclock">
      <div className="sclock__plot" aria-hidden="true">
        {/* the closed minute, the lead and the axis */}
        <span className="sclock__closed" style={{ left: pct(x(gate)) }} />
        <span className="sclock__axis" />
        <span className="sclock__lead" style={{ left: pct(x(main.blockTime)), width: pct(x(gate) - x(main.blockTime)) }} />
        {ticks.map((t) => (
          <span key={t} className="sclock__tick" style={{ left: pct(x(t)) }} />
        ))}
        <span className="sclock__gate" style={{ left: pct(x(gate)) }} title={tip("Gate", gate)} />

        {/* leaders from each label to its mark */}
        <span className="sclock__leader sclock__leader--up" style={{ left: pct(x(main.blockTime)) }} />
        {test && <span className="sclock__leader sclock__leader--down1" style={{ left: pct(x(test.blockTime)) }} />}
        <span className="sclock__leader sclock__leader--down2" style={{ left: pct(x(day.planUnix)) }} />
        <span className="sclock__leader sclock__leader--down1" style={{ left: pct(x(late.attemptUnix)) }} />

        {/* marks */}
        <span className="sclock__mark sclock__mark--plan" style={{ left: pct(x(day.planUnix)) }} title={tip("Plans made", day.planUnix)} />
        {test && <span className="sclock__mark sclock__mark--seal sclock__mark--alt" style={{ left: pct(x(test.blockTime)) }} title={tip(`Sealed on ${test.chainName}`, test.blockTime)} />}
        <span className="sclock__mark sclock__mark--seal" style={{ left: pct(x(main.blockTime)) }} title={tip(`Sealed on ${main.chainName}`, main.blockTime)} />
        <span className="sclock__mark sclock__mark--late" style={{ left: pct(x(late.attemptUnix)) }} title={tip("Late commit refused", late.attemptUnix)}>
          <Glyph name="close" size={8} />
        </span>

        {/* labels: above the track, then two rows below it, then the axis */}
        <span className="sclock__label sclock__label--above" style={{ left: pct(x(main.blockTime)) }}>
          Sealed <b className="num">{hms(main.blockTime)}</b>
        </span>
        <span className="sclock__label sclock__label--above sclock__label--end" style={{ left: pct(x(gate)) }}>
          Gate <b className="num">{hms(gate)}</b> CT
        </span>
        {test && (
          <span className="sclock__label sclock__label--below1" style={{ left: pct(x(test.blockTime)) }}>
            Testnet <b className="num">{hms(test.blockTime)}</b>
          </span>
        )}
        <span className="sclock__label sclock__label--below1 sclock__label--end sclock__label--bad" style={{ left: pct(x(late.attemptUnix)) }}>
          Refused <b className="num">+{late.secondsAfterGate} s</b>
        </span>
        <span className="sclock__label sclock__label--below2" style={{ left: pct(x(day.planUnix)) }}>
          Plans made <b className="num">{hms(day.planUnix)}</b>
        </span>

        {ticks.map((t, i) => (
          <span key={t} className={`sclock__axis-label num${i === 0 ? " sclock__axis-label--start" : ""}`} style={{ left: pct(x(t)) }}>
            {formatInZone(t, CENTRAL_TZ, { date: false, seconds: false })}
          </span>
        ))}
        <span className="sclock__axis-label num" style={{ left: pct(x(gate)) }}>
          {formatInZone(gate, CENTRAL_TZ, { date: false, seconds: false })}
        </span>
        <span className="sclock__axis-label sclock__axis-label--end num" style={{ left: "100%" }}>
          {formatInZone(gate + AFTER, CENTRAL_TZ, { date: false, seconds: false })}
        </span>
      </div>
      <figcaption className="sclock__caption">
        Times in CT on {date}. Sealed: {main.chainName} (chain {main.chainId}){test ? `; testnet: ${test.chainName} (chain ${test.chainId})` : ""}. The 50
        minutes before the gate share one scale; the minute after it, where GateRecord refuses every commit, is drawn ten times wider.
        <span className="visually-hidden">
          {" "}
          {tip("Plans made", day.planUnix)}. {tip(`Sealed on ${main.chainName}`, main.blockTime)}.
          {test ? ` ${tip(`Sealed on ${test.chainName}`, test.blockTime)}.` : ""} {tip("Gate", gate)}. {tip("A late commit, simulated and refused", late.attemptUnix)}.
        </span>
      </figcaption>
    </figure>
  );
}
