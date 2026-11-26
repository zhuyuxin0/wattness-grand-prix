// @ts-nocheck
// The garage world, built once a frame: the hangar shell (hangar.ts); the six agents' screens, each bay's floor showing
// that agent's own output for the sealed plan and the Planner's three boards at its track edge (displays.ts); each
// bay's instrument standing at its north edge (bays.ts); the workshop with the evaluator's lamps (workshop.ts); and
// Team data's pit under its glass floor (brain.ts). One grab pass serves every glass (the roof's region glass, the
// floor's and the Setup tiles' liquid glass, the coin board's front).
import * as THREE from 'three';
import { createMaterials } from '../../kit/materials';
import { ensureBase } from '../../kit/geo';
import { markTexture } from '../../kit/region/glass';
import { setLineResolution, tickPulses } from '../../kit/region/flows';
import { GrabPass } from '../../kit/hedge/fields';
import { assignLayers } from '../../lib/stage';
import { exactColor } from '../../kit/tone';
import { buildHangar, highBay, stationById } from './hangar';
import { forecastWall, socColumn, fileWall, setupStrip, coinBoard } from './bays';
import { buildWorkshop, faceCamera } from './workshop';
import { buildTeamData, glassFloor, pitLights, dwThread } from './brain';
import { buildDisplays } from './displays';

export type GarageWorld = any;

/** A camera from position and target (the storyboard's form) into the stage's pose (target, azimuth, down-angle). */
export function pose(position, target, vfov, shift = [0, 0]) {
  const dx = position[0] - target[0], dy = position[1] - target[1], dz = position[2] - target[2];
  const dist = Math.hypot(dx, dy, dz);
  return { target, az: (Math.atan2(dx, -dz) * 180) / Math.PI, el: (Math.asin(dy / dist) * 180) / Math.PI, dist, vfov, shift, near: 0.5, far: 4000 };
}

