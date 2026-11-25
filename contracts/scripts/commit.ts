// Commits a planned day's root to GateRecord and writes record.json beside it.
//   commit --od 2026-11-26 [--dir out/od-20261126] [--network local|bsc-testnet] [--dry-run]
//   commit --test [--od 2099-12-31] [--scope gate-record/test]    a throwaway record to prove the contract
// The leaves are re-hashed from their files first, so the root sent is the one the files give.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  canonicalJson,
  codeHashFromCommit,
  fleetIndexErrors,
  leafHash,
  merkleRoot,
  recordKey,
  scopeId,
  type FleetIndex,
} from "@gatelock/core";
import { BaseError, ContractFunctionRevertedError, getAddress, isAddressEqual, type Address, type Hex } from "viem";
import { loadAccount } from "./lib/account.ts";
import { contractsPath } from "./lib/artifact.ts";
import { fail, NETWORK_OPTIONS, networkFrom } from "./lib/args.ts";
import { assertChain, formatNative, formatStamp, readerFor, signerFor } from "./lib/clients.ts";
import { readDeployment } from "./lib/deploy.ts";

const GATE_ABI = JSON.parse(readFileSync(contractsPath("abi/GateRecord.json"), "utf8")) as readonly unknown[];

export const TEST_SCHEMA = "gate-record.test.v1";

interface Planned {
  dir: string;
  od: number;
  scopeLabel: string;
  root: Hex;
  leafCount: number;
  codeHash: Hex;
  kind: string;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function odNumber(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`--od must be YYYY-MM-DD, got ${day}`);
  return Number(day.replaceAll("-", ""));
}

function repoRoot(): string {
  return resolve(contractsPath(""), "..");
}

/** Re-derives the root from the leaf files and checks the index agrees with every leaf. */
function loadPlanned(dir: string, day: string, wallet: Address): Planned {
  const index = readJson<FleetIndex>(join(dir, "manifest.json"));
  const problems = fleetIndexErrors(index);
  if (index.operating_day !== day) problems.push(`index is for ${index.operating_day}, not ${day}`);
  const kinds = new Set<string>();
  for (const entry of index.leaves ?? []) {
    const m = readJson<{ operating_day: string; kind: string; agent: { wallet: string }; engine: { tree: string } }>(join(dir, entry.manifest));
    if (leafHash(m) !== entry.leaf) problems.push(`${entry.resource}: ${entry.manifest} hashes to ${leafHash(m)}, index says ${entry.leaf}`);
    if (m.operating_day !== day) problems.push(`${entry.resource}: operating day ${m.operating_day}`);
    if (!isAddressEqual(m.agent.wallet as Address, wallet)) problems.push(`${entry.resource}: wallet ${m.agent.wallet}, committer is ${wallet}`);
    if (m.engine.tree !== index.code_tree) problems.push(`${entry.resource}: source tree ${m.engine.tree}, index ${index.code_tree}`);
    kinds.add(m.kind);
  }
  const rootTxt = join(dir, "root.txt");
  if (existsSync(rootTxt) && readFileSync(rootTxt, "utf8").trim() !== index.root) problems.push("root.txt differs from manifest.json");
  if (problems.length > 0) throw new Error(`refusing to commit ${dir}:\n  ${problems.join("\n  ")}`);
  if (kinds.size !== 1) throw new Error(`leaves mix kinds: ${[...kinds].join(", ")}`);
  return {
    dir,
    od: odNumber(day),
    scopeLabel: index.scope_label,
    root: index.root,
    leafCount: index.leaf_count,
    codeHash: codeHashFromCommit(index.code_tree),
    kind: [...kinds][0] as string,
  };
}

function testRecord(day: string, scopeLabel: string, repo: string, local: boolean): Planned {
  const od = odNumber(day);
  const doc = { schema: TEST_SCHEMA, operating_day: day, scope: scopeLabel, note: "a throwaway record that proves the deployed contract accepts a commit" };
  const dir = join(repo, "out", ...(local ? ["local"] : []), `test-${od}-${scopeLabel.replace(/[^a-z0-9]+/gi, "-")}`);
  if (existsSync(join(dir, "record.json"))) throw new Error(`${dir} already holds a record; pass another --scope or --od`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "doc.json"), `${canonicalJson(doc)}\n`);
  return { dir, od, scopeLabel, root: merkleRoot([leafHash(doc)]), leafCount: 1, codeHash: `0x${"0".repeat(64)}`, kind: "test" };
}

