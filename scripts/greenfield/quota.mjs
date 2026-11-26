// Reads the public bucket's read quota for this month and, with --send, raises its charged read quota, so the
// sealed days stay readable after the bucket's free monthly quota runs out (Greenfield answers 406, code 30004,
// "bucket quota overflow", to reads past it).
//
//   node quota.mjs                    the quota, this month's use and the balance; simulates the update
//   node quota.mjs --gb 20 --send     sets the bucket's charged read quota to 20 GiB a month
//
// Testnet only: the chain id is fixed below and checked. The key is read by name from
// ~/Documents/wattness-secrets/bnb-bangkok.env and never printed.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const require = createRequire(import.meta.url);
const { Client, VisibilityType } = require("@bnb-chain/greenfield-js-sdk");

const HERE = dirname(fileURLToPath(import.meta.url));
const GF_RPC = "https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org";
const GF_CHAIN_ID = "5600";
const GF_CHAIN_NAME = "greenfield_5600-1";
const BUCKET = "wattness-grand-prix-records";
const WALLET = "0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8";
const GIB = 1024n ** 3n;

const args = process.argv.slice(2);
const SEND = args.includes("--send");
const gbArg = args.indexOf("--gb");
const GB = gbArg >= 0 ? Number(args[gbArg + 1]) : 20;
if (!Number.isInteger(GB) || GB < 1 || GB > 200) throw new Error(`--gb must be a whole number from 1 to 200, got ${args[gbArg + 1]}`);

const say = (s) => console.log(`quota: ${s}`);
const stop = (s) => { console.error(`quota: STOP: ${s}`); process.exit(1); };
const mib = (n) => `${(Number(n) / 1024 / 1024).toFixed(1)} MiB`;

function readEnv() {
  const file = join(homedir(), "Documents", "wattness-secrets", "bnb-bangkok.env");
  const env = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*["']?([^"'\n]*?)["']?\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
const m = /^(0x)?([0-9a-fA-F]{64})$/.exec(readEnv().GATE_PRIVATE_KEY ?? "");
if (!m) stop("GATE_PRIVATE_KEY is not in bnb-bangkok.env in the expected form");
const PRIVATE_KEY = `0x${m[2]}`;
const ADDRESS = privateKeyToAccount(PRIVATE_KEY).address;
if (ADDRESS.toLowerCase() !== WALLET.toLowerCase()) stop(`the key's address is ${ADDRESS}, not the agent wallet ${WALLET}`);

const gf = Client.create(GF_RPC, GF_CHAIN_ID);

const status = await fetch(`${GF_RPC}/status`).then((r) => r.json());
if (status.result?.node_info?.network !== GF_CHAIN_NAME) stop(`Greenfield RPC reports network ${status.result?.node_info?.network}, expected ${GF_CHAIN_NAME}`);

const bucket = (await gf.bucket.headBucket(BUCKET)).bucketInfo;
if (!bucket) stop(`bucket ${BUCKET} not found`);
if (bucket.owner.toLowerCase() !== ADDRESS.toLowerCase()) stop(`bucket ${BUCKET} is owned by ${bucket.owner}`);
if (bucket.visibility !== VisibilityType.VISIBILITY_TYPE_PUBLIC_READ) stop(`bucket ${BUCKET} is not public-read`);
say(`bucket ${BUCKET}: owner ${bucket.owner}, charged read quota ${mib(bucket.chargedReadQuota ?? 0)}`);

async function readQuota() {
  const now = new Date();
  try {
    const r = await gf.bucket.getBucketReadQuota({ bucketName: BUCKET, year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }, { type: "ECDSA", privateKey: PRIVATE_KEY });
    const b = r.body ?? r;
    say(`this month: charged ${mib(b.readQuota)}, consumed ${mib(b.consumedQuota)}; free ${mib(b.freeQuota)} left of the SP's free quota, ${mib(b.freeConsumedSize)} used; monthly free ${mib(b.monthlyFreeQuota)}, used ${mib(b.monthlyQuotaConsumedSize)}`);
    return b;
  } catch (e) {
    say(`read quota query failed: ${String(e?.message ?? e).slice(0, 200)}`);
    return null;
  }
}
await readQuota();
const bal = await gf.account.getAccountBalance({ address: ADDRESS, denom: "BNB" });
say(`Greenfield testnet balance ${formatEther(BigInt(bal.balance?.amount ?? "0"))} BNB`);

const target = BigInt(GB) * GIB;
if (BigInt(bucket.chargedReadQuota ?? 0) >= target) { say(`charged read quota already at least ${GB} GiB; nothing to do`); process.exit(0); }
const tx = await gf.bucket.updateBucketInfo({
  operator: ADDRESS,
  bucketName: BUCKET,
  chargedReadQuota: target.toString(),
  paymentAddress: "",
  visibility: VisibilityType.VISIBILITY_TYPE_PUBLIC_READ,
});
const sim = await tx.simulate({ denom: "BNB" });
say(`simulated: charged read quota ${mib(bucket.chargedReadQuota ?? 0)} -> ${GB} GiB a month (gas ${sim.gasLimit}, fee ${sim.gasFee} BNB)`);
if (!SEND) process.exit(0);
const res = await tx.broadcast({ denom: "BNB", gasLimit: Number(sim.gasLimit), gasPrice: sim.gasPrice || "5000000000", payer: ADDRESS, granter: "", privateKey: PRIVATE_KEY });
if (res.code !== 0) stop(`update failed: code ${res.code} ${String(res.rawLog ?? "").slice(0, 300)}`);
say(`sent: ${res.transactionHash} (height ${res.height})`);
const LOG = join(HERE, "transactions.json");
const all = existsSync(LOG) ? JSON.parse(readFileSync(LOG, "utf8")) : [];
all.push({ chain: "greenfield-testnet", what: `set ${BUCKET} charged read quota to ${GB} GiB a month`, hash: res.transactionHash, height: res.height, at: new Date().toISOString() });
writeFileSync(LOG, `${JSON.stringify(all, null, 2)}\n`);
await new Promise((r) => setTimeout(r, 6000));
const after = (await gf.bucket.headBucket(BUCKET)).bucketInfo;
say(`bucket now: charged read quota ${mib(after.chargedReadQuota ?? 0)}`);
await readQuota();
