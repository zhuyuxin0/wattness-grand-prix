export type Vec3 = readonly [number, number, number];

export interface Key {
  t: number;
  v: Vec3;
}

/**
 * A keyframed path through 3D points, timed in seconds: cubic Hermite with
 * Catmull-Rom tangents scaled to the uneven key spacing, so the camera never
 * jerks at a key; it rests at the first and last key.
 */
export function sampleTrack(keys: readonly Key[], t: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const n = keys.length;
  const first = keys[0]!;
  const last = keys[n - 1]!;
  if (n === 1 || t <= first.t) return set(out, first.v);
  if (t >= last.t) return set(out, last.v);
  let i = 0;
  while (i < n - 2 && t > keys[i + 1]!.t) i++;
  const k0 = keys[i - 1] ?? keys[i]!;
  const k1 = keys[i]!;
  const k2 = keys[i + 1]!;
  const k3 = keys[i + 2] ?? k2;
  const dt = k2.t - k1.t;
  const u = (t - k1.t) / dt;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  for (let c = 0; c < 3; c++) {
    // Tangents are zero at the ends, so the move eases out of the first key and into the last.
    const m1 = k1 === first ? 0 : ((k2.v[c]! - k0.v[c]!) / (k2.t - k0.t)) * dt;
    const m2 = k2 === last ? 0 : ((k3.v[c]! - k1.v[c]!) / (k3.t - k1.t)) * dt;
    out[c] = h00 * k1.v[c]! + h10 * m1 + h01 * k2.v[c]! + h11 * m2;
  }
  return out;
}

function set(out: [number, number, number], v: Vec3): [number, number, number] {
  out[0] = v[0];
  out[1] = v[1];
  out[2] = v[2];
  return out;
}
