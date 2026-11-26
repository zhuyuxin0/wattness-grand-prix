// R03 · Stewards: one changed number, three red lamps. Desert Willow's leaf as a glass card, its audit path as a
// nine-rung ladder up to the day's root (the real RFC 6962 path from the index's leaf hashes), the five check lamps
// and the Stewards board, in the changed-copy state: arms.C.kw[11] one MW up, the ladder broken at its first rung.
// grid.R03-pass is the same bay checking the sealed copy, as the page shows it before the change: all five lamps teal
// and the climb lit from the leaf to the root (the story's "All five checks pass", before the tamper).
import * as THREE from 'three';
import { createMaterials } from '../../kit/materials';
import { exactColor } from '../../kit/tone';
import type { Vec3 } from '../../lib/stage';
import type { FrameContext, FrameHandle } from '../types';
import { HEX, apron, plinth, track, poleLights, glow, emissive, screen, glassKit, finish, pulse, detail, counted, nightRig, poseFrom, livery, rectOf, boxCorners, fmt, type Footprint } from './venue';
import { line } from './lines';
import { auditPath } from './merkle';
import { keyCard } from './dom';
import { caption, litType } from '../../words';

/** The page's tamper rule (site/src/pages/Stewards/useStewards.ts tamperPlan): one more MW in the selected arm's
 *  busiest hour, the first such hour on a tie. */
export function tamper(kw: readonly number[]) {
  let hour = 0;
  kw.forEach((v, h) => { if (Math.abs(v) > Math.abs(kw[hour]!)) hour = h; });
  return { hour, sealed: kw[hour]!, changed: kw[hour]! + 1000 };
}

/** The page's five checks (site/src/pages/Stewards/verify/run.ts TITLES) and how each reads the changed copy. */
const CHANGED_CHECKS = [
  { id: '01', title: 'The leaf recomputes from the plan', pass: false },
  { id: '02', title: "The proof reaches the day's root", pass: false },
  { id: '03', title: 'The chain holds the same record', pass: true },
  { id: '04', title: 'Sealed before the gate', pass: true },
  { id: '05', title: 'Battery limits hold every hour', pass: false },
];

/** Which copy the bay checks: the changed one (the storyboard's R03) or the sealed one (every check passes). */
export type CopyState = 'changed' | 'sealed';

