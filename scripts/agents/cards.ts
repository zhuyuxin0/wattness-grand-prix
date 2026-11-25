// Builds each registered agent's card and stores it on BNB Greenfield testnet
// as agents/<role>.json in the public-read bucket that holds the sealed days,
// the way scripts/greenfield/publish.mjs stores them: one batched
// MsgCreateObject transaction with the payload's erasure-coded checksums, an
// upload to the bucket's primary storage provider, then a download whose
// SHA-256 must equal the local bytes before the record names the URL.
//
//   node cards.ts build                  write the cards to the evidence folder and print their SHA-256
//   node cards.ts publish [--send]       create the objects and upload them (simulates without --send)
//   node cards.ts check                  download every card, compare SHA-256, write uri and cardSha256 to the record
//
// The bucket's owner, the record wallet, signs the Greenfield transaction; its key is read by name and never printed.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { buildCard, cardBytes, cardErrors, cardSha256, ROLE_IDS, type AgentRecord } from "@gatelock/agents";
import { formatEther } from "viem";
import { appendLog, evidenceDir, GATE_TEXT, readDeployment, RECORD_WALLET, recordKey, say, stamp, stop, writeDeployment, writeEvidence } from "./lib/common.ts";

// The SDK's ESM build imports extensionless paths that Node refuses; its CommonJS build loads.
const require = createRequire(import.meta.url);
const { Client, Long, RedundancyType, VisibilityType, bytesFromBase64 } = require("@bnb-chain/greenfield-js-sdk");
const { NodeAdapterReedSolomon } = require("@bnb-chain/reed-solomon/node.adapter");

const GF_RPC = "https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org";
const GF_CHAIN_ID = "5600";
const GF_CHAIN_NAME = "greenfield_5600-1";
const BUCKET = "wattness-grand-prix-records";
const PREFIX = "agents";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { send: { type: "boolean", default: false }, evidence: { type: "string" } } });
const cmd = positionals[0] ?? "build";
const dir = evidenceDir(values.evidence);
const cardsDir = join(dir, "cards");
mkdirSync(cardsDir, { recursive: true });

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const gf = Client.create(GF_RPC, GF_CHAIN_ID);

interface Row {
  agent: AgentRecord & { agentId: number };
  object: string;
  bytes: Uint8Array;
  sha256: string;
  checksums?: Uint8Array[];
}

function rows(): Row[] {
  const d = readDeployment();
  const out: Row[] = [];
  for (const id of ROLE_IDS) {
    const a = d.agents.find((x) => x.role === id);
    if (!a || a.agentId === null) stop(`${id} is not registered; run register.ts mint first`);
    const card = buildCard(id, {
      agentId: a.agentId,
      chainId: d.chainId,
      registry: d.registry,
      wallet: a.owner,
      seal: {
        contract: "GateRecord",
        address: d.seal.address,
        chain_ids: d.seal.chainIds,
        scope_label: d.seal.scopeLabel,
        scope_id: d.seal.scopeId,
        committer: d.seal.committer,
        gate: GATE_TEXT,
      },
    });
    const problems = cardErrors(card, { agentId: a.agentId, role: id, wallet: a.owner, chainId: d.chainId, registry: d.registry });
    if (problems.length > 0) stop(`${id}: ${problems.join("; ")}`);
    const bytes = cardBytes(card);
    if (sha256(bytes) !== cardSha256(card)) stop(`${id}: card hash differs between implementations`);
    out.push({ agent: a as Row["agent"], object: `${PREFIX}/${id}.json`, bytes, sha256: cardSha256(card) });
  }
  return out;
}

async function checkChain(): Promise<void> {
  const status = await fetch(`${GF_RPC}/status`).then((r) => r.json() as Promise<{ result?: { node_info?: { network?: string } } }>);
  const network = status.result?.node_info?.network;
  if (network !== GF_CHAIN_NAME) stop(`Greenfield RPC reports ${network}, expected ${GF_CHAIN_NAME}`);
}

