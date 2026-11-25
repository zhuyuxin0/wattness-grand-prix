import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface SourceState {
  /** HEAD, or null before the first commit. */
  commit: string | null;
  /** Git tree hash of the source as it is on disk (tracked and untracked files, minus ignored ones). */
  tree: string;
  dirty: boolean;
}

const HEX40 = /^[0-9a-f]{40}$/;

function git(repo: string, args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/**
 * A dirty tree is hashed through a throwaway index, so the repository's own
 * index and staged work are never touched.
 */
export function sourceState(repo: string): SourceState {
  let commit: string | null = null;
  try {
    commit = git(repo, ["rev-parse", "--verify", "-q", "HEAD"]);
  } catch {
    commit = null;
  }
  const dirty = commit === null || git(repo, ["status", "--porcelain", "--untracked-files=normal"]) !== "";
  let tree: string;
  if (!dirty && commit) {
    tree = git(repo, ["rev-parse", "HEAD^{tree}"]);
  } else {
    const dir = mkdtempSync(join(tmpdir(), "gate-tree-"));
    const env = { GIT_INDEX_FILE: join(dir, "index") };
    try {
      git(repo, ["add", "--all", "--", "."], env);
      tree = git(repo, ["write-tree"], env);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  if (!HEX40.test(tree)) throw new Error(`git gave ${JSON.stringify(tree)} for the tree hash`);
  if (commit !== null && !HEX40.test(commit)) throw new Error(`git gave ${JSON.stringify(commit)} for HEAD`);
  return { commit, tree, dirty };
}
