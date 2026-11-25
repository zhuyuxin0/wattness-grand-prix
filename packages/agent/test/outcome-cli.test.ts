import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO } from "./outcome-helpers.js";

// Argument checks that stop the CLI before it reads a chain or loads a key.
const CLI = join(REPO, "packages", "agent", "dist", "cli", "outcome.js");
const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: REPO, encoding: "utf8", env: { ...process.env, GATE_SECRETS_ENV: "/nonexistent" } });

describe("pnpm outcome arguments", () => {
  it("needs the reviewed root to send on BSC mainnet", () => {
    const r = run("--od", "2026-11-26", "--stage", "1", "--network", "bsc-mainnet", "--mainnet", "--send");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("--send on bsc-mainnet needs --root");
  });

  it("refuses a root that is not 32 bytes, and --send with --dry-run", () => {
    expect(run("--od", "2026-11-26", "--stage", "1", "--root", "0x1234").stderr).toContain("--root must be 32 bytes");
    const r = run("--od", "2026-11-26", "--stage", "1", "--send", "--dry-run");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("contradict");
  });
});
