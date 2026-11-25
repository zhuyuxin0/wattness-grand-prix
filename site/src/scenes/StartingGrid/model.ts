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
import { SHOWCASE, SOURCE_LINE } from "../../config";
import type { BatterySummary, ChainReceipt, DayIndex, Receipts } from "../../data/types";
import { font, stageColor as color } from "../../design/tokens";
import { formatDay, shortHash } from "../../lib/format";
import { formatInZone } from "../../lib/time";
import { clamp01, easeInOut, easeOut, hashString, lerp, resolveText, smooth, span } from "../clock";
import { GRID_DURATION } from "../durations";
import { Polyline, segments } from "../engine/lines";
import type { SceneModel } from "../engine/SceneHost";
import type { Stage } from "../engine/stage";
import { sampleTrack, type Key } from "../engine/track";

export interface GridData {
  day: DayIndex;
  receipts: Receipts;
}

/** The choreography, in scene seconds. */
export const GRID_TIMELINE = {
  duration: GRID_DURATION,
  still: 21.5,
  trackIn: [0.1, 1.6],
  qualify: [1.2, 6.6],
  sweep: [8.4, 4.2],
  ring: [12.8, 3.2],
  receipt: [15.8, 3.4],
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
  {
    const pos: number[] = [];
    const idx: number[] = [];
    trackSamples.forEach((f, i) => {
      pos.push(f.x - f.nx * TRACK_HALF, 0, f.z - f.nz * TRACK_HALF, f.x + f.nx * TRACK_HALF, 0, f.z + f.nz * TRACK_HALF);
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    g.setIndex(idx);
    const ribbon = new Mesh(g, new MeshBasicMaterial({ color: "#181c20", side: DoubleSide }));
    ribbon.renderOrder = -2;
    scene.add(ribbon);
  }
  const edges = [-1, 1].map((side) => {
    const pts = trackSamples.map((f) => new Vector3(f.x + f.nx * TRACK_HALF * side, 0.01, f.z + f.nz * TRACK_HALF * side));
    const p = new Polyline(stage, pts, { color: "#3a4148", width: 1.25 });
    scene.add(p.line);
    return p;
  });
  const centerDash = new Polyline(
    stage,
    trackSamples.map((f) => new Vector3(f.x, 0.008, f.z)),
    { color: "#2b3036", width: 1, dashed: true, dashSize: 1.2, gapSize: 1.6 },
  );
  scene.add(centerDash.line);

  // Start line: a fine checker of two rows across the track.
  {
    const f = frameAt(1.2);
    const cells = 22;
    const w = (TRACK_HALF * 2) / cells;
    const geo = new PlaneGeometry(w, w).rotateX(-Math.PI / 2);
    const mat = new MeshBasicMaterial({ color: "#c9ced3", transparent: true, opacity: 0.32, depthWrite: false });
    const checker = new InstancedMesh(geo, mat, cells);
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
  {
    const pairs: number[] = [];
    for (const sl of slots) {
      const f = frameAt(sl.s);
      const cx = sl.x - f.tx * 0.5;
      const cz = sl.z - f.tz * 0.5;
      const hw = 0.56;
      const ax = cx - f.nx * hw;
      const az = cz - f.nz * hw;
      const bx = cx + f.nx * hw;
      const bz = cz + f.nz * hw;
      pairs.push(ax, 0.012, az, bx, 0.012, bz);
      pairs.push(ax, 0.012, az, ax + f.tx * 0.32, 0.012, az + f.tz * 0.32);
      pairs.push(bx, 0.012, bz, bx + f.tx * 0.32, 0.012, bz + f.tz * 0.32);
    }
    scene.add(segments(stage, pairs, { color: "#5d636a", width: 1, opacity: 0.85 }));
  }

  // Position numbers painted ahead of each box.
  const atlas = numberAtlas(slots.length);
  textures.push(atlas.texture);
  {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    slots.forEach((sl, i) => {
      const f = frameAt(sl.s);
      const w = i === 0 ? 0.74 : 0.6;
      const h = w * (atlas.ch / atlas.cw);
      const cx = sl.x - f.tx * 1.0;
      const cz = sl.z - f.tz * 1.0;
      // Text up runs along the tangent, so the numbers read from the front of the grid.
      const corners: [number, number][] = [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ];
      for (const [a, b] of corners) pos.push(cx + f.nx * a + f.tx * b, 0.014, cz + f.nz * a + f.tz * b);
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
    const decals = new Mesh(g, new MeshBasicMaterial({ map: atlas.texture, transparent: true, depthWrite: false, side: DoubleSide }));
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
    const cx = sl.x;
    const cz = sl.z;
    const loop: [number, number][] = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
      [-hw, -hd],
    ];
    for (const [a, b] of loop) pts.push(new Vector3(cx + f.nx * a + f.tx * b, 0.02, cz + f.nz * a + f.tz * b));
    const p = new Polyline(stage, pts, { color: color.teal, width: 1.5 });
    scene.add(p.line);
    return p;
  })();

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
  const ringPoint = (phi: number, grow = 0, y = 0.05) => {
    // phi = 0 is the front of the ring, nearest the pole.
    const x = Math.sin(phi);
    const z = Math.cos(phi);
    // Outward normal of the ellipse, for ticks.
    const nx = x / rx;
    const nz = z / rz;
    const nl = Math.hypot(nx, nz);
    return new Vector3(cx + rx * x + (nx / nl) * grow, y, cz + rz * z + (nz / nl) * grow);
  };
  const RING_N = 240;
  const halves = [1, -1].map((dir) => {
    const pts: Vector3[] = [];
    for (let k = 0; k <= RING_N; k++) pts.push(ringPoint((dir * Math.PI * k) / RING_N));
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
  const tickPairs: number[] = [];
  const tickOrder = slots.map((_, k) => {
    const raw = (2 * Math.PI * (k + 0.5)) / slots.length;
    return raw > Math.PI ? raw - 2 * Math.PI : raw;
  });
  tickOrder.sort((a, b) => Math.abs(a) - Math.abs(b));
  for (const phi of tickOrder) {
    const a = ringPoint(phi, 0.6);
    const b = ringPoint(phi, phi === tickOrder[0] ? 3.2 : 1.6);
    tickPairs.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const ticks = segments(stage, tickPairs, { color: color.bnb, width: 1, opacity: 0.7, order: 5 });
  scene.add(ticks);
  const ringFront = ringPoint(0, 3.2);

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
    `<div class="timing" style="font-size:12px;letter-spacing:0.16em;color:var(--bnb)">Parc ferme</div><div class="mono muted"></div>`,
    { dx: 12, dy: 0, ax: 0, ay: 1 },
  );
  const lockCount = lockLabel.el.lastElementChild as HTMLElement;
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

  // The receipt sits in screen space, so it frames the same at any aspect ratio.
  const receipt = el("div", "scene-hud scene-hud--receipt");
  const card = el("div", "scene-receipt");
  receipt.append(card);
  // Without the HUD the host page carries the receipt itself.
  if (opts.hud) stage.hud.append(receipt);
  const head = el("div", "scene-receipt__head", `<span>Sealed on BNB Chain</span><span>GateRecord</span>`);
  card.append(head);
  const sealedCt = mainnet ? formatInZone(mainnet.blockTime, "America/Chicago") + " CT" : "";
  const sealedBkk = mainnet ? formatInZone(mainnet.blockTime, "Asia/Bangkok", { date: false }) + " Bangkok" : "";
  const rows: [string, string, string?][] = mainnet
    ? [
        ["Chain", `${mainnet.chainName} · ${mainnet.chainId}`],
        ["Block", fmtInt.format(mainnet.blockNumber)],
        ["Sealed", `${sealedCt} · ${sealedBkk}`],
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
    { t: 21.5, v: [112, 92, 84] },
    { t: 24, v: [109, 90, 87] },
  ];
  const camTarget: Key[] = [
    { t: 0, v: target(-0.6, 1.25, -9) },
    { t: 3.6, v: target(-0.4, 0.7, -17) },
    { t: 7.2, v: target(4, 0, -60) },
    { t: 8.6, v: target(6, 0, -80) },
    { t: 12.2, v: target(2, 0, -40) },
    { t: 14, v: target(0, 0, cz + 52) },
    { t: 16.4, v: target(cx - 6, 0, cz + 44) },
    { t: 21.5, v: target(cx - 6, 0, cz + 50) },
    { t: 24, v: target(cx - 6, 0, cz + 52) },
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
      return { title: "Parc ferme", sub: "Every plan is sealed before ERCOT's 10:00 CT day-ahead gate. No changes after; a late seal reverts.", sealed: true };
    return {
      title: "Sealed on BNB Chain",
      sub: `One Merkle root over ${slots.length} plans. Anyone can check any battery's plan against the chain once prices settle.`,
      sealed: true,
    };
  };
  let lastPhase = "";

  function update(t: number) {
    // Camera, with a slow drift once the choreography has finished.
    sampleTrack(camPos, t, p3);
    sampleTrack(camTarget, t, q3);
    const drift = Math.max(0, t - TL.duration) * 0.012;
    if (drift) {
      const dx = p3[0] - q3[0];
      const dz = p3[2] - q3[2];
      const c = Math.cos(drift);
      const s = Math.sin(drift);
      p3[0] = q3[0] + dx * c - dz * s;
      p3[2] = q3[2] + dx * s + dz * c;
    }
    camera.position.set(p3[0], p3[1], p3[2]);
    camera.lookAt(q3[0], q3[1], q3[2]);
    const dist = Math.hypot(p3[0] - q3[0], p3[1] - q3[1], p3[2] - q3[2]);
    fog.near = dist * 0.55;
    fog.far = dist * 2.4 + 60;

    // Track draws in from the start line.
    const tin = easeOut(span(t, TL.trackIn[0], TL.trackIn[1]));
    for (const e of edges) e.reveal(tin);
    centerDash.reveal(tin);
    centerDash.material.dashOffset = 0;

    // Markers.
    const sw = sweepS(t, sEnd);
    const sweeping = t >= TL.sweep[0] && t <= TL.sweep[0] + TL.sweep[1] + 0.4;
    for (let i = 0; i < slots.length; i++) {
      const sl = slots[i]!;
      const grow = easeOut(span(t, sl.rise, 0.85));
      const sealed = t >= sl.freeze;
      // Live plans breathe while agents iterate; a sealed plan holds still.
      const liveAmp = sealed ? 0 : (1 - span(t, sl.freeze - 0.25, 0.25)) * 0.07 * grow;
      const wave = Math.sin(2 * Math.PI * (t * 0.8 + sl.phase));
      const h = Math.max(0.0001, sl.h * grow * (1 + liveAmp * wave));
      dummy.position.set(sl.x, 0, sl.z);
      dummy.rotation.set(0, sl.yaw, 0);
      dummy.scale.set(FOOT_W, h, FOOT_D);
      dummy.updateMatrix();
      cols.setMatrixAt(i, dummy.matrix);

      tmp.copy(sl.ramp);
      if (!sealed) tmp.lerp(white, Math.max(0, wave) * 0.12 * grow);
      else {
        const age = t - sl.freeze;
        tmp.lerp(bnb, 0.75 * Math.exp(-age * 4.5));
      }
      cols.setColorAt(i, tmp);

      const capIn = sealed ? easeOut(clamp01((t - sl.freeze) / 0.22)) : 0;
      dummy.position.set(sl.x, h, sl.z);
      dummy.scale.set(capIn ? FOOT_W * 0.84 : 0.0001, capIn ? 0.045 : 0.0001, capIn ? FOOT_D * 0.84 : 0.0001);
      dummy.updateMatrix();
      caps.setMatrixAt(i, dummy.matrix);
    }
    cols.instanceMatrix.needsUpdate = true;
    if (cols.instanceColor) cols.instanceColor.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;

    poleRing.reveal(span(t, TL.qualify[0], 0.8));
    poleRing.material.color.set(t >= pole.freeze ? color.bnb : color.teal);

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

    // Ring and its leaf ticks.
    const ring = easeInOut(span(t, TL.ring[0], TL.ring[1]));
    for (const h of halves) h.reveal(ring);
    for (const h of innerHalves) h.reveal(easeInOut(span(t, TL.ring[0] + 0.35, TL.ring[1])));
    const tickCount = Math.round(easeInOut(span(t, TL.ring[0] + 0.15, TL.ring[1])) * tickPairs.length / 6);
    ticks.geometry.instanceCount = tickCount;
    ticks.visible = tickCount > 0;

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
    const rootIn = span(t, TL.ring[0] + TL.ring[1] * 0.55, 1.1);
    // Without the HUD (phones) the page shows the root beside the scene.
    rootLabel.opacity = opts.hud ? smooth(clamp01(rootIn * 2)) : 0;
    rootHead.textContent = "Merkle root";
    rootHash.textContent = resolveText(rootText, rootIn, 3);
    rootSub.textContent = rootIn > 0.6 ? `${slots.length} leaves, one per plan` : " ";

    const rIn = span(t, TL.receipt[0], TL.receipt[1]);
    receipt.style.opacity = String(smooth(clamp01(rIn * 4)));
    receipt.style.transform = `translateY(${Math.round((1 - easeOut(clamp01(rIn * 3))) * 12)}px)`;
    rowEls.forEach((r, k) => {
      const p = clamp01((rIn - k * 0.08) / 0.32);
      r.value.textContent = resolveText(rows[k]![1], p, 11 + k);
      r.row.style.opacity = p > 0 ? "1" : "0";
    });

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
      tl.style.opacity = String(hudIn);
      tr.style.opacity = String(hudIn);
      bl.style.opacity = String(span(t, 1.6, 0.8) * (1 - span(t, TL.ring[0], 0.8)));
      br.style.opacity = String(hudIn);
      // Market time runs from the plan to the seal, then holds.
      const clockUnix = Math.round(lerp(planUnix, sealUnix, span(t, TL.qualify[0], TL.sweep[0] + TL.sweep[1] - TL.qualify[0])));
      const sealedNow = clockUnix >= sealUnix;
      clockEl.innerHTML = `${formatInZone(clockUnix, "America/Chicago", { date: false })}<small>CT</small>`;
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
