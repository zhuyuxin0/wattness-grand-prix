import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeFunctionResult, encodeFunctionData, formatUnits, parseAbi } from 'viem';
import type { Address, Hex } from 'viem';
import { previewLaunch, readGraduationLens, readPortalSnapshot, READ_ABI, PORTAL, WAD, ZERO } from './index.js';
import type { RpcRead } from './index.js';

const endpoint = 'https://bsc-testnet-rpc.publicnode.com';
const calls: unknown[] = [];
let id = 0;
const json = (value: unknown) => JSON.stringify(value, (_key, v: unknown) => typeof v === 'bigint' ? v.toString() : v, 2);
const rpc: RpcRead = async (method, params) => {
  const request = { jsonrpc: '2.0', id: ++id, method, params };
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json(request),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body = await response.json() as { error?: { code?: number; message?: string }; result?: unknown };
  let sanitized = body;
  if (method === 'eth_getBlockByNumber' && body.result && typeof body.result === 'object') {
    const b = body.result as Record<string, unknown>;
    sanitized = { result: { number: b['number'], hash: b['hash'], timestamp: b['timestamp'] } };
  }
  calls.push({ request, response: sanitized, observedAt: new Date().toISOString() });
  if (body.error) throw new Error(`RPC error ${body.error.code}: ${body.error.message}`);
  return body.result;
};

// No custom factory is deployed. The zero address explicitly records that gap;
// enabling this hypothetical state below is solely for numerical funding previews.
const snapshot = await readPortalSnapshot(rpc, ZERO);
const at = `0x${snapshot.blockNumber.toString(16)}`;
const referenceFactories = [];
for (const address of ['0xc574f30e2ee26fe638eece6d9876217015cd0a38', '0x73db8da6f72f6300c584c506edb652fb903b975c'] as const) {
  const data = encodeFunctionData({ abi: READ_ABI, functionName: 'launcherFactoryMultiplier', args: [address] });
  const [enabled, multiplierBps] = decodeFunctionResult({ abi: READ_ABI, functionName: 'launcherFactoryMultiplier', data: await rpc('eth_call', [{ to: PORTAL, data }, at]) as Hex });
  referenceFactories.push({ address, enabled, multiplierBps, scope: 'Third-party example factory from the pinned Flap template; not a Wattness factory.' });
}
const tokenAbi = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)']);
const faucetQuotes = [];
for (const address of ['0x190C989D5665a0e404B444b53CAE9AbCfb600157', '0xbB4d1E045F0823D581E122E5Ff43FB1c5116c975'] as Address[]) {
  const symbolData = encodeFunctionData({ abi: tokenAbi, functionName: 'symbol' });
  const decimalsData = encodeFunctionData({ abi: tokenAbi, functionName: 'decimals' });
  const quoteData = encodeFunctionData({ abi: READ_ABI, functionName: 'launchQuoteConfig', args: [0, address] });
  const symbol = decodeFunctionResult({ abi: tokenAbi, functionName: 'symbol', data: await rpc('eth_call', [{ to: address, data: symbolData }, at]) as Hex });
  const decimals = decodeFunctionResult({ abi: tokenAbi, functionName: 'decimals', data: await rpc('eth_call', [{ to: address, data: decimalsData }, at]) as Hex });
  const [enabled, priceUsdWad] = decodeFunctionResult({ abi: READ_ABI, functionName: 'launchQuoteConfig', data: await rpc('eth_call', [{ to: PORTAL, data: quoteData }, at]) as Hex });
  faucetQuotes.push({ address, symbol, decimals, enabled, priceUsdWad, scope: 'Faucet-listed test asset, not a claim on real currency.' });
}
const plan = { totalSupply: 1_000_000_000n * WAD, poolToken: 500_000_000n * WAD, poolQuote: 2n * WAD, creatorBuyQuote: 0n };
const before = previewLaunch(97, snapshot.quote, { enabled: true, multiplierBps: 10_000 }, plan);
const afterPlan = { ...plan, poolQuote: before.minimumCreationQuote };
const after = previewLaunch(97, snapshot.quote, { enabled: true, multiplierBps: 10_000 }, afterPlan);
const parameters = { quoteToken: ZERO, quotePriceUsd: snapshot.quote.priceUsdWad, poolQuote: plan.poolQuote, poolToken: plan.poolToken, totalSupply: plan.totalSupply, vaultFactory: ZERO };
const beforeLens = await readGraduationLens(rpc, snapshot, parameters);
const afterLens = await readGraduationLens(rpc, snapshot, { ...parameters, poolQuote: afterPlan.poolQuote });
const packet = {
  endpoint, snapshot, referenceFactories, faucetQuotes, calls,
  fundingReview: {
    scope: 'Hypothetical seed preview at live Portal configuration; no factory, token, contribution or transaction exists.',
    before: { plan, preview: before, authoritativeLens: beforeLens },
    after: { plan: afterPlan, preview: after, authoritativeLens: afterLens },
    change: `Raise pool quote from 2 to ${formatUnits(afterPlan.poolQuote, 18)} tBNB to meet the creation floor. The salt-lock fee remains separate.`,
  },
  transactionHashes: [],
};
const output = resolve(process.argv[2] ?? fileURLToPath(new URL('../../../../evidence/flap/live-read.json', import.meta.url)));
await mkdir(resolve(output, '..'), { recursive: true });
await writeFile(output, `${json(packet)}\n`);
console.log(json({ snapshot, beforeLens, afterLens, output }));
