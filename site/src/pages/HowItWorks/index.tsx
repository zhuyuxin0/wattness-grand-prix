import { Link } from "react-router-dom";
import { CONTRACT_ADDRESS, REPO_URL, TERMINAL_URL } from "../../config";
import { useDay, type DayIndex } from "../../data";
import { formatInt } from "../../lib/format";
import { Glyph, Hash, PageHeader, Section } from "../../ui";
import { Architecture } from "./Architecture";
import "./styles.css";

// Paddock: what the entry is, the race weekend's vocabulary, how the parts fit,
// what is new here and what it calls, and the laps ahead.
export default function PaddockPage() {
  const state = useDay();
  const day = state.status === "ready" ? state.data : null;

  return (
    <div className="page page--paddock">
      <PageHeader
        title="How It Works"
        lede="Agents plan tomorrow for every real ERCOT battery and seal each plan on BNB Chain before the day-ahead gate. The plans are shadow plans: computed from public data, never used to operate the batteries. What the record proves is that no plan changed after the gate."
        aside={<Facts day={day} />}
      />

      <Section kicker="What it is" title="Plan, seal, verify">
        <ol className="pd-steps">
          <li>
            <span className="pd-steps__n num">01</span>
            <h3>Plan</h3>
            <p>
              The planner reads the Wattness Terminal's public ERCOT release, every input named by its SHA-256, and solves each battery's next day hour by hour
              within its power and energy limits: a linear program, solved with HiGHS.
            </p>
            <p>
              Desert Willow compares three arms under the same inputs: no hedge; a hedge added to a fixed schedule; schedule and hedge chosen together. The hedge
              uses ElectronX's published hourly bounded-future terms at an assumed fair-value entry, a scenario comparison and never a trade.
            </p>
          </li>
          <li>
            <span className="pd-steps__n num">02</span>
            <h3>Seal</h3>
            <p>
              Each plan becomes an RFC 8785 canonical JSON document and a leaf of one RFC 6962 root. GateRecord stores the root with the git tree hash of the code
              that produced it.
            </p>
            <p>The contract computes the 10:00 CT gate itself, daylight-saving aware, and refuses a late or a second record for the same day.</p>
          </li>
          <li>
            <span className="pd-steps__n num">03</span>
            <h3>Verify</h3>
            <p>
              One command, the Stewards page or a standard-library Python script checks a battery's plan: the leaf and its proof, the record on chain, the seal
              against the gate, the battery's limits hour by hour, the accounting, and every input against the published release.
            </p>
            <p>Change one number in a plan and the check fails, naming the field.</p>
          </li>
        </ol>
      </Section>

      <Section kicker="Vocabulary" title="The race weekend, term by term" lede="The site's words and what each one stands for.">
        <Vocabulary day={day} />
      </Section>

      <Section
        kicker="Architecture"
        title="From public data to a sealed root"
        lede="Everything the verifier needs is public: the Terminal's files, the leaves and their proofs, and the record on BNB Chain."
        source="Diagram: Wattness."
      >
        <Architecture day={day} />
      </Section>

      <Section kicker="New and existing" title="What this entry adds, and what it calls">
        <div className="pd-split">
          <div className="pd-split__col pd-split__col--new">
            <h3 className="pd-split__head">
              <span className="pd-split__mark" aria-hidden="true" />
              New in this entry
            </h3>
            <p className="pd-split__lede">
              Built for BNB Bangkok, MIT-licensed, in{" "}
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                the repository
              </a>
              .
            </p>
            <ul className="pd-list">
              <li>
                <b>GateRecord</b>
                <span>
                  A write-once record per committer, scope and operating day, closing at the gate it computes on chain. On BSC mainnet and testnet, source verified
                  on Sourcify.
                </span>
              </li>
              <li>
                <b>The plan record</b>
                <span>The manifest schema gate-record.manifest.v1, canonical JSON in integer units, its leaves and the day's root.</span>
              </li>
              <li>
                <b>The fleet planner</b>
                <span>The forecast, the price scenarios and the three-arm dispatch and hedge program, run for every battery at each gate.</span>
              </li>
              <li>
                <b>The verifier</b>
                <span>The command-line check, the in-browser check on the Stewards page, and a second leaf-hash implementation in standard-library Python.</span>
              </li>
              <li>
                <b>This site</b>
                <span>The race weekend, the pit wall, the standings, the stewards and the garage, all read from the sealed record's own files.</span>
              </li>
            </ul>
          </div>
          <div className="pd-split__col pd-split__col--existing">
            <h3 className="pd-split__head">
              <span className="pd-split__mark" aria-hidden="true" />
              Existing, called as a service
            </h3>
            <p className="pd-split__lede">Public services the entry reads. It changes nothing in them.</p>
            <ul className="pd-list">
              <li>
                <b>
                  <a href={TERMINAL_URL} target="_blank" rel="noreferrer">
                    Wattness Terminal
                  </a>
                </b>
                <span>
                  The public ERCOT data release at wattness.tech, built and run by Wattness before the event. The planner reads it file by file and checks each
                  against its published SHA-256{day ? `: ${formatInt(day.leafCount)} batteries' sizes, nodes and prices from release ${day.inputsRelease}` : ""}.
                </span>
              </li>
              <li>
                <b>ElectronX product terms</b>
                <span>The published specification of the hourly bounded future: range, tick, size, fees and settlement. Terms only, no market data.</span>
              </li>
              <li>
                <b>HiGHS</b>
                <span>The open-source linear programming solver.</span>
              </li>
              <li>
                <b>BNB Smart Chain</b>
                <span>
                  Where GateRecord lives, at <Hash value={CONTRACT_ADDRESS} label="contract address" href={`https://bscscan.com/address/${CONTRACT_ADDRESS}`} /> on
                  both networks.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </Section>

      <Section kicker="Roadmap" title="The laps ahead">
        <ol className="pd-road">
          <li>
            <span className="pd-road__lap num">Lap 1</span>
            <h3>Every gate sealed</h3>
            <p>A record for every operating day, each sealed before its 10:00 CT gate by the same code, its tree hash in the record.</p>
          </li>
          <li>
            <span className="pd-road__lap num">Lap 2</span>
            <h3>Other agents join the standings</h3>
            <p>GateRecord takes any committer. Other teams' agents seal plans for the same batteries and are scored by the same checker, on matched conditions.</p>
          </li>
          <li>
            <span className="pd-road__lap num">Lap 3</span>
            <h3>More markets</h3>
            <p>The same record at other US power markets' day-ahead gates, each with its own gate rule computed on chain.</p>
          </li>
          <li>
            <span className="pd-road__lap num">Lap 4</span>
            <h3>From shadow plans to operated batteries</h3>
            <p>With QSE partners, the sealed plan becomes the bid a battery submits, and the record proves it was fixed before the gate.</p>
          </li>
        </ol>
      </Section>
    </div>
  );
}

