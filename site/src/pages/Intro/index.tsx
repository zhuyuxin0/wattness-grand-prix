import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SHADOW_NOTE, SOURCE_LINE } from "../../config";
import { combine, useDay, useReceipts } from "../../data";
import { minSec } from "../../lib/clock";
import { formatInt } from "../../lib/format";
import { RelatedStrip } from "../../shell/RelatedStrip";
import { dualTime, formatInZone } from "../../lib/time";
import { CENTRAL_TZ } from "../../config";
import { Glyph, Section } from "../../ui";
import { Closing } from "./Closing";
import { Hero } from "./Hero";
import { STORY_MARK, STORY_PLAYABLE, markStory, warmStory, warmWhenIdle } from "./story";
import StoryOverlay from "./StoryOverlay";
import "./styles.css";

// Intro: the Grand Prix's opening. It opens on chapter 01 of the introduction,
// Desert Willow at night, dark in either theme, with the one hero line, the
// day's facts, Play and Verify, and the lockup that closes the introduction.
// Under it, in the visitor's theme, the steps of a plan's day beside what each
// means for a battery and the technology that carries it; the racing words
// live here and in the glossary, never in the app's names. The page ends on
// the starting grid's close, played as it comes on screen, with the ways on
// beneath. Play opens the introduction (packages/world's mountStory) over the
// whole viewport.

/** A time in a sentence: CT, then the reader's own in brackets (with its date when the reader's day differs). */
function Clock({ unix }: { unix: number }) {
  const t = dualTime(unix, { date: false });
  const dated = dualTime(unix);
  const sameDay = dated.ct.slice(0, dated.ct.lastIndexOf(",")) === dated.yours?.slice(0, dated.yours.lastIndexOf(","));
  return (
    <>
      <span className="num">{t.ct}</span>
      {t.yours && <span className="num"> ({sameDay ? t.yours : dated.yours})</span>}
    </>
  );
}

/** "Nov 26" for a YYYY-MM-DD operating day. */
function shortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, d)));
}

interface Step {
  id: string;
  name: string;
  plain: string;
  /** The Grand Prix's word for the step, and what it means at a race. */
  term: string;
  race: string;
  builtOn: string[];
  tabs: { to: string; label: string }[];
}

const STEPS: Step[] = [
  {
    id: "plan",
    name: "Plan",
    plain:
      "Agents plan tomorrow for every battery with complete public data: when to charge and when to discharge, hour by hour, within its power and energy limits. A forecast, the state of charge, a hedge and the risk each have an agent; their memory keeps what they know.",
    term: "Qualifying",
    race: "the session before the race, where every car sets its order.",
    builtOn: ["Wattness Terminal: public ERCOT data", "HiGHS: the solver", "ElectronX: published hedge terms", "Living Brain: the agents' memory"],
    tabs: [
      { to: "/fleet", label: "Fleet" },
      { to: "/battery", label: "Battery" },
      { to: "/agents/forecast", label: "Agents" },
    ],
  },
  {
    id: "seal",
    name: "Seal",
    plain:
      "Each plan becomes one leaf of a single Merkle root. GateRecord holds the root on BNB Smart Chain, committed before ERCOT's 10:00 CT day-ahead gate, and refuses any commit for the day after it.",
    term: "Parc fermé",
    race: "after qualifying the cars are locked away, and no one may change them before the race.",
    builtOn: ["BNB Smart Chain: GateRecord, mainnet and testnet", "BNB Greenfield: the sealed day's files"],
    tabs: [
      { to: "/seal", label: "Seal" },
      { to: "/files", label: "Files" },
    ],
  },
  {
    id: "check",
    name: "Check",
    plain:
      "Anyone checks any plan in the browser: the leaf, its proof to the root, the record on chain, the seal against the gate, and the battery's limits hour by hour. Change one number and the check fails.",
    term: "The stewards",
    race: "the officials who check every car against the rules.",
    builtOn: ["BNB Smart Chain: the record, read from a public node"],
    tabs: [{ to: "/verify", label: "Verify" }],
  },
  {
    id: "enter",
    name: "Enter",
    plain: "GateRecord takes any committer. Another agent seals its own plans under its own wallet, with the same scope and schema, against the same gate.",
    term: "The garage",
    race: "where a team builds its car before it takes the grid.",
    builtOn: ["GateRecord: open to any wallet"],
    tabs: [{ to: "/about/agents", label: "Add Your Agent" }],
  },
];

