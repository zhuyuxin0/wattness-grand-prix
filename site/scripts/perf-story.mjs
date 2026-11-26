#!/usr/bin/env node
// Measures the story on the built site, chapter by chapter, in headless Chrome on the machine's GPU.
//
//   node scripts/perf-story.mjs --dist dist --port 15197 [--out dir] [--label baseline]
//   node scripts/perf-story.mjs --url http://127.0.0.1:15197/ [--out dir] [--label baseline]
//        [--w 1440 --h 900 --dpr 2] [--dwell film|<ms>] [--back <steps>] [--to <chapter>] [--reduced]
//        [--headless new|shell] [--settle 4] [--shots <dir>] [--note "text"]
//   node scripts/perf-story.mjs --compare before=a.json,b.json after=c.json,d.json
//
// It opens the Intro, clicks its Play button and steps through every chapter with the arrow key, resting at each
// for the film's own hold there (beats.ts MASTER, as the site cut times it) or for --dwell ms, then, with --back N,
// steps back N chapters the same way. For each chapter it reports:
//   build ms, ready ms  the setup and the setup plus its programs (player.ts ensure) of each frame the chapter brings,
//                       and when each was built: ahead of the visitor at a rest, on demand in the leg, or on open
//   held, wait shown    the time the position held while the visitor had asked to move (a build under way, or a
//                       picture not built yet), and how much of it showed "Building the next station" (after 400 ms)
//   leg                 the leg's length, as the film's pace sets it (site.ts STEP_PACE 1.15) and as it ran
//   leg fps             pictures drawn per second through the leg (holds left out), and the longest gap between two
//   rest fps            animation frames per second while the chapter rests (a build at a rest blocks them), and the
//                       longest gap; with each gap, the 60 Hz frames it missed (headless Chrome's frames are not paced
//                       by a display, so a rate can pass 60: the gaps and missed frames are what compare)
//   long tasks          the main thread's tasks over 50 ms (PerformanceObserver 'longtask'), in the leg and at rest
// with the live frames and renderer.info.memory at each rest. The player and the site push their events onto
// window.__gpPerf, which this script defines before the page loads (player.ts perfLog); without it they record nothing.
//
// The GPU's load is read before anything starts (ioreg's "Device Utilization %", five times over 2 s once --settle
// seconds have passed), every 2 s through the run and after the browser has closed, with the busiest other processes.
// The run is labelled "under load" when the GPU was busy through all five readings before it started or another
// process kept a core busy: timings taken beside another job are not this page's alone.
//
// Chrome keeps the user's HOME (a temporary HOME shows a keychain dialog on macOS); the profile and TMPDIR are a
// temporary folder, with the mock keychain, and WebGL runs on the GPU through ANGLE's Metal backend. Every request
// outside the served origin is refused and listed. Playwright is resolved from this project, or from the folder in
// PLAYWRIGHT_DIR (a node_modules directory that holds it), as capture-scene.mjs does.
//
// --compare reads receipts this script wrote (--out) and prints, per chapter, each group's mean over its runs side by
// side (groups named before the "=", their receipts after it, comma-separated), then every run's totals.
import { execFileSync, execFile } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { loadavg, tmpdir } from 'node:os';
import { basename, extname, join, resolve, sep } from 'node:path';

const RESERVED = new Set([5184, 5185, 15190, 15193, 15199]);
/** site.ts STEP_PACE: a step plays the film's leg 1.15 times as fast. */
const STEP_PACE = 1.15;

const argv = process.argv.slice(2);
const opt = (name, fallback = null) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] != null && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback; };
const usage = 'usage: node scripts/perf-story.mjs (--dist <dir> --port <p> | --url <served site>) [--out <dir>] [--label <name>] [--w 1440 --h 900 --dpr 2] [--dwell film|<ms>] [--back <steps>] [--to <chapter>] [--reduced] [--headless new|shell] [--shots <dir>] [--note <text>]\n       node scripts/perf-story.mjs --compare <name>=<receipt.json>[,<receipt.json>...] ...';
if (argv.includes('--compare')) { compare(); process.exit(0); }
const dist = opt('dist');
const port = Number(opt('port', '0'));
let url = opt('url');
if (!dist && !url) { console.error(usage); process.exit(2); }
if (dist && !(Number.isInteger(port) && port > 0)) { console.error('--dist needs --port'); process.exit(2); }
const portOf = (u) => { try { const x = new URL(u); return Number(x.port || (x.protocol === 'https:' ? 443 : 80)); } catch { return NaN; } };
const usedPort = dist ? port : portOf(url);
if (RESERVED.has(usedPort)) { console.error(`port ${usedPort} is reserved; pick a spare port`); process.exit(2); }
const W = Number(opt('w', '1440')), H = Number(opt('h', '900')), DPR = Number(opt('dpr', '2'));
const dwellArg = opt('dwell', 'film');
const back = Math.max(0, Math.round(Number(opt('back', '0')) || 0));
const label = opt('label', 'run');
const note = opt('note', '');
const outDir = opt('out');
const arriveTimeout = Number(opt('timeout', '90')) * 1000;
/** A folder for a shot of the story at each rest, once its plates are in (for comparing two builds; it slows a run). */
const shotsDir = opt('shots');
/** The last chapter to step to (1-based; all of them by default), for a short check. */
const toChapter = Number(opt('to', '0')) || Infinity;
/** 'new': Chromium's own headless mode (the browser's full rendering path); 'shell': the headless shell. Neither paces
 *  animation frames by a display: at a rest both run well past 60 a second. */
