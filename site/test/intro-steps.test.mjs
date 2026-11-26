// The Intro's "The Grand Prix, Step by Step" (src/pages/Intro/index.tsx): each step's racing term stands over its own
// frame of the introduction, the poster of the chapter that shows the step (src/chapters/map.ts), a file in
// public/chapters/ that its receipt names byte for byte as a render of packages/world; never a photograph or a racing
// series' mark. The words sit on a dark scrim (contrast measured at 5.3:1 or more on every frame, at 1440 and 390 wide,
// both themes); the chapter's link opens the introduction there. Run with `pnpm test`.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CHAPTERS, chapterHref } from "../src/chapters/map.ts";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(p, "utf8");
const intro = read(join(site, "src", "pages", "Intro", "index.tsx"));
const css = read(join(site, "src", "pages", "Intro", "styles.css"));

/** The steps as the page declares them: name, racing term, frame. */
const steps = [...intro.matchAll(/name: "([^"]+)",[\s\S]*?term: "([^"]+)",[\s\S]*?frame: "([^"]+)"/g)].map((m) => ({ name: m[1], term: m[2], frame: m[3] }));

test("every step names its frame: the chapter that shows it", () => {
  assert.deepEqual(
    steps.map((s) => [s.name, s.frame]),
    [
      ["Plan", "starting-grid"],
      ["Seal", "sealed"],
      ["Check", "check"],
      ["Enter", "garage"],
    ],
  );
  for (const s of steps) {
    const c = Object.values(CHAPTERS).find((x) => x.beat === s.frame && !x.part);
    assert.ok(c, `${s.name}: ${s.frame} is a chapter of the introduction`);
    // the frame is the step's own racing word, except Qualifying, whose order is the starting grid it sets
    if (s.name !== "Plan") assert.equal(c.term.toLowerCase(), s.term.toLowerCase(), `${s.name}: ${s.term} over ${c.term}`);
    else assert.equal(c.term, "the starting grid");
  }
});

test("each frame is a chapter poster in public/chapters/, named byte for byte by its receipt, rendered by packages/world", () => {
  for (const s of steps) {
    const loop = Object.values(CHAPTERS).find((x) => x.beat === s.frame && !x.part).loop;
    const receipt = JSON.parse(read(join(site, "public", "chapters", `${loop}.json`)));
    const f = receipt.files[`${loop}.webp`];
    assert.equal(receipt.beat, s.frame);
    assert.equal(f.kind, "poster");
    assert.deepEqual([f.width, f.height], [960, 540]);
    const buf = readFileSync(join(site, "public", "chapters", `${loop}.webp`));
    assert.equal(buf.length, f.bytes, `${loop}.webp: bytes`);
    assert.equal(createHash("sha256").update(buf).digest("hex"), f.sha256, `${loop}.webp: sha256`);
    assert.match(receipt.render.page, /^src\/story\/story\.html\?mode=capture/, "drawn by the introduction's own player");
  }
});

test("the cell draws the frame from the site's own files, as decoration, under a dark scrim", () => {
  assert.match(intro, /src=\{`\$\{BASE\}chapters\/\$\{c\.loop\}\.webp`\}/, "the poster from public/chapters, from the site's base");
  const img = /<img className="story__frame"[^>]*\/>/.exec(intro)?.[0] ?? "";
  for (const attr of ['alt=""', 'loading="lazy"', 'decoding="async"', "width={960}", "height={540}"]) assert.ok(img.includes(attr), `the frame is ${attr}`);
  assert.ok(!/https?:\/\//.test(img), "no picture from outside the site");
  assert.match(intro, /data-atmosphere=\{c \? "dark" : undefined\}/, "dark in either theme");
  const scrim = /\.story__race--framed::after \{[^}]*\}/.exec(css)?.[0] ?? "";
  assert.match(scrim, /linear-gradient\(/);
  // every stop of the scrim at 0.4 or more of the ground's dark; the words where it is 0.68 or more
  const alphas = [...scrim.matchAll(/rgb\(12 14 16 \/ ([\d.]+)\)/g)].map((m) => Number(m[1]));
  assert.ok(alphas.length >= 3 && alphas.every((a) => a >= 0.4), `scrim stops ${alphas}`);
  assert.ok(alphas[0] >= 0.8, "the top, where the words start, is the darkest");
  assert.match(css, /\.story__cue \{[^}]*background: rgb\(12 14 16 \/ 0\.78\);/, "the chapter's link on its own dark tag");
});

test("the chapter's link opens the introduction at that chapter, and Close comes back to it", () => {
  assert.match(intro, /<Link\s+to=\{chapterHref\(c\.beat\)\}/);
  assert.equal(chapterHref("sealed"), "/?chapter=sealed");
  assert.match(intro, /opener\.current = from \?\? cueFrom\.current \?\? play\.current;/);
  // without the story in the build, the chapter is named, not linked
  assert.match(intro, /playable \? \(\s*<Link/);
});
