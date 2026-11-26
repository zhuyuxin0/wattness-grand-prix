// The two marks the starting grid closes on, as geometry the scene can morph
// into and then draw exactly:
//   - the Wattness mark: its trace (miter joins, butt caps) and its node, from
//     ui/Logo.tsx at wattness.ai's display weight;
//   - BNB Chain's symbol, from its official file (bnb-chain-symbol.svg,
//     BNB Chain_Symbol_Yellow.svg from bnbchain.org's brand guidelines,
//     sha256 b8ff1ce0…4f5eff), unaltered and drawn in its own yellow.
import { BufferAttribute, BufferGeometry, CylinderGeometry, ShaderMaterial, Vector2 } from "three";
import type { InterleavedBuffer, InterleavedBufferAttribute } from "three";
import { MARK_NODE, MARK_PATH } from "../../ui/Logo";
import symbolSvg from "./bnb-chain-symbol.svg?raw";

export type P2 = [number, number];

/** Absolute M/L/H/V/Z path data into point lists, one per subpath, closing points dropped. */
export function pathPoints(d: string): P2[][] {
  const tokens = d.match(/[MLHVZ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const out: P2[][] = [];
  let cur: P2[] = [];
  let cmd = "";
  let x = 0;
  let y = 0;
  let i = 0;
  const num = () => Number(tokens[i++]);
  const close = () => {
    const a = cur[0];
    const b = cur.at(-1);
    if (a && b && cur.length > 1 && a[0] === b[0] && a[1] === b[1]) cur.pop();
    if (cur.length) out.push(cur);
    cur = [];
  };
  while (i < tokens.length) {
    const tk = tokens[i]!;
    if (/^[a-z]$/i.test(tk)) {
      if (tk !== tk.toUpperCase()) throw new Error(`relative path command ${tk}`);
      cmd = tk;
      i++;
      if (cmd === "Z") {
        close();
        continue;
      }
    }
    if (cmd === "M") {
      if (cur.length) out.push(cur);
      x = num();
      y = num();
      cur = [[x, y]];
      cmd = "L";
    } else if (cmd === "L") {
      x = num();
      y = num();
      cur.push([x, y]);
    } else if (cmd === "H") {
      x = num();
      cur.push([x, y]);
    } else if (cmd === "V") {
      y = num();
      cur.push([x, y]);
    } else throw new Error(`path command ${cmd}`);
  }
  if (cur.length) out.push(cur);
  return out;
}

// ---------------------------------------------------------------- the Wattness mark

/** The trace's vertices, P0 to P6, in the mark's own units (y down). */
export const W_POINTS: P2[] = pathPoints(MARK_PATH)[0]!;
export const W_NODE = MARK_NODE;
/** wattness.ai's weight for the mark at 48 px and up. */
export const W_STROKE = 2.5;

export interface StrokeSample {
  /** Arc fraction along the trace, 0 at P0 and 1 at P6. */
  u: number;
  /** The two sides of the stroke: +n and −n, n the tangent turned clockwise. */
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface Stroke {
  /** Centerline length, world units. */
  length: number;
  /** Side points from P0 to P6; the miter points are samples, so the joins are exact. */
  samples: StrokeSample[];
  /** Center and unit direction at arc length `s` (world units), extended straight past either end. */
  at(s: number): { x: number; z: number; dx: number; dz: number };
  /** World extent of the stroke's outline along a direction (min, max of p · dir). */
  extent(dirX: number, dirZ: number): [number, number];
}

/**
 * The mark's trace in world space as a stroked outline: butt caps, miter joins,
 * sampled into about `n` pairs of side points along its arc.
 */
export function strokeOf(pts: P2[], halfWidth: number, n: number): Stroke {
  const segs = pts.slice(1).map((p, k) => {
    const a = pts[k]!;
    const dx = p[0] - a[0];
    const dz = p[1] - a[1];
    const len = Math.hypot(dx, dz);
    // The same right-hand normal frameAt gives the track: (−tz, tx).
    return { a, b: p, len, dx: dx / len, dz: dz / len, nx: -dz / len, nz: dx / len };
  });
  const total = segs.reduce((s, g) => s + g.len, 0);
  const side = (j: number, sign: number): P2 => {
    const p = pts[j]!;
    const prev = segs[j - 1];
    const next = segs[j];
    if (!prev || !next) {
      const g = (next ?? prev)!;
      return [p[0] + sign * halfWidth * g.nx, p[1] + sign * halfWidth * g.nz];
    }
    let mx = prev.nx + next.nx;
    let mz = prev.nz + next.nz;
    const ml = Math.hypot(mx, mz);
    mx /= ml;
    mz /= ml;
    const len = halfWidth / (mx * prev.nx + mz * prev.nz);
    return [p[0] + sign * mx * len, p[1] + sign * mz * len];
  };
  const samples: StrokeSample[] = [];
  let acc = 0;
  segs.forEach((g, k) => {
    const [a0, a1] = [side(k, 1), side(k + 1, 1)];
    const [b0, b1] = [side(k, -1), side(k + 1, -1)];
    const m = Math.max(1, Math.round((n * g.len) / total));
    const last = k === segs.length - 1;
    for (let i = 0; i < m + (last ? 1 : 0); i++) {
      const f = i / m;
      samples.push({
        u: (acc + f * g.len) / total,
        ax: a0[0] + (a1[0] - a0[0]) * f,
        az: a0[1] + (a1[1] - a0[1]) * f,
        bx: b0[0] + (b1[0] - b0[0]) * f,
        bz: b0[1] + (b1[1] - b0[1]) * f,
      });
    }
    acc += g.len;
  });
  const outline: P2[] = [];
  for (let j = 0; j < pts.length; j++) outline.push(side(j, 1), side(j, -1));
  return {
    length: total,
    samples,
    at(s) {
      if (s <= 0) {
        const g = segs[0]!;
        return { x: g.a[0] + g.dx * s, z: g.a[1] + g.dz * s, dx: g.dx, dz: g.dz };
      }
      let rest = s;
      for (const g of segs) {
        if (rest <= g.len) return { x: g.a[0] + g.dx * rest, z: g.a[1] + g.dz * rest, dx: g.dx, dz: g.dz };
        rest -= g.len;
      }
      const g = segs.at(-1)!;
      return { x: g.b[0] + g.dx * rest, z: g.b[1] + g.dz * rest, dx: g.dx, dz: g.dz };
    },
    extent(dirX, dirZ) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const [x, z] of outline) {
        const v = x * dirX + z * dirZ;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      return [lo, hi];
    },
  };
}

// ---------------------------------------------------------------- BNB Chain's symbol

const symbolPath = /<path[^>]*\sd="([^"]+)"/.exec(symbolSvg)?.[1] ?? "";
const symbolFill = /<path[^>]*fill="(#[0-9A-Fa-f]{6})"/.exec(symbolSvg)?.[1] ?? "#F0B90B";