async function bucketAndSp(): Promise<{ endpoint: string; moniker: string }> {
  const { bucketInfo } = await gf.bucket.headBucket(BUCKET);
  if (bucketInfo.owner.toLowerCase() !== RECORD_WALLET.toLowerCase()) stop(`bucket ${BUCKET} is owned by ${bucketInfo.owner}`);
  if (bucketInfo.visibility !== VisibilityType.VISIBILITY_TYPE_PUBLIC_READ) stop(`bucket ${BUCKET} is not public-read`);
  const family = await gf.virtualGroup.getGlobalVirtualGroupFamily({ familyId: bucketInfo.globalVirtualGroupFamilyId });
  const sps = await gf.sp.getStorageProviders();
  const sp = sps.find((s: { id: number }) => s.id === family.globalVirtualGroupFamily?.primarySpId);
  if (!sp) stop("the bucket's primary storage provider is not listed");
  return { endpoint: sp.endpoint, moniker: sp.description?.moniker ?? "" };
}

async function objectInfo(name: string): Promise<{ payloadSize: string; checksums: Uint8Array[]; objectStatus: number } | null> {
  try {
    return (await gf.object.headObject(BUCKET, name)).objectInfo;
  } catch (e) {
    if (/No such object|not found|NoSuchObject/i.test(String((e as Error).message))) return null;
    throw e;
  }
}

async function build(): Promise<void> {
  for (const r of rows()) {
    writeFileSync(join(cardsDir, `${r.agent.role}.json`), r.bytes);
    say(`${r.object}: agent ${r.agent.agentId}, ${r.bytes.length} bytes, sha256 ${r.sha256}`);
  }
}

async function publish(): Promise<void> {
  await checkChain();
  const key = recordKey();
  const gfBalance = BigInt((await gf.account.getAccountBalance({ address: RECORD_WALLET, denom: "BNB" })).balance?.amount ?? "0");
  say(`Greenfield testnet balance of the record wallet: ${formatEther(gfBalance)} BNB`);
  const sp = await bucketAndSp();
  say(`bucket ${BUCKET} on ${sp.moniker} ${sp.endpoint}`);
  const rs = new NodeAdapterReedSolomon();
  const all = rows();
  const create: Row[] = [];
  const upload: Row[] = [];
  for (const r of all) {
    writeFileSync(join(cardsDir, `${r.agent.role}.json`), r.bytes);
    r.checksums = ((await rs.encodeInSubWorker(Uint8Array.from(r.bytes))) as string[]).map((x) => bytesFromBase64(x));
    const info = await objectInfo(r.object);
    if (!info) {
      create.push(r);
      upload.push(r);
      continue;
    }
    const same = Number(info.payloadSize) === r.bytes.length && info.checksums.length === r.checksums.length && info.checksums.every((c, k) => Buffer.from(c).equals(Buffer.from(r.checksums![k]!)));
    if (!same) stop(`${r.object} already exists with other bytes; a stored card is never replaced`);
    if (info.objectStatus !== 1) upload.push(r);
  }
  say(`to create ${create.length}, to upload ${upload.length}`);
  let txHash = "";
  if (create.length > 0) {
    const txs = [];
    for (const r of create) {
      txs.push(
        await gf.object.createObject({
          bucketName: BUCKET,
          objectName: r.object,
          creator: RECORD_WALLET,
          visibility: VisibilityType.VISIBILITY_TYPE_INHERIT,
          contentType: "application/json",
          redundancyType: RedundancyType.REDUNDANCY_EC_TYPE,
          payloadSize: Long.fromInt(r.bytes.length),
          expectChecksums: r.checksums,
        }),
      );
    }
    const multi = await gf.txClient.multiTx(txs);
    const sim = await multi.simulate({ denom: "BNB" });
    say(`simulated: create ${create.length} objects (gas ${sim.gasLimit}, fee ${sim.gasFee} BNB)`);
    if (!values.send) return;
    const res = await multi.broadcast({ denom: "BNB", gasLimit: Number(sim.gasLimit), gasPrice: sim.gasPrice || "5000000000", payer: RECORD_WALLET, granter: "", privateKey: key });
    if (res.code !== 0) stop(`create objects failed: code ${res.code} ${String(res.rawLog ?? "").slice(0, 300)}`);
    txHash = res.transactionHash;
    appendLog(dir, { chain: "greenfield-testnet", what: `create ${create.map((r) => r.object).join(", ")}`, hash: txHash, height: res.height, feeBnb: sim.gasFee });
    say(`sent: create objects ${txHash} (height ${res.height})`);
    await sleep(3000);
  }
  if (!values.send) return;
  for (const r of upload) {
    const body = { name: r.object.split("/").pop(), type: "application/json", size: r.bytes.length, content: Buffer.from(r.bytes) };
    for (let attempt = 1; ; attempt++) {
      const res = await gf.object
        .uploadObject({ bucketName: BUCKET, objectName: r.object, body, txnHash: txHash, endpoint: sp.endpoint }, { type: "ECDSA", privateKey: key })
        .catch((e: Error) => ({ code: -1, message: String(e.message) }));
      if (res.code === 0) break;
      if (attempt >= 4) stop(`upload ${r.object} failed: ${String(res.message).slice(0, 300)}`);
      await sleep(3000 * attempt);
    }
    say(`uploaded ${r.object}`);
  }
  for (let round = 0; round < 40; round++) {
    const unsealed = [];
    for (const r of all) if ((await objectInfo(r.object))?.objectStatus !== 1) unsealed.push(r.object);
    if (unsealed.length === 0) {
      say(`all ${all.length} cards sealed on Greenfield`);
      return;
    }
    say(`not sealed yet: ${unsealed.join(", ")}`);
    await sleep(15_000);
  }
  stop("cards still unsealed after 10 minutes; run publish again to resume");
}

