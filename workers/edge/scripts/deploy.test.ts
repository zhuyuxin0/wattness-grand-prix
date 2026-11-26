// The deploy script, run as a person runs it, with the secrets file and wrangler's folders pointed at
// temporary ones and two stand-in values. Nothing here deploys: --check starts no wrangler, --dry-run
// uploads nothing, and wrangler's API base is a closed local port in case either ever did.
//
//   node --test scripts/deploy.test.ts
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const DEPLOY = fileURLToPath(new URL("./deploy.ts", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "deploy-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

// Stand-ins, long enough for the mask; neither is a credential.
const TOKEN = "stand-in-token-0123456789abcdefghij";
const ACCOUNT = "0123456789abcdef0123456789abcdef";

function run(args: string[], secrets: string) {
  const dir = mkdtempSync(join(scratch, "run-"));
  const file = join(dir, "secrets.env");
  writeFileSync(file, secrets, { mode: 0o600 });
  const tmp = join(dir, "tmp"); // TMPDIR: where the script makes wrangler's log folder
  const config = join(dir, "config"); // XDG_CONFIG_HOME: wrangler's global folder, where its log went before
  mkdirSync(tmp);
  mkdirSync(config);
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("CLOUDFLARE_") && !k.startsWith("WRANGLER_")));
  const r = spawnSync(process.execPath, [DEPLOY, ...args], {
    encoding: "utf8",
    timeout: 180_000,
    env: { ...inherited, GATE_SECRETS_ENV: file, TMPDIR: tmp, XDG_CONFIG_HOME: config, CLOUDFLARE_API_BASE_URL: "http://127.0.0.1:9/client/v4" },
  });
  return { status: r.status, stdout: r.stdout, out: `${r.stdout}${r.stderr}`, tmp, config };
}

/** What wrangler left in its global folder's logs/, the default place for its debug log. */
const globalLogs = (config: string) => {
  const dir = join(config, ".wrangler", "logs");
  return existsSync(dir) ? readdirSync(dir) : [];
};

test("--check says which of the two names the secrets file holds, and prints no value", () => {
  const r = run(["--check"], `CLOUDFLARE_API_TOKEN=${TOKEN}\n`);
  assert.equal(r.status, 2, r.out);
  assert.match(r.stdout, /^CLOUDFLARE_API_TOKEN: present$/m, r.out);
  assert.match(r.stdout, /^CLOUDFLARE_ACCOUNT_ID: missing$/m, r.out);
  assert.ok(!r.out.includes(TOKEN), "the token's value was printed");
});

test("--check with both names exits 0 and starts no wrangler", () => {
  const r = run(["--check"], `CLOUDFLARE_API_TOKEN=${TOKEN}\nCLOUDFLARE_ACCOUNT_ID=${ACCOUNT}\n`);
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /^CLOUDFLARE_API_TOKEN: present$/m, r.out);
  assert.match(r.stdout, /^CLOUDFLARE_ACCOUNT_ID: present$/m, r.out);
  assert.ok(!r.out.includes(TOKEN) && !r.out.includes(ACCOUNT), "a value was printed");
  // wrangler makes its global folder whenever it runs; this one is untouched.
  assert.deepEqual(readdirSync(r.config), []);
  assert.deepEqual(readdirSync(r.tmp), []);
});

test("wrangler's debug log goes to a temporary folder, removed when wrangler exits", () => {
  const r = run(["--dry-run"], "");
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(globalLogs(r.config), [], "wrangler wrote its debug log to its global folder");
  const folder = /^wrangler's debug log: (\S+) \(removed when wrangler exits\)$/m.exec(r.stdout)?.[1];
  assert.ok(folder && folder.startsWith(join(r.tmp, "edge-deploy-")), `no log folder under TMPDIR named in:\n${r.out}`);
  const escaped = folder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(r.stdout, new RegExp(`^removed ${escaped}, which held wrangler-[0-9_-]+\\.log$`, "m"), r.out);
  assert.ok(!existsSync(folder), `${folder} is still there`);
  // wrangler keeps its update-check cache in TMPDIR too; no log folder is left beside it.
  assert.deepEqual(readdirSync(r.tmp).filter((f) => f.startsWith("edge-deploy-")), []);
});
