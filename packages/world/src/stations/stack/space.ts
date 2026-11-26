// @ts-nocheck
// The stack finale's space (STACK.md sections 2 to 4): every piece the plan passes through as one object shaped like
// its job, wearing its owner's symbol, in the storyboard's coordinates (meters, x east, y up, z south; section 01's
// diagram, so the venue's boxes and these objects register), joined by chapter 05's strands. Each piece and edge is
// drawn in the state its evidence gives (live, read after the seal, designed); the figures come from frame-data.json
// and the Greenfield record beside this file.
import {
  THREE, line, lines, comets, setDraw, setSpan, tickPulses, fillet, lin, Builder, flatMaterial, roundRect, offsetPoly, glassPlane, glow, pool, ring,
  strand, flatMesh, basic, overlay, shellMaterial, shadeMesh, v3, arr, sr, UP, RIGHT,
} from './kit';
import outline from './ercot-outline.json';
import GF from './greenfield-record.json';
import TN from './integrations.json';
import { bnbMarkTexture, pathTexture, brainTexture, smileTexture, flapTexture, cournotDots, atlasTexture, cmcTexture, fourTexture } from './marks';
import { insetBrain } from '../brain/inset';
import { glyphTexture, GLYPH_COLOR } from './glyphs';
import { hosting } from './pieces';
import bnbRaw from './marks/bnbchain.svg?raw';
import gfRaw from './marks/greenfield.svg?raw';
import { rng, seedOf } from '../../lib/random';

const D2R = Math.PI / 180;
/** Column height, meters a MW (240 MW stands 34 m: the plinth's outline still reads under the fleet). */
export const COL_M = 0.14;
const COS31 = Math.cos(31 * D2R);

/** Colors by role (STACK.md section 4; the storyboard's palette), per theme. */
export const PAL = {
  dark: {
    ground: '#14171a', pad: '#171b1f', padEdge: '#2b3036', top: '#232a31', side: '#181d22', edge: '#3d4855', edgeHi: '#5b6875', steel: '#7f8c99', steelEdge: '#a3afbb',
    column: '#5f6c79', columnTop: '#b9c4cf', dswl: '#eef2f6', ink: '#969ca3', deckTop: '#1f252b', dash: '#969ca3', outline: '#8fa3b8',
    price: '#b481f0', files: '#c6cfd9', memory: '#6f8fe0', teal: '#2ec7a6', orange: '#eb6834', bnb: '#F0B90B', refused: '#e5534b',
    gold: { top: '#F0B90B', left: '#c4960a', right: '#9c7808', topLit: '#ffd24a', leftLit: '#f0b90b', rightLit: '#cf9d09' },
    tile: '#4f5a66', tileLit: '#97a3b0', ghostA: 0.3, brain: '#FF4D20', violet: '#9b87f5', white: '#f4f6f8',
    podTop: '#262e36', podSide: '#1b2126', podEdge: '#56626e', spineTop: '#1f2a3a', spineSide: '#18202c', node: '#c9d5ff', trayTop: '#2a333c', traySide: '#20272e',
    trayEdge: '#5d6a77', railTop: '#1f262d', dais: '#2a3139', vault: '#262c33', vaultTop: '#2d343c', bnbLine: '#F0B90B', sat: '#d9d0ff',
    // Living Brain's shell: the glass's own fill, a blue tint toward its rim, a memory-blue outline
    sphereFill: '#1f2429', sphereFillA: 0.34, sphereHair: '#a9b3bd', sphereTintA: 0.26, sphereLine: '#6f8fe0', sphereLineA: 0.75,
    halo: '#2ec7a6', shadeA: 0.42, lime: '#D0FF00',
  },
  light: {
    ground: '#e9ecef', pad: '#e1e5e9', padEdge: '#c9cfd6', top: '#f4f5f7', side: '#cfd4da', edge: '#9aa3ad', edgeHi: '#6b7380', steel: '#8b939c', steelEdge: '#5b6470',
    column: '#7d8794', columnTop: '#9aa3ad', dswl: '#1a1f24', ink: '#636a75', deckTop: '#eef0f2', dash: '#636a75', outline: '#6b7380',
    price: '#6345b1', files: '#8b939c', memory: '#4f6fc4', teal: '#1fae8f', orange: '#e35f2a', bnb: '#F0B90B', refused: '#9f1d35',
    gold: { top: '#F0B90B', left: '#d4a30a', right: '#b48a08', topLit: '#ffcf33', leftLit: '#f0b90b', rightLit: '#d9a50a' },
    tile: '#c9cfd6', tileLit: '#7d8794', ghostA: 0.35, brain: '#FF4D20', violet: '#6345b1', white: '#ffffff',
    podTop: '#ffffff', podSide: '#dfe3e8', podEdge: '#8b939c', spineTop: '#dfe6f5', spineSide: '#c5cfe3', node: '#4f6fc4', trayTop: '#f7f8fa', traySide: '#d9dee4',
    trayEdge: '#8b939c', railTop: '#eef0f2', dais: '#e1e5e9', vault: '#e9ecef', vaultTop: '#f4f5f7', bnbLine: '#b08405', sat: '#6345b1',
    // on the light ground a clear shell vanishes: a pale blue body, a stronger tint, the memory blue as its hairline
    sphereFill: '#dfe6f5', sphereFillA: 0.5, sphereHair: '#4f6fc4', sphereTintA: 0.42, sphereLine: '#4f6fc4', sphereLineA: 0.9,
    halo: '#1fae8f', shadeA: 0.18, lime: '#8fb300',
  },
};

/** Anchors (STACK.md section 3), meters. */
export const POS = {
  plinth: { x: -365, z: -197, h: 4 },
  glass: { x: -365, y: 80, z: -197, w: 150, d: 106, r: 10 },
  cournot: { x: -365, z: -66, mast: 50, dish: 40 },
  electronx: { x: -365, z: 58, m: 0.46 },
  slab: { x0: -210, x1: 220, z0: -256, z1: 44, h: 3 },
  deck: { x0: -204, x1: 214, z0: -250, z1: -4, y: 3, t: 1.2 },
  pods: {
    forecaster: [-130, -211], state: [10, -211], market: [147, -211],
    hedger: [-130, -139], risk: [10, -139], planner: [147, -139],
  },
  pod: { w: 104, h: 22, d: 46, y: 4.2, r: 4 },
  spine: { x0: -200, x1: 210, y: 5, z: -67 },
  brain: { x: -60, y: 200, z: -67, r: 50 },
  cube: { x: 370, z: -201, edge: 52, base: 1.2, pad: 34 },
  trays: { x: 370, z: -86, w: 84, d: 52, ys: [2, 10, 18, 26] },
  lens: { x: 370, y: 30, z: 9, r: 24 },
  // the hosted agents on AgentCore: a small pad in the stewards' box, east of the lens and of the strands from the cube
  // (E11 at x 428, E18 at x 446), two third-size pods across its north part, the evaluator's (agent 2922) behind the
  // Forecaster's (agent 2925); the owner's logo is the chip in its label (pieces.ts LOGO_OF)
  evaluator: { x: 455, z: 9, w: 38, d: 38, h: 3, r: 4, pod: { z: -10, w: 34, d: 10, h: 7, r: 2 }, pod2: { z: 2 }, wire: 446 },
  // the edge Worker on Cloudflare: a pad north-east of the cube, past its day blocks and clear of the strands that run
  // down its east side (at site widths a name beside the trays sat on them), a steel gate on it (files pass once
  // checked)
  edge: { x: 466, z: -240, w: 28, d: 22, h: 3, r: 4 },
  rail: { x0: -150, x1: 480, z: 105, d: 8 },
  atlas: { x: 40, y: 36, z: 105, r: 25 },
  cmc: { x: 300, z: 105, h: 40, w: 40 },
  arena: { x: -330, z: 211 },
  coin: { x: -22, y: 26, z: 211, r: 23 }, vault: { x: 30, z: 211, s: 30 },
  tower: { x: 400, z: 211, h: 56 },
};
/** The zone titles, plain (Jo, 26 Nov): the diagram's columns and its front row. */
export const ZONES = [
  { id: 'real', text: 'REAL WORLD', at: [-480, 0, -272] },
  { id: 'agents', text: 'AGENTS · BNB AGENT STUDIO', at: [-200, 0, -272] },
  { id: 'witness', text: 'SEALED AND CHECKED · BNB CHAIN', at: [260, 0, -272] },
  { id: 'arena', text: 'MARKETS', at: [-480, 0, 130] },
];

const C = { lat: outline.bbox_center_latlon[0], lon: outline.bbox_center_latlon[1] };
/** A map point on the ERCOT plinth: 13 m a degree of latitude, longitude by cos 31 degrees. */
export const mapXZ = (lat, lon) => [POS.plinth.x + (lon - C.lon) * 13 * COS31, POS.plinth.z - (lat - C.lat) * 13];

/** Points that bound the space at rest (the fit of S01): every object's extremes. */
export function boundsPoints() {
  const P = [];
  const add = (x, y, z) => P.push(new THREE.Vector3(x, y, z));
  for (const [lon, lat] of outline.lonlat) { const [x, z] = mapXZ(lat, lon); add(x, 0, z); }
  const g = POS.glass; for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g.x + sx * g.w / 2, g.y, g.z + sz * g.d / 2);
  const b = POS.brain; add(b.x, b.y + b.r, b.z); add(b.x - b.r, b.y, b.z); add(b.x + b.r, b.y, b.z);
  add(POS.slab.x0, 0, POS.slab.z0); add(POS.slab.x1, 0, POS.slab.z1); add(POS.slab.x0, 0, POS.slab.z1);
  add(POS.cube.x, 54, POS.cube.z - 37); add(POS.cube.x + 70, 0, POS.cube.z);
  add(POS.lens.x + POS.lens.r, POS.lens.y + POS.lens.r, POS.lens.z);
  add(POS.tower.x, POS.tower.h + 2, POS.tower.z); add(POS.arena.x - 58, 0, POS.arena.z + 58); add(POS.rail.x1, 0, POS.rail.z);
  for (const zn of ZONES) add(...zn.at);
  add(480, 0, -272); add(480, 0, 276); add(-480, 0, 276);
  return P;
}

/** The three states (STACK.md section 2), from the data: 'live' (ran, evidence on file), 'after' (ran after the sealed
 *  plan's stamp), 'designed' (nothing has run on chain or in hosting). tn: the integrations record beside this file
 *  (the sponsor flows on BSC testnet that frame-data.json does not carry yet); a piece lights when its record is there. */
export function states(d, tn = TN) {
  const plan = d.sealed_day.plan_time.unix;
  const cournotAt = d.sponsors.cournot?.probability?.observed?.unix_ms ?? d.sponsors.cournot?.resolve?.observed?.unix_ms ?? null;
  const brainAt = d.sponsors.living_brain?.observed?.unix_ms ?? null;
  const admitted = d.sponsors.living_brain?.plan_time_cutoff_check?.pages_admitted;
  const job = tn?.agents?.job_1872;
  return {
    cournot: cournotAt == null ? 'designed' : cournotAt / 1000 > plan ? 'after' : 'live',
    brain: brainAt == null ? 'designed' : (admitted === 0 || brainAt / 1000 > plan) ? 'after' : 'live',
    // the six role identities (ERC-8004 on BSC testnet) and the planner's paid job to the forecaster, which ran after
    // the plan's stamp, for the sealed scenarios: drawn as 'after'
    erc8004: d.sealed_day.agent.erc8004_id != null || tn?.agents?.ids ? 'live' : 'designed',
    job: job?.status === 'COMPLETED' ? 'after' : 'designed',
    aws: tn?.agent_studio?.hosted?.backend ? 'live' : 'designed',
    flap: tn?.flap?.token && tn?.flap?.launch?.tx ? 'live' : 'designed',
    openfour: tn?.openfour?.graduated?.tx ? 'live' : 'designed',
    // CMC's screening of launches has not run; the outcome lamps wait for the first linked stage
    screening: 'designed', outcomes: 'designed',
  };
}

