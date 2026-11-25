// Shared by the agent runners. BSC testnet (97) only; keys are read by name
// through @gatelock/core/secrets and never printed; times are written in CT
// with Bangkok beside them.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scopeId } from "@gatelock/core";
import { loadSecrets } from "@gatelock/core/secrets";
import { BSC_TESTNET, DEPLOYMENT_SCHEMA, ROLE_IDS, secretNames, type AgentsDeployment, type RoleId, type SentTx } from "@gatelock/agents";
import { createPublicClient, fallback, formatEther, getAddress, http, parseEther, type Address, type Hash, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const DEPLOYMENT_PATH = join(REPO, "contracts", "deployments", "agents.bsc-testnet.json");

export const RPCS = ["https://bsc-testnet-dataseed.bnbchain.org", "https://bsc-testnet-rpc.publicnode.com", "https://bsc-testnet.bnbchain.org"];
export const MEGAFUEL_TESTNET = "https://bsc-megafuel-testnet.nodereal.io";

/** The record wallet: it commits each day's root and owns the Greenfield bucket. */
export const RECORD_WALLET: Address = "0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8";
export const RECORD_KEY_VAR = "GATE_PRIVATE_KEY";
/** The record wallet keeps this much for the hub's testnet seal; funding stops short of it. */
export const RECORD_WALLET_FLOOR = parseEther("1.5");
/** What a role wallet gets when MegaFuel refuses one of its transactions. */
export const FUNDING = parseEther("0.01");

export const SCOPE_LABEL = "gate-record/ercot-da-energy";
export const GATE_TEXT = "10:00 Central on the day before the operating day, computed by the contract";

export const say = (s: string) => console.log(`agents: ${s}`);
export function stop(s: string): never {
  console.error(`agents: STOP: ${s}`);
  process.exit(1);
}

export const reader = createPublicClient({
  chain: bscTestnet,
  transport: fallback(RPCS.map((url) => http(url, { timeout: 20_000, retryCount: 1 }))),
});
export type Reader = typeof reader;

export async function assertTestnet(): Promise<void> {
  const id = await reader.getChainId();
  if (id !== BSC_TESTNET.chainId) stop(`RPC reports chain ${id}; these runners act on BSC testnet (97) only`);
}

function asKey(raw: string, name: string): Hex {
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) stop(`${name} is not a 32-byte hex key`);
  return key as Hex;
}

/** A role's wallet, with its stored address checked against the key. */
function secret(name: string): string {
  return loadSecrets([name])[name] as string;
}

export function roleAccount(id: RoleId): PrivateKeyAccount {
  const names = secretNames(id);
  const account = privateKeyToAccount(asKey(secret(names.key), names.key));
  if (account.address !== getAddress(secret(names.address))) stop(`${names.key} does not derive ${names.address}`);
  return account;
}

export function roleKey(id: RoleId): Hex {
  const names = secretNames(id);
  return asKey(secret(names.key), names.key);
}

export function recordAccount(): PrivateKeyAccount {
  const account = privateKeyToAccount(asKey(secret(RECORD_KEY_VAR), RECORD_KEY_VAR));
  if (account.address !== RECORD_WALLET) stop(`${RECORD_KEY_VAR} derives ${account.address}, not the record wallet ${RECORD_WALLET}`);
  return account;
}

export function recordKey(): Hex {
  recordAccount();
  return asKey(secret(RECORD_KEY_VAR), RECORD_KEY_VAR);
}

export interface Stamp {
  unix: number;
  ct: string;
  bangkok: string;
}

export function stamp(at: Date | number = new Date()): Stamp {
  const d = typeof at === "number" ? new Date(at * 1000) : at;
  const f = (timeZone: string) => d.toLocaleString("sv-SE", { timeZone, hourCycle: "h23" });
  return { unix: Math.floor(d.getTime() / 1000), ct: `${f("America/Chicago")} CT`, bangkok: `${f("Asia/Bangkok")} Bangkok` };
}

