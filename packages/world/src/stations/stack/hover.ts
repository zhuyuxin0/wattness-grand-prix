// @ts-nocheck
// The hover state (S03, STACK.md): the hovered piece's halo (a teal ring at its pad, radius + 6 m, 1.6 px, glowA 0.3,
// static), its own strands at full, every other strand at 0.25 and every other object at 0.55; its card comes in over
// 160 ms with a 6 px rise, beside the piece and never under the pointer, and leaving restores everything in 200 ms.
// The piece's owner is already named at rest by the logo chip in its label (pieces.ts LOGO_OF), so a hover adds only the
// card; the cards are made before the first hover (prepare), so the first one opens at once. Comets keep running
// throughout. One controller for the stills (set with still: the end state at once) and the live mount (stepped each
// frame).
import { pieceCard, placeCard } from './dom';
import { screenBox } from './common';

const IN = 0.16, OUT = 0.2;          // seconds: the hover's entry and its exit
const OBJ_DIM = 0.55, EDGE_DIM = 0.25;

/** The strands that belong to a piece (its own: from it or to it); Living Brain also owns the memory spine's. */
export function ownEdges(space, id) {
  const own = new Set(id === 'brain' ? ['brain', 'memory'] : [id]);
  return new Set(Object.values(space.edges).filter((e) => own.has(e.from) || own.has(e.to)).map((e) => e.id));
}

