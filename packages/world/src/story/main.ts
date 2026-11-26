// story.html's entry. ?mode=site (the default) plays the story in the window as the site would mount it;
// ?mode=capture&cut=master|90s&w=1920&h=1080[&captions=film|frame|none] holds the film for the video pipeline:
//
//   window.__gpClock(t, dt?)  poses the film at t seconds; window.__ready is false until that frame has settled
//   window.__gpStory          the film's keys, rows and seconds, and the shots the proof renders (rests, mid-legs)
//   window.__gpPlay(t0, t1)   plays t0..t1 in real time on the animation frame (frames built first) and returns the
//                             frame intervals and each render's CPU and GPU time, for the frame-time measurement
//
// Math.random is seeded before any module runs (story.html), as the frame lab seeds it.
import { mountStory, type StoryHandle } from './mount';
import { keyDef } from './clock';
import type { CutId } from './beats';
import type { Captions } from './player';

declare global {
  interface Window {
    __ready?: boolean; __error?: string;
    __gpClock?: (t: number, dt?: number) => Promise<unknown>;
    __gpStory?: unknown;
    __gpPlay?: (t0: number, t1: number, o?: { gpu?: boolean }) => Promise<unknown>;
    __gpInfo?: () => unknown;
    __gpHandle?: StoryHandle;
  }
}

const q = new URLSearchParams(location.search);
const mode = q.get('mode') === 'capture' ? 'capture' : 'site';
const cut: CutId = q.get('cut') === '90s' ? '90s' : 'master';
const cap = q.get('captions');
const captions: Captions | undefined = cap === 'frame' || cap === 'film' || cap === 'none' ? cap : undefined;
const host = document.getElementById('story')!;
const html = document.documentElement;
html.dataset.skin = 'wattness'; html.dataset.theme = 'dark';

const fail = (e: unknown) => {
  const text = e instanceof Error ? (e.stack ?? e.message) : String(e);
  window.__error = text;
  const pre = document.createElement('pre'); pre.className = 'gp-error'; pre.textContent = text; document.body.appendChild(pre);
  console.error(e);
};

