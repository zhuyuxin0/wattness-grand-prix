import { Link, useLocation } from "react-router-dom";
import { Glyph } from "../ui/Glyph";
import { batteryPath, useSelectedBattery } from "./battery";
import { MemoryCue } from "./MemoryCue";
import { groupOf, TABS, tabAt, type PanelTab } from "./tabs";

/**
 * The foot of every tab: the steps before and after it, in the side panel's
 * order, which is the pipeline's (a battery's plan, its seal, its check). Read
 * from the same list as the panel, so a new tab joins the walk by itself. The
 * Intro has its own way in, and the last tab has no next step. Under it, on
 * every tab, one quiet line to the tab's page in the build's memory.
 */
export function Pager() {
  const { pathname } = useLocation();
  const [battery] = useSelectedBattery();
  const tab = tabAt(pathname);
  if (!tab) return null;
  if (tab.path === "/") return <MemoryCue tab={tab} />;
  const i = TABS.indexOf(tab);
  return (
    <>
      <nav className="pager" aria-label="Previous and next tab">
        <Step tab={TABS[i - 1]} dir="prev" battery={battery} />
        <Step tab={TABS[i + 1]} dir="next" battery={battery} />
      </nav>
      <MemoryCue tab={tab} />
    </>
  );
}

function Step({ tab, dir, battery }: { tab: PanelTab | undefined; dir: "prev" | "next"; battery: string }) {
  if (!tab) return <span className="pager__step pager__step--none" aria-hidden="true" />;
  const group = groupOf(tab)?.label;
  return (
    <Link className={`pager__step pager__step--${dir}`} to={tab.battery ? batteryPath(tab.path, battery) : tab.path} rel={dir}>
      <span className="pager__dir">
        {dir === "prev" && <Glyph name="prev" />}
        {dir === "prev" ? "Previous" : "Next"}
        {group && <span className="pager__group">· {group}</span>}
        {dir === "next" && <Glyph name="next" />}
      </span>
      <span className="pager__label">{tab.label}</span>
      <span className="pager__summary">{tab.summary}</span>
    </Link>
  );
}
