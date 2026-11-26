// Each station's hero object, at the size the venue's wide frames read it (the hub, the closing, the drive's
// distance): the starting grid over Texas, the weather radar, the garage's six bays under the glass roof, Team data's
// floor, Parc fermé's root and ticks, race day's pylon and gates, the stewards' bay, the timing towers and their arch,
// the season purse and the launch tower. The Arcade is arena.ts; the stewards' bay in its close read is stewards.ts.
// Heights and colors that carry a figure read it from the frame data; the rest is architecture.
import * as THREE from 'three';
import { createBuilder } from '../../kit/geo';
import { roundRect } from '../../kit/region/geo';
import { heatAt } from '../../lib/heat';
import { HEX, exact, flat, glowMat, pool, radialTex, strand, barMaterial } from './look';
import { TRACK_Y, PLINTH_H } from './ground';
import { TEXAS_RING } from './texas';
import type { FrameData } from '../types';
import type { Layout, XZ } from './layout';
import { pitBrains } from '../brain/pit';


/** The venue's lit hardware: graphite clearcoat paint, galvanized steel, dark glass, from the kit's registry
 *  textures. */
export function hardware(reg: { m: Record<string, THREE.Material>; textures: Record<string, THREE.Texture> }) {
  const rough = reg.textures.rough!, roughMetal = reg.textures.roughMetal!;
  const graphite = new THREE.MeshPhysicalMaterial({ color: '#2c3238', roughness: 0.42, roughnessMap: rough, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const graphiteDark = new THREE.MeshPhysicalMaterial({ color: '#1d2125', roughness: 0.5, roughnessMap: rough, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const galv = new THREE.MeshStandardMaterial({ color: '#8d949b', metalness: 0.82, roughness: 0.38, roughnessMap: roughMetal });
  const steel = new THREE.MeshStandardMaterial({ color: '#a3abb3', metalness: 0.88, roughness: 0.3, roughnessMap: roughMetal });
  const darkGlass = new THREE.MeshPhysicalMaterial({ color: '#0b0e11', roughness: 0.06, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
  const concrete = new THREE.MeshStandardMaterial({ color: '#3b4148', roughness: 0.9, roughnessMap: rough });
  const brass = new THREE.MeshStandardMaterial({ color: '#b8935a', metalness: 1, roughness: 0.32, roughnessMap: roughMetal });
  return { graphite, graphiteDark, galv, steel, darkGlass, concrete, brass, kit: reg.m };
}
export type Hardware = ReturnType<typeof hardware>;

const disc = (r: number, seg = 48) => new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2);
const usd = (u: number) => u / 1e6;

/** A canvas screen: a MeshBasicMaterial whose map is drawn by fn on a w x h canvas, k times bright. */
export function screen(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, k = 1.6) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false, fog: false });
  m.color.setScalar(k);
  return m;
}

// ── the starting grid over Texas ─────────────────────────────────────────────────────────────────────────────
const RAMP = ['#1b4a42', '#249c83', '#2ec7a6', '#bdf4e6'];
const rampAt = (t: number) => {
  const f = Math.max(0, Math.min(1, t)) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(f)), k = f - i;
  return exact(RAMP[i]!).lerp(exact(RAMP[i + 1]!), k);
};

export function buildGrid(L: Layout, d: FrameData) {
  const g = new THREE.Group(); g.name = 'starting-grid';
  // the map: ERCOT's outline, a faint fill a step above the plinth with a hairline edge
  const ring: XZ[] = []; for (let i = 0; i < TEXAS_RING.length; i += 2) ring.push([TEXAS_RING[i]!, TEXAS_RING[i + 1]!]);
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), flat('#243039'));
  fill.position.y = PLINTH_H + 0.01; g.add(fill);
  g.add(strand([...ring, ring[0]!].map(([x, z]) => [x, PLINTH_H + 0.02, z]), { color: '#4f6577', width: 1, opacity: 0.9, order: 4 }));
  // every mapped battery where it stands, a small teal disc sized by its power
  const T = L.texas, ox = T.origin_world[0], oz = T.origin_world[1];
  const bats = d.fleet.batteries as any[];
  const dotGeo = disc(1, 16), dots = new THREE.InstancedMesh(dotGeo, glowMat(HEX.teal, 0.9), bats.length);
  let n = 0; const m4 = new THREE.Matrix4();
  for (const b of bats) {
    // an unmapped battery has no point on the map (its lat and lon are null, never zero)
    if (!b.map || b.map.missing || b.map.lat == null || b.map.lon == null) continue;
    const x = ox + (b.map.lon - T.center_lon) * T.m_per_deg_lon, z = oz - (b.map.lat - T.center_lat) * T.m_per_deg_lat;
    const r = 0.35 + 0.08 * Math.sqrt(b.power_mw);
    m4.compose(new THREE.Vector3(x, PLINTH_H + 0.03, z), new THREE.Quaternion(), new THREE.Vector3(r, 1, r));
    dots.setMatrixAt(n++, m4);
  }
  dots.count = n; dots.renderOrder = 2; g.add(dots);
  // the grid itself: 316 columns four abreast on the start straight, Desert Willow on pole
  const G = L.grid, maxMwh = Math.max(...bats.map((b) => b.planned_discharge_mwh));
  const order = bats.slice().sort((a, b) => (a.resource === d.showcase.resource ? -1 : b.resource === d.showcase.resource ? 1
    : b.planned_discharge_mwh - a.planned_discharge_mwh || (a.resource < b.resource ? -1 : 1)));
  const colGeo = new THREE.BoxGeometry(1.5, 1, 1.2).translate(0, 0.5, 0), capGeo = new THREE.BoxGeometry(0.9, 0.12, 0.6).translate(0, 0.06, 0);
  const cols = new THREE.InstancedMesh(colGeo, barMaterial(0.6), order.length), caps = new THREE.InstancedMesh(capGeo, glowMat(HEX.bnb, 1.3), order.length);
  const tops: [number, number, number][] = [];
  order.forEach((b, i) => {
    const row = Math.floor(i / G.abreast), lane = i % G.abreast;
    const x = G.front_row_x - G.row_pitch_m * row - G.stagger_m * (lane % 2), z = G.track_z + G.lane_z_offsets[lane]!;
    const h = 0.3 + (9.7 * b.planned_discharge_mwh) / maxMwh;
    m4.compose(new THREE.Vector3(x, TRACK_Y, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)); cols.setMatrixAt(i, m4);
    cols.setColorAt(i, rampAt(Math.sqrt(b.planned_discharge_mwh / maxMwh)));
    m4.compose(new THREE.Vector3(x, TRACK_Y + h, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)); caps.setMatrixAt(i, m4);
    tops.push([x, TRACK_Y + h + 0.12, z]);
  });
  cols.castShadow = true; cols.receiveShadow = true; g.add(cols, caps);
  return { group: g, pole: tops[0]!, count: order.length };
}

