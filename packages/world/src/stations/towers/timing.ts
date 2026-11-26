// T01 · Timing screens: every price from two sources. Five timing towers and a refused panel on the long plinth south
// of A7, turned to face the traffic coming down A7 from the stewards (the lap runs west), each tower's face a screen
// drawn from the sponsor lanes' evidence in frame-data.json (sponsors.atlas, sponsors.cmc): BNB/USD and USDT/USD from
// Atlas's signed Pull and CoinMarketCap side by side with their times, CoinMarketCap's security detail for BSC-USDT,
// the declared budget priced at the lower quote, Atlas's catalog, and the chain-97 feed refused as stale. The gantries
// over A7 and the Arena's glow stand beyond the row.
import * as THREE from 'three';
import type { FrameContext, FrameHandle } from '../types';
import type { Vec3 } from '../../lib/stage';
import {
  HEX, night, fog, towerMaterials, plinth, track, along, poles, glows, pool, faceOf, placeScreen, el, fit, frameTick, mount,
  usd, int, clockCT, tagPlates, createBuilder, line, type Glow, type Mats,
} from './set';
import { buildLaunchTower } from './launch';
import { caption, litType } from '../../words';

const PX = 120; // a screen's CSS px per meter
const TOWER = { w: 6, h: 16, d: 1.8 };
const DISPLAY = { w: 5.3, h: 12.7 };
/** The towers face the oncoming lane: compass 55 degrees, toward A7 where it leaves the stewards' curve. */
const FACE_AZ = 55;

interface Tower { group: THREE.Group; screen: THREE.Mesh; world(p: Vec3): Vec3; disp: { w: number; h: number } }

/** One timing tower on the plinth (its top at y 0.12), its face toward FACE_AZ. Local frame: x across the face, y up,
 *  -z out of the face. */
