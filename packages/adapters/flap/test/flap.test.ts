import { describe, expect, it } from 'vitest';
import { decodeFunctionData, encodeFunctionResult, parseAbi } from 'viem';
import type { Address } from 'viem';
import {
  assertLaunchPayment, ceilDiv, previewLaunch, readGraduationLens, readPortalSnapshot,
  PORTAL, READ_ABI, WAD, ZERO,
} from '../src/index.js';
import type { FactoryState, Plan, QuoteState, ReadMethod, RpcRead } from '../src/index.js';

const factory: FactoryState = { enabled: true, multiplierBps: 10_000 };
const native: QuoteState = { address: ZERO, enabled: true, decimals: 18, priceUsdWad: 700n * WAD };
const plan: Plan = { totalSupply: 1_000_000_000n * WAD, poolToken: 500_000_000n * WAD, poolQuote: 3n * WAD, creatorBuyQuote: 0n };
const factoryAddress: Address = '0x0000000000000000000000000000000000000001';
const launcherAddress: Address = '0x0000000000000000000000000000000000000002';
const erc20: Address = '0x0000000000000000000000000000000000000003';

describe('Pool Launch funding preview', () => {
  it('accounts for the pool share rather than using a fixed $750 floor', () => {
    const p = previewLaunch(97, native, factory, plan);
    expect(p.creationFloorUsdWad).toBe(1_500n * WAD);
    expect(p.graduationFloorUsdWad).toBe(3_000n * WAD);
    expect(p.quoteUsdWad).toBe(2_100n * WAD);
    expect(p.meetsCreationFloor).toBe(true);
    expect(p.meetsGraduationFloor).toBe(false);
    expect(p.reserveToken).toBe(plan.totalSupply / 2n);
  });

  it('finds the first sufficient raw quote unit without rounding down', () => {
    const minimum = previewLaunch(97, native, factory, plan).minimumCreationQuote;
    expect(previewLaunch(97, native, factory, { ...plan, poolQuote: minimum - 1n }).meetsCreationFloor).toBe(false);
    expect(previewLaunch(97, native, factory, { ...plan, poolQuote: minimum }).meetsCreationFloor).toBe(true);
  });

  it('handles a six-decimal quote token without confusing its raw units with WAD', () => {
    const quote = { ...native, address: erc20, decimals: 6, priceUsdWad: WAD };
    const p = previewLaunch(97, quote, factory, { ...plan, poolQuote: 1_500_000_000n, creatorBuyQuote: 2_000_000n });
    expect(p.quoteUsdWad).toBe(1_500n * WAD);
    expect(p.minimumGraduationQuote).toBe(3_000_000_000n);
    expect(p.nativeValue).toBe(0n);
    expect(p.requiredAllowance).toBe(1_502_000_000n);
    assertLaunchPayment(p, 0n, p.requiredAllowance);
    expect(() => assertLaunchPayment(p, 1n, p.requiredAllowance)).toThrow('exactly');
    expect(() => assertLaunchPayment(p, 0n, p.requiredAllowance - 1n)).toThrow('allowance');
  });

  it('includes creator first-buy quote but excludes the separate salt-lock fee', () => {
    const p = previewLaunch(97, native, factory, { ...plan, creatorBuyQuote: WAD });
    expect(p.nativeValue).toBe(4n * WAD);
    assertLaunchPayment(p, 4n * WAD, 0n);
    expect(() => assertLaunchPayment(p, 4n * WAD + WAD / 200n, 0n)).toThrow('exactly');
  });

  it('uses enabled Vault-factory precedence and ignores a disabled Vault discount', () => {
    const launcher = { enabled: true, multiplierBps: 2_500 };
    expect(previewLaunch(97, native, launcher, plan, { enabled: true, multiplierBps: 5_000 }).multiplierBps).toBe(5_000);
    expect(previewLaunch(97, native, launcher, plan, { enabled: false, multiplierBps: 0 }).multiplierBps).toBe(2_500);
    expect(previewLaunch(97, native, launcher, plan, { enabled: true, multiplierBps: 0 }).creationFloorUsdWad).toBe(0n);
  });

  it('allows testnet admission but ignores a disabled Launcher discount', () => {
    const p = previewLaunch(97, native, { enabled: false, multiplierBps: 0 }, plan);
    expect(p.multiplierBps).toBe(10_000);
    expect(p.creationFloorUsdWad).toBe(1_500n * WAD);
    expect(p.meetsCreationFloor).toBe(true);
  });

  it('retains enabled Vault precedence when the testnet Launcher is disabled', () => {
    const p = previewLaunch(97, native, { enabled: false, multiplierBps: 0 }, plan, { enabled: true, multiplierBps: 2_500 });
    expect(p.multiplierBps).toBe(2_500);
    expect(p.creationFloorUsdWad).toBe(375n * WAD);
  });

  it('rejects unsupported chains, disabled quote pairs and invalid denomination', () => {
    expect(() => previewLaunch(56, native, factory, plan)).toThrow('chain 97');
    expect(() => previewLaunch(97, { ...native, enabled: false }, factory, plan)).toThrow('Quote pair');
    expect(() => previewLaunch(97, { ...native, decimals: 6 }, factory, plan)).toThrow('18 decimals');
    expect(() => previewLaunch(97, { ...native, priceUsdWad: 0n }, factory, plan)).toThrow('positive');
  });

  it('rejects impossible token allocations and unbounded multipliers', () => {
    expect(() => previewLaunch(97, native, factory, { ...plan, poolToken: plan.totalSupply + 1n })).toThrow('pool token');
    expect(() => previewLaunch(97, native, factory, { ...plan, totalSupply: 99n * WAD })).toThrow('supply');
    expect(() => previewLaunch(97, native, factory, { ...plan, poolQuote: 0n })).toThrow('quote amount');
    expect(() => previewLaunch(97, native, { ...factory, multiplierBps: 10_001 }, plan)).toThrow('multiplier');
    expect(() => ceilDiv(1n, 0n)).toThrow('division');
  });
});

