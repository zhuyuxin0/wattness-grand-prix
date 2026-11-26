// R02 · Plans sealed before the market closes (parc fermé): sealed 2,683 s before the gate; the late seal refused. The
// gold hall on the GateRecord plinth: the ring track round the root plate and its 316 ticks, both chains' receipt
// pylons, the gate clock over the closed barrier, and a late plan stopped short of it, refused. Lit for the 90 s cut
// (Jo, Nov 26): the clock is half again as large, the gate's frame glows and is floodlit, the night rig is raised.
//
// Its clock is the sealed day's own, as a time-lapse (LAPSE): the plans made at 09:12:46 CT, the root sealed on BSC at
// 09:15:17 (the ring and the root light, the pylon reads its receipt; the testnet's at 09:17:00), the clock running on
// to ERCOT's gate at 10:00:00 (the barrier comes down), and the late plan arriving to be refused at 10:00:22. The
// frame's rest (the storyboard's still) is the end of it; the story's films play it under their lines (beats.ts run).
// With sound on (lib/sound), the seal stamps as the frame's clock runs on through it: on the site, in the leg in.
import * as THREE from 'three';
import { createMaterials } from '../../kit/materials';
import { lin } from '../../kit/region/geo';
import { exactColor } from '../../kit/tone';
import * as sound from '../../lib/sound';
import type { Vec3 } from '../../lib/stage';
import type { FrameContext, FrameHandle } from '../types';
import { HEX, apron, plinth, track, poleLights, glow, emissive, screen, glassKit, finish, pulse, detail, counted, nightRig, poseFrom, livery, rectOf, boxCorners, fmt, floorAt, resample, type Footprint } from './venue';
import { line, lines } from './lines';
import { caption, litType } from '../../words';
import { inFilm, yours } from '../../lib/yours';

const CT = (s: string) => s.replace(/^\d{4}-\d{2}-\d{2} /, '');

/** The time-lapse on the frame's own clock (seconds): when each moment of the sealed day lands. The market clock runs
 *  fast into the seal (eased), holds on it, ticks on in real time, fast-forwards (eased) to four seconds before the
 *  gate, then runs steadily through the gate to the late attempt; before the first knot it reads the plans' time,
 *  after the last the late attempt's. rest is the storyboard's still, the late seal refused; the comets run on the
 *  frame's old clock (t - COMETS), so the still's are as approved. */
export const LAPSE = { made: 0.5, sealed: 2.1, hold: 3.3, tick: 6.0, preGate: 10.8, gate: 11.4, arrive: 11.45, stop: 13.7, late: 14.2, rest: 14.8 } as const;
const COMETS = LAPSE.rest - 3.0;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const easeInOut = (x: number) => { const t = clamp01(x); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
/** A CT stamp's seconds into its day ("2026-11-25 09:15:17 CT"). */
const sodOf = (ct: string) => { const m = /(\d{2}):(\d{2}):(\d{2})/.exec(ct)!; return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]); };
const hms = (s: number) => { const x = ((Math.floor(s) % 86400) + 86400) % 86400; return [Math.floor(x / 3600), Math.floor(x / 60) % 60, x % 60].map((v) => String(v).padStart(2, '0')).join(':'); };

/** A rounded lozenge (top view w x d, corner r) h tall, its uv remapped into the unit square per face group. */
export function lozenge(w: number, d: number, h: number, r: number, bevel: number) {
  const s = new THREE.Shape();
  const x0 = -w / 2 + bevel, x1 = w / 2 - bevel, y0 = -d / 2 + bevel, y1 = d / 2 - bevel, rr = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  s.moveTo(x0 + rr, y0); s.lineTo(x1 - rr, y0); s.quadraticCurveTo(x1, y0, x1, y0 + rr); s.lineTo(x1, y1 - rr); s.quadraticCurveTo(x1, y1, x1 - rr, y1);
  s.lineTo(x0 + rr, y1); s.quadraticCurveTo(x0, y1, x0, y1 - rr); s.lineTo(x0, y0 + rr); s.quadraticCurveTo(x0, y0, x0 + rr, y0);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, h - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 16 });
  g.rotateX(-Math.PI / 2); g.translate(0, bevel, 0);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  let a = Infinity, b = -Infinity, c = Infinity, e = -Infinity;
  for (let i = 0; i < uv.count; i++) { a = Math.min(a, uv.getX(i)); b = Math.max(b, uv.getX(i)); c = Math.min(c, uv.getY(i)); e = Math.max(e, uv.getY(i)); }
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.03 + 0.94 * ((uv.getX(i) - a) / (b - a || 1)), 0.03 + 0.94 * ((uv.getY(i) - c) / (e - c || 1)));
  g.computeVertexNormals();
  return g;
}

