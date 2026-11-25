import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Texture,
} from "three";
import type { TerminalEdge, TerminalNode } from "../../data/types";
import { stageColor as color } from "../../design/tokens";
import { clamp01, easeInOut, easeOut, hashString, seeded, smooth, span } from "../clock";
import type { BrainMapData } from "../data";
import { BRAIN_DURATION } from "../durations";
import { bezier, Polyline, segments } from "../engine/lines";
import type { SceneModel } from "../engine/SceneHost";
import type { Stage } from "../engine/stage";
import { sampleTrack, type Key } from "../engine/track";

export const BRAIN_TIMELINE = {
  duration: BRAIN_DURATION,
  still: 24,
  layerStart: 1.0,
  layerStep: 1.15,
  flow: 8.6,
  stars: 10.8,
  links: 12.6,
  anchors: 15.4,
} as const;
const TL = BRAIN_TIMELINE;

const GAP = 3.4;
const PLANE_W = 30;
const PLANE_D = 13;
const NODE_LIFT = 0.55;
const Y_TOP = 5 * GAP + 9;

export const KIND: Record<TerminalEdge["kind"], { color: string; label: string }> = {
  supplies: { color: color.teal, label: "Supplies data" },
  projects: { color: "#e8836f", label: "Projects sections" },
  controls: { color: "#b493d6", label: "Controls" },
  watches: { color: "#6ea8e8", label: "Watches" },
  contains: { color: "#969ca3", label: "Contains" },
  routes: { color: "#f6f7f8", label: "Routes" },
};

// Readers and their panes share a column, so each projection runs straight up the stack.
const COLUMN: Record<string, number> = { fbd: -10, fmap: -5, fesr: 0, fqse: 5, fmon: 10 };
const PLACED: Record<string, [number, number]> = {
  "source:fleet": [-5, -1.5],
  "source:geo": [5, -1.5],
  "state:fleet": [-7.5, 3.6],
  "state:focus": [0, 3.6],
  "state:panes": [7.5, 3.6],
  "workspace:my-battery": [-5, 0],
  "workspace:fleet": [5, 0],
  "ness:routes": [0, 0],
};

function nodeXZ(n: TerminalNode, inLayer: TerminalNode[]): [number, number] {
  const fixed = PLACED[n.id];
  if (fixed) return fixed;
  const suffix = n.id.split(":")[1] ?? "";
  if (suffix in COLUMN) return [COLUMN[suffix]!, 0];
  const k = inLayer.indexOf(n);
  const step = PLANE_W / (inLayer.length + 1);
  return [-PLANE_W / 2 + step * (k + 1), 0];
}

function glowTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.18, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.12)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function el(tag: string, className: string, html = ""): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (html) e.innerHTML = html;
  return e;
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pad2 = (n: number) => String(n).padStart(2, "0");
const displayTitle = (t: string) => t.replace(/^Wattness Terminal (?=\S)/, "");

