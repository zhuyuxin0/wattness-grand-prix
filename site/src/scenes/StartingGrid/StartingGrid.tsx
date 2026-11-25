import { SHOWCASE, SOURCE_LINE } from "../../config";
import { loadDay, loadReceipts } from "../../data/load";
import { shortHash } from "../../lib/format";
import { Logo } from "../../ui/Logo";
import { SceneHost, type SceneProps } from "../engine/SceneHost";
import symbolUrl from "./bnb-chain-symbol.svg";
import { W_STROKE } from "./marks";
import { createStartingGrid, type GridData } from "./model";

const load = async (): Promise<GridData> => {
  const [day, receipts] = await Promise.all([loadDay(), loadReceipts()]);
  return { day, receipts };
};

/**
 * The day's sealed plans as a starting grid: qualifying, the parc ferme sweep,
 * the root's ring and the chain receipt, closing on the Wattness mark and BNB
 * Chain's. The stage keeps its own dark in either theme, as wattness.tech's
 * intro does, wherever it is mounted.
 */
export default function StartingGrid(props: SceneProps) {
  return (
    <div data-atmosphere="dark" style={{ width: "100%", height: "100%" }}>
      <SceneHost
        {...props}
        defaultName="starting-grid"
        label={`Starting grid: the day's sealed battery plans, ${SHOWCASE.name} on pole, sealed on BNB Chain before the 10:00 CT gate, closing on the Wattness and BNB Chain marks.`}
        load={load}
        create={createStartingGrid}
        fallback={(data) => <GridStill data={data} />}
      />
    </div>
  );
}

/**
 * Without WebGL: the scene's last frame, drawn flat. The two marks, the names
 * and the line, with the day's root and the source.
 */
function GridStill({ data }: { data: GridData | null }) {
  if (!data) return null;
  return (
    <figure className="sg-still">
      <div className="sg-still__marks" aria-hidden="true">
        <Logo className="sg-still__mark" stroke={W_STROKE} trace={false} />
        <img className="sg-still__symbol" src={symbolUrl} alt="" />
      </div>
      <div className="sg-lockup__names">
        <span>Wattness</span>
        <span className="sg-lockup__x" aria-hidden="true">
          ×
        </span>
        <span>BNB Chain</span>
      </div>
      <div className="sg-lockup__line">Every battery's plan, sealed before the market closes.</div>
      <figcaption className="sg-still__caption">
        {data.day.batteries.length} plans sealed under root <span className="sg-still__hash">{shortHash(data.day.root, 4, 5)}</span>. {SOURCE_LINE}
      </figcaption>
    </figure>
  );
}
