import canonicalize from "canonicalize";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/jcs.ts";
import { sealedObjects } from "./fake.ts";

// A small seeded generator (mulberry32), so a failure names a reproducible document.
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEYS = ["a", "b", "z", "A", "1", "10", "9", "", "é", "€", "😀", "\u0080", "\r", "דּ", "__proto__", "kw", "soc_ukwh", "aa", "a\u0000"];
const STRINGS = ["", "plain", 'quote " and \\ slash', "\u0000\u001f\b\f\n\r\t", "é€😀", "/", "\u007f", "  "];
const INTS = [0, 1, -1, 42, -900, 9007199254740991, -9007199254740991, 1234567890123];

function value(next: () => number, depth: number): unknown {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] as T;
  const r = next();
  if (depth > 3 || r < 0.35) {
    const k = next();
    if (k < 0.4) return pick(INTS);
    if (k < 0.55) return Math.floor((next() - 0.5) * 2 ** 40);
    if (k < 0.8) return pick(STRINGS);
    if (k < 0.9) return next() < 0.5;
    return null;
  }
  if (r < 0.6) {
    // Arrays of integers take the fast path; mixed arrays take the general one.
    const n = Math.floor(next() * 6);
    return next() < 0.5 ? Array.from({ length: n }, () => pick(INTS)) : Array.from({ length: n }, () => value(next, depth + 1));
  }
  // Object.fromEntries defines own properties, so "__proto__" is a key here, as it is after JSON.parse.
  const n = Math.floor(next() * 6);
  return Object.fromEntries(Array.from({ length: n }, () => [pick(KEYS), value(next, depth + 1)]));
}

describe("canonicalJson", () => {
  it.each([...sealedObjects()].filter(([name]) => name.endsWith(".json") && !name.includes("sync/")))("matches canonicalize on %s", (_name, body) => {
    const doc: unknown = JSON.parse(body as string);
    expect(canonicalJson(doc)).toBe(canonicalize(doc));
  });

  it("matches canonicalize on 2,000 seeded documents", () => {
    const next = random(20261126);
    for (let i = 0; i < 2000; i++) {
      const doc = value(next, 0);
      expect(canonicalJson(doc), `document ${i}`).toBe(canonicalize(doc));
    }
  });

  it("refuses what core's assertHashable refuses, and names the path", () => {
    expect(() => canonicalJson({ arms: { C: { kw: [1, 1.5] } } })).toThrow("$.arms.C.kw[1]: 1.5 is not a safe integer");
    expect(() => canonicalJson({ a: -0 })).toThrow("$.a: negative zero");
    expect(() => canonicalJson({ a: [2 ** 53] })).toThrow("$.a[0]: 9007199254740992 is not a safe integer");
    expect(() => canonicalJson({ a: undefined })).toThrow("$.a: undefined");
    expect(() => canonicalJson({ s: "\ud800" })).toThrow("lone surrogate");
  });
});
