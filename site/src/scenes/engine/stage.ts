import { Color, PerspectiveCamera, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer } from "three";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { color } from "../../design/tokens";

export type Quality = "low" | "medium" | "high";

export interface StageOptions {
  quality: Quality;
  /** Overrides the quality's pixel ratio, e.g. 2 for a 4K capture of a 1080p layout. */
  pixelRatio?: number;
  /** Keep the drawing buffer so a capture can read the canvas after the frame. */
  preserve?: boolean;
  fov?: number;
}

const PIXEL_RATIO: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };

/** Something the stage projects into the label layer every frame. */
export interface Label {
  el: HTMLElement;
  world: Vector3;
  /** Opacity 0..1; 0 hides the element. */
  opacity: number;
  /** Pixel offset from the projected point. */
  dx: number;
  dy: number;
  /** Which corner of the element sits on the point: fractions of its box. */
  ax: number;
  ay: number;
  /** Labels behind this distance from the camera fade out. */
  fadeFar?: number;
  /**
   * Labels with the same group never overlap: a label that would land on an
   * earlier one tries the other side of its point, then hides for that frame.
   */
  group?: string;
  last: string;
  size?: { w: number; h: number };
}

/**
 * One WebGL canvas, one camera and an HTML layer of labels projected from
 * world positions. HTML labels stay crisp at any pixel ratio and use the site's
 * own fonts, and they land in a page screenshot like the canvas does.
 */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly labelLayer: HTMLDivElement;
  readonly hud: HTMLDivElement;
  readonly width = { css: 1, px: 1 };
  readonly height = { css: 1, px: 1 };
  private readonly labels: Label[] = [];
  private readonly lineMaterials = new Set<LineMaterial>();
  private readonly ro: ResizeObserver;
  private readonly scratch = new Vector3();
  private readonly resolution = new Vector2(1, 1);
  private ratio: number;
  private readonly baseFov: number;

  constructor(
    readonly container: HTMLElement,
    opts: StageOptions,
  ) {
    this.ratio = opts.pixelRatio ?? Math.min(window.devicePixelRatio || 1, PIXEL_RATIO[opts.quality]);
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: opts.preserve ?? false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(new Color(color.bg), 1);
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.domElement.className = "scene__canvas";
    this.baseFov = opts.fov ?? 32;
    this.camera = new PerspectiveCamera(this.baseFov, 16 / 9, 0.1, 2000);

    this.labelLayer = document.createElement("div");
    this.labelLayer.className = "scene__labels";
    this.hud = document.createElement("div");
    this.hud.className = "scene__hud";
    container.append(this.renderer.domElement, this.labelLayer, this.hud);

    this.ro = new ResizeObserver(() => this.resize(true));
    this.ro.observe(container);
    this.resize();
  }

  resize(notify = false): void {
    const w = Math.max(1, Math.round(this.container.clientWidth));
    const h = Math.max(1, Math.round(this.container.clientHeight));
    if (w === this.width.css && h === this.height.css) return;
    this.width.css = w;
    this.height.css = h;
    this.width.px = Math.round(w * this.ratio);
    this.height.px = Math.round(h * this.ratio);
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    // Below 16:9 the vertical field widens so the horizontal one holds: the
    // scripted framing survives a portrait phone.
    // Scenes keep their subject inside the middle of a 16:9 frame, so a tall
    // stage may crop toward that middle rather than hold the full width.
    const base = (this.baseFov * Math.PI) / 360;
    const wide = 16 / 9;
    const a = this.camera.aspect;
    const fit = 1 - 0.25 * Math.min(1, Math.max(0, (wide - a) / (wide - 0.6)));
    this.camera.fov = a >= wide ? this.baseFov : Math.min(80, (360 / Math.PI) * Math.atan((Math.tan(base) * wide * fit) / a));
    this.camera.updateProjectionMatrix();
    this.resolution.set(w, h);
    for (const m of this.lineMaterials) m.resolution.copy(this.resolution);
    if (notify) this.onResize?.(w, h);
  }

  onResize?: (w: number, h: number) => void;

  /** Fat lines measure their width in CSS pixels against the canvas size. */
  trackLine<M extends LineMaterial>(m: M): M {
    m.resolution.copy(this.resolution);
    this.lineMaterials.add(m);
    return m;
  }

  label(className: string, html = "", place: Partial<Pick<Label, "dx" | "dy" | "ax" | "ay" | "fadeFar" | "group">> = {}): Label {
    const el = document.createElement("div");
    el.className = `scene-label ${className}`;
    if (html) el.innerHTML = html;
    this.labelLayer.append(el);
    const l: Label = { el, world: new Vector3(), opacity: 0, dx: 0, dy: 0, ax: 0, ay: 0.5, last: "", ...place };
    this.labels.push(l);
    return l;
  }

  /** Draws the scene and places every label, synchronously. */
  draw(): void {
    this.resize();
    this.renderer.render(this.scene, this.camera);
    const cam = this.camera;
    const w = this.width.css;
    const h = this.height.css;
    const taken = new Map<string, { x: number; y: number; w: number; h: number }[]>();
    for (const l of this.labels) {
      let op = l.opacity;
      let style = "";
      if (op > 0.002) {
        const p = this.scratch.copy(l.world).project(cam);
        if (p.z > 1 || p.z < -1) op = 0;
        if (l.fadeFar && op > 0) {
          const d = cam.position.distanceTo(l.world);
          op *= Math.max(0, Math.min(1, (l.fadeFar - d) / (l.fadeFar * 0.25)));
        }
        let ax = l.ax;
        let dx = l.dx;
        if (op > 0.002 && l.group) {
          if (!l.size) {
            // Measured once, while hidden from view, so it costs one layout per label.
            l.el.style.visibility = "hidden";
            l.size = { w: l.el.offsetWidth, h: l.el.offsetHeight };
          }
          const px = (p.x * 0.5 + 0.5) * w;
          const py = (-p.y * 0.5 + 0.5) * h + l.dy;
          const boxes = taken.get(l.group) ?? [];
          taken.set(l.group, boxes);
          const box = (side: number) => {
            const sx = side === 0 ? l.dx : -l.dx;
            const sax = side === 0 ? l.ax : 1 - l.ax;
            return { x: px + sx - sax * l.size!.w, y: py - l.ay * l.size!.h, w: l.size!.w, h: l.size!.h, sx, sax };
          };
          const hit = (b: { x: number; y: number; w: number; h: number }) =>
            boxes.some((o) => b.x < o.x + o.w + 4 && b.x + b.w + 4 > o.x && b.y < o.y + o.h + 1 && b.y + b.h + 1 > o.y);
          const first = box(0);
          const second = box(1);
          const chosen = !hit(first) ? first : !hit(second) ? second : null;
          if (chosen) {
            boxes.push(chosen);
            dx = chosen.sx;
            ax = chosen.sax;
          } else op = 0;
        }
        if (op > 0.002) {
          // Whole pixels keep text on the pixel grid; a fractional translate blurs it.
          const x = Math.round((p.x * 0.5 + 0.5) * w + dx);
          const y = Math.round((-p.y * 0.5 + 0.5) * h + l.dy);
          style = `${x}|${y}|${op.toFixed(3)}|${ax}|${l.ay}`;
          if (style !== l.last) {
            l.el.style.transform = `translate(${x}px, ${y}px) translate(${-ax * 100}%, ${-l.ay * 100}%)`;
            l.el.style.opacity = op.toFixed(3);
            l.el.style.visibility = "visible";
          }
        }
      }
      if (!style && l.last !== "hidden") {
        l.el.style.visibility = "hidden";
        style = "hidden";
      }
      l.last = style || "hidden";
    }
  }

  dispose(): void {
    this.ro.disconnect();
    this.scene.traverse((o) => {
      const any = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
      any.geometry?.dispose();
      const m = any.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labelLayer.remove();
    this.hud.remove();
  }
}
