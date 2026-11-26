// @ts-nocheck
// Team data: the pit under the glass floor. At the bottom the Terminal's structure (terminal_structure): its six
// layers as stacked translucent plates (Sources lowest, Ness routing highest), its 18 parts as tiles on their layers,
// its 48 typed connections as strands in neutral tints. Over them, Living Brain's three brains of ours as the brain
// station draws them (stations/brain/pit.ts): the Terminal's, the Grand Prix build's and, at the east end, Desert
// Willow's review, whose one page's thread rises to the Pit wall's C board; the 55 connections across them as arcs.
// Everything under the glass is drawn in the opaque pass (lines and glows as transparent layer-0 draws), so the floor's
// glass refracts it; only the thread above the floor is drawn after the glass.
import * as THREE from 'three';
import { exactColor } from '../../kit/tone';
import { roundRect } from '../../kit/region/geo';
import { line } from '../../kit/region/flows';
import { glassMaterial } from '../../kit/hedge/fields';
import { pitBrains } from '../brain/pit';
import { COLORS, outline } from './hangar';

export const PIT = { floor: -8.2, layer0: -7, layerStep: 1, stars: -1.2 };
const KIND = { supplies: '#8a98a8', projects: '#b7c0ca', controls: '#6f8fa8', watches: '#7f8a96', contains: '#5d6670', routes: '#c3ccd6' };

const under = (o) => { o.traverse((c) => { delete c.userData.overlay; c.userData.noAO = true; c.layers.set(0); }); return o; };
const above = (o, order = 13) => { o.traverse((c) => { c.userData.overlay = true; c.userData.noAO = true; c.renderOrder = order; }); return o; };

export function buildTeamData(d, theme, grab, res, M, fp) {
  const group = new THREE.Group(); group.name = 'teamData';
  const ts = d.terminal_structure;
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

  // ── Living Brain: our three brains lying in the pit, as the brain station draws them (stations/brain/pit.ts) ───
  const pit = pitBrains(fp, res);
  group.add(under(pit.group));
  const { pos, dw } = pit;
  const box = { x0: span.x0 + 4, x1: span.x1 - 4, z0: fp.z0 + 8, z1: fp.z1 - 8 };
  // structure: the Terminal's six layers, its parts and their connections (a frame seen from far above leaves them out,
  // so they never read as the brain over them); brains: the clouds, whose brightness a frame may raise
  return { group, tiles: tile, pos, dw, layerY, span, box, structure: [layers, tiles, tileEdges, strands], brains: pit };
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
