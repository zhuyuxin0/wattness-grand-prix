// @ts-nocheck
// The brain station: Living Brain as it holds our three brains, drawn in Living Brain's own visual language from what
// its API returned (brain-scene.json). One world on one clock (clock.ts); each frame is that world at a moment. The
// story plays brain.sequence through its keys; the lab's moment frames pose the same world at fixed seconds.
// brain.interface is Living Brain's own interface, a recording played on the overlay; brain.calibrate is the
// calibration pose (SPEC 3.4) with no words.
import type { FrameContext, FrameHandle, StationModule } from '../types';
import { BrainWorld, restPose, REST, type WorldPose } from './world';
import { FilmClock, T, T_SHARED, acrossLanded, COUNTS, type Moments } from './clock';
import { BrainBloomPass } from './bloom';
import { Chrome, memberScreen, memberScreenAt, projectorFor, projectorNow, restCamera, type TagSpec } from './tags';
import { SCENE, BRAINS, BRAIN_IDS, brainOf, linksOf, acrossOf, fmt, page, scopeLine, type BrainId } from './data';
import { assignLayers } from '../../lib/stage';
import { interfaceFrame, HAS_RECORDING } from './interface';
import { inFilm } from '../../lib/yours';

/** What is data and what is design, for every frame's note. */
const NOTE_DATA = `Data, from brain-scene.json (made by make-scene-data.py from build-brain.json, sha256 ${SCENE.source.sha256.slice(0, 12)}…, read ${SCENE.source.read.ct}, across links read ${SCENE.source.crossChecked.ct}): which brains and their colors (Living Brain's member order), every page dot with its number (its place in Living Brain's node order in its own brain) and title, every connection and its strength (similarity), the ${SCENE.combined.across} connections across brains and when each was made, the conflict, the counts.`;
const NOTE_DESIGN = 'Design, as in Living Brain, encoding nothing: the brain shape (our own field, shape.ts), the particles and where they sit, the core, the motes, the filaments, the orbit lights, the camera and the motion.';

/** The beats' lines (SPEC 4.1), with their figures read from the data. */
export function lineFor(row: string): string {
  const gp = brainOf('grand-prix'), tm = brainOf('terminal'), rv = brainOf('battery-review');
  const bt = page('grand-prix', 'battery-tab')!;
  const btAcross = acrossOf('grand-prix', 'battery-tab');
  const strongAcross = btAcross.filter((x) => x.x.strength === 'strong').length;
  const pair = (a: string, b: string) => COUNTS.pairs[[a, b].sort().join('|')] ?? 0;
  switch (row) {
    case 'LB1': return `Living Brain holds three of our brains: the Grand Prix build, ${gp.pages} pages; the Wattness Terminal, ${tm.pages}; Desert Willow's review, ${rv.pages}.`;
    case 'LB2': return `Combined into one team brain of ${COUNTS.pages} pages. Each brain keeps its own.`;
    case 'LB3': return `Living Brain linked them: ${COUNTS.across} connections across brains, ${pair('grand-prix', 'terminal')} build to Terminal, ${pair('grand-prix', 'battery-review')} build to review. One conflict flagged: two counts, and both hold.`;
    case 'LB4': return `Inside the Grand Prix brain: ${gp.notes} build notes, compiled into ${gp.pages} pages and ${gp.connections} connections, ${gp.strong} of them strong.`;
    case 'LB5': return `Page ${String(bt.n).padStart(2, '0')}, ${bt.title}: what the Battery tab shows, linked to ${bt.connections} pages in its brain.`;
    case 'LB6': return `Across brains it links to the Terminal's Battery Page and to Desert Willow's review: ${btAcross.length} more, ${strongAcross} of them strong.`;
    // film.json's LB7 wording, its times from the frame data (none without it)
    case 'LB7': {
      if (!SCENE_LB) return '';
      const hm = (s: string) => s.slice(0, 5);
      // the cutoff check is a read run afterwards, as of the plan's cutoff: the plan itself read no memory
      return `Remember: at ${hm(SCENE_LB.compiled)} CT, Desert Willow's hedge review went into its brain. Retrieve: a fresh session's answer now cites that page. A read as of the plan's ${hm(SCENE_LB.cutoff)} CT cutoff admits ${SCENE_LB.admitted ? `${SCENE_LB.admitted} ${SCENE_LB.admitted === 1 ? 'page' : 'pages'}` : 'nothing'}, and the plan read no memory.`;
    }
    default: return '';
  }
}

