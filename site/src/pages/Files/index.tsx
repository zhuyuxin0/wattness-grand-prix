import { useMemo, useState } from "react";
import { formatInt } from "../../lib/format";
import { EDGE_HOST, edgeVerifyUrl } from "../../lib/edge";
import { dualTime, formatOperatingDay } from "../../lib/time";
import { useSelectedBattery } from "../../shell/battery";
import { BATTERY_NAMES, Glyph, PageHeader, Ready, Section, Stat, StatRow, nextSort, sortRows, type CheckItem, type SortKind, type SortState, type SortValue } from "../../ui";
import { sponsors, useLogoRegistry } from "../TechStack/sponsors";
import { useGreenfield, type GreenfieldIndex } from "./data";
import "./styles.css";

// Files: the sealed day as stored on BNB Greenfield. Every object with its
// size, its SHA-256 as uploaded and read back, and the address anyone can
// fetch it from.

type File = GreenfieldIndex["files"][number];

const RECORD_KINDS = new Set(["index", "root", "salt", "receipt", "outside-input"]);
const KINDS: { id: string; label: string; match: (f: File) => boolean }[] = [
  { id: "record", label: "Record", match: (f) => RECORD_KINDS.has(f.kind) },
  { id: "leaf", label: "Plans", match: (f) => f.kind === "leaf" },
  { id: "scenarios", label: "Scenarios", match: (f) => f.kind === "scenarios" },
  { id: "sync", label: "Inputs", match: (f) => f.kind === "sync" },
  { id: "all", label: "All", match: () => true },
];

const KIND_LABEL: Record<string, string> = {
  index: "Day index",
  root: "Root",
  salt: "Salt",
  receipt: "Chain receipt",
  "outside-input": "Cournot reading",
  leaf: "Plan",
  scenarios: "Price scenarios",
  sync: "Inputs read",
};

const SHOWN = 60;

const size = (bytes: number) =>
  bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : bytes >= 1e3 ? `${(bytes / 1e3).toFixed(1)} KB` : `${formatInt(bytes)} B`;

interface Col {
  key: string;
  label: string;
  kind: SortKind;
  value: (f: File) => SortValue;
  className?: string;
}

const COLS: Col[] = [
  { key: "path", label: "File", kind: "text", value: (f) => f.path, className: "fs-c-path" },
  { key: "kind", label: "Kind", kind: "text", value: (f) => KIND_LABEL[f.kind] ?? f.kind, className: "fs-c-kind" },
  { key: "bytes", label: "Size", kind: "number", value: (f) => f.bytes, className: "r fs-c-size" },
];

export default function FilesPage() {
  const state = useGreenfield();
  return (
    <div className="page page--files">
      <PageHeader
        title="Files"
        lede="Every file behind the sealed day's record, in a public bucket on BNB Greenfield: the day's index and root, each plan, its price scenarios, the inputs it read and both chain receipts. Anyone can fetch a file and compare its SHA-256."
      />
      <Ready state={state}>{(g) => <Files g={g} />}</Ready>
    </div>
  );
}

