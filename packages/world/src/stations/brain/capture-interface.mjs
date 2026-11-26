// LB8, Living Brain's own interface (SPEC 4.9): the Grand Prix brain's Explore view in the app, turning, then Battery
// Tab hovered, its connections lighting over two seconds and its card. Recorded in one new page of a Chrome the reader
// has signed in to and started with DevTools on a loopback port; no other tab is listed, read, driven or closed, and the
// browser is never closed. Read only: every request to Living Brain's API that is not GET, HEAD or OPTIONS is aborted,
// and so are its analytics beacons. Nothing is captured, edited, linked or resolved in the app.
//
// Personal details are hidden before the app draws, not after: the page's content security policy is bypassed for this
// page and an init script adds, before any of the app's code runs, a rule hiding the account's name, email, project and
// plan (and the combined view's detail tags, which name the owner); a second pass hides any visible text whose words
// match the name hashes given (--names: a file of 16-hex-digit SHA-256 prefixes, kept outside the repository; no name
// is written here) or that holds an email. The recording is refused if, at its end, any such text is visible.
//
//   node capture-interface.mjs --names <hash file> --raw <dir> --frames <dir> [--cdp http://127.0.0.1:15199]
//        [--seed 2] [--turn 4.5] [--hold 4.2] [--fps 30]
//
// --raw gets the screencast's frames at device scale 2 with their timestamps (outside the repository); --frames gets
// the film's sequence: frames resampled to --fps by their timestamps and brought to 1920 x 1080 with Lanczos, and
// manifest.json (storyboard/interface/frames, which git ignores). Playwright comes from PLAYWRIGHT_FROM (a
// node_modules folder), as the world's other headless steps take it.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const cdpUrl = opt('cdp', 'http://127.0.0.1:15199'), seed = Number(opt('seed', '2')), namesFile = opt('names');
const rawDir = opt('raw'), framesDir = opt('frames'), fps = Number(opt('fps', '30'));
const turnS = Number(opt('turn', '4.5')), holdS = Number(opt('hold', '4.2'));
if (!namesFile || !rawDir || !framesDir) { console.error('usage: node capture-interface.mjs --names <hash file> --raw <dir> --frames <dir> [--cdp url] [--seed n] [--turn s] [--hold s] [--fps n]'); process.exit(2); }
const hashes = [...new Set((readFileSync(namesFile, 'utf8').match(/\b[0-9a-f]{16}\b/g) ?? []))];
if (!hashes.length) { console.error('no name hashes in --names'); process.exit(2); }
const from = process.env.PLAYWRIGHT_FROM;
if (!from) { console.error('set PLAYWRIGHT_FROM to the node_modules folder that holds Playwright'); process.exit(2); }
const { chromium } = createRequire(from.endsWith('/') ? from : `${from}/`)('playwright');

const HIDE = '.lb-workspace, .lb-workspace-name, .lb-plan-card, .lb-account-row, .lb-account, .lb-account-avatar, .lb-account-name, .bg-satellite-tooltip.is-detail { visibility: hidden !important; }';
const ctNow = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Chicago' }).replace('T', ' ');
const bkNow = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).replace('T', ' ');