export function createBrainMap(stage: Stage, data: BrainMapData, opts: { hud: boolean }): SceneModel {
  const { scene, camera } = stage;
  const { structure, memory } = data;
  const textures: Texture[] = [];
  const layers = structure.layers;
  const layerStart = (l: number) => TL.layerStart + l * TL.layerStep;

  scene.fog = new Fog(color.bg, 60, 180);
  scene.add(new HemisphereLight(0xe2f1ff, 0x101315, 1.3));
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(-14, 30, 18);
  scene.add(sun);

  // ------------------------------------------------------------ planes
  const shape = new Shape();
  {
    const w = PLANE_W / 2;
    const d = PLANE_D / 2;
    const r = 0.9;
    shape.moveTo(-w + r, -d);
    shape.lineTo(w - r, -d);
    shape.quadraticCurveTo(w, -d, w, -d + r);
    shape.lineTo(w, d - r);
    shape.quadraticCurveTo(w, d, w - r, d);
    shape.lineTo(-w + r, d);
    shape.quadraticCurveTo(-w, d, -w, d - r);
    shape.lineTo(-w, -d + r);
    shape.quadraticCurveTo(-w, -d, -w + r, -d);
  }
  const outlinePts = shape.getPoints(6);
  const planes = layers.map((name, l) => {
    const y = l * GAP;
    const fillMat = new MeshBasicMaterial({ color: color.raised, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide });
    const fill = new Mesh(new ShapeGeometry(shape).rotateX(-Math.PI / 2), fillMat);
    fill.position.y = y;
    fill.renderOrder = -10 + l;
    scene.add(fill);
    const outline = new Polyline(
      stage,
      outlinePts.map((p) => new Vector3(p.x, y, -p.y)),
      { color: "#3a4148", width: 1.2, order: -5 + l },
    );
    scene.add(outline.line);
    // Registration marks outside each corner.
    const w = PLANE_W / 2 + 0.6;
    const d = PLANE_D / 2 + 0.6;
    const m = 0.9;
    const pairs: number[] = [];
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      pairs.push(sx * w, y, sz * d, sx * (w - m), y, sz * d);
      pairs.push(sx * w, y, sz * d, sx * w, y, sz * (d - m));
    }
    const marks = segments(stage, pairs, { color: "#6b7178", width: 1, opacity: 0 });
    scene.add(marks);
    const count = structure.nodes.filter((n) => n.layer === l).length;
    const label = stage.label(
      "scene-plane-label",
      `<div class="scene-plane-label__num timing">${pad2(l + 1)}</div>
       <div class="scene-plane-label__name">${escape(name)}</div>
       <div class="scene-plane-label__count faint">${count} ${count === 1 ? "part" : "parts"}</div>`,
      { dx: -24, dy: 0, ax: 1, ay: 0.5 },
    );
    label.el.style.textAlign = "right";
    label.world.set(-PLANE_W / 2, y, PLANE_D / 2);
    return { y, fillMat, outline, marks, label };
  });

  // ------------------------------------------------------------ parts
  const pos = new Map<string, Vector3>();
  for (let l = 0; l < layers.length; l++) {
    const inLayer = structure.nodes.filter((n) => n.layer === l);
    for (const n of inLayer) {
      const [x, z] = nodeXZ(n, inLayer);
      pos.set(n.id, new Vector3(x, l * GAP + NODE_LIFT, z));
    }
  }
  const nodeGeo = new IcosahedronGeometry(0.34, 0);
  const nodeMat = new MeshStandardMaterial({ flatShading: true, roughness: 0.42, metalness: 0.1 });
  const nodes = new InstancedMesh(nodeGeo, nodeMat, structure.nodes.length);
  nodes.frustumCulled = false;
  scene.add(nodes);
  const teal = new Color(color.teal);
  const ice = new Color("#e8f6f2");
  const tmp = new Color();
  const dummy = new Object3D();
  const footPairs: number[][] = layers.map(() => []);
  const shortCount = new Map<string, number>();
  for (const n of structure.nodes) shortCount.set(n.short, (shortCount.get(n.short) ?? 0) + 1);
  // Readers share their pane's short name; a repeated short name shows the full one.
  const nodeName = (n: TerminalNode) => ((shortCount.get(n.short) ?? 0) > 1 && n.layer < 3 ? n.name : n.short);
  const nodeLabels = structure.nodes.map((n) => {
    const p = pos.get(n.id)!;
    footPairs[n.layer]?.push(p.x, p.y - NODE_LIFT, p.z, p.x, p.y - 0.2, p.z);
    const l = stage.label(
      "scene-node-label",
      `<div class="scene-node-label__name">${escape(nodeName(n))}</div>${
        n.sections.length ? `<div class="scene-node-label__sub faint">${n.sections.length} sections</div>` : ""
      }`,
      { dx: 12, dy: 0, ax: 0, ay: 0.5, group: "brain" },
    );
    l.world.copy(p);
    return l;
  });
  const feet = footPairs.map((pairs) => {
    const f = segments(stage, pairs.length ? pairs : [0, 0, 0, 0, 0, 0], { color: "#6b7178", width: 1, opacity: 0 });
    scene.add(f);
    return f;
  });
  const footRings = structure.nodes.map((n) => {
    const p = pos.get(n.id)!;
    const pts: Vector3[] = [];
    for (let k = 0; k <= 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      pts.push(new Vector3(p.x + Math.cos(a) * 0.62, p.y - NODE_LIFT + 0.01, p.z + Math.sin(a) * 0.62));
    }
    const r = new Polyline(stage, pts, { color: color.teal, width: 1, opacity: 0.6 });
    scene.add(r.line);
    return r;
  });

  // ------------------------------------------------------------ connections
  const layerOf = new Map(structure.nodes.map((n) => [n.id, n.layer]));
  const links = structure.edges
    .filter((e) => pos.has(e.from) && pos.has(e.to))
    .map((e, k) => {
      const a = pos.get(e.from)!;
      const d = pos.get(e.to)!;
      const dy = d.y - a.y;
      // Same-layer links arc over the plane; the rest leave and enter their nodes vertically.
      const lift = Math.abs(dy) < 0.1 ? 2.2 + 0.05 * a.distanceTo(d) : 0;
      // A small sideways bow per link keeps parallel links apart.
      const bow = ((hashString(`${e.from}>${e.to}`) % 100) / 100 - 0.5) * 1.2;
      const b = new Vector3(a.x + bow, a.y + (lift || dy * 0.45), a.z + bow * 0.5);
      const c = new Vector3(d.x + bow, d.y + (lift || -dy * 0.45), d.z + bow * 0.5);
      const pts = bezier(a, b, c, d, 48);
      const k0 = KIND[e.kind] ?? KIND.contains;
      const base = new Polyline(stage, pts, { color: k0.color, width: 1.1, opacity: 0.0, order: 2 });
      const flow = new Polyline(stage, pts, { color: k0.color, width: 2, opacity: 0, dashed: true, dashSize: 0.35, gapSize: 2.6, order: 3 });
      scene.add(base.line, flow.line);
      const start = Math.max(layerStart(layerOf.get(e.from) ?? 0), layerStart(layerOf.get(e.to) ?? 0)) + 0.45 + (k % 4) * 0.06;
      return { e, base, flow, start, speed: 1.1 + (hashString(e.from + e.to) % 7) * 0.08 };
    });

  // ------------------------------------------------------------ Living Brain
  const pages = memory?.pages ?? [];
  const rng = seeded(0x9001fc55);
  const starPos = new Map<string, Vector3>();
  for (const p of pages) {
    const target = p.describes ? pos.get(p.describes) : undefined;
    const r = seeded(hashString(p.slug));
    if (!target) {
      starPos.set(p.slug, new Vector3(0, Y_TOP + 6, -1.5));
      continue;
    }
    // Pages about higher layers sit higher, so the constellation has depth from any side.
    const lift = ((layerOf.get(p.describes!) ?? 0) - 2.5) * 1.25;
    starPos.set(p.slug, new Vector3(target.x * 1.22 + (r() - 0.5) * 3, Y_TOP + lift + (r() - 0.5) * 1.6, target.z * 0.6 + (r() - 0.5) * 7));
  }
  // A few passes of pairwise repulsion so no two stars or their labels sit on one another.
  const placed = pages.filter((p) => p.describes);
  for (let it = 0; it < 60; it++) {
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const a = starPos.get(placed[i]!.slug)!;
        const b = starPos.get(placed[j]!.slug)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz) || 0.01;
        const min = 3.6;
        if (d < min) {
          const push = (min - d) / 2;
          const ux = d > 0.011 ? dx / d : rng() - 0.5;
          const uy = dy / d;
          const uz = dz / d;
          a.x -= ux * push;
          a.y -= uy * push * 0.5;
          a.z -= uz * push;
          b.x += ux * push;
          b.y += uy * push * 0.5;
          b.z += uz * push;
        }
      }
  }
  const glow = glowTexture();
  textures.push(glow);
  const starGeo = new OctahedronGeometry(0.24, 0);
  const stars = pages.map((p, k) => {
    const sp = starPos.get(p.slug)!;
    const whole = p.scope === "terminal";
    const mat = new MeshBasicMaterial({ color: whole ? "#ffffff" : "#e8f6f2", transparent: true, opacity: 0 });
    const mesh = new Mesh(starGeo, mat);
    mesh.position.copy(sp);
    mesh.scale.setScalar(whole ? 1.6 : 1);
    const halo = new Sprite(new SpriteMaterial({ map: glow, color: whole ? "#ffffff" : "#9fe9d8", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
    halo.position.copy(sp);
    halo.scale.setScalar(whole ? 3.4 : 2);
    scene.add(mesh, halo);
    const label = stage.label(
      "scene-star-label",
      `<div class="scene-star-label__name${whole ? " is-whole" : ""}">${escape(displayTitle(p.title))}</div>`,
      { dx: 10, dy: -1, ax: 0, ay: 0.5, group: "brain" },
    );
    label.world.copy(sp);
    // Light from the Terminal's base upward: pages about lower layers appear first.
    const targetLayer = p.describes ? (layerOf.get(p.describes) ?? 0) : 6;
    return { p, mesh, mat, halo, label, start: TL.stars + targetLayer * 0.28 + (k % 3) * 0.07 };
  });

  const memLinks = (memory?.connections ?? [])
    .filter((c) => starPos.has(c.a) && starPos.has(c.b))
    .map((c, k) => {
      const a = starPos.get(c.a)!;
      const d = starPos.get(c.b)!;
      const len = a.distanceTo(d);
      const up = new Vector3(0, 0.5 + len * 0.07, 0);
      const pts = bezier(a, a.clone().lerp(d, 0.33).add(up), a.clone().lerp(d, 0.66).add(up), d, 28);
      const op = c.strength === "strong" ? 0.42 : c.strength === "medium" ? 0.26 : 0.14;
      const line = new Polyline(stage, pts, { color: "#dfeee9", width: 1, opacity: 0, order: 6 });
      scene.add(line.line);
      return { line, op, start: TL.links + (k / Math.max(1, (memory?.connections.length ?? 1) - 1)) * 2.4 };
    });

  const anchors = stars
    .filter((s) => s.p.describes && pos.has(s.p.describes))
    .map((s, k) => {
      const a = starPos.get(s.p.slug)!;
      const d = pos.get(s.p.describes!)!.clone().add(new Vector3(0, 0.36, 0));
      const dy = d.y - a.y;
      const pts = bezier(a, new Vector3(a.x, a.y + dy * 0.4, a.z), new Vector3(d.x, d.y - dy * 0.4, d.z), d, 40);
      const line = new Polyline(stage, pts, { color: "#9fe9d8", width: 1, opacity: 0, dashed: true, dashSize: 0.18, gapSize: 0.32, order: 4 });
      scene.add(line.line);
      return { line, target: s.p.describes!, start: TL.anchors + k * 0.16 };
    });
  const anchored = new Set(anchors.map((a) => a.target));

  // ------------------------------------------------------------ HUD
  const hud = stage.hud;
  const tl = el("div", "scene-hud scene-hud--tl");
  const kicker = el("div", "scene-kicker", "");
  const title = el("div", "scene-title", "");
  const sub = el("div", "scene-sub", "");
  tl.append(kicker, title, sub);
  const tr = el("div", "scene-hud scene-hud--tr");
  const counter = el("div", "scene-clock", "");
  const counterSub = el("div", "scene-meta", "");
  tr.append(counter, counterSub);
  const kinds = [...new Set(structure.edges.map((e) => e.kind))];
  const bl = el(
    "div",
    "scene-hud scene-hud--bl",
    `<div class="scene-legend"><div class="scene-legend__grid">${kinds
      .map((k) => `<div class="scene-legend__row"><span class="scene-legend__swatch" style="background:${KIND[k].color}"></span>${KIND[k].label}</div>`)
      .join("")}${
      memory
        ? `<div class="scene-legend__row"><span class="scene-legend__swatch" style="background:repeating-linear-gradient(90deg,#9fe9d8 0 3px,transparent 3px 6px)"></span>Page describes part</div>`
        : ""
    }</div></div>`,
  );
  const br = el(
    "div",
    "scene-hud scene-hud--br",
    `<div class="scene-source">Architecture: the Wattness Terminal's published model, as wattness.tech draws it.${
      memory ? `<br/>Memory: Living Brain readback of “${escape(memory.brain)}”.` : ""
    }</div>`,
  );
  if (opts.hud) hud.append(tl, tr, bl, br);
  const sectionCount = structure.nodes.filter((n) => n.layer === 3).reduce((a, n) => a + n.sections.length, 0);
  let lastHead = "";

  // ------------------------------------------------------------ camera
  const orbit: Key[] = [
    { t: 0, v: [-52, 9, 44] },
    { t: 3, v: [-44, 13, 46] },
    { t: 8.4, v: [-30, 18, 55] },
    { t: 10.6, v: [-21, 20, 64] },
    { t: 13, v: [-13, 19.5, 78] },
    { t: 16, v: [-4, 19, 81] },
    { t: 21, v: [12, 19, 82] },
    { t: 27, v: [26, 18, 78] },
    { t: 30, v: [31, 17.5, 77] },
  ];
  const lookY: Key[] = [
    { t: 0, v: [1.6, 0, 0] },
    { t: 3, v: [3.6, 0, 0] },
    { t: 8.4, v: [8.2, 0, 0] },
    { t: 10.6, v: [10.6, 0, 0] },
    { t: 13, v: [14.4, 0, 0] },
    { t: 16, v: [14.6, 0, 0] },
    { t: 21, v: [14, 0, 0] },
    { t: 30, v: [13.5, 0, 0] },
  ];
  const o3: [number, number, number] = [0, 0, 0];
  const y3: [number, number, number] = [0, 0, 0];
  const fog = scene.fog as Fog;

  function update(t: number) {
    sampleTrack(orbit, t, o3);
    sampleTrack(lookY, t, y3);
    const az = ((o3[0] + Math.max(0, t - TL.duration) * 0.6) * Math.PI) / 180;
    const elv = (o3[1] * Math.PI) / 180;
    const dist = o3[2];
    camera.position.set(Math.sin(az) * Math.cos(elv) * dist, y3[0] + Math.sin(elv) * dist, Math.cos(az) * Math.cos(elv) * dist);
    camera.lookAt(0, y3[0], 0);
    fog.near = dist * 0.9;
    fog.far = dist * 2.6;

    const built = Math.min(layers.length, Math.floor((t - TL.layerStart) / TL.layerStep) + 1);
    const flowOn = span(t, TL.flow, 1.2);

    planes.forEach((pl, l) => {
      const s = layerStart(l);
      const inP = easeOut(span(t, s, 0.7));
      const hi = span(t, s, 0.3) * (1 - span(t, s + TL.layerStep + 0.2, 0.5));
      pl.fillMat.opacity = 0.4 * inP;
      pl.fillMat.color.set(color.raised).lerp(teal, 0.1 * hi);
      pl.outline.reveal(inP);
      pl.outline.material.color.set("#3a4148").lerp(teal, hi * 0.85);
      pl.outline.opacity = 0.95;
      pl.marks.material.opacity = 0.9 * inP;
      pl.label.opacity = span(t, s + 0.15, 0.5) * (0.62 + 0.38 * hi);
    });

    structure.nodes.forEach((n, i) => {
      const p = pos.get(n.id)!;
      const s = layerStart(n.layer) + 0.25 + (i % 5) * 0.07;
      const k = easeOut(span(t, s, 0.5));
      const pulse = anchored.has(n.id) ? anchorPulse(n.id, t) : 0;
      dummy.position.copy(p);
      dummy.rotation.set(0, t * 0.35 + i, 0);
      dummy.scale.setScalar(Math.max(0.0001, k * (1 + 0.25 * pulse)));
      dummy.updateMatrix();
      nodes.setMatrixAt(i, dummy.matrix);
      tmp.copy(teal).lerp(ice, 0.15 + 0.6 * pulse);
      nodes.setColorAt(i, tmp);
      footRings[i]!.reveal(k);
      nodeLabels[i]!.opacity = span(t, s + 0.15, 0.5) * (1 - 0.3 * span(t, TL.stars, 1.5));
    });
    nodes.instanceMatrix.needsUpdate = true;
    if (nodes.instanceColor) nodes.instanceColor.needsUpdate = true;
    feet.forEach((f, l) => (f.material.opacity = 0.7 * span(t, layerStart(l) + 0.25, 0.5)));

    for (const lk of links) {
      const f = easeInOut(span(t, lk.start, 0.9));
      lk.base.reveal(f);
      lk.base.opacity = 0.5 * f;
      lk.flow.opacity = 0.95 * flowOn;
      lk.flow.reveal(flowOn > 0 ? 1 : 0);
      lk.flow.material.dashOffset = -t * lk.speed;
    }

    for (const s of stars) {
      const k = easeOut(span(t, s.start, 0.6));
      s.mat.opacity = k;
      const tw = 0.85 + 0.15 * Math.sin(t * 1.7 + hashString(s.p.slug));
      (s.halo.material as SpriteMaterial).opacity = k * 0.8 * tw;
      s.mesh.rotation.y = t * 0.5;
      s.label.opacity = span(t, s.start + 0.2, 0.5) * 0.95;
    }
    for (const m of memLinks) {
      const f = easeInOut(span(t, m.start, 0.8));
      m.line.reveal(f);
      m.line.opacity = m.op * f;
    }
    for (const a of anchors) {
      const f = easeInOut(span(t, a.start, 1.1));
      a.line.reveal(f);
      a.line.opacity = 0.6 * smooth(clamp01(f * 3));
      a.line.material.dashOffset = t * 0.6;
    }

    if (opts.hud) {
      const hudIn = span(t, 0.2, 0.8);
      for (const e of [tl, tr, br]) e.style.opacity = String(hudIn);
      bl.style.opacity = String(span(t, TL.layerStart + 1.5, 0.8));
      const brain = memory && t >= TL.stars - 0.2;
      const head = brain ? "brain" : "terminal";
      if (head !== lastHead) {
        lastHead = head;
        if (brain && memory) {
          kicker.textContent = "Team data · Living Brain";
          title.textContent = memory.brain;
          sub.textContent = `${memory.counts.pages} pages and ${memory.counts.connections} connections, each page tied to the Terminal part it describes.`;
        } else {
          kicker.textContent = "Wattness Terminal";
          title.textContent = `${layers.length} layers, ${structure.nodes.length} parts`;
          sub.textContent = `${structure.edges.length} connections and ${sectionCount} registered sections, from the Terminal's own architecture model.`;
        }
      }
      if (brain && memory) {
        const shownPages = stars.filter((s) => t >= s.start).length;
        const shownLinks = memLinks.filter((m) => t >= m.start + 0.8).length;
        counter.innerHTML = `${pad2(shownPages)}<small>pages</small>`;
        counterSub.innerHTML = `<b>${pad2(shownLinks)}</b> connections`;
      } else {
        const l = Math.max(1, built);
        counter.innerHTML = `${pad2(l)}<small>/ ${pad2(layers.length)}</small>`;
        counterSub.innerHTML = `<b>${escape(layers[l - 1] ?? "")}</b>`;
      }
    }
  }

  // An anchor's arrival lights the part it describes.
  const anchorStart = new Map(anchors.map((a) => [a.target, a.start]));
  function anchorPulse(id: string, t: number): number {
    const s = anchorStart.get(id);
    if (s === undefined) return 0;
    const age = t - (s + 1.1);
    if (age < 0) return 0;
    return Math.exp(-age * 2.2) + 0.12;
  }

  return {
    duration: TL.duration,
    still: TL.still,
    update,
    dispose() {
      for (const tx of textures) tx.dispose();
      hud.replaceChildren();
    },
  };
}
