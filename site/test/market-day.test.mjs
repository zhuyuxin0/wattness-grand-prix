// The market day behind the masthead's gate: which moments have passed, which phase runs now, the countdowns to the
// DAM deadline and to the next Adjustment Period close, and the two days a year Central time changes. Run with
// `pnpm test` (Node 22.18 or later runs the TypeScript modules directly; the hook below adds the ".ts" that Vite
// resolves on its own).

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

const { EVENTS, PHASES, hourLabels, leftText, leftWords, marketDayAt, shownAt } = await import("../src/shell/market-day.ts");
const { formatCountdown, formatInZone, nextGate } = await import("../src/lib/time.ts");

const ms = (iso) => Date.parse(iso);
const unix = (iso) => Date.parse(iso) / 1000;
const states = (day) => Object.fromEntries(day.moments.map((m) => [m.key, m.state]));
const hhmm = (u, zone) => formatInZone(u, zone, { date: false, seconds: false });

/** The gate tag's countdown at an instant, as the masthead prints it: "01:08:24", "1d 00:00:00". */
const tag = (t) => formatCountdown(nextGate(t).unix - Math.floor(t / 1000));
/** That countdown read down to the minute, in the panel's words, parsed from the tag's own text. */
function tagInPanelWords(countdown) {
  const [, d = "0", hh, mm] = countdown.match(/^(?:(\d+)d )?(\d\d):(\d\d):\d\d$/);
  const h = Number(d) * 24 + Number(hh);
  const m = Number(mm);
  return h ? `${h} h ${mm} min` : m ? `${m} min` : "< 1 min";
}

test("the register runs 00:00 to 24:00 without a gap, each line with its Protocols section", () => {
  assert.equal(PHASES[0].start, "00:00");
  assert.equal(PHASES.at(-1).end, "24:00");
  for (let i = 1; i < PHASES.length; i++) assert.equal(PHASES[i].start, PHASES[i - 1].end, `${PHASES[i].id} starts where ${PHASES[i - 1].id} ends`);
  for (const line of [...PHASES, ...EVENTS]) {
    assert.match(line.source, /^Protocols §/, `${line.id} cites the Protocols`);
    assert.ok(line.quote.length > 40, `${line.id} carries the Protocols' sentence`);
    // Labels write times as the site does; ERCOT's 1000 stays inside the quotations and sources only.
    assert.doesNotMatch(line.label, /\b\d{4}\b/, `${line.id}'s label writes HH:MM`);
  }
  assert.deepEqual(
    EVENTS.filter((e) => !e.firm).map((e) => e.id),
    ["druc-results"],
    "only DRUC results' 16:00 is a figure rather than a rule",
  );
});

