import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  GridHelper,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  type Texture,
} from "three";
import { CENTRAL_TZ, SHOWCASE, SOURCE_LINE } from "../../config";
import type { BatterySummary, ChainReceipt, DayIndex, Receipts } from "../../data/types";
import { font, stageColor as color } from "../../design/tokens";
import { formatDay, shortHash } from "../../lib/format";
import { formatInZone, READER_TZ } from "../../lib/time";
import { clamp01, easeInOut, easeOut, hashString, lerp, resolveText, smooth, span } from "../clock";
import { GRID_DURATION } from "../durations";
import { Polyline, segments } from "../engine/lines";
import type { SceneModel } from "../engine/SceneHost";
import type { Stage } from "../engine/stage";
import { sampleTrack, type Key } from "../engine/track";
import "./closing.css";
import {
  BNB_SYMBOL,
  W_NODE,
  W_POINTS,
  W_STROKE,
  roundingColumn,
  sealMaterial,
  sealQuad,
  strokeOf,
  writePairs,
  writeStrip,
  type P2,
} from "./marks";

export interface GridData {
  day: DayIndex;
  receipts: Receipts;
}

/** The choreography, in scene seconds. */
export const GRID_TIMELINE = {
  duration: GRID_DURATION,
  /** Reduced motion and captures without a clock show the closing lockup. */
  still: GRID_DURATION,
  trackIn: [0.1, 1.6],
  qualify: [1.2, 6.6],
  sweep: [8.4, 4.2],
  ring: [12.8, 3.2],
  receipt: [15.8, 3.4],
  // The close (Jo, Nov 26): the track and its 316 sealed plans become the
  // Wattness mark, the ring becomes a circle and BNB Chain's mark surfaces.
  // One lead action at a time: the ring clears the plans, the track bends while
  // the camera rises, the plans settle into the ink, the pole runs the trace,
  // the ring seals, the words come.
  /** The receipt (fully drawn from 18.8 s), the corner notes and the grid's paint step aside. */
  close: 21,
  /** The ring slides off the plans to the symbol's place, ahead of the bend, so it crosses the track once and early. */
  slide: [21.1, 1.7],
  /** The ellipse relaxes into the circle; its leaf ticks fold into it. */
  relax: [21.3, 2.4],
  /** The track's centerline flows into the mark's trace as one shape (plus a small BEND_STAGGER, front first). */
  bend: [21.3, 3],
  /** The camera rises to face the marks. */
  crane: [21.2, 4.2],
  /** The plans sink into the track, front first (plus SETTLE_STAGGER along it)... */
  lower: [22.8, 0.9],
  /** ...and the stroke inks where they went down, one wave behind them. */
  ink: [23.3, 1],
  /** Desert Willow, on pole, lights as the selection, is named where the trace starts, rounds into the node, runs the trace and stays as the node. */
  lit: [21, 0.8],
  name: [22.5, 0.6],
  ready: [23.6, 0.8],
  run: [24.6, 1.5],
  /** The trace's teal settles back to ink. */
  settle: [26.1, 0.8],
  /** The ring closes on its center and leaves BNB Chain's symbol where it passes. */
  seal: [26.2, 1.5],
  /** The lockup's words. */
  words: [27.8, 0.7],
  line: [28.15, 0.7],
} as const satisfies Record<string, number | readonly [number, number]>;

const TL = GRID_TIMELINE;

// Layout, in world units (about a meter at this scale).
const PITCH = 0.82; // centerline distance between consecutive positions
const LATERAL = 1.25; // each row's offset from the centerline
const S0 = 4; // pole's distance from the start line
const TRACK_HALF = 2.75;
const FOOT_W = 0.62;
const FOOT_D = 0.5;
const MAX_H = 4;
const AMP = 17;
const WAVE = 118;
const STRAIGHT = 26;

// The closing composition.
const MARK_SCALE = 1.14; // world units per unit of the Wattness mark: its trace runs about as long as the grid
const SYMBOL_TO_MARK = 0.9; // BNB Chain's symbol height to the Wattness mark's
const MARK_GAP = 0.68; // space between the node and the symbol, in symbol heights
const FINAL_DISTANCE = 520; // the camera's height over the marks at the end
const FINAL_PAN = 40; // the composition sits this far right of the receipt view's target
const MARKS_RAISE = 0.075; // the marks sit this fraction of the frame above its middle, for the words below
// A larger lead than this snaps the front into the mark's corners while the
// back still winds, and the track reads as buckling.
const BEND_STAGGER = 0.25;
const SETTLE_STAGGER = 0.5;
const SINK = 0.08; // how far below the ink a settled plan ends, so it never shares the stroke's plane
const POLE_FOOT = 1.3; // the pole's footprint once it is lit in the close

function centerAt(s: number): [number, number] {
  const ramp = smooth(clamp01(s / STRAIGHT));
  return [AMP * Math.sin((2 * Math.PI * s) / WAVE) * ramp, -s * 0.92];
}

/** Centerline point, unit tangent (toward the back of the grid) and heading. */
function frameAt(s: number) {
  const [x, z] = centerAt(s);
  const [x2, z2] = centerAt(s + 0.05);
  let tx = x2 - x;
  let tz = z2 - z;
  const len = Math.hypot(tx, tz) || 1;
  tx /= len;
  tz /= len;
  // Rotating by `yaw` about +y turns -z into the tangent, and +x into the across-track direction.
  const yaw = Math.atan2(-tx, -tz);
  return { x, z, tx, tz, nx: Math.cos(yaw), nz: -Math.sin(yaw), yaw };
}

/** Calm in, calm out, no overshoot: zero velocity and acceleration at both ends. */
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

// Planned discharge ramp, dark to light teal.
const RAMP = [new Color("#1b4a42"), new Color("#249c83"), new Color(color.teal), new Color("#bdf4e6")];
function rampColor(f: number, out: Color): Color {
  const x = clamp01(f) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  return out.lerpColors(RAMP[i]!, RAMP[i + 1]!, x - i);
}
export const RAMP_CSS = `linear-gradient(90deg, #1b4a42, #249c83 33%, ${color.teal} 66%, #bdf4e6)`;

const fmt1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmtInt = new Intl.NumberFormat("en-US");

interface Slot {
  b: BatterySummary;
  pos: number;
  s: number;
  x: number;
  z: number;
  yaw: number;
  h: number;
  ramp: Color;
  rise: number;
  freeze: number;
  phase: number;
  /** Where this plan lands along the Wattness mark's trace, 0 to 1. */
  u: number;
}

/** Grid order: the showcase on pole, then planned discharge, most first. */
export function gridOrder(batteries: BatterySummary[]): BatterySummary[] {
  const rest = batteries
    .filter((b) => b.resource !== SHOWCASE.resource)
    .sort((a, b) => b.dischargeMwh - a.dischargeMwh || a.resource.localeCompare(b.resource));
  const pole = batteries.find((b) => b.resource === SHOWCASE.resource);
  return pole ? [pole, ...rest] : rest;
}

/** The lock line runs from the back of the grid to the pole, toward the camera. */
function sweepS(t: number, sEnd: number): number {
  const [a, len] = TL.sweep;
  return lerp(sEnd, S0 - 1.2, easeInOut(span(t, a, len)));
}

