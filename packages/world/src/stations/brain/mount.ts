// @ts-nocheck
// The Memory tab's Living Brain view (SPEC 6): mountBrain(el, opts) draws our three brains as Living Brain holds them,
// in its visual language, from brain-scene.json (bundled; the browser never calls Living Brain). All brains first: the
// combined brain with the three members on their orbits; a member brain clicked (or its chip) comes to the center; a
// page's tag hovered lights its connections and shows a small card; clicked, its brain comes to the center (from the
// combined view too, as Living Brain's combined view opens a page) and its card pins, with its connections in
// its brain and across brains, Living Brain's summary and the correction beside it, and "Open <tab>" where the page is a tab's
// own. Drag and pinch orbit and zoom as Living Brain's controls do; the wheel zooms with Ctrl or ⌘ held (a trackpad's
// pinch arrives so) or once the visitor has pressed on the stage, and otherwise scrolls the page past it, and a vertical
// swipe on a phone scrolls the page too. The keyboard's path: the stage, the brains' chips, the pinned card (a page
// picked from the list takes focus into it, and its close gives it back), then the focused brain's pages, each a
// button in a visually hidden list; without WebGL the list is the view, and under 720 px it opens as a drawer. The
// mount never writes the URL: it calls onState and the host does. The 3D holds dark in either site theme.
import './brain.css';
import './mount.css';
import '../../kit/css/fonts.css';
import * as THREE from 'three';
import { createWorldStage, assignLayers } from '../../lib/stage';
import { BrainWorld, restPose, REST, ORBIT, VFOV } from './world';
import { BrainBloomPass } from './bloom';
import { makeRibbons } from './ribbons';
import { Chrome, memberScreen, projectorNow } from './tags';
import { SCENE, BRAINS, BRAIN_IDS, brainOf, page, pagesOf, linksOf, acrossOf, conflictOf, keyOf, fmt, PLAIN, THE, scopeLine } from './data';
import { pageCard, hoverCard, pageRows, brainChips, setChips, fixOf, glyph } from './card';
import { T_SHARED } from './moments';

export type BrainFocus = 'all' | 'grand-prix' | 'battery-review' | 'terminal';
export interface BrainState { brain: BrainFocus; page: string | null }
export interface BrainOptions {
  /** The page's theme: the stage holds dark in both; the fallback list follows it. */
  theme?: 'light' | 'dark';
  /** The host's tabs: which "Open <tab>" buttons may show, and their labels. */
  tabs?: { id: string; label: string }[];
  /** Where to open (the host reads it from its URL: ?brain=&page=). A page needs its brain. */
  initial?: Partial<BrainState>;
  onRoute?: (tab: string) => void;
  /** The view changed by the visitor: focusing a brain asks for a history entry, selecting a page replaces it. */
  onState?: (s: BrainState, how: { history: 'push' | 'replace' }) => void;
  /** Drawing-buffer pixels per CSS px. Default min(devicePixelRatio, 2) (1.5 on phones). */
  dpr?: number;
  /** 'auto' (the default): full clouds on desktop, lighter ones under 720 px or on a coarse pointer. */
  quality?: 'auto' | 'high' | 'low';
  /** Default: the visitor's prefers-reduced-motion. */
  reducedMotion?: boolean;
  /** The host's corrections beside Living Brain's text, where it holds one brain-scene.json does not (the site's
   *  build-brain.json carries its own): a page's keyed 'brain/slug', a connection's 'brainA/a>brainB/b' (either order).
   *  The card shows the host's where there is one. */
  corrections?: { pages?: Record<string, string>; connections?: Record<string, string> };
}
export interface BrainHandle {
  readonly ready: Promise<void>;
  state(): BrainState;
  goTo(s: Partial<BrainState>): void;
  /** The page's theme changed: the stage holds dark; the list without WebGL follows it. */
  setTheme(theme: 'light' | 'dark'): void;
  on(ev: 'state' | 'route' | 'ready' | 'error', fn: (x: any) => void): () => void;
  /** For checks and recordings: a page's tag (or dot) on screen, CSS px from el's top left, or null when not shown. */
  screenOf(brain: string, slug: string): { x: number; y: number } | null;
  /** For checks and recordings: a member brain's center on screen and its radius. */
  brainAt(brain: string): { x: number; y: number; r: number } | null;
  /** For checks and recordings: a page's dot on screen (in the brain at the center, or the combined brain), and how
   *  squarely it faces the camera (1 facing, -1 the far side); null behind the camera. */
  dotOf(brain: string, slug: string): { x: number; y: number; facing: number } | null;
  dispose(): void;
}

