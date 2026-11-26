// @ts-nocheck
// Object stills for the site's tabs: a rig, not a storyboard frame. Each frame stands one object the stations already
// model, built by that station's own code from the same frame data, alone on the stage's dark ground, the camera fitted
// to it. The site shows them as rendered stills (site/public/renders/, each with its receipt), never as live WebGL. Words
// stay out of the picture (render with --plates 0): the page beside the still says what it is.
//
//   _objects.agent-<role>  the agents' instruments as the garage stands them (stations/garage/bays.ts, workshop.ts):
//                          the Forecaster's chart wall, the State keeper's battery column, the Market reader's file wall,
//                          the Hedger's strip, the Risk officer's coin board, the Planner's three boards, the
//                          evaluator's bench of ten check lamps
//   _objects.stack-<piece>  one piece of the stack (stations/stack/space.ts) in its place: the stack's rest camera, its
//                          lens narrowed onto the piece (as stack.cube-check crops the cube), the rest of the stack as
//                          it stands round it
//   _objects.battery-cells  Desert Willow's enclosure kind (kit/enclosure.ts, the intro's), opened: the roof lifted, the
//                          front wall slid out, one module pulled onto its cart with its lid up over the cells
//   _objects.chapter-<key>  a chapter of the introduction at its rest, as the story's beat holds it (story/beats.ts):
//                          the station's own frame and camera, at the beat's local time
import * as THREE from 'three';
import { createMaterials } from '../../kit/materials';
import { ensureBase } from '../../kit/geo';
import { setLineResolution } from '../../kit/region/flows';
import { GrabPass } from '../../kit/hedge/fields';
import { assignLayers } from '../../lib/stage';
import { forecastWall, socColumn, fileWall, setupStrip, coinBoard, strategyBoards } from '../garage/bays';
import { buildWorkshop, faceCamera } from '../garage/workshop';
import { buildEnclosure } from '../../kit/enclosure';
import { GrabBlurPass, markTexture } from '../stack/kit';
import { buildSpace } from '../stack/space';
import { injectCss } from '../stack/dom';
import { stageLook, fitRest } from '../stack/common';
import { frames as grid } from '../grid/index';
import { frames as world } from '../world/index';
import { frames as towers } from '../towers/index';
import type { FrameContext, FrameHandle, StationModule } from '../types';

/** The cards' ground: the garage's night (garage/index.ts lit), the floor a shade under the backdrop's horizon. */
const NIGHT = { top: '#0d1012', horizon: '#171b1f', bottom: '#111417', glow: '#1d2328', ground: '#121518' };

function darkStage(ctx: FrameContext, { key = 1.5, fill = 1.1, env = 0.42, shadow = 0.4 } = {}) {
  const { stage } = ctx;
  stage.setBackdrop(NIGHT);
  stage.setLight({ key: { color: '#f3f1ec', intensity: key }, rim: { color: '#a9bfe0', intensity: 0.6 }, fill: { sky: '#9db2d0', ground: '#3b3730', intensity: fill }, env, shadow });
  stage.setGround(NIGHT.ground);
}

/** The camera fitted to a box: from compass azimuth az (target to camera) and down-angle el, the distance at which the
 *  box's eight corners all fall inside the frame less a margin (stage fractions), on a vertical lens of vfov degrees. */
function fitPose(stage, box: THREE.Box3, { az, el, vfov = 30, margin = 0.1, shift = [0, 0], lift = 0 }) {
  const c = box.getCenter(new THREE.Vector3());
  const target: [number, number, number] = [c.x, c.y + lift, c.z];
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const fits = (dist: number) => {
    stage.setCamera({ target, az, el, dist, vfov, shift, near: 0.2, far: 4000 });
    stage.camera.updateMatrixWorld();
    return corners.every((p) => { const q = p.clone().project(stage.camera); return q.z < 1 && Math.abs(q.x) <= 1 - margin * 2 && Math.abs(q.y) <= 1 - margin * 2; });
  };
  let lo = 0.5, hi = 4000;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  return { target, az, el, dist: hi, vfov, shift, near: 0.2, far: Math.max(400, hi * 6) };
}

interface Built { group: THREE.Object3D; box?: THREE.Box3; billboards?: boolean }
interface Shot { az: number; el: number; vfov?: number; margin?: number; shift?: [number, number]; lift?: number; key?: { az: number; el: number; intensity?: number }; light?: Parameters<typeof darkStage>[1] }

