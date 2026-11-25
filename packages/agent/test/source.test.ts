import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sourceState } from "../src/source.js";

const git = (dir: string, ...args: string[]) =>
  execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], { encoding: "utf8" }).trim();

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "gate-source-"));
  git(dir, "init", "-q");
  writeFileSync(join(dir, ".gitignore"), "out/\n");
  writeFileSync(join(dir, "a.txt"), "a\n");
  return dir;
}

describe("sourceState", () => {
  it("is dirty before the first commit and still hashes the tree on disk", () => {
    const dir = repo();
    const s = sourceState(dir);
    expect(s).toMatchObject({ commit: null, dirty: true });
    expect(s.tree).toMatch(/^[0-9a-f]{40}$/);
    // The repository's own index is untouched.
    expect(git(dir, "status", "--porcelain")).toBe("?? .gitignore\n?? a.txt");
  });

  it("gives HEAD's tree for a clean checkout, the same tree the dirty path computed", () => {
    const dir = repo();
    const before = sourceState(dir).tree;
    git(dir, "add", ".gitignore", "a.txt");
    git(dir, "commit", "-q", "-m", "init");
    const s = sourceState(dir);
    expect(s).toMatchObject({ dirty: false, commit: git(dir, "rev-parse", "HEAD") });
    expect(s.tree).toBe(git(dir, "rev-parse", "HEAD^{tree}"));
    expect(s.tree).toBe(before);
  });

  it("changes with an edit and ignores ignored files", () => {
    const dir = repo();
    git(dir, "add", ".gitignore", "a.txt");
    git(dir, "commit", "-q", "-m", "init");
    const clean = sourceState(dir).tree;
    execFileSync("mkdir", ["-p", join(dir, "out")]);
    writeFileSync(join(dir, "out", "x.json"), "{}\n");
    expect(sourceState(dir)).toMatchObject({ dirty: false, tree: clean });
    writeFileSync(join(dir, "a.txt"), "b\n");
    const edited = sourceState(dir);
    expect(edited.dirty).toBe(true);
    expect(edited.tree).not.toBe(clean);
    expect(git(dir, "diff", "--cached", "--name-only")).toBe("");
  });
});
