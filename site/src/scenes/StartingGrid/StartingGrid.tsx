import { SHOWCASE, SOURCE_LINE } from "../../config";
import { loadDay, loadReceipts } from "../../data/load";
import { shortHash } from "../../lib/format";
import { SceneHost, type SceneProps } from "../engine/SceneHost";
import { createStartingGrid, gridOrder, type GridData } from "./model";

const load = async (): Promise<GridData> => {
  const [day, receipts] = await Promise.all([loadDay(), loadReceipts()]);
  return { day, receipts };
};

/**
 * The day's sealed plans as a starting grid: qualifying, the parc ferme sweep,
 * the root's ring and the chain receipt.
 */
export default function StartingGrid(props: SceneProps) {
  return (
    <SceneHost
      {...props}
      defaultName="starting-grid"
      label={`Starting grid: the day's sealed battery plans, ${SHOWCASE.name} on pole, sealed on BNB Chain before the 10:00 CT gate.`}
      load={load}
      create={createStartingGrid}
      fallback={(data) => <GridStill data={data} />}
    />
  );
}

/** A flat drawing of the sealed grid for browsers without WebGL. */
function GridStill({ data }: { data: GridData | null }) {
  if (!data) return null;
  const order = gridOrder(data.day.batteries);
  const max = Math.max(...order.map((b) => b.dischargeMwh), 1);
  const perRow = 40;
  const w = 8 + perRow * 14;
  const rows = Math.ceil(order.length / perRow);
  const h = 24 + rows * 26;
  return (
    <figure style={{ margin: 0, display: "grid", gap: 8, maxWidth: 720, width: "100%" }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={`${order.length} sealed plans`}>
        {order.map((b, i) => {
          const col = i % perRow;
          const row = Math.floor(i / perRow);
          const bh = 3 + (16 * b.dischargeMwh) / max;
          const x = 6 + col * 14 + (i % 2) * 3;
          const y = 20 + row * 26 + (18 - bh);
          return <rect key={b.resource} x={x} y={y} width={8} height={bh} fill={i === 0 ? "var(--teal)" : "var(--border-strong)"} />;
        })}
        <rect x={0} y={4} width={w} height={2} fill="var(--bnb)" />
      </svg>
      <figcaption style={{ fontSize: 12, color: "var(--muted)" }}>
        {order.length} plans sealed under root <span style={{ fontFamily: "var(--font-mono)" }}>{shortHash(data.day.root, 4, 5)}</span>. Bar height: planned
        discharge. {SOURCE_LINE}
      </figcaption>
    </figure>
  );
}
