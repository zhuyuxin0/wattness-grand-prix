import { CENTRAL_TZ } from "../config";
import { zonedInstant } from "../lib/time";

// The market clock, as wattness.tech's masthead draws it (wattness-site apps/mms/src/ui/clock.tsx): Central time with
// the reader's own beside it, the phase tomorrow's Operating Day is in, the next DAM deadline, and today's Operating Hour
// with the Adjustment Period's next close. The register is the one wattness.tech serves at /api/market-clock
// (wattness.iso.ercot_cadence in the desk): each line keeps its label, ERCOT's sentence verbatim and its section, word
// for word as wattness.tech shows them. Here the browser computes every time itself, with no network.
//
// Everything is computed from instants, never from wall-clock arithmetic, so the two days a year Central time changes
// come out right: the long day of 25 hours (its repeated hour is HE2R, ERCOT's token, as wattness.tech's clock writes
// it) and the short day of 23 (it has no HE03).

/** The tag's color: what a battery desk can do in the phase, not its name (clock.tsx's tone). */
export type Tone = "open" | "near" | "urgent" | "clear" | "post" | "adj";

export interface Phase {
  id: string;
  label: string;
  /** Central wall-clock time on the Day-Ahead, "HH:MM"; "24:00" is the next midnight. */
  start: string;
  end: string;
  /** What the countdown counts to, at `end`. */
  next: string;
  /** False where the source is a figure or "approximately". */
  firm: boolean;
  quote: string;
  source: string;
}

export interface DayEvent {
  id: string;
  label: string;
  at: string;
  firm: boolean;
  quote: string;
  source: string;
}

/** The day before an Operating Day, midnight to midnight, no gaps. */
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
  },
  {
    id: "dam-clearing",
    label: "DAM clearing",
    start: "10:00",
    end: "13:30",
    next: "DAM results, no later than 1330",
    firm: true,
    quote: "At 1000 in the Day-Ahead, ERCOT shall start the Day-Ahead Market (DAM) clearing process.",
    source: "Protocols §4.5.1(1); results bound §4.5.2(1)-(2)",
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
  },
];

/** The day-ahead instants the day's list names between the phases' boundaries. */
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
    label: "DRUC results, about 1600",
    at: "16:00",
    firm: false,
    quote:
      "ERCOT shall notify each QSE in the Day-Ahead of the DRUC Resource commitments and advisory decommitments that have been cleared by the RUC for the Resources that QSE represents.",
    source: "Protocols §5.5.3(2) gives no time; 1600 is the §5.2.1 RUC Timeline Summary figure only",
  },
  {
    id: "dam-abort-bound",
    label: "DAM may be aborted if not run by 1900",
    at: "19:00",
    firm: true,
    quote:
      "If ERCOT is unable to execute the Day-Ahead process prior to 1900 in the Day-Ahead, ERCOT may abort all or part of the Day-Ahead process and require all schedules and trades to be submitted in the Adjustment Period.",
    source: "Protocols §4.1.2(5)",
  },
];

/** The real-time lane's rules, which the Operating Hour's tag quotes in its title. */
export const REAL_TIME = {
  adjustmentClose: {
    label: "Adjustment Period closes for the hour after next",
    quote:
      "Adjustment Period — For each Operating Hour, the time between 1800 in the Day-Ahead up to the start of the hour before that Operating Hour.",
    source: 'Protocols §2.1 "Adjustment Period"; §6.3(2)',
  },
  bidOfferToSced: {
    label: "Energy Bid/Offer Curve open to each SCED run",
    quote:
      "In the RTM, a QSE may submit or change an Energy Bid/Offer Curve at any time prior to SCED execution, and SCED will use the latest updated Energy Bid/Offer Curve available in the system.",
    source: "Protocols §4.4.9.7(5); AS Offers the same, §6.4.9.1(2)",
  },
  sced: {
    label: "SCED, about every five minutes",
    quote:
      "The SCED process is designed to simultaneously manage energy, Ancillary Services, the system power balance and network congestion through Resource Base Points, Ancillary Service awards, and the calculation of LMPs and Real-Time MCPCs approximately every five minutes, or more frequently if necessary.",
    source: "Protocols §6.5.7.3(1)",
  },
  statusCheck: {
    label: "COP status checked against telemetry",
    quote:
      "Five minutes before the end of each hour, ERCOT shall identify inconsistencies between the telemetered Resource Status and the Resource Status stated in the COP for that Resource in the next hour.",
    source: "Protocols §6.4.6(2)(b)",
  },
} as const;

export const EDITION = "ERCOT Nodal Protocols, August 28, 2026";
export const TIME_BASIS =
  "Any reference to time is to Central Prevailing Time; the 24-hour clock is used unless otherwise noted. (Protocols §1.7(2)(p))";

