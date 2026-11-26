// @ts-nocheck
// The garage's figures, read from frame-data.json (ctx.data) and the station's own files.json (the sealed leaf's
// input files, derived from out/od-20261126/leaves/DSWL_ESS_ESR1.json; its sha256 is recorded inside). Money in the
// data is integer micro-USD; everything here is dollars.
import files from './files.json';

export const ARMS = ['A', 'B', 'C'] as const;
export const usd = (u: number) => u / 1e6;

/** An arm's hours on the walkthrough's terms: the physical leg's mean over the scenarios plus its wear (the ground),
 *  the hedge's locked value (contracts x the assumed entry, sells positive: the glass), and the hour's fee. */
export function armHours(d, arm) {
  const r = d.game.results[arm], a = d.showcase.arms[arm], entry = d.showcase.instrument.entry_cents;
  const n = r.physical_uusd.length;
  const out = [];
  for (let h = 0; h < 24; h++) {
    let phys = 0, hedge = 0;
    for (let k = 0; k < n; k++) { phys += r.physical_uusd[k][h]; hedge += r.hedge_uusd[k][h]; }
    phys /= n; hedge /= n;
    const q = a.contracts[h];
    out.push({
      he: h + 1,
      kw: a.kw[h],
      ground: usd(phys + r.wear_uusd[h]),
      expected: usd(phys + hedge + r.wear_uusd[h] + r.fee_uusd[h]),
      glass: q ? q * (entry[h] / 100) : null,
      contracts: q,
      cover: a.hedge_cover[h],
      soc: a.soc_pct[h],
    });
  }
  return out;
}

/** Each scenario's total for an arm, dollars, and the worst tenth's members (the CVaR tail, worst first). */
export function armTotals(d, arm) {
  const r = d.game.results[arm];
  const totals = r.total_uusd.map(usd);
  const tail = new Map(r.tail.members.map((m) => [m.k, m.weight_ppm / 1e6]));
  return { totals, tail, stats: r.stats_uusd };
}

/** The file wall's tiles: group 0 the release's files, 1 the Terminal API's, 2 the live runs; first byte of SHA-256. */
export function fileTiles() {
  const g = files.groups, b = files.first_byte;
  return { tiles: Array.from(g, (c, i) => ({ group: Number(c), byte: b[i] })), counts: files.counts, source: files.source };
}

// Pages of the Terminal brain (brain_graph.pages) tied to the part of terminal_structure each describes; the
// "Wattness Terminal" page is the whole and ties to no single part.
export const PAGE_PART = {
  'wattness-terminal-shared-fleet-view': 'state:fleet',
  'wattness-terminal-battery-page': 'pane:fesr',
  'month-close': 'pane:fmon',
  qses: 'pane:fqse',
  'my-battery': 'workspace:my-battery',
  'wattness-terminal-fleet': 'workspace:fleet',
  'fleet-board-reader': 'reader:fbd',
  'pane-display-settings': 'state:panes',
  'fleet-board': 'pane:fbd',
  'qses-reader': 'reader:fqse',
  'cached-disclosure': 'source:fleet',
  'battery-page-reader': 'reader:fesr',
  'shared-section-projections': 'reader:fmon',
  'fleet-reference': 'source:fleet',
  'mapped-locations': 'source:geo',
  'battery-focus': 'state:focus',
  ness: 'ness:routes',
};

/** Pages placed by similarity: a spring layout on the generated connections (rest length shorter the more similar),
 *  every page repelling every other, a weak pull to the box's middle line, kept inside the box; deterministic (a
 *  seeded start along the box, fixed iterations, a cooling step). Distances are meters in the box. Returns slug ->
 *  [x, z]. */
export function layoutPages(pages, connections, box, seed = 0x2f6b3a1d) {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const W = box.x1 - box.x0, D = box.z1 - box.z0, cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2;
  const P = pages.map(() => [box.x0 + rnd() * W, box.z0 + rnd() * D]);
  const idx = new Map(pages.map((p, i) => [p.slug, i]));
  const E = connections.map((c) => ({ a: idx.get(c.a), b: idx.get(c.b), sim: c.similarity })).filter((e) => e.a != null && e.b != null);
  const lo = Math.min(...E.map((e) => e.sim)), hi = Math.max(...E.map((e) => e.sim));
  const unit = Math.sqrt((W * D) / pages.length);
  const rest = (sim) => unit * (1.5 - 1.0 * (sim - lo) / Math.max(1e-6, hi - lo));
  const N = 1200;
  for (let it = 0; it < N; it++) {
    const F = P.map(() => [0, 0]);
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const dx = P[i][0] - P[j][0], dz = (P[i][1] - P[j][1]) * 1.6, d2 = Math.max(1, dx * dx + dz * dz), d = Math.sqrt(d2);
      const f = (unit * unit) / d2 * 0.9;
      F[i][0] += (dx / d) * f; F[i][1] += (dz / d) * f; F[j][0] -= (dx / d) * f; F[j][1] -= (dz / d) * f;
    }
    for (const e of E) {
      const a = P[e.a], b = P[e.b], dx = b[0] - a[0], dz = b[1] - a[1], d = Math.max(0.01, Math.hypot(dx, dz));
      const f = (d - rest(e.sim)) * 0.12;
      F[e.a][0] += (dx / d) * f; F[e.a][1] += (dz / d) * f; F[e.b][0] -= (dx / d) * f; F[e.b][1] -= (dz / d) * f;
    }
    const step = unit * (0.5 * (1 - it / N) + 0.02);
    for (let i = 0; i < P.length; i++) {
      F[i][0] += (cx - P[i][0]) * 0.02; F[i][1] += (cz - P[i][1]) * 0.05;
      const m = Math.hypot(F[i][0], F[i][1]), c = Math.min(m, step);
      if (m > 1e-9) { P[i][0] += (F[i][0] / m) * c; P[i][1] += (F[i][1] / m) * c; }
      P[i][0] = Math.max(box.x0, Math.min(box.x1, P[i][0])); P[i][1] = Math.max(box.z0, Math.min(box.z1, P[i][1]));
    }
  }
  return new Map(pages.map((p, i) => [p.slug, P[i]]));
}

/** "$3,746.80"; minus as the sign. */
export const money = (v: number, cents = true) => {
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  return `${v < 0 ? '−' : ''}$${s}`;
};