function describeRevert(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError && revert.data) {
      const args = (revert.data.args ?? []).map((a) => String(a)).join(", ");
      return `${revert.data.errorName}(${args})`;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

try {
  const { values } = parseArgs({
    options: {
      ...NETWORK_OPTIONS,
      od: { type: "string" },
      dir: { type: "string" },
      test: { type: "boolean", default: false },
      scope: { type: "string", default: "gate-record/test" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const network = networkFrom(values);
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const repo = repoRoot();
  const reader = readerFor(network);
  await assertChain(reader);
  const chainId = reader.chain.id;

  const deploymentPath = contractsPath(`deployments/${network.name}.json`);
  const deployment = readDeployment(deploymentPath);
  if (!deployment) throw new Error(`no ${deploymentPath}; deploy first`);
  const contract = getAddress(deployment.address);
  const code = await reader.getCode({ address: contract });
  if (!code || code === "0x") throw new Error(`no code at ${contract} on ${network.name}`);

  const account = loadAccount(network);
  const day = values.od ?? (values.test ? "2099-12-31" : undefined);
  if (!day) throw new Error("--od is required");
  const planned = values.test
    ? testRecord(day, values.scope as string, repo, chainId === 31337)
    : loadPlanned(
        values.dir ? resolve(cwd, values.dir) : join(repo, "out", ...(chainId === 31337 ? ["local"] : []), `od-${day.replaceAll("-", "")}`),
        day,
        account.address,
      );
  if (chainId !== 31337 && !values.test && planned.kind !== "prospective") {
    throw new Error(`leaves are kind "${planned.kind}"; plan with --network ${network.name} for a real chain`);
  }

  const scope = scopeId(planned.scopeLabel);
  const key = recordKey(account.address, scope, planned.od);
  const gate = (await reader.readContract({ address: contract, abi: GATE_ABI, functionName: "gateTs", args: [planned.od] })) as bigint;
  const head = await reader.getBlock();
  console.log(`network   ${network.name} (chain ${chainId}), GateRecord ${contract}`);
  console.log(`committer ${account.address}`);
  console.log(`record    od ${planned.od}, scope "${planned.scopeLabel}" ${scope}`);
  console.log(`root      ${planned.root} over ${planned.leafCount} ${planned.leafCount === 1 ? "leaf" : "leaves"}, codeHash ${planned.codeHash}`);
  console.log(`key       ${key}`);
  console.log(`gate      ${formatStamp(gate)}; chain time ${formatStamp(head.timestamp)}, ${gate - head.timestamp} s left`);

  const args = [scope, planned.od, planned.root, planned.leafCount, planned.codeHash] as const;
  let request;
  try {
    ({ request } = await reader.simulateContract({ account, address: contract, abi: GATE_ABI, functionName: "commit", args }));
  } catch (err) {
    console.error(`the contract refuses this commit: ${describeRevert(err)}`);
    process.exit(1);
  }
  const [gas, gasPrice, balance] = await Promise.all([
    reader.estimateContractGas({ account, address: contract, abi: GATE_ABI, functionName: "commit", args }),
    reader.getGasPrice(),
    reader.getBalance({ address: account.address }),
  ]);
  console.log(`estimate  ${gas} gas at ${gasPrice} wei = ${formatNative(gas * gasPrice, reader.chain)}; balance ${formatNative(balance, reader.chain)}`);
  if (values["dry-run"]) process.exit(0);
  if (balance < gas * gasPrice) throw new Error("balance does not cover the commit");

  const txHash = await signerFor(network, account).writeContract(request);
  const receipt = await reader.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`commit ${txHash} reverted`);
  const rec = (await reader.readContract({ address: contract, abi: GATE_ABI, functionName: "get", args: [key] })) as {
    root: Hex;
    leafCount: number;
    committedAt: bigint;
    blockNumber: bigint;
  };
  if (rec.root !== planned.root || Number(rec.leafCount) !== planned.leafCount) throw new Error("the record read back differs from what was sent");

  const record = {
    mode: "contract",
    chainId,
    contract,
    key,
    scope,
    scopeLabel: planned.scopeLabel,
    txHash,
    root: planned.root,
    leafCount: planned.leafCount,
    codeHash: planned.codeHash,
    blockNumber: Number(receipt.blockNumber),
    committedAt: Number(rec.committedAt),
  };
  const out = join(planned.dir, "record.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`tx        ${txHash}`);
  console.log(`block     ${receipt.blockNumber} at ${formatStamp(rec.committedAt)}, ${gate - rec.committedAt} s before the gate`);
  console.log(`gas used  ${receipt.gasUsed}`);
  console.log(`wrote     ${out}`);
} catch (err) {
  fail(err);
}