const headless = opt('headless', 'new') === 'shell' ? 'shell' : 'new';
/** The visitor's setting for reduced motion: the rests as stills, a step cross-fading from one to the next. */
const reduced = argv.includes('--reduced');
/** Seconds to wait before the first reading of the GPU's load: ioreg's figure can hold the last job's value for a few
 *  seconds (back-to-back runs read the run before's own 92-95% a second after it closed). */
const settle = Math.max(0, Number(opt('settle', '4')) || 0);

// ---- the clock and the machine's load ----

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const fmt = (d, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(d);
/** A time as the market reads it (CT), with the reader's own beside it. */
const stamp = (d = new Date()) => `${fmt(d, 'America/Chicago')} CT (${fmt(d, zone)} ${zone})`;
const fileStamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\..*$/, 'Z');

function gpuLoad() {
  try { return Number(execFileSync('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator'], { encoding: 'utf8' }).match(/"Device Utilization %"=(\d+)/)?.[1] ?? NaN); }
  catch { return null; }
}
const gpuLoadAsync = () => new Promise((ok) => execFile('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator'], { encoding: 'utf8' }, (e, out) => ok(e ? null : Number(String(out).match(/"Device Utilization %"=(\d+)/)?.[1] ?? NaN))));
/** Every process with its parent, CPU share and command line. */
function processes() {
  try {
    return execFileSync('ps', ['-Ao', 'pid=,ppid=,pcpu=,args='], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split('\n').map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/)).filter(Boolean)
      .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), cpu: Number(m[3]), args: m[4] }));
  } catch { return []; }
}
/** The processes of this run: this script and everything under it, and the browser it launched (found by its profile). */
function ours(list, profileDir) {
  const mine = new Set([process.pid]);
  for (const p of list) if (profileDir && p.args.includes(profileDir)) mine.add(p.pid);
  let grew = true;
  while (grew) { grew = false; for (const p of list) if (!mine.has(p.pid) && mine.has(p.ppid)) { mine.add(p.pid); grew = true; } }
  return mine;
}
/** The busiest processes that are not this run's: name (the command's last path part) and CPU share. */
function others(profileDir) {
  const list = processes(), mine = ours(list, profileDir);
  return list.filter((p) => !mine.has(p.pid) && p.cpu >= 5).sort((a, b) => b.cpu - a.cpu).slice(0, 6)
    .map((p) => ({ pid: p.pid, cpu: p.cpu, name: (p.args.split(' ')[0] ?? '').split('/').pop() ?? '', what: p.args.split(' ').slice(1, 3).map((a) => a.split('/').pop()).join(' ').slice(0, 60) }));
}

// ---- the site, served from its build when --dist is given ----

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.map': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm' };
function serve(dir, p) {
  const root = resolve(dir);
  if (!existsSync(join(root, 'index.html'))) throw new Error(`${dir} has no index.html: build the site first (pnpm run build:app)`);
  const server = createServer((req, res) => {
    let path;
    try { path = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname); } catch { res.writeHead(400).end(); return; }
    let file = resolve(root, `.${path}`);
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); }
    catch { file = extname(path) ? null : join(root, 'index.html'); } // a route without a file: the app's own page
    if (!file || !existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok, fail) => {
    server.once('error', (e) => fail(e.code === 'EADDRINUSE' ? new Error(`port ${p} is in use: pick a free spare port`) : e));
    server.listen(p, '127.0.0.1', () => ok(server));
  });
}

// ---- in the page ----

/** Defined before the page's own scripts: the log the player and the site push onto, every animation frame's time,
 *  and the long tasks. */
const INIT = () => {
  const log = { events: [], draws: [], raf: [], long: [] };
  Object.defineProperty(window, '__gpPerf', { value: log, writable: false, configurable: false });
  const tick = (t) => { log.raf.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) log.long.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); }
  catch { log.long = null; }
};

