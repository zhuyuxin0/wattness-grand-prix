// Agent IDs data: the record the page reads the chain against. The six roles'
// ERC-8004 identities, their cards on BNB Greenfield and the job between two of
// them come from contracts/deployments/agents.bsc-testnet.json; the evaluator
// (agent 2922), its hosting and its two jobs from the stack's integrations
// record (packages/world/src/stations/stack/integrations.json) and its
// wallet from WattnessEvaluator's studio.toml; every step of jobs 1871 and 1873,
// with their budgets and deliverables, from agent-jobs.json beside this file,
// read back from BSC testnet. Where two records name a transaction they must
// agree, or the build stops.
// Written to public/data/agents.json.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAddress } from "viem";

const lower = (s) => String(s).toLowerCase();

/** Unix seconds of "2026-11-25 14:37:22 CT" (Central, CST or CDT as the date has it). */
function ctUnix(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) CT$/.exec(text ?? "");
  if (!m) throw new Error(`agents: ${text} is not a CT time`);
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const offset = (t) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
  };
  let t = guess - offset(guess);
  t = guess - offset(t);
  return Math.round(t / 1000);
}

/** The six roles' plain names, as packages/agents/src/roles.ts gives them. */
function roleTitles(repo) {
  const p = join(repo, "packages", "agents", "src", "roles.ts");
  const out = {};
  if (existsSync(p)) for (const m of readFileSync(p, "utf8").matchAll(/id: "([a-z-]+)",\s*title: "([^"]+)"/g)) out[m[1]] = m[2];
  return out;
}

