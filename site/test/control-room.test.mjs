// The Overview's control room (src/pages/Overview/ControlRoom.tsx, room.ts): its stage is the Tech Stack's own live
// 3D, the one mount both pages draw (TechStack/StackSpace.tsx), over the stack's poster, which is a chapter still with
// its receipt; its first paint loads no three.js; the panes' pure parts. Run with `pnpm test` (Node 22.18 or later runs
// the TypeScript modules directly).

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { NESS_QUESTIONS, STAGE_POSTER, askSearch, boardTop, findBatteries, sealOf, verifyPath } from "../src/pages/Overview/room.ts";
import { sortRows } from "../src/ui/sort.ts";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(p, "utf8");
const dir = join(site, "src", "pages", "Overview");
const stack = join(site, "src", "pages", "TechStack");
/** A module's import specifiers (type-only imports included, marked). */
const importsOf = (src) => [...src.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gm)].map((m) => ({ from: m[2], type: !!m[1] }));

test("the stage's poster is the stack at rest, a chapter still named byte for byte by its receipt", () => {
  const receipt = JSON.parse(read(join(site, "public", STAGE_POSTER.receipt)));
  const name = STAGE_POSTER.file.split("/").pop();
  assert.equal(receipt.beat, "stack", "chapter 21: what it is built from");
  assert.equal(receipt.frame, "stack.rest", "the Tech Stack's 3D at rest");
  const f = receipt.files[name];
  assert.ok(f, `the receipt names ${name}`);
  assert.equal(f.kind, "poster");
  assert.deepEqual([f.width, f.height], [STAGE_POSTER.width, STAGE_POSTER.height]);
  const buf = readFileSync(join(site, "public", STAGE_POSTER.file));
  assert.equal(buf.length, f.bytes, "bytes");
  assert.equal(createHash("sha256").update(buf).digest("hex"), f.sha256, "sha256");
  const room = read(join(dir, "ControlRoom.tsx"));
  assert.ok(room.includes("`${import.meta.env.BASE_URL}${STAGE_POSTER.file}`"), "the poster from the site's base");
  assert.match(room, /width=\{STAGE_POSTER\.width\}/);
  assert.match(room, /fetchpriority: "high"/, "the poster is the first paint's picture");
});

test("the stage is the Tech Stack's own 3D: one mount for both pages, never a copy of the scene", () => {
  const space = read(join(stack, "StackSpace.tsx"));
  assert.match(space, /import\("@world\/stations\/stack\/mount"\)/, "mountStack by dynamic import");
  assert.match(space, /handle\?\.dispose\(\)/, "disposed when the component goes (its WebGL context released)");
  for (const { from, type } of importsOf(space)) assert.ok(type || !/^@world\/|^three(\/|$)/.test(from), `StackSpace imports ${from} on first paint`);
  // the Tech Stack's stage and the Overview's both draw StackSpace; neither mounts the stack itself
  const stage = read(join(stack, "Stage.tsx"));
  const room = read(join(dir, "ControlRoom.tsx"));
  assert.match(stage, /<StackSpace\s/);
  assert.match(room, /import \{ StackSpace \} from "\.\.\/TechStack\/StackSpace";/);
  assert.match(room, /<StackSpace\s/);
  for (const src of [stage, room]) assert.ok(!/mountStack|stations\/stack\/mount"\)/.test(src), "no second mount of the scene");
  // the space's own rules (its words' sizes, the dark card on a light page) live with the mount, for both pages
  const css = read(join(stack, "stack-space.css"));
  assert.match(css, /\.stack-space \{\s*container: stack \/ inline-size;/);
  assert.match(css, /@container stack \(max-width: 1499px\)/);
  assert.ok(!/@container stack/.test(read(join(stack, "styles.css"))), "not kept twice");
});

test("the 3D comes after the page's text, fades in once drawn, and stays away with reduced motion or Save-Data", () => {
  const room = read(join(dir, "ControlRoom.tsx"));
  assert.match(room, /const still = reduced \|\| saveData\(\);/);
  assert.match(room, /const live = !still && !failed && idle && settled;/);
  assert.match(room, /\{live && <StackSpace /, "mounted only when live, so leaving the tab or turning on reduced motion disposes it");
  assert.match(room, /<HomeStage settled=\{all\.status !== "loading"\} \/>/, "after the panes' data has come in");
  assert.ok(room.includes("(prefers-reduced-motion: reduce)"));
  assert.match(room, /is-live/);
  const css = read(join(dir, "control-room.css"));
  assert.match(css, /\.ov-room__space \{[^}]*opacity: 0;[^}]*pointer-events: none;/, "unseen and out of the pointer's way until drawn");
  assert.match(css, /\.ov-room__stage\.is-live \.ov-room__space \{[^}]*opacity: 1;[^}]*pointer-events: auto;/);
  // the band over the stage passes the pointer through, except where a pane, the head or the menu stands
  const band = read(join(dir, "room-band.css"));
  assert.match(band, /\.ov-room > \.gp-band-host--docked \{[^}]*pointer-events: none;/);
  assert.match(band, /\.ov-room \.gp-band__head,\s*\.ov-room \.gp-band__corner \{\s*pointer-events: auto;/);
});

test("the first paint loads no three.js: the morph's scene comes only through the lazy scenes index", () => {
  for (const name of ["index.tsx", "ControlRoom.tsx", "Timeline.tsx", "room.ts"]) {
    const src = read(join(dir, name));
    for (const { from, type } of importsOf(src)) {
      assert.ok(type || !/^three(\/|$)|^@world\/|scenes\/(StartingGrid|BrainMap|engine)/.test(from), `${name} imports ${from} on first paint`);
    }
  }
  const scenes = read(join(site, "src", "scenes", "index.ts"));
  assert.match(scenes, /export const StartingGrid = lazy\(\(\) => import\("\.\/StartingGrid\/StartingGrid"\)\)/);
  const room = read(join(dir, "ControlRoom.tsx"));
  assert.ok(/idle && near/.test(room), "the morph mounts once the page is idle and the pane is near the screen");
  // and nothing asks for the old loop
  assert.ok(!/home\/|tech-landscape|<video/.test(room));
  assert.ok(!existsSync(join(site, "public", "home", "tech-landscape.json")), "the loop's files are gone");
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
