// The late commit the Seal and Overview tabs show: a second plan for the
// sealed day, tried on both chains 22 s after its gate (scripts/late-seal.mjs).
// The call data, the record key, the reverts as GateRecord names them, the
// node that ignores the time override, the call kept when a chain is out of
// reach, and the published file held to the calls it records. Runs offline.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { keccak256, stringToBytes, toHex } from "viem";
import {
  CONTROL_SECONDS_BEFORE_GATE,
  RPCS,
  SECONDS_AFTER_GATE,
  commitData,
  decodeRevert,
  keyOf,
  lateCalls,
  lateSealFile,
  odOf,
  runOnChain,
  secondRoot,
} from "../scripts/late-seal.mjs";

const data = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "public", "data");
const read = (rel) => JSON.parse(readFileSync(join(data, rel), "utf8"));

// The Nov 27 record, as the chains hold it (receipts.json on Nov 26).
const COMMITTER = "0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8";
const SCOPE = "0x4ace28d1c5fc87449d9960b5d139d6667e75a42fad1082c63dc9ba3f08586bb9";
const ROOT = "0x3cd800432f3596e13c9f169348630c0fb69192501cf448a4859dd3104e9e59be";
const CODE = "0x586e47c2a156389974a4294359c3f16ad34eac0b000000000000000000000000";
const KEY = "0x24f59168bacf7252e2fc846a70c3a3b464eb3d15dd1a329a352d505c920bcf99";
const GATE = 1_795_708_800;
const OD = 20261127;
// What bsc-dataseed answered on Nov 26 at 12:55 CT.
const AFTER_GATE = "0x03daf9080000000000000000000000000000000000000000000000000000000001352907000000000000000000000000000000000000000000000000000000006b085780";
const ALREADY = `0xd297b6c5${KEY.slice(2)}`;

test("the late commit is GateRecord's commit for the same day with a second root", () => {
  const selector = keccak256(stringToBytes("commit(bytes32,uint32,bytes32,uint32,bytes32)")).slice(0, 10);
  const other = secondRoot(ROOT);
  assert.equal(other, `${ROOT.slice(0, -1)}f`);
  assert.notEqual(other, ROOT);
  assert.equal(secondRoot(other), ROOT);
  assert.throws(() => secondRoot("0x1234"));
  const callData = commitData({ scope: SCOPE, od: OD, root: other, leafCount: 316, codeHash: CODE });
  assert.equal(callData.slice(0, 10), selector);
  assert.ok(callData.includes(other.slice(2)) && callData.includes(SCOPE.slice(2)));
  assert.equal(odOf("2026-11-27"), OD);
});

test("the key is the one GateRecord derives from committer, scope and day", () => {
  assert.equal(keyOf(COMMITTER, SCOPE, OD), KEY);
  assert.equal(keyOf(COMMITTER.toLowerCase(), SCOPE, OD), KEY);
  assert.notEqual(keyOf(COMMITTER, SCOPE, OD + 1), KEY);
});

test("a revert reads as GateRecord's error, as the Seal tab writes it", () => {
  assert.equal(decodeRevert(AFTER_GATE), `AfterGate(${OD}, ${GATE})`);
  assert.equal(decodeRevert(ALREADY), `AlreadyCommitted(${KEY})`);
});

/** A node that answers eth_call from the time it is given, or from its own clock when it ignores the override. */
function fakeNode({ honorsTime = true, now = GATE + 3 * 3600, recordAt = GATE - 6559, reverts = true } = {}) {
  return async (_url, method, params) => {
    if (method === "eth_getBlockByNumber") return { result: { number: toHex(135_898_211), hash: `0x${"ab".repeat(32)}`, timestamp: toHex(now) } };
    if (method !== "eth_call") throw new Error(method);
    if (!reverts) return { result: KEY };
    const time = honorsTime ? Number(params[3].time) : now;
    if (time >= GATE) return { error: { code: 3, message: "execution reverted", data: AFTER_GATE } };
    if (time >= recordAt) return { error: { code: 3, message: "execution reverted", data: ALREADY } };
    return { result: KEY };
  };
}

const ARGS = { chainId: 56, contract: "0x2922c68cE15EB3e83B7f43b136e981dDc4262876", committer: COMMITTER, scope: SCOPE, od: OD, root: ROOT, leafCount: 316, codeHash: CODE, gateUnix: GATE };

test("a node that ignores the time is passed over: its control answers AfterGate too", async () => {
  const nodes = { a: fakeNode({ honorsTime: false }), b: fakeNode() };
  const rpc = (url, method, params) => nodes[url](url, method, params);
  const call = await runOnChain({ ...ARGS, rpcs: ["a", "b"], rpc });
  assert.equal(call.rpc, "b");
  assert.equal(call.late.time, GATE + SECONDS_AFTER_GATE);
  assert.equal(call.late.error, `AfterGate(${OD}, ${GATE})`);
  assert.equal(call.control.time, GATE - CONTROL_SECONDS_BEFORE_GATE);
  assert.equal(call.control.error, `AlreadyCommitted(${KEY})`);
  assert.equal(call.block.number, 135_898_211);
  await assert.rejects(runOnChain({ ...ARGS, rpcs: ["a"], rpc }), /did not apply the time/);
  await assert.rejects(runOnChain({ ...ARGS, rpcs: ["x"], rpc: fakeNode({ reverts: false }) }), /did not revert/);
  // Before the gate, a node that ignores the time answers AlreadyCommitted for the late call.
  await assert.rejects(runOnChain({ ...ARGS, rpcs: ["x"], rpc: fakeNode({ honorsTime: false, now: GATE - 600 }) }), /late commit answered AlreadyCommitted/);
});

