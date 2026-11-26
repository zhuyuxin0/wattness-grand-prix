// @ts-nocheck
// The six bays' instruments, each drawn from the sealed day's own figures (frame-data.json):
//   Race-day forecast  the kit's chart wall: the hub and node day-ahead forecast as hourly steps over the 301
//                      scenarios' node-price fan (p05 to p95, p25 to p75), arm C's power below (discharge teal,
//                      charge #7f9cc0), the $0 plane
//   Fuel and wear      the walkthrough's battery column at 5.2x across (15.6 m is 100%, under the roof's ribs) at the plan's opening 50%, rings at
//                      5% and 95%, the 50% open-and-close mark, and arm C's 24 hourly states of charge as one turn of
//                      a helix round its sleeve (hour 12 faces west, down the pit lane)
//   Spotter            a wall of the leaf's 527 input files, one tile each, colored by group, lit by its SHA-256
//   Setup              arm C's 24 hours as the walkthrough's strip (its field kit), glass tiles at the 7 hedged
//                      hours' assumed entries, the orange dashed outline; hung from the roof
//   Risk desk          a coin board: arm C's 301 scenario totals as coins in $250 slots, the worst tenth's 31 rimmed
//   Pit wall           three strategy boards, A, B and C: each arm's schedule and its 301-scenario spread on one
//                      shared axis; C's edged in BNB yellow
import * as THREE from 'three';
import { createBuilder } from '../../kit/geo';
import { exactColor } from '../../kit/tone';
import { buildChartWall } from '../../kit/chartwall';
import { makeColumn, makeField, glassMaterial, heatAt, HEAT, hOf } from '../../kit/hedge/fields';
import { line } from '../../kit/region/flows';
import { radialTex } from '../../kit/textures';
import { armHours, armTotals, fileTiles } from './data';
import { COLORS, PLINTH, ROOF_Y } from './hangar';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const overlay = (o) => { o.traverse((c) => { c.userData.overlay = true; c.userData.noAO = true; }); return o; };