function tower(mats: Mats, x: number, z: number, o: { lamp?: string; h?: number; display?: { w: number; h: number }; legs?: boolean } = {}): Tower {
  const H = o.h ?? TOWER.h, W = TOWER.w, D = TOWER.d, disp = o.display ?? DISPLAY;
  const b = createBuilder(THREE);
  const g = new THREE.Group(); g.position.set(x, 0.12, z); g.rotation.y = (-FACE_AZ * Math.PI) / 180;
  const body0 = o.legs ? H - disp.h - 1.6 : 0.5;
  if (o.legs) {
    for (const s of [-1, 1]) {
      b.box('legs|galv', 0.36, body0 + 0.2, 0.36, s * 2.1, body0 / 2, 0, { c: 0.03 });
      b.box('legs|concrete', 1.2, 0.3, 1.2, s * 2.1, 0.15, 0, { c: 0.04 });
    }
  } else {
    b.box('foot|concrete', W + 1.4, 0.5, D + 1.6, 0, 0.25, 0, { c: 0.05 });
  }
  const bodyH = H - body0 - 0.5, bodyY = body0 + bodyH / 2;
  b.box('body|graphite', W, bodyH, D, 0, bodyY, 0, { c: 0.07 });
  for (const s of [-1, 1]) b.box('fins|galv', 0.12, bodyH - 0.4, D + 0.5, s * (W / 2 + 0.06), bodyY, 0, { c: 0.02 });
  b.box('crown|galv', W + 0.5, 0.5, D + 0.7, 0, H - 0.25, 0, { c: 0.05 });
  b.box('crown|graphiteDark', W - 0.4, 0.12, 0.3, 0, H - 0.56, -D / 2 - 0.2);
  // the display: centered in the body above the louvre band, a dark bezel round it
  const dy0 = o.legs ? body0 + 0.8 : 2.35, cy = dy0 + disp.h / 2, fz = -D / 2;
  const t = 0.2, bz = fz - 0.06;
  b.box('bezel|graphiteDark', disp.w + 2 * t, t, 0.16, 0, dy0 - t / 2, bz).box('bezel|graphiteDark', disp.w + 2 * t, t, 0.16, 0, dy0 + disp.h + t / 2, bz);
  for (const s of [-1, 1]) b.box('bezel|graphiteDark', t, disp.h, 0.16, s * (disp.w / 2 + t / 2), cy, bz);
  if (!o.legs) {
    for (let k = 0; k < 6; k++) b.box('louvre|louvre', disp.w - 0.4, 0.07, 0.14, 0, 0.95 + k * 0.17, fz - 0.05, { rx: -0.5 });
    b.box('louvre|seam', disp.w - 0.2, 1.16, 0.02, 0, 1.38, fz - 0.002);
  }
  const lampHex = o.lamp ?? HEX.teal;
  b.cyl('lamp|lampOn', 0.17, 0.1, W / 2 - 0.55, H - 0.25, -D / 2 - 0.36, { rx: Math.PI / 2, seg: 20 });
  const built = b.build({
    concrete: mats.concrete, graphite: mats.graphite, graphiteDark: mats.graphiteDark, galv: mats.m.galv, dark: mats.m.dark,
    louvre: mats.m.louvre, seam: mats.m.seam, lampOn: mats.emissive(lampHex, 3.2),
  });
  g.add(built.group);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(disp.w, disp.h), mats.screenBlack);
  screen.position.set(0, cy, fz - 0.03); screen.rotation.y = Math.PI;
  g.add(screen);
  // the crown's LED edge and a light seam down each fin's front edge
  const led = line([[-W / 2 - 0.2, H - 0.5, -D / 2 - 0.36], [W / 2 + 0.2, H - 0.5, -D / 2 - 0.36]], { color: lampHex, width: 1.6, glow: 7, glowA: 0.4, reveal: false, renderOrder: 5 });
  led.userData.noAO = true; g.add(led);
  for (const s of [-1, 1]) {
    const seam = line([[s * (W / 2 + 0.06), body0 + 0.4, -D / 2 - 0.26], [s * (W / 2 + 0.06), H - 0.7, -D / 2 - 0.26]], { color: lampHex, width: 1.1, glow: 4, glowA: 0.25, opacity: 0.55, reveal: false, renderOrder: 5 });
    seam.userData.noAO = true; g.add(seam);
  }
  g.updateMatrixWorld(true);
  const world = (p: Vec3): Vec3 => { const v = new THREE.Vector3(...p).applyMatrix4(g.matrixWorld); return [v.x, v.y, v.z]; };
  return { group: g, screen, world, disp };
}

/** Three gantries over A7 where it runs through the plinth's west end (the arch, x -150 to -40, 14 m clear). */
function gantries(mats: Mats, a7: number[][]) {
  const b = createBuilder(THREE);
  const at = (x: number, k = 0) => { let bi = 0; a7.forEach((p, i) => { if (Math.abs(p[0]! - x) < Math.abs(a7[bi]![0]! - x)) bi = i; }); return a7[Math.min(a7.length - 1, bi + k)]!; };
  const leds: number[][][] = [];
  for (const x of [-48, -95, -142]) {
    const p = at(x), q = at(x, 1);
    const tx = q[0]! - p[0]!, tz = q[1]! - p[1]!, L = Math.hypot(tx, tz), nx = -tz / L, nz = tx / L;
    const ends = [-1, 1].map((s) => [p[0]! + nx * s * 9.5, p[1]! + nz * s * 9.5]);
    for (const [ex, ez] of ends) b.box('g|graphite', 1.1, 16, 1.1, ex!, 8, ez!, { c: 0.05 });
    b.beam('g|graphite', [ends[0]![0]!, 15.2, ends[0]![1]!], [ends[1]![0]!, 15.2, ends[1]![1]!], 1.6, 1.0);
    leds.push([[ends[0]![0]!, 14.3, ends[0]![1]!], [ends[1]![0]!, 14.3, ends[1]![1]!]]);
  }
  const g = b.build({ graphite: mats.graphite }).group;
  for (const l of leds) { const s = line(l, { color: HEX.teal, width: 1.4, glow: 6, glowA: 0.4, reveal: false, renderOrder: 5 }); s.userData.noAO = true; g.add(s); }
  return g;
}

