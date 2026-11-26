// "Start where you are" (src/pages/Intro/roles.ts), held to the site: each entry opens a tab the side panel lists, an
// in-page place is an id its page sets, each sponsor's logo is the registry's, and the lines stay short enough for
// two lines in a column. Also the rule that turns an address's #id into a place (src/lib/follow-hash.ts). Run with
// `pnpm test` (Node 22.18 or later runs the TypeScript modules directly).

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hashId } from "../src/lib/follow-hash.ts";
import { AUDIENCES, ROLES, SPONSORS, splitTarget } from "../src/pages/Intro/roles.ts";
import { TABS } from "../src/shell/tabs.ts";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(p, "utf8");

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

/** Each tab's page folder, as src/shell/tabs.ts imports it: path -> folder. */
function pageFolders() {
  const src = read(join(site, "src", "shell", "tabs.ts"));
  const out = new Map();
  for (const block of src.split(/kind:\s*"tab"/).slice(1)) {
    const path = /\bpath:\s*"([^"]+)"/.exec(block)?.[1];
    const folder = /import\("\.\.\/pages\/([^"]+)"\)/.exec(block)?.[1];
    if (path && folder) out.set(path, folder);
  }
  return out;
}

/** The registry's logo ids, as packages/world/src/kit/logos/registry.ts and the site's declaration of it name them. */
function registryIds() {
  const registry = read(join(site, "..", "packages", "world", "src", "kit", "logos", "registry.ts"));
  const body = /export const LOGOS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(registry)?.[1] ?? "";
  const declared = /export type LogoId =([^;]+);/.exec(read(join(site, "src", "ui", "world-logos.d.ts")))?.[1] ?? "";
  return {
    registry: new Set([...body.matchAll(/^\s*(\w+):\s*\{/gm)].map((m) => m[1])),
    declared: new Set([...declared.matchAll(/"([^"]+)"/g)].map((m) => m[1])),
  };
}

test("one entry per kind of visitor, then one per sponsor, in the brief's order", () => {
  assert.deepEqual(
    ROLES.map((r) => r.name),
    [
      "New to power markets", "Web3 players", "Traders and analysts", "Battery owners and QSEs", "Developers", "Researchers and students", "Investors",
      "BNB Chain", "Flap", "OpenFour", "CoinMarketCap × Atlas", "Cournot", "Living Brain",
    ],
  );
  assert.equal(new Set(ROLES.map((r) => r.id)).size, ROLES.length);
});

test("every entry opens a tab the side panel lists", () => {
  const paths = new Set(TABS.map((t) => t.path));
  for (const r of ROLES) assert.ok(paths.has(splitTarget(r.to).path), `${r.name}: ${r.to} is no tab`);
});

test("an in-page place is an id its page sets", () => {
  const folders = pageFolders();
  for (const r of ROLES) {
    const { path, id } = splitTarget(r.to);
    if (!id) continue;
    assert.equal(hashId(`#${id}`), id, `${r.name}: #${id} names no place`);
    const folder = folders.get(path);
    assert.ok(folder, `${r.name}: no page folder for ${path}`);
    const sets = sourceFiles(join(site, "src", "pages", folder)).some((f) => read(f).includes(`id="${id}"`));
    assert.ok(sets, `${r.name}: src/pages/${folder} sets no id="${id}"`);
  }
});

test("each sponsor's entry carries its logo from the registry, each reader's none", () => {
  const { registry, declared } = registryIds();
  assert.ok(registry.size > 0 && declared.size > 0);
  for (const r of SPONSORS) {
    assert.ok(r.logos?.length, `${r.name} has no logo`);
    for (const l of r.logos) {
      assert.ok(registry.has(l), `${r.name}: "${l}" is not in the registry`);
      assert.ok(declared.has(l), `${r.name}: "${l}" is not in src/ui/world-logos.d.ts`);
    }
  }
  for (const r of AUDIENCES) assert.equal(r.logos, undefined, `${r.name} is a reader, not a sponsor`);
});

test("each line is one short sentence with no figure, two lines in a column with its page's name", () => {
  for (const r of ROLES) {
    const label = TABS.find((t) => t.path === splitTarget(r.to).path)?.label ?? "";
    assert.ok(r.line.length <= 56, `${r.name}: ${r.line.length} characters`);
    assert.ok(r.line.length + label.length <= 60, `${r.name}: ${r.line.length + label.length} characters with "${label}"`);
    assert.match(r.line, /^[A-Z].*\.$/, `${r.name}: a sentence`);
    // a figure would need its day beside it
    assert.doesNotMatch(r.line, /\d/, `${r.name}: a figure`);
  }
});

test("an address's #id names a place only when it is an id", () => {
  assert.equal(hashId("#px-sources"), "px-sources");
  assert.equal(hashId("texas-power-vstb"), "texas-power-vstb");
  assert.equal(hashId("#fc_cournot"), "fc_cournot");
  for (const bad of ["", "#", "#/verify", "#/", "#1st", "#a b", "#a.b"]) assert.equal(hashId(bad), "", JSON.stringify(bad));
  assert.deepEqual(splitTarget("/agents/forecast#fc-cournot"), { path: "/agents/forecast", id: "fc-cournot" });
  assert.deepEqual(splitTarget("/fleet"), { path: "/fleet", id: "" });
});
