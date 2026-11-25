import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { type Address, encodeAbiParameters, getAddress, type Hex, keccak256, stringToHex } from "viem";

// 2026-11-20 00:00 UTC: every 2026 gate below is still ahead of the chain clock.
const GENESIS = "2026-11-20T00:00:00Z";

const OD = 20261126;
const GATE = 1795622400n;
const DAY_END = 1795759200n;
const SCOPE = stringToHex("gate-record/test", { size: 32 });
const ROOT = keccak256(stringToHex("manifest"));
const CODE = keccak256(stringToHex("code"));

async function setup() {
  const { viem } = await network.create({ override: { initialDate: GENESIS } });
  const gr = await viem.deployContract("GateRecord");
  const [alice, bob] = await viem.getWalletClients();
  assert.ok(alice && bob);
  const reader = await viem.getPublicClient();
  const clock = await viem.getTestClient();
  const at = (ts: bigint) => clock.setNextBlockTimestamp({ timestamp: ts });
  const asBob = await viem.getContractAt("GateRecord", gr.address, { client: { wallet: bob } });
  return {
    viem,
    gr,
    asBob,
    alice: getAddress(alice.account.address),
    bob: getAddress(bob.account.address),
    reader,
    at,
  };
}

function expectedKey(committer: Address, scope: Hex, od: number): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "bytes32" }, { type: "uint32" }], [committer, scope, od]),
  );
}

// The gate is 10:00 America/Chicago on the day before od, from the IANA rules.
function gateFromIana(od: number): bigint {
  const y = Math.floor(od / 10000);
  const m = Math.floor(od / 100) % 100;
  const d = od % 100;
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  });
  for (const offset of [5, 6]) {
    const ts = prev.getTime() / 1000 + (10 + offset) * 3600;
    const p = Object.fromEntries(fmt.formatToParts(new Date(ts * 1000)).map((x) => [x.type, x.value]));
    const want = prev.toISOString().slice(0, 10);
    if (`${p.year}-${p.month}-${p.day}` === want && p.hour === "10") return BigInt(ts);
  }
  throw new Error(`no 10:00 Central on the day before ${od}`);
}

describe("gateTs", () => {
  it("matches the pinned vectors", async () => {
    const { gr } = await setup();
    const vectors: Array<[number, bigint]> = [
      [20261126, 1795622400n],
      [20261127, 1795708800n],
      [20260309, 1772982000n], // gate on 8 Mar, the day CDT starts
      [20260308, 1772899200n], // gate on 7 Mar, still CST
      [20261102, 1793548800n], // gate on 1 Nov, the day CST resumes
      [20261101, 1793458800n], // gate on 31 Oct, still CDT
    ];
    for (const [od, gate] of vectors) assert.equal(await gr.read.gateTs([od]), gate, String(od));
  });

  it("agrees with America/Chicago for every day of 2026 through 2040", async () => {
    const { gr } = await setup();
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2041, 0, 1); t += 86_400_000) {
      const iso = new Date(t).toISOString();
      const od = Number(iso.slice(0, 10).replaceAll("-", ""));
      assert.equal(await gr.read.gateTs([od]), gateFromIana(od), String(od));
    }
  });

  it("puts the gate for 1 January on 31 December", async () => {
    const { gr } = await setup();
    assert.equal(await gr.read.gateTs([20270101]), 1798732800n);
  });

  it("refuses dates that do not exist", async () => {
    const { viem, gr } = await setup();
    for (const od of [0, 20261131, 20260229, 20261301, 20261100, 20061231]) {
      await viem.assertions.revertWithCustomErrorWithArgs(gr.read.gateTs([od]), gr, "InvalidDay", [od]);
    }
    assert.equal(await gr.read.gateTs([20280229]), gateFromIana(20280229));
  });
});

describe("dayEndTs", () => {
  it("is midnight Central after the operating day, across both transitions", async () => {
    const { gr } = await setup();
    assert.equal(await gr.read.dayEndTs([OD]), DAY_END);
    assert.equal(await gr.read.dayEndTs([20260308]), 1773032400n); // 23-hour day
    assert.equal(await gr.read.dayEndTs([20261101]), 1793599200n); // 25-hour day
    assert.equal(await gr.read.dayEndTs([20261231]), 1798783200n);
  });
});

