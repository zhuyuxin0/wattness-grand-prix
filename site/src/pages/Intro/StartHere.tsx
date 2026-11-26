import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LogoSpec } from "@world/kit/logos";
import { tabAt } from "../../shell/tabs";
import { Glyph } from "../../ui";
import { LogoChip } from "../../ui/LogoChip";
import { AUDIENCES, SPONSORS, splitTarget, type Role, type RoleLogo } from "./roles";
import "./start-here.css";

// "Start where you are", then "Judging a track?": one entry for each kind of visitor (by name), then one for each
// sponsor (by its logo chip), each a link to the page that answers them first, named after its line. It
// takes the tokens of the ground it sits on: the landing shows it on the night ground under the hero
// (data-atmosphere="dark"), and any page can place it as it is, in the visitor's theme.

type Registry = Record<RoleLogo, LogoSpec>;

/** The logo registry, by dynamic import (the site loads packages/world only so, from a page folder), which brings the
 *  chip's stylesheet too. Null until then; on a failure each entry keeps its name in words. */
function useRegistry(): Registry | null {
  const [logos, setLogos] = useState<Registry | null>(null);
  useEffect(() => {
    let live = true;
    import("@world/kit/logos").then(
      (m) => live && setLogos(m.LOGOS),
      (error: unknown) => console.warn("The logos could not be loaded:", error),
    );
    return () => {
      live = false;
    };
  }, []);
  return logos;
}

interface StartHereProps {
  /** The heading's id, which labels the list; one per page. */
  id?: string;
  className?: string;
}

export function StartHere({ id = "start-here", className }: StartHereProps) {
  const logos = useRegistry();
  return (
    <nav className={`start-here${className ? ` ${className}` : ""}`} aria-labelledby={id}>
      <div className="start-here__grid">
        <div className="start-here__head">
          <h2 id={id} className="start-here__title">
            Start where you are
          </h2>
          <p className="start-here__lede">For each kind of visitor, the page to open first.</p>
        </div>
        {AUDIENCES.map((r) => (
          <Entry key={r.id} role={r} logos={logos} />
        ))}
      </div>
      <div className="start-here__grid start-here__grid--sponsors">
        <div className="start-here__head">
          <h2 id={`${id}-sponsors`} className="start-here__title">
            Judging a track?
          </h2>
          <p className="start-here__lede">Each sponsor's part, where it runs.</p>
        </div>
        {SPONSORS.map((r) => (
          <Entry key={r.id} role={r} logos={logos} />
        ))}
      </div>
    </nav>
  );
}

function Entry({ role, logos }: { role: Role; logos: Registry | null }) {
  const tab = tabAt(splitTarget(role.to).path);
  const chips = logos && role.logos ? role.logos.map((l) => logos[l]) : null;
  return (
    <Link to={role.to} className="start-here__link" data-role={role.id}>
      <span className="start-here__who">
        {chips ? (
          <LogoChip logo={chips.length === 1 ? chips[0]! : chips} size={14} link={false} className="start-here__chip" />
        ) : (
          <span className={`start-here__name${role.logos ? " start-here__name--chip" : ""}`}>{role.name}</span>
        )}
      </span>
      <span className="start-here__line">
        {role.line}
        {/* an en space: wider than a word space, and it hangs at a line's end, so a wrapped name starts flush */}
        {tab && "\u2002"}
        {tab && (
          <span className="start-here__to">
            {tab.label}
            <Glyph name="next" />
          </span>
        )}
      </span>
    </Link>
  );
}
