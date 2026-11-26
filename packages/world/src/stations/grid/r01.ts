// R01 · Starting grid: Desert Willow on pole. The 316 sealed plans as columns on the start straight, four abreast in
// 79 staggered rows, tallest behind the pole; heights are each leaf's planned discharge, caps its selected arm.
import * as THREE from 'three';
import { createMaterials } from '../../kit/materials';
import { makeColumn, COL_R } from '../../kit/hedge/fields';
import { line, lines } from './lines';
import { lin } from '../../kit/region/geo';
import { exactColor } from '../../kit/tone';
import { radialTex } from '../../kit/textures';
import type { Vec3 } from '../../lib/stage';
import type { FrameContext, FrameHandle } from '../types';
import { caption } from '../../words';
import { HEX, apron, plinth, track, poleLights, glow, finish, pulse, detail, counted, nightRig, poseFrom, fmt, type Footprint } from './venue';
import { columnMaterial, columns, pools, rampHex, RAMP_CSS, type ColumnSpec } from './columns';
import { keyCard } from './dom';
import ring from './ercot-ring.json';

interface Battery { i: number; resource: string; hub: string; settlement_point: string; selected_arm: string; planned_discharge_mwh: number; power_mw: number; energy_mwh: number }

/** The site's gridOrder: the showcase on pole, then planned discharge, most first, ties by resource. */
export function gridOrder(bs: readonly Battery[], showcase: string) {
  const rest = bs.filter((b) => b.resource !== showcase).sort((a, b) => b.planned_discharge_mwh - a.planned_discharge_mwh || a.resource.localeCompare(b.resource));
  const pole = bs.find((b) => b.resource === showcase);
  return pole ? [pole, ...rest] : rest;
}