// ── the weather radar ────────────────────────────────────────────────────────────────────────────────────────
export function buildRadar(H: Hardware) {
  const g = new THREE.Group(); g.name = 'weather-radar';
  const b = createBuilder(THREE);
  // the mast: a tapered lattice read as a slim tube with three legs at the foot, the dish on a yoke at 22 m
  b.at(-430, 0, -66);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; b.rod('mast|galv', [Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2], [Math.cos(a) * 0.5, 20, Math.sin(a) * 0.5], 0.16); }
  for (let y = 2; y < 20; y += 3) b.torus('mast|galv', 2.2 - (y / 20) * 1.7, 0.06, 0, y, 0, { rx: Math.PI / 2, seg: 18 });
  b.cyl('mast|graphite', 0.9, 1.2, 0, 20.6, 0, { seg: 16 });
  b.pop();
  const parts = b.build({ galv: H.galv, graphite: H.graphite }).group;
  g.add(parts);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(4.5, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.32), H.steel);
  dish.position.set(-430, 24.8, -66); dish.rotation.set(-0.9, 0.6, 0); dish.castShadow = true; g.add(dish);
  // the scope: a 14 m round display under a glass dome, rings and the sweep drawn as light (an illustration of a
  // radar, not a reading: the odds it pairs with are W02's)
  const scopeTex = document.createElement('canvas'); scopeTex.width = scopeTex.height = 512;
  const c = scopeTex.getContext('2d')!;
  c.fillStyle = '#0a1d1a'; c.beginPath(); c.arc(256, 256, 254, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(46,199,166,0.85)'; c.lineWidth = 4;
  for (const r of [60, 120, 180, 240]) { c.beginPath(); c.arc(256, 256, r, 0, Math.PI * 2); c.stroke(); }
  c.strokeStyle = 'rgba(46,199,166,0.3)'; c.beginPath(); c.moveTo(16, 256); c.lineTo(496, 256); c.moveTo(256, 16); c.lineTo(256, 496); c.stroke();
  const t = new THREE.CanvasTexture(scopeTex); t.colorSpace = THREE.SRGBColorSpace;
  const faceM = new THREE.MeshBasicMaterial({ map: t, toneMapped: false }); faceM.color.setScalar(2.2);
  const face = new THREE.Mesh(disc(7, 64), faceM);
  face.position.set(-372, 0.95, -66); g.add(face);
  const sweep = new THREE.Mesh(new THREE.CircleGeometry(6.8, 48, 0, 0.9).rotateX(-Math.PI / 2), glowMat(HEX.teal, 1.4, { additive: true, opacity: 0.8 }));
  sweep.position.set(-372, 1.0, -66); sweep.renderOrder = 3; g.add(sweep);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(7.15, 0.22, 8, 64).rotateX(Math.PI / 2), H.graphite); rim.position.set(-372, 0.9, -66); g.add(rim);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(7.2, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: '#cfe3f0', roughness: 0.04, metalness: 0, transmission: 0, transparent: true, opacity: 0.14, clearcoat: 1, depthWrite: false }));
  dome.position.set(-372, 0.9, -66); dome.userData.noAO = true; dome.renderOrder = 4; g.add(dome);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.9, 0.9, 64).translate(0, 0.45, 0), H.graphiteDark); base.position.set(-372, 0, -66); base.castShadow = true; g.add(base);
  g.add(pool(HEX.teal, 13, 0.18, radialTex(1.5), [-372, PLINTH_H + 0.03, -66]));
  return { group: g, sweep, mastTop: [-430, 26, -66] as [number, number, number], scope: [-372, 1, -66] as [number, number, number] };
}

