// The Memory tab's card (SPEC 5): ours, in Living Brain's card shape (dark navy, a cyan hairline, radius 16, 320 px; a
// bottom sheet under 720 px), with our type. The badge and title, the meta line, Living Brain's summary as it wrote
// it, the correction beside it where the summary misstates the repository or the chain record (the scene's, or the
// host's), the conflict across brains, the connections in its brain and across brains (each row selects its page), and
// "Open <tab>" where the page is a tab's own. Also the small hover card, and the page list (the keyboard's path, and the
// fallback without WebGL or at phone width).
import { BRAINS, PLAIN, acrossOf, brainOf, conflictOf, linksOf, pagesOf, tabsOf, type BrainId, type Page, type Strength } from './data';

const two = (n: number) => String(n).padStart(2, '0');
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const badge = (p: Page) => { const b = el('span', 'lb-n', two(p.n)); b.style.setProperty('--lb-c', brainOf(p.brain).color); return b; };
const STRENGTH: Record<Strength, string> = { strong: 'Strong', medium: 'Medium', weak: 'Weak' };
const pct = (s: number) => `${Math.round(s * 100)}% match`;

export interface CardHost {
  /** Selects a page (in another brain: the mount moves there first). */
  select(brain: BrainId, slug: string): void;
  /** Calls the host's onRoute with a tab id. */
  route(tab: string): void;
  close(): void;
  /** The host's tabs, by id: which "Open <tab>" buttons may show. */
  tabs: Map<string, string>;
  /** The host's corrections, where it holds one the scene's data does not (mount.ts BrainOptions.corrections). */
  fix?: Fix;
}

/** Corrections beside Living Brain's text: a page's, and a connection's (either order). */
export interface Fix {
  page(p: Page): string | undefined;
  link(aBrain: BrainId, a: string, bBrain: BrainId, b: string): string | undefined;
}

/** The host's corrections as a Fix: pages keyed 'brain/slug', connections 'brainA/a>brainB/b'. */
export function fixOf(c?: { pages?: Record<string, string>; connections?: Record<string, string> }): Fix | undefined {
  if (!c) return undefined;
  const pages = c.pages ?? {}, links = c.connections ?? {};
  const own = (o: Record<string, string>, k: string) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
  return {
    page: (p) => own(pages, `${p.brain}/${p.slug}`),
    link: (aBrain, a, bBrain, b) => own(links, `${aBrain}/${a}>${bBrain}/${b}`) ?? own(links, `${bBrain}/${b}>${aBrain}/${a}`),
  };
}

const SVG = 'http://www.w3.org/2000/svg';
/** The site's drawn glyphs (the Terminal's close, next and caret, as site/src/ui/glyph.css publishes them), in the text's
 *  color: never a typed character or the browser's own disclosure triangle. */
const GLYPH = { close: 'M2 2l6 6M8 2l-6 6', next: 'M4.5 3l3 3-3 3', caret: 'M3 4.5l3 3 3-3' } as const;
function glyph(kind: keyof typeof GLYPH, px: number): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  const box = kind === 'close' ? 10 : 12;
  svg.setAttribute('viewBox', `0 0 ${box} ${box}`); svg.setAttribute('width', String(px)); svg.setAttribute('height', String(px));
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', `lbm-glyph is-${kind}`);
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', GLYPH[kind]);
  path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', kind === 'close' ? '1.4' : '1.5');
  path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

