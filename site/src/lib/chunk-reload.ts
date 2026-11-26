// A deploy renames every page's chunk (Vite hashes them), and GitHub Pages serves only the newest build. A tab opened
// before the deploy still runs the previous build, so the next page it opens asks for a chunk that is gone and the
// import fails. The cure is the new build: reload once. The guard stops a loop when the failure has another cause
// (offline, a blocked request): a tab reloads at most once in RELOAD_WINDOW_MS, and never when it cannot remember
// that it did (storage blocked), so the page's error view offers the reload instead.

export const RELOAD_KEY = "gp.chunk-reload";
export const RELOAD_WINDOW_MS = 30_000;

/** True for the errors browsers raise when a dynamically imported module or its CSS cannot be fetched. */
export function isChunkLoadError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i.test(
    text,
  );
}

export interface ReloadStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Whether this tab may reload now; records the reload so a second failure within the window does not loop. */
export function claimReload(store: ReloadStore | null, now: number): boolean {
  if (!store) return false;
  try {
    const last = Number(store.getItem(RELOAD_KEY) ?? 0) || 0;
    if (now - last < RELOAD_WINDOW_MS) return false;
    store.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

function sessionStore(): ReloadStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Reloads the page for the newest build, once; false when this tab just did, or cannot tell. */
export function reloadForNewBuild(): boolean {
  if (!claimReload(sessionStore(), Date.now())) return false;
  window.location.reload();
  return true;
}

/** The catch for a lazy page's import: reload for the newest build, or pass the error on to the route's view. */
export function onPageLoadError<T>(error: unknown): Promise<T> {
  // While the page reloads, the import stays pending, so the page shows its loading state, not an error.
  if (isChunkLoadError(error) && reloadForNewBuild()) return new Promise<T>(() => {});
  return Promise.reject(error);
}

/** Wraps a lazy page's import: a chunk gone after a deploy reloads the page instead of failing it. */
export function loadPage<T>(load: () => Promise<T>): () => Promise<T> {
  return () => load().catch((error: unknown) => onPageLoadError<T>(error));
}

/** Vite's own signal for a failed preload (any dynamic import it wraps): reload instead of letting it throw. */
export function listenForPreloadErrors(): void {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForNewBuild()) event.preventDefault();
  });
}
