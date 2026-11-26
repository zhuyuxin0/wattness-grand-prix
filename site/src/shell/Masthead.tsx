import type { RefObject } from "react";
import { NessButton } from "../ness/Launcher";
import { Glyph } from "../ui/Glyph";
import { ThemeToggle } from "../ui/ThemeToggle";
import { Brand } from "./Brand";
import { MarketClock, useSecondClock } from "./MarketClock";
import { groupOf, type PanelTab } from "./tabs";

interface MastheadProps {
  tab: PanelTab | undefined;
  menuOpen: boolean;
  onMenu: () => void;
  menuRef: RefObject<HTMLButtonElement>;
}

/**
 * wattness.tech's masthead: the lockup and the product name at the left, the market clock after them, Ness and the
 * theme toggle at the right. The clock stays on every tab, as wattness.tech's permanent row keeps it. On a phone a second band
 * names the page, opens the tab list as a drawer, and keeps the phase and the DAM deadline.
 */
export function Masthead({ tab, menuOpen, onMenu, menuRef }: MastheadProps) {
  const now = useSecondClock();
  const group = tab ? groupOf(tab) : null;
  return (
    <header className="masthead">
      <div className="masthead__row">
        <Brand />
        <div className="masthead__clock">
          <MarketClock now={now} />
        </div>
        <div className="masthead__end">
          <NessButton />
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
        <div className="masthead__clock masthead__clock--band">
          <MarketClock now={now} band />
        </div>
      </div>
    </header>
  );
}
