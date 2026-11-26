// Publishes the sealed record of an operating day to a public-read bucket on BNB Greenfield testnet,
// reads every object back, and writes published.json (object URL and SHA-256 per file).
//
//   node publish.mjs status                 balances on both chains, the bucket, what is already stored
//   node publish.mjs fund [--send]          move tBNB from BSC testnet to Greenfield testnet (TokenHub.transferOut)
//   node publish.mjs publish [--send]       create the bucket and objects, upload them
//   node publish.mjs check                  download every object, compare SHA-256, write published.json
//
// GATE_DAY=od-YYYYMMDD picks another sealed day (default od-20261126); its list goes to published-<day>.json.
//
// Without --send, fund and publish only simulate. Testnet only: the chain ids are fixed below and checked.
// The key is read by name from ~/Documents/wattness-secrets/bnb-bangkok.env and never printed.
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createPublicClient, createWalletClient, formatEther, http, parseAbi, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";

// The SDK's ESM build imports extensionless paths that Node's ESM loader refuses; its CommonJS build loads.
const require = createRequire(import.meta.url);
const { Client, Long, RedundancyType, VisibilityType, bytesFromBase64 } = require("@bnb-chain/greenfield-js-sdk");
const { NodeAdapterReedSolomon } = require("@bnb-chain/reed-solomon/node.adapter");

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const FIRST_DAY = "od-20261126";
const DAY = process.env.GATE_DAY ?? FIRST_DAY;
if (!/^od-\d{8}$/.test(DAY)) throw new Error(`GATE_DAY must be od-YYYYMMDD, got ${DAY}`);
const MAINNET_DIR = join(REPO, "out", DAY);
const TESTNET_DIR = join(REPO, "out", `${DAY}-bsc-testnet`);
const PUBLISHED = join(HERE, DAY === FIRST_DAY ? "published.json" : `published-${DAY}.json`);

const GF_RPC = "https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org";
const GF_CHAIN_ID = "5600";
const GF_CHAIN_NAME = "greenfield_5600-1";
const BUCKET = "wattness-grand-prix-records";
const WALLET = "0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8";

// BSC testnet side of the Greenfield bridge, from bnb-chain/greenfield-contracts (README, testnet table).
const TOKEN_HUB = "0xED8e5C546F84442219A5a987EE1D820698528E04";
const CROSS_CHAIN = "0xa5B2c9194131A4E0BFaCbF9E5D6722c873159cb7";
const FUND_AMOUNT = parseEther("0.2");
const MIN_GF_BALANCE = parseEther("0.05");

// Stored once under a name the SP's firewall refuses to serve; publish deletes them.
const RETIRED = DAY === FIRST_DAY ? [`${DAY}/root.txt`] : [];

const BATCH = 20; // MsgCreateObject per transaction
const UPLOAD_CONCURRENCY = 4;

const args = process.argv.slice(2);
const cmd = args[0] ?? "status";
const SEND = args.includes("--send");
const NO_SYNC = args.includes("--no-sync");

