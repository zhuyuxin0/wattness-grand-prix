import { useId } from "react";
import { useLocation } from "react-router-dom";
import { openPane } from "../float";
import { TabIcon } from "../ui/TabIcon";
import { batteryPath, useSelectedBattery } from "./battery";
import { isPreviewClick, relatedTabs } from "./related";
import { tabAt } from "./tabs";
import "./related.css";

/**
 * The page's Related strip, in its head: the tabs it leads to (related.ts). A click opens one as a floating pane over
 * the page, a sheet on a phone, and the pane's Open goes to it; a link held with ⌘, Ctrl or Shift, or a middle click,
 * opens the tab in a new browser tab, as any link does. Inside a pane the strip reads the pane's own page.
 */
export function RelatedStrip({ tabId }: { tabId?: string }) {
  const { pathname } = useLocation();
  const [battery] = useSelectedBattery();
  const labelId = useId();
  const tabs = relatedTabs(tabId ?? tabAt(pathname)?.id);
  if (tabs.length === 0) return null;
  return (
    <nav className="related" aria-labelledby={labelId}>
      <span className="related__label" id={labelId}>
        Related
      </span>
      <ul className="related__list">
        {tabs.map((t) => {
          const to = t.battery ? batteryPath(t.path, battery) : t.path;
          return (
            <li key={t.id}>
              <a
                className="related__item"
                href={to}
                data-related={t.id}
                title={t.summary}
                onClick={(e) => {
                  if (!isPreviewClick(e)) return;
                  e.preventDefault();
                  openPane(to, e.currentTarget);
                }}
              >
                <TabIcon name={t.icon} size={14} className="related__icon" />
                {t.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
