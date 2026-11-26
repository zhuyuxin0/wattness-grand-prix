import { ObjectLead } from "../../ui/ObjectLead";

// Forecast's first view: the weather radar as the introduction builds it (chapter 14; public/renders/chapter-odds, with
// its receipt): the weather odds Cournot read for Nov 26, Kalshi's market on a Dallas low under 29°F.

export function RadarObject() {
  return (
    <ObjectLead
      className="fc-object"
      label="The weather radar in 3D"
      still="chapter-odds"
      alt="The weather radar in 3D: a radar dish on its lattice tower beside a round screen sweeping a map of Texas"
      caption="Weather odds for Nov 26"
      from="From the introduction, chapter 14"
    >
      <p>
        The weather radar: Kalshi's market on a Dallas low under 29°F, read through Cournot. For Nov 26 it stood at 1% at 09:51 CT on Nov 25, after that
        day's seal.
      </p>
      <p>The card below reads the odds the day's plans sealed.</p>
    </ObjectLead>
  );
}
