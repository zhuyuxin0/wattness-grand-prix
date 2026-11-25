import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CONTRACT_ADDRESS, REPO_URL, SOURCE_LINE } from "../../config";
import { useDay, type DayIndex } from "../../data";
import { isCapture } from "../../lib/capture";
import { formatDec1 } from "../../lib/format";
import { useSelectedBattery } from "../../shell/battery";
import { BATTERY_NAMES, BatteryPicker, Glyph, Hash, PageHeader, Ready, Section } from "../../ui";
import { Check, Verdict, type CheckState } from "./CheckCard";
import { useStewards } from "./useStewards";
import { NETWORKS } from "./verify/chain";
import type { CheckId } from "./verify/run";
import "./styles.css";

// Verify: the check anyone can run, in the browser. Commitment verified,
// inputs identified, model constraints checked and result reproduced are four
// separate claims; the page says which checks support which.

const IDS: CheckId[] = [1, 2, 3, 4, 5];
const FIXTURE = new Set(["CLO_ESR1", "DSWL_ESS_ESR1"]);
const hubLabel = (hub: string) => {
  const s = hub.replace(/^HB_/, "").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function downloadPlan(resource: string, doc: Record<string, unknown>) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${resource}.json`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function VerifyPage() {
  const day = useDay();
  return (
    <div className="page page--verify">
      <Ready state={day}>{(d) => <Verify day={d} />}</Ready>
    </div>
  );
}

function Verify({ day }: { day: DayIndex }) {
  const { "*": splat = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [carried, carry] = useSelectedBattery();
  const [again, setAgain] = useState(0);

  // A link names its battery (#/verify/<resource>); without one, the battery the
  // other tabs carry; else the day's showcase.
  const known = new Set(day.batteries.map((b) => b.resource));
  const resource = known.has(splat) ? splat : known.has(carried) ? carried : day.showcase;
  const battery = day.batteries.find((b) => b.resource === resource)!;
  const networkName = params.get("network") === "testnet" ? "testnet" : "mainnet";
  const network = NETWORKS[networkName];
  const tampered = params.get("tamper") === "1";

  // A battery named in the link carries to the other battery tabs.
  const linked = known.has(splat) ? splat : null;
  useEffect(() => {
    if (linked) carry(linked);
  }, [linked, carry]);

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
    const count = (s: string) => done.filter((id) => results[id]!.status === s).length;
    return { done: done.length, pass: count("pass"), fail: count("fail"), unread: count("unread") };
  }, [results]);
  const overall: CheckState = summary.done < IDS.length ? "running" : summary.fail > 0 ? "fail" : summary.unread > 0 ? "unread" : "pass";
  const overallWord =
    overall === "pass" ? "Verified" : overall === "fail" ? (tampered ? "The copy is caught" : "Does not match") : overall === "unread" ? "Chain not read" : "Checking";

  const inputs = state.sealed?.inputs as { release_id?: string; files?: unknown[]; live?: unknown[] } | undefined;
  const name = BATTERY_NAMES[resource];

  return (
    <>
      <PageHeader
        title="Check a plan against the chain"
        lede={
          <>
            Your browser recomputes one plan's leaf, follows its proof to the day's root, reads that root back from GateRecord on BNB Smart Chain (the record{" "}
            <Link to="/seal">Seal</Link> shows) and replays the battery's limits hour by hour. <Link to="/files">Files</Link> holds every sealed file for checking
            offline.
          </>
        }
      />

      <div className="battery-bar vf-bar" role="group" aria-label="What to check">
        <BatteryPicker
          batteries={day.batteries}
          value={resource}
          names={BATTERY_NAMES}
          onChange={(r) => {
            carry(r);
            navigate({ pathname: `/verify/${r}`, search: params.toString() });
          }}
        />
        <div className="vf-field" role="group" aria-label="Chain">
          <span className="vf-field__label">Chain</span>
          <div className="seg">
            {(["mainnet", "testnet"] as const).map((n) => (
              <button key={n} type="button" aria-pressed={networkName === n} onClick={() => setParam("network", n === "mainnet" ? null : n)}>
                {NETWORKS[n].short}
              </button>
            ))}
          </div>
        </div>
        <div className="vf-field" role="group" aria-label="What to check">
          <span className="vf-field__label">Check</span>
          <div className="seg">
            <button type="button" aria-pressed={!tampered} onClick={() => setParam("tamper", null)}>
              As sealed
            </button>
            <button type="button" aria-pressed={tampered} onClick={() => setParam("tamper", "1")}>
              One value changed
            </button>
          </div>
        </div>
        <button type="button" className="btn vf-again" onClick={() => setAgain((n) => n + 1)} disabled={state.phase === "running" || state.phase === "loading"}>
          <Glyph name="refresh" />
          Run again
        </button>
      </div>

      {state.phase === "error" && <p className="state state--error">{state.error}</p>}

      <section className={`vf-lead vf-lead--${overall}`} aria-label="The result" aria-live="polite">
        <div className="vf-lead__line">
          <span className="vf-lead__count num">
            {overall === "running" ? `${summary.done} of ${IDS.length} checks done` : `${summary.pass} of ${IDS.length} checks pass`}
          </span>
          <Verdict status={overall} label={overallWord} />
        </div>
        <p className="vf-lead__what">
          <span className="vf-lead__name">
            {tampered ? "A copy of the plan for " : "The sealed plan for "}
            {name ? (
              <>
                <b>{name}</b> <span className="muted">({resource})</span>
              </>
            ) : (
              <b className="mono">{resource}</b>
            )}
            {tampered ? ", with one hourly value changed" : ""}
          </span>
          <span className="vf-lead__facts num">
            {hubLabel(battery.hub)} hub · {formatDec1(battery.powerMw)} MW · {formatDec1(battery.energyMwh)} MWh · leaf {battery.index + 1} of {day.leafCount} · chain
            reads from {network.name} (chain {network.chainId})
          </span>
        </p>
        {overall === "unread" && <p className="vf-lead__note">The checks that need no chain all ran in your browser. The chain checks wait for a public node; run them again.</p>}
      </section>

      <ol className={`vf-checks${isCapture() ? " is-capture" : ""}`} key={state.run}>
        {IDS.map((id) => (
          <Check key={id} id={id} result={results[id]} tamper={state.tamper} onRetry={() => setAgain((n) => n + 1)} />
        ))}
      </ol>

      {tampered && state.tamper && (
        <div className="vf-restore">
          <p>
            The copy changes <code>{state.tamper.path}</code> and nothing else. The record on chain is untouched, so checks 3 and 4 still pass; the leaf, the proof and the
            energy balance in check 5 do not.
          </p>
          <button type="button" className="btn" onClick={() => setParam("tamper", null)}>
            Check the sealed plan
          </button>
        </div>
      )}

      <Section id="vf-claims" title="What a Pass Means" lede="Four claims, kept apart: the checks above support the first two; the leaf itself carries the other two.">
        <dl className="vf-claims">
          <div>
            <dt>
              Commitment verified <span>Checks 1 to 4</span>
            </dt>
            <dd>
              This exact plan is a leaf of the root that the agent's wallet committed to GateRecord on {network.short}, and the commit landed before 10:00 CT on the day
              before the operating day. Nobody, the agent included, could change it after the gate.
            </dd>
          </div>
          <div>
            <dt>
              Model constraints checked <span>Check 5</span>
            </dt>
            <dd>
              Every plan keeps the battery's rating, its state-of-charge window, its closing floor and its daily discharge cap in every hour, and the stated state of charge
              follows from the schedule exactly.
            </dd>
          </div>
          <div>
            <dt>
              Inputs identified <span>Named in the leaf</span>
            </dt>
            <dd>
              The plan names {inputs?.files ? inputs.files.length.toLocaleString("en-US") : "each of its"} release files and {inputs?.live ? inputs.live.length : "its"} live price
              snapshots by SHA-256, from Wattness Terminal release <code>{inputs?.release_id ?? day.inputsRelease}</code>. They are inside the leaf, so the commitment covers them
              too; the command-line verifier fetches each one and compares it.
            </dd>
          </div>
          <div>
            <dt>
              Result reproduced <span>Planner at code tree {day.codeTree.slice(0, 7)}</span>
            </dt>
            <dd>
              Run the planner at the code tree the record names, on the same inputs, and compare leaves. The planner uses no random numbers, so the same inputs and code give
              the same leaf.
            </dd>
          </div>
        </dl>
      </Section>

      <Section
        id="vf-cli"
        title="Run It Yourself"
        lede="The same checks from a terminal, with no browser in the loop."
        source={`GateRecord on BNB Smart Chain, read from each chain's receipt. ${SOURCE_LINE}`}
      >
        <div className="vf-cli">
          <div className="vf-cli__step">
            <h3>Any battery, with Python alone</h3>
            <p>Download the plan exactly as sealed. A second implementation of the leaf hash, in Python's standard library, checks it against the day's index.</p>
            <button type="button" className="btn" disabled={!state.sealed} onClick={() => state.sealed && downloadPlan(resource, state.sealed)}>
              Download the plan (JSON)
            </button>
            <pre className="vf-code">
              <code>{`python3 -I tools/verify_hash.py ${resource}.json \\
  --expect ${battery.leaf}`}</code>
            </pre>
          </div>
          <div className="vf-cli__step">
            <h3>Every check, with the full verifier</h3>
            <p>Every check on this page, plus the hedge accounting and a fetch of each named input from the release, for the batteries in the repository's fixture.</p>
            <pre className="vf-code">
              <code>{`git clone ${REPO_URL}
cd wattness-grand-prix && pnpm install
pnpm verify fixtures/od-20261126/manifest.json \\
  --network ${networkName === "mainnet" ? "bsc-mainnet" : "bsc-testnet"} \\
  --scope ${day.scopeLabel} \\
  --battery ${FIXTURE.has(resource) ? resource : day.showcase}`}</code>
            </pre>
          </div>
        </div>
        <p className="vf-contract">
          GateRecord <Hash value={CONTRACT_ADDRESS} href={`${network.explorer}/address/${CONTRACT_ADDRESS}`} label="contract address" /> on {network.short}. Its verified source
          is under <Link to="/about/agents">Add Your Agent</Link>.
        </p>
      </Section>
    </>
  );
}