/** The pinned card for a page. */
export function pageCard(p: Page, host: CardHost): HTMLElement {
  const card = el('section', 'lbm-card');
  card.setAttribute('aria-label', `${p.title}, page ${two(p.n)} of the ${PLAIN[p.brain]}`);
  card.dataset.brain = p.brain; card.dataset.page = p.slug;
  const head = el('header', 'lbm-head');
  const h = el('h3', 'lbm-title');
  h.append(badge(p), document.createTextNode(p.title));
  const x = el('button', 'lbm-close'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
  x.appendChild(glyph('close', 12));
  x.addEventListener('click', () => host.close());
  head.append(h, x);
  const own = linksOf(p.brain, p.slug), across = acrossOf(p.brain, p.slug);
  const meta = el('p', 'lbm-meta', [`${PLAIN[p.brain]} (${brainOf(p.brain).name})`, `page ${two(p.n)}`, `${p.connections} ${p.connections === 1 ? 'connection' : 'connections'}`, ...(p.across ? [`${p.across} across brains`] : [])].join(' · '));
  card.append(head, meta);
  // where the page belongs on the site
  const tabs = tabsOf(p.brain, p.slug);
  const actions = el('div', 'lbm-actions');
  if (tabs.own && host.tabs.has(tabs.own)) {
    const b = el('button', 'lbm-open', `Open ${host.tabs.get(tabs.own)}`); b.type = 'button'; b.dataset.tab = tabs.own;
    b.appendChild(glyph('next', 10));
    b.addEventListener('click', () => host.route(tabs.own!));
    actions.append(b);
  }
  const partOf = tabs.partOf.filter((t) => host.tabs.has(t));
  if (partOf.length) {
    const s = el('p', 'lbm-part', 'Part of: ');
    partOf.forEach((t, i) => {
      if (i) s.append(document.createTextNode(', '));
      const a = el('button', 'lbm-link', host.tabs.get(t)!); a.type = 'button'; a.dataset.tab = t;
      a.addEventListener('click', () => host.route(t));
      s.append(a);
    });
    actions.append(s);
  }
  if (actions.childElementCount) card.append(actions);
  if (p.summary) card.append(el('p', 'lbm-label', "Living Brain's summary"), el('p', 'lbm-text', p.summary));
  const correction = host.fix?.page(p) ?? p.correction;
  if (correction) {
    const c = el('div', 'lbm-check');
    c.append(el('p', 'lbm-label', 'Correction'), el('p', 'lbm-text', correction));
    card.append(c);
  }
  const conflict = conflictOf(p.brain, p.slug);
  if (conflict) {
    const c = el('div', 'lbm-conflict');
    c.append(el('p', 'lbm-label is-rose', 'Conflict across brains'), el('p', 'lbm-text', conflict.conflict), el('p', 'lbm-text is-sub', conflict.correction));
    card.append(c);
  }
  const list = (title: string, rows: { other: Page; strength: Strength; similarity: number; reasoning: string | null; correction?: string }[], acrossRows: boolean) => {
    if (!rows.length) return;
    const sec = el('div', 'lbm-sec');
    sec.append(el('p', 'lbm-label', `${title} · ${rows.length}`));
    const ul = el('ul', 'lbm-rows');
    for (const r of rows) {
      const li = el('li', 'lbm-row');
      const b = el('button', 'lbm-rowbtn'); b.type = 'button';
      b.dataset.brain = r.other.brain; b.dataset.page = r.other.slug;
      const name = el('span', 'lbm-rowname');
      if (acrossRows) { const dot = el('span', 'lbm-dot'); dot.style.background = brainOf(r.other.brain).color; dot.title = PLAIN[r.other.brain]; name.append(dot); }
      name.append(badge(r.other), document.createTextNode(r.other.title));
      const chip = el('span', `lbm-chip is-${r.strength}`, STRENGTH[r.strength]);
      const m = el('span', 'lbm-match', pct(r.similarity));
      b.append(name, chip, m);
      b.addEventListener('click', () => host.select(r.other.brain, r.other.slug));
      const more = el('details', 'lbm-why');
      const why = el('summary'); why.append(glyph('caret', 9), document.createTextNode('Why'));
      more.append(why, el('p', 'lbm-text', r.reasoning ?? 'Living Brain gave no reason.'));
      if (r.correction) more.append(el('p', 'lbm-label', 'Correction'), el('p', 'lbm-text', r.correction));
      li.append(b, more);
      ul.append(li);
    }
    sec.append(ul);
    card.append(sec);
  };
  list('In this brain', own.map(({ other, c }) => ({ other, strength: c.strength, similarity: c.similarity, reasoning: c.reasoning,
    correction: host.fix?.link(c.brain, c.a, c.brain, c.b) ?? c.correction })), false);
  list('Across brains', across.map(({ other, x }) => ({ other, strength: x.strength, similarity: x.similarity, reasoning: x.reasoning,
    correction: host.fix?.link(x.aBrain, x.a, x.bBrain, x.b) ?? x.correction })), true);
  return card;
}

/** The small card on hover: number, title, counts. */
export function hoverCard(p: Page): HTMLElement {
  const c = el('div', 'lbm-hover');
  const h = el('p', 'lbm-htitle'); h.append(badge(p), document.createTextNode(p.title));
  c.append(h, el('p', 'lbm-meta', `${PLAIN[p.brain]} (${brainOf(p.brain).name}) · ${p.connections} ${p.connections === 1 ? 'connection' : 'connections'}${p.across ? ` · ${p.across} across` : ''}`));
  return c;
}

/** A brain's pages as rows (number order): the keyboard's path and the fallback list. */
export function pageRows(brain: BrainId, onPick: (p: Page) => void, onFocus?: (p: Page | null) => void): HTMLElement {
  const ul = el('ul', 'lbm-list');
  ul.setAttribute('aria-label', `The ${PLAIN[brain]}'s pages`);
  for (const p of pagesOf(brain)) {
    const li = el('li');
    const b = el('button', 'lbm-listbtn'); b.type = 'button'; b.dataset.brain = p.brain; b.dataset.page = p.slug;
    b.append(badge(p), el('span', 'lbm-listtitle', p.title), el('span', 'lbm-listmeta', `${p.connections}${p.across ? ` · ${p.across} across` : ''}`));
    b.addEventListener('click', () => onPick(p));
    if (onFocus) { b.addEventListener('focus', () => onFocus(p)); b.addEventListener('blur', () => onFocus(null)); }
    li.append(b); ul.append(li);
  }
  return ul;
}

/** The brains' chips: each focuses its brain; "All brains" when one is focused. */
export function brainChips(focus: 'all' | BrainId, onFocus: (b: 'all' | BrainId) => void, onHover?: (b: BrainId | null) => void): HTMLElement {
  const box = el('div', 'lbm-chips');
  box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Brains');
  const all = el('button', 'lbm-chipbtn is-all', 'All brains'); all.type = 'button'; all.dataset.brain = 'all';
  all.addEventListener('click', () => onFocus('all'));
  box.append(all);
  for (const b of BRAINS) {
    const c = el('button', 'lbm-chipbtn'); c.type = 'button'; c.dataset.brain = b.id;
    const dot = el('span', 'lbm-dot'); dot.style.background = b.color;
    c.append(dot, document.createTextNode(PLAIN[b.id]));
    c.addEventListener('click', () => onFocus(b.id));
    if (onHover) { c.addEventListener('pointerenter', () => onHover(b.id)); c.addEventListener('pointerleave', () => onHover(null)); }
    box.append(c);
  }
  setChips(box, focus);
  return box;
}

/** The chips for a focus, in place: the same buttons stay, so the one clicked keeps its focus. */
export function setChips(box: HTMLElement, focus: 'all' | BrainId) {
  for (const c of box.querySelectorAll<HTMLButtonElement>('.lbm-chipbtn')) {
    if (c.dataset.brain === 'all') c.hidden = focus === 'all';
    else c.setAttribute('aria-pressed', focus === c.dataset.brain ? 'true' : 'false');
  }
}