export default function IntroPage() {
  const state = combine(useDay(), useReceipts());
  const navigate = useNavigate();
  const [story, setStory] = useState(false);
  const play = useRef<HTMLButtonElement>(null);
  // The button that opened the introduction (the hero's, or the closing band's), for focus on the way back.
  const opener = useRef<HTMLElement | null>(null);
  const openStory = useCallback((from?: HTMLElement) => {
    opener.current = from ?? play.current;
    markStory(STORY_MARK.open);
    setStory(true);
  }, []);
  // Esc or the close button: back to the button that opened it.
  const closeStory = useCallback(() => {
    setStory(false);
    requestAnimationFrame(() => (opener.current ?? play.current)?.focus({ preventScroll: true }));
  }, []);
  // The introduction's code, on an idle moment once the still is in: never on first paint.
  const [stillIn, setStillIn] = useState(false);
  useEffect(() => (stillIn ? warmWhenIdle() : undefined), [stillIn]);
  const onStillLoad = useCallback(() => setStillIn(true), []);
  // A beat's "Open <tab>": the story closes and the tab opens, focus on its page.
  const routeFromStory = useCallback(
    (to: string) => {
      setStory(false);
      navigate(to);
      requestAnimationFrame(() => document.getElementById("main")?.focus({ preventScroll: true }));
    },
    [navigate],
  );
  const facts =
    state.status === "ready"
      ? (() => {
          const [day, r] = state.data;
          const main = r.receipts.find((x) => x.mainnet) ?? r.receipts[0];
          const date = formatInZone(day.planUnix, CENTRAL_TZ, { seconds: false }).replace(/, \d\d:\d\d$/, "");
          return {
            plans: day.leafCount,
            day: shortDay(day.operatingDay),
            lead: main ? minSec(main.secondsBeforeGate) : null,
            caption: (
              <>
                The sealed morning, {date}: plans made at <Clock unix={day.planUnix} />
                {main && (
                  <>
                    , sealed at <Clock unix={main.blockTime} />
                  </>
                )}
                .
              </>
            ),
          };
        })()
      : null;

  const factsLine = facts ? (
    <>
      <span className="num">{formatInt(facts.plans)}</span> on {facts.day}: their plans went on chain
      {facts.lead && (
        <>
          {" "}
          <span className="num">{facts.lead}</span> before ERCOT's 10:00&nbsp;CT day-ahead gate
        </>
      )}
      . Anyone can check any of them.
    </>
  ) : (
    <>Every plan goes on chain before ERCOT's 10:00&nbsp;CT day-ahead gate. Anyone can check any of them.</>
  );

  return (
    <div className="page page--intro">
      <Hero facts={factsLine} onPlay={STORY_PLAYABLE ? () => openStory() : undefined} onPlayIntent={warmStory} playRef={play} onStillLoad={onStillLoad} />
      {story && <StoryOverlay onClose={closeStory} onRoute={routeFromStory} />}

      <div className="intro-body">
        <RelatedStrip tabId="intro" />
        <p className="intro__source">
          {SOURCE_LINE} Commits: GateRecord on BNB Smart Chain, read from each chain's receipt. {SHADOW_NOTE}
        </p>

        <Section
          title="The Grand Prix, Step by Step"
          lede="Each step of a plan's day, beside its racing term and the technology that carries it. The app's tabs follow the same order."
        >
          <ol className="story">
            <li className="story__row story__row--head" aria-hidden="true">
              <span>Step</span>
              <span>What happens</span>
              <span>In racing terms</span>
              <span>Built on</span>
              <span>See it in</span>
            </li>
            {STEPS.map((s) => (
              <li key={s.id} className="story__row">
                <h3 className="story__name">{s.name}</h3>
                <p className="story__plain">{s.plain}</p>
                <p className="story__race" data-label="In racing terms">
                  <b>{s.term}:</b> {s.race}
                </p>
                <ul className="story__tech" data-label="Built on">
                  {s.builtOn.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <div className="story__tabs" data-label="See it in">
                  {s.tabs.map((t) => (
                    <Link key={t.to} to={t.to} className="story__tab">
                      {t.label}
                      <Glyph name="next" />
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <Closing armed={stillIn} paused={story} caption={facts?.caption} onPlay={STORY_PLAYABLE ? openStory : undefined} onPlayIntent={warmStory} />
    </div>
  );
}
