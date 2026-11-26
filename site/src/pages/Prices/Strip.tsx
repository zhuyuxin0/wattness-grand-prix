import type { MouseEvent, ReactNode } from "react";
import type { LogoSpec } from "@world/kit/logos";
import { TEXAS_BOARD, TEXAS_FEEDS, boardRowId } from "../../components/atlas/atlas";
import { companyChip } from "../../components/atlas/TexasPowerBoard";
import { jumpTo } from "../../lib/follow-hash";
import { LogoChip, type ChipLogo } from "../../ui/LogoChip";
import { SOURCE_COLUMN } from "./places";

// The strip under the page's head: the four companies' chips and the two price sources', each a jump to its row or
// its column below. The owners' own sites stay where the page already links them: each chip in the side-by-side
// columns and on the board opens its owner in a new tab. Until the logo chip's stylesheet is in (it comes with the
// registry), the strip keeps the names in words, at the same height.

function Jump({ id, near, label, logo, name }: { id: string; near: string; label: string; logo: ChipLogo | null; name: string }) {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    jumpTo(id, near);
  };
  return (
    <a className="px-strip__jump" href={`#${id}`} onClick={go} aria-label={label} title={label}>
      {logo ? <LogoChip logo={logo} size={13} link={false} className="px-strip__chip" /> : <span className="px-strip__word">{name}</span>}
    </a>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-strip__group">
      <span className="px-strip__label">{label}</span>
      <span className="px-strip__chips">{children}</span>
    </div>
  );
}

/** logos: the registry's Atlas and CoinMarketCap, once it is in (null until then). */
export function Strip({ logos }: { logos: { atlas: LogoSpec; cmc: LogoSpec } | null }) {
  return (
    <nav className="px-strip" aria-label="On this page: the four companies and the price sources">
      <Group label="Texas power on BNB Chain">
        {TEXAS_FEEDS.map((feed) => (
          <Jump
            key={feed.id}
            id={boardRowId(TEXAS_BOARD, feed)}
            near={TEXAS_BOARD}
            label={`${feed.company} (${feed.symbol}): its row below`}
            logo={logos ? companyChip(feed) : null}
            name={feed.company}
          />
        ))}
      </Group>
      <Group label="BNB and USDT from">
        <Jump id={SOURCE_COLUMN.atlas} near="px-sources" label="Atlas: its column below" logo={logos?.atlas ?? null} name="Atlas" />
        <Jump id={SOURCE_COLUMN.cmc} near="px-sources" label="CoinMarketCap: its column below" logo={logos?.cmc ?? null} name="CoinMarketCap" />
      </Group>
    </nav>
  );
}
