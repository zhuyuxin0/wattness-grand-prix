// Holds every number the brain station puts on screen to its data (SPEC 4.6, 7.3): the films' Living Brain lines
// (film.json, and the Living Brain rows of story/films.json) by their named fields, and, with the lab served, every
// number in each brain frame's words (the HUD, the tags, the member tags, the card, the review's plates) found in
// brain-scene.json or in frame-data.json's sponsors.living_brain.
//
//   node src/stations/brain/check-figures.mjs [--port <p>] [--out <dir>]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, f = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : f; };
const scene = JSON.parse(readFileSync(join(here, 'brain-scene.json'), 'utf8'));
const film = JSON.parse(readFileSync(join(here, 'film.json'), 'utf8'));
const films = JSON.parse(readFileSync(join(here, '..', '..', 'story', 'films.json'), 'utf8'));
let frameData = null;
try { frameData = JSON.parse(readFileSync(join(here, '..', '..', 'data', 'frame-data.json'), 'utf8')); } catch { /* not synced */ }
const fails = [];

// ── 1. the lines' figures, by the fields they name ─────────────────────────────────────────────────────────────
const brain = (id) => scene.brains.find((b) => b.id === id);
const pg = (key) => { const [b, s] = key.split('/'); return scene.pages.find((p) => p.brain === b && p.slug === s); };
const field = (path) => {
  let m;
  if ((m = /^brains\[([\w-]+)\]\.(\w+)$/.exec(path))) return brain(m[1])?.[m[2]];
  if ((m = /^pages\[([\w/-]+)\]\.(\w+)$/.exec(path))) return pg(m[1])?.[m[2]];
  if ((m = /^combined\.acrossByPair\[([\w|-]+)\]$/.exec(path))) return scene.combined.acrossByPair[m[1]];
  if ((m = /^combined\.(\w+)$/.exec(path))) return scene.combined[m[1]];
  if (path === 'across[] touching battery-tab, strength strong') return scene.across.filter((x) => ((x.aBrain === 'grand-prix' && x.a === 'battery-tab') || (x.bBrain === 'grand-prix' && x.b === 'battery-tab')) && x.strength === 'strong').length;
  if ((m = /^frame-data sponsors\.living_brain\.(.+)$/.exec(path))) {
    if (!frameData) return undefined;
    const v = m[1].split('.').reduce((o, k) => o?.[k], frameData.sponsors.living_brain);
    return typeof v === 'string' ? (/(\d{2}:\d{2}):\d{2} CT$/.exec(v)?.[1] ?? v) : v;
  }
  return undefined;
};
const lines = [];
for (const r of film.brain) {
  for (const [shown, path] of Object.entries(r.figures ?? {})) {
    const v = field(path);
    const okv = v != null && (String(v) === shown || String(v).padStart(2, '0') === shown);
    lines.push({ row: r.lb, shown, path, value: v ?? null, ok: okv });
    if (!okv) fails.push(`film.json ${r.lb}: ${shown} is not ${path} (${v})`);
    if (!r.line.includes(shown)) fails.push(`film.json ${r.lb}: the line does not show ${shown}`);
  }
}
// the master's and the 90-second cut's Living Brain rows
for (const cut of ['master', 'cut_90s']) for (const r of films[cut].filter((x) => x.lb)) {
  for (const n of r.line.match(/\d[\d,.]*/g) ?? []) {
    const v = Number(n.replace(/,/g, ''));
    const okv = [scene.combined.pages, scene.combined.across, ...scene.brains.flatMap((b) => [b.pages, b.connections])].includes(v);
    lines.push({ row: `${cut} ${r.start_s}-${r.end_s}`, shown: n, ok: okv });
    if (!okv) fails.push(`films.json ${cut} ${r.start_s}: ${n} is not a count of brain-scene.json`);
  }
}

