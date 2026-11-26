import { lazy, Suspense } from "react";
import { Navigate, useLocation, useParams, type RouteObject } from "react-router-dom";
import { loadPage } from "./lib/chunk-reload";
import { Layout } from "./shell/Layout";
import { RouteError } from "./shell/RouteError";
import { TABS } from "./shell/tabs";

// Every tab is its own chunk, so the 3D scenes and charts one page loads never
// weigh on another. The routes come from the side panel's list (shell/tabs.ts):
// a tab's page folder default-exports the page.
const NotFound = lazy(loadPage(() => import("./pages/NotFound")));
// The scene lab renders bare, outside the site chrome, so a capture holds only the scene.
const SceneLab = lazy(loadPage(() => import("./pages/SceneLab")));

const tabRoutes: RouteObject[] = TABS.map((t) =>
  t.path === "/" ? { index: true, element: <t.page /> } : { path: `${t.path.slice(1)}${t.subpaths ? "/*" : ""}`, element: <t.page /> },
);

/** An earlier address: the same subpath and query on the tab that took its place. */
function Moved({ to }: { to: string }) {
  const { "*": rest = "" } = useParams();
  const { search } = useLocation();
  return <Navigate replace to={{ pathname: rest ? `${to}/${rest}` : to, search }} />;
}

/** /pit-wall?battery=X&arm=B&hour=17 opens /battery/X?arm=B&hour=17. */
function PitWallMoved() {
  const params = new URLSearchParams(useLocation().search);
  const battery = params.get("battery");
  params.delete("battery");
  const search = params.toString();
  return <Navigate replace to={{ pathname: battery ? `/battery/${battery}` : "/battery", search: search ? `?${search}` : "" }} />;
}

// The first site's routes, so links already shared keep working.
const movedRoutes: RouteObject[] = [
  { path: "pit-wall/*", element: <PitWallMoved /> },
  { path: "standings/*", element: <Moved to="/fleet" /> },
  { path: "stewards/*", element: <Moved to="/verify" /> },
  { path: "garage/*", element: <Moved to="/about/agents" /> },
  { path: "paddock/*", element: <Moved to="/about" /> },
  { path: "agents", element: <Navigate replace to="/agents/ids" /> },
];

export const routes: RouteObject[] = [
  {
    path: "scene-lab/*",
    element: (
      <Suspense fallback={null}>
        <SceneLab />
      </Suspense>
    ),
    errorElement: <RouteError />,
  },
  {
    element: <Layout />,
    // A page that fails to render shows RouteError in the page's place, with the side panel kept.
    children: [{ errorElement: <RouteError />, children: [...tabRoutes, ...movedRoutes, { path: "*", element: <NotFound /> }] }],
  },
];
