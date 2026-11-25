import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJson, type DayIndex } from "../../data";
import type { Network } from "./verify/chain";
import { rebuildManifest, type StewardsLeaf, type StewardsPack } from "./verify/core";
import { checkBattery, checkChain, checkLeaf, checkProof, type CheckId, type CheckResult, type RunInput } from "./verify/run";

export interface Tamper {
  arm: string;
  hour: number;
  path: string;
  sealedKw: number;
  tamperedKw: number;
}

/** One more MW in the selected arm's busiest hour: a change small enough to miss by eye. */
export function tamperPlan(doc: Record<string, unknown>): { copy: Record<string, unknown>; tamper: Tamper } {
  const copy = structuredClone(doc);
  const arm = copy.selected_arm as string;
  const kw = (copy.arms as Record<string, { kw: number[] }>)[arm]!.kw;
  let hour = 0;
  kw.forEach((v, h) => {
    if (Math.abs(v) > Math.abs(kw[hour]!)) hour = h;
  });
  const sealedKw = kw[hour]!;
  kw[hour] = sealedKw + 1000;
  return { copy, tamper: { arm, hour, path: `arms.${arm}.kw[${hour}]`, sealedKw, tamperedKw: kw[hour]! } };
}

export type Results = Partial<Record<CheckId, CheckResult>>;

export interface StewardsState {
  phase: "loading" | "running" | "done" | "error";
  error?: string;
  sealed: Record<string, unknown> | null;
  tamper: Tamper | null;
  results: Results;
  /** Bumps on every run, so a page can restart its reveal. */
  run: number;
}

const loadPack = () => fetchJson<StewardsPack>("stewards/pack.json");
const loadLeaf = (resource: string) => fetchJson<StewardsLeaf>(`stewards/leaves/${resource}.json`);

export function useStewards(day: DayIndex, resource: string, network: Network, contract: string, tampered: boolean, again: number): StewardsState {
  const [state, setState] = useState<StewardsState>({ phase: "loading", sealed: null, tamper: null, results: {}, run: 0 });
  // The chain record does not change with a tampered copy, so one read per
  // battery and network serves every run.
  const chainCache = useRef(new Map<string, Promise<[CheckResult, CheckResult]>>());
  const runs = useRef(0);

  const key = useMemo(() => `${resource}|${network.chainId}|${tampered ? 1 : 0}|${again}`, [resource, network.chainId, tampered, again]);

  useEffect(() => {
    let live = true;
    const run = ++runs.current;
    setState((s) => ({ phase: s.sealed && s.results[1] ? "running" : "loading", sealed: s.sealed, tamper: null, results: {}, run }));
    (async () => {
      const [pack, leaf] = await Promise.all([loadPack(), loadLeaf(resource)]);
      const sealed = rebuildManifest(pack, leaf);
      const { copy, tamper } = tamperPlan(sealed);
      const doc = tampered ? copy : sealed;
      const input: RunInput = { day, resource, sealed, doc, network, contract };
      if (!live) return;
      setState({ phase: "running", sealed, tamper: tampered ? tamper : null, results: {}, run });
      const put = (r: CheckResult) => live && setState((s) => ({ ...s, results: { ...s.results, [r.id]: r } }));

      const chainKey = `${resource}|${network.chainId}|${again}`;
      let chain = chainCache.current.get(chainKey);
      if (!chain) {
        chain = checkChain(input);
        chainCache.current.set(chainKey, chain);
        chain.then(([r3]) => {
          if (r3.status === "unread") chainCache.current.delete(chainKey);
        });
      }
      const local = (async () => {
        put(await checkLeaf(input));
        put(await checkProof(input));
        put(checkBattery(input));
      })();
      const remote = chain.then(([r3, r4]) => {
        put(r3);
        put(r4);
      });
      await Promise.all([local, remote]);
      if (live) setState((s) => ({ ...s, phase: "done" }));
    })().catch((e: unknown) => {
      if (live) setState((s) => ({ ...s, phase: "error", error: e instanceof Error ? e.message : String(e) }));
    });
    return () => {
      live = false;
    };
    // `key` covers every input that changes the run.
  }, [key]);

  return state;
}
