import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { RelatedStrip } from "../shell/RelatedStrip";
import { groupOf, tabAt } from "../shell/tabs";

interface PageHeaderProps {
  title: ReactNode;
  lede?: ReactNode;
  /** The eyebrow over the title; the tab's group by default. */
  kicker?: string;
  /** The Grand Prix's word for the page, as one short note; the tab's own by default, or false for none. */
  term?: string | false;
  /** Right column: a status, a count, a control. */
  aside?: ReactNode;
  className?: string;
}

/** A page's head: its group, its title in the brand face, one plain lede, and the tabs it leads to. */
export function PageHeader({ title, lede, kicker, term, aside, className }: PageHeaderProps) {
  const tab = tabAt(useLocation().pathname);
  const eyebrow = kicker ?? (tab ? groupOf(tab)?.label : undefined);
  const word = term === false ? undefined : (term ?? tab?.term);
  return (
    <header className={`page-header${className ? ` ${className}` : ""}`}>
      <div className="page-header__text">
        {eyebrow && <div className="page-header__eyebrow">{eyebrow}</div>}
        <h1 className="page-header__title">{title}</h1>
        {lede && <p className="page-header__lede">{lede}</p>}
        {word && <p className="page-header__term">In racing terms, {word}.</p>}
        <RelatedStrip tabId={tab?.id} />
      </div>
      {aside && <div className="page-header__aside">{aside}</div>}
    </header>
  );
}
