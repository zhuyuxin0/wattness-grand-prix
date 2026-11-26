import { useState, type CSSProperties, type FocusEvent, type ReactNode } from "react";
import { useShowcaseManifest } from "../../data";
import { now } from "../../lib/capture";
import { dualTime } from "../../lib/time";
import { Glyph, Hash, Loading, PageHeader, Ready, Section, type CheckItem } from "../../ui";
import { LiveRead } from "../../ui/LiveRead";
import { ObjectStill } from "../../ui/ObjectStill";
import { TabIcon } from "../../ui/TabIcon";
import { Flow, shortDay, TabLink } from "../Battery/kit";
import { useAgents, useCards, useChain, useHostedCard, type Agent, type AgentsFile, type CardRead, type ChainState, type IdentityRead, type Job, type JobRead, type LiveState, type Party } from "./data";
import { FACES } from "./roles";
import { sponsors, useLogoRegistry } from "../TechStack/sponsors";
import { addressUrl, txUrl } from "./rpc";
import "./styles.css";

// Agent IDs: the seven agents' ERC-8004 identities on BSC testnet (the six
// roles of a day's plan and the evaluator), each read back from the registry
// in the browser and held to the record (contracts/deployments, the stack's
// integrations record); where each one runs, as the repository records it;
// and the ERC-8183 jobs between them, each with its operating day, who paid
// whom and every step.

const SOURCE = "Data: BSC testnet (chain 97), the ERC-8004 registry and the ERC-8183 commerce contract, read with eth_call; cards from BNB Greenfield. Display: Wattness.";

const ORDER = ["market-reader", "state-keeper", "forecaster", "hedger", "risk-officer", "planner", "evaluator"];

const STEP: Record<string, string> = {
  gas: "Gas sent to the planner",
  faucet: "Testnet U from the faucet",
  createJob: "Open the job",
  registerJob: "Register it with the evaluator router",
  setBudget: "Set the budget",
  approve: "Approve the U",
  fund: "Fund the escrow",
  submit: "Submit the deliverable",
  settle: "Settle: the escrow pays the provider",
};