/** The symbol's polygons, center and circumradius, in its file's units (y down). */
export const BNB_SYMBOL = (() => {
  const polys = pathPoints(symbolPath);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const poly of polys)
    for (const [x, y] of poly) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  let radius = 0;
  const edges: number[] = [];
  for (const poly of polys)
    poly.forEach((p, k) => {
      const q = poly[(k + 1) % poly.length]!;
      edges.push(p[0], p[1], q[0], q[1]);
      radius = Math.max(radius, Math.hypot(p[0] - cx, p[1] - cy));
    });
  return {
    polys,
    edges: new Float32Array(edges),
    edgeCount: edges.length / 4,
    cx,
    cy,
    width: maxX - minX,
    height: maxY - minY,
    radius,
    /** The file's own fill, BNB Chain yellow. */
    fill: symbolFill,
  };
})();

/**
 * The seal: the ring's own line, which closes on its center as a band of BNB
 * Chain yellow and leaves the symbol wherever it has passed, drawn exactly from
 * its polygons with a pixel-wide antialiased edge. One gesture, so no frame
 * shows a bare disc or a stray fleck of the symbol's gaps.
 *
 * The color is written as the file's sRGB value with no conversion, tone
 * mapping or fog, so a sealed pixel reads #F0B90B.
 */
