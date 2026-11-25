import { Link } from "react-router-dom";
import { SOURCE_LINE } from "../../config";
import { combine, useDay, useReceipts } from "../../data";
import { minSec } from "../../lib/clock";
import { formatInt } from "../../lib/format";
import { formatOperatingDay } from "../../lib/time";
import { Glyph } from "../../ui";
import { SceneSlot } from "./SceneSlot";
import "./styles.css";

// Intro: the Grand Prix's opening. The starting grid of the day's sealed plans
// on a stage that keeps its own dark, one plain line of what this is, and the
// way into the app. The full 3D story mounts on this stage.
export default function IntroPage() {
  const state = combine(useDay(), useReceipts());
  const facts =
    state.status === "ready"
      ? (() => {
          const [day, r] = state.data;
          const main = r.receipts.find((x) => x.mainnet) ?? r.receipts[0];
          return { plans: day.leafCount, day: formatOperatingDay(day.operatingDay), lead: main ? minSec(main.secondsBeforeGate) : null };
        })()
      : null;

  return (
    <div className="page page--intro">
      {/* The stage keeps its own dark in either theme, as wattness.tech's intro does. */}
      <section className="intro" data-atmosphere="dark" aria-labelledby="intro-line">
        <SceneSlot />
        <div className="intro__copy">
          <h1 id="intro-line" className="intro__line">
            AI agents plan tomorrow for every Texas battery and seal each plan on BNB Chain before the market closes.
          </h1>
          <div className="intro__actions">
            <Link to="/overview" className="btn btn--primary">
              Open the overview
              <Glyph name="next" />
            </Link>
            <Link to="/verify" className="btn">
              Verify a plan
            </Link>
          </div>
          {facts && (
            <p className="intro__facts">
              <span className="num">{formatInt(facts.plans)}</span> plans for {facts.day}, sealed
              {facts.lead && (
                <>
                  {" "}
                  <span className="num">{facts.lead}</span> before ERCOT's 10:00 CT day-ahead gate
                </>
              )}
              . {SOURCE_LINE}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
