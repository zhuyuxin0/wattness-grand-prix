import { useEffect, useState } from "react";
import type { LogoId, LogoSpec } from "@world/kit/logos";
import type { BuiltWithEntry } from "../../ui/BuiltWith";

// The sponsors' logos for any page, kept with the Tech Stack's: the world package's registry
// (packages/world/src/kit/logos), loaded once for the whole site by dynamic import (the site loads that package only
// so, from a page folder: test/world-tabs.test.mjs), which also brings the chip's stylesheet. Null until it is in; on
// a failure a page keeps its words and draws no chips.

export interface LogoRegistry {
  logos: Record<LogoId, LogoSpec>;
  /** The line a page that shows these logos carries. */
  note: string;
}

let loaded: LogoRegistry | null = null;
let loading: Promise<LogoRegistry> | null = null;

export function loadLogoRegistry(): Promise<LogoRegistry> {
  loading ??= import("@world/kit/logos").then(
    (m) => (loaded = { logos: m.LOGOS, note: m.LOGO_NOTE }),
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

export function useLogoRegistry(): LogoRegistry | null {
  const [registry, setRegistry] = useState<LogoRegistry | null>(loaded);
  useEffect(() => {
    if (registry) return;
    let live = true;
    loadLogoRegistry().then(
      (r) => live && setRegistry(r),
      (error: unknown) => console.warn("The logos could not be loaded:", error),
    );
    return () => {
      live = false;
    };
  }, [registry]);
  return registry;
}

/** A "Built with" entry by id: one logo, several in one glass ([a, b]), or one with its own words ({ id, caption }). */
export type SponsorRef = LogoId | readonly LogoId[] | { id: LogoId; caption: string };

/** The entries for a Section's builtWith from the registry, or null until it is in. */
export function sponsors(registry: LogoRegistry | null, ...refs: SponsorRef[]): BuiltWithEntry[] | null {
  if (!registry) return null;
  const l = registry.logos;
  return refs.map((r): BuiltWithEntry => {
    if (typeof r === "string") return l[r as LogoId];
    if (Array.isArray(r)) return (r as readonly LogoId[]).map((id) => l[id]);
    const one = r as { id: LogoId; caption: string };
    return { logo: l[one.id], caption: one.caption };
  });
}
