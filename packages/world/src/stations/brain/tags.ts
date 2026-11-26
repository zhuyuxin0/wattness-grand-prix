// The brain station's words over the canvas (DOM, never painted into the 3D): the pages' tags in Living Brain's shape
// (a numbered pill centered on its dot, no leader line), the member brains' name and page-count tags, and our chrome:
// the HUD, the scope line, the page's card and the review's plates. Laid out against a projector for one moment, so a
// frame lays them out for any camera the story gives it.
import './brain.css';
import * as THREE from 'three';
import type { BrainWorld, WorldPose } from './world';
import { REST, VFOV } from './world';
import { brainOf, PLAIN, type BrainId, type Page } from './data';

export type CloudId = 'center' | BrainId;
export interface Screen { x: number; y: number; facing: number; behind: boolean }
export type Projector = (cloud: CloudId, index: number) => Screen;

export interface TagSpec {
  /** Unique (cloud and page). */
  id: string;
  cloud: CloudId;
  index: number;
  page: Page;
  /** The badge's and the border's color. */
  color: string;
  /** 0 to 1: the reveal, the zoom's fade and the beat's own. */
  k: number;
  /** Overlaps hide the later of two tags: lower goes first. */
  order: number;
  hot?: boolean;
  sel?: boolean;
  conflict?: boolean;
  view?: 'combined';
}

const two = (n: number) => String(n).padStart(2, '0');
/** Living Brain's cut: 20 characters at most, then 19 and an ellipsis. */
export const cut = (s: string) => (s.length > 20 ? `${s.slice(0, 19)}…` : s);

/** The projector for a pose: the clouds' matrices composed from the pose alone (nothing in the scene is touched), seen
 *  through a camera (the rest camera by default). */
export function projectorFor(w: BrainWorld, pose: WorldPose, size: { width: number; height: number }, camera?: THREE.PerspectiveCamera): Projector {
  const cam = camera ?? restCamera(size.width / size.height);
  cam.updateMatrixWorld();
  const root = rigMatrix(pose);
  const mats = new Map<CloudId, THREE.Matrix4>();
  const centers = new Map<CloudId, THREE.Vector3>();
  const add = (id: CloudId, cp: WorldPose['center']) => {
    const m = new THREE.Matrix4().compose(cp.pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), cp.yaw), new THREE.Vector3(cp.scale, cp.scale, cp.scale));
    const M = root.clone().multiply(m);
    mats.set(id, M);
    centers.set(id, new THREE.Vector3().setFromMatrixPosition(M));
  };
  add('center', pose.center);
  for (const b of Object.keys(pose.members) as BrainId[]) add(b, pose.members[b]);
  const eye = cam.getWorldPosition(new THREE.Vector3());
  const v = new THREE.Vector3(), d = new THREE.Vector3(), e = new THREE.Vector3();
  return (cloud, index) => {
    const c = cloud === 'center' ? w.center : w.members[cloud];
    const M = mats.get(cloud)!, C = centers.get(cloud)!;
    v.set(c.spots[index * 3]!, c.spots[index * 3 + 1]!, c.spots[index * 3 + 2]!).applyMatrix4(M);
    d.copy(v).sub(C).normalize(); e.copy(eye).sub(C).normalize();
    const facing = d.dot(e);
    const behind = v.clone().applyMatrix4(cam.matrixWorldInverse).z >= 0;
    v.project(cam);
    return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height, facing, behind };
  };
}

/** The projector for the scene as it stands (after world.apply), through the stage's camera. */
export function projectorNow(w: BrainWorld, size: { width: number; height: number }, camera: THREE.Camera): Projector {
  camera.updateMatrixWorld();
  const v = new THREE.Vector3(), C = new THREE.Vector3(), d = new THREE.Vector3(), e = new THREE.Vector3();
  const eye = camera.getWorldPosition(new THREE.Vector3());
  return (cloud, index) => {
    const c = cloud === 'center' ? w.center : w.members[cloud];
    c.pageWorld(index, v);
    C.setFromMatrixPosition(c.group.matrixWorld);
    d.copy(v).sub(C).normalize(); e.copy(eye).sub(C).normalize();
    const behind = v.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0;
    const facing = d.dot(e);
    v.project(camera);
    return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height, facing, behind };
  };
}

