// Checks the Memory tab's mount in headless Chrome (SPEC 6.6): every brain focused (its chip, its HUD), every one of
// the Grand Prix brain's 28 tags hovered (its hover card names it), Battery Tab selected and its card's counts held to
// brain-scene.json, "Open Battery" routing, Escape and "All brains" back, the keyboard's path, a deep link opened cold,
// the phone width's drawer and bottom sheet, and the light page theme. Shots go to --out.
//
//   node src/stations/brain/demo/check.mjs --port 15196 --out <dir> [--w 1440] [--h 900]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = (k, f = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : f; };
const port = Number(opt('port')), out = resolve(opt('out', 'out/brain-check')), W = Number(opt('w', '1440')), H = Number(opt('h', '900'));
if (!port || [5184, 5185, 15190, 15193, 15199].includes(port)) { console.error('usage: --port <spare port> --out <dir>'); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const scene = JSON.parse(readFileSync(join(here, '..', 'brain-scene.json'), 'utf8'));
const base = `http://127.0.0.1:${port}`;
const lib = process.env.WORLD_BROWSER_LIB;
if (!lib) { console.error('set WORLD_BROWSER_LIB to the browser launcher module (README: Checks)'); process.exit(2); }
const { launch, guardRequests } = await import(pathToFileURL(lib).href);
process.env.ROLE_VIDEOS_TMP ??= tmpdir();
mkdirSync(out, { recursive: true });

const report = { size: [W, H], brains: [], tags: [], card: null, route: null, escape: null, allBrains: null, keys: null, deepLink: null, phone: null, light: null, errors: [], refused: [] };
const ok = (c, why) => { if (!c) report.failures = [...(report.failures ?? []), why]; return !!c; };
const pageOf = (b, slug) => scene.pages.find((p) => p.brain === b && p.slug === slug);

async function open(ctx, query, w = W, h = H) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: w, height: h });
  page.on('pageerror', (e) => report.errors.push(String(e?.message ?? e)));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto(`${base}/src/stations/brain/demo/index.html?${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__brainReady === true || typeof window.__brainError === 'string', null, { timeout: 120000 });
  const err = await page.evaluate(() => window.__brainError ?? null);
  if (err) throw new Error(err);
  const box = await page.evaluate(() => document.getElementById('brain').getBoundingClientRect().toJSON());
  return { page, box };
}
const hudText = (page) => page.evaluate(() => document.querySelector('.lb-hud')?.textContent.replace(/\s+/g, ' ').trim() ?? '');

const { ctx, close } = await launch({ viewport: { width: W, height: H }, dpr: 2, colorScheme: 'dark' });
try {
  report.refused = await guardRequests(ctx, base);
  // ── all brains, then each brain by its chip ───────────────────────────────────────────────────────────────
  let { page, box } = await open(ctx, 'theme=dark');
  await page.waitForTimeout(4200); // the combined view forms (3.2 s)
  await page.screenshot({ path: join(out, 'all.png') });
  report.allHud = await hudText(page);
  ok(report.allHud.toLowerCase().includes(`${scene.combined.pages} pages`) && report.allHud.toLowerCase().includes(`${scene.combined.across} across brains`), 'all-brains HUD');
  for (const b of scene.brains) {
    await page.click(`.lbm-chipbtn[data-brain="${b.id}"]`); await page.waitForTimeout(1800);
    const st = await page.evaluate(() => window.__brain.state()), hud = (await hudText(page)).toLowerCase();
    const r = { brain: b.id, state: st, hud, ok: st.brain === b.id && hud.includes(`${b.pages} page`) && hud.includes(`${b.connections} connections`) };
    report.brains.push(r); ok(r.ok, `focus ${b.id}`);
    await page.screenshot({ path: join(out, `focus-${b.id}.png`) });
  }
  // ── the Grand Prix brain's 28 tags, each hovered ──────────────────────────────────────────────────────────
  await page.click('.lbm-chipbtn[data-brain="grand-prix"]'); await page.waitForTimeout(1800);
  const gp = scene.pages.filter((p) => p.brain === 'grand-prix' && p.n <= 28).sort((a, b) => a.n - b.n);
  // a tag on the far side is faint, and one under a heavier tag is hidden (Living Brain's rule): turn the brain with the
  // arrow keys until the tag shows, then hover it
  const tagAt = (slug) => page.evaluate(([s]) => {
    const t = [...document.querySelectorAll(`.lb-tag[data-brain="grand-prix"][data-page="${CSS.escape(s)}"]`)].find((x) => x.style.visibility !== 'hidden' && x.style.pointerEvents !== 'none' && Number(x.style.opacity) >= 0.3);
    if (!t) return null;
    const r = t.getBoundingClientRect(), o = document.getElementById('brain').getBoundingClientRect();
    const x = r.left - o.left + r.width / 2, y = r.top - o.top + r.height / 2;
    return x > 8 && y > 8 && x < o.width - 8 && y < o.height - 8 ? { x, y } : null;
  }, [slug]);
  // closer in, as a visitor would: the tags spread apart (one under a heavier tag is hidden, as in Living Brain)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(60); }
  await page.mouse.move(box.x + 6, box.y + box.height - 6); await page.waitForTimeout(400);
  for (const p of gp) {
    let at = null, turns = 0, via = 'tag';
    for (; turns < 40 && !at; turns++) {
      at = await tagAt(p.slug);
      if (!at) { await page.focus('.lbm-root'); await page.keyboard.press(turns % 10 === 9 ? (turns < 20 ? 'ArrowUp' : 'ArrowDown') : 'ArrowRight'); await page.waitForTimeout(140); }
    }
    // a tag that stays under a heavier one (their dots sit close together): its dot, facing the camera, clear of any tag
    for (let k = 0; k < 60 && !at; k++) {
      const d = await page.evaluate(([s]) => {
        const q = window.__brain.dotOf('grand-prix', s); if (!q || q.facing < 0.2) return null;
        const o = document.getElementById('brain').getBoundingClientRect();
        const hit = document.elementFromPoint(o.left + q.x, o.top + q.y);
        const own = hit?.closest?.('.lb-tag');
        return hit && (hit.tagName === 'CANVAS' || (own && own.dataset.page === s)) ? { x: q.x, y: q.y } : null;
      }, [p.slug]);
      if (d) { at = d; via = 'dot'; break; }
      await page.focus('.lbm-root'); await page.keyboard.press(k % 12 === 11 ? 'ArrowDown' : 'ArrowRight'); await page.waitForTimeout(120);
    }
    if (!at) {
      // a page whose dot sits on the medial face or the base: the keyboard's list reaches it (focus shows its hover card;
      // the pointer off the stage, where a tag passing under it would take the hover)
      await page.mouse.move(8, 8); await page.waitForTimeout(200);
      await page.evaluate(([s]) => document.querySelector(`.lbm-sr button[data-page="${CSS.escape(s)}"]`)?.focus(), [p.slug]);
      await page.waitForTimeout(260);
      const hover = await page.evaluate(() => document.querySelector('.lbm-hover .lbm-htitle')?.textContent ?? null);
      const r = { n: p.n, title: p.title, via: 'list', hover, ok: hover != null && hover.endsWith(p.title) };
      report.tags.push(r); ok(r.ok, `tag ${p.n} ${p.title}`);
      await page.evaluate(() => document.activeElement?.blur?.());
      continue;
    }
    await page.mouse.move(box.x + at.x, box.y + at.y, { steps: 3 }); await page.waitForTimeout(260);
    const hover = await page.evaluate(() => document.querySelector('.lbm-hover .lbm-htitle')?.textContent ?? null);
    const r = { n: p.n, title: p.title, at, turns, via: typeof via === 'string' ? via : 'tag', hover, ok: hover != null && hover.endsWith(p.title) };
    report.tags.push(r); ok(r.ok, `tag ${p.n} ${p.title}`);
    if (p.n === 2) await page.screenshot({ path: join(out, 'hover-battery-tab.png') });
  }
  await page.mouse.move(box.x + 6, box.y + box.height - 6); await page.waitForTimeout(300);
  // ── Battery Tab selected: its card's counts against brain-scene.json ────────────────────────────────────
  await page.focus('.lbm-root');
  {
    const at = await page.evaluate(() => window.__brain.screenOf('grand-prix', 'battery-tab'));
    await page.mouse.click(box.x + at.x, box.y + at.y); await page.waitForTimeout(1800);
    const bt = pageOf('grand-prix', 'battery-tab');
    const card = await page.evaluate(() => {
      const c = document.querySelector('.lbm-card'); if (!c) return null;
      const secs = [...c.querySelectorAll('.lbm-sec')].map((s) => ({ label: s.querySelector('.lbm-label')?.textContent, rows: s.querySelectorAll('.lbm-rowbtn').length }));
      return { title: c.querySelector('.lbm-title')?.textContent, meta: c.querySelector('.lbm-meta')?.textContent, secs, open: c.querySelector('.lbm-open')?.textContent ?? null };
    });
    const st = await page.evaluate(() => window.__brain.state());
    report.card = { card, state: st, expect: { connections: bt.connections, across: bt.across },
      ok: !!card && card.title.endsWith(bt.title) && card.meta.includes(`${bt.connections} connections`) && card.meta.includes(`${bt.across} across brains`)
        && card.secs[0]?.rows === bt.connections && card.secs[1]?.rows === bt.across && card.secs[0].label.endsWith(String(bt.connections)) && card.secs[1].label.endsWith(String(bt.across))
        && card.open === 'Open Battery' && st.page === 'battery-tab' && page.url().includes('page=battery-tab') };
    ok(report.card.ok, 'Battery Tab card');
    await page.mouse.move(box.x + 6, box.y + box.height - 6); await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, 'card-battery-tab.png') });
    // a row in another brain: the Terminal comes to the center with its page selected
    const before = await page.evaluate(() => window.__brain.state());
    await page.click('.lbm-card .lbm-rowbtn[data-brain="terminal"]'); await page.waitForTimeout(1800);
    const after = await page.evaluate(() => window.__brain.state());
    report.acrossRow = { before, after, ok: after.brain === 'terminal' && !!after.page };
    ok(report.acrossRow.ok, 'row across brains');
    await page.screenshot({ path: join(out, 'across-row.png') });
    // back to Battery Tab for the route
    await page.goBack(); await page.waitForTimeout(1800);
    await page.evaluate(() => window.__brain.goTo({ brain: 'grand-prix', page: 'battery-tab' })); await page.waitForTimeout(1600);
    const n0 = await page.evaluate(() => window.__routes.length);
    await page.click('.lbm-card .lbm-open'); await page.waitForTimeout(200);
    report.route = { routes: await page.evaluate((n) => window.__routes.slice(n), n0) };
    report.route.ok = report.route.routes.length === 1 && report.route.routes[0] === 'battery';
    ok(report.route.ok, 'Open Battery routes');
  }
  // ── Escape: the selection, then all brains; the "All brains" chip ───────────────────────────────────────
  await page.focus('.lbm-root');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const e1 = await page.evaluate(() => ({ state: window.__brain.state(), card: !!document.querySelector('.lbm-card') }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(1800);
  const e2 = await page.evaluate(() => window.__brain.state());
  report.escape = { first: e1, second: e2, ok: e1.state.page === null && !e1.card && e2.brain === 'all' };
  ok(report.escape.ok, 'Escape twice');
  await page.click('.lbm-chipbtn[data-brain="terminal"]'); await page.waitForTimeout(1600);
  await page.click('.lbm-chipbtn[data-brain="all"]'); await page.waitForTimeout(1800);
  report.allBrains = { state: await page.evaluate(() => window.__brain.state()) };
  report.allBrains.ok = report.allBrains.state.brain === 'all';
  ok(report.allBrains.ok, 'All brains chip');
  // ── the keyboard's path: a brain's page buttons, focus shows the hover card, Enter selects ─────────────
  await page.evaluate(() => window.__brain.goTo({ brain: 'terminal' })); await page.waitForTimeout(1600);
  await page.evaluate(() => { const b = document.querySelector('.lbm-sr button[data-page="ness"]'); b?.focus(); });
  await page.waitForTimeout(300);
  const kh = await page.evaluate(() => document.querySelector('.lbm-hover .lbm-htitle')?.textContent ?? null);
  await page.keyboard.press('Enter'); await page.waitForTimeout(600);
  const ks = await page.evaluate(() => window.__brain.state());
  report.keys = { hover: kh, state: ks, ok: !!kh && kh.endsWith('Ness') && ks.page === 'ness' };
  ok(report.keys.ok, 'keyboard');
  await page.close();
  // ── a deep link opened cold: the Terminal's own Wattness Terminal page (its slug is in two brains) ───────
  ({ page, box } = await open(ctx, 'theme=dark&brain=terminal&page=wattness-terminal'));
  await page.waitForTimeout(900);
  const dl = await page.evaluate(() => ({ state: window.__brain.state(), title: document.querySelector('.lbm-card .lbm-title')?.textContent ?? null, meta: document.querySelector('.lbm-card .lbm-meta')?.textContent ?? null, conflict: !!document.querySelector('.lbm-card .lbm-conflict') }));
  const wt = pageOf('terminal', 'wattness-terminal');
  report.deepLink = { ...dl, ok: dl.state.brain === 'terminal' && dl.state.page === 'wattness-terminal' && !!dl.title?.endsWith(wt.title) && dl.meta.includes(`${wt.connections} connections`) && dl.conflict };
  ok(report.deepLink.ok, 'deep link');
  await page.screenshot({ path: join(out, 'deep-link-terminal.png') });
  await page.close();
  // ── the light page theme (the stage holds dark) ────────────────────────────────────────────────────────
  ({ page, box } = await open(ctx, 'theme=light&brain=grand-prix&page=battery-tab'));
  await page.waitForTimeout(1600);
  report.light = { bg: await page.evaluate(() => getComputedStyle(document.body).backgroundColor), stage: await page.evaluate(() => getComputedStyle(document.querySelector('.lbm-root')).backgroundColor) };
  report.light.ok = report.light.bg !== report.light.stage;
  ok(report.light.ok, 'light theme around a dark stage');
  await page.screenshot({ path: join(out, 'light-card.png') });
  await page.evaluate(() => window.__brain.goTo({ brain: 'all', page: null })); await page.waitForTimeout(1800);
  await page.screenshot({ path: join(out, 'light-all.png') });
  await page.close();
  // ── phone width: the pages drawer, a tap, the card as a bottom sheet ───────────────────────────────────
  for (const theme of ['dark', 'light']) {
    ({ page, box } = await open(ctx, `theme=${theme}`, 390, 844));
    await page.waitForTimeout(3800);
    await page.screenshot({ path: join(out, `phone-all-${theme}.png`) });
    const narrow = await page.evaluate(() => document.querySelector('.lbm-root').classList.contains('is-narrow'));
    await page.click('.lbm-chipbtn[data-brain="grand-prix"]'); await page.waitForTimeout(1800);
    await page.click('.lbm-pagesbtn'); await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, `phone-drawer-${theme}.png`) });
    await page.click('.lbm-drawer button[data-page="battery-tab"]'); await page.waitForTimeout(1800);
    const sheet = await page.evaluate(() => { const c = document.querySelector('.lbm-card'); if (!c) return null; const r = c.getBoundingClientRect(); return { bottom: Math.round(r.bottom), width: Math.round(r.width), title: c.querySelector('.lbm-title')?.textContent }; });
    await page.screenshot({ path: join(out, `phone-card-${theme}.png`) });
    report.phone = { ...(report.phone ?? {}), [theme]: { narrow, sheet, ok: narrow && !!sheet && sheet.width >= 380 && sheet.title.endsWith('Battery Tab') } };
    ok(report.phone[theme].ok, `phone ${theme}`);
    await page.close();
  }
} catch (e) {
  report.errors.push(`check: ${String(e?.stack ?? e)}`);
} finally {
  await close();
}
report.ok = !report.failures?.length && !report.errors.length && !report.refused.length;
writeFileSync(join(out, 'check.json'), JSON.stringify(report, null, 1));
const by = (v) => report.tags.filter((r) => r.ok && (r.via ?? 'tag') === v).length;
console.log(`brains ${report.brains.filter((r) => r.ok).length}/${scene.brains.length} · tags ${report.tags.filter((r) => r.ok).length}/28 (pointer on the tag ${by('tag')}, on the dot ${by('dot')}, by the list ${by('list')}) · card ${report.card?.ok} · across row ${report.acrossRow?.ok} · route ${report.route?.ok} · escape ${report.escape?.ok} · all brains ${report.allBrains?.ok} · keys ${report.keys?.ok} · deep link ${report.deepLink?.ok} · light ${report.light?.ok} · phone ${report.phone?.dark?.ok}/${report.phone?.light?.ok} · errors ${report.errors.length} · refused ${report.refused.length}`);
if (report.failures?.length) console.log('failures:', report.failures.join('; '));
for (const e of report.errors.slice(0, 5)) console.log('error:', e.slice(0, 300));
console.log(report.ok ? 'ALL OK' : 'FAILED');
process.exit(report.ok ? 0 : 1);
