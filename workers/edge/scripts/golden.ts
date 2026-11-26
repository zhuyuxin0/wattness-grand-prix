// The repository verifier's results that the Worker's verdict is tested against.
//
//   node scripts/golden.ts --record   reads GateRecord on both chains through public RPC (eth_call and a
//                                     receipt lookup, nothing signed or sent) and writes the answers to
//                                     test/fixtures/chain.json, then runs the step below
//   node scripts/golden.ts            replays chain.json through packages/verifier's verify() and writes
//                                     its V1, V2 and V3 to test/fixtures/verifier.json
//
// The verifier reads the chain through the same clientReader as its CLI, over a transport that answers
// from chain.json, so the Worker's tests and this file see the same chain. It needs the root workspace
// installed and built: from the repository root, pnpm install && pnpm --filter "@gatelock/verifier..." build.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { changeOneDigit, ONE_DIGIT } from "../test/tamper.ts";

const REPO = new URL("../../../", import.meta.url);
const HERE = new URL("../", import.meta.url);
const at = (base: URL, rel: string) => fileURLToPath(new URL(rel, base));
const json = (path: string): any => JSON.parse(readFileSync(path, "utf8"));

const verifier = await import(new URL("packages/verifier/dist/index.js", REPO).href);
const core = await import(new URL("packages/core/dist/index.js", REPO).href);
const viem = createRequire(at(REPO, "packages/verifier/package.json"))("viem");

const NETWORKS = ["bsc-mainnet", "bsc-testnet"] as const;
type Network = (typeof NETWORKS)[number];
const RPC: Record<Network, string> = {
  "bsc-mainnet": "https://bsc-dataseed.bnbchain.org",
  "bsc-testnet": "https://bsc-testnet-dataseed.bnbchain.org",
};
const DAY = "fixtures/od-20261126/";
const BATTERY = "DSWL_ESS_ESR1";
/** GateRecord was deployed on 25 Nov, after this day's gate had passed, so no record of it can exist. */
const NO_RECORD_OD = 20261120;
const CHAIN_FIXTURE = at(HERE, "test/fixtures/chain.json");
const GOLDEN = at(HERE, "test/fixtures/verifier.json");

interface Answer {
  method: string;
  to?: string;
  data?: string;
  hash?: string;
  result: unknown;
}

const keyOf = (a: { method: string; to?: string; data?: string; hash?: string }) => [a.method, a.to ?? "", a.data ?? "", a.hash ?? ""].join("|");
function answerOf(method: string, params: any[] | undefined, result: unknown): Answer {
  if (method === "eth_call") return { method, to: String(params?.[0]?.to).toLowerCase(), data: String(params?.[0]?.data).toLowerCase(), result };
  if (method === "eth_getTransactionReceipt") return { method, hash: String(params?.[0]).toLowerCase(), result };
  return { method, result };
}

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

function client(answers: Answer[], network: Network, record: boolean) {
  const known = new Map(answers.map((a) => [keyOf(a), a]));
  return viem.createPublicClient({
    transport: viem.custom({
      async request({ method, params }: { method: string; params?: any[] }) {
        const probe = answerOf(method, params, null);
        if (!record) {
          const hit = known.get(keyOf(probe));
          if (!hit) throw new Error(`not in chain.json: ${keyOf(probe)}`);
          return hit.result;
        }
        const result = await rpc(RPC[network], method, params ?? []);
        const answer = answerOf(method, params, result);
        if (!known.has(keyOf(answer))) {
          known.set(keyOf(answer), answer);
          answers.push(answer);
        }
        return result;
      },
    }),
  });
}

const index = json(at(REPO, `${DAY}manifest.json`));
const leafText = readFileSync(at(REPO, `${DAY}leaves/${BATTERY}.json`), "utf8");
const scenarios = json(at(REPO, `${DAY}leaves/${BATTERY}.scenarios.json`));

