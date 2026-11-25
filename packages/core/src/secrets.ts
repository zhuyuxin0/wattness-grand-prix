// The only module that reads secrets. Node-only: keep it out of the package
// index so a browser bundle of @gatelock/core never pulls it in.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const SECRETS_PATH_VAR = "GATE_SECRETS_ENV";
export const DEFAULT_SECRETS_PATH = join(homedir(), "Documents", "wattness-secrets", "bnb-bangkok.env");

export class SecretsError extends Error {
  override name = "SecretsError";
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Errors name the line number, never its content: a malformed line may hold a key.
export function parseEnv(text: string): Map<string, string> {
  const vars = new Map<string, string>();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = (lines[i] ?? "").trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trimStart();
    const eq = line.indexOf("=");
    const name = eq < 0 ? "" : line.slice(0, eq).trim();
    if (!NAME.test(name)) throw new SecretsError(`secrets file line ${i + 1}: expected NAME=value`);
    vars.set(name, unquote(line.slice(eq + 1).trim()));
  }
  return vars;
}

function unquote(raw: string): string {
  const q = raw[0];
  if ((q === '"' || q === "'") && raw.length >= 2 && raw.endsWith(q)) return raw.slice(1, -1);
  return raw.replace(/\s+#.*$/, "");
}

export interface LoadOptions {
  /** Overrides GATE_SECRETS_ENV and the default path. */
  path?: string;
}

export function secretsPath(options: LoadOptions = {}): string {
  return options.path ?? process.env[SECRETS_PATH_VAR] ?? DEFAULT_SECRETS_PATH;
}

/**
 * Reads the named variables from the secrets file. Throws if the file is
 * unreadable or any name is missing or empty; the error lists the names only.
 */
export function loadSecrets<const K extends string>(
  names: readonly K[],
  options: LoadOptions = {},
): Readonly<Record<K, string>> {
  const path = secretsPath(options);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "read error";
    throw new SecretsError(`cannot read secrets file ${path} (${code}); set ${SECRETS_PATH_VAR}`);
  }
  const vars = parseEnv(text);
  const missing = names.filter((n) => !vars.get(n));
  if (missing.length > 0) {
    throw new SecretsError(`missing in ${path}: ${missing.join(", ")}`);
  }
  const out = {} as Record<K, string>;
  for (const n of names) out[n] = vars.get(n) as string;
  return Object.freeze(out);
}
