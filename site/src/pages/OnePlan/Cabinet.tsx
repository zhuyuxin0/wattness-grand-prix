import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Field, OnePlanHandle, SealReceipt } from "@world/game";
import { SHOWCASE } from "../../config";
import { now } from "../../lib/capture";
import { useTheme } from "../../ui";

// The cabinet: mountOnePlan in play mode (packages/world/src/game). The stage
// holds its own dark; the deck under it (the dial, the rack of hours, the seal
// and the read-out) follows the site's theme through setTheme. The package and
// three.js load here, by dynamic import, so they stay in this tab's chunks.

/** A plain click on one of the cabinet's own links to a page here (the seal card's record link): the path it opens. */
function pagePath(e: MouseEvent): string | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
  const href = a?.getAttribute("href");
  if (!a || !href || !href.startsWith("/") || href.startsWith("//") || a.hasAttribute("download")) return null;
  return (a.getAttribute("target") ?? "_self") === "_self" ? href : null;
}

export function Cabinet({ onSeal, onField }: { onSeal: (receipt: SealReceipt) => void; onField?: (field: Field) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const fieldTo = useRef(onField);
  fieldTo.current = onField;
  const game = useRef<OnePlanHandle | null>(null);
  const theme = useTheme();
  const themeNow = useRef(theme);
  themeNow.current = theme;
  const sealed = useRef(onSeal);
  sealed.current = onSeal;
  const navigate = useNavigate();
  const go = useRef(navigate);
  go.current = navigate;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let gone = false;
    let handle: OnePlanHandle | null = null;
    const fail = (error: unknown) => {
      if (gone) return;
      console.warn("ONE PLAN could not start:", error);
      setFailed(true);
    };
    // The cabinet's links are plain anchors (the package knows no router): a plain click on one that opens a page here
    // goes through the router, as a Link does, so the site does not reload; any other click is the browser's.
    const host = el.current;
    const follow = (e: MouseEvent) => {
      const to = pagePath(e);
      if (!to) return;
      e.preventDefault();
      go.current(to);
    };
    host?.addEventListener("click", follow);
    import("@world/game").then(({ mountOnePlan }) => {
      if (gone || !el.current) return;
      handle = mountOnePlan(el.current, {
        mode: "play",
        theme: themeNow.current,
        onSeal: (receipt) => sealed.current(receipt),
        // The gate check reads the site's clock, so a recording's fixed clock holds here too.
        now: () => now() / 1000,
        // Once the field's gate has passed, the seal card points to the sealed record.
        recordHref: "/seal",
      });
      game.current = handle;
      const h = handle;
      // The field the cabinet plays (its own sealed day, from the world's frame data), for the words beside it.
      h.ready.then(() => {
        if (!gone) fieldTo.current?.(h.field());
      }, fail);
    }, fail);
    return () => {
      gone = true;
      host?.removeEventListener("click", follow);
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
          This browser cannot draw the cabinet. Desert Willow's three plans for the latest sealed day, each scored over that day's price scenarios, are on{" "}
          <Link to={`/battery/${SHOWCASE.resource}`}>Battery</Link> and <Link to={`/agents/risk?battery=${SHOWCASE.resource}`}>Risk</Link>.
        </p>
      )}
    </>
  );
}
