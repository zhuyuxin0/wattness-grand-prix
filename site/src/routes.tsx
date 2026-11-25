import { lazy, Suspense } from "react";
import type { RouteObject } from "react-router-dom";
import { Layout } from "./shell/Layout";
import { TABS } from "./shell/tabs";

// Every tab is its own chunk, so the 3D scenes and charts one page loads never
// weigh on another. The routes come from the side panel's list (shell/tabs.ts):
// a tab's page folder default-exports the page.
const NotFound = lazy(() => import("./pages/NotFound"));
// The scene lab renders bare, outside the site chrome, so a capture holds only the scene.
const SceneLab = lazy(() => import("./pages/SceneLab"));

const tabRoutes: RouteObject[] = TABS.map((t) =>
  t.path === "/" ? { index: true, element: <t.page /> } : { path: `${t.path.slice(1)}${t.subpaths ? "/*" : ""}`, element: <t.page /> },
);

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
    children: [...tabRoutes, { path: "*", element: <NotFound /> }],
  },
];
