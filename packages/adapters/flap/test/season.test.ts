import { describe, expect, it } from 'vitest';
import { decodeAbiParameters, getAddress, keccak256, toHex, zeroAddress } from 'viem';
import type { Address, Hex } from 'viem';
import {
  encodeSeasonConfig, mineSalt, predictToken, readSeason, readSkills, saltSeed, SEASON_TESTNET, weightBps,
} from '../src/index.js';
import type { SeasonConfig, SeasonReadClient } from '../src/index.js';

const WAD = 10n ** 18n;
const agent: Address = '0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8';
const alice: Address = '0x00000000000000000000000000000000000A11cE';
const bob: Address = '0x0000000000000000000000000000000000000B0b';
const vaultAddress: Address = '0x0000000000000000000000000000000000000Fa1';

const config: SeasonConfig = {
  name: 'Grand Prix Season', symbol: 'PRIX', meta: '', salt: keccak256(toHex('salt')),
  minRaise: 1_500n * WAD, raiseCap: 2_000n * WAD, walletCap: 1_000n * WAD, deadline: 1_795_805_921n,
  milestoneCommitter: agent, milestoneOd: 20261126, milestoneStage: 0, scope: keccak256(toHex('gate-record/ercot-da-energy')),
  seasonDays: [20261126, 20261127], earnedBps: 2_000, rewardCap: 100n * WAD, taxRoute: 0,
};

interface Fake {
  chainId?: number;
  launcher: Record<string, unknown>;
  perAccount: Record<string, (account: Address) => unknown>;
  vault?: Record<string, unknown>;
  perVault?: Record<string, (who: Address) => unknown>;
}

function fakeClient(f: Fake): SeasonReadClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    getChainId: async () => f.chainId ?? 97,
    readContract: async ({ address, functionName, args }) => {
      calls.push(`${address}.${functionName}`);
      const who = args?.[0] as Address;
      if (address === vaultAddress) {
        if (f.perVault?.[functionName]) return f.perVault[functionName](who);
        if (f.vault && functionName in f.vault) return f.vault[functionName];
      } else {
        if (f.perAccount[functionName]) return f.perAccount[functionName](who);
        if (functionName in f.launcher) return f.launcher[functionName];
      }
      throw new Error(`unexpected read ${functionName}`);
    },
  };
}

const launcherReads = (status: number, vault: Address) => ({
  snapshot: {
    status, raised: 1_600n * WAD, minRaise: config.minRaise, raiseCap: config.raiseCap, walletCap: config.walletCap,
    deadline: config.deadline, milestoneMet: status === 1, contributorCount: 2n,
    token: status === 1 ? SEASON_TESTNET.season.token : zeroAddress, pool: zeroAddress, vault,
  },
  name: config.name, symbol: config.symbol, quoteToken: SEASON_TESTNET.quoteToken, milestoneCommitter: agent,
  milestoneOd: 20261126, milestoneStage: 0, scope: config.scope, seasonDays: [20261126, 20261127], earnedBps: 2_000,
  earnedTokens: 100_000_000n * WAD, rewardCap: config.rewardCap, taxRoute: 0, contributors: [alice, bob],
});
const deposits: Record<string, bigint> = { [alice]: 1_200n * WAD, [bob]: 400n * WAD };
const perAccount = {
  depositOf: (a: Address) => deposits[a] ?? 0n,
  agentOf: (a: Address) => (a === alice ? agent : a),
  entitledTokens: (a: Address) => ((deposits[a] ?? 0n) * 400_000_000n) / 1_600n,
  claimedOf: () => 0n,
};

describe('season config and salt', () => {
  it('encodes the config as the single tuple the factory decodes', () => {
    const data = encodeSeasonConfig(config);
    const [decoded] = decodeAbiParameters([{
      type: 'tuple', components: [
        { name: 'name', type: 'string' }, { name: 'symbol', type: 'string' }, { name: 'meta', type: 'string' },
        { name: 'salt', type: 'bytes32' }, { name: 'minRaise', type: 'uint256' }, { name: 'raiseCap', type: 'uint256' },
        { name: 'walletCap', type: 'uint256' }, { name: 'deadline', type: 'uint64' }, { name: 'milestoneCommitter', type: 'address' },
        { name: 'milestoneOd', type: 'uint32' }, { name: 'milestoneStage', type: 'uint8' }, { name: 'scope', type: 'bytes32' },
        { name: 'seasonDays', type: 'uint32[]' }, { name: 'earnedBps', type: 'uint16' }, { name: 'rewardCap', type: 'uint256' },
        { name: 'taxRoute', type: 'uint8' },
      ],
    }], data);
    expect(decoded.symbol).toBe('PRIX');
    expect(decoded.seasonDays).toEqual([20261126, 20261127]);
    expect(decoded.minRaise).toBe(config.minRaise);
    // A single dynamic tuple starts with its offset.
    expect(data.slice(0, 66)).toBe(`0x${'20'.padStart(64, '0')}`);
  });

  it('predicts the token the Portal created for the testnet season', () => {
    const salt: Hex = '0x589167d5add7edf97f4ef6b93bc9e11570b1a17d5e9432815816e7a414679ff4';
    expect(predictToken(salt)).toBe(SEASON_TESTNET.season.token);
  });

  it('mines a salt whose token address ends in 7777', () => {
    const { salt, token, tries } = mineSalt(saltSeed('test-seed'));
    expect(token.toLowerCase().endsWith('7777')).toBe(true);
    expect(predictToken(salt)).toBe(token);
    expect(tries).toBeGreaterThan(0);
  }, 30_000);
});

