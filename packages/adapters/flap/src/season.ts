import { concat, encodeAbiParameters, getContractAddress, isAddress, keccak256, parseAbi, toHex, zeroAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { CHAIN_ID, PORTAL } from './constants.js';

/** The tax token implementation the Portal clones: a launch's token is CREATE2(clone(impl), salt, Portal). */
export const TOKEN_IMPL: Address = '0x7777c57ff7dc441c1715b2e36fa581c48B782222';
/** Flap's faucet USD on chain 97: 18 decimals, enabled for Pool Launch at $1. */
export const TEST_USD: Address = '0x190C989D5665a0e404B444b53CAE9AbCfb600157';
export const GATE_RECORD: Address = '0x2922c68cE15EB3e83B7f43b136e981dDc4262876';
/** Permissionless chain-97 helper that enables a deployed Launcher factory. */
export const LAUNCHER_HELPER: Address = '0x77779969a11eff7582f3bCf48135A846A3457777';

/** The season as deployed on chain 97: the factory pair, a launched round and a refunded one. */
export const SEASON_TESTNET = {
  chainId: 97,
  portal: PORTAL,
  quoteToken: TEST_USD,
  gateRecord: GATE_RECORD,
  launcherFactory: '0xdeee6A7E242983Da85B8EBe2Cfb5b79156344082',
  vaultFactory: '0x3e7132f6D59EAD6c778C8Bd5274F399d5637dCB1',
  season: {
    launcher: '0x627A6C606d87d31121e5201bFf999695D3C70D59',
    token: '0xcCdA7b7B6cF49208a3E751e56c98cb34202e7777',
    pool: '0x510D53EFdAdEec8299D7328867Ddc6f815cbEA6B',
    vault: '0x44c5AFF0812bCe6b53c17910a3427ceB0955f70a',
  },
  refunded: { launcher: '0x2db8Fb4B03229af56Dc1D5c30678f1693733D44C' },
} as const satisfies Record<string, unknown>;

/** The season token's working name; a placeholder. */
export const SEASON_TOKEN = { name: 'Grand Prix Season', symbol: 'PRIX' } as const;

export type SeasonStatus = 'open' | 'launched' | 'refunding';
const STATUS: readonly SeasonStatus[] = ['open', 'launched', 'refunding'];

export interface SeasonConfig {
  name: string;
  symbol: string;
  meta: string;
  salt: Hex;
  minRaise: bigint;
  raiseCap: bigint;
  walletCap: bigint;
  deadline: bigint;
  milestoneCommitter: Address;
  milestoneOd: number;
  milestoneStage: number;
  scope: Hex;
  seasonDays: readonly number[];
  earnedBps: number;
  rewardCap: bigint;
  taxRoute: 0 | 1;
}

const SEASON_CONFIG_TUPLE = [{
  type: 'tuple',
  components: [
    { name: 'name', type: 'string' },
    { name: 'symbol', type: 'string' },
    { name: 'meta', type: 'string' },
    { name: 'salt', type: 'bytes32' },
    { name: 'minRaise', type: 'uint256' },
    { name: 'raiseCap', type: 'uint256' },
    { name: 'walletCap', type: 'uint256' },
    { name: 'deadline', type: 'uint64' },
    { name: 'milestoneCommitter', type: 'address' },
    { name: 'milestoneOd', type: 'uint32' },
    { name: 'milestoneStage', type: 'uint8' },
    { name: 'scope', type: 'bytes32' },
    { name: 'seasonDays', type: 'uint32[]' },
    { name: 'earnedBps', type: 'uint16' },
    { name: 'rewardCap', type: 'uint256' },
    { name: 'taxRoute', type: 'uint8' },
  ],
}] as const;

/** The `data` for `Portal.newLauncher(launcherFactory, data)`. */
export function encodeSeasonConfig(c: SeasonConfig): Hex {
  return encodeAbiParameters(SEASON_CONFIG_TUPLE, [{ ...c, seasonDays: [...c.seasonDays] }]);
}

/** The token address a launch with `salt` will get. */
export function predictToken(salt: Hex, portal: Address = PORTAL, impl: Address = TOKEN_IMPL): Address {
  const clone = concat(['0x3d602d80600a3d3981f3363d3d373d3d3d363d73', impl, '0x5af43d82803e903d91602b57fd5bf3']);
  return getContractAddress({ opcode: 'CREATE2', from: portal, salt, bytecodeHash: keccak256(clone) });
}

/** The first salt from `seed` whose token address ends in 7777, as the Portal requires (about 65k tries). */
export function mineSalt(seed: Hex, limit = 2_000_000): { salt: Hex; token: Address; tries: number } {
  for (let i = 0; i < limit; i++) {
    const salt = keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [seed, BigInt(i)]));
    const token = predictToken(salt);
    if (token.toLowerCase().endsWith('7777')) return { salt, token, tries: i + 1 };
  }
  throw new Error(`no 7777 salt within ${limit} tries`);
}

