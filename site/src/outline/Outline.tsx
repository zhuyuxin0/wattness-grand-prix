import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Glyph } from "../ui/Glyph";
import { openAround, paint, reveal, search, unpaint } from "./find";
import { pageRoot, scanHeadings, type ScannedHeading } from "./scan";
import { LEVELS, clip, crumbsOf, entriesOf, firstMatch, foldedAt, foldedFirst, keepFor, pathTo, treeOf, under, type OutlineEntry, type OutlineNode } from "./tree";
import "./outline.css";

// The sections menu, wattness.tech's pane contents (apps/mms/src/ui/outline.tsx) on a Grand Prix page. At the bottom
// right, a pill naming where the top of the page is and how many sections it holds, which opens the contents: the
// page's sections and subsections as VS Code's explorer draws a tree (a chevron to fold a branch, a guide line per
// level, a count on a folded branch), the section you are in marked, a filter, and "Show levels 1 2 3 All", which
// folds the tree to a depth. A click goes to the section, smoothly unless the reader asks for reduced motion, just
// under the masthead, and moves focus to its heading. "/" (or ⇧⌘F, Ctrl+Shift+F off the Mac) finds text in the page,
// folded sections included, which it opens; ⌘F stays the browser's. On a phone the pill stays in the corner, compact,
// and the contents open as a sheet. Stacking: over the float layer's panes (25), under the market day's popover and
// sheet (50), Ask Ness's beside and floating panel (45) and the tab drawer (60).

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
const BROWSER_FIND = IS_MAC ? "⌘F" : "Ctrl+F";
const reduced = (): boolean => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function editable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
}
/** The tab drawer, the market day's sheet or Ask Ness full screen holds the page: the find key leaves it be. */
const pageHeld = (): boolean => !!document.querySelector('[aria-modal="true"]') || document.documentElement.dataset.nessOpen === "modal";

/** Where the masthead ends (two bands on a phone), and a little air: a jump lands a section there. */
const headroom = (): number => (document.querySelector(".masthead")?.getBoundingClientRect().bottom ?? 0) + 12;

/** Scrolls the section's top to just under the masthead and puts focus on its heading. What draws as it comes on
 *  screen during the glide (a chart, a 3D poster) can push the section down after its place was taken: once the page
 *  stops, it is put back. Not once the reader has scrolled, tapped or typed, nor after 4 s. */
function land(h: ScannedHeading): void {
  const off = () => h.place.getBoundingClientRect().top - headroom();
  const from = window.scrollY;
  const to = Math.max(0, Math.round(from + off()));
  window.scrollTo({ top: to, behavior: reduced() ? "instant" : "smooth" });
  if (h.el.tabIndex < 0 && !h.el.hasAttribute("tabindex")) h.el.setAttribute("tabindex", "-1");
  h.el.focus({ preventScroll: true });
  if (Math.abs(to - from) <= 1) return;
  const done = new AbortController();
  const { signal } = done;
  window.addEventListener(
    "scrollend",
    () => {
      done.abort();
      if (!h.place.isConnected) return;
      const d = off();
      if (Math.abs(d) > 1 && Math.abs(d) < window.innerHeight / 2) window.scrollBy({ top: d, behavior: "instant" });
    },
    { signal },
  );
  for (const k of ["wheel", "pointerdown", "touchstart", "keydown"]) window.addEventListener(k, () => done.abort(), { signal, passive: true });
  window.setTimeout(() => done.abort(), 4000);
}