/** The story's film as the page plays it: its stops, each leg's frames and nominal length, and the beats' names. */
const FILM = (stepPace) => {
  const P = window.__gpPerf.player, S = window.__gpPerf.site, F = P.film;
  const frameOf = (stop) => S.beats[stop].frame;
  const legs = [];
  for (let j = 1; j < F.stops.length; j++) {
    const a = F.keys[F.stops[j - 1]], b = F.keys[F.stops[j]], frames = new Set();
    for (let i = 0; i <= 48; i++) for (const f of P.framesNear(a.until + ((b.at - a.until) * i) / 48, 0).need) frames.add(f);
    legs.push({ to: j, frames: [...frames], nominalMs: Math.round((Math.max(0.6, F.span(j - 1)) / stepPace) * 1000) });
  }
  return {
    cut: F.cut, stops: F.stops.length,
    beats: S.beats.map((b) => ({ index: b.index, id: b.id, name: b.name, frame: b.frame })),
    holds: F.stops.map((ki) => Math.round((F.keys[ki].until - F.keys[ki].at) * 1000)),
    legs, first: frameOf(0),
  };
};

/** What the page holds at a rest: the frames alive, the renderer's memory, the last picture's draw calls. */
const AT_REST = () => {
  const P = window.__gpPerf.player, r = P.stage.renderer;
  const info = P.info();
  return { t: performance.now(), live: info.frames.filter((f) => f.ready).map((f) => f.id), memory: { ...r.info.memory }, programs: r.info.programs?.length ?? null,
    calls: P.stage.frameInfo.calls, triangles: P.stage.frameInfo.triangles };
};

// ---- the run ----

const loads = { before: [], during: [], after: null };
await new Promise((r) => setTimeout(r, settle * 1000));
for (let i = 0; i < 5; i++) { loads.before.push(gpuLoad()); if (i < 4) await new Promise((r) => setTimeout(r, 500)); }
const othersBefore = others(null);
const started = new Date();
const load0 = loadavg();

let server = null;
if (dist) { server = await serve(dist, port); url = `http://127.0.0.1:${port}/`; }
const base = new URL(url).origin;

