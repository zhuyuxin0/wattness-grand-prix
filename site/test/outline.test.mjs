// The sections menu (src/outline): its tree's levels, filter and folds, and the ids every tab's sections carry so the
// menu and a link can reach them; the masthead carries Ness and the bottom right corner is the menu's alone. Run with
// `pnpm test`.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { clip, crumbsOf, entriesOf, firstMatch, foldedAt, foldedFirst, keepFor, MAX_LEVEL, pathTo, sectionSlug, treeOf, under } from "../src/outline/tree.ts";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const read = (p) => readFileSync(join(site, p), "utf8");

const heads = (rows) => rows.map(([depth, title], i) => ({ id: i + 1, title, depth }));
const shape = (list) => list.map((e) => [e.level, e.title, e.parent]);

test("each heading sits under the nearest heading above it that sits higher, at levels 1 to 3", () => {
  const list = entriesOf(
    heads([
      [1, "Sealed Before the Gate"],
      [2, "BNB Smart Chain"],
      [3, "Receipt"],
      [2, "opBNB"],
      [1, "Both Chains, One Record"],
      [1, "The Gate, Computed on Chain"],
    ]),
  );
  assert.deepEqual(shape(list), [
    [1, "Sealed Before the Gate", null],
    [2, "BNB Smart Chain", 1],
    [3, "Receipt", 2],
    [2, "opBNB", 1],
    [1, "Both Chains, One Record", null],
    [1, "The Gate, Computed on Chain", null],
  ]);
});

test("a page that starts below the first rank starts at level 1, and a skipped rank leaves no gap", () => {
  assert.deepEqual(shape(entriesOf(heads([[2, "Cards"], [2, "More cards"]]))), [
    [1, "Cards", null],
    [1, "More cards", null],
  ]);
  assert.deepEqual(shape(entriesOf(heads([[1, "Part"], [3, "Skipped a rank"], [2, "Back up"]]))), [
    [1, "Part", null],
    [2, "Skipped a rank", 1],
    [2, "Back up", 1],
  ]);
});

test("nothing deeper than the third level is listed, nor what sits under it", () => {
  const list = entriesOf(heads([[1, "a"], [2, "b"], [3, "c"], [4, "d"], [5, "e"], [3, "f"]]));
  assert.equal(MAX_LEVEL, 3);
  assert.deepEqual(list.map((e) => e.title), ["a", "b", "c", "f"]);
  assert.ok(list.every((e) => e.level >= 1 && e.level <= 3));
});

test("the tree holds every entry once, a folded branch counts what is inside it, and the path runs outermost first", () => {
  const list = entriesOf(heads([[1, "a"], [2, "b"], [3, "c"], [3, "d"], [1, "e"]]));
  const tree = treeOf(list);
  assert.deepEqual(tree.map((n) => n.title), ["a", "e"]);
  assert.equal(under(tree[0]), 3);
  assert.equal(under(tree[1]), 0);
  assert.deepEqual(pathTo(4, list).map((e) => e.title), ["a", "b", "d"]);
  assert.deepEqual(pathTo(null, list), []);
  assert.deepEqual(crumbsOf(pathTo(4, list)), ["…", "b", "d"]);
  assert.deepEqual(crumbsOf(pathTo(2, list)), ["a", "b"]);
  assert.equal(clip("Price Scenarios at the Node (HB_HOUSTON) and more", 30).length, 30);
  assert.equal(clip("Short", 30), "Short");
});

test("the filter keeps each section whose title holds the words and every section around it, in any case", () => {
  const list = entriesOf(heads([[1, "Sealed Before the Gate"], [2, "BNB Smart Chain"], [2, "opBNB"], [1, "Hour by Hour"]]));
  assert.equal(keepFor(list, ""), null);
  assert.equal(keepFor(list, "   "), null);
  assert.deepEqual([...keepFor(list, "SMART  chain")].sort(), [1, 2]);
  assert.deepEqual([...keepFor(list, "hour")], [4]);
  assert.equal(keepFor(list, "nothing here").size, 0);
  assert.equal(firstMatch(list, "bnb")?.title, "BNB Smart Chain");
  assert.equal(firstMatch(list, ""), undefined);
});

test("Show levels folds the tree to a depth, and the tree opens on the first level with the second folded", () => {
  const list = entriesOf(heads([[1, "a"], [2, "b"], [3, "c"], [1, "d"]]));
  const ids = (s) => [...s].sort();
  assert.deepEqual(ids(foldedAt(list, 1)), [1, 2, 3, 4]);
  assert.deepEqual(ids(foldedAt(list, 2)), [2, 3]);
  assert.deepEqual(ids(foldedAt(list, 3)), [3]);
  assert.deepEqual(ids(foldedAt(list, Infinity)), []);
  assert.deepEqual(ids(foldedFirst(list)), ids(foldedAt(list, 2)));
});

