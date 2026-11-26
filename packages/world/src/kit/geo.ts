// @ts-nocheck
// Ported from landing-3d/live/kit/geo.js (27 Oct 2026). Plain JS under a type pass: three.js has no types here.
// Geometry builder: accumulate primitives per "part|material" key under a transform stack, then merge
// each key into one non-indexed BufferGeometry (one draw call per part and material).
// UVs are metric box projections in the builder's frame: u, v in metres, v = height above its ground.
// Every vertex also carries aBase (vec4): the normal it shades with once it is too small to resolve (materials.ts
// farDetail): its panel's normal for small parts set on a panel (base()), a box's main face for a chamfer's bevel,
// else its own normal; w is 1 for the small hardware that also takes the panel's colour there (FADE_KEYS).

export function chamferBox(THREE, sx, sy, sz, e = 0.02) {
  const h = [sx / 2, sy / 2, sz / 2];
  e = Math.max(0, Math.min(e, h[0] * 0.45, h[1] * 0.45, h[2] * 0.45));
  const pos = [], nor = [], bas = [];
  // a bevel shades, once too small to resolve, as the box's larger face beside it (its axis with the smaller half)
  const main = (n) => { let k = -1; for (let q = 0; q < 3; q++) if (n[q] && (k < 0 || h[q] < h[k])) k = q; const m = [0, 0, 0]; m[k] = Math.sign(n[k]); return m; };
  const tri = (a, b, c, n) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) { const t = b; b = c; c = t; }
    const l = Math.hypot(n[0], n[1], n[2]), m = main(n);
    for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); nor.push(n[0] / l, n[1] / l, n[2] / l); bas.push(m[0], m[1], m[2]); }
  };
  const quad = (a, b, c, d, n) => { tri(a, b, c, n); tri(a, c, d, n); };
  // faces
  for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
    const i = (k + 1) % 3, j = (k + 2) % 3;
    const mk = (si, sj) => { const p = [0, 0, 0]; p[k] = s * h[k]; p[i] = si * (h[i] - e); p[j] = sj * (h[j] - e); return p; };
    const n = [0, 0, 0]; n[k] = s;
    quad(mk(-1, -1), mk(1, -1), mk(1, 1), mk(-1, 1), n);
  }
  if (e > 0) {
    // edges
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const k = 3 - i - j;
      for (const si of [-1, 1]) for (const sj of [-1, 1]) {
        const mk = (sk, variant) => {
          const p = [0, 0, 0]; p[k] = sk * (h[k] - e);
          if (variant === 0) { p[i] = si * h[i]; p[j] = sj * (h[j] - e); } else { p[i] = si * (h[i] - e); p[j] = sj * h[j]; }
          return p;
        };
        const n = [0, 0, 0]; n[i] = si; n[j] = sj;
        quad(mk(-1, 0), mk(-1, 1), mk(1, 1), mk(1, 0), n);
      }
    }
    // corners
    for (const sx_ of [-1, 1]) for (const sy_ of [-1, 1]) for (const sz_ of [-1, 1]) {
      const s = [sx_, sy_, sz_];
      const pts = [0, 1, 2].map((ax) => s.map((sv, q) => sv * (q === ax ? h[q] : h[q] - e)));
      tri(pts[0], pts[1], pts[2], s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('base', new THREE.Float32BufferAttribute(bas, 3));
  return g;
}

/** Materials of the small hardware on a panel (seams, hinges, handles, a label's ink): once they are too small to
 *  resolve they take the panel's colour as well as its normal (materials.ts farDetail), so they stop sparkling. */
export const FADE_KEYS = new Set(['seam', 'galv', 'dark', 'ink']);

/** aBase as four normalized bytes a vertex (a unit normal and a 0/1 weight need no more): the enclosures alone send
 *  1.4 million instanced vertices a pass. */
function baseAttribute(THREE, values) {
  const a = new Int8Array(values.length);
  for (let i = 0; i < values.length; i++) a[i] = Math.round(Math.max(-1, Math.min(1, values[i])) * 127);
  return new THREE.BufferAttribute(a, 4, true);
}

export function createBuilder(THREE) {
  const buckets = new Map();
  const stack = [new THREE.Matrix4()];
  const bases = [null]; // per level: { n: the panel's normal (builder frame), fade: its hardware takes the panel's colour } or null
  const v = new THREE.Vector3(), n = new THREE.Vector3(), bn = new THREE.Vector3(), nm = new THREE.Matrix3();
  const q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1);
  const top = () => stack[stack.length - 1];

  function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, order = 'XYZ') {
    e.set(rx, ry, rz, order); q.setFromEuler(e);
    if (typeof s === 'number') sc.set(s, s, s); else sc.set(s[0], s[1], s[2]);
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, sc);
  }

  function bucket(key) {
    let b = buckets.get(key);
    if (!b) { b = { pos: [], nor: [], uv: [], base: [] }; buckets.set(key, b); }
    return b;
  }

  function add(key, geom, local) {
    let g = geom.index ? geom.toNonIndexed() : geom;
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position.array, N = g.attributes.normal.array, B = g.attributes.base?.array;
    const world = local ? top().clone().multiply(local) : top();
    nm.getNormalMatrix(world);
    const b = bucket(key), ctx = bases[bases.length - 1];
    const fade = ctx && ctx.fade && FADE_KEYS.has(key.includes('|') ? key.split('|')[1] : key) ? 1 : 0;
    for (let i = 0; i < P.length; i += 3) {
      v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(world);
      n.set(N[i], N[i + 1], N[i + 2]).applyMatrix3(nm).normalize();
      if (ctx) b.base.push(ctx.n.x, ctx.n.y, ctx.n.z, fade);
      else if (B) { bn.set(B[i], B[i + 1], B[i + 2]).applyMatrix3(nm).normalize(); b.base.push(bn.x, bn.y, bn.z, 0); }
      else b.base.push(n.x, n.y, n.z, 0);
      // metric UVs in the builder's frame: v is height above the frame's ground, so dust bands and streaks
      // land at the object's real base and top, not at each part's own bottom
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      if (ay >= ax && ay >= az) b.uv.push(v.x, v.z);
      else if (ax >= az) b.uv.push(v.z, v.y);
      else b.uv.push(v.x, v.y);
      b.pos.push(v.x, v.y, v.z); b.nor.push(n.x, n.y, n.z);
    }
    if (g !== geom) g.dispose();
  }

  const api = {
    M,
    push(m) { stack.push(top().clone().multiply(m)); bases.push(bases[bases.length - 1]); return api; },
    at(x, y, z, ry = 0, rx = 0, rz = 0) { return api.push(M(x, y, z, rx, ry, rz)); },
    pop() { stack.pop(); bases.pop(); return api; },
    /** The parts added from here (until this level is popped) sit on a panel facing nv (current frame): see aBase.
     *  fade: its small hardware also takes the paint's colour at distance (an enclosure's white panels; not a skid's). */
    base(nv, fade = true) {
      bases[bases.length - 1] = nv ? { n: new THREE.Vector3(...nv).applyMatrix3(new THREE.Matrix3().getNormalMatrix(top())).normalize(), fade } : null;
      return api;
    },
    add(key, geom, local) { add(key, geom, local); geom.dispose?.(); return api; },
    box(key, sx, sy, sz, x = 0, y = 0, z = 0, o = {}) {
      const g = o.c ? chamferBox(THREE, sx, sy, sz, o.c) : new THREE.BoxGeometry(sx, sy, sz);
      add(key, g, M(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, 1, o.order)); g.dispose(); return api;
    },
    cyl(key, r, h, x = 0, y = 0, z = 0, o = {}) {
      const g = new THREE.CylinderGeometry(o.rt ?? r, o.rb ?? r, h, o.seg || 12, 1, !!o.open);
      add(key, g, M(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, 1, o.order)); g.dispose(); return api;
    },
    torus(key, R, r, x = 0, y = 0, z = 0, o = {}) {
      const g = new THREE.TorusGeometry(R, r, o.tube || 6, o.seg || 20, o.arc ?? Math.PI * 2);
      add(key, g, M(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, 1, o.order)); g.dispose(); return api;
    },
    sphere(key, r, x = 0, y = 0, z = 0, o = {}) {
      const g = new THREE.SphereGeometry(r, o.ws || 12, o.hs || 8);
      add(key, g, M(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.s ?? 1, o.order)); g.dispose(); return api;
    },
    lathe(key, pts, x = 0, y = 0, z = 0, o = {}) {
      const g = new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), o.seg || 16);
      add(key, g, M(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, 1, o.order)); g.dispose(); return api;
    },
    tube(key, points, r, o = {}) {
      const curve = points.isCurve ? points : new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), false, 'centripetal');
      const g = new THREE.TubeGeometry(curve, o.seg || 24, r, o.radial || 6, false);
      add(key, g); g.dispose(); return api;
    },
    /** A straight cylinder between two points. */
    rod(key, a, b, r, o = {}) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      const d = B.clone().sub(A), len = d.length();
      const g = new THREE.CylinderGeometry(o.rt ?? r, o.rb ?? r, len, o.seg || 8, 1, !!o.open);
      const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), qq, new THREE.Vector3(1, 1, 1));
      add(key, g, m); g.dispose(); return api;
    },
    /** A box beam between two points (square section w x h). */
    beam(key, a, b, w, h = w) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      const d = B.clone().sub(A), len = d.length();
      const g = new THREE.BoxGeometry(w, len, h);
      const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      add(key, g, new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), qq, new THREE.Vector3(1, 1, 1)));
      g.dispose(); return api;
    },
    keys() { return [...buckets.keys()]; },
    has(key) { return buckets.has(key); },
    geometry(key) {
      const b = buckets.get(key); if (!b) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('aBase', baseAttribute(THREE, b.base));
      g.computeBoundingSphere(); g.computeBoundingBox();
      return g;
    },
    /** Merge keys "part|mat" (or "mat") into meshes. Returns { group, parts: {part: Group}, meshes: [] }. */
    build(materials, { shadows = true, filter } = {}) {
      const group = new THREE.Group(); const parts = {}; const meshes = [];
      for (const key of buckets.keys()) {
        if (filter && !filter(key)) continue;
        const [part, mat] = key.includes('|') ? key.split('|') : ['main', key];
        const material = materials[mat];
        if (!material) { console.warn('kit: no material', mat); continue; }
        const mesh = new THREE.Mesh(api.geometry(key), material);
        mesh.name = key; mesh.castShadow = shadows && !material.transparent; mesh.receiveShadow = shadows;
        if (!parts[part]) { parts[part] = new THREE.Group(); parts[part].name = part; group.add(parts[part]); }
        parts[part].add(mesh); meshes.push(mesh);
      }
      return { group, parts, meshes };
    },
    /** Merge everything per material, ignoring parts (for instancing). Returns { mat: BufferGeometry }. */
    byMaterial() {
      const out = {};
      for (const [key, b] of buckets) {
        const mat = key.includes('|') ? key.split('|')[1] : key;
        (out[mat] ||= { pos: [], nor: [], uv: [], base: [] });
        for (const k of ['pos', 'nor', 'uv', 'base']) { const src = b[k], dst = out[mat][k]; for (let i = 0; i < src.length; i++) dst.push(src[i]); }
      }
      const geos = {};
      for (const [mat, b] of Object.entries(out)) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
        g.setAttribute('aBase', baseAttribute(THREE, b.base));
        g.computeBoundingSphere(); g.computeBoundingBox();
        geos[mat] = g;
      }
      return geos;
    },
    triangles() { let t = 0; for (const b of buckets.values()) t += b.pos.length / 9; return t; },
  };
  return api;
}

/** Every mesh under root that has normals but no aBase gets its own normals as aBase (meshes not made by the builder:
 *  the pad, the trenches, the pole lights), so a far-detail material or the occlusion pass can draw them. */
export function ensureBase(THREE, root) {
  root.traverse((o) => {
    const g = o.geometry;
    if (!o.isMesh || !g || g.attributes.aBase || !g.attributes.normal) return;
    const N = g.attributes.normal, a = new Float32Array(N.count * 4);
    for (let i = 0; i < N.count; i++) { a[i * 4] = N.getX(i); a[i * 4 + 1] = N.getY(i); a[i * 4 + 2] = N.getZ(i); }
    g.setAttribute('aBase', baseAttribute(THREE, a));
  });
}

/** Catenary-ish sag between two points: n+1 points, lowest `sag` metres below the chord at mid-span. */
export function sagPoints(THREE, a, b, sag, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    p.y -= sag * 4 * t * (1 - t); // a parabola: indistinguishable from the catenary at these sags
    out.push(p);
  }
  return out;
}
