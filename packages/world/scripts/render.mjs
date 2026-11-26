// Renders frame-lab frames to PNG in headless Chrome on the GPU.
//
//   node scripts/render.mjs --port <p> --frames <id,id> --out <dir> [--scale 2] [--theme dark|light]
//        [--w 1920] [--h 1080] [--repeat n] [--timeout 180]
//
// The lab must already be served on 127.0.0.1:<port> (scripts/serve.sh). Chrome is launched through the launcher module
// that WORLD_BROWSER_LIB names (README: Checks): the user's
// HOME kept, a temporary profile and TMPDIR, the mock keychain, ANGLE on Metal. Each frame gets a fresh page; once
// the lab sets window.__ready the canvas and its plates are shot together, at --scale device pixels per CSS px and
// brought back to w x h by ffmpeg's Lanczos when scale > 1. Writes <out>/<id>.png and <id>.json (render time, the
// GPU's renderer string, console warnings and errors, refused requests, the GPU's load before and after). With
// --repeat n each frame is drawn n times in fresh pages and the receipt says whether the PNGs' SHA-256 agree.
// A receipt names a PNG inside this package by its path from the package's folder ("storyboard/frames/<id>.png"), so a
// committed receipt carries no local path; a PNG outside the package keeps its absolute path.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const named = (p) => { const r = relative(pkg, resolve(p)); return r && !r.startsWith('..') && !isAbsolute(r) ? r.split(sep).join('/') : resolve(p); };

const RESERVED = new Set([5184, 5185, 15190, 15193, 15199]);
const argv = process.argv.slice(2);
const opt = (name, fallback = null) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : fallback; };
const usage = 'usage: node scripts/render.mjs --port <p> --frames <id,id> --out <dir> [--scale 2] [--theme dark|light] [--w 1920] [--h 1080] [--repeat n] [--timeout 180]';
const port = Number(opt('port'));
const ids = (opt('frames') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const out = opt('out');
if (!Number.isInteger(port) || port <= 0 || !ids.length || !out) { console.error(usage); process.exit(2); }
if (RESERVED.has(port)) { console.error(`port ${port} is reserved; pick a spare port`); process.exit(2); }
const scale = Number(opt('scale', '1'));
const theme = opt('theme', 'dark') === 'light' ? 'light' : 'dark';
const W = Number(opt('w', '1920')), H = Number(opt('h', '1080'));
const repeat = Math.max(1, Number(opt('repeat', '1')));
const timeout = Number(opt('timeout', '180')) * 1000;
const base = `http://127.0.0.1:${port}`;

const gpuLoad = () => {
  try { return Number(execFileSync('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator'], { encoding: 'utf8' }).match(/"Device Utilization %"=(\d+)/)?.[1] ?? NaN); }
  catch { return null; }
};
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const fileOf = (id) => id.replace(/[^A-Za-z0-9._-]/g, '_');

