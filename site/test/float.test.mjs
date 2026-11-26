// The float layer's model (src/float/model.ts): where panes open, how they stack, what keeps them inside the window,
// rc-dock's layout both ways and what this browser may hand back after a reload; and that the layer's code (rc-dock
// included) is reached only by the one dynamic import, so it never weighs on first paint. Run with `pnpm test` (Node
// 22.18 or later runs the TypeScript module directly).

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  clampAll,
  clampRect,
  closePane,
  EDGE,
  fromLayout,
  isPanePath,
  MAX_PANES,
  MIN_PANE,
  openPath,
  parseSaved,
  placeNew,
  raise,
  serialize,
  setPath,
  STEP,
  toLayout,
  topPane,
} from "../src/float/model.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..", "src");

const WIDE = { w: 1440, h: 860 }; // 1440x900 under the 40px masthead
const inside = (r, b) => r.x >= 0 && r.y >= 0 && r.x + r.w <= b.w && r.y + r.h <= b.h;

function openAll(paths, b = WIDE) {
  let panes = [];
  paths.forEach((p, i) => (panes = openPath(panes, p, b, `p-${i}`)));
  return panes;
}

test("a new pane opens on the right half, inside the window, each later one a step down and left", () => {
  const first = placeNew(0, WIDE);
  assert.ok(inside(first, WIDE));
  assert.equal(first.y, EDGE);
  assert.equal(first.x + first.w, WIDE.w - EDGE);
  assert.ok(first.w >= 460 && first.w <= 820, `width ${first.w}`);
  const second = placeNew(1, WIDE);
  assert.equal(second.x, first.x - STEP);
  assert.equal(second.y, first.y + STEP);
  for (const b of [WIDE, { w: 768, h: 984 }, { w: 1024, h: 728 }, { w: 3000, h: 1800 }]) {
    for (let k = 0; k < MAX_PANES + 2; k++) assert.ok(inside(placeNew(k, b), b), `pane ${k} at ${b.w}x${b.h}`);
  }
});

test("a pane is moved, then shrunk, to stay inside the window; a window not laid out leaves it", () => {
  const b = { w: 800, h: 600 };
  assert.deepEqual(clampRect({ x: 700, y: 550, w: 400, h: 300 }, b), { x: 400, y: 300, w: 400, h: 300 });
  assert.deepEqual(clampRect({ x: -50, y: -10, w: 2000, h: 900 }, b), { x: 0, y: 0, w: 800, h: 600 });
  assert.deepEqual(clampRect({ x: 10, y: 10, w: 40, h: 30 }, b), { x: 10, y: 10, w: MIN_PANE.w, h: MIN_PANE.h });
  const r = { x: 5000, y: 5000, w: 10, h: 10 };
  assert.equal(clampRect(r, { w: 0, h: 0 }), r);
  const panes = openAll(["/seal", "/verify"]);
  assert.equal(clampAll(panes, WIDE), panes, "nothing to move: the same list");
  const small = clampAll(panes, { w: 500, h: 400 });
  assert.notEqual(small, panes);
  for (const p of small) assert.ok(inside(p, { w: 500, h: 400 }));
});

test("the newest pane is on top; opening an open path raises it instead of opening a copy", () => {
  let panes = openAll(["/seal", "/verify", "/files"]);
  assert.deepEqual(panes.map((p) => p.path), ["/seal", "/verify", "/files"]);
  assert.equal(topPane(panes).path, "/files");
  panes = openPath(panes, "/seal", WIDE, "p-new");
  assert.deepEqual(panes.map((p) => p.path), ["/verify", "/files", "/seal"]);
  assert.equal(panes.length, 3);
  assert.equal(topPane(panes).id, "p-0", "the same pane, not a new one");
});

test(`at most ${MAX_PANES} panes: one more closes the oldest`, () => {
  const paths = ["/seal", "/verify", "/files", "/fleet", "/overview", "/markets/prices"];
  const panes = openAll(paths);
  assert.equal(panes.length, MAX_PANES);
  assert.deepEqual(panes.map((p) => p.path), paths.slice(1));
});

test("raise, close and a link followed in a pane each change only what they say", () => {
  const panes = openAll(["/seal", "/verify", "/files"]);
  assert.equal(raise(panes, "p-2"), panes, "already on top");
  assert.equal(raise(panes, "nope"), panes);
  assert.deepEqual(raise(panes, "p-0").map((p) => p.id), ["p-1", "p-2", "p-0"]);
  assert.equal(closePane(panes, "nope"), panes);
  assert.deepEqual(closePane(panes, "p-1").map((p) => p.id), ["p-0", "p-2"]);
  assert.equal(topPane([]), undefined);
  assert.equal(setPath(panes, "p-1", "/verify"), panes);
  const moved = setPath(panes, "p-1", "/verify/DSWL_ESS_ESR1?arm=B");
  assert.equal(moved[1].path, "/verify/DSWL_ESS_ESR1?arm=B");
  assert.equal(moved[0], panes[0]);
});