/** The recipes of section 4 in px; m converts to meters at the frame's scale. Chapter 05's glows, a little wider and
 *  stronger (gk) so the strands carry light at the finale's smaller scale; on the light ground a glow is a tint, so it
 *  takes more alpha there. */
function recipes(m, P, theme = 'dark') {
  const gk = theme === 'light' ? 1.7 : 1.25, bk = theme === 'light' ? 1.35 : 1.1;
  const B = (b) => ({ ...b, glowA: Math.min(0.85, b.glowA * bk) });
  return {
    price: { core: 1.1, glow: 4.5, glowA: 0.12 * gk, period: 41 * m, speed: 18 * m, arrow: 6.5 * m, fade: [6 * m, 0], beads: B({ core: 2.1, glow: 7.5, glowA: 0.32, tail: 0.3 }) },
    strand: { core: 1.5, glow: 5.5, glowA: 0.14 * gk, period: 53 * m, speed: 27 * m, arrow: 9 * m, fade: [13 * m, 13 * m], beads: B({ core: 2.1, glow: 7.5, glowA: 0.32, tail: 0.3 }) },
    financial: { core: 1.5, glow: 5.5, glowA: 0.14 * gk, dash: 6 * m, gap: 4 * m, period: 53 * m, speed: 27 * m, arrow: 9 * m, fade: [13 * m, 13 * m], phase: 50 * m, beads: B({ core: 2.1, glow: 7.5, glowA: 0.32, tail: 0.3 }) },
    root: { core: 1.8, glow: 8.5, glowA: 0.36 * gk, speed: 70 * m, arrow: 9 * m, fade: [6 * m, 4 * m], beads: B({ core: 2.6, glow: 10.5, glowA: 0.45, tail: 0.22 }) },
    thinRoot: { core: 1.1, glow: 4.5, glowA: 0.16 * gk, period: 60 * m, speed: 40 * m, arrow: 8 * m, fade: [10 * m, 10 * m], beads: B({ core: 2.2, glow: 8.5, glowA: 0.4, tail: 0.24 }) },
    files: { core: 1.1, glow: 4.5, glowA: 0.12 * gk, period: 15 * m, speed: 35 * m, arrows: [], fade: [10 * m, 10 * m], beads: B({ core: 1.6, glow: 6, glowA: 0.28, tail: 0.5 }) },
  };
}

/** The combined brain's pose in the sphere: rolled by the camera's down-angle (ISO) about its own front-to-back axis,
 *  then turned about the vertical so its left side faces the stack's camera (az 180, from the south), its front to the
 *  east and its top up the screen. It reads as a brain in profile, not the round dome its front makes or the oval its
 *  top makes from above. pose() swings the turn 0.32 either way, as the mark it replaces on the night ground. */
const INSET_YAW = Math.PI / 2 - 0.2;
const INSET_ROLL = -Math.atan(1 / Math.SQRT2);   // common.ts ISO, 35.26 degrees, in radians

/** A rounded rectangle's outline at height y, offset outward by off (a halo or a shade's outline). */
const rectPoly = (cx, cz, w, d, r, off = 0) => roundRect(cx, cz, w + 2 * off, d + 2 * off, r + off, 8);

/** Builds the space into a group. o: { theme, mpp (meters a CSS px at the frame's camera), camera, blur, res, mark,
 *  now (the live mount's clock in unix seconds; the stills pass none) }. */
