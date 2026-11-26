import { Link } from "react-router-dom";
import { Glyph } from "../ui/Glyph";
import type { PanelTab } from "./tabs";
import "./memory-cue.css";

/**
 * One quiet line at a tab's foot: the page the build's own brain in Living
 * Brain keeps on this tab, opened on the Memory tab (#/agents/memory?tab=<id>).
 * It names the tab only, so no tab loads the brain to draw it.
 */
export function MemoryCue({ tab }: { tab: PanelTab }) {
  return (
    <p className={`memory-cue${tab.path === "/" ? " memory-cue--bleed" : ""}`}>
      <Link to={{ pathname: "/agents/memory", search: `?tab=${tab.id}` }} title={`${tab.label} in the build's memory, on the Memory tab`}>
        <Glyph name="docs" />
        <span>You are here in the build's memory</span>
        <span className="memory-cue__page">the {tab.label} page in Living Brain</span>
      </Link>
    </p>
  );
}
