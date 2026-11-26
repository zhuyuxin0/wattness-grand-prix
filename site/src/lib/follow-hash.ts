// A place on a page, named by its id: the address's #id, followed once the page has drawn it, and the in-page jumps
// that land there. The masthead stays on top as the page scrolls, so a place lands just under it, and it shows one
// outline in the accent that fades within two seconds (none for a reader who asks for reduced motion). A tab draws
// most places only once its data is in, so a place not drawn yet is waited for, and followed while the page above it
// settles, until the reader scrolls, taps or presses a key.

/** An id a hash can name here: a letter, then letters, digits, "-" and "_" (an old #/ route names none). */
const ID = /^[A-Za-z][\w-]*$/;

/** The id a hash names, or "" when it names none. */
export function hashId(hash: string): string {
  const id = hash.startsWith("#") ? hash.slice(1) : hash;
  return ID.test(id) ? id : "";
}

const reduced = (): boolean => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The masthead's height (two rows on a phone) and a little air. */
function headroom(): number {
  return (document.querySelector(".masthead")?.getBoundingClientRect().height ?? 0) + 12;
}

/** The element's scroll-margin-top: where the browser's own scroll to a #id puts its top. */
const margin = (el: Element): number => parseFloat(getComputedStyle(el).scrollMarginTop) || 0;

/** Scrolls so the element's top sits just under the masthead, or lower when its scroll-margin-top asks for room. */
export function scrollToPlace(el: Element, smooth = false): void {
  const top = el.getBoundingClientRect().top + window.scrollY - Math.max(headroom(), margin(el));
  window.scrollTo({ top: Math.max(0, Math.round(top)), behavior: smooth && !reduced() ? "smooth" : "auto" });
}

/** One outline in the accent, fading out, so the eye finds where it landed. */
export function flash(el: Element): void {
  if (reduced() || !(el instanceof HTMLElement) || typeof el.animate !== "function") return;
  const accent = getComputedStyle(el).getPropertyValue("--t-accent-mark").trim() || "#2ec7a6";
  el.animate(
    [
      { outline: `2px solid ${accent}`, outlineOffset: "4px" },
      { outline: "2px solid transparent", outlineOffset: "4px" },
    ],
    { duration: 1800, easing: "ease-in" },
  );
}

/** Focus moves with the jump, so the keyboard carries on from the place (it is not given a stop in the tab order). */
function focusPlace(el: HTMLElement): void {
  if (el.tabIndex < 0 && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

/**
 * Follows a #id: to its element now, or as soon as the page draws it, within ms. Until the page has been still for a
 * moment, a place that moves (a chart above it drawing) is followed again. The reader's own scroll, tap or key ends it,
 * and so does ms. Returns the cancel.
 */
export function followHash(hash: string, { ms = 8000, smooth = false, focus = false }: { ms?: number; smooth?: boolean; focus?: boolean } = {}): () => void {
  const id = hashId(hash);
  if (!id) return () => {};
  const offs: (() => void)[] = [];
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const off of offs.splice(0)) off();
  };
  // the page above the place may still be drawing: keep it under the masthead until the page has been still a moment
  let settle = 0;
  const still = () => {
    window.clearTimeout(settle);
    settle = window.setTimeout(stop, 1200);
  };
  offs.push(() => window.clearTimeout(settle));
  const found = (el: HTMLElement) => {
    // the browser may scroll to the #id itself while an address with one loads: give the place the same headroom
    if (margin(el) === 0) el.style.scrollMarginTop = `${Math.round(headroom())}px`;
    scrollToPlace(el, smooth);
    flash(el);
    if (focus) focusPlace(el);
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) first = false;
      else scrollToPlace(el);
      still();
    });
    ro.observe(document.body);
    offs.push(() => ro.disconnect());
    still();
  };
  for (const type of ["wheel", "touchstart", "keydown", "pointerdown"] as const) {
    window.addEventListener(type, stop, { passive: true });
    offs.push(() => window.removeEventListener(type, stop));
  }
  const timer = window.setTimeout(stop, ms);
  offs.push(() => window.clearTimeout(timer));
  const now = document.getElementById(id);
  if (now) {
    found(now);
    return stop;
  }
  const mo = new MutationObserver(() => {
    const el = document.getElementById(id);
    if (!el) return;
    mo.disconnect();
    found(el);
  });
  mo.observe(document.body, { childList: true, subtree: true });
  offs.push(() => mo.disconnect());
  return stop;
}

/**
 * An in-page jump to an id: there now, or, while the page has not drawn it (a read still under way), to the near
 * place first and on to it once it is drawn. The address takes the #id in place of the current entry, so the place
 * can be shared and Back still leaves the page.
 */
export function jumpTo(id: string, near?: string): () => void {
  if (!hashId(id)) return () => {};
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${id}`);
  if (!document.getElementById(id)) {
    const at = near ? document.getElementById(near) : null;
    if (at) scrollToPlace(at, true);
  }
  return followHash(`#${id}`, { smooth: true, focus: true });
}
