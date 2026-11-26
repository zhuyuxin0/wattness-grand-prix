// Captures the story player's film (src/story/story.html?mode=capture) in headless Chrome on the GPU.
//
//   node scripts/capture-story.mjs --port <p> [--cut master|90s] [--from s] [--to s] [--fps 60] [--out <dir>]
//        [--frames <dir>] [--scale 1|2] [--captions film|frame|none] [--no-encode | --encode-only] [--crf 14]
//   node scripts/capture-story.mjs --port <p> --shots [--cut master] [--out <dir>] [--scale 2]
//   node scripts/capture-story.mjs --port <p> --times 1,12.5,30 [--out <dir>]
//   node scripts/capture-story.mjs --port <p> --measure 30,45 [--gpu]
//
// The page must already be served on 127.0.0.1:<port> (scripts/serve.sh). Chrome comes from the launcher module that
// WORLD_BROWSER_LIB names (README: Checks; the user's HOME kept, a temporary profile and TMPDIR, the mock keychain, ANGLE on Metal). A film
// is drawn frame by frame on the player's own clock: window.__gpClock(i / fps) poses frame i, window.__ready says it
// has settled, and the page is shot into <out>/frames/<i>.png (frame numbers count from 0 at the film's start, so a
// short range keeps its place); ffmpeg then encodes the PNGs as H.264 (crf 14, yuv420p, faststart), bringing a
// --scale 2 capture down to 1920 x 1080 with Lanczos. --shots renders the proof stills: every key at rest and two
// moments inside each part's legs (main.ts names them). --measure draws a range at 30 frames a second, each waited for
// on the GPU (the frame's cost), then plays it in real time and reports the frame intervals and each render's time,
// with the GPU's load before and after (another process may share the GPU: the reading says so). Writes a JSON receipt
// beside the output.
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
const usage = 'usage: node scripts/capture-story.mjs --port <p> [--cut master|90s] [--from s] [--to s] [--fps 60] [--out dir] [--frames dir] [--scale 1|2] [--captions film|frame|none] [--shots | --times a,b | --measure t0,t1 [--gpu]] [--no-encode] [--crf 14]';
const port = Number(opt('port'));
if (!Number.isInteger(port) || port <= 0) { console.error(usage); process.exit(2); }
if (RESERVED.has(port)) { console.error(`port ${port} is reserved; pick a spare port`); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const cut = opt('cut', 'master') === '90s' ? '90s' : 'master';
const fps = Number(opt('fps', '60'));
const scale = Number(opt('scale', '1'));
const captions = opt('captions', 'film');
const crf = String(Number(opt('crf', '14')));
const W = 1920, H = 1080;
const timeout = Number(opt('timeout', '300')) * 1000;
const base = `http://127.0.0.1:${port}`;
const url = `${base}/src/story/story.html?mode=capture&cut=${cut}&w=${W}&h=${H}&captions=${captions}`;

const gpuLoad = () => {
  try { return Number(execFileSync('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator'], { encoding: 'utf8' }).match(/"Device Utilization %"=(\d+)/)?.[1] ?? NaN); }
  catch { return null; }
};
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const run = (cmd, args) => new Promise((ok, fail) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'pipe'] });
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

const lib = process.env.WORLD_BROWSER_LIB;
if (!lib) { console.error('set WORLD_BROWSER_LIB to the browser launcher module (README: Checks)'); process.exit(2); }
const { launch, guardRequests } = await import(pathToFileURL(lib).href);
process.env.ROLE_VIDEOS_TMP ??= tmpdir();

