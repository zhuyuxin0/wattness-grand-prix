import { Color, Vector3 } from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { Stage } from "./stage";

export interface LineStyle {
  color: string;
  /** CSS pixels. */
  width: number;
  opacity?: number;
  dashed?: boolean;
  dashSize?: number;
  gapSize?: number;
  depthTest?: boolean;
  /** Draw order among transparent objects. */
  order?: number;
}

function material(stage: Stage, s: LineStyle): LineMaterial {
  const m = new LineMaterial({
    color: new Color(s.color).getHex(),
    linewidth: s.width,
    transparent: true,
    opacity: s.opacity ?? 1,
    dashed: s.dashed ?? false,
    dashSize: s.dashSize ?? 0.4,
    gapSize: s.gapSize ?? 0.4,
    depthTest: s.depthTest ?? true,
    depthWrite: false,
    worldUnits: false,
  });
  return stage.trackLine(m);
}

/**
 * A polyline of constant pixel width. `reveal(f)` draws the first fraction of
 * its segments, which is how links and rings draw themselves in.
 */
export class Polyline {
  readonly line: Line2;
  readonly material: LineMaterial;
  readonly segments: number;

  constructor(stage: Stage, points: Vector3[], style: LineStyle) {
    const g = new LineGeometry();
    const flat: number[] = [];
    for (const p of points) flat.push(p.x, p.y, p.z);
    g.setPositions(flat);
    this.material = material(stage, style);
    this.line = new Line2(g, this.material);
    if (style.dashed) this.line.computeLineDistances();
    this.line.renderOrder = style.order ?? 0;
    this.line.frustumCulled = false;
    this.segments = points.length - 1;
  }

  reveal(f: number): void {
    const n = Math.round(Math.max(0, Math.min(1, f)) * this.segments);
    (this.line.geometry as LineGeometry).instanceCount = n;
    this.line.visible = n > 0 && this.material.opacity > 0.001;
  }

  set opacity(v: number) {
    this.material.opacity = v;
    this.line.visible = v > 0.001 && ((this.line.geometry as LineGeometry).instanceCount ?? 1) > 0;
  }
}

/** Many separate segments in one draw call. */
export function segments(stage: Stage, pairs: number[], style: LineStyle): LineSegments2 {
  const g = new LineSegmentsGeometry();
  g.setPositions(pairs);
  const l = new LineSegments2(g, material(stage, style));
  l.renderOrder = style.order ?? 0;
  l.frustumCulled = false;
  return l;
}

/** Points along a cubic Bezier. */
export function bezier(a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: number): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(
      new Vector3(
        u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
        u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
        u * u * u * a.z + 3 * u * u * t * b.z + 3 * u * t * t * c.z + t * t * t * d.z,
      ),
    );
  }
  return out;
}
