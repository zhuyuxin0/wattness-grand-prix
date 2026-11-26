// The tray's coins, live: one coin a scenario in its $250 bin's tube, stacked by value, an enamel face in the heat
// ramp's color of its day total, a brass rim (bright for the worst tenth) and the bracket under the worst tenth. When
// the plan changes only coins whose place changes move: across tubes on a short arc, within a tube straight down or up;
// at a game's start they drop from the field's front lip column by column. Every coin's position is a pure function
// of the time since the last change, its delays seeded by its scenario, so a frame can be drawn at any time.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heatAt } from '../../kit/hedge/fields';
import { lin } from '../../kit/region/geo';
import { enamelMaterial, PAL } from './look';

export interface TrayFrame {
  n: number; pitch: number; x0: number; z: number; y0: number; y1: number;
  coin: { r: number; t: number };
  /** Where a dropping coin leaves the field: its column's x, the lip's height and z. */
  lip: { y: number; z: number; columnX(k: number): number };
  /** The bracket's line, just in front of the window under the tubes. */
  bracketZ: number;
}

export type CoinMove = 'snap' | 'hop' | 'drop';

interface Path { fx: number; fy: number; tx: number; ty: number; t0: number; dur: number; arc: number; drop: boolean }

const seeded = (k: number, salt: number) => ((((k + 1) * 2654435761) ^ (salt * 40503)) >>> 0) % 1000 / 1000;
const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

export class CoinTray {
  readonly group = new THREE.Group();
  private coins: THREE.InstancedMesh;
  private rimN: THREE.InstancedMesh;
  private rimT: THREE.InstancedMesh;
  private colors: Float32Array;
  private colorAttr: THREE.InstancedBufferAttribute;
  private paths: Path[];
  private tail = new Set<number>();
  private bracketMeshes: THREE.Mesh[];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  /** Where each coin rests once the last change has settled (world x, y). */
  readonly at: { x: number; y: number }[];
  bracket: { x0: number; x1: number; y: number; z: number } | null = null;
  private lastEnd = 0;