const { ctx, close } = await launch({ viewport: { width: W, height: H }, dpr: scale, colorScheme: 'dark' });
const refused = await guardRequests(ctx, base);
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') logs.push(`${m.type()}: ${m.text()}`.slice(0, 600)); });
page.on('pageerror', (e) => logs.push(`pageerror: ${String(e?.stack ?? e).slice(0, 600)}`));
const shoot = async () => page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H }, animations: 'disabled', caret: 'hide' });
const clock = (t, dt = 0) => page.evaluate(([t, dt]) => window.__gpClock(t, dt), [t, dt]);
const errorOf = async () => page.evaluate(() => window.__error ?? null);
let failed = false;
try {
  const gpuBefore = gpuLoad();
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout });
  // the pointer outside the stage, as the stills scripts park it
  await page.mouse.move(W + 40, Math.round(H * 0.86));
  await page.waitForFunction(() => window.__ready === true || typeof window.__error === 'string', null, { timeout, polling: 100 });
  const err0 = await errorOf();
  if (err0) throw new Error(err0);
  const story = await page.evaluate(() => window.__gpStory);
  const from = Number(opt('from', '0')), to = Math.min(story.seconds, Number(opt('to', String(story.seconds))));

  if (has('measure')) {
    const [a, b] = (opt('measure') ?? '0,10').split(',').map(Number);
    const before = gpuLoad();
    const m = await page.evaluate(([a, b, gpu]) => window.__gpPlay(a, b, { gpu }), [a, b, has('gpu')]);
    const after = gpuLoad();
    const receipt = { cut, range: [a, b], scale, viewport: `${W} x ${H} CSS px at ${scale}x`, gpuLoad: { before, after }, sharedGpu: before > 30, ...m, warnings: logs, refused };
    const out = resolve(opt('out', join(pkg, 'storyboard/player')));
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, `measure-${cut}-${a}-${b}${scale > 1 ? `-x${scale}` : ''}${has('gpu') ? '-gpu' : ''}.json`), JSON.stringify(receipt, null, 1));
    console.log(JSON.stringify({ cost: m.cost, intervals: m.intervals, cpu: m.cpu, gpu: m.gpu, misses: m.misses, capped: m.capped, size: m.size, gpuLoad: receipt.gpuLoad, gpuName: m.gpuName }, null, 1));
  } else if (has('shots') || has('times')) {
    const out = resolve(opt('out', join(pkg, 'storyboard/player')));
    mkdirSync(out, { recursive: true });
    const shots = has('times')
      ? (opt('times') ?? '').split(',').filter(Boolean).map((s) => ({ id: `t-${Number(s).toFixed(3)}`, t: Number(s) }))
      : [...story.shots.rests, ...story.shots.mids];
    const receipts = [];
    for (const s of shots) {
      const r0 = Date.now();
      const state = await clock(s.t, 0);
      const err = await errorOf();
      const png = join(out, `${s.id}.png`);
      const shot = await shoot();
      if (scale > 1) await lanczos(shot, png); else writeFileSync(png, shot);
      const info = await page.evaluate(() => window.__gpInfo());
      receipts.push({ ...s, png, sha256: sha256(readFileSync(png)), ms: Date.now() - r0, state, error: err, frames: info.frames.filter((f) => f.error) });
      console.log(`${s.id} t=${s.t}: ${(state.frames ?? []).map((f) => `${f.id}@${f.local}${f.alpha < 1 ? ` x${f.alpha}` : ''}`).join(' + ') || state.error} (${Date.now() - r0} ms)`);
    }
    const info = await page.evaluate(() => window.__gpInfo());
    writeFileSync(join(out, `shots-${cut}.json`), JSON.stringify({ cut, url, scale, gpu: info.gpu, gpuLoad: { before: gpuBefore, after: gpuLoad() }, wallMs: Date.now() - t0, shots: receipts, errors: info.errors, warnings: logs, refused }, null, 1));
  } else {
    const out = resolve(opt('out', join(pkg, `storyboard/player/film-${cut}`)));
    // the PNG frames can live apart from the film (a 20 s range at 1920 x 1080 is about a gigabyte of PNGs)
    const framesDir = resolve(opt('frames', join(out, 'frames')));
    mkdirSync(framesDir, { recursive: true });
    mkdirSync(out, { recursive: true });
    const i0 = Math.round(from * fps), i1 = Math.round(to * fps);
    const rs = [];
    // --encode-only: the PNGs are already in the frames folder (a capture whose encode failed)
    for (let i = has('encode-only') ? i1 : i0; i < i1; i++) {
      const f0 = Date.now();
      const state = await clock(i / fps, 1 / fps);
      if (state?.error) { console.log(`frame ${i}: ${state.error}`); failed = true; }
      const shot = await shoot();
      writeFileSync(join(framesDir, `${String(i).padStart(6, '0')}.png`), shot);
      rs.push(Date.now() - f0);
      if ((i - i0) % fps === 0) console.log(`t=${(i / fps).toFixed(2)} s: ${(state.frames ?? []).map((f) => `${f.id}@${f.local}${f.alpha < 1 ? ` x${f.alpha}` : ''}`).join(' + ')} (${rs[rs.length - 1]} ms)`);
    }
    const mp4 = join(out, `${cut}-${from}-${to}${scale > 1 ? `-x${scale}` : ''}.mp4`);
    if (!has('no-encode')) {
      const files = readdirSync(framesDir).filter((f) => /^\d{6}\.png$/.test(f)).sort();
      if (!files.length) throw new Error('no frames to encode');
      await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(fps), '-start_number', String(i0), '-i', join(framesDir, '%06d.png'),
        '-frames:v', String(i1 - i0), ...(scale > 1 ? ['-vf', `scale=${W}:${H}:flags=lanczos`] : []), '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
      console.log(`encoded ${mp4}`);
    }
    const info = await page.evaluate(() => window.__gpInfo());
    const sorted = rs.slice().sort((a, b) => a - b);
    writeFileSync(join(out, `${cut}-${from}-${to}.json`), JSON.stringify({ cut, url, from, to, fps, scale, crf: Number(crf), frames: i1 - i0, mp4: has('no-encode') ? null : mp4, framesDir,
      // the wall time to pose, settle and shoot each frame (null with --encode-only: the PNGs came from an earlier run)
      encodeOnly: has('encode-only'),
      perFrameMs: rs.length ? { mean: Math.round(rs.reduce((a, b) => a + b, 0) / rs.length), p95: sorted[Math.floor(sorted.length * 0.95)] ?? null, max: sorted[sorted.length - 1] ?? null } : null,
      gpu: info.gpu, gpuLoad: { before: gpuBefore, after: gpuLoad() }, wallMs: Date.now() - t0, errors: info.errors, warnings: logs.slice(0, 200), refused }, null, 1));
  }
} catch (e) {
  console.error(`capture failed: ${e?.stack ?? e}`);
  for (const l of logs.slice(0, 20)) console.error(`  ${l}`);
  failed = true;
} finally {
  await close();
}
process.exit(failed ? 1 : 0);
