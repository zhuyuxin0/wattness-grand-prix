// @ts-nocheck
// The stack finale (storyboard v2, STACK.md): the whole Grand Prix as one lit space, at chapter 05's bar. The stills:
// stack.rest (S01, the whole space at rest), stack.seal and stack.seal-late (S02, the seal path; the late seal
// refused), stack.inspect (S03, GateRecord hovered), stack.close (S04, the plan view and the end card), and one hover
// still per kind of piece (stack.hover.<piece>), each the live mount's hover state (mount.ts) at its end. The site
// mounts the same space live with mountStack (mount.ts, re-exported here).
import { THREE, GrabBlurPass, markTexture, setLineResolution, fitCamera, sr, setDraw } from './kit';
import { buildSpace, POS, PAL, ZONES } from './space';
import { injectCss, keyCard, zoneTitles, pointer, labelLayer } from './dom';
import { MARK_URLS } from './marks';
import { cards, n0, short, ct, dayLabel, pathLen, WORDS, PIECE_IDS } from './pieces';
import { ISO, stageLook, fitRest, labelItems, zoneItems, afterItems, keyRows, screenBox } from './common';
import { hoverController } from './hover';
import { GLYPH_COLOR } from './glyphs';
import GF from './greenfield-record.json';
import TN from './integrations.json';
import { assignLayers } from '../../lib/stage';
import type { FrameContext, FrameHandle, StationModule } from '../types';

export { mountStack } from './mount';
export { ROUTES, TAB_LABEL } from './pieces';

type Kind = 'rest' | 'seal' | 'seal-late' | 'inspect' | 'close' | 'cube-check' | 'hover';

/** The kinds of piece a hover still is made for (the six agents are one kind: the Forecaster stands for them). */
export const HOVER_STILLS = ['ercot', 'terminal', 'cournot', 'electronx', 'studio', 'aws', 'forecaster', 'brain', 'greenfield', 'verifier', 'cloudflare', 'atlas', 'cmc', 'arena', 'flap', 'openfour'];

