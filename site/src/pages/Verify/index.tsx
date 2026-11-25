import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CONTRACT_ADDRESS, REPO_URL, SHOWCASE } from "../../config";
import { useDay, type DayIndex } from "../../data";
import { isCapture } from "../../lib/capture";
import { formatDec1 } from "../../lib/format";
import { Hash, PageHeader, Ready, Section } from "../../ui";
import { CheckCard, Verdict } from "./CheckCard";
import { Picker } from "./Picker";
import { useStewards } from "./useStewards";
import { NETWORKS } from "./verify/chain";
import type { CheckId } from "./verify/run";
import "./styles.css";

// Stewards: the verifier anyone can run, in the browser. Commitment verified,
// inputs identified, model constraints checked and result reproduced are four
// separate claims; the page says which checks support which.

const IDS: CheckId[] = [1, 2, 3, 4, 5];
const FIXTURE = new Set(["CLO_ESR1", "DSWL_ESS_ESR1"]);

function downloadPlan(resource: string, doc: Record<string, unknown>) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${resource}.json`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StewardsPage() {
  const day = useDay();
  return (
    <div className="page page--stewards">
      <Ready state={day}>{(d) => <Stewards day={d} />}</Ready>
    </div>
  );
}

function Stewards({ day }: { day: DayIndex }) {
  const { "*": splat = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [again, setAgain] = useState(0);

  const known = new Set(day.batteries.map((b) => b.resource));
  const resource = known.has(splat) ? splat : day.showcase;
  const battery = day.batteries.find((b) => b.resource === resource)!;
  const networkName = params.get("network") === "testnet" ? "testnet" : "mainnet";
  const network = NETWORKS[networkName];
  const tampered = params.get("tamper") === "1";

  const state = useStewards(day, resource, network, CONTRACT_ADDRESS, tampered, again);
  const results = state.results;

  const setParam = (name: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(name);
    else next.set(name, value);
    setParams(next, { replace: true });
  };

  const summary = useMemo(() => {
    const done = IDS.filter((id) => results[id]);
    const pass = done.filter((id) => results[id]!.status === "pass").length;
    const fail = done.filter((id) => results[id]!.status === "fail").length;
    return { done: done.length, pass, fail };
  }, [results]);
  const overall = summary.done < IDS.length ? "running" : summary.fail > 0 ? "fail" : summary.pass === IDS.length ? "pass" : "unread";

  const inputs = state.sealed?.inputs as { release_id?: string; files?: unknown[]; live?: unknown[] } | undefined;

  return (
    <>
      <PageHeader
        title="Check any plan against the chain"
        lede="Every plan is one leaf of a root committed on BNB Smart Chain before the gate. This page recomputes the leaf in your browser, follows its proof to the root, reads the record back from the contract, and replays the battery's limits hour by hour."
      />

      <div className="st-bar" role="group" aria-label="What to check">
        <Picker
          batteries={day.batteries}
          value={resource}
          showcase={day.showcase}
          onPick={(r) => navigate({ pathname: `/verify/${r}`, search: params.toString() })}
        />
        <div className="st-seg" role="radiogroup" aria-label="Chain">
          <span className="st-picker__label">Chain</span>
          <div className="st-seg__opts">
            {(["mainnet", "testnet"] as const).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={networkName === n}
                className={`st-seg__opt${networkName === n ? " is-on" : ""}`}
                onClick={() => setParam("network", n === "mainnet" ? null : n)}
              >
                {NETWORKS[n].short}
              </button>
            ))}
          </div>
        </div>
        <div className="st-tamper">
          <span className="st-picker__label">Tamper test</span>
          <button
            type="button"
            role="switch"
            aria-checked={tampered}
            className={`st-switch${tampered ? " is-on" : ""}`}
            onClick={() => setParam("tamper", tampered ? null : "1")}
          >
            <span className="st-switch__track" aria-hidden="true">
              <span className="st-switch__thumb" />
            </span>
            <span>{tampered ? "Checking a changed copy" : "Change one hourly value"}</span>
          </button>
        </div>
        <button type="button" className="st-btn" onClick={() => setAgain((n) => n + 1)} disabled={state.phase === "running" || state.phase === "loading"}>
          Run again
        </button>
      </div>

      {state.phase === "error" && <p className="state state--error">{state.error}</p>}

      <section className={`st-board${tampered ? " is-tampered" : ""}`} aria-label="Stewards' report">
        <div className="st-board__battery">
          <div className="eyebrow">{tampered ? "Changed copy of the sealed plan" : "Sealed plan"}</div>
          <h2 className="st-board__name">{battery.resource === SHOWCASE.resource ? SHOWCASE.name : battery.resource}</h2>
          <dl className="st-board__facts">
            {battery.resource === SHOWCASE.resource && (
              <div>
                <dt>Resource</dt>
                <dd>{battery.resource}</dd>
              </div>
            )}
            <div>
              <dt>Node</dt>
              <dd>{battery.settlementPoint}</dd>
            </div>
            <div>
              <dt>Hub</dt>
              <dd>{battery.hub}</dd>
            </div>
            <div>
              <dt>Rating</dt>
              <dd className="num">
                {formatDec1(battery.powerMw)} MW · {formatDec1(battery.energyMwh)} MWh
              </dd>
            </div>
            <div>
              <dt>Leaf</dt>
              <dd className="num">
                {battery.index + 1} of {day.leafCount}
              </dd>
            </div>
          </dl>
        </div>
        <div className="st-board__score">
          <div className="st-board__digits num" aria-live="polite">
            <span className={overall === "fail" ? "is-bad" : overall === "pass" ? "is-ok" : ""}>{summary.pass}</span>
            <span className="st-board__of">/{IDS.length}</span>
          </div>
          <div className="st-board__verdict">
            <Verdict status={overall} />
            <span className="muted">{overall === "running" ? "checks running" : `checks pass${summary.fail ? `, ${summary.fail} fail` : ""}`}</span>
          </div>
        </div>
        <ol className="st-board__strip" aria-hidden="true">
          {IDS.map((id) => (
            <li key={id} className={`is-${results[id]?.status ?? "running"}`}>
              <span className="num">{String(id).padStart(2, "0")}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className={`st-checks${isCapture() ? " is-capture" : ""}`} key={state.run}>
        {IDS.map((id) => (
          <CheckCard key={id} id={id} result={results[id]} tamper={state.tamper} onRetry={() => setAgain((n) => n + 1)} />
        ))}
      </div>

      {tampered && state.tamper && (
        <div className="st-restore">
          <p>
            The copy changes <code>{state.tamper.path}</code> and nothing else. The record on chain is untouched, so checks 03 and 04 still pass; the leaf, the proof and the energy balance do not.
          </p>
          <button type="button" className="st-btn" onClick={() => setParam("tamper", null)}>
            Restore the sealed plan
          </button>
        </div>
      )}

      <Section kicker="What a pass means" title="Four claims, kept apart">
        <div className="st-claims">
          <div className="st-claims__item">
            <div className="st-claims__head">
              <span className="st-claim">Commitment verified</span>
              <span className="st-claims__by num">Checks 01 to 04</span>
            </div>
            <p>
              This exact plan is a leaf of the root that the agent's wallet committed to GateRecord on {network.short}, and the commit landed before 10:00 CT on the day before the operating day. Nobody, the agent included, could have changed it after the gate.
            </p>
          </div>
          <div className="st-claims__item">
            <div className="st-claims__head">
              <span className="st-claim">Model constraints checked</span>
              <span className="st-claims__by num">Check 05</span>
            </div>
            <p>
              Every arm keeps the battery's rating, its state-of-charge window, its closing floor and its daily discharge cap in every hour, and the stated state of charge follows from the schedule exactly.
            </p>
          </div>
          <div className="st-claims__item">
            <div className="st-claims__head">
              <span className="st-claim">Inputs identified</span>
              <span className="st-claims__by num">Named in the leaf</span>
            </div>
            <p>
              The plan names {inputs?.files ? inputs.files.length.toLocaleString("en-US") : "each of its"} release files and {inputs?.live ? inputs.live.length : "its"} live price snapshots by SHA-256, from Wattness Terminal release <code>{inputs?.release_id ?? "…"}</code>. Because they are inside the leaf, the commitment covers them too. The command-line verifier fetches each one and compares it.
            </p>
          </div>
          <div className="st-claims__item">
            <div className="st-claims__head">
              <span className="st-claim">Result reproduced</span>
              <span className="st-claims__by num">Planner at tree {day.codeTree.slice(0, 7)}</span>
            </div>
            <p>
              Run the planner at the code tree the record names, on the same inputs, and compare leaves. The planner uses no random numbers, so the same inputs and code give the same leaf.
            </p>
          </div>
        </div>
      </Section>

      <Section kicker="Run it yourself" title="The same checks, from the command line" source="GateRecord on BNB Smart Chain. Calculation and display: Wattness.">
        <div className="st-cli">
          <div className="st-cli__step">
            <div className="st-cli__head">
              <span className="eyebrow">Any battery</span>
              <button type="button" className="st-btn st-btn--ghost" disabled={!state.sealed} onClick={() => state.sealed && downloadPlan(resource, state.sealed)}>
                Download {resource}.json
              </button>
            </div>
            <p>The plan exactly as sealed. A second implementation of the leaf hash, in Python's standard library, checks it against the index:</p>
            <pre className="st-cli__block">
              <code>{`python3 -I tools/verify_hash.py ${resource}.json \\
  --expect ${battery.leaf}`}</code>
            </pre>
          </div>
          <div className="st-cli__step">
            <div className="st-cli__head">
              <span className="eyebrow">Full verifier</span>
            </div>
            <p>Every check on this page, plus the hedge accounting and a fetch of each named input from the release, for the batteries in the repository's fixture:</p>
            <pre className="st-cli__block">
              <code>{`git clone ${REPO_URL}
cd wattness-grand-prix && pnpm install
pnpm verify fixtures/od-20261126/manifest.json \\
  --network ${networkName === "mainnet" ? "bsc-mainnet" : "bsc-testnet"} \\
  --scope ${day.scopeLabel} \\
  --battery ${FIXTURE.has(resource) ? resource : day.showcase}`}</code>
            </pre>
          </div>
        </div>
        <p className="st-cli__contract">
          GateRecord <Hash value={CONTRACT_ADDRESS} href={`${network.explorer}/address/${CONTRACT_ADDRESS}`} label="contract address" /> on {network.short}. Its verified source is under <Link to="/about/agents">Add Your Agent</Link>.
        </p>
      </Section>
    </>
  );
}
