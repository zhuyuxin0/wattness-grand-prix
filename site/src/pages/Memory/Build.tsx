import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { formatInt } from "../../lib/format";
import { dualTime } from "../../lib/time";
import { panelSections } from "../../shell/tabs";
import { Section, Stat, StatRow } from "../../ui";
import { pageKey, type BuildBrain, type BuildConnection, type BuildPage } from "./data";
import { readSelection, selectedKey, selectionOf, writeSelection } from "./select";

// The build's own brain: every tab of this site and the page Living Brain keeps
// on it (or the nearest page it has, or the page the tab is a section of), and
// one page at a time with its connections, in this brain and across
// the brains Living Brain combines. Living Brain's text stays as it wrote it;
// a correction stands beside any summary or reasoning that misstates the
// repository or the chain record.
//
// ?tab=<id> names the tab the visitor came from (the quiet line at each tab's
// foot links here) and opens its page; ?brain=<brain>&page=<slug> opens any
// page (select.ts: the 3D stage over it reads and writes the same two), and
// picking another tab's row only changes those.

const STRENGTHS = ["strong", "medium", "weak"] as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const STRENGTH: Record<string, number> = { strong: 3, medium: 2, weak: 1 };

function Strength({ s }: { s: string }) {
  return (
    <span className={`mem-strength mem-strength--${s}`}>
      <i aria-hidden="true" />
      <i aria-hidden="true" />
      <i aria-hidden="true" />
      {cap(s)}
    </span>
  );
}

/** Living Brain's text, and the correction beside it when there is one. */
function Said({ text, correction, className }: { text: string; correction?: string; className?: string }) {
  return (
    <div className={`mem-said${correction ? " mem-said--fixed" : ""}${className ? ` ${className}` : ""}`}>
      <p className="mem-said__text">{text}</p>
      {correction && (
        <p className="mem-said__fix">
          <span className="mem-said__label">Correction</span>
          {correction}
        </p>
      )}
    </div>
  );
}

