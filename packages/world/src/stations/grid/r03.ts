// R03 · Stewards: the proof that Desert Willow's plan belongs to the day's sealed record. The glass card is the plan
// (its leaf), the nine rungs are the steps from it to the record (its RFC 6962 audit path, from the index's leaf
// hashes), and the gold coin on top is that record: the day's root, sealed on BNB Chain, with BNB Chain's symbol on its
// face. The five check lamps on their numbered plates carry the Verify page's board over them (venue/board.ts, the one
// the films' split screen carries). grid.R03-pass is the sealed copy, as the page shows it before any change: all five
// lamps teal and the climb lit from the card to the coin (the story's "Anyone can check any plan"). grid.R03 is the
// changed copy (arms.C.kw[11] one MW up), which starts on its own clock as the sealed bay and plays the failure in
// (REVEAL): the card's hour turns red, the climb turns red up to the first rung and breaks there, the light above it
// goes out up to the coin, which stays gold, and lamps 01, 02 and 05 turn red as the board's score steps down to 2 of
// 5. Both share one camera, so a step from the first to the second is a state flip. Every part is rounded and smooth
// shaded, in three's core geometry (the world's dev server pre-bundles no geometry addon).
import * as THREE from 'three';
import bnbSymbol from '../stack/marks/bnbchain.svg?raw';
import { createMaterials } from '../../kit/materials';
import { exactColor } from '../../kit/tone';
import type { Vec3 } from '../../lib/stage';
import type { FrameContext, FrameHandle } from '../types';
import { HEX, apron, plinth, track, poleLights, glow, emissive, glassKit, finish, pulse, detail, counted, nightRig, poseFrom, livery, rectOf, boxCorners, fmt, type Footprint } from './venue';
import { line } from './lines';
import { auditPath } from './merkle';
import { BOARD, boardCanvas, buildBoard, quadMatrix } from '../venue/board';
import { caption, litType } from '../../words';

/** The page's tamper rule (site/src/pages/Verify/useStewards.ts tamperPlan): one more MW in the selected arm's
 *  busiest hour, the first such hour on a tie. */
export function tamper(kw: readonly number[]) {
  let hour = 0;
  kw.forEach((v, h) => { if (Math.abs(v) > Math.abs(kw[hour]!)) hour = h; });
  return { hour, sealed: kw[hour]!, changed: kw[hour]! + 1000 };
}

/** The page's five checks (site/src/pages/Verify/verify/run.ts TITLES) and how each reads the changed copy. */
const CHANGED_CHECKS = [
  { id: '01', title: 'The leaf recomputes from the plan', pass: false },
  { id: '02', title: "The proof reaches the day's root", pass: false },
  { id: '03', title: 'The chain holds the same record', pass: true },
  { id: '04', title: 'Sealed before the gate', pass: true },
  { id: '05', title: 'Battery limits hold every hour', pass: false },
];

/** Which copy the bay checks: the changed one (the storyboard's R03) or the sealed one (every check passes). */
export type CopyState = 'changed' | 'sealed';

/** The frame's rest, on its own clock. */
const REST = 2.0;
/** The changed copy's failure on the frame's clock (seconds). Before `card` the bay is the sealed one exactly, so a
 *  cross-fade from grid.R03-pass that ends by then is not seen; the site's leg plays this clock from 0 to REST. The
 *  climb draws red from the card up to the first rung, the rung's node breaks, the light above it goes out rung by
 *  rung up to the coin, and the three failing lamps turn red in the page's order, the board's score with them. */
const REVEAL = { card: 0.6, climb: 0.8, crack: 0.95, drain: 1.0, drainStep: 0.035, lamps: new Map([[0, 1.2], [1, 1.4], [4, 1.6]]) } as const;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
/** 0 before t0, 1 from t0 + dur, smooth between. */
const ramp = (t: number, t0: number, dur: number) => smooth((t - t0) / dur);

/** A box w x h x d whose edges and corners are quarter rounds of radius r (seg steps each), shaded smooth: a subdivided
 *  unit cube, each vertex carried onto the rounded box along its direction from the box inside the rounds (the method
 *  of three's RoundedBoxGeometry). */
