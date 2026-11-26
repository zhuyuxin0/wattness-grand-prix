// Sound, opt-in. Off until the visitor turns it on (the Sound toggle in the site's introduction and on ONE PLAN), and
// remembered in this browser. Every cue is synthesized here in Web Audio, from oscillators, filters and one second of
// noise, so there is no file to fetch. The AudioContext is made only inside a click or a key press: the toggle's own,
// or, for a visitor who turned sound on in an earlier visit, their first click or key on this page (or one already
// made on it before this module loaded). Until then, and whenever sound is off or the tab is hidden, a cue does
// nothing and costs nothing. A capture never clicks, so the films' frames are silent here; their sound is the edit's.
//
// The cues: coin (coins land in the tray, a dozen a second at most), tick (a dial detent, a contract more or less),
// glass (glass set on an hour), press (a button), chime (a plan passes the planner's score), stamp (a plan sealed on
// chain), fail (a changed copy fails its check) and chord (the closing card). Each is a few nodes that let go of
// themselves when they end, through one master gain at -18 dB and a soft limiter.

/** The stored choice: 'on' or 'off' (nothing stored is off). */
export const SOUND_KEY = 'gp.sound';
/** The master gain: -18 dB. */
const MASTER = 0.126;
/** The shortest gap between two of a cue, in seconds: the coins' dozen a second, a detent's ratchet. */
const GAP = { coin: 1 / 12, tick: 1 / 30, glass: 0.06, press: 0.04, chime: 1.5, stamp: 1.0, fail: 1.0, chord: 4.0 } as const;
type Cue = keyof typeof GAP;

interface Runtime {
  on: boolean;
  ctx: AudioContext | null;
  out: AudioNode | null;
  noise: AudioBuffer | null;
  subs: Set<() => void>;
  last: Partial<Record<Cue, number>>;
  listening: boolean;
}

const stored = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
};
const store = (on: boolean) => {
  try {
    globalThis.localStorage?.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // storage blocked: the choice holds for this page
  }
};

// one runtime per page, however many copies of this module a page has loaded (a bundle's chunks, a dev server's reload)
const RUNTIME = Symbol.for('gatelock.world.sound');
const shared = globalThis as typeof globalThis & { [RUNTIME]?: Runtime };
const R: Runtime = shared[RUNTIME] ?? (shared[RUNTIME] = { on: stored(), ctx: null, out: null, noise: null, subs: new Set(), last: {}, listening: false });

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

type Activation = { isActive: boolean; hasBeenActive: boolean };
const activation = (): Activation | undefined => (globalThis.navigator as (Navigator & { userActivation?: Activation }) | undefined)?.userActivation;
/** Whether the page is inside a click or a key press now (a browser that cannot say is trusted to be: every caller
 *  is one). Escape, a wheel or a scroll grant none. */
const activeNow = () => activation()?.isActive ?? true;

/** Makes the context and its master chain. Called only from a click or a key press (or once one has been made). */
function make(): boolean {
  if (R.ctx) return true;
  if (!activeNow() && !activation()?.hasBeenActive) return false;
  const g = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return false;
  try {
    const ctx = new Ctor({ latencyHint: 'interactive' });
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -8; limit.knee.value = 6; limit.ratio.value = 12; limit.attack.value = 0.003; limit.release.value = 0.15;
    const out = ctx.createGain();
    out.gain.value = MASTER;
    out.connect(limit).connect(ctx.destination);
    // one second of white noise for every transient, read from a random offset
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    R.ctx = ctx; R.out = out; R.noise = noise;
    return true;
  } catch {
    return false;
  }
}

/** Resumes the context when sound is on and the tab is shown; resolves once it runs (or at once if it cannot). */
function wake(): Promise<void> {
  const c = R.ctx;
  if (!R.on || !c || hidden() || c.state === 'running') return Promise.resolve();
  return c.resume().catch(() => undefined);
}

/** The page's own clicks and keys: a remembered "on" starts the context at the first one, and a context the browser
 *  paused is resumed by the next. A click or key on the switch itself ([data-sound-switch]) is left to setSound, so the
 *  click that turns sound off makes no audio. The tab hidden pauses it; shown again, it resumes. */
