// A band of dock panes (src/float/band-model.ts): the default arrangement around the band's middle, places kept as
// fractions of the band, what follows the window and what the reader fixes, raise, close, reopen and reset, rc-dock's
// layout both ways and what this browser may hand back; and that the band's dock (rc-dock included) is reached only by
// its one dynamic import. Run with `pnpm test` (Node 22.18 or later runs the TypeScript modules directly; the hook
// below adds the ".ts" that Vite resolves on its own).

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
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

const {
  arrange,
  BAND_EDGE,
  BAND_GAP,
  BAND_MIN,
  bandTabId,
  clampIn,
  CLEAR_MIN,
  columnWidth,
  closeIn,
  defaultState,
  fitState,
  fromBandLayout,
  isOpen,
  neededHeight,
  NUDGE,
  nudgeFor,
  nudgeIn,
  paneOfTab,
  parseBand,
  placeOf,
  raiseIn,
  reopenIn,
  restoreBand,
  serializeBand,
  syncSpecs,
  toBandLayout,
  toFrac,
  toPx,
} = await import("../src/float/band-model.ts");

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..", "src");

// Six parts, as a control room might hold them: two down each side, two along the foot of the middle.
const SPECS = [
  { id: "seal", side: "left" },
  { id: "verify", side: "left", weight: 1.4 },
  { id: "fleet", side: "right", weight: 1.6 },
  { id: "ness", side: "right" },
  { id: "morph", side: "bottom" },
  { id: "roles", side: "bottom", weight: 1.5 },
];
const WIDE = { w: 1200, h: 600 }; // a band a little narrower than the room at 1440 wide (1250, beside the side panel)
const inside = (r, b) => r.x >= 0 && r.y >= 0 && r.x + r.w <= b.w && r.y + r.h <= b.h;
const overlap = (a, c) => a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;

test("the default arrangement: a column down each side, the foot of the middle, the middle itself clear", () => {
  const B = { w: 1250, h: 600 }; // the band at 1440 wide, beside the side panel
  const r = arrange(SPECS, B);
  assert.deepEqual(Object.keys(r).sort(), SPECS.map((s) => s.id).sort());
  for (const s of SPECS) assert.ok(inside(r[s.id], B), `${s.id} inside`);
  // The columns: flush to the edges, a gap between panes, heights by weight, the full height used.
  assert.equal(r.seal.x, BAND_EDGE);
  assert.equal(r.seal.y, BAND_EDGE);
  assert.equal(r.verify.y, r.seal.y + r.seal.h + BAND_GAP);
  assert.equal(r.verify.y + r.verify.h, B.h - BAND_EDGE);
  assert.ok(r.verify.h > r.seal.h, "weight 1.4 is the taller");
  assert.equal(r.fleet.x + r.fleet.w, B.w - BAND_EDGE);
  assert.equal(r.ness.y + r.ness.h, B.h - BAND_EDGE);
  // The foot: between the columns, along the bottom, widths by weight.
  assert.equal(r.morph.x, r.seal.x + r.seal.w + BAND_GAP);
  assert.equal(r.roles.x + r.roles.w, r.fleet.x - BAND_GAP);
  assert.equal(r.roles.y + r.roles.h, B.h - BAND_EDGE);
  assert.ok(r.roles.w > r.morph.w);
  // No two panes overlap, and the middle above the foot is clear and at least CLEAR_MIN wide.
  const all = SPECS.map((s) => r[s.id]);
  all.forEach((a, i) => all.slice(i + 1).forEach((c) => assert.ok(!overlap(a, c), "panes overlap")));
  const middle = { x: r.seal.x + r.seal.w, y: 0, w: r.fleet.x - (r.seal.x + r.seal.w), h: r.morph.y };
  assert.ok(middle.w >= CLEAR_MIN && middle.h > B.h / 2, `middle ${middle.w}x${middle.h}`);
  assert.ok(all.every((p) => !overlap(p, middle)));
});

