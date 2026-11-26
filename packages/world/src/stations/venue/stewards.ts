// The stewards' bay in its close read: Desert Willow's leaf as a glass card, the nine-rung proof ladder to the root
// plate, the lamp wall with the page's five checks, and the screen that carries the page's report board. Built for
// the tamper state (the page's one changed hourly value) or the sealed one.
import * as THREE from 'three';
import { createBuilder } from '../../kit/geo';
import { HEX, exact, glowMat, pool, radialTex, halo } from './look';
import { PLINTH_H } from './ground';
import type { Hardware } from './heroes';

export type CheckState = 'pass' | 'fail';
export const SCREEN = { x: 456.62, y: 14.6, z: 4, w: 30, h: 30 / 3.584 };

export function buildStewardsBay(H: Hardware, o: { checks: CheckState[]; tampered: boolean; changedRow: number }) {
  const g = new THREE.Group(); g.name = 'stewards-bay';
  const soft = radialTex(1.5);
  const hex = (s: CheckState) => (s === 'pass' ? HEX.teal : HEX.refused);

  // the lamp wall: graphite cladding on a galvanized frame, x 456 to 458.5, z -17 to 25, 17.5 m high
  const b = createBuilder(THREE);
  b.box('wall|graphite', 2.4, 20.5, 42, 457.7, PLINTH_H + 10.25, 4, { c: 0.12 });
  b.box('wall|galv', 2.8, 0.35, 42.4, 457.7, PLINTH_H + 20.6, 4);
  for (const z of [-17, 25]) b.box('wall|galv', 2.8, 20.8, 0.4, 457.7, PLINTH_H + 10.4, z);
  // a fine LED line along the wall's foot, the bay's own light
  b.box('foot|galv', 0.3, 0.3, 42, 456.3, PLINTH_H + 0.15, 4);
  // the screen's bezel and the lamps' bezels, proud of the wall's west face
  const sw = SCREEN.w + 0.8, sh = SCREEN.h + 0.8;
  b.box('bezel|graphiteDark', 0.5, sh, sw, 456.3, SCREEN.y, SCREEN.z);
  g.add(b.build({ graphite: H.graphite, galv: H.galv, graphiteDark: H.graphiteDark }).group);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), new THREE.MeshBasicMaterial({ color: exact('#101315') }));
  scr.position.set(SCREEN.x - 0.6, SCREEN.y, SCREEN.z); scr.rotation.y = -Math.PI / 2; g.add(scr);
  // the screen's light on the plinth before it
  g.add(pool('#8fa3b5', 14, 0.06, soft, [449, PLINTH_H + 0.02, SCREEN.z], { sz: 1.4 }));

  // the five lamps, 01 at the north end to 05 at the south, each in its check's color
  const lamps: [number, number, number][] = [];
  o.checks.forEach((s, i) => {
    const z = -12 + i * 8, y = PLINTH_H + 4.6, c = hex(s);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.22, 12, 48), H.steel); ring.position.set(456.32, y, z); ring.rotation.y = Math.PI / 2; g.add(ring);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(1.32, 32, 16, 0, Math.PI), glowMat(c, s === 'fail' ? 2.3 : 2.0)); lens.position.set(456.4, y, z); lens.rotation.y = -Math.PI / 2; g.add(lens);
    g.add(halo(c, 9, 9, 0.5, soft, [456.0, y, z], 270));
    g.add(pool(c, 7.5, 0.34, soft, [452.5, PLINTH_H + 0.02, z], { sx: 0.8, sz: 0.5 }));
    lamps.push([455.4, y, z]);
    // the number plate's slot under each lamp (the number itself is a DOM tick)
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 2.4), H.graphiteDark); slot.position.set(456.4, PLINTH_H + 1.9, z); g.add(slot);
  });

  // the leaf: a glass card on a low plinth, tilted to the reader, its fields as rows; the changed one lit red
  const card = new THREE.Group(); card.position.set(408, PLINTH_H, 18); card.rotation.y = (-38 * Math.PI) / 180;
  const base = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.5, 5.6).translate(0, 0.25, 0), H.graphiteDark); base.castShadow = true; card.add(base);
  const plate = new THREE.Group(); plate.position.set(0, 1.25, 0); plate.rotation.x = (-62 * Math.PI) / 180; card.add(plate);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 0.14), new THREE.MeshPhysicalMaterial({ color: '#0e1418', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.9, clearcoat: 1, clearcoatRoughness: 0.05 }));
  glass.renderOrder = 6; glass.userData.noAO = true; plate.add(glass);
  const edge = new THREE.Mesh(new THREE.EdgesGeometry(new THREE.BoxGeometry(6, 4, 0.14)), new THREE.LineBasicMaterial({ color: exact('#d7e4ea', 1.4), transparent: true, opacity: 0.8 }));
  edge.userData.noAO = true; plate.add(edge);
  const rows = 9;
  for (let r = 0; r < rows; r++) {
    const changed = r === o.changedRow && o.tampered;
    const w = r === 0 ? 3.2 : 1.6 + ((r * 37) % 11) / 4;
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.16), glowMat(changed ? HEX.refused : '#aeb8c0', changed ? 2.2 : 0.9));
    bar.position.set(-2.6 + w / 2, 1.5 - r * 0.36, 0.08); plate.add(bar);
    if (changed) {
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.3), glowMat(HEX.refused, 0.55, { additive: true, opacity: 0.6 })); mark.position.set(0, 1.5 - r * 0.36, 0.075); plate.add(mark);
    }
  }
  g.add(card);
  const paint = new THREE.MeshBasicMaterial({ color: exact('#3a4148'), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const stripe = (x0: number, z0: number, x1: number, z1: number, w = 0.18) => {
    const L = Math.hypot(x1 - x0, z1 - z0), m = new THREE.Mesh(new THREE.PlaneGeometry(L, w).rotateX(-Math.PI / 2), paint);
    m.position.set((x0 + x1) / 2, PLINTH_H + 0.006, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); m.userData.noAO = true; g.add(m);
  };
  // the bay: a box round the card and the ladder's foot, corners marked
  for (const [x0, z0, x1, z1] of [[396, 6, 424, 6], [424, 6, 424, 30], [424, 30, 396, 30], [396, 30, 396, 6]] as const) stripe(x0, z0, x1, z1);
  // the guide from the card to the lamp wall, dashed
  for (let k = 0; k < 14; k++) { const a = k / 14, b = (k + 0.55) / 14; stripe(424 + a * 30, 18 - a * 14, 424 + b * 30, 18 - b * 14, 0.14); }
  g.add(pool(o.tampered ? HEX.refused : HEX.teal, 9, 0.16, soft, [408, PLINTH_H + 0.03, 18]));

  // the proof ladder: nine glass rungs from the card up to the root plate; in the tamper state it breaks at the first
  // rung (the changed leaf's hash no longer pairs with its sibling) and the rest go dark
  const from = new THREE.Vector3(410.5, PLINTH_H + 2.4, 15.5), to = new THREE.Vector3(430, 22, -6);
  const dir = to.clone().sub(from), along = new THREE.Vector3(dir.x, 0, dir.z).normalize(), across = new THREE.Vector3(-along.z, 0, along.x);
  const rungGlass = (lit: boolean) => new THREE.MeshPhysicalMaterial({ color: lit ? '#d9eef4' : '#7d8a94', roughness: 0.06, transparent: true, opacity: lit ? 0.42 : 0.24, clearcoat: 1, depthWrite: false });
  const rails = createBuilder(THREE);
  for (let i = 0; i < 9; i++) {
    const p = from.clone().addScaledVector(dir, (i + 1) / 10);
    const broken = o.tampered && i === 0, lit = !o.tampered;
    const yaw = Math.atan2(-across.z, across.x);
    if (broken) {
      for (const s of [-1, 1]) {
        const half = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.26, 1.1), rungGlass(true)); half.position.copy(p).addScaledVector(across, s * 1.6); half.position.y += s * 0.25;
        half.rotation.set(0, yaw, s * 0.16); half.renderOrder = 6; half.userData.noAO = true; g.add(half);
        const crack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 1.14), glowMat(HEX.refused, 2.4)); crack.position.copy(p).addScaledVector(across, s * 0.62); crack.position.y += s * 0.22; crack.rotation.set(0, yaw, s * 0.16); g.add(crack);
      }
      g.add(halo(HEX.refused, 7, 7, 0.4, soft, [p.x, p.y, p.z], 225));
    } else {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(5, 0.26, 1.1), rungGlass(lit)); rung.position.copy(p); rung.rotation.y = yaw; rung.renderOrder = 6; rung.userData.noAO = true; g.add(rung);
      const line = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.05, 0.06), glowMat(lit ? HEX.teal : '#5d6a74', lit ? 1.6 : 0.9)); line.position.copy(p); line.position.y += 0.15; line.rotation.y = yaw; g.add(line);
    }
    for (const s of [-1, 1]) if (i < 8) {
      const a = p.clone().addScaledVector(across, s * 2.6), q = from.clone().addScaledVector(dir, (i + 2) / 10).addScaledVector(across, s * 2.6);
      rails.rod(o.tampered && i >= 1 ? 'rail|dim' : 'rail|steel', [a.x, a.y, a.z], [q.x, q.y, q.z], 0.07);
    }
  }
  // the first rail section from the card to rung 1, and the rail posts down to the plinth under the ladder's foot
  for (const s of [-1, 1]) { const a = from.clone().addScaledVector(across, s * 2.6), q = from.clone().addScaledVector(dir, 0.1).addScaledVector(across, s * 2.6); rails.rod('rail|steel', [a.x, a.y, a.z], [q.x, q.y, q.z], 0.07); }
  for (const k of [0.3, 0.6, 0.9]) {
    const p = from.clone().addScaledVector(dir, k);
    rails.rod('post|graphite', [p.x, PLINTH_H, p.z], [p.x, p.y - 0.2, p.z], 0.16);
  }
  const dimRail = new THREE.MeshStandardMaterial({ color: '#3b4249', metalness: 0.6, roughness: 0.5 });
  g.add(rails.build({ steel: H.steel, dim: dimRail, graphite: H.graphite }).group);
  // the root: a small plate of gold glass, the day's root on chain (untouched by the changed copy)
  const root = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.4, 64), new THREE.MeshPhysicalMaterial({ color: exact(HEX.bnb, 0.6), emissive: exact(HEX.bnb, 0.5), roughness: 0.15, clearcoat: 1 }));
  root.position.copy(to); g.add(root);
  const rootRim = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.09, 8, 64).rotateX(Math.PI / 2), glowMat(HEX.bnb, 2)); rootRim.position.copy(to); rootRim.position.y += 0.2; g.add(rootRim);
  g.add(halo(HEX.bnb, 10, 6, 0.28, soft, [to.x, to.y, to.z], 225));
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, to.y - PLINTH_H, 12).translate(0, (to.y - PLINTH_H) / 2, 0), H.graphite); mast.position.set(to.x, PLINTH_H, to.z); mast.castShadow = true; g.add(mast);

  return {
    group: g, lamps,
    card: [408, PLINTH_H + 1.6, 18] as [number, number, number],
    rung1: from.clone().addScaledVector(dir, 0.1).toArray() as [number, number, number],
    root: [to.x, to.y + 0.4, to.z] as [number, number, number],
    screenCorners(): [number, number, number][] {
      // the screen faces west: its left edge (seen from the west) is the north end
      const x = SCREEN.x - 0.62, y0 = SCREEN.y - SCREEN.h / 2, y1 = SCREEN.y + SCREEN.h / 2, zl = SCREEN.z - SCREEN.w / 2, zr = SCREEN.z + SCREEN.w / 2;
      return [[x, y1, zl], [x, y1, zr], [x, y0, zr], [x, y0, zl]];
    },
  };
}
