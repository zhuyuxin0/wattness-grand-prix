import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ARM_IDS,
  OUTCOME_INDEX_SCHEMA,
  fleetIndexErrors,
  hoursInOperatingDay,
  leafHash,
  odFromIso,
  operatingDayStartTs,
  outcomeDocumentPath,
  outcomeIndexErrors,
  recordKey,
  scopeId,
  type FleetIndex,
  type Manifest,
  type Outcome,
  type OutcomeIndex,
} from "@gatelock/core";
import { assertOpenDay } from "@gatelock/data";
import { BaseError, ContractFunctionRevertedError, getAddress, isAddressEqual, zeroAddress, type Abi, type Address, type Hex } from "viem";
import type { ContractsLib } from "./contracts-lib.js";
import { buildOutcome, hedgeDayAheadMarkUusd, outcomeTree, PROVISIONAL_RT_METHOD, STAGE_NAMES, type Stage } from "./outcome.js";
import type { PriceSource } from "./outcome-prices.js";

export { OUTCOME_INDEX_SCHEMA };
export const ATTRIBUTION = "Data: ERCOT. Calculation and display: Wattness.";

/** Exit codes: 3 means the stage's prices are not published yet, which is a state, not a failure. */
export const EXIT = { ok: 0, refused: 1, notYet: 3 } as const;
export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

const RT_RULE: Record<Stage, string | null> = {
  1: null,
  2: PROVISIONAL_RT_METHOD,
  3: "each 15-minute interval: ERCOT's first-published real-time SPP at the hub (NP6-905-CD), as the release holds it",
};

export interface OutcomeRunOptions {
  repo: string;
  operatingDay: string;
  stage: Stage;
  network: string;
  rpc?: string;
  mainnet?: boolean;
  /** Without it the link is only simulated. */
  send?: boolean;
  /** The planned day's directory; defaults by network as the commit script does. */
  dir?: string;
  /** Where to write this stage's documents (default: <dir>/outcomes/stage-<n>). */
  out?: string;
  contract?: Address;
  prices: PriceSource;
  lib: ContractsLib;
  log?: (line: string) => void;
}

export interface OutcomeRunResult {
  code: ExitCode;
  root?: Hex;
  outDir?: string;
  txHash?: Hex;
}

interface Planned {
  dir: string;
  index: FleetIndex;
  manifests: Manifest[];
  wallet: Address;
  record: { chainId?: number; contract?: Address; key?: Hex; root?: Hex; leafCount?: number } | undefined;
}