export function Build({ b }: { b: BuildBrain }) {
  const [params, setParams] = useSearchParams();
  const pages = useMemo(() => new Map(b.pages.map((p) => [pageKey(p.brain, p.slug), p])), [b]);
  const brainName = useMemo(() => new Map(b.brains.map((x) => [x.id, x.name])), [b]);
  const sections = useMemo(() => panelSections(), []);
  const asked = params.get("tab");
  const here = asked && b.tabs[asked] ? asked : "memory";
  const pick = selectedKey(readSelection(params));
  const selected = (pick && pages.get(pick)) || pages.get(pageKey("grand-prix", b.tabs[here]?.page ?? "memory-tab")) || b.pages[0]!;
  const pageRef = useRef<HTMLDivElement>(null);

  // Arriving from a tab's foot: open its page in view, once the layout has scrolled to the top.
  useEffect(() => {
    if (!asked || asked === "memory") return;
    const t = window.setTimeout(() => pageRef.current?.scrollIntoView({ block: "start" }), 60);
    return () => window.clearTimeout(t);
  }, [asked]);

  const openPage = (key: string) => {
    setParams(writeSelection(params, selectionOf(key)), { replace: true });
    pageRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const read = dualTime(b.brain.readAtUnix, { seconds: false });
  const terminal = b.brains.find((x) => x.id === "terminal");
  const SHORT = `Memory: Living Brain ("${b.brain.name}"), read back through its API. Summaries and reasoning are Living Brain's; corrections checked against the repository and the chain record. Display: Wattness.`;

  return (
    <>
      <section className="mem-lead" aria-label="The memory at a glance">
        <StatRow className="mem-stats">
          <Stat label="The build's brain" value={formatInt(b.brain.pages)} unit=" pages" note={`${formatInt(b.brain.connections)} connections: ${STRENGTHS.map((s) => `${b.brain.byStrength[s] ?? 0} ${s}`).join(" · ")}`} />
          {terminal && <Stat label="The Terminal's brain" value={formatInt(terminal.pages)} unit=" pages" note={`${formatInt(terminal.connections)} connections, "${terminal.name}"`} />}
          <Stat label="Across brains" value={formatInt(b.combined.crossBrainConnections)} unit=" links" note={`in "${b.combined.name}", ${formatInt(b.combined.pages)} pages in all`} />
          <Stat label="Pages read back" value={read.ct} size="sm" note={read.yours ?? "market time"} />
        </StatRow>
        <p className="mem-source">
          {b.brain.description} Compiled by Living Brain from {formatInt(b.brain.notes.compiled)} short notes on the build. {SHORT}
        </p>
      </section>

      <Section id="mem-tabs" title="Every Tab's Page" lede="Each tab of this site and the page Living Brain keeps on it, or the nearest page it has. Pick one to open the page and its connections." source={SHORT}>
        <div className="mem-tabs">
          {sections.map((sec) => (
            <div key={sec.group?.id ?? "start"} className="mem-tabs__group">
              {sec.group && <h3 className="mem-tabs__name">{sec.group.label}</h3>}
              <ol className="mem-tabs__list">
                {sec.tabs.map((t) => {
                  const entry = b.tabs[t.id];
                  const page = entry ? pages.get(pageKey("grand-prix", entry.page)) : undefined;
                  if (!page) return null;
                  const on = selected === page;
                  return (
                    <li key={t.id} className={`mem-tab${t.id === here ? " is-here" : ""}${on ? " is-on" : ""}`}>
                      <div className="mem-tab__tab">
                        <Link className="mem-tab__link" to={t.path}>
                          {t.label}
                        </Link>
                        {t.id === here && <span className="mem-here">You are here</span>}
                      </div>
                      <button
                        type="button"
                        className="mem-tab__page"
                        aria-pressed={on}
                        aria-label={`${page.title}: ${formatInt(page.connections)} connections`}
                        onClick={() => openPage(pageKey(page.brain, page.slug))}
                      >
                        <span className="mem-title">{page.title}</span>
                        <span className="mem-sub num">{formatInt(page.connections)} connections</span>
                      </button>
                      <Said text={page.summary} correction={page.correction} className="mem-tab__said" />
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      </Section>

      <div ref={pageRef} className="mem-anchor">
        <PageView b={b} page={selected} pages={pages} brainName={brainName} openPage={openPage} source={SHORT} />
      </div>

      <FindPage b={b} brainName={brainName} openPage={openPage} />
    </>
  );
}

function PageView({
  b,
  page,
  pages,
  brainName,
  openPage,
  source,
}: {
  b: BuildBrain;
  page: BuildPage;
  pages: Map<string, BuildPage>;
  brainName: Map<string, string>;
  openPage: (key: string) => void;
  source: string;
}) {
  const [strength, setStrength] = useState<string | null>(null);
  const key = pageKey(page.brain, page.slug);
  useEffect(() => setStrength(null), [key]);
  const links = useMemo(
    () =>
      b.connections
        .filter((c) => pageKey(c.aBrain, c.a) === key || pageKey(c.bBrain, c.b) === key)
        .sort((x, y) => (STRENGTH[y.strength] ?? 0) - (STRENGTH[x.strength] ?? 0) || y.similarity - x.similarity),
    [b, key],
  );
  const shown = strength ? links.filter((c) => c.strength === strength) : links;
  const across = links.filter((c) => c.aBrain !== c.bBrain).length;
  const tabs = Object.entries(b.tabs).filter(([, t]) => page.brain === "grand-prix" && t.page === page.slug);
  const also = [...new Set(tabs.flatMap(([, t]) => t.also))].map((s) => pages.get(pageKey("grand-prix", s))).filter((p): p is BuildPage => !!p);
  const labels = panelSections().flatMap((s) => s.tabs);
  const nameOf = (id: string) => labels.find((t) => t.id === id)?.label;
  // the tabs this page is the brain's own page for, the nearest page for (the brain has none of their own), and the
  // tabs that are a section of it (build-brain.json tabs[id].relation)
  const named = (rel: string) => tabs.filter(([, t]) => t.relation === rel).map(([id]) => nameOf(id)).filter(Boolean) as string[];
  const own = named("own"), nearest = named("nearest");
  const sections = tabs.filter(([, t]) => t.relation === "related").flatMap(([id, t]) => (nameOf(id) ? [{ label: nameOf(id)!, section: t.section }] : []));
  const theTabs = (names: string[]) => (names.length === 1 ? `the ${names[0]} tab` : `the ${names.join(" and ")} tabs`);

  return (
    <Section
      id="mem-page"
      kicker={`A page in "${brainName.get(page.brain) ?? page.brain}"`}
      title={page.title}
      lede={
        <>
          {own.length > 0 && <>The page for {theTabs(own)}. </>}
          {nearest.length > 0 && <>The nearest page to {theTabs(nearest)}: the brain has none of {nearest.length === 1 ? "its" : "their"} own. </>}
          {sections.map((x) => (
            <span key={x.label}>The {x.label} tab is {x.section ? `its section "${x.section}"` : "a section of it"}. </span>
          ))}
          {formatInt(links.length)} connection{links.length === 1 ? "" : "s"}
          {across ? `, ${formatInt(across)} of them to another brain` : ""}.
        </>
      }
      actions={
        links.length > 0 && (
          <div className="seg" role="group" aria-label="Strength">
            <button type="button" aria-pressed={strength === null} onClick={() => setStrength(null)}>
              All <span className="mem-n num">{formatInt(links.length)}</span>
            </button>
            {STRENGTHS.map((s) => (
              <button key={s} type="button" aria-pressed={strength === s} onClick={() => setStrength(strength === s ? null : s)}>
                {cap(s)} <span className="mem-n num">{formatInt(links.filter((c) => c.strength === s).length)}</span>
              </button>
            ))}
          </div>
        )
      }
      source={source}
    >
      <Said text={page.summary} correction={page.correction} className="mem-said--lead" />
      {also.length > 0 && (
        <p className="mem-also">
          <span className="mem-also__label">Related pages</span>
          {also.map((p) => (
            <button key={p.slug} type="button" className="mem-chip" onClick={() => openPage(pageKey(p.brain, p.slug))}>
              {p.title}
            </button>
          ))}
        </p>
      )}
      <ol className="mem-links">
        {shown.map((c) => (
          <LinkRow key={`${c.aBrain}:${c.a}|${c.bBrain}:${c.b}`} c={c} self={key} pages={pages} brainName={brainName} openPage={openPage} />
        ))}
        {shown.length === 0 && <li className="mem-empty">No {strength ?? ""} connection touches this page.</li>}
      </ol>
    </Section>
  );
}

function LinkRow({
  c,
  self,
  pages,
  brainName,
  openPage,
}: {
  c: BuildConnection;
  self: string;
  pages: Map<string, BuildPage>;
  brainName: Map<string, string>;
  openPage: (key: string) => void;
}) {
  const aKey = pageKey(c.aBrain, c.a);
  const otherKey = aKey === self ? pageKey(c.bBrain, c.b) : aKey;
  const other = pages.get(otherKey);
  const otherBrain = aKey === self ? c.bBrain : c.aBrain;
  const selfBrain = aKey === self ? c.aBrain : c.bBrain;
  return (
    <li className="mem-link">
      <div className="mem-link__head">
        <button type="button" className="mem-link__other" onClick={() => openPage(otherKey)}>
          {other?.title ?? otherKey}
        </button>
        {otherBrain !== selfBrain && <span className="mem-brain">in "{brainName.get(otherBrain) ?? otherBrain}"</span>}
        <span className="mem-link__meta">
          <Strength s={c.strength} />
          <span className="num" title="Living Brain's similarity score, 0 to 1">
            {c.similarity.toFixed(2)}
          </span>
        </span>
      </div>
      <Said text={c.reasoning} correction={c.correction} />
      {c.conflict && <p className="mem-conflict">Living Brain flags a conflict between the two: "{c.conflict}"</p>}
    </li>
  );
}

function FindPage({ b, brainName, openPage }: { b: BuildBrain; brainName: Map<string, string>; openPage: (key: string) => void }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return b.pages.filter((p) => p.title.toLowerCase().includes(s) || p.slug.includes(s)).slice(0, 16);
  }, [b, q]);
  return (
    <Section id="mem-find" title="Any Page" lede={`Find any of the ${formatInt(b.pages.length)} pages across the three brains by its title.`}>
      <label className="mem-find">
        <span className="visually-hidden">Find a page</span>
        <input type="search" value={q} placeholder="GateRecord, Hedger, Season" spellCheck={false} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
      </label>
      {hits.length > 0 && (
        <p className="mem-also">
          {hits.map((p) => (
            <button key={pageKey(p.brain, p.slug)} type="button" className="mem-chip" onClick={() => openPage(pageKey(p.brain, p.slug))}>
              {p.title}
              {p.brain !== "grand-prix" && <span className="mem-brain"> · {brainName.get(p.brain) ?? p.brain}</span>}
            </button>
          ))}
        </p>
      )}
    </Section>
  );
}
