// The masthead's market clock and its day, as wattness.tech computes them (wattness-site apps/mms/src/ui/clock.tsx):
// the phase and its color, the countdowns and their rounding, the DAM deadline and the Operating Day it is for, the
// Adjustment Period's next close, the day's rows, and the two days a year Central time changes. Run with `pnpm test`
// (Node 22.18 or later runs the TypeScript modules directly; the hook below adds the ".ts" that Vite resolves on its own).

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (!/^\.\.?\//.test(specifier) || /\.[cm]?[jt]sx?$/.test(specifier)) throw error;
      return next(`${specifier}.ts`, context);
    }
  },
});

const { EVENTS, PHASES, cite, countdown, endTime, hourTokens, marketClockAt, readerTime, tone } = await import("../src/shell/market-day.ts");
const { formatInZone, nextGate } = await import("../src/lib/time.ts");

const ms = (iso) => Date.parse(iso);
const passed = (s) => Object.fromEntries(s.rows.map((r) => [r.key, r.passed ? "passed" : "ahead"]));
const hhmm = (t, zone) => formatInZone(Math.floor(t / 1000), zone, { date: false, seconds: false });

/** The masthead's three items after the wall time, in wattness.tech's words. */
function items(s) {
  return {
    tag: `${s.phase.label} · ${s.operatingDayShort}${s.phase.atDeadline ? "" : ` · ${countdown(s.phase.left)} left`}`,
    tone: s.phase.tone,
    dead: `DAM deadline ${countdown(s.deadline.left)}`,
    rt: `HE${s.he} · adjustments for HE${s.adjustment.he} close in ${countdown(s.adjustment.left)}`,
  };
}

test("the register is wattness.tech's, word for word: 00:00 to 24:00 without a gap, each line with its Protocols section", () => {
  assert.equal(PHASES[0].start, "00:00");
  assert.equal(PHASES.at(-1).end, "24:00");
  for (let i = 1; i < PHASES.length; i++) assert.equal(PHASES[i].start, PHASES[i - 1].end, `${PHASES[i].id} starts where ${PHASES[i - 1].id} ends`);
  for (const line of [...PHASES, ...EVENTS]) {
    assert.match(line.source, /^Protocols §/, `${line.id} cites the Protocols`);
    assert.ok(line.quote.length > 40, `${line.id} carries the Protocols' sentence`);
  }
  assert.deepEqual(
    PHASES.map((p) => p.label),
    ["DAM bids and offers due", "DAM clearing", "DAM results out", "DRUC", "Adjustment Period"],
  );
  assert.deepEqual(
    EVENTS.map((e) => e.label),
    ["AS Plan and ASDCs posted", "AS offers capped at RTSWCAP, not DASWCAP", "DRUC results, about 1600", "DAM may be aborted if not run by 1900"],
    "the labels keep ERCOT's own notation, as wattness.tech's list prints them",
  );
  assert.equal(PHASES[1].next, "DAM results, no later than 1330");
  assert.deepEqual(
    EVENTS.filter((e) => !e.firm).map((e) => e.id),
    ["druc-results"],
    "only DRUC results' 16:00 is a figure rather than a rule",
  );
  assert.equal(endTime("24:00"), "00:00");
  assert.equal(endTime("13:30"), "13:30");
});

