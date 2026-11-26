// The field rising out of the map as the camera pulls back from the lock (STORY.md beat 3: "the camera pulls back as
// the rest of the field rises, pole first"). W01 (stations/world/texas.ts) stands its columns as instanced unit
// cylinders whose base is at y 0, so a column rises by scaling its instance's height; Desert Willow's stands from the
// start (the lock has only it standing, as opening.lock-venue draws it) and the rest rise in order of their distance
// from it, nearest first; the trays' columns last. Desert Willow's halo comes on as the pull-back ends. Wrapped from
// outside: W01's own code is not changed, and every matrix is put back at its rest.
import * as THREE from 'three';
import type { FrameData } from '../stations/types';
import { smooth } from './moves';

interface Item { mesh: THREE.InstancedMesh; i: number; m: THREE.Matrix4; p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3; order: number }

export interface Rise { set(k: number): void; restore(): void; readonly ok: boolean }

/** Desert Willow's point on W01's map (layout.texas's rule). */
function showcasePoint(data: FrameData, layout: any): [number, number] | null {
  const T = layout?.texas, m = data?.showcase?.map;
  if (!T || !m || m.lon == null || m.lat == null) return null;
  return [T.origin_world[0] + (m.lon - T.center_lon) * T.m_per_deg_lon, T.origin_world[1] - (m.lat - T.center_lat) * T.m_per_deg_lat];
}

export function makeRise(root: THREE.Object3D, data: FrameData | null, layout: unknown): Rise {
  const at = data ? showcasePoint(data, layout) : null;
  const items: Item[] = [];
  const meshes: THREE.InstancedMesh[] = [];
  root.traverse((o) => { const m = o as THREE.InstancedMesh; if (m.isInstancedMesh && m.geometry?.attributes?.aHollow) meshes.push(m); });
  const halo: { o: THREE.Mesh; base: number }[] = [];
  if (!at || !meshes.length) return { set() {}, restore() {}, ok: false };
  const m4 = new THREE.Matrix4();
  for (const mesh of meshes) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m4);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      m4.decompose(p, q, s);
      // a lying column (the trays) has turned off the vertical: it comes in last
      const lying = Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(q).y) < 0.5;
      items.push({ mesh, i, m: m4.clone(), p, q, s, order: lying ? Infinity : Math.hypot(p.x - at[0], p.z - at[1]) });
    }
  }
  const ranked = items.slice().sort((a, b) => a.order - b.order);
  const n = ranked.length, rank = new Map<Item, number>();
  ranked.forEach((it, r) => rank.set(it, n > 1 ? r / (n - 1) : 0));
  const pole = ranked[0]!;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    const mat = m.material as THREE.Material;
    if (Math.hypot(m.position.x - at[0], m.position.z - at[1]) < 0.5 && (m.geometry?.type === 'RingGeometry' || mat?.blending === THREE.AdditiveBlending)) halo.push({ o: m, base: mat.opacity });
  });
  let last = -1;
  const W = 0.32;
  const set = (k: number) => {
    const key = Math.round(k * 2000);
    if (key === last) return;
    last = key;
    for (const it of items) {
      const r = it === pole ? 0 : rank.get(it)!;
      const g = it === pole ? 1 : smooth((k - r * (1 - W)) / W);
      // nothing at all until it starts (a flat cap would stand on the map as a disc), then its footprint at once
      const f = g <= 0 ? 0 : Math.min(1, g / 0.06);
      m4.compose(it.p, it.q, new THREE.Vector3(it.s.x * f, it.s.y * Math.max(1e-4, g), it.s.z * f));
      it.mesh.setMatrixAt(it.i, m4);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    const h = smooth((k - 0.86) / 0.14);
    for (const x of halo) { (x.o.material as THREE.Material).opacity = x.base * h; x.o.visible = h > 0.002; }
  };
  const restore = () => {
    if (last === -2) return;
    last = -2;
    for (const it of items) it.mesh.setMatrixAt(it.i, it.m);
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    for (const x of halo) { (x.o.material as THREE.Material).opacity = x.base; x.o.visible = true; }
  };
  return { set, restore, ok: true };
}
