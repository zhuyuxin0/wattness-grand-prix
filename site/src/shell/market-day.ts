import { CENTRAL_TZ } from "../config";
import { nextGate, zonedInstant } from "../lib/time";

// The day before an Operating Day as ERCOT's Protocols set it: the phases a battery's bids pass through, the moments
// between them, and the two deadlines always running. This is the register wattness.tech's market clock serves: each
// line keeps the Protocols' own sentence (verbatim, ERCOT's 24-hour notation inside quotation marks) and its section.
// The site writes times in labels as it writes them everywhere, 10:00 rather than 1000.
//
// Everything is computed from instants, never from wall-clock arithmetic, so the two days a year Central time changes
// come out right: the long day of 25 hours (its repeated hour is HE02*) and the short day of 23 (it has no HE03).

/** What a battery desk can do in a phase: bids open, clearing, results and DRUC, the Adjustment Period. */
export type Tone = "open" | "clear" | "post" | "adjust";

export interface Phase {
  id: string;
  label: string;
  /** Central wall-clock time on the Day-Ahead, "HH:MM"; "24:00" is the next midnight. */
  start: string;
  end: string;
  /** What ends the phase. */
  next: string;
  /** False where the time is a figure in the Protocols rather than a rule. */
  firm: boolean;
  quote: string;
  source: string;
  tone: Tone;
}

export interface DayEvent {
  id: string;
  label: string;
  at: string;
  firm: boolean;
  quote: string;
  source: string;
}

export const PHASES: readonly Phase[] = [
  {
    id: "dam-offers-due",
    label: "DAM bids and offers due",
    start: "00:00",
    end: "10:00",
    next: "DAM transaction deadline",
    firm: true,
    quote:
      "Submit any Three-Part Supply Offers, Energy Bid/Offer Curves, and Ancillary Service Offers before: (i) 1000 in the Day-Ahead for the Day-Ahead Market (DAM) and Day-Ahead Reliability Unit Commitment (DRUC) being run in that Day-Ahead",
    source: "Protocols §5.4(1)(b), item (i); also §4.4.7.2(1)-(4), §4.4.7.2.1(2), §4.4.9.5(1), §4.4.9.6(1)",
    tone: "open",
  },
  {
    id: "dam-clearing",
    label: "DAM clearing",
    start: "10:00",
    end: "13:30",
    next: "DAM results, no later than 13:30",
    firm: true,
    quote: "At 1000 in the Day-Ahead, ERCOT shall start the Day-Ahead Market (DAM) clearing process.",
    source: "Protocols §4.5.1(1); results bound §4.5.2(1)-(2)",
    tone: "clear",
  },
  {
    id: "dam-results",
    label: "DAM results out",
    start: "13:30",
    end: "14:30",
    next: "updated COP and trades due for DRUC",
    firm: true,
    quote:
      "As soon as practicable, but no later than 1330 in the Day-Ahead, ERCOT shall notify the parties to each cleared DAM transaction (e.g., the buyer and the seller) of the results of the DAM as follows:",
    source: "Protocols §4.5.2(1); COP and trades before 1430: §5.4(1)(c)-(e)",
    tone: "post",
  },
  {
    id: "druc",
    label: "DRUC",
    start: "14:30",
    end: "18:00",
    next: "Adjustment Period opens",
    firm: true,
    quote: "ERCOT shall start the Day-Ahead Reliability Unit Commitment (DRUC) process at 1430 in the Day-Ahead.",
    source: 'Protocols §5.3(1). Results "in the Day-Ahead" (§5.5.3(2)); the §5.2.1 figure ends the DRUC box at 1600',
    tone: "post",
  },
  {
    id: "adjustment-period",
    label: "Adjustment Period",
    start: "18:00",
    end: "24:00",
    next: "the Operating Day begins",
    firm: true,
    quote:
      "Activities for the Adjustment Period begin at 1800 in the Day-Ahead and end one full hour before the start of the Operating Hour.",
    source: 'Protocols §6.3(2); §2.1 "Adjustment Period"',
    tone: "adjust",
  },
];

