import { useCallback, useEffect, useRef, useState } from "react";
import { isCapture } from "../../lib/capture";
import { BNB_USD_FEED, STOCK_MULTIFEED, TEXAS_FEEDS, feedKey } from "./atlas";
import { onPublicNode, readMultiFeed, readReceipt, readSingleFeed, type GasReceipt, type MultiFeedRead, type NodeRead, type SingleFeedRead } from "./chain";

/** Half a heartbeat: a price on the page is at most about one push behind the chain. */
export const POLL_MS = 30_000;

export interface Polled<T> {
  /** The latest good read. It stays when a later read fails. */
  data: T | null;
  /** The latest read's failure, cleared by the next good read. */
  error: Error | null;
  /** A read is running. */
  busy: boolean;
  /** Reads now, out of turn. */
  again: () => void;
}

/**
 * Reads now, then every `everyMs` while the page is visible, one read at a
 * time; a hidden tab stops reading and catches up when shown. A recording
 * reads once, so its frames do not move. A failed read keeps the last good one.
 */
export function usePolled<T>(read: () => Promise<T>, everyMs: number, key: string): Polled<T> {
  const [state, setState] = useState<{ data: T | null; error: Error | null; busy: boolean }>({ data: null, error: null, busy: true });
  const now = useRef<() => void>(() => undefined);
  useEffect(() => {
    const single = isCapture();
    let live = true;
    let busy = false;
    let timer: number | undefined;
    const tick = async (asked = false) => {
      window.clearTimeout(timer);
      if (busy || (!asked && !single && document.visibilityState === "hidden")) return;
      busy = true;
      setState((s) => ({ ...s, busy: true }));
      try {
        const data = await read();
        if (live) setState({ data, error: null, busy: false });
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        if (live) setState((s) => ({ data: s.data, error, busy: false }));
      } finally {
        busy = false;
        if (live && !single) timer = window.setTimeout(tick, everyMs);
      }
    };
    now.current = () => void tick(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    void tick();
    if (!single) document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      now.current = () => undefined;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // The key stands in for the reader's identity, which changes every render.
  }, [key, everyMs]);
  const again = useCallback(() => now.current(), []);
  return { ...state, again };
}

const STOCK_KEYS = TEXAS_FEEDS.map((f) => feedKey(f.id));

/** The four stock feeds, from Atlas's MultiFeed on BNB Smart Chain, and the node that gave them. */
export const useStockFeeds = () =>
  usePolled<NodeRead<MultiFeedRead>>(() => onPublicNode((rpc) => readMultiFeed(STOCK_MULTIFEED.address, STOCK_KEYS, rpc)), POLL_MS, "atlas:stocks");

/** Atlas's BNB/USD, from its SingleFeed on BNB Smart Chain, and the node that gave it. */
export const useBnbUsd = () =>
  usePolled<NodeRead<SingleFeedRead>>(() => onPublicNode((rpc) => readSingleFeed(BNB_USD_FEED.address, BNB_USD_FEED.describes, rpc)), POLL_MS, "atlas:bnb-usd");

/** A commit's receipt by its hash. Once read it is kept, so later polls only retry a failure. */
export const useCommitReceipt = (hash: `0x${string}`) =>
  usePolled<NodeRead<GasReceipt>>(() => onPublicNode((rpc) => readReceipt(hash, rpc)), POLL_MS, `atlas:receipt:${hash.toLowerCase()}`);
