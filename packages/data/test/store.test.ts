import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DataError } from "../src/errors.js";
import { sha256Hex } from "../src/hash.js";
import { Store } from "../src/store.js";
import { tempCache } from "./fixtures.js";

describe("content-addressed store", () => {
  it("stores bytes under their SHA-256", () => {
    const store = new Store(tempCache());
    const bytes = new TextEncoder().encode('{"a":1}');
    const sha = store.put(bytes);
    expect(sha).toBe(sha256Hex(bytes));
    expect(store.path(sha)).toMatch(new RegExp(`/sha256/${sha.slice(0, 2)}/${sha}$`));
    expect(Buffer.from(store.get(sha) as Uint8Array).toString()).toBe('{"a":1}');
    expect(store.get("0".repeat(64))).toBeNull();
  });

  it("refuses an object whose bytes no longer match its name", () => {
    const store = new Store(tempCache());
    const sha = store.put(new TextEncoder().encode("x"));
    writeFileSync(store.path(sha), "y");
    expect(() => store.get(sha)).toThrow(DataError);
  });
});
