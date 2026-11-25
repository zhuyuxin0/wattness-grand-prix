import { CONTRACT_ADDRESS } from "../../config";
import type { DayIndex } from "../../data";
import { middle } from "../../ui";

// The entry's architecture as one inline SVG, drawn twice: a left-to-right
// pipeline for wide screens and a column for phones. CSS shows one of them.

interface Part {
  id: string;
  name: string;
  what: string;
  /** The artifact the part hands on, in monospace. */
  artifact: string;
  tone?: "existing" | "sealed";
}

function parts(day: DayIndex | null): Part[] {
  return [
    {
      id: "terminal",
      name: "Wattness Terminal",
      what: "Public ERCOT data release",
      artifact: day ? day.inputsRelease.replace(/^terminal-/, "") : "daily release",
      tone: "existing",
    },
    { id: "agents", name: "Agents", what: "Plan tomorrow, per battery", artifact: day ? `${day.leafCount} batteries` : "every battery" },
    { id: "planner", name: "Planner", what: "Dispatch and hedge LP", artifact: "HiGHS · three plans" },
    { id: "root", name: "Merkle root", what: "RFC 8785 leaves, RFC 6962", artifact: day ? middle(day.root, 6, 4) : "one root per day" },
    { id: "gate", name: "GateRecord", what: "Write-once, on BNB Chain", artifact: middle(CONTRACT_ADDRESS, 4, 4), tone: "sealed" },
  ];
}

const READS: Record<string, string> = { terminal: "inputs by SHA-256", root: "leaf and proof", gate: "the record" };

export function Architecture({ day }: { day: DayIndex | null }) {
  const list = parts(day);
  return (
    <figure className="arch">
      <Wide parts={list} />
      <Tall parts={list} />
      <figcaption className="arch__legend">
        <span className="arch__key arch__key--flow">Plan flow</span>
        <span className="arch__key arch__key--read">What the verifier reads</span>
        <span className="arch__key arch__key--existing">Existing service</span>
        <span className="arch__key arch__key--sealed">On chain</span>
      </figcaption>
    </figure>
  );
}

const BOX_W = 196;
const BOX_H = 112;
const GAP = 45;

function Box({ p, x, y, w = BOX_W, h = BOX_H }: { p: Part; x: number; y: number; w?: number; h?: number }) {
  return (
    <g className={`arch__part${p.tone ? ` arch__part--${p.tone}` : ""}`} transform={`translate(${x} ${y})`}>
      <rect className="arch__box" width={w} height={h} rx={6} />
      {p.tone === "sealed" && <circle className="arch__seal" cx={w - 18} cy={32} r={3.5} />}
      {p.tone === "existing" && (
        <text className="arch__tag" x={16} y={22}>
          Existing service
        </text>
      )}
      <text className="arch__name" x={16} y={p.tone === "existing" ? 50 : 38}>
        {p.name}
      </text>
      <text className="arch__what" x={16} y={p.tone === "existing" ? 70 : 60}>
        {p.what}
      </text>
      <text className="arch__artifact" x={16} y={h - 14}>
        {p.artifact}
      </text>
    </g>
  );
}

function Arrow({ d }: { d: string }) {
  return <path className="arch__flow" d={d} markerEnd="url(#arch-head)" />;
}

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path className="arch__head" d="M0 0 8 4 0 8Z" />
      </marker>
    </defs>
  );
}

function Verifier({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g className="arch__part arch__part--verifier" transform={`translate(${x} ${y})`}>
      <rect className="arch__box" width={w} height={h} rx={6} />
      <text className="arch__name" x={16} y={36}>
        Verifier
      </text>
      <text className="arch__what" x={16} y={58}>
        CLI, browser or Python, by anyone
      </text>
      <text className="arch__artifact arch__artifact--result" x={16} y={h - 16}>
        Pass or fail, check by check
      </text>
    </g>
  );
}

function Wide({ parts: list }: { parts: Part[] }) {
  const W = BOX_W * 5 + GAP * 4;
  const top = 8;
  const bus = top + BOX_H + 64;
  const vy = bus + 40;
  const vw = 360;
  const vh = 104;
  const vx = (W - vw) / 2;
  const cx = (i: number) => i * (BOX_W + GAP) + BOX_W / 2;
  return (
    <svg className="arch__svg arch__svg--wide" viewBox={`0 0 ${W} ${vy + vh + 8}`} role="img" aria-labelledby="arch-wide-title">
      <title id="arch-wide-title">
        The Wattness Terminal's public data feeds the agents; the planner solves each battery's day; the plans become leaves of one Merkle root; GateRecord on
        BNB Chain stores the root before the gate. The verifier reads the inputs, the leaf and its proof, and the record.
      </title>
      <Defs id="arch-head" />
      {list.map((p, i) => (
        <Box key={p.id} p={p} x={i * (BOX_W + GAP)} y={top} />
      ))}
      {list.slice(1).map((p, i) => (
        <Arrow key={p.id} d={`M${(i + 1) * (BOX_W + GAP) - GAP + 4} ${top + BOX_H / 2}H${(i + 1) * (BOX_W + GAP) - 4}`} />
      ))}
      <path className="arch__read" d={`M${cx(0)} ${bus}H${cx(4)}`} />
      <path className="arch__read" d={`M${W / 2} ${bus}V${vy}`} />
      {list.map((p, i) =>
        READS[p.id] ? (
          <g key={p.id}>
            <path className="arch__read" d={`M${cx(i)} ${bus}V${top + BOX_H}`} />
            <text className="arch__read-label" x={cx(i) + 10} y={top + BOX_H + 34}>
              {READS[p.id]}
            </text>
          </g>
        ) : null,
      )}
      <Verifier x={vx} y={vy} w={vw} h={vh} />
    </svg>
  );
}

function Tall({ parts: list }: { parts: Part[] }) {
  const w = 230;
  const h = 108;
  const step = h + 32;
  const rail = 350;
  const vy = list.length * step + 20;
  const mid = (i: number) => i * step + h / 2;
  return (
    <svg className="arch__svg arch__svg--tall" viewBox={`0 0 360 ${vy + h + 4}`} role="img" aria-labelledby="arch-tall-title">
      <title id="arch-tall-title">
        The Wattness Terminal's public data feeds the agents; the planner solves each battery's day; the plans become leaves of one Merkle root; GateRecord on
        BNB Chain stores the root before the gate. The verifier reads the inputs, the leaf and its proof, and the record.
      </title>
      <Defs id="arch-head-tall" />
      {list.map((p, i) => (
        <Box key={p.id} p={p} x={0} y={i * step} w={w} h={h} />
      ))}
      {list.slice(1).map((p, i) => (
        <path key={p.id} className="arch__flow" d={`M${w / 2} ${i * step + h + 4}V${(i + 1) * step - 4}`} markerEnd="url(#arch-head-tall)" />
      ))}
      <path className="arch__read" d={`M${rail} ${mid(0)}V${vy + h / 2}H${w + 4}`} />
      {list.map((p, i) =>
        READS[p.id] ? (
          <g key={p.id}>
            <path className="arch__read" d={`M${rail} ${mid(i)}H${w}`} />
            <text className="arch__read-label" x={w + 12} y={mid(i) - 8}>
              {READS[p.id]?.replace("inputs by SHA-256", "inputs")}
            </text>
          </g>
        ) : null,
      )}
      <Verifier x={0} y={vy} w={w} h={h} />
    </svg>
  );
}
