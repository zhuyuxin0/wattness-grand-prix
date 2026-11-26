import { Link } from "react-router-dom";
import { CONTRACT_ADDRESS, REPO_URL, SHADOW_NOTE, TERMINAL_URL } from "../../config";
import { useDay, type DayIndex } from "../../data";
import { formatInt } from "../../lib/format";
import { Glyph, Hash, PageHeader, Section, Table, type Column } from "../../ui";
import { ObjectStill } from "../../ui/ObjectStill";
import { Architecture } from "./Architecture";
import "./styles.css";

// How It Works: what the entry is, how its parts fit, the glossary that maps
// the Grand Prix's words to plain ones (and to the tab that shows each), and
// what is new here against what it calls.

/** "Nov 26" for a YYYY-MM-DD operating day. */
function shortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export default function HowItWorksPage() {
  const state = useDay();
  const day = state.status === "ready" ? state.data : null;

  return (
    <div className="page page--about">
      <PageHeader
        title="How It Works"
        lede={
          <>
            Agents plan tomorrow for every Texas battery with complete public data
            {day && (
              <>
                {" "}
                (<span className="num">{formatInt(day.leafCount)}</span> on {shortDay(day.operatingDay)})
              </>
            )}{" "}
            and seal each plan on BNB Chain before the day-ahead gate. {SHADOW_NOTE} What the record proves is that no plan changed after the gate.
          </>
        }
        aside={<Facts day={day} />}
      />

      <Section title="What It Is" lede="Three steps, in the order the tabs follow, each as the introduction shows it.">
        <ol className="hw-steps">
          <li>
            <ObjectStill
              className="hw-still"
              name="chapter-starting-grid"
              alt="The starting grid in 3D: one column for each battery planned for Nov 26, in a row across a map of Texas"
              caption="Chapter 04: the Nov 26 plans, a column each"
              sizes="(max-width: 899px) calc(100vw - 32px), 30vw"
            />
            <h3>Plan</h3>
            <p>
              The planner reads the Wattness Terminal's public ERCOT release, every input named by its SHA-256, and solves each battery's next day hour by hour
              within its power and energy limits: a mixed-integer program, solved with HiGHS.
            </p>
            <p>
              For Desert Willow (DSWL_ESS_ESR1) it compares three plans under the same inputs: no hedge; a hedge added on top of a fixed schedule; schedule and
              hedge chosen together. The hedge uses ElectronX's published hourly contract terms at an assumed fair-value entry: a scenario, never a trade.
            </p>
            <Go links={[["/fleet", "Fleet"], ["/battery", "Battery"], ["/agents/forecast", "Agents"]]} />
          </li>
          <li>
            <ObjectStill
              className="hw-still"
              name="chapter-sealed"
              alt="Parc fermé in 3D: the gate's clock at 09:15:17 CT and the sealing ring lit gold as the Nov 26 root goes onto BNB Chain"
              caption="Chapter 13: sealed 09:15:17 CT, Nov 25"
              sizes="(max-width: 899px) calc(100vw - 32px), 30vw"
            />
            <h3>Seal</h3>
            <p>
              Each plan becomes an RFC 8785 canonical JSON document and one leaf of an RFC 6962 Merkle root. GateRecord stores the root on BNB Smart Chain with the
              git tree hash of the code that produced it.
            </p>
            <p>The contract computes the 10:00 CT gate itself, daylight-saving aware, and refuses a late or a second record for the same day.</p>
            <Go links={[["/seal", "Seal"], ["/files", "Files"]]} />
          </li>
          <li>
            <ObjectStill
              className="hw-still"
              name="chapter-check"
              alt="The proof tower in 3D: Desert Willow's sealed Nov 26 plan at its foot, a rung for each hash up to the gold root, beside a board with five checks passing"
              caption="Chapter 17: 5 of 5 checks, Nov 26"
              sizes="(max-width: 899px) calc(100vw - 32px), 30vw"
            />
            <h3>Verify</h3>
            <p>
              One command, the Verify tab or a standard-library Python script checks a battery's plan: the leaf and its proof, the record on chain, the seal
              against the gate, the battery's limits hour by hour, the accounting, and every input against the published release.
            </p>
            <p>Change one number in a plan and the check fails, naming the field.</p>
            <Go links={[["/verify", "Verify"]]} />
          </li>
        </ol>
      </Section>

      <Section
        title="Architecture"
        lede="From public data to a sealed root. Everything the check needs is public: the Terminal's files, the leaves and their proofs, and the record on BNB Chain."
        source="Diagram: Wattness."
      >
        <Architecture day={day} />
      </Section>

      <Section
        title="Glossary"
        lede="The Grand Prix's words, what each one means here, and the tab that shows it. The racing words stay in the story; the tabs use the plain names."
      >
        <Glossary day={day} />
      </Section>

      <Section title="What This Entry Adds, and What It Calls">
        <div className="hw-split">
          <div>
            <h3 className="hw-split__head">New in this entry</h3>
            <p className="hw-split__lede">
              Built for BNB Bangkok, MIT-licensed, in{" "}
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="hw-out">
                the repository
                <Glyph name="popout" />
              </a>
              .
            </p>
            <dl className="hw-list">
              <div>
                <dt>GateRecord</dt>
                <dd>
                  A write-once record per committer, scope and operating day, closing at the gate it computes on chain. On BNB Smart Chain mainnet and testnet, with
                  its source verified on Sourcify.
                </dd>
              </div>
              <div>
                <dt>The plan record</dt>
                <dd>The manifest schema gate-record.manifest.v1: canonical JSON in integer units, its leaves and the day's root.</dd>
              </div>
              <div>
                <dt>The fleet planner</dt>
                <dd>The forecast, the price scenarios and the dispatch and hedge program, run for every battery with complete public data at each gate.</dd>
              </div>
              <div>
                <dt>The verifier</dt>
                <dd>The command-line check, the in-browser check on the Verify tab, and a second leaf-hash implementation in standard-library Python.</dd>
              </div>
              <div>
                <dt>This site</dt>
                <dd>Every tab here, read from the sealed day's own published files.</dd>
              </div>
            </dl>
          </div>
          <div>
            <h3 className="hw-split__head">Existing, called as a service</h3>
            <p className="hw-split__lede">Public services the entry reads or writes to. It changes nothing in them.</p>
            <dl className="hw-list">
              <div>
                <dt>
                  <a href={TERMINAL_URL} target="_blank" rel="noreferrer" className="hw-out">
                    Wattness Terminal
                    <Glyph name="popout" />
                  </a>
                </dt>
                <dd>
                  The public ERCOT data release at wattness.tech, built and run by Wattness before the event. The planner reads it file by file and checks each
                  against its published SHA-256{day ? <>: {formatInt(day.leafCount)} batteries' sizes, nodes and prices from release <code>{day.inputsRelease}</code></> : null}.
                </dd>
              </div>
              <div>
                <dt>ElectronX product terms</dt>
                <dd>The published specification of the hourly contract: range, tick, size, fees and settlement. Terms only, no market data.</dd>
              </div>
              <div>
                <dt>HiGHS</dt>
                <dd>The open-source solver for linear and mixed-integer programs.</dd>
              </div>
              <div>
                <dt>Living Brain</dt>
                <dd>The agents' memory, read back through its API for the Memory tab.</dd>
              </div>
              <div>
                <dt>BNB Smart Chain</dt>
                <dd>
                  Where GateRecord lives, at <Hash value={CONTRACT_ADDRESS} label="contract address" href={`https://bscscan.com/address/${CONTRACT_ADDRESS}`} /> on
                  both networks.
                </dd>
              </div>
              <div>
                <dt>BNB Greenfield</dt>
                <dd>Where the sealed day's files are published, each with its SHA-256, on Greenfield testnet.</dd>
              </div>
            </dl>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Go({ links }: { links: [string, string][] }) {
  return (
    <p className="hw-go">
      <span className="muted">See it in</span>
      {links.map(([to, label]) => (
        <Link key={to} to={to} className="hw-go__link">
          {label}
          <Glyph name="next" />
        </Link>
      ))}
    </p>
  );
}

function Facts({ day }: { day: DayIndex | null }) {
  return (
    <dl className="hw-facts">
      <div>
        <dt>Market</dt>
        <dd>ERCOT{day ? `, under ${day.regime}` : ""}</dd>
      </div>
      <div>
        <dt>Batteries</dt>
        <dd>{day ? <><span className="num">{formatInt(day.leafCount)}</span> with a sealed plan</> : "Every one with complete public data"}</dd>
      </div>
      <div>
        <dt>Chain</dt>
        <dd>BNB Smart Chain (chains 56 and 97)</dd>
      </div>
      <div>
        <dt>Source code</dt>
        <dd>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hw-out">
            MIT, on GitHub
            <Glyph name="popout" />
          </a>
        </dd>
      </div>
    </dl>
  );
}

interface Term {
  order: number;
  term: string;
  means: string;
  to: string;
  tab: string;
}

function terms(day: DayIndex | null): Term[] {
  const list: Omit<Term, "order">[] = [
    { term: "Starting grid", means: `Every battery with a sealed plan for the day${day ? `: ${formatInt(day.leafCount)} in the root` : ""}.`, to: "/fleet", tab: "Fleet" },
    { term: "Qualifying", means: "Agents plan tomorrow, before the gate.", to: "/battery", tab: "Battery" },
    { term: "Standings", means: "Every sealed plan of the day in one table, with fleet totals.", to: "/fleet", tab: "Fleet" },
    { term: "Pit wall", means: "One battery's plan in full: its limits, schedule, state of charge and the three plans compared.", to: "/battery", tab: "Battery" },
    { term: "Team data", means: "The agents' memory, kept in Living Brain.", to: "/agents/memory", tab: "Memory" },
    { term: "Parc fermé", means: "The seal: the day's root on BNB Chain before the 10:00 CT gate. No plan changes after it; a late commit reverts.", to: "/seal", tab: "Seal" },
    { term: "Race day", means: "The operating day the plans are for, 00:00 to 24:00 CT.", to: "/overview", tab: "Overview" },
    { term: "Stewards", means: "The check anyone can run on any plan, in the browser.", to: "/verify", tab: "Verify" },
    { term: "Paddock", means: "How the parts fit: this page.", to: "/about", tab: "How It Works" },
    { term: "Garage", means: "How another agent enters and seals plans of its own.", to: "/about/agents", tab: "Add Your Agent" },
  ];
  return list.map((t, order) => ({ ...t, order }));
}

const COLUMNS: Column<Term>[] = [
  { key: "term", label: "Grand Prix term", value: (t) => t.term, render: (t) => <b className="hw-term">{t.term}</b>, width: "11rem" },
  { key: "means", label: "What it means here", value: (t) => t.means, sortable: false },
  {
    key: "tab",
    label: "Tab",
    value: (t) => t.tab,
    width: "10rem",
    render: (t) => (
      <Link to={t.to} className="hw-go__link">
        {t.tab}
        <Glyph name="next" />
      </Link>
    ),
  },
];

function Glossary({ day }: { day: DayIndex | null }) {
  return <Table className="hw-glossary" columns={COLUMNS} rows={terms(day)} rowKey={(t) => t.term} caption="Sort by term or tab; a third click returns the story's order." />;
}
