import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// The float layer's front door, the only part on first paint: a few lines that load the layer (layer.tsx, rc-dock and
// its styles) the first time a pane opens, or after first paint when this browser saved open panes. Any tab can open
// as a floating pane over the page, holding the tab's real page: openPane(path) from anywhere on the site.

/** Where this browser keeps the open panes (a convenience, read and written inside try/catch). */
export const PANES_KEY = "gp.panes";

export interface FloatHost {
  /** The site's own router: a pane's Open goes to its tab as the page. */
  navigate: (to: string) => void;
}

type Layer = typeof import("./layer");

let navigateMain: ((to: string) => void) | null = null;
let loading: Promise<Layer> | null = null;

const host: FloatHost = {
  navigate: (to) => {
    if (navigateMain) navigateMain(to);
    else window.location.assign(to);
  },
};

function load(): Promise<Layer> {
  loading ??= import("./layer").then((layer) => {
    layer.start(host);
    return layer;
  });
  loading.catch(() => {
    // A chunk that failed to load is asked for again next time.
    loading = null;
  });
  return loading;
}

/**
 * Opens the page at `path` as a floating pane on top (a phone shows it as a sheet). The control that asked gets focus
 * back when the pane closes. If the layer cannot load, the tab opens as the page instead.
 */
export function openPane(path: string, opener?: HTMLElement | null): void {
  load().then(
    (layer) => layer.open(path, opener ?? null),
    () => host.navigate(path),
  );
}

function hasSavedPanes(): boolean {
  try {
    const raw = localStorage.getItem(PANES_KEY);
    return !!raw && raw.includes('"path"');
  } catch {
    return false;
  }
}

/** For the app's frame: gives the layer the router, and brings back the panes this browser left open. */
export function useFloatHost(): void {
  const navigate = useNavigate();
  useEffect(() => {
    navigateMain = (to) => navigate(to);
    return () => {
      navigateMain = null;
    };
  }, [navigate]);

  useEffect(() => {
    if (!hasSavedPanes()) return;
    // After first paint, on an idle moment: the page comes first and the panes over it.
    const run = () => void load().catch(() => undefined);
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(run, { timeout: 1500 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(run, 300);
    return () => window.clearTimeout(handle);
  }, []);
}
