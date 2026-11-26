// @ts-nocheck
// brain.interface: Living Brain's own interface, as recorded (capture-interface.mjs beside this file): the Grand Prix
// brain's Explore view turning, then Battery Tab hovered, its connections lighting and its card. The recording is a
// JPEG sequence with a manifest, kept out of git (storyboard/interface/frames/, as films and PNG sequences are); this
// frame draws the picture for its local time on a canvas in its overlay, so the film stays a function of t. Labeled
// as Living Brain's own interface, with the time it was recorded.
import type { FrameContext, FrameHandle } from '../types';

// (Vite rewrites this URL without its trailing slash: add it back)
const BASE = new URL('../../../storyboard/interface/frames/', import.meta.url).href.replace(/\/?$/, '/');
// the recording's manifest, when this checkout has the recording (no fetch: the bundler resolves it, or finds none)
const manifests = import.meta.glob<Manifest>('../../../storyboard/interface/frames/manifest.json', { import: 'default' });
/** Whether this checkout holds the recording (index.ts draws a stand-in without it, never a black frame). */
export const HAS_RECORDING = Object.keys(manifests).length > 0;

interface Manifest { fps: number; frames: number; width: number; height: number; recorded: { ct: string; bangkok: string }; files: string[]; note?: string }

export async function interfaceFrame(ctx: FrameContext): Promise<FrameHandle> {
  const st = ctx.stage;
  st.setBackdrop({ top: '#000000', horizon: '#000000', bottom: '#000000', glow: '#000000', ground: '#000000' });
  st.ground.visible = false; st.catcher.visible = false;
  st.setAOStrength(0); st.setShadowAuto(false);
  const W = ctx.width, H = ctx.height;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * ctx.dpr); canvas.height = Math.round(H * ctx.dpr);
  Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', width: `${W}px`, height: `${H}px`, background: '#000' });
  const g = canvas.getContext('2d');
  const band = document.createElement('div');
  band.className = 'lb-ui-band';
  Object.assign(band.style, { position: 'absolute', left: `${Math.round(96 * (W / 1920))}px`, top: `${Math.round(92 * (W / 1920))}px`, padding: '10px 16px 11px', borderRadius: '10px',
    background: 'rgba(16, 19, 21, 0.78)', boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.12)', color: '#eef2f6',
    font: `600 ${Math.max(13, Math.round(20 * (W / 1920)))}px/1.25 var(--t-font-display, "Libre Franklin Brand", system-ui, sans-serif)` });
  ctx.overlay.append(canvas, band);
  let man: Manifest | null = null;
  const imgs: HTMLImageElement[] = [];
  const load = Object.values(manifests)[0];
  try { man = load ? await load() : null; } catch { man = null; }
  if (man) {
    for (const f of man.files) { const im = new Image(); im.decoding = 'sync'; im.src = `${BASE}${f}`; imgs.push(im); }
    ctx.wait(Promise.all(imgs.map((im) => im.decode().catch(() => undefined))));
  }
  const mon = (ct: string) => { const m = /^\d{4}-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(ct); return m ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[1]) - 1]} ${Number(m[2])}, ${m[3]}:${m[4]} CT` : ct; };
  band.textContent = man ? `Living Brain’s own interface · the Grand Prix brain · recorded ${mon(man.recorded.ct)}` : 'Living Brain’s own interface · the recording is not in this checkout';
  const draw = (t: number) => {
    if (!g) return;
    g.fillStyle = '#000'; g.fillRect(0, 0, canvas.width, canvas.height);
    if (!man || !imgs.length) return;
    const i = Math.max(0, Math.min(imgs.length - 1, Math.floor(t * man.fps)));
    const im = imgs[i];
    if (im && im.complete && im.naturalWidth) g.drawImage(im, 0, 0, canvas.width, canvas.height);
  };
  return {
    time: man ? Math.min(6.5, (man.frames - 1) / man.fps) : 0,
    note: man
      ? `Living Brain's own interface, not our rendering: the Grand Prix brain's Explore view in the signed-in app, recorded read only (${man.frames} frames at ${man.fps} a second, ${man.width} x ${man.height}, recorded ${man.recorded.ct}); the account's name, email, project and plan were hidden before the app drew. Its words are Living Brain's (it calls pages memories).`
      : 'Living Brain\'s own interface: the recording (storyboard/interface/frames, made by capture-interface.mjs) is not in this checkout.',
    update(t) { st.setCamera({ target: [0, 0, 0], az: 0, el: 10, dist: 10, vfov: 37 }); draw(t); },
    decorate() {},
    dispose() { canvas.remove(); band.remove(); },
  };
}
