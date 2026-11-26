// Stills of the playable game: node src/game/shots.mjs --port <p> --out <dir> [--scale 2] [--only id,id]
// The page (src/game/play.html) must be served on 127.0.0.1:<port> (scripts/serve.sh). Chrome comes from the launcher
// module that WORLD_BROWSER_LIB names, as scripts/render.mjs launches it; each still is a
// fresh page at its size, shot once window.__ready is set, brought to 1x by ffmpeg's Lanczos when --scale is 2.
// Writes <id>.png and <id>.json (the URL, the plan's score, warnings, refused requests).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RESERVED = new Set([5184, 5185, 15190, 15193, 15199]);
const argv = process.argv.slice(2);
const opt = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };
const port = Number(opt('port')), out = opt('out'), scale = Number(opt('scale', '1'));
if (!Number.isInteger(port) || !out) { console.error('usage: node src/game/shots.mjs --port <p> --out <dir> [--scale 2] [--only id,id]'); process.exit(2); }
if (RESERVED.has(port)) { console.error(`port ${port} is reserved`); process.exit(2); }
const base = `http://127.0.0.1:${port}`;

// The beat-the-planner plan: whole contracts on C's schedule, found by coordinate ascent (model.test.mjs proves it).
const BEAT = '5:14,7:34,9:-17,10:-71,11:-100,12:-14,17:95';
const SHOTS = [
  { id: 'game.play-dial-0', note: 'Dial at 0 (A’s schedule), no glass: the price-chasing day.', q: 'mode=story&dial=0&glass=' },
  { id: 'game.play-dial-50', note: 'Dial at 0.50: the schedule halfway from A to C, no glass.', q: 'mode=story&dial=10&glass=' },
  { id: 'game.play-dial-100', note: 'Dial at 1 (C’s schedule), no glass: the schedule chosen for the hedge, unhedged.', q: 'mode=story&dial=20&glass=' },
  { id: 'game.play-glass-3h', note: 'Glass on three hours at dial 1: HE08 sells 50, HE12 buys 100, HE18 sells 95.', q: 'mode=story&dial=20&glass=7:50,11:-100,17:95&select=17' },
  { id: 'game.play-beat', note: 'The beat-the-planner moment: whole contracts on C’s schedule that score above the sealed plan.', q: `mode=story&dial=20&glass=${BEAT}&select=12` },
  { id: 'game.play-light', note: 'C’s glass at dial 0.35: the light marks glass the schedule does not deliver; the score counts what fits.', q: 'mode=story&dial=7&glass=5:13,7:33,9:-17,10:-71,11:-100,12:-12,17:94&select=9' },
  { id: 'game.markets-light', note: 'The Markets tab in the site’s light theme: the stage holds dark, the deck below follows the page.', q: `mode=play&theme=light&dial=20&glass=${BEAT}&select=17`, h: 1720 },
];
const only = (opt('only') ?? '').split(',').filter(Boolean);

function lanczos(png, file, W, H) {
  return new Promise((ok, fail) => {
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'png_pipe', '-i', 'pipe:0', '-vf', `scale=${W}:${H}:flags=lanczos`, '-frames:v', '1', file]);
    let err = ''; ff.stderr.on('data', (d) => { err += d; }); ff.on('error', fail);
    ff.on('close', (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg ${c}: ${err}`)))); ff.stdin.end(png);
  });
}

const lib = process.env.WORLD_BROWSER_LIB;
if (!lib) { console.error('set WORLD_BROWSER_LIB to the browser launcher module (README: Checks)'); process.exit(2); }
const { launch, guardRequests } = await import(pathToFileURL(lib).href);
process.env.ROLE_VIDEOS_TMP ??= tmpdir();
mkdirSync(resolve(out), { recursive: true });
let failed = 0;
for (const s of SHOTS.filter((x) => !only.length || only.includes(x.id))) {
  const W = 1920, H = s.h ?? 1080;
  const { ctx, close } = await launch({ viewport: { width: W, height: H }, dpr: scale, colorScheme: s.q.includes('theme=light') ? 'light' : 'dark' });
  try {
    const refused = await guardRequests(ctx, base);
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') logs.push(`${m.type()}: ${m.text()}`.slice(0, 400)); });
    page.on('pageerror', (e) => logs.push(`pageerror: ${String(e?.stack ?? e).slice(0, 400)}`));
    const url = `${base}/src/game/play.html?${s.q}&still=1&w=${W}&h=${H}&dpr=${scale}`;
    await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
    await page.mouse.move(W + 40, H - 40);
    const st = await (await page.waitForFunction(() => window.__ready === true || typeof window.__error === 'string', null, { timeout: 120_000, polling: 100 })).jsonValue();
    const err = await page.evaluate(() => window.__error ?? null);
    if (err) throw new Error(err);
    void st;
    const score = await page.evaluate(() => { const p = window.__game.played(); return { step: window.__game.getPlan().step, mean: p.score.mean, cvar: p.score.cvar, objective: p.score.objective, losing: p.score.losing, lit: p.lit, limits: p.limits }; });
    const shot = await page.screenshot({ type: 'png', fullPage: false, animations: 'disabled', caret: 'hide' });
    const file = join(out, `${s.id}.png`);
    if (scale > 1) await lanczos(shot, file, W, H); else writeFileSync(file, shot);
    writeFileSync(join(out, `${s.id}.json`), JSON.stringify({ id: s.id, note: s.note, url, width: W, height: H, scale, score, warnings: logs, refused: refused.splice(0) }, null, 1));
    console.log(`${s.id}: ${file} (score ${score.objective} uusd${score.lit ? ', light on' : ''}), ${logs.length} warnings`);
    for (const l of logs.slice(0, 6)) console.log(`  ${l}`);
  } catch (e) {
    failed++; console.log(`${s.id}: FAILED ${String(e?.message ?? e).slice(0, 600)}`);
  } finally { await close(); }
}
process.exit(failed ? 1 : 0);
