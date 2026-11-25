// One job between two agents over ERC-8183 on BSC testnet: the planner (client)
// pays the forecaster (provider) for one battery's price scenarios; the
// forecaster submits the scenarios' canonical SHA-256, the value the battery's
// leaf commits as scenarios.digest_sha256; after the policy's dispute window the
// router completes the job and pays the forecaster.
//
//   node hire.ts open    --od YYYY-MM-DD --resource R --timing sealed|before-seal [--budget 0.1] [--send]
//   node hire.ts deliver --job N --dir <day folder> [--url URL] [--allow-unpublished] [--send]
//   node hire.ts settle  --job N [--wait] [--send]
//   node hire.ts status  --job N [--dir <day folder>]
//   node hire.ts run     --od YYYY-MM-DD --resource R --timing ... --dir <day folder> [--send]   open, deliver, wait, settle
//
// The day folder holds manifest.json and leaves/ (out/od-YYYYMMDD, or fixtures/od-20261126 for the sealed 26 Nov day).
// Before a seal, run open and deliver with --timing before-seal after `pnpm plan` and before `pnpm commit`; deliver
// refuses unless the leaf's digest is the file's and the leaf is in the index the root is built from.
// Without --send nothing is sent: the relay is asked about sponsorship and the first call is simulated.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileSha256, fleetIndexErrors, fleetRoot, leafHash, leafOf, odFromIso, recordKey, type FleetIndex } from "@gatelock/core";
import {
  checkDeliverable,
  commerceAbi,
  encodeSubmitParams,
  erc20Abi,
  jobDescription,
  jsonRpcCaller,
  policyAbi,
  readJob,
  routerAbi,
  scenariosDigest,
  scenariosFile,
  scenariosJobRequest,
  SCENARIOS_HASH_RULE,
  type AgentsDeployment,
  type JobRecord,
  type JobStep,
  type JobTiming,
  type RoleId,
} from "@gatelock/agents";
import { encodeFunctionData, formatUnits, getAddress, parseAbi, parseEventLogs, parseUnits, type Address, type Hex } from "viem";
import {
  appendLog,
  describeTx,
  evidenceDir,
  reader,
  readDeployment,
  roleAccount,
  roleKey,
  RPCS,
  say,
  sentTx,
  stamp,
  stop,
  tbnb,
  writeDeployment,
  writeEvidence,
  assertTestnet,
} from "./lib/common.ts";
import { execute, fundFromRecordWallet, sponsorable, type Call } from "./lib/sponsored.ts";

// The public U faucet the Studio runtime's funding hint links: 10 U per address per 30 minutes, no login.
const FAUCET: Address = "0x86e9197CC0F76E4e4aaa7082180945196bBAb5D3";
const faucetAbi = parseAbi(["function requestTokens()", "function allowedToWithdraw(address) view returns (bool)", "function tokenInstance() view returns (address)"]);
const gateRecordAbi = parseAbi([
  "function get(bytes32 key) view returns ((bytes32 root, bytes32 codeHash, bytes32 scope, address committer, uint32 od, uint32 leafCount, uint64 committedAt, uint64 blockNumber))",
]);
// Where the sealed days are published (scripts/greenfield): od-YYYYMMDD/leaves/<R>.scenarios.json.
const RECORD_STORE = "https://gnfd-testnet-sp3.nodereal.io/view/wattness-grand-prix-records";
const EXPIRY_SECONDS = 3 * 3600;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    od: { type: "string" },
    resource: { type: "string", default: "DSWL_ESS_ESR1" },
    timing: { type: "string" },
    budget: { type: "string", default: "0.1" },
    job: { type: "string" },
    dir: { type: "string" },
    url: { type: "string" },
    "allow-unpublished": { type: "boolean", default: false },
    wait: { type: "boolean", default: false },
    send: { type: "boolean", default: false },
    evidence: { type: "string" },
  },
});
const cmd = positionals[0] ?? "status";
const SEND = values.send;
const dir = SEND ? evidenceDir(values.evidence) : null;
const call = jsonRpcCaller(RPCS);

function agentOf(d: AgentsDeployment, id: RoleId): { agentId: number; owner: Address } {
  const a = d.agents.find((x) => x.role === id);
  if (!a || a.agentId === null) stop(`${id} has no agent id in the record; run register.ts first`);
  return { agentId: a.agentId, owner: getAddress(a.owner) };
}

