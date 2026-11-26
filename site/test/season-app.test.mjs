// The Season tab's App: release 7 of the Wattness Season Mini App, built for the web and served
// from public/apps/wattness-season/. Its receipt names the release's ZIP, the template commit and
// every served file's SHA-256; these tests hold the files, the receipt and the page's constants to
// each other, so a changed byte or a stale constant fails the build.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { APP_PATH, APP_RELEASE, APP_TEMPLATE_COMMIT, APP_ZIP_SHA256, FLAP_APP_URL } from "../src/pages/Season/app-build.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "public", "apps", "wattness-season");
const receipt = JSON.parse(readFileSync(join(dir, "receipt.json"), "utf8"));
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

test("every served file hashes to its receipt, and the folder holds nothing else", () => {
  const served = readdirSync(dir).filter((f) => f !== "receipt.json").sort();
  assert.deepEqual(served, Object.keys(receipt.files).sort());
  for (const [file, hash] of Object.entries(receipt.files)) assert.equal(sha(readFileSync(join(dir, file))), hash, file);
});

test("the page loads the hashed script and stylesheet the receipt lists", () => {
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const js = /src="\.\/(app\.[0-9a-f]{12}\.js)"/.exec(html)?.[1];
  const css = /href="\.\/(app\.[0-9a-f]{12}\.css)"/.exec(html)?.[1];
  assert.ok(js && css, "index.html names app.<hash>.js and app.<hash>.css");
  assert.ok(receipt.files[js].startsWith(js.slice(4, 16)), "the script's name is its own hash");
  assert.ok(receipt.files[css].startsWith(css.slice(4, 16)), "the stylesheet's name is its own hash");
});

test("the tab's constants are the receipt's", () => {
  assert.equal(APP_PATH, "/apps/wattness-season/");
  assert.equal(APP_RELEASE, receipt.release);
  assert.equal(APP_ZIP_SHA256, receipt.zip.sha256);
  assert.match(APP_ZIP_SHA256, /^[0-9a-f]{64}$/);
  assert.equal(APP_TEMPLATE_COMMIT, receipt.template.commit);
  assert.match(APP_TEMPLATE_COMMIT, /^[0-9a-f]{40}$/);
  assert.equal(receipt.slug, "wattness-season");
  assert.equal(FLAP_APP_URL, `https://utter.cash/apps/${receipt.slug}`);
  // The App's four sources, as the ZIP holds them; the manifest is release 6's, unchanged.
  assert.deepEqual(Object.keys(receipt.source).sort(), ["Component.tsx", "VaultABI.ts", "i18n.json", "manifest.json"]);
  assert.equal(receipt.source["manifest.json"], "95ade7d364562d3f79dd41c845ac7063a6c4679dc3fb773ddf84e93d2f10d083");
});

test("the build is guest only and names no local path", () => {
  const js = readFileSync(join(dir, Object.keys(receipt.files).find((f) => f.endsWith(".js"))), "utf8");
  for (const file of Object.keys(receipt.files).concat("receipt.json")) {
    const text = readFileSync(join(dir, file), "latin1");
    assert.doesNotMatch(text, /\/Users\/|\/private\/tmp\/|\/home\/[a-z][a-z0-9_-]*\//, file);
  }
  assert.ok(js.includes("readOnly:!0") || js.includes("readOnly:true"), "the host is read-only");
  assert.ok(js.includes("bsc-testnet"), "it reads BSC testnet");
});

test("the Season tab frames the App first and links it on Flap", () => {
  const page = readFileSync(join(here, "..", "src", "pages", "Season", "index.tsx"), "utf8");
  const pane = readFileSync(join(here, "..", "src", "pages", "Season", "AppPane.tsx"), "utf8");
  assert.ok(page.indexOf("<AppPane />") > 0 && page.indexOf("<AppPane />") < page.indexOf('id="season-how"'), "the App is the first section");
  assert.match(pane, /<iframe[\s\S]*src=\{`\$\{APP_PATH\}\?lang=en`\}/);
  assert.match(pane, /href=\{FLAP_APP_URL\}/);
  assert.match(pane, /e\.origin !== window\.location\.origin/);
});
