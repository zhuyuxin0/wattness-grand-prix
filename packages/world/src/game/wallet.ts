// "Seal my plan": the visitor's own wallet commits the plan to GateRecord on BSC testnet, through EIP-1193 only. The
// page never holds or asks for a key. Every step refuses any chain but 97: the chain is read before the gate check,
// switched (or added) through the wallet if it differs, and read again right before the transaction is sent, which
// also names chainId 0x61 for a wallet that checks it. The gate is checked against the page's clock and the chain's
// latest block; an existing record for the same wallet, scope and day is read first; the commit is estimated so the
// contract's own refusals (AfterGate, AlreadyCommitted) are named before anything is signed.
import { BSC_TESTNET, GATE_RECORD, decodeRecord, decodeRevert, encodeCommit, encodeGet, explorerTx, findCommitted, gateUnix, recordKey, type Revert } from './chain';
import type { Hex } from './hash';
import { arenaLeaf, arenaRecord, freshSalt, type ArenaRecord } from './leaf';
import type { Field, Played, PlayerPlan } from './model';

export interface Eip1193 {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on?(event: string, fn: (...a: any[]) => void): void;
  removeListener?(event: string, fn: (...a: any[]) => void): void;
}

export type SealStep = 'connect' | 'network' | 'gate' | 'record' | 'sign' | 'confirm' | 'done';

export type SealErrorCode = 'no-wallet' | 'rejected' | 'wrong-chain' | 'gate-closed' | 'already-sealed' | 'not-sealable' | 'reverted' | 'timeout' | 'wallet';

export class SealError extends Error {
  override name = 'SealError';
  constructor(readonly code: SealErrorCode, message: string, readonly detail?: unknown) { super(message); }
}

export interface SealReceipt {
  chainId: 97;
  contract: typeof GATE_RECORD;
  txHash: Hex;
  txUrl: string;
  blockNumber: number;
  blockTime: number;
  gate: number;
  secondsBeforeGate: number;
  key: Hex;
  committer: Hex;
  record: ArenaRecord;
}

export interface SealArgs {
  field: Field;
  plan: PlayerPlan;
  played: Played;
  /** Unix seconds; the page's clock for the gate. */
  now(): number;
  onStep?(step: SealStep, note?: string): void;
  codeHash?: Hex;
  salt?: Hex;
  /** Between receipt polls (ms) and the longest wait for one (ms). */
  pollMs?: number;
  timeoutMs?: number;
}

const hexNum = (h: unknown) => (typeof h === 'string' ? Number(BigInt(h)) : Number(h));

/** The first 0x-prefixed revert payload anywhere in a wallet's error (wallets nest it differently). */
function revertData(e: unknown, depth = 0): string | null {
  if (depth > 5 || e == null) return null;
  if (typeof e === 'string') return /^0x[0-9a-fA-F]{8}/.test(e) ? e : null;
  if (typeof e !== 'object') return null;
  for (const k of ['data', 'error', 'originalError', 'cause', 'info', 'body']) {
    const v = (e as Record<string, unknown>)[k];
    if (typeof v === 'string' && k === 'body') { try { const r = revertData(JSON.parse(v), depth + 1); if (r) return r; } catch { /* not JSON */ } continue; }
    const r = revertData(v, depth + 1);
    if (r) return r;
  }
  return null;
}

const codeOf = (e: unknown): number | null => {
  for (let x: any = e, i = 0; x && i < 4; x = x.error ?? x.cause ?? x.data, i++) if (typeof x?.code === 'number') return x.code;
  return null;
};

export function describeRevert(r: Revert): string {
  switch (r.name) {
    case 'AfterGate': return `GateRecord refused it: AfterGate(${r.od}, ${r.gate}). The day-ahead gate for this day has passed.`;
    case 'AlreadyCommitted': return `GateRecord refused it: AlreadyCommitted. This wallet has already sealed a plan for this battery and day.`;
    case 'EmptyRecord': return 'GateRecord refused it: EmptyRecord.';
    case 'InvalidDay': return `GateRecord refused it: InvalidDay(${r.od}).`;
  }
}

function asSealError(e: unknown, during: string): SealError {
  if (e instanceof SealError) return e;
  const code = codeOf(e);
  if (code === 4001) return new SealError('rejected', 'You declined in your wallet. Nothing was sent.');
  const r = decodeRevert(revertData(e));
  if (r) return new SealError(r.name === 'AfterGate' ? 'gate-closed' : r.name === 'AlreadyCommitted' ? 'already-sealed' : 'reverted', describeRevert(r), r);
  const msg = (e as any)?.message ?? String(e);
  return new SealError('wallet', `The wallet could not ${during}: ${String(msg).slice(0, 200)}`);
}