test("08:51 CT on the 26th: bids for the 27th are due, the plan is posted, everything else is ahead", () => {
  const day = marketDayAt(ms("2026-11-26T14:51:36Z"));
  assert.equal(day.now, unix("2026-11-26T14:51:00Z"), "held to the minute");
  assert.equal(day.day, "2026-11-26");
  assert.equal(day.operatingDay, "2026-11-27");
  assert.equal(day.hours, 24);
  assert.equal(day.x, (8 * 60 + 51) / 1440);
  assert.equal(day.phase.id, "dam-offers-due");
  assert.equal(day.phase.atDeadline, true, "the deadline carries the one DAM countdown");
  assert.deepEqual(states(day), {
    "dam-offers-due": "now",
    "as-plan": "passed",
    "dam-clearing": "ahead",
    "dam-results": "ahead",
    druc: "ahead",
    "offer-cap-switch": "ahead",
    "druc-results": "ahead",
    "adjustment-period": "ahead",
    "dam-abort-bound": "ahead",
  });
  assert.deepEqual(
    day.moments.map((m) => `${m.at} ${m.key}`),
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
    "the day's moments in order, the phase before the event at 14:30",
  );
  assert.deepEqual(
    day.moments.map((m) => m.cite),
    [
      "Protocols §5.4(1)(b), item (i)",
      "Protocols §4.2.1.1(1)",
      "Protocols §4.5.1(1)",
      "Protocols §4.5.2(1)",
      "Protocols §5.3(1)",
      "Protocols §4.4.7.2.1(3)",
      "Protocols §5.5.3(2) gives no time",
      "Protocols §6.3(2)",
      "Protocols §4.1.2(5)",
    ],
    "each moment shows its first reference",
  );
  assert.deepEqual(day.deadline, { unix: unix("2026-11-26T16:00:00Z"), operatingDay: "2026-11-27", left: 68 * 60 + 24 });
  assert.equal(tag(ms("2026-11-26T14:51:36Z")), "01:08:24", "the gate tag above it");
  assert.equal(leftText(day.deadline.left), "1 h 08 min", "the tag's 01:08:24 rounded down, as wattness.tech's 1h 08m");
  // The same instant on every reader's clock: CT first, the reader's own beside it.
  assert.equal(hhmm(day.deadline.unix, "America/Chicago"), "10:00");
  assert.equal(hhmm(day.deadline.unix, "Asia/Bangkok"), "23:00");
  assert.equal(hhmm(day.deadline.unix, "Europe/London"), "16:00");
  assert.deepEqual(day.adjustment, { closes: unix("2026-11-26T15:00:00Z"), left: 8 * 60 + 24, hour: "HE11", day: null, current: "HE09" });
  assert.equal(leftText(day.adjustment.left), "8 min", "8:24 to 09:00 CT");
});

test("each time left is what the gate tag reads, rounded down to the minute, and never 0 min", () => {
  const cases = [
    // [instant, CT, the tag, DAM deadline, the running phase, the adjustments close, the gate's spoken time]
    ["2026-11-26T06:00:30Z", "00:00:30", "09:59:30", "9 h 59 min", null, "59 min", "9 hours 59 minutes"],
    ["2026-11-26T14:51:36Z", "08:51:36", "01:08:24", "1 h 08 min", null, "8 min", "1 hour 8 minutes"],
    ["2026-11-26T15:59:00Z", "09:59:00", "00:01:00", "1 min", null, "1 min", "1 minute"],
    ["2026-11-26T15:59:30Z", "09:59:30", "00:00:30", "< 1 min", null, "< 1 min", "less than a minute"],
    ["2026-11-26T19:29:59Z", "13:29:59", "20:30:01", "20 h 30 min", "< 1 min", "30 min", "20 hours 30 minutes"],
    ["2026-11-27T05:59:59.999Z", "23:59:59", "10:00:01", "10 h 00 min", "< 1 min", "< 1 min", "10 hours"],
  ];
  for (const [iso, ct, countdown, deadline, phase, adjustment, words] of cases) {
    const t = ms(iso);
    const day = marketDayAt(t);
    assert.equal(formatInZone(Math.floor(t / 1000), "America/Chicago", { date: false }), ct);
    assert.equal(tag(t), countdown, `the tag at ${ct} CT`);
    assert.equal(leftText(day.deadline.left), deadline, `the DAM deadline at ${ct} CT`);
    assert.equal(leftText(day.deadline.left), tagInPanelWords(countdown));
    if (phase) assert.equal(leftText(day.phase.left), phase, `the phase at ${ct} CT`);
    assert.equal(leftText(day.adjustment.left), adjustment, `the adjustments close at ${ct} CT`);
    assert.equal(leftWords(day.deadline.left), words, `the gate's spoken name at ${ct} CT`);
  }
});