/** One object alone on the dark ground: built, lit, the camera fitted, posed at t 0 (the instruments hold still). */
function objectFrame(note: string, shot: Shot, build: (ctx: FrameContext, kit: { M: any; grab: any; res: THREE.Vector2 }) => Built) {
  return async (ctx: FrameContext): Promise<FrameHandle> => {
    const { stage, theme, width: W, height: H, dpr } = ctx;
    ctx.needData();
    darkStage(ctx, shot.light);
    const M = createMaterials(THREE, theme);
    const grab = new GrabPass(W * dpr, H * dpr);
    stage.insertBeforeOverlay(grab);
    const res = new THREE.Vector2(W * dpr, H * dpr);
    stage.renderer.localClippingEnabled = true;
    const b = build(ctx, { M, grab, res });
    const root = new THREE.Group(); root.name = 'object';
    root.add(b.group);
    assignLayers(root);
    ensureBase(THREE, root);
    M.farNormals?.(stage.gtao.normalMaterial);
    stage.scene.add(root);
    root.updateMatrixWorld(true);
    setLineResolution(root, W, H, dpr);
    const box = b.box ?? new THREE.Box3().setFromObject(b.group);
    const pose = fitPose(stage, box, shot);
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) * 0.75 + 4;
    stage.setKey({ az: shot.key?.az ?? pose.az + 40, el: shot.key?.el ?? 52, center: [c.x, 0, c.z], radius: r, intensity: shot.key?.intensity ?? 1.2, rimAz: pose.az + 200 });
    stage.setFade({ center: [0.5, 0.55], screen: [0.6, 1.1], world: [r * 1.2, r * 3.2], worldCenter: [c.x, c.z], glow: null });
    stage.setAO({ radius: Math.max(0.6, r / 30), scale: 1.0, thickness: Math.max(1, r / 18), samples: 16, distanceFallOff: 1 });
    stage.setShadowAuto(true);
    // for scripts/spin.mjs, in the lab only: the same picture with the camera swung round the object by swing degrees
    // and back, u in [0, 1) the loop's phase; it resolves once the pose is drawn
    (window as any).__objectSpin = async (u: number, swing = 10) => {
      stage.setCamera({ ...pose, az: pose.az + swing * Math.sin(2 * Math.PI * u) });
      stage.camera.updateMatrixWorld();
      if (b.billboards) faceCamera(root, stage.camera);
      for (let i = 0; i < 3; i++) { stage.requestShadow(); stage.render(); await new Promise((r) => requestAnimationFrame(r)); }
      stage.renderer.getContext().finish();
    };
    return {
      time: 0,
      steps: 2,
      settle: 4,
      note,
      update() {
        stage.setCamera(pose);
        stage.camera.updateMatrixWorld();
        M.detail && (M.detail.value.x = (2 * Math.tan((stage.camera.fov * Math.PI) / 360)) / (H * dpr));
        if (b.billboards) faceCamera(root, stage.camera);
      },
    };
  };
}

/** A piece of the stack in its place: the stack's rest (S01's camera, as stack.rest builds it, without its words), the
 *  lens narrowed and shifted so the piece's own box fills the frame less a margin (stack.cube-check's crop). */
