// The tabs' 3D stills (public/renders/): each pair of WebPs, at 640 and 1280 across, is named byte for byte by its
// receipt (<name>.json: the frame, the code it was rendered from, the command, every file's SHA-256), as the Intro's
// hero still is (intro-hero.test.mjs). Every still a page names has its receipt and files, every file in the folder
// belongs to a receipt, each still stays under 150 KB, and each receipt's frame is one the 3D package defines.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(site, "public", "renders");
const stations = resolve(site, "..", "packages", "world", "src", "stations");
const read = (p) => readFileSync(p, "utf8");
const MAX_BYTES = 150 * 1024;

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

const receipts = readdirSync(dir)
  .filter((n) => n.endsWith(".json"))
  .map((n) => ({ name: n.slice(0, -5), r: JSON.parse(read(join(dir, n))) }));

/** Every file under a folder, recursively. */
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

test("each still's receipt names its files byte for byte", () => {
  assert.ok(receipts.length > 0, "public/renders/ holds receipts");
  for (const { name, r } of receipts) {
    assert.equal(r.schema, "grand-prix.render-still.v1", `${name}: schema`);
    assert.match(r.frame, /^[_a-z]+\.[A-Za-z0-9.-]+$/, `${name}: a frame id`);
    assert.match(r.code.base, /^[0-9a-f]{40}$/, `${name}: the base commit`);
    assert.match(r.code.world_tree, /^[0-9a-f]{40}$/, `${name}: the 3D package's tree`);
    if (r.code.rig) assert.match(r.code.rig.git_blob, /^[0-9a-f]{40}$/, `${name}: the rig's blob`);
    assert.match(r.frame_data_sha256, /^[0-9a-f]{64}$/, `${name}: the frame data`);
    assert.match(r.render.command, /scripts\/render\.mjs .*--frames \S+ .*--plates 0/, `${name}: the command`);
    assert.ok(r.render.lab.includes(`frame=${r.frame}`), `${name}: the lab's address names the frame`);
    assert.deepEqual(Object.keys(r.files).sort(), [`${name}-1280.webp`, `${name}-640.webp`], `${name}: its two files`);
    for (const [file, f] of Object.entries(r.files)) {
      const buf = readFileSync(join(dir, file));
      assert.equal(buf.length, f.bytes, `${file}: bytes`);
      assert.equal(createHash("sha256").update(buf).digest("hex"), f.sha256, `${file}: sha256`);
      assert.deepEqual(webpSize(buf), { width: f.width, height: f.height }, `${file}: size`);
      assert.equal(f.width / f.height, 16 / 9, `${file}: 16:9`);
      assert.ok(buf.length <= MAX_BYTES, `${file}: ${buf.length} bytes, over 150 KB`);
    }
  }
});

test("every file in public/renders/ belongs to a receipt", () => {
  const named = new Set(receipts.flatMap(({ name, r }) => [`${name}.json`, ...Object.keys(r.files)]));
  for (const f of walk(dir).map((p) => p.slice(dir.length + 1))) assert.ok(named.has(f), `${f} has no receipt`);
});

test("each receipt's frame is one the 3D package defines", () => {
  for (const { name, r } of receipts) {
    const station = r.frame.slice(0, r.frame.indexOf("."));
    const src = read(join(stations, station, "index.ts"));
    // a frame is a key of the station's frames table: '<id>': ..., or built from its kind ('stack.' + kind)
    assert.ok(src.includes(`'${r.frame}'`), `${name}: ${r.frame} is not a frame of stations/${station}`);
  }
});

test("every still a page names has its receipt", () => {
  const pages = walk(join(site, "src")).filter((p) => /\.(ts|tsx)$/.test(p));
  const names = new Set();
  for (const p of pages) {
    const src = read(p);
    for (const m of src.matchAll(/\bstill:\s*"([a-z0-9-]+)"/g)) names.add(m[1]);
    for (const m of src.matchAll(/<ObjectStill\b[^>]*?\bname="([a-z0-9-]+)"/g)) names.add(m[1]);
  }
  assert.ok(names.size > 0, "the pages name stills");
  const have = new Set(receipts.map((x) => x.name));
  for (const n of names) assert.ok(have.has(n), `${n} is named on a page but has no receipt in public/renders/`);
});
