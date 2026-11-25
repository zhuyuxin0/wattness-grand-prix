import type { ReactNode } from "react";

interface PageHeaderProps {
  /** The race-weekend term, e.g. "Stewards". */
  kicker: string;
  title: ReactNode;
  lede?: ReactNode;
  /** Right column: a badge, a countdown, a receipt summary. */
  aside?: ReactNode;
  className?: string;
}

export function PageHeader({ kicker, title, lede, aside, className }: PageHeaderProps) {
  return (
    <header className={`page-header${className ? ` ${className}` : ""}`}>
      <div className="page-header__text">
        <div className="page-header__kicker">{kicker}</div>
        <h1 className="page-header__title">{title}</h1>
        {lede && <p className="page-header__lede">{lede}</p>}
      </div>
      {aside && <div className="page-header__aside">{aside}</div>}
    </header>
  );
}
