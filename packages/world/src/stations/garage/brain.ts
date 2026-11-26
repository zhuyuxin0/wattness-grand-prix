// @ts-nocheck
// Team data: the pit under the glass floor. At the bottom the Terminal's structure (terminal_structure): its six
// layers as stacked translucent plates (Sources lowest, Ness routing highest), its 18 parts as tiles on their layers,
// its 48 typed connections as strands in neutral tints. Just under the glass, Living Brain's Terminal brain
// (brain_graph): 18 pages as stars sized by their sources, placed by similarity (a spring layout on the generated
// connections, so distance means something), its 53 connections as soft arcs (strong solid, medium thinner, weak
// dotted), each page tied by a hairline to the part it describes. At the east end, apart, Desert Willow's own brain:
// one page (version 2, one citation) whose thread rises to the Pit wall's C board.
// Everything under the glass is drawn in the opaque pass (lines and glows as transparent layer-0 draws), so the floor's
// glass refracts it; only the thread above the floor is drawn after the glass.
import * as THREE from 'three';
import { exactColor } from '../../kit/tone';
import { roundRect } from '../../kit/region/geo';
import { line } from '../../kit/region/flows';
import { radialTex } from '../../kit/textures';
import { glassMaterial } from '../../kit/hedge/fields';
import { layoutPages, PAGE_PART } from './data';
import { COLORS, outline } from './hangar';

export const PIT = { floor: -8.2, layer0: -7, layerStep: 1, stars: -1.2 };
const KIND = { supplies: '#8a98a8', projects: '#b7c0ca', controls: '#6f8fa8', watches: '#7f8a96', contains: '#5d6670', routes: '#c3ccd6' };

const under = (o) => { o.traverse((c) => { delete c.userData.overlay; c.userData.noAO = true; c.layers.set(0); }); return o; };
const above = (o, order = 13) => { o.traverse((c) => { c.userData.overlay = true; c.userData.noAO = true; c.renderOrder = order; }); return o; };

