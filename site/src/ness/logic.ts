// Ask Ness's pure parts: the address that opens it, the search over the
// questions, and the times inside an answer. No imports, so the tests run them
// in Node as they are (test/ness.test.mjs).

/** The query parameter that holds the panel: ?ask= opens the questions, ?ask=<id> one answer. */
export const ASK_PARAM = "ask";

export type AskState = { open: false } | { open: true; id: string | null };

/** What the address asks of the panel. */
export function readAsk(search: string): AskState {
  const params = new URLSearchParams(search);
  if (!params.has(ASK_PARAM)) return { open: false };
  const id = (params.get(ASK_PARAM) ?? "").trim();
  return { open: true, id: id || null };
}

/** The same search with the panel in this state; every other parameter is kept, in its place. */
export function writeAsk(search: string, state: AskState): string {
  const params = new URLSearchParams(search);
  if (!state.open) params.delete(ASK_PARAM);
  else params.set(ASK_PARAM, state.id ?? "");
  const out = params.toString();
  return out ? `?${out}` : "";
}

/** Lowercase, accents and the × of "CoinMarketCap × Atlas" folded, so a search finds either spelling. */
export function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/×/g, " x ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .toLowerCase();
}

/** The words of a query: runs of letters, digits and the joiners an id or a version keeps (- . _ /). */
export function queryTerms(query: string): string[] {
  return fold(query)
    .split(/[^a-z0-9\-._/]+/)
    .map((t) => t.replace(/^[-._/]+|[-._/]+$/g, ""))
    .filter(Boolean);
}

/** Whether every word of the query appears in the text (as a word's start or inside it). */
export function matchesQuery(text: string, query: string): boolean {
  const terms = queryTerms(query);
  if (terms.length === 0) return true;
  const hay = fold(text);
  return terms.every((t) => hay.includes(t));
}

/** The items whose text matches every word of the query, in their own order. */
export function filterByQuery<T>(items: readonly T[], query: string, textOf: (item: T) => string): T[] {
  if (queryTerms(query).length === 0) return [...items];
  return items.filter((item) => matchesQuery(textOf(item), query));
}

/** A paragraph's prose and its times: {t:1795702241} is a unix second, shown in CT with the reader's own beside it. */
export type Piece = string | { unix: number };

const TIME = /\{t:(\d{9,11})\}/g;

export function splitTimes(text: string): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (const m of text.matchAll(TIME)) {
    const i = m.index ?? 0;
    if (i > at) out.push(text.slice(at, i));
    out.push({ unix: Number(m[1]) });
    at = i + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** The prose's words, a time counted as two ("08:10:41 CT"): the measure for an answer's length. */
export function countWords(text: string): number {
  let n = 0;
  for (const p of splitTimes(text)) n += typeof p === "string" ? p.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length : 2;
  return n;
}

/** Whether a link leaves the site: a full address, or a path the site does not serve. */
export function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
}

/** "bscscan.com" for a link's line: where it goes, in a word. */
export function hostOf(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** A Living Brain page as the Memory tab keys it, "grand-prix:gaterecord", as its brain and slug. */
export function splitPageKey(key: string): { brain: string; slug: string } | null {
  const at = key.indexOf(":");
  if (at <= 0 || at === key.length - 1) return null;
  return { brain: key.slice(0, at), slug: key.slice(at + 1) };
}

/** The brains the live stage can bring to its center (packages/world's BrainFocus, less "all"). */
export const LIVE_BRAINS = ["grand-prix", "terminal", "battery-review"] as const;
export type LiveFocus = { brain: "all" | (typeof LIVE_BRAINS)[number]; page: string | null };

/** Where the live stage looks for an answer: the page's brain at the center with the page pinned, or all three brains. */
export function liveFocus(lit: string | null): LiveFocus {
  const p = lit ? splitPageKey(lit) : null;
  const brain = p ? LIVE_BRAINS.find((b) => b === p.brain) : undefined;
  return brain && p ? { brain, page: p.slug } : { brain: "all", page: null };
}
