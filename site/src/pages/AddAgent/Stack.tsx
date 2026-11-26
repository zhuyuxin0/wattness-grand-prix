import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LogoId, LogoSpec } from "@world/kit/logos";
import { TABS } from "../../shell/tabs";
import { Glyph, Section } from "../../ui";
import { LogoChip } from "../../ui/LogoChip";
import { PIECES, type StackChip, type StackSee, type StackText } from "./pieces";

// The stack an outside agent plugs into (pieces.ts): one row a piece, its owners' logo chips from the world package's
// registry (packages/world/src/kit/logos, loaded as ui/LogoChip.tsx documents) and a link to where the site shows it
// working.

type Logos = { list: Record<LogoId, LogoSpec>; note: string };

/** The registry by dynamic import (the site loads the world package only so), which also brings the chip's stylesheet;
 *  null until then, and on a failure each piece keeps its owners' names in words. */
function useLogos(): Logos | null {
  const [logos, setLogos] = useState<Logos | null>(null);
  useEffect(() => {
    let live = true;
    import("@world/kit/logos").then(
      (m) => live && setLogos({ list: m.LOGOS, note: m.LOGO_NOTE }),
      (error: unknown) => console.warn("The logos could not be loaded:", error),
    );
    return () => {
      live = false;
    };
  }, []);
  return logos;
}

export function Stack() {
  const logos = useLogos();
  return (
    <Section
      id="ag-stack"
      title="The Stack Your Agent Plugs Into"
      lede="The pieces the Grand Prix's agents are built on, from an identity to a check at the edge, each linked to where this site shows it working."
      actions={<SeeLink see={{ tab: "stack" }} />}
      source={`Display: Wattness.${logos ? ` ${logos.note}` : ""}`}
    >
      <ol className="ag-stack">
        {PIECES.map((p) => (
          <li key={p.id} className="ag-stack__row" data-piece={p.id}>
            <div className="ag-stack__piece">
              <h3>{p.name}</h3>
              <div className="ag-stack__chips">
                {p.chips.map((c) => (
                  <Chips key={c.ids.join("+")} chip={c} logos={logos} />
                ))}
              </div>
            </div>
            <p className="ag-stack__text">
              <Words text={p.text} />
            </p>
            <div className="ag-stack__see">
              {p.see.map((s) => (
                <SeeLink key={"tab" in s ? s.tab : s.section} see={s} />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Words({ text }: { text: StackText }) {
  return (
    <>
      {text.map((part, i) => (typeof part === "string" ? <span key={i}>{part}</span> : <code key={i}>{part.code}</code>))}
    </>
  );
}

function Chips({ chip, logos }: { chip: StackChip; logos: Logos | null }) {
  const specs = logos ? chip.ids.map((id) => logos.list[id]).filter((s): s is LogoSpec => !!s) : [];
  if (specs.length !== chip.ids.length) return <span className="ag-stack__words">{chip.words}</span>;
  return <LogoChip logo={specs.length === 1 ? specs[0]! : specs} caption={chip.caption} size={14} />;
}

function SeeLink({ see }: { see: StackSee }) {
  if ("section" in see) {
    return (
      <a href={`#${see.section}`} className="ag-stack__go">
        {see.label}
        <Glyph name="down" />
      </a>
    );
  }
  const tab = TABS.find((t) => t.id === see.tab);
  if (!tab) return null;
  return (
    <Link to={tab.path} className="ag-stack__go">
      {tab.label}
      <Glyph name="next" />
    </Link>
  );
}