test("11:40:07 CT on Nov 26, Jo's reference: DAM clearing in ink, the deadline for the 28th, HE12 and HE14's close", () => {
  const t = ms("2026-11-26T17:40:07Z");
  const s = marketClockAt(t);
  assert.equal(s.wall, "11:40:07");
  assert.equal(readerTime(t, "Asia/Bangkok"), "00:40", "the reader's own clock beside it");
  assert.equal(s.day, "2026-11-26");
  assert.equal(s.dayShort, "Nov 26");
  assert.equal(s.operatingDay, "2026-11-27");
  assert.deepEqual(items(s), {
    tag: "DAM clearing · Nov 27 · 1h 49m left",
    tone: "clear",
    dead: "DAM deadline 22h 19m",
    rt: "HE12 · adjustments for HE14 close in 19:53",
  });
  assert.equal(s.deadline.operatingDay, "2026-11-28");
  assert.equal(s.deadline.operatingDayShort, "Nov 28");
  assert.equal(s.deadline.urgency, "");
  assert.equal(hhmm(s.deadline.at, "America/Chicago"), "10:00");
  assert.equal(readerTime(s.deadline.at, "Asia/Bangkok"), "23:00");
  assert.deepEqual([s.adjustment.topHH, s.adjustment.sameDay, readerTime(s.adjustment.at, "Asia/Bangkok")], ["12", true, "01:00"]);
  assert.equal(s.x, (11 * 60 + 40) / 1440, "the now line held to the minute");
  assert.deepEqual(passed(s), {
    "dam-offers-due": "passed",
    "as-plan": "passed",
    "dam-clearing": "passed",
    "dam-results": "ahead",
    druc: "ahead",
    "offer-cap-switch": "ahead",
    "druc-results": "ahead",
    "adjustment-period": "ahead",
    "dam-abort-bound": "ahead",
  });
  assert.deepEqual(
    s.rows.map((r) => `${r.at} ${r.key}`),
    [
      "00:00 dam-offers-due",
      "06:00 as-plan",
      "10:00 dam-clearing",
      "13:30 dam-results",
      "14:30 druc",
      "14:30 offer-cap-switch",
      "16:00 druc-results",
      "18:00 adjustment-period",
      "19:00 dam-abort-bound",
    ],
    "the day's rows in order, the phase before the event at 14:30",
  );
  assert.deepEqual(
    s.rows.map((r) => r.cite),
    [
      "Protocols §5.4(1)(b), item (i)",
      "Protocols §4.2.1.1(1)",
      "Protocols §4.5.1(1)",
      "Protocols §4.5.2(1)",
      'Protocols §5.3(1). Results "in the Day-Ahead" (§5.5.3(2))',
      "Protocols §4.4.7.2.1(3)",
      "Protocols §5.5.3(2) gives no time",
      "Protocols §6.3(2)",
      "Protocols §4.1.2(5)",
    ],
    "each row's reference runs to its source's first semicolon, as wattness.tech's list prints it",
  );
  assert.deepEqual(
    s.rows.map((r) => r.tone),
    ["open", null, "clear", "post", "post", null, null, "adj", null],
    "a phase's swatch is its color with the whole day ahead; an event's is a ring",
  );
  assert.deepEqual(
    s.segments.map((g) => [g.id, g.tone, g.from, g.to]),
    [
      ["dam-offers-due", "open", 0, 600 / 1440],
      ["dam-clearing", "clear", 600 / 1440, 810 / 1440],
      ["dam-results", "post", 810 / 1440, 870 / 1440],
      ["druc", "post", 870 / 1440, 1080 / 1440],
      ["adjustment-period", "adj", 1080 / 1440, 1],
    ],
  );
  assert.deepEqual(
    s.ticks.map((k) => [k.at, k.low]),
    [["00:00", false], ["10:00", true], ["13:30", false], ["14:30", true], ["18:00", false], ["24:00", true]],
  );
});

test("08:51:36 CT: bids for the 27th are due, and the deadline alone carries the countdown", () => {
  const s = marketClockAt(ms("2026-11-26T14:51:36Z"));
  assert.equal(s.phase.id, "dam-offers-due");
  assert.equal(s.phase.atDeadline, true, "the phase ends at the deadline, so its tag drops the time left");
  assert.deepEqual(items(s), {
    tag: "DAM bids and offers due · Nov 27",
    tone: "open",
    dead: "DAM deadline 1h 08m",
    rt: "HE09 · adjustments for HE11 close in 08:24",
  });
  assert.equal(s.deadline.operatingDayShort, "Nov 27");
  assert.equal(passed(s)["as-plan"], "passed");
  assert.equal(passed(s)["dam-offers-due"], "passed", "a phase reads passed from its start, as wattness.tech's list has it");
  assert.equal(passed(s)["dam-clearing"], "ahead");
});

