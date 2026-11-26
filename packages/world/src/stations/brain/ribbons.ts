// Screen-space ribbons: polylines drawn as quads of a constant width in CSS pixels whatever the distance, the way Living
// Brain draws its connections (1.15 px) and its filaments. Additive, the color scaled by the brightness and the alpha by
// it again, as its dark theme does. One ribbon set carries any number of polylines; each vertex knows its line, the two
// pages at its ends, how far along the line it is, and when the line starts to draw, so the highlight's wipe from the
// chosen page and a line drawing itself in are both done on the GPU from a few uniforms.
import * as THREE from 'three';

export interface RibbonLine {
  /** The points, in order from end a to end b. */
  pts: ArrayLike<number>[] | Float32Array;
  /** Page indices at the two ends (for the highlight), or -1. */
  a?: number;
  b?: number;
  /** Colors at end a and end b (linear). */
  colorA: THREE.Color;
  colorB: THREE.Color;
  /** Living Brain's similarity, or a strength in its place: the brightness is 0.16 + 0.26 x this. */
  sim: number;
  /** Width in CSS px (1.15 for a connection). */
  width?: number;
  /** A brightness multiplier (the across connections draw at 1.5). */
  gain?: number;
  /** When the line starts drawing in, on the cloud's clock (seconds); null: always drawn. */
  drawAt?: number | null;
}

const VERT = /* glsl */`
attribute vec3 aOther;
attribute float aSide;
attribute vec3 aColor;
attribute vec2 aEnds;
attribute float aT;
attribute float aSim;
attribute float aGain;
attribute float aWidth;
attribute float aDraw;
uniform vec2 uRes;
uniform float uPixelRatio;
uniform float uSel;
uniform float uSelT;
uniform float uTime;
uniform float uDrawDur;
uniform float uOverlay;
uniform float uWide;
uniform vec3 uTint;
uniform float uTintK;
varying vec3 vColor;
varying float vB;
void main() {
  vec4 cs = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec4 co = projectionMatrix * modelViewMatrix * vec4(aOther, 1.0);
  vec2 ns = cs.xy / cs.w, no = co.xy / co.w;
  vec2 dir = (no - ns) * uRes;
  float len = length(dir);
  vec2 nrm = len > 1e-5 ? vec2(-dir.y, dir.x) / len : vec2(0.0, 1.0);
  float w = (uOverlay > 0.5 ? uWide : aWidth) * uPixelRatio;
  cs.xy += nrm * (w * 0.5) * aSide / uRes * 2.0 * cs.w;
  gl_Position = cs;
  bool isA = abs(aEnds.x - uSel) < 0.5, isB = abs(aEnds.y - uSel) < 0.5;
  bool lit = uSel > -0.5 && (isA || isB);
  // the wipe: from the chosen page outward over the line, a soft band 0.1 of its length; dimming is instant
  float along = isA ? aT : 1.0 - aT;
  float revealed = smoothstep(along - 0.1, along, uSelT);
  float glow = uSel < -0.5 ? 1.0 : (lit ? mix(0.45, 2.5, revealed) : 0.45);
  float drawn = aDraw < -0.5 ? 1.0 : smoothstep(aT - 0.03, aT, (uTime - aDraw) / max(1e-3, uDrawDur));
  if (uOverlay > 0.5) {
    // the second, wider line over each lit connection: its mid color 60 % toward #73E6FF
    vColor = mix(aColor, vec3(0.168, 0.791, 1.0), 0.6);
    vB = lit ? revealed * 0.9 * drawn : 0.0;
  } else {
    vColor = mix(aColor, vec3(0.45, 0.9, 1.0), clamp((glow - 1.0) * 0.4, 0.0, 0.7));
    vB = (0.16 + aSim * 0.26) * glow * aGain * drawn;
  }
  // a member brain's own lines take its tint, as its particles do (Living Brain tints a member 72 % toward its color)
  vColor = mix(vColor, uTint, uTintK);
}`;

const FRAG = /* glsl */`
uniform float uFade;
uniform float uOverlay;
varying vec3 vColor;
varying float vB;
void main() {
  float b = vB * uFade;
  if (b <= 0.0005) discard;
  gl_FragColor = uOverlay > 0.5 ? vec4(vColor, b) : vec4(vColor * b, b);
}`;