/** The day-ahead moments between the phases' boundaries. */
export const EVENTS: readonly DayEvent[] = [
  {
    id: "as-plan",
    label: "AS Plan and ASDCs posted",
    at: "06:00",
    firm: true,
    quote: "ERCOT must post the Ancillary Service Plan to the ERCOT website by 0600 of the Day-Ahead.",
    source: "Protocols §4.2.1.1(1); ASDCs §4.2.1.1(6); advisory AS Obligation §4.2.1.2(2)",
  },
  {
    id: "offer-cap-switch",
    label: "AS offers capped at RTSWCAP, not DASWCAP",
    at: "14:30",
    firm: true,
    quote: "No Resource-Specific Ancillary Service Offer received after 1430 in the Day-Ahead may contain a price exceeding the RTSWCAP (in $/MW).",
    source:
      'Protocols §4.4.7.2.1(3); Energy Offer Curves §4.4.9.3.1(2). For an ESR Energy Bid/Offer Curve §4.4.9.7.1(2) says only "depending on the timing of the submission"',
  },
  {
    id: "druc-results",
    label: "DRUC results, about 16:00",
    at: "16:00",
    firm: false,
    quote:
      "ERCOT shall notify each QSE in the Day-Ahead of the DRUC Resource commitments and advisory decommitments that have been cleared by the RUC for the Resources that QSE represents.",
    source: "Protocols §5.5.3(2) gives no time; 1600 is the §5.2.1 RUC Timeline Summary figure only",
  },
  {
    id: "dam-abort-bound",
    label: "DAM may be aborted if not run by 19:00",
    at: "19:00",
    firm: true,
    quote:
      "If ERCOT is unable to execute the Day-Ahead process prior to 1900 in the Day-Ahead, ERCOT may abort all or part of the Day-Ahead process and require all schedules and trades to be submitted in the Adjustment Period.",
    source: "Protocols §4.1.2(5)",
  },
];

/** The real-time lane's rule behind the adjustments line: each Operating Hour's window closes an hour before it starts. */
export const ADJUSTMENT_CLOSE = {
  quote:
    "Adjustment Period — For each Operating Hour, the time between 1800 in the Day-Ahead up to the start of the hour before that Operating Hour.",
  source: 'Protocols §2.1 "Adjustment Period"; §6.3(2)',
} as const;

export const EDITION = "ERCOT Nodal Protocols, August 28, 2026";
export const TIME_BASIS =
  "Any reference to time is to Central Prevailing Time; the 24-hour clock is used unless otherwise noted. (Protocols §1.7(2)(p))";

export type MomentState = "passed" | "now" | "ahead";

/** A row of the day's list: a phase at its start, or an event. */
export interface Moment {
  key: string;
  kind: "phase" | "event";
  /** Central wall-clock time, "HH:MM". */
  at: string;
  /** Unix seconds. */
  unix: number;
  label: string;
  firm: boolean;
  quote: string;
  source: string;
  /** The source's first reference, which the list shows; the whole source goes with the quotation. */
  cite: string;
  tone: Tone | null;
  /** A phase is now while it runs; an event has passed from its minute on. */
  state: MomentState;
}

export interface Segment {
  id: string;
  label: string;
  tone: Tone;
  start: string;
  end: string;
  /** Its place in the day's real length, 0..1. */
  from: number;
  to: number;
  current: boolean;
}

export interface Tick {
  at: string;
  x: number;
  /** Alternate rows, so boundaries an hour apart never print over each other. */
  low: boolean;
}