test("at every width no default pane is drawn under its smallest size, so none overlap, and a middle stays clear", () => {
  const specs = [...SPECS.slice(0, 4), { ...SPECS[4], min: { w: 260, h: 150 } }, SPECS[5]];
  for (const w of [780, 900, 1024, 1100, 1202, 1249, 1440, 1920, 2400]) {
    for (const h of [480, 560, 640, 760]) {
      const b = { w, h };
      const s = defaultState(specs, b);
      const drawn = specs.map((spec) => ({ spec, r: placeOf(s, spec, b) }));
      for (const { spec, r } of drawn) {
        const min = spec.min ?? BAND_MIN;
        assert.ok(inside(r, b), `${spec.id} inside at ${w}x${h}`);
        assert.ok(r.w >= min.w && r.h >= min.h, `${spec.id} ${r.w}x${r.h} at ${w}x${h}`);
      }
      drawn.forEach((a, i) => drawn.slice(i + 1).forEach((c) => assert.ok(!overlap(a.r, c.r), `${a.spec.id} and ${c.spec.id} overlap at ${w}x${h}`)));
      if (w >= 900) {
        // The columns stand on the band's edges; the foot's panes, if the middle has room for them, along its bottom.
        const lefts = drawn.filter(({ r }) => r.x === BAND_EDGE).map(({ r }) => r.x + r.w);
        const rights = drawn.filter(({ r }) => r.x + r.w === w - BAND_EDGE).map(({ r }) => r.x);
        const foot = drawn.filter(({ r }) => r.x !== BAND_EDGE && r.x + r.w !== w - BAND_EDGE).map(({ r }) => r.y);
        const middle = { x: Math.max(...lefts), y: 0, w: Math.min(...rights) - Math.max(...lefts), h: Math.min(h, ...foot) };
        assert.ok(middle.w >= CLEAR_MIN && middle.h >= h / 2, `a middle ${middle.w}x${middle.h} at ${w}x${h}`);
        assert.ok(drawn.every(({ r }) => !overlap(r, middle)), `the middle is clear at ${w}x${h}`);
      }
    }
  }
});

test("panes that give a height open at it, the last down at its column's foot; a full foot spans the band under them", () => {
  const specs = [
    { id: "seal", side: "left", h: 220 },
    { id: "verify", side: "left", h: 200 },
    { id: "morph", side: "right", h: 200 },
    { id: "fleet", side: "right", h: 240 },
    { id: "ness", side: "right", h: 180 },
    { id: "start", side: "bottom", h: 150, min: { w: 640, h: 120 } },
  ];
  const b = { w: 1250, h: 900 };
  const r = arrange(specs, b, { foot: "full" });
  assert.deepEqual(r.start, { x: BAND_EDGE, y: b.h - BAND_EDGE - 150, w: b.w - 2 * BAND_EDGE, h: 150 });
  const colFoot = r.start.y - BAND_GAP;
  assert.deepEqual([r.seal.y, r.seal.h], [BAND_EDGE, 220]);
  assert.deepEqual([r.verify.y + r.verify.h, r.verify.h], [colFoot, 200], "the last pane stands at the column's foot");
  assert.deepEqual([r.morph.y, r.fleet.y, r.fleet.h], [BAND_EDGE, BAND_EDGE + 200 + BAND_GAP, 240]);
  assert.equal(r.ness.y + r.ness.h, colFoot);
  const all = Object.values(r);
  all.forEach((a, i) => all.slice(i + 1).forEach((c) => assert.ok(!overlap(a, c))));
  // The middle foot is the default; a band too short for the heights fills each column by them, none overlapping.
  const roomy = specs.map((x) => (x.id === "start" ? { ...x, min: undefined } : x));
  assert.equal(arrange(roomy, b).start.x, r.seal.x + r.seal.w + BAND_GAP);
  assert.equal(arrange(specs, b).start.x, BAND_EDGE, "the middle too narrow for its smallest width: it joins a column");
  for (const h of [520, 560, 600, 680]) {
    const s = arrange(specs, { w: 1250, h }, { foot: "full" });
    const shortAll = Object.values(s);
    shortAll.forEach((a, i) => shortAll.slice(i + 1).forEach((c) => assert.ok(!overlap(a, c), `overlap at 1250x${h}`)));
    assert.ok(shortAll.every((p) => p.h >= BAND_MIN.h), `a pane under its smallest at 1250x${h}`);
  }
  const s = arrange(specs, { w: 1250, h: 600 }, { foot: "full" });
  assert.equal(s.ness.y + s.ness.h, s.start.y - BAND_GAP);
  assert.ok(s.fleet.h > s.ness.h, "filled in proportion to the heights asked");
  // Too narrow for the full foot's smallest width: it joins a column.
  const narrow = arrange(specs, { w: 600, h: 900 }, { foot: "full" });
  assert.deepEqual([narrow.start.x, narrow.start.w], [narrow.seal.x, narrow.seal.w], "it joins the shorter column");
});