function Files({ g }: { g: GreenfieldIndex }) {
  const [kind, setKind] = useState("record");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const [all, setAll] = useState(false);
  const at = dualTime(Math.floor(Date.parse(g.verifiedAt) / 1000));
  const counts = useMemo(() => Object.fromEntries(KINDS.map((k) => [k.id, g.files.filter(k.match).length])), [g]);
  const opDay = formatOperatingDay(g.operatingDay);
  const testnet = /^greenfield_5600-/.test(g.network.greenfield);
  // the battery the other tabs carry (Desert Willow until one is picked), for the edge's verdict
  const [resource] = useSelectedBattery();
  const edgeName = BATTERY_NAMES[resource] ?? resource;
  const edgeDay = opDay.replace(/^\w+, /, "").replace(/, \d+$/, "");
  const where = `BNB Greenfield${testnet ? " testnet" : ""} (${g.network.greenfield})`;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = KINDS.find((k) => k.id === kind)!.match;
    const list = g.files.filter((f) => match(f) && (!q || f.path.toLowerCase().includes(q)));
    if (!sort) return list;
    const col = COLS.find((c) => c.key === sort.key);
    return col ? sortRows(list, col.value, sort.desc) : list;
  }, [g.files, kind, query, sort]);
  const shown = all ? rows : rows.slice(0, SHOWN);
  const registry = useLogoRegistry();
  // every file the filter shows, by its SHA-256 and its public address: the list behind the table's Same marks
  const items: CheckItem[] = useMemo(
    () =>
      rows.map((f) => ({
        kind: "file" as const,
        label: f.path,
        value: f.sha256,
        href: `${g.baseUrl}${f.path}`,
        copy: `SHA-256 of ${f.path}`,
        note: f.verified ? "Read back after upload: the same SHA-256" : "Not read back after upload",
      })),
    [rows, g.baseUrl],
  );

  return (
    <>
      <section className="fs-lead" aria-label="The bucket">
        <StatRow className="fs-stats">
          <Stat label="Files" value={formatInt(g.objects)} note={`${size(g.totalBytes)} in all`} />
          <Stat
            label="Read back after upload"
            value={g.allVerified ? `All ${formatInt(g.objects)}` : `${formatInt(g.files.filter((f) => f.verified).length)} of ${formatInt(g.objects)}`}
            note={`same SHA-256, checked ${at.ct}${at.yours ? ` · ${at.yours}` : ""}`}
          />
          <Stat label="Operating day" value={opDay.replace(/^\w+, /, "").replace(",", "")} note="the day the plans cover" />
          <Stat
            label="Bucket"
            value={<span className="fs-bucket">{g.bucket.name}</span>}
            size="sm"
            note={
              <>
                {g.bucket.visibility} on {where}.{" "}
                <a className="fs-link" href={g.explorer} target="_blank" rel="noreferrer">
                  Open in the explorer
                  <Glyph name="popout" />
                </a>
              </>
            }
          />
        </StatRow>
        <p className="fs-source">
          Storage: {where}. Counts, sizes and SHA-256 from the publisher's upload record for operating day {opDay}, each file read back and compared after upload. Display:
          Wattness.
        </p>
        <p className="fs-edge">
          A Cloudflare Worker also serves these files, each only after checking it against the root committed on GateRecord. {edgeName}'s verdict for {edgeDay}, as
          JSON:{" "}
          <a className="fs-edge__link" href={edgeVerifyUrl(resource, g.operatingDay)} target="_blank" rel="noreferrer">
            <span className="mono">
              {EDGE_HOST}/verify/{resource}
            </span>
            <Glyph name="popout" />
          </a>
        </p>
      </section>

      <Section
        id="fs-files"
        title="Every File"
        builtWith={sponsors(registry, "greenfield")}
        check={{
          items,
          how: `Each SHA-256 is of the file as uploaded to ${where}, read back and compared after upload; each address serves the same bytes, so anyone can fetch a file and compare.`,
        }}
        actions={
          <div className="fs-controls">
            <label className="fs-search">
              <span className="visually-hidden">Find a file</span>
              <input type="search" value={query} placeholder="Battery or file name" spellCheck={false} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
            </label>
            <div className="seg" role="group" aria-label="Kind of file">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={kind === k.id}
                  onClick={() => {
                    setKind(k.id);
                    setAll(false);
                  }}
                >
                  {k.label} <span className="fs-n num">{formatInt(counts[k.id])}</span>
                </button>
              ))}
            </div>
          </div>
        }
        source={
          <>
            Files: the sealed record for operating day {opDay}, uploaded and read back by the publisher. Storage: {where}, bucket <code>{g.bucket.name}</code>. Each
            SHA-256, in Check it, is of the file as uploaded; its address serves the same bytes. Display: Wattness.{registry ? ` ${registry.note}` : ""}
          </>
        }
      >
        <div className="fs-table" role="region" aria-label="Files">
          <table>
            <thead>
              <tr>
                {COLS.map((c) => {
                  const active = sort?.key === c.key;
                  return (
                    <th key={c.key} scope="col" className={`${c.className ?? ""}${active ? " is-sorted" : ""}`} aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}>
                      <button type="button" className="fs-sort" onClick={() => setSort(nextSort(sort, c.key, c.kind))}>
                        {c.kind === "number" && <Glyph name={active ? (sort.desc ? "sort-down" : "sort-up") : "dash"} size={11} className="fs-sort__glyph" />}
                        <span>{c.label}</span>
                        {c.kind !== "number" && <Glyph name={active ? (sort.desc ? "sort-down" : "sort-up") : "dash"} size={11} className="fs-sort__glyph" />}
                      </button>
                    </th>
                  );
                })}
                <th scope="col" className="fs-c-hash">
                  <span>Read back</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={COLS.length + 1} className="fs-empty">
                    No file matches “{query}”.
                  </td>
                </tr>
              )}
              {shown.map((f) => (
                <tr key={f.path}>
                  <td className="fs-c-path">
                    <a className="fs-link mono" href={`${g.baseUrl}${f.path}`} target="_blank" rel="noreferrer" title={`${g.baseUrl}${f.path}`}>
                      {f.path}
                      <Glyph name="popout" />
                    </a>
                  </td>
                  <td className="fs-c-kind">{KIND_LABEL[f.kind] ?? f.kind}</td>
                  <td className="r num fs-c-size">{size(f.bytes)}</td>
                  <td className="fs-c-hash">
                    {f.verified ? (
                      <span className="fs-same">
                        <Glyph name="check" />
                        Same SHA-256
                      </span>
                    ) : (
                      <span className="muted">Not read back</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > SHOWN && (
          <div className="fs-more">
            <span className="muted num">
              {all ? `All ${formatInt(rows.length)} shown` : `${formatInt(SHOWN)} of ${formatInt(rows.length)} shown`}
            </span>
            <button type="button" className="btn" onClick={() => setAll((v) => !v)}>
              {all ? `Show the first ${SHOWN}` : `Show all ${formatInt(rows.length)}`}
            </button>
          </div>
        )}
      </Section>
    </>
  );
}