function Facts({ day }: { day: DayIndex | null }) {
  return (
    <dl className="pd-facts">
      <div>
        <dt>Market</dt>
        <dd>ERCOT{day ? `, ${day.regime}` : ""}</dd>
      </div>
      <div>
        <dt>Chain</dt>
        <dd>BNB Smart Chain 56 and 97</dd>
      </div>
      <div>
        <dt>Starting grid</dt>
        <dd className="num">{day ? `${formatInt(day.leafCount)} batteries` : "every battery"}</dd>
      </div>
      <div>
        <dt>License</dt>
        <dd>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            MIT, open source
          </a>
        </dd>
      </div>
    </dl>
  );
}

interface Term {
  term: string;
  means: string;
  to?: string;
}

function terms(day: DayIndex | null): [Term[], Term[]] {
  return [
    [
      { term: "Starting grid", means: `ERCOT's grid of real batteries${day ? `: ${formatInt(day.leafCount)} in the sealed root` : ""}`, to: "/fleet" },
      { term: "Qualifying", means: "Agents plan tomorrow", to: "/battery" },
      { term: "Parc Ferme", means: "10:00 CT: plans sealed on BNB Chain; no changes, and a late seal reverts", to: "/seal" },
      { term: "Race day", means: "The operating day; real-time prices are the telemetry" },
      { term: "Stewards", means: "The verifier anyone can run", to: "/verify" },
      { term: "Standings", means: "Scores per battery on matched conditions", to: "/fleet" },
      { term: "Timing screens", means: "Atlas and CoinMarketCap prices" },
    ],
    [
      { term: "Pit wall and team radio", means: "The decision desk, with Ness as race engineer", to: "/battery" },
      { term: "Team data", means: "Living Brain memory", to: "/agents/memory" },
      { term: "Weather radar", means: "Cournot's Texas weather odds" },
      { term: "The garage", means: "BNB Agent Studio builds the agents and AWS runs them", to: "/about/agents" },
      { term: "Season purse", means: "Flap season launch" },
      { term: "License to launch", means: "OpenFour evidence-gated graduation" },
    ],
  ];
}

function Vocabulary({ day }: { day: DayIndex | null }) {
  return (
    <div className="pd-vocab">
      {terms(day).map((col, i) => (
        <dl key={i} className="pd-vocab__col">
          {col.map((t) => (
            <div key={t.term} className="pd-vocab__row">
              <dt>{t.term}</dt>
              <dd>
                {t.to ? (
                  <Link to={t.to} className="pd-vocab__link">
                    {t.means}
                    <Glyph name="chevron-right" size={12} />
                  </Link>
                ) : (
                  t.means
                )}
              </dd>
            </div>
          ))}
        </dl>
      ))}
    </div>
  );
}
