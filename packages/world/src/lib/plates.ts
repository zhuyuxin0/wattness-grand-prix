// Words over the canvas, in the kit's style: leader plates and ticks (kit/labels.ts), the key card, the caption on
// glass and the scope line (kit/css/plates.css). Nothing here is painted into the 3D.
import * as THREE from 'three';
import { LeaderLabels, TickLayer, type KeySpec, type Tick } from '../kit/labels';
import type { IntroLabel } from '../kit/scene-types';
import type { Rect } from '../kit/scene-extras';
import type { Vec3, WorldStage } from './stage';

export type { KeySpec, Rect };
export type Anchor = Vec3 | { x: number; y: number };

export interface Plate {
  id: string;
  text: string;
  /** A second line under the text, smaller and muted. */
  sub?: string;
  /** The point the leader's dot marks: a world point, or stage CSS px. */
  at: Anchor;
  /** Lower is placed first when space is short. */
  priority?: number;
  /** The dot sits this many px beside the point, on the plate's side. */
  gap?: number;
}

export interface TickMark { at: Anchor; text: string; align?: Tick['align'] }

export interface Plates {
  readonly root: HTMLElement;
  /** Stage CSS px of a world point, or null when it is behind the camera. */
  project(p: Vec3): { x: number; y: number } | null;
  /** Leader plates, greedy in priority order (at most max, 6 by default), clear of keepOut and, where they fit, of
   *  avoid. Returns the placed plates' rects. */
  leaders(items: readonly Plate[], o?: { keepOut?: readonly Rect[]; avoid?: readonly Rect[]; max?: number }): Rect[];
  /** One named group of marks without leaders (axis numbers, titles); cls 'hwalk-tick' or 'intro-tick-title'. */
  ticks(group: string, items: readonly TickMark[], cls?: string): Rect[];
  /** The key card at (x, y), its top-left, clamped into the frame; null removes it. */
  key(spec: KeySpec | null, x: number, y: number): Rect | null;
  /** The caption on glass, lower left; null removes it. */
  caption(c: { head: string; line?: string } | null): Rect | null;
  /** The scope line under the caption (the data's provenance); null removes it. */
  scope(text: string | null): Rect | null;
  clear(): void;
}

const rectOf = (el: HTMLElement, root: HTMLElement): Rect => {
  const a = el.getBoundingClientRect(), b = root.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
};

export function createPlates(host: HTMLElement, stage: WorldStage, size: { width: number; height: number }): Plates {
  const { width: W, height: H } = size;
  const ticksLayer = new TickLayer(host);
  const leaderLayer = new LeaderLabels(host);
  const v = new THREE.Vector3();
  let cap: HTMLElement | null = null, scopeEl: HTMLElement | null = null;

  const project = (p: Vec3) => {
    const cam = stage.camera;
    cam.updateMatrixWorld();
    v.set(p[0], p[1], p[2]).applyMatrix4(cam.matrixWorldInverse);
    if (v.z >= 0) return null;
    v.set(p[0], p[1], p[2]).project(cam);
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
  };
  const toPx = (a: Anchor) => (Array.isArray(a) ? project(a as Vec3) : (a as { x: number; y: number }));

  return {
    root: host,
    project,
    leaders(items, o = {}) {
      const labels: IntroLabel[] = [];
      for (const it of items) {
        const p = toPx(it.at);
        if (!p) continue;
        let node: HTMLElement | undefined;
        if (it.sub) { node = document.createElement('span'); node.className = 'hwalk-plate-sub'; node.textContent = it.sub; }
        labels.push({ id: it.id, text: it.text, x: p.x, y: p.y, priority: it.priority, gap: it.gap, node });
      }
      // a stage under 600 px wide (a phone) keeps the two most important labels: at 11 px more would bury the picture
      const max = W < 600 ? Math.min(2, o.max ?? 6) : o.max ?? 6;
      return leaderLayer.layout(labels, { width: W, height: H, keepOut: o.keepOut ?? [], avoid: o.avoid ?? [], max });
    },
    ticks(group, items, cls = 'hwalk-tick') {
      const marks: Tick[] = [];
      // a tick whose point falls off the stage (a phone's crop cuts the frame's edges) is left out, not pinned to the
      // stage's edge on top of its neighbours
      for (const it of items) { const p = toPx(it.at); if (p && p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H) marks.push({ x: p.x, y: p.y, text: it.text, align: it.align }); }
      return ticksLayer.set(group, marks, cls, W);
    },
    key(spec, x, y) { return ticksLayer.key(spec, x, y, W, H); },
    caption(c) {
      if (!c) { cap?.remove(); cap = null; return null; }
      if (!cap) { cap = document.createElement('div'); cap.className = 'hwalk-cap'; host.appendChild(cap); }
      cap.replaceChildren();
      const h = document.createElement('h3'); h.textContent = c.head; cap.appendChild(h);
      if (c.line) { const p = document.createElement('p'); p.textContent = c.line; cap.appendChild(p); }
      return rectOf(cap, host);
    },
    scope(text) {
      if (text == null) { scopeEl?.remove(); scopeEl = null; host.style.removeProperty('--hw-scope-h'); return null; }
      if (!scopeEl) { scopeEl = document.createElement('p'); scopeEl.className = 'hwalk-scope'; host.appendChild(scopeEl); }
      scopeEl.textContent = text;
      // the caption clears the scope line by its measured height (walkthrough.css --hw-scope-h)
      host.style.setProperty('--hw-scope-h', `${scopeEl.offsetHeight}px`);
      return rectOf(scopeEl, host);
    },
    clear() { leaderLayer.clear(); ticksLayer.clear(); cap?.remove(); cap = null; scopeEl?.remove(); scopeEl = null; },
  };
}