interface Look { film: boolean; tags: boolean; words: boolean }

/** Builds the brain world into the stage and returns the handle for a moment (or the whole clock). */
async function brainFrame(ctx: FrameContext, time: number, o: { caption?: string; row?: string; line?: string; calibrate?: boolean; view?: { az: number; el: number }; look?: Partial<Look>; moments?: Moments; at?: (local: number) => number } = {}): Promise<FrameHandle> {
  const st = ctx.stage, W = ctx.width, H = ctx.height;
  const look: Look = { film: true, tags: !o.calibrate, words: !o.calibrate, ...(o.look ?? {}) };
  // a black stage, nothing lit: everything in the brain is emissive and additive
  st.setBackdrop({ top: '#000102', horizon: '#000102', bottom: '#000102', glow: '#000102', ground: '#000102' });
  st.ground.visible = false; st.catcher.visible = false;
  st.scene.fog = null;
  st.setAOStrength(0);
  st.setShadowAuto(false);
  const world = new BrainWorld();
  world.setAspect(W / H);
  assignLayers(world.root);
  st.scene.add(world.root);
  const bloom = new BrainBloomPass(Math.round(W * ctx.dpr), Math.round(H * ctx.dpr));
  st.composer.insertPass(bloom, st.composer.passes.length - 1);
  const clock = new FilmClock(world, o.moments);
  const chrome = new Chrome(ctx.overlay, look.film);
  const size = { width: W, height: H };
  const restCam = restCamera(W / H);
  const pose = (t: number): WorldPose => (o.calibrate ? calibratePose(clock, t, o.view) : clock.pose(t));
  let now = o.at ? o.at(time) : time;

  const lay = (useStage: boolean) => {
    const p = world.pose;
    if (!p || !look.words) { chrome.scope(null); chrome.hud(null); return; }
    const project = useStage ? projectorNow(world, size, st.camera) : projectorFor(world, p, size);
    const w = words(now, clock, world);
    // overlap: Living Brain's rule every 0.15 s, in number order, eased between two checks so a tag never pops; the
    // member brains' tags take part, the farther member's giving way
    const q = Math.floor(now / 0.15) * 0.15, f = Math.min(1, (now - q) / 0.15);
    const kept = (tq: number) => {
      const P = pose(tq), wq = words(tq, clock, world);
      return chrome.keptAt(look.tags ? wq.tags : [], projectorFor(world, P, size), BRAIN_IDS.map((b) => ({ b, ms: memberScreenAt(P, b, size), k: wq.members[b] })));
    };
    const k1 = kept(q), k0 = kept(q - 0.15);
    const shown = (id: string) => (k0.has(id) ? 1 - f : 0) + (k1.has(id) ? f : 0);
    chrome.tags(look.tags ? w.tags : [], project, shown, p.cam.dist);
    for (const b of BRAIN_IDS) {
      const cam = useStage ? st.camera : restCam;
      const ms = memberScreen(world, b, cam, size);
      chrome.member(b, { name: ms.name, detail: ms.detail, center: ms.center }, { name: w.members[b].name * shown(`mn:${b}`), detail: w.members[b].detail * shown(`md:${b}`) });
    }
    chrome.hud(w.hud);
    chrome.scope(scopeLine(inFilm(ctx.overlay)));
    const card = w.card;
    if (card) {
      const s = project(card.cloud, card.index);
      chrome.card({ page: card.page, color: brainOf(card.page.brain).color, meta: card.meta, summary: card.page.summary }, s.behind ? null : s, card.k, size);
    } else chrome.card(null, null, 0, size);
    // the review's plates stand in the frame's free corners, clear of the caption (the dot may sit anywhere on the brain)
    for (const pl of w.plates) chrome.plate(pl.id, pl.cls, pl.rows, { x: pl.fx * W, y: pl.fy * H }, pl.k);
    if (w.ring) { const s = project('battery-review', 0); chrome.ring(s.behind ? null : s, w.ring.r * chrome.k, w.ring.k, w.ring.label); } else chrome.ring(null, 0, 0, '');
  };

  return {
    time,
    note: o.calibrate
      ? `Calibration pose (SPEC 3.4): the Grand Prix brain alone, formed, camera at Living Brain's distance 2.08 on a 37 degree lens, no words. ${NOTE_DESIGN}`
      : `Our rendering of our data in Living Brain's visual language, not Living Brain's interface. ${NOTE_DATA} ${NOTE_DESIGN} The scope line names the source.`,
    update(t) {
      // the frame's local time on the clock (a stand-in frame maps its own clock onto the moment it shows)
      now = o.at ? o.at(t) : t;
      st.setCamera(restPose());
      st.camera.updateMatrixWorld();
      world.apply(pose(now), { height: H, dpr: ctx.dpr }, st.camera);
      lay(false);
    },
    decorate() {
      // laid out again against the camera the frame is drawn with (a leg of the story moves it)
      lay(true);
      if (o.caption && look.words) ctx.plates.caption({ head: o.caption, line: o.line ?? (o.row ? lineFor(o.row) : undefined) });
    },
    dispose() { chrome.dispose(); world.dispose(); },
  };
}