async function check(): Promise<void> {
  await checkChain();
  const sp = await bucketAndSp();
  const d = readDeployment();
  const out = [];
  for (const r of rows()) {
    const url = `${sp.endpoint}/view/${BUCKET}/${r.object}`;
    let remote: string | null = null;
    let status = 0;
    for (let attempt = 1; attempt <= 4 && remote === null; attempt++) {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
      status = res?.status ?? 0;
      if (res?.ok) remote = sha256(new Uint8Array(await res.arrayBuffer()));
      else await sleep(2000 * attempt);
    }
    const verified = remote === r.sha256;
    out.push({ role: r.agent.role, agentId: r.agent.agentId, object: r.object, url, bytes: r.bytes.length, sha256: r.sha256, downloadedSha256: remote, httpStatus: status, verified });
    say(`${r.object}: ${verified ? "SHA-256 matches" : `MISMATCH (HTTP ${status}, ${remote ?? "no body"})`}`);
    if (verified) {
      const a = d.agents.find((x) => x.role === r.agent.role)!;
      a.uri = url;
      a.cardSha256 = r.sha256;
    }
  }
  d.cards.baseUrl = `${sp.endpoint}/view/${BUCKET}/${PREFIX}/`;
  writeDeployment(d);
  writeEvidence(dir, "cards-published.json", {
    step: "Agent cards on BNB Greenfield testnet, downloaded back and compared by SHA-256",
    network: GF_CHAIN_NAME,
    bucket: BUCKET,
    owner: RECORD_WALLET,
    primarySp: sp.endpoint,
    explorer: `https://testnet.dcellar.io/buckets/${BUCKET}`,
    checkedAt: stamp(),
    allVerified: out.every((x) => x.verified),
    cards: out,
  });
  if (!out.every((x) => x.verified)) stop("not every card verified; the record names only the ones that did");
}

const commands: Record<string, () => Promise<void>> = { build, publish, check };
const run = commands[cmd];
if (!run) stop(`unknown command ${cmd}; use build, publish or check`);
await run();
