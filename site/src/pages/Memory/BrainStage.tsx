import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { BrainHandle, BrainOptions } from "@world/stations/brain/mount";
import { isCapture } from "../../lib/capture";
import { WORLD_TABS, worldTab } from "../../shell/tabs";
import { worldPath } from "../../shell/world";
import { useTheme } from "../../ui";
import type { BuildBrain } from "./data";
import { readSelection, writeSelection } from "./select";

// The tab's opening view: mountBrain (packages/world/src/stations/brain), our
// three brains as Living Brain holds them, drawn from what its API returned.
// All brains first; a brain clicked comes to the center; a page hovered lights
// its connections; clicked, its card pins, with "Open <tab>" to the site's tab.
// The view's brain and page live in the tab's URL (select.ts), shared with the
// page view under it: the mount never writes the URL, it asks through onState
// and this page writes it; back, forward and a pick in the lists below reach
// the stage through goTo. The package and three.js load here, by dynamic
// import, so they stay in this tab's chunks; the brains' particles are made
// in a worker before the mount (prepareBrain), so opening the tab never stalls
// the page. The stage holds its own dark in either theme; without WebGL the
// mount lists the pages, in the page's theme.

/** The site's tabs by the package's ids, as the brain's cards name them ("Open Battery", "Part of: Seal"). This tab
 *  is left out: its own card's "Open Memory" (and "Part of: Memory") would navigate to the tab the visitor is on,
 *  which drops the selection, flies the stage back out and closes the card. */
const TAB_LIST: { id: string; label: string }[] = Object.keys(WORLD_TABS).flatMap((id) => {
  const t = id === "memory" ? null : worldTab(id);
  return t ? [{ id, label: t.label }] : [];
});

/** The corrections this site's build-brain.json carries beside Living Brain's text, keyed as the mount reads them. */
function correctionsOf(b: BuildBrain | null): BrainOptions["corrections"] {
  if (!b) return undefined;
  const pages: Record<string, string> = {};
  for (const p of b.pages) if (p.correction) pages[`${p.brain}/${p.slug}`] = p.correction;
  const connections: Record<string, string> = {};
  for (const c of b.connections) if (c.correction) connections[`${c.aBrain}/${c.a}>${c.bBrain}/${c.b}`] = c.correction;
  return { pages, connections };
}

interface Props {
  /** The build's brain file, once it has loaded (null without it): the stage waits for it, for its corrections. */
  build: BuildBrain | null;
  settled: boolean;
}

export function BrainStage({ build, settled }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const handle = useRef<BrainHandle | null>(null);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const live = useRef({ params, setParams, navigate, theme, build });
  live.current = { params, setParams, navigate, theme, build };
  const [failed, setFailed] = useState(false);
  const [flat, setFlat] = useState(false);
  const sel = readSelection(params);

  useEffect(() => {
    if (!settled) return;
    let gone = false;
    let h: BrainHandle | null = null;
    const fail = (error: unknown) => {
      if (gone) return;
      console.warn("The brains could not start:", error);
      // the stage steps aside below, so the mount and its WebGL context go now, not when the tab closes
      h?.dispose();
      h = null;
      handle.current = null;
      setFailed(true);
    };
    import("@world/stations/brain/mount").then(async ({ mountBrain, prepareBrain }) => {
      if (gone || !el.current) return;
      await prepareBrain(el.current);
      if (gone || !el.current) return;
      h = mountBrain(el.current, {
        theme: live.current.theme,
        tabs: TAB_LIST,
        initial: readSelection(live.current.params),
        corrections: correctionsOf(live.current.build),
        // A recording holds the view still; otherwise the visitor's reduced-motion setting decides.
        reducedMotion: isCapture() ? true : undefined,
        onRoute: (id) => {
          const to = worldPath(id);
          if (to) live.current.navigate(to);
        },
        onState: (s, how) => {
          const { params: p, setParams: set } = live.current;
          set(writeSelection(p, s), { replace: how.history === "replace" });
        },
      });
      handle.current = h;
      // Without WebGL the mount is a list in the page's theme, so the stage gives up its dark.
      setFlat(!!el.current.querySelector(".lbm-root.is-flat"));
      h.ready.catch(fail);
    }, fail);
    return () => {
      gone = true;
      handle.current = null;
      h?.dispose();
    };
  }, [settled]);

  // The URL moved without the stage (back, forward, a page picked below): the stage follows. The mount leaves a
  // selection it already shows as it is, so its own onState coming back here moves nothing.
  useEffect(() => {
    const h = handle.current;
    if (!h) return;
    const now = h.state();
    const page = sel.brain === "all" ? null : sel.page;
    if (now.brain !== sel.brain || now.page !== page) h.goTo({ brain: sel.brain, page });
  }, [sel.brain, sel.page]);

  useEffect(() => {
    handle.current?.setTheme(theme);
  }, [theme]);

  // Without the stage the lists under it carry every page, so it steps aside.
  if (failed) return null;
  return (
    <section className={`mem-stage${flat ? " mem-stage--flat" : ""}`} data-atmosphere={flat ? undefined : "dark"}>
      <div ref={el} className="mem-stage__space" />
    </section>
  );
}
