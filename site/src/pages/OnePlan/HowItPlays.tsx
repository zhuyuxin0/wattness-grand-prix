import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Field } from "@world/game";
import { SOURCE_LINE } from "../../config";
import { formatInt } from "../../lib/format";
import { now } from "../../lib/capture";
import { formatOperatingDay, gateFor } from "../../lib/time";
import { Glyph } from "../../ui";

// What the cabinet's controls mean, in plain words: the dial, the glass, the
// score and the seal. The figures are the field's own, the sealed day the
// cabinet plays (the world's frame data), as the cabinet reports it once
// ready; until then the words go without figures.

/** "half" for a risk weight of 0.5, else the weight as a multiplier. */
function weightWords(lambdaPpm: number): string {
  if (lambdaPpm === 500_000) return "half";
  if (lambdaPpm === 1_000_000) return "all of";
  return `${(lambdaPpm / 1e6).toLocaleString("en-US")} times`;
}

/** "tenth" for a 90% CVaR, else the tail's share. */
function tailWords(alphaPpm: number): string {
  if (alphaPpm === 900_000) return "worst tenth";
  if (alphaPpm === 950_000) return "worst twentieth";
  return `worst ${((1e6 - alphaPpm) / 1e4).toLocaleString("en-US")}%`;
}

interface Item {
  term: string;
  body: ReactNode;
}

function items(m: Field | null): Item[] {
  const venue = "ElectronX";
  const size = m ? `${formatInt(m.sizeKwh / 1000)} MWh` : null;
  const cap = m ? m.maxContractsPerHour : null;
  const n = m ? formatInt(m.n) : null;
  return [
    {
      term: "The dial",
      body: (
        <>
          Sets the battery's schedule. At A it chases prices with no hedge; at C it runs the planner's schedule, chosen with the hedge. The steps between blend
          the two.
        </>
      ),
    },
    {
      term: "The glass",
      body: (
        <>
          The hedge: {venue}'s hourly contracts{m ? <> at {m.hub}</> : null}
          {size ? <>, <span className="num">{size}</span> each</> : null}. Glass sells on hours the battery discharges and buys on hours it charges, in whole
          contracts up to{" "}
          {cap ? (
            <>
              <span className="num">{formatInt(cap)}</span> an hour or the hour's energy, whichever is less
            </>
          ) : (
            "the hour's energy"
          )}
          . An hour with more glass than the schedule delivers lights up; Fit the glass trims it.
        </>
      ),
    },
    {
      term: "The score",
      body: (
        <>
          The planner's own objective over the same {n ? <span className="num">{n}</span> : null} sealed price scenarios: the mean day minus{" "}
          {m ? weightWords(m.lambdaPpm) : "half"} the {m ? tailWords(m.alphaPpm) : "worst tenth"}'s average loss, computed exactly in your
          browser. Each coin on the stage is one scenario's day.
        </>
      ),
    },
    // The seal: a field whose gate is ahead takes the visitor's own; once the gate has passed, the card shows the
    // plan sealed for that day, and so does this line.
    !m || now() / 1000 >= gateFor(m.operatingDay)
      ? {
          term: "The seal",
          body: (
            <>
              The planner's plan for {m ? formatOperatingDay(m.operatingDay).replace(/, \d{4}$/, "") : "this day"} was sealed on BNB Chain before the 10:00 CT gate; its
              record is on <Link to="/seal">Seal</Link>, and its score is the one yours is measured against.
            </>
          ),
        }
      : {
          term: "Seal my plan",
          body: (
            <>
              Writes one record to GateRecord on BSC testnet from your own wallet: your plan as one canonical JSON document, its hash the record's root. The page
              never holds or asks for a key. One record per wallet, battery and day, before the 10:00 CT gate.
            </>
          ),
        },
  ];
}

function Body({ m }: { m: Field | null }) {
  return (
    <dl className="how__list">
      {items(m).map((it) => (
        <div key={it.term} className="how__item">
          <dt>{it.term}</dt>
          <dd>{it.body}</dd>
        </div>
      ))}
    </dl>
  );
}

function Source({ m }: { m: Field | null }) {
  return (
    <p className="how__source">
      {m ? (
        <>
          The field: {m.name} (<span className="mono">{m.resource}</span>), its sealed plan for {formatOperatingDay(m.operatingDay)}.{" "}
        </>
      ) : null}
      {SOURCE_LINE}
    </p>
  );
}

/**
 * Beside the cabinet on a wide page; folded above it on a narrow one, so the
 * stage stays near the top and the words are one tap away.
 */
export function HowItPlays({ folded = false, field }: { folded?: boolean; field: Field | null }) {
  const m = field;
  if (folded) {
    return (
      <details className="how how--folded">
        <summary className="how__summary">
          <span>
            <b>How it plays</b>
            <span className="muted how__more">: the dial, the glass, the score and the seal</span>
          </span>
          <Glyph name="caret" className="how__caret" />
        </summary>
        <Body m={m} />
        <Source m={m} />
      </details>
    );
  }
  return (
    <section className="how" aria-labelledby="how-title">
      <h2 id="how-title" className="how__title">
        How It Plays
      </h2>
      <Body m={m} />
      <Source m={m} />
    </section>
  );
}