// ── the screens' UI ──────────────────────────────────────────────────────────────────────────────────────────────

function priceSpan(v: number, dp: number) {
  const s = v.toFixed(dp), [i, f] = s.split('.');
  return el('div.px', i!, el('em', `.${f}`));
}

type Src = { how: string; price: number; at: string; age: string };
/** A tick step of 1, 2 or 5 times a power of ten that cuts the range into about n pieces. */
function niceStep(range: number, n: number) {
  const raw = range / n, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/** The number line under a pair, to scale: the two sources on the first row of labels, Atlas's consensus median
 *  and TWAP on the second. */
function numberLine(marks: { v: number; label: string; cls: string }[], gap?: string) {
  const lo = Math.min(...marks.map((m) => m.v)), hi = Math.max(...marks.map((m) => m.v));
  const pad = (hi - lo) * 0.16, a = lo - pad, b = hi + pad;
  const box = el('div.tw-line');
  box.append(el('i.axis'));
  const step = niceStep(b - a, 4), dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-12; v += step) {
    const x = `${((v - a) / (b - a)) * 100}%`;
    const tk = el('i.tick'); tk.style.left = x; box.append(tk);
    const lb = el('span.tl', v.toFixed(dec)); lb.style.left = x; box.append(lb);
  }
  for (const m of marks) {
    const x = `${((m.v - a) / (b - a)) * 100}%`;
    const mk = el(`i.mk.${m.cls}`); mk.style.left = x; box.append(mk);
    const lab = el(`span.ml.${m.cls}`, m.label); lab.style.left = x; box.append(lab);
  }
  if (gap) {
    const [p, q] = marks.slice(0, 2).map((m) => ((m.v - a) / (b - a)) * 100).sort((u, v) => u - v);
    const br = el('i.br'); br.style.left = `${p}%`; br.style.width = `${q! - p!}%`; box.append(br);
    const gl = el('span.gl', gap); gl.style.left = `${(p! + q!) / 2}%`; box.append(gl);
  }
  return box;
}

function twoSources(o: { pair: string; atlas: Src; cmc: Src; dp: number; gap: string; marks: { v: number; label: string; cls: string }[]; table: [string, string, boolean?][]; foot: [string, string] }) {
  const col = (name: string, s: Src) => el('div.col',
    el('div.src.caps', name), el('div.how', s.how), priceSpan(s.price, o.dp), el('div.at.mono', s.at), el('div.age', s.age));
  const cols = el('div.cols', col('Atlas', o.atlas), el('div.mull'), col('CoinMarketCap', o.cmc));
  const root = el('div.tw-screen.tw-tower',
    el('div.hd', el('b', o.pair), el('i.lamp')), cols,
    el('div.tw-scale', el('div.cap', 'the two sources, to scale'), numberLine(o.marks, o.gap)),
    el('div.tw-table', ...o.table.map(([k, v, teal]) => el('div', k, el(teal ? 'b.teal' : 'b', v)))),
    el('div.foot', el('span', o.foot[0]), el('span', o.foot[1])));
  return { root, cols };
}

/** Sizes both prices to their columns (the smaller of the two fits) and sets the gap badge under them. */
function settleTwoSources(s: ReturnType<typeof twoSources>) {
  const pxs = [...s.cols.querySelectorAll<HTMLElement>('.px')];
  const colW = (s.cols.firstElementChild as HTMLElement).clientWidth - 12;
  pxs.forEach((p) => { p.style.fontSize = '170px'; fit(p, colW); });
  const fs = Math.min(...pxs.map((p) => parseFloat(p.style.fontSize)));
  pxs.forEach((p) => { p.style.fontSize = `${fs}px`; });
}