export interface MarketDay {
  /** The start of the current minute, unix seconds: what has passed and what runs hold until the next one. */
  now: number;
  /** The CT date now falls on (the Day-Ahead), YYYY-MM-DD. */
  day: string;
  /** The Operating Day the Day-Ahead's phases are for: the next CT date. */
  operatingDay: string;
  /** The Day-Ahead's real length, 23, 24 or 25 hours, and where now falls in it, 0..1. */
  hours: number;
  x: number;
  phase: {
    id: string;
    label: string;
    tone: Tone;
    next: string;
    end: string;
    /** Unix seconds the phase ends, and the seconds left to it from the clock's second. */
    until: number;
    left: number;
    /** True while the phase ends at the DAM deadline, which carries the one countdown. */
    atDeadline: boolean;
  };
  segments: Segment[];
  ticks: Tick[];
  moments: Moment[];
  /**
   * The next DAM transaction deadline (the site's gate), the Operating Day it closes bids for, and the seconds left to
   * it from the clock's second: the gate tag's countdown.
   */
  deadline: { unix: number; operatingDay: string; left: number };
  /** The next Adjustment Period close: at the top of the hour, for the Operating Hour that starts an hour later. */
  adjustment: {
    /** Unix seconds, and the seconds left to it from the clock's second. */
    closes: number;
    left: number;
    /** The hour it closes for, "HE11", and its CT date when that is not today's. */
    hour: string;
    day: string | null;
    /** The Operating Hour now running. */
    current: string;
  };
}

const HOUR = 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");

interface Ymd {
  y: number;
  m: number;
  d: number;
}

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: CENTRAL_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
});

/** The CT date and hour at an instant. */
function central(ms: number): Ymd & { hour: number } {
  const p: Record<string, number> = {};
  for (const part of partsFmt.formatToParts(new Date(ms))) if (part.type !== "literal") p[part.type] = Number(part.value);
  return { y: p.year!, m: p.month!, d: p.day!, hour: p.hour! };
}

function shift({ y, m, d }: Ymd, n: number): Ymd {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

const isoDay = ({ y, m, d }: Ymd) => `${y}-${pad(m)}-${pad(d)}`;

function parseDay(day: string): Ymd {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

/** The instant (ms) a CT wall-clock time happens on a CT date; "24:00" is the next date's midnight. */
function at(day: Ymd, hhmm: string): number {
  const [h, mi] = hhmm.split(":").map(Number) as [number, number];
  if (h === 24) {
    const n = shift(day, 1);
    return zonedInstant(CENTRAL_TZ, n.y, n.m, n.d, 0, mi);
  }
  return zonedInstant(CENTRAL_TZ, day.y, day.m, day.d, h, mi);
}

/**
 * ERCOT's hour-ending labels for a CT date, in order: 24 of them, 23 on the spring change (no 03), 25 on the fall
 * change, whose repeated hour ERCOT's reports mark 02*.
 */
export function hourLabels(day: string): string[] {
  const ymd = parseDay(day);
  const start = at(ymd, "00:00");
  const n = Math.round((at(ymd, "24:00") - start) / HOUR);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const label = pad(central(start + i * HOUR).hour + 1);
    out.push(out.includes(label) ? `${label}*` : label);
  }
  return out;
}

/** The hour-ending label of the Operating Hour that starts at or runs through an instant, and its CT date. */
function operatingHour(ms: number): { label: string; day: string } {
  const c = central(ms);
  const day = isoDay(c);
  const labels = hourLabels(day);
  const i = Math.floor((ms - at(c, "00:00")) / HOUR);
  return { label: `HE${labels[Math.min(i, labels.length - 1)]}`, day };
}

/** A time left in whole hours and minutes, rounded down, as a countdown reads: 01:08:24 is 1 h 08 min. */
function hoursMinutes(seconds: number): { h: number; m: number } {
  const s = Math.max(0, Math.floor(seconds));
  return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) };
}

/** "1 h 08 min", "9 min", and "< 1 min" in the last minute: never more than is left, never 0 min before the moment. */
export function leftText(seconds: number): string {
  const { h, m } = hoursMinutes(seconds);
  if (h) return `${h} h ${pad(m)} min`;
  return m ? `${m} min` : "< 1 min";
}

/** The same time in words, for a control's spoken name: "1 hour 8 minutes", "less than a minute". */
export function leftWords(seconds: number): string {
  const { h, m } = hoursMinutes(seconds);
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (!h) return m ? unit(m, "minute") : "less than a minute";
  return m ? `${unit(h, "hour")} ${unit(m, "minute")}` : unit(h, "hour");
}

