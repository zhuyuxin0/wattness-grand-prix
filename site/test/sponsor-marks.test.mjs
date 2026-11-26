// The side panel's sponsor marks, held to the logo registry: every sponsor a tab names is the registry's, and each
// mark is drawn from the registry's own file, under the registry's name, inside the file's bounds. Run with `pnpm test`
// (Node 22.18 or later runs the TypeScript modules directly).

import assert from "node:assert/strict";
import { test } from "node:test";
import { LOGOS } from "../../packages/world/src/kit/logos/registry.ts";
import { MARKS, markStyle, marksOf, sponsorsOf } from "../src/shell/sponsor-marks.ts";
import { TABS } from "../src/shell/tabs.ts";

const sponsored = TABS.filter((t) => sponsorsOf(t).length > 0);

test("every sponsor a tab names is in the logo registry, once, with a mark", () => {
  assert.ok(sponsored.length > 0);
  for (const t of sponsored) {
    const ids = sponsorsOf(t);
    assert.equal(new Set(ids).size, ids.length, `${t.id} names a sponsor twice`);
    for (const id of ids) {
      assert.ok(Object.hasOwn(LOGOS, id), `${t.id} names "${id}", which the registry does not hold`);
      assert.ok(MARKS[id], `${t.id} names "${id}", which has no mark`);
    }
    assert.equal(marksOf(t).length, ids.length);
  }
});

test("each mark is the registry's own file, under its name and at its size", () => {
  for (const [id, m] of Object.entries(MARKS)) {
    const logo = LOGOS[id];
    assert.ok(logo, `the mark "${id}" is not in the registry`);
    assert.equal(m.id, id);
    assert.equal(m.name, logo.name, `${id}: the mark's name`);
    assert.equal(m.src, logo.src, `${id}: the mark's file`);
    assert.equal(m.w, logo.w, `${id}: the file's width`);
    assert.equal(m.h, logo.h, `${id}: the file's height`);
  }
});

test("each mark's crop lies inside its file, and draws about 14 px tall", () => {
  for (const [id, m] of Object.entries(MARKS)) {
    const [x, y, w, h] = m.crop;
    assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= m.w + 1e-9 && y + h <= m.h + 1e-9, `${id}: crop outside the file`);
    assert.ok(m.px >= 9 && m.px <= 16, `${id}: ${m.px} px tall`);
    const s = markStyle(m);
    assert.equal(s.height, `${m.px}px`);
    assert.match(s.maskImage, /^url\(".+"\)$/);
  }
});
