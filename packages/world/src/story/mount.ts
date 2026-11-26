// mountStory(el, { mode, theme, startBeat, onRoute }): the story on a page.
//
//   site     the visitor moves it (wheel, click, arrow keys, swipe, the chapter rail); each beat names its tab, and its
//            "Open <tab>" control calls onRoute(tabId) with the Grand Prix site's tab id (site/src/shell/tabs.ts).
//   capture  the film's clock is the caller's: seek(t) poses the film at t seconds and resolves once the frame has
//            settled (story.html wires it to window.__gpClock and window.__ready for scripts/capture-story.mjs).
//
// Returns { dispose, goTo(beat), on(event, fn) }: goTo takes a beat's index or id (beats: the list, in order); on()
// listens for 'ready', 'beat' (the beat now at rest or nearest), 'route' (a tab asked for), 'end' and 'error', and
// returns its own unsubscribe. The 3D holds dark whatever the site's theme (Jo, 26 Nov): `theme` is recorded on the
// root as data-site-theme for the page's own rules, and nothing inside changes with it.
import '../kit/css/fonts.css';
import '../kit/css/glass.css';
import '../kit/css/plates.css';
import './story.css';
import { StoryPlayer, loadData, type Captions } from './player';
import { SiteController, type Beat, type StoryEvent } from './site';
import type { CutId, TabId } from './beats';
import { keyDef } from './clock';

export interface MountOptions {
  mode?: 'site' | 'capture';
  theme?: 'dark' | 'light';
  /** The beat to open on: its index or id ('desert-willow', 'the-map', ...); in capture, the film's second to open on. */
  startBeat?: number | string;
  onRoute?(tabId: TabId): void;
  /** capture: the film to play (master, 3:00, or the 90-second cut). */
  cut?: CutId;
  /** The words: the site shows each frame's own caption; a capture the film's line by default. */
  captions?: Captions;
  /** Drawing-buffer pixels per CSS px (the site: the device's, at most 2). */
  dpr?: number;
  /** Rests as stills with cross-fades; the visitor's setting when left out. */
  reducedMotion?: boolean;
}

export interface StoryHandle {
  readonly beats: Beat[];
  /** Resolves once the first picture is on screen (or rejects if the story cannot run here). */
  readonly ready: Promise<void>;
  dispose(): void;
  goTo(beat: number | string): void;
  on(event: StoryEvent, fn: (payload?: unknown) => void): () => void;
  /** capture: poses the film at t seconds and resolves once it has settled. */
  seek(t: number, dt?: number): Promise<void>;
  /** For checks and the capture: the player itself. */
  readonly player: StoryPlayer | null;
}

export function mountStory(el: HTMLElement, opts: MountOptions = {}): StoryHandle {
  const mode = opts.mode ?? 'site';
  const listeners = new Map<StoryEvent, Set<(p?: unknown) => void>>();
  const emit = (e: StoryEvent, p?: unknown) => { for (const f of listeners.get(e) ?? []) { try { f(p); } catch (err) { console.error(err); } } };
  const root = document.createElement('div');
  root.className = 'gp-story world intro hwalk is-x';
  root.dataset.theme = 'dark';
  root.dataset.siteTheme = opts.theme ?? 'dark';
  // 'site' or 'capture': a frame can leave out what only a visitor can act on (the hub's "Click a station") in a film
  root.dataset.mode = mode;
  root.style.position = 'absolute'; root.style.inset = '0';
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.appendChild(root);
  const W = Math.max(1, Math.round(el.clientWidth)), H = Math.max(1, Math.round(el.clientHeight));
  root.style.setProperty('--u', String(W / 1920));
  const dpr = opts.dpr ?? (mode === 'capture' ? window.devicePixelRatio || 1 : Math.min(2, window.devicePixelRatio || 1));
  const reduced = opts.reducedMotion ?? (mode === 'site' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true);
  let player: StoryPlayer | null = null, site: SiteController | null = null, dead = false;
  const beatsList: Beat[] = [];
  let ro: ResizeObserver | null = null;

  const ready = (async () => {
    await Promise.all(['400 26px', '500 16px', '600 40px'].map((f) => document.fonts.load(`${f} "Libre Franklin Brand"`)));
    const data = await loadData();
    if (dead) return;
    // the films run each hold's clock (Parc fermé's time-lapse under its line); the site rests on each beat's state
    player = new StoryPlayer({ root, width: W, height: H, dpr, cut: mode === 'capture' ? opts.cut ?? 'master' : 'site', data, holds: mode === 'capture' ? 'run' : 'rest',
      captions: opts.captions ?? (mode === 'capture' ? 'film' : 'frame'), preserve: mode === 'capture', onError: (e, frame) => emit('error', { frame, error: String(e) }) });
    if (mode === 'site') {
      site = new SiteController(root, player, reduced, emit, opts.onRoute ?? null);
      beatsList.push(...site.beats);
      const start = typeof opts.startBeat === 'string' ? Math.max(0, site.beats.findIndex((b) => b.id === opts.startBeat)) : opts.startBeat ?? 0;
      const F = player.film;
      // the opening rest first, then the loop takes over
      await player.ensure(keyDef(F.keys[F.stops[start] ?? 0]!.key).frame);
      if (dead) return;
      site.start(start);
      let size = { w: W, h: H };
      ro = new ResizeObserver(() => {
        const w = Math.round(el.clientWidth), h = Math.round(el.clientHeight);
        if (!player || w < 2 || h < 2 || (w === size.w && h === size.h)) return;
        size = { w, h };
        root.style.setProperty('--u', String(w / 1920));
        player.resize(w, h, dpr);
        site?.redraw();
      });
      ro.observe(el);
    } else {
      const F = player.film;
      beatsList.push(...F.stops.map((ki, index) => { const k = F.keys[ki]!, d = keyDef(k.key); return { index, id: k.key, name: d.name, term: d.term, part: d.part, tab: d.tab, frame: d.frame }; }));
      await player.seek(typeof opts.startBeat === 'number' ? opts.startBeat : 0);
    }
    emit('ready');
  })();
  ready.catch((e) => emit('error', { error: String(e) }));

  return {
    beats: beatsList,
    ready,
    get player() { return player; },
    dispose() {
      dead = true; ro?.disconnect(); site?.dispose(); player?.dispose(); root.remove(); listeners.clear();
    },
    goTo(beat) {
      if (!site) return;
      const i = typeof beat === 'string' ? site.beats.findIndex((b) => b.id === beat) : beat;
      if (i >= 0) site.goTo(i);
    },
    on(event, fn) {
      let s = listeners.get(event);
      if (!s) { s = new Set(); listeners.set(event, s); }
      s.add(fn);
      return () => { s!.delete(fn); };
    },
    async seek(t, dt = 0) {
      await ready;
      if (!player) throw new Error('story: not mounted');
      await player.seek(t, dt);
    },
  };
}
