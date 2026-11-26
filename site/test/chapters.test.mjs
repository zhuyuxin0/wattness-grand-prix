// Each tab's chapter of the introduction (src/chapters/map.ts): every tab has one, every beat it names is a stop of
// the site's story with that number, name and racing term (packages/world's own film, loaded through Vite as the site
// builds it), and every loop's files in public/chapters/ are byte for byte the ones its receipt names, within the size
// the panes allow. Run with `pnpm test` (Node 22.18 or later runs the TypeScript modules directly).

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { CHAPTERS, CHAPTER_LOOPS, LOOP_BEAT, chapterHref, paneChapter } from "../src/chapters/map.ts";
import { TABS } from "../src/shell/tabs.ts";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const world = resolve(site, "..", "packages", "world");
const dir = join(site, "public", "chapters");
const read = (p) => readFileSync(p, "utf8");
/** "About 350 KB" a file: the renderer aims under 340 KB. */
const MAX_BYTES = 360 * 1024;

let server;
let stops;
let keys;
before(async () => {
  // the package's film for the site, as the site's build compiles it (JSON and extensionless imports included)
  server = await createServer({
    root: world,
    configFile: false,
    logLevel: "silent",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const clock = await server.ssrLoadModule("/src/story/clock.ts");
  const beats = await server.ssrLoadModule("/src/story/beats.ts");
  keys = beats.KEYS;
  const F = clock.film("site");
  stops = F.stops.map((i, n) => ({ chapter: n + 1, id: F.keys[i].key }));
});
after(async () => {
  await server?.close();
});

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

/** An MP4's video size from its track header (tkhd: width and height in 16.16 fixed point, its last 8 bytes). */
function mp4Size(buf) {
  assert.equal(buf.toString("ascii", 4, 8), "ftyp", "an MP4 starts with ftyp");
  const sizes = [];
  const walk = (start, end) => {
    let p = start;
    while (p + 8 <= end) {
      let len = buf.readUInt32BE(p);
      const type = buf.toString("ascii", p + 4, p + 8);
      let head = 8;
      if (len === 1) {
        len = Number(buf.readBigUInt64BE(p + 8));
        head = 16;
      } else if (len === 0) len = end - p;
      if (len < head) break;
      if (["moov", "trak"].includes(type)) walk(p + head, p + len);
      else if (type === "tkhd") {
        const w = buf.readUInt32BE(p + len - 8) / 65536;
        const h = buf.readUInt32BE(p + len - 4) / 65536;
        if (w && h) sizes.push({ width: w, height: h });
      }
      p += len;
    }
  };
  walk(0, buf.length);
  assert.equal(sizes.length, 1, "one video track");
  return sizes[0];
}

/** A WebM's video size: EBML header (doctype webm), then Segment > Tracks > TrackEntry > Video > PixelWidth, PixelHeight. */
function webmSize(buf) {
  const id = (p) => {
    const b = buf[p];
    const n = b >= 0x80 ? 1 : b >= 0x40 ? 2 : b >= 0x20 ? 3 : 4;
    return { id: buf.readUIntBE(p, n), n };
  };
  const vint = (p) => {
    const b = buf[p];
    let n = 1;
    while (n <= 8 && !(b & (0x80 >> (n - 1)))) n++;
    let v = b & (0xff >> n);
    for (let i = 1; i < n; i++) v = v * 256 + buf[p + i];
    const unknown = v === 2 ** (7 * n) - 1;
    return { v: unknown ? Infinity : v, n };
  };
  const uint = (p, len) => buf.readUIntBE(p, len);
  let doctype = null;
  const size = {};
  const walk = (start, end) => {
    let p = start;
    while (p < end) {
      const e = id(p);
      const s = vint(p + e.n);
      const body = p + e.n + s.n;
      const stop = s.v === Infinity ? end : Math.min(end, body + s.v);
      if (e.id === 0x1a45dfa3 || e.id === 0x18538067 || e.id === 0x1654ae6b || e.id === 0xae || e.id === 0xe0) walk(body, stop);
      else if (e.id === 0x4282) doctype = buf.toString("ascii", body, stop);
      else if (e.id === 0xb0) size.width = uint(body, stop - body);
      else if (e.id === 0xba) size.height = uint(body, stop - body);
      else if (e.id === 0x1f43b675) break; // the first cluster: the tracks are read by then
      p = stop;
    }
  };
  walk(0, buf.length);
  assert.equal(doctype, "webm", "an EBML file of doctype webm");
  return size;
}

test("every tab has a chapter, and every beat named is a stop of the site's story", () => {
  for (const t of TABS) assert.ok(CHAPTERS[t.id], `${t.label} (${t.id}) has no chapter`);
  assert.deepEqual(Object.keys(CHAPTERS).filter((id) => !TABS.some((t) => t.id === id)), [], "the map names only the panel's tabs");
  for (const [tab, c] of Object.entries(CHAPTERS)) {
    assert.ok(Object.hasOwn(keys, c.beat), `${tab}: beat ${c.beat} is not in beats.ts KEYS`);
    const stop = stops.find((s) => s.id === c.beat);
    assert.ok(stop, `${tab}: beat ${c.beat} is not a stop of the site's story (beats.ts SITE_KEYS)`);
    assert.equal(c.chapter, stop.chapter, `${tab}: ${c.beat} is chapter ${stop.chapter} in the site's story`);
    assert.equal(c.name, keys[c.beat].name, `${tab}: ${c.beat}'s name`);
    assert.equal(c.term, keys[c.beat].term, `${tab}: ${c.beat}'s racing term`);
    assert.equal(LOOP_BEAT[c.loop], c.beat, `${tab}: the loop ${c.loop} draws one beat`);
  }
});

test("a tab whose beat links to it is mapped to such a beat", () => {
  // where the story has a beat that links to the tab, the map uses one of them; the rest take the nearest
  for (const [tab, c] of Object.entries(CHAPTERS)) {
    const linked = stops.filter((s) => keys[s.id].tab === tab);
    if (linked.length && tab !== "intro") assert.ok(linked.some((s) => s.id === c.beat), `${tab}: ${c.beat} does not link to it, but ${linked.map((s) => s.id).join(", ")} do`);
  }
});

test("each tab's head shows its chapter, except the Intro, which is chapter 01", () => {
  assert.equal(paneChapter("intro"), undefined);
  assert.equal(paneChapter("toString"), undefined);
  assert.equal(paneChapter(undefined), undefined);
  for (const t of TABS) if (t.id !== "intro") assert.equal(paneChapter(t.id), CHAPTERS[t.id]);
  assert.equal(chapterHref("shared-memory"), "/?chapter=shared-memory");
});

test("every loop's files are the ones its receipt names, byte for byte", () => {
  const expected = new Set();
  for (const loop of CHAPTER_LOOPS) {
    const receipt = JSON.parse(read(join(dir, `${loop}.json`)));
    expected.add(`${loop}.json`);
    assert.equal(receipt.schema, "grand-prix.chapter-loop.v1");
    assert.equal(receipt.loop, loop);
    assert.equal(receipt.beat, LOOP_BEAT[loop], `${loop}: the receipt's beat`);
    assert.equal(receipt.frame, keys[receipt.beat].frame, `${loop}: the receipt's frame is the beat's`);
    assert.equal(receipt.chapter, stops.find((s) => s.id === receipt.beat)?.chapter, `${loop}: the receipt's chapter`);
    assert.match(receipt.code.commit, /^[0-9a-f]{40}$/, `${loop}: the code's commit`);
    assert.match(receipt.render.command, /render-chapters\.mjs .*--loops /, `${loop}: the render command`);
    assert.match(receipt.frame_data_sha256, /^[0-9a-f]{64}$/);
    const loopSeconds = receipt.render.loop.frames / receipt.render.loop.fps;
    assert.ok(loopSeconds >= 4 && loopSeconds <= 6, `${loop}: a 4 to 6 s loop (${loopSeconds} s)`);
    const names = Object.keys(receipt.files).sort();
    assert.deepEqual(names, [`${loop}-640.mp4`, `${loop}-640.webm`, `${loop}-960.mp4`, `${loop}-960.webm`, `${loop}.webp`].sort(), `${loop}: its files`);
    for (const [name, f] of Object.entries(receipt.files)) {
      expected.add(name);
      const buf = readFileSync(join(dir, name));
      assert.equal(buf.length, f.bytes, `${name}: bytes`);
      assert.equal(createHash("sha256").update(buf).digest("hex"), f.sha256, `${name}: sha256`);
      assert.ok(buf.length <= MAX_BYTES, `${name}: ${buf.length} bytes, over ${MAX_BYTES}`);
      const size = name.endsWith(".webp") ? webpSize(buf) : name.endsWith(".mp4") ? mp4Size(buf) : webmSize(buf);
      assert.deepEqual(size, { width: f.width, height: f.height }, `${name}: size`);
      assert.equal(f.width / f.height, 16 / 9, `${name}: 16:9`);
    }
  }
  const present = readdirSync(dir).filter((n) => !n.startsWith("."));
  assert.deepEqual(present.filter((n) => !expected.has(n)).sort(), [], "public/chapters holds only the receipts' files");
});

test("the Intro opens the story at a chapter's beat", () => {
  const overlay = read(join(site, "src", "pages", "Intro", "StoryOverlay.tsx"));
  const intro = read(join(site, "src", "pages", "Intro", "index.tsx"));
  assert.match(overlay, /mountStory\(el, \{[^}]*\bstartBeat\b/, "StoryOverlay passes its startBeat to mountStory");
  assert.match(intro, /useChapterLink\(/, "the Intro reads ?chapter=");
  assert.match(intro, /startBeat=\{chapter\.beat/, "the Intro opens the story at the address's beat");
});
