import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { Glyph } from "../ui/Glyph";
import { TabIcon } from "../ui/TabIcon";
import { batteryPath, useSelectedBattery } from "./battery";
import { Brand } from "./Brand";
import { panelSections, tabAt } from "./tabs";

const COLLAPSED_KEY = "gp.panel.collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** The groups and their tabs, the Terminal's side-nav rows. */
function TabList({ onPick }: { onPick?: () => void }) {
  const { pathname } = useLocation();
  const active = tabAt(pathname);
  const [battery] = useSelectedBattery();
  return (
    <>
      {panelSections().map((s) => (
        <div key={s.group?.id ?? "top"} className={`sidenav-group${s.group ? "" : " sidenav-group--top"}`}>
          {s.group && <h2>{s.group.label}</h2>}
          {s.tabs.map((t) => (
            <Link
              key={t.id}
              to={t.battery ? batteryPath(t.path, battery) : t.path}
              className="sidenav-item"
              data-tab={t.id}
              aria-current={active?.id === t.id ? "page" : undefined}
              title={t.summary}
              onClick={onPick}
            >
              <TabIcon name={t.icon} className="sidenav-icon" />
              <span className="sidenav-label">{t.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}

/** The side panel beside the page, from 768px up. Its toggle folds it to a rail, remembered. */
export function SidePanel() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        // A blocked store only costs remembering the choice.
      }
      return !c;
    });
  return (
    <nav className={`sidenav sidenav--rail${collapsed ? " collapsed" : ""}`} aria-label="Tabs">
      <button
        type="button"
        className="sidenav-toggle"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Show the tab list" : "Hide the tab list"}
        title={collapsed ? "Show the tab list" : "Hide the tab list"}
      >
        <Glyph name={collapsed ? "next" : "prev"} />
      </button>
      {!collapsed && <TabList />}
    </nav>
  );
}

/** On a phone the same list opens as a drawer from the page button. */
export function TabDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // The current tab, else the first: one selector list would match the first row in document order.
    const rows = sheet.current;
    (rows?.querySelector<HTMLElement>('.sidenav-item[aria-current="page"]') ?? rows?.querySelector<HTMLElement>(".sidenav-item"))?.focus();
    return () => {
      document.body.style.overflow = prior;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="drawer" id="tab-drawer" role="dialog" aria-modal="true" aria-label="Tabs">
      <div className="drawer__scrim" onClick={onClose} aria-hidden="true" />
      <div className="drawer__sheet" ref={sheet}>
        <div className="drawer__head">
          <Brand />
          <button type="button" className="btn drawer__close" onClick={onClose} aria-label="Close the tab list" title="Close the tab list">
            <Glyph name="close" />
          </button>
        </div>
        <nav className="sidenav sidenav--drawer" aria-label="Tabs">
          <TabList onPick={onClose} />
        </nav>
      </div>
    </div>,
    document.body,
  );
}
