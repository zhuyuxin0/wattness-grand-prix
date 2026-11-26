// Find in this page, as wattness.tech's find in a pane (apps/mms/src/ui/pane-find.tsx): every match in the page's
// text, case-insensitive, highlighted with the CSS Custom Highlight API so the page's DOM is never touched. It reads
// the page as it holds it, folded sections included: a match inside a closed <details> opens it (and anything marked
// hidden="until-found" hears the browser's own 'beforematch'). A browser without highlights still steps and
// scrolls, with the current match selected instead.

/** Elements whose text is not the page's to search. */
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "CANVAS"]);
/** Elements that do not end a line of text: a match may run across them. */
const INLINE = new Set(["A", "ABBR", "B", "BDI", "BDO", "CITE", "CODE", "DATA", "DFN", "EM", "I", "KBD", "MARK", "Q", "S", "SAMP", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "TIME", "U", "VAR", "LABEL", "WBR"]);
const MAX_HITS = 2000;

type Index = { text: string; nodes: { node: Text; start: number }[] };

function blockOf(n: Node, root: Element): Element {
  let e = n.parentElement;
  while (e && e !== root && INLINE.has(e.tagName)) e = e.parentElement;
  return e ?? root;
}

/** The page's text as one string, a line break where a block ends so no match runs from one block into the next. */
function indexOf(root: Element): Index {
  const nodes: Index["nodes"] = [];
  let text = "";
  let last: Element | null = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const e = n as Element;
        if (SKIP.has(e.tagName.toUpperCase()) || e.hasAttribute("data-find-skip")) return NodeFilter.FILTER_REJECT;
        const h = e.getAttribute("hidden");
        if (h != null && h !== "until-found") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_SKIP;
      }
      return (n.nodeValue ?? "").length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const b = blockOf(n, root);
    if (last && b !== last) text += "\n";
    last = b;
    nodes.push({ node: n as Text, start: text.length });
    text += n.nodeValue ?? "";
  }
  return { text, nodes };
}

function at(ix: Index, offset: number, end: boolean): { node: Text; offset: number } {
  let lo = 0;
  let hi = ix.nodes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const start = ix.nodes[mid]?.start ?? 0;
    if (start < offset || (!end && start === offset)) lo = mid;
    else hi = mid - 1;
  }
  // search() asks only of an index with nodes.
  const x = ix.nodes[lo]!;
  return { node: x.node, offset: Math.min(offset - x.start, (x.node.nodeValue ?? "").length) };
}

/** Every match of q in the page, as ranges in page order. */
export function search(root: Element, q: string): { hits: Range[]; capped: boolean } {
  const needle = q.replace(/\s+/g, " ").trim();
  if (!needle) return { hits: [], capped: false };
  const ix = indexOf(root);
  if (!ix.nodes.length) return { hits: [], capped: false };
  const lower = ix.text.toLowerCase();
  // A case fold that changes a string's length would shift every offset after it.
  const hay = lower.length === ix.text.length ? lower : ix.text;
  const n = hay === lower ? needle.toLowerCase() : needle;
  const hits: Range[] = [];
  for (let i = hay.indexOf(n); i >= 0; i = hay.indexOf(n, i + n.length)) {
    if (hits.length >= MAX_HITS) return { hits, capped: true };
    const s = at(ix, i, false);
    const e = at(ix, i + n.length, true);
    const r = document.createRange();
    r.setStart(s.node, s.offset);
    r.setEnd(e.node, e.offset);
    hits.push(r);
  }
  return { hits, capped: false };
}

type HighlightRegistry = { set: (k: string, v: unknown) => void; delete: (k: string) => void };
const registry = (): HighlightRegistry | undefined => (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS?.highlights;
const HighlightCtor = (): (new (...r: Range[]) => unknown) | undefined => (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;

export function paint(all: Range[], now: Range | null): void {
  const reg = registry();
  const H = HighlightCtor();
  if (!reg || !H) {
    if (now) {
      const s = getSelection();
      s?.removeAllRanges();
      s?.addRange(now);
    }
    return;
  }
  reg.set("page-find", new H(...all));
  if (now) reg.set("page-find-now", new H(now));
  else reg.delete("page-find-now");
}

export function unpaint(): void {
  registry()?.delete("page-find");
  registry()?.delete("page-find-now");
}

/** Opens every folded part around the element, outermost first: a closed <details>, or a hidden="until-found" block. */
export function openAround(el: Element | null): void {
  const chain: Element[] = [];
  for (let e: Element | null = el; e; e = e.parentElement) {
    if (e.getAttribute("hidden") === "until-found" || (e.tagName === "DETAILS" && !(e as HTMLDetailsElement).open)) chain.unshift(e);
  }
  for (const e of chain) {
    if (e.tagName === "DETAILS") (e as HTMLDetailsElement).open = true;
    else e.dispatchEvent(new Event("beforematch"));
  }
}

/** Opens what folds around the match, then brings it to the middle of the view. */
export function reveal(r: Range): void {
  const start = r.startContainer.parentElement;
  openAround(start);
  requestAnimationFrame(() => requestAnimationFrame(() => start?.scrollIntoView({ block: "center", inline: "nearest" })));
}