// ── Race-day forecast: the chart wall ─────────────────────────────────────────────────────────────────────────────
export function forecastWall(d, theme, at = { x: -130, z: -224 }, width = 56, height = 14) {
  const f = d.showcase.forecast, bands = d.showcase.scenarios.node_bands_cents, C = d.showcase.arms.C;
  const hub = f.hub_da_cents.map((c) => c / 100), node = f.node_da_cents.map((c) => c / 100);
  const day = {
    rt_ohlc_hourly_usd_mwh: new Array(24).fill(null),
    // the thin step is the hub's forecast, the heavy one the node's (both hourly; the wall draws its thin step per quarter)
    rt_spp_15min_usd_mwh: hub.flatMap((v) => [v, v, v, v]),
    da_spp_usd_mwh: node,
    dispatch_mw: C.kw.map((k) => k / 1000),
    as_awards_mw: { ECRS: new Array(24).fill(0), NSPIN: new Array(24).fill(0) },
  };
  const price = { min: -20, max: 110, k: 0.128 }, mw = { min: -150, max: 150, k: 0.032 };
  const wall = buildChartWall(THREE, { day, theme, pitch: 3.6, price, mw, base: 2.4, gap: 6.5, depth: 1.6 });
  const L = wall.size.L;
  // the battery strip in the site's colors: discharge teal, charge #7f9cc0 (the wall's own palette draws them the
  // other way round); its boxes are the only marks on a day with no candles, one per hour with power, in hour order
  const marks = wall.group.children.find((c) => c.name === 'marks');
  const kinds = day.dispatch_mw.filter((v) => Math.abs(v) > 0.05).map((v) => (v < -5 ? 'charge' : v > 5 ? 'discharge' : 'grey'));
  const col = marks.geometry.attributes.color.array, nrm = marks.geometry.attributes.normal.array;
  const ex = { charge: exactColor(THREE, COLORS.charge), discharge: exactColor(THREE, COLORS.teal), grey: exactColor(THREE, '#6f767d') };
  for (let v = 0; v < col.length / 3; v++) {
    const c = ex[kinds[Math.floor(v / 24)] ?? 'grey'], ny = nrm[v * 3 + 1], nx = Math.abs(nrm[v * 3]);
    const shade = ny > 0.5 ? 1.12 : ny < -0.5 ? 0.6 : nx > 0.5 ? 0.8 : 1.0;
    col[v * 3] = c.r * shade; col[v * 3 + 1] = c.g * shade; col[v * 3 + 2] = c.b * shade;
  }
  marks.geometry.attributes.color.needsUpdate = true;
  // the scenarios' node-price fan behind the forecast: p05 to p95, and p25 to p75 over it, in the day-ahead violet
  const fan = (lo, hi, opacity, z) => {
    const pos = [];
    for (let h = 0; h < 24; h++) {
      const x0 = wall.xOf(h), x1 = wall.xOf(h + 1), y0 = wall.yP(lo[h] / 100), y1 = wall.yP(hi[h] / 100);
      pos.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: exactColor(THREE, COLORS.violet), transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    m.renderOrder = 4; return m;
  };
  wall.group.add(fan(bands.p05, bands.p95, 0.13, 0.5), fan(bands.p25, bands.p75, 0.2, 0.55));
  wall.setNight(true, 0.9);
  // 56 m across; the strips' heights squeezed to stand 14 m under the roof
  const sx = width / L, sy = height / wall.size.top, sz = sx;
  wall.group.scale.set(sx, sy, sz);
  wall.group.position.set(at.x - width / 2, 0, at.z);
  overlay(wall.group);
  wall.group.updateMatrixWorld(true);
  const w = (x, y, z) => V3(x, y, z).applyMatrix4(wall.group.matrixWorld);
  const top = w(L * 0.5, wall.size.yP1 + 0.6, 0.6);
  const peak = node.indexOf(Math.max(...node));
  return {
    group: wall.group, wall, top,
    anchors: { top: [top.x, top.y, top.z], east: (() => { const p = w(L * 0.92, wall.size.yP1 + 0.6, 0.6); return [p.x, p.y, p.z]; })(), peak: (() => { const p = w(wall.xOf(peak) + 1.8, wall.yP(node[peak]), 2.0); return [p.x, p.y, p.z]; })() },
    setResolution: (W, H) => wall.setResolution(W, H),
  };
}

// ── Fuel and wear: the battery column ─────────────────────────────────────────────────────────────────────────────
export function socColumn(d, theme, M, at = { x: 10, z: -222 }) {
  const S = 5.2, R = 1.15 * S, H100 = 15.6;
  const C = d.showcase.arms.C, open = d.showcase.assumptions.soc_open_ppm / 1e4;
  const group = new THREE.Group(); group.name = 'socColumn';
  const col = makeColumn(theme);
  col.group.visible = true; col.group.scale.set(S, 1, S); col.body.scale.y = H100 * open / 100;
  col.group.position.set(at.x, PLINTH.y, at.z);
  group.add(col.group);
  // the sleeve: 0 to 100%, a clear shell with a clearcoat glint
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.35, R + 0.35, H100, 96, 1, true).translate(0, H100 / 2, 0),
    new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#c9d6e6'), roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  sleeve.position.set(at.x, PLINTH.y, at.z); sleeve.userData.noAO = true; sleeve.renderOrder = 2;
  group.add(sleeve);
  const B = createBuilder(THREE);
  B.torus('cap|steel', R + 0.35, 0.09, at.x, PLINTH.y + H100, at.z, { rx: Math.PI / 2, seg: 96, tube: 8 });
  B.torus('cap|steel', R + 0.35, 0.12, at.x, PLINTH.y + 0.25, at.z, { rx: Math.PI / 2, seg: 96, tube: 8 });
  const caps = B.build(M.m, { shadows: true }); group.add(caps.group);
  // the limits: rings at 5% and 95% (ink), the 50% open-and-close mark (dashed)
  const ring = (pct, o) => {
    const pts = []; for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; pts.push([at.x + Math.cos(a) * (R + 0.42), PLINTH.y + H100 * pct / 100, at.z + Math.sin(a) * (R + 0.42)]); }
    return line(pts, { color: COLORS.ink, renderOrder: 6, ...o });
  };
  const lo = d.showcase.assumptions.soc_min_ppm / 1e4, hi = d.showcase.assumptions.soc_max_ppm / 1e4;
  const marks = overlay(new THREE.Group());
  marks.add(ring(lo, { width: 1.6, opacity: 0.9 }), ring(hi, { width: 1.6, opacity: 0.9 }), ring(open, { width: 1.4, opacity: 0.75, dash: 0.9, gap: 0.7 }));
  // arm C's day as one turn: hour h at angle h/24 of a turn from east (hour 12 faces west), its state of charge as the
  // height; discharge teal, charge #7f9cc0, idle muted
  const soc = [open, ...C.soc_pct];
  const runs = [];
  for (let h = 0; h < 24; h++) {
    const kind = C.kw[h] > 0 ? 'out' : C.kw[h] < 0 ? 'in' : 'idle';
    const pts = [];
    for (let s = 0; s <= 10; s++) {
      const t = (h + s / 10) / 24, a = t * Math.PI * 2, pct = soc[h] + (soc[h + 1] - soc[h]) * (s / 10);
      pts.push([at.x + Math.cos(a) * (R + 0.5), PLINTH.y + H100 * pct / 100, at.z + Math.sin(a) * (R + 0.5)]);
    }
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.pts.push(...pts.slice(1)); else runs.push({ kind, pts });
  }
  for (const r of runs) {
    const color = r.kind === 'out' ? COLORS.teal : r.kind === 'in' ? COLORS.charge : COLORS.muted;
    marks.add(line(r.pts, { color, width: r.kind === 'idle' ? 1.8 : 3.2, glow: r.kind === 'idle' ? 0 : 12, glowA: 0.35, opacity: r.kind === 'idle' ? 0.7 : 1, renderOrder: 7 }));
  }
  group.add(marks);
  const west = (pct) => [at.x - (R + 0.5), PLINTH.y + H100 * pct / 100, at.z];
  return { group, anchors: { top: [at.x, PLINTH.y + H100 + 0.6, at.z], hi: west(hi), lo: west(lo), open: west(open), body: col.body } };
}