export function Outline() {
  const [read, setRead] = useState<{ sig: string; list: OutlineEntry[] }>({ sig: "", list: [] });
  const heads = useRef(new Map<number, ScannedHeading>());
  const [folds, setFolds] = useState(false);
  const [shown, setShown] = useState(false);
  const [q, setQ] = useState("");
  const [folded, setFolded] = useState<Set<number> | null>(null);
  const [here, setHere] = useState<number | null>(null);
  const [finding, setFinding] = useState(0);
  const pill = useRef<HTMLButtonElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  // The section a click went to: of two side by side, it is the one you are in.
  const jumped = useRef<number | null>(null);
  const list = read.list;

  // The page's sections, read now and again whenever the page changes (its data arrives, another battery, a fold).
  useEffect(() => {
    let t = 0;
    const scan = () => {
      t = 0;
      const root = pageRoot();
      if (!root) return;
      const found = scanHeadings(root);
      heads.current = new Map(found.map((h) => [h.id, h]));
      const next = entriesOf(found);
      const sig = next.map((e) => `${e.level}:${e.parent ?? 0}:${e.title}`).join("\n");
      setFolds(!!root.querySelector("details"));
      setRead((prev) => (prev.sig === sig ? prev : { sig, list: next }));
    };
    const soon = () => {
      if (!t) t = window.setTimeout(scan, 200);
    };
    scan();
    const main = document.getElementById("main");
    const mo = main ? new MutationObserver(soon) : null;
    if (main && mo) mo.observe(main, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", soon);
    return () => {
      mo?.disconnect();
      window.removeEventListener("resize", soon);
      if (t) window.clearTimeout(t);
    };
  }, []);

  // Where the top of the page is: of the sections whose tops have passed the line under the masthead, the nearest to
  // it, so the deepest that holds the line; of two side by side, the one a click went to, else the first.
  useEffect(() => {
    if (list.length < 2) return undefined;
    let raf = 0;
    const look = () => {
      raf = 0;
      const line = headroom() + 2;
      let best: number | null = null;
      let bestTop = -Infinity;
      for (const e of list) {
        const h = heads.current.get(e.id);
        if (!h || !h.el.getClientRects().length) continue;
        const top = h.place.getBoundingClientRect().top;
        if (top > line) continue;
        if (top > bestTop + 1 || (Math.abs(top - bestTop) <= 1 && e.id === jumped.current)) {
          best = e.id;
          bestTop = top;
        }
      }
      setHere(best);
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(look);
    };
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    look();
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [list]);

  // Open: the filter takes focus; a press outside or Esc closes, Esc back to the pill.
  useEffect(() => {
    if (!shown) {
      setQ("");
      return undefined;
    }
    const f = requestAnimationFrame(() => field.current?.focus({ preventScroll: true }));
    const away = (e: PointerEvent) => {
      if (!dock.current?.contains(e.target as Node)) setShown(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      setShown(false);
      pill.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc);
    return () => {
      cancelAnimationFrame(f);
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", esc);
    };
  }, [shown]);

  // The find key: "/" outside a field, and ⇧⌘F (Ctrl+Shift+F) anywhere. ⌘F stays the browser's.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const chord = e.code === "KeyF" && e.shiftKey && !e.altKey && (IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey);
      const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !editable(e.target);
      if ((!chord && !slash) || pageHeld()) return;
      e.preventDefault();
      setShown(false);
      setFinding((n) => n + 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const tree = useMemo(() => treeOf(list), [list]);
  const closeFind = useCallback(() => setFinding(0), []);
  const find = finding ? <PageFind focusKey={finding} onClose={closeFind} /> : null;
  if (list.length < 2) return find;

  const path = pathTo(here, list);
  const onPath = new Set(path.map((e) => e.id));
  const foldedNow = folded ?? foldedFirst(list);
  const keep = keepFor(list, q);
  const deep = list.some((e) => e.level > 1);

  const toggle = (id: number) => {
    const s = new Set(foldedNow);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setFolded(s);
  };
  const go = (e: OutlineEntry) => {
    setShown(false);
    const h = heads.current.get(e.id);
    if (!h?.el.isConnected) return;
    jumped.current = e.id;
    openAround(h.el);
    // What opened draws on the next frame: the jump is measured once it has.
    requestAnimationFrame(() => requestAnimationFrame(() => land(h)));
  };

  const branch = (nodes: OutlineNode[], depth: number): ReactNode => {
    const rows = keep ? nodes.filter((n) => keep.has(n.id)) : nodes;
    if (!rows.length) return null;
    return (
      <ul className={depth ? "ot-kids" : "ot-root"} role={depth ? "group" : "tree"} aria-label={depth ? undefined : "Sections of this page"}>
        {rows.map((n) => {
          // Under a filter, a branch whose sections are all filtered out shows no chevron.
          const kids = (keep ? n.kids.filter((k) => keep.has(k.id)) : n.kids).length > 0;
          const closed = kids && !keep && foldedNow.has(n.id) && !(onPath.has(n.id) && n.id !== here);
          return (
            <li key={n.id} role="treeitem" aria-expanded={kids ? !closed : undefined} aria-level={depth + 1}>
              <div className="ot-row" data-here={n.id === here ? "" : undefined}>
                {kids ? (
                  <button type="button" className="ot-chev" onClick={() => toggle(n.id)} aria-label={closed ? `Show what is inside ${n.title}` : `Hide what is inside ${n.title}`}>
                    <Glyph name={closed ? "fold" : "fold-open"} />
                  </button>
                ) : (
                  <span className="ot-chev" aria-hidden="true" />
                )}
                <button type="button" className="ot-go" onClick={() => go(n)} title={n.title} aria-current={n.id === here ? "location" : undefined}>
                  {n.title}
                </button>
                {closed ? (
                  <span className="ot-n num" title={`${under(n)} inside`}>
                    {under(n)}
                  </span>
                ) : null}
              </div>
              {kids && !closed ? branch(n.kids, depth + 1) : null}
            </li>
          );
        })}
      </ul>
    );
  };

  const crumbs = crumbsOf(path);
  return (
    <>
      {find}
      {shown && <div className="outline-scrim" aria-hidden="true" />}
      <div className="outline-dock" ref={dock} data-open={shown ? "" : undefined}>
        <button
          ref={pill}
          type="button"
          className="outline-btn"
          aria-expanded={shown}
          aria-haspopup="dialog"
          aria-controls="outline-pop"
          onClick={() => setShown((s) => !s)}
          title={path.length ? `You are in ${path.map((e) => e.title).join(" › ")}. The sections of this page` : "The sections of this page"}
        >
          <Glyph name="menu" />
          <span className="outline-where">
            {crumbs.length
              ? crumbs.map((c, i) => (
                  <span key={i} className="outline-crumb">
                    {i ? <span className="crumb-sep"> › </span> : null}
                    {clip(c, 30)}
                  </span>
                ))
              : "Contents"}
          </span>
          <span className="outline-count num">{list.length}</span>
        </button>
        {shown && (
          <div className="outline-pop" id="outline-pop" role="dialog" aria-label="Sections of this page">
            <span className="outline-grip" aria-hidden="true" />
            <div className="outline-bar">
              <input
                ref={field}
                type="search"
                placeholder="Filter the sections"
                value={q}
                aria-label="Filter the sections by title"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const first = firstMatch(list, q);
                  if (first) go(first);
                }}
              />
            </div>
            {deep ? (
              <div className="outline-levels" role="group" aria-label="Show the page's sections to a depth">
                <span>Show levels</span>
                <span className="seg">
                  {LEVELS.map((l) => (
                    <button key={l.word} type="button" title={l.what} onClick={() => setFolded(foldedAt(list, l.n))}>
                      {l.word}
                    </button>
                  ))}
                </span>
              </div>
            ) : null}
            {branch(tree, 0) ?? <p className="outline-none">No section is titled that.</p>}
            <p className="outline-tip">
              Press <kbd>/</kbd> to find text in this page{folds ? ", folded sections included, which it opens" : ""}. {BROWSER_FIND} stays the browser’s.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

/** Seeded with a short selection inside the page, as a browser's find is. */
function seed(): string {
  const sel = getSelection();
  const txt = sel?.toString().trim() ?? "";
  const inside = !!sel?.anchorNode && !!pageRoot()?.contains(sel.anchorNode);
  return txt && txt.length <= 80 && inside && !txt.includes("\n") ? txt : "";
}

/** The find bar, at the page's foot on the left: every match highlighted, a count, Enter and ⇧Enter to step, Esc to close. */
function PageFind({ focusKey, onClose }: { focusKey: number; onClose: () => void }) {
  const [q, setQ] = useState(seed);
  const [hits, setHits] = useState<Range[]>([]);
  const [capped, setCapped] = useState(false);
  const [i, setI] = useState(0);
  const [left, setLeft] = useState<number | null>(null);
  const field = useRef<HTMLInputElement>(null);
  // Scroll only for the reader's own act (new words, a step), never because the page's text changed under the bar.
  const wantReveal = useRef(false);

  useEffect(() => {
    const f = requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.select();
    });
    return () => cancelAnimationFrame(f);
  }, [focusKey]);

  // At the page's left edge, past the side panel.
  useEffect(() => {
    const put = () => setLeft(document.getElementById("main")?.getBoundingClientRect().left ?? 0);
    put();
    window.addEventListener("resize", put);
    return () => window.removeEventListener("resize", put);
  }, []);

  // Search as the words change, and again when the page's text changes.
  useEffect(() => {
    const run = (fromWords: boolean) => {
      const r = pageRoot();
      if (!r) return;
      const got = search(r, q);
      if (fromWords) wantReveal.current = true;
      setHits(got.hits);
      setCapped(got.capped);
      setI((x) => (got.hits.length ? Math.min(x, got.hits.length - 1) : 0));
    };
    const t = window.setTimeout(() => run(true), 90);
    const r = pageRoot();
    let again = 0;
    const mo = r
      ? new MutationObserver(() => {
          window.clearTimeout(again);
          again = window.setTimeout(() => run(false), 300);
        })
      : null;
    if (r && mo) mo.observe(r, { childList: true, subtree: true, characterData: true });
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(again);
      mo?.disconnect();
    };
  }, [q]);

  // A new query starts from its first match.
  useEffect(() => setI(0), [q]);

  useEffect(() => {
    if (!hits.length) {
      unpaint();
      return;
    }
    const now = hits[Math.min(i, hits.length - 1)]!;
    paint(hits, now);
    if (wantReveal.current) {
      wantReveal.current = false;
      reveal(now);
    }
  }, [hits, i]);

  useEffect(() => () => unpaint(), []);

  const step = (by: number) => {
    if (!hits.length) return;
    wantReveal.current = true;
    if (hits.length === 1) {
      reveal(hits[0]!);
      wantReveal.current = false;
      return;
    }
    setI((x) => (x + by + hits.length) % hits.length);
  };
  const close = () => {
    unpaint();
    onClose();
  };
  const count = !q.trim() ? "" : hits.length ? `${Math.min(i, hits.length - 1) + 1} of ${hits.length}${capped ? "+" : ""}` : "No match";
  return (
    <div className="page-find" role="search" aria-label="Find in this page" style={left != null ? ({ "--find-left": `${Math.round(left) + 16}px` } as CSSProperties) : undefined}>
      <input
        ref={field}
        type="search"
        value={q}
        placeholder="Find in this page"
        aria-label="Find in this page"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
          } else if ((e.metaKey || e.ctrlKey) && e.code === "KeyG") {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          }
        }}
      />
      <span className="page-find-n num" aria-live="polite">
        {count}
      </span>
      <button type="button" className="page-find-btn" onClick={() => step(-1)} disabled={!hits.length} title="The previous match (⇧Enter)" aria-label="The previous match">
        <Glyph name="up" />
      </button>
      <button type="button" className="page-find-btn" onClick={() => step(1)} disabled={!hits.length} title="The next match (Enter)" aria-label="The next match">
        <Glyph name="down" />
      </button>
      <button type="button" className="page-find-btn" onClick={close} title="Close (Esc)" aria-label="Close the find bar">
        <Glyph name="close" />
      </button>
    </div>
  );
}