const require = createRequire(process.env.PLAYWRIGHT_DIR ? join(resolve(process.env.PLAYWRIGHT_DIR), 'noop.js') : import.meta.url);
const { chromium } = require('playwright');
const tmp = mkdtempSync(join(tmpdir(), 'gp-perf-'));
const profile = join(tmp, 'profile');
const ctx = await chromium.launchPersistentContext(profile, {
  headless: true, ...(headless === 'new' ? { channel: 'chromium' } : {}),
  viewport: { width: W, height: H }, deviceScaleFactor: DPR, colorScheme: 'dark', serviceWorkers: 'block', reducedMotion: reduced ? 'reduce' : 'no-preference',
  timezoneId: 'America/Chicago', locale: 'en-US',
  args: ['--use-mock-keychain', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', '--force-color-profile=srgb'],
  env: { ...process.env, TMPDIR: tmp },
});
const refused = [];
await ctx.route('**/*', (route) => {
  const r = route.request(), u = new URL(r.url());
  if (u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
  if (u.origin === base && (r.method() === 'GET' || r.method() === 'HEAD')) return route.continue();
  refused.push(`${r.method()} ${u.origin}${u.pathname}`);
  return route.abort();
});
await ctx.addInitScript(INIT);

let sampling = true;
const sampler = (async () => { while (sampling) { const v = await gpuLoadAsync(); loads.during.push(v); await new Promise((r) => setTimeout(r, 2000)); } })();
const othersDuring = [];

const logs = [];
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') logs.push(`${m.type()}: ${m.text()}`.slice(0, 400)); });
page.on('pageerror', (e) => logs.push(`pageerror: ${String(e?.stack ?? e).slice(0, 400)}`));

const result = { error: null };
const rests = [];
let film = null;
try {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  const play = page.locator('button[aria-haspopup="dialog"]').filter({ hasText: /play the/i }).first();
  await play.waitFor({ state: 'visible', timeout: 60000 });
  // the pointer at the stage's right edge, where no plate or rail sits
  await page.mouse.move(W - 6, Math.round(H * 0.62));
  await page.waitForTimeout(800);
  await play.click();
  await page.waitForFunction(() => window.__gpPerf.events.some((e) => e.e === 'rest' && e.k === 0), null, { timeout: arriveTimeout, polling: 50 });
  film = await page.evaluate(FILM, STEP_PACE);
  await page.mouse.move(W - 6, Math.round(H * 0.62));
  await page.evaluate(() => document.querySelector('.gp-story')?.focus({ preventScroll: true }));
  rests.push({ k: 0, ...(await page.evaluate(AT_REST)) });
  // a shot of the dialog at a rest, its plates in (laid out after the landing, then in over 0.3 s)
  let shotN = 0;
  const shoot = async (k, dir) => {
    if (!shotsDir) return 0;
    const t0 = Date.now();
    await page.waitForFunction((k) => { const L = window.__gpPerf.events; const r = L.filter((e) => e.e === 'rest' && e.k === k).pop(); return !!r && L.some((e) => e.e === 'plates' && e.k === k && e.to >= r.t); }, k, { timeout: 3000, polling: 50 }).catch(() => {}); // a rest shown before keeps its layout: no new one comes
    await page.waitForTimeout(700);
    mkdirSync(resolve(shotsDir), { recursive: true });
    await page.screenshot({ path: join(resolve(shotsDir), `${String(shotN++).padStart(2, '0')}-${String(k + 1).padStart(2, '0')}${dir < 0 ? '-back' : ''}-${film.beats[k].id}.png`), animations: 'disabled', caret: 'hide' });
    return Date.now() - t0;
  };
  await shoot(0, 1);
  const dwellFor = (k) => (dwellArg === 'film' ? film.holds[k] : Number(dwellArg));
  // forward through every chapter, then back as asked
  const path = [];
  const last = Math.min(film.stops, toChapter) - 1;
  for (let k = 1; k <= last; k++) path.push(k);
  for (let i = 1; i <= back && last - i >= 0; i++) path.push(last - i);
  let at = 0;
  for (const k of path) {
    const since = await page.evaluate((k) => window.__gpPerf.events.filter((e) => e.e === 'rest' && e.k === k).length, k);
    await page.waitForTimeout(Math.max(0, dwellFor(at)));
    if (rests.length === Math.ceil(path.length / 2)) othersDuring.push(...others(profile));
    await page.keyboard.press(k > at ? 'ArrowRight' : 'ArrowLeft');
    await page.waitForFunction(([k, n]) => window.__gpPerf.events.filter((e) => e.e === 'rest' && e.k === k).length > n, [k, since], { timeout: arriveTimeout, polling: 30 });
    rests.push({ k, ...(await page.evaluate(AT_REST)) });
    await shoot(k, k > at ? 1 : -1);
    at = k;
  }
  await page.waitForTimeout(1500);
} catch (e) {
  result.error = String(e?.stack ?? e).slice(0, 1200);
}

const raw = await page.evaluate(() => {
  const L = window.__gpPerf, P = L.player;
  const marks = Object.fromEntries(performance.getEntriesByType('mark').filter((m) => m.name.startsWith('gp-story:')).map((m) => [m.name, m.startTime]));
  const r = P?.stage.renderer;
  return { events: L.events, draws: L.draws, raf: L.raf, long: L.long, marks,
    gpu: P ? P.stage.gpu() : null, parallelCompile: r ? r.extensions.has('KHR_parallel_shader_compile') : null,
    canvas: r ? { w: r.domElement.width, h: r.domElement.height } : null, dpr: window.devicePixelRatio, now: performance.now() };
}).catch((e) => ({ error: String(e) }));
await ctx.close().catch(() => {});
rmSync(tmp, { recursive: true, force: true });
sampling = false;
await sampler;
if (server) await new Promise((r) => server.close(r));
await new Promise((r) => setTimeout(r, 1500));
loads.after = gpuLoad();
const othersAfter = others(null);
const ended = new Date();

// ---- the table ----

const ms = (x) => (x == null || !Number.isFinite(x) ? '' : String(Math.round(x)));
const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const ev = raw.events ?? [];
const builds = ev.filter((e) => e.e === 'build');
const holds = ev.filter((e) => e.e === 'hold');
const gos = ev.filter((e) => e.e === 'go');
const restEv = ev.filter((e) => e.e === 'rest');
const draws = []; for (let i = 0; i + 1 < (raw.draws ?? []).length; i += 2) draws.push(raw.draws[i]);
const raf = raw.raf ?? [];
const longs = raw.long ?? [];
const inWin = (t, a, b) => t >= a && t < b;
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** Frames each chapter brings (the leg's frames less the chapter before's), in the order the story first shows them. */
const brings = new Map();
if (film) {
  brings.set(0, [film.first]);
  const seen = new Set([film.first]);
  for (const leg of film.legs) { const fresh = leg.frames.filter((f) => !seen.has(f)); fresh.forEach((f) => seen.add(f)); brings.set(leg.to, fresh); }
}
/** Visits: each arrival at a stop, after the leg from the stop before it on the path. */
const visits = [];
for (let i = 0; i < restEv.length; i++) {
  const r = restEv[i], next = restEv[i + 1];
  const go = i === 0 ? null : [...gos].reverse().find((g) => g.t <= r.t && g.to === r.k) ?? null;
  const legFrom = go ? go.t : (raw.marks?.['gp-story:open'] ?? r.t);
  const leaveAt = next ? ([...gos].find((g) => g.t > r.t && g.to === next.k)?.t ?? next.t) : (raw.now ?? r.t);
  visits.push({ k: r.k, dir: i === 0 ? 0 : Math.sign(r.k - restEv[i - 1].k), legFrom, arrive: r.t, leaveAt, go });
}
const restOf = (t) => visits.find((v) => t >= v.arrive && t < v.leaveAt) ?? null;
// a step back brings nothing new: what it costs is any frame of its leg built again since the way back began
const backFrom = visits.find((v, i) => i > 0 && v.dir < 0)?.legFrom ?? Infinity;
const counted = new Set();
const rows = visits.map((v, i) => {
  let own;
  if (v.dir >= 0) own = (brings.get(v.k) ?? []).map((f) => builds.filter((b) => b.frame === f && b.start <= v.arrive).pop()).filter(Boolean);
  else {
    const leg = film?.legs.find((l) => l.to === v.k + 1)?.frames ?? [];
    own = builds.filter((b) => leg.includes(b.frame) && b.start >= backFrom && b.start <= v.arrive && !counted.has(b));
  }
  own.forEach((b) => counted.add(b));
  const when = own.map((b) => {
    if (b.why === 'prefetch') { const r = restOf(b.start); return r ? `ahead at ${String(r.k + 1).padStart(2, '0')}` : 'ahead'; }
    return inWin(b.start, v.legFrom, v.arrive + 1) ? (i === 0 ? 'on open' : 'in the leg') : 'earlier';
  });
  const legHolds = holds.filter((h) => overlap(h.from, h.to, v.legFrom, v.arrive + 1) > 0);
  const held = legHolds.reduce((s, h) => s + (h.to - h.from), 0);
  const shown = legHolds.reduce((s, h) => s + h.shown, 0);
  const legMs = v.arrive - v.legFrom;
  const nominal = i === 0 || !film ? null : film.legs.find((l) => l.to === Math.max(v.k, visits[i - 1].k))?.nominalMs ?? null;
  // pictures through the leg, holds left out: the draws' rate over the leg's moving time, and the longest gap
  const ld = draws.filter((t) => inWin(t, v.legFrom, v.arrive + 1));
  const moving = legMs - held;
  // a gap's 60 Hz frames missed: one for each further 16.7 ms it took (headless frames are not paced by a display, so
  // the rates can pass 60; the gaps and the missed frames compare runs on any machine)
  const missed = (g) => Math.max(0, Math.round(g / (1000 / 60)) - 1);
  let gap = 0, legMissed = 0;
  for (let j = 1; j < ld.length; j++) { const g = ld[j] - ld[j - 1]; if (!legHolds.some((h) => overlap(h.from, h.to, ld[j - 1], ld[j]) > 0)) { gap = Math.max(gap, g); legMissed += missed(g); } }
  const legFps = i === 0 || ld.length < 2 || moving <= 0 ? null : (ld.length - 1) / (moving / 1000);
  const rr = raf.filter((t) => inWin(t, v.arrive, v.leaveAt));
  let rgap = 0, restMissed = 0; for (let j = 1; j < rr.length; j++) { const g = rr[j] - rr[j - 1]; rgap = Math.max(rgap, g); restMissed += missed(g); }
  const restFps = rr.length < 2 ? null : (rr.length - 1) / ((rr[rr.length - 1] - rr[0]) / 1000);
  const lt = (a, b) => longs.filter(([s]) => inWin(s, a, b));
  const ltLeg = lt(v.legFrom, v.arrive), ltRest = lt(v.arrive, v.leaveAt);
  const atRest = rests[i] ?? null;
  return {
    n: v.k + 1, id: film?.beats[v.k]?.id ?? String(v.k), name: film?.beats[v.k]?.name ?? '', dir: v.dir,
    frames: own.map((b) => b.frame), buildMs: own.reduce((s, b) => s + (b.buildMs ?? 0), 0), readyMs: own.reduce((s, b) => s + (b.readyMs ?? 0), 0),
    builds: own.map((b, j) => ({ frame: b.frame, why: b.why, when: when[j], buildMs: b.buildMs, readyMs: b.readyMs, programs: b.programs, prep: b.prep })),
    when, heldMs: held, shownMs: shown, holds: legHolds.map((h) => ({ ms: Math.round(h.to - h.from), shown: Math.round(h.shown), why: h.why })),
    legMs: i === 0 ? null : legMs, nominalMs: nominal, legFps, legGapMs: i === 0 ? null : gap, legMissed: i === 0 ? null : legMissed, restFps, restGapMs: rgap, restMissed, restMs: v.leaveAt - v.arrive,
    longLeg: { n: ltLeg.length, max: Math.max(0, ...ltLeg.map((x) => x[1])), total: ltLeg.reduce((s, x) => s + x[1], 0) },
    longRest: { n: ltRest.length, max: Math.max(0, ...ltRest.map((x) => x[1])), total: ltRest.reduce((s, x) => s + x[1], 0) },
    live: atRest?.live?.length ?? null, memory: atRest?.memory ?? null, calls: atRest?.calls ?? null,
  };
});

const busyOthers = [...othersBefore, ...othersDuring, ...othersAfter].filter((p) => p.cpu >= 50);
// the least of the readings: a busy GPU stays busy through all five, a figure held over from a finished job does not;
// no reading at all is unknown, never zero
const readBefore = loads.before.filter(Number.isFinite);
const gpuBefore = readBefore.length ? Math.min(...readBefore) : NaN;
const gpuUnknown = !Number.isFinite(gpuBefore);
const underLoad = gpuBefore > 10 || busyOthers.length > 0;
const loadWhy = [gpuBefore > 10 ? `the GPU read at least ${gpuBefore}% before the run` : null,
  busyOthers.length ? `other processes busy: ${[...new Map(busyOthers.map((p) => [p.pid, p])).values()].map((p) => `${p.name} ${p.what} (${Math.round(p.cpu)}%)`).join('; ')}` : null].filter(Boolean).join('; ');

const fwd = rows.filter((r) => r.dir > 0);
const summary = {
  label, note, url: base, viewport: `${W} x ${H} CSS px at ${DPR}x`, canvas: raw.canvas, gpu: raw.gpu, parallelCompile: raw.parallelCompile,
  dwell: dwellArg === 'film' ? "the film's hold at each chapter" : `${dwellArg} ms`, back, reduced,
  started: stamp(started), ended: stamp(ended),
  load: { underLoad, gpuUnknown, why: loadWhy || null, gpuBefore: loads.before, gpuDuring: { n: loads.during.length, median: median(loads.during), max: Math.max(...loads.during.filter(Number.isFinite), 0) }, gpuAfter: loads.after, loadavgBefore: load0.map((x) => +x.toFixed(2)), loadavgAfter: loadavg().map((x) => +x.toFixed(2)), othersBefore, othersDuring, othersAfter },
  open: raw.marks ? { codeMs: raw.marks['gp-story:code'] - raw.marks['gp-story:open'], readyMs: raw.marks['gp-story:ready'] - raw.marks['gp-story:open'], firstBeatMs: raw.marks['gp-story:first-beat'] - raw.marks['gp-story:open'] } : null,
  totals: {
    chapters: rows.length, heldMs: rows.reduce((s, r) => s + r.heldMs, 0), shownMs: rows.reduce((s, r) => s + r.shownMs, 0), chaptersWithWords: rows.filter((r) => r.shownMs > 0).length,
    lateMs: rows.reduce((s, r) => s + (r.legMs != null && r.nominalMs != null ? Math.max(0, r.legMs - r.nominalMs) : 0), 0),
    legFpsMedian: median(rows.map((r) => r.legFps)), legFpsMin: Math.min(...rows.map((r) => r.legFps).filter(Number.isFinite)),
    legMissed: rows.reduce((s, r) => s + (r.legMissed ?? 0), 0), restMissed: rows.reduce((s, r) => s + r.restMissed, 0),
    restFpsMedian: median(rows.map((r) => r.restFps)), worstRestGapMs: Math.max(0, ...rows.map((r) => r.restGapMs)), worstLegGapMs: Math.max(0, ...rows.map((r) => r.legGapMs ?? 0)),
    longTasks: longs.length, longTaskMs: longs.reduce((s, x) => s + x[1], 0), longestTaskMs: Math.max(0, ...longs.map((x) => x[1])),
    builds: builds.length, buildMs: builds.reduce((s, b) => s + (b.buildMs ?? 0), 0), readyMs: builds.reduce((s, b) => s + (b.readyMs ?? 0), 0),
    drops: ev.filter((e) => e.e === 'drop').length, maxLive: Math.max(0, ...rests.map((r) => r.live?.length ?? 0)),
    forwardHeldMs: fwd.reduce((s, r) => s + r.heldMs, 0),
  },
  refused, warnings: logs.slice(0, 40), error: result.error ?? raw.error ?? null,
};

const pad2 = (n) => String(n).padStart(2, '0');
const fps = (x) => (x == null || !Number.isFinite(x) ? '' : x.toFixed(0));
const lines = [];
lines.push(`### Story speed: ${label}${underLoad ? ' (under load)' : gpuUnknown ? ' (GPU load unknown)' : ''}`);
lines.push('');
lines.push(`${summary.started} to ${summary.ended.replace(/^.*?, /, '')}. ${summary.viewport} (canvas ${raw.canvas?.w ?? '?'} x ${raw.canvas?.h ?? '?'}), ${raw.gpu ?? 'GPU unknown'}, parallel shader compile ${raw.parallelCompile ? 'on' : 'off'}. Dwell: ${summary.dwell}${back ? `; then ${back} steps back` : ''}.${reduced ? ' Reduced motion.' : ''}${note ? ` ${note}` : ''}`);
lines.push(`GPU load before ${loads.before.join('/')}%, during median ${summary.load.gpuDuring.median}% (max ${summary.load.gpuDuring.max}%, with this run), after ${loads.after}%.${underLoad ? ` Under load: ${loadWhy}.` : ''}${gpuUnknown ? " The GPU's load could not be read before the run." : ''}${!underLoad && !gpuUnknown ? ' No busy process or GPU load seen besides this run.' : ''}`);
if (summary.open) lines.push(`Open: the story's code ${ms(summary.open.codeMs)} ms after the click, ready ${ms(summary.open.readyMs)} ms, first beat drawn ${ms(summary.open.firstBeatMs)} ms.`);
lines.push('');
lines.push('| # | Chapter | Frames it brings | Build ms | Ready ms | Built | Held ms | Wait shown ms | Leg ms (film / ran) | Leg fps, worst gap ms, 60 Hz frames missed | Rest fps, worst gap ms, missed | Long tasks: leg / rest (n, max ms) | Live frames |');
lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  lines.push(`| ${pad2(r.n)}${r.dir < 0 ? ' back' : ''} | ${r.id} | ${r.frames.join(', ')} | ${r.frames.length ? ms(r.buildMs) : ''} | ${r.frames.length ? ms(r.readyMs) : ''} | ${r.when.join(', ')} | ${ms(r.heldMs)} | ${ms(r.shownMs)} | ${r.legMs == null ? '' : `${ms(r.nominalMs)} / ${ms(r.legMs)}`} | ${r.legFps == null ? '' : `${fps(r.legFps)}, ${ms(r.legGapMs)}, ${r.legMissed}`} | ${r.restFps == null ? '' : `${fps(r.restFps)}, ${ms(r.restGapMs)}, ${r.restMissed}`} | ${r.longLeg.n ? `${r.longLeg.n}, ${ms(r.longLeg.max)}` : '0'} / ${r.longRest.n ? `${r.longRest.n}, ${ms(r.longRest.max)}` : '0'} | ${r.live ?? ''} |`);
}
const T = summary.totals;
lines.push('');
lines.push(`Totals: held ${ms(T.heldMs)} ms over ${T.chapters} chapters (forward ${ms(T.forwardHeldMs)} ms), "Building the next station" shown ${ms(T.shownMs)} ms in ${T.chaptersWithWords} chapters; legs late by ${ms(T.lateMs)} ms in all. Leg fps median ${fps(T.legFpsMedian)} (lowest ${fps(T.legFpsMin)}), worst gap in a leg ${ms(T.worstLegGapMs)} ms, ${T.legMissed} frames missed at 60 Hz in the legs; rest fps median ${fps(T.restFpsMedian)}, worst gap at a rest ${ms(T.worstRestGapMs)} ms, ${T.restMissed} missed at rests. Long tasks ${T.longTasks} (${ms(T.longTaskMs)} ms, longest ${ms(T.longestTaskMs)} ms). Builds ${T.builds} (setup ${ms(T.buildMs)} ms, with programs ${ms(T.readyMs)} ms), frames let go ${T.drops}, most alive at once ${T.maxLive}.`);
if (refused.length) lines.push(`Refused requests: ${[...new Set(refused)].slice(0, 8).join(', ')}.`);
if (summary.error) lines.push(`Stopped early: ${summary.error.split('\n')[0]}`);
const table = lines.join('\n');
console.log(table);

if (outDir) {
  const out = resolve(outDir);
  mkdirSync(out, { recursive: true });
  const name = `perf-${label.replace(/[^\w.-]+/g, '-')}-${fileStamp(started)}`;
  writeFileSync(join(out, `${name}.md`), `${table}\n`);
  writeFileSync(join(out, `${name}.json`), JSON.stringify({ summary, rows, rests, film, raw: { events: ev, marks: raw.marks, long: longs } }, null, 1));
  console.log(`\nwrote ${join(out, `${name}.md`)} and .json`);
}
process.exit(summary.error ? 1 : 0);

// ---- --compare: receipts side by side ----

function compare() {
  const i = argv.indexOf('--compare'), specs = [];
  for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) specs.push(argv[j]);
  if (!specs.length) { console.error(usage); process.exit(2); }
  const groups = specs.map((s) => {
    const at = s.indexOf('='), files = (at > 0 ? s.slice(at + 1) : s).split(',').filter(Boolean);
    return { name: at > 0 ? s.slice(0, at) : basename(files[0] ?? s, '.json'), runs: files.map((f) => JSON.parse(readFileSync(f, 'utf8'))) };
  });
  for (const g of groups) if (!g.runs.length) { console.error(`--compare: the group ${g.name} names no receipt`); process.exit(2); }
  const mean = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
  const r0 = (x) => (Number.isFinite(x) ? String(Math.round(x)) : '');
  const cells = (f) => groups.map((g) => r0(mean(g.runs.map((r) => r.rows.filter((x) => x.dir >= 0)).map((rows) => f(rows))))).join(' / ');
  const out = [`Per chapter, forward: each group's mean over its runs (${groups.map((g) => `${g.name}: ${g.runs.length}`).join(', ')}), as ${groups.map((g) => g.name).join(' / ')}.`, '',
    '| # | Chapter | Build ms | Ready ms | Held ms | Wait shown ms | Leg fps | Leg worst gap ms | Rest worst gap ms | Long tasks (n) |', '|---|---|---|---|---|---|---|---|---|---|'];
  const chapters = groups.flatMap((g) => g.runs).find((r) => r.rows?.length)?.rows.filter((x) => x.dir >= 0) ?? [];
  for (const c of chapters) {
    const at = (f) => (rows) => { const x = rows.find((y) => y.n === c.n); return x ? f(x) : NaN; };
    out.push(`| ${String(c.n).padStart(2, '0')} | ${c.id} | ${cells(at((x) => (x.frames.length ? x.buildMs : NaN)))} | ${cells(at((x) => (x.frames.length ? x.readyMs : NaN)))} | ${cells(at((x) => x.heldMs))} | ${cells(at((x) => x.shownMs))} | ${cells(at((x) => x.legFps ?? NaN))} | ${cells(at((x) => x.legGapMs ?? NaN))} | ${cells(at((x) => x.restGapMs))} | ${cells(at((x) => x.longLeg.n + x.longRest.n))} |`);
  }
  out.push('', 'Every run:', '', '| Group | Run | Started | Load | Held ms | Words shown ms (chapters) | Legs late ms | Leg fps median (lowest) | 60 Hz frames missed: legs / rests | Worst gap ms: leg / rest | Long tasks: n, total ms, longest | Setup ms / with programs ms | Most frames alive |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const g of groups) for (const r of g.runs) {
    const s = r.summary, T = s.totals, L = s.load, m = s.started.match(/(\d\d:\d\d):\d\d CT \(.*?(\d\d:\d\d):\d\d (\S+)\)/);
    out.push(`| ${g.name} | ${s.label} | ${m ? `${m[1]} CT (${m[2]} ${m[3]})` : s.started} | ${L.underLoad ? `under load (GPU ${L.gpuBefore.join('/')}% before)` : L.gpuUnknown ? 'GPU load unknown' : `GPU ${L.gpuBefore.join('/')}% before`} | ${r0(T.heldMs)} | ${r0(T.shownMs)} (${T.chaptersWithWords}) | ${r0(T.lateMs)} | ${r0(T.legFpsMedian)} (${r0(T.legFpsMin)}) | ${T.legMissed ?? ''} / ${T.restMissed ?? ''} | ${r0(T.worstLegGapMs)} / ${r0(T.worstRestGapMs)} | ${T.longTasks}, ${r0(T.longTaskMs)}, ${r0(T.longestTaskMs)} | ${r0(T.buildMs)} / ${r0(T.readyMs)} | ${T.maxLive} |`);
  }
  const backs = groups.flatMap((g) => g.runs.map((r) => ({ g: g.name, r }))).filter(({ r }) => r.rows.some((x) => x.dir < 0));
  if (backs.length) {
    out.push('', 'Steps back:', '', '| Group | Run | Frames built again on the way back | Held ms on the way back |', '|---|---|---|---|');
    for (const { g, r } of backs) {
      const b = r.rows.filter((x) => x.dir < 0);
      out.push(`| ${g} | ${r.summary.label} | ${b.reduce((n, x) => n + x.frames.length, 0)}${b.some((x) => x.frames.length) ? ` (${b.flatMap((x) => x.frames).join(', ')})` : ''} | ${r0(b.reduce((n, x) => n + x.heldMs, 0))} |`);
    }
  }
  console.log(out.join('\n'));
}
