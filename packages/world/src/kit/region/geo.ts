// @ts-nocheck
// A small builder for the isometric line art: flat-filled solids (one merged mesh, shaded by face direction, so a
// face lands on its colour whatever the lights) and their edges (one merged set of pixel-width lines).
// Scene units: +x east, +y up, +z south (the kit's frame).
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { exactColor } from '../tone';

const cache = new Map();
export function lin(hex) {
  if (!cache.has(hex)) cache.set(hex, exactColor(THREE, hex));
  return cache.get(hex);
}

// Face shading: top 1.0, south faces 0.86, east faces 0.72, north and west 0.62 (the camera sits south-east).
const FLAT_VERT = /* glsl */`
attribute vec3 color;
varying vec3 vColor; varying vec3 vN;
void main() {
  vColor = color;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FLAT_FRAG = /* glsl */`
uniform float uDim; uniform float uOpacity;
varying vec3 vColor; varying vec3 vN;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float up = max(n.y, 0.0), side = 1.0 - abs(n.y);
  float s = 0.62 * side + 1.0 * up + 0.24 * max(n.z, 0.0) * side + 0.10 * max(n.x, 0.0) * side;
  s = mix(s, 0.5, step(n.y, -0.5));
  gl_FragColor = vec4(vColor * s * uDim, uOpacity);
}`;

export function flatMaterial({ side = THREE.FrontSide, transparent = false, opacity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: FLAT_VERT, fragmentShader: FLAT_FRAG, side, transparent, depthWrite: !transparent,
    uniforms: { uDim: { value: 1 }, uOpacity: { value: opacity } },
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
}

export function lineMaterial({ width = 1, dpr = 1, color = null, opacity = 1, dashed = false, dash = 6, gap = 4, depthTest = true } = {}) {
  const m = new LineMaterial({
    color: color ? lin(color) : 0xffffff, vertexColors: !color, linewidth: width * dpr, transparent: opacity < 1 || dashed,
    opacity, dashed, dashSize: dash, gapSize: gap, worldUnits: false, depthTest, depthWrite: false,
  });
  m.userData.cssWidth = width;
  return m;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Builder {
  constructor() { this.pos = []; this.nrm = []; this.col = []; this.ep = []; this.ec = []; }

  tri(a, b, c, hex) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const k = lin(hex);
    for (const p of [a, b, c]) { this.pos.push(p.x, p.y, p.z); this.nrm.push(n.x, n.y, n.z); this.col.push(k.r, k.g, k.b); }
  }
  /** Quad a b c d, counter-clockwise seen from outside. */
  quad(a, b, c, d, hex) { this.tri(a, b, c, hex); this.tri(a, c, d, hex); }
  edge(a, b, hex) {
    const k = lin(hex);
    this.ep.push(a.x, a.y, a.z, b.x, b.y, b.z); this.ec.push(k.r, k.g, k.b, k.r, k.g, k.b);
  }
  loop(pts, hex) { for (let i = 0; i < pts.length; i++) this.edge(pts[i], pts[(i + 1) % pts.length], hex); }

  /** Box: centre x, z; base y; size w (x) h (y) d (z); yaw about y; colours: fill, top (optional), edge (null: none). */
  box({ x = 0, y = 0, z = 0, w, h, d, yaw = 0, roll = 0, fill, top = null, edge = null, bottom = false, m = null }) {
    const mtx = m ? m.clone() : new THREE.Matrix4();
    if (!m) mtx.compose(V(x, y + h / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, roll, 'YXZ')), V(1, 1, 1));
    const c = [];
    for (let i = 0; i < 8; i++) c.push(V(i & 1 ? w / 2 : -w / 2, i & 2 ? h / 2 : -h / 2, i & 4 ? d / 2 : -d / 2).applyMatrix4(mtx));
    const T = top || fill;
    this.quad(c[2], c[6], c[7], c[3], T);           // top (+y)
    this.quad(c[4], c[5], c[7], c[6], fill);        // +z (south)
    this.quad(c[1], c[3], c[7], c[5], fill);        // +x (east)
    this.quad(c[0], c[2], c[3], c[1], fill);        // -z
    this.quad(c[0], c[4], c[6], c[2], fill);        // -x
    if (bottom) this.quad(c[0], c[1], c[5], c[4], fill);
    if (edge) {
      for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) this.edge(c[a], c[b], edge);
    }
    return c;
  }

  /** Extruded polygon [[x, z], ...] from y0 to y1: top fill, side fill, edges along the top and (verticals) at the
   *  corners; a rounded outline has no corners, so it draws only the top loop. */
  prism(poly, y0, y1, { top, side, edge = null, bottomEdge = false, verticals = true }) {
    const pts = poly.map(([x, z]) => new THREE.Vector2(x, z));
    if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
    const tris = THREE.ShapeUtils.triangulateShape(pts, []);
    // in (x, z) with +z south, a counter-clockwise ring seen from +y is clockwise in (x, z); fix winding per triangle
    for (const [a, b, c] of tris) {
      const A = V(pts[a].x, y1, pts[a].y), B = V(pts[b].x, y1, pts[b].y), C = V(pts[c].x, y1, pts[c].y);
      const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A));
      if (n.y >= 0) this.tri(A, B, C, top); else this.tri(A, C, B, top);
    }
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const a = V(p.x, y0, p.y), b = V(q.x, y0, q.y), c = V(q.x, y1, q.y), d = V(p.x, y1, p.y);
      // outward normal: test against the centroid direction
      const nn = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
      // pts run counter-clockwise in (x, z-as-y), so the outward normal of p -> q is (dz, -dx)
      const out = V(q.y - p.y, 0, -(q.x - p.x));
      if (nn.dot(out) >= 0) this.quad(a, b, c, d, side); else this.quad(a, d, c, b, side);
      if (edge) { this.edge(d, c, edge); if (verticals) this.edge(a, d, edge); if (bottomEdge) this.edge(a, b, edge); }
    }
  }

  /** Vertical cylinder (or frustum) with seg sides; edges: top and bottom rings and the two silhouettes for a camera at az. */
  cyl({ x, y = 0, z, r0, r1 = r0, h, seg = 10, fill, top = null, edge = null, az = 135 }) {
    const ring = (r, yy) => Array.from({ length: seg }, (_, i) => { const a = (i / seg) * Math.PI * 2; return V(x + Math.cos(a) * r, yy, z + Math.sin(a) * r); });
    const lo = ring(r0, y), hi = ring(r1, y + h);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      this.quad(lo[i], hi[i], hi[j], lo[j], fill);
      this.tri(V(x, y + h, z), hi[j], hi[i], top || fill);
    }
    if (edge) {
      this.loop(hi, edge);
      // silhouettes: perpendicular to the view's horizontal direction
      const a = (az * Math.PI) / 180, vx = Math.sin(a), vz = -Math.cos(a);
      for (const s of [1, -1]) {
        const px = -vz * s, pz = vx * s;
        this.edge(V(x + px * r0, y, z + pz * r0), V(x + px * r1, y + h, z + pz * r1), edge);
      }
      // the bottom ring's front half only
      for (let i = 0; i < seg; i++) {
        const j = (i + 1) % seg, m = lo[i].clone().add(lo[j]).multiplyScalar(0.5);
        if ((m.x - x) * vx + (m.z - z) * vz > 0) this.edge(lo[i], lo[j], edge);
      }
    }
  }

  build({ dpr = 1, lineWidth = 1, material = null, lineMat = null } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material || flatMaterial());
    let lines = null;
    if (this.ep.length) {
      const lg = new LineSegmentsGeometry();
      lg.setPositions(this.ep); lg.setColors(this.ec);
      const lm = lineMat || lineMaterial({ width: lineWidth, dpr });
      lm.polygonOffset = true; lm.polygonOffsetFactor = -2; lm.polygonOffsetUnits = -6;
      lines = new LineSegments2(lg, lm); lines.computeLineDistances();
      lines.userData.overlay = true;
    }
    const group = new THREE.Group(); group.add(mesh); if (lines) group.add(lines);
    return { group, mesh, lines };
  }
}

/** Seeded random numbers (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── rounded outlines ──────────────────────────────────────────────────────────────────────────────────────
/** A polygon's corners rounded ([[x, z], ...], closed): each corner becomes a circular arc of radius r (smaller where
 *  a neighbouring edge is short: the arc never takes more than 45% of either edge), convex and concave alike. */
export function filletPoly(poly, r, seg = 6) {
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = poly[i], a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
    const ux = a[0] - p[0], uz = a[1] - p[1], vx = b[0] - p[0], vz = b[1] - p[1];
    const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
    const th = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uz * vz) / (lu * lv))));
    if (th > Math.PI - 1e-3 || r <= 0) { out.push([p[0], p[1]]); continue; }
    const t = Math.min(r / Math.tan(th / 2), 0.45 * lu, 0.45 * lv), re = t * Math.tan(th / 2);
    const t1 = [p[0] + (ux / lu) * t, p[1] + (uz / lu) * t], t2 = [p[0] + (vx / lv) * t, p[1] + (vz / lv) * t];
    const bx = ux / lu + vx / lv, bz = uz / lu + vz / lv, bl = Math.hypot(bx, bz);
    const k = re / Math.sin(th / 2), c = [p[0] + (bx / bl) * k, p[1] + (bz / bl) * k];
    const a1 = Math.atan2(t1[1] - c[1], t1[0] - c[0]), a2 = Math.atan2(t2[1] - c[1], t2[0] - c[0]);
    let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    for (let j = 0; j <= seg; j++) { const ang = a1 + (da * j) / seg; out.push([c[0] + Math.cos(ang) * re, c[1] + Math.sin(ang) * re]); }
  }
  return out;
}

/** A rectangle centred at (cx, cz), w (x) by d (z), with corners of radius r. */
export function roundRect(cx, cz, w, d, r, seg = 6) {
  return filletPoly([[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]], r, seg);
}

/** The corner radius for a pad of this size: small, scaled to the pad (scene units). */
export const padRadius = (w, d) => Math.max(4, Math.min(11, 0.065 * Math.min(w, d)));

/** Offset a closed polygon by dist (outward positive), mitred at each vertex (fine for rounded outlines). */
export function offsetPoly(poly, dist) {
  const n = poly.length;
  let area = 0; for (let i = 0; i < n; i++) { const p = poly[i], q = poly[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
  const sg = area > 0 ? 1 : -1;
  const nrm = (p, q) => { const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1; return [(sg * dz) / l, (-sg * dx) / l]; };
  return poly.map((p, i) => {
    const a = nrm(poly[(i - 1 + n) % n], p), b = nrm(p, poly[(i + 1) % n]);
    let mx = a[0] + b[0], mz = a[1] + b[1]; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const k = Math.max(0.5, mx * b[0] + mz * b[1]);
    return [p[0] + (mx * dist) / k, p[1] + (mz * dist) / k];
  });
}

const SHADE_VERT = 'attribute float aA; varying float vA; void main() { vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SHADE_FRAG = 'uniform float uOpacity; varying float vA; void main() { float a = vA * vA * (3.0 - 2.0 * vA); gl_FragColor = vec4(0.0, 0.0, 0.0, a * uOpacity); }';

/** The pads' shades as one mesh: each outline, offset by (dx, dz) toward the camera, solid inside and feathered over
 *  its edge (feather wide, half inside and half outside the outline), so a shade has exactly its pad's corners. */
export function shadeMesh(polys, { dx = 4, dz = 8, feather = 7, opacity = 0.4, y = 0.05 } = {}) {
  const pos = [], al = [], idx = [];
  for (const poly0 of polys) {
    const poly = poly0.map(([x, z]) => [x + dx, z + dz]);
    const inner = offsetPoly(poly, -feather / 2), outer = offsetPoly(poly, feather / 2);
    const base = pos.length / 3, n = poly.length;
    for (const [x, z] of inner) { pos.push(x, y, z); al.push(1); }
    for (const [x, z] of outer) { pos.push(x, y, z); al.push(0); }
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(inner.map(([x, z]) => new THREE.Vector2(x, z)), [])) idx.push(base + a, base + b, base + c);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; idx.push(base + i, base + n + i, base + n + j, base + i, base + n + j, base + j); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aA', new THREE.Float32BufferAttribute(al, 1));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({ vertexShader: SHADE_VERT, fragmentShader: SHADE_FRAG, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, uniforms: { uOpacity: { value: opacity } } });
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = -1; mesh.frustumCulled = false;
  return mesh;
}