export const SEASON_LAUNCHER_ABI = parseAbi([
  'struct Snapshot { uint8 status; uint256 raised; uint256 minRaise; uint256 raiseCap; uint256 walletCap; uint64 deadline; bool milestoneMet; uint256 contributorCount; address token; address pool; address vault; }',
  'function snapshot() view returns (Snapshot)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function creator() view returns (address)',
  'function quoteToken() view returns (address)',
  'function gateRecord() view returns (address)',
  'function milestoneCommitter() view returns (address)',
  'function milestoneOd() view returns (uint32)',
  'function milestoneStage() view returns (uint8)',
  'function scope() view returns (bytes32)',
  'function seasonDays() view returns (uint32[])',
  'function earnedBps() view returns (uint16)',
  'function earnedTokens() view returns (uint256)',
  'function rewardCap() view returns (uint256)',
  'function taxRoute() view returns (uint8)',
  'function contributors() view returns (address[])',
  'function depositOf(address) view returns (uint256)',
  'function agentOf(address) view returns (address)',
  'function claimedOf(address) view returns (uint256)',
  'function entitledTokens(address) view returns (uint256)',
  'function description() view returns (string)',
  'function back(address agent)',
  'function contributeQuote(uint256 amount)',
  'function launch() returns (address token, address pool)',
  'function claim()',
  'function refund()',
  'error NotOpen()',
  'error ZeroAmount()',
  'error ZeroAgent()',
  'error OverWalletCap(uint256 deposit, uint256 walletCap)',
  'error OverRaiseCap(uint256 raised, uint256 raiseCap)',
  'error TooManyContributors()',
  'error ShortTransfer(uint256 expected, uint256 received)',
  'error BelowMinRaise(uint256 raised, uint256 minRaise)',
  'error MilestoneNotMet(address committer, bytes32 scope, uint32 od, uint8 stage)',
  'error UnexpectedDistribution()',
  'error WrongVault(address vault, address vaultFactory)',
  'error NotLaunched()',
  'error NothingToClaim()',
  'error RefundUnavailable()',
  'error NothingToRefund()',
  'error Reentrancy()',
  'error TransferFailed(address token)',
]);

export const SEASON_VAULT_ABI = parseAbi([
  'struct State { uint256 quoteBalance; uint256 tokenBalance; uint256 recognized; uint256 pooled; uint256 forwarded; uint256 rewardCap; uint256 quotePaid; uint256 tokensPaid; uint256 earnedTokens; uint256 totalDeposit; }',
  'function state() view returns (State)',
  'function skillOf(address agent) view returns (uint256 verified, uint256 total)',
  'function entitled(address account) view returns (uint256 quote, uint256 tokens)',
  'function claimable(address account) view returns (uint256 quote, uint256 tokens)',
  'function sync()',
  'function claim() returns (uint256 quote, uint256 tokens)',
  'error NothingToClaim()',
  'error Reentrancy()',
  'error TransferFailed(address token)',
]);

/** The slice of a viem PublicClient this client needs. */
export interface SeasonReadClient {
  getChainId(): Promise<number>;
  readContract(args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    blockNumber?: bigint;
  }): Promise<unknown>;
}

export interface Skill {
  verified: number;
  total: number;
}

export interface Contributor {
  account: Address;
  agent: Address;
  deposit: bigint;
  /** Reserve tokens claimable from the Launcher in total, and claimed so far. */
  entitledTokens: bigint;
  claimedTokens: bigint;
  /** Verified season days of the backed agent; null before the vault exists. */
  skill: Skill | null;
  /** Share of the earned pool, deposit share times verified fraction, in bps. */
  weightBps: number | null;
  earned: { quote: bigint; tokens: bigint } | null;
  claimable: { quote: bigint; tokens: bigint } | null;
}

export interface VaultView {
  address: Address;
  quoteBalance: bigint;
  tokenBalance: bigint;
  recognized: bigint;
  pooled: bigint;
  forwarded: bigint;
  rewardCap: bigint;
  quotePaid: bigint;
  tokensPaid: bigint;
  earnedTokens: bigint;
  totalDeposit: bigint;
}

export interface SeasonView {
  chainId: 97;
  launcher: Address;
  blockNumber: bigint | null;
  status: SeasonStatus;
  token: { name: string; symbol: string; address: Address | null; pool: Address | null };
  round: { quoteToken: Address; raised: bigint; minRaise: bigint; raiseCap: bigint; walletCap: bigint; deadline: bigint };
  milestone: { committer: Address; od: number; stage: number; met: boolean };
  season: { scope: Hex; days: number[]; earnedBps: number; earnedTokens: bigint; rewardCap: bigint; taxRoute: 0 | 1 };
  contributors: Contributor[];
  vault: VaultView | null;
}

interface RawSnapshot {
  status: number;
  raised: bigint;
  minRaise: bigint;
  raiseCap: bigint;
  walletCap: bigint;
  deadline: bigint;
  milestoneMet: boolean;
  contributorCount: bigint;
  token: Address;
  pool: Address;
  vault: Address;
}

const orNull = (a: Address): Address | null => (a.toLowerCase() === zeroAddress ? null : a);