const registryEntry = (f: AgentsFile, id: number) => `${f.explorer}/nft/${f.registry}/${id}`;
const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const word = (n: number) => WORDS[n] ?? String(n);
/** "1871", "1871 and 1873", "1871, 1872 and 1873" */
const listIds = (ids: number[]) => (ids.length <= 1 ? ids.join("") : `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}`);
/** "Nov 26", "Nov 26 and Nov 27": each role-to-role job's day, in order. */
const listDays = (days: string[]) => {
  const names = [...new Set(days)].sort().map(shortDay);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

/** The paid jobs in one sentence, from the record: the jobs between two roles by day, then the evaluations. */
function jobsSentence(f: AgentsFile): string {
  const roles = f.jobs.filter((j) => j.task === "price-scenarios");
  const evals = f.jobs.filter((j) => j.task === "evaluation");
  const parts: string[] = [];
  if (roles.length)
    parts.push(
      `${roles.length === 1 ? "one" : word(roles.length).toLowerCase()} between two roles, the planner buying Desert Willow's price scenarios from the forecaster for ${listDays(roles.map((j) => j.operatingDay))}`,
    );
  if (evals.length) parts.push(`${word(evals.length).toLowerCase()} evaluations of Desert Willow's ${listDays(evals.map((j) => j.operatingDay))} plan bought by Wattness's test wallet`);
  return `${word(f.jobs.length)} paid ERC-8183 jobs: ${parts.join(", and ")}.`;
}
const units = (wei: string | bigint, decimals: number) => {
  const v = typeof wei === "bigint" ? wei : BigInt(wei);
  const whole = v / 10n ** BigInt(decimals);
  const frac = (v % 10n ** BigInt(decimals)).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
};
const isErr = <T,>(x: T | { error: string } | undefined): x is { error: string } => !!x && typeof x === "object" && "error" in x;

function When({ unix, seconds = true }: { unix: number; seconds?: boolean }) {
  const t = dualTime(unix, { seconds });
  return (
    <span className="ids-when num">
      <span>{t.ct}</span>
      {t.yours && <span className="muted">{t.yours}</span>}
    </span>
  );
}

function Ok({ ok, yes, no }: { ok: boolean | null; yes: ReactNode; no: ReactNode }) {
  if (ok === null) return <span className="muted">not read</span>;
  return (
    <span className={`ids-ok${ok ? "" : " ids-ok--no"}`}>
      <Glyph name={ok ? "check" : "close"} />
      {ok ? yes : no}
    </span>
  );
}

export default function AgentIdsPage() {
  const state = useAgents();
  return (
    <div className="page page--agent-ids">
      <PageHeader
        title="Agent IDs"
        lede={
          <>
            Seven identities on the ERC-8004 registry on BSC testnet: the six roles of the planner's one process, registered on Nov 25 after the Nov 26 plan was sealed, and
            Wattness's own evaluator, which checks a sealed plan against its GateRecord commitment.{state.status === "ready" ? ` ${jobsSentence(state.data)}` : ""}
            <Flow>
              A plan's parts are on <TabLink to="/agents/forecast">Forecast</TabLink> to <TabLink to="/agents/risk">Risk</TabLink>; the check the evaluator sells is the one anyone
              can run on <TabLink to="/verify">Verify</TabLink>.
            </Flow>
          </>
        }
      />
      <Ready state={state} label="Loading the agents">
        {(f) => <Agents f={f} />}
      </Ready>
    </div>
  );
}

/** The jobs' Check it: each job's deliverable and every step's transaction, the parties without an ID, the contracts. */
function jobItems(f: AgentsFile): CheckItem[] {
  const items: CheckItem[] = [];
  for (const j of f.jobs) {
    items.push({
      kind: "hash",
      label: `Job ${j.jobId}: the deliverable's fingerprint`,
      value: j.deliverable,
      href: j.deliverableUrl,
      copy: `job ${j.jobId} deliverable fingerprint`,
      note: j.fingerprint === "sha256" ? "SHA-256 of the scenarios file's RFC 8785 canonical JSON" : "Keccak-256 of the deliverable's canonical JSON",
    });
    for (const t of j.transactions) items.push({ kind: "transaction", label: `Job ${j.jobId}: ${STEP[t.step] ?? t.step}`, value: t.hash, href: txUrl(t.hash), copy: `job ${j.jobId} ${t.step} transaction`, note: `Block ${t.blockNumber.toLocaleString("en-US")}` });
  }
  const buyers = new Set(f.jobs.flatMap((j) => [j.client, j.provider]).filter((p) => p.agentId == null).map((p) => p.address));
  for (const b of buyers) items.push({ kind: "address", label: "Wattness's test buyer wallet, with no agent ID", value: b, href: addressUrl(b), copy: "test buyer wallet" });
  items.push(
    { kind: "address", label: "The ERC-8183 commerce contract", value: f.erc8183.commerce, href: addressUrl(f.erc8183.commerce), copy: "commerce contract" },
    { kind: "address", label: "Its router", value: f.erc8183.router, href: addressUrl(f.erc8183.router), copy: "router" },
    { kind: "address", label: `The payment token, ${f.paymentToken.symbol}`, value: f.paymentToken.address, href: addressUrl(f.paymentToken.address), copy: "payment token" },
  );
  return items;
}

/** The identities' Check it: the registry, and each agent's wallet, registration and card update. */
function agentItems(f: AgentsFile): CheckItem[] {
  const items: CheckItem[] = [{ kind: "address", label: "The ERC-8004 registry", value: f.registry, href: addressUrl(f.registry), copy: "registry" }];
  for (const a of f.agents) {
    items.push(
      { kind: "address", label: `${a.title}'s wallet`, value: a.wallet, href: addressUrl(a.wallet), copy: `${a.title}'s wallet` },
      { kind: "transaction", label: `${a.title}: registered as agent ${a.agentId}`, value: a.registered.hash, href: txUrl(a.registered.hash), copy: "registration transaction" },
      { kind: "transaction", label: `${a.title}: its card's address set`, value: a.uriSet.hash, href: txUrl(a.uriSet.hash), copy: "URI update transaction" },
    );
  }
  return items;
}

function Agents({ f }: { f: AgentsFile }) {
  const { state, busy, failed, again } = useChain(f);
  const registry = useLogoRegistry();
  const cards = useCards(f.agents);
  const read = state.status === "ready" ? state.read : null;
  const agents = [...f.agents].sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role));
  return (
    <>
      <Section
        id="ids-agents"
        title="Seven Identities"
        builtWith={sponsors(registry, "bnbchain", { id: "agentstudio", caption: "Agent Studio" }, { id: "aws", caption: "AgentCore" })}
        check={{
          items: agentItems(f),
          status: state.status === "ready" ? "verified" : state.status === "loading" ? "checking" : null,
          how: "Each identity is read back from the registry on BSC testnet in your browser; each address and transaction opens on testnet.bscscan.com.",
        }}
        lede="An ID is a token on the registry, owned by the agent's own wallet and pointing to its card: what the agent reads, what it writes and the code that does it. Each is read back from the chain in your browser and held to the record. The six roles are deterministic code, with no language model, and all run in one process before each day-ahead gate; a handoff between two of them is an ERC-8183 job."
        source={
          <>
            {SOURCE} Record: contracts/deployments/agents.bsc-testnet.json for the six roles, the stack's integrations record for the evaluator; the registry's address is in Check
            it.{registry ? ` ${registry.note}` : ""}
          </>
        }
      >
        <ReadLine state={state} busy={busy} failed={failed} again={again} />
        <div className="ids-grid">
          {agents.map((a) => (
            <AgentCard key={a.agentId} f={f} a={a} id={read?.identities[a.agentId]} card={cards[a.agentId]} loading={state.status === "loading"} />
          ))}
        </div>
      </Section>

      <Section
        id="ids-jobs"
        title={`${word(f.jobs.length)} Paid Jobs`}
        builtWith={sponsors(registry, "bnbchain")}
        check={{
          items: jobItems(f),
          status: state.status === "ready" ? "verified" : state.status === "loading" ? "checking" : null,
          how: "Each job's client, provider, amount, deliverable and status are read back from the commerce contract on BSC testnet in your browser.",
        }}
        lede={`An ERC-8183 job escrows the client's payment, takes the provider's deliverable as a fingerprint on chain, and pays the provider when it settles. Each job here paid ${units(f.jobs[0]?.amountWei ?? "0", f.paymentToken.decimals)} ${f.paymentToken.symbol}, a testnet stablecoin with no cash value.`}
        source={
          <>
            {SOURCE} The commerce contract, its router and every step's transaction are in Check it. Steps:{" "}
            {(() => {
              const dep = f.jobs.filter((j) => j.task === "price-scenarios").map((j) => j.jobId);
              const read = f.jobs.filter((j) => j.task !== "price-scenarios").map((j) => j.jobId);
              return [
                dep.length ? `${dep.length === 1 ? "job" : "jobs"} ${listIds(dep)} from contracts/deployments/agents.bsc-testnet.json` : "",
                read.length ? `${read.length === 1 ? "job" : "jobs"} ${listIds(read)} from ${read.length === 1 ? "its" : "their"} receipts, read back on BSC testnet` : "",
              ]
                .filter(Boolean)
                .join("; ");
            })()}
            .
          </>
        }
      >
        <div className="ids-jobs">
          {f.jobs.map((j) => (
            <JobCard key={j.jobId} f={f} j={j} read={read?.jobs[j.jobId]} loading={state.status === "loading"} />
          ))}
        </div>
      </Section>

      <Section id="ids-what" title="What an ID Establishes" source="Display: Wattness.">
        <div className="ids-what">
          <p>
            Attribution, not personhood. An ID ties a role's wallet, its card and its record together, so a payment, a delivery or a seal signed by that wallet can be traced to the
            registered agent and to the code its card names. It does not say who runs the agent, that a person stands behind it, or that its plans are any good.
          </p>
          <p>
            Whether a plan was sealed before the gate is checked on <TabLink to="/verify">Verify</TabLink>; whether it is a good plan, on{" "}
            <TabLink to="/battery">Battery</TabLink> and <TabLink to="/agents/risk">Risk</TabLink>.
          </p>
        </div>
      </Section>
    </>
  );
}