const DUR = 1.4, SPIN = (2 * Math.PI) / 160, SC = [1, 0.92, 1.08];
// the combined view as the films' short clock frames it (moments.ts T_SHARED): its orbit phase and height keep the
// members clear of the combined brain and of each other through the first seconds a visitor looks, each member's yaw
// shows its profile then (a member at the center turns back), and with reduced motion the view holds at 3.0 s of that
// clock, its camera turned on by the spin it would have had
const PHASE = (T_SHARED.phase * Math.PI) / 180;
const YAW = T_SHARED.yawM.map((d) => (d * Math.PI) / 180);
const FREEZE = 3.0;
const VIEW = { all: { dist: 4.6, el: T_SHARED.el }, brain: { dist: REST.dist, el: REST.el } };
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const calm = (x: number) => { const t = clamp01(x); return t * t * t * (t * (6 * t - 15) + 10); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
let visited = false;

export function mountBrain(el: HTMLElement, opts: BrainOptions = {}): BrainHandle {
  const reduced = opts.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const tabs = new Map((opts.tabs ?? []).map((t) => [t.id, t.label]));
  const fix = fixOf(opts.corrections);
  const listeners = new Map<string, Set<(x: any) => void>>();
  const emit = (ev: string, x?: any) => { for (const f of listeners.get(ev) ?? []) { try { f(x); } catch (e) { console.error(e); } } };
  const cleanups: (() => void)[] = [];
  let disposed = false, raf = 0;

  // ── the view's state ────────────────────────────────────────────────────────────────────────────────────────
  const valid = (b: any): b is BrainFocus => b === 'all' || BRAIN_IDS.includes(b);
  const init = { brain: valid(opts.initial?.brain) ? opts.initial!.brain! : 'all', page: opts.initial?.page ?? null };
  if (init.page && (init.brain === 'all' || !page(init.brain, init.page))) init.page = null;
  const S = {
    focus: init.brain as BrainFocus, from: init.brain as BrainFocus, ft0: -1e9,
    sel: init.page ? { brain: init.brain, slug: init.page } : null as null | { brain: string; slug: string },
    hover: null as null | { brain: string; slug: string }, hl: '', hlT0: 0,
    cam: { az: REST.az + (reduced ? (SPIN * FREEZE * 180) / Math.PI : 0), el: (init.brain === 'all' ? VIEW.all : VIEW.brain).el, dist: (init.brain === 'all' ? VIEW.all : VIEW.brain).dist },
    camA: null as any, camB: null as any, ct0: 0, camDur: DUR,
    vel: { az: 0, el: 0 }, pauseUntil: 0,
    form0: !reduced && !visited && init.brain === 'all' && !init.page ? 0 : -100,
    hoverBrain: null as null | string, drag: false, lastT: 0,
    // the wheel's target distance (eased toward), the lit page's share of the links across brains' brightness, the
    // pointer's last real position and where it was when the view last moved under it (hover waits for a real move)
    zoomTo: null as null | number, litK: 0, ptr: { x: NaN, y: NaN }, still: null as null | { x: number; y: number },
    // the orbit's scale on a stage narrower than it is tall (frame())
    orbitK: 1,
    // the lens shift (stage fractions, the kit's setCamera shift) that composes the scene left of a pinned card, or
    // above the bottom sheet, eased toward shiftTo; and the selection the camera last eased out for (showAcross)
    shift: { x: 0, y: 0 }, shiftTo: { x: 0, y: 0 }, acrossFor: '',
  };
  visited = true;
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;
  const state = (): BrainState => ({ brain: S.focus, page: S.sel && S.sel.brain === S.focus ? S.sel.slug : null });

  // ── the DOM ─────────────────────────────────────────────────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.className = 'lbm-root'; root.dataset.siteTheme = opts.theme === 'light' ? 'light' : 'dark';
  root.tabIndex = 0; root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'Living Brain: our three brains');
  el.appendChild(root);
  const size = { width: Math.max(320, el.clientWidth || 960), height: Math.max(320, el.clientHeight || 600) };
  const narrow = () => size.width < 720 || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  const lite = opts.quality === 'low' || (opts.quality !== 'high' && narrow());

  // WebGL, or the list
  let stage = null, canvas = null;
  try {
    canvas = document.createElement('canvas'); canvas.className = 'lbm-canvas';
    const probe = canvas.getContext('webgl2');
    if (!probe) throw new Error('no WebGL2');
    root.appendChild(canvas);
    const dpr = opts.dpr ?? Math.min(lite ? 1.5 : 2, window.devicePixelRatio || 1);
    stage = createWorldStage({ canvas, width: size.width, height: size.height, dpr, theme: 'dark', debug: false });
    stage.__dpr = dpr;
  } catch (e) {
    canvas?.remove(); canvas = null; stage = null;
  }
  if (!stage) return flatView(root, S, tabs, fix, opts, emit, listeners, () => { disposed = true; root.remove(); });

  const dpr = stage.__dpr;
  cleanups.push(() => stage.dispose());
  stage.setBackdrop({ top: '#000102', horizon: '#000102', bottom: '#000102', glow: '#000102', ground: '#000102' });
  stage.ground.visible = false; stage.catcher.visible = false; stage.scene.fog = null;
  stage.setAOStrength(0); stage.setShadowAuto(false);
  stage.setCamera(restPose());
  const world = new BrainWorld({ counts: lite ? { center: 30000, 'grand-prix': 30000, 'battery-review': 30000, terminal: 30000 } : {} });
  world.setAspect(size.width / size.height);
  assignLayers(world.root);
  stage.scene.add(world.root);
  const bloom = new BrainBloomPass(Math.round(size.width * dpr), Math.round(size.height * dpr));
  stage.composer.insertPass(bloom, stage.composer.passes.length - 1);
  if (reduced) for (const c of [world.center, ...Object.values(world.members)]) c.body.material.uniforms.uTwinkle.value = 0;
  // the across links of a selected page, from the brain at the center into the others
  let bridges = null, bridgeEnds = [];
  const setBridges = () => {
    if (bridges) { world.root.remove(bridges.mesh); bridges.mesh.geometry.dispose(); bridges.mesh.material.dispose(); bridges = null; }
    bridgeEnds = [];
    const s = S.sel;
    if (!s || S.focus === 'all' || s.brain !== S.focus) return;
    const rows = acrossOf(s.brain, s.slug);
    if (!rows.length) return;
    bridgeEnds = rows.map(({ other, x }) => ({ brain: other.brain, index: world.memberIndex[other.brain].get(other.slug), sim: x.similarity }));
    const blank = new Float32Array(41 * 3);
    bridges = makeRibbons(bridgeEnds.map((e) => ({ pts: blank, a: -1, b: -1, colorA: new THREE.Color(brainOf(s.brain).color), colorB: new THREE.Color(brainOf(e.brain).color), sim: e.sim, width: 1.6, gain: 2.2, drawAt: 0 })), { overlay: false });
    bridges.uniforms.uDrawDur.value = reduced ? 0.001 : 0.7;
    bridges.mesh.userData.overlay = true; bridges.mesh.layers.set(1);
    world.root.add(bridges.mesh);
    bridges.t0 = now();
  };

  const chrome = new Chrome(root, false);
  // the chips are made once and updated in place, so a clicked one keeps its focus (they are the keyboard's brains too)
  const chipsBox = brainChips(S.focus, (b) => keepFocus(() => focusBrain(b, 'user')), (b) => { S.hoverBrain = b; });
  root.appendChild(chipsBox);
  const hint = document.createElement('p'); hint.className = 'lb-hint'; root.appendChild(hint);
  const cardbox = document.createElement('div'); cardbox.className = 'lbm-cardbox'; root.appendChild(cardbox);
  let hoverEl: HTMLElement | null = null;
  // the focused brain's pages, for the keyboard (visually hidden: a page focused shows its hover card on the stage)
  const nav = document.createElement('nav'); nav.className = 'lbm-sr'; nav.setAttribute('aria-label', 'Pages'); root.appendChild(nav);
  let navRows: HTMLElement | null = null, navRowsFor = '';
  /** The list row a page was picked from: focus goes back to it when the page's card closes. */
  let returnTo: HTMLElement | null = null;
  /** Focus into the pinned card, on its close (its title has no control of its own). */
  const focusCard = () => cardbox.querySelector<HTMLElement>('.lbm-close')?.focus({ preventScroll: true });
  /** Runs a change that may remove or hide the focused control: focus then returns to the stage, so its keys (Escape)
   *  still act. */
  const keepFocus = (fn: () => void) => {
    const prev = document.activeElement as HTMLElement | null;
    const inside = !!prev && prev !== root && root.contains(prev);
    fn();
    if (!inside) return;
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === document.body || !root.contains(a) || a.closest('[hidden]')) root.focus({ preventScroll: true });
  };
  const pagesBtn = document.createElement('button'); pagesBtn.type = 'button'; pagesBtn.className = 'lbm-pagesbtn'; root.appendChild(pagesBtn);
  const drawer = document.createElement('div'); drawer.className = 'lbm-drawer'; drawer.hidden = true; root.appendChild(drawer);
  pagesBtn.setAttribute('aria-expanded', 'false');
  /** The pages drawer (the narrow layout's list): its own close, Escape, or a press outside it closes it. */
  const setDrawer = (open: boolean) => {
    if (drawer.hidden === !open) return;
    const had = drawer.contains(document.activeElement);
    drawer.hidden = !open; pagesBtn.setAttribute('aria-expanded', String(open));
    if (open) { fillDrawer(); drawer.querySelector<HTMLElement>('.lbm-close')?.focus({ preventScroll: true }); }
    else if (had) pagesBtn.focus({ preventScroll: true });
  };
  pagesBtn.addEventListener('click', () => setDrawer(drawer.hidden));
  const onDocDown = (e) => { if (!drawer.hidden && !drawer.contains(e.target) && !pagesBtn.contains(e.target)) setDrawer(false); };
  document.addEventListener('pointerdown', onDocDown, true);
  cleanups.push(() => document.removeEventListener('pointerdown', onDocDown, true));
  // CT, with the reader's own clock beside it (data.ts scopeLine)
  chrome.scope(scopeLine(false));

  // ── the words: chips, hint, HUD, card, hover card, lists ──────────────────────────────────────────────────
  const renderChrome = () => {
    setChips(chipsBox, S.focus);
    if (!hint.classList.contains('is-tip')) hint.textContent = hintText();
    const b = S.focus === 'all' ? null : brainOf(S.focus);
    chrome.hud(b
      ? [[{ n: fmt(b.pages), label: b.pages === 1 ? 'page' : 'pages' }, { n: fmt(b.connections), label: 'connections' }, ...(b.connections ? [{ n: fmt(b.strong), label: 'strong', tone: 'em' as const }] : [])]]
      : [[{ n: fmt(SCENE.combined.pages), label: 'pages' }, { n: fmt(SCENE.combined.across), label: 'across brains' },
        // the conflict opens its page in the build's brain, whose card carries it (Conflict across brains)
        { n: String(SCENE.conflicts.length), label: SCENE.conflicts.length === 1 ? 'conflict' : 'conflicts', tone: 'rose' as const,
          ...(SCENE.conflicts.length ? { act: { id: 'conflict', label: `${SCENE.conflicts.length === 1 ? 'The conflict' : 'A conflict'} across brains: open ${page(SCENE.conflicts[0].a.brain, SCENE.conflicts[0].a.slug)?.title ?? 'its page'}, page ${String(page(SCENE.conflicts[0].a.brain, SCENE.conflicts[0].a.slug)?.n ?? '').padStart(2, '0')} of ${THE[SCENE.conflicts[0].a.brain]}` } } : {}) }]]);
    // the keyboard's path into the focused brain's pages, in number order; Enter pins a page and focus goes into its card
    if (navRowsFor !== S.focus) {
      navRows?.remove();
      navRows = S.focus !== 'all' ? pageRows(S.focus, (p) => {
        const row = document.activeElement instanceof HTMLElement && navRows?.contains(document.activeElement) ? document.activeElement : null;
        keepFocus(() => select(p.brain, p.slug, 'user'));
        if (S.sel && S.sel.brain === p.brain && S.sel.slug === p.slug) { returnTo = row; focusCard(); }
      }, (p) => setHover(p ? { brain: p.brain, slug: p.slug } : null)) : null;
      if (navRows) nav.appendChild(navRows);
      navRowsFor = S.focus;
    }
    pagesBtn.textContent = S.focus === 'all' ? 'Pages' : `Pages · ${brainOf(S.focus).pages}`;
    if (!drawer.hidden) fillDrawer();
    layout();
  };
  const hintText = () => (S.focus === 'all' ? 'Drag · Ctrl/⌘ + scroll · Click a brain or a page · Esc to clear' : 'Drag · Ctrl/⌘ + scroll · Click a page to see its connections · Esc for all brains');
  /** The narrow layout (chips at the bottom over the scope line, the card a bottom sheet, the pages a drawer) under
   *  800 px, or wherever the HUD and the chips would meet in their row; and the scope line's height for the chips. */
  const layout = () => {
    root.classList.remove('is-narrow');
    let n = size.width < 800;
    if (!n) {
      const hud = root.querySelector('.lb-hud')?.getBoundingClientRect(), ch = chipsBox.getBoundingClientRect();
      n = !!hud && hud.width > 0 && ch.width > 0 && hud.right + 12 > ch.left && hud.top < ch.bottom + 4 && hud.bottom > ch.top - 4;
    }
    root.classList.toggle('is-narrow', n);
    const sc = root.querySelector<HTMLElement>('.lb-scope');
    if (sc) root.style.setProperty('--lbm-scope-h', `${Math.ceil(sc.offsetHeight)}px`);
    compose();
    // where no tag stands: the HUD, the chips, the scope line, the pages button (their boxes, 4 px round)
    const o = root.getBoundingClientRect();
    keepOut = [root.querySelector('.lb-hud'), chipsBox, sc, pagesBtn].flatMap((e) => {
      const r = e?.getBoundingClientRect();
      return r && r.width > 0 && r.height > 0 ? [[r.left - o.left - 4, r.top - o.top - 4, r.right - o.left + 4, r.bottom - o.top + 4] as [number, number, number, number]] : [];
    });
  };
  let keepOut: [number, number, number, number][] = [];
  /** The farthest the visitor zooms out: Living Brain's 7, or more where the stage's framing needs it. */
  const dMax = () => Math.max(7, frame(VIEW.all).dist * 1.2);
  const fillDrawer = () => {
    drawer.replaceChildren();
    // its head: what it lists, and its close (the site's close glyph)
    const head = document.createElement('div'); head.className = 'lbm-drawerhead';
    const title = document.createElement('p'); title.textContent = 'Pages';
    const x = document.createElement('button'); x.type = 'button'; x.className = 'lbm-close'; x.setAttribute('aria-label', 'Close the page list');
    x.appendChild(glyph('close', 12));
    x.addEventListener('click', () => setDrawer(false));
    head.append(title, x);
    drawer.append(head);
    const ids = S.focus === 'all' ? BRAIN_IDS : [S.focus];
    for (const b of ids) {
      const h = document.createElement('h4'); h.textContent = `${PLAIN[b]} · ${brainOf(b).pages}`;
      // a page picked: the drawer closes and its card takes the focus; the card's close gives it to the Pages button
      drawer.append(h, pageRows(b, (p) => {
        keepFocus(() => { setDrawer(false); select(p.brain, p.slug, 'user'); });
        if (S.sel && S.sel.brain === p.brain && S.sel.slug === p.slug) { returnTo = pagesBtn; focusCard(); }
      }));
    }
  };
  const renderCard = () => {
    cardbox.replaceChildren();
    root.classList.remove('has-card');
    const s = S.sel, p = s ? page(s.brain, s.slug) : null;
    if (p) {
      root.classList.add('has-card');
      cardbox.appendChild(pageCard(p, {
        // a row in the card pins its page: the new card takes the focus the row had
        select: (b, slug) => { const inCard = cardbox.contains(document.activeElement); keepFocus(() => select(b, slug, 'user')); if (inCard) focusCard(); },
        route: (t) => { emit('route', t); opts.onRoute?.(t); }, close: () => closeCard(), tabs, fix,
      }));
    }
    compose();
  };
  // the card's list of links across brains, looked at: the pointer over it, a row in it focused, a Why in it opened
  const acrossSec = (t) => !!t?.closest?.('.lbm-sec[data-sec="across"]');
  cardbox.addEventListener('pointerover', (e) => { if (e.pointerType !== 'touch' && acrossSec(e.target)) showAcross(); });
  cardbox.addEventListener('focusin', (e) => { if (acrossSec(e.target) && e.target.matches?.(':focus-visible')) showAcross(); });
  // a Why opened (toggle does not bubble): in the across list it shows them; in the narrow layout the sheet's height moves
  cardbox.addEventListener('toggle', (e) => { if (e.target.open && acrossSec(e.target)) showAcross(); compose(); }, true);
  /** The card closed (its close, or Escape): focus goes back to the list row its page was picked from, else the stage. */
  const closeCard = () => {
    const back = returnTo; returnTo = null;
    keepFocus(() => select(null, null, 'user'));
    if (back && back.isConnected && root.contains(back) && !back.closest('[hidden]') && root.contains(document.activeElement)) back.focus({ preventScroll: true });
  };
  const setHover = (h: null | { brain: string; slug: string }) => {
    if ((h?.brain ?? '') + (h?.slug ?? '') === (S.hover?.brain ?? '') + (S.hover?.slug ?? '')) return;
    S.hover = h;
    // a page under the pointer holds the turn, so its tag stays where the pointer is
    if (h) S.pauseUntil = Math.max(S.pauseUntil, now() + 4);
    hoverEl?.remove(); hoverEl = null;
    if (h && !(S.sel && S.sel.brain === h.brain && S.sel.slug === h.slug)) {
      const p = page(h.brain, h.slug);
      if (p) { hoverEl = hoverCard(p); root.appendChild(hoverEl); }
    }
    canvas.style.cursor = h ? 'pointer' : '';
  };

  // ── focus and selection ─────────────────────────────────────────────────────────────────────────────────
  /** A focus's framing: Living Brain's distance, over max(0.68, 1.15 x aspect) on a stage narrower than it is tall;
   *  the all view there over max(0.5, 0.85 x aspect), its orbit drawn in (orbitScale) so the members and their names
   *  stay on the stage. */
  const frame = (v: { dist: number; el: number }) => {
    const a = size.width / size.height;
    if (v !== VIEW.all) return { dist: v.dist / (a >= 1 ? 1 : Math.max(0.68, 1.15 * a)), el: v.el };
    return { dist: v.dist / (a >= 1 ? 1 : Math.max(0.5, 0.85 * a)), el: v.el };
  };
  /** The orbit's scale for the stage: 1 on a wide one; on a tall one, the half-width the all view's camera sees at the
   *  center, less a member's half-extent, over the orbit's radius (0.7 at least). */
  const orbitScale = () => {
    const a = size.width / size.height;
    if (a >= 1) return 1;
    const half = frame(VIEW.all).dist * Math.tan(((VFOV / 2) * Math.PI) / 180) * a;
    return Math.min(1, Math.max(0.7, (half * 0.92 - 0.3) / ORBIT.radius));
  };
  S.orbitK = orbitScale();
  /** The camera's distance as Living Brain's framing would have it: on a stage narrower than it is tall, the brain view
   *  frames from farther off (frame()), so the zoom's fades and the tags' are measured against that framing. */
  const zoomDist = () => (S.cam.dist * REST.dist) / frame(VIEW.brain).dist;
  const animateCam = (to: { dist: number; el: number; az?: number }, dur = DUR) => {
    S.camA = { ...S.cam }; S.camB = { az: S.cam.az, ...to }; S.ct0 = now(); S.camDur = reduced ? 0.2 : dur; S.zoomTo = null;
    if (to.az != null) S.pauseUntil = now() + S.camDur + 4;
  };
  /** The pointer, still, as the view moves under it: hover waits for it to really move (a tag sliding under a still
   *  pointer never takes the hover from the selection). */
  const holdHover = () => { S.still = Number.isFinite(S.ptr.x) ? { ...S.ptr } : null; };
  /** The stage's free area beside a pinned card (CSS px from the root's top left): left of the card, or above the bottom
   *  sheet in the narrow layout. */
  const freeArea = () => {
    const card = S.sel ? cardbox.querySelector('.lbm-card') : null;
    const W = size.width, H = size.height;
    if (!card) return { x0: 16, x1: W - 16, y0: 16, y1: H - 16 };
    const r = card.getBoundingClientRect(), o = root.getBoundingClientRect();
    return root.classList.contains('is-narrow') ? { x0: 16, x1: W - 16, y0: 52, y1: r.top - o.top - 16 } : { x0: 16, x1: r.left - o.left - 16, y0: 16, y1: H - 16 };
  };
  /** The composition beside a pinned card: the scene shifted left by half the width the card takes (and its margin),
   *  so the brain stands in the middle of the stage left of it; in the narrow layout up by half the bottom sheet's
   *  height, so the selection and its lit connections sit above the sheet. Eased in draw(); none without a card. */
  const compose = () => {
    const card = S.sel ? cardbox.querySelector('.lbm-card') : null;
    S.shiftTo = { x: 0, y: 0 };
    if (!card) return;
    const r = card.getBoundingClientRect(), o = root.getBoundingClientRect();
    if (root.classList.contains('is-narrow')) S.shiftTo.y = Math.max(0, o.bottom - r.top) / 2 / size.height;
    else S.shiftTo.x = -Math.max(0, o.right - r.left) / 2 / size.width;
  };
  /** The azimuth, near the camera's, that puts the brains a selected page links to off to the sides of the one at the
   *  center (where they would sit behind or in front of it, the links across brains would hide in it), among those that
   *  keep them in the stage's free area at that distance (left of the card, or above the sheet); the camera's own
   *  azimuth when none does. */
  const sideAz = (brains: string[], t: number, dist: number) => {
    const at = brains.map((b) => BrainWorld.orbitAt(BRAIN_IDS.indexOf(b), PHASE + (2 * Math.PI * BRAIN_IDS.indexOf(b)) / 3 + (reduced ? FREEZE : t) * (2 * Math.PI) / ORBIT.period).multiplyScalar(S.orbitK));
    const cam = new THREE.PerspectiveCamera(VFOV, size.width / size.height, 0.05, 200);
    cam.updateProjectionMatrix();
    cam.projectionMatrix.elements[8] = -2 * S.shiftTo.x; cam.projectionMatrix.elements[9] = -2 * S.shiftTo.y;
    const free = freeArea(), m = 40, e = (S.cam.el * Math.PI) / 180, v = new THREE.Vector3();
    const inside = (p) => {
      v.copy(p).applyMatrix4(cam.matrixWorldInverse);
      if (v.z >= 0) return false;
      v.copy(p).project(cam);
      const x = ((v.x + 1) / 2) * size.width, y = ((1 - v.y) / 2) * size.height;
      return x > free.x0 + m && x < free.x1 - m && y > free.y0 + m && y < free.y1 - m;
    };
    let best = S.cam.az, bestScore = -Infinity;
    for (let d = 0; d <= 150; d += 5) for (const sgn of d ? [1, -1] : [1]) {
      const a = ((S.cam.az + sgn * d) * Math.PI) / 180;
      cam.position.set(Math.sin(a) * Math.cos(e) * dist, Math.sin(e) * dist, -Math.cos(a) * Math.cos(e) * dist);
      cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
      if (!at.every(inside)) continue;
      // the camera's right is (-cos a, 0, -sin a) and its line of sight toward the target (-sin a, 0, cos a), level
      const score = Math.min(...at.map((p) => Math.abs(-p.x * Math.cos(a) - p.z * Math.sin(a)) - 0.25 * Math.max(0, -p.x * Math.sin(a) + p.z * Math.cos(a))));
      if (score > bestScore + 0.02) { bestScore = score; best = S.cam.az + sgn * d; }
    }
    return best;
  };
  /** The visitor looks at a pinned card's links across brains (the pointer over that list, a row in it focused, or a Why
   *  in it opened): once for this selection, the camera eases out until the brains they reach are in the picture (LB6's
   *  pull back), turning only as far as keeps them in the stage's free area. A click never moves the camera (Living
   *  Brain's rule: a selection only lights things). */
  const showAcross = () => {
    const s = S.sel;
    if (!s || S.focus !== s.brain) return;
    const key = keyOf(s.brain, s.slug), xs = acrossOf(s.brain, s.slug);
    if (S.acrossFor === key || !xs.length) return;
    S.acrossFor = key;
    const dist = Math.max((3.4 * frame(VIEW.brain).dist) / REST.dist, S.cam.dist);
    animateCam({ dist, el: S.cam.el, az: sideAz([...new Set(xs.map((x) => x.other.brain))], now() + 1.2, dist) }, 1.2);
  };
  const focusBrain = (b: BrainFocus, who: 'user' | 'host') => {
    if (b === S.focus) return;
    S.from = S.focus; S.focus = b; S.ft0 = now();
    if (S.sel && S.sel.brain !== b) S.sel = null;
    setHover(null); holdHover();
    animateCam(frame(b === 'all' ? VIEW.all : VIEW.brain));
    setBridges(); renderChrome(); renderCard();
    if (who === 'user') { const s = state(); emit('state', s); opts.onState?.(s, { history: 'push' }); }
  };
  const select = (b: string | null, slug: string | null, who: 'user' | 'host') => {
    if (b && slug && !page(b, slug)) return;
    // a page in another brain, or picked in the combined view: its brain comes to the center first, so the selection is
    // one the URL and the page view share (a history entry for the brain, then the page replacing it)
    if (b && slug && b !== S.focus) focusBrain(b, who);
    S.sel = b && slug ? { brain: b, slug } : null;
    if (!S.sel) S.acrossFor = '';
    setHover(null); holdHover();
    // the camera stays where the visitor left it: the selection only lights things, and the scene is composed beside
    // the card (compose); the links across brains come into the picture when the visitor looks at them (showAcross)
    setBridges(); renderCard();
    if (who === 'user') { const s = state(); emit('state', s); opts.onState?.(s, { history: 'replace' }); }
  };

  // ── the pose of the world now ───────────────────────────────────────────────────────────────────────────────
  const centerTagIdx = world.centerPages.map((p, i) => ({ p, i, w: p.connections + 2 * p.across })).sort((a, b) => b.w - a.w).slice(0, 28).map((x) => x.i);
  const pose = (t: number) => {
    const k = reduced ? (t - S.ft0 >= 0.2 ? 1 : (t - S.ft0) / 0.2) : calm((t - S.ft0) / DUR);
    const wOf = (x: BrainFocus) => (S.focus === x ? k : 0) + (S.from === x ? 1 - k : 0);
    const fs = t - S.form0, formK = clamp01(fs / 3.2);
    // the members, their tags, the filaments and the links across brains fade with the zoom (Living Brain's 2.15 to
    // 3.1), measured against the stage's own framing: a tall stage frames a brain from farther off, as if from 2.08
    const zoom = smooth((zoomDist() - 2.15) / (3.1 - 2.15));
    // a selected page keeps its connections lit while another is hovered (the hover shows only its small card)
    const target = S.sel ?? S.hover;
    const key = target ? `${target.brain}/${target.slug}` : '';
    if (key !== S.hl) { S.hl = key; S.hlT0 = t; }
    const selT = reduced ? 1.1 : ((t - S.hlT0) / 2) * 1.1;
    const members = {};
    BRAIN_IDS.forEach((b, m) => {
      const w = wOf(b), cw = calm(w);
      const orb = BrainWorld.orbitAt(m, PHASE + (2 * Math.PI * m) / 3 + (2 * Math.PI * (reduced ? FREEZE : t)) / ORBIT.period).multiplyScalar(S.orbitK);
      const vis = lerp(zoom, 1, w);
      const idx = target && target.brain === b && w > 0.5 ? world.memberIndex[b].get(target.slug) ?? -1 : -1;
      // on its orbit a member shows its profile (moments.ts T_SHARED yawM); at the center it turns back
      members[b] = {
        pos: orb.lerp(new THREE.Vector3(), cw), scale: lerp(0.42 * SC[m], 1, cw), yaw: YAW[m] * (1 - cw),
        st: { time: reduced ? 3.1 : t, form: formK, coreForm: 1, breath: reduced ? 0 : 0.06 * w, tint: new THREE.Color(brainOf(b).color), tintK: lerp(0.72, 0, cw),
          bright: vis * (w < 0.5 ? 1.25 : 1), coreK: w, pageFade: vis * smooth((fs - 1.8) / 1.1), sel: idx, selT },
      };
      // a member on its orbit draws 24,000 of its particles (12,000 on phones) at 1.25 times the brightness (SPEC 6.5)
      const draw = w < 0.5 ? (lite ? 12000 : 24000) : Infinity;
      world.members[b].body.geometry.setDrawRange(0, draw);
    });
    const wAll = wOf('all');
    const cIdx = target && wAll > 0.5 ? world.centerIndex.get(keyOf(target.brain, target.slug)) ?? -1 : -1;
    const center = {
      pos: new THREE.Vector3(), scale: 1, yaw: 0,
      st: { time: reduced ? 3.1 : t, form: formK, coreForm: smooth((fs - 0.6) / 2.4), breath: reduced ? 0 : 0.06, tint: new THREE.Color(1, 1, 1), tintK: 0,
        // the links across brains at full as they come in and while a page is lit, else settled to 0.6, so the combined
        // brain reads as a brain under them
        bright: wAll, coreK: wAll, pageFade: wAll * smooth((fs - 1.8) / 1.1), sel: cIdx, selT, extraTime: 1e3,
        extraFade: wAll * smooth((fs - 1.8) / 1.1) * lerp(0.6, 1, Math.max(1 - smooth((fs - 4.5) / 1.0), S.litK)) },
    };
    // the camera: the visitor's, eased to a focus's framing; Living Brain's auto-rotate unless paused
    if (S.camB) {
      const e = calm((t - S.ct0) / S.camDur);
      S.cam.dist = Math.exp(lerp(Math.log(S.camA.dist), Math.log(S.camB.dist), e)); S.cam.el = lerp(S.camA.el, S.camB.el, e);
      if (S.camB.az !== S.camA.az) S.cam.az = lerp(S.camA.az, S.camB.az, e);
      if (e >= 1) S.camB = null;
    }
    return {
      time: reduced ? 3.1 : t,
      cam: { target: new THREE.Vector3(), az: S.cam.az, el: S.cam.el, dist: S.cam.dist },
      center, members,
      filaments: wAll * zoom * smooth((fs - 1.8) / 1.1), orbs: reduced ? 0 : wAll * zoom * smooth((fs - 2.9) / 0.7), motes: reduced ? 0 : 1,
      sparks: null, landing: null, links: null, review: null, conflict: wAll * 0.75 * smooth((fs - 2.9) / 0.6),
      _w: { wOf, zoom, fs, k, target, t },
    };
  };

  // the tags for the pose: the center's 28 heaviest in the combined view, a focused brain's 28, the lit page's
  // connected pages, and a selected page's pages across brains
  const tagSpecs = (P) => {
    const { wOf, zoom, fs, target } = P._w;
    const reveal = (n: number) => smooth((fs - 2.9 - (n % 10) * 0.05) / 0.7);
    const specs = [];
    const lit = new Set<string>();
    if (target) {
      for (const { other } of linksOf(target.brain, target.slug)) lit.add(keyOf(other.brain, other.slug));
      for (const { other } of acrossOf(target.brain, target.slug)) lit.add(keyOf(other.brain, other.slug));
    }
    const isT = (p) => target && p.brain === target.brain && p.slug === target.slug;
    const isS = (p) => S.sel && p.brain === S.sel.brain && p.slug === S.sel.slug;
    const wAll = wOf('all');
    if (wAll > 0.02) {
      const ids = new Set(centerTagIdx);
      // while the conflict's rose arc is drawn, its two pages are tagged in rose, as the story's stop flags them
      const conflictOn = P.conflict > 0.02;
      const inConflict = (p) => conflictOn && !!conflictOf(p.brain, p.slug);
      world.centerPages.forEach((p, i) => { if (isT(p) || isS(p) || (target && lit.has(keyOf(p.brain, p.slug))) || inConflict(p)) ids.add(i); });
      for (const i of ids) {
        const p = world.centerPages[i], cf = inConflict(p);
        specs.push({ id: `c:${p.brain}/${p.slug}`, cloud: 'center', index: i, page: p, color: brainOf(p.brain).color, k: wAll * reveal(p.n), order: isS(p) ? -9 : isT(p) ? -8 : cf ? -6 : centerTagIdx.indexOf(i) >= 0 ? centerTagIdx.indexOf(i) : 50 + p.n,
          view: 'combined', hot: isT(p) || lit.has(keyOf(p.brain, p.slug)) || cf, sel: !!isS(p), conflict: cf });
      }
    }
    for (const b of BRAIN_IDS) {
      const w = wOf(b);
      if (w < 0.02) continue;
      world.memberPages[b].forEach((p, i) => {
        const on = p.n <= 28 || isT(p) || isS(p) || (target && target.brain === b && lit.has(keyOf(p.brain, p.slug)));
        if (!on) return;
        specs.push({ id: `m:${b}/${p.slug}`, cloud: b, index: i, page: p, color: '#b59aff', k: w * (S.ft0 < 0 ? 1 : smooth((P._w.t - S.ft0 - (reduced ? 0 : 0.5)) / (reduced ? 0.2 : 0.8))) * reveal(p.n), order: isS(p) ? -9 : isT(p) ? -8 : p.n,
          hot: isT(p) || (target && lit.has(keyOf(p.brain, p.slug))), sel: !!isS(p) });
      });
    }
    // the far ends of a selected page's links across brains, where their brains are in the picture
    for (const e of bridgeEnds) {
      const p = world.memberPages[e.brain][e.index];
      const k = (1 - wOf(e.brain)) * zoom;
      if (k > 0.02) specs.push({ id: `x:${e.brain}/${p.slug}`, cloud: e.brain, index: e.index, page: p, color: brainOf(e.brain).color, k, order: -7, hot: true });
    }
    return specs;
  };

  // ── drawing ───────────────────────────────────────────────────────────────────────────────────────────────
  let lastP = null, project = null;
  const draw = () => {
    const t = now();
    const dt = Math.min(0.1, Math.max(0, t - S.lastT)); S.lastT = t;
    // Living Brain's auto-rotate, 2.25 degrees a second, paused while the visitor moves it and for 4 s after
    if (!reduced && t > S.pauseUntil && !S.drag) S.cam.az += ((SPIN * 180) / Math.PI) * dt;
    // its damping: the drag's rotation applied 8 % a frame, the rest carried (the inertia after a drag)
    if (Math.abs(S.vel.az) + Math.abs(S.vel.el) > 1e-4) {
      S.cam.az += S.vel.az * 0.08; S.cam.el = Math.max(-85, Math.min(85, S.cam.el + S.vel.el * 0.08));
      S.vel.az *= 0.92; S.vel.el *= 0.92;
    }
    // the wheel's zoom eased toward its target, about 120 ms (a mouse's notch is a step, not a jump)
    if (S.zoomTo != null) {
      S.cam.dist += (S.zoomTo - S.cam.dist) * (reduced ? 1 : 1 - Math.exp(-dt / 0.12));
      if (Math.abs(S.zoomTo - S.cam.dist) < 1e-3) { S.cam.dist = S.zoomTo; S.zoomTo = null; }
    }
    // a lit page (selected or hovered) brings the links across brains to full
    S.litK += ((S.sel || S.hover ? 1 : 0) - S.litK) * (reduced ? 1 : 1 - Math.exp(-dt / 0.2));
    const P = pose(t);
    lastP = P;
    // the composition beside a pinned card (compose), eased over about 250 ms
    const sk = reduced ? 1 : 1 - Math.exp(-dt / 0.25);
    S.shift.x += (S.shiftTo.x - S.shift.x) * sk; S.shift.y += (S.shiftTo.y - S.shift.y) * sk;
    stage.setCamera({ ...restPose(), shift: [S.shift.x, S.shift.y] });
    stage.camera.updateMatrixWorld();
    world.apply(P, { height: size.height, dpr }, stage.camera);
    if (bridges) {
      const s = S.sel, from = world.memberIndex[S.focus]?.get(s?.slug);
      const U = bridges.uniforms;
      U.uPixelRatio.value = dpr; U.uRes.value.set(size.width * dpr, size.height * dpr); U.uTime.value = t - bridges.t0;
      U.uFade.value = P._w.zoom;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), out = new Float32Array(41 * 3);
      bridgeEnds.forEach((e, i) => {
        world.members[S.focus].pageWorld(from, a); world.members[e.brain].pageWorld(e.index, b);
        world.root.worldToLocal(a); world.root.worldToLocal(b);
        const mid = a.clone().add(b).multiplyScalar(0.5); const away = mid.clone(); away.y += 0.3; away.normalize();
        new THREE.QuadraticBezierCurve3(a, mid.addScaledVector(away, 0.35 + 0.06 * i), b).getPoints(40).forEach((q, j) => { out[j * 3] = q.x; out[j * 3 + 1] = q.y; out[j * 3 + 2] = q.z; });
        bridges.setLine(i, out);
      });
      bridges.commit();
    }
    stage.render();
    // the words, laid out against the camera as drawn
    project = projectorNow(world, size, stage.camera);
    const specs = tagSpecs(P);
    // the member brains' tags take part in the overlap rule, the farther member's giving way
    const d = zoomDist();
    const mt = BRAIN_IDS.map((b) => {
      const w = P._w.wOf(b), vis = (1 - w) * (d > 2.6 ? 1 : P._w.zoom) * smooth((P._w.fs - 2.9) / 0.7);
      return { b, ms: memberScreen(world, b, stage.camera, size), k: { name: vis, detail: vis } };
    });
    const kept = chrome.keptAt(specs, project, mt, keepOut);
    chrome.tags(specs, project, (id) => (kept.has(id) ? 1 : 0), d);
    for (const m of mt) chrome.member(m.b, { name: m.ms.name, detail: m.ms.detail, center: m.ms.center }, { name: kept.has(`mn:${m.b}`) ? m.k.name : 0, detail: kept.has(`md:${m.b}`) ? m.k.detail : 0 }, S.hoverBrain === m.b);
    if (hoverEl && S.hover) {
      const s = screenOf(S.hover.brain, S.hover.slug);
      if (s) {
        const w = hoverEl.offsetWidth, h = hoverEl.offsetHeight;
        let x = s.x - w / 2, y = s.y + 18;
        if (y + h > size.height - 8) y = s.y - 18 - h;
        x = Math.max(8, Math.min(size.width - w - 8, x));
        hoverEl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      }
    }
  };
  const loop = () => {
    raf = 0;
    if (disposed) return;
    draw();
    if (visible && !document.hidden) raf = requestAnimationFrame(loop);
  };
  let visible = true;
  const kick = () => { if (!raf && !disposed && visible && !document.hidden) raf = requestAnimationFrame(loop); };

  // where a page is on screen: its tag if shown, else its dot
  const screenOf = (b: string, slug: string) => {
    if (!project) return null;
    // the page's tag that shows (a page can have two: the combined view's and its own brain's, one of them hidden)
    const tag = [...root.querySelectorAll(`.lb-tag[data-brain="${b}"][data-page="${CSS.escape(slug)}"]`)]
      .filter((t: HTMLElement) => t.style.visibility !== 'hidden').sort((x: HTMLElement, y: HTMLElement) => Number(y.style.opacity) - Number(x.style.opacity))[0] as HTMLElement | undefined;
    if (tag && Number(tag.style.opacity) > 0.3) {
      const r = tag.getBoundingClientRect(), o = root.getBoundingClientRect();
      return { x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2 };
    }
    const inCenter = S.focus === 'all';
    const idx = inCenter ? world.centerIndex.get(keyOf(b, slug)) : b === S.focus ? world.memberIndex[b].get(slug) : undefined;
    if (idx == null) return null;
    const s = project(inCenter ? 'center' : b, idx);
    return s.behind || s.x < 0 || s.y < 0 || s.x > size.width || s.y > size.height ? null : { x: s.x, y: s.y };
  };
  const dotOf = (b: string, slug: string) => {
    if (!project) return null;
    const inCenter = S.focus === 'all';
    const idx = inCenter ? world.centerIndex.get(keyOf(b, slug)) : b === S.focus ? world.memberIndex[b].get(slug) : undefined;
    if (idx == null) return null;
    const s = project(inCenter ? 'center' : b, idx);
    return s.behind ? null : { x: s.x, y: s.y, facing: s.facing };
  };
  const brainAt = (b: string) => {
    if (!BRAIN_IDS.includes(b)) return null;
    const ms = memberScreen(world, b, stage.camera, size);
    return ms.center.behind ? null : { x: ms.center.x, y: ms.center.y, r: ms.r };
  };

  // ── input: tags and member tags (DOM), the canvas (drag, click, wheel, pinch), keys ──────────────────────
  const local = (e) => { const r = root.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const tagOf = (t) => t?.closest?.('.lb-tag[data-page]');
  const memberOf = (t) => t?.closest?.('.lb-member[data-brain], .lb-detail[data-brain]');
  const stillPtr = (e) => !!S.still && e.clientX === S.still.x && e.clientY === S.still.y;
  const onOver = (e) => {
    if (stillPtr(e)) return;
    const tg = tagOf(e.target), mb = memberOf(e.target);
    if (tg) setHover({ brain: tg.dataset.brain, slug: tg.dataset.page });
    if (mb) S.hoverBrain = mb.dataset.brain;
  };
  const onOut = (e) => {
    const tg = tagOf(e.target), mb = memberOf(e.target);
    if (tg && !tagOf(e.relatedTarget)) setHover(null);
    if (mb && !memberOf(e.relatedTarget)) S.hoverBrain = null;
  };
  const onClick = (e) => {
    const tg = tagOf(e.target), mb = memberOf(e.target), act = e.target?.closest?.('[data-act]');
    if (act?.dataset.act === 'conflict' && SCENE.conflicts.length) {
      // the conflict's page in the build's brain (its card carries the conflict); focus into the card from the keyboard
      const c = SCENE.conflicts[0].a, fromKeys = act.matches(':focus-visible');
      keepFocus(() => select(c.brain, c.slug, 'user'));
      if (fromKeys) { returnTo = null; focusCard(); }
      e.stopPropagation(); return;
    }
    if (tg) { select(tg.dataset.brain, tg.dataset.page, 'user'); e.stopPropagation(); }
    else if (mb) { focusBrain(mb.dataset.brain, 'user'); e.stopPropagation(); }
  };
  chrome.el.addEventListener('pointerover', onOver); chrome.el.addEventListener('pointerout', onOut); chrome.el.addEventListener('click', onClick);
  // picking on the canvas: a member brain in the combined view, else the nearest page dot within 12 px
  const pick = (x: number, y: number) => {
    if (S.focus === 'all') {
      for (const b of BRAIN_IDS) { const m = brainAt(b); if (m && Math.hypot(x - m.x, y - m.y) < m.r * 0.9) return { brain: b }; }
    }
    let best = null, bd = 12;
    const cloud = S.focus === 'all' ? 'center' : S.focus, pages = S.focus === 'all' ? world.centerPages : world.memberPages[S.focus];
    pages.forEach((p, i) => { const s = project?.(cloud, i); if (!s || s.behind) return; const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = p; } });
    return best ? { page: best } : null;
  };
  const pts = new Map();
  let down = null, pinch0 = 0;
  const onDown = (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, local(e));
    if (pts.size === 1) { down = { ...local(e), moved: 0 }; S.drag = true; root.classList.add('is-grab'); }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
    S.pauseUntil = now() + 4;
  };
  const onMove = (e) => {
    const p = local(e);
    if (pts.has(e.pointerId)) {
      const prev = pts.get(e.pointerId); pts.set(e.pointerId, p);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) S.cam.dist = Math.max(1.4, Math.min(dMax(), S.cam.dist * (pinch0 / d))); pinch0 = d; S.camB = null; S.zoomTo = null;
      } else if (down) {
        const dx = p.x - prev.x, dy = p.y - prev.y;
        down.moved += Math.abs(dx) + Math.abs(dy);
        // Living Brain's rotate speed 0.6: a drag the stage's height long turns 0.6 of a full turn
        S.vel.az += -((360 * dx) / size.height) * 0.6;
        S.vel.el += ((360 * dy) / size.height) * 0.6;
      }
      S.pauseUntil = now() + 4;
      return;
    }
    if (e.pointerType === 'touch' || stillPtr(e)) return;
    const hit = pick(p.x, p.y);
    if (hit?.page) setHover({ brain: hit.page.brain, slug: hit.page.slug }); else if (!tagOf(e.target)) setHover(null);
    S.hoverBrain = hit?.brain ?? (memberOf(e.target)?.dataset.brain ?? null);
    canvas.style.cursor = hit ? 'pointer' : '';
  };
  const onUp = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch0 = 0;
    if (!pts.size) {
      S.drag = false; root.classList.remove('is-grab');
      if (down && down.moved < 6) {
        const p = local(e), hit = pick(p.x, p.y);
        if (hit?.brain) focusBrain(hit.brain, 'user');
        else if (hit?.page) select(hit.page.brain, hit.page.slug, 'user');
      }
      down = null;
    }
  };
  // the browser took the gesture (a vertical swipe scrolls the page): the drag ends where it is, its turn and tilt
  // with it, and nothing is picked
  const onCancel = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch0 = 0;
    if (!pts.size) { S.drag = false; root.classList.remove('is-grab'); down = null; S.vel.az = 0; S.vel.el = 0; }
  };
  // the wheel zooms with Ctrl or ⌘ held (a trackpad's pinch arrives with ctrlKey) or once the visitor has pressed on the
  // stage (until the pointer leaves it or the window loses focus); otherwise the page scrolls on, and the hint says how
  // to zoom, once each time the pointer comes onto the stage
  let engaged = false, tipped = false, tipTimer = 0;
  const tip = () => {
    if (tipped) return;
    tipped = true;
    hint.textContent = 'Hold Ctrl or ⌘ to zoom'; hint.classList.add('is-tip');
    clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => { hint.classList.remove('is-tip'); hint.textContent = hintText(); }, 2000);
  };
  const onEngage = () => { engaged = true; };
  const onLeave = () => { engaged = false; tipped = false; };
  root.addEventListener('pointerdown', onEngage);
  root.addEventListener('pointerleave', onLeave);
  window.addEventListener('blur', onLeave);
  cleanups.push(() => { root.removeEventListener('pointerdown', onEngage); root.removeEventListener('pointerleave', onLeave); window.removeEventListener('blur', onLeave); clearTimeout(tipTimer); });
  const onWheel = (e) => {
    if (!(e.ctrlKey || e.metaKey || engaged)) { tip(); return; }
    e.preventDefault();
    // Living Brain's zoom speed 0.8: a 120 px notch takes the distance times 0.952, eased in draw()
    S.zoomTo = Math.max(1.4, Math.min(dMax(), (S.zoomTo ?? S.cam.dist) * Math.pow(0.952, -e.deltaY / 120)));
    S.camB = null; S.pauseUntil = now() + 4;
  };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', (e) => { if (!pts.size && !tagOf(e.relatedTarget)) { setHover(null); S.hoverBrain = null; } });
  canvas.addEventListener('wheel', onWheel, { passive: false });
  // the pointer's last real position: a move that changes it lets hover act again
  const onPtr = (e) => { if (e.clientX !== S.ptr.x || e.clientY !== S.ptr.y) { S.ptr = { x: e.clientX, y: e.clientY }; S.still = null; } };
  root.addEventListener('pointermove', onPtr);
  cleanups.push(() => root.removeEventListener('pointermove', onPtr));
  const onKey = (e) => {
    if (e.key === 'Escape') {
      // the pages drawer first; then the card, then the brain. The control that had focus may go with the card or the
      // brain's page list: focus comes back to the stage
      if (!drawer.hidden) setDrawer(false);
      else if (S.sel) closeCard(); else if (S.focus !== 'all') keepFocus(() => focusBrain('all', 'user'));
      e.preventDefault(); return;
    }
    if (e.target !== root) return;
    const step = { ArrowLeft: [-6, 0], ArrowRight: [6, 0], ArrowUp: [0, 4], ArrowDown: [0, -4] }[e.key];
    if (step) { S.cam.az += step[0]; S.cam.el = Math.max(-85, Math.min(85, S.cam.el + step[1])); S.pauseUntil = now() + 4; e.preventDefault(); }
    if (e.key === '+' || e.key === '=') { S.zoomTo = Math.max(1.4, (S.zoomTo ?? S.cam.dist) * 0.9); S.camB = null; e.preventDefault(); }
    if (e.key === '-') { S.zoomTo = Math.min(dMax(), (S.zoomTo ?? S.cam.dist) / 0.9); S.camB = null; e.preventDefault(); }
  };
  root.addEventListener('keydown', onKey);
  cleanups.push(() => { chrome.el.removeEventListener('pointerover', onOver); chrome.el.removeEventListener('pointerout', onOut); chrome.el.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey); });

  // ── visibility, size ────────────────────────────────────────────────────────────────────────────────────
  const io = new IntersectionObserver((es) => { visible = es.some((x) => x.isIntersecting); kick(); });
  io.observe(root);
  const onVis = () => kick();
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(() => {
    const W = Math.max(320, el.clientWidth || size.width), H = Math.max(320, el.clientHeight || size.height);
    if (W === size.width && H === size.height) return;
    size.width = W; size.height = H;
    stage.setSize(W, H, dpr); world.setAspect(W / H); bloom.setSize(Math.round(W * dpr), Math.round(H * dpr));
    S.orbitK = orbitScale();
    layout();
    kick();
  });
  ro.observe(el);
  cleanups.push(() => { io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); });

  Object.assign(S.cam, frame(S.focus === 'all' ? VIEW.all : VIEW.brain));
  // a page opened cold: the brain's own framing (the camera moves for no selection), the scene composed beside its card
  renderChrome(); renderCard(); setBridges();
  S.shift = { ...S.shiftTo };
  const ready = (async () => {
    draw();
    await stage.preparePrograms([() => draw()], () => !disposed);
    kick();
    emit('ready');
  })().catch((e) => { emit('error', e); throw e; });

  return {
    ready,
    state,
    goTo(s) {
      const b = valid(s.brain) ? s.brain : S.focus;
      if (b !== S.focus) focusBrain(b, 'host');
      // a page needs its brain (slugs repeat across brains); the selection the view already has is left as it is, so a
      // host that writes the URL from onState and reads it back never moves the camera twice
      const cur = S.sel && S.sel.brain === b ? S.sel.slug : null;
      if (s.page === null) { if (S.sel) select(null, null, 'host'); }
      else if (s.page && b !== 'all' && s.page !== cur) select(b, s.page, 'host');
      kick();
    },
    setTheme(t) { root.dataset.siteTheme = t === 'light' ? 'light' : 'dark'; },
    on(ev, fn) { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev)!.add(fn); return () => listeners.get(ev)?.delete(fn); },
    screenOf, brainAt, dotOf,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      for (const f of cleanups.splice(0).reverse()) { try { f(); } catch { /* gone */ } }
      world.dispose(); chrome.dispose(); root.remove();
    },
  };
}

