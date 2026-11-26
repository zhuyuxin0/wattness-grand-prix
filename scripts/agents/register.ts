// Registers each role as an ERC-8004 agent on BSC testnet, owned by the role's
// own wallet, with gas sponsored by MegaFuel through the BNB agent SDK.
//
//   node register.ts mint [--role R] [--send] [--evidence DIR]   mint the identities that are missing, tagged with their role
//   node register.ts uri  [--role R] [--send] [--evidence DIR]   point each identity at its published card (run cards.ts first)
//   node register.ts status                                      read every identity and card back
//
// Without --send, mint and uri only check sponsorship and simulate. If the relay refuses a call, the role wallet
// gets 0.01 tBNB from the record wallet first (one transfer at a time) and pays its own gas.
import { parseArgs } from "node:util";
import {
  identityRegistryAbi,
  isRoleId,
  jsonRpcCaller,
  readAgents,
  ROLE_IDS,
  type AgentRecord,
  type RoleId,
  type SentTx,
} from "@gatelock/agents";
import { encodeFunctionData, getAddress, parseEventLogs, stringToHex, type Address, type Hex } from "viem";
import {
  appendLog,
  assertTestnet,
  describeTx,
  evidenceDir,
  reader,
  readDeployment,
  roleAccount,
  roleKey,
  RPCS,
  say,
  sentTx,
  stamp,
  stop,
  writeDeployment,
  writeEvidence,
} from "./lib/common.ts";
import { execute, fundFromRecordWallet, sponsorable } from "./lib/sponsored.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { role: { type: "string" }, send: { type: "boolean", default: false }, evidence: { type: "string" } },
});
const cmd = positionals[0] ?? "status";
if (values.role && !isRoleId(values.role)) stop(`unknown role ${values.role}; one of ${ROLE_IDS.join(", ")}`);
const roles: RoleId[] = values.role ? [values.role as RoleId] : [...ROLE_IDS];

// The entry the BNB agent SDK adds to every registration it makes.
const BUILT_WITH = "https://github.com/bnb-chain/bnbagent-sdk#v0.6.1";

function entry(d: ReturnType<typeof readDeployment>, id: RoleId, owner: Address): AgentRecord {
  let a = d.agents.find((x) => x.role === id);
  if (!a) {
    a = { role: id, agentId: null, owner, uri: null, cardSha256: null, transactions: {} };
    d.agents.push(a);
  }
  if (getAddress(a.owner) !== owner) stop(`${id}: the record names owner ${a.owner}, the key derives ${owner}`);
  return a;
}

async function gasFor(id: RoleId, from: Address, to: Address, data: Hex, what: string, dir: string | null): Promise<SentTx | null> {
  const s = await sponsorable(from, to, data);
  say(`${id}: ${what}: ${s.sponsorable ? "MegaFuel will sponsor it" : `MegaFuel refuses it${s.reason ? ` (${s.reason})` : ""}`}`);
  if (s.sponsorable || !values.send) return null;
  const funded = await fundFromRecordWallet(from, `${id} ${what} is not sponsored`);
  if (funded && dir) appendLog(dir, { step: `fund ${id}`, ...funded });
  return funded;
}

/** The agent id a register transaction minted, from the registry's own Registered event. */
export async function mintedId(hash: Hex, registry: Address, owner: Address): Promise<number> {
  const rc = await reader.getTransactionReceipt({ hash });
  const ev = parseEventLogs({ abi: identityRegistryAbi, logs: rc.logs, eventName: "Registered" }).filter(
    (l) => getAddress(l.address) === getAddress(registry) && getAddress(l.args.owner) === owner,
  );
  if (ev.length !== 1) stop(`register ${hash} emitted ${ev.length} Registered events for ${owner}`);
  return Number(ev[0]!.args.agentId);
}