/** The registry's live read: the shared loading bar, the shared stamp, or one muted line if no node answers. */
function ReadLine({ state, busy, failed, again }: { state: LiveState; busy: boolean; failed: boolean; again: () => void }) {
  if (state.status === "loading") return <Loading label="Reading BSC testnet" />;
  if (state.status === "error")
    return (
      <p className="ids-unread">
        No public BSC testnet node answered just now. The record below stands on its own.
        <button type="button" className="live-read__again" onClick={again} disabled={busy}>
          <Glyph name="refresh" />
          {busy ? "Reading" : "Read again"}
        </button>
      </p>
    );
  return (
    <LiveRead
      at={{ number: BigInt(state.read.block), time: state.read.blockTime }}
      rpc={state.read.rpc}
      busy={busy}
      error={failed ? new Error("No public BSC testnet node answered.") : null}
      onRefresh={again}
    />
  );
}

/** "Nov 25, 14:37 CT (Nov 26, 03:37 yours)": market time, the reader's beside it. */
function both(unix: number): string {
  const t = dualTime(unix, { seconds: false });
  return t.yours ? `${t.ct} (${t.yours})` : t.ct;
}

function hostingState(a: Agent): { hosted: boolean; since: number; until: number } | null {
  if (a.runs.where !== "hosted") return null;
  return { hosted: now() / 1000 < a.runs.until, since: a.runs.since, until: a.runs.until };
}

