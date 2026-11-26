import { encodeAbiParameters, getAddress, keccak256, parseAbi, zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import { readMined, type ReadAt } from "../../lib/testnet";
import { SEASON, WATTNESS_AGENT } from "./addresses";
import { predictToken } from "./token";

// Reads one round of the Flap season at one block: the Launcher, the Portal's
// record of it, GateRecord for its milestone and season days, and once
// launched its token, pool and vault. The ABIs are the read halves of the
// repository's own (packages/adapters/flap/src/season.ts, the contracts in
// modules/flap, GateRecord's in packages/verifier).

const LAUNCHER_ABI = parseAbi([
  "struct Snapshot { uint8 status; uint256 raised; uint256 minRaise; uint256 raiseCap; uint256 walletCap; uint64 deadline; bool milestoneMet; uint256 contributorCount; address token; address pool; address vault; }",
  "function snapshot() view returns (Snapshot)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function creator() view returns (address)",
  "function milestoneCommitter() view returns (address)",
  "function milestoneOd() view returns (uint32)",
  "function milestoneStage() view returns (uint8)",
  "function scope() view returns (bytes32)",
  "function seasonDays() view returns (uint32[])",
  "function earnedBps() view returns (uint16)",
  "function earnedTokens() view returns (uint256)",
  "function rewardCap() view returns (uint256)",
  "function taxRoute() view returns (uint8)",
  "function launchSalt() view returns (bytes32)",
  "function contributors() view returns (address[])",
  "function depositOf(address) view returns (uint256)",
  "function agentOf(address) view returns (address)",
  "function claimedOf(address) view returns (uint256)",
  "function entitledTokens(address) view returns (uint256)",
  "function TOTAL_SUPPLY() view returns (uint256)",
  "function POOL_TOKEN() view returns (uint256)",
  "function RESERVE() view returns (uint256)",
  "function TAX_BPS() view returns (uint16)",
  "function VAULT_SHARE_BPS() view returns (uint16)",
  "function MAX_CONTRIBUTORS() view returns (uint256)",
]);

const VAULT_ABI = parseAbi([
  "struct State { uint256 quoteBalance; uint256 tokenBalance; uint256 recognized; uint256 pooled; uint256 forwarded; uint256 rewardCap; uint256 quotePaid; uint256 tokensPaid; uint256 earnedTokens; uint256 totalDeposit; }",
  "function state() view returns (State)",
  "function skillOf(address agent) view returns (uint256 verified, uint256 total)",
  "function claimable(address account) view returns (uint256 quote, uint256 tokens)",
  "function quoteClaimed(address) view returns (uint256)",
  "function tokensClaimed(address) view returns (uint256)",
]);

const PORTAL_ABI = parseAbi([
  "function getLauncher(address launcher) view returns ((address launcherFactory))",
  "function getLaunchVault(address token) view returns (address vault, address vaultFactory)",
]);

const GATE_RECORD_ABI = parseAbi([
  "function get(bytes32 key) view returns ((bytes32 root,bytes32 codeHash,bytes32 scope,address committer,uint32 od,uint32 leafCount,uint64 committedAt,uint64 blockNumber))",
  "function gateTs(uint32 od) pure returns (uint256)",
]);

const ERC20_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

const PAIR_ABI = parseAbi([
  "function token0() view returns (address)",
  "function factory() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
]);

const LP_SINK: Address = "0x000000000000000000000000000000000000dEaD";

export type RoundStatus = "open" | "launched" | "refunding";
const STATUS: readonly RoundStatus[] = ["open", "launched", "refunding"];

/** One season day for one agent, read from GateRecord as SeasonLib.sealedBeforeGate reads it. */
export interface DayRecord {
  od: number;
  /** Unix seconds of the day's gate, from GateRecord.gateTs. */
  gate: number;
  key: Hex;
  record: { committedAt: number; blockNumber: number; leafCount: number; root: Hex } | null;
  /** Sealed under the season's scope before the gate: the day counts. */
  counts: boolean;
}

export interface AgentDays {
  agent: Address;
  days: DayRecord[];
  /** The vault's own count, skillOf(agent); null before the vault exists. */
  vaultSkill: { verified: number; total: number } | null;
}

export interface ContributorView {
  account: Address;
  agent: Address;
  deposit: bigint;
  /** PRIX the Launcher owes in total, and what has been claimed. */
  entitled: bigint;
  claimed: bigint;
  vault: { quoteClaimed: bigint; tokensClaimed: bigint; claimableQuote: bigint; claimableTokens: bigint } | null;
}

export interface PoolView {
  address: Address;
  name: string;
  symbol: string;
  factory: Address;
  reserveQuote: bigint;
  reserveToken: bigint;
  lpTotal: bigint;
  lpAtSink: bigint;
  /** The 1,000 wei a V2 pair mints to the zero address on its first deposit. */
  lpAtZero: bigint;
}

export interface RoundView {
  address: Address;
  status: RoundStatus;
  /** The factory Flap's Portal records for this Launcher. */
  portalFactory: Address;
  name: string;
  symbol: string;
  /** Who created the round through Flap's Portal: the vault sends it any tax above the cap. */
  creator: Address;
  raised: bigint;
  minRaise: bigint;
  raiseCap: bigint;
  walletCap: bigint;
  deadline: number;
  contributorCount: number;
  maxContributors: number;
  milestone: { committer: Address; od: number; stage: number; met: boolean; day: DayRecord };
  scope: Hex;
  seasonDays: number[];
  earnedBps: number;
  earnedTokens: bigint;
  rewardCap: bigint;
  taxRoute: number;
  totalSupply: bigint;
  poolToken: bigint;
  reserve: bigint;
  taxBps: number;
  vaultShareBps: number;
  /** The token address the launch will get, from the round's salt. */
  predictedToken: Address;
  token: Address | null;
  pool: PoolView | null;
  vault: {
    address: Address;
    /** The vault factory the Portal records for the token. */
    factory: Address;
    quoteBalance: bigint;
    tokenBalance: bigint;
    pooled: bigint;
    forwarded: bigint;
    quotePaid: bigint;
    tokensPaid: bigint;
    totalDeposit: bigint;
  } | null;
  tokenInfo: { name: string; symbol: string; totalSupply: bigint } | null;
  contributors: ContributorView[];
  /** The Wattness agent first, then every other agent a contributor backs. */
  agents: AgentDays[];
}

export interface TxView {
  id: string;
  label: string;
  hash: Hex;
  ok: boolean;
  blockNumber: bigint;
  time: number;
}

export interface SeasonRead {
  quoteSymbol: string;
  launched: RoundView;
  round3: RoundView;
  launchedTxs: TxView[];
}

const orNull = (a: Address): Address | null => (a.toLowerCase() === zeroAddress ? null : a);

/** keccak256(abi.encode(committer, scope, od)), as GateRecord.keyOf computes it. */
export function recordKey(committer: Address, scope: Hex, od: number): Hex {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }, { type: "uint32" }], [getAddress(committer), scope, od]));
}