function lanczos(png, file) {
  return new Promise((ok, fail) => {
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'png_pipe', '-i', 'pipe:0', '-vf', `scale=${W}:${H}:flags=lanczos`, '-frames:v', '1', file]);
    let err = '';
    ff.stderr.on('data', (d) => { err += d; });
    ff.on('error', fail);
    ff.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}: ${err.trim()}`))));
    ff.stdin.end(png);
  });
}

const lib = process.env.WORLD_BROWSER_LIB;
if (!lib) { console.error('set WORLD_BROWSER_LIB to the browser launcher module (README: Checks)'); process.exit(2); }
const { launch, guardRequests } = await import(pathToFileURL(lib).href);
process.env.ROLE_VIDEOS_TMP ??= tmpdir();

mkdirSync(resolve(out), { recursive: true });
const { ctx, close } = await launch({ viewport: { width: W, height: H }, dpr: scale, colorScheme: theme });
let failed = 0;
try {
  const refused = await guardRequests(ctx, base);
  for (const id of ids) {
    const runs = [];
    for (let r = 0; r < repeat; r++) {
      const page = await ctx.newPage();
      const logs = [];
      page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') logs.push(`${m.type()}: ${m.text()}`.slice(0, 600)); });
      page.on('pageerror', (e) => logs.push(`pageerror: ${String(e?.stack ?? e).slice(0, 600)}`));
      const gpuBefore = gpuLoad(), t0 = Date.now();
      const url = `${base}/lab.html?frame=${encodeURIComponent(id)}&w=${W}&h=${H}&theme=${theme}`;
      let state = null, error = null;
      try {
        await page.goto(url, { waitUntil: 'load', timeout });
        // the pointer outside the stage, as the stills scripts park it
        await page.mouse.move(W + 40, Math.round(H * 0.86));
        const done = await page.waitForFunction(() => (window.__ready === true || typeof window.__error === 'string') && { ready: window.__ready === true, error: window.__error ?? null, frame: window.__frame ?? null },
          null, { timeout, polling: 100 });
        state = await done.jsonValue();
        error = state.error;
      } catch (e) { error = String(e?.message ?? e); }
      const wallMs = Date.now() - t0;
      if (error) {
        runs.push({ ok: false, error, wallMs, logs });
        await page.close();
        break;
      }
      const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H }, animations: 'disabled', caret: 'hide' });
      const png = join(out, `${fileOf(id)}${r ? `.repeat-${r}` : ''}.png`);
      if (scale > 1) await lanczos(shot, png); else writeFileSync(png, shot);
      const hash = sha256(readFileSync(png));
      runs.push({ ok: true, png: named(png), sha256: hash, wallMs, renderMs: state.frame?.renderMs ?? null, gpuLoad: { before: gpuBefore, after: gpuLoad() }, frame: state.frame, logs });
      await page.close();
    }
    const first = runs[0];
    const receipt = {
      id, url: `${base}/lab.html?frame=${encodeURIComponent(id)}&w=${W}&h=${H}&theme=${theme}`, width: W, height: H, scale, theme,
      shot: scale > 1 ? `${W * scale} x ${H * scale} device px, Lanczos to ${W} x ${H}` : `${W} x ${H}`,
      ok: runs.every((x) => x.ok), error: runs.find((x) => !x.ok)?.error ?? null,
      png: first?.png ?? null, sha256: first?.sha256 ?? null,
      deterministic: repeat > 1 && runs.every((x) => x.ok) ? runs.every((x) => x.sha256 === first.sha256) : null,
      renderMs: first?.renderMs ?? null, wallMs: first?.wallMs ?? null,
      gpu: first?.frame?.gpu ?? null, gpuOk: first?.frame?.gpu ? /ANGLE Metal Renderer/.test(first.frame.gpu) : null,
      // the load before the page opens is other work's; the reading after includes this render's own
      gpuLoad: first?.gpuLoad ?? null, underLoad: first?.gpuLoad?.before > 30,
      note: first?.frame?.note ?? null, frame: first?.frame ?? null,
      warnings: runs.flatMap((x) => x.logs), refused: refused.splice(0),
      runs: runs.map(({ ok, sha256: s, wallMs, renderMs, gpuLoad: g, error }) => ({ ok, sha256: s, wallMs, renderMs, gpuLoad: g, error })),
    };
    writeFileSync(join(out, `${fileOf(id)}.json`), JSON.stringify(receipt, null, 1));
    if (!receipt.ok) failed++;
    console.log(receipt.ok
      ? `${id}: ${receipt.png} in ${receipt.renderMs} ms (wall ${receipt.wallMs} ms${receipt.underLoad ? ', under load' : ''}), ${receipt.gpu}${receipt.deterministic == null ? '' : `, ${repeat} runs ${receipt.deterministic ? 'identical' : 'DIFFER'}`}, ${receipt.warnings.length} warnings`
      : `${id}: FAILED: ${receipt.error}`);
    if (receipt.gpuOk === false) console.log(`  not the Metal GPU: ${receipt.gpu}`);
    for (const w of receipt.warnings.slice(0, 8)) console.log(`  ${w}`);
  }
} finally {
  await close();
}
process.exit(failed ? 1 : 0);