export async function buildSpace(ctx, o) {
  const d = ctx.needData(), theme = o.theme, P = PAL[theme], m = o.mpp, R = recipes(m, P, theme), st = states(d, TN), H = hosting(TN, o.now ?? null);
  const root = new THREE.Group(); root.name = 'stack';
  const solids = new THREE.Group(), marks = new THREE.Group(), flows = new THREE.Group();
  root.add(solids, marks, flows);
  const pieces = {};   // id -> { at: tick anchor, mats: [materials], center, halo, picks, box }
  const piece = (id, at, extra = {}) => (pieces[id] = { id, at, mats: [], picks: [], ...extra });
  const dimmable = (id, ...mats) => { for (const mm of mats) if (mm) pieces[id].mats.push(mm); };
  const camR0 = new THREE.Vector3().setFromMatrixColumn(o.camera.matrixWorld, 0), camU0 = new THREE.Vector3().setFromMatrixColumn(o.camera.matrixWorld, 1);

  // ── the hover state's parts (S03): a halo per piece (a teal ring or outline, 1.6 px, glowA 0.3, static, hidden until
  // hovered) and the pick shapes a pointer is tested against (simple solids, never drawn) ──────────────────────────
  const halos = new THREE.Group(); halos.name = 'halos'; flows.add(halos);
  const haloOpts = { color: P.halo, width: 1.6, glow: 7, glowA: 0.3, renderOrder: 16 };
  const setHalo = (id, obj) => { obj.material.opacity = 0; obj.userData.overlay = true; obj.userData.noAO = true; halos.add(obj); pieces[id].halo = obj; };
  /** A halo on the ground or a surface: a ring of radius r at c. */
  const haloRing = (id, c, r) => setHalo(id, ring(c, r, RIGHT, new THREE.Vector3(0, 0, 1), haloOpts));
  /** A halo facing the camera: a ring round a floating thing (a sphere, the lens). */
  const haloFace = (id, c, r) => setHalo(id, ring(c, r, camR0, camU0, haloOpts));
  /** A halo along an outline (x, z pairs) at height y. */
  const haloPoly = (id, poly, y) => setHalo(id, line(poly.map(([x, z]) => [x, y, z]), { ...haloOpts, reveal: false, closed: true }));
  const pickMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const pickers = [];
  const pick = (id, geometry, pos = [0, 0, 0], rotY = 0) => {
    const mesh = new THREE.Mesh(geometry, pickMat); mesh.position.set(...pos); mesh.rotation.y = rotY; mesh.updateMatrixWorld(true);
    mesh.userData.piece = id; pieces[id].picks.push(mesh); pickers.push(mesh);
    return mesh;
  };
  const pickBox = (id, x0, y0, z0, x1, y1, z1) => pick(id, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]);
  const pickCyl = (id, x, z, r, y0, y1) => pick(id, new THREE.CylinderGeometry(r, r, y1 - y0, 32), [x, (y0 + y1) / 2, z]);
  const pickBall = (id, c, r) => pick(id, new THREE.SphereGeometry(r, 24, 16), [c.x, c.y, c.z]);

  // ── depth: chapter 05's shades (each pad's own outline, set toward the camera, feathered) and pools of light on the
  // surfaces under the lit pieces (additive at night, a tint on the light ground) ───────────────────────────────────
  const shades = [];   // [poly, y, piece]
  /** A pad's shade; a piece the seal's views hide (S02: the market row, the arena) names itself, so its shade can go
   *  with it instead of staying on the ground as a dark mark where it stood. */
  const shadeAt = (poly, y = 0.05, id = null) => shades.push([poly, y, id]);
  const pools = new THREE.Group(); pools.name = 'pools'; marks.add(pools);
  const lightPool = (id, hex, r, a, x, y, z) => { const p = pool(hex, r, a, theme, y); p.position.x = x; p.position.z = z; pools.add(p); if (id) dimmable(id, p.material); return p; };

  // a solid in flat fills with hairline edges (chapter 05's solids); returns the built group
  const solid = (id, fn, { lineWidth = 1, ghost = false, cast = true } = {}) => {
    const b = new Builder(); fn(b);
    const mat = flatMaterial(ghost ? { transparent: true, opacity: P.ghostA } : {});
    const built = b.build({ dpr: ctx.dpr, lineWidth, material: mat });
    built.mesh.castShadow = cast && !ghost;
    if (built.lines && ghost) { built.lines.material.transparent = true; built.lines.material.opacity = 0.55; }
    solids.add(built.group);
    if (id) dimmable(id, built.mesh.material, built.lines?.material);
    return built;
  };

  // ── the venue's station plinths as faint footprints, so the space registers box on box with the venue: only in
  // the plan view (S04), where they are section 01's boxes; in the iso frames they only cut across the objects ──
  if (o.footprints) {
    const boxes = [[-480, -256, -250, -138], [-480, -114, -250, -18], [260, -256, 480, -146], [260, -126, 480, -46], [260, -26, 480, 44],
      [-150, 88, 480, 122], [-480, 146, -180, 276], [-150, 146, 150, 276], [180, 146, 480, 276]];
    solid(null, (b) => { for (const [x0, z0, x1, z1] of boxes) b.prism(roundRect((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 10, 6), 0, 0.12, { top: P.pad, side: P.pad, edge: P.padEdge, verticals: false }); }, { cast: false });
  }

  // ── ERCOT: the outline as a plinth, the fleet standing on it ────────────────────────────────────────────────
  const poly = outline.lonlat.map(([lon, lat]) => mapXZ(lat, lon));
  piece('ercot', [POS.plinth.x - 60, 2, POS.plinth.z + 4]);
  solid('ercot', (b) => b.prism(poly, 0, POS.plinth.h, { top: P.top, side: P.side, edge: P.edgeHi, verticals: false }));
  shadeAt(poly);
  haloPoly('ercot', offsetPoly(poly, 6), 0.3);
  {
    // the pick: the outline as a prism up to the tallest columns
    const sh = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    pick('ercot', new THREE.ExtrudeGeometry(sh, { depth: 30, bevelEnabled: false }).rotateX(-Math.PI / 2));
  }
  // the outline lit along the plinth's top edge, so Texas reads under the fleet (chapter 05's fine core in a soft glow)
  {
    const rimE = line(poly.map(([x, z]) => [x, POS.plinth.h + 0.06, z]), { color: P.outline, width: 1.1, glow: 4.5, glowA: 0.2, opacity: 0.9, renderOrder: 12, reveal: false, closed: true });
    overlay(rimE); flows.add(rimE); dimmable('ercot', rimE.material);
  }
  const fleet = d.fleet.batteries.filter((x) => x.map && x.map.lat != null);
  const dsw = d.showcase;
  solid('ercot', (b) => {
    for (const x of fleet) {
      if (x.resource === dsw.resource) continue;
      const [cx, cz] = mapXZ(x.map.lat, x.map.lon);
      b.cyl({ x: cx, y: POS.plinth.h, z: cz, r0: 0.95, h: Math.max(0.2, COL_M * x.power_mw), seg: 6, fill: P.column, top: P.columnTop });
    }
  });
  const [dx, dz] = mapXZ(dsw.map.lat, dsw.map.lon), dH = COL_M * dsw.power_mw;
  solid('ercot', (b) => b.cyl({ x: dx, y: POS.plinth.h, z: dz, r0: 2.2, h: dH, seg: 12, fill: P.dswl, top: P.dswl }));
  const dTop = new THREE.Vector3(dx, POS.plinth.h + dH, dz);
  const dRing = ring(dTop.clone().add(new THREE.Vector3(0, 0.4, 0)), 4.2, RIGHT, new THREE.Vector3(0, 0, 1), { color: P.teal, width: 1.4, glow: 5, glowA: 0.3, renderOrder: 14 });
  flows.add(dRing); dimmable('ercot', dRing.material);
  const dGlow = glow(P.teal, 22, 0.45, theme); dGlow.position.copy(dTop); marks.add(dGlow); dimmable('ercot', dGlow.material);

  // ── the Wattness Terminal: chapter 05's glass layer over the plinth ───────────────────────────────────────────
  const G = POS.glass;
  piece('terminal', [G.x - G.w / 2 + 2, G.y, G.z - G.d / 2]);
  const plane = glassPlane({ w: G.d, d: G.w, y: G.y, x: G.x, z: G.z, radius: G.r, theme, blur: o.blur, mark: o.mark, res: o.res });
  plane.rotation.y = -Math.PI / 2;
  const gu = plane.material.uniforms;
  if (theme === 'light') { gu.uFill.value.copy(new THREE.Color().setRGB(0.80, 0.86, 0.93, THREE.SRGBColorSpace)); gu.uFillA.value = 0.16; gu.uHairA.value = 1.0; gu.uShadowA.value = 0.24; gu.uSheen.value = 0.07; }
  gu.uShadowA.value = 0;
  const lenM = 0.4, hgt = (lenM * G.w) / (o.mark.aspect * G.d);
  gu.uMarkRect.value.set(0.5 - lenM / 2, 0.30 - hgt / 2, lenM, hgt);
  marks.add(plane);
  pieces.terminal.glass = plane;
  haloPoly('terminal', rectPoly(G.x, G.z, G.w, G.d, G.r, 6), G.y + 0.4);
  pickBox('terminal', G.x - G.w / 2, G.y - 3, G.z - G.d / 2, G.x + G.w / 2, G.y + 3, G.z + G.d / 2);
  // the prices' light under the glass, on the plinth's top
  lightPool('terminal', P.price, 62, theme === 'light' ? 0.16 : 0.13, G.x, POS.plinth.h + 0.08, G.z);

  // ── the agents: the zone's slab, Agent Studio's deck, six pods, the memory spine ──────────────────────────────
  // the slab is the zone's floor, unnamed: no label, card or halo, nothing to pick; it dims with the other objects
  const S = POS.slab, DK = POS.deck, PD = POS.pod;
  piece('floor', null);
  solid('floor', (b) => b.prism(roundRect((S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2, S.x1 - S.x0, S.z1 - S.z0, 12, 6), 0, S.h, { top: P.top, side: P.side, edge: P.edge, verticals: false }));
  shadeAt(rectPoly((S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2, S.x1 - S.x0, S.z1 - S.z0, 12));
  piece('studio', [DK.x0 + 27, DK.y + DK.t, DK.z1 - 24]);
  solid('studio', (b) => b.prism(roundRect((DK.x0 + DK.x1) / 2, (DK.z0 + DK.z1) / 2, DK.x1 - DK.x0, DK.z1 - DK.z0, 8, 6), DK.y, DK.y + DK.t, { top: P.deckTop, side: P.side, edge: P.bnb, verticals: false }), { lineWidth: 1 });
  haloPoly('studio', rectPoly((DK.x0 + DK.x1) / 2, (DK.z0 + DK.z1) / 2, DK.x1 - DK.x0, DK.z1 - DK.z0, 8, 4), DK.y + DK.t + 0.2);
  pickBox('studio', DK.x0, DK.y, DK.z0, DK.x1, DK.y + DK.t + 0.6, DK.z1);
  {
    const inset = roundRect((DK.x0 + DK.x1) / 2, (DK.z0 + DK.z1) / 2, DK.x1 - DK.x0 - 12, DK.z1 - DK.z0 - 12, 6, 6).map(([x, z]) => [x, DK.y + DK.t + 0.05, z]);
    const dl = line(inset, { color: P.dash, width: 1, dash: 4 * m, gap: 3 * m, opacity: 0.7, renderOrder: 13, reveal: false, closed: true });
    flows.add(dl); dimmable('studio', dl.material);
    // the deck's BNB-yellow rim carries a soft glow (the build the agents stand on)
    const rimL = line(roundRect((DK.x0 + DK.x1) / 2, (DK.z0 + DK.z1) / 2, DK.x1 - DK.x0, DK.z1 - DK.z0, 8, 8).map(([x, z]) => [x, DK.y + DK.t + 0.04, z]),
      { color: P.bnb, width: 1.1, glow: 7, glowA: theme === 'light' ? 0.3 : 0.2, opacity: 0.95, renderOrder: 13, reveal: false, closed: true });
    flows.add(rimL); dimmable('studio', rimL.material);
  }
  // the BNB symbol inlaid at the deck's front-left corner, drawn pre-stretched in z so it reads at its own aspect
  {
    const t = pathTexture(bnbRaw, 0, { px: 512 });
    const s = 15, mesh = new THREE.Mesh(new THREE.PlaneGeometry(s, s / t.aspect).rotateX(-Math.PI / 2), basic('#ffffff', { map: t.texture, transparent: true, opacity: 0.95 }));
    mesh.material.toneMapped = false; mesh.scale.z = 1 / Math.sin(35.26 * D2R); mesh.userData.iso = true;
    mesh.position.set(DK.x0 + 16, DK.y + DK.t + 0.08, DK.z1 - 16); overlay(mesh, 12); marks.add(mesh); dimmable('studio', mesh.material);
  }
  const podTop = PD.y + PD.h, deckTop = DK.y + DK.t;
  for (const [id, [x, z]] of Object.entries(POS.pods)) {
    const planner = id === 'planner', gc = GLYPH_COLOR[theme][id];
    piece(id, [x - PD.w / 2 + 4, podTop + 0.5, z - PD.d / 2 + 5], { center: new THREE.Vector3(x, PD.y + PD.h / 2, z), glyphColor: gc });
    solid(id, (b) => b.prism(roundRect(x, z, PD.w, PD.d, PD.r, 4), PD.y, podTop, { top: P.podTop, side: P.podSide, edge: planner ? P.bnb : P.podEdge, verticals: false }), { lineWidth: planner ? 1.4 : 1 });
    shadeAt(rectPoly(x, z, PD.w, PD.d, PD.r), deckTop + 0.05);
    haloPoly(id, rectPoly(x, z, PD.w, PD.d, PD.r, 5), deckTop + 0.25);
    pickBox(id, x - PD.w / 2, PD.y, z - PD.d / 2, x + PD.w / 2, podTop + 0.5, z + PD.d / 2);
    const pane = glassPlane({ w: PD.w - 1, d: PD.d - 1, y: podTop + 0.3, x, z, radius: PD.r, theme, blur: o.blur, mark: o.blank, res: o.res });
    pane.material.uniforms.uShadowA.value = 0; pane.material.uniforms.uMarkA.value = 0; pane.renderOrder = 11;
    marks.add(pane); dimmable(id, pane.material);
    // the role's glyph on the glass, right of the name, in the color of the flow that feeds the role, with its glow
    {
      const s = 21, gm = new THREE.Mesh(new THREE.PlaneGeometry(s, s).rotateX(-Math.PI / 2), basic('#ffffff', { map: glyphTexture(id, gc, { theme }), transparent: true, opacity: 1 }));
      gm.material.toneMapped = false; gm.scale.z = 1 / Math.sin(35.26 * D2R); gm.userData.iso = true;
      // in a slot at the pod's right end (8 m further out than first drawn): at 1440 x 900 the glyph sat on the end of
      // the longer names ("State keeper", "Market reader")
      gm.position.set(x + PD.w / 2 - 14, podTop + 0.45, z - 2); overlay(gm, 12); marks.add(gm); dimmable(id, gm.material);
      pieces[id].glyph = gm;
      lightPool(id, gc, 17, theme === 'light' ? 0.14 : 0.16, x + PD.w / 2 - 14, podTop + 0.36, z - 2);
    }
    if (planner) {
      const rl = line(roundRect(x, z, PD.w, PD.d, PD.r, 6).map(([px, pz]) => [px, podTop + 0.05, pz]),
        { color: P.bnb, width: 1.2, glow: 8, glowA: theme === 'light' ? 0.34 : 0.24, opacity: 1, renderOrder: 13, reveal: false, closed: true });
      flows.add(rl); dimmable(id, rl.material);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8), basic(planner ? P.bnb : P.teal));
    lamp.position.set(x + PD.w / 2 - 7, podTop + 1.6, z + PD.d / 2 - 6); overlay(lamp, 12); marks.add(lamp); dimmable(id, lamp.material);
    const lg = glow(planner ? P.bnb : P.teal, 18, 0.6, theme); lg.position.copy(lamp.position); marks.add(lg); dimmable(id, lg.material);
  }
  const SP = POS.spine;
  piece('memory', null);
  solid('memory', (b) => b.prism(roundRect((SP.x0 + SP.x1) / 2, SP.z, SP.x1 - SP.x0, 8, 3, 4), DK.y + DK.t, SP.y + 1, { top: P.spineTop, side: P.spineSide, edge: P.memory, verticals: false }));

  // ── Living Brain: a glass sphere over the agents. On the night ground the combined brain of our three turns inside it
  // in Living Brain's own look (stations/brain/inset.ts, from brain-scene.json, as the brain station draws it); on the
  // light ground, where a glow washes out, its mark inside the Wattness Brain's constellation, as before ─────────────
  const BR = POS.brain;
  piece('brain', [BR.x + BR.r + 4, BR.y - 10, BR.z], { center: new THREE.Vector3(BR.x, BR.y, BR.z) });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(BR.r, 72, 48), shellMaterial({ blur: o.blur, res: o.res, theme, tint: P.memory, tintA: P.sphereTintA,
    fill: P.sphereFill, fillA: P.sphereFillA, hair: P.sphereHair }));
  sphere.position.set(BR.x, BR.y, BR.z); overlay(sphere, 10); marks.add(sphere); dimmable('brain', sphere.material);
  // its outline: a memory-blue ring on the silhouette in a soft glow, so the sphere reads on either ground
  {
    const sil = ring(new THREE.Vector3(BR.x, BR.y, BR.z), BR.r + 0.2, camR0, camU0, { color: P.sphereLine, width: 1.3, glow: 9, glowA: theme === 'light' ? 0.32 : 0.26, opacity: P.sphereLineA, renderOrder: 12 });
    overlay(sil); flows.add(sil); dimmable('brain', sil.material);
    // a halo of the memory's light round the shell, and its pool on the deck below (the spine it writes to)
    const hg = glow(P.memory, BR.r * 2.9, theme === 'light' ? 0.22 : 0.16, theme); hg.position.set(BR.x, BR.y, BR.z); hg.renderOrder = 7; marks.add(hg); dimmable('brain', hg.material);
    lightPool('brain', P.memory, 70, theme === 'light' ? 0.13 : 0.12, BR.x, POS.deck.y + POS.deck.t + 0.07, BR.z);
  }
  haloFace('brain', new THREE.Vector3(BR.x, BR.y, BR.z), BR.r + 6);
  pickBall('brain', new THREE.Vector3(BR.x, BR.y, BR.z), BR.r);
  pickBox('brain', POS.spine.x0, POS.deck.y + POS.deck.t, POS.spine.z - 5, POS.spine.x1, POS.spine.y + 1.5, POS.spine.z + 5);
  const brainInset = theme === 'light' ? null : (() => {
    // the brain a little under three quarters of the sphere's radius, drawn over the shell (10) with the lines' order
    const b = insetBrain(new THREE.Vector3(BR.x, BR.y, BR.z), BR.r * 0.74, { count: 30000, renderOrder: 12, bright: 1.25 });
    b.group.rotation.order = 'YXZ'; b.group.rotation.set(0, INSET_YAW, INSET_ROLL);
    marks.add(b.group); dimmable('brain', b.dimmer);
    return b;
  })();
  const brainMark = theme !== 'light' ? null : (() => {
    const t = brainTexture();
    const w = 34, mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w / t.aspect), basic('#ffffff', { map: t.texture, transparent: true }));
    mesh.material.toneMapped = false; mesh.material.side = THREE.DoubleSide;
    mesh.position.set(BR.x, BR.y, BR.z); overlay(mesh, 13); marks.add(mesh); dimmable('brain', mesh.material);
    return mesh;
  })();
  if (theme === 'light') {
    // the 18 pages and their 53 connections (brain_graph), laid out by a seeded force run inside radius 40
    const pages = d.brain_graph.pages, conns = d.brain_graph.connections, r = rng(seedOf('stack.brain'));
    const ix = new Map(pages.map((p, i) => [p.slug, i]));
    const pos = pages.map(() => { const u = r.next() * 2 - 1, a = r.next() * Math.PI * 2, s = Math.sqrt(1 - u * u), k = 18 + r.next() * 20; return new THREE.Vector3(Math.cos(a) * s * k, u * k * 0.8, Math.sin(a) * s * k); });
    const E = conns.map((c) => [ix.get(c.a), ix.get(c.b)]).filter(([a, b]) => a != null && b != null);
    for (let it = 0; it < 160; it++) {
      const f = pos.map(() => new THREE.Vector3());
      for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
        const dv = pos[i].clone().sub(pos[j]), dd = Math.max(dv.length(), 1); dv.multiplyScalar(260 / (dd * dd * dd)); f[i].add(dv); f[j].sub(dv);
      }
      for (const [a, b] of E) { const dv = pos[b].clone().sub(pos[a]), dd = dv.length(); dv.multiplyScalar((dd - 22) * 0.02); f[a].add(dv); f[b].sub(dv); }
      for (let i = 0; i < pos.length; i++) { pos[i].add(f[i].clampLength(0, 3)); if (pos[i].length() > 38) pos[i].setLength(38); }
    }
    const at = (p) => [BR.x + p.x, BR.y + p.y, BR.z + p.z];
    const web = lines(E.map(([a, b]) => [at(pos[a]), at(pos[b])]), { color: P.memory, width: 1, opacity: 0.55, renderOrder: 13, reveal: false });
    overlay(web); flows.add(web); dimmable('brain', web.material);
    const nodeGeo = new THREE.SphereGeometry(1.15, 10, 8);
    for (const p of pos) {
      const n = new THREE.Mesh(nodeGeo, basic(P.node)); n.position.set(...at(p)); overlay(n, 14); marks.add(n); dimmable('brain', n.material);
    }
    pieces.brain.nodes = pos.length; pieces.brain.edges = E.length;
  }
  const bead = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 8), basic(P.teal));
  bead.position.set(BR.x, BR.y - BR.r + 0.6, BR.z + 4); overlay(bead, 14); marks.add(bead); dimmable('brain', bead.material);

  // ── GateRecord on BNB Chain: the mark formed as a solid ───────────────────────────────────────────────────────
  const CB = POS.cube, cubeC = new THREE.Vector3(CB.x, CB.base + CB.edge / 2, CB.z);
  // its name over the cube's top corner (the lanes and the bead come in at its west face)
  piece('gate', [CB.x - 40, CB.base + CB.edge, CB.z - CB.edge / Math.SQRT2 - 4], { center: cubeC });
  solid('gate', (b) => b.cyl({ x: CB.x, y: 0, z: CB.z, r0: CB.pad, h: CB.base, seg: 72, fill: P.side, top: P.top }));
  shadeAt(Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2; return [CB.x + Math.cos(a) * CB.pad, CB.z + Math.sin(a) * CB.pad]; }));
  haloRing('gate', new THREE.Vector3(CB.x, 1.4, CB.z), CB.pad + 6);
  pickCyl('gate', CB.x, CB.z, CB.edge * 0.74, 0, CB.base + CB.edge * 1.25);
  // the witness's gold light on the ground round the pad
  lightPool('gate', P.bnb, 92, theme === 'light' ? 0.2 : 0.16, CB.x, 0.1, CB.z);
  const padRim = ring(new THREE.Vector3(CB.x, CB.base + 0.06, CB.z), CB.pad - 0.4, RIGHT, new THREE.Vector3(0, 0, 1), { color: P.bnb, width: 1.2, glow: 4.5, glowA: 0.3, renderOrder: 13 });
  flows.add(padRim); dimmable('gate', padRim.material);
  const bm = bnbMarkTexture();
  const cubeMat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */`varying vec3 vW; varying vec3 vN;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tMark; uniform vec3 uC; uniform vec3 uR; uniform vec3 uU; uniform vec3 uD; uniform vec2 uHalf; uniform float uPersp;
      uniform vec3 uTop; uniform vec3 uLeft; uniform vec3 uRight; uniform vec3 uTopLit; uniform vec3 uLeftLit; uniform vec3 uRightLit;
      uniform float uLit; uniform float uDim; uniform float uOpacity;
      varying vec3 vW; varying vec3 vN;
      void main() {
        // the fragment's place on the mark: along the ray from the eye onto the plane through the cube's center
        // facing the iso view (uPersp 1), or straight along the iso direction (0)
        vec3 hit = vW;
        if (uPersp > 0.5) { vec3 dir = normalize(vW - cameraPosition); hit = cameraPosition + dir * (dot(uC - cameraPosition, uD) / dot(dir, uD)); }
        vec3 q3 = hit - uC;
        vec2 q = vec2(dot(q3, uR), dot(q3, uU)) / uHalf;          // -1..1 across the hexagon's box
        vec2 mv = vec2(mix(7.0, 89.2857, 0.5 + 0.5 * q.x), mix(96.0, 0.0, 0.5 + 0.5 * q.y)) / 96.0;
        vec4 mk = texture2D(tMark, vec2(mv.x, 1.0 - mv.y));
        float a = max(mk.r, mk.g);
        if (a < 0.5 || mv.x < 0.0 || mv.x > 1.0 || mv.y < 0.0 || mv.y > 1.0) discard;
        vec3 n = normalize(vN);
        vec3 base = n.y > 0.5 ? uTop : (dot(n, uR) < 0.0 ? uLeft : uRight);
        vec3 lit = n.y > 0.5 ? uTopLit : (dot(n, uR) < 0.0 ? uLeftLit : uRightLit);
        vec3 c = mix(base, lit, smoothstep(0.5, 0.9, mk.g) * uLit);
        gl_FragColor = vec4(c * uDim, uOpacity);
      }`,
    uniforms: {
      tMark: { value: bm.texture }, uC: { value: cubeC.clone() }, uR: { value: new THREE.Vector3(1, 0, 0) }, uU: { value: new THREE.Vector3(0, 1, 0) },
      uD: { value: new THREE.Vector3(0, 0, -1) }, uHalf: { value: new THREE.Vector2(1, 1) }, uPersp: { value: 1 },
      uTop: { value: lin(P.gold.top).clone() }, uLeft: { value: lin(P.gold.left).clone() }, uRight: { value: lin(P.gold.right).clone() },
      uTopLit: { value: lin(P.gold.topLit).clone() }, uLeftLit: { value: lin(P.gold.leftLit).clone() }, uRightLit: { value: lin(P.gold.rightLit).clone() },
      uLit: { value: 1 }, uDim: { value: 1 }, uOpacity: { value: 1 },
    },
  });
  const cube = new THREE.Mesh(new THREE.BoxGeometry(CB.edge, CB.edge, CB.edge), cubeMat);
  cube.rotation.y = Math.PI / 4; cube.position.copy(cubeC); cube.castShadow = true;
  solids.add(cube);
  pieces.gate.cube = cube; pieces.gate.mats.push({ cube: cubeMat });
  /** Points the cube's mark along the iso view: R, U the view's right and up, D its forward; persp: per ray. */
  const aimCube = (R0, U0, D0, persp = true) => {
    const u = cubeMat.uniforms;
    u.uR.value.copy(R0); u.uU.value.copy(U0); u.uD.value.copy(D0); u.uPersp.value = persp ? 1 : 0;
    // the cube's iso hexagon in the view plane: half width and half height from its corners
    let hx = 0, hy = 0;
    const e = CB.edge / 2, rot = new THREE.Matrix4().makeRotationY(Math.PI / 4);
    for (let i = 0; i < 8; i++) {
      const c3 = new THREE.Vector3(i & 1 ? e : -e, i & 2 ? e : -e, i & 4 ? e : -e).applyMatrix4(rot);
      hx = Math.max(hx, Math.abs(c3.dot(R0))); hy = Math.max(hy, Math.abs(c3.dot(U0)));
    }
    u.uHalf.value.set(hx, hy);
  };
  const cubeGlow = glow(P.bnb, 120, theme === 'light' ? 0.2 : 0.14, theme); cubeGlow.position.copy(cubeC); marks.add(cubeGlow); dimmable('gate', cubeGlow.material);
  // the day blocks: Nov 26 sealed, the next gate's as an outline
  const blocks = [];
  for (let i = 0; i < 2; i++) {
    const bx = CB.x + CB.pad + 14 + i * 15, sealedDay = i === 0;
    const bmesh = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), sealedDay ? basic(P.bnb) : basic(P.bnb, { opacity: 0.1 }));
    bmesh.position.set(bx, 4, CB.z); bmesh.rotation.y = Math.PI / 4; bmesh.castShadow = sealedDay; solids.add(bmesh);
    if (!sealedDay) {
      const eg = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(8, 8, 8)), new THREE.LineBasicMaterial({ color: lin(P.bnb), transparent: true, opacity: 0.7 }));
      eg.position.copy(bmesh.position); eg.rotation.y = Math.PI / 4; overlay(eg, 13); marks.add(eg); dimmable('gate', eg.material);
    }
    blocks.push(bmesh); dimmable('gate', bmesh.material);
  }
  const link = line([[CB.x + 26, 4, CB.z], [CB.x + CB.pad + 14 + 15, 4, CB.z]], { color: P.bnb, width: 1, opacity: 0.6, renderOrder: 13, reveal: false });
  flows.add(link); dimmable('gate', link.material);
  // the outcome lamps (designed until linked)
  for (let i = 0; i < 3; i++) {
    const lr = ring(new THREE.Vector3(CB.x - 12 + i * 12, CB.base + 0.1, CB.z + CB.pad - 5), 2.2, RIGHT, new THREE.Vector3(0, 0, 1), { color: P.ink, width: 1, opacity: 0.5, renderOrder: 13 });
    flows.add(lr); dimmable('gate', lr.material);
  }

  // ── BNB Greenfield: four glass trays holding the day's files as tiles ─────────────────────────────────────────
  const TR = POS.trays;
  // its name right of the three strands that run down the trays' east side (E9 at +6, E11 at +16, E18 at +34), not
  // across them
  piece('greenfield', [TR.x + TR.w / 2 + 44, 0, TR.z + TR.d / 2]);
  shadeAt(rectPoly(TR.x, TR.z, TR.w, TR.d, 2.5));
  haloPoly('greenfield', rectPoly(TR.x, TR.z, TR.w, TR.d, 2.5, 6), 0.3);
  pickBox('greenfield', TR.x - TR.w / 2, 0, TR.z - TR.d / 2, TR.x + TR.w / 2, TR.ys[3] + 3, TR.z + TR.d / 2);
  const trayMat = flatMaterial({ transparent: true, opacity: theme === 'light' ? 0.3 : 0.62 });
  {
    const b = new Builder();
    for (const y of TR.ys) b.prism(roundRect(TR.x, TR.z, TR.w, TR.d, 2.5, 3), y, y + 1.2, { top: P.trayTop, side: P.traySide, edge: P.trayEdge, verticals: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box({ x: TR.x + sx * (TR.w / 2 - 2), z: TR.z + sz * (TR.d / 2 - 2), y: 0, w: 1.2, h: TR.ys[3] + 1.2, d: 1.2, fill: P.steel });
    const built = b.build({ dpr: ctx.dpr, lineWidth: 1, material: trayMat }); built.mesh.castShadow = false; solids.add(built.group); dimmable('greenfield', trayMat, built.lines?.material);
  }
  for (const y of TR.ys) {
    const fl = line([[TR.x - TR.w / 2 + 2, y + 1.25, TR.z + TR.d / 2], [TR.x + TR.w / 2 - 2, y + 1.25, TR.z + TR.d / 2]], { color: P.bnb, width: 1, glow: 3, glowA: 0.18, opacity: 0.85, renderOrder: 13, reveal: false });
    flows.add(fl); dimmable('greenfield', fl.material);
  }
  // Greenfield's own symbol (marks/greenfield.svg, its first path, in its own yellow) on the top tray's open west half,
  // drawn pre-stretched in z like the deck's BNB symbol so it reads at its own aspect from the iso camera
  {
    const t = pathTexture(gfRaw, 0, { px: 512 });
    const s = 15, mesh = new THREE.Mesh(new THREE.PlaneGeometry(s, s / t.aspect).rotateX(-Math.PI / 2), basic('#ffffff', { map: t.texture, transparent: true, opacity: 0.96 }));
    mesh.material.toneMapped = false; mesh.scale.z = 1 / Math.sin(35.26 * D2R); mesh.userData.iso = true;
    mesh.position.set(TR.x - TR.w / 2 + 14, TR.ys[3] + 1.32, TR.z); overlay(mesh, 13); marks.add(mesh); dimmable('greenfield', mesh.material);
  }
  // tiles: syncs (bottom), scenarios, leaves, then the manifest, root, salt and the two receipts on top
  const kinds = GF.kinds, counts = [kinds.sync, kinds.scenarios, kinds.leaf, GF.objects - kinds.sync - kinds.scenarios - kinds.leaf];
  const nTiles = counts.reduce((a, b) => a + b, 0);
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(3.4, 0.4, 2.2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 }), nTiles);
  const tileInfo = [];
  {
    const mtx = new THREE.Matrix4(); let k = 0;
    counts.forEach((n, ti) => {
      for (let i = 0; i < n; i++) {
        const col = i % 20, row = Math.floor(i / 20);
        const x = TR.x - TR.w / 2 + 4.2 * (col + 0.5), z = TR.z - TR.d / 2 + 3.25 * (row + 0.5);
        mtx.makeTranslation(x, TR.ys[ti] + 1.4, ti === 3 ? TR.z : z); if (ti === 3) mtx.makeTranslation(TR.x - 10 + i * 5, TR.ys[ti] + 1.4, TR.z);
        tiles.setMatrixAt(k, mtx); tiles.setColorAt(k, lin(P.tile)); tileInfo.push({ tray: ti, i, col, row }); k++;
      }
    });
  }
  overlay(tiles, 12); marks.add(tiles); dimmable('greenfield', tiles.material);
  const leafAt = counts[0] + counts[1] + (dsw.leaf_position ?? 93);
  const setTiles = (litK, flash) => {
    for (let k = 0; k < nTiles; k++) {
      const ti = tileInfo[k], lit = ti.tray === 2 ? sr(litK, ti.col / 20 - 0.02, ti.col / 20 + 0.08) : litK > 0 ? 1 : 0;
      const c = lin(P.tile).clone().lerp(lin(P.tileLit), lit);
      if (k === leafAt) c.copy(lin(P.tileLit)).lerp(lin(P.bnb), flash);
      tiles.setColorAt(k, c);
    }
    tiles.instanceColor.needsUpdate = true;
  };
  setTiles(1, 1);

  // ── the verifier: a lens in a steel bezel, its inner rim teal on a match ──────────────────────────────────────
  const LS = POS.lens, lensC = new THREE.Vector3(LS.x, LS.y, LS.z);
  // its name left of the lens: below it, the evidence strand (E12) runs down through the word
  piece('verifier', [LS.x - LS.r - 5, LS.y - 4, LS.z], { center: lensC });
  shadeAt(Array.from({ length: 32 }, (_, i) => { const a = (i / 32) * Math.PI * 2; return [LS.x + Math.cos(a) * 10, LS.z + Math.sin(a) * 10]; }));
  haloFace('verifier', lensC, LS.r + 6);
  pickBall('verifier', lensC, LS.r + 1.5);
  pickCyl('verifier', LS.x, LS.z, 10, 0, LS.y - LS.r);
  lightPool('verifier', P.teal, 34, theme === 'light' ? 0.16 : 0.14, LS.x, 0.1, LS.z + 4);
  const lensG = new THREE.Group(); lensG.position.copy(lensC); marks.add(lensG);
  const bezel = flatMesh(new THREE.TorusGeometry(LS.r, 1.6, 14, 96), P.steel); lensG.add(bezel); bezel.castShadow = false; dimmable('verifier', bezel.material);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(LS.r - 1.4, 96), shellMaterial({ blur: o.blur, res: o.res, theme, tint: P.teal, tintA: 0.12, side: THREE.DoubleSide }));
  overlay(disc, 10); lensG.add(disc); dimmable('verifier', disc.material);
  const rimPts = Array.from({ length: 97 }, (_, i) => { const a = Math.PI / 2 - (i / 96) * Math.PI * 2; return [Math.cos(a) * (LS.r - 2.6), Math.sin(a) * (LS.r - 2.6), 0.3]; });
  const rim = line(rimPts, { color: P.teal, width: 1.6, glow: 8, glowA: theme === 'light' ? 0.45 : 0.38, renderOrder: 14, reveal: false, caps: false });
  lensG.add(rim); dimmable('verifier', rim.material);
  solid('verifier', (b) => { b.cyl({ x: LS.x, y: 0, z: LS.z, r0: 10, h: 1.2, seg: 40, fill: P.side, top: P.top, edge: P.edge, az: 180 }); b.box({ x: LS.x, y: 1.2, z: LS.z, w: 2.4, h: LS.y - LS.r - 1.2, d: 2.4, fill: P.steel }); });
  const aimLens = (camPos) => { lensG.lookAt(camPos); };

  // ── the hosted agents on Amazon Bedrock AgentCore: Agent Studio's managed hosting runs agent 2922, the evaluator,
  // which checks a sealed record against GateRecord and sells the report as a paid job, and agent 2925, the
  // Forecaster, which sells a battery's sealed price scenarios. A pad in the slab's recipe, two pods in the pods'
  // recipe at a third of their size, each with its teal lamp, lit while it is hosted (the Forecaster's wearing its
  // role's glyph, as its pod on the deck does). AWS's own logo is the chip in its label (no smile drawn here) ──────
  const EV = POS.evaluator, EP = EV.pod, padTop = EV.h, evPodTop = padTop + EP.h, evPodZ = EV.z + EP.z, fcPodZ = EV.z + EV.pod2.z;
  const HF = hosting(TN, o.now ?? null, 'hosted_forecaster');
  piece('aws', [EV.x, 0, EV.z + EV.d / 2 + 2], { center: new THREE.Vector3(EV.x, padTop + EP.h / 2, (evPodZ + fcPodZ) / 2) });
  solid('aws', (b) => b.prism(roundRect(EV.x, EV.z, EV.w, EV.d, EV.r, 6), 0, padTop, { top: P.top, side: P.side, edge: P.edge, verticals: false }));
  for (const z of [evPodZ, fcPodZ]) solid('aws', (b) => b.prism(roundRect(EV.x, z, EP.w, EP.d, EP.r, 4), padTop, evPodTop, { top: P.podTop, side: P.podSide, edge: P.podEdge, verticals: false }));
  haloPoly('aws', rectPoly(EV.x, EV.z, EV.w, EV.d, EV.r, 6), 0.3);
  pickBox('aws', EV.x - EV.w / 2, 0, EV.z - EV.d / 2, EV.x + EV.w / 2, evPodTop + 0.5, EV.z + EV.d / 2);
  {
    for (const [z, lit] of [[evPodZ, H.hosted], [fcPodZ, HF.hosted]] as [number, boolean][]) {
      const pane = glassPlane({ w: EP.w - 1, d: EP.d - 1, y: evPodTop + 0.3, x: EV.x, z, radius: EP.r, theme, blur: o.blur, mark: o.blank, res: o.res });
      pane.material.uniforms.uShadowA.value = 0; pane.material.uniforms.uMarkA.value = 0; pane.renderOrder = 11;
      marks.add(pane); dimmable('aws', pane.material);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8), basic(P.teal, { opacity: lit ? 1 : 0.4 }));
      lamp.position.set(EV.x + EP.w / 2 - 4.5, evPodTop + 1.4, z + EP.d / 2 - 3); overlay(lamp, 12); marks.add(lamp); dimmable('aws', lamp.material);
      if (lit) { const lg = glow(P.teal, 13, 0.6, theme); lg.position.copy(lamp.position); marks.add(lg); dimmable('aws', lg.material); }
    }
    // the Forecaster's glyph on its pod's glass, at the pod's west end, in its role's color
    const gs = 8.5, gc = GLYPH_COLOR[theme].forecaster;
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(gs, gs).rotateX(-Math.PI / 2), basic('#ffffff', { map: glyphTexture('forecaster', gc, { theme, px: 256 }), transparent: true, opacity: 1 }));
    gm.material.toneMapped = false; gm.scale.z = 1 / Math.sin(35.26 * D2R); gm.userData.iso = true;
    gm.position.set(EV.x - EP.w / 2 + 6.5, evPodTop + 0.45, fcPodZ); overlay(gm, 12); marks.add(gm); dimmable('aws', gm.material);
  }

  // ── the edge Worker on Cloudflare: it serves the sealed day's files from Greenfield, each only after checking it
  // against the root GateRecord holds. A pad in the slab's recipe, a steel gate on it (Cloudflare's own logo is the
  // chip in its label), a file tile under the lintel and the teal lamp of a check passed on top; the root reaches it as
  // E19 ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const EG = POS.edge, egTop = EG.h, gateH = 15, gateW = 22;
  piece('cloudflare', [EG.x, egTop + gateH + 7, EG.z], { center: new THREE.Vector3(EG.x, egTop + gateH / 2, EG.z) });
  solid('cloudflare', (b) => b.prism(roundRect(EG.x, EG.z, EG.w, EG.d, EG.r, 6), 0, egTop, { top: P.top, side: P.side, edge: P.edge, verticals: false }));
  solid('cloudflare', (b) => {
    for (const sx of [-1, 1]) b.box({ x: EG.x + sx * gateW / 2, z: EG.z, y: egTop, w: 2.6, h: gateH, d: 2.8, fill: P.steel, top: P.steelEdge, edge: P.steelEdge });
    b.box({ x: EG.x, z: EG.z, y: egTop + gateH, w: gateW + 2.6, h: 2.6, d: 2.8, fill: P.steel, top: P.steelEdge, edge: P.steelEdge });
  });
  shadeAt(rectPoly(EG.x, EG.z, EG.w, EG.d, EG.r), 0.05, 'cloudflare');
  haloPoly('cloudflare', rectPoly(EG.x, EG.z, EG.w, EG.d, EG.r, 6), 0.3);
  pickBox('cloudflare', EG.x - EG.w / 2, 0, EG.z - EG.d / 2, EG.x + EG.w / 2, egTop + gateH + 3, EG.z + EG.d / 2);
  {
    // the file passing through, and the lamp: a passed check
    const tile = new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 4.2), basic(P.tileLit));
    tile.position.set(EG.x, egTop + 0.4, EG.z + 3.5); overlay(tile, 12); marks.add(tile); dimmable('cloudflare', tile.material);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), basic(P.teal));
    lamp.position.set(EG.x, egTop + gateH + 3.4, EG.z); overlay(lamp, 12); marks.add(lamp); dimmable('cloudflare', lamp.material);
    const lg = glow(P.teal, 14, 0.6, theme); lg.position.copy(lamp.position); marks.add(lg); dimmable('cloudflare', lg.material);
    lightPool('cloudflare', P.teal, 26, theme === 'light' ? 0.12 : 0.1, EG.x, 0.1, EG.z);
  }

  // ── Cournot: a lattice mast and a plain dish (its owner's logo is the chip in its label, pieces.ts LOGO_OF) ─────
  const CO = POS.cournot;
  piece('cournot', [CO.x - 18, CO.mast * 0.66, CO.z + 2]);
  haloRing('cournot', new THREE.Vector3(CO.x, 0.3, CO.z), 24);
  pickCyl('cournot', CO.x + 2, CO.z, CO.dish / 2 + 3, 0, CO.mast + CO.dish * 0.75);
  shadeAt([[CO.x - 4, CO.z - 4], [CO.x + 4, CO.z - 4], [CO.x + 4, CO.z + 4], [CO.x - 4, CO.z + 4]]);
  {
    const legs = [], h = CO.mast, w0 = 7, w1 = 2.2;
    const corner = (y, sx, sz) => { const w = w0 + (w1 - w0) * (y / h); return [CO.x + sx * w / 2, y, CO.z + sz * w / 2]; };
    const C4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sz] of C4) legs.push([corner(0, sx, sz), corner(h, sx, sz)]);
    for (let k = 0; k < 6; k++) {
      const y0 = (k / 6) * h, y1 = ((k + 1) / 6) * h;
      for (let i = 0; i < 4; i++) { const [ax, az] = C4[i], [bx, bz] = C4[(i + 1) % 4]; legs.push([corner(y0, ax, az), corner(y1, bx, bz)]); legs.push([corner(y1, ax, az), corner(y1, bx, bz)]); }
    }
    const lat = lines(legs, { color: P.steelEdge, width: 1, opacity: 0.9, renderOrder: 12, reveal: false }); overlay(lat); flows.add(lat); dimmable('cournot', lat.material);
  }
  const dishG = new THREE.Group(); dishG.position.set(CO.x + 4, CO.mast + 4, CO.z + 2); marks.add(dishG);
  {
    const R0 = CO.dish / 2, prof = [];
    for (let i = 0; i <= 16; i++) { const r = (i / 16) * R0; prof.push(new THREE.Vector2(r, (r * r) / (R0 * R0) * 4.2)); }
    const dish = flatMesh(new THREE.LatheGeometry(prof, 72), P.top, { side: THREE.DoubleSide }); dish.castShadow = false; dishG.add(dish); dimmable('cournot', dish.material);
    const rimL = ring(new THREE.Vector3(0, 4.25, 0), R0, RIGHT, new THREE.Vector3(0, 0, 1), { color: P.steelEdge, width: 1, opacity: 0.8, renderOrder: 13 }); dishG.add(rimL); dimmable('cournot', rimL.material);
    // the dish looks toward the south-west sky, 35 degrees up (its face toward the camera's side)
    const az = 205 * D2R, el = 40 * D2R, axis = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    dishG.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    dishG.rotateY(Math.PI);
  }

  // ── ElectronX: a bounded bar, $0 to $100, the 24 assumed entries as rings (its owner's logo is the label's chip) ─
  const EX = POS.electronx, inst = dsw.instrument;
  const capM = EX.m, top$ = inst.range_cents[1] / 100 * capM;  // meters a dollar
  // its label right of the bar, half way up: under it, the label's logo chip ran into the markets' zone title
  piece('electronx', [EX.x + 10, top$ * 0.5, EX.z]);
  solid('electronx', (b) => { b.cyl({ x: EX.x, y: 0, z: EX.z, r0: 8, h: 0.9, seg: 40, fill: P.side, top: P.top, edge: P.edge, az: 180 }); b.cyl({ x: EX.x, y: top$, z: EX.z, r0: 8, h: 0.9, seg: 40, fill: P.side, top: P.top, edge: P.edge, az: 180 }); });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, top$, 40, 1, true), shellMaterial({ blur: o.blur, res: o.res, theme, tint: P.orange, tintA: 0.16, side: THREE.DoubleSide }));
  tube.position.set(EX.x, top$ / 2 + 0.45, EX.z); overlay(tube, 10); marks.add(tube); dimmable('electronx', tube.material);
  for (const c of inst.entry_cents) {
    const y = (c / 100) * capM;
    const rr = ring(new THREE.Vector3(EX.x, y, EX.z), 3.4, RIGHT, new THREE.Vector3(0, 0, 1), { color: P.orange, width: 0.9, glow: 4, glowA: 0.2, opacity: 0.85, renderOrder: 13 });
    flows.add(rr); dimmable('electronx', rr.material);
  }
  shadeAt(Array.from({ length: 32 }, (_, i) => { const a = (i / 32) * Math.PI * 2; return [EX.x + Math.cos(a) * 8, EX.z + Math.sin(a) * 8]; }));
  haloRing('electronx', new THREE.Vector3(EX.x, 0.3, EX.z), 15);
  pickCyl('electronx', EX.x, EX.z, 11, 0, top$ + 14);
  lightPool('electronx', P.orange, 20, theme === 'light' ? 0.1 : 0.07, EX.x, 0.1, EX.z);

  // ── the money rail, Atlas's globe and CoinMarketCap's arch ───────────────────────────────────────────────────
  const RL = POS.rail;
  // no solid rail: chapter 05's strands float on the ground; a gray bar under them read as a pipe
  piece('rail', null);
  const AT = POS.atlas, atC = new THREE.Vector3(AT.x, AT.y, AT.z);
  // its label right of the globe: under it, it sat on the season's vault and Flap's label
  piece('atlas', [AT.x + AT.r + 13, AT.y - 4, AT.z], { center: atC });
  const orbR = AT.r + 11;
  const globe = new THREE.Mesh(new THREE.SphereGeometry(AT.r, 64, 40), shellMaterial({ blur: o.blur, res: o.res, theme, tint: P.violet, tintA: theme === 'light' ? 0.42 : 0.32,
    fill: theme === 'light' ? '#ebe6f7' : null, fillA: theme === 'light' ? 0.45 : null, hair: theme === 'light' ? P.violet : null }));
  globe.position.copy(atC); overlay(globe, 10); marks.add(globe); dimmable('atlas', globe.material);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI, ax = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const mer = ring(atC, AT.r * 0.995, ax, UP, { color: P.violet, width: 0.8, opacity: theme === 'light' ? 0.45 : 0.36, renderOrder: 13 }); flows.add(mer); dimmable('atlas', mer.material);
  }
  for (const yy of [-0.5, 0, 0.5]) {
    const rr = AT.r * Math.sqrt(1 - yy * yy);
    const par = ring(atC.clone().add(new THREE.Vector3(0, yy * AT.r, 0)), rr, RIGHT, new THREE.Vector3(0, 0, 1), { color: P.violet, width: 0.8, opacity: theme === 'light' ? 0.45 : 0.36, renderOrder: 13 });
    flows.add(par); dimmable('atlas', par.material);
  }
  {
    const tilt = 18 * D2R, a1 = new THREE.Vector3(1, 0, 0), a2 = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
    const orb = ring(atC, orbR, a1, a2, { color: P.violet, width: 1.1, glow: 6, glowA: theme === 'light' ? 0.3 : 0.24, opacity: 0.9, renderOrder: 13 }); flows.add(orb); dimmable('atlas', orb.material);
    for (const t of [0.35, 3.6]) {
      const p = atC.clone().addScaledVector(a1, Math.cos(t) * orbR).addScaledVector(a2, Math.sin(t) * orbR);
      const sat = new THREE.Mesh(new THREE.SphereGeometry(1.9, 12, 8), basic(P.sat)); sat.position.copy(p); overlay(sat, 14); marks.add(sat); dimmable('atlas', sat.material);
      const sg = glow(P.violet, 14, 0.55, theme); sg.position.copy(p); marks.add(sg); dimmable('atlas', sg.material);
    }
    const ag = glow(P.violet, AT.r * 3.2, theme === 'light' ? 0.2 : 0.14, theme); ag.position.copy(atC); ag.renderOrder = 7; marks.add(ag); dimmable('atlas', ag.material);
  }
  haloFace('atlas', atC, orbR + 6);
  pickBall('atlas', atC, orbR);
  const CM = POS.cmc, cmH = CM.h, cmW = CM.w;
  piece('cmc', [CM.x, 0, CM.z + 6]);
  solid('cmc', (b) => {
    for (const sx of [-1, 1]) b.box({ x: CM.x + sx * (cmW / 2 - 3), y: 0, z: CM.z, w: 6, h: cmH, d: 6, fill: P.steel, top: P.steelEdge, edge: P.steelEdge });
    b.box({ x: CM.x, y: cmH, z: CM.z, w: cmW, h: 5, d: 6, fill: P.steel, top: P.steelEdge, edge: P.steelEdge });
  }, { cast: false });
  for (const sx of [-1, 1]) shadeAt(rectPoly(CM.x + sx * (cmW / 2 - 3), CM.z, 6, 6, 1), 0.05, 'cmc');
  haloPoly('cmc', rectPoly(CM.x, CM.z, cmW, 6, 3, 6), 0.3);
  pickBox('cmc', CM.x - cmW / 2, 0, CM.z - 6, CM.x + cmW / 2, cmH + 12, CM.z + 6);
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(cmW - 12, cmH - 1), basic(P.files, { opacity: theme === 'light' ? 0.12 : 0.08 })); scan.position.set(CM.x, cmH / 2, CM.z); overlay(scan, 11); marks.add(scan); dimmable('cmc', scan.material);
  const scanLine = line([[CM.x - (cmW / 2 - 6), 0, CM.z], [CM.x + (cmW / 2 - 6), 0, CM.z]], { color: P.files, width: 1.1, glow: 6, glowA: theme === 'light' ? 0.4 : 0.3, opacity: 0.85, renderOrder: 14, reveal: false });
  flows.add(scanLine); dimmable('cmc', scanLine.material);
  const cmcT = await cmcTexture();
  {
    // the plaque stands proud of the lintel, big enough that CoinMarketCap's mark reads at S01's scale
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(15, 15), basic('#ffffff', { map: cmcT.texture, transparent: true }));
    mesh.material.toneMapped = false; mesh.position.set(CM.x, cmH + 6, CM.z + 3.4); overlay(mesh, 14); marks.add(mesh); dimmable('cmc', mesh.material);
  }

  // ── the arena row: the bowl with today's sealed record, Flap's coin and vault, OpenFour's tower, lit where their
  // flows ran on BSC testnet (integrations.json) and drawn as ghosts where they have not ──────────────────────────
  const AR = POS.arena;
  piece('arena', [AR.x, 0, AR.z + 58]);
  const annulus = (b, r0, r1, h, top, side) => {
    const n = 72;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const p = (r, a, y) => new THREE.Vector3(AR.x + Math.cos(a) * r, y, AR.z + Math.sin(a) * r);
      b.quad(p(r0, a0, h), p(r0, a1, h), p(r1, a1, h), p(r1, a0, h), top);
      b.quad(p(r1, a0, 0), p(r1, a0, h), p(r1, a1, h), p(r1, a1, 0), side);
      b.quad(p(r0, a1, 0), p(r0, a1, h), p(r0, a0, h), p(r0, a0, 0), side);
    }
    const loop = (r, y) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return new THREE.Vector3(AR.x + Math.cos(a) * r, y, AR.z + Math.sin(a) * r); });
    b.loop(loop(r1, h), P.edge); b.loop(loop(r0, h), P.edge);
  };
  solid('arena', (b) => { annulus(b, 46, 58, 9, P.top, P.side); annulus(b, 34, 46, 6, P.top, P.side); annulus(b, 22, 34, 3, P.top, P.side); b.cyl({ x: AR.x, y: 0, z: AR.z, r0: 22, h: 1.2, seg: 72, fill: P.side, top: P.dais }); });
  shadeAt(Array.from({ length: 64 }, (_, i) => { const a = (i / 64) * Math.PI * 2; return [AR.x + Math.cos(a) * 58, AR.z + Math.sin(a) * 58]; }), 0.05, 'arena');
  haloRing('arena', new THREE.Vector3(AR.x, 0.3, AR.z), 64);
  pickCyl('arena', AR.x, AR.z, 58, 0, 10);
  const record = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), basic(P.bnb)); record.position.set(AR.x, 4.2, AR.z); record.rotation.y = Math.PI / 4; record.castShadow = true;
  solids.add(record); dimmable('arena', record.material);
  const recG = glow(P.bnb, 40, theme === 'light' ? 0.3 : 0.32, theme); recG.position.set(AR.x, 5, AR.z); marks.add(recG); dimmable('arena', recG.material);
  lightPool('arena', P.bnb, 24, theme === 'light' ? 0.16 : 0.15, AR.x, 1.3, AR.z);

  const CO2 = POS.coin, flapLive = st.flap === 'live';
  // its label right of the vault: under the coin it sat where the site's caption covers the stage
  piece('flap', [POS.vault.x + POS.vault.s / 2 + 3, POS.vault.s * 0.55, POS.vault.z]);
  const coinG = new THREE.Group(); coinG.position.set(CO2.x, CO2.y, CO2.z); marks.add(coinG);
  {
    const body = flatMesh(new THREE.CylinderGeometry(CO2.r, CO2.r, 6.5, 72).rotateX(Math.PI / 2), '#2b3138', { transparent: !flapLive, opacity: flapLive ? 1 : 0.55 });
    coinG.add(body); dimmable('flap', body.material);
    const ft = flapTexture();
    for (const s of [1, -1]) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(CO2.r * 0.76, 64), basic('#ffffff', { map: ft.texture, transparent: true, opacity: flapLive ? 1 : 0.46 }));
      face.material.toneMapped = false; face.position.z = s * 3.3; if (s < 0) face.rotation.y = Math.PI; overlay(face, 12); coinG.add(face); dimmable('flap', face.material);
    }
    const edgeR = ring(new THREE.Vector3(0, 0, 3.35), CO2.r, RIGHT, UP, { color: '#D0FF00', width: 1.2, glow: flapLive ? 6 : 0, glowA: 0.3, opacity: flapLive ? 0.9 : 0.4, renderOrder: 13 }); coinG.add(edgeR); dimmable('flap', edgeR.material);
    if (flapLive) { const cg = glow(P.lime, CO2.r * 2.5, theme === 'light' ? 0.16 : 0.075, theme); coinG.add(cg); dimmable('flap', cg.material); }
  }
  const VA = POS.vault;
  solid('flap', (b) => b.box({ x: VA.x, y: 0, z: VA.z, w: VA.s, h: VA.s, d: VA.s, fill: P.vault, top: P.vaultTop, edge: P.edgeHi }), { ghost: !flapLive });
  {
    const door = ring(new THREE.Vector3(VA.x, VA.s / 2, VA.z + VA.s / 2 + 0.1), VA.s * 0.32, RIGHT, UP, { color: flapLive ? P.lime : P.edgeHi, width: 1.3, glow: flapLive ? 6 : 0, glowA: 0.3, opacity: flapLive ? 0.95 : 0.7, renderOrder: 13 });
    flows.add(door); dimmable('flap', door.material);
  }
  shadeAt(rectPoly(VA.x, VA.z, VA.s, VA.s, 1), 0.05, 'flap');
  if (flapLive) lightPool('flap', P.lime, 34, theme === 'light' ? 0.12 : 0.07, (CO2.x + VA.x) / 2, 0.1, CO2.z);
  haloPoly('flap', rectPoly((CO2.x - CO2.r + VA.x + VA.s / 2) / 2, CO2.z, VA.x + VA.s / 2 - (CO2.x - CO2.r), Math.max(VA.s, 2 * 6.5), 4, 8), 0.3);
  pickBox('flap', CO2.x - CO2.r - 2, 0, CO2.z - VA.s / 2 - 2, VA.x + VA.s / 2 + 2, CO2.y + CO2.r + 2, CO2.z + VA.s / 2 + 2);

  const TW = POS.tower, fourLive = st.openfour === 'live';
  // its label beside the tower, right of it: under the tower it sat where the stills' key card stands
  piece('openfour', [TW.x + 12, TW.h * 0.35, TW.z]);
  solid('openfour', (b) => { b.box({ x: TW.x, y: 0, z: TW.z, w: 3.2, h: TW.h, d: 3.2, fill: P.steel, edge: P.steelEdge }); b.box({ x: TW.x + 4.5, y: 0, z: TW.z, w: 0.8, h: TW.h - 4, d: 0.8, fill: P.steel }); b.cyl({ x: TW.x, y: 0, z: TW.z, r0: 9, h: 1.2, seg: 32, fill: P.side, top: P.top, edge: P.edge, az: 180 }); }, { ghost: !fourLive });
  shadeAt(Array.from({ length: 32 }, (_, i) => { const a = (i / 32) * Math.PI * 2; return [TW.x + Math.cos(a) * 9, TW.z + Math.sin(a) * 9]; }), 0.05, 'openfour');
  haloRing('openfour', new THREE.Vector3(TW.x, 0.3, TW.z), 16);
  pickCyl('openfour', TW.x - 2, TW.z, 12, 0, TW.h + 4);
  const fourT = await fourTexture();
  // a 56 m tower (not 90): its top climbed into the money lanes and the arch's name on screen
  for (const y of [TW.h * 0.24, TW.h * 0.48, TW.h * 0.72]) {
    const tok = new THREE.Mesh(new THREE.CircleGeometry(6.4, 48), basic('#ffffff', { map: fourT.texture, transparent: true, opacity: fourLive ? 1 : 0.48 }));
    tok.material.toneMapped = false; tok.position.set(TW.x - 7.5, y, TW.z + 0.5); overlay(tok, 13); marks.add(tok); dimmable('openfour', tok.material);
  }
  {
    // the halo where a token graduates into its pool, lit (PLNR graduated on testnet), and the three evidence lamps
    const halo = ring(new THREE.Vector3(TW.x, TW.h - 4, TW.z), 11, RIGHT, new THREE.Vector3(0, 0, 1), { color: P.teal, width: 1.3, glow: fourLive ? 7 : 0, glowA: 0.32, opacity: fourLive ? 1 : 0.5, renderOrder: 13 }); flows.add(halo); dimmable('openfour', halo.material);
    if (fourLive) { const hg = glow(P.teal, 30, theme === 'light' ? 0.2 : 0.2, theme); hg.position.set(TW.x, TW.h - 4, TW.z); marks.add(hg); dimmable('openfour', hg.material); }
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Vector3(TW.x - 6 + i * 6, 1.3, TW.z + 10);
      if (fourLive) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), basic(P.teal)); lamp.position.copy(c).add(new THREE.Vector3(0, 0.6, 0)); overlay(lamp, 13); marks.add(lamp); dimmable('openfour', lamp.material);
        const lg = glow(P.teal, 10, 0.5, theme); lg.position.copy(lamp.position); marks.add(lg); dimmable('openfour', lg.material);
      } else { const lr = ring(c, 1.6, RIGHT, new THREE.Vector3(0, 0, 1), { color: P.ink, width: 1, opacity: 0.55, renderOrder: 13 }); flows.add(lr); dimmable('openfour', lr.material); }
    }
  }

  // ── the graph: chapter 05's strands ──────────────────────────────────────────────────────────────────────────
  const edges = {};
  const E = (id, from, to, pts, recipe, extra = {}) => {
    const s = strand(flows, pts, { ...recipe, ...extra, mpp: m, camera: o.camera });
    edges[id] = { id, from, to, ...s, state: extra.state ?? 'live' };
    return edges[id];
  };
  const podW = (id) => POS.pods[id][0] - PD.w / 2, podE = (id) => POS.pods[id][0] + PD.w / 2, podZ = (id) => POS.pods[id][1];
  // E1: prices rise from Desert Willow's node and the hubs' mapped centroids into the glass
  {
    const hubs = {};
    for (const x of fleet) { (hubs[x.hub] ??= []).push(mapXZ(x.map.lat, x.map.lon)); }
    const feet = [[dx, dTop.y + 1, dz]];
    for (const h of ['HB_NORTH', 'HB_SOUTH', 'HB_WEST', 'HB_HOUSTON']) { const v = hubs[h]; if (v) feet.push([v.reduce((a, p) => a + p[0], 0) / v.length, POS.plinth.h + 0.5, v.reduce((a, p) => a + p[1], 0) / v.length]); }
    feet.sort((a, b) => a[0] - b[0]).forEach((f, i) => {
      E(`E1.${i}`, 'ercot', 'terminal', [f, [f[0], G.y - 1, f[2]]], R.price, { color: P.price, ro: 13, arrows: [0.93], phase: f[0] * 0.07, side: RIGHT });
      const rr = ring(new THREE.Vector3(f[0], G.y + 0.5, f[2]), 2.6 * m, RIGHT, new THREE.Vector3(0, 0, 1), { color: P.price, width: 1.2, renderOrder: 14 });
      flows.add(rr); edges[`E1.${i}`].parts.push({ obj: rr, base: 1 });
    });
  }
  // E2: the Terminal's files into the Forecaster (527 files by SHA-256)
  E('E2', 'terminal', 'forecaster', [[G.x + G.w / 2, G.y, -211], [-240, G.y, -211], [-240, 15, -211], [podW('forecaster') - 2, 15, -211]], R.strand, { color: P.price, round: 9 });
  // E3: Cournot's odds into the Risk officer (read after the seal)
  E('E3', 'cournot', 'risk', [[CO.x + 22, 40, CO.z], [-50, 40, CO.z], [-50, 40, -139], [-50, 13, -139], [podW('risk') - 2, 13, -139]], R.strand, { color: P.files, round: 9, state: st.cournot === 'designed' ? 'designed' : 'live', after: st.cournot === 'after', arrows: [0.2] });
  edges.E3.after = st.cournot === 'after';
  // E4: ElectronX's published terms into the Hedger (financial: dashed)
  E('E4', 'electronx', 'hedger', [[EX.x, top$ + 1.2, EX.z], [EX.x, top$ + 13, EX.z], [-230, top$ + 13, EX.z], [-230, top$ + 13, -139], [-230, 15, -139], [podW('hedger') - 2, 15, -139]], R.financial, { color: P.orange, round: 9, arrows: [0.25] });
  // E5: Living Brain and the spine: captures up, cited pages down
  E('E5u', 'memory', 'brain', [[BR.x - 3.3, SP.y + 1.5, SP.z], [BR.x - 3.3, BR.y - BR.r - 1, SP.z]], R.strand, { color: P.memory, arrows: [0.55], side: RIGHT });
  E('E5d', 'brain', 'memory', [[BR.x + 3.3, BR.y - BR.r - 1, SP.z], [BR.x + 3.3, SP.y + 1.5, SP.z]], R.strand, { color: P.memory, arrows: [0.5], side: RIGHT, phase: 20 * m });
  edges.E5u.after = edges.E5d.after = st.brain === 'after';
  // E6: the spine to the six pods (comets on the spine only)
  {
    const yT = SP.y + 1.2, base = { ...R.strand, beads: null, arrows: [] };
    E('E6.spine+', 'memory', 'memory', [[SP.x0 + 4, yT, SP.z - 1.5], [SP.x1 - 4, yT, SP.z - 1.5]], R.strand, { color: P.memory, arrows: [], core: 1.3 });
    E('E6.spine-', 'memory', 'memory', [[SP.x1 - 4, yT, SP.z + 1.5], [SP.x0 + 4, yT, SP.z + 1.5]], R.strand, { color: P.memory, arrows: [], core: 1.3, phase: 26 * m });
    const front = podZ('hedger') + PD.d / 2;
    for (const id of ['hedger', 'risk', 'planner']) E(`E6.${id}`, 'memory', id, [[POS.pods[id][0], yT, SP.z - 4], [POS.pods[id][0], yT, front + 1]], base, { color: P.memory });
    const back = podZ('forecaster') + PD.d / 2, mid = -175;
    E('E6.forecaster', 'memory', 'forecaster', [[-72, yT, SP.z - 4], [-72, yT, mid], [POS.pods.forecaster[0], yT, mid], [POS.pods.forecaster[0], yT, back + 1]], base, { color: P.memory, round: 6 });
    E('E6.state', 'memory', 'state', [[-48, yT, SP.z - 4], [-48, yT, mid], [POS.pods.state[0], yT, mid], [POS.pods.state[0], yT, back + 1]], base, { color: P.memory, round: 6 });
    E('E6.market', 'memory', 'market', [[78, yT, SP.z - 4], [78, yT, mid], [POS.pods.market[0], yT, mid], [POS.pods.market[0], yT, back + 1]], base, { color: P.memory, round: 6 });
    for (const k of Object.keys(edges)) if (k.startsWith('E6')) edges[k].after = st.brain === 'after';
  }
  // E7: the Planner's two strands (physical teal above, financial orange below) meet in a glass bead; the root runs on
  const bx = 318, beadP = new THREE.Vector3(bx, 15, CB.z), reach = CB.edge / Math.SQRT2 + 2;
  const lo = 5 * m + 0.4;
  const lane = (sg) => [[podE('planner') + 2, 15 + sg * lo, -139], [300 - sg * lo, 15 + sg * lo, -139], [300 - sg * lo, 15, CB.z + sg * lo], [bx - 3, 15 + sg * lo * 0.3, CB.z + sg * lo * 0.3]];
  E('E7p', 'planner', 'gate', lane(1), R.strand, { color: P.teal, round: 9, arrows: [0.28] });
  E('E7f', 'planner', 'gate', lane(-1), R.financial, { color: P.orange, round: 9, arrows: [0.28] });
  const beadM = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), shellMaterial({ blur: o.blur, res: o.res, theme, tint: P.bnb, tintA: 0.5 }));
  beadM.position.copy(beadP); overlay(beadM, 15); marks.add(beadM);
  const beadG = glow(P.bnb, 16, 0.5, theme); beadG.position.copy(beadP); marks.add(beadG);
  const rootLen = CB.x - reach - bx;
  E('E7r', 'planner', 'gate', [[bx, 15, CB.z], [CB.x - reach + 6, 15, CB.z]], { ...R.root, period: Math.max(rootLen * 1.4, 1) }, { color: P.bnbLine, arrows: [], fade: [2, 8] });
  // E8: the day's 953 files to Greenfield
  E('E8', 'planner', 'greenfield', [[podE('planner') + 2, 8, -125], [310, 8, -125], [310, 8, TR.z], [TR.x - TR.w / 2 - 2, 8, TR.z]], R.files, { color: P.bnbLine, round: 9 });
  // E9: GateRecord's receipts to Greenfield
  // both leave the cube's south-east face, south of the day blocks, and run down its east side
  const seX = CB.x + CB.edge / (2 * Math.SQRT2) + 2, seZ = CB.z + CB.edge / (2 * Math.SQRT2) + 2;
  E('E9', 'gate', 'greenfield', [[seX + 1, 22, seZ + 1], [TR.x + TR.w / 2 + 6, 22, seZ + 1], [TR.x + TR.w / 2 + 6, 22, TR.z - 6], [TR.x + TR.w / 2 + 1, 22, TR.z - 6]], R.thinRoot, { color: P.bnbLine, arrows: [0.6], round: 7 });
  // E10: the files, fetched by anyone, to the verifier
  E('E10', 'greenfield', 'verifier', [[TR.x, 16, TR.z + TR.d / 2 + 2], [TR.x, 16, LS.z - 4]], R.files, { color: P.bnbLine });
  // E11: the root as committed, read from the chain, to the verifier
  E('E11', 'gate', 'verifier', [[seX + 1, 36, seZ + 1], [TR.x + TR.w / 2 + 16, 36, seZ + 1], [TR.x + TR.w / 2 + 16, 36, LS.z], [LS.x + LS.r + 2, LS.y + 6, LS.z]], R.thinRoot, { color: P.bnbLine, round: 9, arrows: [0.5] });
  // E12: verified records along the rail's evidence lane to the arena
  // the two lanes 12 m apart (chapter 05's pair spacing on screen), each turning once, square, into the bowl's north rim,
  // east of its center so that from above (S04) they clear the zone title ARENA AND MARKETS
  const laneE = RL.z + 6, laneP = RL.z - 6, rimZ = AR.z - 60, dropP = AR.x + 12, dropE = AR.x + 26;
  E('E12', 'verifier', 'arena', [[LS.x, LS.y - LS.r - 2, LS.z + 4], [LS.x, 1.8, LS.z + 22], [LS.x, 1.8, laneE], [dropE, 1.8, laneE], [dropE, 1.8, rimZ]], { ...R.strand, core: 1.3, glow: 5 }, { color: P.bnbLine, round: 9, arrows: [0.42] });
  // E13: signed prices and quotes along the price lane
  E('E13a', 'atlas', 'arena', [[AT.x, AT.y - AT.r - 1, laneP], [AT.x, 1.8, laneP], [dropP, 1.8, laneP], [dropP, 1.8, rimZ]], R.strand, { color: P.price, round: 9, arrows: [0.5] });
  E('E13b', 'cmc', 'arena', [[CM.x - 20, 2, laneP], [AT.x + 8, 1.8, laneP]], R.strand, { color: P.price, arrows: [0.5] });
  // E14: the sealed records gate the season's payouts (Flap's vault reads each committer's record on GateRecord) and
  // the launches (OpenFour's graduation waits for the record's evidence); live where those ran on testnet
  E('E14a', 'arena', 'flap', [[AR.x + 58, 2, 190], [CO2.x - CO2.r - 3, 2, 190]], R.strand, { color: P.bnbLine, state: st.flap, arrows: [0.55] });
  E('E14b', 'flap', 'openfour', [[VA.x + VA.s / 2 + 3, 2, 190], [TW.x - 10, 2, 190]], R.strand, { color: P.bnbLine, state: st.openfour, arrows: [0.55] });
  // E15: CMC's screening of every launch (designed)
  E('E15', 'cmc', 'openfour', [[CM.x + 4, 2, CM.z + 6], [CM.x + 4, 2, 200], [TW.x - 10, 2, 204]], R.strand, { color: P.files, state: st.screening });
  // E16: trading tax into the vault, and the vault's payouts to the days sealed before the close (financial: dashed)
  E('E16', 'flap', 'arena', [[VA.x - 2, 2, 232], [AR.x + 58, 2, 232]], R.financial, { color: P.orange, state: st.flap, arrows: [0.5] });
  // E17: one agent hiring another, an ERC-8183 job with escrow (job 1872: the Planner paid the Forecaster for the
  // sealed scenarios, after the seal)
  {
    // from the Planner's back edge into the gap between the rows, along it just over the pods' tops, into the
    // Forecaster's front edge (a straight run: an arc over the pods crossed their glass and their names)
    const zg = (POS.pods.planner[1] - PD.d / 2 + POS.pods.forecaster[1] + PD.d / 2) / 2, yg = podTop + 3.2;
    const path = [[POS.pods.planner[0] - 20, podTop + 0.6, POS.pods.planner[1] - PD.d / 2], [POS.pods.planner[0] - 20, yg, zg], [POS.pods.forecaster[0] + 20, yg, zg],
      [POS.pods.forecaster[0] + 20, podTop + 0.6, POS.pods.forecaster[1] + PD.d / 2]];
    E('E17', 'planner', 'forecaster', path, R.strand, { color: P.bnbLine, state: st.job === 'designed' ? 'designed' : 'live', arrows: [0.5], round: 5, core: 1.3 });
    edges.E17.after = st.job === 'after';
  }
  // E18: the root as committed on BSC testnet, read by the hosted evaluator: it leaves the cube's south-east face over
  // E9 and E11, runs down outside them (18 m east of E11) and drops into the pod's north face. Job 1873's buyer was a
  // one-off wallet with no object here, so the job is on the card, not a strand
  {
    const x = EV.wire, yT = 48, zN = evPodZ - EP.d / 2, yP = padTop + EP.h / 2;
    E('E18', 'gate', 'aws', [[seX + 1, yT, seZ + 1], [x, yT, seZ + 1], [x, yT, zN - 12], [x, yP, zN - 12], [x, yP, zN - 1]], R.thinRoot,
      { color: P.bnbLine, round: 6, arrows: [0.62], state: st.aws === 'designed' ? 'designed' : 'live' });
  }
  // E19: the root as committed, read by the edge Worker before it serves a file: it leaves the cube's north-east face
  // low over the day blocks (clear of the label above the gate), runs east and into the gate from the south
  {
    const neX = CB.x + CB.edge / (2 * Math.SQRT2) + 2, neZ = CB.z - CB.edge / (2 * Math.SQRT2) - 2, yT = 18, yP = egTop + gateH * 0.55;
    E('E19', 'gate', 'cloudflare', [[neX + 1, yT, neZ - 1], [EG.x, yT, neZ - 1], [EG.x, yP, neZ - 1], [EG.x, yP, EG.z + 2]], R.thinRoot,
      { color: P.bnbLine, round: 6, arrows: [0.3], state: 'live' });
  }
  // the late seal's red pulse: one comet on the root's last 180 m, stopping at the cube's reach
  const lateLine = (() => {
    const path = fillet([[podE('planner') + 2, 15, -139], [300, 15, -139], [300, 15, CB.z], [CB.x - reach, 15, CB.z]], 9, 10);
    const V = path.map((p) => new THREE.Vector3(...p));
    let len = 0; for (let i = 1; i < V.length; i++) len += V[i].distanceTo(V[i - 1]);
    // one comet (a period longer than the path), no end fades: it stops dead at the reach, bright
    const bead = comets(path, { color: P.refused, core: 2.8, glow: 10, glowA: 0.55, period: 400, speed: 0, tail: 0.18, renderOrder: 17, reveal: false, fade: [0, 0] });
    flows.add(bead);
    const s = { len, bead, set: (a) => { bead.material.opacity = a; } };
    s.set(0);
    return s;
  })();
  const camR = new THREE.Vector3().setFromMatrixColumn(o.camera.matrixWorld, 0), camU = new THREE.Vector3().setFromMatrixColumn(o.camera.matrixWorld, 1);
  const lateRing = ring(new THREE.Vector3(0, 0, 0), 1, camR, camU, { color: P.refused, width: 1.4, glow: 6, glowA: 0.4, renderOrder: 16 });
  lateRing.position.set(CB.x - reach, 15, CB.z); lateRing.material.opacity = 0; flows.add(lateRing);

  // the shades, one mesh per surface height (the ground, the deck's top), chapter 05's offset toward the camera and
  // feather at this frame's scale
  const shadeGroup = new THREE.Group(); shadeGroup.name = 'shades'; root.add(shadeGroup);
  // a named piece's shades in a mesh of their own (pieceShades), hidden with the piece where the seal's views hide it
  const pieceShades = {};
  {
    const byY = new Map(), byPiece = new Map();
    for (const [poly, y, id] of shades) {
      const at = id ? byPiece : byY, k = id ? `${id}|${y.toFixed(2)}` : y.toFixed(2);
      if (!at.has(k)) at.set(k, []); at.get(k).push(poly);
    }
    for (const [k, polys] of byY) shadeGroup.add(shadeMesh(polys, { dx: 3, dz: 7, feather: 8, opacity: P.shadeA, y: Number(k) }));
    for (const [k, polys] of byPiece) {
      const [id, y] = k.split('|'), mesh = shadeMesh(polys, { dx: 3, dz: 7, feather: 8, opacity: P.shadeA, y: Number(y) });
      mesh.name = `shade:${id}`; shadeGroup.add(mesh); (pieceShades[id] ??= []).push(mesh);
    }
    // the evaluator's pad: its own shade, so it dims and hides with the piece (S02's crop leaves it out)
    const evShade = shadeMesh([rectPoly(EV.x, EV.z, EV.w, EV.d, EV.r)], { dx: 3, dz: 7, feather: 8, opacity: P.shadeA, y: 0.06 });
    shadeGroup.add(evShade); dimmable('aws', evShade.material);
  }

  // every line at its CSS widths
  return {
    root, solids, marks, flows, pieces, edges, states: st, cube, cubeMat, aimCube, aimLens, lensG, rim, setTiles, tiles, blocks, brainMark, brainInset,
    sphere, dishG, coinG, lateLine, lateRing, scanLine, plane, reach, beadP, dTop, fleetMapped: fleet.length,
    counts, tileLeaf: leafAt, pickers, halos, pools, shades: shadeGroup, pieceShades, palette: P, theme,
    /** Pose at time t: comets, the turning marks and the scan, as pure functions of t. */
    pose(t, camPos) {
      tickPulses(flows, t);
      if (brainMark) brainMark.rotation.y = Math.sin(t * 0.14) * 0.32;
      if (brainInset) { brainInset.group.rotation.y = INSET_YAW + Math.sin(t * 0.14) * 0.32; brainInset.setTime(t); }
      coinG.rotation.y = -0.42 + Math.sin(t * 0.17) * 0.12;
      const sweep = (t % 2) / 2; scanLine.position.y = 2 + sweep * (POS.cmc.h - 4); scanLine.material.opacity = 0.8 * Math.sin(Math.PI * sweep);
      if (camPos) aimLens(camPos);
    },
  };
}