type Reader = <T>(address: Address, abi: readonly unknown[], functionName: string, args?: readonly unknown[]) => Promise<T>;

function reader(client: PublicClient, at: ReadAt): Reader {
  return <T>(address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[] = []) =>
    client.readContract({ address, abi, functionName, args, blockNumber: at.number } as never) as Promise<T>;
}

async function readDay(r: Reader, agent: Address, scope: Hex, od: number): Promise<DayRecord> {
  const key = recordKey(agent, scope, od);
  const [rec, gate] = await Promise.all([
    r<{ root: Hex; scope: Hex; committer: Address; od: number; leafCount: number; committedAt: bigint; blockNumber: bigint }>(SEASON.gateRecord, GATE_RECORD_ABI, "get", [key]),
    r<bigint>(SEASON.gateRecord, GATE_RECORD_ABI, "gateTs", [od]),
  ]);
  const present = rec.committer.toLowerCase() !== zeroAddress;
  const counts =
    present &&
    getAddress(rec.committer) === getAddress(agent) &&
    rec.scope.toLowerCase() === scope.toLowerCase() &&
    Number(rec.od) === od &&
    rec.leafCount > 0 &&
    rec.committedAt < gate;
  return {
    od,
    gate: Number(gate),
    key,
    record: present ? { committedAt: Number(rec.committedAt), blockNumber: Number(rec.blockNumber), leafCount: Number(rec.leafCount), root: rec.root } : null,
    counts,
  };
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

export async function readRound(client: PublicClient, at: ReadAt, launcher: Address): Promise<RoundView> {
  const r = reader(client, at);
  const L = <T>(fn: string, args?: readonly unknown[]) => r<T>(launcher, LAUNCHER_ABI, fn, args);

  const [snap, record, name, symbol, creator, committer, od, stage, scope, days, earnedBps, earnedTokens, rewardCap, taxRoute, salt, accounts, totalSupply, poolToken, reserve, taxBps, vaultShareBps, maxContributors] =
    await Promise.all([
      L<RawSnapshot>("snapshot"),
      r<{ launcherFactory: Address }>(SEASON.portal, PORTAL_ABI, "getLauncher", [launcher]),
      L<string>("name"),
      L<string>("symbol"),
      L<Address>("creator"),
      L<Address>("milestoneCommitter"),
      L<number>("milestoneOd"),
      L<number>("milestoneStage"),
      L<Hex>("scope"),
      L<readonly number[]>("seasonDays"),
      L<number>("earnedBps"),
      L<bigint>("earnedTokens"),
      L<bigint>("rewardCap"),
      L<number>("taxRoute"),
      L<Hex>("launchSalt"),
      L<readonly Address[]>("contributors"),
      L<bigint>("TOTAL_SUPPLY"),
      L<bigint>("POOL_TOKEN"),
      L<bigint>("RESERVE"),
      L<number>("TAX_BPS"),
      L<number>("VAULT_SHARE_BPS"),
      L<bigint>("MAX_CONTRIBUTORS"),
    ]);
  const status = STATUS[snap.status];
  if (!status) throw new Error(`Round ${launcher} reports an unknown status ${snap.status}.`);
  if (getAddress(record.launcherFactory) !== getAddress(SEASON.launcherFactory)) {
    throw new Error(`Flap's Portal records ${launcher} under ${record.launcherFactory}, not the season's launcher factory.`);
  }
  const seasonDays = days.map(Number);
  const tokenAddress = orNull(snap.token);
  const poolAddress = orNull(snap.pool);
  const vaultAddress = orNull(snap.vault);

  const people = await Promise.all(
    accounts.map(async (account) => {
      const [deposit, agent, claimed, entitled] = await Promise.all([
        L<bigint>("depositOf", [account]),
        L<Address>("agentOf", [account]),
        L<bigint>("claimedOf", [account]),
        L<bigint>("entitledTokens", [account]),
      ]);
      return { account, agent, deposit, claimed, entitled };
    }),
  );

  const agentList = [WATTNESS_AGENT as Address, ...people.map((p) => p.agent)].filter(
    (a, i, all) => all.findIndex((b) => getAddress(b) === getAddress(a)) === i,
  );

  const V = <T>(fn: string, args?: readonly unknown[]) => r<T>(vaultAddress as Address, VAULT_ABI, fn, args);

  const [milestoneDay, agents, contributors, vault, pool, tokenInfo] = await Promise.all([
    readDay(r, committer, scope, Number(od)),
    Promise.all(
      agentList.map(async (agent): Promise<AgentDays> => {
        const [dayRecords, skill] = await Promise.all([
          Promise.all(seasonDays.map((d) => readDay(r, agent, scope, d))),
          vaultAddress ? V<readonly [bigint, bigint]>("skillOf", [agent]) : Promise.resolve(null),
        ]);
        return { agent, days: dayRecords, vaultSkill: skill ? { verified: Number(skill[0]), total: Number(skill[1]) } : null };
      }),
    ),
    Promise.all(
      people.map(async (p): Promise<ContributorView> => {
        if (!vaultAddress) return { ...p, vault: null };
        const [quoteClaimed, tokensClaimed, claimable] = await Promise.all([
          V<bigint>("quoteClaimed", [p.account]),
          V<bigint>("tokensClaimed", [p.account]),
          V<readonly [bigint, bigint]>("claimable", [p.account]),
        ]);
        return { ...p, vault: { quoteClaimed, tokensClaimed, claimableQuote: claimable[0], claimableTokens: claimable[1] } };
      }),
    ),
    vaultAddress && tokenAddress
      ? Promise.all([
          V<{ quoteBalance: bigint; tokenBalance: bigint; pooled: bigint; forwarded: bigint; quotePaid: bigint; tokensPaid: bigint; totalDeposit: bigint }>("state"),
          r<readonly [Address, Address]>(SEASON.portal, PORTAL_ABI, "getLaunchVault", [tokenAddress]),
        ]).then(([s, lv]) => {
          if (getAddress(lv[0]) !== getAddress(vaultAddress)) throw new Error(`Flap's Portal names ${lv[0]} as the token's vault, not ${vaultAddress}.`);
          return { address: vaultAddress, factory: lv[1], ...s };
        })
      : Promise.resolve(null),
    poolAddress && tokenAddress
      ? Promise.all([
          r<Address>(poolAddress, PAIR_ABI, "token0"),
          r<Address>(poolAddress, PAIR_ABI, "factory"),
          r<readonly [bigint, bigint, number]>(poolAddress, PAIR_ABI, "getReserves"),
          r<string>(poolAddress, ERC20_ABI, "name"),
          r<string>(poolAddress, ERC20_ABI, "symbol"),
          r<bigint>(poolAddress, ERC20_ABI, "totalSupply"),
          r<bigint>(poolAddress, ERC20_ABI, "balanceOf", [LP_SINK]),
          r<bigint>(poolAddress, ERC20_ABI, "balanceOf", [zeroAddress]),
        ]).then(([token0, factory, reserves, lpName, lpSymbol, lpTotal, lpAtSink, lpAtZero]): PoolView => {
          const tokenIs0 = getAddress(token0) === getAddress(tokenAddress);
          return {
            address: poolAddress,
            name: lpName,
            symbol: lpSymbol,
            factory,
            reserveToken: BigInt(tokenIs0 ? reserves[0] : reserves[1]),
            reserveQuote: BigInt(tokenIs0 ? reserves[1] : reserves[0]),
            lpTotal,
            lpAtSink,
            lpAtZero,
          };
        })
      : Promise.resolve(null),
    tokenAddress
      ? Promise.all([
          r<string>(tokenAddress, ERC20_ABI, "name"),
          r<string>(tokenAddress, ERC20_ABI, "symbol"),
          r<bigint>(tokenAddress, ERC20_ABI, "totalSupply"),
        ]).then(([n, s, t]) => ({ name: n, symbol: s, totalSupply: t }))
      : Promise.resolve(null),
  ]);

  return {
    address: launcher,
    status,
    portalFactory: record.launcherFactory,
    name,
    symbol,
    creator,
    raised: snap.raised,
    minRaise: snap.minRaise,
    raiseCap: snap.raiseCap,
    walletCap: snap.walletCap,
    deadline: Number(snap.deadline),
    contributorCount: Number(snap.contributorCount),
    maxContributors: Number(maxContributors),
    milestone: { committer, od: Number(od), stage: Number(stage), met: snap.milestoneMet, day: milestoneDay },
    scope,
    seasonDays,
    earnedBps: Number(earnedBps),
    earnedTokens,
    rewardCap,
    taxRoute: Number(taxRoute),
    totalSupply,
    poolToken,
    reserve,
    taxBps: Number(taxBps),
    vaultShareBps: Number(vaultShareBps),
    predictedToken: predictToken(salt, SEASON.portal, SEASON.tokenImpl),
    token: tokenAddress,
    pool,
    vault,
    tokenInfo,
    contributors,
    agents,
  };
}

async function readTx(client: PublicClient, t: { id: string; label: string; hash: string }): Promise<TxView> {
  const m = await readMined(client, t.hash as Hex);
  return { id: t.id, label: t.label, hash: m.hash, ok: m.ok, blockNumber: m.blockNumber, time: m.time };
}

export async function readSeason(client: PublicClient, at: ReadAt): Promise<SeasonRead> {
  const [quoteSymbol, launched, round3, launchedTxs] = await Promise.all([
    client.readContract({ address: SEASON.quoteToken, abi: ERC20_ABI, functionName: "symbol", blockNumber: at.number }),
    readRound(client, at, SEASON.launched.launcher),
    readRound(client, at, SEASON.round3.launcher),
    Promise.all(SEASON.launched.transactions.map((t) => readTx(client, t))),
  ]);
  return { quoteSymbol, launched, round3, launchedTxs };
}
