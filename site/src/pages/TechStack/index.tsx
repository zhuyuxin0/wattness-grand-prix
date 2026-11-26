import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Part, Row } from "@world/stations/stack/pieces";
import { SOURCE_LINE } from "../../config";
import { dualTime } from "../../lib/time";
import { useSelectedBattery } from "../../shell/battery";
import { TABS, worldTab } from "../../shell/tabs";
import { worldPath } from "../../shell/world";
import { Glyph, PageHeader, Ready, Section } from "../../ui";
import { useStackList, type PieceItem, type StackList, type Zone } from "./list";
import { StackStage } from "./Stage";
import "./styles.css";

// Tech Stack: what the Grand Prix is built from. Its map is mountStack from
// packages/world, loaded with a dynamic import in this tab only, so the other
// tabs stay light. Under it, every piece in plain words, in the stack's own
// (each card's role and records), with the tab that shows it, so the stack
// reads in full without the 3D.

const tab = TABS.find((t) => t.id === "stack");

/** Whether the page is wide enough to show each piece's records open; a phone folds them under one line. */
function useRoomy(query = "(min-width: 600px)"): boolean {
  const [roomy, setRoomy] = useState(() => typeof window === "undefined" || window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setRoomy(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return roomy;
}

export default function TechStackPage() {
  const state = useStackList();
  const roomy = useRoomy();
  // Battery tabs open on the carried battery, so their links follow a new pick.
  useSelectedBattery();

  return (
    <div className="page page--stack">
      <PageHeader title="Tech Stack" lede={tab?.summary} />
      <StackStage />
      <Ready state={state} label="Loading the pieces">
        {(list) => (
          <>
            {list.zones.map((zone) => (
              <ZoneSection key={zone.id} zone={zone} full={list.full} roomy={roomy} />
            ))}
            <Source list={list} />
          </>
        )}
      </Ready>
    </div>
  );
}

function ZoneSection({ zone, full, roomy }: { zone: Zone; full: boolean; roomy: boolean }) {
  const prices = zone.pieces.some((p) => p.id === "atlas" || p.id === "cmc");
  return (
    <Section id={`stack-${zone.id}`} title={zone.title} lede={zone.lede || undefined}>
      <ol className={`stack-list${full ? "" : " stack-list--names"}`}>
        <li className="stack-row stack-row--head" aria-hidden="true">
          <span>Piece</span>
          {full && <span>What it does</span>}
          {full && <span>In this build</span>}
          <span>See it in</span>
        </li>
        {zone.pieces.map((p) => (
          <PieceRow key={p.id} piece={p} full={full} roomy={roomy} />
        ))}
      </ol>
      {prices && full && <p className="stack-note">A token's price says nothing about an agent's plans.</p>}
    </Section>
  );
}

function PieceRow({ piece: p, full, roomy }: { piece: PieceItem; full: boolean; roomy: boolean }) {
  const t = worldTab(p.route);
  const to = worldPath(p.route);
  return (
    <li className="stack-row" id={`piece-${p.id}`}>
      <div className="stack-row__piece">
        <h3 className="stack-row__plain">{p.plain}</h3>
        {p.name && <p className="stack-row__name">{p.name}</p>}
      </div>
      {full && <p className="stack-row__role">{p.role}</p>}
      {full &&
        (roomy ? (
          <Rows rows={p.rows} link={p.link} />
        ) : (
          <details className="stack-row__more">
            <summary>
              <Glyph name="caret" className="stack-row__caret" />
              In this build
            </summary>
            <Rows rows={p.rows} link={p.link} />
          </details>
        ))}
      <div className="stack-row__tab" data-label="See it in">
        {t && to ? (
          <Link to={to} className="stack-row__go">
            {t.label}
            <Glyph name="next" />
          </Link>
        ) : null}
      </div>
    </li>
  );
}

/** A card's rows: what the piece is in this build, with its contracts, transactions and endpoints linked. */
function Rows({ rows, link }: { rows: Row[]; link?: { text: string; href: string } }) {
  return (
    <dl className="stack-row__rows">
      {rows.map(([label, parts]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {parts.map((part, i) => (
              <PartView key={i} part={part} />
            ))}
          </dd>
        </div>
      ))}
      {link && (
        <div>
          <dt>Link</dt>
          <dd>
            <a href={link.href} target="_blank" rel="noreferrer" className="stack-out">
              {link.text}
              <Glyph name="popout" />
            </a>
          </dd>
        </div>
      )}
    </dl>
  );
}

/** One part of a card's value, as the card prints it: plain, monospace, linked out, or on its own line. */
function PartView({ part }: { part: Part }) {
  const body = part.mono ? <span className="mono">{part.t}</span> : part.t;
  const shown = part.href ? (
    <a href={part.href} target="_blank" rel="noreferrer" className="stack-out">
      {body}
      <Glyph name="popout" />
    </a>
  ) : (
    body
  );
  return part.block ? <span className="stack-part--block">{shown}</span> : <>{shown}</>;
}

function Source({ list }: { list: StackList }) {
  const rb = list.full ? list.readBack : null;
  const t = rb ? dualTime(rb.unix, { seconds: false }) : null;
  return (
    <p className="stack-source">
      {SOURCE_LINE} {list.full ? "Words and records: the stack's own cards." : "Names: the stack's own labels."}
      {rb && t ? (
        <>
          {" "}
          The BSC testnet transactions named here were read back on a public node, <span className="mono">{rb.rpc.replace(/^https:\/\//, "")}</span>, at{" "}
          <span className="num">{t.ct}</span>
          {t.yours ? <> ({t.yours})</> : null}.
        </>
      ) : null}
    </p>
  );
}
