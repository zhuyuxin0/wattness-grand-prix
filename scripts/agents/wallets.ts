// Creates one disposable BSC testnet wallet per role and appends it to the
// secrets file read by @gatelock/core/secrets, which stays at mode 0600.
// Prints addresses only; refuses to overwrite a name that is already there.
//
//   node wallets.ts            create the wallets that are missing
//   node wallets.ts --check    list each role's address, create nothing
import { appendFileSync, chmodSync, readFileSync, statSync } from "node:fs";
import { parseArgs } from "node:util";
import { parseEnv, secretsPath } from "@gatelock/core/secrets";
import { ROLE_IDS, secretNames } from "@gatelock/agents";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { say, stamp, stop } from "./lib/common.ts";

const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });
const file = secretsPath();
const before = readFileSync(file, "utf8");
const vars = parseEnv(before);

const missing = ROLE_IDS.filter((id) => {
  const n = secretNames(id);
  const has = [vars.has(n.key), vars.has(n.address)];
  if (has[0] !== has[1]) stop(`${id}: only one of ${n.key} and ${n.address} is in ${file}`);
  return !has[0];
});

if (values.check || missing.length === 0) {
  for (const id of ROLE_IDS) say(`${secretNames(id).address} ${vars.get(secretNames(id).address) ?? "(none)"}`);
  if (!values.check) say("every role has a wallet; nothing written");
  process.exit(0);
}

const now = stamp();
const lines = [`# Disposable BSC testnet (chain 97) wallets for the six agent roles, made ${now.ct} / ${now.bangkok}. Testnet only.`];
const made: { id: string; address: string }[] = [];
for (const id of missing) {
  const n = secretNames(id);
  const key = generatePrivateKey();
  const { address } = privateKeyToAccount(key);
  lines.push(`${n.key}=${key}`, `${n.address}=${address}`);
  made.push({ id, address });
}
appendFileSync(file, `${before.endsWith("\n") ? "" : "\n"}${lines.join("\n")}\n`);
chmodSync(file, 0o600);

const after = parseEnv(readFileSync(file, "utf8"));
for (const { id, address } of made) {
  const n = secretNames(id as (typeof ROLE_IDS)[number]);
  if (privateKeyToAccount(after.get(n.key) as `0x${string}`).address !== address || after.get(n.address) !== address) stop(`${id}: stored key and address do not match`);
}
const mode = statSync(file).mode & 0o777;
if (mode !== 0o600) stop(`secrets file mode is ${mode.toString(8)}, expected 600`);
for (const { id, address } of made) say(`${secretNames(id as (typeof ROLE_IDS)[number]).address} ${address}`);
say(`${made.length} wallets added to the secrets file (mode 600)`);