// ── the garage's bays ────────────────────────────────────────────────────────────────────────────────────────
// The top row's heroes stand 11 m north of the lane's edge, facing it: further back, the hub's station plates (top left
// of each box, as the diagram writes its titles) covered them.
const TOP_ROW_Z = -213;
export function buildBays(d: FrameData, H: Hardware) {
  const g = new THREE.Group(); g.name = 'bays';
  const C = d.showcase.arms.C, P = d.showcase.power_mw;
  // Race-day forecast: a chart wall 56 x 14 m facing south, the forecast node price as a line, C's schedule under it
  {
    const wall = screen(1400, 350, (c, w, h) => {
      c.fillStyle = '#0a0f13'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(150,156,163,0.18)'; c.lineWidth = 2;
      for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(0, (h * 0.55 * i) / 4); c.lineTo(w, (h * 0.55 * i) / 4); c.stroke(); }
      const node = d.showcase.forecast.node_da_cents as number[], mx = Math.max(...node), mn = Math.min(...node);
      c.strokeStyle = '#b481f0'; c.lineWidth = 6; c.beginPath();
      node.forEach((v, i) => { const x = ((i + 0.5) / 24) * w, y = h * 0.5 - ((v - mn) / (mx - mn)) * h * 0.4; i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
      (C.kw as number[]).forEach((kw, i) => {
        const x = (i / 24) * w + 6, bw = w / 24 - 12, bh = (Math.abs(kw) / (P * 1000)) * h * 0.3, y0 = h * 0.78;
        c.fillStyle = kw > 0 ? '#2ec7a6' : '#7f9cc0'; if (kw) c.fillRect(x, kw > 0 ? y0 - bh : y0, bw, bh);
      });
      c.fillStyle = 'rgba(150,156,163,0.35)'; c.fillRect(0, h * 0.78, w, 2);
    }, 1.7);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(56, 14), wall); panel.position.set(-130, 8, TOP_ROW_Z); g.add(panel);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(57.2, 15.2, 0.6), H.graphiteDark); frame.position.set(-130, 8, TOP_ROW_Z - 0.4); frame.castShadow = true; g.add(frame);
    for (const x of [-156, -104]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 1.6), H.galv); leg.position.set(x, 0.6, TOP_ROW_Z - 0.2); g.add(leg); }
  }
  // Fuel and wear: the battery column at its state of charge at the day's start (C's first hour), 24 m for 100%
  {
    const soc = (C.soc_kwh as number[])[0]! / (d.showcase.energy_mwh * 1000), h = 24 * soc;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, h, 64).translate(0, h / 2, 0), new THREE.MeshStandardMaterial({ color: '#8a98a8', roughness: 0.55, metalness: 0.05 }));
    col.position.set(10, PLINTH_H, TOP_ROW_Z + 1); col.castShadow = col.receiveShadow = true; g.add(col);
    const padM = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.4, 0.3, 64).translate(0, 0.15, 0), H.graphiteDark); padM.position.set(10, PLINTH_H, TOP_ROW_Z + 1); g.add(padM);
    for (const k of [0.05, 0.95]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.09, 6, 96).rotateX(Math.PI / 2), glowMat(HEX.muted, 0.9)); ring.position.set(10, PLINTH_H + 24 * k, TOP_ROW_Z + 1);
      if (24 * k < 17) g.add(ring);
    }
    const top = new THREE.Mesh(new THREE.TorusGeometry(6.05, 0.12, 6, 96).rotateX(Math.PI / 2), glowMat(HEX.teal, 1.6)); top.position.set(10, PLINTH_H + h, TOP_ROW_Z + 1); g.add(top);
  }
  // Spotter: 527 file tiles, 31 across and 17 up, the release's files the showcase leaf cites
  {
    const n = d.sealed_day.inputs_release.showcase_files_cited as number, cols = 31, rows = Math.ceil(n / cols);
    const tex = screen(31 * 24, rows * 24, (c) => {
      c.fillStyle = '#081013'; c.fillRect(0, 0, cols * 24, rows * 24);
      for (let i = 0; i < n; i++) { const x = (i % cols) * 24, y = Math.floor(i / cols) * 24; c.fillStyle = i % 7 === 3 ? '#2ec7a6' : '#1d6f60'; c.fillRect(x + 3, y + 5, 18, 14); }
    }, 1.6);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(54, 12), tex); panel.position.set(147, 7, TOP_ROW_Z); g.add(panel);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(55.2, 13.2, 0.6), H.graphiteDark); frame.position.set(147, 7, TOP_ROW_Z - 0.4); frame.castShadow = true; g.add(frame);
  }
  // Setup: C's 24 hours as a strip, 48 x 2.4 m, glass over its hedged hours inside an orange dashed outline
  {
    const x0 = -154, z = -122;
    const kw = C.kw as number[], q = C.contracts as number[];
    const strip = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 1, 2.2).translate(0, 0.5, 0), barMaterial(0.6), 24), m4s = new THREE.Matrix4();
    let ns = 0;
    kw.forEach((v, i) => {
      if (!v) return;
      const h = 0.15 + (Math.abs(v) / (P * 1000)) * 3.2;
      m4s.compose(new THREE.Vector3(x0 + i * 2 + 1, PLINTH_H, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1));
      strip.setMatrixAt(ns, m4s); strip.setColorAt(ns, v > 0 ? exact(HEX.teal) : exact(HEX.charge)); ns++;
    });
    strip.count = ns; strip.castShadow = true; g.add(strip);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(48, 0.12, 2.4).translate(0, 0.06, 0), H.graphiteDark); floor.position.set(-130, PLINTH_H, z); g.add(floor);
    const hedged = q.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    for (const i of hedged) {
      const tile = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.08 + (0.32 * Math.abs(q[i]!)) / 100, 2.3), new THREE.MeshPhysicalMaterial({ color: '#d8ecf2', roughness: 0.05, transparent: true, opacity: 0.32, clearcoat: 1, depthWrite: false }));
      tile.position.set(x0 + i * 2 + 1, PLINTH_H + 3.7, z); tile.userData.noAO = true; tile.renderOrder = 4; g.add(tile);
    }
    // the outline round each run of hedged hours
    let a = hedged[0]!;
    for (let k = 1; k <= hedged.length; k++) {
      if (k < hedged.length && hedged[k] === hedged[k - 1]! + 1) continue;
      const b = hedged[k - 1]!, xa = x0 + a * 2 - 0.2, xb = x0 + (b + 1) * 2 + 0.2;
      g.add(strand([[xa, PLINTH_H + 0.05, z - 1.6], [xb, PLINTH_H + 0.05, z - 1.6], [xb, PLINTH_H + 0.05, z + 1.6], [xa, PLINTH_H + 0.05, z + 1.6], [xa, PLINTH_H + 0.05, z - 1.6]],
        { color: HEX.orange, width: 1.4, dash: 1.0, gap: 0.6, order: 5 }));
      if (k < hedged.length) a = hedged[k]!;
    }
  }
  // Risk desk: C's 301 coins in their $250 bins, a quarter-scale tray 15 m long; each stack in its coins' heat color
  {
    const hist = d.game.histogram, counts = hist.counts.C as number[], edges = hist.edges_uusd as number[];
    const pitch = 15 / counts.length, x0 = 10 - 7.5;
    const coin = new THREE.CylinderGeometry(0.075, 0.075, 0.06, 12);
    const total = counts.reduce((s, c) => s + c, 0);
    const coins = new THREE.InstancedMesh(coin, barMaterial(0), total);
    let k = 0; const m4 = new THREE.Matrix4();
    counts.forEach((cnt, i) => {
      const mid = usd((edges[i]! + edges[i + 1]!) / 2);
      for (let j = 0; j < cnt; j++) {
        m4.makeTranslation(x0 + (i + 0.5) * pitch, PLINTH_H + 0.12 + 0.065 * j, -122);
        coins.setMatrixAt(k, m4); coins.setColorAt(k, heatAt('dark', mid)); k++;
      }
    });
    g.add(coins);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.12, 1.2).translate(0, 0.06, 0), H.brass); tray.position.set(10, PLINTH_H, -122); g.add(tray);
  }
  // Pit wall: three strategy boards, A, B and C; C's (the selected, sealed plan) edged in BNB yellow
  {
    const arms = ['A', 'B', 'C'];
    arms.forEach((arm, i) => {
      const x = 125 + i * 22, sel = arm === d.showcase.selected_arm;
      const a = d.showcase.arms[arm];
      const tex = screen(480, 320, (c, w, h) => {
        c.fillStyle = '#0b1014'; c.fillRect(0, 0, w, h);
        c.fillStyle = arm === 'A' ? HEX.armA : arm === 'B' ? HEX.armB : HEX.armC; c.fillRect(24, 24, 28, 28);
        // the arm's objective as a bar against the three's largest (a picture of the comparison; figures are plates)
        const objs = arms.map((x) => d.showcase.arms[x].objective_uusd as number), mx = Math.max(...objs);
        c.fillStyle = 'rgba(150,156,163,0.25)'; c.fillRect(24, h - 70, w - 48, 22);
        c.fillStyle = sel ? '#2ec7a6' : '#5e666e'; c.fillRect(24, h - 70, ((w - 48) * a.objective_uusd) / mx, 22);
      }, 1.2);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), tex); board.position.set(x, 6.2, -124); board.rotation.y = Math.PI; g.add(board);
      const back = new THREE.Mesh(new THREE.BoxGeometry(12.8, 8.8, 0.5), H.graphiteDark); back.position.set(x, 6.2, -123.7); back.castShadow = true; g.add(back);
      for (const dx of [-5, 5]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.8, 0.4).translate(0, 0.9, 0), H.galv); leg.position.set(x + dx, PLINTH_H, -123.7); g.add(leg); }
      if (sel) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(13.1, 9.1, 0.3), glowMat(HEX.bnb, 1.6)); edge.position.set(x, 6.2, -123.9); g.add(edge);
        g.add(pool(HEX.bnb, 10, 0.12, radialTex(1.6), [x, PLINTH_H + 0.02, -128]));
      }
    });
  }
  // the workshop at the hangar's south end: a 60 m build bench and the racks behind it, their status LEDs dim (the
  // racks are a locked hook until a hosted job runs)
  {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(60, 1.0, 3.2).translate(0, 0.5, 0), H.graphite); bench.position.set(-120, 0, 6); bench.castShadow = true; g.add(bench);
    const top = new THREE.Mesh(new THREE.BoxGeometry(60.4, 0.08, 3.4), H.steel); top.position.set(-120, 1.04, 6); g.add(top);
    const rack = new THREE.BoxGeometry(2.4, 4.2, 1.2).translate(0, 2.1, 0), leds = new THREE.BoxGeometry(2.0, 0.06, 0.02);
    const racks = new THREE.InstancedMesh(rack, H.graphiteDark, 2 * 27), ledM = new THREE.InstancedMesh(leds, glowMat(HEX.teal, 0.8), 2 * 27 * 6);
    let r = 0, l = 0; const m4 = new THREE.Matrix4();
    for (const z of [-24, -16]) for (let i = 0; i < 27; i++) {
      const x = -160 + i * 3;
      m4.makeTranslation(x, 0, z); racks.setMatrixAt(r++, m4);
      for (let k = 0; k < 6; k++) { m4.makeTranslation(x, 0.6 + k * 0.6, z + (z < -20 ? 0.61 : -0.61)); ledM.setMatrixAt(l++, m4); }
    }
    racks.castShadow = true; g.add(racks, ledM);
  }
  return { group: g };
}