export async function buildWorld(ctx, { lightsFor = 'hangar' } = {}) {
  const { stage, theme, width: W, height: H, dpr } = ctx;
  const d = ctx.needData(), layout = ctx.layout;
  if (!layout) throw new Error('src/data/layout.json is missing: run scripts/sync-data.sh');
  const materials = createMaterials(THREE, theme);
  const grab = new GrabPass(W * dpr, H * dpr);
  stage.insertBeforeOverlay(grab);
  const res = new THREE.Vector2(W * dpr, H * dpr);
  const mark = await markTexture();
  stage.renderer.localClippingEnabled = true;

  const root = new THREE.Group(); root.name = 'garage';
  const hangar = buildHangar({ layout, theme, grab, res, mark, materials, dpr });
  root.add(hangar.group);

  // the agents' screens: every bay's floor, and the Planner's three boards
  const screens = buildDisplays(ctx, d, materials);
  root.add(screens.group);

  // each bay's instrument at its north edge, clear of its floor screen: the forecast's chart wall, the battery
  // column, the file wall and the coin board turned a little toward the lane's approach from the west; the Setup
  // strip hung over the hedge bay's track edge
  const fp = (id) => stationById(layout, id).footprint;
  const fc = forecastWall(d, theme, { x: -130, z: fp('race-day-forecast').z0 + 4 }, 64, 13.5);
  const col = socColumn(d, theme, materials, { x: 10, z: fp('fuel-and-wear').z0 + 6.5 });
  const files = fileWall(theme, materials, { x: 147, z: fp('spotter').z0 + 4 }, 70, 12.5);
  const setup = setupStrip(d, theme, grab, res, materials, { x: -130, z: fp('setup').z0 + 6 });
  const coins = coinBoard(d, theme, grab, res, materials, { x: 10, z: fp('risk-desk').z0 + 5 });
  const Y = new THREE.Vector3(0, 1, 0);
  const turn = (b, cx, cz, deg) => {
    const pivot = new THREE.Group(); pivot.position.set(cx, 0, cz); pivot.rotation.y = (deg * Math.PI) / 180;
    b.group.position.x -= cx; b.group.position.z -= cz; pivot.add(b.group);
    for (const [k, a] of Object.entries(b.anchors)) if (Array.isArray(a)) { const v = new THREE.Vector3(a[0] - cx, a[1], a[2] - cz).applyAxisAngle(Y, pivot.rotation.y); b.anchors[k] = [v.x + cx, v.y, v.z + cz]; }
    b.group = pivot;
  };
  turn(fc, -130, fp('race-day-forecast').z0 + 4, -14); turn(files, 147, fp('spotter').z0 + 4, -16); turn(coins, 10, fp('risk-desk').z0 + 5, 30);
  for (const b of [fc, col, files, setup, coins]) root.add(b.group);
  const shop = buildWorkshop(d, theme, materials);
  root.add(shop.group);

  const teamFp = stationById(layout, 'team-data').footprint;
  const team = buildTeamData(d, theme, grab, res, materials, teamFp);
  root.add(team.group);
  root.add(glassFloor(theme, grab, res, teamFp));
  const cf = screens.boards.C.foot;
  root.add(dwThread(team.dw, [cf[0], cf[1] + 0.6, cf[2]]));

  // light: a wide wash over every bay so the plinths and screens read, a brighter pool where each instrument stands,
  // the workshop's bench, the racks' aisle (dim: built and dark), the pit's own teal and the back straight's wash
  const lights = new THREE.Group(); lights.name = 'lights';
  const add = (s) => lights.add(s, s.target);
  const bays = ['race-day-forecast', 'fuel-and-wear', 'spotter', 'setup', 'risk-desk', 'pit-wall'];
  for (const id of bays) {
    const f = fp(id), cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2, top = id === 'race-day-forecast' || id === 'fuel-and-wear' || id === 'spotter';
    for (const dx of [-36, 0, 36]) add(highBay(cx + dx, cz, { intensity: 1250, angle: 1.05, penumbra: 1, distance: 120, decay: 1.2, color: '#eef3f8' }));
    add(highBay(cx, top ? f.z0 + 6 : f.z0 + 6, { intensity: id === 'pit-wall' ? 900 : 650, angle: 0.9, penumbra: 1, distance: 110, decay: 1.2, color: '#f3f6fa', tz: top ? f.z0 + 2 : f.z0 + 10 }));
  }
  for (const [x, z] of [[-150, 6], [-120, 6], [-90, 6]]) add(highBay(x, z, { intensity: 900, angle: 0.9, penumbra: 1, color: '#f3f6fa' }));
  add(highBay(-120, -20, { intensity: 420, angle: 1.1, penumbra: 1 }));
  for (const l of pitLights(teamFp, 4)) lights.add(l);
  for (const x of [-120, -40, 40, 120, 200]) add(highBay(x, -175, { intensity: 1100, angle: 1.0, penumbra: 1, tz: -175, color: '#eef3f8' }));
  for (const [x, z] of [[-186, -160], [-150, -176]]) add(highBay(x, z, { intensity: 1000, angle: 1.0, penumbra: 1 }));
  root.add(lights);

  assignLayers(root);
  ensureBase(THREE, root);
  materials.farNormals(stage.gtao.normalMaterial);
  stage.scene.add(root);
  setLineResolution(root, W, H, dpr);
  fc.setResolution(W * dpr, H * dpr);

  const anchors = {
    bench: shop.anchors.bench,
    benchEnd: [-133, 1.1, 7.7],
    racks: shop.anchors.racks,
    lamps: shop.lamps.map((l) => l.at),
    forecast: fc.anchors.east,
    column: col.anchors.top,
    files: files.anchors.top,
    setup: setup.anchors.east,
    coins: coins.anchors.top,
    boards: screens.boards,
    screens: screens.anchors,
    brainTop: team.pos.get('wattness-terminal'),
    dw: team.dw,
  };

  return {
    stage, root, hangar, team, screens, anchors, materials, lights, THREE, exact: (h) => exactColor(THREE, h),
    /** Scale every lamp in the hall (the high bays, the pit's own) for a frame's exposure. */
    scaleLights(k) { lights.traverse((o) => { if (o.isLight) o.intensity *= k; }); },
    /** Pose the camera and everything that moves at time t. */
    pose(cam, t) {
      stage.setCamera(cam);
      materials.detail.value.x = (2 * Math.tan((stage.camera.fov * Math.PI) / 360)) / (H * dpr);
      tickPulses(root, t);
      stage.camera.updateMatrixWorld();
      faceCamera(root, stage.camera);
    },
    /** The six layers' names (tick marks) at the plates' near corner, at the west or the east end of the parts. */
    layerTicks(end = 'west') {
      const east = end === 'east', x = east ? team.span.x1 + 30 : team.span.x0 - 2, z = (teamFp.z0 + teamFp.z1) / 2 + 22;
      return d.terminal_structure.layers.map((name, L) => ({ at: [x, team.layerY(L), z], text: name, align: east ? 'right' : 'left' }));
    },
  };
}
