// The loop behind the Overview's control room (public/home/): the Tech Stack's 3D in motion, rendered by
// packages/world's loop lab (loop.html, src/loop.ts, scripts/render-loop.mjs). Its receipt (tech-landscape.json) must
// name the published files byte for byte, as the hero still's does, and the files must be what the page can play:
// H.264 and VP9 at 1920 x 1080 with no sound, a WebP poster of the first frame, at most 4 MB together.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = join(site, "public", "home");
const read = (p) => readFileSync(p, "utf8");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const LOOP = {
  name: "tech-landscape",
  files: { webm: "tech-landscape.webm", mp4: "tech-landscape.mp4", poster: "tech-landscape-poster.webp" },
  width: 1920,
  height: 1080,
};
const receipt = JSON.parse(read(join(home, `${LOOP.name}.json`)));

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

/** An MP4's boxes, in file order: [{ type, start, size }], descending into the containers named. */
function boxes(buf, from = 0, to = buf.length, into = new Set(["moov", "trak", "mdia", "minf", "stbl"])) {
  const out = [];
  for (let at = from; at + 8 <= to; ) {
    let size = buf.readUInt32BE(at);
    const type = buf.toString("ascii", at + 4, at + 8);
    let head = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(at + 8));
      head = 16;
    } else if (size === 0) size = to - at;
    assert.ok(size >= head, `box ${type} at ${at} has size ${size}`);
    out.push({ type, start: at, size });
    if (into.has(type)) out.push(...boxes(buf, at + head, at + size, into));
    at += size;
  }
  return out;
}

test("the loop's receipt names every file byte for byte, within 4 MB together", () => {
  assert.equal(receipt.schema, "grand-prix.loop.v1");
  assert.equal(receipt.frame_key, "stack.rest", "the Tech Stack's 3D at rest");
  assert.match(receipt.code.commit, /^[0-9a-f]{40}$/);
  assert.match(receipt.frame_data_sha256, /^[0-9a-f]{64}$/);
  assert.equal(receipt.render.closes, true, "the frame after the last is frame 0 byte for byte");
  assert.ok(receipt.render.seconds >= 8 && receipt.render.seconds <= 12, "an 8 to 12 s loop");
  assert.equal(receipt.render.frames, Math.round(receipt.render.seconds * receipt.render.fps));
  assert.deepEqual(Object.keys(receipt.files).sort(), Object.values(LOOP.files).sort());
  let total = 0;
  for (const [name, f] of Object.entries(receipt.files)) {
    const buf = readFileSync(join(home, name));
    assert.equal(buf.length, f.bytes, `${name}: bytes`);
    assert.equal(sha256(buf), f.sha256, `${name}: sha256`);
    assert.equal(f.width, LOOP.width, `${name}: width`);
    assert.equal(f.height, LOOP.height, `${name}: height`);
    total += buf.length;
  }
  assert.equal(receipt.total_bytes, total);
  assert.ok(total <= 4 * 1024 * 1024, `the three files are ${total} bytes, more than 4 MB`);
  // no local path in a committed receipt
  assert.doesNotMatch(JSON.stringify(receipt), /\/Users\/|\/private\/tmp\/|\/home\//);
});

test("the poster is the loop's first frame at 1920 x 1080", () => {
  const buf = readFileSync(join(home, LOOP.files.poster));
  assert.deepEqual(webpSize(buf), { width: LOOP.width, height: LOOP.height });
  assert.equal(receipt.files[LOOP.files.poster].of, "frame 0");
});

test("the MP4 is H.264 at 1920 x 1080 with no sound, its index before its data", () => {
  const buf = readFileSync(join(home, LOOP.files.mp4));
  const all = boxes(buf);
  const top = all.filter((b) => ["ftyp", "moov", "mdat", "free"].includes(b.type) && b.start < buf.length);
  const at = (type) => top.find((b) => b.type === type)?.start ?? -1;
  assert.ok(at("moov") >= 0 && at("mdat") > at("moov"), "faststart: moov before mdat");
  const tracks = all.filter((b) => b.type === "trak");
  assert.equal(tracks.length, 1, "one track: the picture, no audio");
  const tkhd = all.find((b) => b.type === "tkhd");
  assert.ok(tkhd);
  const v = buf.readUInt8(tkhd.start + 8);
  const off = tkhd.start + 8 + (v === 1 ? 88 : 76);
  assert.equal(buf.readUInt32BE(off) / 65536, 1920, "tkhd width");
  assert.equal(buf.readUInt32BE(off + 4) / 65536, 1080, "tkhd height");
  const stsd = all.find((b) => b.type === "stsd");
  assert.equal(buf.toString("ascii", stsd.start + 20, stsd.start + 24), "avc1", "H.264");
  assert.equal(receipt.files[LOOP.files.mp4].codec, "h264");
  assert.equal(receipt.files[LOOP.files.mp4].audio, false);
});

test("the WebM is VP9 at 1920 x 1080 with no sound", () => {
  const head = readFileSync(join(home, LOOP.files.webm)).subarray(0, 8192);
  assert.deepEqual([...head.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], "EBML");
  assert.ok(head.includes(Buffer.from("webm")), "DocType webm");
  assert.ok(head.includes(Buffer.from("V_VP9")), "VP9");
  assert.ok(!head.includes(Buffer.from("A_OPUS")) && !head.includes(Buffer.from("A_VORBIS")), "no audio track");
  assert.ok(head.includes(Buffer.from([0xb0, 0x82, 0x07, 0x80])), "PixelWidth 1920");
  assert.ok(head.includes(Buffer.from([0xba, 0x82, 0x04, 0x38])), "PixelHeight 1080");
  assert.equal(receipt.files[LOOP.files.webm].codec, "vp9");
});
