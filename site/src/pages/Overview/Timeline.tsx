import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { DayIndex, LateSeal, Receipts } from "../../data";
import { minSec, operatingWindow, until } from "../../lib/clock";
import { formatInt } from "../../lib/format";
import { dualTime, formatInZone, formatOperatingDay, nextGate } from "../../lib/time";
import { CENTRAL_TZ } from "../../config";
import { Glyph } from "../../ui";

// The day in the record's own times, in order, with a line where now falls:
// what has happened above it, what comes next below it.

type State = "done" | "sealed" | "closed" | "running" | "next";

interface Event {
  id: string;
  at: number;
  /** An event that lasts: the operating day. */
  to?: number;
  what: string;
  detail: ReactNode;
  state: State;
  stateText: string;
  link?: { to: string; label: string };
}

export function Timeline({ day, receipts, late, nowMs }: { day: DayIndex; receipts: Receipts; late: LateSeal; nowMs: number }) {
  const now = Math.floor(nowMs / 1000);
  const list = receipts.receipts;
  const main = list.find((r) => r.mainnet) ?? list[0];
  if (!main) return null;
  const test = list.find((r) => r !== main);
  const run = operatingWindow(day.operatingDay);
  const next = nextGate(nowMs);
  const past = (t: number) => now >= t;

  const events: Event[] = [
    {
      id: "plan",
      at: day.planUnix,
      what: "Plans made",
      detail: (
        <>
          <span className="num">{formatInt(day.leafCount)}</span> plans for {formatOperatingDay(day.operatingDay)}, from the Wattness Terminal's public release{" "}
          <code>{day.inputsRelease}</code>, every input named by its SHA-256.
        </>
      ),
      state: past(day.planUnix) ? "done" : "next",
      stateText: past(day.planUnix) ? "Done" : until(day.planUnix - now),
      link: { to: "/fleet", label: "Fleet" },
    },
    {
      id: "seal",
      at: main.blockTime,
      what: `Sealed on ${main.chainName}`,
      detail: (
        <>
          One root over all <span className="num">{formatInt(day.leafCount)}</span> plans in block <span className="num">{formatInt(main.blockNumber)}</span>,{" "}
          <span className="num">{minSec(main.secondsBeforeGate)}</span> before the gate.
          {test && (
            <>
              {" "}
              {test.chainName} followed at <span className="num">{formatInZone(test.blockTime, CENTRAL_TZ, { date: false })}</span> CT.
            </>
          )}{" "}
          From here anyone can check any plan against the chain.
        </>
      ),
      state: past(main.blockTime) ? "sealed" : "next",
      stateText: past(main.blockTime) ? "Sealed" : until(main.blockTime - now),
      link: { to: "/seal", label: "Seal" },
    },
    {
      id: "gate",
      at: day.gateUnix,
      what: "Gate closed",
      detail: (
        <>
          GateRecord refuses any later commit for the day. One simulated <span className="num">{late.secondsAfterGate} s</span> after the gate reverted with{" "}
          <code>AfterGate</code>.
        </>
      ),
      state: past(day.gateUnix) ? "closed" : "next",
      stateText: past(day.gateUnix) ? "Closed" : until(day.gateUnix - now),
      link: { to: "/verify", label: "Verify" },
    },
    {
      id: "run",
      at: run.start,
      to: run.end,
      what: "The operating day",
      detail: <>The day the plans are for: each battery's schedule runs hour by hour at its own settlement point, 00:00 to 24:00 CT.</>,
      state: now < run.start ? "next" : now < run.end ? "running" : "done",
      stateText: now < run.start ? `Starts ${until(run.start - now)}` : now < run.end ? "Running" : "Done",
      link: { to: "/battery", label: "Battery" },
    },
  ];
  if (next.unix > day.gateUnix) {
    events.push({
      id: "next",
      at: next.unix,
      what: "Next gate",
      detail: <>ERCOT's day-ahead market closes for {formatOperatingDay(next.operatingDay)}.</>,
      state: "next",
      stateText: until(next.unix - now),
    });
  }
  events.sort((a, b) => a.at - b.at);
  // Now sits after the last event that has begun.
  const nowAt = events.reduce((i, e, k) => (now >= e.at ? k + 1 : i), 0);
  const nowTime = dualTime(now, { seconds: false });

  return (
    <ol className="tl">
      {events.map((e, i) => (
        <Fragment key={e.id}>
          {i === nowAt && <NowLine ct={nowTime.ct} yours={nowTime.yours} />}
          <li className={`tl__row tl__row--${e.state}`}>
            <When at={e.at} to={e.to} />
            <div className="tl__what">
              <h3 className="tl__title">{e.what}</h3>
              <p className="tl__detail">{e.detail}</p>
            </div>
            <span className={`tl__state tl__state--${e.state}`}>
              {e.state === "sealed" ? <span className="seal-mark" aria-hidden="true" /> : e.state === "done" ? <Glyph name="check" /> : <Glyph name="clock" />}
              {e.stateText}
            </span>
            {e.link ? (
              <Link to={e.link.to} className="tl__go">
                {e.link.label}
                <Glyph name="next" />
              </Link>
            ) : (
              <span className="tl__go" />
            )}
          </li>
        </Fragment>
      ))}
      {nowAt === events.length && <NowLine ct={nowTime.ct} yours={nowTime.yours} />}
    </ol>
  );
}

function NowLine({ ct, yours }: { ct: string; yours: string | null }) {
  return (
    <li className="tl__now" aria-label={`Now: ${ct}${yours ? `, ${yours}` : ""}`}>
      <span className="tl__now-label">
        Now <span className="num">{ct}</span>
        {yours && <span className="muted num"> · {yours}</span>}
      </span>
    </li>
  );
}

function When({ at, to }: { at: number; to?: number }) {
  const t = dualTime(at);
  const date = formatInZone(at, CENTRAL_TZ, { seconds: false }).replace(/, \d\d:\d\d$/, "");
  if (to !== undefined) {
    const end = dualTime(to, { seconds: false });
    const start = dualTime(at, { seconds: false });
    return (
      <div className="tl__when">
        <span className="tl__clock num">00:00–24:00 CT</span>
        <span className="tl__date">{date}</span>
        {start.yours && end.yours && (
          <span className="tl__yours num">
            {start.yours.replace(/ yours$/, "")} to {end.yours}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="tl__when">
      <span className="tl__clock num">{formatInZone(at, CENTRAL_TZ, { date: false })} CT</span>
      <span className="tl__date">{date}</span>
      {t.yours && <span className="tl__yours num">{t.yours}</span>}
    </div>
  );
}