export function hoverController(space, { theme, host, cards, project, size, onRoute = null, glyphColor = {} }) {
  const P = space.pieces, E = space.edges;
  const ids = Object.keys(P).filter((id) => P[id].picks?.length);
  // the pieces' materials as built, so a weight can always be undone exactly
  const base = new Map();
  const rec = (mm, f) => { if (!base.has(mm)) base.set(mm, f()); return base.get(mm); };
  const applyMat = (mm, k) => {
    if (!mm) return;
    if (mm.cube) {
      const u = mm.cube.uniforms;
      if (theme === 'light') { mm.cube.transparent = k < 0.999; u.uOpacity.value = 0.3 + 0.7 * k; } else u.uDim.value = 0.35 + 0.65 * k;
      return;
    }
    const u = mm.uniforms;
    if (u?.uDim) {
      // a flat solid: on the night ground it darkens, on the light one it fades toward the ground
      const r = rec(mm, () => ({ op: u.uOpacity.value, tr: mm.transparent, dw: mm.depthWrite }));
      if (theme === 'light') { const dim = k < 0.999; mm.transparent = dim || r.tr; mm.depthWrite = dim ? false : r.dw; u.uOpacity.value = r.op * (0.22 + 0.78 * k); }
      else u.uDim.value = 0.25 + 0.75 * k;
      return;
    }
    if (u?.uOpacity) { const r = rec(mm, () => ({ op: u.uOpacity.value })); u.uOpacity.value = r.op * k; return; }
    const r = rec(mm, () => ({ op: mm.opacity, tr: mm.transparent }));
    mm.transparent = r.tr || k < 0.999; mm.opacity = r.op * k;
  };
  for (const id of Object.keys(P)) for (const mm of P[id].mats) applyMat(mm, 1);

  // progress toward each element's hovered state: objects and strands 0 lit .. 1 dimmed, halos 0 off .. 1 on; each moves
  // at its full range over IN seconds going in and OUT seconds coming back
  const dimP = Object.fromEntries(Object.keys(P).map((id) => [id, 0]));
  const edgeP = Object.fromEntries(Object.keys(E).map((id) => [id, 0]));
  const haloP = Object.fromEntries(ids.map((id) => [id, 0]));
  let target = null, own = new Set(), pointer = null, dirty = true;
  const cardEls = new Map();

  const goal = {
    obj: (id) => (target == null || id === target || (target === 'brain' && id === 'memory') ? 0 : 1),
    edge: (id) => (target == null || own.has(id) ? 0 : 1),
    halo: (id) => (id === target ? 1 : 0),
  };
  const move = (cur, to, dt) => (to > cur ? Math.min(to, cur + dt / IN) : Math.max(to, cur - dt / OUT));
  const w = (id) => 1 - dimP[id] * (1 - OBJ_DIM), ew = (id) => 1 - edgeP[id] * (1 - EDGE_DIM);

  function apply() {
    for (const id of Object.keys(P)) for (const mm of P[id].mats) applyMat(mm, w(id));
    for (const id of Object.keys(E)) E[id].set(ew(id));
    for (const id of ids) if (P[id].halo) P[id].halo.material.opacity = haloP[id];
  }

  // ── the DOM: one card per piece, made when first wanted, or all at once ahead of the first hover (prepare) ────────
  function cardFor(id) {
    if (!cardEls.has(id)) {
      const c = cards[id]; if (!c) return null;
      cardEls.set(id, pieceCard(host, c, { glyphColor: glyphColor[id] ?? null, onRoute }));
    }
    return cardEls.get(id);
  }
  function placeDom(id, still) {
    const el = cardFor(id); if (!el) return;
    const bx = screenBox(space, id, project) ?? { x0: size.W / 2, y0: size.H / 2, x1: size.W / 2, y1: size.H / 2 };
    // the move to the new place happens hidden and at once (only the entry's fade and 6 px rise animate; without this
    // a card would slide in from wherever it last stood, or from the stage's corner the first time)
    el.classList.add('is-still');
    // Agent Studio's deck holds the pods: as a box it covers the middle, so the card weighs the pieces on it
    const others = ids.filter((o) => o !== id && o !== 'studio').map((o) => screenBox(space, o, project));
    // GateRecord's cube is the space's anchor: a card covers it last (its box counted three times)
    const weighed = id === 'gate' ? others : [...others, ...Array(2).fill(screenBox(space, 'gate', project))];
    // and the piece's own label, which names it with its owner's logo chip, stays in view beside its card
    const lab = host.querySelector(`.stk-lab[data-piece="${id}"]`);
    if (lab) {
      const r = lab.getBoundingClientRect(), hr = host.getBoundingClientRect();
      weighed.push(...Array(6).fill({ x0: r.left - hr.left, y0: r.top - hr.top, x1: r.right - hr.left, y1: r.bottom - hr.top }));
    }
    placeCard(el, bx, size.W, size.H, pointer?.x ?? null, pointer?.y ?? null, weighed);
    // the entry: in on the next frame, so the transition runs from the hidden state at the new place
    if (still) { el.classList.add('is-in'); return; }
    void el.offsetWidth;
    el.classList.remove('is-still');
    requestAnimationFrame(() => { if (target === id) el.classList.add('is-in'); });
  }
  function hideDom(id) { cardEls.get(id)?.classList.remove('is-in', 'is-still'); }

  return {
    get target() { return target; },
    /** Hover a piece (null: none). still: the end state at once (for a still); at: the pointer's stage px. */
    set(id, { still = false, at = null } = {}) {
      pointer = at;
      if (id === target) { if (still) this.snap(); return; }
      if (target) hideDom(target);
      target = id && P[id] ? id : null;
      own = target ? ownEdges(space, target) : new Set();
      if (target) placeDom(target, still);
      dirty = true;
      if (still) this.snap();
    },
    /** Every weight at its goal now. */
    snap() {
      for (const id of Object.keys(dimP)) dimP[id] = goal.obj(id);
      for (const id of Object.keys(edgeP)) edgeP[id] = goal.edge(id);
      for (const id of ids) haloP[id] = goal.halo(id);
      apply(); dirty = false;
    },
    /** Moves every weight toward its goal over dt seconds; returns whether anything changed. */
    step(dt) {
      let changed = dirty;
      for (const id of Object.keys(dimP)) { const to = goal.obj(id); if (dimP[id] !== to) { dimP[id] = move(dimP[id], to, dt); changed = true; } }
      for (const id of Object.keys(edgeP)) { const to = goal.edge(id); if (edgeP[id] !== to) { edgeP[id] = move(edgeP[id], to, dt); changed = true; } }
      for (const id of ids) { const to = goal.halo(id); if (haloP[id] !== to) { haloP[id] = move(haloP[id], to, dt); changed = true; } }
      if (changed) apply();
      dirty = false;
      return changed;
    },
    /** Every piece's card made now, hidden, so no hover waits on building one. */
    prepare() { for (const id of ids) cardFor(id); },
    /** After a resize: the card beside the piece again. */
    relayout() { if (target) placeDom(target, true); },
    dispose() { for (const el of cardEls.values()) el.remove(); cardEls.clear(); },
  };
}