function stackPiece(id: string, note: string, { margin = 0.12, nudge = [0, 0] as [number, number] } = {}) {
  return async (ctx: FrameContext): Promise<FrameHandle> => {
    const { stage, theme, width: W, height: H, dpr } = ctx;
    ctx.needData();
    injectCss();
    stageLook(stage, theme, { seal: false });
    const fit = fitRest(stage, W, H);
    stage.camera.updateMatrixWorld();
    const grab = new GrabBlurPass(W * dpr, H * dpr, { passes: 2, radius: 1.0 });
    stage.insertBeforeOverlay(grab);
    const mark = await markTexture();
    const blankC = document.createElement('canvas'); blankC.width = blankC.height = 4;
    const blank = { texture: new THREE.CanvasTexture(blankC), aspect: 1 };
    const space = await buildSpace(ctx, { theme, mpp: fit.mpp, camera: stage.camera, blur: grab.texture, res: new THREE.Vector2(W * dpr, H * dpr), mark, blank, footprints: false });
    assignLayers(space.root);
    stage.scene.add(space.root);
    setLineResolution(space.root, W, H, dpr);
    space.root.updateMatrixWorld(true);
    const camR = new THREE.Vector3().setFromMatrixColumn(stage.camera.matrixWorld, 0);
    const camU = new THREE.Vector3().setFromMatrixColumn(stage.camera.matrixWorld, 1);
    const camD = new THREE.Vector3().setFromMatrixColumn(stage.camera.matrixWorld, 2).negate();
    space.aimCube(camR, camU, camD, true);
    stage.setShadowAuto(true);
    // the piece's box on screen at the rest camera, in normalized device coordinates
    const p = space.pieces[id];
    if (!p?.picks?.length) throw new Error(`the stack has no piece "${id}" with a box`);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const v = new THREE.Vector3(), box = new THREE.Box3();
    for (const mesh of p.picks) {
      mesh.geometry.computeBoundingBox(); box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(stage.camera);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
    }
    // a narrower lens from the same place: k times the picture, centered on the box (the lens shift is in half-frames)
    const half = Math.max((x1 - x0) / 2, (y1 - y0) / 2), k = (1 - 2 * margin) / half;
    const fov = (2 * Math.atan(Math.tan((fit.pose.vfov * Math.PI) / 360) / k) * 180) / Math.PI;
    const s0 = fit.pose.shift ?? [0, 0];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const pose = { ...fit.pose, vfov: fov, shift: [(-k * (cx - 2 * s0[0])) / 2 + nudge[0], (-k * (cy - 2 * s0[1])) / 2 + nudge[1]] };
    return {
      time: 6.0,
      steps: 30,
      note: `${note} A crop of the stack's rest (S01's camera, ${k.toFixed(1)} times), built by stations/stack/space.ts from frame-data.json and the stack's records; nothing drawn differently.`,
      update(t) {
        stage.setCamera(pose);
        stage.camera.updateMatrixWorld();
        space.pose(t, stage.camera.position);
      },
    };
  };
}

/** A chapter of the introduction at its rest: the station's own frame, posed at the beat's local time. With --plates 0
 *  its words stay out; a frame's own screens drawn as DOM over the canvas (the towers' displays) are left out too. */
function chapter(setup: (ctx: FrameContext) => Promise<FrameHandle>, { local = null as number | null, screens = true, note = '' } = {}) {
  return async (ctx: FrameContext): Promise<FrameHandle> => {
    const h = await setup(ctx);
    if (!screens) ctx.overlay.style.display = 'none';
    return { ...h, time: local ?? h.time ?? 0, note: `${note} ${h.note}`.trim() };
  };
}

/** A chapter at its rest with the lens narrowed onto one object in its picture: rect is that object's part of the frame
 *  (x0, y0, x1, y1, fractions from the top left) as the chapter's own camera frames it. The camera stays where the
 *  chapter puts it; only the lens narrows and shifts (stack.cube-check's crop), so the object is drawn at the shot's
 *  full resolution. The chapters' updates set their camera each time, so the crop is applied once after each. */
function chapterCrop(setup: (ctx: FrameContext) => Promise<FrameHandle>, { local = null as number | null, rect, margin = 0.04, note = '' }: { local?: number | null; rect: [number, number, number, number]; margin?: number; note?: string }) {
  return async (ctx: FrameContext): Promise<FrameHandle> => {
    const h = await setup(ctx);
    const { stage } = ctx;
    const [fx0, fy0, fx1, fy1] = rect;
    const x0 = 2 * fx0 - 1, x1 = 2 * fx1 - 1, y0 = 1 - 2 * fy1, y1 = 1 - 2 * fy0;
    const k = (1 - 2 * margin) / Math.max((x1 - x0) / 2, (y1 - y0) / 2);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const crop = () => {
      const cam = stage.camera, s0 = cam.userData.shift ?? [0, 0];
      cam.fov = (2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) / k) * 180) / Math.PI;
      cam.userData.shift = [(-k * (cx - 2 * s0[0])) / 2, (-k * (cy - 2 * s0[1])) / 2];
      stage.applyProjection();
      cam.updateMatrixWorld();
    };
    return {
      ...h,
      time: local ?? h.time ?? 0,
      note: `${note} The chapter's own camera, its lens narrowed ${k.toFixed(1)} times onto that part of its picture. ${h.note}`.trim(),
      update(t, dt) { h.update?.(t, dt); crop(); },
    };
  };
}

const at0 = { x: 0, z: 0 };
const SOURCE = "frame-data.json (the sealed Nov 26 record: Desert Willow's showcase, plan C)";

