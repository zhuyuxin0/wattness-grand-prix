// ONE PLAN's controls, read-out and seal panel in DOM: the schedule dial (21 detents, A to C), the rack of 24 hours
// the glass is dragged onto (a tile's height is its contracts, 0 to the hour's cap; the light shows glass the schedule
// does not deliver), the plan's score beside the planner's, and the seal. Plain words first; the market's hour codes
// (HE) and the arms' letters second. With sound on (lib/sound), the controls sound as they move: a tick a detent or a
// contract, a tink as glass lands on an hour, a press for each button, a chime as the plan passes the planner's, the
// stamp once a seal is read back from the chain.
import * as sound from '../lib/sound';
import { BSC_TESTNET, dualClock, gateUnix } from './chain';
import { DIAL_STEPS, HOURS, hourName, usd, usdCents, type ArmId, type Field, type Played, type PlayerPlan } from './model';
import { planeSvg, type PlaneMark } from '../stations/game/screens';
import type { SealReceipt, SealStep } from './wallet';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
/** Every button in a view presses (a disabled one sends no click). Caught on the way down, before a handler redraws
 *  the view. */
const pressing = (el: HTMLElement) => el.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.closest('button')) sound.press(); }, true);
const ICON_X = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

/** The plans' names and colors, as every chart and table of the site names them (site/src/design/tokens.ts): the
 *  colors are the deck's --op-a, --op-b and --op-c, which take the site's --arm-a, --arm-b and --arm-c. */
export const ARM_NAME: Record<ArmId, string> = { A: 'No hedge', B: 'Hedge on a fixed schedule', C: 'Schedule and hedge together' };
export const ARM_COLOR: Record<ArmId, string> = { A: 'var(--op-a)', B: 'var(--op-b)', C: 'var(--op-c)' };

// ── the dial ──────────────────────────────────────────────────────────────────────────────────────────────────────

export function dialView(onChange: (step: number) => void) {
  const box = h('div', 'op-dialbox');
  const R = 56, cx = 56, cy = 56;
  const ticks: string[] = [];
  for (let i = 0; i <= DIAL_STEPS; i++) {
    const a = ((-60 + (120 * i) / DIAL_STEPS) * Math.PI) / 180, end = i === 0 || i === DIAL_STEPS;
    const r0 = end ? 41 : 44, r1 = 51;
    ticks.push(`<line class="tick${end ? ' end' : ''}" data-i="${i}" x1="${cx + Math.sin(a) * r0}" y1="${cy - Math.cos(a) * r0}" x2="${cx + Math.sin(a) * r1}" y2="${cy - Math.cos(a) * r1}"/>`);
  }
  box.innerHTML = `<svg class="op-dial" viewBox="0 0 112 112" role="slider" tabindex="0" aria-label="Schedule dial: from the price-chasing schedule (A) to the one chosen with the hedge (C)"
      aria-valuemin="0" aria-valuemax="${DIAL_STEPS}">
    <defs><radialGradient id="op-brass" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#e0c08a"/><stop offset="0.55" stop-color="#b8935a"/><stop offset="1" stop-color="#6d5532"/></radialGradient></defs>
    ${ticks.join('')}
    <circle class="knob" cx="${cx}" cy="${cy}" r="36"/><circle class="cap" cx="${cx}" cy="${cy}" r="27"/>
    <line class="ptr" x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 22}"/>
  </svg>
  <div class="op-dialval"></div>
  <div class="op-dialends"><span><b>A</b>chases prices</span><span><b>C</b>chosen with the hedge</span></div>`;
  box.insertAdjacentHTML('afterbegin', '<div class="op-dialtitle">Schedule dial</div>');
  const svg = box.querySelector('svg')!, ptr = box.querySelector<SVGLineElement>('.ptr')!, val = box.querySelector<HTMLElement>('.op-dialval')!;
  let step = 0;
  const set = (s: number) => {
    step = s;
    const a = -60 + (120 * s) / DIAL_STEPS;
    ptr.setAttribute('transform', `rotate(${a} ${cx} ${cy})`);
    svg.querySelectorAll('.tick').forEach((t) => t.classList.toggle('on', Number((t as SVGElement).dataset.i) <= s && s > 0));
    svg.setAttribute('aria-valuenow', String(s));
    svg.setAttribute('aria-valuetext', `${(s / DIAL_STEPS).toFixed(2)} of the way from A to C`);
    val.textContent = `${(s / DIAL_STEPS).toFixed(2)}`;
  };
  const fromPointer = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const ang = (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
    return Math.max(0, Math.min(DIAL_STEPS, Math.round(((Math.max(-75, Math.min(75, ang)) + 60) / 120) * DIAL_STEPS)));
  };
  // a turn to a new detent ticks
  const turn = (s: number) => { if (s === step) return; sound.tick(); onChange(s); };
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId); svg.focus();
    turn(fromPointer(e));
  });
  svg.addEventListener('pointermove', (e) => { if (!svg.hasPointerCapture(e.pointerId)) return; turn(fromPointer(e)); });
  svg.addEventListener('wheel', (e) => { e.preventDefault(); turn(Math.max(0, Math.min(DIAL_STEPS, step + (e.deltaY > 0 ? -1 : 1)))); }, { passive: false });
  svg.addEventListener('keydown', (e) => {
    const k = e.key, s = k === 'ArrowRight' || k === 'ArrowUp' ? step + 1 : k === 'ArrowLeft' || k === 'ArrowDown' ? step - 1 : k === 'Home' ? 0 : k === 'End' ? DIAL_STEPS : k === 'PageUp' ? step + 5 : k === 'PageDown' ? step - 5 : null;
    if (s == null) return;
    e.preventDefault();
    turn(Math.max(0, Math.min(DIAL_STEPS, s)));
  });
  return { el: box, set };
}

