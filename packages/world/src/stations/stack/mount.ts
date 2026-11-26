// @ts-nocheck
// The stack, live, for the site: mountStack(el, { theme, onRoute }) builds S01's space in el at el's size and runs it.
// Hover a piece (or tap it) and its card opens beside it with its role and real integration; click the piece (or the
// card's button, or tap it again) and onRoute is called with the site tab that shows it (pieces.ts ROUTES). Keyboard:
// every piece is a button in a visually hidden list; focus opens its card, Enter routes. The same hover state is
// what the stills stack.inspect and stack.hover.<piece> show (hover.ts). The 3D holds its own theme whatever the
// page's (Jo, 26 Nov: the 3D renders dark and holds dark on the site); pass theme: 'light' for a light cut.
import '../../kit/css/fonts.css';
import { createWorldStage, assignLayers } from '../../lib/stage';
import { THREE, GrabBlurPass, markTexture, setLineResolution } from './kit';
import { buildSpace, PAL, POS } from './space';
import { injectCss, keyCard, zoneTitles, labelLayer } from './dom';
import { MARK_URLS } from './marks';
import { cards, labels, ROUTES, PIECE_IDS } from './pieces';
import { stageLook, fitRest, labelItems, zoneItems, afterItems, keyRows, screenBox } from './common';
import { hoverController } from './hover';
import { GLYPH_COLOR } from './glyphs';
import GF from './greenfield-record.json';
import TN from './integrations.json';

export type StackTheme = 'dark' | 'light';
export interface StackOptions {
  /** The 3D's own theme; the site passes 'dark' (the stage holds dark in either page theme). Default 'dark'. */
  theme?: StackTheme;
  /** Called with the site's tab id (pieces.ts ROUTES: fleet, about, forecast, state, hedge, risk, battery, memory,
   *  seal, files, verify, prices, season, launchpad, agents, add-agent) when a piece is clicked. */
  onRoute?: (tab: string) => void;
  /** frame-data.json's contents; by default the package's synced copy (src/data/frame-data.json). */
  data?: any;
  /** The key card, bottom right. Default true. */
  key?: boolean;
  /** Drawing-buffer pixels per CSS px. Default min(devicePixelRatio, 2). */
  dpr?: number;
  /** Comets hold still. Default: the reader's prefers-reduced-motion. */
  still?: boolean;
}
export interface StackHandle {
  /** Settles once the space is built and drawing. */
  readonly ready: Promise<void>;
  /** Every piece's id. */
  readonly pieces: readonly string[];
  /** Hover a piece as if pointed at (null: none): its card opens beside it. */
  hover(id: string | null): void;
  /** A point on screen where the piece is under the pointer, CSS px from el's top left (for a pointer in a recording,
   *  or a check); null when it is out of view. */
  screenOf(id: string): { x: number; y: number } | null;
  dispose(): void;
}

const dataFiles = import.meta.glob('../../data/frame-data.json', { import: 'default' });