function numberAtlas(count: number): { texture: CanvasTexture; cols: number; rows: number; cw: number; ch: number; size: number } {
  const cw = 64;
  const ch = 48;
  const size = 1024;
  const cols = Math.floor(size / cw);
  const rows = Math.ceil(count / cols);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d")!;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let i = 0; i < count; i++) {
    const cx = (i % cols) * cw + cw / 2;
    const cy = Math.floor(i / cols) * ch + ch / 2 + 2;
    g.font = `600 ${i === 0 ? 38 : 32}px ${font.sans}`;
    g.fillStyle = i === 0 ? "#f6f7f8" : "#8b9198";
    g.fillText(String(i + 1), cx, cy);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 8;
  return { texture, cols, rows, cw, ch, size };
}

function el(tag: string, className: string, html = ""): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (html) e.innerHTML = html;
  return e;
}

export function createStartingGrid(stage: Stage, data: GridData, opts: { hud: boolean }): SceneModel {
  const { scene, camera } = stage;
  const textures: Texture[] = [];
  const order = gridOrder(data.day.batteries);
  const maxMwh = Math.max(...order.map((b) => b.dischargeMwh), 1);
  const mainnet: ChainReceipt | undefined = data.receipts.receipts.find((r) => r.mainnet) ?? data.receipts.receipts[0];
  const testnet = data.receipts.receipts.find((r) => !r.mainnet && r !== mainnet);

  scene.fog = new Fog(color.bg, 40, 200);
  scene.add(new HemisphereLight(0xd6ecff, 0x101315, 1.25));
  const sun = new DirectionalLight(0xffffff, 1.9);
  sun.position.set(-18, 30, 22);
  scene.add(sun);
  const rim = new DirectionalLight(0x9fe9d8, 0.55);
  rim.position.set(20, 8, -30);
  scene.add(rim);

  // ------------------------------------------------------------ slots
  const slots: Slot[] = order.map((b, i) => {
    const s = S0 + i * PITCH;
    const f = frameAt(s);
    const side = i % 2 === 0 ? -1 : 1;
    const lat = side * LATERAL;
    const n = order.length;
    return {
      b,
      pos: i + 1,
      s,
      x: f.x + f.nx * lat,
      z: f.z + f.nz * lat,
      yaw: f.yaw,
      h: Math.max(0.1, (MAX_H * b.dischargeMwh) / maxMwh),
      ramp: rampColor(Math.sqrt(b.dischargeMwh / maxMwh), new Color()),
      rise: TL.qualify[0] + (TL.qualify[1] - TL.qualify[0]) * Math.pow(i / Math.max(1, n - 1), 0.85),
      freeze: 0,
      phase: (hashString(b.resource) % 1000) / 1000,
      u: (i - 0.5) / Math.max(1, n - 1),
    };
  });
  const sEnd = (slots.at(-1)?.s ?? 10) + 3;
  // Invert the sweep once, so each slot knows when the lock line reaches it.
  for (const sl of slots) {
    let lo: number = TL.sweep[0];
    let hi: number = TL.sweep[0] + TL.sweep[1];
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (sweepS(mid, sEnd) > sl.s) lo = mid;
      else hi = mid;
    }
    sl.freeze = hi;
  }

  // ------------------------------------------------------------ the ring's frame
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const sl of slots) {
    minX = Math.min(minX, sl.x);
    maxX = Math.max(maxX, sl.x);
    minZ = Math.min(minZ, sl.z);
    maxZ = Math.max(maxZ, sl.z);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const rx = (maxX - minX) / 2 + 9;
  const rz = (maxZ - minZ) / 2 + 9;

  // ------------------------------------------------------------ the closing composition
  // The receipt is read from this camera pose; the close cranes up from it, on
  // the same heading, until the camera looks straight down at the two marks.
  const camRest = new Vector3(112, 92, 84);
  const aimRest = new Vector3(cx - 6, 0, cz + 50);
  // On the ground: U runs up the final screen, R to its right.
  const ul = Math.hypot(aimRest.x - camRest.x, aimRest.z - camRest.z);
  const Ux = (aimRest.x - camRest.x) / ul;
  const Uz = (aimRest.z - camRest.z) / ul;
  const Rx = -Uz;
  const Rz = Ux;
  const craneFrom = camRest.clone().sub(aimRest);
  const craneDist = craneFrom.length();
  const craneEl = Math.asin(craneFrom.y / craneDist);
  const aimEnd = { x: aimRest.x + Rx * FINAL_PAN, z: aimRest.z + Rz * FINAL_PAN };
  // Vertical field 32°: the frame's height on the ground is 2 tan 16° times the distance.
  const raise = MARKS_RAISE * 2 * Math.tan((16 * Math.PI) / 180) * FINAL_DISTANCE;
  const C = { x: aimEnd.x + Ux * raise, z: aimEnd.z + Uz * raise };
  const toWorld = (a: number, b: number): P2 => [C.x + a * Rx + b * Ux, C.z + a * Rz + b * Uz];

  // The Wattness mark, from its own units (y down) to the composition's.
  const markSvg = strokeOf(W_POINTS, W_STROKE / 2, 8);
  const [mx0, mx1Trace] = markSvg.extent(1, 0);
  const mx1 = Math.max(mx1Trace, W_NODE.cx + W_NODE.r);
  const [my0, my1] = markSvg.extent(0, 1);
  const markH = (my1 - my0) * MARK_SCALE;
  const markW = (mx1 - mx0) * MARK_SCALE;
  const kb = (SYMBOL_TO_MARK * markH) / BNB_SYMBOL.height;
  const symW = BNB_SYMBOL.width * kb;
  const symH = BNB_SYMBOL.height * kb;
  const compW = markW + MARK_GAP * symH + symW;
  const markA = (sx: number) => -compW / 2 + (sx - mx0) * MARK_SCALE;
  const markB = (sy: number) => ((my0 + my1) / 2 - sy) * MARK_SCALE;
  const trace = strokeOf(
    W_POINTS.map(([sx, sy]) => toWorld(markA(sx), markB(sy))),
    (W_STROKE / 2) * MARK_SCALE,
    480,
  );
  // The node sits on the trace's last line, this far past its end.
  const nodeR = W_NODE.r * MARK_SCALE;
  const nodeAlong = (W_NODE.cx - W_POINTS.at(-1)![0]) * MARK_SCALE;
  const symA = compW / 2 - symW / 2;
  const symCenter = toWorld(symA, 0);
  const sealR = BNB_SYMBOL.radius * kb;
  const marksBottom = -Math.max(markH, symH) / 2;

  // ------------------------------------------------------------ ground and track
  const grid = new GridHelper(1000, 100, color.border, color.border);
  const gridMat = grid.material as LineBasicMaterial;
  gridMat.transparent = true;
  gridMat.opacity = 0.12;
  gridMat.depthWrite = false;
  grid.position.set(0, -0.02, -120);
  scene.add(grid);

  const trackSamples: { x: number; z: number; nx: number; nz: number }[] = [];
  for (let s = -3; s <= sEnd + 2; s += 0.5) trackSamples.push(frameAt(s));

  // The track's surface and edges, sampled so that each sample also has a place
  // on the mark's stroke: the plans' span maps onto the trace end to end (each
  // plan lands at its own fraction), miter points included, and the run-off at
  // either end folds into the trace's ends.
  const sA = S0 + PITCH / 2;
  const sB = S0 + (slots.length - 0.5) * PITCH;
  const ribbon: { s: number; u: number; w: (typeof trace.samples)[number] }[] = [];
  for (let s = -3; s < sA - 1e-6; s += 0.5) ribbon.push({ s, u: 0, w: trace.samples[0]! });
  for (const w of trace.samples) ribbon.push({ s: sA + w.u * (sB - sA), u: w.u, w });
  for (let s = sB + 0.5; s <= sEnd + 2 + 1e-6; s += 0.5) ribbon.push({ s, u: 1, w: trace.samples.at(-1)! });
  // Per sample: the track's −n and +n sides, then the stroke's.
  const ribbonFrom = new Float32Array(ribbon.length * 4);
  const ribbonTo = new Float32Array(ribbon.length * 4);
  ribbon.forEach((r, i) => {
    const f = frameAt(r.s);
    ribbonFrom.set([f.x - f.nx * TRACK_HALF, f.z - f.nz * TRACK_HALF, f.x + f.nx * TRACK_HALF, f.z + f.nz * TRACK_HALF], i * 4);
    ribbonTo.set([r.w.bx, r.w.bz, r.w.ax, r.w.az], i * 4);
  });
  const stripIndex = (n: number) => {
    const idx: number[] = [];
    for (let i = 1; i < n; i++) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    return idx;
  };
  const surfacePos = new Float32Array(ribbon.length * 6);
  const surfaceGeo = new BufferGeometry();
  surfaceGeo.setAttribute("position", new BufferAttribute(surfacePos, 3));
  surfaceGeo.setIndex(stripIndex(ribbon.length));
  const asphalt = new Color("#181c20");
  const ink = new Color(color.text);
  const teal = new Color(color.teal);
  const black = new Color(0, 0, 0);
  // The ink runs along the stroke with the plans settling into it, so each
  // sample carries its own color (linear, as three.js reads vertex colors).
  const surfaceCol = new Float32Array(ribbon.length * 6);
  surfaceGeo.setAttribute("color", new BufferAttribute(surfaceCol, 3));
  const surfaceMat = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
  const tmpInk = new Color();
  let inkAt = Number.NaN;
  const inkTrack = (t: number) => {
    const key = Math.min(Math.max(t, TL.ink[0]), TL.ink[0] + TL.ink[1] + SETTLE_STAGGER);
    if (key === inkAt) return;
    inkAt = key;
    for (let i = 0; i < ribbon.length; i++) {
      tmpInk.copy(asphalt).lerp(ink, smoother(span(key, TL.ink[0] + SETTLE_STAGGER * ribbon[i]!.u, TL.ink[1])));
      surfaceCol.set([tmpInk.r, tmpInk.g, tmpInk.b, tmpInk.r, tmpInk.g, tmpInk.b], i * 6);
    }
    (surfaceGeo.getAttribute("color") as BufferAttribute).needsUpdate = true;
  };
  inkTrack(0);
  const surface = new Mesh(surfaceGeo, surfaceMat);
  surface.renderOrder = -2;
  surface.frustumCulled = false;
  scene.add(surface);
  const edgeXyz = [new Float32Array(ribbon.length * 3), new Float32Array(ribbon.length * 3)];
  const edges = edgeXyz.map((_, side) => {
    const pts = ribbon.map((_, i) => new Vector3(ribbonFrom[i * 4 + side * 2]!, 0.01, ribbonFrom[i * 4 + side * 2 + 1]!));
    const p = new Polyline(stage, pts, { color: "#3a4148", width: 1.25 });
    scene.add(p.line);
    return p;
  });
  let surfaceAt = Number.NaN;
  /** The surface and its edges at bend progress for time `t` (the track's own shape before the close). */
  const shapeTrack = (t: number) => {
    const settled = TL.bend[0] + TL.bend[1] + BEND_STAGGER;
    const key = t <= TL.bend[0] ? -1 : Math.min(t, settled);
    if (key === surfaceAt) return;
    surfaceAt = key;
    for (let i = 0; i < ribbon.length; i++) {
      const e = key < 0 ? 0 : smoother(span(t, TL.bend[0] + BEND_STAGGER * ribbon[i]!.u, TL.bend[1]));
      for (let side = 0; side < 2; side++) {
        const x = lerp(ribbonFrom[i * 4 + side * 2]!, ribbonTo[i * 4 + side * 2]!, e);
        const z = lerp(ribbonFrom[i * 4 + side * 2 + 1]!, ribbonTo[i * 4 + side * 2 + 1]!, e);
        surfacePos.set([x, 0, z], (i * 2 + side) * 3);
        edgeXyz[side]!.set([x, 0.01, z], i * 3);
      }
    }
    (surfaceGeo.getAttribute("position") as BufferAttribute).needsUpdate = true;
    for (let side = 0; side < 2; side++) writeStrip(edges[side]!.line, edgeXyz[side]!);
  };
  shapeTrack(0);
  const centerDash = new Polyline(
    stage,
    trackSamples.map((f) => new Vector3(f.x, 0.008, f.z)),
    { color: "#2b3036", width: 1, dashed: true, dashSize: 1.2, gapSize: 1.6 },
  );
  scene.add(centerDash.line);

  // Start line: a fine checker of two rows across the track.
  const checkerMat = new MeshBasicMaterial({ color: "#c9ced3", transparent: true, opacity: 0.32, depthWrite: false });
  {
    const f = frameAt(1.2);
    const cells = 22;
    const w = (TRACK_HALF * 2) / cells;
    const geo = new PlaneGeometry(w, w).rotateX(-Math.PI / 2);
    const checker = new InstancedMesh(geo, checkerMat, cells);
    const m = new Matrix4();
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), f.yaw);
    let k = 0;
    for (let row = 0; row < 2; row++)
      for (let c = 0; c < cells; c++) {
        if ((c + row) % 2) continue;
        const lat = -TRACK_HALF + w * (c + 0.5);
        const along = (row - 0.5) * w;
        m.compose(new Vector3(f.x + f.nx * lat + f.tx * along, 0.006, f.z + f.nz * lat + f.tz * along), q, new Vector3(1, 1, 1));
        checker.setMatrixAt(k++, m);
      }
    checker.count = k;
    scene.add(checker);
  }

  // Grid boxes: a front edge and two short side marks per position.
  const boxes = (() => {
    const pairs: number[] = [];
    for (const sl of slots) {
      const f = frameAt(sl.s);
      const bx = sl.x - f.tx * 0.5;
      const bz = sl.z - f.tz * 0.5;
      const hw = 0.56;
      const ax = bx - f.nx * hw;
      const az = bz - f.nz * hw;
      const ex = bx + f.nx * hw;
      const ez = bz + f.nz * hw;
      pairs.push(ax, 0.012, az, ex, 0.012, ez);
      pairs.push(ax, 0.012, az, ax + f.tx * 0.32, 0.012, az + f.tz * 0.32);
      pairs.push(ex, 0.012, ez, ex + f.tx * 0.32, 0.012, ez + f.tz * 0.32);
    }
    const l = segments(stage, pairs, { color: "#5d636a", width: 1, opacity: 0.85 });
    scene.add(l);
    return l;
  })();

  // Position numbers painted ahead of each box.
  const atlas = numberAtlas(slots.length);
  textures.push(atlas.texture);
  const decalMat = new MeshBasicMaterial({ map: atlas.texture, transparent: true, depthWrite: false, side: DoubleSide });
  {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    slots.forEach((sl, i) => {
      const f = frameAt(sl.s);
      const w = i === 0 ? 0.74 : 0.6;
      const h = w * (atlas.ch / atlas.cw);
      const dcx = sl.x - f.tx * 1.0;
      const dcz = sl.z - f.tz * 1.0;
      // Text up runs along the tangent, so the numbers read from the front of the grid.
      const corners: [number, number][] = [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ];
      for (const [a, b] of corners) pos.push(dcx + f.nx * a + f.tx * b, 0.014, dcz + f.nz * a + f.tz * b);
      const col = i % atlas.cols;
      const row = Math.floor(i / atlas.cols);
      const u0 = (col * atlas.cw) / atlas.size;
      const u1 = ((col + 1) * atlas.cw) / atlas.size;
      const v1 = 1 - (row * atlas.ch) / atlas.size;
      const v0 = 1 - ((row + 1) * atlas.ch) / atlas.size;
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      const o = i * 4;
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    const decals = new Mesh(g, decalMat);
    decals.renderOrder = 1;
    scene.add(decals);
  }

  // ------------------------------------------------------------ markers
  const colGeo = new CylinderGeometry(0.8 / Math.SQRT2, 1 / Math.SQRT2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const colMat = new MeshStandardMaterial({ flatShading: true, roughness: 0.48, metalness: 0.08 });
  const cols = new InstancedMesh(colGeo, colMat, slots.length);
  cols.frustumCulled = false;
  const capGeo = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const capMat = new MeshBasicMaterial({ color: color.bnb });
  const caps = new InstancedMesh(capGeo, capMat, slots.length);
  caps.frustumCulled = false;
  scene.add(cols, caps);
  const dummy = new Object3D();
  const tmp = new Color();
  const bnb = new Color(color.bnb);
  const white = new Color("#ffffff");
  for (let i = 0; i < slots.length; i++) cols.setColorAt(i, slots[i]!.ramp);

  // Pole: a teal outline round its box.
  const poleRing = (() => {
    const sl = slots[0]!;
    const f = frameAt(sl.s);
    const pts: Vector3[] = [];
    const hw = 0.62;
    const hd = 0.5;
    const loop: [number, number][] = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
      [-hw, -hd],
    ];
    for (const [a, b] of loop) pts.push(new Vector3(sl.x + f.nx * a + f.tx * b, 0.02, sl.z + f.nz * a + f.tz * b));
    const p = new Polyline(stage, pts, { color: color.teal, width: 1.5 });
    scene.add(p.line);
    return p;
  })();

  // The pole's battery on its own, from the close: the same column, which runs
  // the trace and rounds into the mark's node. Its last colors are emissive over
  // a black body, so the node ends in the stage's exact ink.
  const poleCol = roundingColumn();
  const poleMat = new MeshStandardMaterial({ flatShading: true, roughness: 0.48, metalness: 0.08, color: slots[0]!.ramp.clone() });
  const poleMesh = new Mesh(poleCol.geometry, poleMat);
  poleMesh.frustumCulled = false;
  poleMesh.renderOrder = 4;
  poleMesh.visible = false;
  scene.add(poleMesh);

  // The trace's draw-on: the stroke's own outline in teal, revealed behind the runner.
  const traceGeo = new BufferGeometry();
  traceGeo.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(trace.samples.flatMap((w) => [w.bx, 0.05, w.bz, w.ax, 0.05, w.az])), 3),
  );
  traceGeo.setIndex(stripIndex(trace.samples.length));
  const traceMat = new MeshBasicMaterial({ color: teal.clone(), side: DoubleSide, transparent: true, depthWrite: false, depthTest: false });
  const traceMesh = new Mesh(traceGeo, traceMat);
  traceMesh.renderOrder = 3;
  traceMesh.frustumCulled = false;
  traceMesh.visible = false;
  scene.add(traceMesh);

  // ------------------------------------------------------------ the lock line
  const lockBar = new Mesh(new PlaneGeometry(TRACK_HALF * 2 + 0.9, 0.09).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: color.bnb, transparent: true }));
  lockBar.renderOrder = 3;
  const glowMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { uColor: { value: new Color(color.bnb) }, uOpacity: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader:
      "uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 2.2) * (1.0 - pow(abs(vUv.x - 0.5) * 2.0, 6.0)); gl_FragColor = vec4(uColor * a * uOpacity, 1.0); }",
  });
  const curtain = new Mesh(new PlaneGeometry(TRACK_HALF * 2 + 0.9, 4.2).translate(0, 2.1, 0), glowMat);
  curtain.renderOrder = 4;
  const wakeMat = glowMat.clone();
  const wake = new Mesh(new PlaneGeometry(TRACK_HALF * 2 + 0.9, 3.4).rotateX(-Math.PI / 2).translate(0, 0.01, -1.7), wakeMat);
  wake.renderOrder = 2;
  const lock = new Object3D();
  lock.add(lockBar, curtain, wake);
  scene.add(lock);

  // ------------------------------------------------------------ the ring
  // An ellipse round the grid; in the close it relaxes into the circle the
  // BNB Chain symbol is inscribed in, beside the Wattness mark.
  const ring = { x: cx, z: cz, rx, rz };
  const ringPoint = (phi: number, grow = 0, y = 0.05) => {
    // phi = 0 is the front of the ring, nearest the pole.
    const x = Math.sin(phi);
    const z = Math.cos(phi);
    // Outward normal of the ellipse, for ticks.
    const nx = x / ring.rx;
    const nz = z / ring.rz;
    const nl = Math.hypot(nx, nz);
    return new Vector3(ring.x + ring.rx * x + (nx / nl) * grow, y, ring.z + ring.rz * z + (nz / nl) * grow);
  };
  const RING_N = 240;
  const ringLine = (dir: number, grow: number, out: Float32Array) => {
    for (let k = 0; k <= RING_N; k++) {
      const p = ringPoint((dir * Math.PI * k) / RING_N, grow);
      out.set([p.x, p.y, p.z], k * 3);
    }
    return out;
  };
  const halfXyz = [new Float32Array((RING_N + 1) * 3), new Float32Array((RING_N + 1) * 3)];
  const halves = [1, -1].map((dir, h) => {
    ringLine(dir, 0, halfXyz[h]!);
    const pts: Vector3[] = [];
    for (let k = 0; k <= RING_N; k++) pts.push(new Vector3(halfXyz[h]![k * 3], halfXyz[h]![k * 3 + 1], halfXyz[h]![k * 3 + 2]));
    const p = new Polyline(stage, pts, { color: color.bnb, width: 2, order: 5 });
    scene.add(p.line);
    return p;
  });
  const innerHalves = [1, -1].map((dir) => {
    const pts: Vector3[] = [];
    for (let k = 0; k <= RING_N; k++) pts.push(ringPoint((dir * Math.PI * k) / RING_N, -2.2));
    const p = new Polyline(stage, pts, { color: color.bnb, width: 1, opacity: 0.28, order: 5 });
    scene.add(p.line);
    return p;
  });
  // One tick per leaf, ordered from the front outward on both sides so a reveal grows like the ring.
  const tickOrder = slots.map((_, k) => {
    const raw = (2 * Math.PI * (k + 0.5)) / slots.length;
    return raw > Math.PI ? raw - 2 * Math.PI : raw;
  });
  tickOrder.sort((a, b) => Math.abs(a) - Math.abs(b));
  const tickPairs = new Float32Array(tickOrder.length * 6);
  const writeTicks = (retract: number) => {
    tickOrder.forEach((phi, j) => {
      const reach = (j === 0 ? 3.2 : 1.6) * (1 - retract);
      const a = ringPoint(phi, 0.6 * (1 - retract));
      const b = ringPoint(phi, Math.max(0.6 * (1 - retract) + 0.001, reach));
      tickPairs.set([a.x, a.y, a.z, b.x, b.y, b.z], j * 6);
    });
    return tickPairs;
  };
  const ticks = segments(stage, Array.from(writeTicks(0)), { color: color.bnb, width: 1, opacity: 0.7, order: 5 });
  scene.add(ticks);
  const ringFront = ringPoint(0, 3.2);
  let ringAt = "0|0|0";
  /**
   * The ring at slide progress `move` (its center, from the grid's to the
   * symbol's) and relax progress `e` (its radii, from the ellipse round the
   * grid to the symbol's circle).
   */
  const shapeRing = (move: number, e: number, retract: number) => {
    const key = `${move}|${e}|${retract}`;
    if (key === ringAt) return;
    ringAt = key;
    ring.x = lerp(cx, symCenter[0], move);
    ring.z = lerp(cz, symCenter[1], move);
    ring.rx = lerp(rx, sealR, e);
    ring.rz = lerp(rz, sealR, e);
    [1, -1].forEach((dir, h) => writeStrip(halves[h]!.line, ringLine(dir, 0, halfXyz[h]!)));
    writePairs(ticks, writeTicks(retract));
  };

  // The seal: the circle's fill, and BNB Chain's symbol it leaves behind.
  const sealMat = sealMaterial();
  sealMat.side = DoubleSide;
  const sealHalf = sealR * 1.08;
  const sealCorners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sa, sb]) => {
    const [x, z] = toWorld(symA + sa! * sealHalf, sb! * sealHalf);
    return { x, z, sx: BNB_SYMBOL.cx + (sa! * sealHalf) / kb, sy: BNB_SYMBOL.cy - (sb! * sealHalf) / kb };
  });
  const seal = new Mesh(sealQuad(sealCorners, 0.06), sealMat);
  seal.renderOrder = 4;
  seal.frustumCulled = false;
  seal.visible = false;
  scene.add(seal);

  // ------------------------------------------------------------ labels
  const pole = slots[0]!;
  const poleLabel = stage.label(
    "scene-tag scene-tag--teal scene-tag--right",
    `<div class="scene-tag__head"><span class="scene-tag__pos">P1</span>${SHOWCASE.name}</div>
     <div class="mono muted">${pole.b.resource} · ${pole.b.settlementPoint} · ${pole.b.hub}</div>
     <div class="muted">${fmtInt.format(pole.b.powerMw)} MW · ${fmt1.format(pole.b.energyMwh)} MWh · planned discharge <span class="mono" style="color:var(--text)">${fmt1.format(pole.b.dischargeMwh)} MWh</span>, arm ${pole.b.selectedArm}</div>`,
    { dx: -14, dy: 0, ax: 1, ay: 1, fadeFar: 90 },
  );
  const followers = slots.slice(1, 3).map((sl) =>
    stage.label(
      "scene-tag",
      `<div class="scene-tag__head"><span class="scene-tag__pos">P${sl.pos}</span><span class="mono" style="font-weight:400;font-size:11px">${sl.b.resource}</span></div><div class="mono faint">${fmt1.format(sl.b.dischargeMwh)} MWh</div>`,
      { dx: 10, dy: 0, ax: 0, ay: 1, fadeFar: 46 },
    ),
  );
  const lockLabel = stage.label(
    "scene-tag scene-tag--bnb",
    `<div class="timing" style="font-size:12px;letter-spacing:0.16em;color:var(--bnb)">Parc fermé</div><div class="mono muted"></div>`,
    { dx: 12, dy: 0, ax: 0, ay: 1 },
  );
  const lockCount = lockLabel.el.lastElementChild as HTMLElement;
  // In the close, the pole's battery is named again where the trace starts, so
  // the dot that runs the mark reads as Desert Willow.
  const poleName = stage.label(
    "scene-tag scene-tag--teal scene-tag--right sg-pole",
    `<div class="scene-tag__head"><span class="scene-tag__pos">P1</span>${SHOWCASE.name}</div>`,
    { dx: -12, dy: 0, ax: 1, ay: 0.5 },
  );
  const rootText = shortHash(data.day.root, 4, 5);
  const rootLabel = stage.label("scene-tag scene-tag--right scene-tag--bnb", "", { dx: -18, dy: 0, ax: 1, ay: 0.5 });
  const rootHead = el("div", "timing", "");
  rootHead.style.cssText = "font-size:12px;letter-spacing:0.16em;color:var(--bnb)";
  const rootHash = el("div", "mono", "");
  rootHash.style.cssText = "font-size:15px;color:var(--text-strong)";
  const rootSub = el("div", "faint", "");
  rootSub.style.fontSize = "10.5px";
  rootLabel.el.append(rootHead, rootHash, rootSub);
  rootLabel.world.copy(ringFront);

  // The closing words, hung under the marks so they keep to them at any aspect.
  const lockup = stage.label(
    "sg-lockup",
    `<div class="sg-lockup__names"><span>Wattness</span><span class="sg-lockup__x" aria-hidden="true">×</span><span>BNB Chain</span></div>
     <div class="sg-lockup__line">A plan for every Texas battery with complete public data, sealed before the market closes.</div>`,
    { dx: 0, dy: 0, ax: 0.5, ay: 0 },
  );
  const [lockupNames, lockupLine] = [lockup.el.firstElementChild as HTMLElement, lockup.el.lastElementChild as HTMLElement];
  {
    const [x, z] = toWorld(0, marksBottom);
    lockup.world.set(x, 0, z);
  }

  // The receipt sits in screen space, so it frames the same at any aspect ratio.
  const receipt = el("div", "scene-hud scene-hud--receipt");
  const card = el("div", "scene-receipt");
  receipt.append(card);
  // Without the HUD the host page carries the receipt itself.
  if (opts.hud) stage.hud.append(receipt);
  const head = el("div", "scene-receipt__head", `<span>Sealed on BNB Chain</span><span>GateRecord</span>`);
  card.append(head);
  // Market time, with the reader's own clock beside it when it differs.
  const sealedCt = mainnet ? `${formatInZone(mainnet.blockTime, CENTRAL_TZ)} CT` : "";
  const sealedOwn = mainnet ? formatInZone(mainnet.blockTime, READER_TZ, { date: false }) : "";
  const sealedAt = sealedOwn && sealedOwn !== formatInZone(mainnet!.blockTime, CENTRAL_TZ, { date: false }) ? `${sealedCt} · ${sealedOwn} yours` : sealedCt;
  const rows: [string, string, string?][] = mainnet
    ? [
        ["Chain", `${mainnet.chainName} · ${mainnet.chainId}`],
        ["Block", fmtInt.format(mainnet.blockNumber)],
        ["Sealed", sealedAt],
        ["Lead", `${fmtInt.format(mainnet.secondsBeforeGate)} s before the 10:00 CT gate`, "scene-receipt__lead"],
        ["Root", shortHash(mainnet.root, 10, 8)],
        ["Leaves", `${mainnet.leafCount} plans`],
        ["Tx", shortHash(mainnet.txHash, 10, 8)],
        ...(testnet ? ([["Also", `${testnet.chainName} · block ${fmtInt.format(testnet.blockNumber)}`]] as [string, string][]) : []),
      ]
    : [];
  // On a narrow stage only the rows that identify the commit stay.
  const essential = new Set(["Chain", "Block", "Lead", "Tx"]);
  const rowEls = rows.map(([k, , cls]) => {
    const r = el(
      "div",
      `scene-receipt__row${essential.has(k) ? "" : " scene-receipt__row--extra"}`,
      `<span>${k}</span><span${cls ? ` class="${cls}"` : ""}></span>`,
    );
    card.append(r);
    return { row: r, value: r.lastElementChild as HTMLElement };
  });

  // ------------------------------------------------------------ HUD
  const hud = stage.hud;
  const tl = el("div", "scene-hud scene-hud--tl");
  const kicker = el("div", "scene-kicker", `Operating day ${formatDay(data.day.operatingDay)}`);
  const title = el("div", "scene-title", "Qualifying");
  const sub = el("div", "scene-sub", "");
  tl.append(kicker, title, sub);
  const tr = el("div", "scene-hud scene-hud--tr");
  const clockEl = el("div", "scene-clock", "");
  const clockSub = el("div", "scene-meta", "");
  tr.append(clockEl, clockSub);
  const bl = el(
    "div",
    "scene-hud scene-hud--bl",
    `<div class="scene-legend">
       <div>Height and color: planned discharge, MWh (selected arm)</div>
       <div class="scene-legend__ramp" style="background:${RAMP_CSS}"></div>
       <div class="scene-legend__scale"><span>0</span><span>${fmtInt.format(Math.round(maxMwh))}</span></div>
       <div class="faint">Grid order: planned discharge; ${SHOWCASE.name} on pole as the showcase</div>
     </div>`,
  );
  const br = el(
    "div",
    "scene-hud scene-hud--br",
    `<div class="scene-source"><span class="scene-source__scope">${slots.length} shadow plans, computed from public data, never used to operate the batteries.<br/></span>${SOURCE_LINE}</div>`,
  );
  if (opts.hud) hud.append(tl, tr, bl, br);

  const planUnix = data.day.planUnix;
  const sealUnix = mainnet?.blockTime ?? planUnix;
  const gateUnix = data.day.gateUnix;

  // ------------------------------------------------------------ camera
  const target = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
  const camPos: Key[] = [
    { t: 0, v: [2.4, 1.5, 6.2] },
    { t: 3.6, v: [4.2, 5.2, 10.5] },
    { t: 7.2, v: [1.5, 20, 24] },
    { t: 8.6, v: [-1, 29, 28] },
    { t: 12.2, v: [2, 17, 20] },
    { t: 14, v: [60, 64, 52] },
    { t: 16.4, v: [118, 98, 74] },
    { t: TL.crane[0], v: [camRest.x, camRest.y, camRest.z] },
  ];
  const camTarget: Key[] = [
    { t: 0, v: target(-0.6, 1.25, -9) },
    { t: 3.6, v: target(-0.4, 0.7, -17) },
    { t: 7.2, v: target(4, 0, -60) },
    { t: 8.6, v: target(6, 0, -80) },
    { t: 12.2, v: target(2, 0, -40) },
    { t: 14, v: target(0, 0, cz + 52) },
    { t: 16.4, v: target(cx - 6, 0, cz + 44) },
    { t: TL.crane[0], v: target(aimRest.x, aimRest.y, aimRest.z) },
  ];
  const p3: [number, number, number] = [0, 0, 0];
  const q3: [number, number, number] = [0, 0, 0];
  const fog = scene.fog as Fog;

  const phaseText = (t: number) => {
    if (t < TL.sweep[0] - 0.2)
      return {
        title: "Qualifying",
        sub: `Agents plan tomorrow for ${slots.length} ERCOT batteries, each on its own node's prices, under the same rules.`,
        sealed: false,
      };
    if (t < TL.sweep[0] + TL.sweep[1])
      return { title: "Parc fermé", sub: "Every plan is sealed before ERCOT's 10:00 CT day-ahead gate. No changes after; a late seal reverts.", sealed: true };
    return {
      title: "Sealed on BNB Chain",
      sub: `One Merkle root over ${slots.length} plans. Anyone can check any battery's plan against the chain once prices settle.`,
      sealed: true,
    };
  };
  let lastPhase = "";

  function update(t: number) {
    // Camera: the scripted path, then the crane up to face the marks.
    sampleTrack(camPos, t, p3);
    sampleTrack(camTarget, t, q3);
    const crane = smoother(span(t, TL.crane[0], TL.crane[1]));
    if (t > TL.crane[0]) {
      // A stage narrower than 16:9 keeps its width of the scene, so the camera
      // ends closer there and the marks keep their size; the marks stay put and
      // the aim follows them.
      const finalDist = FINAL_DISTANCE * Math.min(1, Math.max(0.6, stage.width.css / stage.height.css / (16 / 9)));
      const finalRaise = MARKS_RAISE * 2 * Math.tan((camera.fov * Math.PI) / 360) * finalDist;
      const ax = lerp(aimRest.x, C.x - Ux * finalRaise, crane);
      const az = lerp(aimRest.z, C.z - Uz * finalRaise, crane);
      const d = craneDist * Math.pow(finalDist / craneDist, crane);
      const elev = lerp(craneEl, Math.PI / 2, crane);
      const across = d * Math.cos(elev);
      p3[0] = ax - Ux * across;
      p3[1] = d * Math.sin(elev);
      p3[2] = az - Uz * across;
      q3[0] = ax;
      q3[1] = 0;
      q3[2] = az;
      // The same roll as world-up on this heading, and still defined looking straight down.
      camera.up.set(Ux, 0, Uz);
    } else camera.up.set(0, 1, 0);
    camera.position.set(p3[0], p3[1], p3[2]);
    camera.lookAt(q3[0], q3[1], q3[2]);
    const dist = Math.hypot(p3[0] - q3[0], p3[1] - q3[1], p3[2] - q3[2]);
    // Facing the marks, nothing is fogged, and depth precision follows the distance.
    fog.near = lerp(dist * 0.55, dist * 6, crane);
    fog.far = lerp(dist * 2.4 + 60, dist * 12, crane);
    const near = lerp(0.1, dist * 0.3, crane);
    if (Math.abs(camera.near - near) > 1e-6) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
    gridMat.opacity = 0.12 * (1 - crane);
    grid.visible = crane < 1;

    // The grid's paint steps aside as the close begins.
    const closing = t >= TL.close;
    const paint = 1 - smooth(span(t, TL.close, 0.6));
    checkerMat.opacity = 0.32 * paint;
    boxes.material.opacity = 0.85 * paint;
    boxes.visible = paint > 0.001;
    decalMat.opacity = paint;
    decalMat.visible = paint > 0.001;
    checkerMat.visible = paint > 0.001;

    // Track draws in from the start line; in the close it flows into the mark.
    const tin = easeOut(span(t, TL.trackIn[0], TL.trackIn[1]));
    shapeTrack(t);
    inkTrack(t);
    const inked = smooth(span(t, TL.ink[0], TL.ink[1] + SETTLE_STAGGER));
    for (const e of edges) {
      e.reveal(tin);
      e.opacity = 1 - inked;
    }
    centerDash.reveal(tin);
    centerDash.material.dashOffset = 0;
    centerDash.opacity = paint;

    // Markers.
    const sw = sweepS(t, sEnd);
    const sweeping = t >= TL.sweep[0] && t <= TL.sweep[0] + TL.sweep[1] + 0.4;
    const capsOut = 1 - smooth(span(t, TL.close, 0.5));
    for (let i = 0; i < slots.length; i++) {
      const sl = slots[i]!;
      const grow = easeOut(span(t, sl.rise, 0.85));
      const sealed = t >= sl.freeze;
      // Live plans breathe while agents iterate; a sealed plan holds still.
      const liveAmp = sealed ? 0 : (1 - span(t, sl.freeze - 0.25, 0.25)) * 0.07 * grow;
      const wave = Math.sin(2 * Math.PI * (t * 0.8 + sl.phase));
      let h = Math.max(0.0001, sl.h * grow * (1 + liveAmp * wave));
      let x = sl.x;
      let y = 0;
      let z = sl.z;
      let yaw = sl.yaw;
      let fw = FOOT_W;
      let fd = FOOT_D;

      tmp.copy(sl.ramp);
      if (!sealed) tmp.lerp(white, Math.max(0, wave) * 0.12 * grow);
      else {
        const age = t - sl.freeze;
        tmp.lerp(bnb, 0.75 * Math.exp(-age * 4.5));
      }

      if (closing && i === 0) {
        // The pole's own mesh carries it from here.
        h = 0.0001;
        fw = 0.0001;
        fd = 0.0001;
      } else if (closing) {
        // Each plan rides the track into its place on the trace (the middle of
        // the stroke) and sinks into it; the ink follows where it went down.
        // A lit column never matches the unlit ink, so none stands in the
        // inked stroke: sunk below it, the stroke hides it.
        const e = smoother(span(t, TL.bend[0] + BEND_STAGGER * sl.u, TL.bend[1]));
        const low = smoother(span(t, TL.lower[0] + SETTLE_STAGGER * sl.u, TL.lower[1]));
        if (low >= 1) {
          h = 0.0001;
          fw = 0.0001;
          fd = 0.0001;
        } else if (e > 0) {
          const w = trace.at(sl.u * trace.length);
          x = lerp(sl.x, w.x, e);
          z = lerp(sl.z, w.z, e);
          yaw = lerpAngle(sl.yaw, Math.atan2(-w.dx, -w.dz), e);
          h = Math.max(0.0001, h * (1 - low));
          y = -SINK * low;
        }
      }
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(fw, h, fd);
      dummy.updateMatrix();
      cols.setMatrixAt(i, dummy.matrix);
      cols.setColorAt(i, tmp);

      // A cap shows from the moment its plan is sealed, and shrinks away as the close begins.
      const cap = (sealed && t > sl.freeze ? 1 : 0) * capsOut;
      dummy.position.set(x, y + h, z);
      dummy.scale.set(cap ? fw * 0.84 * cap : 0.0001, cap ? 0.045 : 0.0001, cap ? fd * 0.84 * cap : 0.0001);
      dummy.updateMatrix();
      caps.setMatrixAt(i, dummy.matrix);
    }
    cols.instanceMatrix.needsUpdate = true;
    if (cols.instanceColor) cols.instanceColor.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    caps.visible = capsOut > 0.001;
    // Every plan has sunk into the stroke.
    cols.visible = t < TL.lower[0] + SETTLE_STAGGER + TL.lower[1];

    // Desert Willow: from the pole to the trace's start, then along the trace into the node.
    poleMesh.visible = closing;
    poleName.opacity = 0;
    // The runner waits as far before the trace's start as the node sits past its end.
    let runArc = -nodeAlong;
    if (closing) {
      const e0 = smoother(span(t, TL.bend[0], TL.bend[1]));
      const run = easeInOut(span(t, TL.run[0], TL.run[1]));
      runArc = lerp(-nodeAlong, trace.length + nodeAlong, run);
      const p = trace.at(runArc);
      const settle = smoother(span(t, TL.ready[0], TL.ready[1]));
      let x = p.x;
      let z = p.z;
      let yaw = Math.atan2(-p.dx, -p.dz);
      if (t <= TL.run[0]) {
        x = lerp(pole.x, p.x, e0);
        z = lerp(pole.z, p.z, e0);
        yaw = lerpAngle(pole.yaw, yaw, e0);
      }
      poleCol.round(settle);
      poleMesh.position.set(x, 0, z);
      poleMesh.rotation.set(0, yaw, 0);
      // Lit flat in the brand's selection teal as soon as the close begins, and
      // a little broader, so the eye can follow it out of the grid; the node
      // ends in exact ink.
      const lit = smooth(span(t, TL.lit[0], TL.lit[1]));
      const foot = lerp(FOOT_W, POLE_FOOT, lit);
      const poleH = lerp(pole.h, 0.04, settle);
      poleMesh.scale.set(lerp(foot, 2 * nodeR, settle), poleH, lerp(lerp(FOOT_D, POLE_FOOT, lit), 2 * nodeR, settle));
      const inkNow = smooth(span(t, TL.settle[0], TL.settle[1]));
      poleMat.color.copy(pole.ramp).lerp(black, lit);
      poleMat.emissive.copy(black).lerp(teal, lit).lerp(ink, inkNow);
      poleName.world.set(x, poleH, z);
      poleName.opacity = smooth(span(t, TL.name[0], TL.name[1])) * (1 - smooth(span(t, TL.run[0], 0.4)));
      // Cap 0 rides the pole while it shrinks away.
      dummy.position.set(x, pole.h, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(FOOT_W * 0.84 * capsOut || 0.0001, capsOut ? 0.045 : 0.0001, FOOT_D * 0.84 * capsOut || 0.0001);
      dummy.updateMatrix();
      caps.setMatrixAt(0, dummy.matrix);
    }

    // The trace's teal, drawn on behind the runner and settling back to ink.
    const drawn = clamp01(runArc / trace.length);
    let quads = 0;
    while (quads + 1 < trace.samples.length && trace.samples[quads + 1]!.u <= drawn) quads++;
    traceGeo.setDrawRange(0, quads * 6);
    traceMat.opacity = 1 - smooth(span(t, TL.settle[0], TL.settle[1]));
    traceMesh.visible = closing && t > TL.run[0] && quads > 0 && traceMat.opacity > 0.001;

    poleRing.reveal(span(t, TL.qualify[0], 0.8));
    poleRing.material.color.set(t >= pole.freeze ? color.bnb : color.teal);
    poleRing.opacity = paint;

    // Lock line.
    const f = frameAt(Math.max(0, sw));
    lock.position.set(f.x, 0, f.z);
    lock.rotation.set(0, f.yaw, 0);
    const lockOp = sweeping ? span(t, TL.sweep[0], 0.3) * (1 - span(t, TL.sweep[0] + TL.sweep[1], 0.4)) : 0;
    lock.visible = lockOp > 0.001;
    (lockBar.material as MeshBasicMaterial).opacity = lockOp;
    glowMat.uniforms.uOpacity!.value = 0.85 * lockOp;
    wakeMat.uniforms.uOpacity!.value = 0.45 * lockOp;

    lockLabel.world.set(f.x + f.nx * (TRACK_HALF + 0.4), 1.2, f.z + f.nz * (TRACK_HALF + 0.4));
    lockLabel.opacity = lockOp;
    if (lockOp > 0) {
      let n = 0;
      for (const sl of slots) if (t >= sl.freeze) n++;
      lockCount.textContent = `${n} of ${slots.length} sealed`;
    }

    // Ring and its leaf ticks; in the close, the circle and the seal.
    const slide = smoother(span(t, TL.slide[0], TL.slide[1]));
    const relax = smoother(span(t, TL.relax[0], TL.relax[1]));
    const fold = smoother(span(t, TL.slide[0], 1.4));
    shapeRing(slide, relax, fold);
    const ringIn = easeInOut(span(t, TL.ring[0], TL.ring[1]));
    // The seal's band starts as this line, so the line hands over in one frame.
    const sweep = smoother(span(t, TL.seal[0], TL.seal[1]));
    for (const h of halves) {
      h.reveal(ringIn);
      h.opacity = sweep > 0 ? 0 : 1;
    }
    const innerOut = 1 - smooth(span(t, TL.slide[0], 0.8));
    for (const h of innerHalves) {
      h.reveal(easeInOut(span(t, TL.ring[0] + 0.35, TL.ring[1])));
      h.opacity = 0.28 * innerOut;
    }
    const tickCount = Math.round((easeInOut(span(t, TL.ring[0] + 0.15, TL.ring[1])) * tickOrder.length));
    ticks.geometry.instanceCount = tickCount;
    ticks.material.opacity = 0.7 * (1 - fold);
    ticks.visible = tickCount > 0 && fold < 1;
    sealMat.uniforms.uSweep!.value = sweep;
    seal.visible = sweep > 0;

    // Labels.
    poleLabel.world.set(pole.x, pole.h * easeOut(span(t, pole.rise, 0.85)) + 0.25, pole.z);
    poleLabel.opacity = span(t, 1.6, 0.6) * (1 - span(t, 9.6, 0.8));
    poleLabel.el.classList.toggle("scene-tag--bnb", t >= pole.freeze);
    poleLabel.el.classList.toggle("scene-tag--teal", t < pole.freeze);
    followers.forEach((l, k) => {
      const sl = slots[k + 1]!;
      l.world.set(sl.x, sl.h * easeOut(span(t, sl.rise, 0.85)) + 0.2, sl.z);
      l.opacity = span(t, 2.4 + k * 0.25, 0.5) * (1 - span(t, 5.2, 0.6)) * 0.92;
    });

    const compact = stage.width.css < 640;
    rootLabel.ax = compact ? 0.5 : 1;
    rootLabel.ay = compact ? 1 : 0.5;
    rootLabel.dx = compact ? 0 : -18;
    rootLabel.dy = compact ? -14 : 0;
    rootLabel.el.classList.toggle("scene-tag--right", !compact);
    rootLabel.el.classList.toggle("scene-tag--above", compact);
    // The pole's name sits left of the trace's start, which is near the stage's
    // edge on a phone: there it hangs above the dot.
    poleName.ax = compact ? 0.8 : 1;
    poleName.ay = compact ? 1 : 0.5;
    poleName.dx = compact ? 0 : -12;
    poleName.dy = compact ? -12 : 0;
    poleName.el.classList.toggle("scene-tag--right", !compact);
    poleName.el.classList.toggle("scene-tag--above", compact);
    const rootIn = span(t, TL.ring[0] + TL.ring[1] * 0.55, 1.1);
    // Without the HUD (phones) the page shows the root beside the scene.
    rootLabel.opacity = opts.hud ? smooth(clamp01(rootIn * 2)) * paint : 0;
    rootHead.textContent = "Merkle root";
    rootHash.textContent = resolveText(rootText, rootIn, 3);
    rootSub.textContent = rootIn > 0.6 ? `${slots.length} leaves, one per plan` : " ";

    const rIn = span(t, TL.receipt[0], TL.receipt[1]);
    receipt.style.opacity = String(smooth(clamp01(rIn * 4)) * paint);
    receipt.style.transform = `translateY(${Math.round((1 - easeOut(clamp01(rIn * 3))) * 12)}px)`;
    rowEls.forEach((r, k) => {
      const p = clamp01((rIn - k * 0.08) / 0.32);
      r.value.textContent = resolveText(rows[k]![1], p, 11 + k);
      r.row.style.opacity = p > 0 ? "1" : "0";
    });

    // The lockup's words, under the marks.
    const names = smoother(span(t, TL.words[0], TL.words[1]));
    const line = smoother(span(t, TL.line[0], TL.line[1]));
    lockup.opacity = names > 0 || line > 0 ? 1 : 0;
    lockup.dy = Math.round(stage.height.css * 0.06);
    lockupNames.style.opacity = names.toFixed(3);
    lockupNames.style.transform = `translateY(${((1 - names) * 6).toFixed(2)}px)`;
    lockupLine.style.opacity = line.toFixed(3);
    lockupLine.style.transform = `translateY(${((1 - line) * 6).toFixed(2)}px)`;

    // HUD.
    if (opts.hud) {
      const ph = phaseText(t);
      if (ph.title !== lastPhase) {
        lastPhase = ph.title;
        title.textContent = ph.title;
        sub.textContent = ph.sub;
        kicker.dataset.sealed = ph.sealed ? "1" : "0";
      }
      const hudIn = span(t, 0.3, 0.8);
      tl.style.opacity = String(hudIn * paint);
      tr.style.opacity = String(hudIn * paint);
      bl.style.opacity = String(span(t, 1.6, 0.8) * (1 - span(t, TL.ring[0], 0.8)));
      br.style.opacity = String(hudIn);
      // Market time runs from the plan to the seal, then holds.
      const clockUnix = Math.round(lerp(planUnix, sealUnix, span(t, TL.qualify[0], TL.sweep[0] + TL.sweep[1] - TL.qualify[0])));
      const sealedNow = clockUnix >= sealUnix;
      clockEl.innerHTML = `${formatInZone(clockUnix, CENTRAL_TZ, { date: false })}<small>CT</small>`;
      clockEl.dataset.sealed = sealedNow ? "1" : "0";
      clockSub.dataset.sealed = sealedNow ? "1" : "0";
      clockSub.innerHTML = sealedNow
        ? `Sealed <b>${fmtInt.format(gateUnix - sealUnix)} s</b> before the gate`
        : `Gate in <b>${fmtInt.format(gateUnix - clockUnix)} s</b> · 10:00 CT`;
    }
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