test("each column starts under what stands in its corner: the page's head on the left, the panes menu on the right", () => {
  const specs = [
    { id: "seal", side: "left", h: 250 },
    { id: "verify", side: "left", h: 190 },
    { id: "morph", side: "right", h: 300 },
    { id: "fleet", side: "right", h: 260 },
    { id: "start", side: "bottom", h: 180, min: { w: 640, h: 120 } },
  ];
  const b = { w: 1250, h: 860 };
  const { col, tight } = columnWidth(b);
  assert.equal(tight, false);
  const r = arrange(specs, b, { foot: "full", top: { left: 226, right: 56 } });
  assert.equal(r.seal.y, 226);
  assert.equal(r.morph.y, 56);
  assert.equal(r.seal.w, col);
  const colFoot = r.start.y - BAND_GAP;
  assert.equal(r.verify.y + r.verify.h, colFoot);
  assert.equal(r.fleet.y + r.fleet.h, colFoot);
  const all = Object.values(r);
  all.forEach((a, i) => all.slice(i + 1).forEach((c) => assert.ok(!overlap(a, c))));
  // A head too tall for the left column's heights: the column shares out what is left, each pane at least its smallest.
  const low = arrange(specs, b, { foot: "full", top: { left: 420 } });
  assert.equal(low.seal.y, 420);
  assert.ok(low.seal.h + low.verify.h + BAND_GAP <= low.start.y - BAND_GAP - 420 + 1);
  assert.ok(low.seal.h >= BAND_MIN.h && low.verify.h >= BAND_MIN.h);
  assert.equal(arrange(specs, b, { top: { left: -50, right: 99999 } }).seal.y, BAND_EDGE, "a top outside the band is held to it");
  assert.deepEqual(columnWidth({ w: 700, h: 500 }), { col: Math.floor((700 - 2 * BAND_EDGE - BAND_GAP) / 2), tight: true });
});

test("a band as tall as it needs opens every pane at its height, whatever the columns' tops and the foot", () => {
  const specs = [
    { id: "seal", side: "left", h: 296 },
    { id: "verify", side: "left", h: 192 },
    { id: "morph", side: "right", h: 310 },
    { id: "fleet", side: "right", h: 298 },
    { id: "ness", side: "right", h: 230 },
    { id: "start", side: "bottom", h: 245, min: { w: 640, h: 120 } },
  ];
  for (const w of [1090, 1250, 1730]) {
    for (const opts of [{ foot: "full", top: { left: 214, right: 52 } }, { foot: "full" }, {}, { top: { left: 300 } }]) {
      const b = { w, h: neededHeight(specs, { w, h: 0 }, opts) };
      const r = arrange(specs, b, opts);
      for (const spec of specs) assert.equal(r[spec.id].h, spec.h, `${spec.id} at ${w}x${b.h} ${JSON.stringify(opts)}`);
      const all = Object.values(r);
      all.forEach((a, i) => all.slice(i + 1).forEach((c) => assert.ok(!overlap(a, c), `overlap at ${w}x${b.h}`)));
      for (const p of all) assert.ok(inside(p, b));
    }
  }
  assert.equal(neededHeight(specs, { w: 0, h: 0 }), 0);
});

test("a pane in the middle stands at its bottom, centered, on the foot; the room kept at the foot is kept", () => {
  const specs = [
    { id: "seal", side: "left", h: 296 },
    { id: "verify", side: "left", h: 192 },
    { id: "morph", side: "right", h: 316 },
    { id: "fleet", side: "right", h: 298 },
    { id: "ness", side: "middle", w: 470, h: 170, min: { w: 300, h: 120 } },
    { id: "start", side: "bottom", h: 245, min: { w: 640, h: 120 } },
  ];
  const opts = { foot: "full", top: { left: 214, right: 52 }, bottom: 64 };
  for (const w of [1090, 1250, 1730]) {
    const b = { w, h: neededHeight(specs, { w, h: 0 }, opts) };
    const r = arrange(specs, b, opts);
    const { col } = columnWidth(b);
    assert.equal(r.start.y + r.start.h, b.h - 64, `the foot ends 64 px above the band's bottom at ${w}`);
    assert.equal(r.ness.y + r.ness.h, r.start.y - BAND_GAP, "Ask Ness stands on the foot");
    assert.ok(Math.abs(r.ness.x + r.ness.w / 2 - b.w / 2) <= 1, "centered");
    assert.ok(r.ness.w <= 470 && r.ness.w >= 300 && r.ness.x >= BAND_EDGE + col + BAND_GAP, `width ${r.ness.w} inside the middle`);
    for (const spec of specs) assert.equal(r[spec.id].h, spec.h, `${spec.id} at its height at ${w}`);
    const all = Object.values(r);
    all.forEach((a, i) => all.slice(i + 1).forEach((c) => assert.ok(!overlap(a, c), `overlap at ${w}`)));
  }
  // No middle to stand in: it joins a column.
  const tight = arrange(specs, { w: 700, h: 1400 }, opts);
  assert.ok(tight.ness.x === BAND_EDGE || tight.ness.x + tight.ness.w === 700 - BAND_EDGE, "in a column");
});

