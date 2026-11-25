import { lazy, Suspense } from "react";
import type { RouteObject } from "react-router-dom";
import { Layout } from "./shell/Layout";

// Each page is its own chunk, so the 3D scenes and charts one page loads never
// weigh on another. A page folder's index.tsx default-exports the page.
const RaceWeekend = lazy(() => import("./pages/RaceWeekend"));
const PitWall = lazy(() => import("./pages/PitWall"));
const Standings = lazy(() => import("./pages/Standings"));
const Stewards = lazy(() => import("./pages/Stewards"));
const Garage = lazy(() => import("./pages/Garage"));
const Paddock = lazy(() => import("./pages/Paddock"));
const NotFound = lazy(() => import("./pages/NotFound"));
// The scene lab renders bare, outside the site chrome, so a capture holds only the scene.
const SceneLab = lazy(() => import("./pages/SceneLab"));

export const routes: RouteObject[] = [
  {
    path: "scene-lab/*",
    element: (
      <Suspense fallback={null}>
        <SceneLab />
      </Suspense>
    ),
  },
  {
    element: <Layout />,
    children: [
      { index: true, element: <RaceWeekend /> },
      { path: "pit-wall/*", element: <PitWall /> },
      { path: "standings/*", element: <Standings /> },
      { path: "stewards/*", element: <Stewards /> },
      { path: "garage/*", element: <Garage /> },
      { path: "paddock/*", element: <Paddock /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];
