// The Intro's first view: chapter 01's still, its receipt, and the preload that
// fetches it first. The receipt (public/hero/desert-willow-night.json) must name
// the published files byte for byte, and index.html must preload exactly the
// candidates and sizes the Intro's img asks for, or the browser fetches twice.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hero = join(site, "public", "hero");
const read = (p) => readFileSync(p, "utf8");

/** A WebP's canvas size from its first chunk: VP8 (lossy), VP8L (lossless) or VP8X (extended). */
function webpSize(buf) {
  assert.equal(buf.toString("ascii", 0, 4), "RIFF");
  assert.equal(buf.toString("ascii", 8, 12), "WEBP");
  const kind = buf.toString("ascii", 12, 16);
  if (kind === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (kind === "VP8X") return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  throw new Error(`not a WebP chunk: ${kind}`);
}

test("the hero still's receipt names every file byte for byte", () => {
  const receipt = JSON.parse(read(join(hero, "desert-willow-night.json")));
  assert.equal(receipt.frame, "opening.pad");
  assert.equal(receipt.story_key, "desert-willow");
  assert.match(receipt.code.commit, /^[0-9a-f]{40}$/);
  const names = Object.keys(receipt.files);
  assert.deepEqual(names.sort(), ["desert-willow-night-1920.webp", "desert-willow-night-2880.webp"]);
  for (const [name, f] of Object.entries(receipt.files)) {
    const buf = readFileSync(join(hero, name));
    assert.equal(buf.length, f.bytes, `${name}: bytes`);
    assert.equal(createHash("sha256").update(buf).digest("hex"), f.sha256, `${name}: sha256`);
    assert.deepEqual(webpSize(buf), { width: f.width, height: f.height }, `${name}: size`);
    assert.equal(f.width / f.height, 16 / 9, `${name}: 16:9`);
  }
});

test("index.html preloads the candidates and sizes the Intro's img uses", () => {
  const html = read(join(site, "index.html"));
  const story = read(join(site, "src", "pages", "Intro", "story.ts"));
  const heroTsx = read(join(site, "src", "pages", "Intro", "Hero.tsx"));
  // story.ts names the still as hero/desert-willow-night-<width>.webp, at 1920 and 2880
  assert.ok(story.includes("hero/desert-willow-night-${w}.webp"), "story.ts builds the still's names");
  for (const w of [1920, 2880]) {
    assert.ok(story.includes(`hero(${w})`), `story.ts offers the ${w} still`);
    assert.ok(html.includes(`hero/desert-willow-night-${w}.webp ${w}w`), `index.html preloads the ${w} candidate`);
  }
  const sizes = /sizes="([^"]+)"/.exec(heroTsx)?.[1];
  assert.ok(sizes, "Hero.tsx gives the img its sizes");
  assert.ok(html.includes(`"imagesizes", "${sizes}"`), "index.html preloads with the same sizes");
});