test("the columns keep the least width a page asks for, and a middle pane too wide for what is left joins a column", () => {
  assert.equal(columnWidth({ w: 1090, h: 800 }).col, Math.round(1090 * 0.272));
  assert.deepEqual(columnWidth({ w: 1090, h: 800 }, { column: 340 }), { col: 340, tight: false });
  assert.deepEqual(columnWidth({ w: 1730, h: 800 }, { column: 340 }), { col: 400, tight: false }, "at most 400 on a wide band");
  assert.deepEqual(columnWidth({ w: 1730, h: 800 }, { column: 480 }), { col: 480, tight: false }, "a least over 400 wins");
  const specs = [
    { id: "a", side: "left", h: 200 },
    { id: "b", side: "right", h: 200 },
    { id: "m", side: "middle", w: 470, h: 160, min: { w: 300, h: 120 } },
  ];
  const wide = arrange(specs, { w: 1090, h: 800 }, { column: 340 });
  assert.equal(wide.a.w, 340);
  assert.ok(wide.m.x > wide.a.x + wide.a.w && wide.m.x + wide.m.w < wide.b.x, "in the middle");
  const narrow = arrange(specs, { w: 1000, h: 800 }, { column: 340 });
  assert.ok(narrow.m.x === BAND_EDGE || narrow.m.x + narrow.m.w === 1000 - BAND_EDGE, "264 px of middle: it joins a column");
});

test("a band too narrow for a clear middle gets two columns that meet; one not laid out gets nothing", () => {
  const b = { w: 720, h: 560 };
  const r = arrange(SPECS, b);
  for (const s of SPECS) assert.ok(inside(r[s.id], b), `${s.id} inside`);
  assert.equal(new Set(Object.values(r).map((p) => p.x)).size, 2, "two columns");
  const all = Object.values(r);
  all.forEach((a, i) => all.slice(i + 1).forEach((c) => assert.ok(!overlap(a, c))));
  assert.deepEqual(arrange(SPECS, { w: 0, h: 0 }), {});
  for (const w of [900, 1024, 1249, 1600, 2400]) {
    const wide = arrange(SPECS, { w, h: 640 });
    for (const s of SPECS) assert.ok(inside(wide[s.id], { w, h: 640 }), `${s.id} at ${w}`);
  }
});

test("places are fractions of the band: they scale with it, and come back to the px they were", () => {
  const r = { x: 300, y: 120, w: 333, h: 217 };
  assert.deepEqual(toPx(toFrac(r, WIDE), WIDE), r);
  assert.deepEqual(toPx(toFrac(r, WIDE), { w: 600, h: 300 }), { x: 150, y: 60, w: 167, h: 109 });
  assert.deepEqual(clampIn({ x: 1100, y: 590, w: 300, h: 200 }, WIDE), { x: 900, y: 400, w: 300, h: 200 });
  assert.deepEqual(clampIn({ x: 10, y: 10, w: 20, h: 20 }, WIDE), { x: 10, y: 10, w: BAND_MIN.w, h: BAND_MIN.h });
  assert.deepEqual(clampIn({ x: 10, y: 10, w: 20, h: 20 }, WIDE, { w: 100, h: 50 }), { x: 10, y: 10, w: 100, h: 50 });
  const odd = { x: 5000, y: 0, w: 1, h: 1 };
  assert.equal(clampIn(odd, { w: 0, h: 0 }), odd);
});

test("the default follows the band's size until the reader changes a pane; then the places are theirs", () => {
  const s0 = defaultState(SPECS, WIDE);
  assert.deepEqual(s0.stack, SPECS.map((s) => s.id));
  assert.equal(s0.custom, false);
  assert.equal(fitState(s0, SPECS, WIDE), s0, "the same size: the same state");
  const b = { w: 1000, h: 560 };
  const s1 = fitState(s0, SPECS, b);
  assert.deepEqual(s1.places, defaultState(SPECS, b).places, "worked out again for the new size");
  const custom = closeIn(s0, "ness");
  assert.equal(fitState(custom, SPECS, b), custom, "the reader's band is kept");
  for (const s of SPECS) assert.ok(inside(placeOf(custom, s, b), b));
});