function roundedBox(w: number, h: number, d: number, r: number, seg = 4) {
  const n = seg * 2 + 1, half = 0.5 / n;
  const rr = Math.min(r, w / 2, h / 2, d / 2);
  const g = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute;
  const ix = w / 2 - rr, iy = h / 2 - rr, iz = d / 2 - rr, p = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    // n is odd, so no vertex sits on a mid-plane: every sign is +1 or -1, and the middle band is the flat face
    const sx = Math.sign(p.x), sy = Math.sign(p.y), sz = Math.sign(p.z);
    q.set(p.x - sx * half, p.y - sy * half, p.z - sz * half).normalize();
    pos.setXYZ(i, sx * ix + q.x * rr, sy * iy + q.y * rr, sz * iz + q.z * rr);
    nor.setXYZ(i, q.x, q.y, q.z);
  }
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/** A w x h plane with round corners of radius r, facing +z, its uv spanning the rectangle (a canvas face). */
function roundedPlane(w: number, h: number, r: number, seg = 8) {
  const x = w / 2, y = h / 2, rr = Math.min(r, x, y), s = new THREE.Shape();
  s.moveTo(-x + rr, -y); s.lineTo(x - rr, -y); s.absarc(x - rr, -y + rr, rr, -Math.PI / 2, 0, false);
  s.lineTo(x, y - rr); s.absarc(x - rr, y - rr, rr, 0, Math.PI / 2, false);
  s.lineTo(-x + rr, y); s.absarc(-x + rr, y - rr, rr, Math.PI / 2, Math.PI, false);
  s.lineTo(-x, -y + rr); s.absarc(-x + rr, -y + rr, rr, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ShapeGeometry(s, seg);
  const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
}

/** The outline of a w x h rectangle with round corners r, centered at (cx, cy), at depth z: a closed line's points. */
function roundedRectPts(w: number, h: number, r: number, z: number, cx = 0, cy = 0, seg = 6): Vec3[] {
  const x = w / 2 - r, y = h / 2 - r, out: Vec3[] = [];
  const corners: [number, number, number][] = [[x, -y, -Math.PI / 2], [x, y, 0], [-x, y, Math.PI / 2], [-x, -y, Math.PI]];
  for (const [ax, ay, a0] of corners) {
    for (let k = 0; k <= seg; k++) { const a = a0 + (k / seg) * (Math.PI / 2); out.push([cx + ax + Math.cos(a) * r, cy + ay + Math.sin(a) * r, z]); }
  }
  return out;
}

/** A turned part around the y axis from a profile of (radius, height) points, bottom to top (its faces outward). */
function turned(pts: readonly [number, number][], seg: number) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

/** A quarter round of radius b about (cr, cy) from angle a0 to a1 (radians, 0 along +radius), as profile points. */
function arc(cr: number, cy: number, b: number, a0: number, a1: number, n = 6): [number, number][] {
  return Array.from({ length: n + 1 }, (_, k) => { const a = a0 + ((a1 - a0) * k) / n; return [cr + Math.cos(a) * b, cy + Math.sin(a) * b] as [number, number]; });
}

/** The coin: radius R, thickness T, a raised rim w wide whose outer edge rounds over at radius b, its field d below the
 *  rim, turned on 96 sides; its axis along z (the faces at plus and minus z). */
function coinGeometry(R: number, T: number, w: number, b: number, d: number) {
  const t = T / 2;
  const prof: [number, number][] = [
    [0, -t + d], [R - w, -t + d], [R - w + 0.03, -t],
    ...arc(R - b, -t + b, b, -Math.PI / 2, 0),
    ...arc(R - b, t - b, b, 0, Math.PI / 2),
    [R - w + 0.03, t], [R - w, t - d], [0, t - d],
  ];
  return turned(prof, 96).rotateX(Math.PI / 2);
}

/** A canvas texture W x H px in exact sRGB, mipmapped; draw paints it. */
function canvasTex(W: number, H: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  draw(c.getContext('2d')!, W, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Draw a line on up to distance d along it (world units), a soft front of `soft`; d < 0 draws it whole. */
function drawTo(o: THREE.Mesh, d: number, soft = 0.25) {
  const u = (o.material as THREE.ShaderMaterial).uniforms;
  u.uDraw!.value = d; u.uDrawSoft!.value = soft;
}

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
  /** Every texture the reveal swaps in, uploaded before the first draw (no upload mid-leg). */
  const swaps: THREE.Texture[] = [];

  // the real audit path: Desert Willow's leaf in the index's order, folded to the root
  const leaves: string[] = [...d.fleet.batteries].sort((a: any, b: any) => a.i - b.i).map((b: any) => b.leaf);
  const m = show.leaf_position as number;
  if (leaves[m] !== show.leaf) throw new Error('the showcase leaf is not at its index position');
  const proof = await auditPath(leaves, m);
  if (proof.root !== sd.root || proof.fullRoot !== sd.root) throw new Error(`the audit path does not reach the sealed root (${proof.root})`);
  const kw: number[] = show.arms[show.selected_arm].kw;
  const tp = tamper(kw);
  const n = proof.steps.length;
  const mw = (v: number) => (v / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 }).replace('-', '−');

  root.add(apron(-1600, 1600, -1600, 1600));
  root.add(plinth(fp, { led: HEX.teal, ledA: 0.55, glow: 0.12 }));
  const mainPts: [number, number][] = L.track.main_world;
  const seg = mainPts.filter((p) => p[0] >= 200 && p[0] <= 400 && p[1] >= -60 && p[1] <= 80);
  const tr = track(seg, fps, { cometSpeed: 24, phase: 11, ledA: 0.4 });
  root.add(tr.group);
  root.add(poleLights(M, seg, fps, { every: 60, from: 30, side: 9, pool: 0.08, poolR: 8 }).group);
  const paint = new THREE.MeshPhysicalMaterial({ color: '#2c3238', roughness: 0.38, metalness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.18 });
  const steel = new THREE.MeshStandardMaterial({ color: '#59616a', roughness: 0.32, metalness: 0.85 });
  const bright = new THREE.MeshStandardMaterial({ color: '#8e979f', roughness: 0.24, metalness: 0.9 });
  const teal = new THREE.Color(HEX.teal), red = new THREE.Color(HEX.refused);
  const tealX = exactColor(THREE, HEX.teal), redX = exactColor(THREE, HEX.refused);

  // ── the plan: the plan's 24 hours on a lit card behind glass, in a frame on a cradle and a low plinth, facing the bay
  const CARD = [408, 0.4, 18] as const, cardFace = (231 * Math.PI) / 180;
  const card = new THREE.Group(); card.position.set(CARD[0], 0.12, CARD[2]); card.rotation.y = -cardFace; root.add(card);
  const cplinth = new THREE.Mesh(roundedBox(7.2, 0.4, 2.2, 0.1).translate(0, 0.2, 0), paint); cplinth.castShadow = true; cplinth.receiveShadow = true; card.add(cplinth);
  const cradle = new THREE.Mesh(roundedBox(6.0, 0.24, 0.62, 0.1).translate(0, 0.52, -0.16), steel); cradle.castShadow = true; card.add(cradle);
  const cardHolder = new THREE.Group(); cardHolder.position.set(0, 2.75, 0.1); cardHolder.rotation.x = 0.12; card.add(cardHolder);
  const frame = new THREE.Mesh(roundedBox(6.4, 4.4, 0.36, 0.16), paint); frame.castShadow = true; cardHolder.add(frame);
  const maxKw = 150000;
  const cardDraw = (asChanged: boolean) => (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = '#0d1117'; g.fillRect(0, 0, W, H);
    g.fillStyle = asChanged ? '#e5534b' : '#2ec7a6'; g.fillRect(0, 0, 10, H);
    g.fillStyle = '#969ca3'; g.font = `600 ${Math.round(H * 0.07)}px "Libre Franklin Brand", sans-serif`; g.textBaseline = 'alphabetic';
    g.fillText(`${show.name} · plan ${show.selected_arm} · MW by hour, CT`, W * 0.06, H * 0.12);
    const x0 = W * 0.06, x1 = W * 0.94, y0 = H * 0.56, hh = H * 0.32, bw = (x1 - x0) / 24;
    g.fillStyle = '#2b3036'; g.fillRect(x0, y0, x1 - x0, 2);
    kw.forEach((v0, h) => {
      const hit = asChanged && h === tp.hour, v = hit ? tp.changed : v0;
      const t = Math.abs(v) / maxKw, bh = Math.max(2, t * hh), x = x0 + h * bw + bw * 0.14;
      g.fillStyle = hit ? '#e5534b' : v > 0 ? '#2ec7a6' : v < 0 ? '#7f9cc0' : '#2b3036';
      if (v !== 0) g.fillRect(x, v > 0 ? y0 - bh : y0 + 2, bw * 0.72, bh);
      if (hit) { g.strokeStyle = '#e5534b'; g.lineWidth = 5; g.beginPath(); g.roundRect(x - 9, y0 - 6, bw * 0.72 + 18, hh + 20, 8); g.stroke(); }
    });
    g.font = `500 ${Math.round(H * 0.055)}px "Libre Franklin Brand", sans-serif`; g.fillStyle = '#7d848c';
    for (const h of [0, 6, 12, 18]) g.fillText(String(h).padStart(2, '0'), x0 + h * bw, H * 0.97);
    g.fillStyle = asChanged ? '#e5534b' : '#2ec7a6'; g.font = `600 ${Math.round(H * 0.07)}px "Libre Franklin Brand", sans-serif`;
    if (asChanged) g.fillText(`Hour ${tp.hour}: ${mw(tp.sealed)} → ${mw(tp.changed)} MW`, W * 0.06, H * 0.23);
    else g.fillText(`Sealed · leaf ${fmt.short(show.leaf, 4, 4)}`, W * 0.06, H * 0.23);
  };
  try { await document.fonts.load('600 120px "Libre Franklin Brand"'); } catch { /* the system face draws them */ }
  const cardTex = { sealed: canvasTex(960, 640, cardDraw(false)), changed: changed ? canvasTex(960, 640, cardDraw(true)) : null };
  if (cardTex.changed) swaps.push(cardTex.changed);
  const cardScrMat = new THREE.MeshBasicMaterial({ map: cardTex.changed ?? cardTex.sealed, toneMapped: false });
  const cardScr = new THREE.Mesh(roundedPlane(6, 4, 0.12), cardScrMat);
  cardScr.rotation.y = Math.PI; cardScr.position.z = -0.19; cardHolder.add(cardScr);
  const cardGlass = G.pane(6.1, 4.1, { r: 0.25, rimW: 0.3, tintA: 0.08, refract: 0.03, frost: 0.05 }); cardGlass.position.z = -0.32; cardGlass.rotation.y = Math.PI; cardHolder.add(cardGlass);
  const cardGlow = glow(HEX.teal, 12, 0.18); cardGlow.position.set(CARD[0], 0.14, CARD[2]); root.add(cardGlow);

  // ── the steps: the proof as the page draws it, the leaf at the foot, one level a rung, each rung's node with its
  // sibling joining from the left or the right, the coin on top. A vertical climb behind the card, facing the bay.
  const LAD = { x: 410.4, z: 15.2, y0: 6.3, dy: 1.3 };
  const ladder = new THREE.Group(); ladder.position.set(LAD.x, 0, LAD.z); ladder.rotation.y = -cardFace; root.add(ladder);
  const levelY = (k: number) => LAD.y0 + k * LAD.dy; // k = 0 the first rung (L1)
  const topY = levelY(n) + 0.9;
  const COIN = { y: topY + 2.1, r: 1.75, t: 0.34, rim: 0.17, field: 0.035 };
  // the rails: steel tubes with round ends; each rung a tube between them, a collar where it meets each rail
  const railLen = topY - 4.6;
  const railGeo = new THREE.CapsuleGeometry(0.09, railLen, 6, 16);
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(railGeo, steel); rail.position.set(sx * 3.7, 4.6 + railLen / 2, 0.25); rail.castShadow = true; ladder.add(rail);
  }
  const rungs: { c: Vec3; side: 'left' | 'right' }[] = [];
  const local = (x: number, y: number): Vec3 => { const v = new THREE.Vector3(x, y, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), -cardFace); return [LAD.x + v.x, v.y, LAD.z + v.z]; };
  const barGeo = new THREE.CylinderGeometry(0.055, 0.055, 7.4, 16).rotateZ(Math.PI / 2);
  const collarGeo = new THREE.TorusGeometry(0.12, 0.035, 10, 28).rotateX(Math.PI / 2);
  const nodeGeo = roundedBox(1.7, 0.78, 0.22, 0.08), nodeFaceGeo = roundedPlane(1.5, 0.6, 0.1);
  const sibGeo = roundedBox(1.5, 0.66, 0.2, 0.07), sibFaceGeo = roundedPlane(1.34, 0.5, 0.09);
  /** Each rung's node (the hash its level makes): the whole tile, which the changed copy's first rung swaps for its
   *  broken halves, and its face and rim, lit teal where the climb reaches it (every node of the sealed copy). */
  const nodes: THREE.Group[] = [];
  const nodeLit: { face: THREE.MeshBasicMaterial; rim: THREE.ShaderMaterial }[] = [];
  const NODE = { lit: new THREE.Color('#12352f'), dark: new THREE.Color('#1f2429'), rimLit: exactColor(THREE, HEX.teal), rimDark: exactColor(THREE, '#4a535d') };
  proof.steps.forEach((st, k) => {
    const y = levelY(k), sx = st.side === 'left' ? -1 : 1;
    const bar = new THREE.Mesh(barGeo, steel); bar.position.set(0, y, 0.25); ladder.add(bar);
    for (const cx of [-3.7, 3.7]) { const col = new THREE.Mesh(collarGeo, steel); col.position.set(cx, y, 0.25); ladder.add(col); }
    const node = new THREE.Group(); node.position.set(0, y, 0); ladder.add(node); nodes.push(node);
    const tile = new THREE.Mesh(nodeGeo, paint); tile.castShadow = true; node.add(tile);
    const face = new THREE.Mesh(nodeFaceGeo, emissive('#12352f')); face.position.z = -0.115; face.rotation.y = Math.PI; node.add(face);
    const rim = line(roundedRectPts(1.7, 0.78, 0.1, -0.12), { color: HEX.teal, width: 1.2, opacity: 0.85, closed: true, reveal: false, renderOrder: 7 }); node.add(rim);
    nodeLit.push({ face: face.material as THREE.MeshBasicMaterial, rim: rim.material as THREE.ShaderMaterial });
    const glassT = G.pane(1.8, 0.86, { r: 0.14, rimW: 0.12, tintA: 0.06, refract: 0.03, frost: 0.05 }); glassT.position.z = -0.2; glassT.rotation.y = Math.PI; node.add(glassT);
    // the sibling from the index, unchanged: a steel-blue tile on its side
    const sib = new THREE.Mesh(sibGeo, paint); sib.position.set(sx * 2.45, y, 0); ladder.add(sib);
    const sibFace = new THREE.Mesh(sibFaceGeo, emissive('#2a3a4f')); sibFace.position.set(sx * 2.45, y, -0.105); sibFace.rotation.y = Math.PI; ladder.add(sibFace);
    ladder.add(line([[sx * 1.7, y, -0.12], [sx * 0.86, y, -0.12]] as Vec3[], { color: '#4c80ba', width: 1.4, reveal: false, renderOrder: 7 }));
    rungs.push({ c: local(sx * 2.45, y), side: st.side });
  });
  // the climb, lit teal from the leaf through every rung into the coin: the proof unbroken
  const spans: [number, number][] = [[4.75, levelY(0) - 0.39]];
  for (let k = 0; k < n; k++) spans.push([levelY(k) + 0.39, k + 1 < n ? levelY(k + 1) - 0.39 : COIN.y - COIN.r - 0.02]);
  const climb = spans.map(([a, b], i) => {
    const o = line([[0, a, -0.12], [0, b, -0.12]] as Vec3[], i === 0
      ? { color: HEX.teal, width: 2.4, glow: 10, glowA: 0.35, reveal: false, renderOrder: 7 }
      : { color: HEX.teal, width: 2.0, glow: 8, glowA: 0.3, reveal: false, renderOrder: 7 });
    ladder.add(o); return o;
  });

  // ── the record: the day's root as a gold coin on top of the climb, BNB Chain's symbol on its face; the changed copy
  // leaves it as it is
  const gold = new THREE.MeshPhysicalMaterial({ color: exactColor(THREE, '#d9a01a'), metalness: 0.9, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.22,
    emissive: exactColor(THREE, '#7d5a07'), emissiveIntensity: 1 });
  const coin = new THREE.Group(); coin.position.set(0, COIN.y, 0); ladder.add(coin);
  const coinBody = new THREE.Mesh(coinGeometry(COIN.r, COIN.t, COIN.rim, 0.07, COIN.field), gold); coinBody.castShadow = true; coin.add(coinBody);
  // the face: BNB Chain's symbol as its file draws it (stations/stack/marks/bnbchain.svg, the owner's own path), in
  // BNB Chain's black, which its brand page sets where the yellow would be low in contrast, on a field of its yellow
  const coinFace = canvasTex(1024, 1024, (g, W) => {
    const c = W / 2;
    const fill = g.createRadialGradient(c * 0.82, c * 0.74, W * 0.04, c, c, c);
    fill.addColorStop(0, '#ffd95c'); fill.addColorStop(0.55, '#f0b90b'); fill.addColorStop(1, '#c98f04');
    g.fillStyle = fill; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(11, 14, 17, 0.28)'; g.lineWidth = W * 0.008; g.beginPath(); g.arc(c, c, c * 0.9, 0, Math.PI * 2); g.stroke();
    const path = /<path\b[^>]*\bd="([^"]+)"/.exec(bnbSymbol)?.[1];
    if (path) {
      // the symbol's 96-unit box, its marks from x 7 to 89.3 and y 0 to 96, centered on the face at 0.56 of its width
      const k = (W * 0.56) / 96;
      g.save(); g.translate(c - 48.14 * k, c - 48 * k); g.scale(k, k);
      g.fillStyle = '#0B0E11'; g.fill(new Path2D(path)); g.restore();
    }
  });
  const coinFaceMesh = new THREE.Mesh(new THREE.CircleGeometry(COIN.r - COIN.rim - 0.01, 96), new THREE.MeshBasicMaterial({ map: coinFace, toneMapped: false }));
  coinFaceMesh.rotation.y = Math.PI; coinFaceMesh.position.z = -(COIN.t / 2 - COIN.field) - 0.004; coin.add(coinFaceMesh);
  coin.add(line(Array.from({ length: 97 }, (_, k) => { const a = (k / 96) * Math.PI * 2; return [Math.cos(a) * (COIN.r + 0.03), Math.sin(a) * (COIN.r + 0.03), -0.02] as Vec3; }),
    { color: HEX.bnb, width: 1.6, glow: 10, glowA: 0.38, closed: true, reveal: false, renderOrder: 7 }));
  const coinHalo = glow(HEX.bnb, 5.6, 0.1, { flat: false }); coinHalo.rotation.y = Math.PI; coinHalo.position.z = -0.25; coin.add(coinHalo);

  // ── the lamp wall at the bay's east side, facing west: five check lamps on their numbered plates, and the Verify
  // page's board over them ───────────────────────────────────────────────────────────────────────────────────────
  // the lamps sit from z -4 to 24, clear of the card from the bay. The wall was lowered from 16.5 m to 13 m when it read
  // as a black mass over the bay; it stands 16 m now to carry the page's board, lit, over the lamps
  const WALL = { x: 456, z0: -16, z1: 24, h: 16 };
  const wallPaint = new THREE.MeshPhysicalMaterial({ color: '#3a4148', roughness: 0.42, metalness: 0.25, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const wall = new THREE.Mesh(roundedBox(1.4, WALL.h, WALL.z1 - WALL.z0 + 6, 0.24).translate(0, WALL.h / 2, 0), wallPaint);
  wall.position.set(WALL.x + 0.7, 0.12, (WALL.z0 + WALL.z1) / 2); wall.castShadow = true; wall.receiveShadow = true; root.add(wall);
  const wallTop = line([[WALL.x - 0.02, WALL.h + 0.1, WALL.z0 - 3], [WALL.x - 0.02, WALL.h + 0.1, WALL.z1 + 3]] as Vec3[], { color: HEX.teal, width: 1.4, glow: 6, glowA: 0.25, opacity: 0.7, reveal: false, renderOrder: 5 });
  wallTop.userData.noAO = true; root.add(wallTop);
  const lampZ = [-4, 3, 10, 17, 24], lampY = 3.6;
  // each lamp: a turned housing proud of the wall, its lip rounded over, a polished bezel on the lip and the lit face
  // set back in its bore, behind a glass lens
  const housingGeo = turned([[1.68, 0], ...arc(1.56, 0.2, 0.12, 0, Math.PI / 2), [1.34, 0.32], [1.3, 0.28], [1.28, 0.08], [0.001, 0.08]], 72).rotateX(-Math.PI / 2);
  const bezelGeo = new THREE.TorusGeometry(1.45, 0.07, 18, 72);
  const lampFaceGeo = new THREE.CircleGeometry(1.27, 72);
  /** Each lamp's lit parts, recolored as the changed copy's checks fail. */
  const lamps: { face: THREE.MeshBasicMaterial; halo: THREE.MeshBasicMaterial; pool: THREE.MeshBasicMaterial; light: THREE.PointLight; plate: THREE.MeshBasicMaterial; plateSealed: THREE.Texture }[] = [];
  CHECKS.forEach((_, i) => {
    const z = lampZ[i]!, y = lampY;
    const g = new THREE.Group(); g.position.set(WALL.x, y, z); g.rotation.y = Math.PI / 2; root.add(g);
    const housing = new THREE.Mesh(housingGeo, paint); housing.castShadow = true; g.add(housing);
    const bezel = new THREE.Mesh(bezelGeo, bright); bezel.position.z = -0.31; g.add(bezel);
    const face = new THREE.Mesh(lampFaceGeo, emissive(HEX.teal)); face.rotation.y = Math.PI; face.position.z = -0.1; g.add(face);
    const lens = G.pane(2.84, 2.84, { r: 1.42, rimW: 0.3, tintA: 0.05, refract: 0.04, frost: 0.05 }); lens.rotation.y = Math.PI; lens.position.z = -0.36; g.add(lens);
    const halo = glow(HEX.teal, 3.5, 0.16, { flat: false }); halo.rotation.y = Math.PI; halo.position.z = -0.44; g.add(halo);
    const pool = glow(HEX.teal, 5, 0.08); pool.position.set(WALL.x - 3, 0.14, z); root.add(pool);
    const light = counted(new THREE.PointLight(exactColor(THREE, HEX.teal), 3, 8, 2)); light.position.set(WALL.x - 1.6, y, z); root.add(light);
    lamps.push({ face: face.material as THREE.MeshBasicMaterial, halo: halo.material as THREE.MeshBasicMaterial, pool: pool.material as THREE.MeshBasicMaterial, light, plate: null!, plateSealed: null! });
  });
  // each lamp's number on a plate on the wall under it, drawn into the plate (the display face at 600, its figures
  // tabular), rimmed in the check's color: the numbers belong to the wall, stay through a move, and read as the
  // board's rows do
  const PLATE = { y: 1.3, w: 2.4, h: 1.1 };
  const plateGeo = roundedBox(0.2, PLATE.h, PLATE.w, 0.08), plateFaceGeo = roundedPlane(PLATE.w - 0.12, PLATE.h - 0.12, 0.1);
  const plateTex = (id: string, hex: string) => canvasTex(Math.round((PLATE.w - 0.12) * 240), Math.round((PLATE.h - 0.12) * 240), (g, W, H) => {
    const lw = Math.max(4, Math.round(H * 0.045)), inset = lw * 1.5, r = H * 0.18;
    g.fillStyle = '#14171a'; g.fillRect(0, 0, W, H);
    g.strokeStyle = hex; g.lineWidth = lw; g.beginPath(); g.roundRect(inset, inset, W - 2 * inset, H - 2 * inset, r); g.stroke();
    // tabular figures: each digit set on its own cell of one advance, so 01 to 05 share one width and center
    g.font = `600 ${Math.round(H * 0.6)}px "Libre Franklin Brand", "Helvetica Neue", Arial, sans-serif`;
    g.fillStyle = '#e6e8ea'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const mm = g.measureText(id), cap = mm.actualBoundingBoxAscent - mm.actualBoundingBoxDescent;
    const cell = Math.max(...'0123456789'.split('').map((ch) => g.measureText(ch).width));
    [...id].forEach((ch, k) => g.fillText(ch, W / 2 + (k - (id.length - 1) / 2) * cell, H / 2 + cap / 2));
  });
  const plateFail = new Map<number, THREE.Texture>();
  CHECKS.forEach((c, i) => {
    const z = lampZ[i]!;
    const body = new THREE.Mesh(plateGeo, paint); body.position.set(WALL.x - 0.06, PLATE.y, z); body.castShadow = true; root.add(body);
    const sealedTex = plateTex(c.id, HEX.teal);
    const mat = new THREE.MeshBasicMaterial({ map: sealedTex, toneMapped: false });
    if (!c.pass) { const t = plateTex(c.id, HEX.refused); plateFail.set(i, t); swaps.push(t); }
    const face = new THREE.Mesh(plateFaceGeo, mat); face.position.set(WALL.x - 0.18, PLATE.y, z); face.rotation.y = -Math.PI / 2; root.add(face);
    lamps[i]!.plate = mat; lamps[i]!.plateSealed = sealedTex;
  });
  // the screen: a face behind glass in a bezel over the five lamps, from the first lamp's center to the last's,
  // 28 x 9.6 m; decorate sets the page's board on the face at the screen's aspect (venue/board.ts: the rows share its
  // height)
  const SCR = { x: WALL.x - 0.28, y: 10.8, z: 10, w: 28, h: 9.6 };
  const boardH = Math.round((BOARD.width * SCR.h) / SCR.w);
  const bezel = new THREE.Mesh(roundedBox(0.3, SCR.h + 0.7, SCR.w + 0.7, 0.15), paint);
  bezel.position.set(WALL.x - 0.1, SCR.y, SCR.z); bezel.castShadow = true; root.add(bezel);
  // the screen's face is the board itself, drawn from its laid-out DOM: the site hides a frame's DOM while the camera
  // moves, so through a move the wall shows the board, and at rest the DOM board lands on it exactly. The changed copy
  // has one face a step of its reveal: the sealed board, then one, two and three checks failed
  const states = CHECKS.map((c) => (c.pass ? 'pass' : 'fail') as 'pass' | 'fail');
  const boardTex = (s: readonly ('pass' | 'fail')[], tampered: boolean) => {
    const poster = buildBoard(d, s, tampered, BOARD.width, boardH);
    poster.style.visibility = 'hidden'; ctx.overlay.appendChild(poster);
    const t = new THREE.CanvasTexture(boardCanvas(poster, 2)); poster.remove();
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  };
  const failing = [...REVEAL.lamps.keys()];
  const boards = changed
    ? [boardTex(states.map(() => 'pass'), false), ...failing.map((_, j) => boardTex(states.map((s, i) => (failing.slice(0, j + 1).includes(i) ? 'fail' : 'pass')), true))]
    : [boardTex(states, false)];
  swaps.push(...boards.slice(1));
  const scrMat = new THREE.MeshBasicMaterial({ map: boards[boards.length - 1]!, toneMapped: false });
  const scr = new THREE.Mesh(roundedPlane(SCR.w, SCR.h, 0.3), scrMat);
  scr.position.set(SCR.x, SCR.y, SCR.z); scr.rotation.y = -Math.PI / 2; root.add(scr);
  const scrGlass = G.pane(SCR.w + 0.2, SCR.h + 0.2, { r: 0.36, rimW: 0.3, tintA: 0.06, refract: 0.02, frost: 0.04 }); scrGlass.position.set(SCR.x - 0.2, SCR.y, SCR.z); scrGlass.rotation.y = -Math.PI / 2; root.add(scrGlass);
  // the face's corners as seen from the bay (top left, top right, bottom right, bottom left): west of the wall, north is left
  const screenCorners = (): Vec3[] => {
    const y0 = SCR.y - SCR.h / 2, y1 = SCR.y + SCR.h / 2, zl = SCR.z - SCR.w / 2, zr = SCR.z + SCR.w / 2;
    return [[SCR.x, y1, zl], [SCR.x, y1, zr], [SCR.x, y0, zr], [SCR.x, y0, zl]];
  };

  // ── the changed copy's failure, built beside the sealed bay and posed by the clock (REVEAL) ──────────────────────
  let reveal: ((t: number) => void) | null = null;
  if (changed) {
    // the climb from the changed leaf, drawn red up to the first rung
    const red0 = line([[0, spans[0]![0], -0.125], [0, spans[0]![1], -0.125]] as Vec3[], { color: HEX.refused, width: 2.4, glow: 10, glowA: 0.35, reveal: false, renderOrder: 8 });
    const red0Len = spans[0]![1] - spans[0]![0];
    ladder.add(red0);
    // past the break, the climb dark: the hashes above it no longer join the changed leaf to the root
    const dark = spans.slice(1).map(([a, b]) => {
      const o = line([[0, a, -0.12], [0, b, -0.12]] as Vec3[], { color: '#3a4148', width: 1.4, dash: 0.18, gap: 0.14, reveal: false, renderOrder: 6 });
      ladder.add(o); return o;
    });
    // the first rung's node, broken: two halves part and drop at their outer ends round a lit crack
    const brk = new THREE.Group(); brk.position.set(0, levelY(0), 0); ladder.add(brk);
    const halfGeo = roundedBox(0.84, 0.78, 0.22, 0.08), halfFace = roundedPlane(0.72, 0.6, 0.09);
    const halves = [-1, 1].map((s) => {
      const h = new THREE.Group(); brk.add(h);
      const tile = new THREE.Mesh(halfGeo, paint); tile.position.x = s * 0.43; tile.castShadow = true; h.add(tile);
      const face = new THREE.Mesh(halfFace, emissive('#5a1f1c')); face.position.set(s * 0.43, 0, -0.115); face.rotation.y = Math.PI; h.add(face);
      h.add(line(roundedRectPts(0.84, 0.78, 0.1, -0.12, s * 0.43, 0), { color: HEX.refused, width: 2, glow: 10, glowA: 0.4, closed: true, reveal: false, renderOrder: 7 }));
      return { h, s };
    });
    const crack = line([[0.03, 0.42, -0.14], [-0.06, 0.22, -0.14], [0.05, 0.04, -0.14], [-0.05, -0.16, -0.14], [0.02, -0.42, -0.14]] as Vec3[],
      { color: HEX.refused, width: 2.2, glow: 12, glowA: 0.5, reveal: false, renderOrder: 8 });
    brk.add(crack);
    const brkGlow = glow(HEX.refused, 3.2, 0.45, { flat: false }); brkGlow.position.z = -0.3; brkGlow.rotation.y = Math.PI; brk.add(brkGlow);
    const brkGlowMat = brkGlow.material as THREE.MeshBasicMaterial, crackMat = crack.material as THREE.ShaderMaterial;
    const cardGlowMat = cardGlow.material as THREE.MeshBasicMaterial;
    reveal = (t: number) => {
      // the card: the changed hour, red; its light on the floor with it
      cardScrMat.map = t >= REVEAL.card ? cardTex.changed : cardTex.sealed;
      cardGlowMat.color.copy(tealX).lerp(redX, ramp(t, REVEAL.card, 0.2));
      // the climb from the leaf: red, drawn up to the first rung
      const up = ramp(t, REVEAL.climb, REVEAL.crack - REVEAL.climb);
      red0.visible = up > 0; drawTo(red0, up >= 1 ? -1 : up * red0Len, 0.3);
      climb[0]!.visible = up < 1;
      // the first rung breaks: its whole tile goes, the halves part and drop, the crack lights
      const split = ramp(t, REVEAL.crack, 0.2);
      nodes[0]!.visible = t < REVEAL.crack; brk.visible = !nodes[0]!.visible;
      for (const { h, s } of halves) { h.position.x = s * 0.13 * split; h.rotation.z = -s * 0.07 * split; }
      crackMat.opacity = ramp(t, REVEAL.crack, 0.08); brkGlowMat.opacity = 0.45 * crackMat.opacity;
      // the light above the break goes out rung by rung, up to the coin: each stretch of the climb and the node it
      // reaches, which the changed leaf's hashes no longer match
      for (let k = 1; k < climb.length; k++) {
        const out = ramp(t, REVEAL.drain + (k - 1) * REVEAL.drainStep, 0.12);
        const lit = climb[k]!, dk = dark[k - 1]!;
        (lit.material as THREE.ShaderMaterial).opacity = 1 - out; lit.visible = out < 1;
        (dk.material as THREE.ShaderMaterial).opacity = out; dk.visible = out > 0;
        const nl = nodeLit[k];
        if (nl) { nl.face.color.copy(NODE.lit).lerp(NODE.dark, out); nl.rim.uniforms.diffuse!.value.copy(NODE.rimLit).lerp(NODE.rimDark, out); }
      }
      // the failing checks, each at its time: its lamp goes out and comes back red (a blend of the two colors would
      // pass through gray), its light and plate with it, and the board shows one more failed
      let failed = 0;
      for (const [i, at] of REVEAL.lamps) {
        const k = ramp(t, at, 0.14), L = lamps[i]!, on = 0.12 + 0.88 * Math.abs(2 * k - 1), isRed = k >= 0.5;
        L.face.color.copy(isRed ? red : teal).multiplyScalar(on);
        L.halo.color.copy(isRed ? redX : tealX).multiplyScalar(on); L.pool.color.copy(isRed ? redX : tealX).multiplyScalar(on);
        L.light.color.copy(isRed ? redX : tealX); L.light.intensity = 3 * on;
        L.plate.map = isRed ? plateFail.get(i)! : L.plateSealed;
        if (isRed) failed++;
      }
      scrMat.map = boards[failed]!;
    };
  }

  finish(ctx, root, M);
  for (const t of swaps) stage.renderer.initTexture(t);
  nightRig(stage, [120, 420]);
  stage.setFade({ center: [0.5, 0.5], screen: [3, 4], world: [500, 900], worldCenter: [420, 10] });
  stage.setAO({ radius: 0.55, scale: 1.1, thickness: 1.0, samples: 16 });
  stage.setKey({ az: 200, el: 38, center: [425, 6, 10], radius: 45, rimAz: 20 });
  stage.setShadowAuto(true);
  // the camera: from the bay's southwest, 14 m up and looking down, so the climb to the coin, the card at its foot
  // (clear of the caption) and the board over the lamps share the picture at a size the board reads at. A portrait
  // screen cannot hold the ladder and the wall side by side: it frames the wall, the board over the five lamps across
  // its width, from the same place
  const cam = ctx.width / ctx.height < 1
    ? poseFrom([376, 14, 47], [456.3, 7, 11], 44, [0, 0])
    : poseFrom([376, 14, 47], [441, 5, 5], 39, [0.03, 0]);

  const path = `the audit path is RFC 6962 over the ${leaves.length} leaf hashes of frame-data.json fleet.batteries in index order, for Desert Willow at index ${m} (position ${m + 1} of ${leaves.length}): ${n} steps, sides ${proof.steps.map((s) => s.side[0]).join('')}, folding to ${proof.root}, the sealed root.`;
  return {
    time: REST,
    note: changed
      ? `Real: ${path} The changed value is the page's tamper rule on showcase.arms.${show.selected_arm}.kw: hour ${tp.hour} (${tp.hour}:00 to ${tp.hour + 1}:00 CT), ${tp.sealed} to ${tp.changed} kW. The lamps' states follow the Verify page's own words for a changed copy ("checks 3 and 4 still pass; the leaf, the proof and the energy balance in check 5 do not": 01, 02 and 05 fail); this still does not run the verifier. The board over the lamps is the page's own board for the changed copy (venue/board.ts, the one the films' split screen carries), with those five states. On the frame's clock the bay starts as the sealed one and the failure plays in from ${REVEAL.card} s (the rest is ${REST} s). The coin's face is BNB Chain's symbol from its published file (stations/stack/marks/bnbchain.svg) in BNB Chain's black. Illustrative: the bay's architecture, the rails and lights, the coin as the record's picture.`
      : `Real: ${path} The card is the sealed plan as sealed (showcase.arms.${show.selected_arm}.kw, leaf ${show.leaf}). The five lamps show the page's checks on the sealed copy, all passing, as the page reads it before any change ("${CHECKS.length} of ${CHECKS.length} checks pass"); this still does not run the verifier. The board over the lamps is the page's own board for the sealed plan (venue/board.ts, the one the films' split screen carries). The coin's face is BNB Chain's symbol from its published file (stations/stack/marks/bnbchain.svg) in BNB Chain's black. Illustrative: the bay's architecture, the rails and lights, the coin as the record's picture.`,
    // the comets on the track hold still in the changed copy, so its first moments match the sealed bay at rest
    update(t) { stage.setCamera(cam); detail(ctx, M); pulse(root, changed ? REST : t); reveal?.(t); },
    decorate() {
      const p = ctx.plates;
      litType(ctx);
      // the Verify page's board on the screen's face, exact: its markup in the frame's DOM, set on the face's corners
      // (a film lays it out again through a leg, so it rides with the wall)
      const board = buildBoard(d, states, changed, BOARD.width, boardH);
      const corners = screenCorners().map((q) => p.project(q));
      if (corners.every((q) => q)) {
        ctx.overlay.appendChild(board);
        board.style.transform = quadMatrix(BOARD.width, boardH, corners as { x: number; y: number }[]);
      }
      const cap = caption(ctx, changed
        ? { head: 'A changed number fails the check', flavor: 'stewards', line: 'In a browser, against the chain: one changed number fails three checks.' }
        : { head: 'Anyone can check any plan', flavor: 'stewards', line: 'In a browser, against the chain: the sealed copy passes all five checks.' });
      const scope = p.scope(changed ? 'The record on chain is untouched, so 03 and 04 still pass.' : `The sealed copy: its ${n} hashes climb from the leaf to the root on chain.`);
      // the board and the lamps with their plates carry the five checks: the plates keep off them
      const boardBox = rectOf(ctx, screenCorners(), 10);
      const wallLow = PLATE.y - PLATE.h / 2, wallHigh = lampY + 1.8;
      const lampsBox = rectOf(ctx, boxCorners([WALL.x, (wallLow + wallHigh) / 2, 10], [0.4, (wallHigh - wallLow) / 2, 15.8], 0), 8);
      const ladderBox = rectOf(ctx, [local(-3.8, 4.6), local(3.8, 4.6), local(-3.8, topY + 0.2), local(3.8, topY + 0.2)], 6);
      const coinBox = rectOf(ctx, [local(-COIN.r, COIN.y - COIN.r), local(COIN.r, COIN.y - COIN.r), local(-COIN.r, COIN.y + COIN.r), local(COIN.r, COIN.y + COIN.r)], 6);
      const cardBox = rectOf(ctx, boxCorners([CARD[0], 2.87, CARD[2]], [3.3, 2.3, 0.3], -cardFace), 8);
      // the card's plate hangs off its left edge as seen, into the open ground beside it, not over its header
      const cardEdge = boxCorners([CARD[0], 2.6, CARD[2]], [3.2, 0, 0.2], -cardFace).reduce((a, c) => ((p.project(c)?.x ?? Infinity) < (p.project(a)?.x ?? Infinity) ? c : a));
      // one leader for the climb: at the middle rung's sibling hash, or at the first rung where the changed copy breaks
      const mid = rungs[Math.floor(rungs.length / 2)]!;
      // what each part is, in plain words: the card is the plan, the rungs the hashes up to the record, the coin the
      // record on BNB Chain; the codes go second
      const texts = {
        card: changed ? "Desert Willow's plan, changed" : "Desert Willow's plan",
        cardSub: changed ? `Hour ${tp.hour}: ${mw(tp.sealed)} → ${mw(tp.changed)} MW` : `Leaf ${m + 1} of ${leaves.length}, as sealed`,
        ladder: changed ? `Breaks at hash 1 of ${n}` : `${n} hashes up to the record`,
        coin: "The day's record on BNB Chain",
        coinSub: changed ? `Root ${fmt.short(sd.root)}, unchanged` : `Root ${fmt.short(sd.root)}, recomputed: match`,
      };
      p.leaders([
        { id: 'card', text: texts.card, sub: texts.cardSub, at: cardEdge, priority: 0 },
        { id: 'ladder', text: texts.ladder, at: changed ? local(0, levelY(0)) : mid.c, priority: 1 },
        // at the coin's edge as seen, so its plate sits beside the coin, not over its face
        { id: 'coin', text: texts.coin, sub: texts.coinSub, at: local(COIN.r + 0.08, COIN.y), priority: 2 },
      ], { keepOut: [boardBox, lampsBox, ...(scope ? [scope] : []), ...(cap ? [cap] : [])], avoid: [cardBox, ladderBox, coinBox], max: 3 });
      livery(ctx, changed ? { [texts.card]: 'refused', [texts.ladder]: 'refused', [texts.coin]: 'sealed' } : { [texts.card]: 'live', [texts.ladder]: 'live', [texts.coin]: 'sealed' });
    },
  };
}