const cite = (source: string) => source.split(/; |\. /)[0]!.trim();

/**
 * The market day at an instant (unix ms). What has passed and what runs hold for the minute. Each time left counts from
 * the clock's second, as the masthead's clock and gate tag show it, so the panel's minutes are the tag's rounded down.
 */
export function marketDayAt(nowMs: number): MarketDay {
  const t = Math.floor(nowMs / 60_000) * 60_000;
  const second = Math.floor(nowMs / 1000);
  const c = central(t);
  const today: Ymd = { y: c.y, m: c.m, d: c.d };
  const start = at(today, "00:00");
  const end = at(today, "24:00");
  const place = (ms: number) => (ms - start) / (end - start);

  const spans = PHASES.map((p) => ({ p, from: at(today, p.start), to: at(today, p.end) }));
  const current = spans.find((s) => s.from <= t && t < s.to) ?? spans[0]!;

  const gate = nextGate(t);
  const deadline = { unix: gate.unix, operatingDay: gate.operatingDay, left: gate.unix - second };

  const moments: Moment[] = [
    ...spans.map(
      ({ p, from, to }): Moment => ({
        key: p.id,
        kind: "phase",
        at: p.start,
        unix: from / 1000,
        label: p.label,
        firm: p.firm,
        quote: p.quote,
        source: p.source,
        cite: cite(p.source),
        tone: p.tone,
        state: to <= t ? "passed" : from <= t ? "now" : "ahead",
      }),
    ),
    ...EVENTS.map((e): Moment => {
      const when = at(today, e.at);
      return {
        key: e.id,
        kind: "event",
        at: e.at,
        unix: when / 1000,
        label: e.label,
        firm: e.firm,
        quote: e.quote,
        source: e.source,
        cite: cite(e.source),
        tone: null,
        state: when <= t ? "passed" : "ahead",
      };
    }),
    // A stable sort: at the same minute the phase lists before the event (14:30, DRUC, then the offer cap).
  ].sort((a, b) => a.unix - b.unix);

  // CT keeps whole-hour offsets, so the top of the next clock hour is a whole number of hours from midnight.
  const top = start + (Math.floor((t - start) / HOUR) + 1) * HOUR;
  const after = operatingHour(top + HOUR);

  return {
    now: t / 1000,
    day: isoDay(today),
    operatingDay: isoDay(shift(today, 1)),
    hours: Math.round((end - start) / HOUR),
    x: place(t),
    phase: {
      id: current.p.id,
      label: current.p.label,
      tone: current.p.tone,
      next: current.p.next,
      end: current.p.end,
      until: current.to / 1000,
      left: current.to / 1000 - second,
      atDeadline: current.to / 1000 === deadline.unix,
    },
    segments: spans.map(({ p, from, to }) => ({
      id: p.id,
      label: p.label,
      tone: p.tone,
      start: p.start,
      end: p.end,
      from: place(from),
      to: place(to),
      current: p.id === current.p.id,
    })),
    ticks: [...new Set([...PHASES.map((p) => p.start), "24:00"])].map((hhmm, i) => ({ at: hhmm, x: place(at(today, hhmm)), low: i % 2 === 1 })),
    moments,
    deadline,
    adjustment: {
      closes: top / 1000,
      left: top / 1000 - second,
      hour: after.label,
      day: after.day === isoDay(today) ? null : after.day,
      current: operatingHour(t).label,
    },
  };
}

/**
 * The instant to draw the market day for at `nowMs`. What the panel shows changes twice a minute and never between: a
 * moment passes on its minute, and every time left (to a whole minute, from the clock's second) drops a minute one
 * second later. So a minute's first second is drawn at its start and the rest of it one second in, and the panel
 * redraws on those two seconds rather than on every tick.
 */
export function shownAt(nowMs: number): number {
  const second = Math.floor(nowMs / 1000);
  const minute = Math.floor(second / 60) * 60;
  return (second === minute ? minute : minute + 1) * 1000;
}