test("the phase's color through the day, and the deadline's last hour", () => {
  const at = (iso) => marketClockAt(ms(iso));
  const cases = [
    // [instant, CT, the tag's tone, the deadline's countdown, its urgency]
    ["2026-11-26T06:00:30Z", "00:00", "open", "9h 59m", ""],
    ["2026-11-26T15:00:01Z", "09:00", "near", "59:59", "near"],
    ["2026-11-26T15:15:00Z", "09:15", "near", "45:00", "near"],
    ["2026-11-26T15:45:00Z", "09:45", "near", "15:00", "near"],
    ["2026-11-26T15:45:01Z", "09:45", "urgent", "14:59", "urgent"],
    ["2026-11-26T15:59:30Z", "09:59", "urgent", "00:30", "urgent"],
    ["2026-11-26T16:00:00Z", "10:00", "clear", "24h 00m", ""],
    ["2026-11-26T19:30:00Z", "13:30", "post", "20h 30m", ""],
    ["2026-11-26T21:40:00Z", "15:40", "post", "18h 20m", ""],
    ["2026-11-27T00:00:00Z", "18:00", "adj", "16h 00m", ""],
    ["2026-11-27T03:30:00Z", "21:30", "adj", "12h 30m", ""],
  ];
  for (const [iso, ct, expected, dead, urgency] of cases) {
    const s = at(iso);
    assert.equal(hhmm(ms(iso), "America/Chicago"), ct);
    assert.equal(s.phase.tone, expected, `the tag's color at ${ct} CT`);
    assert.equal(countdown(s.deadline.left), dead, `the DAM deadline at ${iso}`);
    assert.equal(s.deadline.urgency, urgency, `the deadline's urgency at ${iso}`);
  }
  // 09:45:00 exactly is 15 minutes out: the tag turns bad below 15 minutes, as the countdown's color does.
  assert.equal(tone("dam-offers-due", 15 * 60_000), "near");
  assert.equal(tone("dam-offers-due", 15 * 60_000 - 1), "urgent");
  assert.equal(tone("dam-offers-due", 60 * 60_000), "open");
  assert.equal(tone("dam-offers-due", 60 * 60_000 - 1), "near");
  assert.equal(tone("dam-offers-due", Infinity), "open");
  assert.deepEqual(["dam-clearing", "dam-results", "druc", "adjustment-period"].map((id) => tone(id, 0)), ["clear", "post", "post", "adj"]);
  assert.equal(marketClockAt(ms("2026-11-26T15:45:00Z")).phase.tone, "near", "09:45:00 CT, 15:00 left");
});

test("15:40 and 21:30 CT: DRUC, then the Adjustment Period, each with its time left", () => {
  assert.deepEqual(items(marketClockAt(ms("2026-11-26T21:40:00Z"))), {
    tag: "DRUC · Nov 27 · 2h 20m left",
    tone: "post",
    dead: "DAM deadline 18h 20m",
    rt: "HE16 · adjustments for HE18 close in 20:00",
  });
  const late = marketClockAt(ms("2026-11-27T03:30:00Z"));
  assert.deepEqual(items(late), {
    tag: "Adjustment Period · Nov 27 · 2h 30m left",
    tone: "adj",
    dead: "DAM deadline 12h 30m",
    rt: "HE22 · adjustments for HE24 close in 30:00",
  });
  assert.equal(late.deadline.operatingDayShort, "Nov 28");
  assert.ok(late.rows.every((r) => r.passed), "by 21:30 every row has passed, the running Adjustment Period with them");
});

test("late evening: the next close is for the next day's second hour, named with its day", () => {
  const s = marketClockAt(ms("2026-11-27T05:30:00Z")); // 23:30 CT on the 26th
  assert.equal(s.phase.id, "adjustment-period");
  assert.equal(countdown(s.phase.left), "30:00");
  assert.equal(s.he, "24");
  assert.deepEqual([s.adjustment.he, s.adjustment.sameDay, s.adjustment.dayShort, s.adjustment.topHH], ["02", false, "Nov 27", "00"]);
  assert.equal(countdown(s.adjustment.left), "30:00");
  assert.equal(endTime(s.phase.end), "00:00", "the tag's title names the phase's end as the next midnight");
});

test("a phase starts and a row passes on its minute, not a second before", () => {
  const before = marketClockAt(ms("2026-11-26T15:59:59.999Z"));
  assert.equal(before.phase.id, "dam-offers-due");
  assert.equal(passed(before)["dam-clearing"], "ahead");
  assert.equal(countdown(before.deadline.left), "00:00", "rounded down, as wattness.tech's countdown is");
  assert.equal(before.deadline.operatingDay, "2026-11-27");
  assert.deepEqual([before.he, before.adjustment.he], ["10", "12"]);

  const at = marketClockAt(ms("2026-11-26T16:00:00Z"));
  assert.equal(at.phase.id, "dam-clearing");
  assert.equal(at.phase.atDeadline, false);
  assert.equal(countdown(at.phase.left), "3h 30m");
  assert.equal(passed(at)["dam-clearing"], "passed");
  assert.equal(at.operatingDay, "2026-11-27", "the phases are still the 27th's");
  assert.equal(at.deadline.operatingDay, "2026-11-28", "the next deadline is tomorrow's, for the 28th");
  assert.equal(countdown(at.deadline.left), "24h 00m");
  assert.deepEqual([at.he, at.adjustment.he], ["11", "13"], "HE12's window closed at 10:00; HE13's closes at 11:00");
});