async function runVerifier(network: Network, answers: Answer[], record: boolean, manifestText: string) {
  const { position, proof } = core.leafOf(index, BATTERY);
  const contract = json(at(REPO, `contracts/deployments/${network}.json`)).address;
  const results = await verifier.verify({
    manifest: JSON.parse(manifestText),
    scenarios,
    record: json(at(REPO, `${DAY}record.${network}.json`)),
    scopeLabel: index.scope_label,
    inclusion: { index: position, size: index.leaf_count, proof },
    fleet: index,
    outsideFile: () => null,
    chain: { reader: verifier.clientReader(client(answers, network, record)), network: verifier.NETWORKS[network], contract },
    sources: null,
  });
  const pick = (id: string) => {
    const r = results.find((x: { id: string }) => x.id === id);
    return { status: r.status, details: r.details };
  };
  return { V1: pick("V1"), V2: pick("V2"), V3: pick("V3") };
}

/** The Worker's own reads beyond the verifier's: the head block, the commit receipts, and a day no record can hold. */
async function recordWorkerReads(network: Network, answers: Answer[]) {
  const c = client(answers, network, true);
  await c.request({ method: "eth_blockNumber", params: [] });
  await c.request({ method: "eth_getTransactionReceipt", params: [json(at(REPO, `${DAY}record.${network}.json`)).txHash] });
  const contract = json(at(REPO, `contracts/deployments/${network}.json`)).address;
  const scope = core.scopeId(core.PLAN_SCOPE_LABEL);
  const committer = JSON.parse(leafText).agent.wallet;
  const key = core.recordKey(committer, scope, NO_RECORD_OD);
  const abi = verifier.GATE_RECORD_ABI;
  for (const [functionName, args] of [
    ["keyOf", [committer, scope, NO_RECORD_OD]],
    ["get", [key]],
    ["gateTs", [NO_RECORD_OD]],
  ] as const) {
    await c.request({ method: "eth_call", params: [{ to: contract, data: viem.encodeFunctionData({ abi, functionName, args }) }, "latest"] });
  }
}

const recording = process.argv.includes("--record");
const fixture: { schema: string; recorded: string; rpc: Record<Network, string>; networks: Record<Network, Answer[]> } = recording
  ? { schema: "gate-record.edge-chain-fixture.v1", recorded: new Date().toISOString(), rpc: RPC, networks: { "bsc-mainnet": [], "bsc-testnet": [] } }
  : json(CHAIN_FIXTURE);

if (recording) {
  for (const network of NETWORKS) {
    await runVerifier(network, fixture.networks[network], true, leafText);
    await recordWorkerReads(network, fixture.networks[network]);
  }
  writeFileSync(CHAIN_FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`chain.json: ${NETWORKS.map((n) => `${fixture.networks[n].length} answers on ${n}`).join(", ")}`);
}

const cases: Record<string, unknown> = {};
for (const network of NETWORKS) {
  cases[`sealed on ${network}`] = { battery: BATTERY, network, tamper: null, results: await runVerifier(network, fixture.networks[network], false, leafText) };
}
cases["one changed digit on bsc-mainnet"] = {
  battery: BATTERY,
  network: "bsc-mainnet",
  tamper: ONE_DIGIT,
  results: await runVerifier("bsc-mainnet", fixture.networks["bsc-mainnet"], false, changeOneDigit(leafText)),
};
const golden = {
  schema: "gate-record.edge-verifier-golden.v1",
  produced_by: "packages/verifier verify() over fixtures/od-20261126, with each receipt as record.json and the chain answered from test/fixtures/chain.json",
  chain_recorded: fixture.recorded,
  cases,
};
writeFileSync(GOLDEN, `${JSON.stringify(golden, null, 2)}\n`);
for (const [name, c] of Object.entries(cases) as [string, { results: Record<string, { status: string }> }][]) {
  console.log(`${name}: ${Object.entries(c.results).map(([id, r]) => `${id} ${r.status}`).join(", ")}`);
}