function listen() {
  if (R.listening || typeof document === 'undefined') return;
  R.listening = true;
  const gesture = (e?: Event) => {
    const el = e?.target as Element | null | undefined;
    if (typeof el?.closest === 'function' && el.closest('[data-sound-switch]')) return;
    if (R.on && activeNow() && make()) void wake();
  };
  for (const type of ['pointerdown', 'pointerup', 'keydown', 'touchend', 'click']) document.addEventListener(type, gesture, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (hidden()) { if (R.ctx?.state === 'running') R.ctx.suspend().catch(() => undefined); }
    else void wake();
  });
}

/** Whether sound is on (the visitor's choice; nothing stored is off). */
export function soundOn(): boolean {
  return R.on;
}

/** Turns sound on or off, and remembers it. Call it from the click that asks for it: turning it on makes the context
 *  there, and a soft tink says it is on. */
export function setSound(on: boolean): void {
  if (on === R.on) return;
  R.on = on;
  store(on);
  if (on) {
    listen();
    if (make()) void wake().then(() => glass());
  } else if (R.ctx?.state === 'running') R.ctx.suspend().catch(() => undefined);
  for (const fn of [...R.subs]) fn();
}

/** Calls fn whenever the choice changes (React's useSyncExternalStore); returns its unsubscribe. */
export function onSoundChange(fn: () => void): () => void {
  R.subs.add(fn);
  return () => { R.subs.delete(fn); };
}

// a remembered "on": wait for the visitor's first click or key, or take one this page has already had (the click that
// opened the introduction, before this module was loaded)
if (R.on) {
  listen();
  if (activation()?.hasBeenActive && make()) void wake();
}

// ── the cues ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** The context's time for a cue that may sound now, or null: sound off, no context running, the tab hidden, or the
 *  same cue too soon after the last. */
function slot(cue: Cue): number | null {
  const c = R.ctx;
  if (!R.on || !c || !R.out || c.state !== 'running' || hidden()) return null;
  const t = c.currentTime;
  const last = R.last[cue];
  if (last != null && t - last < GAP[cue]) return null;
  R.last[cue] = t;
  return t + 0.004;
}

/** A gain from silence to peak over attack, then down to silence over decay (exponential, as struck things fall). */
function envelope(c: AudioContext, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

/** Where a cue sits left to right (-1 to 1), where the browser can place it; the node goes when the cue's longest
 *  tone has ended (its onEnd). */
function placed(c: AudioContext, pan: number): { out: AudioNode; done?: () => void } {
  if (!pan || typeof c.createStereoPanner !== 'function') return { out: R.out! };
  const p = c.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(R.out!);
  return { out: p, done: () => p.disconnect() };
}

interface Tone {
  type?: OscillatorType; f: number; to?: number; peak: number; attack?: number; decay: number; at?: number;
  via?: BiquadFilterNode; onEnd?: () => void;
}
function tone(c: AudioContext, t: number, out: AudioNode, o: Tone) {
  const start = t + (o.at ?? 0), attack = o.attack ?? 0.002, end = start + attack + o.decay;
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, start);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, end);
  const g = envelope(c, start, o.peak, attack, o.decay);
  if (o.via) osc.connect(o.via).connect(g); else osc.connect(g);
  g.connect(out);
  osc.onended = () => { osc.disconnect(); g.disconnect(); o.via?.disconnect(); o.onEnd?.(); };
  osc.start(start);
  osc.stop(end + 0.02);
}

interface Burst { type: BiquadFilterType; f: number; q?: number; peak: number; decay: number; at?: number }
function burst(c: AudioContext, t: number, out: AudioNode, o: Burst) {
  const buf = R.noise!, start = t + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = o.type; f.frequency.value = o.f; f.Q.value = o.q ?? 0.8;
  const g = envelope(c, start, o.peak, 0.001, o.decay);
  src.connect(f).connect(g).connect(out);
  src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  src.start(start, Math.random() * (buf.duration - o.decay - 0.05), o.decay + 0.04);
}

const lowpass = (c: AudioContext, f: number, q = 0.7) => { const b = c.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; b.Q.value = q; return b; };
const jitter = (k: number) => 1 + (Math.random() * 2 - 1) * k;

/** Coins landing on their stacks: one bright clink with a coin's inharmonic partials, its pitch a little different
 *  each time, a little to one side; n landing at once rings a touch louder. */
