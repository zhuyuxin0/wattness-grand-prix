// The hedge on the field: one bar of the walkthrough's liquid glass for each hedged hour, across all 301 columns (the
// contracts are chosen before prices are known, so the same in every scenario), at the level its contracts lock at
// the assumed entry, 1.4 asinh(q x entry / 1,500) over the floor (sold) or down in the trench (bought), as thick as
// 0.08 + 0.32 |q| / 100 m. Under a bar whose contracts the schedule does not deliver, the light: #ffe3ad, additive,
// brightest at the pane and falling away from it, weighted 0.1 + 0.9 shortfall^1.5.
import * as THREE from 'three';
import { glassMaterial, THEMES, hOf, zOf } from '../../kit/hedge/fields';
import { OVERLAY } from '../../lib/stage';
import { lin } from '../../kit/region/geo';
import type { Theme } from '../../lib/stage';

export interface GlassBar { he: number; q: number; entryUsd: number; light: number }
export interface FieldFrame { cx: number; cz: number; floorY: number; width: number; hz: number }

const plane = () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

const LIGHT_VERT = /* glsl */`
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const LIGHT_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uA; uniform float uPane; uniform float uFall; uniform float uFloor; uniform vec2 uX;
varying vec3 vW;
void main() {
  // brightest at the pane, falling away from it; a little stronger on the floor's side of the pane, where the
  // schedule would have to reach to meet it
  float d = abs(vW.y - uPane);
  float toward = step(0.0, (uFloor - uPane) * (vW.y - uPane));
  float k = exp(-d / (uFall * mix(1.0, 1.6, toward)));
  // the row's two ends fade, so the light reads as a band and not a box
  float e = smoothstep(uX.x, uX.x + 1.2, vW.x) * (1.0 - smoothstep(uX.y - 1.2, uX.y, vW.x));
  float a = uA * k * e;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor, a);
}`;

export interface PlacedBar { he: number; y: number; top: number; bottom: number; z: number; t: number }

/** A bar's level and thickness for q contracts at an entry ($/MWh). */
export const barLevel = (F: FieldFrame, q: number, entryUsd: number) => ({ level: F.floorY + hOf(q * entryUsd), t: 0.08 + 0.32 * Math.abs(q) / 100 });

/**
 * The glass for a plan, one slot an hour, built once and posed in place: set() takes the hedged hours' bars and moves
 * each slot's pane, thickness and light; an hour without contracts hides its slot. A slot's two panes are the
 * walkthrough's tile glass; its light the additive band (lit panes also read warm from under).
 */
export class LiveGlass {
  readonly group = new THREE.Group();
  readonly bars: PlacedBar[] = [];
  private slots: { top: THREE.InstancedMesh; edgeHold: THREE.Group; edge: THREE.InstancedMesh; glow: THREE.Mesh; tint: [THREE.Color, number][] }[] = [];
  private readonly depth: number;
  private readonly L: number;

