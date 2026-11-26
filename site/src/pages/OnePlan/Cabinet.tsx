import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { OnePlanHandle, SealReceipt } from "@world/game";
import { SHOWCASE } from "../../config";
import { now } from "../../lib/capture";
import { useTheme } from "../../ui";

// The cabinet: mountOnePlan in play mode (packages/world/src/game). The stage
// holds its own dark; the deck under it (the dial, the rack of hours, the seal
// and the read-out) follows the site's theme through setTheme. The package and
// three.js load here, by dynamic import, so they stay in this tab's chunks.

export function Cabinet({ onSeal }: { onSeal: (receipt: SealReceipt) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const game = useRef<OnePlanHandle | null>(null);
  const theme = useTheme();
  const themeNow = useRef(theme);
  themeNow.current = theme;
  const sealed = useRef(onSeal);
  sealed.current = onSeal;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let gone = false;
    let handle: OnePlanHandle | null = null;
    const fail = (error: unknown) => {
      if (gone) return;
      console.warn("ONE PLAN could not start:", error);
      setFailed(true);
    };
    import("@world/game").then(({ mountOnePlan }) => {
      if (gone || !el.current) return;
      handle = mountOnePlan(el.current, {
        mode: "play",
        theme: themeNow.current,
        onSeal: (receipt) => sealed.current(receipt),
        // The gate check reads the site's clock, so a recording's fixed clock holds here too.
        now: () => now() / 1000,
        // Once the field's gate has passed, the seal card points to the sealed record.
        recordHref: "#/seal",
      });
      game.current = handle;
      handle.ready.catch(fail);
    }, fail);
    return () => {
      gone = true;
      game.current = null;
      handle?.dispose();
    };
  }, []);

  useEffect(() => {
    game.current?.setTheme(theme);
  }, [theme]);

  return (
    <>
      <div ref={el} className="arcade__cabinet" hidden={failed} aria-label="ONE PLAN: the cabinet and its controls" role="region" />
      {failed && (
        <p className="arcade__fallback">
          This browser cannot draw the cabinet. Desert Willow's three plans, scored over the same price scenarios, are on{" "}
          <Link to={`/battery/${SHOWCASE.resource}`}>Battery</Link> and <Link to={`/agents/risk?battery=${SHOWCASE.resource}`}>Risk</Link>.
        </p>
      )}
    </>
  );
}
