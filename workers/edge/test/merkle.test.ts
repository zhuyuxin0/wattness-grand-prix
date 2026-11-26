import { describe, expect, it } from "vitest";
import { codeHashFromTree, decodeRecord, recordKey, scopeId } from "../src/abi.ts";
import { checksumAddress, toHex, sha256, utf8, type Hex } from "../src/bytes.ts";
import { PLAN_SCOPE_LABEL } from "../src/config.ts";
import { leafHash, merkleRoot, rootAndProof, rootFromProof } from "../src/merkle.ts";
import { text } from "./fake.ts";
import chain from "./fixtures/chain.json";

const index = JSON.parse(text.index) as { root: Hex; leaf_count: number; code_tree: string; leaves: { resource: string; leaf: Hex }[] };
const receipts = { "bsc-mainnet": JSON.parse(text.receiptMainnet), "bsc-testnet": JSON.parse(text.receiptTestnet) } as const;

describe("leaf hashes and the tree (core's numbers, recomputed)", () => {
  it("gives each fixture leaf the hash the sealed index lists for it", () => {
    for (const [resource, body] of [["DSWL_ESS_ESR1", text.dswl], ["CLO_ESR1", text.clo]] as const) {
      expect(leafHash(JSON.parse(body))).toBe(index.leaves.find((l) => l.resource === resource)?.leaf);
    }
  });

  it("gives the root committed on 25 Nov over the index's 316 leaf hashes", () => {
    expect(merkleRoot(index.leaves.map((l) => l.leaf))).toBe(index.root);
    expect(index.root).toBe(text.root.trim());
    expect(index.root).toBe(receipts["bsc-mainnet"].root);
  });

  it("walks every one of the 316 audit paths to that root", () => {
    const leaves = index.leaves.map((l) => l.leaf);
    for (let m = 0; m < leaves.length; m++) {
      const { root, proof } = rootAndProof(leaves, m);
      expect(root).toBe(index.root);
      expect(rootFromProof(leaves[m] as Hex, m, leaves.length, proof)).toBe(index.root);
    }
    // Desert Willow is leaf 94 of 316, index 93, nine hashes from the root.
    expect(rootAndProof(leaves, 93).proof).toHaveLength(9);
  });

  it("agrees with itself for every size from 1 to 40 and every leaf", () => {
    for (let n = 1; n <= 40; n++) {
      const leaves = Array.from({ length: n }, (_, i) => toHex(sha256(utf8(`leaf ${i}`))));
      const root = merkleRoot(leaves);
      for (let m = 0; m < n; m++) expect(rootFromProof(leaves[m] as Hex, m, n, rootAndProof(leaves, m).proof)).toBe(root);
    }
    expect(merkleRoot([])).toBe(toHex(sha256(new Uint8Array())));
  });

  it("refuses a proof of the wrong length", () => {
    const leaves = index.leaves.map((l) => l.leaf);
    const { proof } = rootAndProof(leaves, 5);
    expect(() => rootFromProof(leaves[5] as Hex, 5, leaves.length, proof.slice(1))).toThrow("too short");
    expect(() => rootFromProof(leaves[5] as Hex, 5, leaves.length, [...proof, proof[0] as Hex])).toThrow("too long");
  });
});

describe("GateRecord's ABI (against the receipts and the recorded answers)", () => {
  const committer = "0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8";

  it("computes the scope, the record key and the code hash the receipts record", () => {
    for (const r of Object.values(receipts)) {
      expect(scopeId(PLAN_SCOPE_LABEL)).toBe(r.scope);
      expect(recordKey(committer, r.scope, 20261126)).toBe(r.key);
      expect(codeHashFromTree(index.code_tree)).toBe(r.codeHash);
    }
    expect(checksumAddress(committer.toLowerCase())).toBe(committer);
  });

  it("decodes GateRecord.get's answer into the record each receipt describes", () => {
    for (const network of ["bsc-mainnet", "bsc-testnet"] as const) {
      const r = receipts[network];
      const answer = chain.networks[network].find((a) => a.method === "eth_call" && a.data === `0x8eaa6ac0${r.key.slice(2)}`);
      expect(decodeRecord(String(answer?.result))).toEqual({
        root: r.root,
        codeHash: r.codeHash,
        scope: r.scope,
        committer,
        od: 20261126,
        leafCount: r.leafCount,
        committedAt: r.committedAt,
        blockNumber: r.blockNumber,
      });
    }
  });

  it("reads the zeroed record as no record, and refuses a short answer", () => {
    expect(decodeRecord(`0x${"0".repeat(512)}`)).toBeNull();
    expect(() => decodeRecord(`0x${"0".repeat(510)}`)).toThrow("expected 8 ABI words");
  });
});
