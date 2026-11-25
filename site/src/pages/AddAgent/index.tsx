import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { REPO_URL } from "../../config";
import { fetchJson, useLoad, useReceipts, type ChainReceipt } from "../../data";
import { formatInt } from "../../lib/format";
import { dualTime, formatOperatingDay } from "../../lib/time";
import { Glyph, Hash, PageHeader, Ready, Section } from "../../ui";
import { Code } from "./Code";
import "./styles.css";

// Add Your Agent: how any agent seals plans of its own against the same gate,
// then the reference it can check itself against: GateRecord on both chains,
// the agent that sealed the published day, and the code hash its record names.

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
const CHAIN_SOURCE = "Deployment records: contracts/deployments in the repository. Contract source: verified on Sourcify.";

const chainName = (id: number) => (id === 56 ? "BNB Smart Chain" : id === 97 ? "BNB Smart Chain Testnet" : `Chain ${id}`);

export default function AddAgentPage() {
  const garage = useLoad(loadGarage, "garage");
  const receipts = useReceipts();

  return (
    <div className="page page--add-agent">
      <PageHeader
        title="Add Your Agent"
        lede={
          <>
            GateRecord is open to any agent. It keys every record by its committer, so your agent's plans sit beside these and never collide with them: match the
            scope and the schema, then send one commit before the same 10:00 CT gate. Once your root is on chain, the checks on{" "}
            <Link to="/verify">Verify</Link> apply to your plans unchanged.
          </>
        }
      />
      <Ready state={garage}>
        {(g) => {
          const wallet = g.agent?.wallet ?? AGENT_WALLET;
          const contract = g.deployments[0]?.address ?? "";
          const manifestSchema = g.manifestSchema ?? "gate-record.manifest.v1";
          return (
            <>
              <Section title="Three Things to Match" lede="In this order: the scope your records sit under, the schema each plan is written in, and the one transaction that commits the day.">
                <Steps scopeLabel={g.scopeLabel} manifestSchema={manifestSchema} indexSchema={g.indexSchema} />
              </Section>

              <Section title="Send It" lede="The same call from the command line or from code. Testnet first; the call is the same on mainnet.">
                <div className="ag-examples">
                  <Code
                    label="With Foundry's cast"
                    code={`OD=20261127
ROOT=0x...      # RFC 6962 root over your leaves
LEAVES=316      # number of leaves under it
TREE=$(git rev-parse HEAD^{tree})

cast send ${contract} \\
  "commit(bytes32,uint32,bytes32,uint32,bytes32)" \\
  $(cast keccak "${g.scopeLabel}") $OD $ROOT $LEAVES \\
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
    keccak256(toBytes("${g.scopeLabel}")),
    20261127,                 // od
    root,                     // bytes32
    leafCount,                // uint32
    \`0x\${tree}\${"0".repeat(24)}\`, // codeHash
  ],
});`}
                  />
                </div>
                <p className="ag-after">
                  Read it back with <code>get(key)</code>. A commit after the gate reverts with <code>AfterGate(od, gate)</code>, and a second one for the same key
                  with <code>AlreadyCommitted(key)</code>. The checks <Link to="/verify">Verify</Link> runs on these plans apply to yours unchanged: recompute a leaf,
                  walk its proof to your root, read your record.
                </p>
              </Section>

              <Section title="GateRecord on Both Chains" lede="One address on both networks. The contract computes the gate itself and keeps one write-once record per committer, scope and day." source={CHAIN_SOURCE}>
                <Deployments list={g.deployments} />
              </Section>

              <Section
                title={`The Agent That Sealed the ${formatOperatingDay(g.operatingDay).replace(/^\w+, /, "").replace(/, \d{4}$/, "")} Plans`}
                lede="The reference entry: the wallet that committed the published day, and what it signs."
              >
                <div className="ag-agent">
                  <div className="ag-agent__id">
                    <span className="ag-label">Agent wallet</span>
                    <Hash value={wallet} full label="agent wallet" className="ag-agent__wallet" />
                    <span className="ag-agent__links">
                      {g.deployments.map((d) => (
                        <a key={d.chainId} href={`${d.explorer}/address/${wallet}`} target="_blank" rel="noreferrer" className="ag-out">
                          {d.chainId === 56 ? "BscScan" : "BscScan testnet"}
                          <Glyph name="popout" />
                        </a>
                      ))}
                    </span>
                  </div>
                  <dl className="ag-dl">
                    <div>
                      <dt>Signs</dt>
                      <dd>One commit per operating day: the day's root, its leaf count and the planner's code hash.</dd>
                    </div>
                    <div>
                      <dt>Plans</dt>
                      <dd>Each battery's hourly charge and discharge for the next day, within the battery's limits.</dd>
                    </div>
                    <div>
                      <dt>Solver</dt>
                      <dd>
                        {g.engine ? (
                          <>
                            {g.engine.solver} <code>{g.engine.solver_package}</code>
                          </>
                        ) : (
                          "HiGHS"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Reads</dt>
                      <dd>The Wattness Terminal's public ERCOT release, every file named by its SHA-256 in the leaf.</dd>
                    </div>
                  </dl>
                </div>
              </Section>

              <Section
                title="The Code Hash in the Record"
                lede="The record names the source tree of the planner that produced the day. The planner refuses to plan for a real chain from a tree with uncommitted changes, so the hash covers exactly the code that ran."
                source="Commits: GateRecord on BNB Smart Chain, read from each chain's receipt."
              >
                <CodeHash g={g} receipts={receipts.status === "ready" ? receipts.data.receipts : null} />
              </Section>
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
  ["arms", "for each plan A, B and C: hourly kw, soc_ukwh and contracts, with expected, CVaR and objective in micro-USD"],
  ["selected_arm, engine, agent", "the plan chosen, the planner's repo, commit and tree, and the committing wallet"],
];

function Steps({ scopeLabel, manifestSchema, indexSchema }: { scopeLabel: string; manifestSchema: string; indexSchema: string }) {
  return (
    <ol className="ag-steps">
      <li className="ag-step">
        <div className="ag-step__text">
          <h3>Match the scope</h3>
          <p>
            Commit under <code>{scopeLabel}</code>: price-taking, energy-only day-ahead schedules for ERCOT batteries at their settlement points.
          </p>
        </div>
        <dl className="ag-spec">
          <Row k="scope" v={<code>keccak256("{scopeLabel}")</code>} />
          <Row k="od" v={<>the operating day as YYYYMMDD, for example <code>20261127</code></>} />
          <Row k="key" v={<code>keccak256(abi.encode(committer, scope, od))</code>} />
          <Row k="deadline" v="10:00 CT on the day before; one record per key" />
        </dl>
      </li>
      <li className="ag-step">
        <div className="ag-step__text">
          <h3>Match the schema</h3>
          <p>
            One <code>{manifestSchema}</code> document per battery, integers only, units in the field names. Each leaf is <code>SHA-256(0x00 ‖ RFC 8785 JSON)</code>;
            the day's root is the RFC 6962 tree over the leaves ordered by resource, listed in a <code>{indexSchema}</code> index.
          </p>
        </div>
        <dl className="ag-spec">
          {FIELDS.map(([k, v]) => (
            <Row key={k} k={k} v={v} />
          ))}
        </dl>
      </li>
      <li className="ag-step">
        <div className="ag-step__text">
          <h3>Send the commit</h3>
          <p>Send the root from your agent's own wallet before the gate.</p>
        </div>
        <dl className="ag-spec">
          <Row k="function" v={<code>commit(bytes32 scope, uint32 od, bytes32 root, uint32 leafCount, bytes32 codeHash)</code>} />
          <Row k="codeHash" v="your planner's git tree, left-aligned in 32 bytes" />
        </dl>
      </li>
    </ol>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <dt>
        <code>{k}</code>
      </dt>
      <dd>{v}</dd>
    </div>
  );
}

function Deployments({ list }: { list: Deployment[] }) {
  const rows: { name: string; cell: (d: Deployment) => ReactNode }[] = [
    { name: "Address", cell: (d) => <Hash value={d.address} href={`${d.explorer}/address/${d.address}`} label="contract address" /> },
    {
      name: "Deployed",
      cell: (d) => {
        const t = dualTime(d.deployedAt);
        return (
          <span className="ag-time num">
            <span>{t.ct}</span>
            {t.yours && <span className="muted">{t.yours}</span>}
          </span>
        );
      },
    },
    { name: "Deploy transaction", cell: (d) => <Hash value={d.txHash} href={`${d.explorer}/tx/${d.txHash}`} label="deploy transaction" /> },
    { name: "Block", cell: (d) => <span className="num">{formatInt(d.blockNumber)}</span> },
    { name: "Compiler", cell: (d) => <code>solc {d.compiler}</code> },
    { name: "Runtime code", cell: (d) => <Hash value={d.runtimeCodeHash} head={10} tail={6} label="runtime code hash" /> },
    {
      name: "Source",
      cell: (d) => (
        <a href={d.sourcifyUrl} target="_blank" rel="noreferrer" className="ag-verified">
          <Glyph name="check" />
          Exact match on Sourcify
          <Glyph name="popout" />
        </a>
      ),
    },
  ];
  return (
    <div className="ag-cmp" role="table" aria-label="GateRecord's deployments">
      <div className="ag-cmp__row ag-cmp__row--head" role="row">
        <span role="columnheader">Field</span>
        {list.map((d) => (
          <span key={d.chainId} role="columnheader">
            {chainName(d.chainId)} <span className="ag-cmp__code">(chain {d.chainId})</span>
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.name} className="ag-cmp__row" role="row">
          <span role="rowheader" className="ag-cmp__field">
            {r.name}
          </span>
          {list.map((d) => (
            <span key={d.chainId} role="cell" className="ag-cmp__cell" data-chain={d.chainId === 56 ? "Mainnet" : "Testnet"}>
              {r.cell(d)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function CodeHash({ g, receipts }: { g: GarageData; receipts: ChainReceipt[] | null }) {
  const codeHash = `0x${g.codeTree}${"0".repeat(24)}`;
  const commitUrl = g.engine ? `${REPO_URL}/tree/${g.engine.commit}` : REPO_URL;
  return (
    <div className="ag-hash">
      <div className="ag-hash__value">
        <span className="ag-label">codeHash, as committed</span>
        <code className="ag-hash__code">
          <span>0x{g.codeTree}</span>
          <span className="ag-hash__pad">{"0".repeat(24)}</span>
        </code>
        <span className="ag-hash__parts">
          The git tree (20 bytes) <span className="muted">then zero padding (12 bytes)</span>
        </span>
        {receipts && (
          <ul className="ag-hash__receipts">
            {receipts.map((x) => {
              const same = x.codeHash.toLowerCase() === codeHash;
              return (
                <li key={x.chainId}>
                  <span className="ag-hash__chain">
                    {x.chainName} <span className="muted">(chain {x.chainId})</span>
                  </span>
                  <span className={same ? "ag-ok" : "ag-bad"}>
                    <Glyph name={same ? "check" : "close"} />
                    {same ? "Same tree" : "Differs"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="ag-hash__check">
        <p>
          Tree <code>{g.codeTree.slice(0, 12)}</code> is the tree of commit{" "}
          <a href={commitUrl} target="_blank" rel="noreferrer" className="ag-out">
            <code>{g.engine?.commit.slice(0, 12) ?? ""}</code>
            <Glyph name="popout" />
          </a>
          . Check it from a clone:
        </p>
        <Code
          label="Check it"
          code={`git clone ${REPO_URL}
cd ${REPO_URL.split("/").pop()}
git rev-parse ${g.engine?.commit.slice(0, 7) ?? "HEAD"}^{tree}
# ${g.codeTree}`}
        />
      </div>
    </div>
  );
}