test("the panel drawn at shownAt reads the same as at the instant itself, and redraws twice a minute", () => {
  const m = ms("2026-11-26T14:51:00Z");
  assert.equal(shownAt(m), m, "the minute's first second is drawn at its start");
  assert.equal(shownAt(m + 999), m);
  assert.equal(shownAt(m + 1000), m + 1000, "the rest of it one second in");
  assert.equal(shownAt(m + 59_999), m + 1000);
  assert.equal(shownAt(m + 60_000), m + 60_000);

  const drawn = (day) => ({
    now: day.now,
    x: day.x,
    phase: [day.phase.id, leftText(day.phase.left)],
    states: states(day),
    deadline: [day.deadline.unix, day.deadline.operatingDay, leftText(day.deadline.left), day.deadline.left <= 600],
    adjustment: [day.adjustment.closes, day.adjustment.hour, day.adjustment.day, day.adjustment.current, leftText(day.adjustment.left)],
  });
  // An ordinary day and both change days, every 23rd minute (so every minute of the hour in turn), at the edges of its
  // first two seconds and its last.
  for (const start of ["2026-11-26T06:00:00Z", "2026-11-01T05:00:00Z", "2027-03-14T06:00:00Z"]) {
    for (let minute = ms(start); minute < ms(start) + 25 * 3_600_000; minute += 23 * 60_000) {
      for (const offset of [0, 999, 1000, 1001, 30_500, 59_999]) {
        const t = minute + offset;
        assert.deepEqual(drawn(marketDayAt(shownAt(t))), drawn(marketDayAt(t)), `at ${new Date(t).toISOString()}`);
      }
    }
  }
});

test("a moment passes on its minute, not a second before", () => {
  const before = marketDayAt(ms("2026-11-26T15:59:59.999Z"));
  assert.equal(before.phase.id, "dam-offers-due");
  assert.equal(states(before)["dam-clearing"], "ahead");
  assert.equal(before.deadline.unix, unix("2026-11-26T16:00:00Z"));
  assert.equal(leftText(before.deadline.left), "< 1 min", "a countdown never reads 0 min before its moment");
  assert.equal(before.adjustment.hour, "HE12");

  const at = marketDayAt(ms("2026-11-26T16:00:00Z"));
  assert.equal(at.phase.id, "dam-clearing");
  assert.equal(at.phase.atDeadline, false);
  assert.equal(leftText(at.phase.left), "3 h 30 min");
  assert.equal(states(at)["dam-offers-due"], "passed");
  assert.equal(states(at)["dam-clearing"], "now");
  assert.equal(at.operatingDay, "2026-11-27", "the phases are still the 27th's");
  assert.deepEqual(at.deadline, { unix: unix("2026-11-27T16:00:00Z"), operatingDay: "2026-11-28", left: 24 * 3600 }, "the next deadline is tomorrow's, for the 28th");
  assert.equal(leftText(at.deadline.left), "24 h 00 min");
  assert.equal(at.adjustment.current, "HE11");
  assert.equal(at.adjustment.hour, "HE13", "HE12's window closed at 10:00; HE13's closes at 11:00");
  assert.equal(at.adjustment.closes, unix("2026-11-26T17:00:00Z"));
});

test("late evening: the Adjustment Period runs, and the next close is for the next day's second hour", () => {
  const day = marketDayAt(ms("2026-11-27T05:30:00Z")); // 23:30 CT on the 26th
  assert.equal(day.day, "2026-11-26");
  assert.equal(day.phase.id, "adjustment-period");
  assert.equal(leftText(day.phase.left), "30 min");
  assert.ok(day.moments.every((m) => m.state === (m.key === "adjustment-period" ? "now" : "passed")));
  assert.deepEqual(day.adjustment, { closes: unix("2026-11-27T06:00:00Z"), left: 30 * 60, hour: "HE02", day: "2026-11-27", current: "HE24" });
  assert.equal(day.deadline.operatingDay, "2026-11-28");
  assert.equal(leftText(day.deadline.left), "10 h 30 min");
});

