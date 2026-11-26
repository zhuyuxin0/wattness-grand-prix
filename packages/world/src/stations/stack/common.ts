// @ts-nocheck
// What the stack's stills (index.ts) and its live mount (mount.ts) share: the night look, the camera's fit, the pieces'
// labels and where they sit, the zone titles' row, the "after the seal" ticks and the key card's rows.
import { THREE, fitCamera } from './kit';
import { boundsPoints, POS, ZONES, PAL } from './space';
import { labels, POD_IDS } from './pieces';

export const ISO = (Math.atan(1 / Math.SQRT2) * 180) / Math.PI;   // 35.26 degrees: the true isometric down-angle
export const NIGHT = {
  backdrop: { top: '#101315', horizon: '#1f2429', bottom: '#14171a', glow: '#2b3036', ground: '#14171a' },
  light: { key: { color: '#93a8d4', intensity: 0.32 }, rim: { color: '#7f95c0', intensity: 0.22 }, fill: { sky: '#46597d', ground: '#15130f', intensity: 0.42 }, env: 0.06, shadow: 0.3 },
};

/** The stage's look for the stack: the venue's night (dark) or the kit's own light stage, the ground, the key light's
 *  shadow box, the fade, the occlusion. seal: the closer framing of S02. */
export function stageLook(stage, theme, { seal = false } = {}) {
  if (theme === 'light') { stage.setBackdrop(null); stage.setLight(null); } else { stage.setBackdrop(NIGHT.backdrop); stage.setLight(NIGHT.light); }
  stage.setGround(PAL[theme].ground);
  stage.setKey({ az: 150, el: 46, center: seal ? [300, 20, -120] : [0, 30, -20], radius: seal ? 260 : 560 });
  stage.setFade({ center: [0.46, 0.44], screen: [0.62, 1.25], world: [760, 1500], worldCenter: [0, 0], glow: [0.5, 0.42] });
  stage.setAO({ radius: seal ? 1.4 : 2.5, scale: 1, thickness: 2, samples: 16 });
  stage.setAOStrength(0.7);
}

/** S01's camera: azimuth 180, the true isometric down-angle, a 5 degree lens, fitted to every object in rect. */
export function fitRest(stage, W, H, rect = { x0: 0.045, x1: 0.85, y0: 0.10, y1: 0.735 }) {
  return fitCamera(stage, W, H, boundsPoints(), { az: 180, el: ISO, vfov: 5, rect });
}

/** Where each label sits beside its piece. */
export const ALIGN = {
  terminal: 'above', brain: 'right', greenfield: 'right', ercot: 'left', cournot: 'left', gate: 'above', studio: 'right', verifier: 'left', aws: 'below', cloudflare: 'above',
  forecaster: 'inside', state: 'inside', market: 'inside', hedger: 'inside', risk: 'inside', planner: 'inside',
};

/** The labels' items at the current camera: { id, x, y, plain, name, align, cls }. skip: ids left out. */
export function labelItems(space, d, project, skip = new Set()) {
  const L = labels(d), out = [];
  const ghost = (id) => space.states[id] === 'designed';
  for (const [id, lab] of Object.entries(L)) {
    if (skip.has(id)) continue;
    const at = space.pieces[id]?.at; if (!at) continue;
    const p = project(at); if (!p) continue;
    const pod = POD_IDS.includes(id);
    out.push({ id, x: p.x, y: p.y, plain: lab.plain, name: lab.name, align: ALIGN[id] ?? 'below', cls: [pod ? 'stk-pod' : '', ghost(id) ? 'stk-ghost' : ''].filter(Boolean).join(' ') });
  }
  return out;
}

/** The zone titles in one band over the space (y: the band's px), the front row's at its corner. */
export function zoneItems(project, band = 66) {
  return ZONES.map((zn) => { const p = project(zn.at); return p ? { text: zn.text, x: p.x, y: zn.id === 'arena' ? p.y : band } : null; }).filter(Boolean);
}

/** "after the seal" on the strands that ran after the sealed plan's stamp. */
export function afterItems(space) {
  const out = [];
  const E = space.edges;
  if (E.E3?.after) out.push({ at: E.E3.at(E.E3.len * 0.16).p.toArray(), text: 'read after the seal', align: 'above' });
  if (E.E5u?.after) out.push({ at: [POS.brain.x + POS.brain.r * 0.78, POS.brain.y - POS.brain.r * 0.62, POS.brain.z], text: 'read after the seal', align: 'right' });
  if (E.E17?.after) out.push({ at: [POS.pods.state[0] + 6, POS.pod.y + POS.pod.h + 3.2, (POS.pods.planner[1] + POS.pods.forecaster[1]) / 2], text: 'paid job, after the seal', align: 'above' });
  return out;
}

/** The key card's rows (STACK.md section 4), plain words first. */
export function keyRows(P) {
  return [
    { kind: 'comets', color: P.price, width: 1.8, text: "Prices: ERCOT's nodes and hubs; BNB and USDT" },
    { glow: 5, color: P.files, width: 1.5, text: 'Files and odds' },
    { kind: 'pair', color: P.memory, text: 'Memory, written and cited' },
    { color: P.teal, width: 1.6, glow: 5, arrow: true, text: "Physical: the battery's schedule" },
    { color: P.orange, width: 1.6, dash: '3.4 2.4', arrow: true, text: 'Financial: hedge terms and tokens' },
    { glow: 6, color: P.bnb, width: 1.8, text: 'Sealed: the root, the files, checked records' },
    { kind: 'designed', color: P.files, text: 'Designed for the season' },
  ];
}

/** A piece's box on screen (stage px), from its pick shapes' corners. */
export function screenBox(space, id, project) {
  const p = space.pieces[id]; if (!p?.picks?.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const v = new THREE.Vector3(), box = new THREE.Box3();
  for (const mesh of p.picks) {
    mesh.geometry.computeBoundingBox(); box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      const q = project(v.toArray()); if (!q) continue;
      x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}
