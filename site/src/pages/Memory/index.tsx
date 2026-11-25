import { formatInt } from "../../lib/format";
import { useBrain, type BrainConnection, type BrainPage } from "../../data";
import { PageHeader, Ready, Section, Stat, StatRow, Table, type Column } from "../../ui";
import "./styles.css";

// Memory: what the agents can recall, as Living Brain holds it. Its pages,
// the connections between them and the reasoning it gives for each, and the
// pages that cite one another.

const STRENGTH: Record<string, number> = { strong: 3, medium: 2, weak: 1 };

const SOURCE = "Memory: Living Brain, read back through its API. Display: Wattness.";

export default function MemoryPage() {
  const brain = useBrain();
  return (
    <div className="page page--memory">
      <PageHeader
        title="Memory"
        lede="The agents keep what they know about the Wattness Terminal in Living Brain: one page per part, and connections between pages, each with the reasoning that links them."
      />
      <Ready state={brain}>
        {(b) => {
          if (!b) return <p className="muted">The Living Brain readback is not published with this build.</p>;
          const cites = (p: BrainPage) => listOf(p.backlinks).length;
          const pageCols: Column<BrainPage>[] = [
            { key: "title", label: "Page", kind: "text", value: (p) => p.title, render: (p) => <span className="mem-title">{p.title}</span> },
            { key: "summary", label: "Summary", kind: "text", sortable: false, value: (p) => p.summary ?? null, render: (p) => <span className="mem-text">{p.summary ?? "no summary"}</span> },
            { key: "cites", label: "Cited by", title: "Pages that link to this one", kind: "number", value: cites, render: (p) => formatInt(cites(p)) },
          ];
          const linkCols: Column<BrainConnection>[] = [
            { key: "pair", label: "Between", kind: "text", value: (c) => `${c.pageATitle} ${c.pageBTitle}`, render: (c) => <span className="mem-title">{c.pageATitle} and {c.pageBTitle}</span> },
            { key: "strength", label: "Strength", kind: "number", value: (c) => STRENGTH[c.strength ?? ""] ?? null, render: (c) => c.strength ?? "no value" },
            { key: "reasoning", label: "Reasoning", kind: "text", sortable: false, value: (c) => c.reasoning ?? null, render: (c) => <span className="mem-text">{c.reasoning ?? "no reasoning given"}</span> },
          ];
          return (
            <>
              <Section title="At a glance" source={SOURCE}>
                <StatRow>
                  <Stat label="Pages" value={formatInt(b.pages.length)} note={b.brain} />
                  <Stat label="Connections" value={formatInt(b.connections.length)} note="each with its reasoning" />
                  <Stat label="Citations" value={formatInt(b.pages.reduce((s, p) => s + cites(p), 0))} note="links from one page to another" />
                </StatRow>
              </Section>
              <Section title="Pages" source={SOURCE}>
                <Table columns={pageCols} rows={b.pages} rowKey={(p) => p.id} initialSort={{ key: "cites", desc: true }} className="mem-table" />
              </Section>
              <Section title="Connections" source={SOURCE}>
                <Table columns={linkCols} rows={b.connections} rowKey={(c) => c.id} initialSort={{ key: "strength", desc: true }} className="mem-table" />
              </Section>
            </>
          );
        }}
      </Ready>
    </div>
  );
}

/** A field the readback may hold as a list or as its printed form. */
function listOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.startsWith("[")) return [...v.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  return [];
}
