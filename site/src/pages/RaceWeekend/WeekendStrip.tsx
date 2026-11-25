import { Link } from "react-router-dom";
import type { DayIndex, LateSeal, Receipts } from "../../data";
import { formatInt } from "../../lib/format";
import { dualTime, formatInZone } from "../../lib/time";
import { BANGKOK_TZ, CENTRAL_TZ } from "../../config";
import { Glyph } from "../../ui";
import { minSec, operatingWindow, until, usePageClock } from "./clock";

type Status = "done" | "sealed" | "live" | "next";

interface Step {
  n: string;
  term: string;
  what: string;
  /** Unix seconds the step's time column shows. */
  at: number;
  /** A range end, for steps that last. */
  to?: number;
  status: Status;
  statusText: string;
  detail: string;
  href?: string;
}

const STATUS_GLYPH = { done: "check", sealed: "seal", live: "clock", next: "chevron-right" } as const;

/** Qualifying, Parc Ferme, race day and the stewards, with the record's own times. */
export function WeekendStrip({ day, receipts, late }: { day: DayIndex; receipts: Receipts; late: LateSeal }) {
  const nowS = Math.floor(usePageClock(15_000) / 1000);
  const main = receipts.receipts.find((r) => r.mainnet) ?? receipts.receipts[0];
  if (!main) return null;
  const race = operatingWindow(day.operatingDay);

  const raceStatus: Status = nowS < race.start ? "next" : nowS < race.end ? "live" : "done";
  const steps: Step[] = [
    {
      n: "01",
      term: "Qualifying",
      what: "Agents plan tomorrow",
      at: day.planUnix,
      status: nowS >= day.planUnix ? "done" : "next",
      statusText: nowS >= day.planUnix ? "Planned" : until(day.planUnix - nowS),
      detail: `${formatInt(day.leafCount)} plans from the Wattness Terminal's public release ${day.inputsRelease}, every input named by its SHA-256.`,
      href: "/pit-wall",
    },
    {
      n: "02",
      term: "Parc Ferme",
      what: "Sealed on BNB Chain",
      at: main.blockTime,
      status: nowS >= main.blockTime ? "sealed" : "next",
      statusText: nowS >= main.blockTime ? "Sealed" : until(main.blockTime - nowS),
      detail: `${minSec(main.secondsBeforeGate)} before the ${formatInZone(day.gateUnix, CENTRAL_TZ, { date: false, seconds: false })} CT gate. No changes: a seal ${late.secondsAfterGate} s after it reverted.`,
    },
    {
      n: "03",
      term: "Race day",
      what: "The operating day runs",
      at: race.start,
      to: race.end,
      status: raceStatus,
      statusText: raceStatus === "next" ? `Starts ${until(race.start - nowS)}` : raceStatus === "live" ? "Running" : "Finished",
      detail: "Real-time prices are the telemetry: every 15-minute interval, at each battery's own settlement point.",
    },
    {
      n: "04",
      term: "Stewards",
      what: "Anyone checks any plan",
      at: main.blockTime,
      status: nowS >= main.blockTime ? "live" : "next",
      statusText: nowS >= main.blockTime ? "Open" : until(main.blockTime - nowS),
      detail: "The leaf, its proof to the root, the record on chain, the seal against the gate and the battery's limits, hour by hour.",
      href: "/stewards",
    },
  ];

  return (
    <ol className="strip">
      {steps.map((s) => (
        <li key={s.n} className={`strip__step strip__step--${s.status}`}>
          <div className="strip__top">
            <span className="strip__n num">{s.n}</span>
            <span className={`strip__status strip__status--${s.status}`}>
              <Glyph name={STATUS_GLYPH[s.status]} size={12} />
              {s.statusText}
            </span>
          </div>
          <h3 className="strip__term">{s.term}</h3>
          <p className="strip__what">{s.what}</p>
          <StepTime at={s.at} to={s.to} from={s.n === "04"} />
          <p className="strip__detail">{s.detail}</p>
          {s.href && (
            <Link to={s.href} className="strip__link">
              {s.n === "01" ? "Desert Willow's plan" : "Run the check"}
              <Glyph name="chevron-right" size={12} />
            </Link>
          )}
        </li>
      ))}
    </ol>
  );
}

function StepTime({ at, to, from }: { at: number; to?: number; from?: boolean }) {
  if (to !== undefined) {
    // An operating day: 00:00 to 24:00 CT, which is 13:00 to 13:00 in Bangkok.
    return (
      <div className="strip__time">
        <span className="strip__clock num">
          00:00<span className="strip__dash">–</span>24:00
        </span>
        <span className="strip__zone">CT, {formatInZone(at, CENTRAL_TZ, { seconds: false }).replace(/, \d\d:\d\d$/, "")}</span>
        <span className="strip__alt num">
          {formatInZone(at, BANGKOK_TZ, { seconds: false })} to {formatInZone(to, BANGKOK_TZ, { seconds: false })} Bangkok
        </span>
      </div>
    );
  }
  const t = dualTime(at);
  return (
    <div className="strip__time">
      <span className="strip__clock num">
        {from && <span className="strip__from">from </span>}
        {formatInZone(at, CENTRAL_TZ, { date: false })}
      </span>
      <span className="strip__zone">CT, {formatInZone(at, CENTRAL_TZ, { seconds: false }).replace(/, \d\d:\d\d$/, "")}</span>
      <span className="strip__alt num">{t.bangkok}</span>
    </div>
  );
}
