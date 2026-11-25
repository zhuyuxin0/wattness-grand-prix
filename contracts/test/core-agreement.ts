import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gateTs, operatingDayEndTs, PLAN_SCOPE_LABEL, recordKey, scopeId } from "@gatelock/core";
import { network } from "hardhat";
import { getAddress, keccak256, stringToHex, type Address } from "viem";

// The committer, the verifier and the contract each compute the gate, the day
// end and the record key. These pin the contract to @gatelock/core, which the
// scripts and the verifier use, rather than to a third copy of the rule.

async function deployed() {
  const { viem } = await network.create({ override: { initialDate: "2026-11-20T00:00:00Z" } });
  return viem.deployContract("GateRecord");
}

// Every 1st..15th of March and November covers both transition Sundays and the
// days either side; year ends and leap days cover the roll-backs.
function edgeDays(from: number, to: number): number[] {
  const out: number[] = [];
  for (let y = from; y <= to; y++) {
    for (const m of [3, 11]) for (let d = 1; d <= 15; d++) out.push(y * 10_000 + m * 100 + d);
    out.push(y * 10_000 + 101, y * 10_000 + 228, y * 10_000 + 301, y * 10_000 + 1231);
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    if (leap) out.push(y * 10_000 + 229);
  }
  return out;
}

describe("GateRecord agrees with @gatelock/core", () => {
  it("on gateTs and dayEndTs at every transition, year end and leap day from 2007 through 2100", async () => {
    const gr = await deployed();
    for (const od of edgeDays(2007, 2100)) {
      const [gate, end] = await Promise.all([gr.read.gateTs([od]), gr.read.dayEndTs([od])]);
      assert.equal(gate, BigInt(gateTs(od)), `gateTs ${od}`);
      assert.equal(end, BigInt(operatingDayEndTs(od)), `dayEndTs ${od}`);
    }
  });

  it("on leap days across centuries", async () => {
    const gr = await deployed();
    assert.equal(await gr.read.gateTs([24000229]), BigInt(gateTs(24000229)));
    await assert.rejects(gr.read.gateTs([21000229]));
    assert.throws(() => gateTs(21000229), RangeError);
  });

  it("on the record key, for the plan scope and arbitrary ones", async () => {
    const gr = await deployed();
    const committers: Address[] = [
      "0x0000000000000000000000000000000000000001",
      "0xfa22c29c4c3d975fcc617d899b1b695eff2d94b8",
      "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF",
    ];
    const scopes = [scopeId(PLAN_SCOPE_LABEL), scopeId("gate-record/test"), stringToHex("gate-record/test", { size: 32 }), keccak256("0x")];
    for (const c of committers) {
      for (const s of scopes) {
        for (const od of [20070101, 20261126, 20280229, 99991231]) {
          assert.equal(await gr.read.keyOf([getAddress(c), s, od]), recordKey(c, s, od), `${c} ${s} ${od}`);
        }
      }
    }
  });
});
