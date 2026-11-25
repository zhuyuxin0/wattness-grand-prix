import { concat, keccak256, pad, stringToBytes, toHex } from "viem";
import { describe, expect, it } from "vitest";
import { codeHashFromCommit, planScopeLabel, recordKey, scopeId } from "../src/key.js";
import { ANCHOR_LENGTH, decodeAnchor, encodeAnchor } from "../src/anchor.js";

const COMMITTER = "0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8";

describe("recordKey", () => {
  it("is keccak256 over three 32-byte ABI words", () => {
    const scope = scopeId("CLO_ESR1/da-energy");
    const words = concat([pad(COMMITTER.toLowerCase() as `0x${string}`), scope, pad(toHex(20261126))]);
    expect(recordKey(COMMITTER, scope, 20261126)).toBe(keccak256(words));
  });

  it("accepts any address casing", () => {
    const scope = scopeId("s");
    expect(recordKey(COMMITTER.toLowerCase() as `0x${string}`, scope, 20261126)).toBe(recordKey(COMMITTER, scope, 20261126));
  });

  it("separates committers, scopes and days", () => {
    const s = scopeId("s");
    const k = recordKey(COMMITTER, s, 20261126);
    expect(recordKey(COMMITTER, s, 20261127)).not.toBe(k);
    expect(recordKey(COMMITTER, scopeId("t"), 20261126)).not.toBe(k);
    expect(recordKey("0x0000000000000000000000000000000000000001", s, 20261126)).not.toBe(k);
  });

  it("refuses an invalid day", () => {
    expect(() => recordKey(COMMITTER, scopeId("s"), 20261131)).toThrow(RangeError);
  });
});

describe("scopeId", () => {
  it("hashes the UTF-8 label", () => {
    expect(scopeId("gate-record/test")).toBe(keccak256(stringToBytes("gate-record/test")));
  });
});

describe("calldata anchor", () => {
  const root = keccak256(stringToBytes("root"));

  it("round-trips", () => {
    const data = encodeAnchor({ chainId: 97, od: 20261126, root });
    expect((data.length - 2) / 2).toBe(ANCHOR_LENGTH);
    expect(data.startsWith(toHex("GATEREC1"))).toBe(true);
    expect(decodeAnchor(data)).toEqual({ chainId: 97, od: 20261126, root });
  });

  it("ignores other calldata", () => {
    expect(decodeAnchor("0x")).toBeNull();
    expect(decodeAnchor(`0x${"00".repeat(ANCHOR_LENGTH)}`)).toBeNull();
    const data = encodeAnchor({ chainId: 97, od: 20261126, root });
    expect(decodeAnchor(`${data}00`)).toBeNull();
  });
});

describe("plan scope and code hash", () => {
  it("derives the scope from the battery", () => {
    expect(planScopeLabel("CLO_ESR1")).toBe("CLO_ESR1/da-energy");
    expect(() => planScopeLabel("clo esr1")).toThrow();
  });

  it("left-aligns the git commit", () => {
    const commit = "0123456789abcdef0123456789abcdef01234567";
    expect(codeHashFromCommit(commit)).toBe(`0x${commit}000000000000000000000000`);
    expect(() => codeHashFromCommit(commit.toUpperCase())).toThrow();
  });
});