function jobRecord(d: AgentsDeployment, jobId: number): JobRecord {
  const j = d.jobs.find((x) => x.jobId === jobId);
  if (!j) stop(`job ${jobId} is not in the record`);
  return j;
}

const funded = new Set<Address>();

/**
 * One call: ask the relay, fund the wallet once if the relay refuses, then send it (or simulate it without --send).
 * Every transaction sent, the funding included, is appended to `sink`.
 */
async function step(id: RoleId, name: JobStep["step"], c: Call, sink: JobStep[], jobId: number | null = null): Promise<JobStep | null> {
  const from = roleAccount(id).address;
  const data = encodeFunctionData({ abi: c.abi, functionName: c.functionName, args: c.args } as never);
  const s = await sponsorable(from, c.address, data);
  say(`${id}: ${name}: ${s.sponsorable ? "MegaFuel will sponsor it" : `MegaFuel refuses it${s.reason ? ` (${s.reason})` : ""}; self-paid`}`);
  if (!SEND) {
    await reader.call({ account: from, to: c.address, data });
    say(`${id}: ${name} simulated; nothing sent`);
    return null;
  }
  if (!s.sponsorable && !funded.has(from)) {
    const gasPrice = await reader.getGasPrice();
    const need = s.gas * gasPrice * 2n;
    if ((await reader.getBalance({ address: from })) < need) {
      const f = await fundFromRecordWallet(from, `${id} ${name} is not sponsored`);
      if (f) {
        appendLog(dir as string, { step: `gas for ${id}`, jobId, ...f });
        sink.push({ step: "gas", ...f });
      }
    }
    funded.add(from);
  }
  const hash = await execute(roleKey(id), c, `${id} ${name}`);
  const tx = await sentTx(hash);
  const entry: JobStep = { step: name, ...tx };
  sink.push(entry);
  appendLog(dir as string, { step: `${name} (${id})`, jobId, ...tx });
  say(`${id}: ${name} ${describeTx(tx)}`);
  return entry;
}

function saveJob(d: AgentsDeployment, record: JobRecord): void {
  const i = d.jobs.findIndex((x) => x.jobId === record.jobId);
  if (i >= 0) d.jobs[i] = record;
  else d.jobs.push(record);
  writeDeployment(d);
}

