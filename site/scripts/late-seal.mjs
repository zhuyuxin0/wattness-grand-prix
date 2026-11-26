// The late commit the Seal and Overview tabs show, run on both chains: a
// second plan for the sealed day, from the day's own committer, tried 22 s
// after its gate. On each chain it is an eth_call of GateRecord's commit at
// the latest block with the block's time set to gate + 22 s (a call, never a
// transaction), and the same call 1 s before the gate as its control. The
// day's record is already on chain, so the control answers AlreadyCommitted:
// that shows the node applied the time, since a node that ignored it would
// answer AfterGate both times once the gate has passed. GateRecord.sol checks
// the gate first:
//
//   if (block.timestamp >= gate) revert AfterGate(od, gate);
//
// build-data.mjs makes the calls with lateCalls() before it clears public/data
// and writes late-seal.json with lateSealFile(). Run
// alone from site/ (Node 22.18 or later), it repeats the calls for the
// published day and prints them; --write also replaces late-seal.json and its
// line in files.json, byte for byte as build-data.mjs writes them:
//
//   node scripts/late-seal.mjs [--write]

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { decodeErrorResult, encodeAbiParameters, encodeFunctionData, getAddress, keccak256, toHex } from "viem";
import { NETWORKS } from "../src/pages/Verify/verify/chain.ts";

export const SECONDS_AFTER_GATE = 22;
export const CONTROL_SECONDS_BEFORE_GATE = 1;
export const RULE = "if (block.timestamp >= gate) revert AfterGate(od, gate);";
export const SOURCE = "contracts/contracts/GateRecord.sol";
/** The source label files.json gives late-seal.json. */
export const LATE_SEAL_SOURCE = "eth_call of GateRecord.commit on BSC mainnet and testnet (scripts/late-seal.mjs)";
export const METHOD =
  "eth_call of commit(scope, od, root, leafCount, codeHash) from the day's committer, with the sealed root's last bit flipped, at each chain's latest block with the block's time set to the gate + 22 s; the same call at the gate − 1 s is the control";

/** The public nodes the site's verifier reads, by chain. */
export const RPCS = { 56: NETWORKS.mainnet.rpcs, 97: NETWORKS.testnet.rpcs };

export const GATE_RECORD_ABI = [
  {
    type: "function",
    name: "commit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "scope", type: "bytes32" },
      { name: "od", type: "uint32" },
      { name: "root", type: "bytes32" },
      { name: "leafCount", type: "uint32" },
      { name: "codeHash", type: "bytes32" },
    ],
    outputs: [{ name: "key", type: "bytes32" }],
  },
  { type: "error", name: "InvalidDay", inputs: [{ name: "od", type: "uint32" }] },
  { type: "error", name: "EmptyRecord", inputs: [] },
  { type: "error", name: "AlreadyCommitted", inputs: [{ name: "key", type: "bytes32" }] },
  {
    type: "error",
    name: "AfterGate",
    inputs: [
      { name: "od", type: "uint32" },
      { name: "gate", type: "uint256" },
    ],
  },
];

/** "2026-11-27" as the contract's operating day, 20261127. */
export const odOf = (operatingDay) => Number(operatingDay.replaceAll("-", ""));

/** The record key GateRecord derives: keccak256(abi.encode(committer, scope, od)). */
export function keyOf(committer, scope, od) {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }, { type: "uint32" }], [getAddress(committer), scope, od]));
}

/** A second plan's root for the same day: the sealed root with its last bit flipped. */
export function secondRoot(root) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(root)) throw new Error(`not a root: ${root}`);
  const last = (parseInt(root.slice(-1), 16) ^ 1).toString(16);
  return `${root.slice(0, -1).toLowerCase()}${last}`;
}

/** commit(scope, od, root, leafCount, codeHash) as call data. */
export function commitData({ scope, od, root, leafCount, codeHash }) {
  return encodeFunctionData({ abi: GATE_RECORD_ABI, functionName: "commit", args: [scope, od, root, leafCount, codeHash] });
}

/** A revert's data as GateRecord's error, written as the Seal tab writes it: "AfterGate(20261127, 1795708800)". */
export function decodeRevert(data) {
  const e = decodeErrorResult({ abi: GATE_RECORD_ABI, data });
  const args = (e.args ?? []).map((a) => (typeof a === "bigint" ? Number(a) : a));
  return `${e.errorName}(${args.join(", ")})`;
}