// ── Team data: the brains under the glass floor ──────────────────────────────────────────────────────────────
/** res: the drawing buffer's size, for the brains' lines. */
export function buildTeamData(H: Hardware, res: THREE.Vector2) {
  const g = new THREE.Group(); g.name = 'team-data';
  const x0 = -194, x1 = 208, z0 = -94, z1 = -40, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0 - 4, dd = z1 - z0 - 4;
  // the pit under the floor, dark walls; in it Living Brain's three brains of ours as the brain station draws them
  // (stations/brain/pit.ts, from brain-scene.json): the Terminal's, the Grand Prix build's and Desert Willow's review,
  // with the connections across them, alone and brighter, as the garage's hangar sees them from above through the glass
  // (the Terminal's layers and parts under them are the garage's G03), their sprites sized for the hub's long lens
  const pit = new THREE.Mesh(new THREE.BoxGeometry(w, 8, dd).translate(0, -4, 0), new THREE.MeshStandardMaterial({ color: '#0a0d10', roughness: 0.9, side: THREE.BackSide }));
  pit.position.set(cx, 0.1, cz); g.add(pit);
  // fewer particles than the garage's 20,000: a brain is some 70 px long here, and that many sum to a flat white
  const brains = pitBrains({ x0, x1, z0, z1 }, res, { lens: true, count: 5000 });
  brains.setBright(2.2);
  // the garage's pit keeps its left half for the Terminal's layers and parts; this one holds the brains alone, centered
  brains.group.position.x = (x0 + x1) / 2 - 90;
  // drawn in the opaque pass, as the garage draws its pit, so the floor's glass lies over them
  brains.group.traverse((c) => { delete c.userData.overlay; c.userData.noAO = true; c.layers.set(0); });
  g.add(brains.group);
  // the glass floor over it, flush with the plinth's top
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, dd).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#9fc7d6', roughness: 0.08, transparent: true, opacity: 0.1, clearcoat: 1, depthWrite: false }));
  glass.position.set(cx, PLINTH_H + 0.02, cz); glass.renderOrder = 6; glass.userData.noAO = true; g.add(glass);
  // mullions: the floor's glazing bars every 13.4 m
  const bars = createBuilder(THREE);
  for (let x = x0 + 2; x <= x1 - 2 + 1e-6; x += (w) / 30) bars.box('bar|galv', 0.18, 0.06, dd, x, PLINTH_H + 0.03, cz);
  bars.box('bar|galv', w, 0.06, 0.18, cx, PLINTH_H + 0.03, cz);
  g.add(bars.build({ galv: H.galv }, { shadows: false }).group);
  return { group: g };
}