async function open(): Promise<number | null> {
  if (!values.od || !values.timing) stop("open needs --od and --timing sealed|before-seal");
  const timing = values.timing as JobTiming;
  if (timing !== "sealed" && timing !== "before-seal") stop(`--timing must be sealed or before-seal, got ${values.timing}`);
  const d = readDeployment();
  const planner = agentOf(d, "planner");
  const forecaster = agentOf(d, "forecaster");
  if (roleAccount("planner").address !== planner.owner || roleAccount("forecaster").address !== forecaster.owner) stop("the record's owners differ from the keys");
  const { commerce, router, policy, paymentToken } = d.erc8183;
  const token = await reader.readContract({ address: commerce, abi: commerceAbi, functionName: "paymentToken" });
  if (getAddress(token) !== getAddress(paymentToken)) stop(`the kernel pays in ${token}, the record says ${paymentToken}`);
  if (!(await reader.readContract({ address: router, abi: routerAbi, functionName: "policyWhitelist", args: [policy] }))) stop(`policy ${policy} is not whitelisted on the router`);
  const budget = parseUnits(values.budget, 18);
  const request = scenariosJobRequest({ operatingDay: values.od, resource: values.resource, clientId: planner.agentId, providerId: forecaster.agentId, timing });
  const description = jobDescription(request);
  const expiredAt = BigInt(Math.floor(Date.now() / 1000) + EXPIRY_SECONDS);
  say(`planner ${planner.agentId} hires forecaster ${forecaster.agentId}: ${values.resource} scenarios for ${values.od} (${timing}), ${values.budget} U`);

  const balanceU = await reader.readContract({ address: paymentToken, abi: erc20Abi, functionName: "balanceOf", args: [planner.owner] });
  const before = { plannerU: formatUnits(balanceU, 18), plannerTbnb: tbnb(await reader.getBalance({ address: planner.owner })) };
  const pre: JobStep[] = [];
  if (balanceU < budget) {
    if (getAddress(await reader.readContract({ address: FAUCET, abi: faucetAbi, functionName: "tokenInstance" })) !== getAddress(paymentToken)) stop("the faucet dispenses another token");
    if (!(await reader.readContract({ address: FAUCET, abi: faucetAbi, functionName: "allowedToWithdraw", args: [planner.owner] }))) stop("the U faucet is cooling down for the planner; retry within 30 minutes");
    await step("planner", "faucet", { address: FAUCET, abi: faucetAbi, functionName: "requestTokens", args: [] }, pre);
  }
  const created = await step("planner", "createJob", { address: commerce, abi: commerceAbi, functionName: "createJob", args: [forecaster.owner, router, expiredAt, description, router] }, pre);
  if (!created) return null;
  const rc = await reader.getTransactionReceipt({ hash: created.hash });
  const ev = parseEventLogs({ abi: commerceAbi, logs: rc.logs, eventName: "JobCreated" }).find((l) => getAddress(l.address) === getAddress(commerce));
  if (!ev) stop(`createJob ${created.hash} emitted no JobCreated`);
  const jobId = Number(ev.args.jobId);
  const record: JobRecord = {
    jobId,
    task: "price-scenarios",
    operatingDay: values.od,
    resource: values.resource,
    timing,
    client: { role: "planner", agentId: planner.agentId, address: planner.owner },
    provider: { role: "forecaster", agentId: forecaster.agentId, address: forecaster.owner },
    token: getAddress(paymentToken),
    budget: budget.toString(),
    expiredAt: Number(expiredAt),
    deliverable: null,
    deliverableUrl: null,
    status: "Open",
    transactions: pre,
  };
  saveJob(d, record);
  say(`job ${jobId} created`);
  const t = record.transactions;
  await step("planner", "registerJob", { address: router, abi: routerAbi, functionName: "registerJob", args: [BigInt(jobId), policy] }, t, jobId);
  await step("planner", "setBudget", { address: commerce, abi: commerceAbi, functionName: "setBudget", args: [BigInt(jobId), budget, "0x"] }, t, jobId);
  const allowance = await reader.readContract({ address: paymentToken, abi: erc20Abi, functionName: "allowance", args: [planner.owner, commerce] });
  if (allowance < budget) await step("planner", "approve", { address: paymentToken, abi: erc20Abi, functionName: "approve", args: [commerce, budget] }, t, jobId);
  await step("planner", "fund", { address: commerce, abi: commerceAbi, functionName: "fund", args: [BigInt(jobId), budget, "0x"] }, t, jobId);
  const job = await readJob(call, jobId, d.erc8183);
  if (job.status !== "Funded") stop(`job ${jobId} is ${job.status} after fund`);
  record.status = job.status;
  saveJob(d, record);
  writeEvidence(dir as string, `job-${jobId}-open.json`, {
    step: "ERC-8183 job opened and funded by the planner",
    jobId,
    request,
    description,
    budgetU: values.budget,
    expiredAt: stamp(Number(expiredAt)),
    before,
    after: {
      plannerU: formatUnits(await reader.readContract({ address: paymentToken, abi: erc20Abi, functionName: "balanceOf", args: [planner.owner] }), 18),
      plannerTbnb: tbnb(await reader.getBalance({ address: planner.owner })),
    },
    transactions: record.transactions.map((t) => ({ ...t, blockStamp: stamp(t.blockTime) })),
  });
  say(`job ${jobId} funded with ${values.budget} U`);
  return jobId;
}

interface DayFiles {
  index: FleetIndex;
  leaf: { operating_day: string; scenarios: { digest_sha256: string } };
  scenariosText: string;
  digest: string;
}

/** The day's files for one battery, with the digest checked from the file up to the index's root. */
function dayFiles(folder: string, resource: string, od: string): DayFiles {
  const root = resolve(folder);
  const index = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as FleetIndex;
  const problems = fleetIndexErrors(index);
  if (problems.length > 0) stop(`${folder}/manifest.json: ${problems.slice(0, 3).join("; ")}`);
  if (index.operating_day !== od) stop(`${folder} is the record of ${index.operating_day}, not ${od}`);
  const { entry } = leafOf(index, resource);
  const leaf = JSON.parse(readFileSync(join(root, entry.manifest), "utf8")) as DayFiles["leaf"];
  if (leafHash(leaf) !== entry.leaf) stop(`${entry.manifest} does not hash to the index's leaf`);
  if (fleetRoot(index.leaves) !== index.root) stop("the index's leaves do not give its root");
  if (entry.scenarios !== scenariosFile(resource)) stop(`the index names ${entry.scenarios} for ${resource}`);
  const scenariosText = readFileSync(join(root, entry.scenarios), "utf8");
  const digest = scenariosDigest(JSON.parse(scenariosText));
  if (digest !== leaf.scenarios.digest_sha256) stop(`${entry.scenarios} hashes to ${digest}; the leaf commits ${leaf.scenarios.digest_sha256}`);
  return { index, leaf, scenariosText, digest };
}

