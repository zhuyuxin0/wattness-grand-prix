import type { RefObject } from "react";
import { Glyph } from "../ui/Glyph";
import { ThemeToggle } from "../ui/ThemeToggle";
import { Brand } from "./Brand";
import { GateTag, MarketClock, useSecondClock } from "./MarketClock";
import { groupOf, type PanelTab } from "./tabs";

interface MastheadProps {
  tab: PanelTab | undefined;
  menuOpen: boolean;
  onMenu: () => void;
  menuRef: RefObject<HTMLButtonElement>;
}

/**
 * wattness.tech's masthead: the lockup and the product name at the left; the
 * market clock, the gate and the theme toggle at the right. On a phone a second
 * band names the page and opens the tab list as a drawer.
 */
export function Masthead({ tab, menuOpen, onMenu, menuRef }: MastheadProps) {
  const now = useSecondClock();
  const group = tab ? groupOf(tab) : null;
  return (
    <header className="masthead">
      <div className="masthead__row">
        <Brand />
        <div className="masthead__end">
          <MarketClock now={now} />
          <GateTag now={now} />
          <ThemeToggle />
        </div>
      </div>
      <div className="masthead__page">
        <button
          ref={menuRef}
          type="button"
          className="page-menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-controls="tab-drawer"
          aria-label={`${tab?.label ?? "Pages"}: open the tab list`}
          onClick={onMenu}
        >
          {group && <span className="page-menu__group">{group.label}</span>}
          <span className="page-menu__label">{tab?.label ?? "Pages"}</span>
          <Glyph name="caret" />
        </button>
        <GateTag now={now} compact />
      </div>
    </header>
  );
}
