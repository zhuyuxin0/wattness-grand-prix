// @ts-nocheck
// What each agent's screen shows: its own output for Desert Willow's sealed plan (frame-data.json, the station's
// files.json, inputs.json and ids.json), as HTML and SVG for the DOM screens (screen.ts). Plain names lead; the race
// term follows, small, as flavor. Every figure is read here from the data; nothing is typed in.
import files from './files.json';
import inputs from './inputs.json';
import ids from './ids.json';
import { armTotals } from './data';
import { heatCss } from '../../lib/heat';

const MINUS = '−';
/** "$3,746.80", the sign as a minus; plus: "+$406.91" for gains. */
export const usd = (v, { plus = false, cents = true } = {}) => {
  const c = Math.round(Math.abs(v) * (cents ? 100 : 1));
  const whole = cents ? Math.floor(c / 100) : c;
  const s = `$${whole.toLocaleString('en-US')}${cents ? '.' + String(c % 100).padStart(2, '0') : ''}`;
  return v < 0 ? MINUS + s : plus && v > 0 ? '+' + s : s;
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-24" as "Nov 24". */
export const day = (iso) => { const [, m, dd] = iso.split('-'); return `${MON[Number(m) - 1]} ${Number(dd)}`; };
/** "2026-11-25 09:51:43 CT" as "09:51 CT". */
export const hm = (ct) => `${ct.slice(11, 16)} CT`;

/** The role behind each bay: plain name first, then the role and the race term (flavor), and its on-chain identity. */
export const BAYS = {
  'race-day-forecast': { name: 'Forecast', role: 'Forecaster', flavor: 'race-day forecast', id: 'forecaster' },
  'fuel-and-wear': { name: 'State of charge', role: 'State keeper', flavor: 'fuel and wear', id: 'state-keeper' },
  spotter: { name: 'Market inputs', role: 'Market reader', flavor: 'spotter', id: 'market-reader' },
  setup: { name: 'Hedge', role: 'Hedger', flavor: 'setup', id: 'hedger' },
  'risk-desk': { name: 'Risk', role: 'Risk officer', flavor: 'risk desk', id: 'risk-officer' },
  'pit-wall': { name: 'Plan', role: 'Planner', flavor: 'pit wall', id: 'planner', gold: true },
};
export const agentId = (role) => ids.roles[role]?.agentId ?? null;
export const evaluatorId = () => ids.evaluator?.agentId ?? null;

function head(bay) {
  const b = BAYS[bay], id = agentId(b.id);
  const badge = id != null
    ? `<div class="gx-badge"><b>Agent ${id}</b><span>ERC-8004 · BSC testnet</span></div>`
    : `<div class="gx-badge none"><b>Agent</b><span>identity pending</span></div>`;
  return `<div class="gx-head"><div><div class="gx-name">${b.name}</div><div class="gx-flavor">${b.role} <i>· ${b.flavor}</i></div></div>${badge}</div>`;
}
const fig = (label, value, cls = '') => `<div class="gx-fig"><span>${label}</span><b class="${cls}">${value}</b></div>`;

// ── shared chart frame: 24 hourly slots across ─────────────────────────────────────────────────────────────────
function frame(W, H, { left = 74, right = 10, top = 10, bottom = 40 } = {}) {
  const x0 = left, x1 = W - right, y0 = top, y1 = H - bottom;
  return { x0, x1, y0, y1, xOf: (h) => x0 + ((x1 - x0) * h) / 24 };
}
function hourTicks(F, H) {
  return [6, 12, 18, 24].map((he) => `<text class="num" x="${F.xOf(he - 0.5)}" y="${H - 8}" text-anchor="middle">HE${String(he).padStart(2, '0')}</text>`).join('');
}
/** A step area between two hourly series (lo, hi), as one SVG path. */
function stepBand(F, lo, hi, y) {
  let top = '', bot = '';
  for (let h = 0; h < 24; h++) top += `${h ? 'L' : 'M'}${F.xOf(h)},${y(hi[h])} L${F.xOf(h + 1)},${y(hi[h])} `;
  for (let h = 23; h >= 0; h--) bot += `L${F.xOf(h + 1)},${y(lo[h])} L${F.xOf(h)},${y(lo[h])} `;
  return `${top}${bot}Z`;
}
function stepLine(F, v, y) {
  let p = '';
  for (let h = 0; h < 24; h++) p += `${h ? 'L' : 'M'}${F.xOf(h)},${y(v[h])} L${F.xOf(h + 1)},${y(v[h])} `;
  return p;
}

// ── Forecast: the price scenarios as bands, and the node's day-ahead forecast ───────────────────────────────────────
export function forecastHtml(d, W = 1200, H = 430) {
  const S = d.showcase, b = S.scenarios.node_bands_cents, node = S.forecast.node_da_cents;
  const cw = W - 44 - 40 - 390 - 36, ch = H - 168 - 30;
  const F = frame(cw, ch);
  const lo = -20, hi = 110, y = (cents) => F.y1 - ((cents / 100 - lo) / (hi - lo)) * (F.y1 - F.y0);
  const svg = [];
  for (const v of [0, 50, 100]) {
    svg.push(`<line x1="${F.x0}" x2="${F.x1}" y1="${y(v * 100)}" y2="${y(v * 100)}" stroke="${v === 0 ? '#59636c' : '#232c33'}" stroke-width="${v === 0 ? 2.5 : 1.5}"/>`);
    svg.push(`<text class="num" x="${F.x0 - 12}" y="${y(v * 100) + 8}" text-anchor="end">$${v}</text>`);
  }
  svg.push(`<path d="${stepBand(F, b.p05, b.p95, y)}" fill="#b481f0" fill-opacity="0.26"/>`);
  svg.push(`<path d="${stepBand(F, b.p25, b.p75, y)}" fill="#b481f0" fill-opacity="0.5"/>`);
  svg.push(`<path d="${stepLine(F, node, y)}" fill="none" stroke="#f6f8fa" stroke-width="5" stroke-linejoin="round"/>`);
  svg.push(hourTicks(F, ch));
  const nlo = Math.min(...node) / 100, nhi = Math.max(...node) / 100;
  const side = [
    fig(`${S.scenarios.count} price scenarios`, `p05 to p95`, 'sm'),
    fig('Day-ahead forecast at the node', `${usd(nlo)} to ${usd(nhi)}`, 'sm'),
    `<div class="gx-note">${day(d.sealed_day.operating_day)}: a NERC holiday, off-peak</div>`,
  ].join('');
  return `${head('race-day-forecast')}<div class="gx-body"><div class="gx-chart"><svg class="gx-svg" viewBox="0 0 ${cw} ${ch}">${svg.join('')}</svg></div><div class="gx-side">${side}</div></div>`;
}

// ── State of charge: arm C's path through the day, inside its limits ─────────────────────────────────────────────────
export function stateHtml(d, W = 1200, H = 430) {
  const S = d.showcase, C = S.arms.C, A = S.assumptions;
  const cw = W - 44 - 40 - 390 - 36, ch = H - 168 - 30;
  const F = frame(cw, ch);
  const y = (pct) => F.y1 - (pct / 100) * (F.y1 - F.y0);
  const open = A.soc_open_ppm / 1e4, lo = A.soc_min_ppm / 1e4, hi = A.soc_max_ppm / 1e4;
  const soc = [open, ...C.soc_pct];
  const svg = [];
  for (const v of [0, 50, 100]) svg.push(`<text class="num" x="${F.x0 - 12}" y="${y(v) + 8}" text-anchor="end">${v}%</text>`);
  svg.push(`<rect x="${F.x0}" y="${y(100)}" width="${F.x1 - F.x0}" height="${y(0) - y(100)}" fill="#ffffff" fill-opacity="0.025"/>`);
  for (const [v, dash] of [[lo, ''], [hi, ''], [open, '10 8']]) svg.push(`<line x1="${F.x0}" x2="${F.x1}" y1="${y(v)}" y2="${y(v)}" stroke="#c9d0d6" stroke-opacity="${dash ? 0.55 : 0.8}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`);
  // the area under the path, then the path itself, hour by hour: discharging teal, charging #7f9cc0, idle gray
  let area = `M${F.xOf(0)},${y(0)} `;
  for (let h = 0; h <= 24; h++) area += `L${F.xOf(h)},${y(soc[h])} `;
  area += `L${F.xOf(24)},${y(0)} Z`;
  svg.push(`<path d="${area}" fill="#2ec7a6" fill-opacity="0.16"/>`);
  for (let h = 0; h < 24; h++) {
    const k = C.kw[h], color = k > 0 ? '#2ec7a6' : k < 0 ? '#9db8da' : '#7b858e';
    svg.push(`<line x1="${F.xOf(h)}" y1="${y(soc[h])}" x2="${F.xOf(h + 1)}" y2="${y(soc[h + 1])}" stroke="${color}" stroke-width="${k ? 6 : 4}" stroke-linecap="round"/>`);
  }
  svg.push(hourTicks(F, ch));
  const close = C.soc_pct[23];
  const side = [
    fig('Opens, and closes', `${open}% → ${close.toFixed(2)}%`, 'sm'),
    fig('Limits', `${lo}% to ${hi}%`, 'sm'),
    fig('Out · in', `${C.discharge_mwh.toFixed(1)} · ${C.charge_mwh.toFixed(1)} MWh`, 'sm'),
  ].join('');
  return `${head('fuel-and-wear')}<div class="gx-body"><div class="gx-chart"><svg class="gx-svg" viewBox="0 0 ${cw} ${ch}">${svg.join('')}</svg></div><div class="gx-side" style="width:430px">${side}</div></div>`;
}

// ── Market inputs: the sealed leaf's 527 files, as tiles and by kind ─────────────────────────────────────────────────
const GROUP_HEX = ['#a3abb3', '#b481f0', '#2ec7a6'];
export function inputsHtml(d, W = 1200, H = 430) {
  const cw = 430, ch = H - 168 - 30;
  const n = files.groups.length, cols = 31, rows = Math.ceil(n / cols);
  const lab = 34, pw = cw / cols, ph = (ch - lab) / rows;
  const svg = [];
  for (let i = 0; i < n; i++) {
    const g = Number(files.groups[i]), byte = files.first_byte[i], r = Math.floor(i / cols), c = i % cols;
    svg.push(`<rect x="${(c * pw + 1).toFixed(2)}" y="${(r * ph + 1).toFixed(2)}" width="${(pw - 2).toFixed(2)}" height="${(ph - 2).toFixed(2)}" rx="1.5" fill="${GROUP_HEX[g]}" fill-opacity="${(0.4 + 0.6 * byte / 255).toFixed(3)}"/>`);
  }
  svg.push(`<text class="lab mute" x="0" y="${ch - 4}">${n} files, each named by its SHA-256</text>`);
  const G = Object.fromEntries(inputs.groups.map((g) => [g.kind, g]));
  const runs = G.live_runs, hub = G.hub_prices, node = G.node_prices, rel = G.release;
  const other = G.reference.count + G.live_days.count + G.live_points.count;
  const row = (hex, label, sub, count) => `<div class="gx-row"><i style="background:${hex}"></i><span>${label}<em>${sub}</em></span><b>${count}</b></div>`;
  const list = [
    row(GROUP_HEX[2], 'Live price runs', `${day(runs.first_day)} and ${day(runs.last_day).split(' ')[1]}`, runs.count),
    row(GROUP_HEX[1], 'Hub prices, HB_NORTH', `${day(hub.first_day)} to ${day(hub.last_day)}`, hub.count),
    row(GROUP_HEX[1], 'Node prices, DSWL_BES1', `${day(node.first_day)} to ${day(node.last_day)}`, node.count),
    row(GROUP_HEX[0], 'Terminal release', inputs.source.release_id.replace('terminal-daily-', ''), rel.count),
    row('#59636c', 'Battery size, fleet map, live index', '', other),
  ].join('');
  return `${head('spotter')}<div class="gx-body"><div class="gx-chart" style="flex:none;width:${cw}px"><svg class="gx-svg" viewBox="0 0 ${cw} ${ch}">${svg.join('')}</svg></div><div class="gx-list" style="flex:1 1 auto">${list}</div></div>`;
}

// ── Hedge: ElectronX's published terms, and arm C's contracts hour by hour ──────────────────────────────────────────
export function hedgeHtml(d, W = 1200, H = 430) {
  const S = d.showcase, I = S.instrument, C = S.arms.C;
  const cw = W - 44 - 40 - 390 - 36, ch = H - 168 - 30;
  const F = frame(cw, ch - 74, { left: 74, top: 12, bottom: 34 });
  // the hour's cap (assumptions.max_contracts_per_hour, 100) reaches the chart's edge
  const mid = (F.y0 + F.y1) / 2, half = (F.y1 - F.y0) / 2, cap = S.assumptions.max_contracts_per_hour;
  const svg = [];
  svg.push(`<line x1="${F.x0}" x2="${F.x1}" y1="${mid}" y2="${mid}" stroke="#59636c" stroke-width="2.5"/>`);
  svg.push(`<text class="num" x="${F.x0 - 12}" y="${F.y0 + 18}" text-anchor="end">sell</text><text class="num" x="${F.x0 - 12}" y="${F.y1 - 2}" text-anchor="end">buy</text>`);
  for (const v of [cap, -cap]) svg.push(`<line x1="${F.x0}" x2="${F.x1}" y1="${mid - (v / cap) * half}" y2="${mid - (v / cap) * half}" stroke="#232c33" stroke-width="1.5" stroke-dasharray="6 6"/>`);
  for (let h = 0; h < 24; h++) {
    const q = C.contracts[h];
    if (!q) continue;
    const x = F.xOf(h) + 4, w = (F.x1 - F.x0) / 24 - 8, hh = (Math.abs(q) / cap) * half;
    const top = q > 0 ? mid - hh : mid;
    svg.push(`<rect x="${x}" y="${top}" width="${w}" height="${hh}" rx="3" fill="${q > 0 ? '#eb6834' : '#f2b38f'}"/>`);
  }
  svg.push(hourTicks(F, ch - 74));
  const side = [
    fig('Contracts sold · bought', `${C.contracts_sold} · ${C.contracts_bought}`, 'sm'),
    fig('Collateral', usd(C.collateral_usd), 'sm'),
  ].join('');
  const terms = `${I.venue} · ${I.product} at ${I.location} · ${usd(I.range_cents[0] / 100, { cents: false })} to ${usd(I.range_cents[1] / 100, { cents: false })}/MWh · ${I.size_kwh / 1000} MWh a contract · ${usd(I.fee_cents_per_contract / 100)} fee<br><span style="color:#8d969f">Contracts by hour; the entry assumed at fair value: a comparison, not a trade</span>`;
  return `${head('setup')}<div class="gx-body" style="flex-direction:column;gap:8px"><div class="gx-terms">${terms}</div><div style="display:flex;gap:36px;flex:1 1 auto"><div class="gx-chart"><svg class="gx-svg" viewBox="0 0 ${cw} ${ch - 74}">${svg.join('')}</svg></div><div class="gx-side">${side}</div></div></div>`;
}

// ── Risk: the downside measure over C's 301 scenarios, and Cournot's odds read after the seal ──────────────────────
export function riskHtml(d, W = 1200, H = 430) {
  const S = d.showcase, A = S.arms.A, C = S.arms.C, Q = d.sponsors.cournot;
  const { totals, tail } = armTotals(d, 'C');
  const cw = 420, ch = H - 168 - 30;
  const F = { x0: 8, x1: cw - 8, y0: 6, y1: ch - 44 };
  const BIN = 250, lo = Math.floor(Math.min(...totals) / BIN), hi = Math.floor(Math.max(...totals) / BIN);
  const nb = hi - lo + 1, count = new Array(nb).fill(0), inTail = new Array(nb).fill(0);
  totals.forEach((t, k) => { const b = Math.floor(t / BIN) - lo; count[b]++; if (tail.has(k)) inTail[b]++; });
  const most = Math.max(...count), bw = (F.x1 - F.x0) / nb;
  const svg = [];
  const zx = F.x0 + (0 - lo * BIN) / BIN * bw;
  for (let b = 0; b < nb; b++) {
    if (!count[b]) continue;
    const h = (count[b] / most) * (F.y1 - F.y0), x = F.x0 + b * bw;
    svg.push(`<rect x="${(x + 1).toFixed(2)}" y="${(F.y1 - h).toFixed(2)}" width="${(bw - 2).toFixed(2)}" height="${h.toFixed(2)}" fill="${heatCss('dark', (lo + b + 0.5) * BIN)}"/>`);
    if (inTail[b]) { const th = (inTail[b] / most) * (F.y1 - F.y0); svg.push(`<rect x="${(x + 1).toFixed(2)}" y="${(F.y1 - th).toFixed(2)}" width="${(bw - 2).toFixed(2)}" height="${th.toFixed(2)}" fill="none" stroke="#f6f8fa" stroke-width="2.5"/>`); }
  }
  svg.push(`<line x1="${zx}" x2="${zx}" y1="${F.y0}" y2="${F.y1 + 6}" stroke="#c9d0d6" stroke-width="2"/>`);
  svg.push(`<line x1="${F.x0}" x2="${F.x1}" y1="${F.y1}" y2="${F.y1}" stroke="#59636c" stroke-width="2"/>`);
  const tw = [...tail.keys()].map((k) => totals[k]), ta = F.x0 + (Math.min(...tw) / BIN - lo) * bw, tb = F.x0 + (Math.max(...tw) / BIN - lo) * bw;
  svg.push(`<path d="M${ta},${F.y1 + 10} L${ta},${F.y1 + 18} L${tb},${F.y1 + 18} L${tb},${F.y1 + 10}" fill="none" stroke="#f6f8fa" stroke-width="2.5"/>`);
  svg.push(`<text class="num" x="${ta}" y="${ch - 2}" style="fill:#eef1f4">worst tenth</text>`);
  svg.push(`<text class="num" x="${zx + 8}" y="${F.y0 + 20}">$0</text>`);
  const worstC = -C.cvar_usd, worstA = -A.cvar_usd;
  const p = Math.round(Q.probability.value * 100);
  const side = `<div class="gx-side" style="width:290px">${fig('Worst tenth, average day', usd(worstC, { plus: true }), 'gain')}${fig('With no hedge (A)', usd(worstA), 'loss sm')}</div>`
    + `<div class="gx-side" style="width:320px;padding-left:26px;box-shadow:inset 3px 0 0 #2c363f">`
    + `<div class="gx-fig"><span style="white-space:normal">Dallas low under ${Q.resolve.threshold_f}°F on ${day(Q.resolve.event_day)}</span><b>${p}%</b></div>`
    + `<div class="gx-note"><span class="gx-chip after" style="margin:0 0 8px">read after the seal</span><br>Kalshi via Cournot, ${hm(Q.probability.observed.ct)}</div></div>`;
  return `${head('risk-desk')}<div class="gx-body" style="gap:30px"><div class="gx-chart" style="flex:none;width:${cw}px"><svg class="gx-svg" viewBox="0 0 ${cw} ${ch}">${svg.join('')}</svg></div>${side}</div>`;
}

// ── Plan: the three plans and the one chosen ────────────────────────────────────────────────────────────────────
export const PLAN_WHAT = { A: 'No hedge', B: 'Hedge on a fixed schedule', C: 'Schedule and hedge together' };
export function planHtml(d, W = 1200, H = 430) {
  const arms = d.showcase.arms, sel = d.showcase.selected_arm;
  const best = Math.max(...['A', 'B', 'C'].map((a) => arms[a].objective_usd));
  const rows = ['A', 'B', 'C'].map((a) => {
    const s = arms[a].objective_usd, chosen = a === sel;
    return `<div class="gx-plan ${chosen ? 'sel' : ''}"><div class="let">${a}</div><div><div class="what">${PLAN_WHAT[a]}${chosen ? '<span class="gx-chip">SEALED</span>' : ''}</div>`
      + `<div class="bar"><i style="width:${(100 * s / best).toFixed(1)}%"></i></div></div><div class="score">${usd(s)}</div></div>`;
  }).join('');
  return `${head('pit-wall')}<div class="gx-body" style="display:block"><div class="gx-plans">${rows}</div></div>`;
}

// ── The planner's standing boards: one plan each ─────────────────────────────────────────────────────────────────
export function boardHtml(d, arm) {
  const a = d.showcase.arms[arm], sel = d.showcase.selected_arm === arm, r = d.game.results[arm];
  const seal = d.sealed_day.receipts[0].block_time.ct;
  const worst = -a.cvar_usd;
  const { totals, tail } = armTotals(d, arm);
  // the 301 scenario totals in $250 bins on one axis for all three boards (-$4,000 to $17,000), on the heat ramp
  const Wh = 812, Hh = 120, lo = -4000, hi = 17000, sx = Wh / (hi - lo), cnt = new Map();
  totals.forEach((t) => { const b = Math.floor(t / 250); cnt.set(b, (cnt.get(b) ?? 0) + 1); });
  const most = 21, bars = [];
  for (const [b, c] of cnt) bars.push(`<rect x="${((b * 250 - lo) * sx + 0.5).toFixed(2)}" y="${(Hh - 12 - (c / most) * (Hh - 16)).toFixed(2)}" width="${(250 * sx - 1).toFixed(2)}" height="${((c / most) * (Hh - 16)).toFixed(2)}" fill="${heatCss('dark', (b + 0.5) * 250)}"/>`);
  const z = (0 - lo) * sx;
  bars.push(`<line x1="${z}" x2="${z}" y1="0" y2="${Hh - 6}" stroke="#c9d0d6" stroke-width="2"/><line x1="0" x2="${Wh}" y1="${Hh - 12}" y2="${Hh - 12}" stroke="#59636c" stroke-width="2"/>`);
  const sub = sel ? `chosen · sealed ${seal.slice(11, 19)} CT` : arm === 'A' ? 'the schedule alone' : 'A’s schedule kept';
  return `<div class="gx-board ${sel ? 'gold' : ''}"><div class="t"><div class="let">${arm}</div><div class="what">${PLAN_WHAT[arm]}<span>${sub}</span></div></div>`
    + `<div class="cells"><span>Mean</span><b>${usd(a.expected_usd)}</b><span>Worst tenth, average day</span><b class="${worst < 0 ? 'loss' : 'gain'}">${usd(worst, { plus: true })}</b>`
    + `<div class="score" style="display:contents"><span>Score</span><b>${usd(a.objective_usd)}</b></div></div>`
    + `<div class="hist"><svg viewBox="0 0 ${Wh} ${Hh}">${bars.join('')}</svg></div>`
    + `<div class="foot">${r.stats_uusd.scenarios_below_zero} of ${totals.length} scenarios lose money</div></div>`;
}