/** A row of the day's list: a phase at its start, or an event. */
export interface Row {
  key: string;
  /** Central wall-clock time, "HH:MM". */
  at: string;
  /** Unix ms. */
  ms: number;
  label: string;
  firm: boolean;
  quote: string;
  source: string;
  /** What the row's reference column shows: the source up to its first semicolon, as wattness.tech's list does. */
  cite: string;
  /** A phase's color, or null for an event (a hollow mark). */
  tone: Tone | null;
  /** From the row's minute on. */
  passed: boolean;
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
}

export interface Tick {
  at: string;
  x: number;
  /** Alternate rows, so boundaries an hour apart never print over each other. */
  low: boolean;
}

export interface MarketClockState {
  /** Unix ms the state is for. */
  now: number;
  /** Central wall time, "11:40:07". */
  wall: string;
  /** The CT date now falls on (the Day-Ahead), YYYY-MM-DD and "Nov 26". */
  day: string;
  dayShort: string;
  /** The Operating Day the Day-Ahead's phases are for (the next CT date), YYYY-MM-DD and "Nov 27". */
  operatingDay: string;
  operatingDayShort: string;
  /** The Day-Ahead's real length, 23, 24 or 25 hours, and where now falls in it, 0..1 (held to the minute). */
  hours: number;
  x: number;
  phase: Phase & {
    tone: Tone;
    /** Unix ms the phase ends, and the ms left to it. */
    until: number;
    left: number;
    /** While offers are due the phase ends at the DAM deadline, which keeps the one countdown. */
    atDeadline: boolean;
  };
  /** The next DAM transaction deadline, the Operating Day it is for, the ms left, and how near it is. */
  deadline: { at: number; operatingDay: string; operatingDayShort: string; left: number; urgency: "" | "near" | "urgent" };
  /** Today's Operating Hour token, "12" (or "2R", the long day's repeated hour). */
  he: string;
  /** The next Adjustment Period close: at the top of the clock hour, for the Operating Hour that starts an hour later. */
  adjustment: { at: number; left: number; he: string; dayShort: string; sameDay: boolean; topHH: string };
  segments: Segment[];
  ticks: Tick[];
  rows: Row[];
}

const HOUR = 3_600_000;
const MINUTE = 60_000;
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
  minute: "2-digit",
  second: "2-digit",
});

/** The CT date and time at an instant. */
function central(ms: number): Ymd & { H: number; M: number; S: number } {
  const p: Record<string, number> = {};
  for (const part of partsFmt.formatToParts(new Date(ms))) if (part.type !== "literal") p[part.type] = Number(part.value);
  return { y: p.year!, m: p.month!, d: p.day!, H: p.hour!, M: p.minute!, S: p.second! };
}

function shift({ y, m, d }: Ymd, n: number): Ymd {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

const isoDay = ({ y, m, d }: Ymd) => `${y}-${pad(m)}-${pad(d)}`;

const shortFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** "Nov 27", as wattness.tech's clock names a day. */
export const shortDay = ({ y, m, d }: Ymd): string => shortFmt.format(new Date(Date.UTC(y, m - 1, d)));

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
 * ERCOT's hour tokens for a CT date, in order, as wattness.tech's clock reads them (lib/hours.ts hourTokens): 24 of
 * them, 23 on the spring change (no 03), 25 on the fall change, whose repeated hour is 2R (never 02R).
 */
export function hourTokens(day: string): string[] {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const start = at({ y, m, d }, "00:00");
  const n = Math.round((at({ y, m, d }, "24:00") - start) / HOUR);
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const h = central(start + i * HOUR).H;
    const plain = pad(h + 1);
    if (seen.has(plain)) out.push(`${h + 1}R`);
    else {
      seen.add(plain);
      out.push(plain);
    }
  }
  return out;
}

/** The Operating Hour token for the hour that starts at or runs through an instant, and its CT date. */
function operatingHour(ms: number): { he: string; day: Ymd } {
  const c = central(ms);
  const tokens = hourTokens(isoDay(c));
  const i = Math.floor((ms - at(c, "00:00")) / HOUR);
  return { he: tokens[Math.min(i, tokens.length - 1)]!, day: c };
}

/**
 * Time left as wattness.tech's clock writes it, rounded down to the second: "22h 19m" from an hour up (the minutes
 * rounded down), "19:53" under it, "00:00" once it is reached.
 */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  return h > 0 ? `${h}h ${pad(Math.floor((s % 3600) / 60))}m` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

/** The tag's color while offers are due follows the deadline: open, then near in its last hour, urgent in its last 15 minutes. */
export function tone(id: string, msToDeadline: number): Tone {
  if (id === "dam-offers-due") {
    if (msToDeadline < 15 * MINUTE) return "urgent";
    if (msToDeadline < 60 * MINUTE) return "near";
    return "open";
  }
  if (id === "dam-clearing") return "clear";
  if (id === "adjustment-period") return "adj";
  return "post";
}

/** The deadline's own countdown turns caution, then bad, on the same bounds. */
function urgency(msToDeadline: number): "" | "near" | "urgent" {
  if (msToDeadline < 15 * MINUTE) return "urgent";
  if (msToDeadline < 60 * MINUTE) return "near";
  return "";
}

