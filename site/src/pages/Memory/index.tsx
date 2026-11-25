import { useMemo, useState, type ReactNode } from "react";
import { fetchJson, loadBrain, loadTerminalStructure, useLoad, type BrainConnection, type BrainGraph, type BrainPage, type TerminalStructure } from "../../data";
import { formatInt } from "../../lib/format";
import { dualTime } from "../../lib/time";
import type { MemoryGraph } from "../../scenes/data";
import { Glyph, PageHeader, Ready, Section, Stat, StatRow, nextSort, sortRows, type SortKind, type SortState, type SortValue } from "../../ui";
import "./styles.css";

// Memory: what the agents keep about the Wattness Terminal, as Living Brain
// holds it. One page per part of the Terminal, and the connections between
// pages, each with Living Brain's similarity score and its reasoning. Selecting
// a page narrows the connections to its own.

const STRENGTH: Record<string, number> = { strong: 3, medium: 2, weak: 1 };
const STRENGTHS = ["strong", "medium", "weak"] as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The link targets Living Brain lists for a page, without the doubles its readback carries ("fleet" and "fleetfleet"). */
function links(p: BrainPage): string[] {
  const raw = Array.isArray(p.backlinks) ? (p.backlinks as unknown[]).map(String) : [];
  const doubled = (x: string) => raw.some((y) => y !== x && x.startsWith(y) && !x.slice(y.length).startsWith("-") && y.endsWith(x.slice(y.length)));
  return [...new Set(raw.filter((x) => !doubled(x)))];
}
const sourcesOf = (p: BrainPage) => (Array.isArray(p.sources) ? p.sources.length : 0);

interface Ctx {
  brain: BrainGraph;
  parts: Map<string, { layer: number; layerName: string; part: string }>;
}

async function loadMemory(): Promise<Ctx | null> {
  const [brainState, graph, structure] = await Promise.all([
    loadBrain(),
    fetchJson<MemoryGraph>("memory-graph.json").catch(() => null),
    loadTerminalStructure().catch(() => null as TerminalStructure | null),
  ]);
  if (!brainState) return null;
  const nodes = new Map((structure?.nodes ?? []).map((n) => [n.id, n]));
  const parts = new Map<string, { layer: number; layerName: string; part: string }>();
  for (const p of graph?.pages ?? []) {
    const n = p.describes ? nodes.get(p.describes) : undefined;
    if (n) parts.set(p.slug, { layer: n.layer, layerName: n.layerName, part: n.name });
    else if (p.scope === "terminal") parts.set(p.slug, { layer: -1, layerName: "The whole Terminal", part: "Wattness Terminal" });
  }
  return { brain: brainState, parts };
}

export default function MemoryPage() {
  const ctx = useLoad(loadMemory, "memory-tab");
  return (
    <div className="page page--memory">
      <PageHeader
        title="Memory"
        lede="What the agents remember, kept in Living Brain: a page on each part of the Wattness Terminal, where every plan's inputs come from, and the connections between pages, each with the reasoning behind it."
      />
      <Ready state={ctx}>{(c) => (c ? <Memory ctx={c} /> : <p className="muted">The Living Brain readback is not published with this build.</p>)}</Ready>
    </div>
  );
}

interface Col<T> {
  key: string;
  label: ReactNode;
  title?: string;
  kind: SortKind;
  value: (row: T) => SortValue;
  className?: string;
}

