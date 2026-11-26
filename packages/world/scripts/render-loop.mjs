// Renders a seamless loop of one frame (loop.html, src/loop.ts) in headless Chrome on the GPU, and encodes it.
//
//   node scripts/render-loop.mjs --port <p> --frame <id> --frames <dir> --out <dir> --name <base>
//        [--seconds 12] [--fps 30] [--scale 1] [--zoom 1] [--dx 0] [--dy 0] [--daz 0] [--del 0] [--rock 0.9] [--t0 s]
//        [--crf-mp4 30] [--max-mp4 1.6M] [--crf-webm 42] [--poster-q 78] [--encode-only]
//
// The page must already be served on 127.0.0.1:<port> (scripts/serve.sh). Chrome comes from the launcher module that
// WORLD_BROWSER_LIB names (README: Checks): a temporary profile and TMPDIR, the user's HOME kept, the mock keychain,
// ANGLE on Metal, every request outside the served origin refused. One page sets the frame up once; frame i is posed
// at t = i / fps on the loop's own clock (src/loop.ts: camera drift, clock and comets all of period --seconds) and
// shot into <frames>/<i>.png, brought down to 1920 x 1080 by ffmpeg's Lanczos when --scale is 2. Frame 0 is drawn
// again after the last, and the receipt says whether its PNG is byte-identical (the loop closes on itself).
// Then <out>/<name>.mp4 (H.264, yuv420p, faststart, no audio), <out>/<name>.webm (VP9, no audio) and
// <out>/<name>-poster.webp (frame 0, cwebp) are written, with <out>/<name>.json, the receipt: the frame key, the
// git commit, the command, each file's size, bytes and SHA-256. A receipt names no local path: files by their names,
// the frames folder as <frames>.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RESERVED = new Set([5184, 5185, 15190, 15193, 15199]);
const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const opt = (name, fallback = null) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] != null && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback; };
const usage = 'usage: node scripts/render-loop.mjs --port <p> --frame <id> --frames <dir> --out <dir> --name <base> [--seconds 12] [--fps 30] [--scale 1] [--zoom 1] [--dx 0] [--dy 0] [--daz 0] [--del 0] [--rock 0.9] [--t0 <s>] [--crf-mp4 30] [--max-mp4 1.6M] [--crf-webm 42] [--poster-q 78] [--encode-only]';
const port = Number(opt('port'));
const frame = opt('frame'), framesDir = opt('frames'), out = opt('out'), name = opt('name');
if (!frame || !framesDir || !out || !name || (!has('encode-only') && (!Number.isInteger(port) || port <= 0))) { console.error(usage); process.exit(2); }
if (RESERVED.has(port)) { console.error(`port ${port} is reserved; pick a spare port`); process.exit(2); }
const W = 1920, H = 1080;
const seconds = Number(opt('seconds', '12')), fps = Number(opt('fps', '30')), scale = Number(opt('scale', '1'));
const N = Math.round(seconds * fps);
const view = Object.fromEntries(['zoom', 'dx', 'dy', 'daz', 'del', 'rock', 't0'].filter((k) => opt(k) != null).map((k) => [k, Number(opt(k))]));
const enc = { crfMp4: opt('crf-mp4', '30'), maxMp4: opt('max-mp4', '1.6M'), crfWebm: opt('crf-webm', '42'), posterQ: opt('poster-q', '78') };
const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const base = `http://127.0.0.1:${port}`;
const query = new URLSearchParams({ frame, w: String(W), h: String(H), seconds: String(seconds), fps: String(fps), ...Object.fromEntries(Object.entries(view).map(([k, v]) => [k, String(v)])) });
const url = `${base}/loop.html?${query}`;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const gpuLoad = () => {
  try { return Number(execFileSync('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator'], { encoding: 'utf8' }).match(/"Device Utilization %"=(\d+)/)?.[1] ?? NaN); }
  catch { return null; }
};
const run = (cmd, args) => new Promise((ok, fail) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err += d; });
  p.on('error', fail); p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`${cmd} exited ${code}: ${err.trim().slice(-800)}`))));
});
function lanczos(png, file) {
  return new Promise((ok, fail) => {
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'png_pipe', '-i', 'pipe:0', '-vf', `scale=${W}:${H}:flags=lanczos`, '-frames:v', '1', file]);
    let err = ''; ff.stderr.on('data', (d) => { err += d; });
    ff.on('error', fail); ff.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}: ${err.trim()}`))));
    ff.stdin.end(png);
  });
}
const pad = (i) => String(i).padStart(4, '0');
const frames = resolve(framesDir);
const outDir = resolve(out);
mkdirSync(frames, { recursive: true });
mkdirSync(outDir, { recursive: true });

let loop = null, closes = null, gpu = { before: gpuLoad(), after: null }, wallMs = null, logs = [];
if (!has('encode-only')) {
  const lib = process.env.WORLD_BROWSER_LIB;
  if (!lib) { console.error('set WORLD_BROWSER_LIB to the browser launcher module (README: Checks)'); process.exit(2); }
  const { launch, guardRequests } = await import(pathToFileURL(lib).href);
  process.env.ROLE_VIDEOS_TMP ??= tmpdir();
  const { ctx, close } = await launch({ viewport: { width: W, height: H }, dpr: scale, colorScheme: 'dark' });
  const t0 = Date.now();
  try {
    const refused = await guardRequests(ctx, base);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') logs.push(`${m.type()}: ${m.text()}`.slice(0, 600)); });
    page.on('pageerror', (e) => logs.push(`pageerror: ${String(e?.stack ?? e).slice(0, 600)}`));
    await page.goto(url, { waitUntil: 'load', timeout: 180000 });
    await page.mouse.move(W + 40, Math.round(H * 0.86));
    const state = await (await page.waitForFunction(() => (window.__ready === true || typeof window.__error === 'string') && { error: window.__error ?? null, loop: window.__loop ?? null }, null, { timeout: 180000, polling: 100 })).jsonValue();
    if (state.error) throw new Error(state.error);
    loop = state.loop;
    const shoot = async (i, file) => {
      await page.evaluate((k) => window.__loopPose(k), i);
      const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H }, animations: 'disabled', caret: 'hide' });
      if (scale > 1) await lanczos(shot, file); else writeFileSync(file, shot);
      return sha256(readFileSync(file));
    };
    const first = await shoot(0, join(frames, `${pad(0)}.png`));
    for (let i = 1; i < N; i++) {
      await shoot(i, join(frames, `${pad(i)}.png`));
      if (i % 60 === 0) console.log(`frame ${i} of ${N}`);
    }
    const again = await shoot(N, join(frames, 'closing.png'));
    closes = again === first;
    if (refused.length) logs.push(...refused.map((u) => `refused: ${u}`));
  } finally {
    await close();
  }
  wallMs = Date.now() - t0;
  gpu.after = gpuLoad();
  console.log(`${N} frames in ${(wallMs / 1000).toFixed(1)} s, frame ${N} ${closes ? 'is' : 'is NOT'} frame 0 byte for byte, ${logs.length} warnings`);
  for (const w of logs.slice(0, 8)) console.log(`  ${w}`);
}

const pngs = readdirSync(frames).filter((f) => /^\d{4}\.png$/.test(f)).sort();
if (pngs.length !== N) { console.error(`expected ${N} frames in ${frames}, found ${pngs.length}`); process.exit(1); }
const mp4 = join(outDir, `${name}.mp4`), webm = join(outDir, `${name}.webm`), poster = join(outDir, `${name}-poster.webp`);
const input = ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(fps), '-i', join(frames, '%04d.png')];
const mp4Args = ['-c:v', 'libx264', '-preset', 'veryslow', '-crf', enc.crfMp4, '-maxrate', enc.maxMp4, '-bufsize', enc.maxMp4.replace(/(\d+(?:\.\d+)?)/, (m) => String(Number(m) * 2)), '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-g', String(fps * 4), '-movflags', '+faststart', '-an'];
const webmArgs = ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', enc.crfWebm, '-deadline', 'good', '-cpu-used', '1', '-row-mt', '1', '-pix_fmt', 'yuv420p', '-g', String(fps * 4), '-an'];
const posterArgs = ['-q', enc.posterQ, '-m', '6', '-sharp_yuv', '-quiet'];
await run('ffmpeg', [...input, ...mp4Args, mp4]);
await run('ffmpeg', [...input, ...webmArgs, webm]);
await run('cwebp', [...posterArgs, join(frames, `${pad(0)}.png`), '-o', poster]);

const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_read_frames:format=duration', '-of', 'json', file], { encoding: 'utf8' }));
const fileEntry = (file, extra = {}) => { const buf = readFileSync(file); return { bytes: buf.length, sha256: sha256(buf), ...extra }; };
const videoEntry = (file) => {
  const p = probe(file), s = p.streams[0];
  return fileEntry(file, { codec: s.codec_name, width: s.width, height: s.height, pix_fmt: s.pix_fmt, fps: s.r_frame_rate, frames: Number(s.nb_read_frames), seconds: Number(Number(p.format.duration).toFixed(3)), audio: false });
};
const git = (...a) => { try { return execFileSync('git', ['-C', pkg, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };
const files = {
  [`${name}.mp4`]: videoEntry(mp4),
  [`${name}.webm`]: videoEntry(webm),
  [`${name}-poster.webp`]: fileEntry(poster, { width: W, height: H, of: 'frame 0' }),
};
const receiptPath = join(outDir, `${name}.json`);
let prior = null;
try { prior = JSON.parse(readFileSync(receiptPath, 'utf8')); } catch { /* none yet */ }
// the command as run, its port and folders as placeholders (a receipt names no local path)
const PLACE = { '--port': '<port>', '--frames': '<frames>', '--out': '<out>' };
const command = `packages/world: sh scripts/serve.sh <port>, then node scripts/render-loop.mjs ${argv.map((a, i) => PLACE[argv[i - 1]] ?? a).join(' ')}`;
const receipt = {
  schema: 'grand-prix.loop.v1',
  frame_key: frame,
  loop: loop ?? prior?.loop ?? null,
  code: { commit: git('rev-parse', 'HEAD'), dirty: (git('status', '--porcelain', '--', '.') ?? '') !== '' },
  frame_data_sha256: sha256(readFileSync(join(pkg, 'src', 'data', 'frame-data.json'))),
  render: {
    command,
    url: `loop.html?${query}`,
    scale, frames: N, seconds, fps,
    closes: closes ?? prior?.render?.closes ?? null,
    wall_ms: wallMs ?? prior?.render?.wall_ms ?? null,
    gpu: loop?.gpu ?? prior?.render?.gpu ?? null,
    gpu_load: has('encode-only') ? prior?.render?.gpu_load ?? null : gpu,
    warnings: has('encode-only') ? prior?.render?.warnings ?? [] : logs,
  },
  encode: {
    mp4: `ffmpeg ${['-framerate', String(fps), '-i', '<frames>/%04d.png', ...mp4Args].join(' ')}`,
    webm: `ffmpeg ${['-framerate', String(fps), '-i', '<frames>/%04d.png', ...webmArgs].join(' ')}`,
    poster: `cwebp ${posterArgs.join(' ')} <frames>/0000.png`,
    tools: { ffmpeg: execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0].split(' ').slice(0, 3).join(' '), cwebp: execFileSync('cwebp', ['-version'], { encoding: 'utf8' }).split('\n')[0] },
  },
  files,
  total_bytes: Object.values(files).reduce((a, f) => a + f.bytes, 0),
};
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 1)}\n`);
for (const [n, f] of Object.entries(files)) console.log(`${n}: ${f.bytes} bytes${f.codec ? `, ${f.codec} ${f.width}x${f.height}, ${f.frames} frames, ${f.seconds} s` : ''}`);
console.log(`total ${receipt.total_bytes} bytes; receipt ${name}.json`);