test("the fall change, Nov 1, 2026: 25 hours, the repeated hour is HE02*, the countdown spans the extra hour", () => {
  assert.deepEqual(hourLabels("2026-11-01"), ["01", "02", "02*", ...Array.from({ length: 22 }, (_, i) => String(i + 3).padStart(2, "0"))]);
  assert.equal(hourLabels("2026-11-02").length, 24);

  const noonBefore = marketDayAt(ms("2026-10-31T17:00:00Z")); // 12:00 CDT
  assert.equal(noonBefore.deadline.unix, unix("2026-11-01T16:00:00Z"), "10:00 CST");
  assert.equal(noonBefore.deadline.operatingDay, "2026-11-02");
  assert.equal(leftText(noonBefore.deadline.left), "23 h 00 min", "22 hours on the wall clock, 23 elapsed");

  const evening = marketDayAt(ms("2026-11-01T04:30:00Z")); // 23:30 CDT on the 31st
  assert.deepEqual([evening.adjustment.current, evening.adjustment.hour, evening.adjustment.day], ["HE24", "HE02", "2026-11-01"]);

  const midnight = marketDayAt(ms("2026-11-01T05:30:00Z")); // 00:30 CDT
  assert.deepEqual([midnight.adjustment.current, midnight.adjustment.hour], ["HE01", "HE02*"], "the hour starting at the second 01:00");
  assert.equal(midnight.adjustment.closes, unix("2026-11-01T06:00:00Z"));

  const first = marketDayAt(ms("2026-11-01T06:30:00Z")); // 01:30 CDT, the first time
  assert.deepEqual([first.adjustment.current, first.adjustment.hour], ["HE02", "HE03"]);
  assert.equal(hhmm(first.adjustment.closes, "America/Chicago"), "01:00", "closes as the clock reads 01:00 again");
  assert.equal(first.adjustment.left, 30 * 60);

  const second = marketDayAt(ms("2026-11-01T07:30:00Z")); // 01:30 CST, the second time
  assert.deepEqual([second.adjustment.current, second.adjustment.hour], ["HE02*", "HE04"]);
  assert.equal(second.hours, 25);
  assert.equal(second.x, 2.5 / 25, "the marker moves on with elapsed time; it never steps back an hour");
  assert.ok(second.x > first.x);
  assert.deepEqual(
    second.ticks.map((t) => [t.at, t.x]),
    [["00:00", 0], ["10:00", 11 / 25], ["13:30", 14.5 / 25], ["14:30", 15.5 / 25], ["18:00", 19 / 25], ["24:00", 1]],
  );
  assert.equal(states(second)["as-plan"], "ahead");
  assert.equal(marketDayAt(ms("2026-11-01T11:59:00Z")).moments.find((m) => m.key === "as-plan").state, "ahead", "05:59 CST");
  assert.equal(marketDayAt(ms("2026-11-01T12:00:00Z")).moments.find((m) => m.key === "as-plan").state, "passed", "06:00 CST");
});

test("the spring change, Mar 14, 2027: 23 hours, no HE03, and the deadline an hour nearer", () => {
  const labels = hourLabels("2027-03-14");
  assert.equal(labels.length, 23);
  assert.ok(!labels.includes("03"));
  assert.deepEqual(labels.slice(0, 4), ["01", "02", "04", "05"]);

  const noonBefore = marketDayAt(ms("2027-03-13T18:00:00Z")); // 12:00 CST
  assert.equal(noonBefore.deadline.unix, unix("2027-03-14T15:00:00Z"), "10:00 CDT");
  assert.equal(noonBefore.deadline.operatingDay, "2027-03-15");
  assert.equal(leftText(noonBefore.deadline.left), "21 h 00 min");

  const night = marketDayAt(ms("2027-03-14T07:30:00Z")); // 01:30 CST
  assert.deepEqual([night.adjustment.current, night.adjustment.hour], ["HE02", "HE05"], "HE04 starts at 03:00 CDT; HE05's window closes then");
  assert.equal(hhmm(night.adjustment.closes, "America/Chicago"), "03:00");
  assert.equal(night.adjustment.left, 30 * 60);
  assert.equal(night.hours, 23);
  assert.equal(night.ticks.find((t) => t.at === "10:00").x, 9 / 23);

  const morning = marketDayAt(ms("2027-03-14T14:00:00Z")); // 09:00 CDT
  assert.equal(morning.phase.id, "dam-offers-due");
  assert.equal(leftText(morning.deadline.left), "1 h 00 min");
  assert.equal(morning.adjustment.current, "HE10");
});