/** A role's icon: the stack's role glyph in its flow's color, or for the evaluator Verify's tab icon. */
function RoleIcon({ role, size = 18 }: { role: string; size?: number }) {
  const face = FACES[role];
  if (!face) return null;
  const style = { "--ids-icon-dark": face.color.dark, "--ids-icon-light": face.color.light } as CSSProperties;
  return (
    <span className="ids-icon" style={style} aria-hidden="true">
      {face.glyph ? (
        <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" focusable="false">
          <path d={face.glyph} />
        </svg>
      ) : (
        <TabIcon name="check-badge" size={size} />
      )}
    </span>
  );
}

function AgentCard({ f, a, id, card, loading }: { f: AgentsFile; a: Agent; id: ChainState["identities"][number] | undefined; card: CardRead | { error: string } | undefined; loading: boolean }) {
  const hosting = hostingState(a);
  const live = id && !isErr(id) ? (id as IdentityRead) : null;
  const allMatch = live ? live.matches.owner && live.matches.wallet && live.matches.uri && live.matches.role : null;
  const face = FACES[a.role];
  // the card hovered or focused: its instrument's loop plays over the still (ObjectStill decides whether loops play)
  const [active, setActive] = useState(false);
  const leave = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActive(false);
  };
  return (
    <article
      className={`ids-card${hosting ? " ids-card--hosted" : ""}`}
      aria-label={`${a.title}, agent ${a.agentId}`}
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={leave}
    >
      {face && (
        <ObjectStill
          className="ids-card__still"
          name={face.still}
          alt={face.alt}
          caption={face.scope}
          loop
          active={active}
          sizes={hosting ? "(max-width: 999px) calc(100vw - 32px), 46vw" : "(max-width: 719px) calc(100vw - 32px), (max-width: 1279px) 46vw, 440px"}
        />
      )}
      <div className="ids-card__body">
        <header className="ids-card__head">
          <RoleIcon role={a.role} />
          <div className="ids-card__titles">
            <h3 className="ids-card__name">{a.title}</h3>
            <span className="ids-card__id num">agent {a.agentId}</span>
          </div>
          <span className={`ids-runs${hosting ? " ids-runs--hosted" : ""}`}>{hosting ? (hosting.hosted ? "Hosted" : "Was hosted") : "In the planner's process"}</span>
        </header>
        {face && <p className="ids-card__does">{face.does}</p>}
        <p className="ids-card__reg">
          <a className="ids-link" href={registryEntry(f, a.agentId)} target="_blank" rel="noreferrer">
            Agent {a.agentId} on the registry, testnet.bscscan.com
            <Glyph name="popout" />
          </a>
          {live ? (
            <Ok ok={allMatch} yes={hosting ? "owner, wallet and card address as recorded" : "owner, wallet, card address and role as recorded"} no="differs from the record" />
          ) : loading ? (
            <span className="muted">reading</span>
          ) : (
            <span className="muted">not read</span>
          )}
        </p>
        <details className="ids-more">
          <summary>
            <Glyph name="caret" className="ids-more__caret" />
            {hosting ? "Wallet, card, registration and hosting" : "Wallet, card and registration"}
          </summary>
          <dl className="ids-rows">
            <div>
              <dt>Wallet</dt>
              <dd>
                <Hash value={a.wallet} href={addressUrl(a.wallet)} label={`${a.title}'s wallet`} />
              </dd>
            </div>
            <div>
              <dt>{hosting ? "Agent card" : "Card"}</dt>
              <dd>
                {hosting && !hosting.hosted ? (
                  <span className="muted">served while hosted; the address stays on chain</span>
                ) : (
                  <a className="ids-link" href={a.card} target="_blank" rel="noreferrer" title={a.card}>
                    {hosting ? "the hosted agent card" : `${a.card.split("/").slice(-1)[0]} on BNB Greenfield`}
                    <Glyph name="popout" />
                  </a>
                )}
                {!hosting &&
                  (card === undefined ? (
                    <span className="muted">hashing</span>
                  ) : isErr(card) ? (
                    <span className="muted">not checked</span>
                  ) : (
                    <Ok ok={card.matches} yes="its SHA-256 matches the record" no="its SHA-256 differs from the record" />
                  ))}
              </dd>
            </div>
            <div>
              <dt>Registered</dt>
              <dd>
                <When unix={a.registered.blockTime} seconds={false} />
                <Hash value={a.registered.hash} href={txUrl(a.registered.hash)} label="registration transaction" />
              </dd>
            </div>
            {hosting && (
              <div>
                <dt>Runs</dt>
                <dd className="ids-runs-text">
                  {a.runs.record}: {a.runs.where === "hosted" ? a.runs.backend : ""}. {hosting.hosted ? "Since" : "From"} {both(hosting.since)} {hosting.hosted ? "until" : "to"}{" "}
                  {both(hosting.until)}.
                </dd>
              </div>
            )}
          </dl>
          {hosting && <Hosted a={a} hosted={hosting.hosted} id={live} loading={loading} />}
        </details>
      </div>
    </article>
  );
}