async function deliver(jobId: number): Promise<void> {
  if (!values.dir) stop("deliver needs --dir, the day folder with manifest.json and leaves/");
  const d = readDeployment();
  const record = jobRecord(d, jobId);
  const forecaster = agentOf(d, "forecaster");
  const job = await readJob(call, jobId, d.erc8183);
  if (job.status !== "Funded") stop(`job ${jobId} is ${job.status}; deliver needs Funded`);
  if (job.provider !== forecaster.owner) stop(`job ${jobId}'s provider is ${job.provider}, not the forecaster`);
  if (!job.request || job.request.resource !== record.resource || job.request.operating_day !== record.operatingDay) stop(`job ${jobId}'s request differs from the record`);
  const files = dayFiles(values.dir, record.resource, record.operatingDay);
  const sealed: Record<string, unknown> = {};
  if (record.timing === "sealed") {
    // The root that commits this digest is on GateRecord on BSC testnet, committed before the job was opened.
    const key = recordKey(d.seal.committer, d.seal.scopeId, odFromIso(record.operatingDay));
    const onChain = await reader.readContract({ address: d.seal.address, abi: gateRecordAbi, functionName: "get", args: [key] });
    if (onChain.root !== files.index.root) stop(`GateRecord holds root ${onChain.root} for ${record.operatingDay}; the folder's index has ${files.index.root}`);
    const opened = record.transactions.find((t) => t.step === "createJob");
    if (!opened || Number(onChain.committedAt) >= opened.blockTime) stop("the record was not committed before the job was opened");
    Object.assign(sealed, { key, root: onChain.root, leafCount: onChain.leafCount, committedAt: stamp(Number(onChain.committedAt)), recordBlock: Number(onChain.blockNumber) });
    say(`the ${record.operatingDay} root on GateRecord commits this digest (committed ${stamp(Number(onChain.committedAt)).ct})`);
  }
  const url = values.url ?? `${RECORD_STORE}/od-${record.operatingDay.replaceAll("-", "")}/${scenariosFile(record.resource)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
  let served: string | null = null;
  if (res?.ok) {
    const check = checkDeliverable({ deliverable: `0x${files.digest}` }, await res.text());
    if (!check.matches) stop(`${url} serves other scenarios (canonical SHA-256 ${check.digest})`);
    served = check.digest;
    say(`${url} serves the same scenarios`);
  } else if (!values["allow-unpublished"]) {
    stop(`${url} answers ${res?.status ?? "nothing"}; pass --allow-unpublished when it is published after the seal`);
  } else say(`${url} is not published yet (${res?.status ?? "no answer"}); its hash is on chain now`);
  const deliverable = `0x${files.digest}` as Hex;
  const optParams = encodeSubmitParams({ deliverable_url: url, hash: "sha256-rfc8785", resource: record.resource, operating_day: record.operatingDay });
  const sub = await step("forecaster", "submit", { address: d.erc8183.commerce, abi: commerceAbi, functionName: "submit", args: [BigInt(jobId), deliverable, optParams] }, record.transactions, jobId);
  if (!sub) return;
  const after = await readJob(call, jobId, d.erc8183);
  if (after.deliverable.toLowerCase() !== deliverable) stop(`the job records deliverable ${after.deliverable}`);
  record.deliverable = deliverable;
  record.deliverableUrl = url;
  record.status = after.status;
  saveJob(d, record);
  writeEvidence(dir as string, `job-${jobId}-deliver.json`, {
    step: "The forecaster delivers the battery's price scenarios",
    jobId,
    file: { folder: values.dir, path: scenariosFile(record.resource), bytesSha256: fileSha256(files.scenariosText) },
    hashRule: SCENARIOS_HASH_RULE,
    canonicalSha256: files.digest,
    leafDigest: files.leaf.scenarios.digest_sha256,
    indexRoot: files.index.root,
    sealed: record.timing === "sealed" ? sealed : "not yet: delivered before the seal",
    url,
    urlServesSameScenarios: served !== null,
    onChain: { deliverable: after.deliverable, status: after.status, submittedAt: stamp(after.submittedAt), settleAfter: after.settleAfter ? stamp(after.settleAfter) : null },
    transaction: { ...sub, blockStamp: stamp(sub.blockTime) },
  });
  say(`job ${jobId} submitted: deliverable ${deliverable}; settle after ${after.settleAfter ? stamp(after.settleAfter).ct : "?"}`);
}

async function settle(jobId: number): Promise<void> {
  const d = readDeployment();
  const record = jobRecord(d, jobId);
  let job = await readJob(call, jobId, d.erc8183);
  if (job.status !== "Submitted") stop(`job ${jobId} is ${job.status}; settle needs Submitted`);
  const after = job.settleAfter ?? 0;
  for (;;) {
    const now = Number((await reader.getBlock()).timestamp);
    if (now > after) break;
    if (!values.wait) stop(`the dispute window ends ${stamp(after).ct} / ${stamp(after).bangkok}; pass --wait to wait for it`);
    say(`waiting ${after - now + 5} s for the dispute window`);
    await new Promise((r) => setTimeout(r, Math.min(60, after - now + 5) * 1000));
  }
  const [verdict] = await reader.readContract({ address: d.erc8183.policy, abi: policyAbi, functionName: "check", args: [BigInt(jobId), "0x"] });
  if (verdict !== 1) stop(`the policy's verdict on job ${jobId} is ${verdict}, not approve`);
  const providerBefore = await reader.readContract({ address: record.token, abi: erc20Abi, functionName: "balanceOf", args: [record.provider.address] });
  const s = await step("planner", "settle", { address: d.erc8183.router, abi: routerAbi, functionName: "settle", args: [BigInt(jobId), "0x"] }, record.transactions, jobId);
  if (!s) return;
  job = await readJob(call, jobId, d.erc8183);
  if (job.status !== "Completed") stop(`job ${jobId} is ${job.status} after settle`);
  const providerAfter = await reader.readContract({ address: record.token, abi: erc20Abi, functionName: "balanceOf", args: [record.provider.address] });
  record.status = job.status;
  saveJob(d, record);
  writeEvidence(dir as string, `job-${jobId}-settle.json`, {
    step: "The router settles the job after the policy's dispute window: completed, the forecaster paid",
    jobId,
    verdict: "approve",
    status: job.status,
    forecasterU: { before: formatUnits(providerBefore, 18), after: formatUnits(providerAfter, 18) },
    transaction: { ...s, blockStamp: stamp(s.blockTime) },
  });
  say(`job ${jobId} completed; the forecaster's U went ${formatUnits(providerBefore, 18)} -> ${formatUnits(providerAfter, 18)}`);
}