export function coin(n = 1): void {
  const t = slot('coin'); if (t == null) return;
  const c = R.ctx!, { out, done } = placed(c, (Math.random() * 2 - 1) * 0.35), f = 3100 * jitter(0.12), k = Math.min(1.4, 0.8 + 0.1 * n);
  burst(c, t, out, { type: 'highpass', f: 5200, peak: 0.16 * k, decay: 0.006 });
  ([[1, 0.5, 0.11], [1.47, 0.34, 0.08], [2.09, 0.2, 0.06], [2.56, 0.1, 0.045]] as const).forEach(([r, peak, decay], i) =>
    tone(c, t, out, { f: f * r, peak: peak * k, attack: 0.0015, decay, onEnd: i === 0 ? done : undefined }));
}

/** A detent of the schedule dial, or a contract more or less on an hour: a short, dry tk. */
export function tick(): void {
  const t = slot('tick'); if (t == null) return;
  const c = R.ctx!, out = R.out!;
  burst(c, t, out, { type: 'bandpass', f: 3200 * jitter(0.05), q: 1.5, peak: 0.5, decay: 0.004 });
  tone(c, t, out, { f: 1400, peak: 0.12, attack: 0.001, decay: 0.018 });
}

/** Glass set on an hour: a small tink of two partials. Also what turning sound on sounds like. */
export function glass(): void {
  const t = slot('glass'); if (t == null) return;
  const c = R.ctx!, out = R.out!, f = 1568 * jitter(0.02);
  tone(c, t, out, { f, peak: 0.16, decay: 0.35 });
  tone(c, t, out, { f: f * 1.498, peak: 0.08, decay: 0.25 });
  burst(c, t, out, { type: 'highpass', f: 4000, peak: 0.1, decay: 0.003 });
}

/** A button: its click and the thump of its travel. */
export function press(): void {
  const t = slot('press'); if (t == null) return;
  const c = R.ctx!, out = R.out!;
  burst(c, t, out, { type: 'bandpass', f: 2500, q: 0.9, peak: 0.45, decay: 0.004 });
  tone(c, t, out, { f: 160, to: 70, peak: 0.55, attack: 0.002, decay: 0.09 });
}

/** A plan passes the planner's score: four plucks up an E major arpeggio. */
export function chime(): void {
  const t = slot('chime'); if (t == null) return;
  const c = R.ctx!, out = R.out!;
  [659.25, 830.61, 987.77, 1318.51].forEach((f, i) => {
    tone(c, t, out, { type: 'triangle', f, peak: 0.12, attack: 0.003, decay: 0.5, at: i * 0.07 });
    tone(c, t, out, { f: f * 2, peak: 0.04, attack: 0.003, decay: 0.3, at: i * 0.07 });
  });
}

/** A plan sealed on chain: a stamp's knock and thud, then a faint ring of gold. */
export function stamp(): void {
  const t = slot('stamp'); if (t == null) return;
  const c = R.ctx!, out = R.out!;
  burst(c, t, out, { type: 'lowpass', f: 1800, q: 0.7, peak: 0.7, decay: 0.012 });
  tone(c, t, out, { f: 120, to: 45, peak: 0.9, attack: 0.003, decay: 0.32 });
  tone(c, t, out, { type: 'triangle', f: 240, to: 180, peak: 0.25, attack: 0.002, decay: 0.07 });
  ([[1318.51, 0.05, 1.3], [1975.53, 0.035, 1.0], [2637.02, 0.02, 0.8]] as const).forEach(([f, peak, decay]) => tone(c, t, out, { f, peak, attack: 0.01, decay, at: 0.05 }));
}

/** A changed copy fails its check: two low buzzes, two detuned saws through a low-pass. */
export function fail(): void {
  const t = slot('fail'); if (t == null) return;
  const c = R.ctx!, out = R.out!;
  for (const at of [0, 0.22]) for (const f of [92, 97]) tone(c, t, out, { type: 'sawtooth', f, peak: 0.2, attack: 0.01, decay: 0.17, at, via: lowpass(c, 700, 1) });
}

/** The closing card: a soft chord (C major with the seventh and ninth), strummed and let ring. */
export function chord(): void {
  const t = slot('chord'); if (t == null) return;
  const c = R.ctx!, out = R.out!;
  ([[130.81, 0.07], [196.0, 0.07], [246.94, 0.06], [329.63, 0.06], [587.33, 0.04]] as const).forEach(([f, peak], i) =>
    tone(c, t, out, { type: 'triangle', f, peak, attack: 0.35, decay: 3.2, at: i * 0.045, via: lowpass(c, 1800) }));
}