test("countdowns read as wattness.tech's: hours and minutes from an hour up, minutes and seconds under it, rounded down", () => {
  assert.equal(countdown(0), "00:00");
  assert.equal(countdown(-5000), "00:00");
  assert.equal(countdown(999), "00:00");
  assert.equal(countdown(1000), "00:01");
  assert.equal(countdown(59_999), "00:59");
  assert.equal(countdown(60_000), "01:00");
  assert.equal(countdown(19 * 60_000 + 53_999), "19:53");
  assert.equal(countdown(3_599_999), "59:59");
  assert.equal(countdown(3_600_000), "1h 00m");
  assert.equal(countdown(3_659_999), "1h 00m");
  assert.equal(countdown(3_660_000), "1h 01m");
  assert.equal(countdown(22 * 3_600_000 + 19 * 60_000 + 59_999), "22h 19m");
  assert.equal(countdown(25 * 3_600_000), "25h 00m");
  // A clock that ticks a few milliseconds after the second reads one second less, as wattness.tech's does.
  const s = marketClockAt(ms("2026-11-26T17:40:07.004Z"));
  assert.equal(countdown(s.adjustment.left), "19:52");
});

test("the fall change, Nov 1, 2026: 25 hours, the repeated hour is HE2R, the countdowns span the extra hour", () => {
  assert.deepEqual(hourTokens("2026-11-01"), ["01", "02", "2R", ...Array.from({ length: 22 }, (_, i) => String(i + 3).padStart(2, "0"))]);
  assert.equal(hourTokens("2026-11-02").length, 24);

  const noonBefore = marketClockAt(ms("2026-10-31T17:00:00Z")); // 12:00 CDT
  assert.equal(noonBefore.deadline.at, ms("2026-11-01T16:00:00Z"), "10:00 CST");
  assert.equal(noonBefore.deadline.operatingDay, "2026-11-02");
  assert.equal(countdown(noonBefore.deadline.left), "23h 00m", "22 hours on the wall clock, 23 elapsed");

  const evening = marketClockAt(ms("2026-11-01T04:30:00Z")); // 23:30 CDT on the 31st
  assert.deepEqual([evening.he, evening.adjustment.he, evening.adjustment.dayShort], ["24", "02", "Nov 1"]);

  const midnight = marketClockAt(ms("2026-11-01T05:30:00Z")); // 00:30 CDT
  assert.deepEqual([midnight.he, midnight.adjustment.he], ["01", "2R"], "the hour starting at the second 01:00");
  assert.equal(midnight.adjustment.at, ms("2026-11-01T06:00:00Z"));

  const first = marketClockAt(ms("2026-11-01T06:30:00Z")); // 01:30 CDT, the first time
  assert.deepEqual([first.he, first.adjustment.he], ["02", "03"]);
  assert.equal(hhmm(first.adjustment.at, "America/Chicago"), "01:00", "closes as the clock reads 01:00 again");
  assert.equal(first.adjustment.topHH, "01");
  assert.equal(countdown(first.adjustment.left), "30:00");

  const second = marketClockAt(ms("2026-11-01T07:30:00Z")); // 01:30 CST, the second time
  assert.deepEqual([second.wall, second.he, second.adjustment.he], ["01:30:00", "2R", "04"]);
  assert.equal(second.hours, 25);
  assert.equal(second.x, 2.5 / 25, "the now line moves on with elapsed time; it never steps back an hour");
  assert.ok(second.x > first.x);
  assert.deepEqual(
    second.ticks.map((t) => [t.at, t.x]),
    [["00:00", 0], ["10:00", 11 / 25], ["13:30", 14.5 / 25], ["14:30", 15.5 / 25], ["18:00", 19 / 25], ["24:00", 1]],
  );
  assert.equal(passed(second)["as-plan"], "ahead");
  assert.equal(passed(marketClockAt(ms("2026-11-01T11:59:00Z")))["as-plan"], "ahead", "05:59 CST");
  assert.equal(passed(marketClockAt(ms("2026-11-01T12:00:00Z")))["as-plan"], "passed", "06:00 CST");
});

