import { decodeFunctionResult, encodeFunctionData, isAddress, parseAbi } from 'viem';
import type { Address, Hex } from 'viem';

export const CHAIN_ID = 97;
export const PORTAL: Address = '0x000042108465206185A077Edc3F3fd2b49060000';
export const ZERO: Address = '0x0000000000000000000000000000000000000000';
export const WAD = 10n ** 18n;

// Pool Launch, not the legacy bonding-curve Portal. See the pinned source table.
export const READ_ABI = parseAbi([
  'function version() view returns (string)',
  'function featureFlags() view returns (uint256)',
  'function SALT_LOCK_FEE() view returns (uint256)',
  'function launchQuoteConfig(uint8 kind, address quoteToken) view returns (bool enabled, uint256 quotePriceUsd)',
  'function launcherFactoryMultiplier(address factory) view returns (bool enabled, uint16 multiplierBps)',
  'function getLauncher(address launcher) view returns ((address launcherFactory) record)',
  'function graduationFloorV2((address quoteToken,uint256 quotePriceUsd,uint256 poolQuote,uint256 poolToken,uint256 totalSupply,address vaultFactory) params) view returns ((bool meetsFloor,uint256 floorUsdWad,uint256 quoteUsdWad,uint16 multiplierBps,bool meetsCreateFloor,uint256 createFloorUsdWad))',
  'function graduationFloorV2ForLauncher((address quoteToken,uint256 quotePriceUsd,uint256 poolQuote,uint256 poolToken,uint256 totalSupply,address vaultFactory) params,address launcher) view returns ((bool meetsFloor,uint256 floorUsdWad,uint256 quoteUsdWad,uint16 multiplierBps,bool meetsCreateFloor,uint256 createFloorUsdWad))',
]);
const DECIMALS_ABI = parseAbi(['function decimals() view returns (uint8)']);

export interface FactoryState {
  enabled: boolean;
  multiplierBps: number;
}
export interface QuoteState {
  address: Address;
  enabled: boolean;
  decimals: number;
  priceUsdWad: bigint;
}
export interface Plan {
  totalSupply: bigint;
  poolToken: bigint;
  poolQuote: bigint;
  creatorBuyQuote: bigint;
}
export interface Preview {
  multiplierBps: number;
  quoteUsdWad: bigint;
  creationFloorUsdWad: bigint;
  graduationFloorUsdWad: bigint;
  minimumCreationQuote: bigint;
  minimumGraduationQuote: bigint;
  meetsCreationFloor: boolean;
  meetsGraduationFloor: boolean;
  nativeValue: bigint;
  requiredAllowance: bigint;
  reserveToken: bigint;
}

function boundedBps(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error('Factory multiplier must be 0..10000 bps');
  }
}
export function assertTestnet(chainId: number): void {
  if (chainId !== CHAIN_ID) throw new Error(`Flap spike requires chain 97; received ${chainId}`);
}
export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new Error('Invalid nonnegative division');
  return (numerator + denominator - 1n) / denominator;
}

