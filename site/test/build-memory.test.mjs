// The Intro's band on how the Grand Prix is built (src/pages/Intro/BuildMemory.tsx, build-memory.ts): our three
// brains in Living Brain in 3D between Step by Step and the closing band, dark in either theme; every page that is a
// tab's own opens that tab from its card (the Intro's own excepted), Open Memory carries the view to the Memory tab in
// the address that tab reads, the build brain's corrections stand beside Living Brain's text as on the Memory tab, and
// the 3D package loads only once the band nears the screen. Run with `pnpm test`.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { HERE, MEMORY_PATH, bandTabs, correctionsOf, memoryHref } from "../src/pages/Intro/build-memory.ts";
import { readSelection } from "../src/pages/Memory/select.ts";
import { TABS, WORLD_TABS, worldTab } from "../src/shell/tabs.ts";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(p, "utf8");
const intro = read(join(site, "src", "pages", "Intro", "index.tsx"));
const band = read(join(site, "src", "pages", "Intro", "BuildMemory.tsx"));
const css = read(join(site, "src", "pages", "Intro", "build-memory.css"));
const scene = JSON.parse(read(join(site, "..", "packages", "world", "src", "stations", "brain", "brain-scene.json")));
const build = JSON.parse(read(join(site, "public", "data", "memory", "build-brain.json")));

test("the band stands between Step by Step and the closing band, paused while the introduction is open", () => {
  const steps = intro.indexOf('title="The Grand Prix, Step by Step"');
  const at = intro.indexOf("<BuildMemory armed={stillIn} paused={story} />");
  const close = intro.indexOf("<Closing armed={stillIn}");
  assert.ok(steps > 0 && at > steps && close > at, "Step by Step, then the band, then the close");
  assert.equal(intro.match(/<BuildMemory\b/g)?.length, 1, "one band");
});

test("a page's card opens its own tab, every tab the brains name but the Intro the visitor is on", () => {
  const tabs = bandTabs(Object.keys(WORLD_TABS), worldTab);
  const ids = tabs.map((t) => t.id);
  assert.equal(HERE, "intro");
  assert.ok(!ids.includes("intro"), "no Open Intro on the Intro");
  for (const id of Object.keys(scene.tabs)) {
    if (id === HERE) continue;
    const t = tabs.find((x) => x.id === id);
    assert.ok(t, `the ${id} page's card opens its tab`);
    assert.equal(t.label, TABS.find((x) => x.id === WORLD_TABS[id]).label, `${id}: the side panel's name`);
  }
  assert.deepEqual(
    tabs.find((t) => t.id === "memory"),
    { id: "memory", label: "Memory" },
  );
  // an id the site does not map opens nothing
  assert.deepEqual(bandTabs(["garage", "seal"], worldTab), [{ id: "seal", label: "Seal" }]);
});

test("Open Memory carries the band's view in the address the Memory tab reads", () => {
  assert.equal(MEMORY_PATH, TABS.find((t) => t.id === "memory").path);
  assert.equal(memoryHref(null), "/agents/memory");
  assert.equal(memoryHref({ brain: "all", page: null }), "/agents/memory");
  assert.equal(memoryHref({ brain: "terminal", page: null }), "/agents/memory?brain=terminal");
  assert.equal(memoryHref({ brain: "grand-prix", page: "seal-tab" }), "/agents/memory?brain=grand-prix&page=seal-tab");
  for (const view of [
    { brain: "all", page: null },
    { brain: "grand-prix", page: null },
    { brain: "battery-review", page: "dswl-ess-esr1" },
    { brain: "grand-prix", page: "memory-tab" },
  ]) {
    const href = memoryHref(view);
    const q = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
    assert.deepEqual(readSelection(new URLSearchParams(q)), view, `${href} reads back as the view`);
  }
  // the tab's own card ("Open Memory" on the Memory tab's page) goes there with that page pinned
  assert.match(band, /id === "memory" \? memoryHref\(handle\.state\(\)\) : worldPath\(id\)/);
  assert.match(band, /<Link to=\{memoryHref\(view\)\}/);
});

test("the build brain's corrections stand beside Living Brain's text, keyed as the mount reads them", () => {
  assert.equal(correctionsOf(null), undefined);
  const c = correctionsOf(build);
  const pages = build.pages.filter((p) => p.correction);
  const links = build.connections.filter((x) => x.correction);
  assert.ok(pages.length > 0 && links.length > 0);
  assert.equal(Object.keys(c.pages).length, pages.length);
  assert.equal(Object.keys(c.connections).length, links.length);
  for (const p of pages) assert.equal(c.pages[`${p.brain}/${p.slug}`], p.correction);
  for (const x of links) assert.equal(c.connections[`${x.aBrain}/${x.a}>${x.bBrain}/${x.b}`], x.correction);
  // the one on the Grand Prix's own page, which the scene's data does not carry
  assert.match(c.pages["grand-prix/wattness-grand-prix"], /^No language model writes the plans/);
  const small = correctionsOf({
    pages: [{ brain: "grand-prix", slug: "a", correction: "A." }, { brain: "terminal", slug: "b" }],
    connections: [{ a: "a", aBrain: "grand-prix", b: "b", bBrain: "terminal", correction: "C." }],
  });
  assert.deepEqual(small, { pages: { "grand-prix/a": "A." }, connections: { "grand-prix/a>terminal/b": "C." } });
});

test("the band is dark in either theme, and the 3D loads only as it nears the screen", () => {
  assert.match(band, /<div className="intro-brain" data-atmosphere="dark">/);
  assert.match(css, /\.intro-brain \{[^}]*background: #000102;/, "the brains' own ground");
  // one dynamic import of the mount, in the effect that runs once the band is near (and armed)
  assert.equal(band.match(/import\("@world\/stations\/brain\/mount"\)/g)?.length, 1);
  assert.ok(!/from "three"|import\("three"\)/.test(band), "no three.js of its own");
  assert.match(band, /const live = near && !failed && !saveData\(\);/);
  assert.match(band, /if \(!live \|\| !el\) return;/);
  assert.match(band, /rootMargin: "50% 0px 50% 0px"/);
  assert.match(band, /if \(!el \|\| near \|\| !armed\) return;/, "not before the page's first picture");
  // paused: the stage hides in its box, so the mount's own observer stops its loop
  assert.match(band, /data-paused=\{paused \|\| undefined\}/);
  // the 3D's own card and page lists are not the page's sections
  assert.match(band, /className=\{`intro-brain__stage[^>]*data-outline-skip=""/);
  assert.match(css, /\.intro-brain__stage\[data-paused\] > \.intro-brain__space \{\s*display: none;/);
  // disposed with the page, which releases its WebGL context
  assert.match(band, /return \(\) => \{\s*gone = true;\s*h\?\.dispose\(\);/);
});

test("until the live stage has drawn, the still of the same stage holds the place, as decoration", () => {
  const img = /<img className="intro-brain__still"[^>]*\/>/.exec(band)?.[0] ?? "";
  for (const attr of ['alt=""', 'loading="lazy"', 'decoding="async"', "width={840}", "height={323}"]) assert.ok(img.includes(attr), `the still is ${attr}`);
  assert.match(band, /import still from "\.\.\/\.\.\/ness\/brains-still\.jpg";/);
  assert.ok(existsSync(join(site, "src", "ness", "brains-still.jpg")));
  assert.match(css, /\.intro-brain__stage\.is-live \.intro-brain__still \{\s*opacity: 0;/);
});
