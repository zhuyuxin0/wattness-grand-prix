// The Arena: the ONE PLAN cabinet at rest on the sealed plan (arm C), the standings tower and the kiosk, the warm
// corner of the venue. Every height and color on the field and in the tray is the sealed day's (frame-data.json
// game.results.C and game.histogram); the cabinet, the bulbs and the brass are architecture.
import * as THREE from 'three';
import { createBuilder } from '../../kit/geo';
import { heatAt, hOf } from '../../lib/heat';
import { HEX, exact, glowMat, pool, radialTex, barMaterial } from './look';
import { PLINTH_H } from './ground';
import { bulbs, screen, type Hardware } from './heroes';
import type { FrameData } from '../types';

/** Walnut-graphite: a dark grain 0.85 of the way to #1f2429, clearcoated. */
function walnut() {
  const w = 256, h = 1024, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a221c'; g.fillRect(0, 0, w, h);
  let s = 91; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 140; i++) {
    const x = r() * w, a = 0.05 + r() * 0.12, wd = 0.6 + r() * 2.2;
    g.strokeStyle = r() > 0.5 ? `rgba(70,52,38,${a})` : `rgba(12,10,8,${a})`; g.lineWidth = wd;
    g.beginPath(); g.moveTo(x, 0);
    for (let y = 0; y <= h; y += 32) g.lineTo(x + Math.sin(y * 0.012 + i) * 6 + Math.sin(y * 0.05 + i * 3) * 1.5, y);
    g.stroke();
  }
  g.fillStyle = 'rgba(31,36,41,0.85)'; g.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 3, 1 / 9);
  return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.45, clearcoat: 0.7, clearcoatRoughness: 0.18 });
}