// ── Spotter: the file wall ────────────────────────────────────────────────────────────────────────────────────────
export function fileWall(theme, M, at = { x: 147, z: -216 }, width = 64, height = 13.5) {
  const { tiles, counts } = fileTiles();
  const cols = 44, rows = Math.ceil(tiles.length / cols);
  const group = new THREE.Group(); group.name = 'fileWall';
  const y0 = 1.4, pitchX = width / cols, pitchY = height / rows;
  const B = createBuilder(THREE);
  B.box('frame|dark', width + 1.6, height + 1.4, 0.7, at.x, y0 + height / 2, at.z - 0.35, { c: 0.08 });
  for (const s of [-1, 1]) B.box('frame|steel', 0.5, y0 + 0.3, 0.5, at.x + s * (width / 2 - 4), (y0 + 0.3) / 2, at.z - 0.35);
  B.box('frame|steel', width + 1.9, 0.18, 0.95, at.x, y0 + height + 0.79, at.z - 0.3);
  const frame = B.build(M.m, { shadows: true }); group.add(frame.group);
  const hex = ['#969ca3', COLORS.violet, COLORS.teal].map((h) => exactColor(THREE, h));
  const geo = new THREE.BoxGeometry(pitchX * 0.84, pitchY * 0.78, 0.06);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, tiles.length);
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  tiles.forEach((t, i) => {
    const r = Math.floor(i / cols), k = i % cols;
    m4.makeTranslation(at.x - width / 2 + (k + 0.5) * pitchX, y0 + height - (r + 0.5) * pitchY, at.z + 0.04);
    mesh.setMatrixAt(i, m4);
    c.copy(hex[t.group]).multiplyScalar(0.42 + 0.58 * (t.byte / 255));
    mesh.setColorAt(i, c);
  });
  mesh.userData.noAO = true; mesh.name = 'tiles';
  group.add(mesh);
  // the screen's spill on the plinth in front
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.15, 26).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: exactColor(THREE, '#2e6f66'), alphaMap: radialTex(THREE), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  spill.position.set(at.x, PLINTH.y + 0.02, at.z + 9); spill.renderOrder = 2;
  group.add(overlay(spill));
  return { group, counts, anchors: { top: [at.x, y0 + height + 0.9, at.z] } };
}