test("rc-dock's layout: an empty dock and one single-tab float per pane, stacked in order, read back after a move", () => {
  const panes = openAll(["/seal", "/verify"]);
  const layout = toLayout(panes);
  assert.deepEqual(layout.dockbox.children, []);
  const floats = layout.floatbox.children;
  assert.deepEqual(floats.map((f) => [f.tabs[0].id, f.z]), [["p-0", 1], ["p-1", 2]]);
  assert.ok(floats.every((f) => f.group === "gp-pane" && f.activeId === f.tabs[0].id));

  assert.equal(fromLayout(floats, panes), panes, "nothing moved: the same list");
  // rc-dock moved the first pane and raised it (its z counter runs on past the panes').
  const after = floats.map((f) => (f.tabs[0].id === "p-0" ? { ...f, x: 40.4, y: 60, z: 9 } : f));
  const read = fromLayout(after, panes);
  assert.deepEqual(read.map((p) => p.id), ["p-1", "p-0"]);
  assert.deepEqual([read[1].x, read[1].y], [40, 60]);
  assert.equal(read[0], panes[1]);
  // A panel rc-dock no longer has is a pane closed; a panel with no pane is ignored.
  assert.deepEqual(fromLayout([floats[1], { tabs: [{ id: "stray" }], x: 0, y: 0, w: 1, h: 1, z: 3 }], panes).map((p) => p.id), ["p-1"]);
});

test("the panes this browser saved come back checked, and nothing else does", () => {
  const known = (path) => !path.startsWith("/gone");
  const panes = openAll(["/seal", "/battery/DSWL_ESS_ESR1?arm=B"]);
  assert.deepEqual(parseSaved(serialize(panes), known), panes);
  for (const raw of [null, "", "not json", "null", "[]", '{"v":2,"panes":[]}', '{"v":1}', '{"v":1,"panes":{}}']) {
    assert.deepEqual(parseSaved(raw, known), [], String(raw));
  }
  const rect = { x: 10, y: 10, w: 400, h: 300 };
  const saved = JSON.stringify({
    v: 1,
    panes: [
      { id: "a", path: "/seal", ...rect },
      { id: "a", path: "/files", ...rect }, // the same id twice
      { id: "b", path: "/seal", ...rect }, // the same path twice
      { id: "c", path: "/gone/tab", ...rect }, // no tab there now
      { id: "d", path: "//evil.example/x", ...rect },
      { id: "e", path: "https://evil.example/", ...rect },
      { id: "f", path: "/files", x: 10, y: 10, w: "400", h: 300 },
      { id: "g", path: "/files", x: 10, y: 10, w: 0, h: 300 },
      { id: "H!", path: "/files", ...rect },
      { id: "i", path: "/files", ...rect },
    ],
  });
  assert.deepEqual(parseSaved(saved, known).map((p) => p.id), ["a", "i"]);
  const many = JSON.stringify({ v: 1, panes: Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, path: `/t${i}`, ...rect })) });
  assert.deepEqual(parseSaved(many, () => true).map((p) => p.id), ["p4", "p5", "p6", "p7", "p8"]);
});

test("a pane holds a path on this site only", () => {
  for (const ok of ["/", "/seal", "/battery/DSWL_ESS_ESR1", "/verify/X?arm=B&hour=17"]) assert.ok(isPanePath(ok), ok);
  for (const bad of ["", "seal", "//evil.example", "/a b", "/x#y", "https://x", "/\\evil", "/".repeat(2) + "x", `/${"a".repeat(400)}`, 7]) {
    assert.equal(isPanePath(bad), false, String(bad));
  }
});

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [p] : [];
  });
}

test("rc-dock and the layer load only on first use: one dynamic import, from the front door", () => {
  const files = sourceFiles(src).map((p) => ({ p: relative(src, p), text: readFileSync(p, "utf8") }));
  const rcDock = files.filter((f) => /from\s+["']rc-dock/.test(f.text) || /import\s+["']rc-dock/.test(f.text)).map((f) => f.p);
  assert.deepEqual(rcDock, [join("float", "layer.tsx")]);
  const staticLayer = files.filter((f) => /^\s*import[^;]*from\s+["'][./]*(float\/)?layer["']/m.test(f.text)).map((f) => f.p);
  assert.deepEqual(staticLayer, [], "no static import of the layer");
  const dynamic = files.filter((f) => /import\(\s*["']\.\/layer["']\s*\)/.test(f.text)).map((f) => f.p);
  assert.deepEqual(dynamic, [join("float", "index.ts")]);
  const front = files.find((f) => f.p === join("float", "index.ts")).text;
  assert.doesNotMatch(front, /from\s+["']\.\/model["']/, "the front door does not pull the model into first paint");
});
