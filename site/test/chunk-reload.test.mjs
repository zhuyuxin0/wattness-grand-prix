// A tab left open across a deploy: its next page's chunk is gone, the import fails, and the page reloads once for the
// new build instead of showing an error. Run with `pnpm test` (Node 22.18 or later runs the TypeScript directly; the
// hook below adds the ".ts" that Vite resolves on its own).

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (!/^\.\.?\//.test(specifier) || /\.[cm]?[jt]sx?$/.test(specifier)) throw error;
      return next(`${specifier}.ts`, context);
    }
  },
});

const { RELOAD_KEY, RELOAD_WINDOW_MS, claimReload, isChunkLoadError, loadPage } = await import("../src/lib/chunk-reload.ts");

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

test("each browser's failed-chunk message counts; other errors do not", () => {
  // Chrome, Safari, Firefox, and Vite's CSS preload.
  assert.ok(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://gp.wattness.tech/assets/Season-DmII1Or2.js")));
  assert.ok(isChunkLoadError(new TypeError("Importing a module script failed.")));
  assert.ok(isChunkLoadError(new TypeError("error loading dynamically imported module: https://gp.wattness.tech/assets/Fleet-x.js")));
  assert.ok(isChunkLoadError(new Error("Unable to preload CSS for /assets/Season-abc.css")));
  assert.ok(!isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')")));
  assert.ok(!isChunkLoadError(new Error("Failed to load day.json: 404")));
  assert.ok(!isChunkLoadError(undefined));
});

test("a tab reloads at most once in the window, and never when it cannot remember", () => {
  const store = memory();
  const t0 = 1_800_000_000_000;
  assert.equal(claimReload(store, t0), true);
  assert.equal(store.getItem(RELOAD_KEY), String(t0));
  assert.equal(claimReload(store, t0 + RELOAD_WINDOW_MS - 1), false, "a second failure right after the reload does not loop");
  assert.equal(claimReload(store, t0 + RELOAD_WINDOW_MS), true, "a later deploy reloads again");
  assert.equal(claimReload(null, t0), false, "no storage: the error view offers the reload instead");
  const blocked = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("SecurityError"); } };
  assert.equal(claimReload(blocked, t0), false);
});

test("a page import that loses its chunk reloads once and stays pending; any other failure still throws", async () => {
  const store = memory();
  let reloads = 0;
  globalThis.window = { sessionStorage: store, location: { reload: () => reloads++ } };
  try {
    const gone = loadPage(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module: /assets/Season-old.js")));
    const pending = gone();
    const settled = await Promise.race([pending.then(() => "settled", () => "settled"), new Promise((r) => setTimeout(() => r("pending"), 20))]);
    assert.equal(settled, "pending", "the page keeps its loading state while it reloads");
    assert.equal(reloads, 1);

    // The same failure again within the window: no second reload, the error reaches the route's error view.
    await assert.rejects(gone(), /dynamically imported module/);
    assert.equal(reloads, 1);

    const broken = loadPage(() => Promise.reject(new TypeError("x is not a function")));
    await assert.rejects(broken(), /x is not a function/);
    assert.equal(reloads, 1);

    const fine = loadPage(() => Promise.resolve({ default: "Page" }));
    assert.deepEqual(await fine(), { default: "Page" });
  } finally {
    delete globalThis.window;
  }
});