/** One JSON-RPC request to one node: the whole response, error included. */
export async function jsonRpc(url, method, params, timeoutMs = 10_000) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** The revert data in a node's error answer (geth puts it in error.data). */
function revertOf(answer) {
  const e = answer.error;
  if (!e) return null;
  const data = typeof e.data === "string" ? e.data : e.data?.data;
  return typeof data === "string" && /^0x[0-9a-fA-F]{8}/.test(data) ? data.toLowerCase() : null;
}

/**
 * One chain's late call and its control, on the first of its public nodes that
 * answers both as GateRecord must: AfterGate(od, gate) at gate + 22 s, and
 * AlreadyCommitted(key) at gate − 1 s.
 */
export async function runOnChain({ chainId, contract, committer, scope, od, root, leafCount, codeHash, gateUnix, rpcs = RPCS[chainId], rpc = jsonRpc }) {
  if (!rpcs?.length) throw new Error(`no public node for chain ${chainId}`);
  const other = secondRoot(root);
  const data = commitData({ scope, od, root: other, leafCount, codeHash });
  const key = keyOf(committer, scope, od);
  const expectLate = `AfterGate(${od}, ${gateUnix})`;
  const expectControl = `AlreadyCommitted(${key})`;
  const failures = [];
  for (const url of rpcs) {
    try {
      const head = await rpc(url, "eth_getBlockByNumber", ["latest", false]);
      if (!head.result) throw new Error(head.error?.message ?? "no latest block");
      const number = head.result.number;
      const at = async (time) => {
        const answer = await rpc(url, "eth_call", [{ from: getAddress(committer), to: getAddress(contract), data }, number, {}, { time: toHex(time) }]);
        if (!answer.error) throw new Error(`the commit at ${time} did not revert`);
        const revert = revertOf(answer);
        if (!revert) throw new Error(`no revert data: ${answer.error.message ?? "unknown error"}`);
        return { time, revert, error: decodeRevert(revert) };
      };
      const late = await at(gateUnix + SECONDS_AFTER_GATE);
      if (late.error !== expectLate) throw new Error(`the late commit answered ${late.error}, not ${expectLate}`);
      const control = await at(gateUnix - CONTROL_SECONDS_BEFORE_GATE);
      if (control.error !== expectControl) throw new Error(`the control answered ${control.error}, not ${expectControl}: the node did not apply the time`);
      return {
        chainId,
        rpc: url,
        block: { number: parseInt(number, 16), hash: head.result.hash, timestamp: parseInt(head.result.timestamp, 16) },
        from: getAddress(committer),
        to: getAddress(contract),
        root: other,
        data,
        late,
        control,
      };
    } catch (e) {
      failures.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`chain ${chainId}: ${failures.join("; ")}`);
}

/**
 * Both chains' calls for a sealed day, run now. A chain whose nodes all fail
 * keeps the call already published for the same day and gate; without one this
 * throws, so late-seal.json never claims a call that was not made.
 * build-data.mjs runs it before it clears public/data, so a failure leaves the
 * published data as it was.
 *
 * records: the day's commits, as record.json or receipts.json holds them
 * (chainId, contract, key, scope, root, leafCount, codeHash).
 */
export async function lateCalls({ operatingDay, gateUnix, records, committer, previous = null, run = runOnChain, log = console.warn }) {
  const od = odOf(operatingDay);
  const calls = [];
  for (const r of records) {
    const key = keyOf(committer, r.scope, od);
    if (key !== r.key.toLowerCase()) throw new Error(`late-seal: ${committer} does not hold the chain ${r.chainId} record ${r.key}`);
    let call;
    try {
      call = await run({ chainId: r.chainId, contract: r.contract, committer, scope: r.scope, od, root: r.root, leafCount: r.leafCount, codeHash: r.codeHash, gateUnix });
    } catch (e) {
      const kept =
        previous?.operatingDay === operatingDay && previous.gateUnix === gateUnix
          ? previous.calls?.find((c) => c.chainId === r.chainId && c.to.toLowerCase() === r.contract.toLowerCase())
          : undefined;
      if (!kept) throw new Error(`late-seal: ${e instanceof Error ? e.message : String(e)}; no call published for ${operatingDay} on chain ${r.chainId} to keep`);
      log(`late-seal: chain ${r.chainId} unreachable; keeping its call published at block ${kept.block.number}`);
      call = kept;
    }
    if (call.late.error !== `AfterGate(${od}, ${gateUnix})` || call.control.error !== `AlreadyCommitted(${key})`) {
      throw new Error(`late-seal: chain ${r.chainId}'s call answered ${call.late.error} and ${call.control.error}`);
    }
    calls.push(call);
  }
  if (calls.length === 0) throw new Error("late-seal: no commit to try again");
  return calls;
}

/**
 * late-seal.json from the day's receipts (as receipts.json lists them, with
 * chainName and contractUrl) and the calls lateCalls() made, one per receipt.
 */
export function lateSealFile({ operatingDay, gateUnix, receipts, calls }) {
  const od = odOf(operatingDay);
  const chains = receipts.map((r) => r.chainId);
  if (calls.length !== chains.length || calls.some((c, i) => c.chainId !== chains[i])) {
    throw new Error(`late-seal: calls for chains ${calls.map((c) => c.chainId).join(", ")}, receipts for ${chains.join(", ")}`);
  }
  return {
    schema: "grand-prix.late-seal.v1",
    operatingDay,
    gateUnix,
    attemptUnix: gateUnix + SECONDS_AFTER_GATE,
    secondsAfterGate: SECONDS_AFTER_GATE,
    simulated: true,
    chains: receipts.map((r) => ({ chainId: r.chainId, chainName: r.chainName, contract: r.contract, contractUrl: r.contractUrl })),
    error: { name: "AfterGate", signature: "AfterGate(uint32 od, uint256 gate)", args: [od, gateUnix] },
    errorText: `AfterGate(${od}, ${gateUnix})`,
    rule: RULE,
    source: SOURCE,
    method: METHOD,
    calls,
  };
}

// ---------------------------------------------------------------- run alone

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = (rel) => new URL(`../public/data/${rel}`, import.meta.url);
  const read = (rel) => JSON.parse(readFileSync(data(rel), "utf8"));
  const day = read("day.json");
  const { receipts } = read("receipts.json");
  const committer = read(`showcase/${day.showcase}.manifest.json`).agent.wallet;
  let previous = null;
  try {
    previous = read("late-seal.json");
  } catch {
    previous = null;
  }
  const calls = await lateCalls({ operatingDay: day.operatingDay, gateUnix: day.gateUnix, records: receipts, committer, previous });
  const late = lateSealFile({ operatingDay: day.operatingDay, gateUnix: day.gateUnix, receipts, calls });

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = (timeZone) =>
    new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" });
  const when = (unix) => {
    const d = new Date(unix * 1000);
    const ct = fmt("America/Chicago").format(d);
    const mine = fmt(zone).format(d);
    return ct === mine ? ct : `${ct} (${mine})`;
  };
  console.log(`Operating day ${late.operatingDay}: gate ${when(late.gateUnix)}; a second plan from ${committer}, root ${late.calls[0].root}`);
  for (const c of late.calls) {
    console.log(`chain ${c.chainId} via ${c.rpc}, block ${c.block.number} (${when(c.block.timestamp)}):`);
    console.log(`  at ${when(c.late.time)}, gate + ${SECONDS_AFTER_GATE} s: ${c.late.error}`);
    console.log(`  at ${when(c.control.time)}, gate − ${CONTROL_SECONDS_BEFORE_GATE} s: ${c.control.error}`);
  }

  if (process.argv.includes("--write")) {
    const text = JSON.stringify(late);
    writeFileSync(data("late-seal.json"), text);
    const files = read("files.json");
    const entry = files.files.find((f) => f.path === "late-seal.json");
    if (!entry) throw new Error("files.json lists no late-seal.json");
    entry.bytes = Buffer.byteLength(text);
    entry.sha256 = createHash("sha256").update(text).digest("hex");
    entry.source = LATE_SEAL_SOURCE;
    writeFileSync(data("files.json"), JSON.stringify(files));
    console.log(`wrote late-seal.json (${entry.bytes} bytes, ${entry.sha256}) and its line in files.json`);
  }
}