export function sealMaterial(): ShaderMaterial {
  const hex = Number.parseInt(BNB_SYMBOL.fill.slice(1), 16);
  const n = BNB_SYMBOL.edgeCount;
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uEdges: { value: BNB_SYMBOL.edges },
      uCenter: { value: new Vector2(BNB_SYMBOL.cx, BNB_SYMBOL.cy) },
      uR: { value: BNB_SYMBOL.radius },
      uSweep: { value: 0 },
      uColor: { value: [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255] },
    },
    vertexShader: /* glsl */ `
      attribute vec2 svg;
      varying vec2 vSvg;
      void main() {
        vSvg = svg;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec4 uEdges[${n}];
      uniform vec2 uCenter;
      uniform float uR;
      uniform float uSweep;
      uniform vec3 uColor;
      varying vec2 vSvg;

      float segDist(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a;
        vec2 ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h);
      }

      // Signed distance to the symbol: negative inside (even-odd over its subpaths).
      float symbol(vec2 p) {
        float d = 1e9;
        bool inside = false;
        for (int i = 0; i < ${n}; i++) {
          vec4 e = uEdges[i];
          d = min(d, segDist(p, e.xy, e.zw));
          if ((e.y > p.y) != (e.w > p.y) && p.x < (e.z - e.x) * (p.y - e.y) / (e.w - e.y) + e.x) inside = !inside;
        }
        return inside ? -d : d;
      }

      void main() {
        float r = length(vSvg - uCenter);
        float px = max(fwidth(r), 1e-4);
        float sd = symbol(vSvg);
        float sym = clamp(0.5 - sd / max(fwidth(sd), 1e-4), 0.0, 1.0);
        // Done: the symbol alone, with nothing of the ring left round it.
        float a = sym;
        if (uSweep < 1.0) {
          // At 0 the band is the ring's 2 px line on the circle the symbol is
          // inscribed in. It stays a line, a little bolder on the way, and
          // closes inside the symbol's solid middle (within 0.18 R): a wide
          // band, or an open center, would read as another shape.
          float c = mix(uR, -2.0 * px, uSweep);
          float hw = px + 0.04 * uR * sin(3.14159265 * uSweep);
          float band = smoothstep(c - hw - px, c - hw + px, r) * (1.0 - smoothstep(c + hw - px, c + hw + px, r));
          // Behind the band the symbol is whole; ahead of it, it surfaces
          // faintly and fills in as the band closes, so no hole is left.
          float ghost = smoothstep(0.0, 0.2, uSweep) * mix(0.3, 1.0, smoothstep(0.55, 0.95, uSweep));
          float body = r > c ? 1.0 : ghost;
          a = clamp(band + (1.0 - band) * sym * body, 0.0, 1.0);
        }
        if (a <= 0.0) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
}

/** A flat quad on the ground whose `svg` attribute maps world to the symbol's units. */
export function sealQuad(corners: { x: number; z: number; sx: number; sy: number }[], y: number): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(corners.flatMap((c) => [c.x, y, c.z])), 3));
  g.setAttribute("svg", new BufferAttribute(new Float32Array(corners.flatMap((c) => [c.sx, c.sy])), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

// ---------------------------------------------------------------- a column that rounds into the node

/**
 * The grid's column (a square frustum, side 1 at the base and 0.8 at the top,
 * height 1 from y 0) with a `round(m)` that eases its footprint into a disc of
 * diameter 1 and its sides upright: the pole's battery becoming the mark's node.
 */
export function roundingColumn(segments = 64): { geometry: BufferGeometry; round(m: number): void } {
  const geometry = new CylinderGeometry(1, 1, 1, segments, 1).translate(0, 0.5, 0);
  const pos = geometry.getAttribute("position") as BufferAttribute;
  const base = Float32Array.from(pos.array as Float32Array);
  let last = -1;
  const round = (m: number) => {
    if (m === last) return;
    last = m;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3]!;
      const y = base[i * 3 + 1]!;
      const z = base[i * 3 + 2]!;
      const r = Math.hypot(x, z);
      if (r < 1e-6) {
        pos.setXYZ(i, 0, y, 0);
        continue;
      }
      const s = x / r;
      const c = z / r;
      const square = (0.5 / Math.max(Math.abs(s), Math.abs(c))) * (y > 0.5 ? 0.8 : 1);
      const k = square + (0.5 - square) * m;
      pos.setXYZ(i, s * k, y, c * k);
    }
    pos.needsUpdate = true;
  };
  round(0);
  return { geometry, round };
}

// ---------------------------------------------------------------- moving fat lines in place

function lineBuffer(obj: { geometry: BufferGeometry }): InterleavedBuffer {
  return (obj.geometry.getAttribute("instanceStart") as InterleavedBufferAttribute).data;
}

/** Rewrites a Line2's points in place (same count), without new GPU buffers. */
export function writeStrip(obj: { geometry: BufferGeometry }, xyz: ArrayLike<number>): void {
  const buf = lineBuffer(obj);
  const a = buf.array as Float32Array;
  const n = xyz.length / 3 - 1;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      a[i * 6 + c] = xyz[i * 3 + c]!;
      a[i * 6 + 3 + c] = xyz[(i + 1) * 3 + c]!;
    }
  }
  buf.needsUpdate = true;
}

/** Rewrites a LineSegments2's pairs in place (same count). */
export function writePairs(obj: { geometry: BufferGeometry }, pairs: ArrayLike<number>): void {
  const buf = lineBuffer(obj);
  (buf.array as Float32Array).set(pairs);
  buf.needsUpdate = true;
}
