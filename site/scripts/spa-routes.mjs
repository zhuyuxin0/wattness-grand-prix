#!/usr/bin/env node
// After `vite build`: the app answers every path from one page, and GitHub Pages serves files. So this writes that
// page at each path the app answers, and a link to /verify or /battery/DSWL_ESS_ESR1 gets 200 with the app (link
// previews and link checkers read that status); any other path gets 404.html, the same page, which shows the app's
// own Not Found.
//
//   node scripts/spa-routes.mjs [dist]
//
// The paths: every tab in src/shell/tabs.ts; the first site's routes that moved (src/routes.tsx, movedRoutes);
// and, under each tab that owns its sub-paths (Fleet, Battery, Verify), every battery in the frame data's list
// (world-data/frame-data.json fleet.batteries) and in the day's index (public/data/day.json). Each path is written
// twice, as <path>.html and <path>/index.html: Pages serves /verify from verify.html, and from verify/index.html
// after a redirect to /verify/, so either way it resolves a path, the page is there. A tab's copy carries the
// tab's title (the one the app sets once it runs, src/shell/Layout.tsx) and its summary as the description.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCT_NAME } from "../src/config.ts";
import { TABS } from "../src/shell/tabs.ts";

const here = fileURLToPath(import.meta.url);
const site = resolve(dirname(here), "..");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** A battery's resource name, as ERCOT writes them: the only sub-path segment this script writes. */
export const RESOURCE = /^[A-Z0-9_]{2,40}$/;

/** The first site's routes that moved, as src/routes.tsx lists them (movedRoutes), each as a path. */
export function movedPaths(src = readFileSync(join(site, "src", "routes.tsx"), "utf8")) {
  const list = /const movedRoutes\b[^=]*=\s*\[([\s\S]*?)\n\];/.exec(src);
  if (!list) throw new Error("src/routes.tsx has no movedRoutes list");
  const paths = [...list[1].matchAll(/\bpath:\s*"([^"]+)"/g)].map((m) => `/${m[1].replace(/\/\*$/, "")}`);
  if (paths.length === 0) throw new Error("src/routes.tsx: movedRoutes names no path");
  return paths;
}

/** Every battery the site has a page for: the frame data's list, then any the day's index adds, once each. */
export function batteries() {
  const frame = readJson(join(site, "world-data", "frame-data.json")).fleet.batteries;
  const day = readJson(join(site, "public", "data", "day.json")).batteries;
  const out = [...new Set([...frame, ...day].map((b) => b.resource))];
  for (const r of out) if (typeof r !== "string" || !RESOURCE.test(r)) throw new Error(`not a resource name: ${JSON.stringify(r)}`);
  return out;
}

/** Every path that gets the page, with the tab it opens (undefined for a moved route): the root first. */
export function routes() {
  const out = new Map();
  for (const t of TABS) out.set(t.path, t);
  for (const p of movedPaths()) if (!out.has(p)) out.set(p, undefined);
  const resources = batteries();
  for (const t of TABS) if (t.subpaths) for (const r of resources) out.set(`${t.path}/${r}`, t);
  return [...out];
}

/** The files a path's page is written to, relative to dist. The root's is index.html, the build's own. */
export function filesFor(path) {
  if (path === "/") return [];
  const rel = path.slice(1);
  return [`${rel}.html`, `${rel}/index.html`];
}

const attr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The one match of re in html, replaced by what put() returns for it: two matches would mean index.html changed shape. */
function once(html, re, put, what) {
  const hits = html.match(new RegExp(re.source, `${re.flags}g`)) ?? [];
  if (hits.length !== 1) throw new Error(`index.html has ${hits.length} ${what}, not one`);
  return html.replace(re, put);
}

/** The page for a path: index.html, with a tab's title and summary when the path opens one other than the Intro. */
export function pageFor(html, tab) {
  if (!tab || tab.path === "/") return html;
  const title = attr(`${tab.label} · ${PRODUCT_NAME}`);
  const titled = once(html, /<title>[^<]*<\/title>/, () => `<title>${title}</title>`, "titles");
  return once(titled, /(<meta\s+name="description"\s+content=")[^"]*(")/, (_, open, close) => `${open}${attr(tab.summary)}${close}`, "descriptions");
}

/** Writes 404.html and every path's files into dist; returns the counts. */
export function writeRoutes(dist = join(site, "dist")) {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  writeFileSync(join(dist, "404.html"), html);
  let paths = 0;
  let files = 0;
  for (const [path, tab] of routes()) {
    const page = pageFor(html, tab);
    for (const rel of filesFor(path)) {
      const file = join(dist, rel);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, page);
      files += 1;
    }
    paths += 1;
  }
  return { paths, files };
}

if (process.argv[1] && resolve(process.argv[1]) === here) {
  const dist = resolve(process.argv[2] ?? join(site, "dist"));
  const { paths, files } = writeRoutes(dist);
  console.log(`spa-routes: 404.html, and the page at ${paths} paths (${files} files) in ${relative(site, dist) || "."}`);
}