test("over two years, every minute sampled agrees with the site's gate and with itself", () => {
  const from = ms("2026-01-01T00:00:00Z");
  const to = ms("2028-01-01T00:00:00Z");
  // A step that is not a whole number of hours walks through every minute of the hour across the run.
  for (let t = from; t < to; t += 7 * 3_600_000 + 13 * 60_000 + 17_000) {
    const day = marketDayAt(t);
    const now = day.now;
    const gate = nextGate(t);
    assert.equal(day.deadline.unix, gate.unix, `the deadline is the site's gate at ${new Date(t).toISOString()}`);
    assert.equal(day.deadline.operatingDay, gate.operatingDay);
    assert.ok(day.deadline.left > 0 && day.deadline.left <= 24 * 3600 + 3600, "the next deadline is within a day and an hour");
    assert.equal(leftText(day.deadline.left), tagInPanelWords(tag(t)), "the panel's DAM deadline is the gate tag's, rounded down");
    assert.ok(day.adjustment.left > 0 && day.adjustment.left <= 3600);
    assert.equal(day.adjustment.closes % 3600, 0, "adjustments close on the hour");
    assert.ok([23, 24, 25].includes(day.hours));
    assert.ok(day.x >= 0 && day.x < 1);
    assert.equal(day.segments[0].from, 0);
    assert.equal(day.segments.at(-1).to, 1);
    assert.equal(day.segments.filter((s) => s.current).length, 1, "one phase runs at a time");
    const runs = day.segments.find((s) => s.current);
    assert.ok(runs.from <= day.x && day.x < runs.to, "the marker sits in the phase that runs");
    assert.equal(day.phase.id, runs.id);
    for (const m of day.moments) {
      if (m.kind === "event") assert.equal(m.state, m.unix <= now ? "passed" : "ahead", `${m.key} at ${new Date(t).toISOString()}`);
      else if (m.state === "ahead") assert.ok(m.unix > now);
      else assert.ok(m.unix <= now);
    }
    assert.ok(day.moments.every((m, i, all) => i === 0 || all[i - 1].unix <= m.unix), "in time order");
  }
});

test("left times read in hours and minutes, rounded down", () => {
  assert.equal(leftText(1), "< 1 min");
  assert.equal(leftText(59), "< 1 min");
  assert.equal(leftText(59.9), "< 1 min", "a part of a second rounds down too");
  assert.equal(leftText(60), "1 min");
  assert.equal(leftText(119), "1 min");
  assert.equal(leftText(3599.5), "59 min");
  assert.equal(leftText(9 * 60), "9 min");
  assert.equal(leftText(3599), "59 min");
  assert.equal(leftText(3600), "1 h 00 min");
  assert.equal(leftText(69 * 60), "1 h 09 min");
  assert.equal(leftText(68 * 60 + 24), "1 h 08 min");
  assert.equal(leftText(25 * 3600), "25 h 00 min");
  // and in words for the triggers' spoken names
  assert.equal(leftWords(30), "less than a minute");
  assert.equal(leftWords(59.9), "less than a minute");
  assert.equal(leftWords(60), "1 minute");
  assert.equal(leftWords(9 * 60), "9 minutes");
  assert.equal(leftWords(3600), "1 hour");
  assert.equal(leftWords(69 * 60), "1 hour 9 minutes");
  assert.equal(leftWords(68 * 60 + 24), "1 hour 8 minutes");
  assert.equal(leftWords(24 * 3600), "24 hours");
});