const RECEIPTS = [56, 97].map((chainId) => ({
  chainId,
  chainName: chainId === 56 ? "BNB Smart Chain" : "BNB Smart Chain Testnet",
  contract: "0x2922c68cE15EB3e83B7f43b136e981dDc4262876",
  contractUrl: null,
  key: KEY,
  scope: SCOPE,
  root: ROOT,
  leafCount: 316,
  codeHash: CODE,
}));

test("a chain out of reach keeps the call published for the same day; without one the build stops", async () => {
  const quiet = () => {};
  const run = async (a) => {
    if (a.chainId === 97) throw new Error("all nodes failed");
    return runOnChain({ ...a, rpcs: ["n"], rpc: fakeNode() });
  };
  const keptCall = await runOnChain({ ...ARGS, chainId: 97, rpcs: ["n"], rpc: fakeNode() });
  const previous = { operatingDay: "2026-11-27", gateUnix: GATE, calls: [{ ...keptCall, rpc: "kept" }] };
  const day = { operatingDay: "2026-11-27", gateUnix: GATE };
  const calls = await lateCalls({ ...day, records: RECEIPTS, committer: COMMITTER, previous, run, log: quiet });
  assert.deepEqual(calls.map((c) => [c.chainId, c.rpc]), [[56, "n"], [97, "kept"]]);
  const late = lateSealFile({ ...day, receipts: RECEIPTS, calls });
  assert.equal(late.errorText, `AfterGate(${OD}, ${GATE})`);
  assert.equal(late.attemptUnix, GATE + 22);
  assert.deepEqual(late.chains.map((c) => c.chainId), [56, 97]);
  assert.throws(() => lateSealFile({ ...day, receipts: RECEIPTS, calls: calls.slice(0, 1) }), /calls for chains 56, receipts for 56, 97/);
  await assert.rejects(
    lateCalls({ ...day, records: RECEIPTS, committer: COMMITTER, previous: { ...previous, operatingDay: "2026-11-26" }, run, log: quiet }),
    /no call published for 2026-11-27 on chain 97/,
  );
  await assert.rejects(
    lateCalls({ ...day, records: RECEIPTS, committer: "0x0000000000000000000000000000000000000001", run, log: quiet }),
    /does not hold the chain 56 record/,
  );
  // A kept call must still be the refusal: one that answered otherwise stops the build.
  const wrong = { ...previous, calls: [{ ...keptCall, late: { ...keptCall.late, error: "AlreadyCommitted(0x00)" } }] };
  await assert.rejects(lateCalls({ ...day, records: RECEIPTS, committer: COMMITTER, previous: wrong, run, log: quiet }), /chain 97's call answered/);
});

test("the published late commit rests on a call on each chain that sealed the day", () => {
  const late = read("late-seal.json");
  const day = read("day.json");
  const { receipts } = read("receipts.json");
  const committer = read(`showcase/${day.showcase}.manifest.json`).agent.wallet;
  assert.equal(late.operatingDay, day.operatingDay);
  assert.equal(late.gateUnix, day.gateUnix);
  assert.equal(late.secondsAfterGate, SECONDS_AFTER_GATE);
  assert.equal(late.attemptUnix, day.gateUnix + SECONDS_AFTER_GATE);
  assert.equal(late.errorText, `AfterGate(${odOf(day.operatingDay)}, ${day.gateUnix})`);
  assert.deepEqual(late.calls.map((c) => c.chainId).sort(), receipts.map((r) => r.chainId).sort());
  for (const r of receipts) {
    const c = late.calls.find((x) => x.chainId === r.chainId);
    assert.ok(RPCS[r.chainId].includes(c.rpc), `${c.rpc} is not one of chain ${r.chainId}'s public nodes`);
    assert.equal(c.from, committer);
    assert.equal(c.to.toLowerCase(), r.contract.toLowerCase());
    assert.equal(c.root, secondRoot(r.root));
    assert.equal(c.data, commitData({ scope: r.scope, od: odOf(day.operatingDay), root: c.root, leafCount: r.leafCount, codeHash: r.codeHash }));
    assert.ok(c.block.timestamp > r.blockTime, "the call ran on a state that holds the day's record");
    assert.equal(c.late.time, late.attemptUnix);
    assert.equal(decodeRevert(c.late.revert), late.errorText);
    assert.equal(c.late.error, late.errorText);
    assert.equal(c.control.time, day.gateUnix - CONTROL_SECONDS_BEFORE_GATE);
    assert.equal(decodeRevert(c.control.revert), `AlreadyCommitted(${r.key.toLowerCase()})`);
  }
  const text = readFileSync(join(data, "late-seal.json"));
  const listed = read("files.json").files.find((f) => f.path === "late-seal.json");
  assert.equal(listed.bytes, text.length);
  assert.equal(listed.sha256, createHash("sha256").update(text).digest("hex"));
});