function mockRpc(chainId = '0x61', recordedFactory = factoryAddress) {
  const requests: { method: ReadMethod; params: readonly unknown[] }[] = [];
  const lensResult = { meetsFloor: false, floorUsdWad: 3_000n * WAD, quoteUsdWad: 2_100n * WAD, multiplierBps: 10_000, meetsCreateFloor: true, createFloorUsdWad: 1_500n * WAD };
  const rpc: RpcRead = async (method, params) => {
    requests.push({ method, params });
    if (method === 'eth_chainId') return chainId;
    if (method === 'eth_getBlockByNumber') return { number: '0x2a', hash: `0x${'ab'.repeat(32)}`, timestamp: '0x100' };
    if (method === 'eth_getCode') return '0x6000';
    const tx = params[0] as { to: Address; data: `0x${string}` };
    if (tx.to === erc20) {
      return encodeFunctionResult({ abi: parseAbi(['function decimals() view returns (uint8)']), functionName: 'decimals', result: 6 });
    }
    const { functionName } = decodeFunctionData({ abi: READ_ABI, data: tx.data });
    switch (functionName) {
      case 'version': return encodeFunctionResult({ abi: READ_ABI, functionName, result: 'v1.2.0' });
      case 'featureFlags': return encodeFunctionResult({ abi: READ_ABI, functionName, result: 1n });
      case 'SALT_LOCK_FEE': return encodeFunctionResult({ abi: READ_ABI, functionName, result: WAD / 200n });
      case 'launchQuoteConfig': return encodeFunctionResult({ abi: READ_ABI, functionName, result: [true, 700n * WAD] });
      case 'launcherFactoryMultiplier': return encodeFunctionResult({ abi: READ_ABI, functionName, result: [true, 10_000] });
      case 'getLauncher': return encodeFunctionResult({ abi: READ_ABI, functionName, result: { launcherFactory: recordedFactory } });
      case 'graduationFloorV2':
      case 'graduationFloorV2ForLauncher': return encodeFunctionResult({ abi: READ_ABI, functionName, result: lensResult });
    }
  };
  return { rpc, requests, lensResult };
}

describe('Pinned read-only Portal observations', () => {
  it('checks chain identity before any contract request', async () => {
    const { rpc, requests } = mockRpc('0x38');
    await expect(readPortalSnapshot(rpc, factoryAddress)).rejects.toThrow('chain 97');
    expect(requests.map(r => r.method)).toEqual(['eth_chainId']);
  });

  it('reads every contract at one block, preserving quote origin and pause state', async () => {
    const { rpc, requests } = mockRpc();
    const s = await readPortalSnapshot(rpc, factoryAddress);
    expect(s.portal).toBe(PORTAL);
    expect(s.blockNumber).toBe(42n);
    expect(s.creationPaused).toBe(true);
    expect(s.saltLockFee).toBe(WAD / 200n);
    expect(s.quote).toEqual(native);
    for (const request of requests.filter(r => ['eth_getCode', 'eth_call'].includes(r.method))) {
      expect(request.params[1]).toBe('0x2a');
    }
  });

  it('reads ERC20 decimals from that same pinned block', async () => {
    const { rpc } = mockRpc();
    expect((await readPortalSnapshot(rpc, factoryAddress, erc20)).quote.decimals).toBe(6);
  });

  it('uses ForLauncher only after proving its recorded factory', async () => {
    const { rpc, requests, lensResult } = mockRpc();
    const s = await readPortalSnapshot(rpc, factoryAddress);
    const p = { quoteToken: ZERO, quotePriceUsd: s.quote.priceUsdWad, poolQuote: plan.poolQuote, poolToken: plan.poolToken, totalSupply: plan.totalSupply, vaultFactory: ZERO };
    expect(await readGraduationLens(rpc, s, p, launcherAddress)).toEqual(lensResult);
    const functionNames = requests.filter(r => r.method === 'eth_call').map(r => decodeFunctionData({ abi: READ_ABI, data: (r.params[0] as { data: `0x${string}` }).data }).functionName);
    expect(functionNames.slice(-2)).toEqual(['getLauncher', 'graduationFloorV2ForLauncher']);
  });

  it('refuses unrelated Launchers and substitute oracle prices', async () => {
    const { rpc } = mockRpc('0x61', ZERO);
    const s = await readPortalSnapshot(rpc, factoryAddress);
    const p = { quoteToken: ZERO, quotePriceUsd: s.quote.priceUsdWad, poolQuote: plan.poolQuote, poolToken: plan.poolToken, totalSupply: plan.totalSupply, vaultFactory: ZERO };
    await expect(readGraduationLens(rpc, s, p, launcherAddress)).rejects.toThrow('pinned factory');
    await expect(readGraduationLens(rpc, s, { ...p, quotePriceUsd: 900n * WAD })).rejects.toThrow('Portal quote');
  });

  it('rechecks chain identity for lens reads when the transport changes networks', async () => {
    const { rpc } = mockRpc();
    const s = await readPortalSnapshot(rpc, factoryAddress);
    const { rpc: wrongRpc, requests } = mockRpc('0x38');
    await expect(readGraduationLens(wrongRpc, s, { quoteToken: ZERO, quotePriceUsd: s.quote.priceUsdWad, poolQuote: plan.poolQuote, poolToken: plan.poolToken, totalSupply: plan.totalSupply, vaultFactory: ZERO })).rejects.toThrow('chain 97');
    expect(requests.map(r => r.method)).toEqual(['eth_chainId']);
  });
});