test("a section's id from its title", () => {
  assert.equal(sectionSlug("The Gate, Computed on Chain"), "the-gate-computed-on-chain");
  assert.equal(sectionSlug("Both Chains, One Record"), "both-chains-one-record");
  assert.equal(sectionSlug("What This Entry Adds, and What It Calls"), "what-this-entry-adds-and-what-it-calls");
  assert.equal(sectionSlug("Agent's Memory & Files"), "agents-memory-and-files");
  assert.equal(sectionSlug("  "), "");
});

// ---------------------------------------------------------------- every tab's sections have ids

/** The opening tag from `<Tag` to its closing `>`, past braces and strings. */
function tagAt(src, i) {
  let depth = 0;
  let q = null;
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (q) {
      if (c === "\\") j++;
      else if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") q = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(i, j + 1);
  }
  return src.slice(i);
}

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : /\.tsx$/.test(f) ? [join(d, f)] : []));

/** The page folders the side panel's tabs open (shell/tabs.ts imports each tab's page). */
function tabPageFolders() {
  const tabs = read("src/shell/tabs.ts");
  const folders = [...new Set([...tabs.matchAll(/import\("\.\.\/pages\/([A-Za-z]+)/g)].map((m) => m[1]))];
  assert.ok(folders.length >= 15, `tabs.ts imports ${folders.length} pages`);
  return folders;
}

test("every titled section on every tab has an id, its own or one from a plain title, and no page repeats one", () => {
  const missing = [];
  for (const folder of tabPageFolders()) {
    for (const file of walk(join(site, "src", "pages", folder))) {
      const src = readFileSync(file, "utf8");
      const ids = new Map();
      for (const m of src.matchAll(/\sid="([A-Za-z][\w-]*)"/g)) ids.set(m[1], (ids.get(m[1]) ?? 0) + 1);
      for (const m of src.matchAll(/<Section\b/g)) {
        const tag = tagAt(src, m.index);
        if (!/\stitle=/.test(tag)) continue;
        const own = /\sid=/.test(tag);
        const plain = /\stitle="([^"]+)"/.exec(tag);
        const where = `${file.slice(site.length + 1)}:${src.slice(0, m.index).split("\n").length}`;
        if (!own && !plain) missing.push(where);
        if (!own && plain) {
          const slug = sectionSlug(plain[1]);
          assert.ok(slug, `${where}: no id from "${plain[1]}"`);
          ids.set(slug, (ids.get(slug) ?? 0) + 1);
        }
      }
      for (const [id, n] of ids) assert.equal(n, 1, `${file.slice(site.length + 1)} names #${id} ${n} times`);
    }
  }
  assert.deepEqual(missing, [], "a section whose title is not plain words names its own id");
  const section = read("src/ui/Section.tsx");
  assert.match(section, /sectionSlug\(title\)/, "Section gives a titled section without an id one from its title");
});

test("the menu reads Section titles and the pages' h2, h3 and h4, and leaves the page's head and the stage out", () => {
  const scan = read("src/outline/scan.ts");
  assert.match(scan, /const HEADS = "h2, h3, h4";/);
  for (const skip of [".page-header", ".ov-room", ".gp-float", "[aria-hidden='true']"]) assert.ok(scan.includes(skip), `scan.ts leaves out ${skip}`);
});

// ---------------------------------------------------------------- the corner and the masthead

test("the bottom right corner is the sections menu's on every tab but the Intro's landing, and Ness is in the masthead", () => {
  const layout = read("src/shell/Layout.tsx");
  assert.match(layout, /tab && tab\.id !== "intro" && <Outline key=\{tab\.id\} \/>/);
  assert.match(layout, /<AskNess \/>/, "the panel stays on every page: ?ask= links and the Overview's Ask Ness pane open it");
  const masthead = read("src/shell/Masthead.tsx");
  assert.match(masthead, /<NessButton \/>\s*<ThemeToggle \/>/);
  const launcher = read("src/ness/Launcher.tsx");
  assert.ok(!launcher.includes("ness-launch"), "no floating launcher");
  assert.match(launcher, /export function NessButton\(\)/);
  for (const f of walk(join(site, "src"))) assert.ok(!readFileSync(f, "utf8").includes('className="ness-launch'), `${f} draws the old launcher`);
  const css = read("src/ness/launcher.css");
  assert.ok(!/\.ness-launch\b/.test(css), "launcher.css keeps no launcher rule");
});

test("the menu stacks over the floating panes and under the market day's popover", () => {
  const css = read("src/outline/outline.css");
  const z = Number(/\.outline-dock \{[^}]*z-index: (\d+);/.exec(css)?.[1]);
  const day = read("src/shell/market-day.css");
  const dayZ = Math.min(...[...day.matchAll(/z-index: (\d+);/g)].map((m) => Number(m[1])).filter((n) => n >= 10));
  const panes = Number(/--gp-z-panes: (\d+);/.exec(read("src/styles/tokens.css") + read("src/float/float.css"))?.[1] ?? 25);
  assert.ok(z > panes, `menu ${z} over the panes ${panes}`);
  assert.ok(z < dayZ, `menu ${z} under the market day ${dayZ}`);
  assert.ok(css.includes("@media (prefers-reduced-motion") || read("src/outline/Outline.tsx").includes("prefers-reduced-motion"), "a jump respects reduced motion");
});