describe("commit", () => {
  it("stores the record, emits Committed and indexes the key", async () => {
    const { viem, gr, alice, reader, at } = await setup();
    const key = expectedKey(alice, SCOPE, OD);
    assert.equal(await gr.read.keyOf([alice, SCOPE, OD]), key);

    await at(GATE - 1n);
    const tx = gr.write.commit([SCOPE, OD, ROOT, 1, CODE]);
    await viem.assertions.emitWithArgs(tx, gr, "Committed", [key, alice, SCOPE, OD, ROOT, 1, CODE]);
    const receipt = await reader.getTransactionReceipt({ hash: await tx });

    const r = await gr.read.get([key]);
    assert.deepEqual(r, {
      root: ROOT,
      codeHash: CODE,
      scope: SCOPE,
      committer: alice,
      od: OD,
      leafCount: 1,
      committedAt: GATE - 1n,
      blockNumber: receipt.blockNumber,
    });
    assert.equal(await gr.read.countOf([alice]), 1n);
    assert.equal(await gr.read.keyAt([alice, 0n]), key);
    assert.ok(receipt.gasUsed < 200_000n, `commit used ${receipt.gasUsed} gas`);
  });

  it("returns a zeroed record for an unknown key", async () => {
    const { gr } = await setup();
    const r = await gr.read.get([keccak256("0x01")]);
    assert.equal(r.committer, "0x0000000000000000000000000000000000000000");
    assert.equal(r.committedAt, 0n);
  });

  it("refuses a second record for the same key", async () => {
    const { viem, gr, alice } = await setup();
    await gr.write.commit([SCOPE, OD, ROOT, 1, CODE]);
    const other = keccak256(stringToHex("other"));
    await viem.assertions.revertWithCustomErrorWithArgs(
      gr.write.commit([SCOPE, OD, other, 1, CODE]),
      gr,
      "AlreadyCommitted",
      [expectedKey(alice, SCOPE, OD)],
    );
    assert.equal((await gr.read.get([expectedKey(alice, SCOPE, OD)])).root, ROOT);
  });

  it("keys by committer, so another wallet cannot occupy a record", async () => {
    const { gr, asBob, alice, bob } = await setup();
    await asBob.write.commit([SCOPE, OD, keccak256("0xbb"), 1, CODE]);
    await gr.write.commit([SCOPE, OD, ROOT, 1, CODE]);
    assert.equal((await gr.read.get([expectedKey(alice, SCOPE, OD)])).root, ROOT);
    assert.equal((await gr.read.get([expectedKey(bob, SCOPE, OD)])).committer, bob);
  });

  it("reverts AfterGate at the gate second and after it", async () => {
    const { viem, gr, at } = await setup();
    await at(GATE);
    await viem.assertions.revertWithCustomErrorWithArgs(
      gr.write.commit([SCOPE, OD, ROOT, 1, CODE]),
      gr,
      "AfterGate",
      [OD, GATE],
    );
    await at(GATE + 3600n);
    await viem.assertions.revertWithCustomErrorWithArgs(
      gr.write.commit([SCOPE, OD, ROOT, 1, CODE]),
      gr,
      "AfterGate",
      [OD, GATE],
    );
  });

  it("reports AfterGate, not AlreadyCommitted, for a late duplicate", async () => {
    const { viem, gr, at } = await setup();
    await gr.write.commit([SCOPE, OD, ROOT, 1, CODE]);
    await at(GATE);
    await viem.assertions.revertWithCustomErrorWithArgs(
      gr.write.commit([SCOPE, OD, ROOT, 1, CODE]),
      gr,
      "AfterGate",
      [OD, GATE],
    );
  });

  it("refuses an empty root, zero leaves and an invalid day", async () => {
    const { viem, gr } = await setup();
    const zero = `0x${"00".repeat(32)}` as const;
    await viem.assertions.revertWithCustomError(gr.write.commit([SCOPE, OD, zero, 1, CODE]), gr, "EmptyRecord");
    await viem.assertions.revertWithCustomError(gr.write.commit([SCOPE, OD, ROOT, 0, CODE]), gr, "EmptyRecord");
    await viem.assertions.revertWithCustomErrorWithArgs(
      gr.write.commit([SCOPE, 20261131, ROOT, 1, CODE]),
      gr,
      "InvalidDay",
      [20261131],
    );
  });

  it("indexes each committer's keys in commit order", async () => {
    const { gr, asBob, alice, bob } = await setup();
    const days = [20261126, 20261127, 20261201];
    for (const od of days) await gr.write.commit([SCOPE, od, ROOT, 1, CODE]);
    const scope2 = stringToHex("gate-record/other", { size: 32 });
    await gr.write.commit([scope2, OD, ROOT, 3, CODE]);
    await asBob.write.commit([SCOPE, OD, ROOT, 1, CODE]);

    assert.equal(await gr.read.countOf([alice]), 4n);
    const keys = await Promise.all([0n, 1n, 2n, 3n].map((i) => gr.read.keyAt([alice, i])));
    assert.deepEqual(keys, [...days.map((od) => expectedKey(alice, SCOPE, od)), expectedKey(alice, scope2, OD)]);
    assert.equal(await gr.read.countOf([bob]), 1n);
    assert.equal(await gr.read.keyAt([bob, 0n]), expectedKey(bob, SCOPE, OD));
    await assert.rejects(gr.read.keyAt([alice, 4n]));
  });
});