export function previewLaunch(
  chainId: number,
  quote: QuoteState,
  factory: FactoryState,
  plan: Plan,
  vault?: FactoryState,
): Preview {
  assertTestnet(chainId);
  if (!isAddress(quote.address)) throw new Error('Invalid quote address');
  if (!quote.enabled) throw new Error('Quote pair is not enabled');
  if (!factory.enabled) throw new Error('Launcher factory is not enabled by Flap');
  boundedBps(factory.multiplierBps);
  if (vault) boundedBps(vault.multiplierBps);
  if (!Number.isInteger(quote.decimals) || quote.decimals < 0 || quote.decimals > 255) {
    throw new Error('Quote decimals must be a uint8');
  }
  if (quote.address.toLowerCase() === ZERO && quote.decimals !== 18) {
    throw new Error('Native BNB has 18 decimals');
  }
  if (quote.priceUsdWad <= 0n) throw new Error('Configured quote USD price must be positive');
  if (plan.totalSupply < 100n * WAD || plan.totalSupply > 10n ** 15n * WAD) {
    throw new Error('Launch supply must be 100..1e15 tokens with 18 decimals');
  }
  if (plan.poolToken <= 0n || plan.poolToken > plan.totalSupply) throw new Error('Invalid pool token share');
  if (plan.poolQuote <= 0n || plan.creatorBuyQuote < 0n) throw new Error('Invalid quote amount');

  // The current indexer guide gives enabled Vault factories precedence. The live
  // ForLauncher lens remains authoritative for any deployed Launcher.
  const multiplierBps = vault?.enabled ? vault.multiplierBps : factory.multiplierBps;
  const denominator = 10_000n * plan.poolToken;
  const units = 10n ** BigInt(quote.decimals);
  // Round the documented rational floor upward; never understate a funding target.
  // This conservative estimate is not a replacement for the on-chain lens.
  const creationFloorUsdWad = ceilDiv(750n * WAD * BigInt(multiplierBps) * plan.totalSupply, denominator);
  const graduationFloorUsdWad = ceilDiv(1_500n * WAD * BigInt(multiplierBps) * plan.totalSupply, denominator);
  const quoteUsdWad = plan.poolQuote * quote.priceUsdWad / units;
  const totalQuote = plan.poolQuote + plan.creatorBuyQuote;
  const native = quote.address.toLowerCase() === ZERO;
  return {
    multiplierBps,
    quoteUsdWad,
    creationFloorUsdWad,
    graduationFloorUsdWad,
    minimumCreationQuote: ceilDiv(creationFloorUsdWad * units, quote.priceUsdWad),
    minimumGraduationQuote: ceilDiv(graduationFloorUsdWad * units, quote.priceUsdWad),
    meetsCreationFloor: quoteUsdWad >= creationFloorUsdWad,
    meetsGraduationFloor: quoteUsdWad >= graduationFloorUsdWad,
    nativeValue: native ? totalQuote : 0n,
    requiredAllowance: native ? 0n : totalQuote,
    reserveToken: plan.totalSupply - plan.poolToken,
  };
}

export function assertLaunchPayment(preview: Preview, nativeValue: bigint, allowance: bigint): void {
  if (nativeValue !== preview.nativeValue) throw new Error('Native launch value must match exactly');
  if (allowance < preview.requiredAllowance) throw new Error('Insufficient Portal quote allowance');
}

export type ReadMethod = 'eth_chainId' | 'eth_getBlockByNumber' | 'eth_call' | 'eth_getCode';
export type RpcRead = (method: ReadMethod, params: readonly unknown[]) => Promise<unknown>;
function hex(value: unknown): Hex {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]*$/.test(value)) throw new Error('RPC returned invalid hex');
  return value as Hex;
}
function uintHex(value: unknown): bigint {
  const s = hex(value);
  if (s.length <= 2) throw new Error('RPC returned empty integer');
  return BigInt(s);
}

export interface PortalSnapshot {
  chainId: 97;
  portal: Address;
  observedAt: string;
  blockNumber: bigint;
  blockHash: Hex;
  blockTimestamp: bigint;
  version: string;
  creationPaused: boolean;
  saltLockFee: bigint;
  quote: QuoteState;
  launcherFactory: Address;
  factory: FactoryState;
}