  constructor(private readonly theme: Theme, grab: any, res: THREE.Vector2, private readonly F: FieldFrame) {
    const T = (THEMES as any)[theme];
    this.group.name = 'glass';
    this.depth = F.hz * 0.96; this.L = F.width + 1.6;
    for (let he = 1; he <= 24; he++) {
      const top = new THREE.InstancedMesh(plane(), glassMaterial(theme, grab, res, { size: [this.L, this.depth], radius: 0.3, rimW: 0.45, tiles: true }), 1);
      { const u = (top.material as any).uniforms; u.uTintA.value = T.glassTintA + 0.2; u.uFrost.value = 0.3; u.uHairA.value = 1; u.uEnvA.value = 0.7; }
      top.renderOrder = 12;
      const edgeHold = new THREE.Group();
      const edge = new THREE.InstancedMesh(plane(), glassMaterial(theme, grab, res, { size: [this.L, 0.1], radius: 0.04, rimW: 0.04, tiles: true }), 1);
      { const u = (edge.material as any).uniforms; u.uTintA.value = T.glassTintA + 0.34; u.uFrost.value = 0.45; u.uDome.value = 0.6; u.uHairA.value = 1; }
      edge.rotation.x = Math.PI / 2; edge.renderOrder = 13; edgeHold.add(edge);
      for (const m of [top, edge]) { m.frustumCulled = false; m.userData.noAO = true; }
      const mat = new THREE.ShaderMaterial({
        vertexShader: LIGHT_VERT, fragmentShader: LIGHT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uColor: { value: lin(T.light).clone() }, uA: { value: 0 }, uPane: { value: 0 }, uFall: { value: 0.42 }, uFloor: { value: F.floorY },
          uX: { value: new THREE.Vector2(F.cx - F.width / 2, F.cx + F.width / 2) } },
      });
      const glow = new THREE.Mesh(new THREE.BoxGeometry(F.width, 4.4, this.depth * 0.98), mat); glow.renderOrder = 9; glow.userData.noAO = true; glow.visible = false;
      const tint: [THREE.Color, number][] = [top, edge].map((m) => { const u = (m.material as any).uniforms; return [u.uTint.value.clone(), u.uTintA.value]; });
      this.group.add(top, edgeHold, glow);
      top.visible = false; edgeHold.visible = false;
      this.slots.push({ top, edgeHold, edge, glow, tint });
    }
    this.group.traverse((o) => o.layers.set(OVERLAY));
  }

  /** Poses the bars: one per hedged hour (he 1..24), at its contracts' level, its light weight 0..1. */
  set(bars: readonly GlassBar[]) {
    const T = (THEMES as any)[this.theme], F = this.F, warm = lin(T.light);
    const on = new Map(bars.map((b) => [b.he, b]));
    this.bars.length = 0;
    this.slots.forEach((s, i) => {
      const he = i + 1, b = on.get(he);
      const show = !!b && b.q !== 0;
      s.top.visible = show; s.edgeHold.visible = show; s.glow.visible = show && (b?.light ?? 0) > 0;
      if (!show) return;
      const { level, t } = barLevel(F, b!.q, b!.entryUsd), z = F.cz + zOf(he, F.hz);
      s.top.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(F.cx, level + t / 2, z), new THREE.Quaternion(), new THREE.Vector3(this.L, 1, this.depth)));
      s.top.instanceMatrix.needsUpdate = true;
      s.edgeHold.position.set(F.cx, level, z + this.depth / 2);
      s.edge.setMatrixAt(0, new THREE.Matrix4().makeScale(this.L, 1, t)); s.edge.instanceMatrix.needsUpdate = true;
      { const u = (s.edge.material as any).uniforms; u.uSize.value.set(this.L, t); u.uRadius.value = Math.min(0.3, t * 0.45); u.uRimW.value = Math.min(0.2, t * 0.4); }
      // a lit pane reads warm from under it
      [s.top, s.edge].forEach((m, j) => {
        const u = (m.material as any).uniforms, [c0, a0] = s.tint[j]!;
        u.uTint.value.copy(c0).lerp(warm, 0.55 * b!.light); u.uTintA.value = a0 + 0.22 * b!.light;
      });
      if (b!.light > 0) {
        const u = (s.glow.material as any).uniforms; u.uA.value = 0.5 * b!.light; u.uPane.value = level;
        s.glow.position.set(F.cx, level, z);
      }
      this.bars.push({ he, y: level, top: level + t / 2, bottom: level - t / 2, z, t });
    });
  }
}

/** Builds the bars for a plan's hedged hours. Returns the group (on the overlay layer) and each bar's pane level. */
export function buildGlass(theme: Theme, grab: any, res: THREE.Vector2, F: FieldFrame, bars: readonly GlassBar[]) {
  const g = new LiveGlass(theme, grab, res, F);
  g.set(bars);
  return { group: g.group, bars: g.bars, live: g };
}
