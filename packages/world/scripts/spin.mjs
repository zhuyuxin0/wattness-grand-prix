// Renders a short loop of one frame-lab frame that exposes window.__objectSpin (the _objects rig's object frames): the
// camera swung round the object and back, frame by frame on a fixed phase, encoded as WebM (VP9) and MP4 (H.264) for
// the site's hover loops.
//
//   node scripts/spin.mjs --port <p> --frame <id> --out <dir> [--name <file stem>] [--w 960] [--h 540] [--scale 2]
//        [--seconds 4] [--fps 30] [--swing 10] [--formats mp4,webm] [--timeout 180]
//
// The lab must already be served on 127.0.0.1:<port> (scripts/serve.sh); Chrome is launched through WORLD_BROWSER_LIB
// (README: Checks), headless. One page: once the lab sets window.__ready, each frame is posed by __objectSpin(i / n)
// and shot at --scale device pixels per CSS px; ffmpeg brings the PNGs to w x h with Lanczos and encodes, as --formats
// asks, <out>/<name>.mp4 (libx264, crf 27, yuv420p, faststart) and <out>/<name>.webm (libvpx-vp9, crf 38), and writes
// <out>/<name>.json (the frame, the lab's address, the GPU, the frames' count and each file's SHA-256 and bytes).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RESERVED = new Set([5184, 5185, 15190, 15193, 15199]);
const argv = process.argv.slice(2);
const opt = (name, fallback = null) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : fallback; };
const port = Number(opt('port')), frame = opt('frame'), out = opt('out');
if (!Number.isInteger(port) || port <= 0 || !frame || !out) { console.error('usage: node scripts/spin.mjs --port <p> --frame <id> --out <dir> [--name n] [--w 960] [--h 540] [--scale 2] [--seconds 4] [--fps 30] [--swing 10]'); process.exit(2); }
if (RESERVED.has(port)) { console.error(`port ${port} is reserved; pick a spare port`); process.exit(2); }
const name = opt('name', frame.replace(/[^A-Za-z0-9._-]/g, '_'));
const W = Number(opt('w', '960')), H = Number(opt('h', '540')), scale = Number(opt('scale', '2'));
const fps = Number(opt('fps', '30')), n = Math.round(Number(opt('seconds', '4')) * fps), swing = Number(opt('swing', '10'));
const timeout = Number(opt('timeout', '180')) * 1000;
const formats = new Set(opt('formats', 'mp4,webm').split(',').map((x) => x.trim()));
const base = `http://127.0.0.1:${port}`;
const lab = `${base}/lab.html?frame=${encodeURIComponent(frame)}&w=${W}&h=${H}&theme=dark&plates=0`;
const sha = (b) => createHash('sha256').update(b).digest('hex');

const lib = process.env.WORLD_BROWSER_LIB;
if (!lib) { console.error('set WORLD_BROWSER_LIB to the browser launcher module (README: Checks)'); process.exit(2); }
const { launch, guardRequests } = await import(pathToFileURL(lib).href);
mkdirSync(resolve(out), { recursive: true });
const frames = mkdtempSync(join(tmpdir(), 'spin-'));
const { ctx, close } = await launch({ viewport: { width: W, height: H }, dpr: scale, colorScheme: 'dark' });
let gpu = null;
const logs = [];
try {
  const refused = await guardRequests(ctx, base);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') logs.push(`${m.type()}: ${m.text()}`.slice(0, 400)); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${String(e).slice(0, 400)}`));
  await page.goto(lab, { waitUntil: 'load', timeout });
  await page.mouse.move(W + 40, Math.round(H * 0.86));
  const state = await (await page.waitForFunction(() => (window.__ready === true || typeof window.__error === 'string') && { error: window.__error ?? null, gpu: window.__frame?.gpu ?? null, spin: typeof window.__objectSpin === 'function' }, null, { timeout, polling: 100 })).jsonValue();
  if (state.error) throw new Error(state.error);
  if (!state.spin) throw new Error(`${frame} has no __objectSpin: only the _objects rig's object frames loop`);
  gpu = state.gpu;
  for (let i = 0; i < n; i++) {
    await page.evaluate(([u, s]) => window.__objectSpin(u, s), [i / n, swing]);
    const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H }, animations: 'disabled', caret: 'hide' });
    writeFileSync(join(frames, `${String(i).padStart(4, '0')}.png`), shot);
  }
  if (refused.length) logs.push(`refused: ${refused.join(', ')}`);
} finally {
  await close();
}
const seq = join(frames, '%04d.png'), vf = `scale=${W}:${H}:flags=lanczos`;
const webm = join(out, `${name}.webm`), mp4 = join(out, `${name}.mp4`);
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(fps), '-i', seq, '-vf', vf, '-an', ...args], { stdio: 'inherit' });
if (formats.has('webm')) ff(['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', webm]);
if (formats.has('mp4')) ff(['-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
rmSync(frames, { recursive: true, force: true });
const file = (p) => { const b = readFileSync(p); return { bytes: b.length, sha256: sha(b) }; };
const receipt = {
  frame, lab: lab.replace(base + '/', ''), width: W, height: H, scale, fps, frames: n, seconds: n / fps, swing_deg: swing,
  shot: `${W * scale} x ${H * scale} device px a frame, Lanczos to ${W} x ${H}`, gpu,
  files: {
    ...(formats.has('mp4') ? { [`${name}.mp4`]: { codec: 'h264 crf 27 yuv420p faststart', ...file(mp4) } } : {}),
    ...(formats.has('webm') ? { [`${name}.webm`]: { codec: 'vp9 crf 38', ...file(webm) } } : {}),
  },
  warnings: logs,
};
writeFileSync(join(out, `${name}.json`), JSON.stringify(receipt, null, 1));
console.log(`${frame}: ${n} frames, ${Object.entries(receipt.files).map(([f, v]) => `${f} ${v.bytes} B`).join(', ')}, ${logs.length} warnings`);