export async function readPortalSnapshot(
  rpc: RpcRead,
  launcherFactory: Address,
  quoteToken: Address = ZERO,
): Promise<PortalSnapshot> {
  if (!isAddress(launcherFactory) || !isAddress(quoteToken)) throw new Error('Invalid contract address');
  assertTestnet(Number(uintHex(await rpc('eth_chainId', []))));
  const rawBlock = await rpc('eth_getBlockByNumber', ['latest', false]);
  if (!rawBlock || typeof rawBlock !== 'object') throw new Error('RPC returned no block');
  const block = rawBlock as Record<string, unknown>;
  const blockNumber = uintHex(block['number']);
  const at = `0x${blockNumber.toString(16)}`;
  const code = hex(await rpc('eth_getCode', [PORTAL, at]));
  if (code === '0x') throw new Error('Pool Launch Portal has no code');
  const call = async (data: Hex, to: Address = PORTAL): Promise<Hex> => hex(await rpc('eth_call', [{ to, data }, at]));
  const [versionData, flagsData, feeData, quoteData, factoryData, decimalsData] = await Promise.all([
    call(encodeFunctionData({ abi: READ_ABI, functionName: 'version' })),
    call(encodeFunctionData({ abi: READ_ABI, functionName: 'featureFlags' })),
    call(encodeFunctionData({ abi: READ_ABI, functionName: 'SALT_LOCK_FEE' })),
    call(encodeFunctionData({ abi: READ_ABI, functionName: 'launchQuoteConfig', args: [0, quoteToken] })),
    call(encodeFunctionData({ abi: READ_ABI, functionName: 'launcherFactoryMultiplier', args: [launcherFactory] })),
    quoteToken.toLowerCase() === ZERO ? Promise.resolve(null) :
      call(encodeFunctionData({ abi: DECIMALS_ABI, functionName: 'decimals' }), quoteToken),
  ]);
  const [enabled, priceUsdWad] = decodeFunctionResult({ abi: READ_ABI, functionName: 'launchQuoteConfig', data: quoteData });
  const [factoryEnabled, multiplierBps] = decodeFunctionResult({ abi: READ_ABI, functionName: 'launcherFactoryMultiplier', data: factoryData });
  return {
    chainId: 97, portal: PORTAL, observedAt: new Date().toISOString(), blockNumber,
    blockHash: hex(block['hash']), blockTimestamp: uintHex(block['timestamp']),
    version: decodeFunctionResult({ abi: READ_ABI, functionName: 'version', data: versionData }),
    creationPaused: (decodeFunctionResult({ abi: READ_ABI, functionName: 'featureFlags', data: flagsData }) & 1n) !== 0n,
    saltLockFee: decodeFunctionResult({ abi: READ_ABI, functionName: 'SALT_LOCK_FEE', data: feeData }),
    quote: { address: quoteToken, enabled, priceUsdWad, decimals: decimalsData === null ? 18 :
      decodeFunctionResult({ abi: DECIMALS_ABI, functionName: 'decimals', data: decimalsData }) },
    launcherFactory, factory: { enabled: factoryEnabled, multiplierBps },
  };
}

export interface LensPlan {
  quoteToken: Address;
  quotePriceUsd: bigint;
  poolQuote: bigint;
  poolToken: bigint;
  totalSupply: bigint;
  vaultFactory: Address;
}

export async function readGraduationLens(rpc: RpcRead, snapshot: PortalSnapshot, plan: LensPlan, launcher?: Address) {
  assertTestnet(Number(uintHex(await rpc('eth_chainId', []))));
  assertTestnet(snapshot.chainId);
  if (snapshot.portal !== PORTAL) throw new Error('Wrong Pool Launch Portal');
  if (plan.quoteToken.toLowerCase() !== snapshot.quote.address.toLowerCase() || plan.quotePriceUsd !== snapshot.quote.priceUsdWad) {
    throw new Error('Lens must use the pinned Portal quote configuration');
  }
  const at = `0x${snapshot.blockNumber.toString(16)}`;
  if (launcher) {
    if (!isAddress(launcher) || launcher.toLowerCase() === ZERO) throw new Error('Invalid Launcher');
    const data = encodeFunctionData({ abi: READ_ABI, functionName: 'getLauncher', args: [launcher] });
    const record = decodeFunctionResult({ abi: READ_ABI, functionName: 'getLauncher', data: hex(await rpc('eth_call', [{ to: PORTAL, data }, at])) });
    if (record.launcherFactory.toLowerCase() !== snapshot.launcherFactory.toLowerCase() || record.launcherFactory.toLowerCase() === ZERO) {
      throw new Error('Launcher does not belong to the pinned factory');
    }
    const encoded = encodeFunctionData({ abi: READ_ABI, functionName: 'graduationFloorV2ForLauncher', args: [plan, launcher] });
    return decodeFunctionResult({ abi: READ_ABI, functionName: 'graduationFloorV2ForLauncher', data: hex(await rpc('eth_call', [{ to: PORTAL, data: encoded }, at])) });
  }
  // A generic preview excludes Launcher discounts; never present it as an enabled
  // factory check. Use ForLauncher for an actual recorded instance.
  const encoded = encodeFunctionData({ abi: READ_ABI, functionName: 'graduationFloorV2', args: [plan] });
  return decodeFunctionResult({ abi: READ_ABI, functionName: 'graduationFloorV2', data: hex(await rpc('eth_call', [{ to: PORTAL, data: encoded }, at])) });
}
