import { Link } from "react-router-dom";
import { REPO_URL } from "../../config";
import { fetchJson, useLoad, useReceipts } from "../../data";
import { formatInt } from "../../lib/format";
import { dualTime } from "../../lib/time";
import { Glyph, Hash, PageHeader, ParcFerme, Ready, Section } from "../../ui";
import { Code } from "./Code";
import "./styles.css";

// Garage: the agent that plans the grid, the contract it commits to, the code
// the record names, and how anyone enters an agent of their own.

interface Deployment {
  chainId: number;
  network: string;
  contract: string;
  address: string;
  txHash: string;
  blockNumber: number;
  deployer: string;
  deployedAt: number;
  compiler: string;
  runtimeCodeHash: string;
  explorer: string;
  sourcifyUrl: string;
}

interface GarageData {
  schema: "grand-prix.garage.v1";
  deployments: Deployment[];
  engine: { repo: string; commit: string; tree: string; solver: string; solver_package: string } | null;
  agent: { wallet: string } | null;
  manifestSchema: string | null;
  indexSchema: string;
  scopeLabel: string;
  codeTree: string;
  operatingDay: string;
}

const loadGarage = () => fetchJson<GarageData>("garage.json");

const AGENT_WALLET = "0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8";

export default function GaragePage() {
  const garage = useLoad(loadGarage, "garage");
  const receipts = useReceipts();

  return (
    <div className="page page--garage">
      <PageHeader
        title="Add Your Agent"
        lede="One agent wallet plans every battery on ERCOT's grid for tomorrow and commits the day to a contract that refuses anything after the gate. The contract is open: any agent can enter under its own wallet, with the same scope and schema."
      />
      <Ready state={garage}>
        {(g) => {
          const wallet = g.agent?.wallet ?? AGENT_WALLET;
          const commitUrl = g.engine ? `${REPO_URL}/tree/${g.engine.commit}` : REPO_URL;
          const codeHash = `0x${g.codeTree}${"0".repeat(24)}`;
          return (
            <>
              <Section kicker="The car" title="The agent">
                <div className="gr-agent">
                  <div className="gr-agent__id">
                    <span className="eyebrow">Agent wallet</span>
                    <Hash value={wallet} full label="agent wallet" className="gr-agent__wallet" />
                    <div className="gr-agent__links">
                      {g.deployments.map((d) => (
                        <a key={d.chainId} href={`${d.explorer}/address/${wallet}`} target="_blank" rel="noreferrer">
                          {d.chainId === 56 ? "BscScan" : "BscScan testnet"} <Glyph name="external" size={12} />
                        </a>
                      ))}
                    </div>
                  </div>
                  <dl className="gr-specs">
                    <div>
                      <dt>Signs</dt>
                      <dd>One commit per operating day: the day's root, its leaf count and the planner's code hash</dd>
                    </div>
                    <div>
                      <dt>Plans</dt>
                      <dd>Each battery's hourly charge and discharge for the next day, three arms, within the battery's limits</dd>
                    </div>
                    <div>
                      <dt>Solver</dt>
                      <dd className="mono">{g.engine ? `${g.engine.solver} (${g.engine.solver_package})` : "HiGHS"}</dd>
                    </div>
                    <div>
                      <dt>Reads</dt>
                      <dd>
                        The Wattness Terminal's public ERCOT release, every file named by its SHA-256 in the leaf
                      </dd>
                    </div>
                  </dl>
                </div>
              </Section>

              <Section
                kicker="Parc ferme"
                title="GateRecord, on both chains"
                lede="The contract computes the gate itself, 10:00 Central on the day before the operating day with daylight saving, and keeps one write-once record per committer, scope and day."
                source="Contract source: verified on Sourcify. Deployment records: contracts/deployments."
              >
                <div className="gr-chains">
                  {g.deployments.map((d) => {
                    const t = dualTime(d.deployedAt);
                    return (
                      <article key={d.chainId} className="gr-chain">
                        <header className="gr-chain__head">
                          <div>
                            <div className="eyebrow">
                              {d.chainId === 56 ? "Mainnet" : "Testnet"} · chain {d.chainId}
                            </div>
                            <h3>{d.chainId === 56 ? "BNB Smart Chain" : "BNB Smart Chain Testnet"}</h3>
                          </div>
                          <a className="gr-sourcify" href={d.sourcifyUrl} target="_blank" rel="noreferrer">
                            <Glyph name="check" size={12} />
                            Sourcify exact match
                            <Glyph name="external" size={11} />
                          </a>
                        </header>
                        <dl className="gr-rows">
                          <div>
                            <dt>{d.contract}</dt>
                            <dd>
                              <Hash value={d.address} full href={`${d.explorer}/address/${d.address}`} label="contract address" />
                            </dd>
                          </div>
                          <div>
                            <dt>Deployed</dt>
                            <dd className="num">
                              {t.ct} {t.yours && <span className="muted">{t.yours}</span>}
                            </dd>
                          </div>
                          <div>
                            <dt>Deploy tx</dt>
                            <dd>
                              <Hash value={d.txHash} href={`${d.explorer}/tx/${d.txHash}`} label="deploy transaction" />
                            </dd>
                          </div>
                          <div>
                            <dt>Block</dt>
                            <dd className="num">{formatInt(d.blockNumber)}</dd>
                          </div>
                          <div>
                            <dt>Compiler</dt>
                            <dd className="mono">solc {d.compiler}</dd>
                          </div>
                          <div>
                            <dt>Runtime code</dt>
                            <dd>
                              <Hash value={d.runtimeCodeHash} head={10} tail={6} label="runtime code hash" />
                            </dd>
                          </div>
                        </dl>
                      </article>
                    );
                  })}
                </div>
              </Section>

              <Section kicker="Scrutineering" title="The code hash in the record">
                <div className="gr-code">
                  <div className="gr-code__hash">
                    <span className="eyebrow">codeHash on chain</span>
                    <span className="gr-code__value mono">
                      <span className="is-tree">0x{g.codeTree}</span>
                      <span className="is-pad">{"0".repeat(24)}</span>
                    </span>
                    <span className="gr-code__parts">
                      <span>
                        <i className="is-tree" /> git tree, 20 bytes
                      </span>
                      <span>
                        <i className="is-pad" /> zero padding, 12 bytes
                      </span>
                    </span>
                  </div>
                  <div className="gr-code__text">
                    <p>
                      The record names the source tree of the planner that produced the day: git tree <code>{g.codeTree.slice(0, 12)}</code>, the tree of commit{" "}
                      <a href={commitUrl} target="_blank" rel="noreferrer">
                        <code>{g.engine?.commit.slice(0, 12) ?? ""}</code>
                      </a>
                      . The planner refuses to plan for a real chain from a dirty tree, so the hash covers exactly the code that ran.
                    </p>
                    <Code
                      label="Check it"
                      code={`git clone ${REPO_URL}
cd wattness-grand-prix
git rev-parse ${g.engine?.commit.slice(0, 7) ?? "HEAD"}^{tree}
# ${g.codeTree}`}
                    />
                    <Ready state={receipts}>
                      {(r) => (
                        <ul className="gr-code__receipts">
                          {r.receipts.map((x) => (
                            <li key={x.chainId}>
                              <ParcFerme state="sealed" size="sm" label={x.mainnet ? "Mainnet" : "Testnet"} />
                              <Hash value={x.codeHash} head={10} tail={4} label="code hash" />
                              <span className={x.codeHash.toLowerCase() === codeHash ? "gr-ok" : "gr-bad"}>
                                <Glyph name={x.codeHash.toLowerCase() === codeHash ? "check" : "cross"} size={12} />
                                {x.codeHash.toLowerCase() === codeHash ? "same tree" : "differs"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Ready>
                  </div>
                </div>
              </Section>

              <Entry scopeLabel={g.scopeLabel} manifestSchema={g.manifestSchema ?? "gate-record.manifest.v1"} indexSchema={g.indexSchema} contract={g.deployments[0]?.address ?? ""} />
            </>
          );
        }}
      </Ready>
    </div>
  );
}

const FIELDS: [string, string][] = [
  ["schema", "gate-record.manifest.v1"],
  ["operating_day, gate, plan_time", "the day, its gate and when the plan was made, in unix seconds"],
  ["battery", "resource, settlement_point, hub, max_power_kw, energy_kwh, and the route and SHA-256 it came from"],
  ["assumptions", "SOC window, round-trip efficiency, cycle cap, wear, contract limits, all in ppm or base units"],
  ["inputs", "the release id and every file read, each with its SHA-256"],
  ["forecast, scenarios", "the price outlook and the scenario set's method and digest"],
  ["instrument, risk", "the hedge's published terms and the objective"],
  ["arms", "for each of A, B, C: hourly kw, soc_ukwh and contracts, with expected, CVaR and objective in micro-USD"],
  ["selected_arm, engine, agent", "the arm chosen, the planner's repo, commit and tree, and the committing wallet"],
];

function Entry({ scopeLabel, manifestSchema, indexSchema, contract }: { scopeLabel: string; manifestSchema: string; indexSchema: string; contract: string }) {
  return (
    <Section
      kicker="Enter your own agent"
      title="Three things to match, one transaction to send"
      lede="GateRecord keys every record by its committer, so your agent's day sits beside this one and never collides with it. The stewards check yours the same way."
    >
      <div className="gr-entry">
        <div className="gr-step">
          <span className="gr-step__n num">01</span>
          <h3>Scope</h3>
          <p>
            Commit under <code>{scopeLabel}</code>: price-taking, energy-only day-ahead schedules for ERCOT batteries at their settlement points.
          </p>
          <dl className="gr-mini">
            <div>
              <dt>scope</dt>
              <dd className="mono">keccak256("{scopeLabel}")</dd>
            </div>
            <div>
              <dt>od</dt>
              <dd className="mono">the operating day as YYYYMMDD, e.g. 20261127</dd>
            </div>
            <div>
              <dt>key</dt>
              <dd className="mono">keccak256(abi.encode(committer, scope, od))</dd>
            </div>
            <div>
              <dt>deadline</dt>
              <dd>10:00 CT the day before; one record per key</dd>
            </div>
          </dl>
        </div>
        <div className="gr-step">
          <span className="gr-step__n num">02</span>
          <h3>Schema</h3>
          <p>
            One <code>{manifestSchema}</code> document per battery, integers only, units in the field names. Each leaf is <code>SHA-256(0x00 ‖ RFC 8785 JSON)</code>; the day's root is the RFC 6962 tree over the leaves ordered by resource, listed in a <code>{indexSchema}</code> index.
          </p>
          <ul className="gr-fields">
            {FIELDS.map(([k, v]) => (
              <li key={k}>
                <code>{k}</code>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="gr-step">
          <span className="gr-step__n num">03</span>
          <h3>Commit</h3>
          <p>Send the root before the gate from your agent's own wallet. Testnet first; the call is the same on mainnet.</p>
          <dl className="gr-mini">
            <div>
              <dt>function</dt>
              <dd className="mono">commit(bytes32 scope, uint32 od, bytes32 root, uint32 leafCount, bytes32 codeHash)</dd>
            </div>
            <div>
              <dt>codeHash</dt>
              <dd>your planner's git tree, left-aligned in 32 bytes</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="gr-examples">
        <Code
          label="With Foundry's cast"
          code={`OD=20261127
ROOT=0x...      # RFC 6962 root over your leaves
LEAVES=316      # number of leaves under it
TREE=$(git rev-parse HEAD^{tree})

cast send ${contract} \\
  "commit(bytes32,uint32,bytes32,uint32,bytes32)" \\
  $(cast keccak "${scopeLabel}") $OD $ROOT $LEAVES \\
  0x\${TREE}000000000000000000000000 \\
  --rpc-url https://bsc-testnet-dataseed.bnbchain.org \\
  --account my-agent`}
        />
        <Code
          label="With viem"
          code={`import { keccak256, toBytes } from "viem";

const hash = await wallet.writeContract({
  address: "${contract}",
  abi: gateRecordAbi, // contracts/abi/GateRecord.json
  functionName: "commit",
  args: [
    keccak256(toBytes("${scopeLabel}")),
    20261127,                 // od
    root,                     // bytes32
    leafCount,                // uint32
    \`0x\${tree}\${"0".repeat(24)}\`, // codeHash
  ],
});`}
        />
      </div>
      <p className="gr-after">
        After it lands, read it back with <code>get(key)</code>. The checks <Link to="/verify">Verify</Link> runs on this agent's plans apply to yours unchanged: recompute a leaf, walk its proof to your root, read your record. A commit after the gate reverts with <code>AfterGate(od, gate)</code>; a second one for the same key reverts with <code>AlreadyCommitted(key)</code>.
      </p>
    </Section>
  );
}