export function mountStack(el: HTMLElement, opts: StackOptions = {}): StackHandle {
  const theme: StackTheme = opts.theme === 'light' ? 'light' : 'dark';
  const onRoute = opts.onRoute ?? (() => {});
  const still = opts.still ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let disposed = false, raf = 0, ro = null, io = null;
  const cleanups: (() => void)[] = [];
  let api = { hover: (_id) => {}, screenOf: (_id) => null };

  injectCss();
  const root = document.createElement('div');
  root.className = 'stk-root'; root.dataset.stkTheme = theme;
  Object.assign(root.style, { position: 'relative', width: '100%', height: '100%', overflow: 'hidden', isolation: 'isolate',
    background: theme === 'light' ? '#e9ecef' : '#101315', fontFamily: 'var(--w-font-sans, -apple-system, system-ui, "Segoe UI", Roboto, sans-serif)' });
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: 'manipulation' });
  const host = document.createElement('div'); host.className = 'stk-host'; host.dataset.stkTheme = theme;
  Object.assign(host.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  const nav = document.createElement('nav'); nav.className = 'stk-sr'; nav.setAttribute('aria-label', 'The pieces of the stack');
  root.append(canvas, host, nav); el.appendChild(root);

  const ready = (async () => {
    const d = opts.data ?? (await (dataFiles['../../data/frame-data.json']?.() ?? Promise.resolve(null)));
    if (!d) throw new Error('mountStack: no frame data (pass { data }, or sync src/data/frame-data.json)');
    if (disposed) return;
    // the element's own size (a phone's stage is about 200 px tall: a 240 px floor drew the space squeezed into it and
    // placed cards against a bottom edge 40 px below the visible one)
    const size = { W: Math.max(320, el.clientWidth || 960), H: Math.max(160, el.clientHeight || 540) };
    const dpr = opts.dpr ?? Math.min(2, window.devicePixelRatio || 1);
    root.style.setProperty('--u', String(size.W / 1920));
    host.style.setProperty('--stk-k', String(Math.max(0.8, Math.min(1, size.W / 1600))));
    const stage = createWorldStage({ canvas, width: size.W, height: size.H, dpr, theme, debug: false });
    cleanups.push(() => stage.dispose());
    stageLook(stage, theme);
    const withKey = opts.key !== false;
    const rectFor = (W, H) => (W < 720 ? { x0: 0.03, x1: 0.97, y0: 0.12, y1: 0.9 } : withKey ? { x0: 0.035, x1: 0.84, y0: 0.1, y1: 0.9 } : { x0: 0.035, x1: 0.965, y0: 0.1, y1: 0.9 });
    let fit = fitRest(stage, size.W, size.H, rectFor(size.W, size.H));
    stage.camera.updateMatrixWorld();

    const grab = new GrabBlurPass(size.W * dpr, size.H * dpr, { passes: 2, radius: 1.0 });
    stage.insertBeforeOverlay(grab);
    const mark = await markTexture();
    const blankC = document.createElement('canvas'); blankC.width = blankC.height = 4;
    const blank = { texture: new THREE.CanvasTexture(blankC), aspect: 1 };
    // the page's clock: once the managed trial has ended, the hosted evaluator reads as run (pieces.ts hosting)
    const now = Date.now() / 1000;
    const space = await buildSpace({ needData: () => d, dpr }, { theme, mpp: fit.mpp, camera: stage.camera, blur: grab.texture, res: new THREE.Vector2(size.W * dpr, size.H * dpr), mark, blank, footprints: false, now });
    if (disposed) return;
    assignLayers(space.root);
    stage.scene.add(space.root);
    setLineResolution(space.root, size.W, size.H, dpr);
    const camR = new THREE.Vector3().setFromMatrixColumn(stage.camera.matrixWorld, 0), camU = new THREE.Vector3().setFromMatrixColumn(stage.camera.matrixWorld, 1);
    const camD = new THREE.Vector3().setFromMatrixColumn(stage.camera.matrixWorld, 2).negate();
    space.aimCube(camR, camU, camD, true);
    stage.setShadowAuto(false);

    // ── words: labels, zone titles, the after-the-seal ticks, the key ──────────────────────────────────────────
    const v = new THREE.Vector3();
    const project = (p) => {
      v.set(p[0], p[1], p[2]).applyMatrix4(stage.camera.matrixWorldInverse); if (v.z >= 0) return null;
      v.set(p[0], p[1], p[2]).project(stage.camera); return { x: ((v.x + 1) / 2) * size.W, y: ((1 - v.y) / 2) * size.H };
    };
    const labs = labelLayer(host);
    let zones = [], ticks = [], keyEl = null;
    const layoutWords = () => {
      labs.set(labelItems(space, d, project), size.W);
      for (const z of zones) z.remove();
      // the zone titles' band sits over the space's top (Living Brain's sphere), wherever the fit put it
      const top = project([POS.brain.x, POS.brain.y + POS.brain.r, POS.brain.z]);
      zones = size.W < 720 ? [] : zoneTitles(host, zoneItems(project, Math.max(24, (top?.y ?? 80) - 46)), theme);
      root.classList.toggle('is-narrow', size.W < 720);
      for (const t of ticks) t.remove();
      ticks = afterItems(space).map((it) => {
        const p = project(it.at); if (!p) return null;
        const e = document.createElement('div'); e.className = 'intro-tick stk-after'; e.textContent = it.text;
        Object.assign(e.style, { position: 'absolute', left: '0', top: '0', whiteSpace: 'nowrap' }); labs.root.appendChild(e);
        const w = e.offsetWidth, h = e.offsetHeight;
        const x = it.align === 'right' ? p.x + 6 : p.x - w / 2, y = it.align === 'right' ? p.y - h / 2 : p.y - h - 4;
        e.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        return e;
      }).filter(Boolean);
      if (withKey && size.W >= 720) {
        keyEl ??= keyCard(host, { title: 'The stack', rows: keyRows(PAL[theme]) }, theme);
        const m = Math.max(16, Math.round(size.W * 0.03));
        keyEl.style.left = `${size.W - m - keyEl.offsetWidth}px`; keyEl.style.top = `${size.H - m - keyEl.offsetHeight}px`;
      } else if (keyEl) { keyEl.remove(); keyEl = null; }
    };
    layoutWords();

    // ── the hover state, and how a pointer, a tap or a key reaches it ────────────────────────────────────────────
    const pieceCards = cards(d, GF, TN, MARK_URLS, now);
    const route = (tab) => { try { onRoute(tab); } catch (e) { console.error(e); } };
    const hover = hoverController(space, { theme, host, cards: pieceCards, project, size, onRoute: route, glyphColor: GLYPH_COLOR[theme] });
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const pickAt = (x, y) => {
      ndc.set((x / size.W) * 2 - 1, -(y / size.H) * 2 + 1); ray.setFromCamera(ndc, stage.camera);
      const hit = ray.intersectObjects(space.pickers, false)[0];
      return hit?.object.userData.piece ?? null;
    };
    const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const L = labels(d);
    const setHover = (id, at = null) => {
      if (id === hover.target) return;
      hover.set(id, { at });
      canvas.style.cursor = id ? 'pointer' : '';
      root.dataset.hover = id ?? '';
      for (const [lid, lel] of labs.els) lel.classList.toggle('stk-dim', !!id && lid !== id);
    };
    // with a card open, a move onto another piece (or off every piece) switches after a short grace, so the pointer can
    // cross other pieces on its way to the card's links and button; reaching the card cancels the switch
    const GRACE = 240;
    let pend = 0;
    const cancel = () => { if (pend) { clearTimeout(pend); pend = 0; } };
    const later = (id, at) => { cancel(); pend = setTimeout(() => { pend = 0; setHover(id, at); }, GRACE); };
    const onMove = (e) => {
      if (e.pointerType === 'touch') return;
      const p = local(e), id = pickAt(p.x, p.y);
      if (id === hover.target) cancel(); else if (!hover.target) setHover(id, p); else later(id, p);
    };
    // leaving the canvas onto the open card keeps the piece hovered (its links and button are on the card)
    const inCard = (t) => !!(t && t.closest && t.closest('.stk-card'));
    const onLeave = (e) => { if (e.pointerType === 'touch' || inCard(e.relatedTarget)) return; later(null, null); };
    const onCardEnter = (e) => { if (inCard(e.target)) cancel(); };
    const onCardLeave = (e) => { if (e.pointerType === 'touch' || !inCard(e.target) || e.relatedTarget === canvas || inCard(e.relatedTarget)) return; later(null, null); };
    const onTap = (e) => {
      cancel();
      const p = local(e), id = pickAt(p.x, p.y);
      if (!id) { setHover(null); return; }
      // a mouse goes straight to the tab; a first tap opens the card, a second tap on the same piece goes
      if (e.pointerType === 'mouse' || hover.target === id) route(ROUTES[id]);
      else setHover(id, p);
    };
    canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerleave', onLeave); canvas.addEventListener('click', onTap);
    host.addEventListener('pointerleave', onCardLeave, true); host.addEventListener('pointerenter', onCardEnter, true);
    cleanups.push(() => { cancel(); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerleave', onLeave); canvas.removeEventListener('click', onTap);
      host.removeEventListener('pointerleave', onCardLeave, true); host.removeEventListener('pointerenter', onCardEnter, true); });
    for (const id of PIECE_IDS) {
      const b = document.createElement('button'); b.type = 'button';
      b.textContent = `${L[id].plain}${L[id].name ? `, ${L[id].name}` : ''}: open ${pieceCards[id].routeLabel}`;
      b.addEventListener('focus', () => setHover(id)); b.addEventListener('blur', () => { if (hover.target === id) setHover(null); });
      b.addEventListener('click', () => route(ROUTES[id]));
      nav.appendChild(b);
    }
    const onKey = (e) => { if (e.key === 'Escape') setHover(null); };
    root.addEventListener('keydown', onKey); cleanups.push(() => root.removeEventListener('keydown', onKey));

    // ── the loop: comets, the turning marks, the hover's transitions; paused out of view and in a hidden tab ──────
    let t0 = performance.now(), last = t0, visible = true;
    const frame = (now) => {
      raf = 0;
      if (disposed) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const t = still ? 6.0 : (now - t0) / 1000;
      stage.setCamera(fit.pose);
      space.pose(t, stage.camera.position);
      hover.step(dt);
      stage.render();
      if (visible && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf && !disposed && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    io = new IntersectionObserver((es) => { visible = es.some((x) => x.isIntersecting); kick(); });
    io.observe(root);
    const onVis = () => kick();
    document.addEventListener('visibilitychange', onVis); cleanups.push(() => document.removeEventListener('visibilitychange', onVis));
    stage.requestShadow();

    // ── resize: the stage, the fit and the words follow el ──────────────────────────────────────────────────────
    ro = new ResizeObserver(() => {
      const W = Math.max(320, el.clientWidth || size.W), H = Math.max(160, el.clientHeight || size.H);
      if (W === size.W && H === size.H) return;
      size.W = W; size.H = H;
      root.style.setProperty('--u', String(W / 1920));
      host.style.setProperty('--stk-k', String(Math.max(0.8, Math.min(1, W / 1600))));
      stage.setSize(W, H, dpr);
      space.root.traverse((o) => { const u = o.material?.uniforms?.uRes; if (u) u.value.set(W * dpr, H * dpr); });
      fit = fitRest(stage, W, H, rectFor(W, H)); stage.camera.updateMatrixWorld();
      setLineResolution(space.root, W, H, dpr);
      stage.requestShadow();
      layoutWords(); hover.relayout();
      kick();
    });
    ro.observe(el);

    api = {
      hover: (id) => setHover(id && space.pieces[id] ? id : null),
      // a point where the piece itself is under the pointer: its center if nothing stands in front, else the first
      // point of a grid over its box that picks it
      screenOf: (id) => {
        if (!space.pieces[id]) return null;
        const c = space.pieces[id].center, bx = screenBox(space, id, project);
        const first = c ? project(c.toArray()) : bx ? { x: (bx.x0 + bx.x1) / 2, y: (bx.y0 + bx.y1) / 2 } : null;
        if (first && pickAt(first.x, first.y) === id) return first;
        if (!bx) return null;
        for (let j = 1; j < 12; j++) for (let i = 1; i < 12; i++) {
          const x = bx.x0 + ((bx.x1 - bx.x0) * i) / 12, y = bx.y0 + ((bx.y1 - bx.y0) * j) / 12;
          if (x > 0 && y > 0 && x < size.W && y < size.H && pickAt(x, y) === id) return { x, y };
        }
        return null;
      },
    };
    cleanups.push(() => hover.dispose());
    kick();
  })();

  return {
    ready,
    pieces: PIECE_IDS,
    hover: (id) => api.hover(id),
    screenOf: (id) => api.screenOf(id),
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect(); io?.disconnect();
      for (const f of cleanups.splice(0).reverse()) { try { f(); } catch { /* already gone */ } }
      root.remove();
    },
  };
}