// ── 2. the frames' words, rendered ────────────────────────────────────────────────────────────────────────────
const allowed = new Set();
const add = (v) => { if (v == null) return; const s = String(v); allowed.add(s); if (/^\d$/.test(s)) allowed.add(`0${s}`); };
add(scene.combined.pages); add(scene.combined.across); add(scene.combined.pagesJoined); add(scene.conflicts.length); add(scene.brains.length);
Object.values(scene.combined.acrossByPair).forEach(add);
for (const b of scene.brains) ['pages', 'connections', 'strong', 'medium', 'weak', 'notes'].forEach((k) => add(b[k]));
for (const p of scene.pages) { add(p.n); add(p.connections); add(p.across); }
const lb = frameData?.sponsors?.living_brain;
const times = new Set();
if (lb) {
  add(lb.page.version); add(lb.before.citations); add(lb.after.citations); add(lb.plan_time_cutoff_check.pages_admitted);
  for (const s of [lb.citation.available.ct, lb.page.compiled.ct, lb.plan_time_cutoff_check.cutoff.ct, scene.source.crossChecked.ct]) {
    const m = /^\d{4}-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s);
    if (m) { times.add(`${m[3]}:${m[4]}:${m[5]}`); times.add(`${m[3]}:${m[4]}`); add(Number(m[2])); }
  }
}
// numbers in the page titles themselves (ERC-8004, agent ids, the battery's name) are titles, not figures
// (and their beginnings: a tag cuts a long title at 19 characters, "Forecaster (ERC-800…")
const titleNums = new Set(scene.pages.flatMap((p) => (p.title.match(/\d+/g) ?? []).flatMap((n) => [...n].map((_, i) => n.slice(0, i + 1)))));
const frames = [];
const port = Number(opt('port'));
if (port) {
  const lib = process.env.WORLD_BROWSER_LIB;
  if (!lib) { console.error('set WORLD_BROWSER_LIB to the browser launcher module (README: Checks)'); process.exit(2); }
  const { launch, guardRequests } = await import(pathToFileURL(lib).href);
  process.env.ROLE_VIDEOS_TMP ??= tmpdir();
  const { ctx, close } = await launch({ viewport: { width: 1920, height: 1080 }, dpr: 1 });
  try {
    const base = `http://127.0.0.1:${port}`;
    await guardRequests(ctx, base);
    for (const id of ['brain.three', 'brain.combined', 'brain.links', 'brain.grand-prix', 'brain.page', 'brain.across', 'brain.review', 'brain.shared']) {
      const page = await ctx.newPage();
      await page.goto(`${base}/lab.html?frame=${id}&w=1920&h=1080`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__ready === true || typeof window.__error === 'string', null, { timeout: 180000 });
      const text = await page.evaluate(() => [...document.querySelectorAll('.lb-layer')].map((l) => [...l.querySelectorAll('*')]
        .filter((e) => e.childElementCount === 0 || e.classList.contains('v') || e.classList.contains('s'))
        .filter((e) => { const st = getComputedStyle(e); return st.visibility !== 'hidden' && Number(st.opacity) > 0.02 && e.closest('[style*="opacity: 0;"]') == null; })
        .map((e) => e.textContent).join(' | ')).join(' | '));
      // the scope line's reader's own clock beside CT (data.ts scopeLine, lib/yours.ts): the read's stamp in the page's zone
      const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
      if (scene.source.crossChecked.utc) times.add(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(new Date(scene.source.crossChecked.utc)));
      const nums = [...text.matchAll(/\d{1,2}:\d{2}(?::\d{2})?|\d[\d,]*/g)].map((m) => m[0]);
      const bad = nums.filter((n) => (n.includes(':') ? !times.has(n) : !allowed.has(n.replace(/,/g, '')) && !titleNums.has(n)));
      frames.push({ id, numbers: nums.length, bad });
      if (bad.length) fails.push(`${id}: ${bad.join(', ')} not in the data`);
      await page.close();
    }
  } finally { await close(); }
}
const out = opt('out');
const report = { lines, frames, fails, ok: !fails.length };
if (out) { mkdirSync(resolve(out), { recursive: true }); writeFileSync(join(resolve(out), 'figures.json'), JSON.stringify(report, null, 1)); }
console.log(`lines: ${lines.filter((l) => l.ok).length}/${lines.length} figures traced · frames: ${frames.map((f) => `${f.id} ${f.numbers - f.bad.length}/${f.numbers}`).join(', ') || 'not rendered (no --port)'}`);
for (const f of fails) console.log('  ', f);
console.log(report.ok ? 'ALL OK' : 'FAILED');
process.exit(report.ok ? 0 : 1);