export async function r01(ctx: FrameContext): Promise<FrameHandle> {
  const { stage } = ctx;
  const d = ctx.needData();
  const L = ctx.layout as any;
  const G = L.grid, st = (id: string) => L.stations.find((s: any) => s.id === id);
  const ercotFp: Footprint = st('starting-grid').footprint;
  const fps = [ercotFp];
  const M = createMaterials(THREE, 'dark');
  const root = new THREE.Group(); root.name = 'R01';

  const bs: Battery[] = d.fleet.batteries;
  const show = d.showcase;
  const order = gridOrder(bs, show.resource);
  const maxD = Math.max(...bs.map((b) => b.planned_discharge_mwh));
  const slot = (i: number) => {
    const row = Math.floor(i / G.abreast), lane = i % G.abreast;
    return { x: G.front_row_x - G.row_pitch_m * row - G.stagger_m * (lane % 2), z: G.track_z + G.lane_z_offsets[lane] };
  };
  const heightOf = (mwh: number) => 0.3 + 9.7 * (mwh / maxD);

  // ── the venue round the straight ─────────────────────────────────────────────────────────────────────────
  root.add(apron(-1600, 1600, -1600, 1600));
  root.add(plinth(ercotFp, { led: HEX.teal, ledA: 0.5, glow: 0.12 }));
  const main: [number, number][] = L.track.main_world;
  const straight = main.filter((p) => p[1] === -196 && p[0] <= -150);
  const tr = track(straight, fps, { cometSpeed: 30, phase: 7 });
  root.add(tr.group);
  // the poles stand on the straight's far half only, so none cuts across the front rows from this view
  const pl = poleLights(M, straight.filter((p) => p[0] <= -350), fps, { every: 60, from: 2, side: 8.8, pool: 0.1, poolR: 8, one: -1 });
  root.add(pl.group);

  // the faint map under the grid (layout.texas: 1 m of venue is 10.3 km of Texas), with Desert Willow's point
  const mapY = (x: number, z: number) => (x < ercotFp.x1 - 0.35 && x > ercotFp.x0 + 0.35 && z > ercotFp.z0 + 0.35 && z < ercotFp.z1 - 0.35 ? 0.135 : 0.02);
  const texas = (ring as { rings: number[][][] }).rings.map((r) => r.map(([x, z]) => [x, mapY(x!, z!), z] as Vec3));
  root.add(lines(texas, { color: HEX.teal, width: 1.3, opacity: 0.2, reveal: false, renderOrder: 3 }));
  const dw: [number, number] = L.showcase_on_texas;
  const dwDot = glow(HEX.teal, 2.6, 0.55); dwDot.position.set(dw[0], 0.15, dw[1]); root.add(dwDot);

  // ── the grid: 315 columns in the walkthrough's bar shading, the pole the walkthrough's own column ──────────────
  const key = new THREE.Vector3();
  const colMat = columnMaterial({ fogR: [70, 300], fogK: 0.5 });
  const capMat = columnMaterial({ fogR: [70, 300], fogK: 0.45, edge: 0.82 });
  const bodies: ColumnSpec[] = [], caps: ColumnSpec[] = [];
  order.forEach((b, i) => {
    if (i === 0) return;
    const p = slot(i), h = heightOf(b.planned_discharge_mwh);
    bodies.push({ x: p.x, z: p.z, w: 1.5, d: 1.2, h, color: rampHex(Math.sqrt(b.planned_discharge_mwh / maxD)) });
    caps.push({ x: p.x, z: p.z, y: h, w: 1.5, d: 1.2, h: 0.12, color: b.selected_arm === 'B' ? HEX.armB : HEX.armC, glow: 0.6 });
  });
  root.add(columns(bodies, colMat), columns(caps, capMat, { shadow: false }));
  root.add(pools(bodies.map((b) => ({ x: b.x, z: b.z, r: 1.9, color: b.color })), 0.16));

  const pole = order[0]!, P = slot(0), poleH = heightOf(pole.planned_discharge_mwh);
  const col = makeColumn('dark');
  const r = 0.62 / COL_R; // the column's radius to the slot's 1.5 x 1.2 footprint
  col.body.scale.y = poleH; col.group.scale.set(r, 1, r); col.group.position.set(P.x, 0.12, P.z); col.group.visible = true;
  col.pad.visible = false;
  (col.body.material as THREE.MeshStandardMaterial).color.set('#9fb0c2');
  root.add(col.group);
  const poleCap = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 48).translate(0, 0.06, 0), new THREE.MeshBasicMaterial({ color: lin(HEX.teal) }));
  poleCap.position.set(P.x, 0.12 + poleH, P.z); root.add(poleCap);
  // its halo: the teal wash on the deck round it and a lamp at its foot that lights the column itself
  const halo = glow(HEX.teal, 7.5, 0.55); halo.position.set(P.x, 0.14, P.z); root.add(halo);
  const haloWide = glow(HEX.teal, 16, 0.16); haloWide.position.set(P.x, 0.14, P.z); root.add(haloWide);
  const lamp = counted(new THREE.PointLight(exactColor(THREE, '#5fe0c4'), 30, 18, 2));
  lamp.position.set(P.x + 3.4, poleH * 0.62, P.z + 2.6); root.add(lamp);
  const box = [[-0.95, -0.8], [0.95, -0.8], [0.95, 0.8], [-0.95, 0.8]].map(([a, b]) => [P.x + a!, 0.15, P.z + b!] as Vec3);
  root.add(line(box, { color: HEX.teal, width: 1.6, glow: 6, glowA: 0.35, closed: true, reveal: false, renderOrder: 5 }));

  // slot marks painted on the deck: each box's front edge and two short side marks (the site's grid boxes)
  const marks: Vec3[][] = order.map((_, i) => {
    const p = slot(i), xf = p.x + 1.05, y = 0.14;
    return [[xf - 0.7, y, p.z - 0.85], [xf, y, p.z - 0.85], [xf, y, p.z + 0.85], [xf - 0.7, y, p.z + 0.85]];
  });
  root.add(lines(marks, { color: '#6a727b', width: 1, opacity: 0.8, reveal: false, renderOrder: 3, caps: false }));

  // position numbers painted ahead of each box, reading from the front of the grid
  {
    const cw = 64, ch = 48, size = 1024, cols = size / cw;
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const g = c.getContext('2d')!;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    order.forEach((_, i) => {
      g.font = `600 ${i === 0 ? 34 : 30}px "Libre Franklin Brand", sans-serif`;
      g.fillStyle = i === 0 ? '#bdf4e6' : '#7d848c';
      g.fillText(String(i + 1), (i % cols) * cw + cw / 2, Math.floor(i / cols) * ch + ch / 2 + 2);
    });
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    order.forEach((_, i) => {
      const p = slot(i), cx = p.x + 1.75, cz = p.z, w = 0.95, h = w * (ch / cw);
      // text up runs west (-x), text right runs north (-z): upright from the front of the grid
      const corners: [number, number][] = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
      for (const [a, b] of corners) pos.push(cx - b, 0.142, cz - a);
      const u0 = ((i % cols) * cw) / size, u1 = (((i % cols) + 1) * cw) / size;
      const v1 = 1 - (Math.floor(i / cols) * ch) / size, v0 = 1 - ((Math.floor(i / cols) + 1) * ch) / size;
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      const o = i * 4; idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.renderOrder = 2; m.userData.noAO = true; m.userData.overlay = true; root.add(m);
  }

  // the start line: two rows of fine checker across the track, graphite and #2b3036
  {
    const n = 24, w = 12 / n, xs = G.front_row_x + 3.4;
    const geo = new THREE.PlaneGeometry(w, w).rotateX(-Math.PI / 2);
    const mk = (hex: string) => new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: lin(hex) }), n);
    const a = mk('#3a4148'), b = mk('#1f2429'); let ka = 0, kb = 0;
    const m4 = new THREE.Matrix4();
    for (let row = 0; row < 2; row++) for (let k = 0; k < n; k++) {
      m4.makeTranslation(xs + (row - 0.5) * w, 0.141, G.track_z - 6 + w * (k + 0.5));
      if ((k + row) % 2) a.setMatrixAt(ka++, m4); else b.setMatrixAt(kb++, m4);
    }
    a.count = ka; b.count = kb;
    for (const m of [a, b]) { m.userData.noAO = true; m.renderOrder = 1; root.add(m); }
  }

  // the lock line waiting behind the back row: a BNB-yellow hairline on the deck and its sheet of light
  const xl = G.back_row_x - 2.6;
  {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 12.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(HEX.bnb), toneMapped: false }));
    bar.position.set(xl, 0.15, G.track_z); bar.userData.overlay = true; bar.userData.noAO = true; root.add(bar);
    const sheet = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: lin(HEX.bnb).clone() }, uA: { value: 0.85 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uA; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 2.4) * (1.0 - pow(abs(vUv.x - 0.5) * 2.0, 6.0)); gl_FragColor = vec4(uColor * a * uA, 1.0); }',
    });
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 5.2).translate(0, 2.6, 0), sheet);
    curtain.rotation.y = Math.PI / 2; curtain.position.set(xl, 0.12, G.track_z); curtain.renderOrder = 6; curtain.userData.overlay = true; curtain.userData.noAO = true;
    root.add(curtain);
    const pool = glow(HEX.bnb, 16, 0.22); pool.position.set(xl + 1, 0.14, G.track_z); root.add(pool);
  }

  finish(ctx, root, M);
  nightRig(stage, [70, 330]);
  stage.setFade({ center: [0.5, 0.5], screen: [3, 4], world: [500, 900], worldCenter: [-240, -196] });
  stage.setAO({ radius: 0.6, scale: 1.1, thickness: 1.0, samples: 16 });
  const keyAz = 40, keyEl = 36;
  stage.setKey({ az: keyAz, el: keyEl, center: [-330, 2, -196], radius: 80, rimAz: 300 });
  stage.setShadowAuto(true);
  const a = (keyAz * Math.PI) / 180, e = (keyEl * Math.PI) / 180;
  key.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
  for (const m of [colMat, capMat]) m.uniforms.uKey.value.copy(key);

  // raised from the storyboard's 2.8 m to 19 m so the caps (the plan's arm) read from above and the grid, not the