export default function agents({ repo, readJson, writeJson }) {
  const depPath = join(repo, "contracts", "deployments", "agents.bsc-testnet.json");
  const intPath = join(repo, "packages", "world", "src", "stations", "stack", "integrations.json");
  const tomlPath = join(repo, "packages", "adapters", "agent-studio", "WattnessEvaluator", "app", "agent", "studio.toml");
  const stepsPath = join(repo, "site", "scripts", "data", "agent-jobs.json");
  for (const p of [depPath, intPath, tomlPath, stepsPath]) {
    if (!existsSync(p)) {
      console.warn(`agents: ${p} is absent; agents.json is not written`);
      return;
    }
  }
  const dep = readJson(depPath);
  const studio = readJson(intPath).agent_studio;
  const steps = readJson(stepsPath);
  const toml = readFileSync(tomlPath, "utf8");
  const wallet = /\[wallet\][^[]*?\naddress = "(0x[0-9a-fA-F]{40})"/.exec(toml)?.[1];
  const price = /\[payments\.seller\][^[]*?\nprice_usd = "([0-9.]+)"/.exec(toml)?.[1];
  if (!wallet) throw new Error("agents: studio.toml names no [wallet] address");
  const titles = roleTitles(repo);

  const tx = (t) => ({ hash: t.hash, blockNumber: Number(t.blockNumber), blockTime: t.blockTime, from: getAddress(t.from), to: getAddress(t.to) });
  const runsIn = "packages/agent: the engine plays all six roles in one process before each gate";

  const roles = dep.agents.map((a) => ({
    agentId: a.agentId,
    role: a.role,
    title: titles[a.role] ?? a.role,
    wallet: a.owner,
    card: a.uri,
    cardSha256: a.cardSha256,
    cardStore: dep.cards.store,
    runs: { where: "planner", record: runsIn },
    registered: tx(a.transactions.register),
    uriSet: tx(a.transactions.setAgentURI),
  }));

  // The evaluator: registered with its registration file inline (a data: URI), then pointed at
  // the hosted runtime's agent card. Both steps were read back; the stack's record names them.
  const ev = steps.evaluator;
  const reg = ev.transactions.find((t) => t.step === "register");
  const uri = ev.transactions.find((t) => t.step === "setAgentURI");
  if (ev.agentId !== studio.agent_id) throw new Error(`agents: agent-jobs.json names agent ${ev.agentId}, the stack ${studio.agent_id}`);
  if (lower(reg.hash) !== lower(studio.registered.tx)) throw new Error("agents: the evaluator's registration differs from the stack's record");
  if (lower(uri.hash) !== lower(studio.hosted.uri_tx)) throw new Error("agents: the evaluator's URI update differs from the stack's record");
  if (lower(reg.from) !== lower(wallet)) throw new Error("agents: the evaluator was registered from another wallet than studio.toml's");
  const evaluator = {
    agentId: studio.agent_id,
    role: "evaluator",
    title: "Evaluator",
    wallet,
    priceUsd: price ? Number(price) : null,
    card: studio.hosted.agent_card,
    runs: {
      where: "hosted",
      record: "BNB Agent Studio's managed hosting deployed it to Amazon Bedrock AgentCore",
      backend: studio.hosted.backend,
      since: ctUnix(studio.hosted.since_ct),
      until: ctUnix(studio.hosted.until_ct),
    },
    registered: tx(reg),
    uriSet: tx(uri),
  };

  const parties = new Map([...roles, evaluator].map((a) => [lower(a.wallet), { agentId: a.agentId, role: a.role, title: a.title }]));
  const party = (address) => ({ address: getAddress(address), ...(parties.get(lower(address)) ?? { agentId: null, role: null, title: null }) });

  const j1872 = dep.jobs.find((j) => j.jobId === 1872);
  if (!j1872) throw new Error("agents: the deployment record has no job 1872");
  const jobs = [
    {
      jobId: 1872,
      task: "price-scenarios",
      served: "planner",
      client: party(j1872.client.address),
      provider: party(j1872.provider.address),
      token: j1872.token,
      amountWei: j1872.budget,
      deliverable: j1872.deliverable,
      fingerprint: "sha256",
      deliverableUrl: j1872.deliverableUrl,
      resource: j1872.resource,
      operatingDay: j1872.operatingDay,
      timing: j1872.timing,
      status: j1872.status,
      transactions: j1872.transactions.map((t) => ({ step: t.step, ...tx(t) })),
    },
  ];
  for (const s of steps.jobs) {
    const rec = studio.jobs.find((j) => j.id === s.jobId);
    if (!rec) throw new Error(`agents: the stack records no job ${s.jobId}`);
    const submit = s.transactions.find((t) => t.step === "submit");
    const settle = s.transactions.find((t) => t.step === "settle");
    if (lower(submit?.hash) !== lower(rec.submit_tx) || lower(settle?.hash) !== lower(rec.settle_tx)) {
      throw new Error(`agents: job ${s.jobId}'s submit or settle differs from the stack's record`);
    }
    const create = s.transactions.find((t) => t.step === "createJob");
    jobs.push({
      jobId: s.jobId,
      task: "evaluation",
      served: rec.hosted ? "hosted" : "local",
      client: party(create.from),
      provider: party(submit.from),
      token: dep.erc8183.paymentToken,
      amountWei: s.budgetWei,
      deliverable: s.deliverable,
      fingerprint: "keccak256",
      deliverableUrl: null,
      resource: "DSWL_ESS_ESR1",
      operatingDay: "2026-11-26",
      timing: "sealed",
      status: rec.status === "COMPLETED" ? "Completed" : rec.status,
      transactions: s.transactions.map((t) => ({ step: t.step, ...tx(t) })),
    });
  }
  jobs.sort((a, b) => a.jobId - b.jobId);

  writeJson(
    "agents.json",
    {
      schema: "grand-prix.agents-tab.v1",
      chainId: dep.chainId,
      network: dep.network,
      explorer: "https://testnet.bscscan.com",
      registry: dep.registry,
      erc8183: dep.erc8183,
      paymentToken: { address: dep.erc8183.paymentToken, symbol: "U", decimals: 18 },
      cards: dep.cards,
      seal: { contract: dep.seal.contract, address: dep.seal.address, chainIds: dep.seal.chainIds, scopeLabel: dep.seal.scopeLabel, committer: dep.seal.committer },
      agents: [evaluator, ...roles].sort((a, b) => a.agentId - b.agentId),
      jobs,
    },
    "contracts/deployments/agents.bsc-testnet.json, packages/world/src/stations/stack/integrations.json, studio.toml, site/scripts/data/agent-jobs.json",
  );
}
