// R04 · Every plan, ranked (standings): 316 sealed plans, modeled. Lit for the 90 s cut (Jo, Nov 26): the night rig
// raised, the plaza floodlit, the table's type a size up and its rows lighter. The Arena's timing tower: P1 to P12 by each plan's expected value with
// its day-plan sparkline and arm, Desert Willow pinned at its own place, and the crown on the arena's one committer.
import * as THREE from 'three';
import { createMaterials } from '../../kit/materials';
import { buildFigure } from '../../kit/props';
import { exactColor } from '../../kit/tone';
import type { Vec3 } from '../../lib/stage';
import type { FrameContext, FrameHandle } from '../types';
import { HEX, apron, plinth, glow, screen, glassKit, finish, detail, counted, nightRig, poseFrom, livery, fmt, type Footprint } from './venue';
import { line } from './lines';
import { caption, litType } from '../../words';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

interface Row { resource: string; hub: string; selected_arm: string; selected_expected_uusd: number; selected_expected_usd: number; selected_kw: number[]; power_mw: number }

export async function r04(ctx: FrameContext): Promise<FrameHandle> {
  const { stage } = ctx;
  const d = ctx.needData();
  const L = ctx.layout as any;
  const sd = d.sealed_day, show = d.showcase;
  const fp: Footprint = L.stations.find((s: any) => s.id === 'arena').footprint;
  const T = L.arena.standings_tower;
  const M = createMaterials(THREE, 'dark');
  const G = glassKit(ctx);
  const root = new THREE.Group(); root.name = 'R04';

  // the page's default sort: expected value, most first (ties by resource)
  const rows: Row[] = [...d.fleet.batteries].sort((a: Row, b: Row) => b.selected_expected_uusd - a.selected_expected_uusd || a.resource.localeCompare(b.resource));
  const top = rows.slice(0, 12);
  const dwAt = rows.findIndex((r) => r.resource === show.resource);
  const dw = rows[dwAt]!;
  const wallet: string = sd.agent.wallet;

  root.add(apron(-1600, 1600, -1600, 1600));
  root.add(plinth(fp, { led: HEX.idle, ledA: 0.9 }));
  // the plaza: graphite with brass inlays radiating from the tower's foot
  const brass = new THREE.MeshStandardMaterial({ color: HEX.brass, metalness: 1, roughness: 0.32 });
  for (let k = -3; k <= 3; k++) {
    const a = ((225 + 180 + k * 9) * Math.PI) / 180, len = 46;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, len).translate(0, 0, -len / 2 - 8), brass);
    strip.position.set(T.center[0], 0.13, T.center[2]); strip.rotation.y = -a; strip.receiveShadow = true; root.add(strip);
  }
  for (const r of [14, 22, 30]) {
    const pts: Vec3[] = []; for (let k = 0; k <= 48; k++) { const a = ((225 - 32 + (64 * k) / 48) * Math.PI) / 180; pts.push([T.center[0] + Math.sin(a) * r, 0.135, T.center[2] - Math.cos(a) * r]); }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 64, 0.05, 6, false), brass);
    root.add(tube);
  }

  // ── the tower: graphite, a lit table behind liquid glass, the crown section on top ─────────────────────────────
  const face = (T.faces_deg * Math.PI) / 180;
  const tower = new THREE.Group(); tower.position.set(T.center[0], 0.12, T.center[2]); tower.rotation.y = -face; root.add(tower);
  const paint = new THREE.MeshPhysicalMaterial({ color: '#262c32', roughness: 0.36, metalness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.16 });
  const [TW, TH] = T.size_m as [number, number];
  const body = new THREE.Mesh(new THREE.BoxGeometry(TW, TH, 2.4).translate(0, TH / 2, 0.4), paint); body.castShadow = true; body.receiveShadow = true; tower.add(body);
  const plinthT = new THREE.Mesh(new THREE.BoxGeometry(TW + 2.4, 0.9, 4.4).translate(0, 0.45, 0.4), paint); plinthT.castShadow = true; tower.add(plinthT);
  const SW = TW - 1.0, SH = TH - 2.2;
  const crownH = 0.17, rowsTop = 0.215, rowH = 0.052, gapTop = rowsTop + 12 * rowH;
  const tab = screen(SW, SH, 72, (g, W, H) => {
    g.fillStyle = '#0f1419'; g.fillRect(0, 0, W, H);
    // the crown: the arena's committers, one so far
    g.fillStyle = '#12161b'; g.fillRect(0, 0, W, H * crownH);
    g.fillStyle = HEX.bnb; g.fillRect(0, H * crownH - 5, W, 5);
    const cx = W * 0.5, cy = H * 0.045, cw = W * 0.2;
    g.beginPath(); g.moveTo(cx - cw / 2, cy + cw * 0.28); g.lineTo(cx - cw / 2, cy - cw * 0.12); g.lineTo(cx - cw / 4, cy + cw * 0.08); g.lineTo(cx, cy - cw * 0.22);
    g.lineTo(cx + cw / 4, cy + cw * 0.08); g.lineTo(cx + cw / 2, cy - cw * 0.12); g.lineTo(cx + cw / 2, cy + cw * 0.28); g.closePath(); g.fillStyle = HEX.bnb; g.fill();
    g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillStyle = '#969ca3'; g.font = `600 ${Math.round(W * 0.05)}px "Libre Franklin Brand", sans-serif`; g.fillText('SEALED BY', W / 2, H * 0.09);
    g.fillStyle = '#f6f7f8'; g.font = `600 ${Math.round(W * 0.062)}px SFMono-Regular, Menlo, monospace`; g.fillText(fmt.short(wallet, 4, 4), W / 2, H * 0.122);
    g.fillStyle = HEX.bnb; g.font = `600 ${Math.round(W * 0.05)}px "Libre Franklin Brand", sans-serif`; g.fillText(`${sd.leaf_count} plans sealed`, W / 2, H * 0.149);
    g.textAlign = 'left';
    g.fillStyle = '#aab1b8'; g.font = `600 ${Math.round(W * 0.042)}px "Libre Franklin Brand", sans-serif`; g.fillText('RANKED BY EXPECTED VALUE, MODELED', W * 0.05, H * 0.195);
    const rowAt = (r: Row, pos: number, y: number, pin: boolean) => {
      const h = H * rowH;
      g.fillStyle = pin ? '#17302a' : pos % 2 ? '#181d23' : '#13181d'; g.fillRect(0, y, W, h - 3);
      if (pin) { g.fillStyle = HEX.teal; g.fillRect(0, y, 8, h - 3); }
      g.textAlign = 'left';
      g.fillStyle = pos === 1 ? HEX.bnb : '#f6f7f8'; g.font = `700 ${Math.round(h * 0.4)}px SFMono-Regular, Menlo, monospace`; g.fillText(`P${pos}`, W * 0.03, y + h * 0.5);
      g.fillStyle = '#f6f7f8'; g.font = `600 ${Math.round(h * 0.28)}px "Libre Franklin Brand", sans-serif`; g.fillText(r.resource, W * 0.185, y + h * 0.34);
      g.fillStyle = '#aab1b8'; g.font = `500 ${Math.round(h * 0.18)}px "Libre Franklin Brand", sans-serif`; g.fillText(r.hub, W * 0.185, y + h * 0.74);
      g.fillStyle = '#ffffff'; g.font = `600 ${Math.round(h * 0.24)}px SFMono-Regular, Menlo, monospace`; g.textAlign = 'right'; g.fillText(fmt.usd(r.selected_expected_usd), W * 0.645, y + h * 0.75); g.textAlign = 'left';
      // the day plan: 24 hours, discharge up teal, charge down
      const x0 = W * 0.665, x1 = W * 0.865, mid = y + h * 0.5, amp = h * 0.36, mw = Math.max(...r.selected_kw.map(Math.abs), 1);
      const bw = (x1 - x0) / 24;
      g.fillStyle = '#2b3036'; g.fillRect(x0, mid, x1 - x0, 1);
      r.selected_kw.forEach((v, k) => { if (!v) return; const bh = Math.max(1.5, (Math.abs(v) / mw) * amp); g.fillStyle = v > 0 ? HEX.teal : HEX.charge; g.fillRect(x0 + k * bw, v > 0 ? mid - bh : mid + 1, bw * 0.72, bh); });
      const ax = W * 0.895, as = h * 0.34;
      g.fillStyle = r.selected_arm === 'B' ? HEX.armB : HEX.armC; g.fillRect(ax, y + h * 0.5 - as / 2, as, as);
      g.fillStyle = '#0b0f14'; g.font = `700 ${Math.round(h * 0.24)}px "Libre Franklin Brand", sans-serif`; g.textAlign = 'center'; g.fillText(r.selected_arm, ax + as / 2, y + h * 0.51); g.textAlign = 'left';
    };
    top.forEach((r, i) => rowAt(r, i + 1, H * (rowsTop + i * rowH), false));
    g.fillStyle = '#3a4148'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(W * 0.5 + (k - 1) * W * 0.04, H * (gapTop + 0.03), W * 0.008, 0, Math.PI * 2); g.fill(); }
    rowAt(dw, dwAt + 1, H * (gapTop + 0.06), true);
    g.fillStyle = '#7d848c'; g.font = `500 ${Math.round(W * 0.034)}px "Libre Franklin Brand", sans-serif`;
    g.fillText(`${rows.length} plans · modeled under each plan's own scenarios`, W * 0.05, H * 0.975);
  });
  tab.position.set(0, 1.15 + SH / 2, -0.82); tab.rotation.y = Math.PI; tower.add(tab);
  const pane = G.pane(SW + 0.3, SH + 0.3, { r: 0.4, rimW: 0.45, tintA: 0.06, refract: 0.02, frost: 0.04, spec: 0.9 }); pane.position.set(0, 1.15 + SH / 2, -0.98); pane.rotation.y = Math.PI; tower.add(pane);
  const crownLed = new THREE.Mesh(new THREE.BoxGeometry(TW, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(HEX.bnb), toneMapped: false })); crownLed.position.set(0, TH + 0.02, -0.78); tower.add(crownLed);
  const foot = glow(HEX.teal, 30, 0.14); foot.position.set(T.center[0] - 6, 0.14, T.center[2] + 6); root.add(foot);
  const yRow = (frac: number) => 1.15 + SH * (1 - frac); // a row's height on the tower from its share down the table
  const towerPt = (frac: number, xFrac = 0): Vec3 => {
    const v = new THREE.Vector3(xFrac * SW * 0.5, yRow(frac), -1.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), -face);
    return [T.center[0] + v.x, 0.12 + v.y, T.center[2] + v.z];
  };

  // two visitors on the plaza, for scale
  const M2 = createMaterials(THREE, 'dark');
  M2.m.vest.color.set('#3a4048'); M2.m.hat.color.set('#2b3036');
  for (const [x, z, ry] of [[-249.6, 205.6, 0.62], [-246.4, 207.4, 0.9]] as const) {
    const f = buildFigure(THREE, M2); f.group.position.set(x, 0.12, z); f.group.rotation.y = ry; root.add(f.group);
  }

  // the Arcade's warm side off the left edge: its tungsten spills onto the plaza (never onto a data mark)
  const warm = counted(new THREE.PointLight(exactColor(THREE, HEX.tungsten), 180, 40, 2)); warm.position.set(-288, 6, 226); root.add(warm);
  // the ONE PLAN cabinet's warm side (a stand-in from layout.arena.machine's box: walnut-graphite, a brass rail,
  // the backbox with its marquee and P1 banner edged in tungsten bulbs; the game itself is the X frames')
  {
    const A = L.arena.machine, cab = A.cabinet, bb = A.backbox;
    const walnut = new THREE.MeshPhysicalMaterial({ color: '#2a2622', roughness: 0.55, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(cab.x[1] - cab.x[0], cab.y[1], cab.z[1] - cab.z[0]).translate(0, cab.y[1] / 2, 0), walnut);
    body.position.set((cab.x[0] + cab.x[1]) / 2, 0.12, (cab.z[0] + cab.z[1]) / 2); body.castShadow = true; body.receiveShadow = true; root.add(body);
    const back = new THREE.Mesh(new THREE.BoxGeometry(cab.x[1] - cab.x[0], A.backbox.p1_banner_y[1], bb.z[1] - bb.z[0]).translate(0, A.backbox.p1_banner_y[1] / 2, 0), walnut);
    back.position.set((cab.x[0] + cab.x[1]) / 2, 0.12, (bb.z[0] + bb.z[1]) / 2); back.castShadow = true; root.add(back);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, cab.z[1] - cab.z[0]), brass); rail.position.set(cab.x[1] + 0.1, cab.y[1] + 0.25, (cab.z[0] + cab.z[1]) / 2); root.add(rail);
    const rail2 = new THREE.Mesh(new THREE.BoxGeometry(cab.x[1] - cab.x[0], 0.3, 0.3), brass); rail2.position.set((cab.x[0] + cab.x[1]) / 2, cab.y[1] + 0.25, cab.z[1] + 0.1); root.add(rail2);
    const bulbGeo = new THREE.SphereGeometry(0.16, 12, 8), bulbs: THREE.Matrix4[] = [];
    const ring = (y0: number, y1: number, z: number) => {
      for (let x = cab.x[0] + 1; x <= cab.x[1] - 1; x += 1.2) for (const y of [y0, y1]) bulbs.push(new THREE.Matrix4().makeTranslation(x, y, z));
      for (let y = y0; y <= y1; y += 1.2) for (const x of [cab.x[0] + 0.6, cab.x[1] - 0.6]) bulbs.push(new THREE.Matrix4().makeTranslation(x, y, z));
    };
    ring(bb.marquee_y[0], bb.marquee_y[1], bb.z[1] + 0.2); ring(bb.p1_banner_y[0], bb.p1_banner_y[1] - 0.4, bb.z[1] + 0.2);
    for (let z = cab.z[0] + 1; z <= cab.z[1] - 1; z += 1.2) bulbs.push(new THREE.Matrix4().makeTranslation(cab.x[1] + 0.25, cab.y[1] - 0.6, z));
    const bulbMesh = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(HEX.tungsten), toneMapped: false }), bulbs.length);
    bulbs.forEach((m4, i) => { m4.elements[13] += 0.12; bulbMesh.setMatrixAt(i, m4); }); bulbMesh.userData.noAO = true; root.add(bulbMesh);
    const spill = glow(HEX.tungsten, 30, 0.07); spill.position.set(cab.x[1] + 4, 0.14, cab.z[1] - 6); root.add(spill);
  }
  // the A7 arrow's lane arriving at the Arena, its comets running in
  const lane: Vec3[] = (L.lanes.find((l: any) => l.id === 'A7').world_points as [number, number][]).map(([x, z]) => [x, 0.16, z] as Vec3);
  root.add(line(lane, { color: HEX.teal, width: 1.4, glow: 8, glowA: 0.25, opacity: 0.5, reveal: false, renderOrder: 4 }));

  // floodlight on the tower and the plaza from the camera's side, and a cool wash on the plaza round its foot
  { const sp = counted(new THREE.SpotLight(exactColor(THREE, '#e6eefa'), 2400, 120, 0.5, 0.75, 1.6)); sp.position.set(-292, 24, 252); sp.target.position.set(-242, 8, 200); root.add(sp, sp.target); }
  { const w = glow('#cfdcee', 70, 0.09); w.position.set(T.center[0] - 14, 0.15, T.center[2] + 16); root.add(w); }

  finish(ctx, root, M);
  nightRig(stage, [120, 420]);
  stage.setLight({ key: { color: '#93a8d4', intensity: 0.62 }, rim: { color: '#7f95c0', intensity: 0.34 },
    fill: { sky: '#4f6388', ground: '#1b1914', intensity: 0.8 }, env: 0.14, shadow: 0.2 });
  stage.setFade({ center: [0.5, 0.5], screen: [3, 4], world: [500, 900], worldCenter: [-240, 210] });
  stage.setAO({ radius: 0.5, scale: 1.1, thickness: 1.0, samples: 16 });
  stage.setKey({ az: 160, el: 36, center: [-248, 10, 210], radius: 40, rimAz: 20 });
  stage.setShadowAuto(true);
  // closer than the storyboard's view, looking up the tower so its table reads and it fills the frame's height
  const cam = poseFrom([-271, 5.5, 241], [-244, 14, 198], 46, [0.1, 0.03]);

  return {
    time: 0,
    note: `Real: the tower's rows are frame-data.json fleet.batteries sorted by selected_expected_usd, most first (the Standings page's default sort): P1 ${top[0]!.resource} at ${fmt.usd(top[0]!.selected_expected_usd)} down to P12 ${top[11]!.resource}; Desert Willow at P${dwAt + 1}, ${fmt.usd(dw.selected_expected_usd)}; each sparkline is the row's selected_kw (24 hours), each letter its selected_arm. The crown sits on the arena's one committer, ${wallet} (sealed_day.agent), with ${sd.leaf_count} plans. These are modeled expected values under each leaf's own scenarios, not settled scores, and rank our shadow plans, not any operator. Illustrative: the plaza, its brass, the two visitors (the kit's figure, recolored) and the Arcade's warm spill from off frame.`,
    update() { stage.setCamera(cam); detail(ctx, M); detail(ctx, M2); },
    decorate() {
      const p = ctx.plates;
      litType(ctx);
      caption(ctx, { head: 'Every plan, ranked', flavor: 'standings', line: `${rows.length} sealed plans by expected value, modeled before the day runs. ${show.name} is ${ordinal(dwAt + 1)}.` });
      const scope = p.scope("Modeled under each plan's own scenarios; settled scores follow the operating day.");
      const texts = {
        p1: `P1 ${top[0]!.resource} · ${top[0]!.hub} · ${fmt.usd(top[0]!.selected_expected_usd)}`,
        dw: `P${dwAt + 1} ${dw.resource} · ${dw.hub} · ${fmt.usd(dw.selected_expected_usd)}`,
        crown: `Sealed by one agent (${fmt.short(wallet, 4, 4)}) · ${sd.leaf_count} plans`,
      };
      p.leaders([
        { id: 'crown', text: texts.crown, at: towerPt(0.12, -0.85), priority: 0 },
        { id: 'p1', text: texts.p1, at: towerPt(rowsTop + rowH * 0.5, -0.85), priority: 1 },
        { id: 'dw', text: texts.dw, at: towerPt(gapTop + 0.06 + rowH * 0.5, -0.85), priority: 2 },
      ], { keepOut: scope ? [scope] : [], max: 3 });
      livery(ctx, { [texts.crown]: 'sealed', [texts.dw]: 'live' });
    },
  };
}