// ── Setup: arm C's strip under its glass tiles ────────────────────────────────────────────────────────────────────
export function setupStrip(d, theme, grab, res, M, at = { x: -130, z: -122 }) {
  const hrs = armHours(d, 'C');
  const cells = hrs.map((h) => ({ j: 0, he: h.he, rev: h.ground, gE: h.glass, hedged: h.glass != null ? h.expected : null, x: Math.max(0, h.kw) / 1000 }));
  const lid = hrs.filter((h) => h.glass != null).map((h) => h.he);
  const series = { days: ['2026-11-26'], cells, evening: lid, lid: [lid], contracts: Math.max(...hrs.map((h) => Math.abs(h.contracts))) };
  const yScale = 2.4, lift = 4.0, dx = 2.4, hz = 2.0;
  const f = makeField(series, theme, grab, res, { dx, hz, sheet: false, block: 0.06, solidPits: true, yScale, tileRim: { radius: 0.3, rimW: 0.5 }, bandFill: 0.2, outlineW: 0.24 });
  f.layout({ settle: 0, light: false, tileGap: 0.06 });
  f.show({ bars: true, floor: true, sides: true, glass: false, tiles: true, gaps: false, path: false, outline: true });
  const holder = new THREE.Group(); holder.name = 'setupStrip';
  f.group.rotation.y = -Math.PI / 2; // hours run west (HE01) to east (HE24)
  f.group.position.set(at.x, lift, at.z);
  holder.add(f.group);
  // hung from the roof on four rods
  const B = createBuilder(THREE);
  const L = 24 * hz;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.rod('hang|steel', [at.x + sx * (L / 2 - 0.4), lift + 0.05, at.z + sz * (dx / 2 - 0.15)], [at.x + sx * (L / 2 - 0.4), ROOF_Y - 1, at.z + sz * (dx / 2 - 0.15)], 0.035, { seg: 6 });
  const rods = B.build(M.m, { shadows: true }); holder.add(rods.group);
  const xOfHe = (he) => at.x - L / 2 + (he - 0.5) * hz;
  const peak = hrs.reduce((a, b) => (b.ground > a.ground ? b : a));
  return { group: holder, field: f, anchors: { east: [at.x + L / 2 - 1, lift + 0.3, at.z - dx / 2], peak: [xOfHe(peak.he), lift + hOf(peak.ground) * yScale + 0.4, at.z], lid: [xOfHe(18), lift + hOf(hrs[17].glass) * yScale, at.z - dx / 2] } };
}