export function defaultDayDir(repo: string, day: string, network: string): string {
  const base = `od-${day.replaceAll("-", "")}`;
  if (network === "localhost" || network === "local") return join(repo, "out", "local", base);
  const own = join(repo, "out", `${base}-${network}`);
  return network !== "bsc-mainnet" && existsSync(own) ? own : join(repo, "out", base);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, doc: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`);
  renameSync(tmp, path);
}

/** Re-hashes every leaf against the index, as the commit script did before sending the root. */
export function loadPlanned(dir: string, day: string): Planned {
  const indexPath = join(dir, "manifest.json");
  if (!existsSync(indexPath)) throw new Error(`no planned day at ${dir}`);
  const index = readJson<FleetIndex>(indexPath);
  const problems = fleetIndexErrors(index);
  if (index.operating_day !== day) problems.push(`index is for ${index.operating_day}, not ${day}`);
  const manifests: Manifest[] = [];
  const wallets = new Set<string>();
  for (const entry of index.leaves ?? []) {
    const m = readJson<Manifest>(join(dir, entry.manifest));
    if (leafHash(m) !== entry.leaf) problems.push(`${entry.resource}: ${entry.manifest} hashes to ${leafHash(m)}, index says ${entry.leaf}`);
    if (m.operating_day !== day) problems.push(`${entry.resource}: operating day ${m.operating_day}`);
    if (m.battery.resource !== entry.resource) problems.push(`${entry.resource}: manifest is for ${m.battery.resource}`);
    wallets.add(getAddress(m.agent.wallet));
    manifests.push(m);
  }
  if (wallets.size > 1) problems.push(`leaves name ${wallets.size} committers`);
  if (problems.length > 0) throw new Error(`refusing ${dir}:\n  ${problems.slice(0, 20).join("\n  ")}`);
  const recordPath = join(dir, "record.json");
  const record = existsSync(recordPath) ? readJson<Planned["record"]>(recordPath) : undefined;
  return { dir, index, manifests, wallet: [...wallets][0] as Address, record };
}

function describeRevert(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError && revert.data) {
      return `${revert.data.errorName}(${(revert.data.args ?? []).map(String).join(", ")})`;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

const usd = (uusd: number | null): string => (uusd === null ? "pending" : `${uusd < 0 ? "−" : ""}$${(Math.abs(uusd) / 1e6).toFixed(2)}`);

export async function runOutcome(o: OutcomeRunOptions): Promise<OutcomeRunResult> {
  const log = o.log ?? ((line: string) => console.log(line));
  const day = o.operatingDay;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`--od must be YYYY-MM-DD, got ${day}`);
  assertOpenDay(day);
  const od = odFromIso(day);
  const { lib, stage } = o;
  const network = lib.networkFrom({ network: o.network, rpc: o.rpc, mainnet: o.mainnet ?? false });
  const chainId = network.chain.id;

  const planned = loadPlanned(o.dir ?? defaultDayDir(o.repo, day, network.name), day);
  const { index, manifests, wallet, record } = planned;
  if (record?.chainId !== undefined && record.chainId !== chainId) {
    throw new Error(`${planned.dir}/record.json is for chain ${record.chainId}, not ${network.name} (${chainId}); pass --dir`);
  }
  if (record?.root && record.root.toLowerCase() !== index.root) throw new Error(`record.json root ${record.root} is not the index's ${index.root}`);

  const abi = readJson<Abi>(lib.contractsPath("abi/GateRecord.json"));
  const deployment = lib.readDeployment(lib.contractsPath(`deployments/${network.name}.json`));
  const contractRaw = o.contract ?? record?.contract ?? deployment?.address;
  if (!contractRaw) throw new Error(`no GateRecord address for ${network.name}: pass --contract or deploy first`);
  const contract = getAddress(contractRaw);

  const reader = lib.readerFor(network);
  await lib.assertChain(reader);
  const code = await reader.getCode({ address: contract });
  if (!code || code === "0x") throw new Error(`no code at ${contract} on ${network.name}`);
  const call = <T>(functionName: string, args: readonly unknown[]) => reader.readContract({ address: contract, abi, functionName, args }) as Promise<T>;

  const key = recordKey(wallet, scopeId(index.scope_label), od);
  if (record?.key && record.key.toLowerCase() !== key) throw new Error(`record.json key ${record.key}, the plan gives ${key}`);
  if ((await call<Hex>("keyOf", [wallet, scopeId(index.scope_label), od])) !== key) throw new Error("the contract's keyOf differs from the local key");
  const onChain = await call<{ root: Hex; committer: Address; leafCount: number }>("get", [key]);
  if (isAddressEqual(onChain.committer, zeroAddress)) throw new Error(`no record ${key} on ${network.name}; commit the plan first`);
  if (onChain.root !== index.root || Number(onChain.leafCount) !== index.leaf_count) {
    throw new Error(`the record on chain has root ${onChain.root} over ${onChain.leafCount} leaves; the plan has ${index.root} over ${index.leaf_count}`);
  }
  if (!isAddressEqual(onChain.committer, wallet)) throw new Error(`the record's committer is ${onChain.committer}, the plan names ${wallet}`);

  const [gate, dayEnd, head, linked] = await Promise.all([
    call<bigint>("gateTs", [od]),
    call<bigint>("dayEndTs", [od]),
    reader.getBlock(),
    call<{ hash: Hex; linkedAt: bigint }>("outcomeOf", [key, stage]),
  ]);
  const opensAt = stage === 1 ? gate : dayEnd;
  log(`network   ${network.name} (chain ${chainId}), GateRecord ${contract}`);
  log(`record    ${key}, root ${index.root} over ${index.leaf_count} leaves, committer ${wallet}`);
  log(`stage     ${stage} (${STAGE_NAMES[stage]}), opens ${lib.formatStamp(opensAt)}`);
  log(`chain     ${lib.formatStamp(head.timestamp)}${head.timestamp < opensAt ? `, ${opensAt - head.timestamp} s before the stage opens` : ""}`);

  const outDir = o.out ?? join(planned.dir, "outcomes", `stage-${stage}`);
  const linkPath = join(outDir, `link.${network.name}.json`);
  const localRoot = existsSync(join(outDir, "index.json")) ? readJson<{ root: Hex }>(join(outDir, "index.json")).root : undefined;
  if (linked.linkedAt !== 0n) {
    log(`linked    already, ${linked.hash} at ${lib.formatStamp(linked.linkedAt)}`);
    if (localRoot === linked.hash) {
      log(`matches   ${join(outDir, "index.json")}`);
      return { code: EXIT.ok, root: linked.hash, outDir };
    }
    log(localRoot ? `differs   ${join(outDir, "index.json")} holds ${localRoot}` : `missing   no documents at ${outDir} give this hash`);
    return { code: EXIT.refused, outDir };
  }

  const hours = hoursInOperatingDay(od);
  const prices = await o.prices({
    operatingDay: day,
    stage,
    dayStart: operatingDayStartTs(od),
    hours,
    nodes: manifests.map((m) => m.battery.settlement_point),
    hubs: [...new Set(manifests.map((m) => m.battery.hub))].sort(),
  });
  if (prices.kind === "not-yet") {
    log(`prices    not yet published${prices.releaseId ? ` in release ${prices.releaseId}` : ""}:`);
    for (const r of prices.reasons.slice(0, 10)) log(`  ${r}`);
    log("nothing written, nothing sent");
    return { code: EXIT.notYet };
  }

  const docs = manifests.map((m) => ({
    resource: m.battery.resource,
    manifest: m,
    doc: buildOutcome(m, index.root, stage, prices.leaf(m.battery.settlement_point, m.battery.hub)),
  }));
  const tree = outcomeTree(docs);

  // Documents a chain already links are never rewritten with another root.
  for (const f of existsSync(outDir) ? readdirSync(outDir).filter((n) => /^link\..+\.json$/.test(n)) : []) {
    const prev = readJson<{ root: Hex; network: string }>(join(outDir, f));
    if (prev.root !== tree.root) {
      throw new Error(`${join(outDir, f)}: stage ${stage} is linked on ${prev.network} with root ${prev.root}; these prices give ${tree.root}. Write elsewhere with --out`);
    }
  }
  writeStage(outDir, index, stage, docs, tree, prices.releaseId, prices.manifestSha256, prices.liveDay, (m, doc) =>
    summarize(m, doc, prices.hubDayAhead(m.battery.hub)),
  );
  log(`prices    release ${prices.releaseId}${prices.liveDay ? `, live day ${prices.liveDay.route}` : ""}`);
  log(`outcomes  ${tree.leaves.length} documents, root ${tree.root}`);
  log(`wrote     ${outDir}`);
  const showcase = docs.find((d) => d.resource === index.showcase);
  if (showcase) {
    const mark = prices.hubDayAhead(showcase.manifest.battery.hub);
    for (const id of ARM_IDS) {
      const a = showcase.doc.arms[id];
      const arm = showcase.manifest.arms[id];
      if (!a || !arm) continue;
      const beside = mark ? `; hedge at day-ahead hub prices ${usd(hedgeDayAheadMarkUusd(showcase.manifest, arm, mark))}, beside, not added` : "";
      log(`  ${showcase.resource} arm ${id}${showcase.manifest.selected_arm === id ? " (selected)" : ""}: net ${usd(a.net_uusd)} = energy ${usd(a.energy_uusd)} − wear ${usd(a.wear_uusd)} + hedge ${usd(a.hedge_uusd)} − fees ${usd(a.fees_uusd)}${beside}`);
    }
    log(`  ${ATTRIBUTION}`);
  }

  const args = [key, stage, tree.root] as const;
  try {
    await reader.simulateContract({ account: wallet, address: contract, abi, functionName: "linkOutcome", args });
  } catch (err) {
    log(`the contract refuses this link: ${describeRevert(err)}`);
    return { code: EXIT.refused, root: tree.root, outDir };
  }
  const [gas, gasPrice, balance] = await Promise.all([
    reader.estimateContractGas({ account: wallet, address: contract, abi, functionName: "linkOutcome", args }),
    reader.getGasPrice(),
    reader.getBalance({ address: wallet }),
  ]);
  log(`estimate  ${gas} gas at ${gasPrice} wei = ${lib.formatNative(gas * gasPrice, reader.chain)}; balance ${lib.formatNative(balance, reader.chain)}`);
  if (!o.send) {
    log("dry run   simulated linkOutcome; nothing sent");
    return { code: EXIT.ok, root: tree.root, outDir };
  }

  const account = lib.loadAccount(network);
  if (!isAddressEqual(account.address, wallet)) throw new Error(`the loaded key is ${account.address}; the record's committer is ${wallet}`);
  if (balance < gas * gasPrice) throw new Error("balance does not cover the link");
  const { request: signed } = await reader.simulateContract({ account, address: contract, abi, functionName: "linkOutcome", args });
  const txHash = await lib.signerFor(network, account).writeContract(signed);
  const receipt = await reader.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`linkOutcome ${txHash} reverted`);
  const back = await call<{ hash: Hex; linkedAt: bigint }>("outcomeOf", [key, stage]);
  if (back.hash !== tree.root) throw new Error(`the outcome read back is ${back.hash}, sent ${tree.root}`);
  writeJson(linkPath, {
    network: network.name,
    chainId,
    contract,
    key,
    stage,
    root: tree.root,
    leafCount: tree.leaves.length,
    txHash,
    blockNumber: Number(receipt.blockNumber),
    linkedAt: Number(back.linkedAt),
  });
  log(`tx        ${txHash}`);
  log(`block     ${receipt.blockNumber} at ${lib.formatStamp(back.linkedAt)}`);
  log(`gas used  ${receipt.gasUsed}`);
  log(`wrote     ${linkPath}`);
  return { code: EXIT.ok, root: tree.root, outDir, txHash };
}

