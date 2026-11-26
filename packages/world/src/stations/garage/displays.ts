// @ts-nocheck
// The agents' screens. Each bay's floor is its screen: a dark glass slab over most of the plinth, rimmed in teal (the
// Planner's in BNB yellow), with the agent's own output laid on it as DOM (panels.ts on screen.ts's quads), read from
// above. The Planner's three plans also stand at the bay's track edge as three boards facing the back straight, read
// from the pit lane. The slabs and boards are 3D (they take light and cast shadow); every word and mark on them is DOM.
import * as THREE from 'three';
import { createBuilder } from '../../kit/geo';
import { exactColor } from '../../kit/tone';
import { radialTex } from '../../kit/textures';
import { line } from '../../kit/region/flows';
import { PLINTH, COLORS, stationById } from './hangar';
import { onQuad, screenStyles } from './screen';
import { BAYS, forecastHtml, stateHtml, inputsHtml, hedgeHtml, riskHtml, planHtml, boardHtml } from './panels';

const overlay = (o) => { o.traverse((c) => { c.userData.overlay = true; c.userData.noAO = true; }); return o; };
const HTML = { 'race-day-forecast': forecastHtml, 'fuel-and-wear': stateHtml, spotter: inputsHtml, setup: hedgeHtml, 'risk-desk': riskHtml, 'pit-wall': planHtml };
const TOP = new Set(['race-day-forecast', 'fuel-and-wear', 'spotter']);

/** The floor screens' rectangles: inside each bay's plinth, clear of the track edge's heroes (the north edge). */
export function floorRect(layout, bay) {
  const fp = stationById(layout, bay).footprint;
  return TOP.has(bay) ? { x0: fp.x0 + 5, x1: fp.x1 - 5, zN: fp.z0 + 11, zS: fp.z1 - 5 } : { x0: fp.x0 + 5, x1: fp.x1 - 5, zN: fp.z0 + 12, zS: fp.z1 - 4 };
}

