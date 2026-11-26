// Season purse (Flap): the Arcade's vending machine, 26 x 30 x 10 m at [0, 0, 172] facing the A8 to A9 straight.
// Walnut-graphite body, brass trim, tungsten bulbs chasing round its front; left, the presale tube with two brass marks
// at the Portal's floors; center, the allocation screen; right, the prize vault, a glass safe; the deposit slot at a
// visitor's height and the burn slot under the vault. Nothing has launched, so the tube and the vault are empty.
import * as THREE from 'three';
import type { FrameContext, FrameHandle } from '../types';
import type { Vec3 } from '../../lib/stage';
import { caption } from '../../words';
import { buildFigure } from '../../kit/props';
import {
  HEX, night, towerMaterials, plinth, track, along, poles, glows, pool, glassKit, faceOf, placeScreen, el, frameTick,
  mount, usd, int, createBuilder, line, backlight, type Glow, type Mats,
} from './set';
import { buildLaunchTower } from './launch';
import integrations from '../stack/integrations.json';

/** The season's launch on BSC testnet, from the stack's integrations record: "Nov 25, 12:59 CT". */
const launchedCt = (() => {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/.exec(String(integrations.flap.launch.ct));
  return m ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1]} ${Number(m[3])}, ${m[4]} CT` : '';
})();

/** The season token's ticker, one constant. Until the organizers say testnet tickers are fine, the frames print the
 *  plain name ("the season's test token") instead of it. */
export const SEASON_TOKEN = 'PRIX';

const M = { x: 0, z: 177, w: 26, h: 30, d: 10, base: 0.8 }; // z: the front face
const TUBE = { x: -8, z: 173.2, r: 2.0, y0: 4.8, y1: 25.4 };
const WIN = {
  tube: { x0: -11.4, x1: -4.6, y0: 4.0, y1: 26.2, r: 1.4 },
  screen: { x0: -3.4, x1: 3.4, y0: 14.6, y1: 25.6, r: 0.7 },
  vault: { x0: 4.5, x1: 9.5, y0: 4.0, y1: 13.8, r: 0.9 },
};
const SCREEN = { w: 6.2, h: 10.4 };

function roundedRectPath(p: THREE.Path | THREE.Shape, x0: number, y0: number, x1: number, y1: number, r: number) {
  p.moveTo(x0 + r, y0); p.lineTo(x1 - r, y0); p.quadraticCurveTo(x1, y0, x1, y0 + r);
  p.lineTo(x1, y1 - r); p.quadraticCurveTo(x1, y1, x1 - r, y1); p.lineTo(x0 + r, y1);
  p.quadraticCurveTo(x0, y1, x0, y1 - r); p.lineTo(x0, y0 + r); p.quadraticCurveTo(x0, y0, x0 + r, y0);
}
/** The cabinet's outline: square shoulders at the foot, a broad arch over the top. */
function outline(p: THREE.Path | THREE.Shape, inset = 0) {
  const x0 = -M.w / 2 + inset, x1 = M.w / 2 - inset, y0 = M.base + inset, top = M.h - inset, sh = M.h - 4.2;
  p.moveTo(x0, y0); p.lineTo(x1, y0); p.lineTo(x1, sh);
  p.bezierCurveTo(x1, top - 0.6, x1 - 3.6, top, 0, top);
  p.bezierCurveTo(-x1 + 3.6, top, x0, top - 0.6, x0, sh);
  p.lineTo(x0, y0);
}
const pathPoints = (draw: (p: THREE.Path) => void, n: number, z: number) => {
  const p = new THREE.Path(); draw(p);
  return p.getSpacedPoints(n).map((v) => [M.x + v.x, v.y, z]);
};

export function buildMachine(ctx: FrameContext, mats: Mats, o: { far?: boolean; time?: number; glass?: ReturnType<typeof glassKit>; floors?: { creation: number; graduation: number } } = {}) {
  const group = new THREE.Group(); group.name = 'seasonMachine';
  const t = o.time ?? 0;
  const zf = M.z;
  // the base steps, graphite concrete with brass nosings
  const b = createBuilder(THREE);
  b.box('base|concrete', M.w + 6, 0.4, M.d + 7, M.x, 0.32, zf - M.d / 2 + 2.2, { c: 0.05 });
  b.box('base|concrete', M.w + 3, 0.4, M.d + 4.5, M.x, 0.72, zf - M.d / 2 + 1.4, { c: 0.05 });
  b.box('base|brass', M.w + 6.05, 0.06, 0.08, M.x, 0.53, zf + 5.7).box('base|brass', M.w + 3.05, 0.06, 0.08, M.x, 0.93, zf + 3.65);
  // the shell: the outline extruded through the machine's depth, walnut-graphite
  const shell = new THREE.Shape(); outline(shell);
  for (const w of [WIN.tube, WIN.vault]) { const h = new THREE.Path(); roundedRectPath(h, w.x0 - 0.12, w.y0 - 0.12, w.x1 + 0.12, w.y1 + 0.12, w.r + 0.1); shell.holes.push(h); }
  const shellGeo = new THREE.ExtrudeGeometry(shell, { depth: M.d - 0.9, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 3, curveSegments: 28 });
  shellGeo.translate(M.x, 0, zf - M.d + 0.25);
  const shellMesh = new THREE.Mesh(shellGeo, mats.walnut); shellMesh.castShadow = true; shellMesh.receiveShadow = true;
  group.add(shellMesh);
  // the front: a fascia with the three windows cut through it, standing 0.55 m proud of the shell
  const front = new THREE.Shape(); outline(front, 0.45);
  for (const w of [WIN.tube, WIN.screen, WIN.vault]) { const h = new THREE.Path(); roundedRectPath(h, w.x0, w.y0, w.x1, w.y1, w.r); front.holes.push(h); }
  const frontGeo = new THREE.ExtrudeGeometry(front, { depth: 0.45, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 3, curveSegments: 24 });
  frontGeo.translate(M.x, 0, zf - 0.33);
  const frontMesh = new THREE.Mesh(frontGeo, mats.walnut); frontMesh.castShadow = true; frontMesh.receiveShadow = true;
  group.add(frontMesh);
  // the bays behind the windows: a deep recess each, graphite inside, with a walnut floor
  for (const [w, depth] of [[WIN.tube, 7.2], [WIN.vault, 5.4]] as const) {
    const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2, bw = w.x1 - w.x0, bh = w.y1 - w.y0;
    b.box('bay|graphiteDark', bw + 0.4, bh + 0.4, 0.2, cx, cy, zf - depth);
    b.box('bay|walnut', bw + 0.4, 0.3, depth, cx, w.y0 - 0.15, zf - depth / 2);
    b.box('bay|graphiteDark', bw + 0.4, 0.3, depth, cx, w.y1 + 0.15, zf - depth / 2);
    for (const s of [-1, 1]) b.box('bay|graphiteDark', 0.3, bh + 0.6, depth, cx + s * (bw / 2 + 0.15), cy, zf - depth / 2);
  }
  // the bays' backs: a lit backdrop each (dark at the foot, warm at the head), so the empty glass reads by its edges
  // instead of by what stands behind it; a graphite frame round it
  const backs: THREE.Mesh[] = [];
  for (const [w, depth, hi] of [[WIN.tube, 7.2, '#5a4632'], [WIN.vault, 5.4, '#4a3a2a']] as const) {
    const bw = w.x1 - w.x0, bh = w.y1 - w.y0, cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2;
    const p = backlight(bw + 0.2, bh + 0.2, '#0d0e0f', hi, { power: 1.5, side: 0.55 });
    p.position.set(cx, cy, zf - depth + 0.12); backs.push(p);
  }
  // the presale tube's scale: a brass rule on the bay's back, a tick every $500 up to the graduation floor
  // (set in buildMachine below, once the floors are known)
  // the screen's recess (the DOM screen lies on its face)
  b.box('bay|graphiteDark', SCREEN.w + 0.6, SCREEN.h + 0.6, 0.6, M.x, (WIN.screen.y0 + WIN.screen.y1) / 2, zf - 0.6);
  // pilasters: brass strips down the front corners, and the arch's brass band
  for (const s of [-1, 1]) b.box('trim|brass', 0.22, M.h - 5.2, 0.22, M.x + s * (M.w / 2 - 0.05), M.base + (M.h - 5.2) / 2, zf + 0.06);
  // the deposit slot at a visitor's chest, and the burn slot under the vault
  b.box('slot|brass', 0.62, 0.95, 0.1, M.x + 0.9, M.base + 1.45, zf + 0.18, { c: 0.02 });
  b.box('slot|graphiteDark', 0.1, 0.42, 0.06, M.x + 0.9, M.base + 1.6, zf + 0.25);
  b.cyl('slot|brassDark', 0.09, 0.06, M.x + 0.9, M.base + 1.15, zf + 0.25, { rx: Math.PI / 2, seg: 16 });
  b.box('burn|graphiteDark', 5.0, 1.3, 0.9, (WIN.vault.x0 + WIN.vault.x1) / 2, 2.35, zf - 0.2);
  // the coin chutes: brass pipes from the deposit slot into the tube's foot, and from the vault's floor to the burn
  b.tube('chute|brass', [[M.x + 0.9, M.base + 2.0, zf - 0.3], [M.x - 1.5, 3.4, zf - 2.0], [TUBE.x + 1.2, TUBE.y0 - 0.3, TUBE.z]], 0.16, { seg: 24 });
  // the crown: the token's coin, enamel in a brass rim, under the arch
  b.cyl('coin|enamel', 1.55, 0.3, M.x, M.h - 2.35, zf + 0.25, { rx: Math.PI / 2, seg: 64 });
  b.torus('coin|brass', 1.58, 0.17, M.x, M.h - 2.35, zf + 0.25, { seg: 64, tube: 10 });
  b.torus('coin|brass', 1.0, 0.045, M.x, M.h - 2.35, zf + 0.42, { seg: 64, tube: 6 });
  // the presale tube's fittings: brass end caps and the two marks (the Portal's floors)
  b.cyl('tube|brass', TUBE.r + 0.35, 0.5, TUBE.x, TUBE.y0 - 0.25, TUBE.z, { seg: 48 });
  b.cyl('tube|brass', TUBE.r + 0.35, 0.5, TUBE.x, TUBE.y1 + 0.25, TUBE.z, { seg: 48 });
  // the vault: a glass safe in a brass frame with a dial and a slot in its lid
  const V = { x: (WIN.vault.x0 + WIN.vault.x1) / 2, y0: WIN.vault.y0 + 0.1, w: 3.6, h: 6.2, d: 3.2, z: zf - 2.9 };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('vault|brass', 0.14, V.h, 0.14, V.x + sx * V.w / 2, V.y0 + V.h / 2, V.z + sz * V.d / 2);
  for (const y of [V.y0, V.y0 + V.h]) for (const sz of [-1, 1]) b.box('vault|brass', V.w + 0.14, 0.14, 0.14, V.x, y, V.z + sz * V.d / 2);
  for (const y of [V.y0, V.y0 + V.h]) for (const sx of [-1, 1]) b.box('vault|brass', 0.14, 0.14, V.d, V.x + sx * V.w / 2, y, V.z);
  b.cyl('vault|brass', 0.5, 0.16, V.x + 0.8, V.y0 + V.h * 0.55, V.z + V.d / 2 + 0.08, { rx: Math.PI / 2, seg: 40 });
  b.cyl('vault|brassDark', 0.36, 0.08, V.x + 0.8, V.y0 + V.h * 0.55, V.z + V.d / 2 + 0.18, { rx: Math.PI / 2, seg: 40 });
  b.box('vault|graphiteDark', 1.2, 0.06, 0.18, V.x, V.y0 + V.h + 0.09, V.z);
  const built = b.build({ concrete: mats.concrete, brass: mats.brass, brassDark: mats.brassDark, graphiteDark: mats.graphiteDark, walnut: mats.walnut, enamel: mats.enamel('#d9ccb2') });
  group.add(built.group);
  for (const p of backs) group.add(p);

  // brass beads round the fascia and each window
  const bead = (pts: number[][], r: number) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), true, 'centripetal');
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 2, r, 8, true), mats.brass); m.castShadow = true; return m;
  };
  group.add(bead(pathPoints((p) => outline(p, 0.48), 220, zf + 0.26), 0.13));
  for (const w of [WIN.tube, WIN.screen, WIN.vault]) group.add(bead(pathPoints((p) => roundedRectPath(p, w.x0 - 0.1, w.y0 - 0.1, w.x1 + 0.1, w.y1 + 0.1, w.r + 0.1), 120, zf + 0.26), 0.09));
  // the presale tube's marks at the floors: creation and graduation, on a linear scale whose $0 is the tube's foot and
  // whose graduation floor stands at 90% of its height (the marks' ratio is the Portal's; the scale is the design's)
  const fd = (ctx.data as { sponsors?: { flap?: { floors?: { at_half_supply_in_pool?: { creation_floor_usd: number; graduation_floor_usd: number } } } } } | null)?.sponsors?.flap?.floors?.at_half_supply_in_pool;
  const floors = o.floors ?? (fd ? { creation: fd.creation_floor_usd, graduation: fd.graduation_floor_usd } : { creation: 1, graduation: 2 });
  const yOf = (usdV: number) => TUBE.y0 + (TUBE.y1 - TUBE.y0) * 0.9 * (usdV / floors.graduation);
  const marks = { creation: yOf(floors.creation), graduation: yOf(floors.graduation) };
  for (const y of [marks.creation, marks.graduation]) {
    // a brass band round the glass with a fine engraved line above and below it
    const ring = new THREE.Mesh(new THREE.TorusGeometry(TUBE.r + 0.12, 0.16, 10, 72).rotateX(Math.PI / 2), mats.brass);
    ring.position.set(TUBE.x, y, TUBE.z); ring.castShadow = true; group.add(ring);
    for (const dy of [-0.34, 0.34]) {
      const fine = new THREE.Mesh(new THREE.TorusGeometry(TUBE.r + 0.06, 0.035, 6, 72).rotateX(Math.PI / 2), mats.brassDark);
      fine.position.set(TUBE.x, y + dy, TUBE.z); group.add(fine);
    }
  }
  {
    const r = createBuilder(THREE), rx = WIN.tube.x0 + 0.7, rz = zf - 7.2 + 0.45;
    r.box('rule|brass', 0.16, yOf(floors.graduation) - TUBE.y0 + 0.4, 0.1, rx, (TUBE.y0 + yOf(floors.graduation)) / 2, rz);
    for (let v = 0; v <= floors.graduation + 1e-6; v += 500) {
      const major = v === floors.creation || v === floors.graduation;
      r.box('rule|brass', major ? 1.3 : 0.6, major ? 0.14 : 0.07, 0.1, rx + (major ? 0.65 : 0.3), yOf(v), rz);
    }
    group.add(r.build({ brass: mats.brass }).group);
  }

  // tungsten bulbs: round the fascia, round the screen, and across the arch; chasing at 0.8 Hz
  const bulbs: number[][] = [
    ...pathPoints((p) => outline(p, 0.95), 64, zf + 0.34),
    ...pathPoints((p) => roundedRectPath(p, WIN.screen.x0 - 0.6, WIN.screen.y0 - 0.6, WIN.screen.x1 + 0.6, WIN.screen.y1 + 0.6, WIN.screen.r + 0.6), 30, zf + 0.34),
  ];
  const bulbGeo = new THREE.SphereGeometry(0.2, 14, 10);
  const bright = mats.emissive(HEX.tungsten, 3.4, '#5a4a36'), dim = mats.emissive(HEX.tungsten, 1.3, '#4a3d2e');
  const halo: Glow[] = [];
  bulbs.forEach((p, i) => {
    const phase = (i / 3 - t * 0.8 * 3) % 3;
    const on = ((phase % 3) + 3) % 3 < 1;
    const m = new THREE.Mesh(bulbGeo, on ? bright : dim); m.position.set(p[0]!, p[1]!, p[2]!); group.add(m);
    halo.push({ at: [p[0]!, p[1]!, p[2]! + 0.15], size: on ? 2.1 : 1.2, hex: HEX.tungsten, alpha: on ? 0.75 : 0.4, sharp: 0.65, k: on ? 1.2 : 0.8 });
  });
  // the burn slot's faint ember outline, and the bays' warm lamps
  const burnX = (WIN.vault.x0 + WIN.vault.x1) / 2;
  const ember = line(pathPoints((p) => roundedRectPath(p, burnX - 2.45, 1.75, burnX + 2.45, 2.95, 0.3), 60, zf + 0.27), { color: '#d9925c', width: 1.4, glow: 8, glowA: 0.35, opacity: 0.7, closed: true, reveal: false, renderOrder: 6 });
  ember.userData.noAO = true; group.add(ember);
  group.add(glows(halo, 7));

  // the screen's surface (DOM covers it) and its light
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), mats.screenBlack);
  screen.position.set(M.x, (WIN.screen.y0 + WIN.screen.y1) / 2, zf - 0.28); group.add(screen);

  // the practical pair (tungsten spots under the arch) and the bays' lamps
  const lights: THREE.Light[] = [];
  if (!o.far) {
    for (const s of [-1, 1]) {
      const sp = new THREE.SpotLight(HEX.tungsten, 520, 48, Math.PI * 0.2, 0.75, 1.5);
      sp.position.set(M.x + s * 9, M.h - 2, zf + 6); sp.target.position.set(M.x + s * 4, 0.8, zf + 4);
      group.add(sp, sp.target); lights.push(sp);
    }
    const tubeLamp = new THREE.PointLight(HEX.tungsten, 160, 18, 1.6); tubeLamp.position.set(TUBE.x, 23.5, zf - 2.2);
    const tubeLow = new THREE.PointLight(HEX.tungsten, 70, 12, 1.7); tubeLow.position.set(TUBE.x, 6.2, zf - 0.9);
    const vaultLamp = new THREE.PointLight(HEX.tungsten, 130, 12, 1.6); vaultLamp.position.set(burnX, 12.6, zf - 1.4);
    const screenLamp = new THREE.PointLight('#cfeee7', 90, 22, 1.8); screenLamp.position.set(M.x, 19, zf + 4);
    // the bulbs' own throw, grazing the walnut from either side so its grain and the brass beads catch, not a wash
    const faceL = new THREE.PointLight(HEX.tungsten, 95, 26, 1.7); faceL.position.set(M.x - 15.5, 15, zf + 2.2);
    const faceR = new THREE.PointLight(HEX.tungsten, 95, 26, 1.7); faceR.position.set(M.x + 15.5, 15, zf + 2.2);
    group.add(tubeLamp, tubeLow, vaultLamp, screenLamp, faceL, faceR); lights.push(tubeLamp, tubeLow, vaultLamp, screenLamp, faceL, faceR);
    // two marquee spots in the arch's soffit, raking down the fascia: the lacquer's sheen fades from head to foot
    for (const s of [-1, 1]) {
      const rake = new THREE.SpotLight(HEX.tungsten, 420, 40, Math.PI * 0.16, 0.9, 1.4);
      rake.position.set(M.x + s * 7.5, M.h + 1.5, zf + 3.2); rake.target.position.set(M.x + s * 8.5, 4, zf + 0.2);
      group.add(rake, rake.target); lights.push(rake);
    }
  } else {
    const glow = new THREE.PointLight(HEX.tungsten, 400, 60, 1.6); glow.position.set(M.x, 10, zf + 8); group.add(glow);
  }

  // glass: the tube and the vault (the far view draws neither)
  if (!o.far && o.glass) {
    const gk = o.glass;
    const tb = gk.tube(TUBE.r, TUBE.y1 - TUBE.y0, { tintA: 0.05, lip: 0.2 });
    tb.position.set(TUBE.x, TUBE.y0, TUBE.z); group.add(tb);
    const faces: [number, number, number, number, number][] = [
      [V.x, V.z + V.d / 2, 0, V.w, V.h], [V.x - V.w / 2, V.z, -Math.PI / 2, V.d, V.h], [V.x + V.w / 2, V.z, Math.PI / 2, V.d, V.h],
    ];
    for (const [x, z, ry, w, h] of faces) {
      const p = gk.pane(w, h, { radius: 0.12, rimW: 0.18, tintA: 0.08, spec: 0.85 });
      p.position.set(x, V.y0 + h / 2, z); p.rotation.y = ry; p.renderOrder = ry === 0 ? 12 : 10; group.add(p);
    }
  }
  return {
    group, screen, lights,
    at: {
      tubeMark: [TUBE.x + TUBE.r + 0.1, marks.graduation, TUBE.z + 0.6] as Vec3,
      tubeCreation: [TUBE.x + TUBE.r + 0.1, marks.creation, TUBE.z + 0.6] as Vec3,
      screen: [M.x + 2.4, WIN.screen.y1 - 2.0, zf] as Vec3,
      coin: [M.x + 1.2, M.h - 2.0, zf + 0.4] as Vec3,
      vault: [V.x + 1.2, V.y0 + V.h * 0.8, V.z + V.d / 2] as Vec3,
      slot: [M.x + 0.9, M.base + 1.6, zf + 0.3] as Vec3,
    },
  };
}

function seasonScreen(f: any) {
  const blk = int(f.block);
  return el('div.tw-screen.tw-tower.tw-season',
    el('div.hd', el('b', 'Season 1 · test token'), el('i.lamp')),
    el('div.how', 'how the season pays'),
    el('div.tw-formula',
      el('div.k', 'the reserve'), el('div.v', 'pro rata to deposits'),
      el('div.k', 'its 20% share'), el('div.v', 'by days sealed in time'),
      el('div.k', 'trading tax'), el('div.v', '→ the vault, paid alike'),
      el('div.k', 'the rest'), el('div.v', 'burns')),
    el('dl.tw-kv',
      el('dt', 'creation floor'), el('dd', `${int(f.floors.at_half_supply_in_pool.creation_floor_usd)} USD`),
      el('dt', 'graduation floor'), el('dd', `${int(f.floors.at_half_supply_in_pool.graduation_floor_usd)} USD`),
      el('dt', 'salt-lock fee'), el('dd', `${f.salt_lock_fee_tbnb} tBNB`)),
    el('div.rows',
      el('div.row', `Flap Portal ${f.portal_version}`, el('b.teal', f.creation_paused ? 'creation paused' : 'creation open')),
      el('div.row', 'BSC testnet', el('b', `block ${blk}`))));
}

const camFrom = (pos: Vec3, target: Vec3, vfov: number, shift: [number, number]) => {
  const dx = pos[0] - target[0], dy = pos[1] - target[1], dz = pos[2] - target[2], dist = Math.hypot(dx, dy, dz);
  return { target, az: (Math.atan2(dx, -dz) * 180) / Math.PI, el: (Math.asin(dy / dist) * 180) / Math.PI, dist, vfov, shift };
};

export async function seasonFrame(ctx: FrameContext): Promise<FrameHandle> {
  const d = ctx.needData();
  const L = ctx.layout as any;
  const { stage } = ctx;
  const f = d.sponsors.flap;
  night(ctx, { env: 0.08, warm: 0.9 });
  const mats = towerMaterials(ctx.theme);
  const gk = glassKit(ctx);
  const root = new THREE.Group(); root.name = 'T02';
  root.add(plinth(mats, L.stations.find((s: any) => s.id === 'season-purse').footprint, HEX.rim));
  root.add(plinth(mats, L.stations.find((s: any) => s.id === 'license-to-launch').footprint, HEX.rim));
  root.add(plinth(mats, L.stations.find((s: any) => s.id === 'timing-screens').footprint, HEX.teal));

  const main: number[][] = L.track.main_world;
  const lane = main.filter(([x, z]) => Math.abs(z - 210) < 0.5 && x > -200 && x < 200);
  const tr = track(mats, lane, { comet: HEX.teal, dir: 1, phase: 5 });
  root.add(tr.group);
  const pl = poles(mats, along(lane, 60, 22).map((p, i) => ({ ...p, side: i % 2 ? -1 : 1 })).filter((p) => Math.abs(p.x) > 44), { lit: (p) => p.x > -80 && p.x < 120, intensity: 300 });
  root.add(pl.group);

  const time = 1.4;
  const fl0 = f.floors.at_half_supply_in_pool;
  const machine = buildMachine(ctx, mats, { time, glass: gk, floors: { creation: fl0.creation_floor_usd, graduation: fl0.graduation_floor_usd } });
  root.add(machine.group);
  const launch = buildLaunchTower(ctx, mats, { far: true, state: 'blocked' });
  root.add(launch.group);

  // the visitor at the deposit slot, a crew jacket for the kit's hi-vis vest
  const crewMats = { ...mats.m, vest: new THREE.MeshStandardMaterial({ color: '#2b3036', roughness: 0.7 }), hazard: mats.m.dark };
  const figure = (buildFigure(THREE, { m: crewMats }) as { group: THREE.Group }).group;
  figure.position.set(M.x + 0.9, M.base + 0.4, M.z + 1.25);
  figure.rotation.y = 0;
  root.add(figure);

  const halo: Glow[] = [];
  for (const h of pl.heads) halo.push({ at: h, size: 3.2, hex: HEX.pole, alpha: 0.5, sharp: 0.6 });
  root.add(glows(halo));
  root.add(pool(HEX.tungsten, [M.x, 1.0, M.z + 7], 16, 6, 0.1));
  mount(ctx, root, mats);

  const screen = seasonScreen(f);
  screen.style.width = `${SCREEN.w * 100}px`; screen.style.height = `${SCREEN.h * 100}px`;
  ctx.overlay.appendChild(screen);

  // three-quarters from the A8 side, low, so the machine stands over the visitor and the lane leads in from the left
  const cam = camFrom([26, 2.2, 240], [-2, 15.4, 176], 40, [0.07, 0.1]);
  stage.setFade({ center: [0.5, 0.5], screen: [2, 3], world: [260, 620], worldCenter: [0, 190], glow: [0.0, 0.52] });
  stage.setKey({ az: 200, el: 40, center: [0, 12, 176], radius: 40, rimAz: 30 });
  stage.setAO({ radius: 0.7, scale: 1.1, thickness: 1.3, samples: 16 });
  stage.setShadowAuto(true);

  return {
    time,
    note: `Season purse: a design. Nothing has launched: no Wattness factory, Launcher, Vault, season token or deposit exists, so the presale tube and the vault are empty and the allocation screen shows the rules, not counts. Real: the Flap Portal's live configuration on BSC testnet (frame-data.json sponsors.flap: Portal ${f.portal_version}, block ${int(f.block)} at ${f.block_time.ct.slice(11)}, creation ${f.creation_paused ? 'paused' : 'open'}, salt-lock fee ${f.salt_lock_fee_tbnb} tBNB) and its floors at half the supply in the pool, ${usd(fl0.creation_floor_usd, 0)} to create and ${usd(fl0.graduation_floor_usd, 0)} to graduate; the tube's brass marks stand at those floors on a linear scale whose graduation floor is 90% of the tube (the ratio is the Portal's, the scale the design's). ${SEASON_TOKEN} is a placeholder held in one constant (season.ts SEASON_TOKEN): the organizers have not said whether 'no token tickers' covers testnet tokens. The visitor is the kit's figure for scale; the bulbs chase at 0.8 Hz. The License to launch tower stands east of the frame, so it is not in this view.`,
    update(tt) {
      stage.setCamera(cam);
      gk.lightDirs();
      frameTick(ctx, root, mats, tt);
    },
    decorate() {
      const sf = faceOf(machine.screen, SCREEN.w, SCREEN.h);
      placeScreen(ctx, screen, sf, 100);
      // the screen's own rect stays clear of plates, so the leaders never cover its rules
      const ps = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => sf.c.clone().addScaledVector(sf.right, (sx * sf.w) / 2).addScaledVector(sf.up, (sy * sf.h) / 2)))
        .map((p) => ctx.plates.project([p.x, p.y, p.z])).filter((p): p is { x: number; y: number } => !!p);
      const scr = { x: Math.min(...ps.map((p) => p.x)) - 10, y: Math.min(...ps.map((p) => p.y)) - 10, w: 0, h: 0 };
      scr.w = Math.max(...ps.map((p) => p.x)) - scr.x + 20; scr.h = Math.max(...ps.map((p) => p.y)) - scr.y + 20;
      const cap = caption(ctx, { head: 'Season rewards', flavor: 'season purse', line: `The season's test token: contributors get the reserve pro rata; a 20% share and the vault's trading tax pay by days sealed before the gate.` });
      const fl = f.floors.at_half_supply_in_pool;
      ctx.plates.leaders([
        { id: 'tube', text: `Creation floor ${int(fl.creation_floor_usd)} USD · Graduation floor ${int(fl.graduation_floor_usd)} USD (half the supply in the pool)`, at: machine.at.tubeMark, priority: 0 },
        { id: 'config', text: `Flap Portal ${f.portal_version} · BSC testnet · creation ${f.creation_paused ? 'paused' : 'open'} · salt-lock fee ${f.salt_lock_fee_tbnb} tBNB`, at: machine.at.screen, priority: 1 },
        { id: 'status', text: `Season 1 launched on BSC testnet, ${launchedCt}`, at: machine.at.coin, priority: 2 },
        { id: 'boundary', text: 'Pays for days sealed in time, never a share of revenue.', at: machine.at.vault, priority: 3 },
      ], { max: 5, keepOut: cap ? [cap, scr] : [scr] });
    },
  };
}