/** The wallet's chain, switched to BSC testnet through the wallet (added first if it does not know it). */
export async function ensureTestnet(provider: Eip1193): Promise<void> {
  const chain = hexNum(await provider.request({ method: 'eth_chainId' }));
  if (chain === BSC_TESTNET.chainId) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_TESTNET.hex }] });
  } catch (e) {
    if (codeOf(e) === 4001) throw new SealError('wrong-chain', `Your wallet is on chain ${chain}. ONE PLAN seals on ${BSC_TESTNET.name} (chain 97) only, and the switch was declined.`);
    if (codeOf(e) !== 4902) throw new SealError('wrong-chain', `Your wallet is on chain ${chain} and could not switch to ${BSC_TESTNET.name} (chain 97).`, e);
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{ chainId: BSC_TESTNET.hex, chainName: BSC_TESTNET.name, nativeCurrency: BSC_TESTNET.currency, rpcUrls: [...BSC_TESTNET.rpcUrls], blockExplorerUrls: [BSC_TESTNET.explorer] }],
    }).catch((err) => { throw new SealError('wrong-chain', `Your wallet could not add ${BSC_TESTNET.name} (chain 97).`, err); });
  }
  const now = hexNum(await provider.request({ method: 'eth_chainId' }));
  if (now !== BSC_TESTNET.chainId) throw new SealError('wrong-chain', `Your wallet is on chain ${now}. ONE PLAN seals on ${BSC_TESTNET.name} (chain 97) only.`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Seals a plan; resolves with the receipt once the transaction is mined and its Committed event read back. */
export async function sealPlan(provider: Eip1193 | null | undefined, a: SealArgs): Promise<SealReceipt> {
  if (!provider || typeof provider.request !== 'function') throw new SealError('no-wallet', 'No browser wallet found on this page.');
  const step = (s: SealStep, note?: string) => a.onStep?.(s, note);
  if (a.played.lit) throw new SealError('not-sealable', 'Light on: some glass sells or buys more than the schedule delivers. Fit the glass or turn the dial first.');
  if (a.played.limits.length) throw new SealError('not-sealable', `The plan breaks a limit: ${a.played.limits[0]}.`);
  const gate = gateUnix(a.field.operatingDay);
  if (a.now() >= gate) throw new SealError('gate-closed', `The day-ahead gate for ${a.field.operatingDay} has passed.`);

  step('connect');
  let account: string;
  try {
    const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
    if (!Array.isArray(accounts) || !accounts[0]) throw new SealError('wallet', 'The wallet returned no account.');
    account = accounts[0].toLowerCase();
  } catch (e) { throw asSealError(e, 'connect'); }

  step('network');
  await ensureTestnet(provider);

  step('gate');
  const latest = (await provider.request({ method: 'eth_getBlockByNumber', params: ['latest', false] })) as { timestamp?: string } | null;
  const chainNow = hexNum(latest?.timestamp ?? '0x0');
  if (chainNow >= gate || a.now() >= gate) throw new SealError('gate-closed', `The day-ahead gate for ${a.field.operatingDay} has passed on chain.`);

  const doc = arenaLeaf(a.field, a.plan, a.played, account, a.salt ?? freshSalt());
  const record = arenaRecord(doc, a.codeHash);
  const key = recordKey(account, record.scope, record.od);

  step('record');
  const existing = decodeRecord(String(await provider.request({ method: 'eth_call', params: [{ to: GATE_RECORD, data: encodeGet(key) }, 'latest'] })));
  if (!/^0x0{40}$/.test(existing.committer)) throw new SealError('already-sealed', `This wallet already sealed a plan for ${a.field.resource} on ${a.field.operatingDay} (root ${existing.root.slice(0, 10)}…).`, existing);
  const tx = { from: account, to: GATE_RECORD, data: encodeCommit(record), value: '0x0' };
  try { await provider.request({ method: 'eth_estimateGas', params: [tx] }); } catch (e) { throw asSealError(e, 'estimate the commit'); }

  // the last word on the chain before anything is signed
  if (hexNum(await provider.request({ method: 'eth_chainId' })) !== BSC_TESTNET.chainId) throw new SealError('wrong-chain', `The wallet left ${BSC_TESTNET.name}. Nothing was sent.`);
  step('sign');
  let txHash: Hex;
  try { txHash = (await provider.request({ method: 'eth_sendTransaction', params: [{ ...tx, chainId: BSC_TESTNET.hex }] })) as Hex; }
  catch (e) { throw asSealError(e, 'send the commit'); }

  step('confirm', txHash);
  const deadline = Date.now() + (a.timeoutMs ?? 180_000);
  let receipt: any = null;
  while (!receipt) {
    receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [txHash] }).catch(() => null);
    if (receipt) break;
    if (Date.now() > deadline) throw new SealError('timeout', `Sent as ${txHash}, not confirmed yet. Check it on the explorer.`, { txHash });
    await sleep(a.pollMs ?? 1500);
  }
  if (hexNum(receipt.status) !== 1) throw new SealError('reverted', `The commit was mined and reverted (${txHash}).`, { txHash });
  const ev = findCommitted(receipt.logs ?? []);
  if (!ev || ev.key !== key || ev.root !== record.root) throw new SealError('reverted', `The receipt for ${txHash} carries no matching Committed event.`, { txHash });
  const block = (await provider.request({ method: 'eth_getBlockByNumber', params: [receipt.blockNumber, false] })) as { timestamp?: string } | null;
  const blockTime = hexNum(block?.timestamp ?? '0x0');
  step('done', txHash);
  return {
    chainId: 97, contract: GATE_RECORD, txHash, txUrl: explorerTx(txHash), blockNumber: hexNum(receipt.blockNumber), blockTime, gate,
    secondsBeforeGate: gate - blockTime, key, committer: ev.committer, record,
  };
}
