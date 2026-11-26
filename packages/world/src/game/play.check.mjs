// The game played in headless Chrome: node src/game/play.check.mjs --port <p> [--shots <dir>]
// Turns the dial with the keyboard and the pointer, drags glass from the source onto an hour and along its lane,
// sets an hour with the keys, fits the glass, loads the sealed arms, and seals against a scripted EIP-1193 wallet
// whose clock is before the gate (no chain is reached: the wallet is a script in the page). After every move the
// page's read-out must print the model's score for the plan the page holds.
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };
const port = Number(opt('port')), shots = opt('shots');
if (!Number.isInteger(port) || [5184, 5185, 15190, 15193, 15199].includes(port)) { console.error('usage: node src/game/play.check.mjs --port <spare port>'); process.exit(2); }
const base = `http://127.0.0.1:${port}`;
const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(resolve(here, '../data/frame-data.json'), 'utf8'));
const GATE = data.sealed_day.gate.unix;

const lib = process.env.WORLD_BROWSER_LIB;
if (!lib) { console.error('set WORLD_BROWSER_LIB to the browser launcher module (README: Checks)'); process.exit(2); }
const { launch, guardRequests } = await import(pathToFileURL(lib).href);
process.env.ROLE_VIDEOS_TMP ??= tmpdir();
if (shots) mkdirSync(shots, { recursive: true });

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; };