// ── Parc fermé: the root and its 316 ticks ───────────────────────────────────────────────────────────────────
export function buildParcFerme(d: FrameData, H: Hardware) {
  const g = new THREE.Group(); g.name = 'parc-ferme';
  const c: [number, number] = [358, -200], n = d.sealed_day.leaf_count as number;
  const plateBase = new THREE.Mesh(new THREE.CylinderGeometry(15, 15.4, 0.5, 96).translate(0, 0.25, 0), H.graphiteDark); plateBase.position.set(c[0], PLINTH_H, c[1]); g.add(plateBase);
  const plate = new THREE.Mesh(disc(14, 96), new THREE.MeshPhysicalMaterial({ color: exact(HEX.bnb, 0.55), emissive: exact(HEX.bnb, 0.35), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 }));
  plate.position.set(c[0], PLINTH_H + 0.52, c[1]); g.add(plate);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(14, 0.16, 6, 128).rotateX(Math.PI / 2), glowMat(HEX.bnb, 1.8)); rim.position.set(c[0], PLINTH_H + 0.56, c[1]); g.add(rim);
  // the leaves: one tick a sealed plan, round the root at 22 m
  const tick = new THREE.BoxGeometry(0.18, 0.12, 2.2), ticks = new THREE.InstancedMesh(tick, glowMat(HEX.bnb, 1.4), n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    m4.compose(new THREE.Vector3(c[0] + Math.cos(a) * 22, PLINTH_H + 0.06, c[1] + Math.sin(a) * 22), q, new THREE.Vector3(1, 1, 1));
    ticks.setMatrixAt(i, m4);
  }
  g.add(ticks);
  g.add(pool(HEX.bnb, 30, 0.2, radialTex(1.3), [c[0], PLINTH_H + 0.02, c[1]]));
  // the receipt pylons, BSC (56) and its testnet (97), 26 m, BNB yellow edges on graphite
  for (const [x, z] of [[440, -232], [452, -186]] as const) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(5, 26, 3).translate(0, 13, 0), H.graphite); p.position.set(x, PLINTH_H, z); p.castShadow = true; g.add(p);
    for (const dx of [-2.55, 2.55]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.12, 25, 3.05).translate(0, 12.5, 0), glowMat(HEX.bnb, 1.5)); e.position.set(x + dx, PLINTH_H + 0.5, z); g.add(e); }
    g.add(pool(HEX.bnb, 9, 0.16, radialTex(1.5), [x, PLINTH_H + 0.02, z]));
  }
  // the barrier across the lane at the plinth's edge, and the gate clock over it
  const bar = new THREE.Mesh(new THREE.BoxGeometry(13, 0.35, 0.35), glowMat(HEX.bnb, 1.2)); bar.position.set(283.2, 1.4, -146.3); bar.rotation.y = (-64 * Math.PI) / 180 + Math.PI / 2; g.add(bar);
  const gantry = createBuilder(THREE);
  gantry.at(284, 0, -147, (-64 * Math.PI) / 180 + Math.PI / 2);
  for (const s of [-8, 8]) gantry.box('g|graphite', 0.7, 15, 0.7, s, 7.5, 0);
  gantry.box('g|graphite', 17, 1.2, 1.0, 0, 14.4, 0);
  gantry.pop();
  g.add(gantry.build({ graphite: H.graphite }).group);
  return { group: g, root: [c[0], PLINTH_H + 0.6, c[1]] as [number, number, number] };
}

// ── race day: the timing pylon and the three gates over the lane ─────────────────────────────────────────────
export function buildRaceDay(d: FrameData, H: Hardware) {
  const g = new THREE.Group(); g.name = 'race-day';
  const C = d.showcase.arms.C.kw as number[], P = d.showcase.power_mw * 1000;
  const tex = screen(256, 1024, (c, w, h) => {
    c.fillStyle = '#081014'; c.fillRect(0, 0, w, h);
    C.forEach((kw, i) => { const y = 40 + (i / 24) * (h - 80), bw = (Math.abs(kw) / P) * (w - 60); c.fillStyle = kw > 0 ? '#2ec7a6' : '#7f9cc0'; if (kw) c.fillRect(30, y, bw, (h - 80) / 24 - 10); });
  }, 1.3);
  const pylon = new THREE.Mesh(new THREE.BoxGeometry(2.4, 32, 8).translate(0, 16, 0), H.graphite); pylon.position.set(330, PLINTH_H, -86); pylon.castShadow = true; g.add(pylon);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(7, 30), tex); face.position.set(331.25, 16.4, -86); face.rotation.y = Math.PI / 2; g.add(face);
  // the three gates: day-ahead (settled), real-time provisional and final (to come on race day)
  [-112, -96, -80].forEach((z, i) => {
    const b = createBuilder(THREE);
    b.box('gate|graphite', 0.9, 12, 0.9, 358.5, 6, z); b.box('gate|graphite', 0.9, 12, 0.9, 381.5, 6, z); b.box('gate|graphite', 24, 1.2, 1.2, 370, 12.4, z);
    g.add(b.build({ graphite: H.graphite }).group);
    const lit = i === 0;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, 0.2), glowMat(lit ? HEX.teal : HEX.rim, lit ? 1.8 : 1)); lamp.position.set(370, 11.75, z + 0.62); g.add(lamp);
  });
  return { group: g };
}

