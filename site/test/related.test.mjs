// The Related strips (src/shell/related.ts): every tab leads to two to four others, all of them tabs, none itself; the
// sets the plan names hold; every tab but the Intro is led to from somewhere; a plain click previews and any other
// keeps the link's own meaning; and every page draws the strip. Run with `pnpm test` (Node 22.18 or later runs the
// TypeScript modules directly; the hook below adds the ".ts" that Vite resolves on its own).

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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

const { isPreviewClick, RELATED, relatedTabs } = await import("../src/shell/related.ts");
const { TABS } = await import("../src/shell/tabs.ts");

const here = dirname(fileURLToPath(import.meta.url));
const pages = resolve(here, "..", "src", "pages");
const ids = new Set(TABS.map((t) => t.id));

test("every tab has a set of two to four other tabs, each once", () => {
  assert.deepEqual(Object.keys(RELATED).filter((id) => !ids.has(id)), [], "a set for a tab that is not in the list");
  for (const t of TABS) {
    const set = RELATED[t.id];
    assert.ok(set, `${t.id} has no Related set`);
    assert.ok(set.length >= 2 && set.length <= 4, `${t.id}: ${set.length} tabs`);
    assert.equal(new Set(set).size, set.length, `${t.id} names a tab twice`);
    assert.ok(!set.includes(t.id), `${t.id} leads to itself`);
    for (const id of set) assert.ok(ids.has(id), `${t.id} leads to "${id}", which is not a tab`);
    assert.deepEqual(relatedTabs(t.id).map((x) => x.id), [...set]);
  }
});

test("the sets the plan names", () => {
  assert.deepEqual([...RELATED.seal], ["verify", "files", "agent-ids"]);
  assert.deepEqual([...RELATED.battery], ["fleet", "hedge", "risk", "verify"]);
  assert.deepEqual([...RELATED.prices], ["season", "launchpad", "forecast"]);
});

test("every tab but the Intro is led to from another page", () => {
  const led = new Set(Object.values(RELATED).flat());
  assert.deepEqual(TABS.map((t) => t.id).filter((id) => id !== "intro" && !led.has(id)), []);
});

test("a page outside the list has no strip", () => {
  for (const id of [undefined, "", "nope", "toString", "__proto__"]) assert.deepEqual(relatedTabs(id), [], String(id));
});

test("a plain click previews; a held key, another button or a handled click keeps the link's meaning", () => {
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
  assert.equal(isPreviewClick(click), true);
  for (const k of ["metaKey", "ctrlKey", "shiftKey", "altKey", "defaultPrevented"]) assert.equal(isPreviewClick({ ...click, [k]: true }), false, k);
  assert.equal(isPreviewClick({ ...click, button: 1 }), false, "middle click");
});

test("every page draws the strip: the shared page head, and the Intro under its hero", () => {
  const read = (p) => readFileSync(p, "utf8");
  assert.match(read(resolve(here, "..", "src", "ui", "PageHeader.tsx")), /<RelatedStrip tabId=\{tab\?\.id\} \/>/);
  assert.match(read(join(pages, "Intro", "index.tsx")), /<RelatedStrip tabId="intro" \/>/);
  // Every other tab's page uses the shared head (SceneLab renders bare and is no tab).
  const folders = readdirSync(pages).filter((d) => !["Intro", "SceneLab", "NotFound"].includes(d));
  for (const d of folders) assert.match(read(join(pages, d, "index.tsx")), /<PageHeader\b/, `${d} has no PageHeader`);
});