if (mode === 'capture') {
  const W = Math.round(Number(q.get('w')) || 1920), H = Math.round(Number(q.get('h')) || 1080);
  Object.assign(host.style, { position: 'absolute', left: '0', top: '0', width: `${W}px`, height: `${H}px` });
  const h = mountStory(host, { mode: 'capture', cut, captions, startBeat: Number(q.get('t')) || 0 });
  window.__gpHandle = h;
  h.on('error', (p) => console.warn('story:', JSON.stringify(p).slice(0, 400)));
  h.ready.then(() => {
    const P = h.player!;
    const F = P.film;
    // the proof's shots: every key at rest, and two moments inside each part's legs (a third and two thirds through
    // its longest leg, and the middle of the leg after it)
    // each rest once its plates are in and before they go (player.ts picture: in over 0.2..0.65 s, out over the last 0.35 s)
    const restAt = (at: number, until: number) => { const span = until - at; return +(span >= 0.95 ? at + Math.min(1.4, span - 0.36) : at + span / 2).toFixed(3); };
    const rests = F.keys.map((k, i) => ({ id: `${String(i + 1).padStart(2, '0')}-${k.key}-rest`, t: restAt(k.at, k.until), key: k.key, part: keyDef(k.key).part, stop: keyDef(k.key).stop !== false }));
    const legs = F.keys.map((k, i) => (i === 0 ? null : { i, key: k.key, part: keyDef(k.key).part, from: F.keys[i - 1]!.until, to: k.at })).filter((x): x is NonNullable<typeof x> => !!x && x.to - x.from > 0.5);
    const mids: { id: string; t: number; key: string; part: string }[] = [];
    for (const part of ['I', 'II', 'III', 'IV']) {
      const ls = legs.filter((l) => l.part === part).sort((a, b) => (b.to - b.from) - (a.to - a.from));
      const a = ls[0], b = ls[1] ?? ls[0];
      if (a) mids.push({ id: `part-${part}-mid-1-${a.key}`, t: +(a.from + (a.to - a.from) * 0.4).toFixed(3), key: a.key, part });
      if (b) mids.push({ id: `part-${part}-mid-2-${b.key}`, t: +(b.from + (b.to - b.from) * (b === a ? 0.75 : 0.55)).toFixed(3), key: b.key, part });
    }
    window.__gpStory = { cut: F.cut, seconds: F.seconds, keys: F.keys.map((k) => ({ ...k, frame: keyDef(k.key).frame, stop: keyDef(k.key).stop !== false })), rows: F.rows, shots: { rests, mids } };
    window.__gpInfo = () => P.info();
    let pending: Promise<unknown> = Promise.resolve();
    window.__gpClock = (t: number, dt = 0) => {
      window.__ready = false;
      pending = pending.then(() => h.seek(t, dt)).then(() => { window.__ready = true; return { t, where: P.last?.where ?? null, frames: P.last?.draws.map((d) => ({ id: d.inst.id, local: +d.local.toFixed(4), alpha: +d.alpha.toFixed(4) })) ?? [] }; },
        (e) => { fail(e); window.__ready = true; return { t, error: String(e) }; });
      return pending;
    };
    window.__gpPlay = async (t0: number, t1: number, o = {}) => {
      // every frame the range needs built first (seek() would let the far ones go), each picture drawn once (programs
      // and uploads), so the timing is the drawing alone
      const frames = new Set<string>();
      for (let t = t0; t <= t1 + 1e-6; t += 0.1) for (const f of P.framesNear(t, 0).need) frames.add(f);
      for (const f of frames) { try { await P.ensure(f); } catch { /* recorded in errors */ } }
      for (let t = t0; t <= t1 + 1e-6; t += 0.25) { const pic = P.picture(t); if (pic) P.render(pic, 0); }
      P.stage.renderer.getContext().finish();
      // the cost: each frame of the range at 30 a second drawn and waited for (gl.finish), one at a time
      const cost: number[] = [];
      for (let t = t0; t <= t1 + 1e-6; t += 1 / 30) {
        const pic = P.picture(t); if (!pic) continue;
        const c0 = performance.now(); P.render(pic, 0); P.stage.renderer.getContext().finish(); cost.push(performance.now() - c0);
      }
      // the pace: the range played in real time on the animation frame (capped, should the frames stop coming)
      P.measureGpu = !!o.gpu;
      P.timings.cpu.length = 0; P.timings.gpu.length = 0;
      const intervals: number[] = [];
      let misses = 0, capped = false;
      await new Promise<void>((done) => {
        let start = -1, prev = -1, over = false;
        const cap = setTimeout(() => { over = true; capped = true; done(); }, (t1 - t0 + 15) * 1000);
        const loop = (now: number) => {
          if (over) return;
          if (start < 0) start = now; else intervals.push(now - prev);
          prev = now;
          const t = t0 + (now - start) / 1000;
          if (t > t1) { clearTimeout(cap); done(); return; }
          const pic = P.picture(t);
          if (pic) { P.syncLine(t); P.render(pic, 0); } else misses++;
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
      P.measureGpu = false;
      const stats = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return { n: s.length, mean: +(s.reduce((a, b) => a + b, 0) / Math.max(1, s.length)).toFixed(2), p50: +(s[Math.floor(s.length * 0.5)] ?? 0).toFixed(2), p95: +(s[Math.floor(s.length * 0.95)] ?? 0).toFixed(2), max: +(s[s.length - 1] ?? 0).toFixed(2) }; };
      return { t0, t1, frames: [...frames], cost: stats(cost), misses, capped, intervals: stats(intervals), cpu: stats(P.timings.cpu), gpu: o.gpu ? stats(P.timings.gpu) : null, gpuName: P.stage.gpu(),
        size: { w: P.stage.renderer.domElement.width, h: P.stage.renderer.domElement.height }, info: P.stage.frameInfo };
    };
    window.__ready = true;
  }, fail);
} else {
  Object.assign(host.style, { position: 'fixed', inset: '0' });
  const h = mountStory(host, {
    mode: 'site', startBeat: /^\d+$/.test(q.get('beat') ?? '') ? Number(q.get('beat')) : q.get('beat') ?? 0,
    onRoute: (tab) => { const n = document.createElement('p'); n.className = 'gp-toast'; n.textContent = `onRoute("${tab}")`; document.body.appendChild(n); setTimeout(() => n.remove(), 1800); },
  });
  window.__gpHandle = h;
  h.ready.then(() => { window.__ready = true; }, fail);
  h.on('error', (p) => console.warn('story:', JSON.stringify(p).slice(0, 400)));
}