export function emptyDeployment(): AgentsDeployment {
  return {
    schema: DEPLOYMENT_SCHEMA,
    network: "bsc-testnet",
    chainId: BSC_TESTNET.chainId,
    registry: BSC_TESTNET.registry,
    erc8183: { commerce: BSC_TESTNET.commerce, router: BSC_TESTNET.router, policy: BSC_TESTNET.policy, paymentToken: BSC_TESTNET.paymentToken },
    cards: { store: "BNB Greenfield testnet (greenfield_5600-1)", bucket: "wattness-grand-prix-records", baseUrl: "" },
    seal: {
      contract: "GateRecord",
      address: BSC_TESTNET.gateRecord,
      chainIds: [56, 97],
      scopeLabel: SCOPE_LABEL,
      scopeId: scopeId(SCOPE_LABEL),
      committer: RECORD_WALLET,
    },
    agents: [],
    jobs: [],
  };
}

export function readDeployment(): AgentsDeployment {
  if (!existsSync(DEPLOYMENT_PATH)) return emptyDeployment();
  const d = JSON.parse(readFileSync(DEPLOYMENT_PATH, "utf8")) as AgentsDeployment;
  if (d.schema !== DEPLOYMENT_SCHEMA || d.chainId !== BSC_TESTNET.chainId) stop(`${DEPLOYMENT_PATH} is not a BSC testnet agents record`);
  return d;
}

export function writeDeployment(d: AgentsDeployment): void {
  const order = new Map(ROLE_IDS.map((r, i) => [r, i]));
  d.agents.sort((a, b) => (order.get(a.role) ?? 0) - (order.get(b.role) ?? 0));
  const tmp = `${DEPLOYMENT_PATH}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(d, null, 2)}\n`);
  renameSync(tmp, DEPLOYMENT_PATH);
}

/** The evidence folder: --evidence <dir>, or $GATE_EVIDENCE_DIR/agents. Kept outside the repository. */
export function evidenceDir(arg: string | undefined): string {
  const dir = arg ?? (process.env.GATE_EVIDENCE_DIR ? join(process.env.GATE_EVIDENCE_DIR, "agents") : undefined);
  if (!dir) stop("name the evidence folder with --evidence <dir> or GATE_EVIDENCE_DIR");
  const abs = resolve(dir);
  if (abs === REPO || abs.startsWith(`${REPO}/`)) stop("evidence stays outside the repository");
  mkdirSync(abs, { recursive: true });
  return abs;
}

export function writeEvidence(dir: string, name: string, doc: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, `${JSON.stringify(doc, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`);
  return path;
}

export function appendLog(dir: string, entry: Record<string, unknown>): void {
  const path = join(dir, "transactions.json");
  const all = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as unknown[]) : [];
  all.push({ ...entry, logged: stamp() });
  writeFileSync(path, `${JSON.stringify(all, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`);
}

/** A mined transaction as the record keeps it, re-read from the public RPCs. */
export async function sentTx(hash: Hash): Promise<SentTx> {
  const rc = await reader.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (rc.status !== "success") stop(`${hash} reverted`);
  const [tx, block] = await Promise.all([reader.getTransaction({ hash }), reader.getBlock({ blockNumber: rc.blockNumber })]);
  const price = rc.effectiveGasPrice ?? tx.gasPrice ?? 0n;
  return {
    hash,
    blockNumber: Number(rc.blockNumber),
    blockTime: Number(block.timestamp),
    from: getAddress(rc.from),
    to: getAddress(rc.to ?? "0x0000000000000000000000000000000000000000"),
    gasPriceWei: price.toString(),
    sponsored: price === 0n,
  };
}

export function describeTx(t: SentTx): string {
  const s = stamp(t.blockTime);
  return `${t.hash} block ${t.blockNumber} at ${s.ct} / ${s.bangkok}, ${t.sponsored ? "gas sponsored" : `gas price ${t.gasPriceWei} wei`}`;
}

export const tbnb = (wei: bigint) => `${formatEther(wei)} tBNB`;
