// The Overview's control room (src/pages/Overview/ControlRoom.tsx, room.ts): the files the page asks for are the
// loop's receipt's (test/home-loop.test.mjs holds the files to it), its first paint loads no three.js, and the panes'
// pure parts. Run with `pnpm test` (Node 22.18 or later runs the TypeScript modules directly).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LOOP, NESS_QUESTIONS, askSearch, boardTop, findBatteries, sealOf, verifyPath } from "../src/pages/Overview/room.ts";
import { sortRows } from "../src/ui/sort.ts";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(p, "utf8");
const receipt = JSON.parse(read(join(site, "public", "home", `${LOOP.name}.json`)));

test("the control room asks for exactly the receipt's files, muted, inline, poster first", () => {
  assert.deepEqual(Object.values(LOOP.files).sort(), Object.keys(receipt.files).sort());
  assert.equal(LOOP.width, receipt.files[LOOP.files.mp4].width);
  assert.equal(LOOP.height, receipt.files[LOOP.files.mp4].height);
  const room = read(join(site, "src", "pages", "Overview", "ControlRoom.tsx"));
  assert.ok(room.includes("`${import.meta.env.BASE_URL}home/${file}`"), "files under public/home, from the site's base");
  for (const key of ["webm", "mp4", "poster"]) assert.ok(room.includes(`LOOP.files.${key}`), `the page uses LOOP.files.${key}`);
  const video = /<video\b[^>]*>/.exec(room)?.[0] ?? "";
  for (const attr of ["muted", "loop", "playsInline", "poster={poster}"]) assert.ok(video.includes(attr), `the video is ${attr}`);
  assert.ok(!/\bautoPlay\b/.test(video), "played only while on screen, not by autoplay");
  assert.ok(room.includes("(prefers-reduced-motion: reduce)"), "reduced motion shows the poster alone");
});

test("the first paint loads no three.js: the morph's scene comes only through the lazy scenes index", () => {
  const dir = join(site, "src", "pages", "Overview");
  for (const name of ["index.tsx", "ControlRoom.tsx", "Timeline.tsx", "room.ts"]) {
    const src = read(join(dir, name));
    const imports = [...src.matchAll(/^import\s[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
    for (const from of imports) {
      assert.ok(!/^three(\/|$)|^@world\/|scenes\/(StartingGrid|BrainMap|engine)/.test(from), `${name} imports ${from} on first paint`);
    }
  }
  const scenes = read(join(site, "src", "scenes", "index.ts"));
  assert.match(scenes, /export const StartingGrid = lazy\(\(\) => import\("\.\/StartingGrid\/StartingGrid"\)\)/);
  const room = read(join(dir, "ControlRoom.tsx"));
  assert.ok(/idle && near/.test(room), "the morph mounts once the page is idle and the pane is near the screen");
});

const B = (resource, ev, extra = {}) => ({
  resource,
  settlementPoint: `${resource}_RN`,
  hub: "HB_NORTH",
  zone: "LZ_NORTH",
  county: "Ector",
  powerMw: 10,
  selectedArm: "C",
  arms: ev === undefined ? {} : { C: { expectedUsd: ev } },
  scheduleMw: Array(24).fill(0),
  ...extra,
});

test("the seal pane reads the mainnet commit, else the first on file", () => {
  const test97 = { chainId: 97, mainnet: false };
  const main56 = { chainId: 56, mainnet: true };
  assert.equal(sealOf([test97, main56]), main56);
  assert.equal(sealOf([test97]), test97);
  assert.equal(sealOf([]), null);
});

test("the Fleet pane shows the board's first rows as it opens (expected value, highest first)", () => {
  const rows = [B("A", 5), B("B", 9), B("C", undefined), B("D", 9), B("E", -3), B("F", 7)];
  const board = sortRows(rows, (b) => b.arms[b.selectedArm]?.expectedUsd ?? null, true);
  assert.deepEqual(boardTop(rows, 4), board.slice(0, 4));
  assert.deepEqual(boardTop(rows, 4).map((b) => b.resource), ["B", "D", "F", "A"]);
  assert.deepEqual(boardTop(rows, 99).map((b) => b.resource), ["B", "D", "F", "A", "E", "C"], "a missing value last");
  assert.deepEqual(boardTop(rows, 0), []);
});

test("Verify's search matches every word, by resource, node, hub, county or plain name, and opens /verify/<resource>", () => {
  const rows = [B("DSWL_ESS_ESR1", 1), B("ANOL_ESS_ESR1", 1, { county: "Brazoria", hub: "HB_HOUSTON" }), B("ZZ_BESS1", 1)];
  const names = { DSWL_ESS_ESR1: "Desert Willow" };
  assert.deepEqual(findBatteries(rows, names, "", 5), []);
  assert.deepEqual(findBatteries(rows, names, "  ", 5), []);
  assert.deepEqual(findBatteries(rows, names, "desert willow", 5).map((b) => b.resource), ["DSWL_ESS_ESR1"]);
  assert.deepEqual(findBatteries(rows, names, "brazoria houston", 5).map((b) => b.resource), ["ANOL_ESS_ESR1"]);
  assert.deepEqual(findBatteries(rows, names, "esr1", 5).map((b) => b.resource), ["DSWL_ESS_ESR1", "ANOL_ESS_ESR1"]);
  assert.deepEqual(findBatteries(rows, names, "esr1", 1).map((b) => b.resource), ["DSWL_ESS_ESR1"]);
  assert.equal(verifyPath("DSWL_ESS_ESR1"), "/verify/DSWL_ESS_ESR1");
});

test("Ask Ness opens from its own address, keeping the page's other parameters", () => {
  assert.equal(askSearch("", "verify-yourself"), "?ask=verify-yourself");
  assert.equal(askSearch("", null), "?ask=");
  assert.equal(askSearch("?network=testnet", "why-a-chain"), "?network=testnet&ask=why-a-chain");
  assert.equal(askSearch("?ask=old&b=1", "x"), "?ask=x&b=1");
  assert.equal(NESS_QUESTIONS.length, 3);
  for (const q of NESS_QUESTIONS) assert.match(q.id, /^[a-z0-9-]+$/);
});