/** The calibration pose: the Grand Prix brain alone at the center, formed, at Living Brain's distance. */
function calibratePose(clock: FilmClock, t: number, view: { az: number; el: number } = { az: REST.az, el: REST.el }): WorldPose {
  const p = clock.pose(T.lb4);
  p.time = t;
  // the spin held at the lb4 rest's, so the views below are the brain's own sides
  for (const b of BRAIN_IDS) p.members[b].yaw = 0;
  p.cam = { target: p.cam.target.set(0, 0, 0), az: view.az, el: view.el, dist: REST.dist };
  for (const b of BRAIN_IDS) if (b !== 'grand-prix') { p.members[b].st.bright = 0; p.members[b].st.pageFade = 0; }
  p.members['grand-prix'].st.time = t;
  p.center.st.bright = 0; p.center.st.pageFade = 0; p.center.st.extraFade = 0;
  p.filaments = 0; p.orbs = 0; p.sparks = null; p.landing = null; p.links = null; p.review = null;
  return p;
}

/** The words at t: which tags, the members' name tags, the HUD, the card, the review's plates. */
function words(t: number, clock: FilmClock, world: BrainWorld) {
  const T = clock.T;
  const smooth = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
  const seg = (a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const tags: TagSpec[] = [];
  const members = {} as Record<BrainId, { name: number; detail: number }>;
  const dist = clock.camDist(t);
  const zoom = smooth((dist - 2.15) / (3.1 - 2.15));
  const inDive = seg(T.dive[0], T.dive[0] + 0.8);
  for (const b of BRAIN_IDS) {
    const main = (b === 'grand-prix' && t >= T.dive[0] && t < T.fly[1]) || (b === 'battery-review' && t >= T.fly[0]);
    const k = smooth(seg(T.form[0] + 2.9, T.form[0] + 3.6)) * (main ? 1 - smooth(seg(main && b === 'grand-prix' ? T.dive[0] : T.fly[0], (b === 'grand-prix' ? T.dive[0] : T.fly[0]) + 0.6)) : zoom);
    const kk = k < 0.2 ? k * smooth(k / 0.2) : k;
    members[b] = { name: kk, detail: kk };
  }
  // the combined view's tags: the pages most connected in their own brain and across, colored by their brain
  if (t >= T.combine[0] + 2.9 && t < T.dive[0] + 1.2) {
    const base = smooth(seg(T.combine[0] + 2.9, T.combine[0] + 3.6)) * (1 - inDive);
    world.centerPages.map((p, i) => ({ p, i, w: p.connections + 2 * p.across }))
      .sort((a, b) => b.w - a.w).slice(0, 28)
      .forEach(({ p, i }, r) => {
        const conflict = t >= T.conflict && SCENE.conflicts.some((c) => (c.a.brain === p.brain && c.a.slug === p.slug) || (c.b.brain === p.brain && c.b.slug === p.slug));
        tags.push({ id: `c:${p.brain}/${p.slug}`, cloud: 'center', index: i, page: p, color: brainOf(p.brain).color, k: base, order: r, view: 'combined', conflict, hot: conflict });
      });
    if (t >= T.conflict) for (const c of SCENE.conflicts) for (const e of [c.a, c.b]) {
      const id = `c:${e.brain}/${e.slug}`;
      const i = world.centerIndex.get(`${e.brain}/${e.slug}`);
      if (i == null) continue;
      const k = smooth(seg(T.conflict, T.conflict + 0.5)) * (1 - inDive);
      const old = tags.findIndex((x) => x.id === id);
      const spec = { id, cloud: 'center' as const, index: i, page: world.centerPages[i]!, color: brainOf(e.brain).color, k, order: -5, view: 'combined' as const, conflict: true, hot: true };
      if (old >= 0) tags[old] = spec; else tags.push(spec);
    }
  }
  // the Grand Prix brain's own: 01 to 28 as the dive lands, then 29 to 42 (OpenFour, BNB Smart Chain, Agent and Pool
  // Launch Portal among them); in LB5 and LB6 also the pages Battery Tab links to
  if (t >= T.tags[0] && t < T.fly[1]) {
    const gp = world.memberPages['grand-prix'];
    const out = 1 - smooth(seg(T.fly[0], T.fly[0] + 0.8));
    const linked = new Set(t >= T.wipe[0] ? linksOf('grand-prix', 'battery-tab').map((x) => x.other.slug) : []);
    gp.forEach((p, i) => {
      if (p.n > 42 && !linked.has(p.slug)) return;
      const start = p.n <= 28 ? T.tags[0] + (p.n - 1) * 0.05 : p.n <= 42 ? T.tags[1] + (p.n - 29) * 0.05 : T.wipe[0] + 0.4;
      const k = smooth((t - start) / 0.7) * out;
      const sel = p.slug === 'battery-tab' && t >= T.wipe[0];
      tags.push({ id: `g:${p.slug}`, cloud: 'grand-prix', index: i, page: p, color: '#b59aff', k, order: sel ? -1 : p.n, sel, hot: linked.has(p.slug) && t >= T.wipe[0] + 0.6 });
    });
  }
  // LB6: the five pages across, lit as each link lands
  if (t >= T.across[0] && t < T.fly[0] + 0.6) {
    world.linkEnds.forEach((e, i) => {
      const p = world.memberPages[e.brain][e.index]!;
      const k = smooth((t - T.across[0] - i * 0.25 - 0.45) / 0.35) * (1 - smooth(seg(T.fly[0], T.fly[0] + 0.6)));
      tags.push({ id: `x:${e.brain}/${p.slug}`, cloud: e.brain, index: e.index, page: p, color: brainOf(e.brain).color, k, order: -2 + i * 0.01, hot: true });
    });
  }
  // LB7: the review's one page
  if (t >= T.fly[0] + 1.2) {
    const p = world.memberPages['battery-review'][0]!;
    const lit = t >= T.remember + 0.8 && t < T.cutoff + 1.2;
    tags.push({ id: 'r:review', cloud: 'battery-review', index: 0, page: p, color: brainOf('battery-review').color, k: smooth(seg(T.fly[0] + 1.2, T.fly[0] + 1.8)), order: -3, sel: lit });
  }

  // the HUD
  const gp = brainOf('grand-prix'), rv = brainOf('battery-review');
  let hud: { n: string; label: string; tone?: 'em' | 'rose' }[][] | null = null;
  if (t < T.combine[0] + 1.0) hud = [[{ n: String(BRAINS.length), label: 'brains' }, { n: fmt(COUNTS.pages), label: 'pages' }]];
  else if (t < T.first[0]) hud = [[{ n: fmt(COUNTS.pages), label: 'pages' }, { n: '1', label: 'team brain' }]];
  else if (t < T.dive[0] + 1.0) {
    const landed = acrossLanded(world, (t - T.first[0]) * T.landing);
    const done = landed >= COUNTS.across && t >= T.find[1];
    const rows: { n: string; label: string; tone?: 'em' | 'rose' }[][] = [[{ n: fmt(COUNTS.pages), label: 'pages' }, { n: String(landed), label: 'across brains' }]];
    if (done) rows.push([{ n: String(COUNTS.pairs['grand-prix|terminal'] ?? 0), label: 'build–Terminal' }, { n: String(COUNTS.pairs['battery-review|grand-prix'] ?? 0), label: 'build–review' }]);
    if (t >= T.conflict) rows.push([{ n: String(COUNTS.conflicts), label: 'conflict', tone: 'rose' }]);
    hud = rows;
  } else if (t < T.fly[0] + 1.0) hud = [[{ n: String(gp.pages), label: 'pages' }, { n: String(gp.connections), label: 'connections' }, { n: String(gp.strong), label: 'strong', tone: 'em' }]];
  else hud = [[{ n: String(rv.pages), label: rv.pages === 1 ? 'page' : 'pages' }, { n: String(rv.connections), label: 'connections' }]];

  // LB5's card, beside Battery Tab's tag
  let card = null;
  if (t >= T.card && t < T.pull[0] + 0.8) {
    const bt = page('grand-prix', 'battery-tab')!;
    const k = smooth((t - T.card) / 0.22) * (1 - smooth(seg(T.pull[0], T.pull[0] + 0.5)));
    card = { cloud: 'grand-prix' as const, index: world.batteryIndex, page: bt, k, meta: `Page ${String(bt.n).padStart(2, '0')} · ${bt.connections} connections` };
  }

  // LB7's plates, in turn; each stays as the next comes
  const plates: { id: string; cls: string; rows: { k?: string; v?: string; s?: string; was?: string }[]; fx: number; fy: number; k: number }[] = [];
  let ring = null;
  if (t >= T.remember && SCENE_LB) {
    const lb = SCENE_LB;
    plates.push({ id: 'remember', cls: 'is-remember', fx: 0.06, fy: 0.2, k: smooth(seg(T.remember + 0.8, T.remember + 1.2)),
      rows: [{ k: 'Remember' }, { v: `Version ${lb.version} · ${lb.compiled}` }, { s: 'Desert Willow’s hedge review, captured into its own brain' }] });
    if (t >= T.retrieve) plates.push({ id: 'retrieve', cls: 'is-retrieve', fx: 0.7, fy: 0.2, k: smooth(seg(T.retrieve + 0.7, T.retrieve + 1.1)),
      rows: [{ k: 'Retrieve' }, { s: `Before: needs a supported review · ${lb.beforeCitations} citations` }, { v: `After: assumed-entry scenario · ${lb.afterCitations} citation` }] });
    if (t >= T.cutoff) {
      plates.push({ id: 'cutoff', cls: 'is-cutoff', fx: 0.7, fy: 0.52, k: smooth(seg(T.cutoff + 0.9, T.cutoff + 1.3)),
        rows: [{ k: `A read as of the plan’s cutoff, ${lb.cutoff}` }, { v: `${lb.admitted} ${lb.admitted === 1 ? 'page' : 'pages'} admitted` }, { s: `The review came in at ${lb.compiled}; the plan read no memory` }] });
      const e = smooth(seg(T.cutoff, T.cutoff + 1.4));
      ring = { r: 260 - 214 * e, k: smooth(seg(T.cutoff, T.cutoff + 0.3)), label: lb.cutoff };
    }
  }
  return { tags, members, hud, card, plates, ring };
}

/** The review's figures, from the frame data (sponsors.living_brain), set once a frame has the data; without it the
 *  review's plates and LB7's line are not drawn (no typed fallback). */
let SCENE_LB: { version: number; compiled: string; beforeCitations: number; afterCitations: number; cutoff: string; admitted: number } | null = null;
function readReview(ctx: FrameContext) {
  const lb = ctx.data?.sponsors?.living_brain;
  if (!lb) return;
  const ct = (s: string) => { const m = /^\d{4}-(\d{2})-(\d{2}) (\d{2}:\d{2}:\d{2}) CT$/.exec(s); return m ? { time: `${m[3]} CT`, date: `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[1]) - 1]} ${Number(m[2])}` } : { time: s, date: '' }; };
  const c = ct(lb.citation.available.ct), k = ct(lb.plan_time_cutoff_check.cutoff.ct);
  SCENE_LB = { version: lb.page.version, compiled: `${c.time}, ${c.date}`, beforeCitations: lb.before.citations, afterCitations: lb.after.citations, cutoff: k.time, admitted: lb.plan_time_cutoff_check.pages_admitted };
}

const moment = (time: number, row: string, caption: string) => async (ctx: FrameContext) => { readReview(ctx); return brainFrame(ctx, time, { caption, row }); };

export const frames: StationModule['frames'] = {
  // the film's frame: the whole clock; the story's keys rest on it at their local times
  'brain.sequence': async (ctx) => { readReview(ctx); return brainFrame(ctx, T.lb3, { caption: 'Memory', row: 'LB3' }); },
  'brain.three': moment(T.lb1, 'LB1', 'Three brains'),
  'brain.combined': moment(T.lb2, 'LB2', 'One team brain'),
  'brain.links': moment(T.lb3, 'LB3', 'Connections across brains'),
  'brain.grand-prix': moment(T.lb4, 'LB4', 'The Grand Prix brain'),
  'brain.page': moment(T.lb5, 'LB5', 'One page'),
  'brain.across': moment(T.lb6, 'LB6', 'Across brains'),
  'brain.review': moment(T.lb7, 'LB7', 'Remember and retrieve'),
  // the master's and the 90-second cut's beat: the combined brain on a short clock of its own (moments.ts T_SHARED)
  // its line says when the brains were written and who wrote them: after the seal, by the build and the review; no plan
  // reads them (the site's stop stands after the weather odds; the films' rows say it too)
  'brain.shared': async (ctx) => { readReview(ctx); return brainFrame(ctx, T_SHARED.lb3, { caption: 'Memory', moments: T_SHARED, line: `Living Brain holds our three brains: ${fmt(COUNTS.pages)} pages, ${COUNTS.across} connections across them, written after the seal by the build and Desert Willow's review. No plan reads them.` }); },
  'brain.calibrate': async (ctx) => brainFrame(ctx, 31.0, { calibrate: true }),
  // the silhouette checks (SPEC 7.3): the same brain from its left side and from the front, level
  'brain.calibrate-side': async (ctx) => brainFrame(ctx, 31.0, { calibrate: true, view: { az: 270, el: 0 } }),
  'brain.calibrate-front': async (ctx) => brainFrame(ctx, 31.0, { calibrate: true, view: { az: 180, el: 0 } }),
  // Living Brain's own interface, played from its recording. A checkout without the recording (it is kept out of git)
  // draws LB5's moment instead, our rendering under its scope line, never a black frame; its local time (the
  // recording's, rest 6.5) holds round LB5's rest. capture-story.mjs refuses a film that needs the recording here.
  'brain.interface': async (ctx) => {
    if (HAS_RECORDING) return interfaceFrame(ctx);
    readReview(ctx);
    const hold = (t: number) => Math.min(T.pull[0] - 0.2, Math.max(T.card + 1, T.lb5 + (t - 6.5) * 0.5));
    return brainFrame(ctx, 6.5, { caption: 'One page', row: 'LB5', at: hold });
  },
};