// ── the stewards' bay, as the wide frames see it (stewards.ts draws its close read) ──────────────────────────
export function buildStewardsFar(H: Hardware) {
  const g = new THREE.Group(); g.name = 'stewards-far';
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 9, 44).translate(0, 4.5, 0), H.graphite); wall.position.set(457.5, PLINTH_H, 4); wall.castShadow = true; g.add(wall);
  for (let i = 0; i < 5; i++) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.3, 24, 16, Math.PI, Math.PI), glowMat(HEX.teal, 1.8)); lamp.position.set(456.5, 4, -14 + i * 7); g.add(lamp);
    g.add(pool(HEX.teal, 5, 0.18, radialTex(1.5), [452, PLINTH_H + 0.02, -14 + i * 7]));
  }
  const crown = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 44), glowMat(HEX.teal, 1.4)); crown.position.set(456.4, PLINTH_H + 9.07, 4); g.add(crown);
  const card = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 4), new THREE.MeshPhysicalMaterial({ color: '#cfe8ef', roughness: 0.05, transparent: true, opacity: 0.4, clearcoat: 1 })); card.position.set(408, 0.9, 18); g.add(card);
  return { group: g };
}

// ── the season purse and the launch tower (built, idle: no season or graduation has run) ─────────────────────
export function buildMachines(H: Hardware) {
  const g = new THREE.Group(); g.name = 'machines';
  const warm = radialTex(1.4);
  // the season purse: a 26 x 30 x 10 m vending machine facing south, its glass front ringed by tungsten bulbs
  {
    const b = createBuilder(THREE);
    b.at(0, PLINTH_H, 172);
    b.box('body|graphite', 26, 30, 10, 0, 15, 0, { c: 0.25 });
    b.box('trim|brass', 26.4, 0.5, 10.4, 0, 30.1, 0);
    b.box('trim|brass', 26.4, 0.5, 10.4, 0, 0.25, 0);
    b.pop();
    g.add(b.build({ graphite: H.graphiteDark, brass: H.brass }).group);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(22, 20), new THREE.MeshPhysicalMaterial({ color: '#10161b', roughness: 0.06, clearcoat: 1, metalness: 0.2 }));
    front.position.set(0, PLINTH_H + 17, 177.06); g.add(front);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 18, 40, 1, true).translate(0, 9, 0), new THREE.MeshPhysicalMaterial({ color: '#dfeff5', roughness: 0.05, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    tube.position.set(-8, PLINTH_H + 8, 176); tube.userData.noAO = true; g.add(tube);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(7, 5), glowMat('#2b3036', 1)); scr.position.set(0, PLINTH_H + 20, 177.1); g.add(scr);
    const vault = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.6, 48).rotateX(Math.PI / 2), H.brass); vault.position.set(7, PLINTH_H + 16, 177.2); g.add(vault);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 0.2), glowMat('#20262c', 1)); slot.position.set(0, PLINTH_H + 4.5, 177.12); g.add(slot);
    g.add(bulbs([[-11.6, 6.6], [11.6, 6.6], [11.6, 27.4], [-11.6, 27.4]], PLINTH_H, 177.25, 0.9));
    g.add(pool(HEX.tungsten, 22, 0.17, warm, [0, PLINTH_H + 0.02, 184], { sz: 0.7 }));
  }
  // License to launch: a 44 m glass tower on a 14 x 14 m base, its bonding tube inside, the gate at 36 to 40 m,
  // the agent card's plinth before it and the pool to its east
  {
    const base = new THREE.Mesh(new THREE.BoxGeometry(14, 3, 14).translate(0, 1.5, 0), H.graphite); base.position.set(330, PLINTH_H, 172); base.castShadow = true; g.add(base);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(11, 41, 11).translate(0, 20.5, 0), new THREE.MeshPhysicalMaterial({ color: '#cfe3ee', roughness: 0.04, transparent: true, opacity: 0.12, clearcoat: 1, depthWrite: false }));
    glass.position.set(330, PLINTH_H + 3, 172); glass.userData.noAO = true; glass.renderOrder = 5; g.add(glass);
    const frame = createBuilder(THREE);
    for (const [sx, sz] of [[-5.5, -5.5], [5.5, -5.5], [5.5, 5.5], [-5.5, 5.5]]) frame.box('f|graphite', 0.5, 41, 0.5, 330 + sx, PLINTH_H + 3 + 20.5, 172 + sz);
    for (const y of [3, 36, 40, 44]) for (const [w, d, ox, oz] of [[11.5, 0.4, 0, -5.5], [11.5, 0.4, 0, 5.5], [0.4, 11.5, -5.5, 0], [0.4, 11.5, 5.5, 0]] as const) frame.box('f|graphite', w, 0.4, d, 330 + ox, PLINTH_H + y, 172 + oz);
    g.add(frame.build({ graphite: H.graphite }).group);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 32, 48, 1, true).translate(0, 16, 0), new THREE.MeshPhysicalMaterial({ color: '#e7f4f8', roughness: 0.05, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    tube.position.set(330, PLINTH_H + 3.2, 172); tube.userData.noAO = true; g.add(tube);
    for (const dx of [-3.2, 3.2]) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), glowMat('#3a4148', 1)); lamp.position.set(330 + dx, PLINTH_H + 38, 177.8); g.add(lamp); }
    const card = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 4).translate(0, 0.6, 0), H.graphite); card.position.set(330, PLINTH_H, 186); g.add(card);
    const poolM = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 0.4, 96).translate(0, 0.2, 0), H.graphiteDark); poolM.position.set(400, PLINTH_H, 180); g.add(poolM);
    const water = new THREE.Mesh(disc(14.2, 96), flat('#17222a')); water.position.set(400, PLINTH_H + 0.42, 180); g.add(water);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(14.4, 0.12, 6, 96).rotateX(Math.PI / 2), glowMat(HEX.rim, 1.4)); lip.position.set(400, PLINTH_H + 0.44, 180); g.add(lip);
  }
  return { group: g };
}

