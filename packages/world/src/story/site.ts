// The site's way through the story: the visitor moves it with the wheel (or a trackpad), a click on the picture, the
// arrow keys, Page Up and Down, Space, a swipe, or the chapter rail. A step plays the leg at the film's own pace (its
// camera eased inside the leg), a jump across chapters lands one stop short and plays the last leg, and the wheel
// scrubs through the legs and snaps to the nearest rest when it stops. At a rest the picture stands still: nothing is
// drawn until the position moves (there is no hover and no parallax, so a still pointer draws nothing), except where the
// frame moves at its rest (FrameHandle.live: the stack's comets at its rest and in the closing plan view, Living Brain's
// stop), which draws again at 30 fps while the story is on screen. With reduced motion the rests are stills and a step
// cross-fades from one to the next.
import { keyDef } from './clock';
import { PARTS, TAB_LABEL, type KeyDef, type TabId } from './beats';
import { perfLog, type StoryPlayer, type Picture } from './player';
import type { FrameInstance } from './instances';
import { smooth } from './moves';

export interface Beat { index: number; id: string; name: string; term: string | null; part: string; tab: TabId | null; frame: string }
export type StoryEvent = 'ready' | 'beat' | 'route' | 'end' | 'error';

const SCROLL_KEYS_NEXT = new Set(['ArrowDown', 'ArrowRight', 'PageDown', ' ']);
const SCROLL_KEYS_PREV = new Set(['ArrowUp', 'ArrowLeft', 'PageUp']);
/** The film's legs play at this pace on a step (1: the film's own). */
const STEP_PACE = 1.15;
/** Screens of wheel scroll for one leg, as the intro's 1.6. */
const SCREENS_PER_MOVE = 1.6;
const SPRING = 6;
const REDUCED_FADE_S = 0.45;
/** Frames kept built after the story has passed them: the six drawn last (player.ts trim), so a step back draws at once. */
const KEEP_DRAWN = 6;
/** A rest whose frame moves (FrameHandle.live) draws again at this rate: the motion reads, at half the GPU time of
 *  drawing every display frame. */
const LIVE_FPS = 30;

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement);
const arrowSvg = () => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M3 8h9M8.5 4.5 12 8l-3.5 3.5'); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.6');
  p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
  s.appendChild(p);
  return s;
};

export class SiteController {
  pos = 0;
  target = 0;
  private vel = 0;
  private play: { to: number } | null = null;
  private wheelAt = -1;
  /** The rest a wheel gesture started from, the pixels it has scrolled, and the time before which the wheel is ignored
   *  (the tail of a flick, once it has moved its beat). */
  private wheelFrom = 0;
  private wheelPx = 0;
  private wheelLock = -1;
  private raf = 0;
  private last = 0;
  private drawnAt = NaN;
  private platesK = 0;
  private decorating = false;
  private stop = -1;
  private rail: HTMLOListElement;
  private now: HTMLDivElement;
  private route: HTMLButtonElement;
  private hint: HTMLParagraphElement;
  private wait: HTMLParagraphElement;
  private touch: { x: number; y: number; target: number; t: number } | null = null;
  private waitingSince = -1;
  /** Why the position first held (a measuring harness's log): a build under way, or a picture not built. */
  private waitWhy = '';
  /** The time the position came to rest at its stop (-1 while it moves). */
  private restedAt = -1;
  private prefetchIdx = 0;
  /** Whether Living Brain's particles have been asked for off the main thread (warmBrains). */
  private warmed = false;
  private dead = false;
  private told = new Set<string>();
  /** The frame that moves at its rest (FrameHandle.live) the story rested on last, and its clock: seconds run past its
   *  rest's local time. When the live rest last drew, and whether the story is on screen (it draws only then). */
  private live: { inst: FrameInstance; t: number } | null = null;
  private liveDrawnAt = -1;
  private onScreen = true;
  private io: IntersectionObserver | null = null;
  readonly beats: Beat[];

