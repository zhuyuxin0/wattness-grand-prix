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
import { TabIcon } from "../../ui/TabIcon";
import { CHAPTERS, chapterHref, type Chapter } from "../../chapters/map";
import { Closing } from "./Closing";
import { Hero } from "./Hero";
import { STORY_MARK, STORY_PLAYABLE, markStory, warmStory, warmWhenIdle } from "./story";
import StoryOverlay from "./StoryOverlay";
import { useChapterLink } from "../../chapters/link";
import "./styles.css";

// Intro: the Grand Prix's opening. It opens on chapter 01 of the introduction,
// Desert Willow at night, dark in either theme, with the one hero line, the
// day's facts, Play and Verify, and the lockup that closes the introduction.
// Under it, in the visitor's theme, the steps of a plan's day beside what each
// means for a battery and the technology that carries it; the racing words
// live here and in the glossary, never in the app's names. The page ends on
// the starting grid's close, played as it comes on screen, with the ways on
// beneath. Play opens the introduction (packages/world's mountStory) over the
// whole viewport. Each step's racing term stands over its own frame of the
// introduction (the chapter's poster in public/chapters/, under a dark scrim),
// with the way into that chapter.

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
  /** The introduction's beat whose frame stands behind the racing term: the chapter that shows the step
   *  (src/chapters/map.ts; its poster in public/chapters/ with its receipt). */
  frame: string;
  builtOn: string[];
  tabs: { to: string; label: string }[];
}

const BASE = import.meta.env.BASE_URL;

/** The chapter that shows a beat whole (not one part of it), from the chapter panes' own map. */
const chapterOf = (beat: string): Chapter | undefined => Object.values(CHAPTERS).find((c) => c.beat === beat && !c.part);

const STEPS: Step[] = [
  {
    id: "plan",
    name: "Plan",
    plain:
      "Agents plan tomorrow for every battery with complete public data: when to charge and when to discharge, hour by hour, within its power and energy limits. A forecast, the state of charge, a hedge and the risk each have an agent; their memory keeps what they know.",
    term: "Qualifying",
    race: "the session before the race, where every car sets its order.",
    // the order it sets: every battery's plan for tomorrow on the starting grid
    frame: "starting-grid",
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
    frame: "sealed",
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
    frame: "check",
    builtOn: ["BNB Smart Chain: the record, read from a public node"],
    tabs: [{ to: "/verify", label: "Verify" }],
  },
  {
    id: "enter",
    name: "Enter",
    plain: "GateRecord takes any committer. Another agent seals its own plans under its own wallet, with the same scope and schema, against the same gate.",
    term: "The garage",
    race: "where a team builds its car before it takes the grid.",
    frame: "garage",
    builtOn: ["GateRecord: open to any wallet"],
    tabs: [{ to: "/about/agents", label: "Add Your Agent" }],
  },
];

/**
 * A step's racing term over its frame of the introduction: the chapter's poster under a dark scrim, dark in either
 * theme, the term and its meaning over it, and the way into that chapter (the Intro opens /?chapter=<beat>; in a build
 * without the story, the chapter's name alone).
 */
function RaceCell({ step, playable, onCue }: { step: Step; playable: boolean; onCue?: (el: HTMLElement) => void }) {
  const c = chapterOf(step.frame);
  const number = c ? String(c.chapter).padStart(2, "0") : "";
  const cue = c && (
    <>
      <TabIcon name="play" size={12} className="story__cue-icon" />
      <span>
        Chapter <span className="num">{number}</span> of the introduction
      </span>
    </>
  );
  return (
    <div className={`story__race${c ? " story__race--framed" : ""}`} data-label="In racing terms" data-atmosphere={c ? "dark" : undefined}>
      {c && <img className="story__frame" src={`${BASE}chapters/${c.loop}.webp`} alt="" width={960} height={540} loading="lazy" decoding="async" />}
      <p className="story__race-text">
        <b>{step.term}:</b> {step.race}
      </p>
      {c &&
        (playable ? (
          <Link
            to={chapterHref(c.beat)}
            className="story__cue"
            aria-label={`Open the introduction at chapter ${number}: ${c.name}`}
            onClick={(e) => onCue?.(e.currentTarget)}
          >
            {cue}
          </Link>
        ) : (
          <span className="story__cue">{cue}</span>
        ))}
    </div>
  );
}

export default function IntroPage() {
  const state = combine(useDay(), useReceipts());
  const navigate = useNavigate();
  const [story, setStory] = useState(false);
  const play = useRef<HTMLButtonElement>(null);
  // The button that opened the introduction (the hero's, or the closing band's), for focus on the way back.
  const opener = useRef<HTMLElement | null>(null);
  // A step's chapter link, which opens the introduction through the address: focus goes back to it on Close.
  const cueFrom = useRef<HTMLElement | null>(null);
  const onCue = useCallback((el: HTMLElement) => {
    cueFrom.current = el;
  }, []);
  const openStory = useCallback((from?: HTMLElement) => {
    opener.current = from ?? cueFrom.current ?? play.current;
    cueFrom.current = null;
    markStory(STORY_MARK.open);
    setStory(true);
  }, []);
  // A chapter's address (/?chapter=<beat>, from a tab's chapter pane): the introduction opens at that beat.
  const chapter = useChapterLink(STORY_PLAYABLE ? openStory : null);
  const leaveChapter = chapter.leave;
  // Esc or the close button: back to the button that opened it, or to the tab whose chapter pane did.
  const closeStory = useCallback(() => {
    setStory(false);
    if (leaveChapter()) return;
    requestAnimationFrame(() => (opener.current ?? play.current)?.focus({ preventScroll: true }));
  }, [leaveChapter]);
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
                The record for {shortDay(day.operatingDay)}, on the morning of {date}: plans made at <Clock unix={day.planUnix} />
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
      {story && <StoryOverlay key={chapter.beat ?? ""} onClose={closeStory} onRoute={routeFromStory} startBeat={chapter.beat ?? undefined} still={chapter.still} />}

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
                <RaceCell step={s} playable={STORY_PLAYABLE} onCue={onCue} />
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
