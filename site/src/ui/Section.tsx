import type { ReactNode } from "react";
import { SOURCE_LINE } from "../config";
import { BuiltWith, type BuiltWithEntry } from "./BuiltWith";
import { CheckIt, type CheckItProps } from "./CheckIt";

interface SectionProps {
  id?: string;
  /** Small caps line above the title: the term of the race weekend. */
  kicker?: string;
  title?: ReactNode;
  lede?: ReactNode;
  /** Right-aligned controls beside the title. */
  actions?: ReactNode;
  /**
   * The sponsors whose technology the section uses: a "Built with" row of their logo chips, the head's first row.
   * Null while the page loads the registry (src/pages/TechStack/sponsors.ts).
   */
  builtWith?: readonly BuiltWithEntry[] | null;
  /**
   * The hashes, addresses and transactions behind the section, folded into one "Check it" line under the content
   * in place of rows of them in the body. Every item stays in the list, whole and copyable.
   */
  check?: CheckItProps | null;
  /**
   * The figure's scope and source, shown under the content. Pass `true` for the
   * default source line alone.
   */
  source?: ReactNode | true;
  /** Flush drops the panel surface for full-bleed content (a scene, a map). */
  variant?: "plain" | "panel" | "flush";
  children?: ReactNode;
  className?: string;
}

export function Section({ id, kicker, title, lede, actions, builtWith, check, source, variant = "plain", children, className }: SectionProps) {
  const built = builtWith && builtWith.length > 0;
  const head = kicker || title || lede || actions || built;
  return (
    <section id={id} className={`section section--${variant}${className ? ` ${className}` : ""}`} aria-labelledby={id && title ? `${id}-title` : undefined}>
      {head && (
        <header className="section__head">
          <div className="section__titles">
            {built && <BuiltWith logos={builtWith} />}
            {kicker && <div className="section__kicker">{kicker}</div>}
            {title && (
              <h2 className="section__title" id={id ? `${id}-title` : undefined}>
                {title}
              </h2>
            )}
            {lede && <p className="section__lede">{lede}</p>}
          </div>
          {actions && <div className="section__actions">{actions}</div>}
        </header>
      )}
      <div className="section__body">{children}</div>
      {check && <CheckIt {...check} id={check.id ?? (id ? `${id}-check` : undefined)} />}
      {source && <p className="section__source">{source === true ? SOURCE_LINE : source}</p>}
    </section>
  );
}