  constructor(private root: HTMLElement, private P: StoryPlayer, private reduced: boolean,
    private emit: (e: StoryEvent, payload?: unknown) => void, private onRoute: ((tab: TabId) => void) | null) {
    const F = P.film;
    this.beats = F.stops.map((ki, index) => { const k = F.keys[ki]!, d = keyDef(k.key) as KeyDef; return { index, id: k.key, name: d.name, term: d.term, part: d.part, tab: d.tab, frame: d.frame }; });
    const chrome = document.createElement('div'); chrome.className = 'gp-chrome';
    this.rail = document.createElement('ol'); this.rail.className = 'gp-rail'; this.rail.setAttribute('aria-label', 'The story, beat by beat');
    const groups = new Map<string, HTMLOListElement>();
    for (const b of this.beats) {
      let g = groups.get(b.part);
      if (!g) {
        const li = document.createElement('li'); g = document.createElement('ol');
        g.setAttribute('aria-label', PARTS[b.part as keyof typeof PARTS]);
        li.appendChild(g); this.rail.appendChild(li); groups.set(b.part, g);
      }
      const li = document.createElement('li'), btn = document.createElement('button');
      btn.type = 'button'; btn.title = b.term ? `${b.name} (${b.term})` : b.name;
      btn.setAttribute('aria-label', `Beat ${b.index + 1} of ${this.beats.length}: ${btn.title}`);
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.goTo(b.index); this.root.focus({ preventScroll: true }); });
      li.appendChild(btn); g.appendChild(li);
    }
    this.now = document.createElement('div'); this.now.className = 'gp-now'; this.now.setAttribute('aria-live', 'polite');
    this.route = document.createElement('button'); this.route.type = 'button'; this.route.className = 'gp-route'; this.route.hidden = true;
    this.route.addEventListener('click', (e) => { e.stopPropagation(); const tab = this.beats[this.stop]?.tab; if (tab) { this.emit('route', tab); this.onRoute?.(tab); } });
    this.hint = document.createElement('p'); this.hint.className = 'gp-hint'; this.hint.textContent = 'Scroll, swipe or press the arrow keys to move through it';
    this.wait = document.createElement('p'); this.wait.className = 'gp-wait'; this.wait.textContent = 'Building the next station';
    // one thin bar along the top edge, above where the frames keep their key cards and banners
    const bar = document.createElement('div'); bar.className = 'gp-bar';
    bar.append(this.rail, this.now);
    chrome.append(bar, this.hint, this.wait);
    root.appendChild(chrome);
    root.tabIndex = 0;
    root.setAttribute('role', 'region'); root.setAttribute('aria-roledescription', 'story');
    root.setAttribute('aria-label', 'Wattness Grand Prix: the story. Scroll, swipe or press the arrow keys to move through it.');
    root.addEventListener('wheel', this.onWheel, { passive: false });
    root.addEventListener('click', this.onClick);
    root.addEventListener('touchstart', this.onTouchStart, { passive: true });
    root.addEventListener('touchmove', this.onTouchMove, { passive: false });
    root.addEventListener('touchend', this.onTouchEnd);
    window.addEventListener('keydown', this.onKey);
    // the camera's travel is drawn lighter here (player.ts aoThroughLeg): a visitor's legs play live, the films' do not
    P.motionLight = true;
    // the chrome's rects stay clear of the frames' plates
    P.keepOut = () => [bar].map((el) => {
      const a = el.getBoundingClientRect(), b = this.root.getBoundingClientRect();
      return { x: a.left - b.left - 6, y: a.top - b.top - 6, w: a.width + 12, h: a.height + 12 };
    });
    const log = perfLog();
    if (log) log.site = this;
  }

  start(at = 0) {
    this.pos = this.target = Math.max(0, Math.min(this.beats.length - 1, at));
    this.last = performance.now();
    if (!this.io && typeof IntersectionObserver === 'function') {
      this.io = new IntersectionObserver((es) => { this.onScreen = es.some((x) => x.isIntersecting); });
      this.io.observe(this.root);
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Draw again at the same place (the stage was resized: its frames are built again as needed). */
  redraw() { this.drawnAt = NaN; this.platesK = 0; }

  goTo(k: number) {
    const n = this.beats.length;
    const to = Math.max(0, Math.min(n - 1, Math.round(k)));
    perfLog()?.events.push({ e: 'go', t: performance.now(), from: this.pos, to });
    if (Math.abs(to - this.pos) > 1.001) this.pos = to - Math.sign(to - this.pos);
    this.target = to; this.vel = 0; this.wheelAt = -1;
    this.play = { to };
    this.hint.classList.remove('is-on');
  }
  step(dir: 1 | -1) {
    const base = this.play ? this.play.to : dir > 0 ? Math.floor(this.pos + 1e-3) : Math.ceil(this.pos - 1e-3);
    this.goTo(base + dir);
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.dead || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return;
    const a = document.activeElement;
    const inside = this.root.contains(a) || this.root.matches(':hover') || !a || a === document.body;
    if (!inside) return;
    if ((e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) && (e.key === ' ' || e.key === 'Enter')) return;
    if (SCROLL_KEYS_NEXT.has(e.key) && !(e.key === ' ' && e.shiftKey)) { e.preventDefault(); this.step(1); }
    else if (SCROLL_KEYS_PREV.has(e.key) || (e.key === ' ' && e.shiftKey)) { e.preventDefault(); this.step(-1); }
    else if (e.key === 'Home') { e.preventDefault(); this.goTo(0); }
    else if (e.key === 'End') { e.preventDefault(); this.goTo(this.beats.length - 1); }
  };
  private onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) return;
    e.preventDefault();
    const now = performance.now();
    if (now < this.wheelLock) { this.wheelLock = Math.max(this.wheelLock, now + 120); return; }
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.root.clientHeight : 1;
    const d = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * unit;
    if (this.wheelAt < 0) { this.wheelFrom = this.play ? this.play.to : Math.round(this.pos); this.wheelPx = 0; this.target = this.pos; }
    this.wheelPx += d;
    this.play = null;
    this.target = Math.max(0, Math.min(this.beats.length - 1, this.target + d / (SCREENS_PER_MOVE * Math.max(1, this.root.clientHeight))));
    this.wheelAt = performance.now();
    this.hint.classList.remove('is-on');
  };
  private onClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    this.step(e.shiftKey ? -1 : 1);
  };
  private onTouchStart = (e: TouchEvent) => {
    const p = e.touches[0]; if (!p) return;
    this.touch = { x: p.clientX, y: p.clientY, target: this.pos, t: performance.now() };
  };
  private onTouchMove = (e: TouchEvent) => {
    const p = e.touches[0], s = this.touch; if (!p || !s) return;
    const dx = p.clientX - s.x, dy = p.clientY - s.y;
    const d = Math.abs(dy) >= Math.abs(dx) ? -dy : -dx;
    e.preventDefault();
    this.play = null; this.wheelAt = performance.now();
    this.target = Math.max(0, Math.min(this.beats.length - 1, s.target + d / Math.max(1, this.root.clientHeight)));
  };
  private onTouchEnd = (e: TouchEvent) => {
    const s = this.touch; this.touch = null; if (!s) return;
    const p = e.changedTouches[0]; if (!p) return;
    const dx = p.clientX - s.x, dy = p.clientY - s.y, d = Math.abs(dy) >= Math.abs(dx) ? -dy : -dx;
    if (Math.abs(d) > 36) this.goTo(d > 0 ? Math.floor(s.target + 1e-3) + 1 : Math.ceil(s.target - 1e-3) - 1);
    else this.goTo(Math.round(this.pos));
    this.wheelAt = -1;
  };

  private advance(dt: number, now: number) {
    const n = this.beats.length;
    if (this.play) {
      const to = this.play.to;
      if (this.reduced) {
        const dir = Math.sign(to - this.pos);
        this.pos += dir * Math.min(Math.abs(to - this.pos), dt / REDUCED_FADE_S);
      } else {
        // the leg at the film's pace: one stop unit over the leg's seconds
        const s = Math.min(n - 2, Math.max(0, to > this.pos ? Math.floor(this.pos) : Math.ceil(this.pos) - 1));
        const span = Math.max(0.6, this.P.film.span(s)) / STEP_PACE;
        const dir = Math.sign(to - this.pos);
        this.pos += dir * Math.min(Math.abs(to - this.pos), dt / span);
      }
      if (Math.abs(to - this.pos) < 1e-6) { this.pos = to; this.play = null; this.target = to; this.vel = 0; }
      return;
    }
    // the wheel or a pan: a critically damped spring onto the target; once the input stops, onto the nearest rest
    if (this.wheelAt >= 0 && now - this.wheelAt > 220 && !this.touch) {
      // once the wheel stops: a flick of 36 px or more moves a beat its way, as a swipe does, and a longer scroll the
      // beats it covered; then the wheel rests 700 ms, so a flick's tail never moves a second beat
      this.wheelAt = -1;
      const n = this.beats.length, dir = Math.sign(this.wheelPx);
      const by = Math.abs(this.wheelPx) < 36 ? 0 : Math.max(1, Math.round(Math.abs(this.target - this.wheelFrom)));
      this.wheelLock = now + 700;
      this.goTo(Math.max(0, Math.min(n - 1, this.wheelFrom + dir * by)));
      return;
    }
    if (this.reduced) { this.pos = this.target; return; }
    const d = this.pos - this.target, w = SPRING, ex = Math.exp(-w * dt), c = this.vel + w * d;
    this.pos = this.target + (d + c * dt) * ex;
    this.vel = (this.vel - w * c * dt) * ex;
    if (Math.abs(this.pos - this.target) < 1e-5 && Math.abs(this.vel) < 1e-4) { this.pos = this.target; this.vel = 0; }
  }

  /** The picture at a site position: the film's time there, or with reduced motion the two rests cross-faded. */
  private pictureAt(p: number): Picture | null {
    const F = this.P.film;
    if (!this.reduced) return this.P.picture(F.timeAt(p));
    const s = Math.min(F.stops.length - 2, Math.floor(p)), f = p - s;
    const a = this.P.picture(F.keys[F.stops[Math.max(0, s)]!]!.at);
    if (f <= 1e-6 || F.stops.length < 2) return a;
    const b = this.P.picture(F.keys[F.stops[s + 1]!]!.at);
    if (!a || !b) return null;
    const k = smooth(f);
    const da = a.draws[0]!, db = b.draws[0]!;
    if (k >= 1) return b;
    return { draws: [{ ...da, alpha: 1 }, { ...db, alpha: k }], plates: null, where: b.where, t: b.t };
  }

  private needFor(p: number): string[] {
    const F = this.P.film;
    if (this.reduced) {
      const s = Math.floor(p), out = [keyDef(F.keys[F.stops[s]!]!.key).frame];
      if (p - s > 1e-6 && F.stops[s + 1] != null) out.push(keyDef(F.keys[F.stops[s + 1]!]!.key).frame);
      return out;
    }
    return this.P.framesNear(F.timeAt(p), 0).need;
  }

  private loop = (now: number) => {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.decorating) return;
    // while a frame's setup runs, the position holds: it writes the shared stage (its programs compile after, while the
    // story moves on through frames already drawable)
    if (this.P.isBuilding()) { if (this.play || this.wheelAt >= 0 || this.touch) this.showWait(now, 'building'); return; }
    this.advance(dt, now);
    const p = this.pos;
    let pic = this.pictureAt(p);
    if (!pic) {
      const need = this.needFor(p);
      // a frame that failed to build: the nearest frame that did holds the picture (and the failure is told once)
      if (need.some((f) => this.P.errors.has(f))) {
        for (const f of need) if (this.P.errors.has(f) && !this.told.has(f)) { this.told.add(f); this.emit('error', { frame: f, error: this.P.errors.get(f) }); }
        pic = this.P.fallback(this.P.film.timeAt(p));
      }
      if (!pic) {
        for (const f of need) if (!this.P.errors.has(f)) this.P.ensure(f).catch(() => undefined);
        this.showWait(now, 'missing');
        return;
      }
    }
    this.endWait(now);
    const atRest = Math.abs(p - Math.round(p)) < 1e-6 && !this.play && this.wheelAt < 0;
    if (!atRest) this.restedAt = -1;
    else if (this.restedAt < 0) { this.restedAt = now; perfLog()?.events.push({ e: 'rest', t: now, k: Math.round(p) }); }
    pic = this.withLive(pic, atRest, dt, now);
    if (p !== this.drawnAt) {
      this.P.render(pic, 0);
      this.drawnAt = p;
      if (!atRest) this.platesK = 0;
    }
    // the rest's plates: laid out once the picture has landed, then in over 0.3 s; out at once when it moves
    const restPic = atRest ? this.P.picture(this.P.film.keys[this.P.film.stops[Math.round(p)]!]!.at) : null;
    for (const b of [pic]) for (const d of b.draws) if (!restPic || d.inst !== restPic.draws[0]?.inst) d.inst.showPlates(0);
    if (restPic && restPic.plates) {
      if (restPic.plates.inst.decoratedFor !== restPic.plates.key) {
        this.decorating = true;
        const from = now, k = Math.round(p);
        this.P.plates({ ...restPic, plates: { ...restPic.plates, k: 0.001 } }).finally(() => {
          this.decorating = false; this.P.render(restPic, 0);
          perfLog()?.events.push({ e: 'plates', from, to: performance.now(), k });
        });
      } else {
        this.platesK = Math.min(1, this.platesK + dt / 0.3);
        restPic.plates.inst.showPlates(smooth(this.platesK));
      }
    } else if (this.P.last?.plates) this.P.last.plates.inst.showPlates(0);
    const stop = Math.round(p);
    if (stop !== this.stop) this.setStop(stop);
    // the frames round the rest start building as soon as the camera has landed and the plates are laid out
    if (atRest && !this.decorating) { this.warmBrains(); this.prefetch(stop); }
  };

  /** Living Brain's particles, made off the main thread once the story first rests (stations/brain/prepare.ts primes
   *  shape.ts with what its worker sends back). Without them the brain station's setup waits for that worker, and a
   *  setup holds the position (a step 300 ms after landing at 13 held 0.7 s, its words showing); the first frame to
   *  draw a brain, the hub's Team data pit (built ahead at 03), made their shared surface sample itself, a task of
   *  about 0.95 s that a key pressed then waited out. The arrays are the same either way, so every picture is too. */
  private warmBrains() {
    if (this.warmed) return;
    this.warmed = true;
    void Promise.all([import('../stations/brain/prepare'), import('../stations/brain/world')])
      .then(([prep, world]) => (this.dead ? undefined : prep.preparePoints(world.worldPoints())))
      .catch(() => undefined);
  }

  /** The picture with the clock of the frame that moves at its rest (FrameHandle.live: the stack's comets, run as the
   *  Tech Stack tab runs them, and Living Brain's stop). Resting on it, its clock runs on the wall clock and the rest
   *  draws again at LIVE_FPS while the story is on screen; on a leg out of it, its clock runs on in the frame left
   *  behind, so it keeps moving as the camera goes; wherever it is drawn it carries its clock, so it never jumps back.
   *  With reduced motion the rests are stills and nothing runs. */
  private withLive(pic: Picture, atRest: boolean, dt: number, now: number): Picture {
    if (this.reduced) return pic;
    if (this.live?.inst.disposed) this.live = null;
    const F = this.P.film, w = pic.where;
    // the frame at the rest, or the one a leg leaves (held at its rest while the camera goes)
    let held: FrameInstance | undefined;
    if (atRest) held = pic.draws[0]?.inst;
    else if (w.kind === 'leg' && w.i > 0) {
      const a = keyDef(F.keys[w.i - 1]!.key).frame;
      if (a !== keyDef(F.keys[w.i]!.key).frame) held = pic.draws.find((d) => d.inst.id === a)?.inst;
    }
    if (atRest && held?.handle?.live && this.live?.inst !== held) this.live = { inst: held, t: 0 };
    const L = this.live;
    if (!L) return pic;
    if (held === L.inst && this.onScreen && !document.hidden) {
      L.t += dt;
      // once a frame is due, the position counts as not drawn yet (at a rest nothing else draws it)
      if (now - this.liveDrawnAt >= 1000 / LIVE_FPS - 4) { this.liveDrawnAt = now; this.drawnAt = NaN; }
    }
    if (!pic.draws.some((d) => d.inst === L.inst)) return pic;
    return { ...pic, draws: pic.draws.map((d) => (d.inst === L.inst ? { ...d, local: d.local + L.t } : d)) };
  }

  private showWait(now: number, why: string) {
    if (this.waitingSince < 0) { this.waitingSince = now; this.waitWhy = why; }
    this.wait.classList.toggle('is-on', now - this.waitingSince > 400);
  }
  /** The position moves again: the wait goes (and a measuring harness's log gets the hold, and how long its words showed). */
  private endWait(now: number) {
    if (this.waitingSince < 0) return;
    perfLog()?.events.push({ e: 'hold', from: this.waitingSince, to: now, shown: Math.max(0, now - this.waitingSince - 400), why: this.waitWhy, pos: this.pos });
    this.waitingSince = -1; this.wait.classList.remove('is-on');
  }

  /** At a rest, from the moment it lands: the frames of the stops round it, the next chapter's first, one build at a
   *  time. A frame the story has passed is let go once it is neither round the rest nor among the six drawn last (at
   *  each new rest, and after each build), so the frames built stay bounded however quickly the visitor steps. */
  private prefetch(stop: number) {
    if (this.P.isBusy()) return;
    const F = this.P.film, around = [stop + 1, stop - 1, stop + 2];
    const want: string[] = [];
    for (const s of [stop, ...around]) {
      if (s < 0 || s >= F.stops.length) continue;
      const lo = F.stops[Math.max(0, s - 1)]!, hi = F.stops[s]!;
      for (let i = lo; i <= hi; i++) want.push(keyDef(F.keys[i]!.key).frame);
    }
    if (this.prefetchIdx !== stop) { this.prefetchIdx = stop; this.P.trim(want, KEEP_DRAWN); }
    const next = want.find((f) => !this.P.inst(f).ready && !this.P.errors.has(f));
    if (next) this.P.ensure(next, 'prefetch').then(() => { if (!this.dead) this.P.trim(want, KEEP_DRAWN); }, () => undefined);
  }

  private setStop(k: number) {
    this.stop = k;
    const b = this.beats[k];
    if (!b) return;
    this.rail.querySelectorAll('button').forEach((btn, i) => {
      if (i === k) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
      if (i < k) btn.dataset.past = ''; else delete btn.dataset.past;
    });
    this.now.replaceChildren();
    const num = document.createElement('b'); num.textContent = String(k + 1).padStart(2, '0');
    const name = document.createElement('span'); name.textContent = b.name;
    this.now.append(num, name);
    // the plain name first, the race weekend's word after it, small; then the beat's tab (the site's own label for it)
    if (b.term) { const sm = document.createElement('small'); sm.textContent = b.term; this.now.appendChild(sm); }
    if (b.tab) {
      this.route.hidden = false;
      this.route.replaceChildren(document.createTextNode(`Open ${TAB_LABEL[b.tab]}`), arrowSvg());
      this.route.setAttribute('aria-label', `Open the ${TAB_LABEL[b.tab]} tab`);
      this.now.appendChild(this.route);
    } else this.route.hidden = true;
    this.hint.classList.toggle('is-on', k === 0 && this.target === 0);
    this.emit('beat', b);
    if (k === this.beats.length - 1) this.emit('end', b);
  }

  dispose() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.io?.disconnect();
    window.removeEventListener('keydown', this.onKey);
    this.root.removeEventListener('wheel', this.onWheel);
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('touchstart', this.onTouchStart);
    this.root.removeEventListener('touchmove', this.onTouchMove);
    this.root.removeEventListener('touchend', this.onTouchEnd);
    this.root.querySelector('.gp-chrome')?.remove();
  }
}