const say = (s) => console.log(`greenfield: ${s}`);
const stop = (s) => { console.error(`greenfield: STOP: ${s}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function readEnv() {
  const file = join(homedir(), "Documents", "wattness-secrets", "bnb-bangkok.env");
  const env = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*["']?([^"'\n]*?)["']?\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
const ENV = readEnv();
const PRIVATE_KEY = (() => {
  const m = /^(0x)?([0-9a-fA-F]{64})$/.exec(ENV.GATE_PRIVATE_KEY ?? "");
  if (!m) stop("GATE_PRIVATE_KEY is not in bnb-bangkok.env in the expected form");
  return `0x${m[2]}`;
})();
const account = privateKeyToAccount(PRIVATE_KEY);
if (account.address.toLowerCase() !== WALLET.toLowerCase()) stop(`the key's address is ${account.address}, not the agent wallet ${WALLET}`);
const ADDRESS = account.address;

const gf = Client.create(GF_RPC, GF_CHAIN_ID);
const bscRpc = /^https:\/\//.test(ENV.BSC_TESTNET_RPC_URL ?? "") ? ENV.BSC_TESTNET_RPC_URL : "https://bsc-testnet-rpc.publicnode.com";
const bsc = createPublicClient({ chain: bscTestnet, transport: http(bscRpc) });

// The files of the sealed day, by object name. Leaves are identical in both output folders (the same root
// was committed on both chains); that is checked here, so one copy is stored.
function files() {
  const manifestPath = join(MAINNET_DIR, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.leaves.length !== manifest.leaf_count) stop(`manifest lists ${manifest.leaves.length} leaves, leaf_count ${manifest.leaf_count}`);
  if (readFileSync(join(TESTNET_DIR, "manifest.json")).compare(readFileSync(manifestPath)) !== 0) stop("the two output folders hold different manifests");
  const rows = [
    { object: `${DAY}/manifest.json`, path: manifestPath, kind: "index" },
    // The primary SP's edge firewall answers 405 to any path ending in "root.txt", so the root is stored as root.hex.
    { object: `${DAY}/root.hex`, path: join(MAINNET_DIR, "root.txt"), kind: "root" },
    { object: `${DAY}/salt.txt`, path: join(MAINNET_DIR, "salt.txt"), kind: "salt" },
    { object: `${DAY}/record.bsc-mainnet.json`, path: join(MAINNET_DIR, "record.json"), kind: "receipt" },
    { object: `${DAY}/record.bsc-testnet.json`, path: join(TESTNET_DIR, "record.json"), kind: "receipt" },
  ];
  // The Cournot response a plan read before the gate: V7 hashes it beside the record.
  const response = join(MAINNET_DIR, "cournot", "probability.json");
  if (existsSync(response)) {
    const copy = join(TESTNET_DIR, "cournot", "probability.json");
    if (!existsSync(copy) || readFileSync(response).compare(readFileSync(copy)) !== 0) stop("cournot/probability.json differs between the two output folders");
    rows.push({ object: `${DAY}/cournot/probability.json`, path: response, kind: "outside-input" });
  }
  for (const leaf of manifest.leaves) {
    for (const [rel, kind] of [[leaf.manifest, "leaf"], [leaf.scenarios, "scenarios"]]) {
      const a = join(MAINNET_DIR, rel);
      if (readFileSync(a).compare(readFileSync(join(TESTNET_DIR, rel))) !== 0) stop(`${rel} differs between the two output folders`);
      rows.push({ object: `${DAY}/${rel}`, path: a, kind });
    }
    if (!NO_SYNC) rows.push({ object: `${DAY}/sync/${leaf.resource}.json`, path: join(MAINNET_DIR, "sync", `${leaf.resource}.json`), kind: "sync" });
  }
  for (const r of rows) {
    if (!existsSync(r.path)) stop(`missing ${relative(REPO, r.path)}`);
    r.bytes = statSync(r.path).size;
  }
  return { manifest, rows };
}

async function gfBalance() {
  const r = await gf.account.getAccountBalance({ address: ADDRESS, denom: "BNB" });
  return BigInt(r.balance?.amount ?? "0");
}

async function checkChains() {
  const status = await fetch(`${GF_RPC}/status`).then((r) => r.json());
  const network = status.result?.node_info?.network;
  if (network !== GF_CHAIN_NAME) stop(`Greenfield RPC reports network ${network}, expected ${GF_CHAIN_NAME}`);
  const bscId = await bsc.getChainId();
  if (bscId !== 97) stop(`BSC RPC reports chain ${bscId}, expected 97`);
}

async function bucketInfo() {
  try { return (await gf.bucket.headBucket(BUCKET)).bucketInfo; } catch (e) {
    if (/No such bucket|not found|NoSuchBucket/i.test(String(e.message))) return null;
    throw e;
  }
}
async function objectInfo(name) {
  try { return (await gf.object.headObject(BUCKET, name)).objectInfo; } catch (e) {
    if (/No such object|not found|NoSuchObject/i.test(String(e.message))) return null;
    throw e;
  }
}

async function primarySp(bucket) {
  const sps = await gf.sp.getStorageProviders();
  if (bucket) {
    const family = await gf.virtualGroup.getGlobalVirtualGroupFamily({ familyId: bucket.globalVirtualGroupFamilyId });
    const id = family.globalVirtualGroupFamily?.primarySpId;
    const sp = sps.find((s) => s.id === id);
    if (!sp) stop(`the bucket's primary SP ${id} is not in the SP list`);
    return sp;
  }
  // status 0 is STATUS_IN_SERVICE.
  const live = sps.filter((s) => s.status === 0);
  for (const sp of live) {
    try {
      const r = await fetch(`${sp.endpoint}/status`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) return sp;
    } catch { /* try the next one */ }
  }
  stop("no storage provider answered");
}

async function sendGf(tx, what) {
  const sim = await tx.simulate({ denom: "BNB" });
  if (!SEND) { say(`simulated: ${what} (gas ${sim.gasLimit}, fee ${sim.gasFee} BNB)`); return null; }
  const res = await tx.broadcast({ denom: "BNB", gasLimit: Number(sim.gasLimit), gasPrice: sim.gasPrice || "5000000000", payer: ADDRESS, granter: "", privateKey: PRIVATE_KEY });
  if (res.code !== 0) stop(`${what} failed: code ${res.code} ${String(res.rawLog ?? "").slice(0, 300)}`);
  say(`sent: ${what}: ${res.transactionHash} (height ${res.height}, fee ${sim.gasFee} BNB)`);
  return res;
}

const LOG = join(HERE, "transactions.json");
function logTx(entry) {
  const all = existsSync(LOG) ? JSON.parse(readFileSync(LOG, "utf8")) : [];
  all.push({ ...entry, at: new Date().toISOString() });
  writeFileSync(LOG, `${JSON.stringify(all, null, 2)}\n`);
}

async function status() {
  await checkChains();
  const { rows } = files();
  const total = rows.reduce((s, r) => s + r.bytes, 0);
  say(`wallet ${ADDRESS}`);
  say(`BSC testnet balance ${formatEther(await bsc.getBalance({ address: ADDRESS }))} tBNB`);
  say(`Greenfield testnet balance ${formatEther(await gfBalance())} BNB`);
  say(`${rows.length} files, ${(total / 1e6).toFixed(2)} MB`);
  const b = await bucketInfo();
  say(b ? `bucket ${BUCKET}: owner ${b.owner}, visibility ${b.visibility}` : `bucket ${BUCKET}: not created`);
}

async function fund() {
  await checkChains();
  const before = await gfBalance();
  say(`Greenfield testnet balance ${formatEther(before)} BNB`);
  if (before >= MIN_GF_BALANCE && !args.includes("--force")) { say("balance is enough; nothing to move"); return; }
  const abi = parseAbi([
    "function relayFee() view returns (uint256)",
    "function minAckRelayFee() view returns (uint256)",
    "function transferOut(address recipient, uint256 amount) payable returns (bool)",
  ]);
  const [relayFee, ackFee] = await Promise.all([
    bsc.readContract({ address: CROSS_CHAIN, abi, functionName: "relayFee" }),
    bsc.readContract({ address: CROSS_CHAIN, abi, functionName: "minAckRelayFee" }),
  ]);
  const value = FUND_AMOUNT + relayFee + ackFee;
  say(`transferOut ${formatEther(FUND_AMOUNT)} tBNB to ${ADDRESS}; relay fee ${formatEther(relayFee)}, ack relay fee ${formatEther(ackFee)}, value ${formatEther(value)}`);
  const { request } = await bsc.simulateContract({ account, address: TOKEN_HUB, abi, functionName: "transferOut", args: [ADDRESS, FUND_AMOUNT], value });
  say("simulated: transferOut");
  if (!SEND) return;
  const wallet = createWalletClient({ account, chain: bscTestnet, transport: http(bscRpc) });
  const hash = await wallet.writeContract(request);
  say(`sent: transferOut on BSC testnet: ${hash}`);
  const receipt = await bsc.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") stop(`transferOut reverted: ${hash}`);
  logTx({ chain: "bsc-testnet", what: "TokenHub.transferOut", hash, block: Number(receipt.blockNumber), amount: formatEther(FUND_AMOUNT) });
  for (let i = 0; i < 60; i++) {
    await sleep(10_000);
    const now = await gfBalance();
    if (now > before) { say(`arrived: Greenfield testnet balance ${formatEther(now)} BNB`); return; }
  }
  stop(`the transfer ${hash} did not arrive on Greenfield within 10 minutes`);
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

async function publish() {
  await checkChains();
  const { rows } = files();
  const total = rows.reduce((s, r) => s + r.bytes, 0);
  say(`${rows.length} files, ${(total / 1e6).toFixed(2)} MB`);

  let bucket = await bucketInfo();
  if (!bucket) {
    const sp = await primarySp(null);
    say(`primary SP: ${sp.description?.moniker} ${sp.endpoint}`);
    const tx = await gf.bucket.createBucket({
      bucketName: BUCKET, creator: ADDRESS, visibility: VisibilityType.VISIBILITY_TYPE_PUBLIC_READ,
      chargedReadQuota: Long.fromString("0"), paymentAddress: ADDRESS, primarySpAddress: sp.operatorAddress,
    });
    const res = await sendGf(tx, `create bucket ${BUCKET}`);
    if (!res) return;
    logTx({ chain: "greenfield-testnet", what: `create bucket ${BUCKET}`, hash: res.transactionHash, height: res.height });
    await sleep(4000);
    bucket = await bucketInfo();
  }
  if (bucket.owner.toLowerCase() !== ADDRESS.toLowerCase()) stop(`bucket ${BUCKET} is owned by ${bucket.owner}`);
  if (bucket.visibility !== VisibilityType.VISIBILITY_TYPE_PUBLIC_READ) stop(`bucket ${BUCKET} is not public-read (visibility ${bucket.visibility})`);
  const sp = await primarySp(bucket);
  say(`bucket ${BUCKET} on ${sp.description?.moniker} ${sp.endpoint}`);

  for (const name of RETIRED) {
    if (!(await objectInfo(name))) continue;
    const res = await sendGf(await gf.object.deleteObject({ operator: ADDRESS, bucketName: BUCKET, objectName: name }), `delete ${name}`);
    if (res) logTx({ chain: "greenfield-testnet", what: `delete ${name}`, hash: res.transactionHash, height: res.height });
  }

  // Objects already created on chain are not created again; their payload hash is checked before upload.
  const rs = new NodeAdapterReedSolomon();
  const todoCreate = [];
  const todoUpload = [];
  for (const r of rows) {
    const info = await objectInfo(r.object);
    const buf = readFileSync(r.path);
    r.checksums = (await rs.encodeInSubWorker(Uint8Array.from(buf))).map((x) => bytesFromBase64(x));
    if (!info) { todoCreate.push(r); todoUpload.push(r); continue; }
    if (Number(info.payloadSize) !== r.bytes) stop(`${r.object} exists with ${info.payloadSize} bytes, local ${r.bytes}`);
    const same = info.checksums.length === r.checksums.length && info.checksums.every((c, k) => Buffer.from(c).equals(Buffer.from(r.checksums[k])));
    if (!same) stop(`${r.object} exists with different checksums`);
    // status 1 is OBJECT_STATUS_SEALED; 0 is created and waiting for its payload.
    if (info.objectStatus !== 1) todoUpload.push(r);
  }
  say(`to create ${todoCreate.length}, to upload ${todoUpload.length}`);

  const txOf = new Map();
  for (let i = 0; i < todoCreate.length; i += BATCH) {
    const batch = todoCreate.slice(i, i + BATCH);
    const txs = [];
    for (const r of batch) {
      txs.push(await gf.object.createObject({
        bucketName: BUCKET, objectName: r.object, creator: ADDRESS,
        visibility: VisibilityType.VISIBILITY_TYPE_INHERIT, contentType: contentType(r.object),
        redundancyType: RedundancyType.REDUNDANCY_EC_TYPE, payloadSize: Long.fromInt(r.bytes), expectChecksums: r.checksums,
      }));
    }
    const multi = await gf.txClient.multiTx(txs);
    const what = `create objects ${i + 1}-${i + batch.length} of ${todoCreate.length}`;
    const res = await sendGf(multi, what);
    if (!res) return;
    logTx({ chain: "greenfield-testnet", what, hash: res.transactionHash, height: res.height, objects: batch.map((r) => r.object) });
    for (const r of batch) txOf.set(r.object, res.transactionHash);
    await sleep(1500);
  }
  if (!SEND) return;

  let done = 0;
  await pool(todoUpload, UPLOAD_CONCURRENCY, async (r) => {
    const body = { name: r.object.split("/").pop(), type: contentType(r.object), size: r.bytes, content: readFileSync(r.path) };
    for (let attempt = 1; ; attempt++) {
      const res = await gf.object.uploadObject(
        { bucketName: BUCKET, objectName: r.object, body, txnHash: txOf.get(r.object) ?? "", endpoint: sp.endpoint },
        { type: "ECDSA", privateKey: PRIVATE_KEY },
      ).catch((e) => ({ code: -1, message: String(e.message) }));
      if (res.code === 0) break;
      if (attempt >= 4) stop(`upload ${r.object} failed: ${String(res.message).slice(0, 300)}`);
      await sleep(3000 * attempt);
    }
    if (++done % 50 === 0 || done === todoUpload.length) say(`uploaded ${done} of ${todoUpload.length}`);
  });

  for (let round = 0; round < 60; round++) {
    let unsealed = 0;
    for (const r of rows) {
      const info = await objectInfo(r.object);
      if (!info || info.objectStatus !== 1) unsealed++;
    }
    if (unsealed === 0) { say(`all ${rows.length} objects sealed`); return; }
    say(`${unsealed} objects not sealed yet`);
    await sleep(15_000);
  }
  stop("objects still unsealed after 15 minutes; run publish again to resume");
}

function contentType(name) {
  return name.endsWith(".json") ? "application/json" : "text/plain";
}

async function check() {
  await checkChains();
  const { rows } = files();
  const bucket = await bucketInfo();
  if (!bucket) stop(`bucket ${BUCKET} does not exist`);
  const sp = await primarySp(bucket);
  const out = [];
  const bad = [];
  await pool(rows, 6, async (r) => {
    const url = `${sp.endpoint}/view/${BUCKET}/${r.object}`;
    const local = sha256(readFileSync(r.path));
    let remote = null;
    for (let attempt = 1; attempt <= 4 && remote === null; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (res.ok) remote = sha256(Buffer.from(await res.arrayBuffer()));
        else if (attempt === 4) bad.push(`${r.object}: HTTP ${res.status}`);
      } catch (e) { if (attempt === 4) bad.push(`${r.object}: ${e.message}`); }
      if (remote === null) await sleep(2000 * attempt);
    }
    if (remote !== null && remote !== local) bad.push(`${r.object}: SHA-256 ${remote}, local ${local}`);
    out.push({ object: r.object, kind: r.kind, file: relative(REPO, r.path), bytes: r.bytes, sha256: local, url, verified: remote === local });
  });
  out.sort((a, b) => a.object.localeCompare(b.object));
  const total = out.reduce((s, r) => s + r.bytes, 0);
  const doc = {
    schema: "gate-record.greenfield-publication.v1",
    operating_day: "2026-11-26",
    network: { greenfield: GF_CHAIN_NAME, bsc: 97 },
    bucket: { name: BUCKET, owner: bucket.owner, visibility: "public-read", id: String(bucket.id), primary_sp: sp.endpoint },
    explorer: `https://testnet.dcellar.io/buckets/${BUCKET}`,
    base_url: `${sp.endpoint}/view/${BUCKET}/${DAY}/`,
    objects: out.length,
    total_bytes: total,
    verified_at: new Date().toISOString(),
    all_verified: bad.length === 0,
    files: out,
  };
  writeFileSync(PUBLISHED, `${JSON.stringify(doc, null, 2)}\n`);
  say(`${out.length - bad.length} of ${out.length} objects match their local SHA-256 (${(total / 1e6).toFixed(2)} MB); wrote ${relative(REPO, PUBLISHED)}`);
  if (bad.length) stop(`mismatches:\n${bad.slice(0, 20).join("\n")}`);
}

const commands = { status, fund, publish, check };
if (!commands[cmd]) stop(`unknown command ${cmd}; use status, fund, publish or check`);
await commands[cmd]();