/** A member brain's own point (its center plus an offset in its frame, as Living Brain places its tags). */
export function memberPoint(w: BrainWorld, b: BrainId, off: [number, number, number], camera: THREE.Camera, size: { width: number; height: number }) {
  const g = w.members[b].group;
  const v = new THREE.Vector3(...off).applyMatrix4(g.matrixWorld);
  const behind = v.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0;
  v.project(camera);
  return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height, behind };
}

/** A member brain on screen: its center, its radius in px (its longest half-extent, 0.62 at scale 1), its distance
 *  from the camera, and where its name (above) and its page count (to its right) go. */
export type MemberScreen = ReturnType<typeof memberScreenOf>;
export function memberScreen(w: BrainWorld, b: BrainId, camera: THREE.Camera, size: { width: number; height: number }) {
  const g = w.members[b].group;
  return memberScreenOf(new THREE.Vector3().setFromMatrixPosition(g.matrixWorld), g.scale.x, camera, size);
}
/** The same for a pose (the rig and the member's place composed from the pose alone, as projectorFor does). */
export function memberScreenAt(pose: WorldPose, b: BrainId, size: { width: number; height: number }, camera?: THREE.PerspectiveCamera) {
  const cam = camera ?? restCamera(size.width / size.height);
  const m = pose.members[b];
  return memberScreenOf(m.pos.clone().applyMatrix4(rigMatrix(pose)), m.scale, cam, size);
}
function memberScreenOf(C: THREE.Vector3, scale: number, camera: THREE.Camera, size: { width: number; height: number }) {
  camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const s = scale * 0.62;
  const P = (v: THREE.Vector3) => {
    const behind = v.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0;
    const q = v.clone().project(camera);
    return { x: ((q.x + 1) / 2) * size.width, y: ((1 - q.y) / 2) * size.height, behind };
  };
  const c = P(C), r = P(C.clone().addScaledVector(right, s)), u = P(C.clone().addScaledVector(up, s));
  const rad = Math.hypot(r.x - c.x, r.y - c.y), radU = Math.hypot(u.x - c.x, u.y - c.y);
  const depth = C.distanceTo(camera.getWorldPosition(new THREE.Vector3()));
  return { center: c, r: rad, depth, name: { x: c.x, y: c.y - radU * 1.18 - 14, behind: c.behind }, detail: { x: c.x + rad * 1.04 + 10, y: c.y + radU * 0.12, behind: c.behind } };
}

/** A member's tags for the overlap rule: where they are, how visible, and how near the camera the member is. */
export interface MemberTags { b: BrainId; ms: MemberScreen; k: { name: number; detail: number } }

export function restCamera(aspect: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(VFOV, aspect, 0.05, 200);
  const a = (REST.az * Math.PI) / 180, e = (REST.el * Math.PI) / 180, t = new THREE.Vector3(...REST.target);
  cam.position.set(t.x + Math.sin(a) * Math.cos(e) * REST.dist, t.y + Math.sin(e) * REST.dist, t.z - Math.cos(a) * Math.cos(e) * REST.dist);
  cam.up.set(0, 1, 0); cam.lookAt(t); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  return cam;
}

/** The root's matrix for a pose (world.ts apply's rig, from the pose alone). */
export function rigMatrix(pose: WorldPose): THREE.Matrix4 {
  const at = (target: THREE.Vector3, az: number, el: number, dist: number) => {
    const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180, o = new THREE.Object3D();
    o.position.set(target.x + Math.sin(a) * Math.cos(e) * dist, target.y + Math.sin(e) * dist, target.z - Math.cos(a) * Math.cos(e) * dist);
    o.up.set(0, 1, 0); o.lookAt(target); o.updateMatrixWorld();
    return o.matrixWorld.clone();
  };
  const ref = at(new THREE.Vector3(...REST.target), REST.az, REST.el, REST.dist);
  const cam = at(pose.cam.target, pose.cam.az, pose.cam.el, pose.cam.dist);
  return ref.multiply(cam.invert());
}

