import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FLEET_SCHEMA, fleetRoot, leafHash, PLAN_SCOPE_LABEL, type FleetIndex } from "@gatelock/core";
import { mkdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GATE_RECORD_ABI } from "../src/chain.js";
import { fixture } from "./fixture.js";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const TOOL = join(REPO, "tools", "verify_hash.py");
const hasPython = spawnSync("python3", ["--version"]).status === 0;

function pythonRoot(doc: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "gate-record-"));
  const path = join(dir, "doc.json");
  writeFileSync(path, JSON.stringify(doc, null, 2));
  const out = execFileSync("python3", ["-I", TOOL, path], { encoding: "utf8" });
  return /^root (0x[0-9a-f]{64})$/m.exec(out)?.[1] ?? "";
}

describe.runIf(hasPython)("tools/verify_hash.py", () => {
  it("agrees with core on a full manifest", () => {
    const { manifest } = fixture();
    expect(pythonRoot(manifest)).toBe(leafHash(manifest));
  });

  it("agrees with core on an engine manifest", () => {
    const path = fileURLToPath(new URL("./fixtures/engine-2026-11-26/manifest.json", import.meta.url));
    const out = execFileSync("python3", ["-I", TOOL, path], { encoding: "utf8" });
    expect(/^root (0x[0-9a-f]{64})$/m.exec(out)?.[1]).toBe(leafHash(JSON.parse(readFileSync(path, "utf8"))));
  });

  it.each([2, 3, 5, 7])("rebuilds a day's root over %i leaves from the leaf files", (n) => {
    const dir = mkdtempSync(join(tmpdir(), "gate-record-"));
    mkdirSync(join(dir, "leaves"));
    const leaves = Array.from({ length: n }, (_, i) => {
      const resource = `BAT_${String(i).padStart(2, "0")}`;
      const doc = { resource, i, v: [i, -1 - i] };
      writeFileSync(join(dir, "leaves", `${resource}.json`), JSON.stringify(doc));
      return { resource, leaf: leafHash(doc), manifest: `leaves/${resource}.json`, scenarios: `leaves/${resource}.scenarios.json` };
    });
    const index: FleetIndex = {
      schema: FLEET_SCHEMA,
      operating_day: "2026-11-26",
      scope_label: PLAN_SCOPE_LABEL,
      gate_unix: 1795622400,
      plan_unix: 1795615200,
      code_tree: "0".repeat(40),
      root: fleetRoot(leaves),
      leaf_count: n,
      showcase: null,
      leaves,
      exclusions: [],
    };
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(index));
    const out = execFileSync("python3", ["-I", TOOL, join(dir, "manifest.json")], { encoding: "utf8" });
    expect(/^root (0x[0-9a-f]{64})$/m.exec(out)?.[1]).toBe(index.root);
  });

  it("agrees on key order and string escapes", () => {
    const doc = {
      "€": 1, "\r": 2, "דּ": 3, "1": 4, "😀": 5, "\u0080": 6, "ö": 7,
      s: '\u0000\u001f"\\\b\f\n\r\t/\u007fé ',
      n: [0, -1, 9007199254740991, -9007199254740991],
      b: [true, false, null],
      nested: { z: [], a: {} },
    };
    expect(pythonRoot(doc)).toBe(leafHash(doc));
  });

  it("refuses fractional numbers", () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-record-"));
    const path = join(dir, "doc.json");
    writeFileSync(path, '{"x": 1.5}');
    expect(spawnSync("python3", ["-I", TOOL, path]).status).not.toBe(0);
  });
});

const ABI_FILE = join(REPO, "contracts", "abi", "GateRecord.json");

describe.runIf(existsSync(ABI_FILE))("GateRecord ABI", () => {
  it("the verifier's fragment matches the compiled contract", () => {
    const full = JSON.parse(readFileSync(ABI_FILE, "utf8")) as { type: string; name?: string }[];
    for (const fn of GATE_RECORD_ABI) {
      const match = full.find((x) => x.type === "function" && x.name === fn.name);
      expect(match, fn.name).toBeDefined();
      const strip = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (k, x) => (k === "internalType" ? undefined : x)));
      expect(strip(match)).toMatchObject(strip(fn) as object);
    }
  });
});
