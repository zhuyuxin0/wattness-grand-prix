import { useCallback, useEffect, useState } from "react";
import { getAddress, keccak256, parseAbi, recoverAddress, type Address, type Hex } from "viem";
import { fetchJson, useLoad } from "../../data";
import { openRead } from "../AgentIds/rpc";

/** public/data/prices.json, written by scripts/data/prices.mjs. */
export interface PricesFile {
  schema: "grand-prix.prices.v1";
  atlas: {
    endpoint: string;
    report: { payload: Hex; signature: Hex; magicMarker: string; recordedAt: number };
    signer: Address;
    publishedSigner: Address;
    prices: { asset: "BNB" | "USDT"; feedId: number; priceUsd: number; observedAtSeconds: number; raw: string }[];
  };
  cmc: {
    endpoint: string;
    quotes: { asset: "BNB" | "USDT"; cmcId: number; priceUsd: number; observedAtSeconds: number; percentChange24h: number; volume24hUsd: number | null }[];
    security: { platform: string; address: string; state: string; flagged: boolean | null; verifiedContract: boolean | null; source: string | null };
  };
  agreement: { bnbDeviation: number; bnbLimit: number; usdtFromDollar: number; usdtLimit: number };
  decision: {
    now: number;
    treasuryBnb: number;
    evaluationPriceUsdCents: number;
    before: { state: "unpriced"; evaluationBudgetUsdCents: null; evaluationCount: null };
    after: {
      state: "priced" | "review";
      referenceValueUsdCents: number;
      baselineReserveFraction: number;
      reserveFraction: number;
      baselineEvaluationBudgetUsdCents: number;
      evaluationBudgetUsdCents: number;
      evaluationCount: number;
      deviation: number;
      reasons: string[];
    };
  };
  limits: { atlasMaxAgeSeconds: number; futureDriftSeconds: number; cmcMaxAgeSeconds: number; reserveCap: number };
  onChain: {
    chainId: number;
    explorer: string;
    rpcs: string[];
    feeds: { pair: string | null; feedId: number | null; address: Address; heartbeatSeconds: number | null; deviationPct: number | null; from: "catalog" | "adapter" }[];
  };
}

export const usePrices = () => useLoad(() => fetchJson<PricesFile>("prices.json"), "prices");

const FEED_ABI = parseAbi([
  "function description() view returns (string)",
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
]);

export interface FeedRead {
  address: Address;
  description: string;
  decimals: number;
  round: bigint;
  answer: bigint;
  priceUsd: number;
  updatedAt: number;
  /** Seconds from the feed's last update to the block it was read at. */
  ageSeconds: number;
}

export interface LiveRead {
  rpc: string;
  block: number;
  blockTime: number;
  feeds: (FeedRead | { address: Address; error: string })[];
}

export type LiveState = { status: "loading" } | { status: "ready"; read: LiveRead } | { status: "error"; error: string };

/** Each feed's description, decimals and latest round, from one public node at one block. */
async function readFeeds(f: PricesFile["onChain"]): Promise<LiveRead> {
  const chain = await openRead(f.rpcs, f.chainId);
  const feeds = await Promise.all(
    f.feeds.map(async (feed) => {
      try {
        const [description, decimals, round] = await Promise.all([
          chain.call<string>(feed.address, FEED_ABI, "description"),
          chain.call<number>(feed.address, FEED_ABI, "decimals"),
          chain.call<readonly [bigint, bigint, bigint, bigint, bigint]>(feed.address, FEED_ABI, "latestRoundData"),
        ]);
        const scale = 10 ** Number(decimals);
        const updatedAt = Number(round[3]);
        return {
          address: feed.address,
          description,
          decimals: Number(decimals),
          round: round[0],
          answer: round[1],
          priceUsd: Number(round[1]) / scale,
          updatedAt,
          ageSeconds: chain.blockTime - updatedAt,
        } satisfies FeedRead;
      } catch (e) {
        return { address: feed.address, error: (e as Error).message };
      }
    }),
  );
  return { rpc: chain.rpc, block: chain.block, blockTime: chain.blockTime, feeds };
}

/** The live read, with a way to read again. */
/** The feeds read live; a read again keeps the last good read while it runs (busy) and if it fails (failed). */
export function useLiveFeeds(f: PricesFile["onChain"]): { state: LiveState; busy: boolean; failed: boolean; again: () => void } {
  const [n, setN] = useState(0);
  const [state, setState] = useState<LiveState>({ status: "loading" });
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setBusy(true);
    readFeeds(f).then(
      (read) => {
        if (!live) return;
        setState({ status: "ready", read });
        setFailed(false);
        setBusy(false);
      },
      (e: unknown) => {
        if (!live) return;
        const error = e instanceof Error ? e.message : String(e);
        setState((s) => (s.status === "ready" ? s : { status: "error", error }));
        setFailed(true);
        setBusy(false);
      },
    );
    return () => {
      live = false;
    };
    // f is the published file's, fixed for the page's life.
  }, [n]);
  const again = useCallback(() => setN((x) => x + 1), []);
  return { state, busy, failed, again };
}

export type SignerState = { status: "checking" } | { status: "done"; signer: Address; matches: boolean } | { status: "error"; error: string };

/** Recovers the signed report's signer here, from its payload's Keccak-256 and its signature. */
export function useSigner(report: PricesFile["atlas"]["report"], published: Address): SignerState {
  const [state, setState] = useState<SignerState>({ status: "checking" });
  useEffect(() => {
    let live = true;
    recoverAddress({ hash: keccak256(report.payload), signature: report.signature }).then(
      (a) => live && setState({ status: "done", signer: getAddress(a), matches: getAddress(a) === getAddress(published) }),
      (e: unknown) => live && setState({ status: "error", error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [report.payload, report.signature, published]);
  return state;
}