async function mint(): Promise<void> {
  const dir = values.send ? evidenceDir(values.evidence) : null;
  const d = readDeployment();
  for (const id of roles) {
    const account = roleAccount(id);
    const a = entry(d, id, account.address);
    if (a.agentId !== null) {
      say(`${id}: agent ${a.agentId} already registered; skipped`);
      continue;
    }
    const held = await reader.readContract({ address: d.registry, abi: identityRegistryAbi, functionName: "balanceOf", args: [account.address] });
    if (held > 0n) stop(`${id}: ${account.address} already owns ${held} identity on the registry, but the record has none; resolve that by hand`);
    const metadata = [
      { metadataKey: "role", metadataValue: stringToHex(id) },
      { metadataKey: "built_with", metadataValue: stringToHex(BUILT_WITH) },
    ];
    const data = encodeFunctionData({ abi: identityRegistryAbi, functionName: "register", args: ["", metadata] });
    const funding = await gasFor(id, account.address, d.registry, data, "register", dir);
    if (funding) a.transactions.funding = funding;
    if (!values.send) {
      await reader.call({ account: account.address, to: d.registry, data });
      say(`${id}: register simulated; nothing sent`);
      continue;
    }
    const startedAt = stamp();
    const hash = await execute(roleKey(id), { address: d.registry, abi: identityRegistryAbi, functionName: "register", args: ["", metadata] }, `${id} register`);
    const tx = await sentTx(hash);
    const agentId = await mintedId(hash, d.registry, account.address);
    const owner = await reader.readContract({ address: d.registry, abi: identityRegistryAbi, functionName: "ownerOf", args: [BigInt(agentId)] });
    const tag = await reader.readContract({ address: d.registry, abi: identityRegistryAbi, functionName: "getMetadata", args: [BigInt(agentId), "role"] });
    if (getAddress(owner) !== account.address) stop(`${id}: agent ${agentId} is owned by ${owner}`);
    if (tag !== stringToHex(id)) stop(`${id}: agent ${agentId}'s role metadata reads ${tag}`);
    a.agentId = agentId;
    a.transactions.register = tx;
    writeDeployment(d);
    appendLog(dir as string, { step: `register ${id}`, agentId, ...tx });
    writeEvidence(dir as string, `register-${id}.json`, {
      step: "ERC-8004 register(agentURI, metadata) through @bnbagent/sdk 0.6.1 with the MegaFuel testnet relay",
      role: id,
      agentId,
      owner: account.address,
      registry: d.registry,
      metadata: { role: id, built_with: BUILT_WITH },
      startedAt,
      transaction: { ...tx, blockStamp: stamp(tx.blockTime) },
      funding: funding ?? "none: the relay sponsored the call",
      readBack: { ownerOf: getAddress(owner), roleMetadata: id },
    });
    say(`${id}: agent ${agentId}, register ${describeTx(tx)}`);
  }
}

async function uri(): Promise<void> {
  const dir = values.send ? evidenceDir(values.evidence) : null;
  const d = readDeployment();
  for (const id of roles) {
    const account = roleAccount(id);
    const a = entry(d, id, account.address);
    if (a.agentId === null) stop(`${id}: not registered; run mint first`);
    if (!a.uri || !a.cardSha256) stop(`${id}: no published card in the record; run cards.ts publish and check first`);
    const current = await reader.readContract({ address: d.registry, abi: identityRegistryAbi, functionName: "tokenURI", args: [BigInt(a.agentId)] });
    if (current === a.uri) {
      say(`${id}: agent ${a.agentId} already points at ${a.uri}; skipped`);
      continue;
    }
    const data = encodeFunctionData({ abi: identityRegistryAbi, functionName: "setAgentURI", args: [BigInt(a.agentId), a.uri] });
    const funding = await gasFor(id, account.address, d.registry, data, "setAgentURI", dir);
    if (funding) a.transactions.funding = funding;
    if (!values.send) {
      await reader.call({ account: account.address, to: d.registry, data });
      say(`${id}: setAgentURI simulated; nothing sent`);
      continue;
    }
    const hash = await execute(roleKey(id), { address: d.registry, abi: identityRegistryAbi, functionName: "setAgentURI", args: [BigInt(a.agentId), a.uri] }, `${id} setAgentURI`);
    const tx = await sentTx(hash);
    const after = await reader.readContract({ address: d.registry, abi: identityRegistryAbi, functionName: "tokenURI", args: [BigInt(a.agentId)] });
    if (after !== a.uri) stop(`${id}: tokenURI reads ${after} after setAgentURI`);
    a.transactions.setAgentURI = tx;
    writeDeployment(d);
    appendLog(dir as string, { step: `setAgentURI ${id}`, agentId: a.agentId, uri: a.uri, ...tx });
    say(`${id}: agent ${a.agentId} -> ${a.uri}, ${describeTx(tx)}`);
  }
}

async function status(): Promise<void> {
  await assertTestnet();
  const d = readDeployment();
  const views = await readAgents(jsonRpcCaller(RPCS), d);
  for (const v of views) {
    const a = d.agents.find((x) => x.role === v.role);
    const ok = Object.entries(v.checks).map(([k, b]) => `${k} ${b ? "ok" : "NO"}`).join(", ");
    say(`${v.role}: agent ${a?.agentId ?? "-"} ${v.error ? `(${v.error})` : ok}`);
  }
}

await assertTestnet();
const commands: Record<string, () => Promise<void>> = { mint, uri, status };
const run = commands[cmd];
if (!run) stop(`unknown command ${cmd}; use mint, uri or status`);
await run();