/** Tungsten bulbs round a rectangle (corners [x, y] on a face at z), spaced `pitch` m: the Arcade's chasers. */
export function bulbs(corners: [number, number][], y0: number, z: number, pitch: number, r = 0.16, closed = true) {
  const pts: [number, number][] = [];
  const segs = closed ? corners.length : corners.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = corners[i]!, b = corners[(i + 1) % corners.length]!, L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / pitch));
    for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  if (!closed) pts.push(corners[corners.length - 1]!);
  const geo = new THREE.SphereGeometry(r, 10, 8), mesh = new THREE.InstancedMesh(geo, glowMat(HEX.tungsten, 2.6), pts.length), m4 = new THREE.Matrix4();
  pts.forEach(([x, y], i) => { m4.makeTranslation(x, y0 + y, z); mesh.setMatrixAt(i, m4); });
  return mesh;
}

// ── the timing towers, the refused panel and the arch over A7 ────────────────────────────────────────────────
export function buildTiming(d: FrameData, H: Hardware) {
  const g = new THREE.Group(); g.name = 'timing';
  const atlas = d.sponsors.atlas.signed_pull, cmc = d.sponsors.cmc.quotes;
  const bnbA = atlas.prices.find((p: any) => p.feed_id === 633).usd as number, usdtA = atlas.prices.find((p: any) => p.feed_id === 649).usd as number;
  const bnbC = cmc.assets.find((a: any) => a.symbol === 'BNB').price_usd as number, usdtC = cmc.assets.find((a: any) => a.symbol === 'USDT').price_usd as number;
  // the screens' type is the site's display face, as on the stewards' board (the condensed timing face is gone); a
  // figure or a label wider than the room to its screen's right margin is set smaller to fit, not cut. Returns where
  // the text ends, so a figure can follow its label
  const digits = (c: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string, weight = 600, face = '"Libre Franklin Brand", "Helvetica Neue", Arial, sans-serif', track = 0) => {
    (c as any).letterSpacing = `${track}px`; c.font = `${weight} ${px}px ${face}`;
    const room = c.canvas.width - x - 28;
    let wide = c.measureText(text).width;
    if (wide > room) { c.font = `${weight} ${Math.floor((px * room) / wide)}px ${face}`; wide = c.measureText(text).width; }
    c.fillStyle = color; c.textBaseline = 'alphabetic'; c.fillText(text, x, y);
    return x + wide;
  };
  const ctTime = (o: any) => o.ct.slice(11, 19) + ' CT';
  const cmcBnb = cmc.assets.find((a: any) => a.symbol === 'BNB'), cmcUsdt = cmc.assets.find((a: any) => a.symbol === 'USDT');
  const sec = d.sponsors.cmc.security, fund = d.sponsors.cmc.funding_decision;
  // each tower: two screens stacked, a figure each with its source and its time (the plates name them in full)
  const towers: { x: number; pair: string; rows: { src: string; fig: string; time: string; tint: string }[] }[] = [
    { x: -20, pair: 'BNB / USD', rows: [{ src: 'ATLAS SIGNED', fig: bnbA.toFixed(2), time: ctTime(atlas.observed), tint: HEX.teal }, { src: 'COINMARKETCAP', fig: bnbC.toFixed(2), time: ctTime(cmcBnb.quote_time), tint: HEX.teal }] },
    { x: 40, pair: 'USDT / USD', rows: [{ src: 'ATLAS SIGNED', fig: usdtA.toFixed(5), time: ctTime(atlas.observed), tint: HEX.teal }, { src: 'COINMARKETCAP', fig: usdtC.toFixed(5), time: ctTime(cmcUsdt.quote_time), tint: HEX.teal }] },
    { x: 100, pair: 'BSC-USDT', rows: [{ src: 'SECURITY', fig: String(sec.security_level).toUpperCase(), time: `TAX ${Number(sec.buy_tax)} / ${Number(sec.sell_tax)}`, tint: HEX.teal }, { src: 'CAUTIONS', fig: String(sec.items_hit), time: 'MINTABLE', tint: '#e2a13a' }] },
    { x: 160, pair: 'BUDGET', rows: [{ src: `${fund.bnb_quantity} BNB AT THE LOWER`, fig: `$${fund.after.reference_value_usd.toFixed(2)}`, time: ctTime(fund.observed), tint: HEX.teal }, { src: 'EVALUATIONS AT $2', fig: String(fund.after.evaluations), time: '', tint: HEX.teal }] },
    { x: 220, pair: 'ATLAS', rows: [{ src: 'PUBLIC FEEDS', fig: String(d.sponsors.atlas.catalog.public_feeds), time: ctTime(d.sponsors.atlas.catalog.observed), tint: HEX.teal }, { src: 'FEEDS READ', fig: String(atlas.prices.length), time: ctTime(atlas.observed), tint: HEX.teal }] },
  ];
  for (const t of towers) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 16, 2.2).translate(0, 8, 0), H.graphite); body.position.set(t.x, PLINTH_H, 105); body.castShadow = true; g.add(body);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.4, 2.6), H.galv); cap.position.set(t.x, PLINTH_H + 16.2, 105); g.add(cap);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.12, 0.16), glowMat(HEX.teal, 1.8)); crown.position.set(t.x, PLINTH_H + 16.46, 103.95); g.add(crown);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.6, 2.8).translate(0, 0.3, 0), H.galv); foot.position.set(t.x, PLINTH_H, 105); g.add(foot);
    const tex = screen(512, 1024, (c, w, h) => {
      c.fillStyle = '#0b1014'; c.fillRect(0, 0, w, h);
      digits(c, t.pair, 36, 78, 52, '#969ca3', 600, undefined, 4);
      c.fillStyle = '#2b3036'; c.fillRect(36, 104, w - 72, 2);
      t.rows.forEach((r, k) => {
        const y0 = 150 + k * 430;
        c.fillStyle = r.tint; c.fillRect(36, y0, 6, 300);
        digits(c, r.src, 64, y0 + 40, 34, '#969ca3', 600, undefined, 3);
        digits(c, r.fig, 60, y0 + 210, r.fig.length > 7 ? 120 : 150, '#f6f7f8', 500);
        if (r.time) digits(c, r.time, 64, y0 + 290, 34, '#969ca3', 500, 'ui-monospace, Menlo, monospace');
      });
    }, 1.45);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 10.4), tex); face.position.set(t.x, PLINTH_H + 9.6, 103.88); face.rotation.y = Math.PI; g.add(face);
    g.add(pool(HEX.teal, 7, 0.1, radialTex(1.5), [t.x, PLINTH_H + 0.02, 100]));
  }
  // the refused panel: the chain-97 feed, excluded as stale, dimmed red
  const refused = new THREE.Mesh(new THREE.BoxGeometry(6, 9, 1.6).translate(0, 4.5, 0), H.graphiteDark); refused.position.set(280, PLINTH_H, 105); g.add(refused);
  const rface = new THREE.Mesh(new THREE.PlaneGeometry(5, 7.6), glowMat(HEX.refused, 0.35)); rface.position.set(280, PLINTH_H + 4.6, 104.18); rface.rotation.y = Math.PI; g.add(rface);
  // the gantry over A7 at the plinth's west end, 14 m clear, from x -150 to -40: five slender portals of galvanized
  // steel tied by a lattice chord, a glass canopy over the lane, and screens hung under it facing both ways down the
  // lane, repeating the towers' prices
  const b = createBuilder(THREE);
  const xs = [-150, -122.5, -95, -67.5, -40];
  for (const x of xs) {
    for (const z of [84, 120]) { b.box('arch|galv', 0.7, 14.6, 0.7, x, 7.3, z); b.box('arch|graphite', 1.4, 0.6, 1.4, x, 0.3, z); }
    b.box('arch|galv', 0.6, 1.0, 36.6, x, 14.9, 102);
    // the portal's knee braces
    for (const s2 of [1, -1]) b.beam('arch|galv', [x, 12.4, 102 - s2 * 18], [x, 14.4, 102 - s2 * 15.4], 0.22);
  }
  // the lattice chords along both edges, top and bottom, with their diagonals
  for (const z of [84, 120]) {
    b.box('arch|galv', 110.6, 0.3, 0.3, -95, 15.4, z); b.box('arch|galv', 110.6, 0.3, 0.3, -95, 14.4, z);
    for (let k = 0; k < 44; k++) { const x0 = -150 + k * 2.5; b.beam('arch|galv', [x0, 14.4, z], [x0 + 2.5, 15.4, z], 0.1); }
  }
  g.add(b.build({ graphite: H.graphite, galv: H.galv }).group);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(110, 0.12, 36.4), new THREE.MeshPhysicalMaterial({ color: '#bcd3dd', roughness: 0.08, transparent: true, opacity: 0.12, clearcoat: 1, depthWrite: false }));
  canopy.position.set(-95, 15.55, 102); canopy.userData.noAO = true; canopy.renderOrder = 6; g.add(canopy);
  // teal LED lines under the chords (the gantry is live: its prices are read)
  for (const z of [84.4, 119.6]) { const led = new THREE.Mesh(new THREE.BoxGeometry(110, 0.08, 0.08), glowMat(HEX.teal, 1.6)); led.position.set(-95, 14.2, z); g.add(led); }
  const strip = screen(1024, 128, (c, w, h) => {
    c.fillStyle = '#0b1014'; c.fillRect(0, 0, w, h);
    // each figure after its label, at the label's measured end
    const pair = (label: string, fig: string, x: number) => digits(c, fig, digits(c, label, x, 88, 46, '#969ca3', 600, undefined, 2) + 18, 92, 72, '#f6f7f8', 500);
    pair('BNB', bnbA.toFixed(2), 36); pair('USDT', usdtA.toFixed(5), 520);
    c.fillStyle = '#2ec7a6'; c.fillRect(0, h - 6, w, 6);
  }, 1.5);
  for (const x of xs) for (const s2 of [1, -1]) {
    // a screen hung under each portal's beam, one face east and one west, 16 x 2 m
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(16, 2), strip); scr.position.set(x + s2 * 0.22, 12.9, 102); scr.rotation.y = s2 > 0 ? Math.PI / 2 : -Math.PI / 2; g.add(scr);
  }
  for (const x of xs) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 2.4, 16.4), H.graphiteDark); box.position.set(x, 12.9, 102); g.add(box);
    for (const z of [96, 108]) { const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), H.galv); hanger.position.set(x, 14.7, z); g.add(hanger); }
  }
  // the canopy's downlights onto the lane, cool
  for (const x of [-136, -108, -81, -54]) g.add(pool(HEX.pole, 16, 0.12, radialTex(1.6), [x, TRACK_Y + 0.03, 97]));
  return { group: g, towers };
}

/** The garage's glass roof frame: posts round the enclosure and a fine edge truss under the glass at y 18. */
export function buildHangar(L: Layout, H: Hardware) {
  const s = L.stations.find((x) => x.id === 'garage')!, f = s.footprint;
  const b = createBuilder(THREE);
  const ring = roundRect((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2, f.x1 - f.x0, f.z1 - f.z0, f.corner_m, 8) as XZ[];
  const step = 36; let acc = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, c = ring[(i + 1) % ring.length]!, len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    b.beam('truss|graphite', [a[0], 17.6, a[1]], [c[0], 17.6, c[1]], 0.5, 0.7);
    while (acc <= len) { const k = acc / len; b.box('post|graphite', 0.6, 17.6, 0.6, a[0] + (c[0] - a[0]) * k, 8.8, a[1] + (c[1] - a[1]) * k); acc += step; }
    acc -= len;
  }
  const g = b.build({ graphite: H.graphite }).group; g.name = 'hangar';
  return { group: g, ring };
}

