// @ts-nocheck
// The stack's pieces in words, one table that the frames' labels, the hover cards and the site's routes all read.
// Each piece has a label (its plain meaning first, its name second and smaller: Jo, 26 Nov: "plain words first, the
// flavor second"), a card (a plain kind, its role, and its real integration: endpoints, contracts and transactions),
// and the site tab that shows it. Every figure comes from frame-data.json (`d`), the Greenfield record beside this
// file (`GF`) or the integrations record beside it (`TN`: the sponsor flows on BSC testnet, read back on a public RPC).
import { GLYPHS } from './glyphs';

/** The Grand Prix site's tab for each piece (site/src/shell/tabs.ts ids; prices, season, launchpad and agents are the
 *  Markets and Agents tabs the redesign adds). Agent Studio and the hosted agents (AgentCore) go to agents, which the
 *  site maps to its Agent IDs tab (WORLD_TABS); that page names the evaluator hosted on AgentCore. The edge Worker on
 *  Cloudflare serves the sealed files, so it opens Files. A click calls onRoute with it. */
export const ROUTES = {
  ercot: 'fleet', terminal: 'about', cournot: 'risk', electronx: 'hedge', studio: 'agents', aws: 'agents',
  forecaster: 'forecast', state: 'state', market: 'forecast', hedger: 'hedge', risk: 'risk', planner: 'battery',
  brain: 'memory', gate: 'seal', greenfield: 'files', verifier: 'verify', cloudflare: 'files',
  atlas: 'prices', cmc: 'prices', arena: 'add-agent', flap: 'season', openfour: 'launchpad',
} as const;
export type PieceId = keyof typeof ROUTES;
export type TabId = (typeof ROUTES)[PieceId];

/** The tabs' names as the site's panel prints them (for the card's button). */
export const TAB_LABEL: Record<string, string> = {
  fleet: 'Fleet', about: 'How It Works', risk: 'Risk', hedge: 'Hedge', agents: 'Agent IDs', forecast: 'Forecast', state: 'State of Charge',
  battery: 'Battery', memory: 'Memory', seal: 'Seal', files: 'Files', verify: 'Verify', prices: 'Prices', 'add-agent': 'Add Your Agent',
  season: 'Season', launchpad: 'Launchpad',
};

/** The testnet tokens' tickers are placeholders (PLAN.md: one constant each) and the event's "no token tickers" rule is
 *  unanswered for testnet tokens, so no label or card prints one unless this is switched on. */
export const SHOW_TICKERS = false;
export const TICKERS = { season: 'PRIX', agent: 'PLNR' };

export const PIECE_IDS = Object.keys(ROUTES) as PieceId[];
export const POD_IDS = ['forecaster', 'state', 'market', 'hedger', 'risk', 'planner'] as const;

/** The labels: plain first, the name second (none where the plain word is the name). */
export function labels(d) {
  return {
    ercot: { plain: `${n0(d.fleet.count)} real batteries`, name: 'ERCOT' },
    terminal: { plain: 'Market data', name: 'Wattness Terminal' },
    cournot: { plain: 'Weather odds', name: 'Cournot · Kalshi markets' },
    electronx: { plain: 'Hedge terms', name: 'ElectronX' },
    studio: { plain: 'Identities and paid jobs', name: 'BNB Agent Studio' },
    aws: { plain: 'Hosted agents', name: 'Amazon Bedrock AgentCore' },
    forecaster: { plain: 'Forecaster' }, state: { plain: 'State keeper' }, market: { plain: 'Market reader' },
    hedger: { plain: 'Hedger' }, risk: { plain: 'Risk officer' }, planner: { plain: 'Planner' },
    brain: { plain: 'Memory', name: 'Living Brain' },
    gate: { plain: 'Sealed plans', name: 'GateRecord' },
    greenfield: { plain: 'Public files', name: 'BNB Greenfield' },
    verifier: { plain: 'Check any plan', name: 'Verifier' },
    cloudflare: { plain: 'Files served after a check', name: 'Cloudflare Worker' },
    atlas: { plain: 'Signed prices', name: 'Atlas' },
    cmc: { plain: 'Quotes and security fields', name: 'CoinMarketCap' },
    arena: { plain: 'Open to any wallet', name: 'Arena' },
    flap: { plain: 'Season token and vault', name: 'Flap' },
    openfour: { plain: 'Agent launches', name: 'OpenFour' },
  };
}