test("raise, close and reopen each do only what they say", () => {
  const s0 = defaultState(SPECS, WIDE);
  assert.equal(raiseIn(s0, "roles"), s0, "already on top");
  assert.equal(raiseIn(s0, "nope"), s0);
  const raised = raiseIn(s0, "seal");
  assert.deepEqual(raised.stack.at(-1), "seal");
  assert.equal(raised.custom, false, "a press is not a change of arrangement");
  const closed = closeIn(raised, "verify");
  assert.equal(isOpen(closed, "verify"), false);
  assert.equal(closed.custom, true);
  assert.deepEqual(closed.places.verify, s0.places.verify, "it keeps its place");
  assert.equal(closeIn(closed, "verify"), closed);
  const back = reopenIn(closed, "verify");
  assert.equal(back.stack.at(-1), "verify", "back on top");
  assert.deepEqual(reopenIn(back, "seal").stack.at(-1), "seal", "reopening an open pane raises it");
});

test("the keyboard's drag: an arrow moves a pane a step, Shift with an arrow resizes it, inside the band", () => {
  assert.deepEqual(nudgeFor("ArrowRight", false), { dx: NUDGE, dy: 0 });
  assert.deepEqual(nudgeFor("ArrowUp", true), { dw: 0, dh: -NUDGE });
  assert.equal(nudgeFor("Enter", false), null);
  const s0 = defaultState(SPECS, WIDE);
  const seal = SPECS[0];
  const r0 = placeOf(s0, seal, WIDE);
  const moved = nudgeIn(s0, seal, WIDE, nudgeFor("ArrowRight", false));
  assert.deepEqual(placeOf(moved, seal, WIDE), { ...r0, x: r0.x + NUDGE });
  assert.equal(moved.custom, true);
  assert.equal(moved.stack.at(-1), "seal", "the pane moved comes on top");
  const grown = nudgeIn(moved, seal, WIDE, nudgeFor("ArrowDown", true));
  assert.deepEqual(placeOf(grown, seal, WIDE), { ...r0, x: r0.x + NUDGE, h: r0.h + NUDGE });
  // At the band's edge a step goes no further: only raised.
  let edge = s0;
  for (let i = 0; i < 10; i++) edge = nudgeIn(edge, seal, WIDE, nudgeFor("ArrowLeft", false));
  assert.equal(placeOf(edge, seal, WIDE).x, 0);
  assert.equal(nudgeIn(edge, seal, WIDE, nudgeFor("ArrowLeft", false)), edge);
  assert.equal(nudgeIn(closeIn(s0, "seal"), seal, WIDE, { dx: 16 }).places.seal, s0.places.seal, "a closed pane stays put");
});

test("a pane the page adds later opens on top at its place; a pane it drops leaves the stack; a closed one stays closed", () => {
  const later = SPECS.filter((s) => s.id !== "seal");
  const s0 = defaultState(later, WIDE);
  assert.equal(syncSpecs(s0, later, WIDE), s0, "the same panes: the same state");
  const s1 = syncSpecs(s0, SPECS, WIDE);
  assert.equal(s1.stack.at(-1), "seal");
  assert.deepEqual(s1.places, defaultState(SPECS, WIDE).places, "untouched by the reader: the whole default again");
  const custom = closeIn(raiseIn(s0, "fleet"), "ness");
  const s2 = syncSpecs(custom, SPECS, WIDE);
  assert.deepEqual(s2.stack, [...custom.stack, "seal"]);
  assert.equal(isOpen(s2, "ness"), false);
  for (const id of custom.stack) assert.deepEqual(s2.places[id], custom.places[id], `${id} kept its place`);
  assert.deepEqual(s2.places.seal, defaultState(SPECS, WIDE).places.seal);
  const s3 = syncSpecs(s2, SPECS.filter((s) => s.id !== "fleet"), WIDE);
  assert.equal(isOpen(s3, "fleet"), false);
  assert.equal(s3.stack.length, s2.stack.length - 1);
});

