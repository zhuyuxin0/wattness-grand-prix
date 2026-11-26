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
import * as THREE from 'three';
import { createMaterials } from '../../kit/materials';
import { ensureBase } from '../../kit/geo';
import { setLineResolution } from '../../kit/region/flows';
import { GrabPass } from '../../kit/hedge/fields';
import { assignLayers } from '../../lib/stage';
import { forecastWall, socColumn, fileWall, setupStrip, coinBoard, strategyBoards } from '../garage/bays';
import { buildWorkshop, faceCamera } from '../garage/workshop';
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

const at0 = { x: 0, z: 0 };
const SOURCE = "frame-data.json (the sealed Nov 26 record: Desert Willow's showcase, plan C)";

export const frames: StationModule['frames'] = {
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