export async function r02(ctx: FrameContext): Promise<FrameHandle> {
  const { stage } = ctx;
  const d = ctx.needData();
  const L = ctx.layout as any;
  const sd = d.sealed_day, [main, test] = sd.receipts as any[];
  const pf: Footprint = L.stations.find((s: any) => s.id === 'parc-ferme').footprint;
  const rd: Footprint = L.stations.find((s: any) => s.id === 'race-day').footprint;
  const fps = [pf, rd];
  const M = createMaterials(THREE, 'dark');
  const G = glassKit(ctx);
  const root = new THREE.Group(); root.name = 'R02';

  root.add(apron(-1600, 1600, -1600, 1600));
  root.add(plinth(pf, { led: HEX.bnb, ledA: 0.22, glow: 0 }));
  root.add(plinth(rd, { led: HEX.idle, ledA: 0.8 }));

  // the track from A3 into the hall, round the root and out by A4
  const mainPts: [number, number][] = L.track.main_world;
  const i0 = mainPts.findIndex((p) => p[0] >= 200 && p[1] === -140);
  let i1 = i0; while (i1 < mainPts.length - 1 && !(mainPts[i1]![0] === 370 && mainPts[i1]![1] > -146)) i1++;
  const seg = mainPts.slice(i0, i1 + 6);
  const tr = track(seg, fps, { cometSpeed: 26, phase: 3, ledA: 0.32 });
  root.add(tr.group);
  root.add(poleLights(M, seg, fps, { every: 60, from: 40, side: 9, pool: 0.08, poolR: 8 }).group);

  // ── the root: a gold glass disc on a graphite drum, its 316 ticks standing round it as blades of light ─────────
  const C = [358, -200] as const, R0 = 14, RT = 22;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(R0 + 0.5, R0 + 0.9, 0.9, 96).translate(0, 0.45, 0), new THREE.MeshPhysicalMaterial({ color: '#30363d', roughness: 0.42, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
  drum.position.set(C[0], 0.12, C[1]); drum.castShadow = true; drum.receiveShadow = true; root.add(drum);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R0, 128).rotateX(-Math.PI / 2), emissive('#6b5410'));
  disc.position.set(C[0], 1.035, C[1]); root.add(disc);
  const glassDisc = G.pane(2 * R0, 2 * R0, { r: R0, rimW: 1.4, tint: HEX.bnb, tintA: 0.42, refract: 0.05, frost: 0.2, spec: 1.1 });
  glassDisc.geometry.rotateX(-Math.PI / 2); glassDisc.position.set(C[0], 1.06, C[1]); root.add(glassDisc);
  const discRing = line(Array.from({ length: 129 }, (_, k) => [C[0] + Math.cos((k / 128) * Math.PI * 2) * (R0 + 0.45), 1.045, C[1] + Math.sin((k / 128) * Math.PI * 2) * (R0 + 0.45)] as Vec3),
    { color: HEX.bnb, width: 2, glow: 10, glowA: 0.4, closed: true, reveal: false, renderOrder: 6 });
  root.add(discRing);
  // one tick a leaf, standing: the ring closed
  const ticks: Vec3[][] = [];
  for (let k = 0; k < sd.leaf_count; k++) {
    const a = (k / sd.leaf_count) * Math.PI * 2, x = C[0] + Math.cos(a) * RT, z = C[1] + Math.sin(a) * RT;
    ticks.push([[x, 0.15, z], [x, k % 10 === 0 ? 1.7 : 1.1, z]]);
  }
  const tickMarks = lines(ticks, { color: HEX.bnb, width: 1.1, opacity: 0.8, reveal: false, renderOrder: 6, caps: false });
  root.add(tickMarks);
  const tickRing = line(Array.from({ length: 161 }, (_, k) => [C[0] + Math.cos((k / 160) * Math.PI * 2) * RT, 0.16, C[1] + Math.sin((k / 160) * Math.PI * 2) * RT] as Vec3),
    { color: HEX.bnb, width: 1.2, opacity: 0.7, closed: true, reveal: false, renderOrder: 5 });
  root.add(tickRing);
  const hallGlow = glow(HEX.bnb, 70, 0.15); hallGlow.position.set(C[0], 0.14, C[1]); root.add(hallGlow);
  const rootGlow = glow(HEX.bnb, 36, 0.3); rootGlow.position.set(C[0], 0.8, C[1]); root.add(rootGlow);

  // ── the barrier across the entry, at the plinth's edge; the gate clock over it ────────────────────────────────
  const B = [283.2, -146.3] as const, hd = (64 * Math.PI) / 180;
  const along = new THREE.Vector3(Math.sin(hd), 0, -Math.cos(hd)), across = new THREE.Vector3(Math.cos(hd), 0, Math.sin(hd));
  const gate = new THREE.Group(); gate.position.set(B[0], 0.12, B[1]); gate.rotation.y = Math.PI - hd; root.add(gate);
  // in the gate's frame: x along the boom (across the track), z along the track (+z toward the hall)
  const paint = new THREE.MeshPhysicalMaterial({ color: '#2c3238', roughness: 0.38, metalness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.18 });
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.7, 0.7).translate(0, 0.85, 0), M.m.galv); post.position.set(sx * 7.4, 0, 0); post.castShadow = true; gate.add(post);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.45, 13.2, 0.45).translate(0, 6.6, 0), M.m.galv); mast.position.set(sx * 8.6, 0, 0.9); mast.castShadow = true; gate.add(mast);
  }
  // the boom on its arm, hinged at the west post: raised while the market is open, down at the gate (LAPSE.gate)
  const HINGE = [-7.4, 1.18] as const;
  const arm = new THREE.Group(); arm.position.set(HINGE[0], HINGE[1], 0); gate.add(arm);
  const onArm = (o: THREE.Object3D, x: number, y: number, z: number) => { o.position.set(x - HINGE[0], y - HINGE[1], z); arm.add(o); };
  const boom = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.26, 0.3), paint); onArm(boom, 0, 1.18, 0); boom.castShadow = true;
  const boomGlass = G.pane(14.2, 0.34, { r: 0.12, rimW: 0.08, tintA: 0.1 }); onArm(boomGlass, 0, 1.18, -0.17); boomGlass.rotation.y = Math.PI;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.07, 0.03), emissive(HEX.bnb)); onArm(hair, 0, 1.34, -0.16);
  const flare = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.09, 0.03), emissive(HEX.refused)); onArm(flare, 0, 1.03, -0.16);
  const flareGlow = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.4), new THREE.MeshBasicMaterial({ color: exactColor(THREE, HEX.refused), transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
  flareGlow.material.alphaMap = (glow(HEX.refused, 1, 1).material as THREE.MeshBasicMaterial).alphaMap; flareGlow.material.opacity = 0.42;
  onArm(flareGlow, 0, 1.1, -0.3); flareGlow.rotation.y = Math.PI; flareGlow.userData.overlay = true; flareGlow.userData.noAO = true;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(17.6, 0.55, 0.5), M.m.galv); beam.position.set(0, 12.9, 0.9); beam.castShadow = true; gate.add(beam);
  // the gate's lit edges: BNB-yellow light bars up the masts' inner faces and under the beam, each with a soft glow
  // standing behind it, so the frame reads at a glance at night (the hairlines of the first cut read as dark posts)
  const edgeMat = emissive(HEX.bnb);
  const bar = (w: number, h: number, a: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: exactColor(THREE, HEX.bnb), alphaMap: (glow(HEX.bnb, 1, 1).material as THREE.MeshBasicMaterial).alphaMap,
      transparent: true, opacity: a, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.userData.overlay = true; m.userData.noAO = true; m.renderOrder = 3; m.rotation.y = Math.PI; return m;
  };
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.16, 12.4, 0.16), edgeMat); e.position.set(sx * 8.33, 6.4, 0.6); gate.add(e);
    const g = bar(1.1, 14.6, 0.26); g.position.set(sx * 8.33, 6.4, 0.4); gate.add(g);
  }
  const under = new THREE.Mesh(new THREE.BoxGeometry(16.6, 0.16, 0.16), edgeMat); under.position.set(0, 12.56, 0.6); gate.add(under);
  const underGlow = bar(18.4, 1.0, 0.26); underGlow.position.set(0, 12.56, 0.4); gate.add(underGlow);
  const topEdge = new THREE.Mesh(new THREE.BoxGeometry(17.6, 0.12, 0.12), edgeMat); topEdge.position.set(0, 13.22, 0.62); gate.add(topEdge);
  const late = sd.late_seal.attempts.find((a: any) => a.chain_id === 56);
  const clockText = CT(late.chain_time.ct).replace(' CT', '');
  // the market clock through the time-lapse, from the sealed day's own stamps (frame-data.json sealed_day: plan_time,
  // the receipts' block times, the gate, the late attempt's chain time): unix seconds at each knot, CT on the face
  const U = { made: sd.plan_time.unix as number, sealed: main.block_time.unix as number, test: test.block_time.unix as number, gate: sd.gate.unix as number, late: late.chain_time.unix as number };
  const ctOffset = sodOf(sd.gate.ct) - (((U.gate % 86400) + 86400) % 86400);
  const marketAt = (t: number) => {
    const L = LAPSE;
    if (t <= L.made) return U.made;
    if (t <= L.sealed) return U.made + (U.sealed - U.made) * easeOut((t - L.made) / (L.sealed - L.made));
    if (t <= L.hold) return U.sealed;
    if (t <= L.tick) return U.sealed + (t - L.hold);
    const ticked = U.sealed + (L.tick - L.hold);
    if (t <= L.preGate) return ticked + (U.gate - 4 - ticked) * easeInOut((t - L.tick) / (L.preGate - L.tick));
    if (t <= L.gate) return U.gate - 4 + 4 * ((t - L.preGate) / (L.gate - L.preGate));
    if (t <= L.late) return U.gate + (U.late - U.gate) * ((t - L.gate) / (L.late - L.gate));
    return U.late;
  };
  // the frame time at which the market clock reaches a stamp (the testnet's receipt falls inside the fast-forward)
  const lapseAt = (u: number) => { let a: number = LAPSE.made, b: number = LAPSE.late; for (let i = 0; i < 48; i++) { const m = (a + b) / 2; if (marketAt(m) < u) a = m; else b = m; } return b; };
  const tTest = lapseAt(U.test);
  // the gate clock, half again as large as the first cut's (8.4 x 2.4 m): its digits read at a glance in the 90 s cut;
  // its foot bar teal while the market is open, red from the gate
  const CLOCK = { w: 13.0, h: 3.7, y: 15.4 };
  const face = { text: clockText, bar: '#e5534b' };
  const drawClock = (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = '#0d1117'; g.fillRect(0, 0, W, H);
    g.fillStyle = face.bar; g.fillRect(0, H - 18, W, 18);
    g.textBaseline = 'middle'; g.textAlign = 'right'; g.fillStyle = '#ffffff';
    g.font = `700 ${Math.round(H * 0.58)}px SFMono-Regular, Menlo, monospace`;
    g.fillText(face.text, W * 0.835, H * 0.47);
    g.textAlign = 'left'; g.font = `600 ${Math.round(H * 0.22)}px "Libre Franklin Brand", sans-serif`; g.fillStyle = '#c9ced3'; g.fillText('CT', W * 0.86, H * 0.54);
  };
  const clock = screen(CLOCK.w, CLOCK.h, 120, drawClock);
  clock.position.set(0, CLOCK.y, 0.62); clock.rotation.y = Math.PI; gate.add(clock);
  const clockMap = (clock.material as THREE.MeshBasicMaterial).map!;
  const setFace = (text: string, bar: string) => {
    if (text === face.text && bar === face.bar) return;
    face.text = text; face.bar = bar;
    const c = clockMap.image as HTMLCanvasElement;
    drawClock(c.getContext('2d')!, c.width, c.height);
    clockMap.needsUpdate = true;
  };
  const housing = new THREE.Mesh(new THREE.BoxGeometry(CLOCK.w + 0.6, CLOCK.h + 0.6, 0.5), paint); housing.position.set(0, CLOCK.y, 0.9); gate.add(housing);
  

  // ── the late plan: a capsule of liquid glass over a graphite chassis, stopped 12 m short, its core refused red ──
  const cap = new THREE.Group(); cap.position.set(270.1, 0.12, -141.6);
  cap.rotation.y = -((77 * Math.PI) / 180) + Math.PI / 2; root.add(cap);
  const chassis = new THREE.Mesh(lozenge(3.0, 1.55, 0.26, 0.7, 0.08), new THREE.MeshPhysicalMaterial({ color: '#23292f', roughness: 0.35, metalness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
  chassis.position.y = 0.06; chassis.castShadow = true; cap.add(chassis);
  // a slim light bar under the glass, not a solid red body: the capsule reads as glass with its core turned red
  const core = new THREE.Mesh(lozenge(2.0, 0.42, 0.2, 0.2, 0.07), emissive(HEX.refused)); core.position.y = 0.36; cap.add(core);
  const shellGeo = lozenge(2.8, 1.4, 0.62, 0.7, 0.26);
  const shell = G.shell(shellGeo, { size: [3, 1.5], tintA: 0.1, refract: 0.06, frost: 0.08, spec: 1.2, rimW: 0.03 }); shell.position.y = 0.24; cap.add(shell);
  const capGlow = glow(HEX.refused, 4.4, 0.24); capGlow.position.set(270.1, 0.15, -141.6); root.add(capGlow);
  const redLamp = counted(new THREE.PointLight(exactColor(THREE, '#ff6b5e'), 5, 9, 2)); redLamp.position.set(271.2, 1.2, -142.4); root.add(redLamp);
  // the plan's last meters, dimming behind it
  const trail: Vec3[] = []; for (let k = 0; k <= 24; k++) { const t = k / 24; trail.push([270.1 - along.x * 14 * (1 - t) - 0.0, 0.16, -141.6 - along.z * 14 * (1 - t)]); }
  const wake = line(trail, { color: HEX.refused, width: 2, glow: 8, glowA: 0.3, fade: [10, 0], reveal: false, renderOrder: 6 });
  root.add(wake);
  // its arrival in the time-lapse: from the gate it drives in along the track's centerline (36 m of it, easing out)
  // to where it stands, and is refused at the late attempt's time; its core white until then, red after
  const STOP = { x: 270.1, z: -141.6, yaw: cap.rotation.y };
  const lane: [number, number][] = resample(seg.slice(0, seg.findIndex((p) => p[0] >= STOP.x - 1)), 0.5);
  lane.push([STOP.x, STOP.z]);
  const laneLen: number[] = [0]; for (let i = 1; i < lane.length; i++) laneLen.push(laneLen[i - 1]! + Math.hypot(lane[i]![0] - lane[i - 1]![0], lane[i]![1] - lane[i - 1]![1]));
  const RUN = 36, laneEnd = laneLen[laneLen.length - 1]!;
  const onLane = (s: number) => {
    const d = Math.max(0, Math.min(laneEnd, s));
    let i = 1; while (i < lane.length - 1 && laneLen[i]! < d) i++;
    const a = lane[i - 1]!, b = lane[i]!, f = (d - laneLen[i - 1]!) / Math.max(1e-6, laneLen[i]! - laneLen[i - 1]!);
    return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, yaw: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) };
  };
  const capMats = { core: core.material as THREE.MeshBasicMaterial, glow: capGlow.material as THREE.MeshBasicMaterial };
  const refusedCore = capMats.core.color.clone(), refusedGlow = capMats.glow.color.clone();
  const liveCore = new THREE.Color(HEX.pole), liveGlow = exactColor(THREE, HEX.pole);
  const lampFull = redLamp.intensity, lampAt = redLamp.position.clone().sub(new THREE.Vector3(STOP.x, 0, STOP.z));

  // ── the receipt pylons: graphite slabs with a lit receipt behind liquid glass, BSC and BSC testnet ─────────────
  const faces = (241.5 * Math.PI) / 180;
  const pylon = (x: number, z: number, r: any) => {
    const g = new THREE.Group(); g.position.set(x, 0.12, z); g.rotation.y = -faces; root.add(g);
    const base = new THREE.Mesh(new THREE.BoxGeometry(8, 0.8, 2.4).translate(0, 0.4, 0), paint); base.castShadow = true; base.receiveShadow = true; g.add(base);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(6.6, 25.2, 0.9).translate(0, 13.4, 0), paint); slab.castShadow = true; g.add(slab);
    const t = r.block_time.ct.replace(/^\d{4}-\d{2}-\d{2} /, '');
    const scr = screen(5.6, 23.4, 64, (c, W, H) => {
      c.fillStyle = '#0d1117'; c.fillRect(0, 0, W, H);
      c.fillStyle = HEX.bnb; c.fillRect(0, 0, 10, H);
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillStyle = '#969ca3'; c.font = `600 ${Math.round(W * 0.075)}px "Libre Franklin Brand", sans-serif`;
      c.fillText(r.chain_id === 56 ? 'BNB SMART CHAIN' : 'BNB SMART CHAIN TESTNET', W * 0.1, H * 0.08);
      c.fillStyle = HEX.bnb; c.font = `600 ${Math.round(W * 0.3)}px SFMono-Regular, Menlo, monospace`;
      c.fillText(fmt.int(r.seconds_before_gate), W * 0.08, H * 0.28);
      c.fillStyle = '#e6e8ea'; c.font = `500 ${Math.round(W * 0.075)}px "Libre Franklin Brand", sans-serif`;
      c.fillText('seconds before the gate', W * 0.1, H * 0.335);
      c.fillStyle = '#2b3036'; c.fillRect(W * 0.1, H * 0.39, W * 0.8, 3);
      const row = (k: string, v: string, y: number) => {
        c.fillStyle = '#969ca3'; c.font = `500 ${Math.round(W * 0.06)}px "Libre Franklin Brand", sans-serif`; c.fillText(k, W * 0.1, y);
        c.fillStyle = '#f6f7f8'; c.font = `600 ${Math.round(W * 0.085)}px SFMono-Regular, Menlo, monospace`; c.fillText(v, W * 0.1, y + W * 0.11);
      };
      row('block', fmt.int(r.block), H * 0.46); row('committed', t, H * 0.56); row('root', fmt.short(r.root), H * 0.66); row('leaves', String(r.leaf_count), H * 0.76);
      c.fillStyle = '#2ec7a6'; c.beginPath(); c.arc(W * 0.13, H * 0.93, W * 0.03, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#c9ced3'; c.font = `500 ${Math.round(W * 0.06)}px "Libre Franklin Brand", sans-serif`; c.fillText('receipt read back', W * 0.2, H * 0.93 + W * 0.02);
    });
    scr.position.set(0, 13.4, -0.47); scr.rotation.y = Math.PI; g.add(scr);
    const pane = G.pane(6.2, 24.8, { r: 0.5, rimW: 0.5, tintA: 0.08, refract: 0.03, frost: 0.06, spec: 1.0 }); pane.position.set(0, 13.4, -0.62); pane.rotation.y = Math.PI; g.add(pane);
    const foot = glow(HEX.bnb, 22, 0.14); foot.position.set(x, 0.14, z); root.add(foot);
    receipts.push({ screen: scr.material as THREE.MeshBasicMaterial, foot: foot.material as THREE.MeshBasicMaterial });
    return g;
  };
  // each pylon dark until its receipt's block time in the time-lapse, then lit (its screen and the pool at its foot)
  const receipts: { screen: THREE.MeshBasicMaterial; foot: THREE.MeshBasicMaterial }[] = [];
  pylon(440, -232, main); pylon(452, -186, test);

  // floodlights on the gate from the approach, cool white, two from the track's sides: the masts, beam and housing
  // read as lit hardware instead of silhouettes; a warm wash over the hall from behind the ring
  const flood = (x: number, y: number, z: number, tx: number, ty: number, tz: number, i: number, hex = '#e6eefa', angle = 0.42) => {
    const sp = counted(new THREE.SpotLight(exactColor(THREE, hex), i, 90, angle, 0.7, 1.6)); sp.position.set(x, y, z); sp.target.position.set(tx, ty, tz);
    root.add(sp, sp.target);
  };
  const gx = (k: number, a: number, y: number): [number, number, number] => [B[0] + along.x * k + across.x * a, y, B[1] + along.z * k + across.z * a];
  for (const a of [-11, 11]) { const p = gx(-16, a, 4.5), t = gx(0, a * 0.15, 8.5); flood(p[0], p[1], p[2], t[0], t[1], t[2], 1400); }
  { const p = gx(-10, 0, 1.2), t = gx(0, 0, 14); flood(p[0], p[1], p[2], t[0], t[1], t[2], 700, '#e6eefa', 0.32); }
  flood(C[0] + 30, 22, C[1] - 30, C[0], 0, C[1], 2600, HEX.tungsten, 0.5);
  const apronWash = glow('#cfdcee', 46, 0.07); apronWash.position.set(B[0] - along.x * 10, 0.14, B[1] - along.z * 10); root.add(apronWash);

  finish(ctx, root, M);
  nightRig(stage, [120, 420]);
  // the night raised for this frame: the moon and the sky's fill brighter, so the apron and the hall read at a glance
  stage.setLight({ key: { color: '#93a8d4', intensity: 0.62 }, rim: { color: '#7f95c0', intensity: 0.34 },
    fill: { sky: '#4f6388', ground: '#1b1914', intensity: 0.78 }, env: 0.14, shadow: 0.2 });
  stage.setFade({ center: [0.5, 0.5], screen: [3, 4], world: [500, 900], worldCenter: [330, -190] });
  stage.setAO({ radius: 0.6, scale: 1.1, thickness: 1.0, samples: 16 });
  stage.setKey({ az: 150, el: 34, center: [340, 4, -190], radius: 110, rimAz: 320 });
  stage.setShadowAuto(true);

  // raised from the storyboard's 3.6 m to 9 m and drawn back 15 m: the capsule clears the caption, the clock its
  // top edge, and the ring reads as a ring
  const cam = poseFrom([236, 9, -118], [318, 2, -182], 36, [0.06, 0]);
  const gateCt = CT(sd.gate.ct);
  const notes = sd.late_seal.attempts.map((a: any) => `${a.network} at ${CT(a.chain_time.ct)} (${a.seconds_after_gate} s after)`).join(' and ');

  // ── the time-lapse's states at frame time t: every value is the still's at the rest (LAPSE.rest) ─────────────────
  const opa = (o: THREE.Object3D) => (o as THREE.Mesh).material as THREE.Material;
  const base = {
    disc: (disc.material as THREE.MeshBasicMaterial).color.clone(), hall: opa(hallGlow).opacity, rootGlow: opa(rootGlow).opacity,
    discRing: opa(discRing).opacity, ticks: opa(tickMarks).opacity, tickRing: opa(tickRing).opacity, flareGlow: opa(flareGlow).opacity,
    screens: receipts.map((r) => r.screen.color.clone()), feet: receipts.map((r) => r.foot.opacity), wake: opa(wake).opacity,
  };
  /** The boom raised while the market is open: 58 degrees keeps its tip under the clock. */
  const RAISED = (58 * Math.PI) / 180;
  const pose = (t: number) => {
    setFace(hms(marketAt(t) + ctOffset), t < LAPSE.gate ? '#2ec7a6' : '#e5534b');
    // the seal: the ring, the root and the hall's gold come up from dim, with a flash as the root lands on chain
    const sealK = smooth((t - LAPSE.sealed) / 0.25);
    const flash = t >= LAPSE.sealed && t < LAPSE.sealed + 3 ? smooth((t - LAPSE.sealed) / 0.12) * Math.exp(-(t - LAPSE.sealed) / 0.45) : 0;
    const gold = 0.38 + 0.62 * sealK;
    (disc.material as THREE.MeshBasicMaterial).color.copy(base.disc).multiplyScalar(gold + 0.9 * flash);
    opa(hallGlow).opacity = base.hall * (gold + 1.2 * flash);
    opa(rootGlow).opacity = base.rootGlow * (gold + 1.2 * flash);
    opa(discRing).opacity = base.discRing * (0.45 + 0.55 * sealK);
    opa(tickMarks).opacity = base.ticks * (0.5 + 0.5 * sealK);
    opa(tickRing).opacity = base.tickRing * (0.5 + 0.5 * sealK);
    // each receipt's pylon lights at its block time
    receipts.forEach((r, i) => {
      const on = smooth((t - (i === 0 ? LAPSE.sealed : tTest)) / 0.3);
      if (on >= 1) r.screen.color.copy(base.screens[i]!); else r.screen.color.copy(base.screens[i]!).multiplyScalar(0.1 + 0.9 * on);
      r.foot.opacity = base.feet[i]! * on;
    });
    // the gate: the boom comes down at 10:00:00 and its red bar lights once it is down
    const down = easeInOut((t - LAPSE.gate) / 0.5);
    arm.rotation.z = down >= 1 ? 0 : (1 - down) * RAISED;
    const shut = smooth((t - (LAPSE.gate + 0.45)) / 0.15);
    flare.visible = shut > 0.5;
    opa(flareGlow).opacity = base.flareGlow * shut;
    // the late plan: in along the track from the gate, stopped short, refused at 10:00:22
    const shown = t >= LAPSE.arrive;
    cap.visible = shown; capGlow.visible = shown; wake.visible = shown;
    if (shown) {
      const s = laneEnd - RUN * (1 - easeOut((t - LAPSE.arrive) / (LAPSE.stop - LAPSE.arrive)));
      const p = t >= LAPSE.stop ? STOP : onLane(s);
      cap.position.set(p.x, 0.12, p.z); cap.rotation.y = p.yaw;
      capGlow.position.set(p.x, 0.15, p.z);
      redLamp.position.set(p.x + lampAt.x, lampAt.y, p.z + lampAt.z);
    }
    const no = smooth((t - LAPSE.late) / 0.15);
    if (no >= 1) { capMats.core.color.copy(refusedCore); capMats.glow.color.copy(refusedGlow); }
    else { capMats.core.color.copy(liveCore).lerp(refusedCore, no); capMats.glow.color.copy(liveGlow).lerp(refusedGlow, no); }
    redLamp.intensity = lampFull * no;
    opa(wake).opacity = base.wake * no;
  };
  /** The plates each moment brings in (the receipts at their block times, the refusal at the late attempt's); the
   *  others stand from the start. All are laid out as the still has them, so none moves as another comes in. */
  const plateAt: Record<string, number> = { bsc: LAPSE.sealed, test: tTest, refused: LAPSE.late };
  let plateEls: { id: string; els: (HTMLElement | SVGElement)[] }[] = [];
  let lastT: number = LAPSE.rest;
  const showPlates = (t: number) => {
    for (const { id, els } of plateEls) {
      const k = smooth((t - plateAt[id]!) / 0.3);
      for (const e of els) e.style.opacity = k >= 1 ? '' : k.toFixed(3);
    }
  };
  return {
    time: LAPSE.rest,
    note: `Real: the root ${sd.root} over ${sd.leaf_count} leaves (one tick a leaf), both receipts (frame-data.json sealed_day.receipts: BSC block ${fmt.int(main.block)} at ${CT(main.block_time.ct)}, ${fmt.int(main.seconds_before_gate)} s before the gate; testnet block ${fmt.int(test.block)} at ${CT(test.block_time.ct)}, ${fmt.int(test.seconds_before_gate)} s before), GateRecord ${main.contract} and the refusal ${sd.late_seal.error_text} from the rule "${sd.late_seal.rule}". The late seal was simulated through the commit script, never mined: ${notes}. The capsule is a drawing of that refused call; the clock shows the mainnet attempt's chain time. The frame's clock plays the day as a time-lapse ending at this still: the plans made at ${CT(sd.plan_time.ct)} (sealed_day.plan_time), sealed at ${CT(main.block_time.ct)}, the testnet receipt at ${CT(test.block_time.ct)}, the gate at ${gateCt}, the late attempt at ${CT(late.chain_time.ct)}; only the pace between those times is the film's. Illustrative: the hall's architecture, lights and comets, the boom raised before the gate and the late plan's drive in.`,
    update(t) {
      stage.setCamera(cam); detail(ctx, M); pulse(root, t - COMETS); pose(t);
      // the root lands on chain: the stamp, as the clock runs on through it, or as the frame is first drawn a moment
      // after it (the site's leg in fades it in just then); never on a step back or a jump to a rest
      const ran = t > lastT && t - lastT < 0.5 && lastT < LAPSE.sealed && t >= LAPSE.sealed;
      const cameIn = lastT - t > 0.5 && t >= LAPSE.sealed && t < LAPSE.sealed + 0.15;
      if (ran || cameIn) sound.stamp();
      lastT = t; showPlates(t);
    },
    decorate() {
      const p = ctx.plates;
      litType(ctx);
      const cap = caption(ctx, { head: 'Plans sealed before the market closes', flavor: 'parc fermé',
        line: `Sealed ${fmt.int(main.seconds_before_gate)} s before ERCOT's 10:00 CT close. The contract computes the close itself; a seal at or after it reverts.` });
      const scope = p.scope(`Receipts read back from GateRecord on BSC (56) and BSC testnet (97). The late seal is the commit script's simulated call; nothing was mined.`);
      const at = (x: number, y: number, z: number): Vec3 => [x, y, z];
      const texts = {
        root: `Root ${fmt.short(sd.root)} · ${sd.leaf_count} plans`,
        // the seconds before the close are the caption's and the pylons' own big figures; the plates keep block and time
        bsc: `BSC · block ${fmt.int(main.block)} · sealed ${CT(main.block_time.ct)}`,
        test: `BSC testnet · sealed ${CT(test.block_time.ct)}`,
        clock: (() => { const y = yours(Number(sd.gate.unix), { film: inFilm(ctx.plates.root) }); return `Market close ${gateCt}${y ? ` · ${y}` : ''}`; })(),
        refused: `${CT(late.chain_time.ct)} · refused: ${sd.late_seal.error_text}`,
        contract: `GateRecord ${fmt.short(main.contract)} · source verified`,
      };
      const clockBox = rectOf(ctx, boxCorners([B[0] + along.x * 0.9, CLOCK.y, B[1] + along.z * 0.9], [CLOCK.w / 2 + 0.3, CLOCK.h / 2 + 0.3, 0.3], Math.PI - hd), 4);
      const pylBox = (x: number, z: number) => rectOf(ctx, boxCorners([x, 13.4, z], [3.4, 13.4, 0.5], -faces), 8);
      const avoid = [pylBox(440, -232), pylBox(452, -186)];
      p.leaders([
        { id: 'refused', text: texts.refused, at: at(270.1, 1.1, -141.6), priority: 0 },
        // the clock's dot just over its housing's top left (a dot inside the clock's keep-out would drop the plate)
        { id: 'clock', text: texts.clock, at: [B[0] - across.x * 5.6 + along.x * 0.6, CLOCK.y + CLOCK.h / 2 + 1.2, B[1] - across.z * 5.6 + along.z * 0.6], priority: 1 },
        { id: 'root', text: texts.root, at: at(C[0], 0.8, C[1] + 6), priority: 2 },
        { id: 'bsc', text: texts.bsc, at: [440, 20.5, -232], priority: 3 },
        { id: 'test', text: texts.test, at: [452, 23.5, -186], priority: 4 },
        { id: 'contract', text: texts.contract, at: [B[0] + across.x * 7.4, 1.9, B[1] + across.z * 7.4], priority: 5 },
      ], { keepOut: [clockBox, ...(scope ? [scope] : []), ...(cap ? [cap] : [])], avoid, max: 6 });
      livery(ctx, { [texts.root]: 'sealed', [texts.bsc]: 'sealed', [texts.test]: 'sealed', [texts.clock]: 'sealed', [texts.contract]: 'sealed', [texts.refused]: 'refused' });
      // the plates that come in with the time-lapse, each with its leader: the kit's layer draws a plate's leg, halo and
      // dot as three SVG children, in the plates' order
      const host = p.root.querySelector(':scope > .intro-labels'), svg = host?.querySelector(':scope > svg');
      const byText = new Map(Object.entries(texts).map(([id, text]) => [text, id]));
      plateEls = [];
      Array.from(host?.querySelectorAll<HTMLElement>(':scope > .intro-plate') ?? []).forEach((el, i) => {
        const id = byText.get(el.firstChild?.textContent ?? '');
        if (!id || !(id in plateAt)) return;
        plateEls.push({ id, els: [el, ...(svg ? (Array.from(svg.children).slice(3 * i, 3 * i + 3) as SVGElement[]) : [])] });
      });
      showPlates(lastT);
    },
  };
}
