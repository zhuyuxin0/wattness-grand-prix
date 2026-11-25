import { useEffect, useState } from "react";
import { SHOWCASE } from "../config";
import { loadBrain, loadDay, loadLateSeal, loadReceipts, loadScenarios, loadShowcaseManifest, loadTerminalStructure } from "./load";

export type Loaded<T> = { status: "loading" } | { status: "error"; error: Error } | { status: "ready"; data: T };

/** Runs a loader once per key; the loader's result is cached by load.ts. */
export function useLoad<T>(loader: () => Promise<T>, key = ""): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    loader().then(
      (data) => live && setState({ status: "ready", data }),
      (error: unknown) => live && setState({ status: "error", error: error instanceof Error ? error : new Error(String(error)) }),
    );
    return () => {
      live = false;
    };
    // The key stands in for the loader's identity, which changes every render.
  }, [key]);
  return state;
}

export const useDay = () => useLoad(loadDay, "day");
export const useReceipts = () => useLoad(loadReceipts, "receipts");
export const useLateSeal = () => useLoad(loadLateSeal, "late-seal");
export const useTerminalStructure = () => useLoad(loadTerminalStructure, "terminal-structure");
export const useBrain = () => useLoad(loadBrain, "brain");
export const useShowcaseManifest = (resource: string = SHOWCASE.resource) =>
  useLoad(() => loadShowcaseManifest(resource), `manifest:${resource}`);
export const useScenarios = (resource: string = SHOWCASE.resource) => useLoad(() => loadScenarios(resource), `scenarios:${resource}`);