// sky, fills the frame
  const cam = poseFrom([-224, 19, -168], [-302, 0, -205], 32, [0.03, 0.0]);
  const T = d.fleet.totals, counts = d.fleet.selected_arm_counts;
  const hubs = Object.keys(d.fleet.hub_counts).length;
  const sps = new Set(bs.map((b) => b.settlement_point)).size;
  const mwhPole = Math.round(pole.planned_discharge_mwh);

  return {
    time: 4.2,
    note: `Real: all 316 columns are the sealed leaves in frame-data.json fleet.batteries, in the site's gridOrder (the showcase on pole, then planned discharge of the selected arm, most first, ties by resource) on layout.grid's slot rule; height 0.3 + 9.7 x planned discharge / ${fmt.int(maxD)} MWh (the fleet's largest), body color the site's discharge ramp at its square root (its top stop held at #7fe6cf, so the tallest stay teal when lit), cap the selected arm (C ${counts.C}, B ${counts.B}). The pole is Desert Willow, drawn as the Hedging walkthrough's own column (${poleH.toFixed(2)} m for ${pole.planned_discharge_mwh} MWh): a presentation choice, not a rank. Figures: fleet.totals and fleet.hub_counts; ${sps} settlement points counted from the leaves. The Texas outline is HIFLD's ERCOT region (the Terminal intro's file) on layout.texas's scale. Illustrative: the venue's surfaces, pole lights and comets; the lock line is shown waiting, before its sweep (motion, not run in this still).`,
    update(t) {
      stage.setCamera(cam);
      detail(ctx, M);
      pulse(root, t);
    },
    decorate() {
      const p = ctx.plates;
      caption(ctx, { head: 'Every battery, planned for tomorrow', flavor: 'starting grid', line: `One column a plan, its height the planned discharge. In front, the showcase: ${show.name}.` });
      const scope = p.scope(`Sealed day Nov 26, 2026: ${d.sealed_day.leaf_count} leaves under root ${fmt.short(d.sealed_day.root)}. Shadow plans from public data; heights are planned discharge, not results.`);
      const k = keyCard(ctx, [
        { text: `${d.fleet.count} plans · ${fmt.int(T.planned_discharge_mwh)} MWh planned discharge · ${sps} settlement points · ${hubs} hubs`, strong: true },
        { ramp: RAMP_CSS, text: 'Height: planned discharge' },
        { swatches: [HEX.armC, HEX.armB], text: `Cap: the plan's arm · C chosen together: ${counts.C} · B: ${counts.B}` },
      ]);
      const top: Vec3 = [P.x, 0.12 + poleH + 0.1, P.z];
      p.leaders([
        { id: 'pole', text: `Showcase: ${show.name} (${show.resource}) · ${mwhPole} MWh planned`, sub: `${show.settlement_point} · ${show.hub} · ${show.power_mw} MW / ${show.energy_mwh} MWh`, at: top, priority: 0 },
        { id: 'lock', text: 'The seal line, behind the last row', at: [xl, 2.4, G.track_z], priority: 2 },
      ], { keepOut: [k, ...(scope ? [scope] : [])] });
    },
  };
}