export const frames: StationModule['frames'] = {
  // ── the tabs' objects ──────────────────────────────────────────────────────────────────────────────────────────
  '_objects.stack-electronx': stackPiece('electronx', "ElectronX's piece in the stack: its published hourly contract terms, the hedge's instrument.", { margin: 0.1 }),
  '_objects.stack-greenfield': stackPiece('greenfield', "BNB Greenfield's piece in the stack: the sealed day's files in a public bucket, as trays under the record.", { margin: 0.2 }),
  '_objects.stack-gate': stackPiece('gate', "GateRecord's piece in the stack: BNB Chain's cube, where the day's root is committed before the gate.", { margin: 0.1 }),
  '_objects.battery-cells': objectFrame(
    "Desert Willow's enclosure kind as the landing intro builds it (kit/enclosure.ts, about 5 MWh of racks in a 20-ft-class steel enclosure; chemistry not modelled), opened as the intro opens it (explode at 1): the roof lifted, the front wall slid out, one module pulled onto its service cart with its lid up over the cells.",
    { az: 208, el: 20, vfov: 30, margin: -0.03, key: { az: 150, el: 48, intensity: 1.3 }, light: { key: 1.6, fill: 1.15, env: 0.5, shadow: 0.42 } },
    (ctx, { M }) => {
      const enc = buildEnclosure(THREE, { lod: 'hero', theme: ctx.theme, materials: M });
      enc.explode(1);
      enc.group.updateMatrixWorld(true);
      return { group: enc.group, box: new THREE.Box3().setFromObject(enc.group) };
    },
  ),
  '_objects.chapter-sealed': chapter(grid['grid.R02'], { local: 4.0, note: "Chapter 13 at its rest, as the site's story holds it (beats.ts KEYS sealed, local 4.0): Parc fermé at 09:15:17 CT on Nov 25, the root sealed on BNB Chain." }),
  '_objects.chapter-check': chapter(grid['grid.R03-pass'], { note: "Chapter 17 at its rest (beats.ts KEYS check): the sealed copy, every check passing." }),
  '_objects.chapter-starting-grid': chapter(grid['grid.R01'], { note: "Chapter 04 at its rest (beats.ts KEYS starting-grid): every battery planned for tomorrow." }),
  '_objects.chapter-odds': chapter(world['world.W02-radar'], { note: "Chapter 14 at its rest (beats.ts KEYS odds): the weather odds, read after the seal." }),
  '_objects.seal-stamp': chapterCrop(grid['grid.R02'], { local: 4.0, rect: [0.5, 0.11, 0.85, 0.69], note: "The seal's stamp: chapter 13's gate at 09:15:17 CT on Nov 25, its clock, and the sealing ring lit gold as the Nov 26 root lands on BNB Chain." }),
  '_objects.record-coin': chapterCrop(grid['grid.R03-pass'], { rect: [0.33, 0.02, 0.45, 0.19], margin: 0.08, note: "The record coin: chapter 17's gold coin with BNB Chain's symbol, the day's root on BNB Chain, at the top of the proof." }),
  '_objects.radar': chapterCrop(world['world.W02-radar'], { rect: [0.45, 0.22, 0.76, 0.82], note: "The weather radar's screen: chapter 14's sweep over Texas, the weather odds read for Nov 26." }),
  '_objects.chapter-operating-day': chapter(world['world.W03-race-day'], { note: "Chapter 16 at its rest (beats.ts KEYS operating-day): the operating day runs." }),
  '_objects.tower-season': chapter(towers['towers.T02-season'], { screens: false, note: "The season's tower (towers.T02-season) without its display: its words are the Season tab's, read live." }),
  '_objects.tower-launch': chapter(towers['towers.T04-launch-graduate'], { screens: false, note: "The launch tower (towers.T04-launch-graduate) without its display: its words are the Launchpad tab's, read live." }),

  // ── the agents' instruments ────────────────────────────────────────────────────────────────────────────────────
  '_objects.agent-forecaster': objectFrame(
    `The Forecaster's instrument as the garage stands it (garage/bays.ts forecastWall): the hub's and the node's day-ahead forecast as hourly steps over the 301 scenarios' node-price fan (p05 to p95, p25 to p75), plan C's power below. From ${SOURCE}.`,
    { az: 218, el: 9, vfov: 24, margin: 0.04, key: { az: 160, el: 46 } },
    (ctx) => {
      const f = forecastWall(ctx.data, ctx.theme, at0, 64, 13.5);
      f.setResolution(ctx.width * ctx.dpr, ctx.height * ctx.dpr);
      // the wall itself, not its glow
      return { group: f.group, box: new THREE.Box3(new THREE.Vector3(-37, 0, -1.5), new THREE.Vector3(34, 14.6, 3.0)) };
    },
  ),
  '_objects.agent-state-keeper': objectFrame(
    `The State keeper's instrument (garage/bays.ts socColumn): the battery column at the plan's opening 50%, rings at the 5% and 95% limits, plan C's 24 hourly states of charge as one turn of a helix round its sleeve. From ${SOURCE}.`,
    { az: 205, el: 15, vfov: 28, margin: -0.02, key: { az: 140, el: 50 } },
    (ctx, { M }) => ({ group: socColumn(ctx.data, ctx.theme, M, at0).group }),
  ),
  '_objects.agent-market-reader': objectFrame(
    `The Market reader's instrument (garage/bays.ts fileWall): the sealed leaf's 527 input files, one tile each, colored by group and lit by its SHA-256. From ${SOURCE} and garage/files.json.`,
    { az: 222, el: 9, vfov: 24, margin: 0.015, key: { az: 160, el: 45 } },
    // the wall and its frame, not the spill on the floor in front
    (ctx, { M }) => ({ group: fileWall(ctx.theme, M, at0, 70, 12.5).group, box: new THREE.Box3(new THREE.Vector3(-36, 0, -1.2), new THREE.Vector3(36, 15.2, 0.6)) }),
  ),
  '_objects.agent-hedger': objectFrame(
    `The Hedger's instrument (garage/bays.ts setupStrip): plan C's 24 hours as the walkthrough's strip, glass tiles at the hedged hours' assumed entries, the orange dashed outline; its hanging rods cropped at the top. From ${SOURCE}; ElectronX's published terms, the entry price assumed.`,
    { az: 212, el: 22, vfov: 24, margin: 0.015, key: { az: 150, el: 55 } },
    (ctx, { M, grab, res }) => {
      const s = setupStrip(ctx.data, ctx.theme, grab, res, M, at0);
      s.group.updateMatrixWorld(true);
      // the strip and its tiles, not the rods up to the roof
      const box = new THREE.Box3().setFromObject(s.field.group);
      return { group: s.group, box };
    },
  ),
  '_objects.agent-risk-officer': objectFrame(
    `The Risk officer's instrument (garage/bays.ts coinBoard): plan C's 301 scenario totals as coins in $250 slots, colored on the heat ramp, the worst tenth's 31 rimmed, behind liquid glass. From ${SOURCE}.`,
    { az: 338, el: 9, vfov: 28, margin: 0.03, key: { az: 20, el: 50 } },
    (ctx, { M, grab, res }) => ({ group: coinBoard(ctx.data, ctx.theme, grab, res, M, at0).group }),
  ),
  '_objects.agent-planner': objectFrame(
    `The Planner's instrument (garage/bays.ts strategyBoards): the three plans' boards, A (no hedge), B (a hedge on A's schedule) and C (schedule and hedge together), each with its schedule and its 301-scenario spread on one shared axis; C, the sealed plan, edged in BNB yellow. From ${SOURCE}.`,
    { az: 335, el: 7, vfov: 26, margin: 0.015, key: { az: 20, el: 50 } },
    (ctx, { M }) => ({ group: strategyBoards(ctx.data, ctx.theme, M, [-19, 0, 19], 0, 14).group }),
  ),
  '_objects.agent-evaluator': objectFrame(
    "The evaluator's bench as the garage's workshop stands it (garage/workshop.ts): its report's ten check lamps, V1 to V10, lit teal where the check passed and hatched where it was skipped, from frame-data.json sponsors.agent_studio.evaluation. The racks beyond are the workshop's, built and dark.",
    { az: 242, el: 10, vfov: 18, margin: -0.07, shift: [0.04, 0.06], key: { az: 190, el: 50, intensity: 1.0 }, light: { key: 1.1, fill: 1.0, env: 0.3, shadow: 0.4 } },
    (ctx, { M }) => {
      const shop = buildWorkshop(ctx.data, ctx.theme, M, { x: 0, z: 0, len: 60 });
      // the bench and its lamps (the racks stand 20 m north, out of the fit)
      const box = new THREE.Box3(new THREE.Vector3(-30, 0, -1.8), new THREE.Vector3(30, 3.0, 1.8));
      return { group: shop.group, box, billboards: true };
    },
  ),
};
