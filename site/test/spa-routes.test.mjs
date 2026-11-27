// Clean paths on GitHub Pages. The build writes the app's page at every path it
// answers (scripts/spa-routes.mjs), so each answers 200, and index.html turns an
// old #/ link into its path before the app reads the address. The checks on
// dist/ run once a build has written it (pages.yml builds, then tests); before
// one they skip.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { PRODUCT_NAME, SHOWCASE } from "../src/config.ts";
import { TABS } from "../src/shell/tabs.ts";
import { batteries, filesFor, movedPaths, pageFor, routes } from "../scripts/spa-routes.mjs";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(site, "dist");
const read = (p) => readFileSync(p, "utf8");
const built = () => existsSync(join(dist, "404.html"));
const NOT_BUILT = "dist/ holds no spa-routes build (pnpm build:app)";

/** index.html's inline scripts, in order. */
const inline = () => [...read(join(site, "index.html")).matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

/** Where the old-link script sends an address: the new path, or null when it stays. */
function redirect(href) {
  const u = new URL(href);
  let to = null;
  const script = inline().find((s) => s.includes("history.replaceState"));
  assert.ok(script, "index.html turns old links into paths");
  vm.runInNewContext(script, {
    location: { pathname: u.pathname, search: u.search, hash: u.hash },
    history: { replaceState: (_state, _title, url) => (to = url) },
  });
  return to;
}

/** The links the hero's preload script adds on a path. */
function preloads(pathname) {
  const added = [];
  const script = inline().find((s) => s.includes('"preload"'));
  assert.ok(script, "index.html preloads the hero still");
  const el = () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  vm.runInNewContext(script, { location: { pathname }, document: { createElement: el, head: { appendChild: (l) => added.push(l) } } });
  return added;
}

test("both build scripts write the paths after vite build", () => {
  const { scripts } = JSON.parse(read(join(site, "package.json")));
  for (const name of ["build", "build:app"]) assert.match(scripts[name], /&& vite build && node scripts\/spa-routes\.mjs$/, name);
});

test("every tab, every moved route and every battery's pages are paths the build writes", () => {
  const paths = new Map(routes());
  for (const t of TABS) assert.equal(paths.get(t.path), t, t.path);
  for (const p of ["/pit-wall", "/standings", "/stewards", "/garage", "/paddock", "/agents"]) assert.ok(movedPaths().includes(p), p);
  for (const p of movedPaths()) assert.ok(paths.has(p), p);
  const resources = batteries();
  const frame = JSON.parse(read(join(site, "world-data", "frame-data.json"))).fleet.batteries.map((b) => b.resource);
  const day = JSON.parse(read(join(site, "public", "data", "day.json"))).batteries.map((b) => b.resource);
  assert.ok(frame.length > 0 && day.length > 0);
  for (const r of [...frame, ...day]) assert.ok(resources.includes(r), r);
  assert.ok(resources.includes(SHOWCASE.resource));
  const owners = TABS.filter((t) => t.subpaths);
  assert.ok(owners.some((t) => t.path === "/battery"));
  for (const t of owners) for (const r of resources) assert.equal(paths.get(`${t.path}/${r}`), t, `${t.path}/${r}`);
});

test("a path's page is written as <path>.html and <path>/index.html; the root's is the build's own", () => {
  assert.deepEqual(filesFor("/"), []);
  assert.deepEqual(filesFor("/verify"), ["verify.html", "verify/index.html"]);
  assert.deepEqual(filesFor("/battery/DSWL_ESS_ESR1"), ["battery/DSWL_ESS_ESR1.html", "battery/DSWL_ESS_ESR1/index.html"]);
});

test("a tab's copy carries its title and summary, and nothing else changes", () => {
  const html = read(join(site, "index.html"));
  const verify = TABS.find((t) => t.id === "verify");
  const page = pageFor(html, verify);
  assert.ok(page.includes(`<title>Verify · ${PRODUCT_NAME}</title>`));
  assert.ok(page.includes(`content="${verify.summary}"`));
  assert.ok(page.includes(`property="og:title" content="Verify · ${PRODUCT_NAME}"`));
  assert.ok(page.includes(`property="og:description" content="${verify.summary}"`));
  const strip = (s) =>
    s
      .replace(/<title>[^<]*<\/title>/, "")
      .replace(/(name="description"\s+content=")[^"]*"/, "$1\"")
      .replace(/(property="og:title"\s+content=")[^"]*"/, "$1\"")
      .replace(/(property="og:description"\s+content=")[^"]*"/, "$1\"");
  assert.equal(strip(page), strip(html));
  assert.equal(pageFor(html, undefined), html);
  assert.equal(pageFor(html, TABS.find((t) => t.path === "/")), html);
  const odd = { ...verify, label: 'A & "B"', summary: "Costs $1 & <more>" };
  assert.ok(pageFor(html, odd).includes("<title>A &amp; &quot;B&quot; · "));
  assert.ok(pageFor(html, odd).includes('content="Costs $1 &amp; &lt;more&gt;"'));
});

test("an old #/ link becomes its path, with both queries", () => {
  const at = (p) => `https://gp.wattness.tech${p}`;
  assert.equal(redirect(at("/#/files")), "/files");
  assert.equal(redirect(at("/#/")), "/");
  assert.equal(redirect(at("/#/battery/DSWL_ESS_ESR1?arm=B&hour=17")), "/battery/DSWL_ESS_ESR1?arm=B&hour=17");
  assert.equal(redirect(at("/?clock=2026-11-25T15:30:00Z&capture=1#/stewards")), "/stewards?clock=2026-11-25T15:30:00Z&capture=1");
  assert.equal(redirect(at("/?capture=1#/verify/DSWL_ESS_ESR1?tamper=1")), "/verify/DSWL_ESS_ESR1?capture=1&tamper=1");
  assert.equal(redirect(at("/#/about#glossary")), "/about#glossary");
  // never another origin
  assert.equal(redirect(at("/#//example.com/x")), "/example.com/x");
  assert.equal(redirect(at("/#/\\example.com")), "/example.com");
  // a file name the server matched
  assert.equal(redirect(at("/index.html")), "/");
  assert.equal(redirect(at("/verify.html?x=1")), "/verify?x=1");
  assert.equal(redirect(at("/verify/index.html")), "/verify");
  // a folder's trailing slash (Pages answers /verify/ from verify/index.html): a page reads its path to the end
  assert.equal(redirect(at("/battery/ADL_ESR1/?arm=B")), "/battery/ADL_ESR1?arm=B");
  assert.equal(redirect(at("/verify/")), "/verify");
  // already a path, or a plain fragment: no change
  for (const p of ["/", "/verify", "/battery/DSWL_ESS_ESR1?arm=B", "/about#main"]) assert.equal(redirect(at(p)), null, p);
});

test("only the Intro's own path preloads its still, by absolute address", () => {
  const [l] = preloads("/");
  assert.equal(l.href, "/hero/desert-willow-night-1920.webp");
  assert.match(l.attrs.imagesrcset, /^\/hero\/\S+ 1920w, \/hero\/\S+ 2880w$/);
  for (const p of ["/verify", "/battery/DSWL_ESS_ESR1", "/files", "/index.html"]) assert.equal(preloads(p).length, 0, p);
});

test("every route in shell/tabs.ts has its file in the build", (t) => {
  if (!built()) return t.skip(NOT_BUILT);
  assert.ok(existsSync(join(dist, "index.html")));
  for (const tab of TABS) for (const f of filesFor(tab.path)) assert.ok(existsSync(join(dist, f)), `${tab.path}: ${f}`);
});

test("each path's files hold its page, and 404.html is index.html", (t) => {
  if (!built()) return t.skip(NOT_BUILT);
  const index = read(join(dist, "index.html"));
  assert.equal(read(join(dist, "404.html")), index);
  let n = 0;
  for (const [path, tab] of routes()) {
    for (const f of filesFor(path)) {
      assert.equal(read(join(dist, f)), pageFor(index, tab), f);
      n += 1;
    }
  }
  assert.ok(n > 2 * TABS.length);
});

test("the build loads its code and files from the root, so a page at any depth finds them", (t) => {
  if (!built()) return t.skip(NOT_BUILT);
  const index = read(join(dist, "index.html"));
  const refs = [...index.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 0);
  for (const r of refs) assert.ok(r.startsWith("/") && !r.startsWith("//"), `a relative or foreign address in index.html: ${r}`);
  assert.match(index, /<script type="module" crossorigin src="\/assets\/[^"]+\.js"><\/script>/);
  // the old-link script runs before anything else reads the address
  const first = index.indexOf("<script>");
  assert.ok(first > 0 && index.slice(first, index.indexOf("</script>", first)).includes("history.replaceState"));
});
