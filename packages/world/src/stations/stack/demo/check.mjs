// Checks the live mount in headless Chrome: for every piece, the pointer on it opens its card, and a click calls
// onRoute with its tab; a touch tap opens the card and a second tap routes; Escape and leaving close it. Shots of
// the hover states go to --out.
//
//   node src/stations/stack/demo/check.mjs --port 15194 --out <dir> [--w 1440] [--h 900] [--theme dark]
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = (k, f = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : f; };
const port = Number(opt('port')), out = resolve(opt('out', 'out/stack-check')), W = Number(opt('w', '1440')), H = Number(opt('h', '900'));
const theme = opt('theme', 'dark');
if (!port || [5184, 5185, 15190, 15193, 15199].includes(port)) { console.error('usage: --port <spare port> --out <dir>'); process.exit(2); }
const base = `http://127.0.0.1:${port}`;
const lib = process.env.WORLD_BROWSER_LIB;
if (!lib) { console.error('set WORLD_BROWSER_LIB to the browser launcher module (README: Checks)'); process.exit(2); }
const { launch, guardRequests } = await import(pathToFileURL(lib).href);
process.env.ROLE_VIDEOS_TMP ??= tmpdir();
mkdirSync(out, { recursive: true });

const { ctx, close } = await launch({ viewport: { width: W, height: H }, dpr: 2, colorScheme: theme });
const report = { url: `${base}/src/stations/stack/demo/index.html?theme=${theme}`, size: [W, H], theme, pieces: [], touch: null, keys: null, errors: [] };
try {
  const refused = await guardRequests(ctx, base);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => report.errors.push(String(e?.message ?? e)));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto(report.url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__stackReady === true || typeof window.__stackError === 'string', null, { timeout: 120000 });
  const err = await page.evaluate(() => window.__stackError ?? null);
  if (err) throw new Error(err);
  await page.waitForTimeout(600);
  const routes = await page.evaluate(async () => (await import('/src/stations/stack/pieces.ts')).ROUTES);
  for (const id of Object.keys(routes)) {
    const at = await page.evaluate((i) => window.__stack.screenOf(i), id);
    if (!at) { report.pieces.push({ id, ok: false, why: 'no point picks it' }); continue; }
    await page.mouse.move(W - 4, H - 4); await page.waitForTimeout(260);
    await page.mouse.move(at.x, at.y, { steps: 4 }); await page.waitForTimeout(320);
    const card = await page.evaluate(() => { const c = document.querySelector('.stk-card.is-in'); return c ? { piece: c.dataset.piece, rect: c.getBoundingClientRect().toJSON(), button: c.querySelector('.stk-go')?.textContent ?? null } : null; });
    const shot = join(out, `hover.${id}.png`);
    await page.screenshot({ path: shot });
    const before = await page.evaluate(() => window.__routes.length);
    await page.mouse.click(at.x, at.y); await page.waitForTimeout(120);
    const routed = await page.evaluate((n) => window.__routes.slice(n), before);
    const underPointer = card ? at.x >= card.rect.x && at.x <= card.rect.x + card.rect.width && at.y >= card.rect.y && at.y <= card.rect.y + card.rect.height : null;
    report.pieces.push({ id, at, card: card?.piece ?? null, cardRect: card?.rect ?? null, button: card?.button ?? null, routed, expect: routes[id],
      ok: card?.piece === id && routed.length === 1 && routed[0] === routes[id] && !underPointer, underPointer, shot });
  }
  // the card's own button routes too, and leaving the piece onto the card keeps it open
  {
    const at = await page.evaluate(() => window.__stack.screenOf('gate'));
    await page.mouse.move(at.x, at.y, { steps: 3 }); await page.waitForTimeout(300);
    const b = await page.evaluate(() => { const e = document.querySelector('.stk-card.is-in .stk-go'); return e ? e.getBoundingClientRect().toJSON() : null; });
    const before = await page.evaluate(() => window.__routes.length);
    if (b) { await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await page.waitForTimeout(250); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
    report.button = { found: !!b, routed: await page.evaluate((n) => window.__routes.slice(n), before) };
    await page.mouse.move(W - 4, H - 4); await page.waitForTimeout(400);
    report.leave = { open: await page.evaluate(() => !!document.querySelector('.stk-card.is-in')) };
  }
  // a touch: the first tap opens the card, a second tap on the piece routes
  {
    const at = await page.evaluate(() => window.__stack.screenOf('greenfield'));
    const tap = (x, y) => page.evaluate(([px, py]) => { const c = document.querySelector('.stk-root canvas'); const r = c.getBoundingClientRect();
      c.dispatchEvent(new PointerEvent('click', { pointerType: 'touch', clientX: r.left + px, clientY: r.top + py, bubbles: true })); }, [x, y]);
    const before = await page.evaluate(() => window.__routes.length);
    await tap(at.x, at.y); await page.waitForTimeout(300);
    const open1 = await page.evaluate(() => document.querySelector('.stk-card.is-in')?.dataset.piece ?? null);
    const r1 = await page.evaluate((n) => window.__routes.slice(n), before);
    await tap(at.x, at.y); await page.waitForTimeout(150);
    const r2 = await page.evaluate((n) => window.__routes.slice(n), before);
    await tap(8, 8); await page.waitForTimeout(300);
    const open3 = await page.evaluate(() => document.querySelector('.stk-card.is-in')?.dataset.piece ?? null);
    report.touch = { firstTapOpens: open1, firstTapRoutes: r1, secondTapRoutes: r2, tapAwayCloses: open3 === null };
  }
  // keyboard: focus a piece's button, its card opens; Enter routes
  {
    const before = await page.evaluate(() => window.__routes.length);
    await page.evaluate(() => { const b = [...document.querySelectorAll('.stk-root nav button')].find((x) => x.textContent.includes('Verifier')); b?.focus(); });
    await page.waitForTimeout(300);
    const open = await page.evaluate(() => document.querySelector('.stk-card.is-in')?.dataset.piece ?? null);
    await page.keyboard.press('Enter'); await page.waitForTimeout(120);
    report.keys = { focusOpens: open, enterRoutes: await page.evaluate((n) => window.__routes.slice(n), before) };
  }
  report.refused = refused;
} finally {
  await close();
}
report.ok = report.pieces.every((p) => p.ok) && report.errors.length === 0 && report.button?.routed?.[0] === 'seal' && report.leave?.open === false
  && report.touch?.firstTapOpens === 'greenfield' && report.touch.firstTapRoutes.length === 0 && report.touch.secondTapRoutes[0] === 'files' && report.touch.tapAwayCloses
  && report.keys?.focusOpens === 'verifier' && report.keys.enterRoutes[0] === 'verify';
writeFileSync(join(out, 'check.json'), JSON.stringify(report, null, 1));
for (const p of report.pieces) console.log(`${p.ok ? 'ok  ' : 'FAIL'} ${p.id}: card ${p.card} -> ${p.routed?.join(',') || '(none)'} (expect ${p.expect})${p.why ? ` ${p.why}` : ''}${p.underPointer ? ' CARD UNDER POINTER' : ''}`);
console.log('button', JSON.stringify(report.button), 'leave', JSON.stringify(report.leave));
console.log('touch', JSON.stringify(report.touch));
console.log('keys', JSON.stringify(report.keys));
console.log('errors', report.errors.length ? report.errors.join(' | ') : 'none', '| refused', (report.refused ?? []).join(', ') || 'none');
console.log(report.ok ? 'ALL OK' : 'SOME FAILED');
process.exit(report.ok ? 0 : 1);
