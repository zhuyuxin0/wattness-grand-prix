import { lazy } from "react";

// The scenes load three.js; importing them through these lazy wrappers keeps it
// out of every page chunk that does not render a scene. Render inside <Suspense>.
export const StartingGrid = lazy(() => import("./StartingGrid/StartingGrid"));
export const BrainMap = lazy(() => import("./BrainMap/BrainMap"));

export type { SceneProps } from "./engine/SceneHost";
export type { Quality } from "./engine/stage";
export { GRID_DURATION, GRID_CLOSE, BRAIN_DURATION } from "./durations";