/** "the source up to its first semicolon": what wattness.tech's list prints in its reference column. */
export const cite = (source: string): string => source.split(";")[0]!;

const readerFmt = new Map<string, Intl.DateTimeFormat>();
/** A time on the reader's own clock, "00:40", as wattness.tech writes "yours". Undefined: the browser's zone. */
export function readerTime(ms: number, timeZone?: string): string {
  const key = timeZone ?? "";
  let f = readerFmt.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(timeZone ? { timeZone } : {}) });
    readerFmt.set(key, f);
  }
  return f.format(new Date(ms));
}

/** "10:00" from "10:00", and "00:00" for the next midnight, as the tag's title names a phase's end. */
export const endTime = (hhmm: string): string => (hhmm === "24:00" ? "00:00" : hhmm);

/**
 * The market clock at an instant (unix ms), computed as wattness.tech's clock computes it: the phase and the list's
 * passed rows hold for the minute; every time left counts the milliseconds to its moment, rounded down by countdown().
 */
export function marketClockAt(now: number): MarketClockState {
  const t = Math.floor(now / MINUTE) * MINUTE;
  const c = central(now);
  const today: Ymd = { y: c.y, m: c.m, d: c.d };
  const tomorrow = shift(today, 1);
  const start = at(today, "00:00");
  const end = at(today, "24:00");
  const place = (ms: number) => (ms - start) / (end - start);

  const spans = PHASES.map((p) => ({ p, from: at(today, p.start), to: at(today, p.end) }));
  const current = spans.find((s) => s.from <= t && t < s.to) ?? spans[0]!;

  // The DAM transaction deadline that is next, and the Operating Day it is for.
  const deadlineHHMM = PHASES[0]!.end;
  const todayDeadline = at(today, deadlineHHMM);
  const beforeToday = now < todayDeadline;
  const deadlineAt = beforeToday ? todayDeadline : at(tomorrow, deadlineHHMM);
  const forDay = beforeToday ? tomorrow : shift(today, 2);
  const toDeadline = deadlineAt - now;

  // Today's Operating Hour, and the Adjustment Period's close at the top of this clock hour for the Operating Hour that
  // starts one hour later (§2.1). Central time keeps whole-hour offsets, so the top is a whole number of hours from midnight.
  const idx = Math.floor((now - start) / HOUR);
  const tokens = hourTokens(isoDay(today));
  const he = tokens[Math.min(idx, tokens.length - 1)]!;
  const top = start + (idx + 1) * HOUR;
  const closesFor = operatingHour(top + HOUR);

  const rows: Row[] = [
    ...spans.map(
      ({ p, from }): Row => ({
        key: p.id,
        at: p.start,
        ms: from,
        label: p.label,
        firm: p.firm,
        quote: p.quote,
        source: p.source,
        cite: cite(p.source),
        tone: tone(p.id, Infinity),
        passed: from <= t,
      }),
    ),
    ...EVENTS.map((e): Row => {
      const when = at(today, e.at);
      return {
        key: e.id,
        at: e.at,
        ms: when,
        label: e.label,
        firm: e.firm,
        quote: e.quote,
        source: e.source,
        cite: cite(e.source),
        tone: null,
        passed: when <= t,
      };
    }),
    // A stable sort: at the same minute the phase lists before the event (14:30, DRUC, then the offer cap).
  ].sort((a, b) => a.ms - b.ms);

  return {
    now,
    wall: `${pad(c.H)}:${pad(c.M)}:${pad(c.S)}`,
    day: isoDay(today),
    dayShort: shortDay(today),
    operatingDay: isoDay(tomorrow),
    operatingDayShort: shortDay(tomorrow),
    hours: Math.round((end - start) / HOUR),
    x: place(t),
    phase: {
      ...current.p,
      tone: tone(current.p.id, toDeadline),
      until: current.to,
      left: current.to - now,
      atDeadline: current.to === deadlineAt,
    },
    deadline: { at: deadlineAt, operatingDay: isoDay(forDay), operatingDayShort: shortDay(forDay), left: toDeadline, urgency: urgency(toDeadline) },
    he,
    adjustment: {
      at: top,
      left: top - now,
      he: closesFor.he,
      dayShort: shortDay(closesFor.day),
      sameDay: closesFor.day.d === today.d,
      topHH: pad(central(top).H),
    },
    segments: spans.map(({ p, from, to }) => ({
      id: p.id,
      label: p.label,
      tone: tone(p.id, Infinity),
      start: p.start,
      end: p.end,
      from: place(from),
      to: place(to),
    })),
    ticks: [...new Set([...PHASES.map((p) => p.start), "24:00"])].map((hhmm, i) => ({ at: hhmm, x: place(at(today, hhmm)), low: i % 2 === 1 })),
    rows,
  };
}

/** The segments that carry their name on the strip: those of at least 12% of the day, as on wattness.tech. */
export const LABELED_SHARE = 0.12;
