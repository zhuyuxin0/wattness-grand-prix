import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SECRETS_PATH_VAR, SecretsError, loadSecrets, parseEnv } from "../src/secrets.js";

const FAKE_KEY = "0x" + "ab".repeat(32);

function thrown(fn: () => unknown): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected a throw");
}

describe("parseEnv", () => {
  it("handles comments, export, quotes and inline comments", () => {
    const vars = parseEnv(
      [
        "# comment",
        "",
        "export A=1",
        'B="two words"',
        "C='x # y'",
        "D=plain # trailing",
        "E=",
        "A=override",
      ].join("\n"),
    );
    expect(Object.fromEntries(vars)).toEqual({
      A: "override",
      B: "two words",
      C: "x # y",
      D: "plain",
      E: "",
    });
  });

  it("reports a malformed line by number without echoing it", () => {
    const err = thrown(() => parseEnv(`OK=1\n${FAKE_KEY}`));
    expect(err).toBeInstanceOf(SecretsError);
    expect(err.message).toContain("line 2");
    expect(err.message).not.toContain(FAKE_KEY);
  });
});

describe("loadSecrets", () => {
  let dir: string;
  let file: string;
  const saved = process.env[SECRETS_PATH_VAR];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gatelock-secrets-"));
    file = join(dir, "test.env");
    writeFileSync(file, `GATE_PRIVATE_KEY=${FAKE_KEY}\nGATE_RPC_URL=http://127.0.0.1:8545\nEMPTY=\n`);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (saved === undefined) delete process.env[SECRETS_PATH_VAR];
    else process.env[SECRETS_PATH_VAR] = saved;
  });

  it("returns a frozen record of exactly the requested names", () => {
    const s = loadSecrets(["GATE_PRIVATE_KEY"], { path: file });
    expect(s).toEqual({ GATE_PRIVATE_KEY: FAKE_KEY });
    expect(Object.isFrozen(s)).toBe(true);
  });

  it("reads the path from GATE_SECRETS_ENV", () => {
    process.env[SECRETS_PATH_VAR] = file;
    expect(loadSecrets(["GATE_RPC_URL"]).GATE_RPC_URL).toBe("http://127.0.0.1:8545");
  });

  it("names every missing or empty variable and no values", () => {
    const err = thrown(() => loadSecrets(["GATE_PRIVATE_KEY", "NOPE", "EMPTY"], { path: file }));
    expect(err.message).toMatch(/missing in .*: NOPE, EMPTY$/);
    expect(err.message).not.toContain(FAKE_KEY);
  });

  it("fails clearly when the file is absent", () => {
    expect(() => loadSecrets(["X"], { path: join(dir, "absent.env") })).toThrow(/ENOENT.*GATE_SECRETS_ENV/);
  });
});