export interface Ribbons {
  mesh: THREE.Mesh;
  /** The wider highlight line over each lit connection (shares the geometry). */
  over: THREE.Mesh;
  uniforms: Record<string, THREE.IUniform>;
  /** Moves the points of line i (same count as built). */
  setLine(i: number, pts: ArrayLike<number>[] | Float32Array): void;
  /** Call after setLine. */
  commit(): void;
  count: number;
}

const ptAt = (pts: ArrayLike<number>[] | Float32Array, j: number): [number, number, number] =>
  pts instanceof Float32Array ? [pts[j * 3]!, pts[j * 3 + 1]!, pts[j * 3 + 2]!] : [pts[j]![0]!, pts[j]![1]!, pts[j]![2]!];
const npts = (pts: ArrayLike<number>[] | Float32Array) => (pts instanceof Float32Array ? pts.length / 3 : pts.length);

export function makeRibbons(lines: RibbonLine[], opts: { overlay?: boolean; wide?: number } = {}): Ribbons {
  let segs = 0;
  for (const l of lines) segs += Math.max(0, npts(l.pts) - 1);
  const V = segs * 4;
  const pos = new Float32Array(V * 3), other = new Float32Array(V * 3), side = new Float32Array(V), col = new Float32Array(V * 3);
  const ends = new Float32Array(V * 2), tt = new Float32Array(V), sim = new Float32Array(V), gain = new Float32Array(V), width = new Float32Array(V), draw = new Float32Array(V);
  const index = new Uint32Array(segs * 6);
  const starts: number[] = [];
  let v = 0, q = 0;
  const c = new THREE.Color();
  lines.forEach((l) => {
    starts.push(v);
    const n = npts(l.pts);
    for (let j = 0; j < n - 1; j++) {
      const t0 = j / (n - 1), t1 = (j + 1) / (n - 1);
      // the vertices at this segment's start (other = its end) and at its end (other = its start, so the side flips)
      for (let k = 0; k < 4; k++) {
        const atEnd = k >= 2, s = k % 2 === 0 ? 1 : -1;
        const t = atEnd ? t1 : t0;
        c.copy(l.colorA).lerp(l.colorB, t);
        col.set([c.r, c.g, c.b], v * 3);
        side[v] = atEnd ? -s : s;
        ends[v * 2] = l.a ?? -1; ends[v * 2 + 1] = l.b ?? -1;
        tt[v] = t; sim[v] = l.sim; gain[v] = l.gain ?? 1; width[v] = l.width ?? 1.15; draw[v] = l.drawAt == null ? -1 : l.drawAt;
        v++;
      }
      const b = v - 4;
      index.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], q); q += 6;
    }
  });
  const g = new THREE.BufferGeometry();
  const P = new THREE.BufferAttribute(pos, 3), O = new THREE.BufferAttribute(other, 3);
  g.setAttribute('position', P); g.setAttribute('aOther', O);
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aEnds', new THREE.BufferAttribute(ends, 2)); g.setAttribute('aT', new THREE.BufferAttribute(tt, 1));
  g.setAttribute('aSim', new THREE.BufferAttribute(sim, 1)); g.setAttribute('aGain', new THREE.BufferAttribute(gain, 1));
  g.setAttribute('aWidth', new THREE.BufferAttribute(width, 1)); g.setAttribute('aDraw', new THREE.BufferAttribute(draw, 1));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  const setLine = (i: number, pts: ArrayLike<number>[] | Float32Array) => {
    let w = starts[i]!;
    const n = npts(pts);
    for (let j = 0; j < n - 1; j++) {
      const p0 = ptAt(pts, j), p1 = ptAt(pts, j + 1);
      for (let k = 0; k < 4; k++) {
        const atEnd = k >= 2, self = atEnd ? p1 : p0, oth = atEnd ? p0 : p1;
        pos[w * 3] = self[0]; pos[w * 3 + 1] = self[1]; pos[w * 3 + 2] = self[2];
        other[w * 3] = oth[0]; other[w * 3 + 1] = oth[1]; other[w * 3 + 2] = oth[2];
        w++;
      }
    }
  };
  lines.forEach((l, i) => setLine(i, l.pts));
  g.computeBoundingSphere();
  const uniforms: Record<string, THREE.IUniform> = {
    uRes: { value: new THREE.Vector2(1920, 1080) }, uPixelRatio: { value: 1 }, uSel: { value: -1 }, uSelT: { value: 0 },
    uTime: { value: 0 }, uDrawDur: { value: 0.5 }, uOverlay: { value: 0 }, uWide: { value: opts.wide ?? 1.4 }, uFade: { value: 1 },
    uTint: { value: new THREE.Color(1, 1, 1) }, uTintK: { value: 0 },
  };
  const mat = (overlay: number) => new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...uniforms, uOverlay: { value: overlay } },
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  });
  const base = mat(0), over = mat(1);
  // the two materials share every uniform but the mode
  for (const k of Object.keys(uniforms)) if (k !== 'uOverlay') { base.uniforms[k] = uniforms[k]!; over.uniforms[k] = uniforms[k]!; }
  const mesh = new THREE.Mesh(g, base); mesh.frustumCulled = false;
  const overMesh = new THREE.Mesh(g, over); overMesh.frustumCulled = false; overMesh.renderOrder = 1;
  overMesh.visible = opts.overlay ?? true;
  return {
    mesh, over: overMesh, uniforms, setLine, count: lines.length,
    commit: () => { P.needsUpdate = true; O.needsUpdate = true; g.computeBoundingSphere(); },
  };
}