// ── formatting ──────────────────────────────────────────────────────────────────────────────────────────────────
export const n0 = (v: number) => v.toLocaleString('en-US');
export const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
export const ct = (s: string) => s.slice(11);                                  // "2026-11-25 09:15:17 CT" -> "09:15:17 CT"
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayLabel = (iso: string) => { const [y, mo, dd] = iso.slice(0, 10).split('-').map(Number); return `${MON[mo - 1]} ${dd}, ${y}`; };
const monDay = (iso: string) => dayLabel(iso).replace(/, \d+$/, '');
const usd = (v: number, dp = 2) => `$${v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const pct = (ppm: number) => `${+(ppm / 1e4).toFixed(2)}%`;
/** RFC 6962's audit path length for leaf m (zero-based) of n: how many hashes lead to the root. */
export const pathLen = (m: number, n: number): number => { if (n <= 1) return 0; let k = 1; while (k * 2 < n) k *= 2; return 1 + (m < k ? pathLen(m, k) : pathLen(m - k, n - k)); };
export const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** "a, b and c". */
const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/** Check ids as runs: V1 to V6, V8 and V9 (three or more in a row read as a run). */
const checkRuns = (ids: string[]) => {
  const n = ids.map((s) => Number(s.replace(/^V/, ''))).sort((a, b) => a - b), out: string[] = [];
  for (let i = 0; i < n.length;) {
    let j = i; while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++;
    if (j - i >= 2) out.push(`V${n[i]} to V${n[j]}`); else for (let k = i; k <= j; k++) out.push(`V${n[k]}`);
    i = j + 1;
  }
  return andList(out);
};

/** A CT wall time ("2026-11-25 14:37:22 CT") as unix seconds: US Central, daylight time (UTC-5) from 2:00 on March's
 *  second Sunday to 2:00 on November's first Sunday, standard time (UTC-6) otherwise. */
export function ctUnix(s: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))? CT$/.exec(s ?? '');
  if (!m) return null;
  const [y, mo, dd, h, mi, se] = [1, 2, 3, 4, 5, 6].map((i) => Number(m[i] ?? 0));
  const sunday = (month: number, nth: number) => 1 + ((7 - new Date(Date.UTC(y, month, 1)).getUTCDay()) % 7) + 7 * (nth - 1);
  const local = Date.UTC(y, mo - 1, dd, h, mi, se);
  const daylight = local >= Date.UTC(y, 2, sunday(2, 2), 2) && local < Date.UTC(y, 10, sunday(10, 1), 2);
  return local / 1000 + (daylight ? 5 : 6) * 3600;
}

/** A hosted agent's run (integrations.json agent_studio.hosted, the evaluator, or agent_studio.hosted_forecaster):
 *  whether it ran, and whether it is hosted at now (unix seconds). The live mount passes its clock, so after the managed
 *  trial ends the AWS piece reads as run and its card loses the agent cards' links; the stills and films pass none and
 *  show the record as it was rendered. */
export function hosting(TN, now: number | null = null, which: 'hosted' | 'hosted_forecaster' = 'hosted') {
  const h = TN?.agent_studio?.[which];
  if (!h?.backend) return { ran: false, hosted: false, since: null, until: null };
  const since = ctUnix(h.since_ct), until = ctUnix(h.until_ct);
  return { ran: true, hosted: now == null || until == null || now < until, since, until };
}

/** A card's value: text parts, some in monospace, some linked out. */
export type Part = { t: string; mono?: boolean; href?: string; block?: boolean };
export type Row = [string, Part[]];
export interface Card {
  id: PieceId;
  caps: string;
  name: string;
  glyph?: keyof typeof GLYPHS;
  role: string;
  rows: Row[];
  link?: { text: string; href: string };
  route: TabId;
  routeLabel: string;
  chip?: { src: string; caption: string; dark?: boolean } | { tag: string; caption: string };
}

const T = (t: string): Part => ({ t });
const M = (t: string, href?: string): Part => ({ t, mono: true, href });

/** Every piece's card. marks: the chip images' URLs (marks.ts MARK_URLS). now: the live mount's clock in unix seconds
 *  (null for the stills: the record as rendered). */
export function cards(d, GF, TN, marks, now: number | null = null): Record<PieceId, Card> {
  const ex = TN.explorer, tx = (h: string) => `${ex}/tx/${h}`, ad = (a: string) => `${ex}/address/${a}`;
  const rc = d.sealed_day.receipts[0], late = d.sealed_day.late_seal.attempts.find((a) => a.chain_id === 56) ?? d.sealed_day.late_seal.attempts[0];
  const sh = d.showcase, as = sh.assumptions, ins = sh.instrument, rel = d.sealed_day.inputs_release, ev = d.sponsors.agent_studio.evaluation;
  const co = d.sponsors.cournot, at = d.sponsors.atlas.signed_pull, cm = d.sponsors.cmc, lb = d.sponsors.living_brain;
  const S = TN.agent_studio, A = TN.agents, F = TN.flap, O = TN.openfour;
  const hubs = Object.entries(d.fleet.hub_counts).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([h, n]) => `${h} ${n}`).join(' · ');
  const sel = Object.entries(d.fleet.selected_arm_counts).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([a, n]) => `${a} for ${n}`).join(', ');
  const passed = ev.checks.filter((c) => c.status === 'PASS').map((c) => c.id);
  const agentRow = (k: string): Row => ['Identity', [T(`ERC-8004 agent ${A.ids[k]} on BSC testnet · `), M(short(A.registered[k].tx), tx(A.registered[k].tx))]];
  const job = A.job_1872;
  const make = (id: PieceId, c: Omit<Card, 'id' | 'route' | 'routeLabel'>): Card => ({ id, route: ROUTES[id], routeLabel: TAB_LABEL[ROUTES[id]], ...c });
  const brainId = (s: string) => s;
  const lowF = co.resolve.threshold_f, bas = co.probability.basis?.[0];
  // the hosted evaluator (agent 2922): its run on AgentCore, its two jobs (1871 run locally, 1873 served from the
  // hosted runtime); the hosted Forecaster (agent 2925, the same managed trial) and its job 1897; and every paid job the
  // agents completed (with the Planner's 1872 and 1897), in id order
  const H = hosting(TN, now), hs = S.hosted, hm = (s: string) => ct(s).slice(0, 5);
  const HF = hosting(TN, now, 'hosted_forecaster'), hf = S.hosted_forecaster, job97 = A.job_1897;
  const agentCard: Part = { t: 'agent card', href: hs.agent_card };
  const fcCard: Part = { t: 'agent card', href: hf.agent_card };
  /** While hosted: since when, and the agent card; after the trial: the span it ran, and no link (the card is gone). */
  const span = (R, h, card: Part): Part[] => (R.hosted ? [T(`since ${hm(h.since_ct)} CT on ${monDay(h.since_ct)} · `), card]
    : [T(`${monDay(h.since_ct)}, ${hm(h.since_ct)} CT to ${monDay(h.until_ct)}, ${hm(h.until_ct)} CT`)]);
  const settled = (js: { settle_tx: string }[]): Part[] => js.flatMap((j, i) => [...(i ? [T(', ')] : []), M(short(j.settle_tx), tx(j.settle_tx))]);
  const allJobs = [...S.jobs, job, job97].sort((a, b) => a.id - b.id);
  const EG = TN.cloudflare, edgeHost = EG.worker.replace(/^https:\/\//, '');
  const roleIds = (Object.values(A.ids) as number[]).sort((a, b) => a - b);

  return {
    ercot: make('ercot', {
      caps: 'The market · ERCOT', name: 'ERCOT', chip: { src: marks.ercot, caption: 'ERCOT' },
      role: `Texas's grid operator: the real batteries, their node prices, and the day-ahead market that closes at ${ct(d.sealed_day.gate.ct).slice(0, 5)} CT.`,
      rows: [
        ['Batteries', [T(`${n0(d.fleet.count)} planned · ${n0(d.fleet.totals.power_mw)} MW · ${n0(d.fleet.totals.energy_mwh)} MWh`)]],
        ['By hub', [T(hubs)]],
        ['Desert Willow', [M(sh.resource), T(` · ${n0(sh.power_mw)} MW, ${n0(sh.energy_mwh)} MWh: the bright column`)]],
      ],
    }),
    terminal: make('terminal', {
      caps: 'Market data · Wattness', name: 'Wattness Terminal',
      role: "ERCOT's prices and fleet as public files, each named by its SHA-256.",
      rows: [
        ['Release', [M(rel.release_id), T(`, made ${ct(rel.generated.ct)} on ${monDay(rel.generated.ct)}`)]],
        ['Manifest', [T('SHA-256 '), M(short(rel.manifest_sha256))]],
        ['Cited', [T(`Desert Willow's plan cites ${n0(rel.showcase_files_cited)} files by hash`)]],
      ],
      link: { text: 'wattness.tech', href: 'https://wattness.tech' },
    }),
    cournot: make('cournot', {
      caps: 'Weather odds · Cournot', name: 'Cournot', chip: { src: marks.cournotInk, caption: 'COURNOT' },
      role: "Verifiable odds on Kalshi's Texas weather markets, for the Risk officer.",
      rows: [
        ['Endpoint', [M(co.probability.endpoint.replace(/^https:\/\//, ''))]],
        ['Asked', [T(`Dallas low below ${lowF}°F on ${monDay(co.resolve.event_day)} (Kalshi market ${co.resolve.market_id})`)]],
        ['Answer', [M(String(co.probability.value)), T(bas ? `, from Kalshi's YES quote at ${ct(bas.time.ct)}` : '')]],
        ['Read', [T(`${ct(co.probability.observed.ct)} on ${monDay(co.probability.observed.ct)}, after the seal`)]],
      ],
    }),
    electronx: make('electronx', {
      caps: 'Hedge terms · ElectronX', name: 'ElectronX', chip: { src: marks.electronx, caption: 'ELECTRONX' },
      role: `Hourly bounded futures at ${ins.location}: the hedge's published terms.`,
      rows: [
        ['Terms', [T(`${usd(ins.range_cents[0] / 100, 0)} to ${usd(ins.range_cents[1] / 100, 0)}, tick ${usd(ins.tick_cents / 100)}, ${n0(ins.size_kwh / 1000)} MWh, ${usd(ins.fee_cents_per_contract / 100)} a contract`)]],
        ['Settles on', [T('the hour\'s first-published real-time hub price, held between the floor and the ceiling')]],
        ['Entry', [T("assumed at fair value: the hour's scenario mean")]],
      ],
      link: ins.source_urls?.[0] ? { text: 'Their published terms', href: ins.source_urls[0] } : undefined,
    }),
    studio: make('studio', {
      caps: 'Agent identities and jobs · BNB Chain', name: 'BNB Agent Studio', chip: { src: marks.bnbLogoYellow, caption: 'AGENT STUDIO' },
      role: `Gives each agent an on-chain identity and lets one agent pay another for a job. Its managed hosting ${H.hosted || HF.hosted ? 'runs' : 'ran'} the evaluator and the Forecaster.`,
      rows: [
        ['Identities', [T(`ERC-8004 agents ${roleIds[0]} to ${roleIds[roleIds.length - 1]} (the six roles) and ${S.agent_id} (the evaluator), BSC testnet`)]],
        ['Paid jobs', [T(`ERC-8183 jobs ${andList(allJobs.map((j) => String(j.id)))} completed · `), ...settled(allJobs)]],
        ['Hosting', H.hosted || HF.hosted ? [T('the evaluator and the Forecaster, on Amazon Bedrock AgentCore')]
          : [T(`the evaluator and the Forecaster, on Amazon Bedrock AgentCore until ${hm(hs.until_ct)} CT on ${monDay(hs.until_ct)}`)]],
      ],
    }),
    aws: make('aws', {
      caps: 'Agent hosting · AWS', name: 'Amazon Bedrock AgentCore', chip: { src: marks.awsInk, caption: 'AGENTCORE' },
      role: `${H.hosted || HF.hosted ? 'Runs' : 'Ran'} two agents that BNB Agent Studio's managed hosting deployed here, each selling its work as an ERC-8183 job: the evaluator, agent ${S.agent_id}, which checks a sealed record against GateRecord on BSC testnet, and the Forecaster, agent ${hf.agent_id}, which delivers a battery's sealed price scenarios.`,
      rows: [
        // after the trial the runtimes and their cards are gone: the cards' links would 404, so the rows keep the span
        // they ran, and the evaluator's row its transaction
        ['Evaluator', [T(`agent ${S.agent_id} · `), ...span(H, hs, agentCard), T(' · set on chain in '), M(short(hs.uri_tx), tx(hs.uri_tx))]],
        ['Its jobs', [T(`${andList(S.jobs.map((j) => `${j.id} (${j.hosted ? 'served from AgentCore' : 'run locally'})`))} completed · `), ...settled(S.jobs)]],
        ['Its check', [T(`the ${monDay(ev.record.operatingDay)} record on BSC testnet: ${checkRuns(passed)} pass`)]],
        ['Forecaster', [T(`agent ${hf.agent_id}, `), M(hf.slug), T(' · '), ...span(HF, hf, fcCard)]],
        ['Signs as', [T(`the wallet that owns agent ${hf.agent_id} signs from BNB Agent Studio's hosted runtime · `), M(short(hf.wallet), ad(hf.wallet))]],
        ['Its job', [T(`ERC-8183 job ${job97.id}: the Planner paid it ${job97.budget}; its deliverable hashes to the sealed digest · `), M(short(job97.settle_tx), tx(job97.settle_tx))]],
      ],
    }),
    forecaster: make('forecaster', {
      caps: 'Agent · Forecast', name: 'Forecaster', glyph: 'forecaster',
      role: `Tomorrow's prices at each battery's hub and node, as ${n0(sh.scenarios?.count ?? sh.scenarios?.length ?? 301)} scenarios.`,
      rows: [
        ['Method', [T(`day-type persistence; ${monDay(d.sealed_day.operating_day)} is ${sh.forecast.day_type === 'offpeak' ? 'off-peak' : 'a weekday'}; reference days ${sh.forecast.reference_days.map((r) => monDay(r.day).replace(/^\w+ /, '')).join(', ')} weighted ${sh.forecast.reference_days.map((r) => r.weight).join(':')}`)]],
        ['Paid jobs', [T(`hired by the Planner in ERC-8183 jobs ${job.id} and ${job97.id} for Desert Willow's sealed scenarios, after the seal; ${job97.id} from its hosted runtime on AgentCore · `),
          M(short(job.settle_tx), tx(job.settle_tx)), T(', '), M(short(job97.settle_tx), tx(job97.settle_tx))]],
        agentRow('forecaster'),
      ],
    }),
    state: make('state', {
      caps: 'Agent · State of charge', name: 'State keeper', glyph: 'state',
      role: "The battery's limits, hour by hour.",
      rows: [
        ['Desert Willow', [T(`${n0(sh.power_mw)} MW, ${n0(sh.energy_mwh)} MWh; ${pct(as.round_trip_ppm)} round trip; ${pct(as.soc_min_ppm)} to ${pct(as.soc_max_ppm)}; ${as.max_cycles_ppm === 1e6 ? 'one cycle' : `${as.max_cycles_ppm / 1e6} cycles`} a day; ${usd(as.wear_cents_per_mwh / 100, 0)}/MWh wear`)]],
        agentRow('state'),
      ],
    }),
    market: make('market', {
      caps: 'Agent · Prices in', name: 'Market reader', glyph: 'market',
      role: "Reads the Terminal's price files and pins each one by its SHA-256.",
      rows: [
        ['Reads', [M(rel.release_id), T(' and the newest live day files')]],
        ['Pinned', [T(`${n0(rel.showcase_files_cited)} files for Desert Willow, each by SHA-256; prices taken as given`)]],
        agentRow('market'),
      ],
    }),
    hedger: make('hedger', {
      caps: 'Agent · Hedge', name: 'Hedger', glyph: 'hedger',
      role: "Sizes the hedge on ElectronX's terms.",
      rows: [
        ['Limits', [T(`at most ${n0(as.max_contracts_per_hour)} contracts an hour; collateral at most ${usd(as.collateral_budget_cents / 100, 0)}`)]],
        ['Desert Willow', [T(`plan ${sh.selected_arm}: ${n0(sh.arms[sh.selected_arm].contracts_sold)} sold, ${n0(sh.arms[sh.selected_arm].contracts_bought)} bought`)]],
        agentRow('hedger'),
      ],
    }),
    risk: make('risk', {
      caps: 'Agent · Risk', name: 'Risk officer', glyph: 'risk',
      role: 'Weighs the bad days.',
      rows: [
        ['Objective', [T(`mean revenue minus ${+(d.showcase.risk.lambda_ppm / 1e6).toFixed(2)} × the ${pct(d.showcase.risk.alpha_ppm)} CVaR of loss`)]],
        ['Weather', [T(`Cournot's odds: ${co.probability.value} for the Dallas freeze, read after the seal`)]],
        agentRow('risk'),
      ],
    }),
    planner: make('planner', {
      caps: 'Agent · The plan', name: 'Planner', glyph: 'planner',
      role: 'One plan, three arms, chosen by a mixed-integer program, sealed as one root.',
      rows: [
        ['Solver', [T(`${d.sealed_day.engine.solver} ${d.sealed_day.engine.solver_package.split('@')[1]}`)]],
        ['Chose', [T(`${sel} batteries`)]],
        ['Desert Willow', [T(`plan ${sh.selected_arm}, objective ${usd(sh.arms[sh.selected_arm].objective_usd)}`)]],
        agentRow('planner'),
      ],
    }),
    brain: make('brain', {
      caps: 'Memory · Living Brain', name: 'Living Brain', chip: { src: marks.brainInk, caption: 'LIVING BRAIN' },
      role: 'Pages on the build and on the Wattness Terminal: captures in, cited pages out.',
      rows: [
        ['Endpoint', [M(TN.living_brain.api.replace(/^https:\/\//, ''))]],
        ['Page', [M(brainId(lb.page.slug)), T(`, version ${lb.page.version}, ${lb.after.citations === 1 ? 'one citation' : `${lb.after.citations} citations`} from ${WORDS[lb.citation.sourceIds.length] ?? lb.citation.sourceIds.length} sources, ${ct(lb.page.updated.ct)}, after the seal`)]],
        ['Wattness Brain', [T(`${n0(d.brain_graph.stats.pages)} pages, ${n0(d.brain_graph.stats.connections)} connections`)]],
      ],
    }),
    gate: make('gate', {
      caps: 'The seal · BNB Chain', name: 'GateRecord', chip: { src: marks.bnbLogoYellow, caption: 'GATERECORD' },
      role: `One Merkle root per operating day. The contract computes ERCOT's ${ct(d.sealed_day.gate.ct).slice(0, 5)} CT close itself and refuses any seal at or after it.`,
      rows: [
        ['Contract', [{ t: rc.contract, mono: true, block: true, href: `https://bscscan.com/address/${rc.contract}` }, T('BNB Smart Chain and its testnet, source verified')]],
        [`${monDay(d.sealed_day.operating_day)} seal`, [T('root '), M(short(rc.root)), T(` over ${n0(rc.leaf_count)} leaves · tx `), M(short(rc.tx), rc.tx_url), T(' · block '), M(n0(rc.block)), T(' · '), M(ct(rc.block_time.ct))]],
        ['Before the close', [M(`${n0(rc.seconds_before_gate)} s`)]],
        [`${d.sealed_day.late_seal.simulated ? 'Simulated at' : 'At'} ${ct(late.chain_time.ct)}`, [T('refused: '), M(late.refused_with)]],
        ['In', [T('the root, from the Planner')]],
        ['Out', [T('receipts to Greenfield · the root to the verifier and the hosted evaluator')]],
      ],
      link: { text: 'View the transaction', href: rc.tx_url },
    }),
    greenfield: make('greenfield', {
      caps: 'Public files · BNB Greenfield', name: 'BNB Greenfield', chip: { src: marks.greenfield, caption: 'GREENFIELD', dark: true },
      role: "The sealed day's files in a public bucket, byte for byte.",
      rows: [
        ['Bucket', [M(GF.bucket.name), T(`, Greenfield testnet, ${GF.bucket.visibility === 'public-read' ? 'public read' : GF.bucket.visibility}`)]],
        ['Files', [T(`${n0(GF.objects)}, ${(GF.total_bytes / 1e6).toFixed(1)} MB, ${GF.all_verified ? 'each downloaded back and matched by SHA-256' : 'uploaded'}`)]],
        ['Kinds', [T(`${n0(GF.kinds.leaf)} leaves, ${n0(GF.kinds.scenarios)} scenario files, ${n0(GF.kinds.sync)} syncs, the manifest, root, salt and both receipts`)]],
      ],
    }),
    verifier: make('verifier', {
      caps: 'Check · anyone', name: 'Verifier', chip: { tag: "Anyone's", caption: 'Verifier' },
      role: 'Anyone checks a plan against the chain, in the browser or with one command.',
      rows: [
        ['Leaf', [T(`Desert Willow's, ${sh.leaf_position + 1} of ${d.sealed_day.leaf_count}: its ${WORDS[pathLen(sh.leaf_position, d.sealed_day.leaf_count)]}-hash audit path recomputes the root`)]],
        ['Root', [T("matches GateRecord's on BNB Smart Chain and its testnet")]],
        ['Also checked', [T(ev.checks.filter((c) => ['V3', 'V4', 'V5', 'V6'].includes(c.id) && c.status === 'PASS').map((c) => c.title).join('; '))]],
      ],
    }),
    // the edge Worker (integrations.json cloudflare): only what its / and /verify answer, read at read_ct; Turnstile as
    // the Wattness site's code uses it (the question to Ness opens the check; the server confirms the token)
    cloudflare: make('cloudflare', {
      caps: 'Files at the edge · Cloudflare', name: 'Cloudflare Worker', chip: { tag: 'At the edge', caption: 'Cloudflare' },
      role: "Serves each sealed day's files from BNB Greenfield, each only after checking it against the root committed on GateRecord; a file that fails a check gets 502 and the reason instead.",
      rows: [
        ['Endpoint', [M(edgeHost, `${EG.worker}/`)]],
        ['Verdict', [M('/verify/<battery>'), T(`: JSON naming each check (${andList(EG.checks)}) with pass or fail and the values compared`)]],
        [sh.name, [T(`${monDay(d.sealed_day.operating_day)} on BNB Smart Chain: all ${WORDS[EG.checks.length] ?? EG.checks.length} pass · `), M(`/verify/${sh.resource}`, EG.verify)]],
        ['Turnstile', [T(`guards questions to ${EG.turnstile.guards}: its server opens a session only for a Turnstile check Cloudflare confirms`)]],
      ],
      link: { text: 'The Worker', href: `${EG.worker}/` },
    }),
    atlas: make('atlas', {
      caps: 'Signed prices · Atlas', name: 'Atlas', chip: { src: marks.atlas, caption: 'ATLAS' },
      role: 'Signed BNB and USDT prices that size the evaluation budget.',
      rows: [
        ['Endpoint', [M(at.endpoint.replace(/^https:\/\//, ''))]],
        ...at.prices.map((p): Row => [p.name, [M(p.usd > 10 ? usd(p.usd) : `$${p.usd.toFixed(5)}`), T(` (feed ${p.feed_id})`)]]),
        ['Signed', [T(`signature checked · ${ct(at.observed.ct)} on ${monDay(at.observed.ct)}`)]],
      ],
    }),
    cmc: make('cmc', {
      caps: 'Quotes and security fields · CoinMarketCap', name: 'CoinMarketCap', chip: { src: marks.cmcInk, caption: 'COINMARKETCAP' },
      role: "Quotes, and the vendor's security fields for BSC-USDT.",
      rows: [
        ['Quotes', [T(cm.quotes.assets.slice().sort((a, b) => b.price_usd - a.price_usd).map((a) => `${a.symbol} ${a.price_usd > 10 ? usd(a.price_usd) : `$${a.price_usd.toFixed(5)}`}`).join(', ')), T(` at ${ct(cm.quotes.assets[0].quote_time.ct)}`)]],
        ['Security fields', [T(`${cm.security.token_label}: ${+cm.security.buy_tax}% buy and ${+cm.security.sell_tax}% sell tax${cm.security.verified_contract ? ', verified contract' : ''}${cm.security.flagged_by_vendor ? ', flagged by the vendor' : ''}`)]],
        ['Endpoint', [M('pro-api.coinmarketcap.com')]],
      ],
    }),
    arena: make('arena', {
      caps: 'Open records · any wallet', name: 'Arena', chip: { tag: 'Any wallet', caption: 'Arena' },
      role: 'Any wallet seals a plan before the market closes; one verifier checks every record.',
      rows: [
        ['Records', [T('GateRecord keys each record by its committer')]],
        [monDay(d.sealed_day.operating_day), [T(`${n0(d.sealed_day.leaf_count)} plans from `), M(short(d.sealed_day.agent.wallet), `https://bscscan.com/address/${d.sealed_day.agent.wallet}`)]],
      ],
    }),
    flap: make('flap', {
      caps: 'Season · Flap', name: 'Flap', chip: { src: marks.flapPixel, caption: 'FLAP' },
      role: "Contributors get the reserve pro rata; a 20% earned share and the vault's tax pay by days sealed before the gate.",
      rows: [
        [SHOW_TICKERS ? `${TICKERS.season}` : 'Season token', [M(short(F.token), ad(F.token)), T(', BSC testnet')]],
        ['Launched', [T(`${ct(F.launch.ct)} on ${monDay(F.launch.ct)} · `), M(short(F.launch.tx), tx(F.launch.tx))]],
        ['Vault', [M(short(F.vault), ad(F.vault)), T(' · paid a claim in '), M(short(F.vault_claim.tx), tx(F.vault_claim.tx))]],
        // the Portal's address is a vanity one (0x00004210…0000): the short form keeps its leading digits
        ['Portal', [T(`Flap ${d.sponsors.flap.portal_version} · `), M(`${F.portal.slice(0, 10)}…${F.portal.slice(-4)}`, ad(F.portal))]],
      ],
    }),
    openfour: make('openfour', {
      caps: 'Agent launches · OpenFour', name: 'OpenFour', chip: { src: marks.four, caption: 'OPENFOUR', dark: true },
      role: "Launches only agents with a sealed record: graduation waits for the record's evidence.",
      rows: [
        [SHOW_TICKERS ? `${TICKERS.agent}` : 'Agent token', [M(short(O.token), ad(O.token)), T(', BSC testnet')]],
        ['Refused', [T(`${O.refused.error}, before the record was bound · `), M(short(O.refused.tx), tx(O.refused.tx))]],
        ['Bound', [T(`the ${monDay(String(O.evidence.operating_day).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'))} record · `), M(short(O.evidence.tx), tx(O.evidence.tx))]],
        ['Graduated', [T('into its pair '), M(short(O.graduated.pair), ad(O.graduated.pair)), T(' · '), M(short(O.graduated.tx), tx(O.graduated.tx))]],
      ],
    }),
  };
}