/** Without WebGL: the brains as chips and their pages as a list; a row opens the card. A page always comes with its
 *  brain (slugs repeat across brains), as the deep links need. */
function flatView(root, S, tabs, fix, opts, emit, listeners, kill): BrainHandle {
  root.classList.add('is-flat');
  const box = document.createElement('div'); box.className = 'lbm-flat'; root.appendChild(box);
  const tell = (history: 'push' | 'replace') => { const s = st(); emit('state', s); opts.onState?.(s, { history }); };
  const pick = (b, slug) => {
    // a page picked in the all-brains list focuses its brain
    const moved = S.focus !== b;
    S.focus = b; S.sel = { brain: b, slug }; render(); tell(moved ? 'push' : 'replace');
    // the card opens over the list's top: a row picked far down brings the box back up to it
    root.scrollTop = 0;
  };
  const render = () => {
    box.replaceChildren();
    box.appendChild(brainChips(S.focus, (b) => { S.focus = b; S.sel = null; render(); tell('push'); }));
    const note = document.createElement('p'); note.className = 'lbm-note';
    note.textContent = `${scopeLine(false)}. This browser has no WebGL, so the pages are listed.`;
    box.appendChild(note);
    const cardbox = document.createElement('div'); cardbox.className = 'lbm-cardbox';
    const ids = S.focus === 'all' ? BRAIN_IDS : [S.focus];
    for (const b of ids) {
      const h = document.createElement('h4'); h.textContent = `${PLAIN[b]} · ${brainOf(b).pages}`; h.className = 'lbm-listhead';
      box.append(h, pageRows(b, (p) => pick(p.brain, p.slug)));
    }
    if (S.sel) {
      const p = page(S.sel.brain, S.sel.slug);
      if (p) cardbox.appendChild(pageCard(p, { select: (b, slug) => pick(b, slug), route: (t) => { emit('route', t); opts.onRoute?.(t); }, close: () => { S.sel = null; render(); tell('replace'); }, tabs, fix }));
      box.prepend(cardbox);
    }
  };
  const st = () => ({ brain: S.focus, page: S.sel && S.sel.brain === S.focus ? S.sel.slug : null });
  const valid = (b) => b === 'all' || BRAIN_IDS.includes(b);
  render();
  setTimeout(() => emit('ready'));
  return {
    ready: Promise.resolve(), state: st,
    goTo(s) {
      if (valid(s.brain)) S.focus = s.brain;
      if (s.page !== undefined) S.sel = s.page && S.focus !== 'all' && page(S.focus, s.page) ? { brain: S.focus, slug: s.page } : null;
      render();
    },
    setTheme(t) { root.dataset.siteTheme = t === 'light' ? 'light' : 'dark'; },
    on(ev, fn) { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => listeners.get(ev)?.delete(fn); },
    screenOf: () => null, brainAt: () => null, dotOf: () => null,
    dispose: kill,
  };
}