export async function r03(ctx: FrameContext, state: CopyState = 'changed'): Promise<FrameHandle> {
  const changed = state === 'changed';
  const CHECKS = changed ? CHANGED_CHECKS : CHANGED_CHECKS.map((c) => ({ ...c, pass: true }));
  const { stage } = ctx;
  const d = ctx.needData();
  const L = ctx.layout as any;
  const sd = d.sealed_day, show = d.showcase;
  const fp: Footprint = L.stations.find((s: any) => s.id === 'stewards').footprint;
  const fps = [fp];
  const M = createMaterials(THREE, 'dark');
  const G = glassKit(ctx);
  const root = new THREE.Group(); root.name = 'R03';

  // the real audit path: Desert Willow's leaf in the index's order, folded to the root
  const leaves: string[] = [...d.fleet.batteries].sort((a: any, b: any) => a.i - b.i).map((b: any) => b.leaf);
  const m = show.leaf_position as number;
  if (leaves[m] !== show.leaf) throw new Error('the showcase leaf is not at its index position');
  const proof = await auditPath(leaves, m);
  if (proof.root !== sd.root || proof.fullRoot !== sd.root) throw new Error(`the audit path does not reach the sealed root (${proof.root})`);
  const kw: number[] = show.arms[show.selected_arm].kw;
  const tp = tamper(kw);

  root.add(apron(-1600, 1600, -1600, 1600));
  root.add(plinth(fp, { led: HEX.teal, ledA: 0.55, glow: 0.12 }));
  const mainPts: [number, number][] = L.track.main_world;
  const seg = mainPts.filter((p) => p[0] >= 200 && p[0] <= 400 && p[1] >= -60 && p[1] <= 80);
  const tr = track(seg, fps, { cometSpeed: 24, phase: 11, ledA: 0.4 });
  root.add(tr.group);
  root.add(poleLights(M, seg, fps, { every: 60, from: 30, side: 9, pool: 0.08, poolR: 8 }).group);
  const paint = new THREE.MeshPhysicalMaterial({ color: '#2c3238', roughness: 0.38, metalness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.18 });

  // ── the leaf card: the plan's 24 hours on a lit card behind glass, on a low plinth, facing the bay ────────────
  const CARD = [408, 0.4, 18] as const, cardFace = (231 * Math.PI) / 180;
  const card = new THREE.Group(); card.position.set(CARD[0], 0.12, CARD[2]); card.rotation.y = -cardFace; root.add(card);
  const cplinth = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.4, 2.2).translate(0, 0.2, 0), paint); cplinth.castShadow = true; cplinth.receiveShadow = true; card.add(cplinth);
  const cardHolder = new THREE.Group(); cardHolder.position.set(0, 2.75, 0.1); cardHolder.rotation.x = 0.12; card.add(cardHolder);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(6.4, 4.4, 0.36), paint); frame.castShadow = true; cardHolder.add(frame);
  const maxKw = 150000;
  const cardScr = screen(6, 4, 160, (g, W, H) => {
    g.fillStyle = '#0d1117'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2ec7a6'; g.fillRect(0, 0, 10, H);
    g.fillStyle = '#969ca3'; g.font = `600 ${Math.round(H * 0.07)}px "Libre Franklin Brand", sans-serif`; g.textBaseline = 'alphabetic';
    g.fillText(`${show.resource} · arm ${show.selected_arm} · kW by hour, CT`, W * 0.06, H * 0.12);
    const x0 = W * 0.06, x1 = W * 0.94, y0 = H * 0.56, hh = H * 0.32, bw = (x1 - x0) / 24;
    g.fillStyle = '#2b3036'; g.fillRect(x0, y0, x1 - x0, 2);
    kw.forEach((v, h) => {
      const t = Math.abs(v) / maxKw, bh = Math.max(2, t * hh), x = x0 + h * bw + bw * 0.14;
      g.fillStyle = v > 0 ? '#2ec7a6' : v < 0 ? '#7f9cc0' : '#2b3036';
      if (v !== 0) g.fillRect(x, v > 0 ? y0 - bh : y0 + 2, bw * 0.72, bh);
      if (changed && h === tp.hour) {
        const ch = (Math.abs(tp.changed) / maxKw) * hh;
        g.fillStyle = '#e5534b'; g.fillRect(x - 6, y0 + 2 + ch, bw * 0.72 + 12, 6);
        g.strokeStyle = '#e5534b'; g.lineWidth = 5; g.strokeRect(x - 9, y0 - 6, bw * 0.72 + 18, hh + 20);
      }
    });
    g.font = `500 ${Math.round(H * 0.055)}px SFMono-Regular, Menlo, monospace`; g.fillStyle = '#7d848c';
    for (const h of [0, 6, 12, 18]) g.fillText(String(h).padStart(2, '0'), x0 + h * bw, H * 0.97);
    g.fillStyle = changed ? '#e5534b' : '#2ec7a6'; g.font = `600 ${Math.round(H * 0.07)}px SFMono-Regular, Menlo, monospace`;
    if (changed) g.fillText(`kw[${tp.hour}]  ${fmt.int(tp.sealed).replace('-', '−')} → ${fmt.int(tp.changed).replace('-', '−')}`, W * 0.06, H * 0.23);
    else g.fillText(`sealed copy · leaf ${fmt.short(show.leaf, 4, 4)}`, W * 0.06, H * 0.23);
  });
  cardScr.rotation.y = Math.PI; cardScr.position.z = -0.19; cardHolder.add(cardScr);
  const cardGlass = G.pane(6.1, 4.1, { r: 0.25, rimW: 0.3, tintA: 0.08, refract: 0.03, frost: 0.05 }); cardGlass.position.z = -0.32; cardGlass.rotation.y = Math.PI; cardHolder.add(cardGlass);
  const cardGlow = glow(HEX.teal, 12, 0.18); cardGlow.position.set(CARD[0], 0.14, CARD[2]); root.add(cardGlow);

  // ── the proof ladder, as the page draws it: the leaf at the foot, one level a rung, each rung's node with its
  // sibling joining from the left or the right, the day's root on top. A vertical climb behind the card, facing the bay.
  const LAD = { x: 410.4, z: 15.2, y0: 6.3, dy: 1.3 };
  const ladder = new THREE.Group(); ladder.position.set(LAD.x, 0, LAD.z); ladder.rotation.y = -cardFace; root.add(ladder);
  const steel = new THREE.MeshStandardMaterial({ color: '#59616a', roughness: 0.35, metalness: 0.8 });
  const levelY = (k: number) => LAD.y0 + k * LAD.dy; // k = 0 the first rung (L1)
  const topY = levelY(proof.steps.length) + 0.9;
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, topY - 4.6, 0.16).translate(0, (topY - 4.6) / 2 + 4.6, 0), steel);
    rail.position.set(sx * 3.7, 0, 0.25); rail.castShadow = true; ladder.add(rail);
  }
  const rungs: { c: Vec3; side: 'left' | 'right' }[] = [];
  const local = (x: number, y: number): Vec3 => { const v = new THREE.Vector3(x, y, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), -cardFace); return [LAD.x + v.x, v.y, LAD.z + v.z]; };
  proof.steps.forEach((st, k) => {
    const y = levelY(k), broken = changed && k === 0;
    const sx = st.side === 'left' ? -1 : 1;
    // the rung's bar between the rails, and its node (the hash this level makes)
    const bar = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.12, 0.12), steel); bar.position.set(0, y, 0.25); ladder.add(bar);
    const nodeHex = broken ? HEX.refused : '#4a535d';
    const node = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.78, 0.22), paint); node.position.set(0, y, 0); ladder.add(node);
    const nodeFace = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.6), emissive(broken ? '#5a1f1c' : '#1f2429')); nodeFace.position.set(0, y, -0.115); nodeFace.rotation.y = Math.PI; ladder.add(nodeFace);
    const nodeEdge = line([[-0.85, y - 0.39, -0.12], [0.85, y - 0.39, -0.12], [0.85, y + 0.39, -0.12], [-0.85, y + 0.39, -0.12]] as Vec3[], { color: nodeHex, width: broken ? 2 : 1.2, glow: broken ? 10 : 0, glowA: 0.4, closed: true, reveal: false, renderOrder: 7 });
    ladder.add(nodeEdge);
    // the sibling from the index, unchanged: a steel-blue tile on its side
    const sib = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.66, 0.2), paint); sib.position.set(sx * 2.45, y, 0); ladder.add(sib);
    const sibFace = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 0.5), emissive('#2a3a4f')); sibFace.position.set(sx * 2.45, y, -0.105); sibFace.rotation.y = Math.PI; ladder.add(sibFace);
    ladder.add(line([[sx * 1.7, y, -0.12], [sx * 0.86, y, -0.12]] as Vec3[], { color: '#4c80ba', width: 1.4, reveal: false, renderOrder: 7 }));
    const glassT = G.pane(1.8, 0.86, { r: 0.12, rimW: 0.12, tintA: 0.06, refract: 0.03, frost: 0.05 }); glassT.position.set(0, y, -0.2); glassT.rotation.y = Math.PI; ladder.add(glassT);
    rungs.push({ c: local(sx * 2.45, y), side: st.side });
  });
  if (changed) {
    // the climb between the nodes: red from the changed leaf to the first rung, where it breaks; dark past it
    ladder.add(line([[0, 4.75, -0.12], [0, levelY(0) - 0.39, -0.12]] as Vec3[], { color: HEX.refused, width: 2.4, glow: 10, glowA: 0.35, reveal: false, renderOrder: 7 }));
    for (let k = 0; k < proof.steps.length; k++) {
      const y0 = levelY(k) + 0.39, y1 = k + 1 < proof.steps.length ? levelY(k + 1) - 0.39 : topY + 0.25;
      ladder.add(line([[0, y0, -0.12], [0, y1, -0.12]] as Vec3[], { color: '#3a4148', width: 1.4, dash: 0.18, gap: 0.14, reveal: false, renderOrder: 7 }));
    }
    const brk = glow(HEX.refused, 3.2, 0.45, { flat: false }); brk.position.set(0, levelY(0), -0.3); brk.rotation.y = Math.PI; ladder.add(brk);
  } else {
    // the sealed copy: the climb lit teal from the leaf through every rung to the root, the proof unbroken
    ladder.add(line([[0, 4.75, -0.12], [0, levelY(0) - 0.39, -0.12]] as Vec3[], { color: HEX.teal, width: 2.4, glow: 10, glowA: 0.35, reveal: false, renderOrder: 7 }));
    for (let k = 0; k < proof.steps.length; k++) {
      const y0 = levelY(k) + 0.39, y1 = k + 1 < proof.steps.length ? levelY(k + 1) - 0.39 : topY + 0.25;
      ladder.add(line([[0, y0, -0.12], [0, y1, -0.12]] as Vec3[], { color: HEX.teal, width: 2.0, glow: 8, glowA: 0.3, reveal: false, renderOrder: 7 }));
    }
  }
  // the root plate: the day's root in gold glass on top of the climb, unchanged on chain
  const E: Vec3 = local(0, topY + 2.1);
  const rootGrp = new THREE.Group(); rootGrp.position.set(0, topY + 2.1, 0); ladder.add(rootGrp);
  const rootDisc = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), emissive('#3d300b')); rootDisc.rotation.y = Math.PI; rootDisc.position.z = 0.05; rootGrp.add(rootDisc);
  const rootGlass = G.pane(3.6, 3.6, { r: 1.8, rimW: 0.45, tint: HEX.bnb, tintA: 0.22, refract: 0.05, frost: 0.2 }); rootGlass.rotation.y = Math.PI; rootGrp.add(rootGlass);
  rootGrp.add(line(Array.from({ length: 65 }, (_, k) => { const a = (k / 64) * Math.PI * 2; return [Math.cos(a) * 1.85, Math.sin(a) * 1.85, -0.06] as Vec3; }), { color: HEX.bnb, width: 2, glow: 8, glowA: 0.45, closed: true, reveal: false, renderOrder: 7 }));
  const rootHalo = glow(HEX.bnb, 5.2, 0.09, { flat: false }); rootHalo.rotation.y = Math.PI; rootHalo.position.z = -0.1; rootGrp.add(rootHalo);

  // ── the lamp wall at the bay's east side, facing west: five check lamps and the Stewards board above them ─────
  const WALL = { x: 456, z0: -16, z1: 24 }; // the lamps sit from z -4 to 24, clear of the card from the bay
  // lowered from 16.5 m to 13 m with the board brought down to it: the wall was a black mass over the bay
  const wallPaint = new THREE.MeshPhysicalMaterial({ color: '#3a4148', roughness: 0.42, metalness: 0.25, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1.4, 13, WALL.z1 - WALL.z0 + 6).translate(0, 6.5, 0), wallPaint);
  wall.position.set(WALL.x + 0.7, 0.12, (WALL.z0 + WALL.z1) / 2); wall.castShadow = true; wall.receiveShadow = true; root.add(wall);
  const wallTop = line([[WALL.x - 0.02, 13.1, WALL.z0 - 3], [WALL.x - 0.02, 13.1, WALL.z1 + 3]] as Vec3[], { color: HEX.teal, width: 1.4, glow: 6, glowA: 0.25, opacity: 0.7, reveal: false, renderOrder: 5 });
  wallTop.userData.noAO = true; root.add(wallTop);
  const lampZ = [-4, 3, 10, 17, 24];
  CHECKS.forEach((c, i) => {
    const hex = c.pass ? HEX.teal : HEX.refused, z = lampZ[i]!, y = 3.6;
    const g = new THREE.Group(); g.position.set(WALL.x - 0.02, y, z); g.rotation.y = Math.PI / 2; root.add(g);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.5, 64).rotateX(Math.PI / 2), paint); ring.position.z = 0.25; g.add(ring);
    const face = new THREE.Mesh(new THREE.CircleGeometry(1.2, 64), emissive(hex)); face.rotation.y = Math.PI; face.position.z = -0.02; g.add(face);
    const lens = G.pane(2.6, 2.6, { r: 1.3, rimW: 0.3, tintA: 0.05, refract: 0.04, frost: 0.05 }); lens.rotation.y = Math.PI; lens.position.z = -0.08; g.add(lens);
    const halo = glow(hex, 3.5, 0.16, { flat: false }); halo.rotation.y = Math.PI; halo.position.z = -0.15; g.add(halo);
    const pool = glow(hex, 5, 0.08); pool.position.set(WALL.x - 3, 0.14, z); root.add(pool);
    const lamp = counted(new THREE.PointLight(exactColor(THREE, hex), 3, 8, 2)); lamp.position.set(WALL.x - 1.6, y, z); root.add(lamp);
  });
  const board = screen(10, 6, 110, (g, W, H) => {
    g.fillStyle = '#0d1117'; g.fillRect(0, 0, W, H);
    g.textBaseline = 'middle';
    // the header whole, at one size in both states: fitted to the rows' width by the changed copy's, the longer
    const head = (copy: string) => `STEWARDS · ${show.resource} · BSC MAINNET · ${copy} COPY`;
    const headFont = (px: number) => `600 ${px}px "Libre Franklin Brand", sans-serif`;
    let headPx = Math.round(H * 0.055);
    g.font = headFont(headPx);
    const headW = g.measureText(head('CHANGED')).width;
    if (headW > W * 0.9) { headPx = Math.floor((headPx * W * 0.9) / headW); g.font = headFont(headPx); }
    g.fillStyle = '#969ca3';
    g.fillText(head(changed ? 'CHANGED' : 'SEALED'), W * 0.05, H * 0.09);
    CHECKS.forEach((c, i) => {
      const y = H * (0.22 + i * 0.13);
      g.fillStyle = '#1f2429'; g.fillRect(W * 0.05, y - H * 0.05, W * 0.9, H * 0.1);
      g.fillStyle = c.pass ? '#2ec7a6' : '#e5534b'; g.fillRect(W * 0.05, y - H * 0.05, 8, H * 0.1);
      g.fillStyle = '#e6e8ea'; g.font = `500 ${Math.round(H * 0.052)}px "Libre Franklin Brand", sans-serif`; g.fillText(`${c.id}  ${c.title}`, W * 0.08, y);
      g.fillStyle = c.pass ? '#2ec7a6' : '#e5534b'; g.font = `600 ${Math.round(H * 0.05)}px SFMono-Regular, Menlo, monospace`; g.textAlign = 'right';
      g.fillText(c.pass ? 'PASS' : 'FAIL', W * 0.93, y); g.textAlign = 'left';
    });
    g.fillStyle = changed ? '#e5534b' : '#2ec7a6'; g.font = `600 ${Math.round(H * 0.06)}px "Libre Franklin Brand", sans-serif`;
    g.fillText(changed ? `${CHECKS.filter((c) => !c.pass).length} of 5 fail` : `${CHECKS.filter((c) => c.pass).length} of 5 pass`, W * 0.05, H * 0.9);
  });
  board.position.set(WALL.x - 0.03, 9.1, 4); board.rotation.y = -Math.PI / 2; root.add(board);
  const boardGlass = G.pane(10.4, 6.4, { r: 0.3, rimW: 0.3, tintA: 0.06, refract: 0.02, frost: 0.04 }); boardGlass.position.set(WALL.x - 0.25, 9.1, 4); boardGlass.rotation.y = -Math.PI / 2; root.add(boardGlass);

  finish(ctx, root, M);
  nightRig(stage, [120, 420]);
  stage.setFade({ center: [0.5, 0.5], screen: [3, 4], world: [500, 900], worldCenter: [420, 10] });
  stage.setAO({ radius: 0.55, scale: 1.1, thickness: 1.0, samples: 16 });
  stage.setKey({ az: 200, el: 38, center: [425, 6, 10], radius: 45, rimAz: 20 });
  stage.setShadowAuto(true);
  const cam = poseFrom([373.7, 6.1, 45.7], [422, 10.5, 2], 36, [0, 0]);

  const path = `the audit path is RFC 6962 over the ${leaves.length} leaf hashes of frame-data.json fleet.batteries in index order, for Desert Willow at index ${m} (position ${m + 1} of ${leaves.length}): ${proof.steps.length} steps, sides ${proof.steps.map((s) => s.side[0]).join('')}, folding to ${proof.root}, the sealed root.`;
  return {
    time: 2.0,
    note: changed
      ? `Real: ${path} The changed value is the page's tamper rule on showcase.arms.${show.selected_arm}.kw: hour ${tp.hour} (${tp.hour}:00 to ${tp.hour + 1}:00 CT), ${tp.sealed} to ${tp.changed} kW. The lamps' states follow the Stewards page's own words for a changed copy ("checks 03 and 04 still pass; the leaf, the proof and the energy balance do not": 01, 02 and 05 fail); this still does not run the verifier. Illustrative: the bay's architecture, the rails and lights.`
      : `Real: ${path} The card is the sealed plan as sealed (showcase.arms.${show.selected_arm}.kw, leaf ${show.leaf}). The five lamps show the page's checks on the sealed copy, all passing, as the page reads it before any change ("${CHECKS.length} of ${CHECKS.length} checks pass"); this still does not run the verifier. Illustrative: the bay's architecture, the rails and lights.`,
    update(t) { stage.setCamera(cam); detail(ctx, M); pulse(root, t); },
    decorate() {
      const p = ctx.plates;
      litType(ctx);
      const cap = caption(ctx, { head: 'Anyone can check any plan', flavor: 'stewards', line: changed ? 'In a browser, against the chain: one changed number fails three checks.' : 'In a browser, against the chain: the sealed copy passes all five checks.' });
      const scope = p.scope(changed ? 'The record on chain is untouched, so 03 and 04 still pass.' : `The sealed copy: its ${proof.steps.length} hashes climb from the leaf to the root on chain.`);
      const fails = CHECKS.filter((c) => !c.pass).length;
      const k = keyCard(ctx, CHECKS.map((c) => ({ swatches: [c.pass ? HEX.teal : HEX.refused], text: `${c.id} ${c.title}` })), { title: changed ? `${fails} of 5 fail: the changed copy is not the sealed plan` : `${CHECKS.length - fails} of 5 pass: this is the sealed plan` });
      p.ticks('lamps', CHECKS.map((c, i) => ({ at: [WALL.x - 0.2, 1.35, lampZ[i]!] as Vec3, text: c.id, align: 'below' as const })), 'hwalk-tick');
      p.ticks('rungs', proof.steps.map((s, i) => ({ at: local(3.95, levelY(i)), text: changed && i === 0 ? `L1 · sibling ${fmt.short(s.sibling, 4, 4)} · breaks here` : `L${i + 1} · ${fmt.short(s.sibling, 4, 4)}`, align: 'left' as const })), 'hwalk-tick');
      const boardBox = rectOf(ctx, boxCorners([WALL.x, 9.1, 4], [0.3, 3.2, 5.2], 0), 8);
      const lampsBox = rectOf(ctx, boxCorners([WALL.x, 3.2, 4], [0.3, 2.6, 18], 0), 10);
      const ladderBox = rectOf(ctx, [local(-3.8, 4.6), local(3.8, 4.6), local(-3.8, topY + 4.0), local(3.8, topY + 4.0)], 6);
      const cardBox = rectOf(ctx, boxCorners([CARD[0], 2.87, CARD[2]], [3.3, 2.3, 0.3], -cardFace), 8);
      // the rung ticks are a separate layer: keep the leaders' plates off their column (the ticks end at the rail)
      const tickTop = p.project(local(3.95, levelY(proof.steps.length - 1))), tickFoot = p.project(local(3.95, levelY(0)));
      // the card's plate hangs off its left edge as seen, into the open ground beside it, not over its header
      const cardEdge = boxCorners([CARD[0], 2.6, CARD[2]], [3.2, 0, 0.2], -cardFace).reduce((a, c) => ((p.project(c)?.x ?? Infinity) < (p.project(a)?.x ?? Infinity) ? c : a));
      const ticksBox = tickTop && tickFoot ? { x: tickFoot.x - 300, y: tickTop.y - 14, w: 300, h: tickFoot.y - tickTop.y + 28 } : null;
      const texts = {
        card: `${show.name} · leaf ${m + 1} of ${leaves.length} · ${fmt.short(show.leaf, 4, 4)}`,
        tamper: `Changed copy: arms.${show.selected_arm}.kw[${tp.hour}] ${fmt.int(tp.sealed).replace('-', '−')} → ${fmt.int(tp.changed).replace('-', '−')} kW`,
        rootp: changed ? `Root ${fmt.short(sd.root)} · on chain, unchanged` : `Root ${fmt.short(sd.root)} · recomputed: match`,
      };
      p.leaders([
        { id: 'card', text: texts.card, at: cardEdge, priority: 0 },
        ...(changed ? [{ id: 'tamper', text: texts.tamper, at: [CARD[0] - 1.0, 2.4, CARD[2] + 0.4] as Vec3, priority: 1 }] : []),
        { id: 'root', text: texts.rootp, at: [E[0], E[1] + 1.9, E[2]], priority: 2 },
      ], { keepOut: [k, lampsBox, ...(ticksBox ? [ticksBox] : []), ...(scope ? [scope] : []), ...(cap ? [cap] : [])], avoid: [cardBox, boardBox, ladderBox], max: 4 });
      livery(ctx, changed ? { [texts.card]: 'live', [texts.tamper]: 'refused', [texts.rootp]: 'sealed' } : { [texts.card]: 'live', [texts.rootp]: 'sealed' });
    },
  };
}