function screeningScreen(sec: any) {
  const hit = sec.hits?.[0];
  const pips = el('div.tw-pips'); pips.style.gridTemplateColumns = 'repeat(9, 1fr)'; pips.style.marginTop = '34px';
  for (let i = 0; i < sec.items; i++) pips.append(el(i < sec.items - sec.items_hit ? 'i.on' : 'i.warn'));
  const yn = (v: boolean | string) => (v === true || v === 'Yes' ? 'yes' : 'no');
  return el('div.tw-screen.tw-tower',
    el('div.hd', el('b', sec.token_label), el('i.lamp')),
    el('div.how', `CoinMarketCap security detail · ${sec.platform}`),
    el('div.tw-big.caps', sec.security_level),
    el('dl.tw-kv',
      el('dt', 'buy tax / sell tax'), el('dd', `${Number(sec.buy_tax)} / ${Number(sec.sell_tax)}`),
      el('dt', 'verified contract'), el('dd.teal', yn(sec.verified_contract)),
      el('dt', 'honeypot'), el('dd', sec.evm_display.honeypotStatus.toLowerCase()),
      el('dt', 'rug pull'), el('dd', sec.evm_display.rugPullStatus.toLowerCase()),
      el('dt', 'fake token'), el('dd', sec.evm_display.fakeTokenStatus.toLowerCase())),
    pips,
    el('div.rows', el('div.row', `${sec.items} checks`, el('b', `${sec.items_hit} caution: ${hit?.risk_code ?? ''}`)),
      el('div.row', 'flagged by vendor', el('b', yn(sec.flagged_by_vendor)))));
}

function budgetScreen(fd: any, lower: number) {
  const after = fd.after;
  // the reserve as what the budget leaves of the reference value (the budget is rounded down to the cent)
  const reserveUsd = after.reference_value_usd - after.budget_usd;
  const bar = el('div.tw-bar');
  const r = el('i'); r.style.width = `${(after.reserve_fraction * 100).toFixed(2)}%`; r.style.background = '#4a525a';
  const u = el('i'); u.style.flex = '1'; u.style.background = '#2ec7a6'; u.style.opacity = '0.85';
  bar.append(r, u);
  const pips = el('div.tw-pips'); pips.style.gridTemplateColumns = 'repeat(10, 1fr)'; pips.style.marginTop = '28px'; pips.style.gap = '8px';
  for (let i = 0; i < after.evaluations; i++) pips.append(el('i.on'));
  return el('div.tw-screen.tw-tower',
    el('div.hd', el('b', 'Budget'), el('i.lamp')),
    el('div.how', `${fd.bnb_quantity} BNB declared: a planning budget, not a wallet balance`),
    el('div.tw-big', String(after.evaluations)),
    el('div.how', `evaluations at ${usd(fd.evaluation_price_usd, 0)}`),
    el('dl.tw-kv',
      el('dt', `${fd.bnb_quantity} BNB × ${usd(lower)}`), el('dd', usd(after.reference_value_usd)),
      el('dt', `reserve ${(after.reserve_fraction * 100).toFixed(1)}%`), el('dd', usd(reserveUsd)),
      el('dt', 'for evaluations'), el('dd.teal', usd(after.budget_usd))),
    bar, pips,
    el('div.rows', el('div.row', 'priced at', el('b', 'the lower of the two')), el('div.row', 'testnet funds', el('b', 'no cash value'))));
}

function catalogScreen(atlas: any) {
  const n = atlas.catalog.public_feeds;
  const pips = el('div.tw-pips'); pips.style.gridTemplateColumns = 'repeat(12, 1fr)'; pips.style.gap = '7px'; pips.style.marginTop = '30px';
  // the catalog's order is not the feed ids'; the two feeds used are marked at their share of the id range
  const lit = new Set(atlas.feeds.map((f: any) => Math.min(n - 1, Math.round(((f.id - 600) / 100) * n))));
  for (let i = 0; i < n; i++) pips.append(el(lit.has(i) ? 'i.on' : 'i'));
  return el('div.tw-screen.tw-tower',
    el('div.hd', el('b', 'Atlas'), el('i.lamp')),
    el('div.how', 'public feeds in the catalog'),
    el('div.tw-big', int(n)),
    pips,
    el('div.rows', ...atlas.feeds.map((f: any) => el('div.row', `feed ${f.id}`, el('b.teal', f.name))),
      el('div.row', 'used', el('b', `${atlas.feeds.length} of ${int(n)}`))));
}