mkdirSync(rawDir, { recursive: true });
const browser = await chromium.connectOverCDP(cdpUrl);
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const aborted = [];
const frames = [];
let failed = null;
try {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Page.setBypassCSP', { enabled: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false });
  // before any of the app's code: the seed, the hiding rule, and the name pass
  await page.addInitScript(({ s, css, hs }) => {
    let a = s >>> 0;
    Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const put = () => {
      if (document.getElementById('gp-hide')) return true;
      const root = document.head || document.documentElement;
      if (!root) return false;
      const st = document.createElement('style'); st.id = 'gp-hide'; st.textContent = `${css} [data-gp-hide] { visibility: hidden !important; }`;
      root.appendChild(st);
      return true;
    };
    if (!put()) new MutationObserver((_, o) => { if (put()) o.disconnect(); }).observe(document, { childList: true, subtree: true });
    const H = new Set(hs);
    const cache = new Map();
    const hex = async (w) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(w)))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    const isName = async (w) => { if (!cache.has(w)) cache.set(w, H.has(await hex(w))); return cache.get(w); };
    const personal = async (t) => {
      if (/[\w.+-]+@[\w-]+(\.[\w-]+)+/.test(t)) return true;
      for (const w of t.match(/[A-Za-z0-9]+/g) ?? []) if (await isName(w)) return true;
      return false;
    };
    const pass = async () => {
      put();
      if (!document.body) return;
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) { const t = n.textContent; if (t && t.trim() && n.parentElement && await personal(t)) n.parentElement.setAttribute('data-gp-hide', ''); }
      for (const img of document.querySelectorAll('img')) if (/googleusercontent|gravatar|avatar|profile/i.test(img.getAttribute('src') || '')) img.setAttribute('data-gp-hide', '');
    };
    window.__gpVisible = async () => {
      const out = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const t = n.textContent; if (!t || !t.trim() || !(await personal(t))) continue;
        let hidden = false;
        for (let q = n.parentElement; q; q = q.parentElement) { const c = getComputedStyle(q); if (c.visibility === 'hidden' || c.display === 'none' || Number(c.opacity) === 0) { hidden = true; break; } }
        const r = n.parentElement.getBoundingClientRect();
        if (!hidden && r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight) out.push([Math.round(r.x), Math.round(r.y)]);
      }
      return out;
    };
    let timer = null;
    const later = () => { if (!timer) timer = setTimeout(async () => { timer = null; try { await pass(); } catch { /* next time */ } }, 40); };
    const start = () => { new MutationObserver(later).observe(document.documentElement, { subtree: true, childList: true, characterData: true }); later(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }, { s: seed, css: HIDE, hs: hashes });
  // read only, for this page only
  await page.route('**/*', (route) => {
    const r = route.request();
    let u; try { u = new URL(r.url()); } catch { return route.continue(); }
    const write = /(^|\.)api\.livingbrain\.com$/.test(u.hostname) && !['GET', 'HEAD', 'OPTIONS'].includes(r.method());
    const beacon = /(^|\.)livingbrain\.com$/.test(u.hostname) && /^\/(ingest|monitoring|cdn-cgi\/rum)/.test(u.pathname);
    if (write || beacon) { aborted.push(`${r.method()} ${u.hostname} ${write ? 'write' : 'beacon'}`); return route.abort('blockedbyclient'); }
    return route.continue();
  });

  await page.goto('https://livingbrain.com/workspace?section=brain', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => /Wattness Grand Prix/.test(document.body.innerText), null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.getByText('Wattness Grand Prix', { exact: true }).first().click();
  await page.waitForFunction(() => !/gathering brains/i.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.getByText('Explore', { exact: true }).first().click();
  await page.waitForTimeout(3500);
  const hide = page.getByRole('button', { name: 'Hide recent activity' });
  if (await hide.count()) await hide.first().click();
  // the formation settles, the tags come in
  await page.waitForTimeout(6000);
  const counts = await page.evaluate(() => (document.body.innerText.match(/(\d+)\s+MEMORIES[\s\S]{0,40}?(\d+)\s+CONNECTIONS[\s\S]{0,40}?(\d+)\s+STRONG/i) ?? []).slice(1).map(Number));
  console.log(`the app's HUD: ${counts.join(', ')} (memories, connections, strong)`);
  await page.mouse.move(1910, 1070);

  // the recording: the screencast's frames with their timestamps, acknowledged as they come
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ t: f.metadata.timestamp, data: f.data });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch { /* ended */ }
  });
  const recorded = { ct: ctNow(), bangkok: bkNow() };
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 3840, maxHeight: 2160, everyNthFrame: 1 });
  await page.waitForTimeout(turnS * 1000);
  // Battery Tab: the pointer goes where its tag will be half way through the hold and stays still (a pointer that
  // follows the moving tag leaves and enters it, and each entry starts the two-second light along its connections again)
  const tag = page.locator('div.bg-label', { hasText: /^\s*\d+\s*Battery Tab\s*$/ }).first();
  const b0 = await tag.boundingBox().catch(() => null);
  await page.waitForTimeout(500);
  const b1 = await tag.boundingBox().catch(() => null);
  if (!b0 || !b1) throw new Error('Battery Tab has no tag on the view at this seed');
  const vx = (b1.x - b0.x) / 0.5, vy = (b1.y - b0.y) / 0.5, lead = 0.35 + holdS / 2;
  const aim = { x: b1.x + b1.width / 2 + vx * lead, y: b1.y + b1.height / 2 + vy * lead };
  console.log(`Battery Tab's tag moves ${vx.toFixed(1)}, ${vy.toFixed(1)} px/s; ${b1.width.toFixed(0)} px wide; aiming ${lead.toFixed(2)} s ahead`);
  await page.mouse.move(aim.x, aim.y, { steps: 20 });
  await page.waitForTimeout(holdS * 1000);
  await cdp.send('Page.stopScreencast');
  await page.waitForTimeout(300);
  const card = await page.evaluate(() => document.body.innerText.match(/WORK\s*·\s*\d+\s*CONNECTIONS/i)?.[0] ?? null);
  const visible = await page.evaluate(() => window.__gpVisible());
  if (visible.length) failed = `personal text visible at the end at ${JSON.stringify(visible)}: the recording is discarded`;
  writeFileSync(join(rawDir, 'receipt.json'), JSON.stringify({ seed, recorded, counts, card, aborted, frames: frames.length, personalVisibleAtEnd: visible.length }, null, 1));
  console.log(`recorded ${frames.length} frames (${recorded.ct} CT); card: ${card}; aborted requests: ${aborted.length}`);
  if (!failed) {
    const t0 = frames[0].t;
    frames.forEach((f, i) => writeFileSync(join(rawDir, `${String(i).padStart(4, '0')}.jpg`), Buffer.from(f.data, 'base64')));
    writeFileSync(join(rawDir, 'times.json'), JSON.stringify(frames.map((f) => +(f.t - t0).toFixed(4))));
    // the film's sequence: the frame showing at each tick of --fps, Lanczos to 1920 x 1080
    if (existsSync(framesDir)) rmSync(framesDir, { recursive: true });
    mkdirSync(framesDir, { recursive: true });
    const dur = frames[frames.length - 1].t - t0, n = Math.floor(dur * fps) + 1, files = [];
    let j = 0;
    for (let k = 0; k < n; k++) {
      const at = t0 + k / fps;
      while (j + 1 < frames.length && frames[j + 1].t <= at) j++;
      const out = `${String(k).padStart(4, '0')}.jpg`;
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(rawDir, `${String(j).padStart(4, '0')}.jpg`), '-vf', 'scale=1920:1080:flags=lanczos', '-q:v', '2', join(framesDir, out)]);
      files.push(out);
    }
    writeFileSync(join(framesDir, 'manifest.json'), JSON.stringify({ fps, frames: files.length, width: 1920, height: 1080, recorded, seed, files,
      note: "Living Brain's own interface (the Grand Prix brain's Explore view), recorded read only by capture-interface.mjs; personal details hidden before the app drew." }, null, 1));
    console.log(`wrote ${files.length} frames at ${fps} a second to the film's sequence`);
  }
} catch (e) {
  failed = String(e?.stack ?? e);
} finally {
  await page.close();
}
if (failed) { console.error(failed); process.exit(1); }
process.exit(0);
