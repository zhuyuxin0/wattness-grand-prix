import { Link } from "react-router-dom";
import { SHADOW_NOTE, SOURCE_LINE } from "../../config";
import { combine, useDay, useReceipts } from "../../data";
import { minSec } from "../../lib/clock";
import { formatInt } from "../../lib/format";
import { formatInZone, formatOperatingDay } from "../../lib/time";
import { CENTRAL_TZ } from "../../config";
import { Glyph, Section } from "../../ui";
import { SceneSlot } from "./SceneSlot";
import "./styles.css";

// Intro: the Grand Prix's opening. The stage keeps its own dark and tells the
// story in 3D; under it, in the visitor's theme, one plain line of what this
// is, the way into the app, and the story's steps beside what each one means
// for a battery and the technology that carries it. The racing words live
// here and in the glossary, never in the app's names.

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
      "Agents plan tomorrow for every battery: when to charge and when to discharge, hour by hour, within its power and energy limits. A forecast, the state of charge, a hedge and the risk each have an agent; their memory keeps what they know.",
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
    term: "Parc ferme",
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
  const facts =
    state.status === "ready"
      ? (() => {
          const [day, r] = state.data;
          const main = r.receipts.find((x) => x.mainnet) ?? r.receipts[0];
          const date = formatInZone(day.planUnix, CENTRAL_TZ, { seconds: false }).replace(/, \d\d:\d\d$/, "");
          return {
            plans: day.leafCount,
            day: formatOperatingDay(day.operatingDay),
            lead: main ? minSec(main.secondsBeforeGate) : null,
            caption: (
              <>
                Replay of the sealed morning, {date}: plans made at <span className="num">{formatInZone(day.planUnix, CENTRAL_TZ, { date: false })}</span> CT, sealed at{" "}
                <span className="num">{main ? formatInZone(main.blockTime, CENTRAL_TZ, { date: false }) : ""}</span> CT.
              </>
            ),
          };
        })()
      : null;

  return (
    <div className="page page--intro">
      {/* The stage keeps its own dark in either theme, as wattness.tech's intro does. */}
      <section className="intro-stage" data-atmosphere="dark" aria-label="The Grand Prix, in 3D">
        <SceneSlot caption={facts?.caption} />
      </section>

      <div className="intro-body">
        <header className="intro-head">
          <h1 className="intro__line">AI agents plan tomorrow for every Texas battery and seal each plan on BNB Chain before the market closes.</h1>
          <p className="intro__sub">
            {facts ? (
              <>
                <span className="num">{formatInt(facts.plans)}</span> plans for {facts.day} went on chain
                {facts.lead && (
                  <>
                    {" "}
                    <span className="num">{facts.lead}</span> before ERCOT's 10:00 CT day-ahead gate
                  </>
                )}
                . Anyone can check any of them.
              </>
            ) : (
              <>Every plan goes on chain before ERCOT's 10:00 CT day-ahead gate. Anyone can check any of them.</>
            )}
          </p>
          <div className="intro__actions">
            <Link to="/overview" className="btn btn--primary">
              Open the Overview
              <Glyph name="next" />
            </Link>
            <Link to="/verify" className="btn">
              Verify a plan
            </Link>
          </div>
          <p className="intro__source">
            {SOURCE_LINE} Commits: GateRecord on BNB Smart Chain, read from each chain's receipt. {SHADOW_NOTE}
          </p>
        </header>

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
    </div>
  );
}