interface LeafSummary {
  resource: string;
  selected_arm: string;
  arms: Record<string, { net_uusd: number | null; energy_uusd: number; wear_uusd: number; hedge_uusd: number | null; fees_uusd: number; hedge_da_mark_uusd: number | null } | null>;
}

function summarize(m: Manifest, doc: Outcome, hubDa: number[] | null): LeafSummary {
  const arms: LeafSummary["arms"] = {};
  for (const id of ARM_IDS) {
    const a = doc.arms[id];
    const arm = m.arms[id];
    arms[id] = a && arm ? { ...a, hedge_da_mark_uusd: hubDa ? hedgeDayAheadMarkUusd(m, arm, hubDa) : null } : null;
  }
  return { resource: m.battery.resource, selected_arm: m.selected_arm, arms };
}

function writeStage(
  outDir: string,
  index: FleetIndex,
  stage: Stage,
  docs: readonly { resource: string; manifest: Manifest; doc: Outcome }[],
  tree: ReturnType<typeof outcomeTree>,
  releaseId: string,
  manifestSha256: string,
  liveDay: { route: string; sha256: string } | null,
  summary: (m: Manifest, doc: Outcome) => LeafSummary,
): void {
  const outcomeIndex: OutcomeIndex = {
    schema: OUTCOME_INDEX_SCHEMA,
    operating_day: index.operating_day,
    stage,
    stage_name: STAGE_NAMES[stage],
    record_root: index.root,
    root: tree.root,
    leaf_count: tree.leaves.length,
    release_id: releaseId,
    manifest_sha256: manifestSha256,
    live_day: liveDay,
    physical_basis: "the schedule's energy at the settlement point's day-ahead SPP, the plan's own basis",
    hedge_settlement: docs[0]?.manifest.instrument.settlement ?? null,
    rt_rule: RT_RULE[stage],
    leaves: tree.leaves.map((l, i) => ({ resource: l.resource, leaf: l.leaf, plan_leaf: index.leaves[i]!.leaf, document: outcomeDocumentPath(l.resource) })),
  };
  // The verifier reads a battery's outcome by this index, so it must settle exactly the plan's leaves, in order.
  const problems = outcomeIndexErrors(outcomeIndex, index);
  if (problems.length > 0) throw new Error(`stage ${stage} outcome index does not match the plan:\n  ${problems.slice(0, 10).join("\n  ")}`);
  for (const d of docs) writeJson(join(outDir, outcomeDocumentPath(d.resource)), d.doc);
  writeJson(join(outDir, "summary.json"), {
    operating_day: index.operating_day,
    stage,
    stage_name: STAGE_NAMES[stage],
    root: tree.root,
    note: "net_uusd = energy − wear + hedge − fees. hedge_da_mark_uusd marks the hedge at the day-ahead hub price; it is shown beside the result and never added to it. Shadow plans computed from public data; the hedge is a scenario comparison at an assumed entry, not an executed trade.",
    attribution: ATTRIBUTION,
    leaves: docs.map((d) => summary(d.manifest, d.doc)),
  });
  // Written last: an index on disk means every document it lists is there.
  writeJson(join(outDir, "index.json"), outcomeIndex);
}