/** Living Brain's tag opacity: facing (far side at 25 %) times the zoom (gone by 5.8 out). */
export const facingK = (facing: number) => 0.25 + 0.75 * smoothstep(-0.2, 0.15, facing);
export const distK = (dist: number) => 1 - smoothstep(3.4, 5.8, dist);
function smoothstep(a: number, b: number, x: number) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

interface TagEl { el: HTMLElement; w: number; h: number }

export class Chrome {
  readonly el: HTMLDivElement;
  private readonly tagsEl: HTMLDivElement;
  private readonly membersEl: HTMLDivElement;
  private readonly fxEl: HTMLDivElement;
  private readonly tagEls = new Map<string, TagEl>();
  private readonly memberEls = new Map<string, TagEl>();
  private hudEl: HTMLDivElement | null = null;
  private hudKey = '';
  private scopeEl: HTMLParagraphElement | null = null;
  private cardEl: HTMLDivElement | null = null;
  private cardKey = '';
  readonly k: number;

  constructor(host: HTMLElement, readonly film: boolean) {
    this.k = film ? 1.5 : 1;
    this.el = document.createElement('div');
    this.el.className = 'lb-layer';
    this.el.dataset.film = film ? '1' : '0';
    this.tagsEl = document.createElement('div'); this.tagsEl.className = 'lb-tags';
    this.membersEl = document.createElement('div'); this.membersEl.className = 'lb-members';
    this.fxEl = document.createElement('div'); this.fxEl.className = 'lb-fx';
    this.el.append(this.membersEl, this.tagsEl, this.fxEl);
    host.appendChild(this.el);
  }

  private tagEl(t: TagSpec): TagEl {
    let x = this.tagEls.get(t.id);
    if (!x) {
      const el = document.createElement('div');
      el.className = 'lb-tag';
      el.dataset.page = t.page.slug; el.dataset.brain = t.page.brain;
      const n = document.createElement('span'); n.className = 'lb-n'; n.textContent = two(t.page.n);
      const s = document.createElement('span'); s.className = 'lb-t'; s.textContent = cut(t.page.title);
      el.append(n, s);
      el.style.setProperty('--lb-c', t.color);
      if (t.view) el.dataset.view = t.view;
      this.tagsEl.appendChild(el);
      x = { el, w: el.offsetWidth || 110 * this.k, h: el.offsetHeight || 22 * this.k };
      this.tagEls.set(t.id, x);
    }
    return x;
  }