const { ctx, close } = await launch({ viewport: { width: 1920, height: 1080 }, dpr: 1, colorScheme: 'dark' });
try {
  const refused = await guardRequests(ctx, base);
  // the scripted wallet: BSC mainnet at first, switches when asked, answers GateRecord's calls; records every request
  await ctx.addInitScript(({ gate }) => {
    const log = [];
    let chainId = '0x38', mined = null, polls = 0;
    const account = '0x3333333333333333333333333333333333333333';
    window.__walletLog = log;
    window.ethereum = {
      async request({ method, params }) {
        log.push({ method, chainId, params: params ?? null });
        switch (method) {
          case 'eth_requestAccounts': return [account];
          case 'eth_chainId': return chainId;
          case 'wallet_switchEthereumChain': chainId = params[0].chainId; return null;
          case 'eth_getBlockByNumber': return { timestamp: `0x${(gate - 600 + (params[0] === 'latest' ? 0 : 3)).toString(16)}` };
          case 'eth_call': return `0x${'0'.repeat(64 * 8)}`;
          case 'eth_estimateGas': return '0x186a0';
          case 'eth_sendTransaction': {
            if (chainId !== '0x61' || params[0].chainId !== '0x61') throw new Error(`asked to send on ${chainId}`);
            const d = params[0].data.slice(10), w = (i) => d.slice(i * 64, i * 64 + 64);
            window.__sent = params[0];
            // the Committed event's words echo the call's; its key is the page's to check, so the wallet takes it from
            // the page's own record key (window.__expectKey, set by the check before it clicks)
            mined = { status: '0x1', blockNumber: '0x42c1d3', logs: [{ address: params[0].to, topics: [window.__topic, window.__expectKey, `0x${account.slice(2).padStart(64, '0')}`, `0x${w(0)}`], data: `0x${w(1)}${w(2)}${w(3)}${w(4)}` }] };
            return `0x${'ab'.repeat(32)}`;
          }
          case 'eth_getTransactionReceipt': return ++polls > 1 ? mined : null;
          default: throw new Error(`unexpected ${method}`);
        }
      },
    };
  }, { gate: GATE });
  const page = await ctx.newPage();
  const logs = [];
  page.on('pageerror', (e) => logs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  await page.goto(`${base}/src/game/play.html?mode=story&w=1920&h=1080&now=${GATE - 900}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true || typeof window.__error === 'string', null, { timeout: 120_000 });
  check(!(await page.evaluate(() => window.__error ?? null)), 'the game starts');

  /** The page's printed score against the model's, for the plan the page holds. */
  const agree = async (what) => {
    await page.waitForTimeout(120);
    const r = await page.evaluate(() => {
      const p = window.__game.played(), cents = Math.round(p.score.objective / 10000), neg = cents < 0, a = Math.abs(cents);
      const want = `${neg ? '−' : ''}$${Math.floor(a / 100).toLocaleString('en-US')}.${String(a % 100).padStart(2, '0')}`;
      return { want, got: document.querySelector('.op-read .big')?.textContent ?? null, plan: window.__game.getPlan(), lit: p.lit };
    });
    check(r.got === r.want, `${what}: the read-out prints ${r.got}, the model ${r.want}`);
    return r;
  };
  let r = await agree('opening on the planner’s plan');
  check(r.plan.step === 20, 'the dial opens at C');

  // the dial, by keys: seven detents toward A lights HE10 (its 17 contracts need charging the blend does not give)
  await page.focus('.op-dial');
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowLeft');
  r = await agree('the dial at 0.65');
  check(r.plan.step === 13 && r.lit, 'seven detents left: step 13, the light on');
  check(await page.isVisible('.op-light'), 'the light’s notice shows');
  await page.click('.op-light .op-btn');
  r = await agree('the glass fitted');
  check(!r.lit, 'fitting the glass turns the light out');

  // the dial, by pointer: a press at the knob's right end goes to C
  const knob = await page.locator('.op-dial').boundingBox();
  await page.mouse.move(knob.x + knob.width * 0.5, knob.y + knob.height * 0.5);
  await page.mouse.down(); await page.mouse.move(knob.x + knob.width * 0.98, knob.y + knob.height * 0.25, { steps: 6 }); await page.mouse.up();
  r = await agree('the dial dragged');
  check(r.plan.step === 20, `dragged to the right end: step ${r.plan.step}`);

  // the arms
  await page.click('[data-arm="A"]');
  r = await agree('no hedge (A)');
  check(r.plan.step === 0 && r.plan.glass.every((g) => g === 0), 'A loads: dial 0, no glass');

  // the glass: dragged from the source onto 5-6 pm (HE18), then along its lane
  const chip = await page.locator('.op-chip').first().boundingBox();
  const lane = await page.locator('.op-lane[data-h="17"] .plot').boundingBox();
  await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2);
  await page.mouse.down(); await page.mouse.move(lane.x + lane.width / 2, lane.y + lane.height * 0.4, { steps: 8 }); await page.mouse.up();
  r = await agree('glass dropped on HE18');
  check(r.plan.glass[17] === 50, `dropped glass sells half the cap: ${r.plan.glass[17]}`);
  const tile = await page.locator('.op-lane[data-h="17"] .tile').boundingBox();
  await page.mouse.move(tile.x + tile.width / 2, tile.y + 2);
  await page.mouse.down(); await page.mouse.move(tile.x + tile.width / 2, lane.y + 1, { steps: 6 }); await page.mouse.up();
  r = await agree('HE18 dragged to the top');
  check(r.plan.glass[17] === 100, `dragged to the cap: ${r.plan.glass[17]}`);

  // an hour by keys: 7-8 am (HE08) to its cap; 9-10 am (HE10) takes none at A
  await page.focus('.op-lane[data-h="7"]');
  await page.keyboard.press('End');
  r = await agree('HE08 by keys');
  check(r.plan.glass[7] === 100, `End puts HE08 at its cap: ${r.plan.glass[7]}`);
  await page.focus('.op-lane[data-h="9"]');
  await page.keyboard.press('End');
  r = await agree('HE10 at A');
  check(r.plan.glass[9] === 0, 'HE10 takes no glass where the schedule does not charge');
  if (shots) await page.screenshot({ path: join(shots, 'played.png') });

  // the seal, against the scripted wallet: switched to 97, committed, the receipt read back
  await page.click('[data-arm="C"]');
  await agree('back to C');
  const expect = await page.evaluate(async () => {
    const { recordKey, scopeId, odOf, selector } = await import('/src/game/chain.ts');
    const { keccak256, utf8 } = await import('/src/game/hash.ts');
    const f = window.__game.field();
    window.__topic = keccak256(utf8('Committed(bytes32,address,bytes32,uint32,bytes32,uint32,bytes32)'));
    window.__expectKey = recordKey('0x3333333333333333333333333333333333333333', scopeId(`gate-record/arena/one-plan/${f.resource}`), odOf(f.operatingDay));
    return { key: window.__expectKey, commit: selector('commit(bytes32,uint32,bytes32,uint32,bytes32)') };
  });
  const go = page.locator('.op-seal .go');
  check(await go.isEnabled(), 'Seal my plan is enabled before the gate with the light out');
  await go.click();
  await page.waitForSelector('.op-receipt', { timeout: 20_000 });
  const w = await page.evaluate(() => ({ log: window.__walletLog.map((x) => `${x.method}@${x.chainId}`), sent: window.__sent }));
  check(w.log.indexOf('wallet_switchEthereumChain@0x38') >= 0 && w.log.indexOf('wallet_switchEthereumChain@0x38') < w.log.findIndex((m) => m.startsWith('eth_sendTransaction')), 'the wallet was switched from 56 to 97 before anything was sent');
  check(w.log.filter((m) => m.startsWith('eth_sendTransaction')).every((m) => m.endsWith('@0x61')), 'every send went to chain 97');
  check(w.sent?.data?.startsWith(expect.commit) && w.sent.to === '0x2922c68cE15EB3e83B7f43b136e981dDc4262876', 'one commit call to GateRecord');
  const receipt = await page.locator('.op-receipt').innerText();
  check(receipt.includes(expect.key) && receipt.includes('597 s'), 'the receipt shows the record key and the seconds before the gate');
  check(await page.locator('.op-seal .dl').isVisible(), 'the leaf can be downloaded');
  if (shots) await page.screenshot({ path: join(shots, 'sealed-scripted-wallet.png') });
  check(logs.length === 0, `no page errors${logs.length ? `: ${logs.join(' | ')}` : ''}`);
  check(refused.length === 0, `no request left the page${refused.length ? `: ${refused.join(', ')}` : ''}`);
} finally { await close(); }
console.log(failures ? `${failures} failed` : 'all passed');
process.exit(failures ? 1 : 0);
