import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { listenForPreloadErrors } from "./lib/chunk-reload";
import { chooseTheme } from "./lib/theme";
import { routes } from "./routes";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/components.css";

// Before React mounts, so the first frame and native controls take the saved theme.
chooseTheme();

// A tab left open across a deploy asks for chunks the new build renamed: reload once for the new build.
listenForPreloadErrors();

// Clean paths (/verify, /battery/DSWL_ESS_ESR1). index.html turns an old #/ link into its path before this runs,
// and the build writes a copy of the page at every path the app answers (scripts/spa-routes.mjs).
const router = createBrowserRouter(routes);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
