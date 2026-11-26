import type { Address } from "viem";
import type { RoundView } from "./chain";
import { WATTNESS_AGENT } from "./addresses";

// The terms "How This Round Works" states. The page takes them from round 3's
// Launcher as it reads it; before the first read, or when no node answers, it
// shows these, read from the same Launcher (0x4C3f…Bd9) on BSC testnet at block
// 144,970,784 (Nov 26, 05:21 CT). Each one is an immutable or a constant of
// SeasonLauncher, so none can change. The launched round (0x627A…0D59) holds the
// same caps, creator and committer.

const E18 = 10n ** 18n;

export interface RoundTerms {
  /** The milestone's committer: the wallet whose record the launch waits for. */
  committer: Address;
  /** The milestone's operating day, YYYYMMDD. */
  od: number;
  walletCap: bigint;
  raiseCap: bigint;
  maxContributors: number;
  /** Most quote the vault credits from the trading tax; tax above it goes to the creator. */
  rewardCap: bigint;
  creator: Address;
  /** The tax on buys and on sells, in bps of the trade. */
  taxBps: number;
  /** The vault's share of the tax after Flap's fee, in bps; the rest is burned. */
  vaultShareBps: number;
}

export const ROUND3_TERMS: RoundTerms = {
  committer: WATTNESS_AGENT,
  od: 20261127,
  walletCap: 2000n * E18,
  raiseCap: 2000n * E18,
  maxContributors: 100,
  rewardCap: 100n * E18,
  creator: "0x20bdB6b8a34958207278f6Fa366d8f7E215D9aFb",
  taxBps: 300,
  vaultShareBps: 8000,
};

/**
 * Flap's protocol fee, in bps of the tax. It is Flap's setting, not the round's:
 * the launched round's tax processor (0x08B4…e044, a beacon proxy owned by
 * Flap's Portal) holds feeRate 1000, and its real flows agree (Nov 25: 18% of
 * the tax burned, 82% sold; of the proceeds 72/82 to the vault, 10/82 to Flap).
 */
export const FLAP_FEE_BPS = 1000;

/** Days the token's tax runs from the launch: SeasonLauncher's taxDuration. */
export const TAX_DAYS = 30;

export function termsOf(round: RoundView): RoundTerms {
  return {
    committer: round.milestone.committer,
    od: round.milestone.od,
    walletCap: round.walletCap,
    raiseCap: round.raiseCap,
    maxContributors: round.maxContributors,
    rewardCap: round.rewardCap,
    creator: round.creator,
    taxBps: round.taxBps,
    vaultShareBps: round.vaultShareBps,
  };
}