function Hosted({ a, hosted, id, loading }: { a: Agent; hosted: boolean; id: IdentityRead | null; loading: boolean }) {
  const card = useHostedCard(a.card, hosted);
  const service = id?.registration?.services?.find((s) => s.endpoint === a.card);
  return (
    <dl className="ids-rows ids-rows--hosted">
      <div>
        <dt>On chain</dt>
        <dd>
          {id ? (
            <Ok ok={!!service} yes={`its registration file names the card as its ${service?.name ?? "A2A"} service${service?.version ? ` (${service.version})` : ""}`} no="its registration file names another card" />
          ) : (
            <span className="muted">{loading ? "reading" : "not read"}</span>
          )}
          <Hash value={a.uriSet.hash} href={txUrl(a.uriSet.hash)} label="URI update transaction" />
        </dd>
      </div>
      {hosted && (
        <div>
          <dt>Card, live</dt>
          <dd>
            {card === null ? (
              <span className="muted">fetching</span>
            ) : isErr(card) ? (
              <span className="muted">not fetched</span>
            ) : (
              <>
                <span>
                  <span className="mono">{card.name}</span>, A2A {card.protocolVersion}, skills {card.skills.join(" and ")}
                </span>
              </>
            )}
          </dd>
        </div>
      )}
      <div>
        <dt>Sells</dt>
        <dd>
          An evaluation of a sealed plan against its GateRecord commitment on BSC testnet, as an ERC-8183 job{a.priceUsd != null ? `, at $${a.priceUsd.toFixed(2)} in testnet U` : ""}.
        </dd>
      </div>
    </dl>
  );
}

function PartyName({ p }: { p: Party }) {
  if (p.agentId != null)
    return (
      <span className="ids-party">
        {p.role && FACES[p.role] && <RoleIcon role={p.role} size={14} />}
        {p.title} <span className="muted num">({p.agentId})</span>
      </span>
    );
  return (
    <span className="ids-party">
      Wattness's test buyer wallet, with no agent ID
    </span>
  );
}

/** How a job between two roles stands to its own day's seal: before or after it, from its steps' block times. */
function timingNote(j: Job): string | null {
  const day = shortDay(j.operatingDay);
  const sealUnix = j.sealed?.firstCommitUnix ?? null;
  const at = (step: string) => j.transactions.find((t) => t.step === step)?.blockTime ?? null;
  const open = at("createJob");
  const submit = at("submit");
  const settle = at("settle");
  if (sealUnix != null && open != null && submit != null && settle != null && submit < sealUnix) {
    const seal = dualTime(sealUnix, { date: false, seconds: false });
    return `Opened, funded and delivered before the ${day} record was sealed at ${seal.ct}${seal.yours ? ` (${seal.yours})` : ""}; settled after the seal.`;
  }
  if (j.timing === "sealed") return `Opened after the ${day} record was sealed; it delivers the scenarios as sealed.`;
  return null;
}