test("the spring change, Mar 14, 2027: 23 hours, no HE03, and the deadline an hour nearer", () => {
  const tokens = hourTokens("2027-03-14");
  assert.equal(tokens.length, 23);
  assert.ok(!tokens.includes("03"));
  assert.deepEqual(tokens.slice(0, 4), ["01", "02", "04", "05"]);

  const noonBefore = marketClockAt(ms("2027-03-13T18:00:00Z")); // 12:00 CST
  assert.equal(noonBefore.deadline.at, ms("2027-03-14T15:00:00Z"), "10:00 CDT");
  assert.equal(noonBefore.deadline.operatingDay, "2027-03-15");
  assert.equal(countdown(noonBefore.deadline.left), "21h 00m");

  const night = marketClockAt(ms("2027-03-14T07:30:00Z")); // 01:30 CST
  assert.deepEqual([night.he, night.adjustment.he], ["02", "05"], "HE04 starts at 03:00 CDT; HE05's window closes then");
  assert.equal(hhmm(night.adjustment.at, "America/Chicago"), "03:00");
  assert.equal(night.adjustment.topHH, "03");
  assert.equal(countdown(night.adjustment.left), "30:00");
  assert.equal(night.hours, 23);
  assert.equal(night.ticks.find((t) => t.at === "10:00").x, 9 / 23);

  const morning = marketClockAt(ms("2027-03-14T14:00:00Z")); // 09:00 CDT
  assert.equal(morning.phase.id, "dam-offers-due");
  assert.equal(morning.phase.tone, "open", "exactly an hour out is still open");
  assert.equal(countdown(morning.deadline.left), "1h 00m");
  assert.equal(morning.he, "10");
});

test("over two years, every sample agrees with the site's gate and with itself", () => {
  const from = ms("2026-01-01T00:00:00Z");
  const to = ms("2028-01-01T00:00:00Z");
  // A step that is not a whole number of hours walks through every minute of the hour across the run.
  for (let t = from; t < to; t += 7 * 3_600_000 + 13 * 60_000 + 17_123) {
    const s = marketClockAt(t);
    const gate = nextGate(t);
    assert.equal(s.deadline.at, gate.unix * 1000, `the deadline is the site's gate at ${new Date(t).toISOString()}`);
    assert.equal(s.deadline.operatingDay, gate.operatingDay);
    assert.ok(s.deadline.left > 0 && s.deadline.left <= 25 * 3_600_000, "the next deadline is within a day and an hour");
    assert.ok(s.adjustment.left > 0 && s.adjustment.left <= 3_600_000);
    assert.equal(s.adjustment.at % 3_600_000, 0, "adjustments close on the hour");
    assert.ok(s.phase.left > 0);
    assert.ok([23, 24, 25].includes(s.hours));
    assert.ok(s.x >= 0 && s.x < 1);
    assert.equal(s.segments[0].from, 0);
    assert.equal(s.segments.at(-1).to, 1);
    const runs = s.segments.filter((g) => g.from <= s.x && s.x < g.to);
    assert.equal(runs.length, 1, "the now line sits in one stretch");
    assert.equal(runs[0].id, s.phase.id, "the stretch of the phase the tag names");
    const minute = Math.floor(t / 60_000) * 60_000;
    for (const r of s.rows) assert.equal(r.passed, r.ms <= minute, `${r.key} at ${new Date(t).toISOString()}`);
    assert.ok(s.rows.every((r, i, all) => i === 0 || all[i - 1].ms <= r.ms), "in time order");
    assert.ok(hourTokens(s.day).includes(s.he), "the Operating Hour is one of the day's own");
  }
});

test("cite stops at the first semicolon and keeps everything before it", () => {
  assert.equal(cite("Protocols §4.1.2(5)"), "Protocols §4.1.2(5)");
  assert.equal(cite('Protocols §6.3(2); §2.1 "Adjustment Period"'), "Protocols §6.3(2)");
  assert.equal(cite('Protocols §5.3(1). Results "in the Day-Ahead" (§5.5.3(2)); the §5.2.1 figure'), 'Protocols §5.3(1). Results "in the Day-Ahead" (§5.5.3(2))');
});
