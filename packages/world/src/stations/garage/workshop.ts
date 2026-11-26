// @ts-nocheck
// The workshop at the garage's south end, under the hub's AGENT STUDIO pill: a 60 m build bench in graphite enamel on
// galvanized legs carrying the Agent Studio evaluator's ten check lamps (V1 to V10: lit teal where the check passed,
// hatched gray where it was skipped), and beyond it two rows of racks for hosted agents, built and dark, with no plate.
// The two hosted agents, the evaluator (agent 2922) and the Forecaster (agent 2925), run on Amazon Bedrock AgentCore
// through Agent Studio's managed hosting; the stack's finale draws them on one pad, a pod each, with the strand the
// evaluator reads from GateRecord.
import * as THREE from 'three';
import { createBuilder } from '../../kit/geo';
import { exactColor } from '../../kit/tone';
import { radialTex } from '../../kit/textures';
import { COLORS } from './hangar';

function hatchTexture() {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#414344'; g.fillRect(0, 0, s, s);
  g.strokeStyle = '#2a3038'; g.lineWidth = 10;
  for (let i = -s; i < 2 * s; i += 26) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + s, s); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2);
  return t;
}

export function buildWorkshop(d, theme, M, bench = { x: -120, z: 6, len: 60 }) {
  const group = new THREE.Group(); group.name = 'workshop';
  const checks = d.sponsors.agent_studio.evaluation.checks;
  const B = createBuilder(THREE);
  const top = 1.05, depth = 3.2;
  // the bench: an enamel top with a rolled edge, a lower shelf, galvanized legs every 6 m
  B.box('bench|benchTop', bench.len, 0.09, depth, bench.x, top - 0.045, bench.z, { c: 0.03 });
  B.box('bench|dark', bench.len - 0.4, 0.16, depth - 0.3, bench.x, top - 0.17, bench.z, { c: 0.02 });
  B.box('bench|dark', bench.len - 1.2, 0.05, depth - 0.6, bench.x, 0.32, bench.z, { c: 0.01 });
  for (let x = -bench.len / 2 + 0.6; x <= bench.len / 2 - 0.5; x += 6) for (const s of [-1, 1]) B.box('bench|galv', 0.12, top - 0.25, 0.12, bench.x + x, (top - 0.25) / 2, bench.z + s * (depth / 2 - 0.25));
  // the lamps' sockets, one every 6 m along the bench's back edge
  const lampAt = checks.map((c, i) => ({ c, x: bench.x - bench.len / 2 + 3 + i * (bench.len - 6) / (checks.length - 1), z: bench.z - depth / 2 + 0.75 }));
  for (const l of lampAt) {
    B.cyl('lamp|steel', 0.36, 0.22, l.x, top + 0.11, l.z, { seg: 32 });
    B.cyl('lamp|dark', 0.3, 0.06, l.x, top + 1.55, l.z, { seg: 32 });
    B.cyl('lamp|steel', 0.33, 0.08, l.x, top + 1.62, l.z, { seg: 32 });
  }
  // the racks: two rows facing a shared aisle (x -160 to -80; z -26 to -14), dark; perforated doors
  const rack = { w: 1.2, h: 2.6, d: 1.4, pitch: 1.34 };
  for (const row of [{ z: -24.2, face: 1 }, { z: -15.8, face: -1 }]) {
    for (let x = -160 + rack.pitch / 2; x <= -80 - rack.pitch / 2; x += rack.pitch) {
      B.box('rack|rack', rack.w, rack.h, rack.d, x, rack.h / 2 + 0.05, row.z, { c: 0.02 });
      B.box('rack|grille', rack.w - 0.16, rack.h - 0.28, 0.03, x, rack.h / 2 + 0.05, row.z + row.face * (rack.d / 2 + 0.015));
    }
    B.box('rack|steel', 80, 0.12, 0.5, -120, rack.h + 0.6, row.z - row.face * 0.2); // the cable tray over the row
  }
  const benchTop = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#2c3238'), roughness: 0.34, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12 });
  const built = B.build({ ...M.m, benchTop }, { shadows: true });
  group.add(built.group);
  // the lamps' glass, lit cores and halos: teal for PASS, the hatch for SKIP
  const glassMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#dfe8ee'), roughness: 0.05, transparent: true, opacity: 0.16, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
  glassMat.userData.noAO = true;
  const coreOn = new THREE.MeshBasicMaterial({ color: exactColor(THREE, '#7ff0d6') });
  const coreOff = new THREE.MeshBasicMaterial({ map: hatchTexture() });
  const haloMat = new THREE.MeshBasicMaterial({ color: exactColor(THREE, '#1f8f78'), alphaMap: radialTex(THREE), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  const poolMat = new THREE.MeshBasicMaterial({ color: exactColor(THREE, '#1a6d5d'), alphaMap: radialTex(THREE), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
  const lamps = [];
  const glassGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.24, 40, 1, true), coreGeo = new THREE.CylinderGeometry(0.17, 0.17, 1.12, 32);
  for (const l of lampAt) {
    const on = l.c.status === 'PASS';
    const gl = new THREE.Mesh(glassGeo, glassMat); gl.position.set(l.x, top + 0.84, l.z); gl.userData.noAO = true; gl.renderOrder = 3;
    const core = new THREE.Mesh(coreGeo, on ? coreOn : coreOff); core.position.set(l.x, top + 0.84, l.z); core.userData.noAO = true;
    group.add(gl, core);
    if (on) {
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.3), haloMat); halo.position.set(l.x, top + 0.86, l.z); halo.userData.noAO = true; halo.userData.billboard = true; halo.renderOrder = 4;
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.8).rotateX(-Math.PI / 2), poolMat); pool.position.set(l.x, top + 0.006, l.z + 0.6); pool.userData.noAO = true; pool.renderOrder = 2;
      group.add(halo, pool);
    }
    lamps.push({ id: l.c.id, status: l.c.status, at: [l.x, top + 1.7, l.z] });
  }
  return { group, lamps, anchors: { bench: [bench.x + 6, top + 1.9, bench.z - 1], racks: [-120, 2.8, -20] } };
}

/** Billboards (the lamps' halos) turned to face the camera. */
export function faceCamera(root, camera) {
  root.traverse((o) => { if (o.userData.billboard) o.quaternion.copy(camera.quaternion); });
}
