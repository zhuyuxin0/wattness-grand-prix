import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Field, SealReceipt } from "@world/game";
import { TABS } from "../../shell/tabs";
import { PageHeader } from "../../ui";
import { Cabinet } from "./Cabinet";
import { HowItPlays } from "./HowItPlays";
import { SealedPlan } from "./SealedPlan";
import "./styles.css";

// ONE PLAN: the playable plan. Its stage is mountOnePlan from packages/world in
// play mode, loaded with a dynamic import in this tab only, so the other tabs
// stay light. Beside it, what the dial, the glass, the score and the seal mean;
// under it, once the visitor seals, the receipt.

const tab = TABS.find((t) => t.id === "one-plan");

/** The page's width from which the words sit beside the cabinet rather than folded above it. */
const RAIL_FROM = 1100;

// A seal stays on the page while the site is open, so a visit to another tab
// and back still shows it. The record itself is on chain.
let lastSeal: SealReceipt | null = null;

/** An element's content width, measured before the first paint and kept as it changes. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export default function OnePlanPage() {
  const [seal, setSeal] = useState<SealReceipt | null>(lastSeal);
  const [field, setField] = useState<Field | null>(null);
  const onSeal = useCallback((receipt: SealReceipt) => {
    lastSeal = receipt;
    setSeal(receipt);
  }, []);
  const [box, width] = useWidth<HTMLDivElement>();
  const wide = width >= RAIL_FROM;

  return (
    <div className="page page--one-plan">
      <PageHeader title="ONE PLAN" lede={tab?.summary} />
      <div ref={box} className={`arcade${wide ? " arcade--rail" : ""}`}>
        {!wide && <HowItPlays folded field={field} />}
        <div className="arcade__main">
          <Cabinet onSeal={onSeal} onField={setField} />
          {seal && <SealedPlan receipt={seal} />}
        </div>
        {wide && (
          <aside className="arcade__rail">
            <HowItPlays field={field} />
          </aside>
        )}
      </div>
    </div>
  );
}