function refusedScreen(ex: any) {
  return el('div.tw-screen.tw-tower.tw-refused',
    el('div.hd', el('b', 'Refused'), el('i.lamp.red')),
    el('div.how', `chain-${ex.chain_id} feed · ${ex.description}`),
    el('div.tw-big.red', `${int(ex.age_s)} s`),
    el('div.rows', ...ex.rejected.map((r: string) => el('div.row', el('b.red', r)))));
}

// ── the frame ────────────────────────────────────────────────────────────────────────────────────────────────────

export async function timingFrame(ctx: FrameContext): Promise<FrameHandle> {
  const d = ctx.needData();
  const L = ctx.layout as any;
  const { stage } = ctx;
  const atlas = d.sponsors.atlas, cmc = d.sponsors.cmc;
  const aBNB = atlas.signed_pull.prices.find((p: any) => p.feed_id === 633), aUSDT = atlas.signed_pull.prices.find((p: any) => p.feed_id === 649);
  const cBNB = cmc.quotes.assets.find((a: any) => a.symbol === 'BNB'), cUSDT = cmc.quotes.assets.find((a: any) => a.symbol === 'USDT');
  const cons = (id: number) => atlas.signed_pull.consensus.find((c: any) => c.feed_id === id);
  const ageA = (id: number) => atlas.signed_pull.data_age_s.find((a: any) => Number(a.sourceId) === id)?.ageSeconds;
  const ageC = (id: number) => cmc.funding_decision.data_age_s.cmc.find((a: any) => Number(a.sourceId) === id)?.ageSeconds;
  const lower = Math.min(aBNB.usd, cBNB.price_usd);
  const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;

  night(ctx, { env: 0.09, warm: 0.35 });
  // raised for the 90 s cut (Jo, Nov 26): the moon and the sky's fill brighter, the fog pushed back, the towers' own
  // lamps and the poles stronger, so the row reads at a glance
  stage.setLight({ key: { color: '#93a8d4', intensity: 0.62 }, rim: { color: '#7f95c0', intensity: 0.34 },
    fill: { sky: '#4f6388', ground: '#1b1914', intensity: 0.8 }, env: 0.15, shadow: 0.18 });
  fog(ctx, 220, 1100);
  const mats = towerMaterials(ctx.theme);
  const root = new THREE.Group(); root.name = 'T01';
  const st = L.stations.find((s: any) => s.id === 'timing-screens');
  root.add(plinth(mats, st.footprint, HEX.teal));
  for (const id of ['season-purse', 'license-to-launch', 'arena']) root.add(plinth(mats, L.stations.find((s: any) => s.id === id).footprint, HEX.rim));

  // A7 from the stewards' curve, westward under the gantries toward the Arcade
  const main: number[][] = L.track.main_world;
  const a7 = main.filter(([x, z]) => z > 30 && z < 150 && x > -340 && x < 300);
  root.add(track(mats, a7, { comet: HEX.teal, dir: 1, phase: 31 }).group);
  root.add(gantries(mats, a7));
  const pl = poles(mats, along(a7, 60, 40).map((p, i) => ({ ...p, side: i % 2 ? 1 : -1 })), { lit: (p) => p.x > -40 && p.x < 260, intensity: 900 });
  root.add(pl.group);

  // the towers, nearest first: BNB/USD, USDT/USD, screening, budget, Atlas's catalog; the refused panel last, by the gantries
  const xs = [220, 160, 100, 40, -20], z = 105;
  const T = xs.map((x) => tower(mats, x, z));
  const R = tower(mats, -78, 112, { lamp: HEX.refused, h: 11.2, display: { w: 5.3, h: 4.6 }, legs: true });
  for (const t of [...T, R]) root.add(t.group);

  const halo: Glow[] = [];
  const out = (t: Tower, k: number): Vec3 => t.world([0, 0, -k]);
  for (const t of T) {
    const c = t.world([0, 2.35 + DISPLAY.h / 2, -1]);
    const f = out(t, 9);
    root.add(pool('#bfe9df', [f[0], 0.135, f[2]], 8, 12, 0.34, (-FACE_AZ * Math.PI) / 180));
    halo.push({ at: c, size: 19, hex: '#9fd8cc', alpha: 0.12, sharp: 0 });
    const pt = new THREE.PointLight('#cfeee7', 150, 30, 1.7); const lp = out(t, 4.5); pt.position.set(lp[0], 6.5, lp[2]); root.add(pt);
    halo.push({ at: t.world([TOWER.w / 2 - 0.55, TOWER.h - 0.25, -TOWER.d / 2 - 0.5]), size: 1.7, hex: HEX.teal, alpha: 0.9, sharp: 0.7, k: 1.4 });
  }
  { const f = out(R, 7); root.add(pool(HEX.refused, [f[0], 0.135, f[2]], 4, 6, 0.12)); }
  // a broad cool wash along the row's plinth and the lane before it (the grounds' hexes are unlit: light reaches them as
  // pools), so the row stands on a lit floor in the 90 s cut
  for (const [x, zz, rx, rz, k] of [[230, 92, 46, 26, 0.26], [150, 96, 52, 26, 0.21], [60, 100, 52, 24, 0.16], [-30, 104, 46, 22, 0.12]] as const) root.add(pool('#cfdcee', [x, 0.13, zz], rx, rz, k));
  halo.push({ at: R.world([TOWER.w / 2 - 0.55, 11.2 - 0.25, -TOWER.d / 2 - 0.5]), size: 1.9, hex: HEX.refused, alpha: 0.9, sharp: 0.7, k: 1.3 });
  halo.push({ at: R.world([0, 8.5, -1]), size: 12, hex: HEX.refused, alpha: 0.07, sharp: 0 });
  for (const h of pl.heads) halo.push({ at: h, size: 3.4, hex: HEX.pole, alpha: 0.55, sharp: 0.6 });
  root.add(glows(halo));

  // the launch tower beyond the row (the Season purse's machine turns its back to this view, so it is left out)
  root.add(buildLaunchTower(ctx, mats, { far: true, state: 'blocked' }).group);
  mount(ctx, root, mats);

  // the screens
  const bnb = twoSources({
    pair: 'BNB/USD', dp: 2,
    atlas: { how: `signed Pull · feed ${aBNB.feed_id}`, price: aBNB.usd, at: clockCT(aBNB.time.ct), age: `age ${ageA(633)} s` },
    cmc: { how: `Pro API v3 · id ${cBNB.cmc_id}`, price: cBNB.price_usd, at: clockCT(cBNB.quote_time.ct), age: `age ${ageC(1839)} s` },
    gap: `gap ${usd(aBNB.usd - cBNB.price_usd)} · ${((aBNB.usd - cBNB.price_usd) / cBNB.price_usd * 100).toFixed(2)}%`,
    marks: [{ v: aBNB.usd, label: 'Atlas', cls: 'a' }, { v: cBNB.price_usd, label: 'CoinMarketCap', cls: 'c' },
      { v: cons(633).median_usd, label: 'median', cls: 'm' }, { v: cons(633).twap_usd, label: 'TWAP', cls: 'm' }],
    table: [['consensus', cons(633).status.toLowerCase(), true], ['1 h', pct(cBNB.percent_change_1h)], ['score', cons(633).score.toFixed(3)],
      ['24 h', pct(cBNB.percent_change_24h)], ['median', usd(cons(633).median_usd)], ['rank', String(cBNB.cmc_rank)]],
    foot: ['Atlas signer verified', 'read Nov 25, after the seal'],
  });
  const usdt = twoSources({
    pair: 'USDT/USD', dp: 5,
    atlas: { how: `signed Pull · feed ${aUSDT.feed_id}`, price: aUSDT.usd, at: clockCT(aUSDT.time.ct), age: `age ${ageA(649)} s` },
    cmc: { how: `Pro API v3 · id ${cUSDT.cmc_id}`, price: cUSDT.price_usd, at: clockCT(cUSDT.quote_time.ct), age: `age ${ageC(825)} s` },
    gap: `gap ${usd(aUSDT.usd - cUSDT.price_usd, 5)}`,
    marks: [{ v: aUSDT.usd, label: 'Atlas', cls: 'a' }, { v: cUSDT.price_usd, label: 'CoinMarketCap', cls: 'c' },
      { v: cons(649).median_usd, label: 'median', cls: 'm' }],
    table: [['consensus', cons(649).status.toLowerCase(), true], ['1 h', pct(cUSDT.percent_change_1h)], ['score', cons(649).score.toFixed(3)],
      ['24 h', pct(cUSDT.percent_change_24h)], ['median', usd(cons(649).median_usd, 5)], ['rank', String(cUSDT.cmc_rank)]],
    foot: ['Atlas signer verified', 'read Nov 25, after the seal'],
  });
  const screens: [HTMLElement, Tower][] = [
    [bnb.root, T[0]!], [usdt.root, T[1]!], [screeningScreen(cmc.security), T[2]!], [budgetScreen(cmc.funding_decision, lower), T[3]!],
    [catalogScreen(atlas), T[4]!], [refusedScreen(atlas.excluded_testnet_feed), R],
  ];
  for (const [e, t] of screens) { e.style.width = `${t.disp.w * PX}px`; e.style.height = `${t.disp.h * PX}px`; ctx.overlay.appendChild(e); }
  settleTwoSources(bnb); settleTwoSources(usdt);

  const pos: Vec3 = [266, 3.4, 74], target: Vec3 = [110, 10.5, 116];
  const dx = pos[0] - target[0], dy = pos[1] - target[1], dz = pos[2] - target[2], dist = Math.hypot(dx, dy, dz);
  const cam = { target, az: (Math.atan2(dx, -dz) * 180) / Math.PI, el: (Math.asin(dy / dist) * 180) / Math.PI, dist, vfov: 34, shift: [0.08, -0.03] as [number, number] };

  stage.setFade({ center: [0.5, 0.5], screen: [2, 3], world: [700, 1300], worldCenter: [120, 100], glow: [0.74, 0.5] });
  stage.setKey({ az: 120, el: 34, center: [150, 6, 105], radius: 120, rimAz: 300 });
  stage.setAO({ radius: 0.8, scale: 1.1, thickness: 1.4, samples: 16 });
  stage.setShadowAuto(true);

  return {
    time: 2.0,
    note: `Timing screens, built for the storyboard on the intro's stage. Every figure on the screens and plates is a live read from the sponsor lanes' evidence (frame-data.json sponsors.atlas and sponsors.cmc), taken after the seal: Atlas signed Pull for BNB/USD (feed ${aBNB.feed_id}) and USDT/USD (feed ${aUSDT.feed_id}) at ${clockCT(aBNB.time.ct)} with the signer verified, Atlas's consensus median and TWAP, CoinMarketCap Pro quotes at ${clockCT(cBNB.quote_time.ct)}, CoinMarketCap's security detail for ${cmc.security.token_label}, Atlas's catalog of ${int(atlas.catalog.public_feeds)} public feeds, and the chain-${atlas.excluded_testnet_feed.chain_id} feed refused as ${int(atlas.excluded_testnet_feed.age_s)} s stale. The ${cmc.funding_decision.bnb_quantity} BNB is a declared planning budget, not a wallet balance, priced at the lower quote; testnet funds have no cash value. Illustrative: the towers' design, their order on the plinth, and their facing (turned to ${FACE_AZ} degrees, toward A7 as it leaves the stewards; the layout says they face north); the catalog's pips mark the feeds used at their share of the id range, not the catalog's order; the refused panel stands by the gantries (x -78) rather than at the plinth's east end, so the camera looking west down the row sees it far, with the gantries and the Arena's glow beyond. Sponsor values stay internal until the sponsor release.`,
    update(t) {
      stage.setCamera(cam);
      frameTick(ctx, root, mats, t);
    },
    decorate() {
      const avoid: { x: number; y: number; w: number; h: number }[] = [];
      for (const [e, t] of screens) {
        const f = faceOf(t.screen, t.disp.w, t.disp.h);
        placeScreen(ctx, e, f, PX);
        // dimmer with distance, as the fog takes the towers
        const dd = f.c.distanceTo(stage.camera.position);
        e.style.filter = `brightness(${(1.06 - 0.2 * Math.min(1, Math.max(0, (dd - 150) / 670))).toFixed(3)})${e.classList.contains('tw-refused') ? ' saturate(0.8)' : ''}`;
        const ps = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => f.c.clone().addScaledVector(f.right, (sx * f.w) / 2).addScaledVector(f.up, (sy * f.h) / 2)))
          .map((p) => ctx.plates.project([p.x, p.y, p.z])).filter((p): p is { x: number; y: number } => !!p);
        const xs2 = ps.map((p) => p.x), ys2 = ps.map((p) => p.y);
        avoid.push({ x: Math.min(...xs2), y: Math.min(...ys2), w: Math.max(...xs2) - Math.min(...xs2), h: Math.max(...ys2) - Math.min(...ys2) });
      }
      litType(ctx);
      const capR = caption(ctx, { head: 'Prices from two sources', flavor: 'timing screens', line: 'BNB and USDT priced by Atlas and CoinMarketCap side by side, and checked before a budget uses them.' });
      const top = (t: Tower, k = 0): Vec3 => t.world([k, TOWER.h + 0.6, -TOWER.d / 2]);
      const keepOut = capR ? [capR, avoid[0]!] : [avoid[0]!];
      void keepOut;
      ctx.plates.leaders([
        { id: 'bnb-a', text: `BNB/USD · Atlas signed ${usd(aBNB.usd)} · ${clockCT(aBNB.time.ct)}`, at: T[0]!.world([-DISPLAY.w / 2 - 0.25, 12.4, -TOWER.d / 2 - 0.1]), priority: 0 },
        { id: 'bnb-c', text: `BNB/USD · CoinMarketCap ${usd(cBNB.price_usd)} · ${clockCT(cBNB.quote_time.ct)}`, at: T[0]!.world([-DISPLAY.w / 2 - 0.25, 10.6, -TOWER.d / 2 - 0.1]), priority: 1 },
        { id: 'usdt', text: `USDT/USD · Atlas ${usd(aUSDT.usd, 5)} · CoinMarketCap ${usd(cUSDT.price_usd, 5)}`, at: top(T[1]!), priority: 2 },
        { id: 'sec', text: `${cmc.security.token_label} · security: ${cmc.security.security_level} · ${cmc.security.items_hit} caution: ${cmc.security.hits[0].risk_code}`, at: top(T[2]!), priority: 3 },
        { id: 'budget', text: `Budget · ${cmc.funding_decision.bnb_quantity} BNB at the lower price: ${usd(cmc.funding_decision.after.reference_value_usd)} · ${cmc.funding_decision.after.evaluations} evaluations at ${usd(cmc.funding_decision.evaluation_price_usd, 0)}`, at: top(T[3]!), priority: 4 },
        { id: 'catalog', text: `Atlas: ${int(atlas.catalog.public_feeds)} public feeds`, at: top(T[4]!), priority: 5 },
        { id: 'refused', text: `Refused · chain-${atlas.excluded_testnet_feed.chain_id} feed, ${int(atlas.excluded_testnet_feed.age_s)} s stale`, at: R.world([0, 11.6, -TOWER.d / 2]), priority: 6 },
      ], { max: 8, keepOut: capR ? [capR, avoid[0]!] : [avoid[0]!], avoid });
      tagPlates(ctx, { Refused: 'tw-refused-plate' });
    },
  };
}