export function buildDisplays(ctx, d, M) {
  const layout = ctx.layout;
  const group = new THREE.Group(); group.name = 'agentScreens';
  screenStyles();
  const B = createBuilder(THREE);
  const yTop = PLINTH.y + 0.14;
  const slabMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#0b1115'), roughness: 0.2, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 });
  /** The screens' dark glass seen low across the floor, where it mirrors the hall's light back as white (G02's lower
   *  right, the dive's last second): its reflection of the room at its own strength, not the stage's, and optionally
   *  satin. From above, where the screens are read, their DOM covers it. */
  const lowGlass = ({ env = 0.06, satin = false } = {}) => {
    slabMat.envMap = ctx.stage.scene.environment; slabMat.envMapIntensity = env;
    if (satin) { slabMat.roughness = 0.45; slabMat.clearcoatRoughness = 0.38; }
    slabMat.needsUpdate = true;
  };
  const spillTex = radialTex(THREE);
  const screens = [];
  for (const bay of Object.keys(BAYS)) {
    const r = floorRect(layout, bay), w = r.x1 - r.x0, dz = r.zS - r.zN, cx = (r.x0 + r.x1) / 2, cz = (r.zN + r.zS) / 2;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, dz), slabMat);
    slab.position.set(cx, PLINTH.y + 0.07, cz); slab.receiveShadow = true; slab.name = `slab:${bay}`;
    group.add(slab);
    const gold = !!BAYS[bay].gold, hex = gold ? COLORS.gold : COLORS.teal;
    group.add(overlay(line([[r.x0 - 0.5, yTop + 0.01, r.zN - 0.5], [r.x1 + 0.5, yTop + 0.01, r.zN - 0.5], [r.x1 + 0.5, yTop + 0.01, r.zS + 0.5], [r.x0 - 0.5, yTop + 0.01, r.zS + 0.5]],
      { color: hex, width: gold ? 2.6 : 1.8, glow: gold ? 14 : 9, glowA: 0.45, closed: true, renderOrder: 6 })));
    // the screen's own light on the plinth round it
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.25, dz * 1.7).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: exactColor(THREE, gold ? '#5c4a12' : '#164a42'), alphaMap: spillTex, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    spill.position.set(cx, PLINTH.y + 0.02, cz); spill.renderOrder = 2; group.add(overlay(spill));
    const W = 1200, H = Math.round((1200 * dz) / w);
    const el = document.createElement('div'); el.className = `gx-screen${gold ? ' gold' : ''}`; el.dataset.bay = bay;
    el.innerHTML = HTML[bay](d, W, H);
    ctx.overlay.appendChild(el);
    screens.push({ bay, el, W, H, corners: [[r.x0, yTop, r.zN], [r.x1, yTop, r.zN], [r.x1, yTop, r.zS], [r.x0, yTop, r.zS]], center: [cx, yTop, cz], floor: true });
  }

  // the Planner's three boards at the pit wall's track edge, each on its own stand, turned toward the lane's approach
  const pw = stationById(layout, 'pit-wall').footprint;
  const BW = 25, BH = 14, y0 = 1.7, turn = 22, zLine = pw.z0 + 8;
  const boards = {};
  // C, the sealed plan, nearest the lane's approach from the west; read from across the lane they run A, B, C
  ['C', 'B', 'A'].forEach((arm, i) => {
    const g = new THREE.Group(); g.name = `board${arm}`;
    g.position.set(pw.x0 + 30 + i * 30, 0, zLine); g.rotation.y = (turn * Math.PI) / 180;
    const Bb = createBuilder(THREE);
    Bb.box('frame|dark', BW + 0.8, BH + 0.8, 0.5, 0, y0 + BH / 2, 0.3, { c: 0.05 });
    for (const s of [-1, 1]) Bb.box('frame|steel', 0.4, y0 + 0.3, 0.4, s * (BW / 2 - 2), (y0 + 0.3) / 2 + PLINTH.y, 0.35);
    Bb.box('frame|steel', BW * 0.5, 0.16, 1.3, 0, PLINTH.y + 0.08, 0.35);
    g.add(Bb.build(M.m, { shadows: true }).group);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial({ color: exactColor(THREE, '#0e1418') }));
    face.position.set(0, y0 + BH / 2, 0.03); face.rotation.y = Math.PI; face.userData.noAO = true; g.add(face);
    const sel = d.showcase.selected_arm === arm;
    g.add(overlay(line([[-BW / 2 - 0.15, y0 - 0.15, -0.02], [BW / 2 + 0.15, y0 - 0.15, -0.02], [BW / 2 + 0.15, y0 + BH + 0.15, -0.02], [-BW / 2 - 0.15, y0 + BH + 0.15, -0.02]],
      { color: sel ? COLORS.gold : '#59636c', width: sel ? 2.6 : 1.4, glow: sel ? 12 : 0, glowA: 0.45, closed: true, renderOrder: 8 })));
    g.updateMatrixWorld(true);
    const w = (x, y, z) => { const v = new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld); return [v.x, v.y, v.z]; };
    // seen from the front (local -z), the viewer's left is local +x
    const corners = [w(BW / 2, y0 + BH, -0.05), w(-BW / 2, y0 + BH, -0.05), w(-BW / 2, y0, -0.05), w(BW / 2, y0, -0.05)];
    const el = document.createElement('div'); el.className = `gx-screen${sel ? ' gold' : ''}`; el.dataset.board = arm;
    el.innerHTML = boardHtml(d, arm);
    ctx.overlay.appendChild(el);
    screens.push({ bay: `board${arm}`, el, W: 900, H: 504, corners, center: w(0, y0 + BH / 2, 0), floor: false });
    boards[arm] = { top: w(0, y0 + BH + 0.6, 0), face: w(0, y0 + BH / 2, -0.1), foot: w(0, y0 - 0.4, -0.5) };
    group.add(g);
  });

  const anchors = {};
  for (const s of screens) if (s.floor) {
    const r = floorRect(layout, s.bay);
    anchors[s.bay] = { west: [r.x0, yTop, (r.zN + r.zS) / 2], north: [(r.x0 + r.x1) / 2, yTop, r.zN], center: s.center };
  }
  return {
    group, screens, boards, anchors, lowGlass,
    /** Lay the screens on their quads for the posed camera, the farthest first so nearer ones draw over them. which:
     *  'floor', 'boards' or 'all'. Returns the shown screens' boxes, for keeping plates off them. */
    place(camera, project, which = 'all', opts = {}) {
      const pos = camera.position, rects = [];
      const order = screens.slice().sort((a, b) => Math.hypot(b.center[0] - pos.x, b.center[2] - pos.z) - Math.hypot(a.center[0] - pos.x, a.center[2] - pos.z));
      for (const s of order) {
        const want = which === 'all' || (which === 'floor' && s.floor) || (which === 'boards' && !s.floor);
        if (!want) { s.el.style.display = 'none'; continue; }
        ctx.overlay.appendChild(s.el);
        // a floor read from beyond its top edge is hidden, never shown upside down
        const r = onQuad(s.el, s.W, s.H, s.corners, project, s.floor ? { ...opts, upright: true } : opts);
        if (r) rects.push({ ...r, bay: s.bay });
      }
      return rects;
    },
  };
}