/** A connection's curve, as Living Brain draws it (1.3d): a quadratic arc whose control point sits on the midpoint's
 *  direction at 1.1 x the ends' mean radius, so it bulges outward; five inner points pushed sideways by 0.013 to 0.031
 *  at a random angle; a Catmull-Rom curve through the seven, sampled in 22 segments (23 points). */
export function arcPoints(a: THREE.Vector3, b: THREE.Vector3, rnd: () => number, segments = 22): Float32Array {
  const mean = (a.length() + b.length()) * 0.5;
  const ctrl = a.clone().add(b).multiplyScalar(0.5);
  if (ctrl.lengthSq() < 1e-8) ctrl.set(0, 1, 0);
  ctrl.normalize().multiplyScalar(1.1 * mean);
  const q = new THREE.QuadraticBezierCurve3(a.clone(), ctrl, b.clone());
  const pts = [a.clone()];
  const up = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3();
  for (let i = 1; i <= 5; i++) {
    const p = q.getPoint(i / 6), dir = p.clone().normalize();
    up.set(Math.abs(dir.y) < 0.9 ? 0 : 1, Math.abs(dir.y) < 0.9 ? 1 : 0, 0);
    n1.crossVectors(dir, up).normalize(); n2.crossVectors(dir, n1).normalize();
    const ang = rnd() * Math.PI * 2, r = 0.026 * (0.5 + 0.7 * rnd());
    pts.push(p.add(n1.multiplyScalar(Math.cos(ang) * r)).add(n2.multiplyScalar(Math.sin(ang) * r)));
  }
  pts.push(b.clone());
  const curve = new THREE.CatmullRomCurve3(pts);
  const out = new Float32Array((segments + 1) * 3);
  curve.getPoints(segments).forEach((p, i) => { out[i * 3] = p.x; out[i * 3 + 1] = p.y; out[i * 3 + 2] = p.z; });
  return out;
}

/** The point a fraction f along a polyline (by index, as Living Brain's pulses move). */
export function along(pts: Float32Array, f: number, out: THREE.Vector3): THREE.Vector3 {
  const n = pts.length / 3 - 1;
  const x = Math.max(0, Math.min(1, f)) * n, i = Math.min(n - 1, Math.floor(x)), k = x - i;
  return out.set(
    pts[i * 3]! + (pts[(i + 1) * 3]! - pts[i * 3]!) * k,
    pts[i * 3 + 1]! + (pts[(i + 1) * 3 + 1]! - pts[i * 3 + 1]!) * k,
    pts[i * 3 + 2]! + (pts[(i + 1) * 3 + 2]! - pts[i * 3 + 2]!) * k,
  );
}
