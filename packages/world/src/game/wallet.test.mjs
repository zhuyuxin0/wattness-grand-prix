// "Seal my plan" against a scripted EIP-1193 wallet: it seals only on chain 97, switching or adding the testnet
// through the wallet, refuses any other chain (and a wallet that leaves 97 before signing), refuses after the gate by
// the page's clock or the chain's, names the contract's own refusals, and reads the receipt's Committed event back.
// No transaction leaves this file: the wallet is a script that records what it was asked.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { leafHash as coreLeafHash } from '../../../core/src/hash.ts';
import { GATE_RECORD, gateUnix } from './chain.ts';
import { DIAL_STEPS, fieldFromFrameData, play } from './model.ts';
import { SealError, sealPlan } from './wallet.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const viem = await import(pathToFileURL(createRequire(resolve(repo, 'packages/core/package.json')).resolve('viem')).href);
const abi = JSON.parse(readFileSync(resolve(repo, 'contracts/abi/GateRecord.json'), 'utf8'));
const F = fieldFromFrameData(JSON.parse(readFileSync(resolve(here, '../data/frame-data.json'), 'utf8')));
const GATE = gateUnix(F.operatingDay);
const ACCOUNT = '0x2222222222222222222222222222222222222222';
const glass = Object.assign(new Array(24).fill(0), { 5: 14, 7: 34, 9: -17, 10: -71, 11: -100, 12: -14, 17: 95 });
const plan = { step: DIAL_STEPS, glass };
const played = play(F, plan);
const hex = (n) => `0x${BigInt(n).toString(16)}`;

/** A scripted wallet: chain, clock and behavior set per test; every request is logged. */
function wallet({ chain = '0x61', switchable = true, known = true, chainTime = GATE - 600, existing = null, reject = false, leaveAfterEstimate = false } = {}) {
  const log = [], sent = [];
  let chainId = chain, mined = null;
  const provider = {
    async request({ method, params }) {
      log.push(method);
      switch (method) {
        case 'eth_requestAccounts': return [ACCOUNT];
        case 'eth_chainId': return chainId;
        case 'wallet_switchEthereumChain':
          if (!switchable) throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
          if (!known) throw Object.assign(new Error('Unrecognized chain ID'), { code: 4902 });
          chainId = params[0].chainId; return null;
        case 'wallet_addEthereumChain': known = true; chainId = params[0].chainId; return null;
        case 'eth_getBlockByNumber': return { timestamp: hex(params[0] === 'latest' ? chainTime : chainTime + 3) };
        case 'eth_call': {
          const { args } = viem.decodeFunctionData({ abi, data: params[0].data });
          const zero = `0x${'0'.repeat(64)}`;
          const rec = existing ?? { root: zero, codeHash: zero, scope: zero, committer: '0x0000000000000000000000000000000000000000', od: 0, leafCount: 0, committedAt: 0n, blockNumber: 0n };
          expect(args[0]).toMatch(/^0x[0-9a-f]{64}$/);
          return viem.encodeFunctionResult({ abi, functionName: 'get', result: rec });
        }
        case 'eth_estimateGas':
          if (chainTime >= GATE) throw Object.assign(new Error('execution reverted'), { code: 3, data: viem.encodeErrorResult({ abi, errorName: 'AfterGate', args: [20261126, BigInt(GATE)] }) });
          if (leaveAfterEstimate) chainId = '0x38';
          return '0x186a0';
        case 'eth_sendTransaction': {
          // the one guard that matters most: nothing is ever sent anywhere but chain 97
          if (chainId !== '0x61' || params[0].chainId !== '0x61') throw new Error(`sent on chain ${chainId}`);
          if (reject) throw Object.assign(new Error('User denied transaction signature.'), { code: 4001 });
          const { functionName, args } = viem.decodeFunctionData({ abi, data: params[0].data });
          sent.push({ to: params[0].to, functionName, args, from: params[0].from });
          const [scope, od, root, leafCount, codeHash] = args;
          const key = viem.keccak256(viem.encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }, { type: 'uint32' }], [ACCOUNT, scope, od]));
          const ev = abi.find((x) => x.type === 'event' && x.name === 'Committed');
          mined = {
            status: '0x1', blockNumber: hex(70_000_123), transactionHash: `0x${'cd'.repeat(32)}`,
            logs: [{ address: GATE_RECORD, topics: viem.encodeEventTopics({ abi: [ev], eventName: 'Committed', args: { key, committer: ACCOUNT, scope } }), data: viem.encodeAbiParameters(ev.inputs.filter((i) => !i.indexed), [od, root, leafCount, codeHash]) }],
          };
          return mined.transactionHash;
        }
        case 'eth_getTransactionReceipt': { const r = mined; mined = r; return log.filter((m) => m === 'eth_getTransactionReceipt').length > 1 ? r : null; }
        default: throw new Error(`unexpected ${method}`);
      }
    },
  };
  return { provider, log, sent };
}