// ── Risk desk: the coin board ─────────────────────────────────────────────────────────────────────────────────────
const COIN_VERT = /* glsl */`
varying vec3 vN; varying vec3 vC;
void main() {
  vC = instanceColor;
  vN = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * normal));
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const COIN_FRAG = /* glsl */`
uniform vec3 uKey; varying vec3 vN; varying vec3 vC;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float lam = max(dot(n, normalize(uKey)), 0.0);
  gl_FragColor = vec4(vC * (0.58 + 0.42 * lam), 1.0);
}`;
export function coinBoard(d, theme, grab, res, M, at = { x: 10, z: -122 }) {
  const { totals, tail } = armTotals(d, 'C');
  const BIN = 250, lo = Math.floor(Math.min(...totals) / BIN), hi = Math.floor(Math.max(...totals) / BIN);
  const nb = hi - lo + 1;
  const width = 23, pitch = width / nb, dia = pitch * 0.86, rise = dia * 1.04;
  const bins = Array.from({ length: nb }, () => []);
  totals.forEach((t, k) => bins[Math.floor(t / BIN) - lo].push(k));
  for (const b of bins) b.sort((a, c) => totals[a] - totals[c] || a - c);
  const most = Math.max(...bins.map((b) => b.length));
  const y0 = 1.0, slotH = most * rise + 0.6, pegH = 2.6, H = slotH + pegH + 0.8;
  const zf = at.z; // the board's front, facing north (the track)
  const group = new THREE.Group(); group.name = 'coinBoard';
  const B = createBuilder(THREE);
  // the cabinet: a back panel, two side posts, a header and a sill
  for (const s of [-1, 1]) B.box('cab|steel', 0.42, H + 1.0, 0.9, at.x + s * (width / 2 + 0.55), y0 + H / 2 - 0.1, zf + 0.35, { c: 0.04 });
  B.box('cab|steel', width + 1.6, 0.5, 0.95, at.x, y0 + H + 0.25, zf + 0.35, { c: 0.04 });
  B.box('cab|steel', width + 1.6, y0 - 0.02, 1.1, at.x, (y0 - 0.02) / 2 + PLINTH.y, zf + 0.35, { c: 0.04 });
  // the slots' dividers, and the pegs above (a Galton board's rows)
  for (let i = 0; i <= nb; i++) B.box('slot|galv', 0.035, slotH, 0.5, at.x - width / 2 + i * pitch, y0 + slotH / 2, zf + 0.32);
  const rowsN = 6;
  for (let r = 0; r < rowsN; r++) {
    const y = y0 + slotH + 0.35 + r * (pegH / rowsN), off = r % 2 ? pitch : 0;
    for (let x = -width / 2 + pitch + off; x < width / 2 - pitch / 2; x += pitch * 2) B.cyl('peg|steel', 0.05, 0.5, at.x + x, y, zf + 0.3, { rx: Math.PI / 2, seg: 8 });
  }
  const cab = B.build(M.m, { shadows: true }); group.add(cab.group);
  // the coins: one a scenario, faces toward the track, colored by the scenario's total on the heat ramp
  const coinGeo = new THREE.CylinderGeometry(dia / 2, dia / 2, 0.07, 28).rotateX(Math.PI / 2);
  const coinMat = new THREE.ShaderMaterial({ vertexShader: COIN_VERT, fragmentShader: COIN_FRAG, uniforms: { uKey: { value: new THREE.Vector3(-0.35, 0.55, -0.75) } } });
  const coins = new THREE.InstancedMesh(coinGeo, coinMat, totals.length);
  const rimGeo = new THREE.TorusGeometry(dia / 2 - 0.012, 0.022, 6, 28);
  const rimMat = new THREE.MeshBasicMaterial({ color: exactColor(THREE, COLORS.ink) });
  const rims = new THREE.InstancedMesh(rimGeo, rimMat, tail.size);
  const m4 = new THREE.Matrix4(); let ri = 0;
  bins.forEach((b, i) => b.forEach((k, s) => {
    const x = at.x - width / 2 + (i + 0.5) * pitch, y = y0 + dia / 2 + 0.02 + s * rise;
    m4.makeTranslation(x, y, zf + 0.3); coins.setMatrixAt(k, m4); coins.setColorAt(k, heatAt(theme, totals[k] / 1));
    if (tail.has(k)) { m4.makeTranslation(x, y, zf + 0.26); rims.setMatrixAt(ri++, m4); }
  }));
  rims.count = ri;
  coins.userData.noAO = true; rims.userData.noAO = true; coins.castShadow = false;
  group.add(coins, rims);
  // the front glass: the walkthrough's liquid pane over the slots and pegs
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.6, H - 0.2), glassMaterial(theme, grab, res, { size: [width + 0.6, H - 0.2], radius: 0.5, rimW: 0.7 }));
  glass.position.set(at.x, y0 + H / 2 - 0.1, zf - 0.02); glass.rotation.y = Math.PI;
  glass.material.uniforms.uTintA.value = 0.1;
  glass.layers.set(1); glass.renderOrder = 10; glass.userData.noAO = true;
  const back = glass.clone(); back.position.z = zf + 0.62; back.rotation.y = 0;
  group.add(glass, back);
  const tallest = bins.reduce((a, b, i) => (b.length > bins[a].length ? i : a), 0);
  return { group, nb, most, anchors: { top: [at.x, y0 + H + 0.6, zf], tail: [at.x - width / 2 + (Math.floor(-1000 / BIN) - lo + 3.5) * pitch, y0 + 1.2, zf], mode: [at.x - width / 2 + (tallest + 0.5) * pitch, y0 + most * rise, zf] } };
}

// ── Pit wall: three strategy boards ───────────────────────────────────────────────────────────────────────────────
function boardTexture(d, arm, theme) {
  const W = 1500, H = 1000, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const a = d.showcase.arms[arm], { totals, tail } = armTotals(d, arm);
  g.fillStyle = '#101315'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#2b3036'; g.lineWidth = 3; g.strokeRect(20, 20, W - 40, H - 40);
  // top: the schedule, MW per hour, out above zero (teal), in below (#7f9cc0); hedged hours outlined orange, dashed
  const x0 = 90, x1 = W - 90, bw = (x1 - x0) / 24, zy = 300, k = 190 / 150000;
  g.strokeStyle = '#2b3036'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, zy); g.lineTo(x1, zy); g.stroke();
  for (let h = 0; h < 24; h++) {
    const kw = a.kw[h], x = x0 + h * bw;
    if (a.contracts[h]) {
      g.save(); g.setLineDash([14, 9]); g.strokeStyle = COLORS.orange; g.lineWidth = 4;
      g.strokeRect(x + 3, zy - 200, bw - 6, 400); g.restore();
    }
    if (Math.abs(kw) < 1) continue;
    g.fillStyle = kw > 0 ? COLORS.teal : COLORS.charge;
    const hgt = Math.max(4, Math.abs(kw) * k);
    g.fillRect(x + bw * 0.18, kw > 0 ? zy - hgt : zy, bw * 0.64, hgt);
  }
  // bottom: the 301 scenarios' totals, $250 bins on one axis for all three boards (-$4,000 to $17,000), each bin
  // colored by its value on the heat ramp; the worst tenth's bins dimmed under a line; the mean an ink tick
  const lo = -4000, hi = 17000, by = 900, top = 590, sx = (x1 - x0) / (hi - lo);
  const count = new Map(), inTail = new Map();
  totals.forEach((t, k2) => { const b = Math.floor(t / 250); count.set(b, (count.get(b) ?? 0) + 1); if (tail.has(k2)) inTail.set(b, (inTail.get(b) ?? 0) + 1); });
  const cmax = 21;
  g.strokeStyle = '#2b3036'; g.beginPath(); g.moveTo(x0, by); g.lineTo(x1, by); g.stroke();
  const z0 = x0 + (0 - lo) * sx; g.strokeStyle = '#414344'; g.lineWidth = 2; g.beginPath(); g.moveTo(z0, top - 20); g.lineTo(z0, by + 12); g.stroke();
  for (const [b, c] of count) {
    const v = (b + 0.5) * 250, x = x0 + (b * 250 - lo) * sx, w = 250 * sx, hgt = (c / cmax) * (by - top);
    g.fillStyle = heatCss(theme, v);
    g.globalAlpha = inTail.get(b) === c ? 0.55 : 1;
    g.fillRect(x + 1, by - hgt, w - 2, hgt);
    g.globalAlpha = 1;
  }
  const mean = totals.reduce((s, t) => s + t, 0) / totals.length, mx = x0 + (mean - lo) * sx;
  g.strokeStyle = '#e6e8ea'; g.lineWidth = 4; g.beginPath(); g.moveTo(mx, top - 30); g.lineTo(mx, by + 16); g.stroke();
  // the worst tenth's reach: a bracket under the axis from the worst scenario to the tail's last member
  const tw = [...tail.keys()].map((k2) => totals[k2]);
  g.strokeStyle = COLORS.ink; g.globalAlpha = 0.7; g.lineWidth = 3;
  const ta = x0 + (Math.min(...tw) - lo) * sx, tb = x0 + (Math.max(...tw) - lo) * sx;
  g.beginPath(); g.moveTo(ta, by + 28); g.lineTo(ta, by + 40); g.lineTo(tb, by + 40); g.lineTo(tb, by + 28); g.stroke(); g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function heatCss(theme, v) {
  const stops = HEAT[theme], V0 = 1500, SAT = 12000;
  const t = Math.max(-1, Math.min(1, Math.asinh(v / V0) / Math.asinh(SAT / V0)));
  const f = 4 + t * 4, i = Math.max(0, Math.min(7, Math.floor(f))), k = f - i;
  const a = hexRgb(stops[i]), b = hexRgb(stops[i + 1]);
  return `rgb(${a.map((x, j) => Math.round(x + (b[j] - x) * k)).join(',')})`;
}

export function strategyBoards(d, theme, M, xs = [123, 147, 171], z = -128, turnDeg = 0) {
  const group = new THREE.Group(); group.name = 'boards';
  const W = 16, H = 10.5, y0 = 2.2;
  const anchors = {};
  // each board on its own stand, turned on its center toward the lane's approach (a row of angled boards)
  ['A', 'B', 'C'].forEach((arm, i) => {
    const g = new THREE.Group(); g.name = `board${arm}`;
    g.position.set(xs[i], 0, z); g.rotation.y = (turnDeg * Math.PI) / 180;
    const B = createBuilder(THREE);
    B.box('frame|dark', W + 0.7, H + 0.7, 0.45, 0, y0 + H / 2, 0.3, { c: 0.05 });
    for (const s of [-1, 1]) B.box('frame|steel', 0.36, y0 + 0.3, 0.36, s * (W / 2 - 1.6), (y0 + 0.3) / 2 + PLINTH.y, 0.35);
    B.box('frame|steel', W * 0.5, 0.14, 1.1, 0, PLINTH.y + 0.07, 0.35);
    g.add(B.build(M.m, { shadows: true }).group);
    const mat = new THREE.MeshBasicMaterial({ map: boardTexture(d, arm, theme), toneMapped: false });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    scr.position.set(0, y0 + H / 2, 0.04); scr.rotation.y = Math.PI; scr.userData.noAO = true;
    const rear = new THREE.Mesh(scr.geometry, mat); rear.position.set(0, y0 + H / 2, 0.56); rear.userData.noAO = true;
    g.add(scr, rear);
    // C's edge in BNB yellow (sealed); A's and B's in the idle rim
    const gold = arm === 'C', color = gold ? COLORS.gold : '#3a4149';
    g.add(overlay(line([[-W / 2 - 0.12, y0 - 0.12, -0.02], [W / 2 + 0.12, y0 - 0.12, -0.02], [W / 2 + 0.12, y0 + H + 0.12, -0.02], [-W / 2 - 0.12, y0 + H + 0.12, -0.02]],
      { color, width: gold ? 2.4 : 1.2, glow: gold ? 10 : 0, glowA: 0.4, closed: true, renderOrder: 8 })));
    g.updateMatrixWorld(true);
    const w = (x, y, zz) => { const v = V3(x, y, zz).applyMatrix4(g.matrixWorld); return [v.x, v.y, v.z]; };
    anchors[arm] = w(0, y0 + H + 0.5, 0);
    if (gold) anchors.Cface = w(0, y0 + H / 2, -0.1);
    group.add(g);
  });
  return { group, anchors };
}
