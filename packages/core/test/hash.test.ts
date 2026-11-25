import { bytesToHex, concat, hexToBytes, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { canonicalJson, DocumentError } from "../src/jcs.js";
import { fileSha256, inclusionProof, leafHash, merkleRoot, rootFromProof, sha256 } from "../src/hash.js";

// Test data and roots from the certificate-transparency reference test suite.
const CT_LEAVES = ["", "00", "10", "2021", "3031", "40414243", "5051525354555657", "606162636465666768696a6b6c6d6e6f"];
const CT_ROOTS = [
  "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d",
  "fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125",
  "aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77",
  "d37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7",
  "4e3bbb1f7b478dcfe71fb631631519a3bca12c9aefca1612bfce4c13a86264d4",
  "76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef",
  "ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c",
  "5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328",
];
const ctLeaf = (data: string): Hex =>
  bytesToHex(sha256(concat([new Uint8Array([0]), data ? hexToBytes(`0x${data}`) : new Uint8Array()])));

describe("canonicalJson", () => {
  it("sorts keys by UTF-16 code unit (RFC 8785 section 3.2.3)", () => {
    const doc = { "\u20ac": 1, "\r": 2, "\ufb33": 3, "1": 4, "\ud83d\ude00": 5, "\u0080": 6, "\u00f6": 7 };
    expect(canonicalJson(doc)).toBe('{"\\r":2,"1":4,"\u0080":6,"\u00f6":7,"\u20ac":1,"\ud83d\ude00":5,"\ufb33":3}');
  });

  it("escapes strings as RFC 8785 requires", () => {
    expect(canonicalJson({ s: '\u0000\u001f"\\\b\f\n\r\t/\u007f\u00e9' })).toBe(
      '{"s":"\\u0000\\u001f\\"\\\\\\b\\f\\n\\r\\t/\u007f\u00e9"}',
    );
  });

  it("has no whitespace and keeps array order", () => {
    expect(canonicalJson({ b: [3, 1, 2], a: { d: null, c: true } })).toBe('{"a":{"c":true,"d":null},"b":[3,1,2]}');
  });

  it("refuses values a second implementation could encode differently", () => {
    for (const bad of [{ x: 1.5 }, { x: 2 ** 53 }, { x: -0 }, { x: undefined }, { x: new Date(0) }, [NaN]]) {
      expect(() => canonicalJson(bad)).toThrow(DocumentError);
    }
  });
});

describe("RFC 6962 tree", () => {
  const leaves = CT_LEAVES.map(ctLeaf);

  it("matches the reference roots for every prefix", () => {
    for (let n = 1; n <= leaves.length; n++) {
      expect(merkleRoot(leaves.slice(0, n)).slice(2), `size ${n}`).toBe(CT_ROOTS[n - 1]);
    }
  });

  it("hashes the empty tree to SHA-256 of nothing", () => {
    expect(merkleRoot([])).toBe("0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("round-trips inclusion proofs for every leaf of every size", () => {
    for (let n = 1; n <= leaves.length; n++) {
      const tree = leaves.slice(0, n);
      const root = merkleRoot(tree);
      for (let m = 0; m < n; m++) {
        expect(rootFromProof(tree[m] as Hex, m, n, inclusionProof(tree, m))).toBe(root);
      }
    }
  });

  it("rejects a proof for the wrong position", () => {
    const tree = leaves.slice(0, 5);
    const proof = inclusionProof(tree, 2);
    expect(rootFromProof(tree[2] as Hex, 3, 5, proof)).not.toBe(merkleRoot(tree));
  });
});

describe("leafHash", () => {
  it("is SHA-256 over 0x00 and the canonical bytes", () => {
    const doc = { b: 2, a: "x" };
    const expected = sha256(concat([new Uint8Array([0]), new TextEncoder().encode('{"a":"x","b":2}')]));
    expect(leafHash(doc)).toBe(bytesToHex(expected));
  });

  it("does not depend on key order", () => {
    expect(leafHash({ a: 1, b: [1, 2] })).toBe(leafHash({ b: [1, 2], a: 1 }));
  });

  it("a one-leaf root is the leaf", () => {
    const leaf = leafHash({ a: 1 });
    expect(merkleRoot([leaf])).toBe(leaf);
  });
});

describe("fileSha256", () => {
  it("is bare lowercase hex", () => {
    expect(fileSha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