  constructor(private readonly F: TrayFrame, readonly count: number, brass: THREE.Material) {
    const { coin } = F;
    const body = new THREE.CylinderGeometry(coin.r, coin.r, coin.t - 0.05, 40);
    const ring = new THREE.TorusGeometry(coin.r - 0.005, 0.026, 8, 40).rotateX(Math.PI / 2);
    const rings = mergeGeometries([ring.clone().translate(0, coin.t / 2 - 0.028, 0), ring.clone().translate(0, -coin.t / 2 + 0.028, 0)], false)!;
    this.colors = new Float32Array(count * 3);
    this.colorAttr = new THREE.InstancedBufferAttribute(this.colors, 3);
    body.setAttribute('aColor', this.colorAttr);
    this.coins = new THREE.InstancedMesh(body, enamelMaterial(), count);
    this.rimN = new THREE.InstancedMesh(rings, brass, count);
    this.rimT = new THREE.InstancedMesh(rings, new THREE.MeshBasicMaterial({ color: lin('#b8935a').clone().lerp(lin(PAL.strong), 0.6) }), count);
    for (const m of [this.coins, this.rimN, this.rimT]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; this.group.add(m);
    }
    this.paths = Array.from({ length: count }, () => ({ fx: 0, fy: -100, tx: 0, ty: -100, t0: 0, dur: 0, arc: 0, drop: false }));
    this.at = Array.from({ length: count }, () => ({ x: 0, y: -100 }));
    const mat = new THREE.MeshBasicMaterial({ color: lin('#c8ccd1') });
    this.bracketMeshes = [0, 1, 2].map(() => { const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); b.visible = false; this.group.add(b); return b; });
  }

  /** Where coin k stands at time t. */
  private pos(k: number, t: number): { x: number; y: number } {
    const p = this.paths[k]!;
    if (t <= p.t0 || p.dur <= 0) return t <= p.t0 && p.dur > 0 ? { x: p.fx, y: p.fy } : { x: p.tx, y: p.ty };
    const u = Math.min(1, (t - p.t0) / p.dur);
    if (p.drop) {
      // a fall: down with a growing speed, drifting from its column to its tube, the last tenth a small settle
      const fu = u * u;
      return { x: p.fx + (p.tx - p.fx) * ease(Math.min(1, u * 1.15)), y: p.fy + (p.ty - p.fy) * fu };
    }
    const k2 = ease(u);
    return { x: p.fx + (p.tx - p.fx) * k2, y: p.fy + (p.ty - p.fy) * k2 + p.arc * 4 * u * (1 - u) };
  }

  /**
   * A new pile: each scenario's total (micro-USD) and bin, the tail's scenarios. 'snap' puts every coin in place,
   * 'hop' moves the coins whose place changed, 'drop' pours every coin from the lip in column order.
   */
  set(totals: ArrayLike<number>, bins: ArrayLike<number>, tail: Iterable<number>, t: number, move: CoinMove, order?: readonly number[]) {
    const F = this.F, n = this.count;
    const byBin = new Map<number, number[]>();
    for (let k = 0; k < n; k++) { const b = bins[k]!; let l = byBin.get(b); if (!l) byBin.set(b, (l = [])); l.push(k); }
    const target = new Array<{ x: number; y: number }>(n);
    for (const [b, ks] of byBin) {
      ks.sort((p, q) => totals[p]! - totals[q]! || p - q);
      ks.forEach((k, i) => { target[k] = { x: F.x0 + (b + 0.5) * F.pitch, y: F.y0 + 0.02 + (i + 0.5) * F.coin.t }; });
    }
    const rank = new Map<number, number>();
    (order ?? Array.from({ length: n }, (_, k) => k)).forEach((k, j) => rank.set(k, j));
    let end = t;
    for (let k = 0; k < n; k++) {
      const now = this.pos(k, t), to = target[k]!, p = this.paths[k]!;
      if (move === 'snap') { Object.assign(p, { fx: to.x, fy: to.y, tx: to.x, ty: to.y, t0: t, dur: 0, arc: 0, drop: false }); }
      else if (move === 'drop') {
        const j = rank.get(k) ?? k;
        const delay = (j / n) * 2.2 + seeded(k, 3) * 0.08;
        Object.assign(p, { fx: F.lip.columnX(k), fy: F.lip.y, tx: to.x, ty: to.y, t0: t + delay, dur: 0.55 + seeded(k, 5) * 0.15, arc: 0, drop: true });
      } else {
        const dx = Math.abs(to.x - now.x), dy = Math.abs(to.y - now.y);
        if (dx < 1e-4 && dy < 1e-4) { Object.assign(p, { fx: to.x, fy: to.y, tx: to.x, ty: to.y, t0: t, dur: 0, arc: 0, drop: false }); }
        else {
          const across = dx > F.pitch * 0.5;
          Object.assign(p, {
            fx: now.x, fy: now.y, tx: to.x, ty: to.y, t0: t + seeded(k, 7) * (across ? 0.12 : 0.04),
            dur: across ? Math.min(0.75, 0.42 + dx * 0.02) : 0.28, arc: across ? 0.35 + Math.min(1.2, dx * 0.05) : 0, drop: false,
          });
        }
      }
      end = Math.max(end, p.t0 + p.dur);
      this.at[k] = to;
      const c = heatAt('dark', totals[k]! / 1e6);
      this.colors[k * 3] = c.r; this.colors[k * 3 + 1] = c.g; this.colors[k * 3 + 2] = c.b;
    }
    this.colorAttr.needsUpdate = true;
    this.tail = new Set(tail);
    this.lastEnd = end;
    // the bracket under the tail's tubes, at its settled places
    const xs = [...this.tail].map((k) => target[k]!.x);
    if (xs.length) {
      const x0 = Math.min(...xs) - F.pitch * 0.45, x1 = Math.max(...xs) + F.pitch * 0.45, y = F.y0 - 0.22, z = F.bracketZ;
      const [bar, l, r] = this.bracketMeshes as [THREE.Mesh, THREE.Mesh, THREE.Mesh];
      bar.position.set((x0 + x1) / 2, y, z); bar.scale.set(x1 - x0, 0.05, 0.04);
      l.position.set(x0, y + 0.12, z); l.scale.set(0.05, 0.28, 0.04);
      r.position.set(x1, y + 0.12, z); r.scale.set(0.05, 0.28, 0.04);
      for (const m of this.bracketMeshes) m.visible = true;
      this.bracket = { x0, x1, y, z };
    } else { for (const m of this.bracketMeshes) m.visible = false; this.bracket = null; }
    this.update(t);
  }

  /** Poses every coin at time t; true while any is still moving. */
  update(t: number): boolean {
    const F = this.F;
    let iN = 0, iT = 0;
    for (let k = 0; k < this.count; k++) {
      const { x, y } = this.pos(k, t);
      // a few degrees of tilt and turn, seeded by the scenario, so a stack reads as coins and not a rod
      const tilt = seeded(k, 1) - 0.5;
      this.p.set(x + tilt * 0.03, y, F.z + tilt * 0.02);
      this.q.setFromEuler(this.e.set(tilt * 0.05, tilt * 3, tilt * 0.04));
      this.m4.compose(this.p, this.q, this.one);
      this.coins.setMatrixAt(k, this.m4);
      if (this.tail.has(k)) this.rimT.setMatrixAt(iT++, this.m4); else this.rimN.setMatrixAt(iN++, this.m4);
    }
    this.rimN.count = iN; this.rimT.count = iT;
    for (const m of [this.coins, this.rimN, this.rimT]) m.instanceMatrix.needsUpdate = true;
    return t < this.lastEnd;
  }

  /** When the last move ends (frame-clock seconds). */
  get settlesAt() { return this.lastEnd; }
}
