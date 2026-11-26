// Ask Ness's frame (src/ness/frame.ts), as wattness.tech's Ness keeps its window: the three modes and how Esc steps
// down them, the column beside the page and where the page narrows for it, a floating window kept on screen, and the
// frame kept in this browser read back safely. The several pages an answer lights (src/ness/logic.ts) are here too.
// Runs offline.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  besideLayout,
  clampWidth,
  DEFAULT_FRAME,
  defaultFloat,
  DOCK_ZONE,
  EDGE,
  FLOAT_MIN,
  inDockZone,
  keepInView,
  PAGE_MIN,
  pulled,
  readFrame,
  stepDown,
  WIDTH,
  writeFrame,
} from "../src/ness/frame.ts";
import { litPages, liveFocusPages } from "../src/ness/logic.ts";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("Esc steps down a mode: full screen to the reader's other mode, beside and floating to the launcher", () => {
  assert.equal(stepDown("full", "beside"), "beside");
  assert.equal(stepDown("full", "float"), "float");
  assert.equal(stepDown("beside", "beside"), "closed");
  assert.equal(stepDown("float", "beside"), "closed");
});

test("the column's width stays between its least and most, in whole pixels", () => {
  assert.equal(clampWidth(100), WIDTH.min);
  assert.equal(clampWidth(5000), WIDTH.max);
  assert.equal(clampWidth(420.4), 420);
});

test("the page narrows for the column where it keeps its room, and the column covers it where it cannot", () => {
  const wide = besideLayout(1440, 420);
  assert.deepEqual(wide, { narrows: true, width: 420 });
  assert.ok(1440 - wide.width >= PAGE_MIN);
  // wider than leaves the page its room: the column stops where the page keeps PAGE_MIN
  assert.deepEqual(besideLayout(1440, 640), { narrows: true, width: 1440 - PAGE_MIN });
  // a smaller view: the column covers the page's right side at the reader's width
  assert.deepEqual(besideLayout(1280, 420), { narrows: false, width: 420 });
  assert.deepEqual(besideLayout(900, 640), { narrows: false, width: 640 });
});

test("a floating window stays on screen, at least its least size, under the masthead where it first floats", () => {
  const r = keepInView({ x: -200, y: -50, w: 100, h: 100 }, 1440, 900);
  assert.deepEqual(r, { x: EDGE, y: EDGE, w: FLOAT_MIN.w, h: FLOAT_MIN.h });
  const far = keepInView({ x: 5000, y: 5000, w: 440, h: 600 }, 1440, 900);
  assert.equal(far.x + far.w, 1440 - EDGE);
  assert.equal(far.y + far.h, 900 - EDGE);
  const big = keepInView({ x: 0, y: 0, w: 4000, h: 4000 }, 1440, 900);
  assert.deepEqual(big, { x: EDGE, y: EDGE, w: 1440 - 2 * EDGE, h: 900 - 2 * EDGE });
  const first = defaultFloat(1440, 900, 40);
  assert.equal(first.w, 440);
  assert.equal(first.y, 40 + EDGE);
  assert.ok(first.x + first.w <= 1440 - EDGE && first.y + first.h <= 900 - EDGE);
});

test("a window let go at the right edge docks beside the page; a press becomes a drag only once it moves", () => {
  assert.ok(inDockZone(1440 - DOCK_ZONE, 1440));
  assert.ok(!inDockZone(1440 - DOCK_ZONE - 1, 1440));
  assert.ok(!pulled(3, 4));
  assert.ok(pulled(6, 6));
});

test("the frame kept in this browser reads back, and anything else opens the default", () => {
  const s = { mode: "float", width: 480, float: { x: 100.4, y: 60, w: 440, h: 600 } };
  assert.deepEqual(readFrame(writeFrame(s)), { mode: "float", width: 480, float: { x: 100, y: 60, w: 440, h: 600 } });
  for (const raw of [null, "", "not json", "null", "[]", "42"]) assert.deepEqual(readFrame(raw), DEFAULT_FRAME, String(raw));
  // full screen is a moment, never a mode to reopen into; a width out of range is brought in; a broken rect is dropped
  assert.deepEqual(readFrame(JSON.stringify({ mode: "full", width: 9000, float: { x: "a" } })), { mode: "beside", width: WIDTH.max, float: null });
});

test("an answer lights its own page first, then the others, each once", () => {
  assert.deepEqual(litPages("grand-prix:gaterecord"), ["grand-prix:gaterecord"]);
  assert.deepEqual(litPages(null), []);
  assert.deepEqual(litPages("grand-prix:gaterecord", ["grand-prix:seal-tab", "grand-prix:gaterecord", "bad", ":x"]), ["grand-prix:gaterecord", "grand-prix:seal-tab"]);
  assert.deepEqual(litPages(null, ["terminal:fleet-board"]), ["terminal:fleet-board"]);
});

test("pages in one brain bring it to the center with the first pinned; pages in several show the combined brain", () => {
  assert.deepEqual(liveFocusPages([]), { brain: "all", page: null });
  assert.deepEqual(liveFocusPages(["grand-prix:gaterecord", "grand-prix:seal-tab"]), { brain: "grand-prix", page: "gaterecord" });
  assert.deepEqual(liveFocusPages(["grand-prix:gaterecord", "battery-review:dswl-ess-esr1"]), { brain: "all", page: null });
});

test("the panel keeps its creed, its three modes and the brains in the chat, and loads the stage only when open", () => {
  const panel = readFileSync(join(site, "src", "ness", "NessPanel.tsx"), "utf8");
  for (const label of ["Float Ask Ness as a window", "Put Ask Ness beside the page", "Full screen", "Exit full screen", "Minimize Ask Ness"])
    assert.ok(panel.includes(label), label);
  assert.match(panel, /<NessBrain pages=\{lit\} live=\{open && !onMemory\}[^>]*\/>/);
  const live = readFileSync(join(site, "src", "ness", "BrainLive.tsx"), "utf8");
  assert.match(live, /import\("@world\/stations\/brain\/mount"\)/, "the stage loads by dynamic import");
  assert.match(live, /h\?\.dispose\(\)/, "the stage lets go of its context when the panel closes");
});