function JobCard({ f, j, read, loading }: { f: AgentsFile; j: Job; read: ChainState["jobs"][number] | undefined; loading: boolean }) {
  const manifest = useShowcaseManifest(j.resource);
  const live = read && !isErr(read) ? (read as JobRead) : null;
  // The digest the job's own day sealed: the published leaf when it is that day's, else the build's read of that day's record.
  const sameDay = manifest.status === "ready" && manifest.data.operating_day === j.operatingDay;
  const digest =
    j.fingerprint !== "sha256"
      ? null
      : sameDay && manifest.status === "ready"
        ? `0x${manifest.data.scenarios.digest_sha256.replace(/^0x/, "")}`
        : (j.sealed?.scenariosDigest ?? null);
  const day = shortDay(j.operatingDay);
  const amount = `${units(j.amountWei, f.paymentToken.decimals)} ${f.paymentToken.symbol}`;
  const allMatch = live ? live.matches.parties && live.matches.amount && live.matches.deliverable && live.matches.status : null;
  const served =
    j.served === "planner"
      ? "Between two roles of the planner's process, each signing with its own wallet."
      : j.served === "hosted"
        ? "Served from the evaluator's hosted runtime on Amazon Bedrock AgentCore."
        : "Served by the evaluator run locally.";
  return (
    <article className="ids-job" aria-label={`Job ${j.jobId}`}>
      <header className="ids-job__head">
        <div className="ids-job__titles">
          <h3 className="ids-job__name">
            Job <span className="num">{j.jobId}</span>
          </h3>
          <span className="ids-job__task">{j.task === "price-scenarios" ? `Desert Willow's price scenarios for ${day}` : `An evaluation of Desert Willow's ${day} plan`}</span>
        </div>
        <span className="ids-status">{live ? live.status : j.status}</span>
      </header>
      <p className="ids-job__paid">
        <PartyName p={j.client} /> paid <PartyName p={j.provider} /> <strong className="num">{amount}</strong>.
      </p>
      <dl className="ids-rows">
        <div>
          <dt>Deliverable</dt>
          <dd>
            <span className="muted">
              {j.fingerprint === "sha256"
                ? "The SHA-256 of the scenarios file's RFC 8785 canonical JSON."
                : "The Keccak-256 of the deliverable's canonical JSON: the request, the record's root and receipt, and the report with checks V1 to V10 and its SHA-256."}
            </span>
            {digest && (
              <Ok
                ok={digest.toLowerCase() === j.deliverable.toLowerCase()}
                yes={`equals the scenarios digest Desert Willow's sealed ${day} plan commits`}
                no={`differs from the scenarios digest Desert Willow's sealed ${day} plan commits`}
              />
            )}
          </dd>
        </div>
        <div>
          <dt>On chain</dt>
          <dd>
            {live ? (
              <Ok ok={allMatch} yes="client, provider, amount, deliverable and status as recorded" no="differs from the record" />
            ) : (
              <span className="muted">{loading ? "reading" : "not read"}</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Served</dt>
          <dd>
            {served}
            {j.task === "price-scenarios" && timingNote(j) && <span className="muted">{timingNote(j)}</span>}
          </dd>
        </div>
      </dl>
      <StepList j={j} />
    </article>
  );
}

function StepList({ j }: { j: Job }) {
  const first = j.transactions[0]!;
  const day = dualTime(first.blockTime, { seconds: false });
  return (
    <div className="ids-steps-wrap">
      <p className="ids-steps__day num">
        Every step, {day.ct.replace(/, \d\d:\d\d CT$/, "")} CT{day.yours ? ` (${day.yours.replace(/, \d\d:\d\d yours$/, "")} yours)` : ""}
      </p>
      <ol className="ids-steps">
        {j.transactions.map((t) => {
          const at = dualTime(t.blockTime, { date: false });
          return (
            <li key={t.hash}>
              <span className="ids-step__name">{STEP[t.step] ?? t.step}</span>
              <span className="ids-step__when num">
                {at.ct}
                {at.yours && <span className="muted"> · {at.yours}</span>}
              </span>
              <a className="ids-step__tx" href={txUrl(t.hash)} target="_blank" rel="noreferrer" aria-label={`The ${STEP[t.step] ?? t.step} transaction on testnet.bscscan.com (opens in a new tab)`}>
                <Glyph name="popout" />
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
