// @ts-nocheck
// The garage's storyboard frames. G01 the garage from above, every agent's screen showing its own output for Desert
// Willow's sealed plan; G02 the pit lane's end, the Planner's three plans standing over the back straight; G03 Team
// data under the glass floor. One world built for all three (world.ts); each frame poses its camera, fits its key light
// and lays out its screens and plates. G04 and G05 are the Living Brain workspace itself, captured from the app
// (capture-living-brain.mjs beside this file), not drawn here.
import type { FrameHandle, StationModule } from '../types';
import { buildWorld, pose, type GarageWorld } from './world';
import { BAYS, agentId, evaluatorId, usd, day, hm } from './panels';
import ids from './ids.json';
import { line, setLineResolution } from '../../kit/region/flows';
import { radialTex } from '../../kit/textures';
import { brainOf, SCENE } from '../brain/data';

/** The garage at night with its lights on: the hall's floor and plinths lit by the high bays, the backdrop dark. */
function lit(w: GarageWorld, { key = 1.25, fill = 1.15, env = 0.3 } = {}) {
  const { stage } = w;
  stage.setBackdrop({ top: '#101315', horizon: '#20262c', bottom: '#15191c', glow: '#2b3239', ground: '#15191c' });
  stage.setLight({ key: { color: '#f3f1ec', intensity: key }, rim: { color: '#a9bfe0', intensity: 0.5 }, fill: { sky: '#9db2d0', ground: '#3b3730', intensity: fill }, env, shadow: 0.34 });
  stage.ground.visible = false; stage.catcher.visible = false;
}

