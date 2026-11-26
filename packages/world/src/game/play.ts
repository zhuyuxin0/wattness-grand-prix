// The game on its own page, for play and for stills: src/game/play.html?mode=play|story&theme=dark|light
//   [&w=1920&h=1080] the page's size for a still (the story mode fills it; play mode is w wide)
//   [&arm=A|B|C] or [&dial=0..20][&glass=17:95,5:14,...] the plan (hour index 0..23 : signed contracts)
//   [&select=17] an hour picked on the rack   [&still=1] one frame, no animation   [&now=<unix s>] the gate's clock
//   [&cam=x,y,z,az,el,dist,vfov,sx,sy] the camera (the story player frames its own)
// Sets window.__ready (or window.__error) once the first frame is drawn, as the frame lab does.
import { mountOnePlan, armPlan, type PlayerPlan } from './index';

declare global { interface Window { __ready?: boolean; __error?: string; __game?: unknown } }

const q = new URLSearchParams(location.search);
const mode = q.get('mode') === 'story' ? 'story' : 'play';
const theme = q.get('theme') === 'light' ? 'light' : 'dark';
const W = Number(q.get('w')) || 0, H = Number(q.get('h')) || 0;
const still = q.get('still') === '1';
document.documentElement.dataset.theme = theme;
const main = document.getElementById('game')!;
Object.assign(document.body.style, { margin: '0', background: theme === 'light' ? '#f3f4f6' : '#101315', color: theme === 'light' ? '#1a1a1a' : '#e6e8ea' });
if (mode === 'story') Object.assign(main.style, { position: 'relative', width: W ? `${W}px` : '100vw', height: H ? `${H}px` : '100vh' });
else Object.assign(main.style, { width: W ? `${W - 64}px` : 'min(1400px, calc(100vw - 48px))', margin: '24px auto', padding: '0' });

const handle = mountOnePlan(main, {
  mode, theme, still, dpr: Number(q.get('dpr')) || undefined,
  now: q.get('now') ? () => Number(q.get('now')) : undefined,
  camera: q.get('cam') ? (() => { const c = q.get('cam')!.split(',').map(Number); return { target: [c[0]!, c[1]!, c[2]!] as [number, number, number], az: c[3]!, el: c[4]!, dist: c[5]!, vfov: c[6]!, shift: [c[7] ?? 0, c[8] ?? 0] as [number, number] }; })() : undefined,
  onSeal: (r) => console.log('sealed', r.txHash),
});
window.__game = handle;

handle.ready.then(() => {
  const F = handle.field();
  let plan: PlayerPlan | null = null;
  const arm = q.get('arm');
  if (arm === 'A' || arm === 'B' || arm === 'C') plan = armPlan(F, arm);
  if (q.has('dial') || q.has('glass')) {
    const glass = new Array(24).fill(0);
    for (const part of (q.get('glass') ?? '').split(',').filter(Boolean)) { const [h, v] = part.split(':').map(Number); glass[h!] = v; }
    plan = { step: Number(q.get('dial') ?? plan?.step ?? 0), glass: q.has('glass') ? glass : plan?.glass ?? glass };
  }
  if (plan) handle.setPlan(plan, { animate: !still });
  if (q.has('select')) handle.select(Number(q.get('select')));
  handle.render();
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__ready = true; }));
}).catch((e) => { window.__error = String(e?.stack ?? e); console.error(e); });
