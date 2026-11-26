import { Suspense, lazy } from "react";
import { Loading } from "../../ui";
import type { FleetMapProps } from "./FleetMap";
import "./slot.css";

// The fleet map's door. This file is all a page imports: the map, its model and its styles load as their own chunk by
// dynamic import, the first time a FleetMapPane renders (the Fleet tab, or a pane that opens it), so no other page
// carries them on its first paint.
//
//   <FleetMapPane />                 the Fleet tab's lead section: title, map, hour, legend, unplaced list
//   <FleetMapPane variant="pane" />  the same map as a pane's body, for a home: no section head, the list as a count

export type { FleetMapProps } from "./FleetMap";

const FleetMap = lazy(() => import("./FleetMap"));

export function FleetMapPane(props: FleetMapProps) {
  return (
    <div className={`fmap-slot fmap-slot--${props.variant ?? "lead"}`}>
      <Suspense fallback={<Loading label="Loading the map" />}>
        <FleetMap {...props} />
      </Suspense>
    </div>
  );
}
