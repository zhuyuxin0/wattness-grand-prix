// The page's sections, read from the page itself: each Section's title (ui/Section.tsx draws it as an h2) and the
// h2, h3 and h4 a page sets inside or between them. The page's own head (its h1, the chapter pane, the related
// strip), the Overview's stage of panes, the float layer and anything hidden from assistive technology are not
// sections. A heading the page does not draw (display: none) is left out, unless a closed <details> folds it: the
// menu opens that on the way.

import type { OutlineHeading } from "./tree";

const HEADS = "h2, h3, h4";
/** Not the page's sections: its head, the Overview's stage, the float layer, the find bar, and what is hidden. */
const NOT_SECTIONS = ".page-header, .ov-room, .gp-float, .page-find, [data-outline-skip], [aria-hidden='true']";

export interface ScannedHeading extends OutlineHeading {
  el: HTMLElement;
  /** Where a jump lands: a Section's whole block (its kicker over the title), else the heading. */
  place: HTMLElement;
}

function sectionsAround(el: Element): number {
  let n = 0;
  for (let s = el.closest(".section"); s; s = s.parentElement?.closest(".section") ?? null) n++;
  return n;
}

/** A heading's depth: 1 for a Section's title, one more for each Section around it; inside a Section any other
 *  heading sits under its title; between Sections an h2 is 1, an h3 2 and an h4 3. */
function depthOf(h: HTMLElement): number {
  const rank = Number(h.tagName.slice(1)) || 2;
  const around = sectionsAround(h);
  if (h.classList.contains("section__title")) return Math.max(1, around);
  return around > 0 ? around + Math.max(1, rank - 2) : rank - 1;
}

const titleOf = (h: HTMLElement): string => (h.textContent ?? "").replace(/\s+/g, " ").trim();

/** The page's headings in page order, numbered from 1. */
export function scanHeadings(root: Element): ScannedHeading[] {
  const out: ScannedHeading[] = [];
  for (const h of root.querySelectorAll<HTMLElement>(HEADS)) {
    if (h.closest(NOT_SECTIONS)) continue;
    const title = titleOf(h);
    if (!title) continue;
    if (!h.getClientRects().length && !h.closest("details:not([open])")) continue;
    const place = h.classList.contains("section__title") ? (h.closest<HTMLElement>(".section") ?? h) : h;
    out.push({ id: out.length + 1, title, depth: depthOf(h), el: h, place });
  }
  return out;
}

/** The page's root, where its sections are read and its text is found. */
export const pageRoot = (): HTMLElement | null => document.querySelector<HTMLElement>("#main .app__page");
