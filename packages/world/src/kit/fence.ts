// @ts-nocheck
// Ported from landing-3d/live/kit/fence.js (27 Oct 2026). Plain JS under a type pass: three.js has no types here.
// Chain-link fence along a closed or open polyline: posts every 3 m, top rail, tension wire, mesh, and
// optional barbed-wire arms. A gate is left as a gap [s0, s1] in metres along the run; gate leaves are drawn.
import { createBuilder } from './geo';

export function addFence(THREE, b, pts, { closed = true, height = 2.1, gap = null, barbed = false, part = 'fence' } = {}) {
  const P = pts.map(([x, z]) => [x, z]);
  if (closed) P.push(P[0]);
  let s = 0;
  const inGap = (a) => gap && a > gap[0] && a < gap[1];
  for (let i = 0; i < P.length - 1; i++) {
    const [x0, z0] = P[i], [x1, z1] = P[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.01) continue;
    const dx = (x1 - x0) / len, dz = (z1 - z0) / len, ang = Math.atan2(-dz, dx);
    const n = Math.max(1, Math.round(len / 3));
    for (let k = 0; k <= n; k++) {
      const a = s + (k * len) / n; if (inGap(a)) continue;
      const x = x0 + dx * (k * len) / n, z = z0 + dz * (k * len) / n;
      const corner = k === 0 || k === n;
      b.cyl(`${part}|fence`, corner ? 0.045 : 0.03, height + 0.05, x, (height + 0.05) / 2, z, { seg: 6 });
      b.cyl(`${part}|concrete`, 0.14, 0.08, x, 0.04, z, { seg: 8 });
      if (barbed) b.box(`${part}|fence`, 0.03, 0.45, 0.03, x, height + 0.2, z, { rx: Math.cos(ang) * -0.6, rz: Math.sin(ang) * 0.6 });
    }
    // runs between gap edges
    const runs = [];
    if (gap && gap[1] > s && gap[0] < s + len) {
      if (gap[0] > s) runs.push([0, gap[0] - s]);
      if (gap[1] < s + len) runs.push([gap[1] - s, len]);
    } else runs.push([0, len]);
    for (const [a0, a1] of runs) {
      const l = a1 - a0, mx = x0 + dx * (a0 + l / 2), mz = z0 + dz * (a0 + l / 2);
      b.box(`${part}|fence`, l, 0.035, 0.035, mx, height, mz, { ry: ang });
      b.box(`${part}|fence`, l, 0.012, 0.012, mx, 0.12, mz, { ry: ang });
      b.box(`${part}|mesh`, l, height - 0.1, 0.002, mx, 0.05 + (height - 0.1) / 2, mz, { ry: ang });
      if (barbed) for (let w = 0; w < 3; w++) b.box(`${part}|fence`, l, 0.006, 0.006, mx, height + 0.12 + w * 0.12, mz, { ry: ang });
    }
    if (gap && gap[0] >= s && gap[0] < s + len) {
      // two gate leaves standing half open
      const g0 = gap[0] - s, gw = (gap[1] - gap[0]) / 2;
      for (const side of [0, 1]) {
        const hx = x0 + dx * (g0 + side * 2 * gw), hz = z0 + dz * (g0 + side * 2 * gw);
        const ga = ang + (side ? -0.5 : 0.5);
        const cx = hx + Math.cos(ga) * gw * 0.5 * (side ? -1 : 1), cz = hz - Math.sin(ga) * gw * 0.5 * (side ? -1 : 1);
        b.box(`${part}|fence`, gw, 0.04, 0.04, cx, height - 0.05, cz, { ry: ga });
        b.box(`${part}|fence`, gw, 0.04, 0.04, cx, 0.15, cz, { ry: ga });
        b.box(`${part}|mesh`, gw, height - 0.2, 0.002, cx, 0.1 + (height - 0.2) / 2, cz, { ry: ga });
        b.cyl(`${part}|fence`, 0.05, height + 0.1, hx, (height + 0.1) / 2, hz, { seg: 8 });
      }
    }
    s += len;
  }
}

export function buildFence(THREE, materials, runs) {
  const b = createBuilder(THREE);
  for (const r of runs) addFence(THREE, b, r.points, r);
  const out = b.build(materials.m);
  out.meshes.forEach((m) => { if (m.material === materials.m.mesh) { m.castShadow = false; m.userData.noAO = true; m.renderOrder = 2; } });
  return { ...out, triangles: b.triangles() };
}