test("rc-dock's layout: one float per open pane in the page's order, the stack as z, read back after a move", () => {
  let s = closeIn(raiseIn(defaultState(SPECS, WIDE), "seal"), "ness");
  const floats = toBandLayout(s, SPECS, WIDE).floatbox.children;
  assert.deepEqual(floats.map((f) => paneOfTab(f.tabs[0].id)), ["seal", "verify", "fleet", "morph", "roles"]);
  assert.deepEqual(floats.map((f) => f.z), [5, 1, 2, 3, 4]);
  assert.ok(floats.every((f) => f.activeId === f.tabs[0].id && f.tabs[0].id === bandTabId(paneOfTab(f.tabs[0].id))));
  assert.equal(paneOfTab("p-123"), "", "a float layer tab is not the band's");

  assert.equal(fromBandLayout(floats, s, SPECS, WIDE), s, "nothing moved: the same state");
  // The reader drags Verify off the band's right edge and rc-dock raises it past the others.
  const dragged = floats.map((f) => (f.id.endsWith("verify") ? { ...f, x: 1150.4, y: 40, z: 9 } : f));
  const read = fromBandLayout(dragged, s, SPECS, WIDE);
  assert.equal(read.custom, true);
  assert.equal(read.stack.at(-1), "verify");
  const r = placeOf(read, SPECS[1], WIDE);
  assert.equal(r.x + r.w, WIDE.w, "kept inside the band");
  assert.equal(r.y, 40);
  // A pane whose panel rc-dock no longer draws is closed.
  s = fromBandLayout(floats.filter((f) => !f.id.endsWith("fleet")), s, SPECS, WIDE);
  assert.equal(isOpen(s, "fleet"), false);
  assert.equal(s.custom, true);
});

test("the band this browser saved comes back checked; a pane it did not know opens on top", () => {
  const s = closeIn(reopenIn(closeIn(defaultState(SPECS, WIDE), "roles"), "roles"), "ness");
  const saved = parseBand(serializeBand(s, SPECS), SPECS);
  assert.deepEqual(saved.stack, s.stack);
  assert.deepEqual(saved.closed, ["ness"]);
  const back = restoreBand(saved, SPECS, WIDE);
  assert.deepEqual(back.stack, s.stack);
  assert.deepEqual(back.places, s.places);
  assert.equal(back.custom, true);

  for (const raw of [null, "", "not json", "null", "[]", '{"v":2,"places":{},"stack":[],"closed":[]}', '{"v":1,"places":{}}', '{"v":1,"places":[],"stack":{},"closed":[]}']) {
    assert.equal(parseBand(raw, SPECS), null, String(raw));
  }
  const odd = JSON.stringify({
    v: 1,
    places: {
      seal: [0.1, 0.1, 0.2, 0.3],
      verify: [0.1, 0.1, 0, 0.3], // no width
      fleet: [0.1, 2, 0.2, 0.3], // off the band
      ness: ["0.1", 0.1, 0.2, 0.3],
      gone: [0.1, 0.1, 0.2, 0.3], // a pane the page no longer has
    },
    stack: ["seal", "seal", "gone", 7, "verify"],
    closed: ["verify", "fleet"],
  });
  const read = parseBand(odd, SPECS);
  assert.deepEqual(Object.keys(read.places), ["seal"]);
  assert.deepEqual(read.stack, ["seal", "verify"]);
  assert.deepEqual(read.closed, ["fleet"]);
  const merged = restoreBand(read, SPECS, WIDE);
  assert.deepEqual(merged.stack, ["seal", "verify", "ness", "morph", "roles"], "the panes it did not name open on top");
  assert.deepEqual(merged.places.verify, defaultState(SPECS, WIDE).places.verify, "a dropped place is the default");
  assert.equal(isOpen(merged, "fleet"), false);
});

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [p] : [];
  });
}

test("the band's dock and rc-dock load by one dynamic import, from the band's front door", () => {
  const files = sourceFiles(src).map((p) => ({ p: relative(src, p), text: readFileSync(p, "utf8") }));
  const staticDock = files.filter((f) => /^\s*import[^;]*from\s+["'][./]*(float\/)?band-dock["']/m.test(f.text)).map((f) => f.p);
  assert.deepEqual(staticDock, [], "no static import of the band's dock");
  const dynamic = files.filter((f) => /import\(\s*["'][./]*(float\/)?band-dock["']\s*\)/.test(f.text)).map((f) => f.p);
  assert.deepEqual(dynamic, [join("float", "band.tsx")]);
  const front = files.find((f) => f.p === join("float", "band.tsx")).text;
  assert.doesNotMatch(front, /from\s+["']rc-dock/, "the front door does not pull rc-dock into the page");
});