/** Basis points of the earned pool an account holds: deposit share times the verified fraction, rounded down. */
export function weightBps(deposit: bigint, totalDeposit: bigint, skill: Skill): number {
  if (totalDeposit <= 0n || skill.total <= 0) return 0;
  return Number((deposit * BigInt(skill.verified) * 10_000n) / (totalDeposit * BigInt(skill.total)));
}

/**
 * Everything the season screen shows, read at one block: the round, the
 * milestone, each contributor's deposit and backed agent, and once launched the
 * vault's balances and each contributor's verified-skill weight.
 */
export async function readSeason(client: SeasonReadClient, launcher: Address, blockNumber?: bigint): Promise<SeasonView> {
  if (!isAddress(launcher)) throw new Error('Invalid Launcher address');
  const chainId = await client.getChainId();
  if (chainId !== CHAIN_ID) throw new Error(`Season client requires chain 97; received ${chainId}`);
  const at = blockNumber === undefined ? {} : { blockNumber };
  const L = <T>(functionName: string, args?: readonly unknown[]) =>
    client.readContract({ address: launcher, abi: SEASON_LAUNCHER_ABI, functionName, ...(args ? { args } : {}), ...at }) as Promise<T>;

  const [snap, name, symbol, quoteToken, committer, od, stage, scope, days, earnedBps, earnedTokens, rewardCap, taxRoute, accounts] =
    await Promise.all([
      L<RawSnapshot>('snapshot'), L<string>('name'), L<string>('symbol'), L<Address>('quoteToken'),
      L<Address>('milestoneCommitter'), L<number>('milestoneOd'), L<number>('milestoneStage'), L<Hex>('scope'),
      L<readonly number[]>('seasonDays'), L<number>('earnedBps'), L<bigint>('earnedTokens'), L<bigint>('rewardCap'),
      L<number>('taxRoute'), L<readonly Address[]>('contributors'),
    ]);
  const status = STATUS[snap.status];
  if (!status) throw new Error(`Unknown season status ${snap.status}`);
  const vaultAddress = orNull(snap.vault);

  let vault: VaultView | null = null;
  if (vaultAddress) {
    const s = await client.readContract({ address: vaultAddress, abi: SEASON_VAULT_ABI, functionName: 'state', ...at }) as Omit<VaultView, 'address'>;
    vault = { address: vaultAddress, ...s };
  }
  const V = <T>(functionName: string, args: readonly unknown[]) =>
    client.readContract({ address: vaultAddress as Address, abi: SEASON_VAULT_ABI, functionName, args, ...at }) as Promise<T>;

  const contributors = await Promise.all(accounts.map(async (account): Promise<Contributor> => {
    const [deposit, agent, entitledTokens, claimedTokens] = await Promise.all([
      L<bigint>('depositOf', [account]), L<Address>('agentOf', [account]),
      L<bigint>('entitledTokens', [account]), L<bigint>('claimedOf', [account]),
    ]);
    if (!vault) {
      return { account, agent, deposit, entitledTokens, claimedTokens, skill: null, weightBps: null, earned: null, claimable: null };
    }
    const [[verified, total], [eq, et], [cq, ct]] = await Promise.all([
      V<readonly [bigint, bigint]>('skillOf', [agent]),
      V<readonly [bigint, bigint]>('entitled', [account]),
      V<readonly [bigint, bigint]>('claimable', [account]),
    ]);
    const skill = { verified: Number(verified), total: Number(total) };
    return {
      account, agent, deposit, entitledTokens, claimedTokens, skill,
      weightBps: weightBps(deposit, vault.totalDeposit, skill),
      earned: { quote: eq, tokens: et }, claimable: { quote: cq, tokens: ct },
    };
  }));

  return {
    chainId: CHAIN_ID,
    launcher,
    blockNumber: blockNumber ?? null,
    status,
    token: { name, symbol, address: orNull(snap.token), pool: orNull(snap.pool) },
    round: { quoteToken, raised: snap.raised, minRaise: snap.minRaise, raiseCap: snap.raiseCap, walletCap: snap.walletCap, deadline: snap.deadline },
    milestone: { committer, od: Number(od), stage: Number(stage), met: snap.milestoneMet },
    season: { scope, days: days.map(Number), earnedBps: Number(earnedBps), earnedTokens, rewardCap, taxRoute: taxRoute === 1 ? 1 : 0 },
    contributors,
    vault,
  };
}

/** Verified-skill weights for a list of agents, read from the vault (which reads GateRecord). */
export async function readSkills(client: SeasonReadClient, vault: Address, agents: readonly Address[]): Promise<Map<Address, Skill>> {
  const out = new Map<Address, Skill>();
  for (const agent of agents) {
    const [verified, total] = await client.readContract({ address: vault, abi: SEASON_VAULT_ABI, functionName: 'skillOf', args: [agent] }) as readonly [bigint, bigint];
    out.set(agent, { verified: Number(verified), total: Number(total) });
  }
  return out;
}

/** A readable seed for `mineSalt`: distinct per launch label. */
export function saltSeed(label: string): Hex {
  return keccak256(toHex(label));
}
