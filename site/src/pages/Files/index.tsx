import { useMemo, useState } from "react";
import { formatInt } from "../../lib/format";
import { dualTime, formatOperatingDay } from "../../lib/time";
import { Glyph, Hash, PageHeader, Ready, Section, Stat, StatRow, Table, type Column } from "../../ui";
import { useGreenfield, type GreenfieldIndex } from "./data";
import "./styles.css";

// Files: the sealed day as stored on BNB Greenfield. Every object with its
// size, its SHA-256 as uploaded and read back, and the address anyone can
// fetch it from.

type File = GreenfieldIndex["files"][number];

const KINDS: { id: string; label: string; match: (f: File) => boolean }[] = [
  { id: "record", label: "Record", match: (f) => !["leaf", "scenarios", "sync"].includes(f.kind) },
  { id: "leaf", label: "Plans", match: (f) => f.kind === "leaf" },
  { id: "scenarios", label: "Scenarios", match: (f) => f.kind === "scenarios" },
  { id: "sync", label: "Inputs", match: (f) => f.kind === "sync" },
];

const KIND_LABEL: Record<string, string> = {
  index: "Day index",
  root: "Root",
  salt: "Salt",
  receipt: "Chain receipt",
  leaf: "Plan",
  scenarios: "Scenarios",
  sync: "Inputs",
};

const size = (bytes: number) =>
  bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : bytes >= 1e3 ? `${(bytes / 1e3).toFixed(1)} KB` : `${formatInt(bytes)} B`;

export default function FilesPage() {
  const state = useGreenfield();
  const [kind, setKind] = useState("record");
  return (
    <div className="page page--files">
      <PageHeader
        title="Files"
        lede="The sealed day's files sit in a public bucket on BNB Greenfield: the day's index and root, each plan, its scenarios, the inputs it read, and both chain receipts. Each file's SHA-256 was checked after upload."
      />
      <Ready state={state}>
        {(g) => {
          const at = dualTime(Math.floor(Date.parse(g.verifiedAt) / 1000));
          return (
            <>
              <Section
                title="The bucket"
                source={`Files: the sealed record, uploaded and read back by the publisher. Storage: BNB Greenfield (${g.network.greenfield}). Display: Wattness.`}
              >
                <StatRow>
                  <Stat label="Operating day" value={formatOperatingDay(g.operatingDay)} size="sm" note={g.bucket.name} />
                  <Stat label="Files" value={formatInt(g.objects)} note={size(g.totalBytes)} />
                  <Stat label="Checked after upload" value={g.allVerified ? "Every file" : "Not every file"} size="sm" note={`${at.ct}${at.yours ? ` · ${at.yours}` : ""}`} />
                  <Stat
                    label="Bucket"
                    value={
                      <a className="files-link" href={g.explorer} target="_blank" rel="noreferrer">
                        Open in the explorer
                        <Glyph name="popout" />
                      </a>
                    }
                    size="sm"
                    note={`${g.bucket.visibility}, owner ${g.bucket.owner.slice(0, 6)}…${g.bucket.owner.slice(-4)}`}
                  />
                </StatRow>
              </Section>
              <Section
                title="Every file"
                actions={
                  <div className="seg" role="group" aria-label="Kind of file">
                    {KINDS.map((k) => (
                      <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
                        {k.label}
                      </button>
                    ))}
                  </div>
                }
                source="SHA-256 of each file as uploaded; the address serves the same bytes."
              >
                <FileTable g={g} kind={kind} />
              </Section>
            </>
          );
        }}
      </Ready>
    </div>
  );
}

function FileTable({ g, kind }: { g: GreenfieldIndex; kind: string }) {
  const rows = useMemo(() => g.files.filter(KINDS.find((k) => k.id === kind)!.match), [g, kind]);
  const cols: Column<File>[] = [
    {
      key: "path",
      label: "File",
      kind: "text",
      value: (f) => f.path,
      render: (f) => (
        <a className="files-link mono" href={`${g.baseUrl}${f.path}`} target="_blank" rel="noreferrer">
          {f.path}
          <Glyph name="popout" />
        </a>
      ),
    },
    { key: "kind", label: "Kind", kind: "text", value: (f) => KIND_LABEL[f.kind] ?? f.kind },
    { key: "bytes", label: "Size", kind: "number", value: (f) => f.bytes, render: (f) => size(f.bytes) },
    { key: "sha256", label: "SHA-256", kind: "text", sortable: false, value: (f) => f.sha256, render: (f) => <Hash value={f.sha256} head={8} tail={6} label={`SHA-256 of ${f.path}`} /> },
  ];
  return <Table columns={cols} rows={rows} rowKey={(f) => f.path} caption={`${formatInt(rows.length)} files`} />;
}