function SortHead<T>({ cols, sort, setSort }: { cols: Col<T>[]; sort: SortState | null; setSort: (s: SortState | null) => void }) {
  return (
    <thead>
      <tr>
        {cols.map((c) => {
          const active = sort?.key === c.key;
          return (
            <th key={c.key} scope="col" className={`${c.className ?? ""}${active ? " is-sorted" : ""}`} aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}>
              <button type="button" className="mem-sort" title={c.title} onClick={() => setSort(nextSort(sort, c.key, c.kind))}>
                {c.kind === "number" && <Glyph name={active ? (sort.desc ? "sort-down" : "sort-up") : "dash"} size={11} className="mem-sort__glyph" />}
                <span>{c.label}</span>
                {c.kind !== "number" && <Glyph name={active ? (sort.desc ? "sort-down" : "sort-up") : "dash"} size={11} className="mem-sort__glyph" />}
              </button>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

function Memory({ ctx }: { ctx: Ctx }) {
  const { brain, parts } = ctx;
  const [picked, setPicked] = useState<string | null>(null);
  const [strength, setStrength] = useState<string | null>(null);
  const [pageSort, setPageSort] = useState<SortState | null>(null);
  const [linkSort, setLinkSort] = useState<SortState | null>({ key: "similarity", desc: true });

  const degree = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of brain.connections) {
      m.set(c.pageASlug, (m.get(c.pageASlug) ?? 0) + 1);
      m.set(c.pageBSlug, (m.get(c.pageBSlug) ?? 0) + 1);
    }
    return m;
  }, [brain.connections]);
  const partOf = (p: BrainPage) => parts.get(p.slug);

  // The table's own order: by the Terminal's layer, from its sources to Ness, then by title.
  const ordered = useMemo(
    () => [...brain.pages].sort((a, b) => (partOf(a)?.layer ?? 99) - (partOf(b)?.layer ?? 99) || a.title.localeCompare(b.title, "en-US")),
    // parts is fixed for the page's life.
    [brain.pages],
  );

  const pageCols: Col<BrainPage>[] = [
    { key: "title", label: "Page", kind: "text", value: (p) => p.title, className: "mem-c-page" },
    { key: "part", label: "Part of the Terminal", title: "The layer of the Terminal the page describes", kind: "text", value: (p) => partOf(p)?.layerName ?? null, className: "mem-c-part" },
    { key: "degree", label: "Connections", title: "Connections that touch the page", kind: "number", value: (p) => degree.get(p.slug) ?? 0, className: "r" },
    { key: "links", label: "Cites", title: "Pages and parts of the Terminal its text links to", kind: "number", value: (p) => links(p).length, className: "r mem-wide" },
    { key: "sources", label: "Sources", title: "Source documents Living Brain compiled the page from", kind: "number", value: sourcesOf, className: "r mem-wide" },
  ];
  const pages = useMemo(() => {
    if (!pageSort) return ordered;
    const col = pageCols.find((c) => c.key === pageSort.key);
    return col ? sortRows(ordered, col.value, pageSort.desc) : ordered;
    // pageCols reads only these.
  }, [ordered, pageSort, degree]);

  const linkCols: Col<BrainConnection>[] = [
    { key: "pair", label: "Between", kind: "text", value: (c) => `${c.pageATitle} ${c.pageBTitle}`, className: "mem-c-pair" },
    { key: "strength", label: "Strength", kind: "number", value: (c) => STRENGTH[c.strength ?? ""] ?? null, className: "mem-c-strength" },
    { key: "similarity", label: "Similarity", title: "Living Brain's similarity score for the two pages, 0 to 1", kind: "number", value: (c) => c.similarity ?? null, className: "r" },
    { key: "reasoning", label: "Reasoning", kind: "text", value: (c) => c.reasoning ?? null, className: "mem-c-why" },
  ];
  const pickedPage = picked ? brain.pages.find((p) => p.slug === picked) ?? null : null;
  const touching = (c: BrainConnection) => !picked || c.pageASlug === picked || c.pageBSlug === picked;
  const linkRows = useMemo(() => {
    const list = brain.connections.filter((c) => touching(c) && (!strength || c.strength === strength));
    if (!linkSort) return list;
    const col = linkCols.find((c) => c.key === linkSort.key);
    return col ? sortRows(list, col.value, linkSort.desc) : list;
    // linkCols and touching read only these.
  }, [brain.connections, picked, strength, linkSort]);
  const byStrength = Object.fromEntries(STRENGTHS.map((s) => [s, brain.connections.filter((c) => touching(c) && c.strength === s).length]));
  const inView = brain.connections.filter(touching).length;

  const stats = brain.stats as { sourceCount?: number; lastActivityAt?: string } | null;
  const last = stats?.lastActivityAt ? dualTime(Math.floor(Date.parse(stats.lastActivityAt) / 1000), { seconds: false }) : null;
  const all = brain.connections.length;
  const SOURCE = `Memory: Living Brain ("${brain.brain}"), read back through its API${last ? `; last compiled ${last.ct}` : ""}. Pages compiled from the Wattness Terminal's architecture export. Display: Wattness.`;
  const SHORT = `Memory: Living Brain ("${brain.brain}"). Display: Wattness.`;

  return (
    <>
      <section className="mem-lead" aria-label="The memory at a glance">
        <StatRow className="mem-stats">
          <Stat
            label="Pages"
            value={formatInt(brain.pages.length)}
            note={`${formatInt(brain.pages.filter((p) => (partOf(p)?.layer ?? -1) >= 0).length)} on parts of the Terminal, ${formatInt(
              brain.pages.filter((p) => partOf(p)?.layer === -1).length,
            )} on the whole`}
          />
          <Stat
            label="Connections"
            value={formatInt(all)}
            note={STRENGTHS.map((s) => `${brain.connections.filter((c) => c.strength === s).length} ${s}`).join(" · ")}
          />
          {typeof stats?.sourceCount === "number" && <Stat label="Sources" value={formatInt(stats.sourceCount)} note="documents the pages were compiled from" />}
          {last && <Stat label="Last compiled" value={last.ct} size="sm" note={last.yours ?? "market time"} />}
        </StatRow>
        <p className="mem-source">{SOURCE}</p>
      </section>

      <Section
        id="mem-pages"
        title="Pages"
        lede="By the part of the Terminal each describes, from its data sources to Ness. Pick a page to see its connections."
        source={SHORT}
      >
        <div className="mem-table" role="region" aria-label="Pages">
          <table>
            <SortHead cols={pageCols} sort={pageSort} setSort={setPageSort} />
            <tbody>
              {pages.map((p) => {
                const on = picked === p.slug;
                const part = partOf(p);
                const l = links(p);
                return (
                  <tr
                    key={p.id}
                    className={`mem-row${on ? " is-on" : ""}`}
                    tabIndex={0}
                    aria-pressed={on}
                    onClick={() => setPicked(on ? null : p.slug)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setPicked(on ? null : p.slug);
                      }
                    }}
                  >
                    <td className="mem-c-page">
                      <span className="mem-title">{p.title}</span>
                      {p.summary && <span className="mem-text">{p.summary}</span>}
                    </td>
                    <td className="mem-c-part">
                      {part ? (
                        <>
                          {part.layerName}
                          {part.layer >= 0 && <span className="mem-sub">{part.part}</span>}
                        </>
                      ) : (
                        <span className="muted">not placed</span>
                      )}
                    </td>
                    <td className="r num mem-c-degree">
                      {formatInt(degree.get(p.slug) ?? 0)}
                      <span className="mem-phone"> connections</span>
                    </td>
                    <td className="r num mem-wide" title={l.join(", ")}>
                      {formatInt(l.length)}
                    </td>
                    <td className="r num mem-wide">{formatInt(sourcesOf(p))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="mem-links"
        title={pickedPage ? `Connections of ${pickedPage.title}` : "Connections"}
        lede={
          pickedPage ? (
            <>
              {formatInt(inView)} of the {formatInt(all)} connections touch this page.{" "}
              {links(pickedPage).length > 0 && (
                <>
                  Its text cites{" "}
                  {links(pickedPage).map((l, i, list) => (
                    <span key={l}>
                      <code>{l}</code>
                      {i < list.length - 2 ? ", " : i === list.length - 2 ? " and " : ". "}
                    </span>
                  ))}
                </>
              )}
              <button type="button" className="mem-clear" onClick={() => setPicked(null)}>
                Show all {formatInt(all)}
              </button>
            </>
          ) : (
            "Each pair of pages Living Brain connected, with its strength, its similarity score and the reasoning it gives."
          )
        }
        actions={
          <div className="seg" role="group" aria-label="Strength">
            <button type="button" aria-pressed={strength === null} onClick={() => setStrength(null)}>
              All <span className="mem-n num">{formatInt(inView)}</span>
            </button>
            {STRENGTHS.map((s) => (
              <button key={s} type="button" aria-pressed={strength === s} onClick={() => setStrength(strength === s ? null : s)}>
                {cap(s)} <span className="mem-n num">{formatInt(byStrength[s] ?? 0)}</span>
              </button>
            ))}
          </div>
        }
        source={SHORT}
      >
        <div className="mem-table" role="region" aria-label="Connections">
          <table>
            <SortHead cols={linkCols} sort={linkSort} setSort={setLinkSort} />
            <tbody>
              {linkRows.length === 0 && (
                <tr>
                  <td colSpan={linkCols.length} className="mem-empty">
                    No {strength ?? ""} connection touches this page.
                  </td>
                </tr>
              )}
              {linkRows.map((c) => (
                <tr key={c.id}>
                  <td className="mem-c-pair">
                    <span className="mem-title">{c.pageATitle}</span>
                    <span className="mem-sub">and {c.pageBTitle}</span>
                  </td>
                  <td className="mem-c-strength">
                    <span className={`mem-strength mem-strength--${c.strength ?? "none"}`}>
                      <i aria-hidden="true" />
                      <i aria-hidden="true" />
                      <i aria-hidden="true" />
                      {c.strength ? cap(c.strength) : "no value"}
                    </span>
                  </td>
                  <td className="r num">{typeof c.similarity === "number" ? c.similarity.toFixed(2) : <span className="muted">no value</span>}</td>
                  <td className="mem-c-why">
                    <span className="mem-text mem-text--ink">{c.reasoning ?? "no reasoning given"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
