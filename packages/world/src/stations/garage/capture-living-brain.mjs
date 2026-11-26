// G04, the Living Brain workspace as it is: captured from the app in a Chrome the reader has signed in to, started with
// DevTools on a loopback port. One new page only, read only: the Brain section, the "Wattness Brain" card, Explore,
// then either the whole brain (the activity panel folded) or the "Wattness Terminal" page selected (its connections
// and their reasons in the side panel). Nothing is created, edited or deleted; the reader's own tabs are not touched.
// Math.random is seeded before the app's code runs (its brain view scatters with it); the view also turns over time,
// so the labels fall differently from take to take. The sidebar's account elements are hidden, and any visible text
// that repeats the account's own name or address (read from the sidebar, never written here) is blanked. A band in
// the world's caption type is laid along the bottom, with the read's time in CT.
//
//   node capture-living-brain.mjs --cdp http://127.0.0.1:<port> --seed 2 --mode whole|node --out <png> [--band "..."]
//   (the PNG is the page at device scale 2; scripts/render.mjs's Lanczos step brings it to 1920 x 1080:
//    ffmpeg -i <png> -vf scale=1920:1080:flags=lanczos <frame.png>)
//
// Playwright is taken from PLAYWRIGHT_FROM (a node_modules folder), as the world's other headless steps take it.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const cdpUrl = opt('cdp'), seed = Number(opt('seed', '2')), mode = opt('mode', 'whole'), out = opt('out'), bandArg = opt('band', '');
if (!cdpUrl || !out) { console.error('usage: node capture-living-brain.mjs --cdp <url> --seed <n> --mode whole|node --out <png> [--band text]'); process.exit(2); }
const from = process.env.PLAYWRIGHT_FROM ?? join(process.env.HOME ?? '', 'Documents/grain/node_modules/');
const { chromium } = createRequire(from.endsWith('/') ? from : `${from}/`)('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const font = readFileSync(join(here, '../../kit/fonts/librefranklin-100-900-latin.woff2')).toString('base64');
/** "Nov 25, 14:02 CT": market time, at the moment of the shot, month first. */
const ct = () => {
  const d = new Date(), f = (o) => d.toLocaleString('en-US', { timeZone: 'America/Chicago', ...o });
  return `${f({ month: 'short' })} ${f({ day: 'numeric' })}, ${f({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} CT`;
};

const browser = await chromium.connectOverCDP(cdpUrl);
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
try {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Page.setBypassCSP', { enabled: true }); // the band's style and face, on this page only
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false });
  await page.addInitScript((s) => {
    let a = s >>> 0;
    Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }, seed);
  await page.goto('https://livingbrain.com/workspace?section=brain', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => /Wattness Brain/.test(document.body.innerText), null, { timeout: 60000 });
  // the account's own words, to keep out of the frame (read here, kept in memory only)
  const own = await page.evaluate(() => [...document.querySelectorAll('.lb-account-name, .lb-workspace-name')].map((e) => e.textContent.trim()).filter((t) => t.length > 2));
  await page.waitForTimeout(1500);
  await page.getByText('Wattness Brain', { exact: true }).first().click();
  await page.waitForFunction(() => !/gathering brains/i.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.getByText('Explore', { exact: true }).first().click();
  await page.waitForTimeout(4000);
  const counts = await page.evaluate(() => (document.body.innerText.match(/(\d+)\s+MEMORIES[\s\S]{0,40}?(\d+)\s+CONNECTIONS[\s\S]{0,40}?(\d+)\s+STRONG/i) ?? []).slice(1));
  console.log(`the app's counts: ${counts[0]} memories, ${counts[1]} connections, ${counts[2]} strong`);
  if (mode === 'whole') {
    await page.getByRole('button', { name: 'Hide recent activity' }).click();
    await page.waitForTimeout(6000);
  } else {
    const box = await page.locator('div.bg-label', { hasText: /Wattness Terminal$/ }).first().boundingBox();
    if (!box) throw new Error('the Wattness Terminal page is not on the view');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(1200);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(5000);
  }
  await page.addStyleTag({ content: '.lb-workspace, .lb-workspace-name, .lb-plan-card, .lb-account-row, .lb-account, .lb-account-avatar, .lb-account-name { visibility: hidden !important; }' });
  const blanked = await page.evaluate((words) => {
    let n = 0;
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      if (!words.some((w) => (t.nodeValue ?? '').includes(w))) continue;
      const el = t.parentElement, r = el?.getBoundingClientRect(), st = el && getComputedStyle(el);
      if (el && r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none') { el.style.setProperty('visibility', 'hidden', 'important'); n++; }
    }
    return n;
  }, own);
  console.log(`account text blanked in ${blanked} more place(s)`);
  const band = bandArg.replace('{CT}', ct());
  if (band) {
    await page.addStyleTag({ content: `@font-face { font-family: "Libre Franklin Brand"; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 100 900; font-display: block; }
      #gp-band { position: fixed; left: 96px; bottom: 84px; max-width: calc(100% - 192px); box-sizing: border-box; z-index: 2147483647; padding: 16px 26px 17px;
        border-radius: 14px; background: rgba(31, 36, 41, 0.72); -webkit-backdrop-filter: blur(14px) saturate(1.4); backdrop-filter: blur(14px) saturate(1.4);
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 14px 32px -16px rgba(0, 0, 0, 0.5);
        font: 500 22px/1.3 "Libre Franklin Brand", system-ui, sans-serif; letter-spacing: -0.005em; color: #eef2f6; pointer-events: none; }
      #gp-band b { font-weight: 600; } #gp-band span { color: #a9b1ba; font-weight: 400; }` });
    await page.evaluate((t) => {
      const [head, ...rest] = t.split(' · ');
      const el = document.createElement('div'); el.id = 'gp-band';
      const b = document.createElement('b'); b.textContent = head;
      const s = document.createElement('span'); s.textContent = rest.length ? ` · ${rest.join(' · ')}` : '';
      el.append(b, s); document.body.appendChild(el);
    }, band);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: out });
  console.log(`wrote ${out}${band ? ` (band: ${band})` : ''}`);
} finally {
  await page.close();
}
process.exit(0);