// ── the rack ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface RackHandlers {
  /** Set an hour's glass (whole contracts, signed by the hour's direction; 0 removes it). */
  glass(hour: number, contracts: number): void;
  select(hour: number | null): void;
}

/** Full scale of each half of a lane: 150 MW of schedule, and as many contracts (1 MWh each). */
const LANE_FULL = 150;

export function rackView(dir: readonly number[], on: RackHandlers) {
  const box = h('div', 'op-rackbox');
  const source = h('div', 'op-source', '<div class="op-chip" role="button" tabindex="-1" aria-label="Glass: drag onto an hour"></div><span>Drag glass onto an hour</span>');
  const rack = h('div', 'op-rack');
  rack.setAttribute('role', 'group'); rack.setAttribute('aria-label', 'The day’s 24 hours (Central time): glass on an hour hedges it');
  box.append(source, rack);
  const lanes = Array.from({ length: HOURS }, (_, hr) => {
    const n = hourName(hr);
    const lane = h('div', 'op-lane');
    lane.tabIndex = 0; lane.dataset.h = String(hr);
    lane.innerHTML = `<div class="hr">${String(hr).padStart(2, '0')}<small>${n.he}</small></div>`
      + '<div class="plot"><div class="sched"></div><div class="zero"></div><div class="cap" hidden></div><div class="lit" hidden></div><div class="tile" hidden></div></div><div class="q"></div>';
    rack.appendChild(lane);
    return {
      lane, sched: lane.querySelector<HTMLElement>('.sched')!, cap: lane.querySelector<HTMLElement>('.cap')!, tile: lane.querySelector<HTMLElement>('.tile')!,
      lit: lane.querySelector<HTMLElement>('.lit')!, q: lane.querySelector<HTMLElement>('.q')!,
    };
  });
  let last: { played: Played; plan: PlayerPlan; selected: number | null } | null = null;
  const capOf = (hr: number) => last?.played.caps[hr] ?? 0;
  const intentOf = (hr: number) => Math.abs(last?.plan.glass[hr] ?? 0);
  const defaultGlass = (hr: number) => Math.max(1, Math.round(capOf(hr) / 2));

  const set = (played: Played, plan: PlayerPlan, selected: number | null) => {
    last = { played, plan, selected };
    const half = 50; // % of the plot each side of the zero line
    lanes.forEach((L, hr) => {
      const d = dir[hr]!, kw = played.kw[hr]!, mw = Math.abs(kw) / 1000, cap = played.caps[hr]!, intent = Math.abs(plan.glass[hr] ?? 0), q = Math.abs(played.q[hr]!);
      const n = hourName(hr);
      L.lane.classList.toggle('idle', d === 0);
      L.lane.classList.toggle('sel', selected === hr);
      L.lane.setAttribute('aria-label', d === 0 ? `${n.clock} CT (${n.he}): the battery is idle; nothing to hedge`
        : `${n.clock} CT (${n.he}): the schedule ${kw > 0 ? 'discharges' : kw < 0 ? 'charges' : 'is idle at this dial'} ${mw.toFixed(1)} MWh; ${q ? `${kw > 0 ? 'sells' : 'buys'} ${q} contracts` : 'no glass'}, up to ${cap}`);
      const pct = (v: number) => `${(Math.min(LANE_FULL, v) / LANE_FULL) * half}%`;
      // the schedule's energy behind the glass, up for discharge and down for charge
      Object.assign(L.sched.style, kw >= 0 ? { bottom: '50%', top: 'auto', height: pct(mw) } : { top: '50%', bottom: 'auto', height: pct(mw) });
      L.sched.className = `sched ${kw > 0 ? 'dis' : kw < 0 ? 'chg' : ''}`;
      // the cap: the most glass the hour takes
      L.cap.hidden = d === 0 || cap === 0;
      if (!L.cap.hidden) Object.assign(L.cap.style, d > 0 ? { bottom: `calc(50% + ${pct(cap)})`, top: 'auto' } : { top: `calc(50% + ${pct(cap)})`, bottom: 'auto' });
      // the glass: its contracts that fit, and the light over what does not
      L.tile.hidden = q === 0;
      if (q) Object.assign(L.tile.style, d > 0 ? { bottom: '50%', top: 'auto', height: pct(q) } : { top: '50%', bottom: 'auto', height: pct(q) });
      const over = intent - q;
      L.lit.hidden = over <= 0;
      if (over > 0) Object.assign(L.lit.style, d > 0 ? { bottom: `calc(50% + ${pct(q)})`, top: 'auto', height: `max(3px, ${pct(over)})` } : { top: `calc(50% + ${pct(q)})`, bottom: 'auto', height: `max(3px, ${pct(over)})` });
      L.q.className = `q${over > 0 ? ' over' : ''}`;
      L.q.innerHTML = d === 0 ? '' : intent ? `${d > 0 ? '+' : '−'}${q}<small>${over > 0 ? `of ${intent}` : `cap ${cap}`}</small>` : `<small>cap ${cap}</small>`;
    });
  };

  // dragging the source chip onto a lane
  const chip = source.querySelector<HTMLElement>('.op-chip')!;
  const laneAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('.op-lane');
    return el && rack.contains(el) ? Number(el.dataset.h) : null;
  };
  chip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    chip.setPointerCapture(e.pointerId);
    const ghost = chip.cloneNode() as HTMLElement; ghost.classList.add('op-ghost'); ghost.removeAttribute('role');
    document.body.appendChild(ghost);
    let over: number | null = null;
    const move = (ev: PointerEvent) => {
      ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`;
      const hr = laneAt(ev.clientX, ev.clientY);
      const ok = hr != null && dir[hr] !== 0 && capOf(hr) > 0;
      lanes.forEach((L, i) => L.lane.classList.toggle('target', ok && i === hr));
      over = ok ? hr : null;
    };
    move(e);
    const up = () => {
      chip.removeEventListener('pointermove', move); chip.removeEventListener('pointerup', up); chip.removeEventListener('pointercancel', up);
      ghost.remove(); lanes.forEach((L) => L.lane.classList.remove('target'));
      if (over != null) { sound.glass(); on.glass(over, dir[over]! * (intentOf(over) || defaultGlass(over))); on.select(over); }
    };
    chip.addEventListener('pointermove', move); chip.addEventListener('pointerup', up); chip.addEventListener('pointercancel', up);
  });

  // a placed tile: drag along the lane to set its contracts; a click selects the hour
  rack.addEventListener('pointerdown', (e) => {
    const lane = (e.target as HTMLElement).closest<HTMLElement>('.op-lane');
    if (!lane) return;
    const hr = Number(lane.dataset.h), d = dir[hr]!;
    on.select(d === 0 ? null : hr);
    if (d === 0 || capOf(hr) === 0) return;
    lane.setPointerCapture(e.pointerId);
    const plot = lane.querySelector<HTMLElement>('.plot')!.getBoundingClientRect();
    const zeroY = plot.top + plot.height / 2, perContract = plot.height / 2 / LANE_FULL;
    const startOnTile = (e.target as HTMLElement).classList.contains('tile') || (e.target as HTMLElement).classList.contains('lit');
    const valueAt = (y: number) => Math.max(0, Math.min(capOf(hr), Math.round((d > 0 ? zeroY - y : y - zeroY) / perContract)));
    if (!startOnTile && intentOf(hr) === 0) { sound.glass(); on.glass(hr, d * Math.max(1, valueAt(e.clientY))); }
    // each contract more or less ticks
    const move = (ev: PointerEvent) => { const v = valueAt(ev.clientY); if (v !== intentOf(hr)) sound.tick(); on.glass(hr, d * v); };
    const up = () => { lane.removeEventListener('pointermove', move); lane.removeEventListener('pointerup', up); lane.removeEventListener('pointercancel', up); };
    lane.addEventListener('pointermove', move); lane.addEventListener('pointerup', up); lane.addEventListener('pointercancel', up);
  });
  rack.addEventListener('keydown', (e) => {
    const lane = (e.target as HTMLElement).closest<HTMLElement>('.op-lane');
    if (!lane) return;
    const hr = Number(lane.dataset.h), d = dir[hr]!;
    if (d === 0) return;
    const now = intentOf(hr), cap = capOf(hr);
    const k = e.key;
    const next = k === 'ArrowUp' ? now + 1 : k === 'ArrowDown' ? now - 1 : k === 'PageUp' ? now + 10 : k === 'PageDown' ? now - 10 : k === 'Home' ? 0 : k === 'End' ? cap
      : k === 'Delete' || k === 'Backspace' ? 0 : (k === 'Enter' || k === ' ') && now === 0 ? defaultGlass(hr) : null;
    if (next == null) return;
    e.preventDefault();
    on.select(hr);
    // up to the cap; glass already over it (the dial moved under it) can still come down
    const v = Math.max(0, Math.min(next < now ? now : cap, next));
    if (v !== now) { if (now === 0) sound.glass(); else sound.tick(); }
    on.glass(hr, d * v);
  });
  rack.addEventListener('focusin', (e) => { const lane = (e.target as HTMLElement).closest<HTMLElement>('.op-lane'); if (lane && dir[Number(lane.dataset.h)] !== 0) on.select(Number(lane.dataset.h)); });
  return { el: box, set };
}

/** The selected hour's line under the rack: its names, schedule, glass and cap, the entry, and one-tap amounts. */
export function detailView(f: Field, dir: readonly number[], on: RackHandlers) {
  const el = h('div', 'op-detail');
  pressing(el);
  const set = (played: Played, plan: PlayerPlan, hr: number | null) => {
    if (hr == null || dir[hr] === 0) { el.innerHTML = '<span class="grow">Pick an hour to set its glass: drag a tile’s edge, or use the arrow keys. Only hours where the battery moves energy take glass.</span>'; return; }
    const n = hourName(hr), d = dir[hr]!, kw = played.kw[hr]!, cap = played.caps[hr]!, q = Math.abs(played.q[hr]!), intent = Math.abs(plan.glass[hr] ?? 0);
    const verb = d > 0 ? 'sells' : 'buys', energy = kw === 0 ? 'the schedule is idle here' : `the schedule ${kw > 0 ? 'discharges' : 'charges'} <b class="op-num">${(Math.abs(kw) / 1000).toFixed(1)} MWh</b>`;
    el.innerHTML = `<span class="grow"><b>${n.clock} CT</b> (${n.he}) · ${energy} · glass ${verb} <b class="op-num">${q}</b>${intent > q ? ` of ${intent}` : ''}, up to <b class="op-num">${cap}</b> · entry <span class="op-num">${usdCents(f.entryCents[hr]!)}</span> (assumed)</span>`;
    for (const v of [10, 25, 50]) {
      const b = h('button', 'op-btn op-num', String(v)); b.type = 'button'; b.disabled = v > cap; b.setAttribute('aria-pressed', String(intent === v));
      b.title = `${verb} ${v}`; b.addEventListener('click', () => on.glass(hr, d * v)); el.appendChild(b);
    }
    const c = h('button', 'op-btn', `Cap <span class="op-num">${cap}</span>`); c.type = 'button'; c.disabled = cap === 0; c.setAttribute('aria-pressed', String(intent === cap && cap > 0));
    c.addEventListener('click', () => on.glass(hr, d * cap)); el.appendChild(c);
    const x = h('button', 'op-btn', `${ICON_X}Remove`); x.type = 'button'; x.disabled = intent === 0; x.addEventListener('click', () => on.glass(hr, 0)); el.appendChild(x);
  };
  return { el, set };
}

// ── the read-out ──────────────────────────────────────────────────────────────────────────────────────────────────

export function readoutView(f: Field) {
  const el = h('section', 'op-card op-read');
  el.setAttribute('aria-live', 'polite');
  const C = f.arms.C.objectiveUusd, A = f.arms.A.objectiveUusd;
  const marks: PlaneMark[] = (['A', 'B', 'C'] as const).map((a) => ({ arm: a, wt: -f.arms[a].cvarUusd / 1e6, mean: f.arms[a].expectedUusd / 1e6, score: f.arms[a].objectiveUusd / 1e6, state: a === 'C' ? 'sealed' : 'lit' }));
  // whether the last plan shown beat the planner: a plan that newly does chimes (the first one shown never does)
  let ahead: boolean | null = null;
  const set = (p: Played, dot: { wt: number; mean: number }) => {
    const s = p.score, diff = s.objective - C;
    const cents = Math.round(diff / 10000);
    if (cents > 0 && ahead === false) sound.chime();
    ahead = cents > 0;
    const verdict = cents > 0 ? `You beat the planner by ${usd(diff)}` : cents === 0 ? 'Level with the planner' : `${usd(-diff)} behind the planner`;
    const progress = (s.objective - A) / (C - A);
    el.innerHTML = `<div class="op-h"><h3>Your plan</h3><small>${f.n} price scenarios</small></div>
      <div class="op-score"><div><div class="label">Score</div><div class="big">${usd(s.objective)}</div></div>
        <div class="label" style="text-align:right">mean − 0.5 × the worst<br>tenth’s average loss</div></div>
      <dl class="op-rows">
        <dt>Mean day</dt><dd class="${s.mean < 0 ? 'neg' : ''}">${usd(s.mean)}</dd>
        <dt>Worst tenth, on average</dt><dd class="${-s.cvar < 0 ? 'neg' : ''}">${usd(-s.cvar)}</dd>
        <dt>Days that lose money</dt><dd>${s.losing} of ${f.n}</dd>
        <dt>Worst day</dt><dd class="${s.worst < 0 ? 'neg' : ''}">${usd(s.worst)}</dd>
        <dt>Collateral</dt><dd>${usdCents(s.collateralCents)}</dd>
      </dl>
      <div class="op-plane" role="img" aria-label="Risk and return: the three solved plans and yours">${planeSvg(560, 400, marks, dot, true, 'opp', 'deck')}</div>
      <div class="op-beat ${cents > 0 ? 'ahead' : cents === 0 ? 'level' : 'behind'}">
        <div class="line"><span>The sealed plan (C)</span><b>${usd(C)}</b></div>
        <div class="line"><span>Yours</span><b>${usd(s.objective)}</b></div>
        <div class="verdict">${verdict}</div>
        <div class="op-bar" title="From no hedge (A) to the sealed plan’s score (C)"><i style="width:${Math.max(0, Math.min(100, progress * 100)).toFixed(1)}%"></i><em style="left:calc(${(100 / Math.max(1, progress)).toFixed(2)}% - 1px)"></em></div>
        <div class="line" style="margin-top:6px"><span>From no hedge to the sealed plan</span><b>${(progress * 100).toFixed(1)}%</b></div>
      </div>`;
  };
  return { el, set };
}

// ── the seal panel ────────────────────────────────────────────────────────────────────────────────────────────────

export type SealPanelState =
  | { kind: 'idle' }
  | { kind: 'busy'; step: SealStep; tx?: string }
  | { kind: 'error'; message: string; code: string }
  | { kind: 'sealed'; receipt: SealReceipt };

const STEPS: [SealStep, string][] = [['connect', 'Connect your wallet'], ['network', `Switch to ${BSC_TESTNET.name}`], ['gate', 'Check the gate'], ['record', 'Check for a record already sealed'], ['sign', 'Sign the commit in your wallet'], ['confirm', 'Wait for the block']];

export function sealView(f: Field, onSeal: () => void, onDownload: (r: SealReceipt) => void, recordHref?: string) {
  const el = h('section', 'op-card op-seal');
  pressing(el);
  const both = (t: { ct: string; yours: string | null }) => `${t.ct}${t.yours ? ` · ${t.yours}` : ''}`;
  // the state last shown: a seal read back from the chain stamps once, as the panel turns to it
  let shown: SealPanelState['kind'] | null = null;
  const set = (o: { played: Played; now: number; wallet: boolean; state: SealPanelState }) => {
    const gate = gateUnix(f.operatingDay), open = o.now < gate, st = o.state;
    if (st.kind === 'sealed' && shown !== null && shown !== 'sealed') sound.stamp();
    shown = st.kind;
    const [y, m, dd] = f.operatingDay.split('-').map(Number) as [number, number, number];
    const day = new Date(Date.UTC(y, m - 1, dd)).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    if (!open && st.kind !== 'sealed' && st.kind !== 'busy') {
      // The field's gate has passed: the card says what was sealed for it and where the record is. No button: a seal
      // opens on a field whose gate is still ahead.
      const at = dualClock(f.record.sealedUnix, { seconds: true });
      el.dataset.state = 'past';
      el.innerHTML = `<div class="op-h"><h3><span class="ring"></span>Sealed before the gate</h3><small>BNB Chain</small></div>
        <p class="state">${esc(f.name)}'s plan for ${day}, plan C, was sealed at <b>${at.ct}</b>${at.yours ? ` (${at.yours})` : ''},
        <b class="op-num">${(f.record.gateUnix - f.record.sealedUnix).toLocaleString('en-US')} s</b> before the gate. Your score is measured against it.</p>
        ${recordHref ? `<a class="op-link" href="${esc(recordHref)}">See the record on Seal</a>` : ''}`;
      return;
    }
    const sealable = open && !o.played.lit && o.played.limits.length === 0;
    el.dataset.state = st.kind === 'sealed' ? 'sealed' : sealable ? 'ready' : 'dark';
    let state: string;
    {
      const left = Math.max(0, gate - o.now), hh = Math.floor(left / 3600), mm = Math.floor((left % 3600) / 60);
      state = `Seals for ${day} before its gate, <b>${both(dualClock(gate, { weekday: true }))}</b>: <b class="op-num">${hh ? `${hh} h ` : ''}${mm} min</b> left.`;
    }
    if (open && o.played.lit) state += ' Light on: some glass is not delivered by the schedule; fit it first.';
    let body = '';
    if (st.kind === 'busy') {
      const at = STEPS.findIndex(([s]) => s === st.step);
      body = `<ol class="op-steps">${STEPS.map(([s, t], i) => `<li class="${i < at ? 'done' : i === at ? 'now' : ''}">${t}${s === 'confirm' && st.tx ? ` · <span class="op-num">${st.tx.slice(0, 10)}…</span>` : ''}</li>`).join('')}</ol>`;
    } else if (st.kind === 'error') {
      body = `<p class="op-err">${esc(st.message)}</p>`;
    } else if (st.kind === 'sealed') {
      const r = st.receipt;
      body = `<dl class="op-receipt">
        <dt>Transaction</dt><dd><a href="${r.txUrl}" target="_blank" rel="noopener">${r.txHash.slice(0, 18)}…${r.txHash.slice(-6)}</a></dd>
        <dt>Block</dt><dd>${r.blockNumber.toLocaleString('en-US')} · ${both(dualClock(r.blockTime, { seconds: true }))}</dd>
        <dt>Before the gate</dt><dd>${r.secondsBeforeGate.toLocaleString('en-US')} s</dd>
        <dt>Record key</dt><dd>${r.key}</dd>
        <dt>Root (the leaf)</dt><dd>${r.record.root}</dd>
        <dt>Scope</dt><dd>${esc(r.record.scopeLabel)}</dd></dl>
        <p class="op-note">Keep your plan’s leaf: anyone can hash it to the root on chain.</p>`;
    }
    if (!o.wallet && st.kind !== 'sealed') {
      body += `<div class="op-help">No browser wallet on this page. To seal, add ${BSC_TESTNET.name} to a wallet such as MetaMask or Rabby:
        <dl><dt>Network</dt><dd>${BSC_TESTNET.name}</dd><dt>Chain ID</dt><dd>97</dd><dt>Currency</dt><dd>${BSC_TESTNET.currency.symbol}</dd>
        <dt>RPC</dt><dd class="op-code">${BSC_TESTNET.rpcUrls[0]}</dd><dt>Explorer</dt><dd class="op-code">${BSC_TESTNET.explorer}</dd></dl>
        Then get test BNB from the <a href="${BSC_TESTNET.faucet}" target="_blank" rel="noopener">BNB Chain testnet faucet</a>. Test BNB has no value; this page never asks for a key.</div>`;
    }
    const label = st.kind === 'sealed' ? 'Sealed' : st.kind === 'busy' ? 'Sealing…' : 'Seal my plan';
    el.innerHTML = `<div class="op-h"><h3><span class="ring"></span>Seal my plan</h3><small>${BSC_TESTNET.name} · arena scope</small></div>
      <p class="state">${state}</p>
      <button type="button" class="op-btn go">${label}</button>${body}
      ${st.kind === 'sealed' ? '<button type="button" class="op-btn dl" style="margin-top:10px">Download the leaf (JSON)</button>' : ''}`;
    const go = el.querySelector<HTMLButtonElement>('.go')!;
    go.disabled = !sealable || st.kind === 'busy' || st.kind === 'sealed';
    go.addEventListener('click', onSeal);
    if (st.kind === 'sealed') el.querySelector<HTMLButtonElement>('.dl')!.addEventListener('click', () => onDownload(st.receipt));
  };
  return { el, set };
}

// ── the starting plans and the light ──────────────────────────────────────────────────────────────────────────────

export function startsView(onArm: (a: ArmId) => void, onClear: () => void) {
  const el = h('div', 'op-starts');
  pressing(el);
  el.innerHTML = '<span>Start from</span>';
  for (const a of ['A', 'B', 'C'] as const) {
    const b = h('button', 'op-btn', `<i class="sw" style="background:${ARM_COLOR[a]}"></i>${ARM_NAME[a]} (${a})`); b.type = 'button'; b.dataset.arm = a;
    b.addEventListener('click', () => onArm(a)); el.appendChild(b);
  }
  const c = h('button', 'op-btn', `${ICON_X}Clear the glass`); c.type = 'button'; c.addEventListener('click', onClear); el.appendChild(c);
  const set = (current: ArmId | null) => el.querySelectorAll<HTMLButtonElement>('[data-arm]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.arm === current)));
  return { el, set };
}

export function lightView(onFit: () => void) {
  const el = h('div', 'op-light');
  pressing(el);
  el.hidden = true;
  const set = (p: Played, plan: PlayerPlan) => {
    if (!p.lit) { el.hidden = true; return; }
    const hours = plan.glass.map((g, hr) => ({ hr, g: Math.abs(g), q: Math.abs(p.q[hr]!), mw: Math.abs(p.kw[hr]!) / 1000 })).filter((x) => x.g > x.q);
    const first = hours[0]!, n = hourName(first.hr);
    el.hidden = false;
    el.innerHTML = `<span>Light on: hedged, not delivered. ${n.clock} CT (${n.he}) has glass for ${first.g} contracts and the schedule moves ${first.mw.toFixed(1)} MWh${hours.length > 1 ? `, and ${hours.length - 1} more hour${hours.length > 2 ? 's' : ''}` : ''}. The score counts the glass that fits.</span>`;
    const b = h('button', 'op-btn', 'Fit the glass'); b.type = 'button'; b.addEventListener('click', onFit); el.appendChild(b);
  };
  return { el, set };
}
