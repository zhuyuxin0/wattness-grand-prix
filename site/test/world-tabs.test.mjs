// The 3D world's routes and imports, held to the side panel's list. Every tab
// id the story, the stack or the brain can send must open a tab here, and the
// package loads only by dynamic import from a page folder. Run with `pnpm test` (Node
// 22.18 or later runs the TypeScript module directly).

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PANEL, TABS, WORLD_TABS, worldTab } from "../src/shell/tabs.ts";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const world = resolve(site, "..", "packages", "world", "src");
const read = (p) => readFileSync(p, "utf8");

/** The story's TabId union, read from packages/world/src/story/beats.ts. */
function storyTabIds() {
  const m = /export type TabId =([^;]+);/.exec(read(join(world, "story", "beats.ts")));
  assert.ok(m, "beats.ts declares TabId");
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** The values of the stack's ROUTES, read from packages/world/src/stations/stack/pieces.ts. */
function stackTabIds() {
  const m = /export const ROUTES = \{([\s\S]*?)\} as const;/.exec(read(join(world, "stations", "stack", "pieces.ts")));
  assert.ok(m, "pieces.ts declares ROUTES");
  return [...new Set([...m[1].matchAll(/:\s*'([^']+)'/g)].map((x) => x[1]))];
}

/** The tab ids the brain's cards open (Open <tab>, Part of), read from packages/world/src/stations/brain/brain-scene.json. */
function brainTabIds() {
  const scene = JSON.parse(read(join(world, "stations", "brain", "brain-scene.json")));
  const ids = Object.keys(scene.tabs ?? {});
  for (const p of scene.pages ?? []) if (p.tab) ids.push(p.tab);
  return [...new Set(ids)];
}

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [p] : [];
  });
}

test("every tab the story can open is a tab here", () => {
  const ids = storyTabIds();
  assert.ok(ids.length > 0);
  for (const id of ids) assert.ok(worldTab(id), `the story's "${id}" opens no tab`);
});

test("every tab the stack can open is a tab here", () => {
  const ids = stackTabIds();
  assert.ok(ids.length > 0);
  for (const id of ids) assert.ok(worldTab(id), `the stack's "${id}" opens no tab`);
});

test("every tab the brain can open is a tab here", () => {
  const ids = brainTabIds();
  assert.ok(ids.length > 0);
  for (const id of ids) assert.ok(worldTab(id), `the brain's "${id}" opens no tab`);
});

test("the map names only ids the package sends", () => {
  const sent = new Set([...storyTabIds(), ...stackTabIds(), ...brainTabIds()]);
  assert.deepEqual(Object.keys(WORLD_TABS).filter((id) => !sent.has(id)), []);
});

test("an id the map does not know opens nothing", () => {
  assert.equal(worldTab("garage"), undefined);
  assert.equal(worldTab("toString"), undefined);
});

test("tab ids, group ids and paths are unique", () => {
  const ids = PANEL.map((e) => `${e.kind}:${e.id}`);
  assert.equal(new Set(ids).size, ids.length);
  const paths = TABS.map((t) => t.path);
  assert.equal(new Set(paths).size, paths.length);
});

test("the 3D package loads only by dynamic import from a page folder", () => {
  for (const file of sourceFiles(join(site, "src"))) {
    const src = read(file);
    const rel = relative(site, file);
    const statics = [
      ...src.matchAll(/^\s*import\s+(?!type\s)[^;]*?\bfrom\s*["']@world\/[^"']*["']/gm),
      ...src.matchAll(/^\s*import\s*["']@world\/[^"']*["']/gm),
      ...src.matchAll(/^\s*export\s[^;]*?\bfrom\s*["']@world\/[^"']*["']/gm),
    ];
    assert.deepEqual(statics.map((m) => m[0].trim()), [], `${rel} imports the 3D package statically`);
    // A page folder, or Ask Ness's panel (src/ness), itself loaded only when it opens.
    if (/\bimport\(\s*["']@world\//.test(src)) assert.ok(rel.startsWith(join("src", "pages")) || rel.startsWith(join("src", "ness")), `${rel} loads the 3D package outside a page folder`);
  }
});