describe("linkOutcome", () => {
  async function committed() {
    const ctx = await setup();
    await ctx.at(GATE - 60n);
    await ctx.gr.write.commit([SCOPE, OD, ROOT, 1, CODE]);
    return { ...ctx, key: expectedKey(ctx.alice, SCOPE, OD) };
  }
  const H1 = keccak256(stringToHex("outcome-1"));
  const H2 = keccak256(stringToHex("outcome-2"));
  const H3 = keccak256(stringToHex("outcome-3"));

  it("opens stage 1 at the gate", async () => {
    const { viem, gr, key, at } = await committed();
    await at(GATE - 1n);
    await viem.assertions.revertWithCustomErrorWithArgs(
      gr.write.linkOutcome([key, 1, H1]),
      gr,
      "StageNotOpen",
      [1, GATE],
    );
    await at(GATE);
    await viem.assertions.emitWithArgs(gr.write.linkOutcome([key, 1, H1]), gr, "OutcomeLinked", [key, 1, H1]);
    assert.deepEqual(await gr.read.outcomeOf([key, 1]), { hash: H1, linkedAt: GATE });
  });

  it("opens stages 2 and 3 when the operating day ends", async () => {
    const { viem, gr, key, at } = await committed();
    await at(DAY_END - 1n);
    for (const [stage, h] of [[2, H2], [3, H3]] as const) {
      await viem.assertions.revertWithCustomErrorWithArgs(
        gr.write.linkOutcome([key, stage, h]),
        gr,
        "StageNotOpen",
        [stage, DAY_END],
      );
    }
    await at(DAY_END);
    await gr.write.linkOutcome([key, 3, H3]);
    await gr.write.linkOutcome([key, 2, H2]);
    const second = await gr.read.outcomeOf([key, 2]);
    assert.equal(second.hash, H2);
    assert.ok(second.linkedAt > DAY_END);
    assert.deepEqual(await gr.read.outcomeOf([key, 3]), { hash: H3, linkedAt: DAY_END });
    assert.equal((await gr.read.outcomeOf([key, 1])).linkedAt, 0n);
  });

  it("writes each stage once", async () => {
    const { viem, gr, key, at } = await committed();
    await at(DAY_END);
    await gr.write.linkOutcome([key, 1, H1]);
    await viem.assertions.revertWithCustomErrorWithArgs(
      gr.write.linkOutcome([key, 1, H2]),
      gr,
      "StageAlreadyLinked",
      [key, 1],
    );
    assert.equal((await gr.read.outcomeOf([key, 1])).hash, H1);
  });

  it("accepts only the committer", async () => {
    const { viem, gr, asBob, bob, key, at } = await committed();
    await at(DAY_END);
    await viem.assertions.revertWithCustomErrorWithArgs(
      asBob.write.linkOutcome([key, 1, H1]),
      gr,
      "NotCommitter",
      [key, bob],
    );
  });

  it("refuses unknown keys, stages outside 1..3 and an empty hash", async () => {
    const { viem, gr, key, at } = await committed();
    await at(DAY_END);
    const unknown = keccak256("0x02");
    await viem.assertions.revertWithCustomErrorWithArgs(
      gr.write.linkOutcome([unknown, 1, H1]),
      gr,
      "UnknownRecord",
      [unknown],
    );
    for (const stage of [0, 4, 255]) {
      await viem.assertions.revertWithCustomErrorWithArgs(
        gr.write.linkOutcome([key, stage, H1]),
        gr,
        "InvalidStage",
        [stage],
      );
    }
    await viem.assertions.revertWithCustomError(
      gr.write.linkOutcome([key, 1, `0x${"00".repeat(32)}`]),
      gr,
      "EmptyOutcome",
    );
  });
});