const seal = (w, extra = {}) => sealPlan(w.provider, { field: F, plan, played, now: () => GATE - 900, pollMs: 1, ...extra });
const refusal = async (p) => { try { await p; } catch (e) { return e; } throw new Error('expected a refusal'); };

describe('Seal my plan', () => {
  it('seals on chain 97 and reads its receipt back: one leaf, the arena scope, the leaf as the root', async () => {
    const w = wallet();
    const steps = [];
    const r = await seal(w, { onStep: (s) => steps.push(s) });
    expect(steps).toEqual(['connect', 'network', 'gate', 'record', 'sign', 'confirm', 'done']);
    expect(w.sent).toHaveLength(1);
    const { to, functionName, args } = w.sent[0];
    expect(to).toBe(GATE_RECORD);
    expect(functionName).toBe('commit');
    expect(args[0]).toBe(viem.keccak256(viem.stringToBytes('gate-record/arena/one-plan/DSWL_ESS_ESR1')));
    expect(args[1]).toBe(20261126);
    expect(args[2]).toBe(coreLeafHash(r.record.doc));
    expect(args[3]).toBe(1);
    expect(r.record.doc.committer).toBe(ACCOUNT);
    expect(r.record.doc.score.objective_uusd).toBe(played.score.objective);
    expect(r.chainId).toBe(97);
    expect(r.blockNumber).toBe(70_000_123);
    expect(r.secondsBeforeGate).toBe(600 - 3);
    expect(r.txUrl).toBe(`https://testnet.bscscan.com/tx/${r.txHash}`);
  });

  it('switches a wallet on BSC mainnet to the testnet through the wallet before anything else', async () => {
    const w = wallet({ chain: '0x38' });
    await seal(w);
    expect(w.log.indexOf('wallet_switchEthereumChain')).toBeLessThan(w.log.indexOf('eth_sendTransaction'));
    expect(w.sent).toHaveLength(1);
  });

  it('adds the testnet to a wallet that does not know it', async () => {
    const w = wallet({ chain: '0x1', known: false });
    await seal(w);
    expect(w.log).toContain('wallet_addEthereumChain');
    expect(w.sent).toHaveLength(1);
  });

  it('refuses any chain but 97 when the switch is declined, and sends nothing', async () => {
    const w = wallet({ chain: '0x38', switchable: false });
    const e = await refusal(seal(w));
    expect(e).toBeInstanceOf(SealError);
    expect(e.code).toBe('wrong-chain');
    expect(e.message).toMatch(/chain 56/);
    expect(w.log).not.toContain('eth_sendTransaction');
  });

  it('refuses a wallet that leaves the testnet after the checks, before signing', async () => {
    const w = wallet({ leaveAfterEstimate: true });
    const e = await refusal(seal(w));
    expect(e.code).toBe('wrong-chain');
    expect(w.log).not.toContain('eth_sendTransaction');
  });

  it('refuses after the gate by the page\'s clock without touching the wallet, and by the chain\'s clock before signing', async () => {
    const early = wallet();
    expect((await refusal(seal(early, { now: () => GATE }))).code).toBe('gate-closed');
    expect(early.log).toEqual([]);
    const late = wallet({ chainTime: GATE + 22 });
    expect((await refusal(seal(late))).code).toBe('gate-closed');
    expect(late.log).not.toContain('eth_sendTransaction');
  });

  it('names a record this wallet already holds for the day, and sends nothing', async () => {
    const w = wallet({ existing: { root: `0x${'11'.repeat(32)}`, codeHash: `0x${'0'.repeat(64)}`, scope: `0x${'22'.repeat(32)}`, committer: ACCOUNT, od: 20261126, leafCount: 1, committedAt: 1n, blockNumber: 2n } });
    const e = await refusal(seal(w));
    expect(e.code).toBe('already-sealed');
    expect(w.log).not.toContain('eth_sendTransaction');
  });

  it('reports a declined signature plainly', async () => {
    const e = await refusal(seal(wallet({ reject: true })));
    expect(e.code).toBe('rejected');
    expect(e.message).toMatch(/Nothing was sent/);
  });

  it('refuses a plan with the light on, and a page without a wallet', async () => {
    const lit = { step: 0, glass: [...F.arms.C.contracts] };
    expect((await refusal(sealPlan(wallet().provider, { field: F, plan: lit, played: play(F, lit), now: () => GATE - 900 }))).code).toBe('not-sealable');
    expect((await refusal(sealPlan(undefined, { field: F, plan, played, now: () => GATE - 900 }))).code).toBe('no-wallet');
  });
});