describe('verified-skill weight', () => {
  it('is the deposit share times the verified fraction, in bps', () => {
    expect(weightBps(1_200n * WAD, 1_600n * WAD, { verified: 1, total: 2 })).toBe(3_750);
    expect(weightBps(400n * WAD, 1_600n * WAD, { verified: 0, total: 2 })).toBe(0);
    expect(weightBps(1n, 3n, { verified: 2, total: 2 })).toBe(3_333);
    expect(weightBps(1n, 0n, { verified: 1, total: 1 })).toBe(0);
  });
});

describe('readSeason', () => {
  it('reads an open round without a vault', async () => {
    const client = fakeClient({ launcher: launcherReads(0, zeroAddress), perAccount });
    const view = await readSeason(client, SEASON_TESTNET.season.launcher);
    expect(view.status).toBe('open');
    expect(view.vault).toBeNull();
    expect(view.token.address).toBeNull();
    expect(view.contributors.map((c) => c.agent)).toEqual([agent, bob]);
    expect(view.contributors[0]?.skill).toBeNull();
    expect(client.calls.some((c) => c.startsWith(vaultAddress))).toBe(false);
  });

  it('reads a launched round with balances and weights from the vault', async () => {
    const client = fakeClient({
      launcher: launcherReads(1, vaultAddress), perAccount,
      vault: {
        state: {
          quoteBalance: 17n * WAD, tokenBalance: 100_000_000n * WAD, recognized: 17n * WAD, pooled: 17n * WAD, forwarded: 0n,
          rewardCap: 100n * WAD, quotePaid: 0n, tokensPaid: 0n, earnedTokens: 100_000_000n * WAD, totalDeposit: 1_600n * WAD,
        },
      },
      perVault: {
        skillOf: (a: Address) => (getAddress(a) === agent ? [1n, 2n] : [0n, 2n]),
        entitled: (a: Address) => (a === alice ? [WAD, 37_500_000n * WAD] : [0n, 0n]),
        claimable: (a: Address) => (a === alice ? [WAD, 37_500_000n * WAD] : [0n, 0n]),
      },
    });
    const view = await readSeason(client, SEASON_TESTNET.season.launcher, 144_841_132n);
    expect(view.status).toBe('launched');
    expect(view.blockNumber).toBe(144_841_132n);
    expect(view.vault?.pooled).toBe(17n * WAD);
    const [a, b] = view.contributors;
    expect(a?.skill).toEqual({ verified: 1, total: 2 });
    expect(a?.weightBps).toBe(3_750);
    expect(a?.claimable?.tokens).toBe(37_500_000n * WAD);
    expect(b?.weightBps).toBe(0);
    expect(view.milestone).toEqual({ committer: agent, od: 20261126, stage: 0, met: true });
  });

  it('refuses any chain but 97 and an invalid address', async () => {
    const client = fakeClient({ chainId: 56, launcher: launcherReads(0, zeroAddress), perAccount });
    await expect(readSeason(client, SEASON_TESTNET.season.launcher)).rejects.toThrow('chain 97');
    await expect(readSeason(fakeClient({ launcher: {}, perAccount }), '0x1234' as Address)).rejects.toThrow('Invalid');
  });

  it('reads skills for a list of agents', async () => {
    const client = fakeClient({ launcher: {}, perAccount, perVault: { skillOf: (a: Address) => (a === agent ? [2n, 2n] : [0n, 2n]) } });
    const skills = await readSkills(client, vaultAddress, [agent, bob]);
    expect(skills.get(agent)).toEqual({ verified: 2, total: 2 });
    expect(skills.get(bob)).toEqual({ verified: 0, total: 2 });
  });
});