export function buildTeamData(d, theme, grab, res, M, fp) {
  const group = new THREE.Group(); group.name = 'teamData';
  const bg = d.brain_graph, ts = d.terminal_structure, lb = d.sponsors.living_brain;
  // ── the pit: walls down to its floor, both dark concrete ─────────────────────────────────────────────────────────
  const edge = outline(fp, 0, 8);
  const wallPos = [];
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i], b = edge[(i + 1) % edge.length];
    wallPos.push(a[0], 0, a[1], b[0], PIT.floor, b[1], b[0], 0, b[1], a[0], 0, a[1], a[0], PIT.floor, a[1], b[0], PIT.floor, b[1]);
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3)); wg.computeVertexNormals();
  const pitMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a3036'), roughness: 0.86, side: THREE.DoubleSide });
  const walls = new THREE.Mesh(wg, pitMat); walls.receiveShadow = true; walls.name = 'pitWalls';
  const s = new THREE.Shape(edge.map(([x, z]) => new THREE.Vector2(x, -z)));
  const pf = new THREE.Mesh(new THREE.ShapeGeometry(s, 6).rotateX(-Math.PI / 2).translate(0, PIT.floor, 0), new THREE.MeshStandardMaterial({ color: new THREE.Color('#1d2126'), roughness: 0.9 }));
  pf.receiveShadow = true;
  group.add(walls, pf);

  // ── the six layers and their parts ──────────────────────────────────────────────────────────────────────────────
  const cx = (fp.x0 + fp.x1) / 2, cz = (fp.z0 + fp.z1) / 2;
  // the Terminal brain and its structure fill the pit's middle; the east end is Desert Willow's, the west end dark
  const span = { x0: -46, x1: 126 };
  const layerY = (L) => PIT.layer0 + L * PIT.layerStep;
  const plateMat = new THREE.MeshBasicMaterial({ color: exactColor(THREE, '#3a4a55'), transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const layers = new THREE.Group();
  ts.layers.forEach((name, L) => {
    const w = fp.x1 - fp.x0 - 12, dd = fp.z1 - fp.z0 - 10, x = (fp.x0 + fp.x1) / 2;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, dd).rotateX(-Math.PI / 2), plateMat);
    pl.position.set(x, layerY(L), cz); pl.renderOrder = 1;
    layers.add(pl);
    layers.add(line(roundRect(x, cz, w, dd, 3, 6).map(([px, pz]) => [px, layerY(L) + 0.01, pz]), { color: '#6b7884', width: 1.2, opacity: 0.55, closed: true }));
  });
  group.add(under(layers));
  const byLayer = new Map();
  for (const n of ts.nodes) { if (!byLayer.has(n.layer)) byLayer.set(n.layer, []); byLayer.get(n.layer).push(n); }
  const tile = new Map();
  const tileTop = new THREE.MeshBasicMaterial({ color: exactColor(THREE, '#2c3846') });
  const tileSide = new THREE.MeshBasicMaterial({ color: exactColor(THREE, '#18202a') });
  const tileGeo = new THREE.BoxGeometry(12, 0.36, 6.4);
  const tiles = new THREE.Group();
  for (const [L, ns] of byLayer) ns.forEach((n, i) => {
    const x = span.x0 + ((i + 0.5) / ns.length) * (span.x1 - span.x0), z = cz + (L % 2 ? 5 : -5), y = layerY(L);
    tile.set(n.id, { x, y: y + 0.38, z, layer: L, name: n.name });
    const m = new THREE.Mesh(tileGeo, [tileSide, tileSide, tileTop, tileSide, tileSide, tileSide]); m.position.set(x, y + 0.19, z);
    tiles.add(m);
  });
  group.add(under(tiles));
  const tileEdges = new THREE.Group();
  for (const t of tile.values()) tileEdges.add(line(roundRect(t.x, t.z, 12, 6.4, 0.5, 4).map(([x, z]) => [x, t.y + 0.01, z]), { color: '#8fa3b8', width: 1.2, opacity: 0.85, closed: true }));
  group.add(under(tileEdges));
  // the 48 typed connections: a strand from part to part, rising from a lower layer's tile to a higher one's
  const strands = new THREE.Group();
  for (const e of ts.edges) {
    const a = tile.get(e.from), b = tile.get(e.to);
    if (!a || !b) continue;
    const [lo, hi] = a.y <= b.y ? [a, b] : [b, a];
    const pts = [];
    for (let k = 0; k <= 24; k++) {
      const t = k / 24, sm = t * t * (3 - 2 * t);
      pts.push([lo.x + (hi.x - lo.x) * sm, lo.y + (hi.y - lo.y) * t, lo.z + (hi.z - lo.z) * sm]);
    }
    strands.add(line(pts, { color: KIND[e.kind] ?? '#8a98a8', width: 1.5, opacity: 0.72 }));
  }
  group.add(under(strands));

  // ── the Terminal brain's pages, as stars placed by similarity ───────────────────────────────────────────────────
  const box = { x0: span.x0 + 4, x1: span.x1 - 4, z0: fp.z0 + 8, z1: fp.z1 - 8 };
  const P = layoutPages(bg.pages, bg.connections, box);
  const coreMat = new THREE.MeshBasicMaterial({ color: exactColor(THREE, '#c9f7ea') });
  const glowTex = radialTex(THREE);
  const glowMat = new THREE.MeshBasicMaterial({ color: exactColor(THREE, '#2ec7a6'), alphaMap: glowTex, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending });
  const stars = new THREE.Group(), pos = new Map();
  for (const p of bg.pages) {
    const [x, z] = P.get(p.slug), r = 0.32 + 0.24 * Math.sqrt(p.sources);
    pos.set(p.slug, [x, PIT.stars, z]);
    const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.42, 20, 14), coreMat); core.position.set(x, PIT.stars, z);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(r * 3.8, r * 3.8), glowMat); glow.position.set(x, PIT.stars, z); glow.renderOrder = 2; glow.userData.billboard = true;
    stars.add(core, glow);
  }
  group.add(under(stars));
  // the 53 connections: soft arcs bowing up toward the glass
  const arcs = new THREE.Group();
  const look = { strong: { width: 2.2, opacity: 0.8 }, medium: { width: 1.5, opacity: 0.6 }, weak: { width: 1.3, opacity: 0.55, dash: 1.1, gap: 1.0 } };
  for (const c of bg.connections) {
    const a = pos.get(c.a), b = pos.get(c.b); if (!a || !b) continue;
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]), lift = Math.min(0.85, 0.12 + L * 0.012);
    const pts = [];
    for (let k = 0; k <= 32; k++) { const t = k / 32; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + lift * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]); }
    arcs.add(line(pts, { color: '#5fe0c3', ...look[c.strength] }));
  }
  group.add(under(arcs));
  // hairlines: each page down to the part it describes
  const hair = new THREE.Group();
  for (const p of bg.pages) {
    const part = tile.get(PAGE_PART[p.slug]); const a = pos.get(p.slug);
    if (!part || !a) continue;
    hair.add(line([a, [part.x, part.y + 0.02, part.z]], { color: '#8a98a8', width: 1, opacity: 0.4 }));
  }
  group.add(under(hair));

  // ── Desert Willow's brain: one page, its citation, its thread up to the Pit wall's C board ─────────────────────
  const dw = [fp.x1 - 34, PIT.stars, cz - 8];
  const dwStar = new THREE.Group();
  const dwCore = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), coreMat); dwCore.position.set(...dw);
  const dwGlow = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), glowMat); dwGlow.position.set(...dw); dwGlow.renderOrder = 2; dwGlow.userData.billboard = true;
  const ringPts = []; for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; ringPts.push([dw[0] + Math.cos(a) * 1.6, dw[1] + 0.02, dw[2] + Math.sin(a) * 1.6]); }
  dwStar.add(dwCore, dwGlow, line(ringPts, { color: '#5fe0c3', width: 1.4, opacity: 0.85 }));
  group.add(under(dwStar));
  return { group, tiles: tile, pos, dw, layerY, span, box, P };
}

