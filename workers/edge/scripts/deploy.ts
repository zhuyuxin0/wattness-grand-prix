// Deploys the Worker with wrangler, authenticated by an API token from the secrets file.
//
//   node scripts/deploy.ts              wrangler deploy
//   node scripts/deploy.ts --dry-run    bundle into dist/ without uploading; reads no secrets
//   node scripts/deploy.ts --check      say whether the secrets file holds both names; starts no wrangler
//
// CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are read with core's loadSecrets (the file GATE_SECRETS_ENV
// names, or the default in packages/core/src/secrets.ts) and handed to wrangler in its environment only.
// Neither is printed: wrangler's output is relayed with both values masked. wrangler also writes a debug log
// of every run, its API requests and so the account ID among them; it goes to a temporary folder of its own,
// removed when wrangler exits, instead of the logs/ folder under wrangler's global config. There is no
// interactive login.
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SecretsError, loadSecrets, secretsPath } from "../../../packages/core/src/secrets.ts";

const HERE = fileURLToPath(new URL("../", import.meta.url));
const WRANGLER = fileURLToPath(new URL("../node_modules/.bin/wrangler", import.meta.url));
const NAMES = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"] as const;

/** Which of the two names the secrets file holds, by name only; 0 when it holds both. */
function check(): number {
  console.log(`secrets file: ${secretsPath()}`);
  let missing = 0;
  for (const name of NAMES) {
    try {
      loadSecrets([name]);
      console.log(`${name}: present`);
    } catch (err) {
      // An unreadable or malformed file says so; its message names the path or a line number, never a value.
      if (!(err instanceof SecretsError) || !err.message.startsWith("missing in ")) {
        console.error(`deploy --check: ${(err as Error).message}`);
        return 2;
      }
      missing++;
      console.log(`${name}: missing`);
    }
  }
  return missing === 0 ? 0 : 2;
}

if (process.argv.includes("--check")) process.exit(check());

const dryRun = process.argv.includes("--dry-run");
let secrets: Readonly<Record<(typeof NAMES)[number], string>> | null = null;
if (!dryRun) {
  try {
    secrets = loadSecrets(NAMES);
  } catch (err) {
    console.error(`deploy: ${(err as Error).message}`);
    console.error(
      [
        "",
        "To deploy, the secrets file needs two lines (it stays outside the repository, mode 0600):",
        "  CLOUDFLARE_ACCOUNT_ID=<the account's ID, shown on the Workers & Pages overview>",
        "  CLOUDFLARE_API_TOKEN=<an API token with the permission Account > Workers Scripts > Edit, for that account only>",
        "The account also needs its workers.dev subdomain chosen once (Workers & Pages > Overview > Subdomain).",
        `Secrets file: ${secretsPath()}`,
        "node scripts/deploy.ts --check says which of the two the file holds, and deploys nothing.",
      ].join("\n"),
    );
    process.exit(2);
  }
}

const mask = (s: string) => {
  let out = s;
  for (const v of Object.values(secrets ?? {})) if (v.length >= 8) out = out.split(v).join("<redacted>");
  return out;
};

// mkdtemp makes the folder readable by this user only.
const logDir = mkdtempSync(join(tmpdir(), "edge-deploy-"));
console.log(`wrangler's debug log: ${logDir} (removed when wrangler exits)`);
function removeLog(): void {
  let held: string[] = [];
  try {
    held = readdirSync(logDir);
  } catch {
    // Already gone.
  }
  rmSync(logDir, { recursive: true, force: true });
  console.log(`removed ${logDir}, which held ${held.length > 0 ? held.join(", ") : "nothing"}`);
}

const args = dryRun ? ["deploy", "--dry-run", "--outdir", "dist"] : ["deploy"];
const child = spawn(WRANGLER, args, {
  cwd: HERE,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    ...(secrets ?? {}),
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_LOG_PATH: logDir,
  },
});
// Masked a line at a time: a value split across two chunks would slip past a mask applied per chunk.
function relay(from: NodeJS.ReadableStream, to: NodeJS.WriteStream): () => void {
  let pending = "";
  from.on("data", (b: Buffer) => {
    const lines = (pending + b.toString()).split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) to.write(`${mask(line)}\n`);
  });
  return () => {
    if (pending) to.write(`${mask(pending)}\n`);
  };
}
const flushOut = relay(child.stdout, process.stdout);
const flushErr = relay(child.stderr, process.stderr);
// An interrupt reaches wrangler too: wait for it to exit, so that the log folder is still removed.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, () => child.kill(signal));
child.on("error", (err) => {
  console.error(`deploy: wrangler did not start: ${err.message}`);
  removeLog();
  process.exit(1);
});
child.on("close", (code) => {
  flushOut();
  flushErr();
  removeLog();
  process.exit(code ?? 1);
});