async function setup(ctx: FrameContext, kind: Kind, hoverId: string | null = null): Promise<FrameHandle> {
  const { stage, theme, width: W, height: H, dpr } = ctx;
  const d = ctx.needData();
  injectCss();
  const host = ctx.plates.root;
  host.dataset.stkTheme = theme;
  const P = PAL[theme];
  const sealLoop = kind === 'seal' || kind === 'seal-late';
  stageLook(stage, theme, { seal: sealLoop });

  // ── the camera first: the strands' lengths are set in px and converted at the frame's meters a px ──────────
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  let fit;
  if (sealLoop) {
    const pts = [V(95, 4, -116), V(95, 26, -162), V(199, 26, -162), V(318, 15, -201), V(370, 56, -238), V(333, 1, -201), V(407, 1, -201), V(453, 8, -201),
      V(328, 2, -60), V(412, 28, -112), V(348, 8, 9), V(394, 54, 9), V(370, 0, 30)];
    fit = fitCamera(stage, W, H, pts, { az: 180, el: ISO, vfov: 5, rect: { x0: 0.10, x1: 0.76, y0: 0.12, y1: 0.70 } });
  } else if (kind === 'close') {
    const pts = [V(-480, 0, -272), V(480, 0, -272), V(480, 0, 276), V(-480, 0, 276)];
    fit = fitCamera(stage, W, H, pts, { az: 180, el: 89.5, vfov: 5, rect: { x0: 0.08, x1: 0.92, y0: 0.07, y1: 0.70 } });
  } else {
    fit = fitRest(stage, W, H);
  }
  let pose = fit.pose;
  const mpp = fit.mpp;
  stage.camera.updateMatrixWorld();
  if (kind === 'cube-check') {
    // the same camera (position and orientation), its lens narrowed and shifted onto the cube: a crop of S01's picture
    const c = V(POS.cube.x, POS.cube.base + POS.cube.edge / 2, POS.cube.z).project(stage.camera), s0 = pose.shift ?? [0, 0];
    const fov2 = 0.9, k = Math.tan((5 * Math.PI) / 360) / Math.tan((fov2 * Math.PI) / 360);
    pose = { ...pose, vfov: fov2, shift: [(-k * (c.x - 2 * s0[0])) / 2, (-k * (c.y - 2 * s0[1])) / 2 + 0.11] };
    stage.setCamera(pose); stage.camera.updateMatrixWorld();
    (pose as any).zoom = k;
  }

  // ── one grab for all the glass ────────────────────────────────────────────────────────────────────────────
  const grab = new GrabBlurPass(W * dpr, H * dpr, { passes: 2, radius: 1.0 });
  stage.insertBeforeOverlay(grab);
  const mark = await markTexture();
  const blankC = document.createElement('canvas'); blankC.width = blankC.height = 4;
  const blank = { texture: new THREE.CanvasTexture(blankC), aspect: 1 };
  const space = await buildSpace(ctx, { theme, mpp, camera: stage.camera, blur: grab.texture, res: new THREE.Vector2(W * dpr, H * dpr), mark, blank, footprints: kind === 'close' });
  if (kind === 'cube-check') {
    // the cube alone: hide every other object, strand and glow
    space.root.traverse((o: any) => { if (o.isMesh || o.isSprite || o.isLine || o.isLineSegments) o.visible = false; });
    space.cube.visible = true;
  }
  assignLayers(space.root);
  stage.scene.add(space.root);
  setLineResolution(space.root, W, H, dpr);

  // the cube's mark along this view (S01 to S03), or along the iso view seen from above (S04)
  const camR = new THREE.Vector3().setFromMatrixColumn(stage.camera.matrixWorld, 0);
  const camU = new THREE.Vector3().setFromMatrixColumn(stage.camera.matrixWorld, 1);
  const camD = new THREE.Vector3().setFromMatrixColumn(stage.camera.matrixWorld, 2).negate();
  if (kind === 'close') {
    // from above the shades fall beside their pads as dark smudges: the plan view is the diagram, without them
    space.shades.visible = false;
    space.marks.traverse((m: any) => { if (m.userData?.iso) m.scale.z = 1; });
    const e = ISO * Math.PI / 180;
    space.aimCube(V(1, 0, 0), V(0, Math.cos(e), -Math.sin(e)), V(0, -Math.sin(e), -Math.cos(e)), false);
  } else space.aimCube(camR, camU, camD, true);
  stage.setShadowAuto(true);

  // ── S02: the seal path lit, the rest at 0.3, the money and arena rows out of the crop ──────────────────────────
  const SEAL_PIECES = new Set(['planner', 'gate', 'greenfield', 'verifier']);
  const SEAL_EDGES = new Set(['E7p', 'E7f', 'E7r', 'E8', 'E9', 'E10', 'E11']);
  if (sealLoop) {
    const dimMat = (mm: any, k: number) => {
      if (!mm) return;
      if (mm.cube) { if (theme === 'light') { if (k < 1) { mm.cube.transparent = true; mm.cube.uniforms.uOpacity.value = 0.3 + 0.7 * k; } } else mm.cube.uniforms.uDim.value = 0.35 + 0.65 * k; return; }
      const u = mm.uniforms;
      if (u?.uDim) { if (theme === 'light') { if (k < 1) { mm.transparent = true; mm.depthWrite = false; u.uOpacity.value *= 0.22 + 0.78 * k; } } else u.uDim.value = 0.25 + 0.75 * k; return; }
      if (u?.uOpacity) { u.uOpacity.value *= k; return; }
      mm.transparent = true; mm.opacity *= k;
    };
    // hidden, not dimmed: in this crop they only peek round the caption's edges, with the strands that lead to them;
    // the hosted agents and their strand (E18) and the edge Worker and its (E19) stay out too, so the seal's path reads
    // alone
    const FAR = new Set(['atlas', 'cmc', 'rail', 'arena', 'flap', 'openfour', 'aws', 'cloudflare']), FAR_E = /^E1[2-9]/;
    for (const [id, p] of Object.entries<any>(space.pieces)) for (const mm of p.mats) { if (FAR.has(id)) (mm.cube ?? mm).visible = false; else dimMat(mm, SEAL_PIECES.has(id) ? 1 : 0.3); }
    // their pads' shades go with them: CoinMarketCap's two posts' shades had stayed on the ground below the verifier as
    // two small dark crosses (each 6 m post's shade is narrower than its feather)
    for (const id of FAR) for (const m of space.pieceShades[id] ?? []) m.visible = false;
    for (const [id, e] of Object.entries<any>(space.edges)) e.set(SEAL_EDGES.has(id) ? 1 : FAR_E.test(id) ? 0 : 0.3);
  }

  // ── S03 and the hover stills: the live mount's hover state at its end ───────────────────────────────────────
  const target = kind === 'inspect' ? 'gate' : kind === 'hover' ? hoverId : null;
  const pieceCards = cards(d, GF, TN, MARK_URLS);
  let hover = null;
  if (target) {
    hover = hoverController(space, { theme, host, cards: pieceCards, project: (p) => ctx.plates.project(p), size: { W, H }, onRoute: () => {}, glyphColor: GLYPH_COLOR[theme] });
    hover.set(target, { still: true });
  }

  const time = kind === 'seal' ? 3.7 : kind === 'seal-late' ? 4.5 : kind === 'close' ? 9.0 : kind === 'inspect' || kind === 'hover' ? 7.2 : 6.0;
  const lateLen = space.lateLine.len;
  const late = d.sealed_day.late_seal.attempts.find((a: any) => a.chain_id === 56) ?? d.sealed_day.late_seal.attempts[0];
  const rcpt = d.sealed_day.receipts[0];

  const handle: FrameHandle = {
    time,
    steps: 30,
    note: '',
    update(t) {
      stage.setCamera(pose);
      space.pose(t, stage.camera.position);
      if (sealLoop) {
        const u = t % 6;
        space.cubeMat.uniforms.uLit.value = sr(u, 1.2, 1.45);
        space.setTiles(1, sr(u, 2.45, 2.6));
        const rimK = sr(u, 3.3, 3.6);
        setDraw(space.rim, rimK * 2 * Math.PI * (POS.lens.r - 2.6) * 1.02, 1.5);
        space.rim.material.opacity = rimK > 0 ? 1 : 0;
        // the late seal: one red comet runs the root's last 180 m and stops dead at the cube's reach; a red ring flashes
        const run = sr(u, 4.2, 4.36), live = u >= 4.2 && u < 5.4;
        space.lateLine.bead.material.uniforms.uT.value = lateLen - 180 + 180 * run;
        space.lateLine.set(live ? 1 - sr(u, 5.0, 5.4) : 0);
        const rk = Math.min(1, Math.max(0, (u - 4.36) / 0.6)), eo = 1 - (1 - rk) ** 3;
        space.lateRing.scale.setScalar(Math.max(0.01, 30 * eo));
        space.lateRing.material.opacity = u >= 4.36 && rk < 1 ? 1 - rk * rk : 0;
      }
    },
    async decorate() {
      const pl = ctx.plates;
      const proj = (p: number[]) => pl.project(p as any);
      // the labels: each piece's plain meaning, its name under it (none in S02's crop or the plan view)
      if (kind === 'rest' || kind === 'inspect' || kind === 'hover') {
        const skip = new Set<string>();
        if (target && pieceCards[target]?.chip) skip.add(target);   // the chip names it
        labelLayer(host).set(labelItems(space, d, proj, skip), W);
        zoneTitles(host, zoneItems(proj), theme);
        pl.ticks('after', afterItems(space), 'stk-after');
      }
      if (kind === 'rest') {
        pl.caption({ head: 'This is the whole stack.', line: 'Real batteries on the left, the agents in the middle, the seal on BNB Chain to the right, the markets in front. Every solid line carries something real.' });
        pl.scope(`Operating day ${dayLabel(d.sealed_day.operating_day)} · ${n0(d.fleet.count)} batteries · Data: ERCOT. Calculation and display: Wattness.`);
        const k = keyCard(host, { title: 'The stack', rows: keyRows(P) }, theme);
        k.style.left = `${W - 96 - k.offsetWidth}px`; k.style.top = `${H - 76 - k.offsetHeight}px`;
      }

      if (sealLoop) {
        const arms = Object.keys(d.showcase.arms).length;
        const items: any[] = [
          { id: 'planner', text: `Plan stamped ${ct(d.sealed_day.plan_time.ct)}`, sub: `${n0(d.sealed_day.leaf_count)} batteries, ${WORDS[arms] ?? arms} arms each`, at: [147, 26.2, -150], priority: 1 },
          { id: 'gate', text: `Sealed ${ct(rcpt.block_time.ct)} · block ${n0(rcpt.block)}`, sub: `${n0(rcpt.seconds_before_gate)} s before ERCOT's market closed at ${ct(d.sealed_day.gate.ct).slice(0, 5)} CT`, at: [370, 55, -201], priority: 0 },
          { id: 'greenfield', text: `${n0(GF.objects)} files in a public bucket`, sub: GF.bucket.name, at: [412, 27, -70], priority: 2 },
          { id: 'verifier', text: 'Root recomputed: match', sub: `leaf ${d.showcase.leaf_position + 1} of ${d.sealed_day.leaf_count}, ${WORDS[pathLen(d.showcase.leaf_position, d.sealed_day.leaf_count)]} hashes to the root`, at: [394, 32, 9], priority: 3 },
        ];
        if (kind === 'seal-late') items.push({ id: 'late', text: `${ct(late.chain_time.ct)} · refused: ${late.refused_with}`, at: [POS.cube.x - space.reach - 2, 15, POS.cube.z], priority: 0.5 });
        // plates keep off the cube, the trays and the lens where they can
        const box = (a: number[], b: number[]) => { const p = proj(a)!, q = proj(b)!; return { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) }; };
        const avoid = [box([POS.cube.x - 38, 56, POS.cube.z - 37], [POS.cube.x + 38, 0, POS.cube.z + 37]), box([POS.trays.x - 44, 28, POS.trays.z - 27], [POS.trays.x + 44, 0, POS.trays.z + 27]),
          box([POS.lens.x - 25, POS.lens.y + 25, POS.lens.z], [POS.lens.x + 25, POS.lens.y - 25, POS.lens.z])];
        pl.leaders(items, { max: 6, avoid });
        host.querySelectorAll('.intro-plate').forEach((el: any) => {
          const t = el.textContent ?? '';
          if (t.startsWith('Sealed ') || t.includes('public bucket')) el.classList.add('stk-sealed');
          if (t.includes('refused')) el.classList.add('stk-refused');
        });
        pl.caption({ head: 'Sealed before the market closes.', line: `One root for ${n0(d.sealed_day.leaf_count)} plans went onto BNB Chain at ${ct(rcpt.block_time.ct)}, ${n0(rcpt.seconds_before_gate)} seconds before ERCOT's day-ahead market closed. The day's files sit in a public Greenfield bucket, so anyone can recompute the root. The contract computes the close itself; a seal at or after it reverts.` });
        pl.scope(`GateRecord ${short(rcpt.contract)} · source verified · ${rcpt.chain_name}`);
      }

      if (target) {
        // the pointer, drawn for the still, on the piece; the card and chip already sit beside it (hover.ts)
        hover.relayout();
        const ch = host.querySelector(`.stk-chip.is-in img`) as HTMLImageElement | null;
        if (ch) await ch.decode().catch(() => {});
        hover.relayout();
        const c = space.pieces[target].center;
        const bx = screenBox(space, target, proj)!;
        const at = c ? proj(c.toArray())! : { x: (bx.x0 + bx.x1) / 2, y: (bx.y0 + bx.y1) / 2 };
        if (target === 'gate') { const q = proj([POS.cube.x + 8, POS.cube.base + POS.cube.edge * 0.55, POS.cube.z + 20])!; pointer(host, q.x, q.y); }
        else pointer(host, at.x + 6, at.y + 4);
      }

      if (kind === 'cube-check') {
        // BNB Chain's symbol (marks/bnbchain.svg, its path as published) as a red hairline over the rendered cube, its
        // hexagon's box (viewBox x 7 to 89.29, y 0 to 96) on the cube's iso hexagon as the shader maps it
        const u = space.cubeMat.uniforms, C0 = u.uC.value, R0 = u.uR.value, U0 = u.uU.value, hx = u.uHalf.value.x, hy = u.uHalf.value.y;
        const at = (a: number, b: number) => proj(C0.clone().addScaledVector(R0, a * hx).addScaledVector(U0, b * hy).toArray())!;
        const l = at(-1, 0), r = at(1, 0), t = at(0, 1), b = at(0, -1);
        const NSs = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NSs, 'svg');
        svg.setAttribute('viewBox', '7 0 82.2857 96'); svg.setAttribute('preserveAspectRatio', 'none');
        Object.assign(svg.style, { position: 'absolute', left: `${l.x}px`, top: `${t.y}px`, width: `${r.x - l.x}px`, height: `${b.y - t.y}px`, overflow: 'visible', zIndex: '45' });
        const raw = await (await fetch(new URL('./marks/bnbchain.svg', import.meta.url).href)).text();
        const path = document.createElementNS(NSs, 'path');
        path.setAttribute('d', raw.match(/ d="([^"]+)"/)![1]); path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#ff2d55');
        path.setAttribute('stroke-width', '1.6'); path.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.appendChild(path); host.appendChild(svg);
        const px = (r.x - l.x) / (pose as any).zoom;
        pl.caption({ head: 'GateRecord: the cube against the mark', line: `S01's camera, cropped ${((pose as any).zoom).toFixed(1)} times round the cube. Red: BNB Chain's symbol as published, on the cube's iso hexagon (${px.toFixed(0)} px wide in S01).` });
      }

      if (kind === 'close') {
        // the field as planned: every ERCOT battery whose public data was complete that day (the sealed record lists the
        // rest, with the census field each lacks)
        const odLabel = dayLabel(d.sealed_day.operating_day).replace(/, \d+$/, '');
        pl.caption({ head: 'Wattness Grand Prix', line: `Every ERCOT battery with complete public data (${n0(d.fleet.count)} on ${odLabel}), planned for tomorrow and sealed on BNB Chain before the market closes. Anyone can check any plan.` });
        const cap = host.querySelector('.hwalk-cap');
        if (cap) { const u = document.createElement('p'); u.className = 'stk-end-url'; u.textContent = 'gp.wattness.tech · wattness.tech'; cap.appendChild(u); }
        pl.scope('Data: ERCOT. Calculation and display: Wattness.');
        // the lockup over the diagram's south row: the Wattness mark and word, a rule, BNB Chain's logo
        const lk = document.createElement('div'); lk.className = 'stk-lockup';
        const word = document.createElement('div'); word.className = 'stk-word';
        // the Wattness mark (its geometry as marks/wattness.svg draws it), in the theme's ink
        const wm = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); wm.setAttribute('viewBox', '-1.4 -1.4 67 61.6'); wm.setAttribute('height', '30'); wm.setAttribute('width', '33');
        wm.innerHTML = '<path d="M0 28.2 H13.95 L20.45 53.65 L32.5 5.2 L44.45 53.65 L50.7 28.2 H59.35" stroke="currentColor" stroke-width="4" fill="none" stroke-miterlimit="12"/><circle cx="61.5" cy="28.2" r="2.85" fill="currentColor"/>';
        word.append(wm, document.createTextNode('Wattness'));
        const rule = document.createElement('div'); rule.className = 'rule';
        const bnb = document.createElement('img'); bnb.src = theme === 'light' ? MARK_URLS.bnbLogoYellow : MARK_URLS.bnbLogoWhite; bnb.style.height = '34px'; bnb.alt = '';
        const lineEl = document.createElement('div'); lineEl.className = 'line'; lineEl.textContent = 'Sealed on BNB Chain';
        lk.append(word, rule, bnb, lineEl); host.appendChild(lk);
        lk.dataset.theme = theme;
        await bnb.decode().catch(() => {});
        const capR = (cap as HTMLElement | null)?.getBoundingClientRect(), hostR = host.getBoundingClientRect();
        const right = W - 96, left = capR ? capR.right - hostR.left + 40 : W * 0.66;
        lk.style.transform = `translate3d(${Math.max(left, right - lk.offsetWidth).toFixed(1)}px, ${(capR ? capR.top - hostR.top + 34 : H - 230).toFixed(1)}px, 0)`;
        zoneTitles(host, ZONES.map((zn) => { const p = proj(zn.at); return p ? { text: zn.text, x: p.x, y: p.y - 10 } : null; }).filter(Boolean), theme);
      }
    },
  };

  const st = space.states;
  const live = ['Flap\'s season token and vault', 'OpenFour\'s graduation', 'the evaluator on Amazon Bedrock AgentCore and its hosted job 1873', 'the agents\' identities and their paid job'];
  const rest = 'Real: every live strand\'s payload and each object\'s figures, from frame-data.json, the Greenfield record (scripts/greenfield/published.json, summarized beside this station) and integrations.json beside it (the sponsor flows on BSC testnet: addresses and transactions, each read back on a public RPC). The plinth\'s columns are the ' +
    `${space.fleetMapped} mapped batteries of ${d.fleet.count} (the rest have no point and are not drawn), height 0.14 m a MW. Lit since they ran on BSC testnet on Nov 25: ${live.join(', ')}. Lit since Nov 26: the Forecaster on the same AgentCore trial and its job 1897, and the edge Worker on Cloudflare (its / and one /verify read on Nov 26). After the seal: Cournot's odds, Living Brain's memory (read after ${ct(d.sealed_day.plan_time.ct)}) and the paid job, drawn lit with a tick. ` +
    `Designed, drawn as ghosts with dotted lines: CMC's screening of launches${st.outcomes === 'designed' ? ', the outcome lamps' : ''}. Comet speeds and spacing are drawn, not measured.`;
  (handle as any).note = kind === 'rest' ? `S01, the whole stack at rest. ${rest}`
    : kind === 'seal' ? `S02 at t 3.7 s of its 6 s loop: the root's path lit, the rest dimmed to 0.3. Real: plan time, root, the mainnet receipt (block, time, seconds before the close), the ${GF.objects} objects downloaded back and matched (all_verified ${GF.all_verified}), leaf ${d.showcase.leaf_position + 1}'s check. The Greenfield bucket is on Greenfield testnet; the seal is on BSC mainnet. Comet timing is drawn.`
    : kind === 'seal-late' ? `S02 at t 4.5 s: the late seal. The red comet draws the simulated commit refused with ${late.refused_with} at chain time ${late.seconds_after_gate} s after the close (BSC mainnet; testnet ${d.sealed_day.late_seal.attempts[1]?.seconds_after_gate} s): a simulation, not a mined failed transaction. The cube does not change.`
    : kind === 'cube-check' ? 'Check, not a storyboard frame: the cube alone at S01\'s camera (a crop of the same projection), BNB Chain\'s symbol drawn over it in red as published (marks/bnbchain.svg). The cube shows the mark wherever the two agree.'
    : kind === 'inspect' ? 'S03, GateRecord hovered: the live mount\'s hover state at its end (its halo, its own strands at full, the other strands at 0.25 and objects at 0.55; the chip and card beside it). Every line of the card is on file in frame-data.json sealed_day; the refusal is the simulated call. The pointer is drawn for the still.'
    : kind === 'hover' ? `Hover still: ${hoverId}, the live mount's hover state at its end (halo, own strands at full, the rest dimmed; its card with the real integration and the button to the site's ${pieceCards[hoverId!]?.routeLabel} tab). Figures from frame-data.json, the Greenfield record and integrations.json. The pointer is drawn for the still.`
    : `S04, the plan view and the end card: the space seen from above, as section 01's diagram; the cube's mark is carved along the iso view, so from above it reads as a cube. ${rest}`;
  return handle;
}

export const frames: StationModule['frames'] = {
  'stack.rest': (ctx) => setup(ctx, 'rest'),
  'stack.seal': (ctx) => setup(ctx, 'seal'),
  'stack.seal-late': (ctx) => setup(ctx, 'seal-late'),
  'stack.inspect': (ctx) => setup(ctx, 'inspect'),
  'stack.close': (ctx) => setup(ctx, 'close'),
  'stack.cube-check': (ctx) => setup(ctx, 'cube-check'),
  ...Object.fromEntries(HOVER_STILLS.map((id) => [`stack.hover.${id}`, (ctx) => setup(ctx, 'hover', id)])),
};

/** Every piece the live mount can hover (for checks). */
export const PIECES = PIECE_IDS;