/** Desert Willow's thread from its star up through the glass to a point (the C board's face): the part under the
 *  floor refracted with the pit, the part above drawn over the glass. */
export function dwThread(from, to) {
  const pts = [];
  for (let k = 0; k <= 40; k++) {
    const t = k / 40, sm = t * t * (3 - 2 * t);
    pts.push([from[0] + (to[0] - from[0]) * sm, from[1] + (to[1] - from[1]) * Math.pow(t, 0.7), from[2] + (to[2] - from[2]) * sm]);
  }
  const cut = pts.findIndex((p) => p[1] >= 0);
  const g = new THREE.Group();
  const lo = pts.slice(0, cut + 1), hi = pts.slice(Math.max(0, cut));
  if (lo.length > 1) g.add(under(line(lo, { color: '#5fe0c3', width: 1.6, opacity: 0.9 })));
  if (hi.length > 1) g.add(above(line(hi, { color: '#5fe0c3', width: 1.6, opacity: 0.9, glow: 7, glowA: 0.3 })));
  return g;
}

/** The glass floor over the pit: the walkthrough's liquid glass (frost 0.12, refraction, the hairline rim), drawn
 *  after the opaque pass. */
export function glassFloor(theme, grab, res, fp) {
  const w = fp.x1 - fp.x0, dd = fp.z1 - fp.z0;
  const mat = glassMaterial(theme, grab, res, { size: [w, dd], radius: fp.corner_m, rimW: 0.5 });
  mat.uniforms.uFrost.value = 0.12;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, dd).rotateX(-Math.PI / 2), mat);
  m.position.set((fp.x0 + fp.x1) / 2, 0.02, (fp.z0 + fp.z1) / 2);
  m.layers.set(1); m.renderOrder = 10; m.userData.noAO = true; m.frustumCulled = false;
  return m;
}

/** The pit's own light: teal lamps along it just under the glass. */
export function pitLights(fp, n = 4) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = -40 + ((i + 0.5) / n) * 160;
    const l = new THREE.PointLight('#2ec7a6', 140, 60, 1.3); l.position.set(x, -0.8, (fp.z0 + fp.z1) / 2); l.layers.enableAll();
    out.push(l);
  }
  return out;
}
