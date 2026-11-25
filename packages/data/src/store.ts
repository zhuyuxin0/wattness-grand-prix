import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DataError } from "./errors.js";
import { SHA256, sha256Hex } from "./hash.js";

/** Content-addressed bytes: `<root>/sha256/<aa>/<sha256>`. A read re-hashes what it returns. */
export class Store {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  path(sha256: string): string {
    if (!SHA256.test(sha256)) throw new DataError("shape", `not a sha256: ${sha256}`);
    return join(this.root, "sha256", sha256.slice(0, 2), sha256);
  }

  has(sha256: string): boolean {
    return existsSync(this.path(sha256));
  }

  get(sha256: string): Uint8Array | null {
    const file = this.path(sha256);
    if (!existsSync(file)) return null;
    const bytes = readFileSync(file);
    if (sha256Hex(bytes) !== sha256) {
      throw new DataError("integrity", `cache object ${sha256} does not match its name; delete ${file}`);
    }
    return bytes;
  }

  /** Stores bytes under their own hash and returns it. */
  put(bytes: Uint8Array): string {
    const sha256 = sha256Hex(bytes);
    const file = this.path(sha256);
    if (existsSync(file)) return sha256;
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, bytes);
    renameSync(tmp, file);
    return sha256;
  }
}

/** `$GATE_CACHE_DIR`, else `cache/` at the workspace root (the nearest ancestor holding pnpm-workspace.yaml). */
export function defaultCacheDir(cwd = process.cwd()): string {
  const fromEnv = process.env.GATE_CACHE_DIR;
  if (fromEnv) return resolve(fromEnv);
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return join(dir, "cache");
    if (dirname(dir) === dir) return join(resolve(cwd), "cache");
  }
}

export function readJsonFile(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}