/** The caption with its race term as a small second line under the plain head (Jo, 26 Nov: plain meaning first). */
function caption(ctx, head: string, flavor: string, line: string) {
  const r = ctx.plates.caption({ head, line });
  const h = ctx.plates.root.querySelector('.hwalk-cap h3');
  if (h && flavor) {
    const s = document.createElement('span');
    s.textContent = flavor;
    Object.assign(s.style, { display: 'block', marginTop: '6px', font: '500 20px/1.2 var(--w-font-sans)', color: '#9aa3ab', letterSpacing: '0.01em' });
    h.appendChild(s);
  }
  const cap = ctx.plates.root.querySelector('.hwalk-cap');
  // in the story's films the film's line stands in for this caption (kept in the layout, hidden): keep off the line
  if (!cap || cap.style.visibility === 'hidden') return r;
  const a = cap.getBoundingClientRect(), b = ctx.plates.root.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-25 10:03:09 CT" as "Nov 25, 10:03:09 CT". */
const ctStamp = (ct: string) => { const [d, t] = ct.split(' '); const [, m, dd] = d.split('-'); return `${MONTHS[Number(m) - 1]} ${Number(dd)}, ${t} CT`; };

/** An ISO instant as market time, "Nov 25, 14:39:31 CT". */
const ctOf = (iso: string) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${p.month} ${p.day}, ${p.hour}:${p.minute}:${p.second} CT`; };

const roleIds = () => Object.entries(BAYS).map(([, b]) => `${b.role} ${agentId(b.id)}`).join(', ');

export const frames: StationModule['frames'] = {
  // G01 · The garage from above: six agents, each showing its own output for the sealed plan
  'garage.hangar': async (ctx): Promise<FrameHandle> => {
    const d = ctx.needData();
    const w = await buildWorld(ctx, { lightsFor: 'hangar' });
    lit(w);
    // the floor screens' glass reflects the room at 0.06, not the stage's 0.3: from above their DOM covers it, but the
    // story's dive carries this frame down to the pit wall, where the glass under the camera mirrored the hall white
    w.screens.lowGlass({ env: 0.06 });
    // the dive's first moment: the camera over the garage, its glass roof lifted for the shot
    w.hangar.roof.group.visible = false;
    // the pit seen from far above, through its glass: the three brains alone and brighter, the Terminal's layers and
    // parts left out (under the Grand Prix brain they read as its; G03 shows them, beside the Terminal's brain)
    for (const g of w.team.structure) g.visible = false;
    w.team.brains.setBright(3.8);
    const cam = pose([8, 398, 46], [8, 0, -142], 31, [0, -0.02]);
    w.stage.setKey({ az: 200, el: 58, center: [8, 0, -110], radius: 250, intensity: 1.25, rimAz: 20 });
    w.stage.setAO({ radius: 2.2, scale: 1.0, thickness: 3.0, samples: 16, distanceFallOff: 1 });
    w.stage.setShadowAuto(true);
    const ev = d.sponsors.agent_studio.evaluation, eng = d.sealed_day.engine;
    return {
      time: 4.2,
      note: `Real, every figure on the six floor screens is read from frame-data.json for Desert Willow's sealed plan (operating day ${d.sealed_day.operating_day}, plan C): Forecast draws showcase.scenarios.node_bands_cents (p05 to p95 and p25 to p75 of the ${d.showcase.scenarios.count} scenarios) under showcase.forecast.node_da_cents; State of charge draws showcase.arms.C.soc_pct from assumptions.soc_open_ppm inside soc_min and soc_max, colored by C.kw (discharging teal, charging blue); Market inputs draws the sealed leaf's 527 inputs.files (files.json for the tiles, inputs.json for the kinds, both derived from out/od-20261126/leaves/DSWL_ESS_ESR1.json, sha256 08997a73...); Hedge prints showcase.instrument (ElectronX's published terms) over C.contracts by hour, with C's sold and bought counts and collateral, the entry assumed at fair value; Risk draws game.results.C.total_uusd in $250 bins with the worst tenth's 31 members outlined, C's and A's worst-tenth averages (cvar), and Cournot's probability (sponsors.cournot.probability: 1%, observed 09:51:43 CT on Nov 25, after the seal at 09:15:17, so marked "read after the seal"); Plan shows the three arms' objective_usd with C selected and sealed. The badges are the roles' ERC-8004 identities on BSC testnet (ids.json: ${roleIds()}; from contracts/deployments/agents.bsc-testnet.json on core/agents d69fe6e, registered 14:18 to 14:20 CT on Nov 25, after the seal); the evaluator is agent ${evaluatorId()} (ids.json from the Agent Studio project's studio.toml [identity], registered ${ctOf(ids.evaluator.registered_at_utc)}). The sealed leaf's own agent field (erc8004_id) is null: the identities came after the plan. The evaluator's ten lamps are its report's checks (${ev.passed} pass, ${ev.skipped} skipped, ${ev.observed.ct}). Design: the floor as screens, their rims and the spill, the instruments' new places at each bay's north edge, the lights, and the roof lifted for this shot (the camera is diving through it). Camera from the storyboard's corner [-205, 15, 40] to above the garage at [8, 398, 46] looking at [8, 0, -142] on a 31 degree lens, so all six screens read in one frame; the workshop's bench is below the frame, so the evaluator is named in the scope line. The pit, seen from above through its glass, holds Living Brain's three brains of ours alone, brighter than G03 draws them (stations/brain/pit.ts); the Terminal's layers and parts are G03's.`,
      update(time) { w.pose(cam, time); },
      decorate() {
        const p = ctx.plates;
        const shown = w.screens.place(w.stage.camera, p.project, 'floor', { minArea: 6000, minSquash: 0.3 });
        const cap = caption(ctx, 'Six agents, one plan', 'the garage', 'Each agent shows its own part of Desert Willow\'s sealed plan for Nov 26. The planner itself is a mixed-integer program.');
        const scope = p.scope(`Desert Willow (DSWL_ESS_ESR1), operating day Nov 26. Engine ${eng.commit.slice(0, 7)}, ${eng.solver} ${eng.solver_package.split('@')[1]}. Checked by the Agent Studio evaluator, agent ${evaluatorId()}: ${ev.passed} of ${ev.checks.length} checks pass, ${ev.skipped} skipped. Identities: ERC-8004 on BSC testnet.`);
        const keep = [cap, scope, ...shown].filter(Boolean);
        p.leaders([
          { id: 'bench', text: `Evaluator · agent ${evaluatorId()}`, sub: `Agent Studio · ${ev.passed} checks pass · ${ctStamp(ev.observed.ct)}`, at: w.anchors.bench, priority: 0 },
        ], { keepOut: keep, max: 2 });
      },
    };
  },

  // G02 · The pit lane's end: the Planner's three plans over the back straight, C sealed
  'garage.pit-lane': async (ctx): Promise<FrameHandle> => {
    const d = ctx.needData();
    const w = await buildWorld(ctx, { lightsFor: 'pitlane' });
    // on the intro's exposure (Nov 26): the kit's dark-stage environment (0.17, where this frame had 0.3), the hall's
    // lamps at 0.44 of their build (0.55 before), and the floor screens' glass satin, reflecting the room at 0.06 (as a
    // mirror under the camera it threw the hall's light back as a white floor across the lower right). No floor in the
    // frame clips now; the lower right reads as dark glass at about 0.4 of white, against 0.85 before.
    lit(w, { key: 1.0, fill: 1.15, env: 0.17 });
    w.scaleLights(0.44);
    w.screens.lowGlass({ env: 0.06, satin: true });
    const cam = pose([112, 10.5, -228], [143, 7.2, -158], 40, [0, 0.06]);
    w.stage.scene.fog = new w.THREE.Fog(w.exact('#1b2025'), 260, 900);
    w.stage.setKey({ az: 320, el: 48, center: [140, 0, -170], radius: 120, intensity: 1.1, rimAz: 140 });
    w.stage.setAO({ radius: 1.2, scale: 1.0, thickness: 2.0, samples: 16 });
    w.stage.setShadowAuto(true);
    const S = d.showcase, A = S.arms.A, C = S.arms.C;
    return {
      time: 4.2,
      note: `Real, from frame-data.json: each board is one of the three plans the planner solved for Desert Willow's ${d.sealed_day.operating_day} (showcase.arms.{A,B,C}: expected_usd as the mean, minus cvar_usd as the worst tenth's average day, objective_usd as the score, the same objective the arcade cabinet ONE PLAN scores), with its ${S.scenarios.count} scenario totals (game.results.*.total_uusd) in $250 bins on one shared axis on the heat ramp, and scenarios_below_zero. C is the selected arm (selection_rule: the highest objective) and carries the seal's time (sealed_day.receipts[0], ${d.sealed_day.receipts[0].block_time.ct}). The planner's badge is ERC-8004 agent ${agentId('planner')} on BSC testnet (ids.json, from agents.bsc-testnet.json on core/agents d69fe6e; registered after the seal). Design: the boards' size, stands and turn toward the lane, the lights. Camera at the pit lane's end, [44, 9.5, -181] looking at [150, 7.4, -153] on a 33 degree lens, from the storyboard's [-207, 9, -175], where the boards stood 340 m off.`,
      update(time) { w.pose(cam, time); },
      decorate() {
        const p = ctx.plates;
        const shown = w.screens.place(w.stage.camera, p.project, 'boards', { minArea: 4000, minSquash: 0.25 });
        const cap = caption(ctx, 'Three plans, one sealed', 'the pit wall', `No hedge (A), a hedge on a fixed schedule (B), schedule and hedge together (C). C gives up ${usd((A.expected_uusd - C.expected_uusd) / 1e6)} of mean and lifts the worst tenth from a ${usd(A.cvar_usd)} loss to a ${usd(-C.cvar_usd)} gain.`);
        const keep = [cap, ...shown].filter(Boolean);
        const key = p.key({ rows: [{ items: [{ kind: 'line', color: '#e6e8ea', text: 'Score = mean − 0.5 × the worst tenth\'s average loss' }] }] }, 96, 64);
        if (key) keep.push(key);
        p.leaders([
          { id: 'planner', text: `Planner · agent ${agentId('planner')}`, sub: 'ERC-8004 on BSC testnet · scores each plan, seals the best', at: w.anchors.boards.B.top, priority: 0 },
        ], { keepOut: keep, max: 2 });
      },
    };
  },

  // G03 · Team data: the brain under the glass floor
  'garage.team-data': async (ctx): Promise<FrameHandle> => {
    const d = ctx.needData();
    const w = await buildWorld(ctx, { lightsFor: 'team' });
    lit(w, { key: 1.2, fill: 1.3, env: 0.36 });
    w.scaleLights(1.4);
    // the focal page, Wattness Terminal (the most sources): two rings round its star, a wider glow, a lamp over it
    const T = w.THREE, f = w.anchors.brainTop;
    const focal = new T.Group(); focal.name = 'focalPage';
    for (const [r, wd, op] of [[3.4, 2.4, 0.95], [5.2, 1.4, 0.55]]) {
      const pts = []; for (let i = 0; i <= 72; i++) { const a = (i / 72) * Math.PI * 2; pts.push([f[0] + Math.cos(a) * r, f[1] + 0.03, f[2] + Math.sin(a) * r]); }
      focal.add(line(pts, { color: '#8ff2da', width: wd, opacity: op }));
    }
    const glow = new T.Mesh(new T.PlaneGeometry(9, 9), new T.MeshBasicMaterial({ color: w.exact('#2ec7a6'), alphaMap: radialTex(T), transparent: true, opacity: 0.6, depthWrite: false, blending: T.AdditiveBlending }));
    glow.position.set(f[0], f[1], f[2]); glow.userData.billboard = true; glow.renderOrder = 2; focal.add(glow);
    const lamp = new T.PointLight('#bff6e8', 220, 40, 1.3); lamp.position.set(f[0], f[1] + 1.0, f[2]); lamp.layers.enableAll(); focal.add(lamp);
    focal.traverse((o) => { o.userData.noAO = true; if (!o.isLight) o.layers.set(0); });
    w.root.add(focal);
    setLineResolution(focal, ctx.width, ctx.height, ctx.dpr);
    const cam = pose([f[0] - 40, 15, f[2] + 46], [f[0] + 14, f[1], f[2] - 8], 40, [0.02, 0.05]);
    w.stage.setKey({ az: 150, el: 52, center: [f[0] + 20, -3, f[2]], radius: 90, intensity: 1.2, rimAz: 330 });
    w.stage.setAO({ radius: 0.8, scale: 1.0, thickness: 1.6, samples: 16 });
    w.stage.setShadowAuto(true);
    const bg = d.brain_graph, lb = d.sponsors.living_brain;
    const top = bg.pages.find((p: any) => p.slug === 'wattness-terminal');
    return {
      time: 4.2,
      note: `Living Brain's three brains of ours in the pit, as the brain station draws them (stations/brain/pit.ts, from brain-scene.json, read from Living Brain's API): the Terminal's brain (${brainOf('terminal').pages} pages, ${brainOf('terminal').connections} connections; frame-data.json brain_graph has ${bg.stats.pages} and ${bg.stats.connections}), the Grand Prix build's (${brainOf('grand-prix').pages} pages, ${brainOf('grand-prix').connections} connections) and Desert Willow's review (${brainOf('battery-review').pages} page, version ${lb.page.version}, its thread to the Planner's C board), each tinted toward its member color, with the ${SCENE.combined.across} connections across them as arcs. Under them terminal_structure: ${d.terminal_structure.counts.layers} layers, ${d.terminal_structure.counts.nodes} parts, ${d.terminal_structure.counts.edges} typed connections. At the plan's cutoff (${lb.plan_time_cutoff_check.cutoff.ct}) the memory check admitted ${lb.plan_time_cutoff_check.pages_admitted} pages; the review came at ${lb.observed.ct}, after the gate. Design: the brains' shape, particles and placement in the pit, the pit itself; the focal page's rings, glow and lamp (it is the Terminal page with the most sources). Camera lowered from the storyboard's [-60, 24, -8] (above the 18 m roof) to 17 m, south-west of the focal page and looking just past it.`,
      update(time) { w.pose(cam, time); },
      decorate() {
        const p = ctx.plates;
        w.screens.place(w.stage.camera, p.project, 'none');
        const cap = caption(ctx, 'Memory', 'team data', `Living Brain holds three of our brains: the Grand Prix build, ${brainOf('grand-prix').pages} pages; the Wattness Terminal, ${brainOf('terminal').pages}; Desert Willow's review, ${brainOf('battery-review').pages}.`);
        const scope = p.scope(`Its review classed the hedge's entry as an assumed-entry scenario at ${lb.observed.ct.slice(11, 16)} CT, after the gate; the Nov 26 plan read no memory.`);
        const key = p.key({ rows: [{ items: [{ kind: 'box', color: '#59e3b2', text: 'Clouds: our three brains' }, { kind: 'line', color: '#ff6fae', text: 'arcs: connections across them' }, { kind: 'outline', color: '#6b7884', text: 'plates below: the Terminal\'s six layers' }] }] }, ctx.width - 640, 60);
        const keep = [cap, scope, key].filter(Boolean);
        const lt = w.layerTicks('east'), n = lt.length;
        p.ticks('layers', [{ ...lt[n - 1], text: `${n} · ${lt[n - 1].text}` }, { ...lt[0], text: `1 · ${lt[0].text}` }], 'hwalk-tick');
        p.leaders([
          { id: 'top', text: `Wattness Terminal · the page with the most sources`, sub: `${top.sources} sources · version ${top.version} · ${bg.connections.filter((c: any) => c.a === top.slug || c.b === top.slug).length} connections`, at: w.anchors.brainTop, priority: 0 },
          { id: 'dw', text: `Desert Willow's brain · 1 page, version ${lb.page.version} · ${lb.after.citations} citation`, at: w.anchors.dw, priority: 1 },
        ], { keepOut: keep, max: 4 });
      },
    };
  },
};