export function buildArena(d: FrameData, H: Hardware, o: { arm?: 'A' | 'B' | 'C' } = {}) {
  const g = new THREE.Group(); g.name = 'arena';
  const arm = o.arm ?? (d.showcase.selected_arm as 'C');
  const R = d.game.results[arm], A = d.game.results.A;
  const warm = radialTex(1.3), cool = radialTex(1.6);
  const wood = walnut();

  // the cabinet: x -358..-292, z 184..222.4, 9 m high, walnut-graphite sides, a brass rail round the field
  const b = createBuilder(THREE);
  b.box('body|wood', 66, 8.6, 38.4, -325, 4.3, 203.2, { c: 0.35 });
  b.box('top|graphite', 64.4, 0.4, 32.6, -325, 8.8, 205);
  for (const [w, dd, x, z] of [[66, 0.5, -325, 220.6], [66, 0.5, -325, 189.4], [0.5, 31.6, -357.6, 205], [0.5, 31.6, -292.4, 205]] as const) b.box('rail|brass', w, 0.3, dd, x, 9.15, z);
  // the backbox behind the field (z 184..190) rising to the P1 banner
  b.box('back|wood', 66, 27, 6, -325, 22.5, 187);
  b.box('back|graphite', 34, 13.6, 0.4, -325, 19, 190.2);
  b.box('back|graphite', 46, 5.2, 0.6, -325, 29, 190.3);
  b.box('back|graphite', 40, 3.6, 0.6, -325, 34.5, 190.3);
  // the console before it (z 226..234): the desk, the dial's housing, the pucks' rail, the seal button's pedestal
  b.box('console|wood', 66, 2.4, 8, -325, 1.2, 230, { c: 0.2 });
  b.box('console|graphite', 66.4, 0.2, 8.4, -325, 2.5, 230);
  b.cyl('console|brass', 2.2, 0.5, -343, 2.7, 230, { seg: 40 });
  b.cyl('console|graphite', 1.6, 0.4, -300, 2.7, 230, { seg: 40 });
  for (let i = 0; i < 24; i++) b.cyl('console|brass', 0.45, 0.3, -338 + i * 1.4, 2.65, 230, { seg: 20 });
  // the score tower on the cabinet's east side: a high striker, $2,500 at its foot to $3,800 at the bell
  b.box('tower|graphite', 1.6, 24, 1.6, -290.5, 21, 196);
  b.box('tower|brass', 0.3, 24, 0.3, -289.5, 21, 197);
  b.sphere('tower|brass', 1.0, -290.5, 33.6, 196, { ws: 20, hs: 12 });
  g.add(b.build({ wood, graphite: H.graphiteDark, brass: H.brass }).group);
  const score = (u: number) => 9 + 24 * Math.max(0, Math.min(1, (u / 1e6 - 2500) / 1300));
  const arms = d.showcase.arms;
  for (const a of ['A', 'B'] as const) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.5), glowMat(a === 'A' ? HEX.armA : HEX.armB, 1.2)); m.position.set(-289.3, score(arms[a].objective_uusd), 197.2); g.add(m); }
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.4, 32), glowMat(HEX.teal, 1.5)); puck.position.set(-290.5, score(arms[arm].objective_uusd), 196); g.add(puck);

  // the field: 301 scenarios across (sorted by arm A's day total, the worst west), 24 hours deep, each cell what
  // that hour nets in that scenario under the plan (physical + hedge + wear + fee), 1.4 asinh($ / 1,500) high
  const n = R.total_uusd.length, order = Array.from({ length: n }, (_, k) => k).sort((p, q) => A.total_uusd[p] - A.total_uusd[q] || p - q);
  const cell = new THREE.BoxGeometry(0.2, 1, 1.2), cells = n * 24;
  const field = new THREE.InstancedMesh(cell, barMaterial(), cells), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  let i = 0;
  order.forEach((k, j) => {
    for (let h = 0; h < 24; h++) {
      const net = (R.physical_uusd[k][h] + R.hedge_uusd[k][h] + R.wear_uusd[h] + R.fee_uusd[h]) / 1e6;
      const y = hOf(net), x = -325 + (j - 150) * 0.2, z = 205 + (12.5 - (h + 1)) * 1.2;
      // a bar stands up from the floor; a paid hour hangs a pit below it, its top flush with the floor
      const top = Math.max(y, 0.02), bot = Math.min(y, 0) - 0.02;
      v.set(x, 9 + (top + bot) / 2, z); s.set(1, top - bot, 1);
      m4.compose(v, q, s); field.setMatrixAt(i, m4); field.setColorAt(i, heatAt('dark', net)); i++;
    }
  });
  field.userData.noAO = false; g.add(field);
  // the plan's glass: one bar a hedged hour across all 301 columns, at what its contracts lock at the assumed entry
  const C = d.showcase.arms[arm], entry = d.game.hedge.entry_cents as number[];
  (C.contracts as number[]).forEach((qh, h) => {
    if (!qh) return;
    const lock = (qh * entry[h]!) / 100, y = 9 + hOf(lock), th = 0.08 + (0.32 * Math.abs(qh)) / 100;
    const pane = new THREE.Mesh(new THREE.BoxGeometry(60.2, th, 1.152), new THREE.MeshPhysicalMaterial({ color: '#d6e9f0', roughness: 0.04, transparent: true, opacity: 0.22, clearcoat: 1, depthWrite: false }));
    pane.position.set(-325, y, 205 + (12.5 - (h + 1)) * 1.2); pane.userData.noAO = true; pane.renderOrder = 5; g.add(pane);
  });

  // the tray: 83 glass tubes, the day's 301 coins settled in their $250 bins, each coin's enamel in the ramp's color of
  // its own total
  const hist = d.game.histogram, edges = hist.edges_uusd as number[], nb = edges.length - 1;
  const bin = (u: number) => Math.max(0, Math.min(nb - 1, Math.floor((u - edges[0]!) / hist.bin_uusd)));
  const stacks = new Array(nb).fill(0) as number[];
  const coinGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.24, 24);
  const coins = new THREE.InstancedMesh(coinGeo, barMaterial(0), n), rims = new THREE.InstancedMesh(new THREE.TorusGeometry(0.31, 0.04, 6, 24).rotateX(Math.PI / 2), H.brass, n);
  const sorted = Array.from({ length: n }, (_, k) => k).sort((p, q2) => R.total_uusd[p] - R.total_uusd[q2]);
  sorted.forEach((k, c) => {
    const u = R.total_uusd[k], bi = bin(u), x = -355.1 + (bi + 0.5) * 0.7253, y = 0.4 + 0.12 + 0.24 * stacks[bi]!++;
    m4.makeTranslation(x, y, 221.6); coins.setMatrixAt(c, m4); coins.setColorAt(c, heatAt('dark', u / 1e6)); rims.setMatrixAt(c, m4);
  });
  coins.castShadow = true; g.add(coins, rims);
  const tubes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.36, 0.36, 5.6, 20, 1, true), new THREE.MeshPhysicalMaterial({ color: '#e3f2f7', roughness: 0.05, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }), nb);
  for (let t = 0; t < nb; t++) { m4.makeTranslation(-355.1 + (t + 0.5) * 0.7253, 3.2, 221.6); tubes.setMatrixAt(t, m4); }
  tubes.userData.noAO = true; tubes.renderOrder = 4; g.add(tubes);
  const trayBase = new THREE.Mesh(new THREE.BoxGeometry(61, 0.4, 1.4).translate(0, 0.2, 0), H.brass); trayBase.position.set(-325, 0, 221.6); g.add(trayBase);

  // the backbox's screen: the score plane, mean up and the worst tenth's average across, A, B and C as marks
  const st = (a: 'A' | 'B' | 'C') => ({ mean: arms[a].expected_uusd / 1e6, tail: -arms[a].cvar_uusd / 1e6 });
  const pts = (['A', 'B', 'C'] as const).map((a) => ({ a, ...st(a) }));
  const plane = screen(1020, 460, (c, w, h) => {
    c.fillStyle = '#0a0e12'; c.fillRect(0, 0, w, h);
    const x = (t: number) => 80 + ((t + 2000) / 2600) * (w - 160), y = (m: number) => h - 60 - ((m - 3450) / 300) * (h - 120);
    c.strokeStyle = 'rgba(150,156,163,0.25)'; c.lineWidth = 2;
    for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(80, 60 + k * ((h - 120) / 4)); c.lineTo(w - 80, 60 + k * ((h - 120) / 4)); c.stroke(); }
    for (const p of pts) { c.fillStyle = p.a === 'A' ? HEX.armA : p.a === 'B' ? HEX.armB : HEX.armC; c.beginPath(); c.arc(x(p.tail), y(p.mean), p.a === arm ? 16 : 11, 0, Math.PI * 2); c.fill(); }
  }, 1.4);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), plane); scr.position.set(-325, 19, 190.45); g.add(scr);
  // the ticker: the seal feed (two receipts, the refused late seal in red)
  const ticker = screen(2048, 64, (c, w, h) => {
    c.fillStyle = '#070a0c'; c.fillRect(0, 0, w, h);
    const items = [HEX.bnb, HEX.bnb, HEX.refused];
    items.forEach((col, k) => { c.fillStyle = col; c.fillRect(60 + k * 640, 18, 28, 28); c.fillStyle = 'rgba(230,232,234,0.55)'; c.fillRect(110 + k * 640, 26, 420, 12); });
  }, 1.4);
  const tk = new THREE.Mesh(new THREE.PlaneGeometry(44, 1.0), ticker); tk.position.set(-325, 26.1, 190.65); g.add(tk);
  // the marquee panel (its words are the build's decision; here it is the lit panel and its chasers) and the P1
  // banner above it, the day's best sealed plan, in the sealed livery
  const marquee = new THREE.Mesh(new THREE.PlaneGeometry(44, 4.4), glowMat('#3b2a1c', 1.0)); marquee.position.set(-325, 29, 190.62); g.add(marquee);
  const bulbRow = bulbs([[-22.4, 26.6], [22.4, 26.6], [22.4, 31.4], [-22.4, 31.4]], 0, 190.75, 0.8, 0.26); bulbRow.position.x = -325; g.add(bulbRow);
  const p1 = new THREE.Mesh(new THREE.PlaneGeometry(38, 3.2), glowMat('#2a2410', 1.0)); p1.position.set(-325, 34.5, 190.65); g.add(p1);
  const p1Rim = new THREE.Mesh(new THREE.PlaneGeometry(38.6, 3.8), glowMat(HEX.bnb, 1.7)); p1Rim.position.set(-325, 34.5, 190.6); g.add(p1Rim);
  const p1Stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3.2), glowMat(HEX.bnb, 2.2)); p1Stripe.position.set(-343.6, 34.5, 190.7); g.add(p1Stripe);
  // tungsten round the field's rail and the console's front: the Arcade's chasers
  const railBulbs = bulbs([[-357.8, 0], [-292.2, 0]], 9.45, 221.0, 1.1, 0.14, false); g.add(railBulbs);
  const consoleBulbs = bulbs([[-357.8, 0], [-292.2, 0]], 2.2, 234.1, 0.9, 0.13, false); g.add(consoleBulbs);
  // the warm pools on the plinth round the cabinet, the venue's only warm light
  g.add(pool(HEX.tungsten, 56, 0.2, warm, [-325, PLINTH_H + 0.03, 214], { sz: 0.8 }));
  g.add(pool(HEX.tungsten, 26, 0.22, warm, [-325, PLINTH_H + 0.04, 238], { sz: 0.45 }));
  g.add(pool(HEX.tungsten, 20, 0.12, warm, [-325, 9.4, 205], { sz: 0.6 }));

  // the standings tower: 10 x 34 m facing south-west, the 316 plans' modeled standings as rows (the top sixteen by the
  // selected arm's expected value, each bar in its arm's color)
  const bats = (d.fleet.batteries as any[]).slice().sort((p, q2) => q2.selected_expected_usd - p.selected_expected_usd).slice(0, 16);
  const mx = bats[0].selected_expected_usd;
  const stand = screen(400, 1200, (c, w, h) => {
    c.fillStyle = '#080c0f'; c.fillRect(0, 0, w, h);
    bats.forEach((bt, r) => {
      const y = 60 + r * ((h - 120) / 16), bw = ((w - 120) * bt.selected_expected_usd) / mx;
      c.fillStyle = 'rgba(150,156,163,0.3)'; c.fillRect(30, y + 8, 40, 26);
      c.fillStyle = bt.selected_arm === 'B' ? HEX.armB : HEX.armC; c.fillRect(90, y + 8, bw, 26);
      if (bt.resource === d.showcase.resource) { c.fillStyle = HEX.bnb; c.fillRect(20, y + 4, 6, 34); }
    });
  }, 1.4);
  const tower = new THREE.Group(); tower.position.set(-240, PLINTH_H, 196); tower.rotation.y = (-225 * Math.PI) / 180 + Math.PI;
  const tb = new THREE.Mesh(new THREE.BoxGeometry(10, 34, 3).translate(0, 17, 0), H.graphite); tb.castShadow = true; tower.add(tb);
  const tf = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 30), stand); tf.position.set(0, 17.6, 1.52); tower.add(tf);
  const tcap = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.5, 3.4), H.brass); tcap.position.set(0, 34.2, 0); tower.add(tcap);
  g.add(tower);
  g.add(pool(HEX.teal, 12, 0.1, cool, [-243, PLINTH_H + 0.03, 199]));
  // the kiosk
  const kiosk = new THREE.Mesh(new THREE.BoxGeometry(6, 3.6, 5).translate(0, 1.8, 0), wood); kiosk.position.set(-262, PLINTH_H, 236); kiosk.castShadow = true; g.add(kiosk);
  const kw = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.6), glowMat(HEX.tungsten, 0.7)); kw.position.set(-262, PLINTH_H + 2.2, 238.52); g.add(kw);
  g.add(pool(HEX.tungsten, 8, 0.16, warm, [-262, PLINTH_H + 0.03, 241]));

  const lit = exact(HEX.tungsten);
  return { group: g, warm: lit, p1: [-325, 34.5, 190.6] as [number, number, number], cabinet: [-325, 9, 205] as [number, number, number] };
}
