// The control room's panes as dock panes (src/pages/Overview/room-band.ts, RoomBand.tsx): one pane per part of the
// room in its reading order, each named as its part titles it; a part the build leaves out is no pane and a part
// waiting for its data keeps its place; the default arrangement at 1440 wide keeps the room's own, the landscape's
// middle open; and ControlRoom draws the band with the room's own column for narrow rooms. Run with `pnpm test` (Node
// 22.18 or later runs the TypeScript modules directly; the hook below adds the ".ts" that Vite resolves on its own).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const { ROOM_BOTTOM_WITH_NESS, ROOM_COLUMN, ROOM_KEY, ROOM_MIN_WIDTH, ROOM_PANES, roomPanes } = await import("../src/pages/Overview/room-band.ts");
const { arrange, BAND_EDGE, BAND_GAP, columnWidth, neededHeight } = await import("../src/float/band-model.ts");

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const overview = join(site, "src", "pages", "Overview");
const read = (name) => readFileSync(join(overview, name), "utf8");
const overlap = (a, c) => a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;

test("one pane per part of the room, in its reading order, each named as the part titles it", () => {
  assert.deepEqual(ROOM_PANES.map((p) => p.id), ["seal", "verify", "morph", "fleet", "ness", "start"]);
  const room = read("ControlRoom.tsx");
  for (const p of ROOM_PANES.filter((x) => x.id !== "start")) {
    assert.ok(room.includes(`title="${p.title}"`), `ControlRoom titles a pane "${p.title}"`);
  }
  for (const p of ROOM_PANES) assert.match(p.title, /^[A-Z0-9]/, `${p.id}: a name in title case`);
  assert.equal(ROOM_KEY, "gp.room");
});

test("a part the build leaves out is no pane; a part waiting for its data keeps its place", () => {
  const waiting = { waiting: true };
  const panes = roomPanes({ seal: null, verify: "v", morph: "m", fleet: null, ness: undefined, start: "s" }, waiting);
  assert.deepEqual(panes.map((p) => p.id), ["seal", "verify", "morph", "fleet", "start"]);
  assert.equal(panes[0].content, waiting);
  assert.equal(panes[1].content, "v");
  assert.equal(panes[3].content, waiting);
  assert.ok(panes.every((p) => typeof p.title === "string" && p.side));
});

test("at 1440 wide the room keeps its own arrangement: the two sides, Ask Ness under the middle, the foot", () => {
  const b0 = { w: 1440 - 190, h: 0 }; // the room beside the side panel
  const opts = { foot: "full", top: { left: BAND_EDGE + 186 + BAND_GAP, right: BAND_EDGE + 36 }, bottom: ROOM_BOTTOM_WITH_NESS, column: ROOM_COLUMN };
  const b = { w: b0.w, h: neededHeight(ROOM_PANES, b0, opts) };
  const r = arrange(ROOM_PANES, b, opts);
  const { col } = columnWidth(b, opts);
  assert.equal(col, 340, "the room's own column width");
  for (const id of ["seal", "verify"]) assert.equal(r[id].x, BAND_EDGE, `${id} on the left`);
  for (const id of ["morph", "fleet"]) assert.equal(r[id].x + r[id].w, b.w - BAND_EDGE, `${id} on the right`);
  assert.deepEqual([r.start.x, r.start.w], [BAND_EDGE, b.w - 2 * BAND_EDGE], "the foot spans the room");
  assert.equal(r.start.y + r.start.h, b.h - ROOM_BOTTOM_WITH_NESS, "the launcher's room kept under it");
  assert.equal(r.ness.y + r.ness.h, r.start.y - BAND_GAP, "Ask Ness stands on the foot");
  assert.ok(Math.abs(r.ness.x + r.ness.w / 2 - b.w / 2) <= 1 && r.ness.w <= 470, "under the middle, as wide as the room sets it");
  const all = Object.values(r);
  all.forEach((a, i) => all.slice(i + 1).forEach((c) => assert.ok(!overlap(a, c))));
  const middle = { x: BAND_EDGE + col, y: 0, w: b.w - 2 * (BAND_EDGE + col), h: r.ness.y };
  assert.ok(middle.w >= 500 && middle.h >= 400, `the landscape's middle ${middle.w} x ${middle.h} px`);
  assert.ok(all.every((p) => !overlap(p, middle)), "the middle above Ask Ness open");
  for (const p of ROOM_PANES) assert.equal(r[p.id].h, p.h, `${p.id} at its height`);
  // At 1280 wide the columns keep 340 px and Ask Ness still stands under the middle.
  const n = arrange(ROOM_PANES, { w: 1280 - 190, h: 1400 }, opts);
  assert.equal(n.seal.w, 340);
  assert.ok(n.ness.x > n.seal.x + n.seal.w && n.ness.x + n.ness.w < n.morph.x, "Ask Ness in the middle at 1280");
});

test("ControlRoom draws the band from 1000px of room, with the room's own column under it", () => {
  const room = read("ControlRoom.tsx");
  assert.match(room, /import \{ RoomBand \} from "\.\/RoomBand";/);
  assert.match(room, /<RoomBand\s/);
  assert.match(room, /stacked=\{\s*<div className="ov-room__panes">/);
  const band = read("RoomBand.tsx");
  assert.match(band, /minWidth=\{ROOM_MIN_WIDTH\}/);
  assert.match(band, /bottom=\{parts\.ness === undefined \? undefined : ROOM_BOTTOM_WITH_NESS\}/);
  assert.match(band, /column=\{ROOM_COLUMN\}/);
  assert.match(read("control-room.css"), /minmax\(300px, 340px\)/, "the room's own grid's column");
  assert.match(read("control-room.css"), new RegExp(`padding-bottom: ${ROOM_BOTTOM_WITH_NESS}px`), "the room's own grid keeps the same room");
  assert.equal(ROOM_MIN_WIDTH, 1000);
  assert.match(read("control-room.css"), /@container ov-room \(min-width: 1000px\)/, "the room's grid takes the same breakpoint");
});