async function status(jobId: number): Promise<void> {
  const d = readDeployment();
  const job = await readJob(call, jobId, d.erc8183);
  say(`job ${jobId}: ${job.status}, client ${job.client}, provider ${job.provider}, budget ${formatUnits(job.budget, 18)} U`);
  say(`request: ${job.request ? `${job.request.task} ${job.request.resource} ${job.request.operating_day} (${job.request.timing})` : "not ours"}`);
  say(`deliverable ${job.deliverable}${job.settleAfter ? `, settles after ${stamp(job.settleAfter).ct}` : ""}`);
  if (values.dir) {
    const files = dayFiles(values.dir, job.request?.resource ?? values.resource, job.request?.operating_day ?? values.od ?? "");
    say(`the day folder's scenarios ${checkDeliverable(job, files.scenariosText).matches ? "match" : "DO NOT match"} the deliverable`);
  }
}

await assertTestnet();
const jobArg = () => {
  const n = Number(values.job);
  if (!Number.isSafeInteger(n) || n <= 0) stop("--job N is required");
  return n;
};
switch (cmd) {
  case "open":
    await open();
    break;
  case "deliver":
    await deliver(jobArg());
    break;
  case "settle":
    await settle(jobArg());
    break;
  case "status":
    await status(jobArg());
    break;
  case "run": {
    const id = await open();
    if (id === null) break;
    await deliver(id);
    values.wait = true;
    await settle(id);
    break;
  }
  default:
    stop(`unknown command ${cmd}; use open, deliver, settle, status or run`);
}