  /** Which tags overlapping heavier ones are hidden, at one moment (Living Brain's rule): the ids kept. The member
   *  brains' tags take part: their names after the beat's own page tags (hot, selected, the conflict) and before the
   *  rest, their page counts last, the farther member's giving way to the nearer's (ids mn:<brain> and md:<brain>).
   *  keepOut: the host's own chrome over the layer (its HUD, buttons, scope line), where no tag stands; with it, a page
   *  tag the layer's edge would cut is hidden too. */
  keptAt(tags: TagSpec[], project: Projector, members: MemberTags[] = [], keepOut: [number, number, number, number][] | null = null): Set<string> {
    type Item = { id: string; order: number; rect: () => [number, number, number, number] | null };
    const items: Item[] = tags.filter((t) => t.k > 0.02).map((t) => ({ id: t.id, order: t.order, rect: () => {
      const s = project(t.cloud, t.index);
      if (s.behind) return null;
      const { w, h } = this.tagEl(t);
      return [s.x - w / 2, s.y - h / 2, s.x + w / 2, s.y + h / 2];
    } }));
    [...members].sort((a, b) => a.ms.depth - b.ms.depth).forEach((m, rank) => {
      // a member off the layer draws no tags (member()); the others' rects are where member() puts them
      if (this.offLayer(m.ms.center)) return;
      const { name, detail } = this.memberTagEls(m.b);
      const rect = (x: TagEl, p: { x: number; y: number }, align: 'center' | 'left') => (): [number, number, number, number] => { const q = this.placeOf(x, p, align); return [q.left, q.top, q.left + x.w, q.top + x.h]; };
      if (m.k.name > 0.02 && !m.ms.name.behind) items.push({ id: `mn:${m.b}`, order: -0.5 + rank * 0.01, rect: rect(name, m.ms.name, 'center') });
      if (m.k.detail > 0.02 && !m.ms.detail.behind) items.push({ id: `md:${m.b}`, order: 1e4 + rank, rect: rect(detail, m.ms.detail, 'left') });
    });
    const kept = new Set<string>(), rects: [number, number, number, number][] = [...(keepOut ?? [])];
    const W = this.el.clientWidth, H = this.el.clientHeight;
    for (const it of items.sort((a, b) => a.order - b.order)) {
      const r = it.rect();
      if (!r || rects.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue;
      const memberTag = it.id.startsWith('mn:') || it.id.startsWith('md:');
      if (keepOut && W && H && !memberTag && (r[0] < 0 || r[1] < 0 || r[2] > W || r[3] > H)) continue;
      rects.push(r); kept.add(it.id);
    }
    return kept;
  }

  /** Lays the tags out at the projector's moment. shown(id) gives each tag's overlap visibility (0 to 1). */
  tags(tags: TagSpec[], project: Projector, shown: (id: string) => number, dist: number) {
    const live = new Set(tags.map((t) => t.id));
    for (const [id, x] of this.tagEls) if (!live.has(id)) { x.el.style.opacity = '0'; x.el.style.visibility = 'hidden'; }
    for (const t of tags) {
      const x = this.tagEl(t), s = project(t.cloud, t.index);
      const face = t.hot || t.sel ? Math.max(0.85, facingK(s.facing)) : facingK(s.facing);
      const o = s.behind ? 0 : t.k * face * (t.cloud === 'center' && !t.hot ? distK(dist) : 1) * shown(t.id);
      x.el.style.opacity = o.toFixed(3);
      x.el.style.visibility = o > 0.003 ? 'visible' : 'hidden';
      // as Living Brain: a faint tag (the far side, mostly) lets the pointer through
      x.el.style.pointerEvents = o > 0.12 ? '' : 'none';
      x.el.style.transform = `translate3d(${(s.x - x.w / 2).toFixed(1)}px, ${(s.y - x.h / 2).toFixed(1)}px, 0)`;
      x.el.classList.toggle('is-hot', !!t.hot); x.el.classList.toggle('is-sel', !!t.sel); x.el.classList.toggle('is-conflict', !!t.conflict);
      x.el.style.zIndex = String(t.sel || t.hot ? 1000 : 900 - t.order);
    }
  }

  /** A member's two tags (made once): its name, plain first ("Grand Prix brain"; Living Brain's own name is in the
   *  cards), and its page count. */
  private memberTagEls(b: BrainId): { name: TagEl; detail: TagEl } {
    const brain = brainOf(b);
    const get = (key: string, cls: string, text: string) => {
      let x = this.memberEls.get(key);
      if (!x) {
        const el = document.createElement('div'); el.className = cls; el.textContent = text;
        el.style.setProperty('--lb-c', brain.color); el.dataset.brain = b;
        this.membersEl.appendChild(el);
        x = { el, w: el.offsetWidth, h: el.offsetHeight };
        this.memberEls.set(key, x);
      }
      return x;
    };
    return { name: get(`${b}:name`, 'lb-member', PLAIN[b]), detail: get(`${b}:detail`, 'lb-detail', `${brain.pages} ${brain.pages === 1 ? 'page' : 'pages'}`) };
  }

  /** Where a member's tag stands: centered over its point (the name) or starting at it (the page count), kept 6 px
   *  inside the layer. keptAt and member() both place it so. */
  private placeOf(x: TagEl, p: { x: number; y: number }, align: 'center' | 'left') {
    const W = this.el.clientWidth || Infinity;
    return { left: Math.max(6, Math.min(W - x.w - 6, p.x + (align === 'center' ? -x.w / 2 : 0))), top: p.y - x.h / 2 };
  }

  /** A member whose center is off the layer (or behind the camera) draws no tags: held at the edge they would stand
   *  over other tags, far from the brain they name. */
  private offLayer(c?: { x: number; y: number; behind?: boolean }) {
    const W = this.el.clientWidth, H = this.el.clientHeight;
    if (!c || !W || !H) return false;
    return !!c.behind || c.x < 0 || c.x > W || c.y < 0 || c.y > H;
  }

  /** A member's name above it and its page count beside it ("123 pages"; Living Brain's other detail tag, its owner's
   *  name, is never drawn), kept inside the layer; none while the member's center is off it. */
  member(b: BrainId, at: { name: { x: number; y: number; behind: boolean }; detail: { x: number; y: number; behind: boolean }; center?: { x: number; y: number; behind: boolean } }, k: { name: number; detail: number }, hot = false) {
    const { name, detail } = this.memberTagEls(b);
    const off = this.offLayer(at.center);
    const place = (x: TagEl, p: { x: number; y: number; behind: boolean }, o: number, align: 'center' | 'left') => {
      const op = p.behind || off ? 0 : o;
      x.el.style.opacity = op.toFixed(3); x.el.style.visibility = op > 0.003 ? 'visible' : 'hidden';
      const q = this.placeOf(x, p, align);
      x.el.style.transform = `translate3d(${q.left.toFixed(1)}px, ${q.top.toFixed(1)}px, 0)`;
    };
    place(name, at.name, k.name * 0.92, 'center');
    place(detail, at.detail, k.detail * 0.76, 'left');
    name.el.classList.toggle('is-hot', hot);
  }

  /** The HUD: rows of a number and its words. A pair with `act` is a button (data-act, its aria-label), for a host
   *  that acts on it (the Memory tab's conflict opens its page); the films' HUD has none. */
  hud(rows: { n: string; label: string; tone?: 'em' | 'rose'; act?: { id: string; label: string } }[][] | null, k = 1) {
    if (!rows) { this.hudEl?.remove(); this.hudEl = null; this.hudKey = ''; return; }
    if (!this.hudEl) { this.hudEl = document.createElement('div'); this.hudEl.className = 'lb-hud'; this.el.appendChild(this.hudEl); }
    const key = JSON.stringify(rows);
    if (key !== this.hudKey) {
      this.hudKey = key;
      this.hudEl.replaceChildren(...rows.map((line) => {
        const d = document.createElement('div');
        line.forEach((r, i) => {
          // a number and its words never part at a wrap, and the dot before them wraps with them, so no line ends on one
          if (i) d.append(document.createTextNode(' '));
          const pair = document.createElement(r.act ? 'button' : 'span'); pair.className = r.act ? 'lb-pair lb-act' : 'lb-pair';
          if (r.act) { (pair as HTMLButtonElement).type = 'button'; pair.dataset.act = r.act.id; pair.setAttribute('aria-label', r.act.label); }
          const b = document.createElement('b'); b.textContent = r.n; if (r.tone) b.className = r.tone;
          if (i) pair.append(document.createTextNode('· '));
          pair.append(b, document.createTextNode(` ${r.label}`));
          d.append(pair);
        });
        return d;
      }));
    }
    this.hudEl.style.opacity = k.toFixed(3);
  }

  scope(text: string | null) {
    if (text == null) { this.scopeEl?.remove(); this.scopeEl = null; return; }
    if (!this.scopeEl) { this.scopeEl = document.createElement('p'); this.scopeEl.className = 'lb-scope'; this.el.appendChild(this.scopeEl); }
    if (this.scopeEl.textContent !== text) this.scopeEl.textContent = text;
  }

  /** A page's card beside its tag (below it, or above when there is no room), sliding in as k goes to 1. */
  card(c: { page: Page; color: string; meta: string; summary: string | null; label?: string } | null, at: { x: number; y: number } | null, k: number, size: { width: number; height: number }) {
    if (!c || !at || k <= 0.002) { if (this.cardEl) { this.cardEl.style.opacity = '0'; this.cardEl.style.visibility = 'hidden'; } return; }
    if (!this.cardEl) { this.cardEl = document.createElement('div'); this.cardEl.className = 'lb-card'; this.fxEl.appendChild(this.cardEl); }
    const key = `${c.page.brain}/${c.page.slug}:${c.meta}`;
    if (key !== this.cardKey) {
      this.cardKey = key;
      const h = document.createElement('h4');
      const n = document.createElement('span'); n.className = 'lb-n'; n.textContent = two(c.page.n); n.style.setProperty('--lb-c', c.color);
      h.append(n, document.createTextNode(c.page.title));
      const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = c.meta;
      const kids: HTMLElement[] = [h, meta];
      if (c.summary) {
        const l = document.createElement('div'); l.className = 'lbl'; l.textContent = c.label ?? "Living Brain's summary";
        const p = document.createElement('p'); p.textContent = c.summary;
        kids.push(l, p);
      }
      this.cardEl.replaceChildren(...kids);
    }
    const w = this.cardEl.offsetWidth, hh = this.cardEl.offsetHeight, gap = 10 * this.k + 11 * this.k;
    let x = at.x - 34 * this.k, y = at.y + gap;
    if (y + hh > size.height - 24) y = at.y - gap - hh;
    x = Math.max(16, Math.min(size.width - w - 16, x));
    const e = 1 - (1 - k) ** 3;
    this.cardEl.style.visibility = 'visible';
    this.cardEl.style.opacity = e.toFixed(3);
    this.cardEl.style.transform = `translate3d(${x.toFixed(1)}px, ${(y + 6 * (1 - e)).toFixed(1)}px, 0) scale(${(0.98 + 0.02 * e).toFixed(4)})`;
  }

  /** A plate (the review's moments), placed at a point, sliding in as k goes to 1. */
  plate(id: string, cls: string, rows: { k?: string; v?: string; s?: string; was?: string }[], at: { x: number; y: number } | null, k: number) {
    let el = this.fxEl.querySelector<HTMLDivElement>(`.lb-plate[data-id="${id}"]`);
    if (!at || k <= 0.002) { if (el) { el.style.opacity = '0'; el.style.visibility = 'hidden'; } return; }
    const key = JSON.stringify(rows);
    if (!el) { el = document.createElement('div'); el.className = `lb-plate ${cls}`; el.dataset.id = id; this.fxEl.appendChild(el); }
    if (el.dataset.key !== key) {
      el.dataset.key = key;
      el.replaceChildren(...rows.map((r) => {
        const d = document.createElement('div');
        if (r.k) { d.className = 'k'; d.textContent = r.k; }
        else if (r.v) { d.className = 'v'; d.textContent = r.v; }
        else { d.className = 's'; if (r.was) { const w = document.createElement('span'); w.className = 'was'; w.textContent = r.was; d.append(w, document.createTextNode(' ')); } d.append(document.createTextNode(r.s ?? '')); }
        return d;
      }));
    }
    const e = 1 - (1 - Math.min(1, k)) ** 3;
    el.style.visibility = 'visible'; el.style.opacity = e.toFixed(3);
    el.style.transform = `translate3d(${at.x.toFixed(1)}px, ${(at.y + 8 * (1 - e)).toFixed(1)}px, 0)`;
  }

  /** The cutoff ring: a circle closing on a point, with its time beside it. */
  ring(at: { x: number; y: number } | null, r: number, k: number, label: string) {
    let svg = this.fxEl.querySelector<SVGSVGElement>('svg.lb-ring');
    if (!at || k <= 0.002) { if (svg) svg.style.opacity = '0'; return; }
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'lb-ring');
      svg.setAttribute('width', '2'); svg.setAttribute('height', '2');
      svg.append(document.createElementNS('http://www.w3.org/2000/svg', 'circle'), document.createElementNS('http://www.w3.org/2000/svg', 'text'));
      this.fxEl.appendChild(svg);
    }
    const c = svg.querySelector('circle')!, t = svg.querySelector('text')!;
    c.setAttribute('cx', '0'); c.setAttribute('cy', '0'); c.setAttribute('r', r.toFixed(1));
    t.setAttribute('x', (r * 0.72 + 8).toFixed(1)); t.setAttribute('y', (-r * 0.72 - 6).toFixed(1)); t.textContent = label;
    svg.style.opacity = k.toFixed(3);
    svg.style.transform = `translate3d(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px, 0)`;
  }

  clear() { this.el.replaceChildren(this.membersEl, this.tagsEl, this.fxEl); this.tagsEl.replaceChildren(); this.membersEl.replaceChildren(); this.fxEl.replaceChildren(); this.tagEls.clear(); this.memberEls.clear(); this.hudEl = null; this.scopeEl = null; this.cardEl = null; this.cardKey = ''; this.hudKey = ''; }
  dispose() { this.el.remove(); }
}
